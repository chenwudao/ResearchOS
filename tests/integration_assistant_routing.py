"""Verify assistant-only routing through the pinned runtime and a local model fixture."""

import http.server
import json
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
from project_service import create_project
from assistant_profile import assistant_model, assistant_permission


def main():
    requests = {}
    permissions = {}

    class Stub(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            payload = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            history = json.dumps(payload["messages"], ensure_ascii=False)
            markers = re.findall(r"ROUTE_CASE_[A-Z]+", history)
            marker = markers[-1] if markers else "TITLE"
            if markers and payload.get("tools"):
                requests[marker] = (payload["model"], payload.get("reasoning_effort"))
                policies = re.findall(r"file policy:\s*([\w-]+)\.", history)
                if policies:
                    permissions[marker] = policies[-1]

            def event(delta, finish=None):
                chunk = {"id": "routing-test", "object": "chat.completion.chunk", "created": 1,
                         "model": payload["model"], "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                return "data: " + json.dumps(chunk) + "\n\n"

            delta = {"role": "assistant", "content": "完成 " + marker}
            finish = "stop"
            if marker == "ROUTE_CASE_SOURCE" and payload.get("tools"):
                results = {message.get("tool_call_id"): message["content"]
                           for message in payload["messages"] if message["role"] == "tool"}
                if "source_list" not in results:
                    tool = ("source_list", "labweave_sources_list", {})
                elif "source_contents" not in results:
                    sources = json.loads(results["source_list"])
                    tool = ("source_contents", "labweave_source_read",
                            {"sourceId": sources[0]["id"], "path": "README.md"})
                else:
                    assert "已核对的本机资料" in results["source_contents"]
                    tool = None
                if tool:
                    token, name, args = tool
                    delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": token, "type": "function",
                             "function": {"name": name, "arguments": json.dumps(args)}}]}
                    finish = "tool_calls"
            body = (event(delta) + event({}, finish) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    stub = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Stub)
    threading.Thread(target=stub.serve_forever, daemon=True).start()
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-assistant-routing-") as directory:
            root = Path(directory)
            launcher.workspace.DATA = root / "data"
            create_project("路由测试项目")
            source_folder = root / "参考资料"
            source_folder.mkdir()
            (source_folder / "README.md").write_text("已核对的本机资料", encoding="utf-8")
            assert assistant_permission({}) == {"preset": "read-only"}
            with launcher.workspace.database() as db:
                db.execute(
                    "INSERT INTO labweave_assistant_profile(profile_key, value, updated_at) VALUES (?, ?, ?)",
                    ("permissionPreset", "", "2026-01-01T00:00:00Z"),
                )
            home = root / "web"
            profile = home / "profiles/web"
            profile.mkdir(parents=True)
            credentials = home / ".credentials.yaml"
            credentials.write_text("version: 1\nrefs:\n  CUSTOMGW_API_KEY: sk-routing-test-only\n", encoding="utf-8")
            credentials.chmod(0o600)
            (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customgw:
        displayName: Local routing fixture
        apiKeyEnv: CUSTOMGW_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{stub.server_port}/v1"
        models:
          - id: gpt-fixture-mini
            contextWindow: 128000
            maxTokens: 4096
            reasoningEfforts: {{low: low, high: high}}
          - id: gpt-fixture-pro
            contextWindow: 512000
            maxTokens: 4096
            reasoningEfforts: {{low: low, high: high}}
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: customgw
    model: gpt-fixture-pro
""", encoding="utf-8")
            with launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                result = subprocess.run(["node", str(ROOT / "tests/integration_assistant_routing.cjs")],
                                        input=json.dumps({"url": url, "sourceFolder": str(source_folder)}),
                                        text=True, cwd=ROOT, timeout=120)
                if result.returncode:
                    raise SystemExit(result.returncode)

            assert requests["ROUTE_CASE_QUICK"] == ("gpt-fixture-mini", "low"), requests
            assert requests["ROUTE_CASE_REASON"] == ("gpt-fixture-pro", "high"), requests
            assert requests["ROUTE_CASE_LONG"] == ("gpt-fixture-pro", "high"), requests
            assert requests["ROUTE_CASE_FIXED"] == ("gpt-fixture-pro", "low"), requests
            assert requests["ROUTE_CASE_PROJECT"][0] == "gpt-fixture-pro", requests
            assert (source_folder / "README.md").read_text(encoding="utf-8") == "已核对的本机资料"
            assert assistant_model({})["contextWindow"] == 384000
            assert assistant_model({"preference": {"mode": "auto"}, "initialize": True})["contextWindow"] == 384000
            assert assistant_permission({}) == {"preset": "workspace-write"}
            assert permissions["ROUTE_CASE_QUICK"] == "read-only", permissions
            assert permissions["ROUTE_CASE_FIXED"] == "workspace-write", permissions
    finally:
        launcher.workspace.DATA = previous
        stub.shutdown()
        stub.server_close()


if __name__ == "__main__":
    main()
