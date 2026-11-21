"""Verify scoped composer menus and named replies through the installed runtime."""
import http.server
import json
from pathlib import Path
import subprocess
import sys
import tempfile
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
from project_service import create_entry, create_project, folder


def main():
    worker_inputs = []
    bot_id = None
    release_activity = threading.Event()

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path != "/release-activity":
                self.send_error(404)
                return
            release_activity.set()
            self.send_response(204)
            self.end_headers()

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            latest = next((str(message.get("content")) for message in reversed(request["messages"])
                           if message["role"] == "user"), "")
            if latest == "WEAVE_ACTIVITY_ERROR":
                body = b'{"error":{"message":"Activity test rejection","type":"invalid_request_error"}}'
                self.send_response(400)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
            if latest == "WEAVE_ACTIVITY_SUCCESS":
                assert release_activity.wait(40), "Assistant activity did not show the running indicator"
            text = "\n".join(str(message.get("content")) for message in request["messages"]
                             if message["role"] == "user")
            system = "\n".join(str(message.get("content", "")) for message in request["messages"]
                               if message["role"] == "system")
            tools = {tool["function"]["name"] for tool in request.get("tools", [])}
            assignment = next((str(message.get("content", "")) for message in request["messages"]
                               if message["role"] == "user" and "Assignment:" in str(message.get("content", ""))), text)
            marker = next((key for key in ("CHECK_SOURCE", "ASK_ASSISTANT", "FROM_GLOBAL") if key in assignment), None)
            if "WEAVE_PROJECT_INTENT" in system:
                intake = json.loads(text)
                if "FROM_GLOBAL" in intake["latest"] and intake["project"].get("name"):
                    assert intake["forceExecution"]
                is_research = any(marker in intake["latest"] for marker in ("FROM_GLOBAL", "CHECK_SOURCE"))
                delta = {"role": "assistant", "content": json.dumps({
                    "mode": "MANAGE", "research": is_research, "workflow": "within_scope", "missing": [],
                })}
                reason = "stop"
            elif marker == "FROM_GLOBAL" and "labweave_project_handoff" in tools:
                assert "Weave 科研项目闭环" in text
                delta = {"role": "assistant", "content": "收到 FROM_GLOBAL"}
                reason = "stop"
            elif "structured_output" in tools and marker:
                worker_inputs.append((marker, text))
                args = {"title": marker, "answer": "并线回复 " + marker, "outcome": "completed"}
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": marker, "type": "function",
                         "function": {"name": "structured_output", "arguments": json.dumps(args)}}]}
                reason = "tool_calls"
            elif marker == "FROM_GLOBAL" and "labweave_bot_delegate" in tools and not any(
                    message.get("tool_call_id") == "handoff-delegation" for message in request["messages"]):
                args = {"assignments": [{"featureId": bot_id, "task": "FROM_GLOBAL", "saveResult": False}]}
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "handoff-delegation", "type": "function",
                         "function": {"name": "labweave_bot_delegate", "arguments": json.dumps(args)}}]}
                reason = "tool_calls"
            else:
                delta = {"role": "assistant", "content": "收到 " + (marker or "测试")}
                reason = "stop"

            def chunk(value, finish):
                body = {"id": "composer-fixture", "object": "chat.completion.chunk", "created": 1,
                        "model": request["model"], "choices": [{"index": 0, "delta": value, "finish_reason": finish}]}
                return "data: " + json.dumps(body) + "\n\n"

            response = (chunk(delta, None) + chunk({}, reason) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(response)))
            self.end_headers()
            self.wfile.write(response)

    saved_data = launcher.workspace.DATA
    with http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model) as server:
        threading.Thread(target=server.serve_forever, daemon=True).start()
        try:
            with TemporaryDirectory(prefix="weave-composer-", dir=Path(tempfile.gettempdir()).resolve(),
                                    ignore_cleanup_errors=True) as directory:
                root = Path(directory)
                launcher.workspace.DATA = root / "data"
                scope = create_project("输入验收")["id"]
                create_entry(scope, "library", {"title": "XRD 相识别文献", "text": "原始论文摘要"})
                bot_id = features.create_feature(scope, "文献核对员", paradigm="notes")["feature"]["id"]
                other = create_project("另一个项目")["id"]
                features.create_feature(other, "外部 Bot", paradigm="notes")
                out = folder(scope) / "outputs"
                out.mkdir()
                (out / "实验依据.txt").write_text("FILE_REFERENCE_SENTINEL", encoding="utf-8")
                home = root / "web"
                profile = home / "profiles/web"
                profile.mkdir(parents=True)
                (home / ".credentials.yaml").write_text(
                    "version: 1\nrefs:\n  CUSTOMGW_API_KEY: sk-local-composer-fixture\n", encoding="utf-8")
                (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customgw:
        apiKeyEnv: CUSTOMGW_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{server.server_port}/v1"
        models:
          - id: gpt-fixture-pro
            contextWindow: 128000
            maxTokens: 4096
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: customgw
    model: gpt-fixture-pro
""", encoding="utf-8")
                with launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                    try:
                        subprocess.run(["node", str(ROOT / "tests/integration_composer.cjs")],
                                       input=json.dumps({"url": url, "releaseActivity": f"http://127.0.0.1:{server.server_port}/release-activity"}),
                                       text=True, cwd=ROOT, check=True, timeout=280)
                    except subprocess.CalledProcessError:
                        print("Fixture workers reached:", [marker for marker, _ in worker_inputs], flush=True)
                        raise
                assert {marker for marker, _ in worker_inputs} == {"CHECK_SOURCE", "ASK_ASSISTANT", "FROM_GLOBAL"}
                assert any(marker == "CHECK_SOURCE" and "FILE_REFERENCE_SENTINEL" in text
                           for marker, text in worker_inputs), worker_inputs
        finally:
            launcher.workspace.DATA = saved_data
            server.shutdown()


if __name__ == "__main__":
    main()
