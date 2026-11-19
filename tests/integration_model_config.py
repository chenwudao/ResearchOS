"""End-to-end verification of external API config discovery, import, default sync, and Feature Bot routing."""

import http.server
import json
import os
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT / "demo/api"))
import model_config
import native_launcher as launcher


def main():
    seen = []

    class SseStub(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            length = int(self.headers.get("Content-Length", "0"))
            body = self.rfile.read(length).decode("utf-8", errors="replace")
            seen.append((self.path, self.headers.get("Authorization"), body))
            request = json.loads(body)
            messages = request["messages"]
            tool_names = {tool["function"]["name"] for tool in request.get("tools", [])}
            is_main_prompt = any(m["role"] == "user" and "MAIN_CHAT_PING" in str(m["content"]) for m in messages)
            if ("labweave_memory_search" in tool_names and is_main_prompt
                    and not any(m.get("tool_call_id") == "call_brand" for m in messages)):
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "call_brand", "type": "function",
                         "function": {"name": "labweave_memory_search", "arguments": '{"query":"DSH 论文 $DSH_HOME"}'}}]}
                finish = "tool_calls"
            else:
                delta = {"role": "assistant", "content": "STUB_MODEL_OK"}
                finish = "stop"
            def event(content, reason):
                chunk = {"id": "c1", "object": "chat.completion.chunk", "created": 1, "model": "gpt-4o-mini",
                         "choices": [{"index": 0, "delta": content, "finish_reason": reason}]}
                return "data: " + json.dumps(chunk) + "\n\n"
            chunks = (event(delta, None) + event({}, finish) + "data: [DONE]\n\n").encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(chunks)))
            self.end_headers()
            self.wfile.write(chunks)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SseStub)
    thread = threading.Thread(target=srv.serve_forever, daemon=True)
    thread.start()
    previous_data = launcher.workspace.DATA
    previous_dsh_home = os.environ.get("DSH_HOME")
    try:
        with TemporaryDirectory(prefix="labweave-model-e2e-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            launcher.workspace.DATA.mkdir(parents=True, exist_ok=True)
            web_home = root / "web-home"
            profile = web_home / "profiles/web"
            profile.mkdir(parents=True)
            (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      openai:
        displayName: Custom LLM
        apiKeyEnv: OPENAI_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{srv.server_port}/v1"
        models:
          - id: gpt-4o-mini
""", encoding="utf-8")
            with launcher.native_services(0, home=web_home, configured=False, background=False) as (url, _):
                subprocess.run(
                    ["node", str(ROOT / "tests/integration_model_config.cjs"), url,
                     f"http://127.0.0.1:{srv.server_port}", str(root / "browser")],
                    check=True,
                    timeout=240,
                )
                sdk_cfg = model_config.sdk_runtime_config(web_home)
                assert (sdk_cfg["provider"], sdk_cfg["model"]) == ("openai", "gpt-4o-mini")
                key_ref = sdk_cfg["provider"].upper().replace("-", "_") + "_API_KEY"
                assert sdk_cfg["env"].get(key_ref) == "sk-e2e-imported-1234"
                assert len(seen) >= 2, f"Expected both Feature Bot and new-project main chat to call stub, got {len(seen)}"
                for _, auth, req_body in seen:
                    assert auth == "Bearer sk-e2e-imported-1234", auth
                    assert json.loads(req_body).get("model") == "gpt-4o-mini", req_body
                combined_bodies = "\n".join(b for _, _, b in seen)
                assert "FEATURE_BOT_PING" in combined_bodies, "Feature Bot did not send prompt to stub provider"
                assert "MAIN_CHAT_PING" in combined_bodies, "New project main chat did not send prompt to stub provider"
    finally:
        launcher.workspace.DATA = previous_data
        if previous_dsh_home is None:
            os.environ.pop("DSH_HOME", None)
        else:
            os.environ["DSH_HOME"] = previous_dsh_home
        srv.shutdown()
        srv.server_close()


if __name__ == "__main__":
    main()
