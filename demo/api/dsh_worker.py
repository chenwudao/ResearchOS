"""Isolated official SDK runtime with native approval/question relay."""
import json
import queue
import sys
import threading
import traceback
from deepseek_harness import DeepSeekHarness
import mcp_http

OUTPUT_LOCK = threading.Lock()
RESPONSES = {}
CONDITION = threading.Condition()
REDACTIONS = set()


def redact(value):
    if isinstance(value, str):
        for secret in REDACTIONS:
            value = value.replace(secret, "[redacted]")
        return value
    if isinstance(value, list):
        return [redact(item) for item in value]
    if isinstance(value, dict):
        return {redact(key): redact(item) for key, item in value.items()}
    return value


def emit(kind, **fields):
    with OUTPUT_LOCK:
        print(json.dumps(redact({"kind": kind, **fields}), ensure_ascii=True), flush=True)


def read_responses():
    for line in sys.stdin:
        value = json.loads(line)
        with CONDITION:
            RESPONSES[str(value["id"])] = value["answer"]
            CONDITION.notify_all()


def answer(request_id, stop=None):
    identity = str(request_id)
    with CONDITION:
        while identity not in RESPONSES:
            if stop and stop.is_set():
                return {"cancelled": True}
            CONDITION.wait(.25)
        return RESPONSES.pop(identity)


def main():
    request = json.loads(sys.stdin.readline())
    threading.Thread(target=read_responses, daemon=True).start()
    key = request.get("config", {}).get("api_key")
    if isinstance(key, str) and key:
        REDACTIONS.add(key)

    def question(value, cancelled):
        emit("question", requestId=value.request_id, questions=value.questions)
        return answer(value.request_id, cancelled)

    request["config"].update(approval_requests=True, on_user_question=question)
    with mcp_http.prepare_windows_config(request["config"], REDACTIONS) as config:
        request["config"] = config
        run_request(request)


def run_request(request):
    with DeepSeekHarness(**request["config"]) as harness:
        harness.start()

        def approvals():
            while True:
                try:
                    value = harness.client.next_request()
                    if value.method != "approval/request":
                        harness.client.respond_error(value.id, code=-32601, message="Unsupported request")
                        continue
                    emit("approval", requestId=value.id, detail=value.payload)
                    harness.client.respond(value.id, answer(value.id))
                except Exception:
                    return

        threading.Thread(target=approvals, daemon=True).start()
        session = (harness.resume_session(request["session"])
                   if request["resume"] else harness.start_session(request["session"]))
        session.set_working_directory(request["config"]["cwd"])
        result = session.run(request["prompt"],
                             on_notification=lambda event: emit("event", method=event.method, payload=event.payload))
        emit("result", text=result.final_response, reason=result.finish_reason)


if __name__ == "__main__":
    try:
        main()
    except Exception:
        print(redact(traceback.format_exc()), file=sys.stderr, flush=True)
        raise SystemExit(1)
