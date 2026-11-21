"""Exercise message rewind in the pinned Web runtime with a local model fixture."""

import http.server
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading
import time
from unittest.mock import patch

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "demo/api")]
import native_launcher as launcher
from features import create_feature
from project_service import create_project


def main():
    prompts = {}

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            messages = request["messages"]
            history = json.dumps(messages, ensure_ascii=False)
            matches = re.findall(r"REWIND_(?:GLOBAL|PROJECT|BOT)_\d+_ASK", history)
            current = matches[-1] if matches else ""
            tools = {t["function"]["name"] for t in request.get("tools", [])}
            if current and "labweave_project_list" in tools:
                prompts[current] = history
            answer = current.removesuffix("_ASK") + "_REPLY" if current else "Rewind test"
            def event(delta, finish=None):
                chunk = {"id": "rewind-fixture", "object": "chat.completion.chunk", "created": 1,
                         "model": "gpt-4o-mini", "choices": [{"index": 0, "delta": delta, "finish_reason": finish}]}
                return "data: " + json.dumps(chunk) + "\n\n"

            delta = {"role": "assistant", "content": answer}
            finish = "stop"
            if tools and current in ("REWIND_GLOBAL_1_ASK", "REWIND_PROJECT_1_ASK", "REWIND_BOT_1_ASK"):
                if not any(message.get("tool_call_id") == "progress_search" for message in messages):
                    time.sleep(1.2)
                    delta = {"role": "assistant", "tool_calls": [{
                        "index": 0, "id": "progress_search", "type": "function", "function": {
                            "name": "labweave_project_list", "arguments": "{}",
                        },
                    }]}
                    finish = "tool_calls"
                else:
                    self.send_response(200)
                    self.send_header("Content-Type", "text/event-stream")
                    self.end_headers()
                    time.sleep(0.8)
                    self.wfile.write(event({"role": "assistant", "reasoning_content": "Fixture reasoning"}).encode())
                    self.wfile.flush()
                    time.sleep(0.9)
                    self.wfile.write(event({"content": answer}).encode())
                    self.wfile.flush()
                    time.sleep(0.8)
                    self.wfile.write((event({}, "stop") + "data: [DONE]\n\n").encode())
                    return
            if (current == "REWIND_BOT_5_ASK" and "labweave_experiment_record" in tools and
                    not any(message.get("tool_call_id") == "permission_test_execution" for message in messages)):
                delta = {"role": "assistant", "tool_calls": [{
                    "index": 0, "id": "permission_test_execution", "type": "function", "function": {
                        "name": "labweave_experiment_record", "arguments": '{"name":"权限验证","status":"planned"}',
                    },
                }]}
                finish = "tool_calls"
            body = (event(delta) + event({}, finish) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), Model)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    previous_data = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-rewind-") as directory:
            root = Path(directory)
            launcher.workspace.DATA = root / "data"
            create_project("撤回测试", "proj_rewind")
            create_feature("proj_rewind", "实验记录 Bot")
            home = root / "web"
            profile = home / "profiles/web"
            profile.mkdir(parents=True)
            (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      openai:
        displayName: Local Rewind Fixture
        apiKeyEnv: OPENAI_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{server.server_port}/v1"
        models:
          - id: gpt-4o-mini
- id: agent-default-model
  config:
    provider: openai
    model: gpt-4o-mini
- id: permission
  config:
    defaultPreset: danger-full-access
    presets:
      read-only:
        sandbox: read-only
        approval: ask
      workspace-write:
        sandbox: workspace-write
        approval: ask
      danger-full-access:
        sandbox: danger-full-access
        approval: never
""", encoding="utf-8")
            browser_test = ROOT / "tests/integration_conversation_rewind.cjs"
            native_env = launcher.native_env
            with patch.object(launcher, "native_env", side_effect=lambda *args: {
                **native_env(*args), "OPENAI_API_KEY": "sk-local-permission-fixture",
            }):
                for phase in ("rewind", "restart"):
                    with launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                        result = subprocess.run(["node", str(browser_test), url, phase, str(home)], timeout=120)
                        if result.returncode:
                            raise RuntimeError(f"Browser rewind test failed in phase {phase}")

            for section in ("GLOBAL", "PROJECT", "BOT"):
                after_reply = prompts[f"REWIND_{section}_3_ASK"]
                after_input = prompts[f"REWIND_{section}_4_ASK"]
                assert f"REWIND_{section}_1_REPLY" in after_reply
                assert f"REWIND_{section}_2_ASK" in after_reply
                assert f"REWIND_{section}_2_REPLY" not in after_reply
                assert f"REWIND_{section}_0_ASK" not in after_reply
                assert f"REWIND_{section}_0_REPLY" not in after_reply
                assert f"REWIND_{section}_1_REPLY" in after_input
                assert f"REWIND_{section}_2_ASK" not in after_input
                assert f"REWIND_{section}_3_ASK" not in after_input
                assert f"REWIND_{section}_3_REPLY" not in after_input
            after_restart = prompts["REWIND_GLOBAL_5_ASK"]
            assert "REWIND_GLOBAL_4_REPLY" in after_restart
            assert "REWIND_GLOBAL_2_ASK" not in after_restart
            assert "REWIND_GLOBAL_3_REPLY" not in after_restart
            assert "Current DSH file policy: read-only." in prompts["REWIND_GLOBAL_1_ASK"]
            assert "Current DSH file policy: read-only." in after_restart
            assert "Current DSH file policy: workspace-write." in prompts["REWIND_BOT_1_ASK"]
            assert "Current DSH file policy: read-only." in prompts["REWIND_BOT_5_ASK"]
            assert "请在有执行权限的项目对话记录实验" in prompts["REWIND_BOT_5_ASK"]
    finally:
        launcher.workspace.DATA = previous_data
        server.shutdown()
        server.server_close()


if __name__ == "__main__":
    main()
