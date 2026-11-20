"""Verify scoped composer menus and named replies through the installed runtime."""
import http.server
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import threading

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
from project_service import create_project, folder


def main():
    worker_inputs = []

    class Model(http.server.BaseHTTPRequestHandler):
        def log_message(self, *_):
            pass

        def do_POST(self):
            request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
            text = "\n".join(str(message.get("content")) for message in request["messages"]
                             if message["role"] == "user")
            tools = {tool["function"]["name"] for tool in request.get("tools", [])}
            marker = next((key for key in ("CHECK_SOURCE", "ASK_ASSISTANT", "FROM_GLOBAL") if key in text), None)
            if "structured_output" in tools and marker:
                worker_inputs.append((marker, text))
                args = {"title": marker, "answer": "并线回复 " + marker, "outcome": "completed"}
                delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": marker, "type": "function",
                         "function": {"name": "structured_output", "arguments": json.dumps(args)}}]}
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
            with TemporaryDirectory(prefix="weave-composer-", ignore_cleanup_errors=True) as directory:
                root = Path(directory)
                launcher.workspace.DATA = root / "data"
                scope = create_project("输入验收")["id"]
                features.create_feature(scope, "文献核对员", paradigm="notes")
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
                        subprocess.run(["node", str(ROOT / "tests/integration_composer.cjs")], input=url,
                                       text=True, cwd=ROOT, check=True, timeout=280)
                    except subprocess.CalledProcessError:
                        print("Fixture workers reached:", [marker for marker, _ in worker_inputs], flush=True)
                        raise
                assert {marker for marker, _ in worker_inputs} == {"CHECK_SOURCE", "ASK_ASSISTANT"}
                assert any(marker == "CHECK_SOURCE" and "FILE_REFERENCE_SENTINEL" in text
                           for marker, text in worker_inputs), worker_inputs
        finally:
            launcher.workspace.DATA = saved_data
            server.shutdown()


if __name__ == "__main__":
    main()
