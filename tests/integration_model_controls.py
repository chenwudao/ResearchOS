"""End-to-end Playwright verification for composer model provider, reasoning effort & context window controls."""

import http.server
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
from project_service import create_project


def main():
    class SseStub(http.server.BaseHTTPRequestHandler):
        def log_message(self, *args):
            pass

        def do_POST(self):
            chunks = (
                b'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{"role":"assistant","content":"OK"},"finish_reason":null}]}\n\n'
                b'data: {"id":"c1","object":"chat.completion.chunk","created":1,"model":"gpt-4o-mini","choices":[{"index":0,"delta":{},"finish_reason":"stop"}]}\n\n'
                b'data: [DONE]\n\n'
            )
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream")
            self.send_header("Content-Length", str(len(chunks)))
            self.end_headers()
            self.wfile.write(chunks)

    srv = http.server.ThreadingHTTPServer(("127.0.0.1", 0), SseStub)
    threading.Thread(target=srv.serve_forever, daemon=True).start()
    prev = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="lw-model-ctrl-e2e-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            create_project("模型选择测试")
            home = root / "home"
            patch = home / "profiles" / "web" / "cordis.patch.yml"
            patch.parent.mkdir(parents=True, exist_ok=True)
            credentials = home / ".credentials.yaml"
            credentials.write_text(
                "version: 1\nrefs:\n  DEEPSEEK_API_KEY: sk-ds-test-123\n  CUSTOMGW_API_KEY: sk-gw-test-456\n",
                encoding="utf-8",
            )
            credentials.chmod(0o600)
            patch.write_text(
                f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customgw:
        displayName: "Custom Gateway"
        apiKeyEnv: CUSTOMGW_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{srv.server_port}/v1"
        models:
          - id: gpt-4o-mini
            name: "GPT-4o Mini"
            contextWindow: 128000
          - id: o3-mini
            name: "O3 Mini"
            contextWindow: 128000
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: deepseek-official
    model: deepseek-flash
""",
                encoding="utf-8",
            )
            with launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                subprocess.run(
                    ["node", str(ROOT / "tests/integration_model_controls.cjs"), url, f"http://127.0.0.1:{srv.server_port}"],
                    check=True,
                    timeout=180,
                )
    finally:
        launcher.workspace.DATA = prev
        srv.shutdown()
        srv.server_close()


if __name__ == "__main__":
    main()
