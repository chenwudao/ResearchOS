"""The fixed Web runtime, native scheduler and Bot workbench over disposable data."""

from pathlib import Path
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from tempfile import TemporaryDirectory
from threading import Thread
from unittest.mock import patch
import json
import os
import subprocess
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "demo/api")]
import features
import native_launcher as launcher
import native_web
import project_sandbox as sandbox
from project_service import folder


class ModelFixture(BaseHTTPRequestHandler):
    def log_message(self, *_):
        pass

    def do_GET(self):
        body = b"<html><body>Bot browser example</body></html>"
        self.send_response(200)
        self.send_header("Content-Type", "text/html")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers["Content-Length"])))
        messages = request["messages"]
        tools = {tool["function"]["name"] for tool in request.get("tools", [])}
        delta = {"role": "assistant", "content": "收到。"}
        finish = "stop"
        if ("labweave_workflow_draft" in tools and "拟定对照计划" in json.dumps(messages, ensure_ascii=False)
                and not any(msg.get("tool_call_id") == "bot_plan" for msg in messages)):
            plan = {
                "question": "持续学习回归计划", "hypothesis": "候选减少回归", "inputs": ["fixture.csv"],
                "methods": [{"name": name, "script": "fixture.py"} for name in ("baseline", "candidate")],
                "matrix": {"seeds": [1, 2], "budgets": [1]},
                "protocol": {"metric": "accuracy", "direction": "maximize", "baseline": "baseline", "split": "fixed"},
            }
            delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "bot_plan", "type": "function",
                     "function": {"name": "labweave_workflow_draft", "arguments": json.dumps({"plan": plan})}}]}
            finish = "tool_calls"
        events = ({"choices": [{"index": 0, "delta": part, "finish_reason": reason}],
                   "id": "fixture", "object": "chat.completion.chunk", "model": "gpt-4o-mini", "created": 1}
                  for part, reason in ((delta, None), ({}, finish)))
        body = ("".join("data: " + json.dumps(event) + "\n\n" for event in events) + "data: [DONE]\n\n").encode()
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def main():
    def trial(project, title):
        run = sandbox.submit(project, {"title": title, "code": "print('test')"},
                             {"sessionId": "fixture", "callId": "plot", "featureId": "ideas"})
        sandbox.approve_trial(project, run["id"])
        assert sandbox.detail(project, run["id"], 10)["status"] == "SUCCEEDED"
        return run["id"]

    def sample_artifacts(_project, _env, _script, _args, output, logs, _timeout, _stop, **_kwargs):
        (logs / "stdout.log").write_text("Saved 3 observations", encoding="utf-8")
        (output / "scores.csv").write_text("step,accuracy\n1,0.72\n2,0.84\n3,0.89\n", encoding="utf-8")
        (output / "curve.svg").write_text(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 24">'
            '<path d="M1 23 L19 11 L47 2" fill="none" stroke="#166be8"/></svg>', encoding="utf-8")
        return 0

    previous = launcher.workspace.DATA
    model = ThreadingHTTPServer(("127.0.0.1", 0), ModelFixture)
    Thread(target=model.serve_forever, daemon=True).start()
    try:
        with TemporaryDirectory(prefix="weave-bot-workbench-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            scopes = []
            for number, (name, topic) in enumerate((("试验工作区", "持续学习回归"), ("文献工作区", "论文证据校对")), 1):
                scope = native_web.dispatch("create", {"name": name, "requestId": str(number) * 32})["scope"]
                features.enable_builtin(scope, "ideas")
                features.update_feature(scope, "ideas", hint=topic, keywords=[topic])
                (folder(scope) / "fixture.py").write_text("print(1)\n", encoding="utf-8")
                (folder(scope) / "fixture.csv").write_text("input\n1\n", encoding="utf-8")
                scopes.append(scope)
            home = root / "web"
            profile = home / "profiles/web"
            profile.mkdir(parents=True)
            fixture_url = f"http://127.0.0.1:{model.server_port}"
            (profile / "cordis.patch.yml").write_text(f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      openai:
        api: openai-completions
        apiKeyEnv: OPENAI_API_KEY
        baseURL: "{fixture_url}/v1"
        models:
          - id: gpt-4o-mini
- id: agent-default-model
  config:
    provider: openai
    model: gpt-4o-mini
""", encoding="utf-8")
            native_env = launcher.native_env
            with patch.object(launcher, "native_env", side_effect=lambda *args: {
                **native_env(*args), "OPENAI_API_KEY": "sk-weave-local-fixture",
            }), launcher.native_services(0, home=home, configured=False, background=False) as (url, _):
                with patch.object(sandbox.runtime, "execute", side_effect=sample_artifacts):
                    first = trial(scopes[0], "消融对照")
                    second = trial(scopes[1], "证据核对")
                subprocess.run(["node", str(ROOT / "tests/integration_bot_workbench.cjs"), first, second, fixture_url],
                               input=url, text=True, check=True, timeout=100, env=os.environ.copy())
    finally:
        launcher.workspace.DATA = previous
        model.shutdown()
        model.server_close()


if __name__ == "__main__":
    main()
