"""Exercise parallel project Bot delegation through the pinned Web runtime."""
import http.server
import json
import subprocess
import sys
from pathlib import Path
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
from project_service import create_entry, create_project


def main():
    concurrent = threading.Barrier(2, timeout=45)
    release = threading.Event()
    result = []
    bot_ids = []
    calls = {"PAPER_ALPHA": "alpha_context", "PAPER_BETA": "beta_context"}

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_GET(self):
            if self.path != "/release":
                self.send_error(404)
                return
            release.set()
            self.send_response(204)
            self.end_headers()

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            messages = request["messages"]
            user_text = "\n".join(str(message.get("content", "")) for message in messages if message["role"] == "user")
            tools = {tool["function"]["name"] for tool in request.get("tools", [])}
            outputs = {message.get("tool_call_id"): message["content"] for message in messages if message["role"] == "tool"}
            command = None
            answer = "科研分派验收"
            if "structured_output" in tools:
                marker = next(key for key in calls if key in user_text)
                lookup = calls[marker]
                draft = marker + "_draft"
                if draft not in outputs:
                    assert "labweave_bot_canvas_draft" in tools
                    command = (draft, "labweave_bot_canvas_draft", {"key": "first", "title": "实时草稿 " + marker,
                                                                  "text": "先整理主要证据，出处待核验。"})
                elif lookup not in outputs:
                    concurrent.wait()
                    assert release.wait(80), "Project task view did not observe active workers"
                    command = (lookup, "labweave_project_get_context", {})
                else:
                    assert "分派验收项目" in outputs[lookup], outputs
                    command = (marker + "_result", "structured_output", {"title": marker, "answer": "已核对 " + marker,
                                                                        "outcome": "completed"})
            elif "WEAVE_DELEGATION_PROBE" in user_text and "labweave_bot_delegate" in tools:
                if "delegate_probe" not in outputs:
                    command = ("delegate_probe", "labweave_bot_delegate", {"assignments": [
                        {"featureId": bot_id, "task": marker} for bot_id, marker in zip(bot_ids, calls, strict=True)
                    ]})
                else:
                    result.append(outputs["delegate_probe"])
                    answer = "分派结果已返回"
            if command:
                identity, name, args = command
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": identity, "type": "function",
                         "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)}}]}
                reason = "tool_calls"
            else:
                delta = {"role": "assistant", "content": answer}
                reason = "stop"

            def chunk(value, finish):
                body = {"id": "weave-delegation", "object": "chat.completion.chunk", "created": 1,
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
            with TemporaryDirectory(prefix="weave-delegation-", ignore_cleanup_errors=True) as directory:
                root = Path(directory)
                launcher.workspace.DATA = root / "data"
                scope = create_project("分派验收项目")["id"]
                bot_ids.append(features.create_feature(scope, "原文核对", paradigm="notes", temporary=True)["feature"]["id"])
                bot_ids.append(features.create_feature(scope, "证据关系", paradigm="mindmap")["feature"]["id"])
                create_entry(scope, bot_ids[1], {"title": "对照总览", "text": "用于画布分支验收"})
                group = features.create_feature(scope, "方法证据组", paradigm="mindmap")["feature"]["id"]
                home = root / "web"
                profile = home / "profiles/web"
                profile.mkdir(parents=True)
                (home / ".credentials.yaml").write_text(
                    "version: 1\nrefs:\n  CUSTOMGW_API_KEY: sk-local-delegation-fixture\n", encoding="utf-8")
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
                    subprocess.run(["node", str(ROOT / "tests/integration_bot_delegation.cjs")],
                                   input=json.dumps({"url": url, "releaseUrl": f"http://127.0.0.1:{server.server_port}/release",
                                                     "groupId": group, "memberId": bot_ids[1]}),
                                   text=True, cwd=ROOT, check=True, timeout=240)
                    assert len(result) == 1, result
                    outcomes = json.loads(result[0])
                    assert [item["status"] for item in outcomes] == ["completed", "completed"], outcomes
                    assert outcomes[0]["archived"] and not outcomes[1].get("archived"), outcomes
                    assert len({item["childSessionId"] for item in outcomes}) == 2, outcomes
                    for bot, marker, outcome in zip(bot_ids, calls, outcomes, strict=True):
                        assert outcome["featureId"] == bot and marker in outcome["answer"], outcomes
                        project = launcher.workspace.snapshot()["state"]["projects"][0]
                        assert any(entry["id"] == outcome.get("recordId") and marker in entry["text"]
                                   for entry in project["rails"].get(bot, [])), outcomes
                print("Live project task list, parallel Bot runs, preserved archived results, and regrouping verified.")
        finally:
            release.set()
            launcher.workspace.DATA = saved_data
            server.shutdown()


if __name__ == "__main__":
    main()
