import http.server
import json
import os
from pathlib import Path
import sys
import tempfile
import threading
import types
import unittest
from unittest import mock

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "demo" / "api"))
sys.path.insert(0, str(ROOT / "scripts"))

import model_config
import native_launcher
import tasks
import workspace


class StubOpenAIServer(http.server.BaseHTTPRequestHandler):
    requests = []
    reply_text = "CUSTOM_PROVIDER_OK"

    def log_message(self, format, *args):
        return

    def do_POST(self):
        length = int(self.headers.get("Content-Length") or 0)
        body = json.loads(self.rfile.read(length).decode("utf-8") or "{}")
        StubOpenAIServer.requests.append({
            "path": self.path,
            "auth": self.headers.get("Authorization", ""),
            "model": body.get("model"),
            "messages": body.get("messages"),
        })
        chunks = (
            json.dumps({
                "id": "chatcmpl-test-1",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body.get("model") or "custom-model",
                "choices": [{"index": 0, "delta": {"role": "assistant", "content": StubOpenAIServer.reply_text}, "finish_reason": None}],
            }).join(["data: ", "\n\n"])
            + json.dumps({
                "id": "chatcmpl-test-1",
                "object": "chat.completion.chunk",
                "created": 1,
                "model": body.get("model") or "custom-model",
                "choices": [{"index": 0, "delta": {}, "finish_reason": "stop"}],
            }).join(["data: ", "\n\n"])
            + "data: [DONE]\n\n"
        ).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("Content-Length", str(len(chunks)))
        self.end_headers()
        self.wfile.write(chunks)


class ModelConfigTests(unittest.TestCase):
    def test_parse_simple_yaml_handles_dsh_credentials_and_patches(self):
        creds = model_config.parse_simple_yaml(
            'version: 1\nrefs:\n  OPENAI_API_KEY: "sk-openai:123"\n  CUSTOM_KEY: sk-custom\n'
        )
        self.assertEqual(creds["version"], 1)
        self.assertEqual(creds["refs"]["OPENAI_API_KEY"], "sk-openai:123")
        self.assertEqual(creds["refs"]["CUSTOM_KEY"], "sk-custom")

        patch_yaml = """
- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      myproxy:
        displayName: "My Proxy"
        apiKeyEnv: MYPROXY_KEY
        api: openai-completions
        baseURL: "https://example.com:8443/v1"
        models:
          - id: custom-fast
            name: "Custom Fast"
- id: agent-default-model
  config:
    provider: myproxy
    model: custom-fast
"""
        parsed = model_config.parse_simple_yaml(patch_yaml)
        self.assertIsInstance(parsed, list)
        self.assertEqual(parsed[0]["id"], "llm-pi-ai")
        myproxy = parsed[0]["config"]["providers"]["myproxy"]
        self.assertEqual(myproxy["baseURL"], "https://example.com:8443/v1")
        self.assertEqual(myproxy["models"][0]["id"], "custom-fast")
        self.assertEqual(parsed[1]["config"], {"provider": "myproxy", "model": "custom-fast"})

    def test_sdk_runtime_config_resolves_custom_provider_and_default(self):
        with tempfile.TemporaryDirectory() as tmp:
            web_home = Path(tmp) / "web"
            patch_path = web_home / "profiles" / "web" / "cordis.patch.yml"
            patch_path.parent.mkdir(parents=True, exist_ok=True)
            (web_home / ".credentials.yaml").write_text(
                "version: 1\nrefs:\n  MYPROXY_KEY: sk-proxy-secret-9999\n",
                encoding="utf-8",
            )
            patch_path.write_text(
                """- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      myproxy:
        displayName: "My Proxy"
        apiKeyEnv: MYPROXY_KEY
        api: openai-completions
        baseURL: "https://proxy.example.com/v1"
        models:
          - id: claude-3-7-sonnet
- id: agent-default-model
  config:
    provider: myproxy
    model: claude-3-7-sonnet
""",
                encoding="utf-8",
            )
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch.object(model_config, "safe_deepseek_key", return_value=None):
                    cfg = model_config.sdk_runtime_config(web_home)
            self.assertEqual(cfg["provider"], "myproxy")
            self.assertEqual(cfg["model"], "claude-3-7-sonnet")
            self.assertEqual(cfg["env"]["MYPROXY_KEY"], "sk-proxy-secret-9999")
            self.assertIn("sk-proxy-secret-9999", cfg["secrets"])
            self.assertIsNone(cfg["api_key"])
            self.assertEqual(cfg["patches"][0]["id"], "llm-pi-ai")

    def test_sdk_runtime_config_falls_back_when_default_unroutable(self):
        with tempfile.TemporaryDirectory() as tmp:
            web_home = Path(tmp) / "web"
            patch_path = web_home / "profiles" / "web" / "cordis.patch.yml"
            patch_path.parent.mkdir(parents=True, exist_ok=True)
            (web_home / ".credentials.yaml").write_text(
                "version: 1\nrefs:\n  CUSTOMLLM_API_KEY: sk-custom-8888\n",
                encoding="utf-8",
            )
            patch_path.write_text(
                """- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customllm:
        displayName: "Custom LLM"
        apiKeyEnv: CUSTOMLLM_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:9999/v1"
        models:
          - id: gpt-4o-mini
- id: agent-default-model
  config:
    provider: deepseek-official
    model: deepseek-chat
""",
                encoding="utf-8",
            )
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch.object(model_config, "safe_deepseek_key", return_value=None):
                    cfg = model_config.sdk_runtime_config(web_home)
            self.assertEqual(cfg["provider"], "customllm")
            self.assertEqual(cfg["model"], "gpt-4o-mini")
            self.assertEqual(cfg["env"]["CUSTOMLLM_API_KEY"], "sk-custom-8888")

    def test_sdk_runtime_config_supports_builtin_third_party_provider(self):
        with tempfile.TemporaryDirectory() as tmp:
            web_home = Path(tmp) / "web"
            web_home.mkdir(parents=True, exist_ok=True)
            (web_home / ".credentials.yaml").write_text(
                "version: 1\nrefs:\n  OPENAI_API_KEY: sk-openai-test-1234\n",
                encoding="utf-8",
            )
            (web_home / ".env").write_text("OPENAI_BASE_URL=https://api.custom-openai.example/v1\n", encoding="utf-8")
            with mock.patch.dict(os.environ, {}, clear=True):
                with mock.patch.object(model_config, "safe_deepseek_key", return_value=None):
                    cfg = model_config.sdk_runtime_config(web_home)
            self.assertEqual(cfg["provider"], "openai")
            self.assertEqual(cfg["model"], "gpt-4o-mini")
            self.assertEqual(cfg["env"]["OPENAI_API_KEY"], "sk-openai-test-1234")
            self.assertEqual(cfg["env"]["OPENAI_BASE_URL"], "https://api.custom-openai.example/v1")

    def test_native_env_stripped_when_unconfigured_and_propagates_when_configured(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            web_home = base / "web"
            fake_home = base / "home"
            fake_home.mkdir(parents=True)
            backend = types.SimpleNamespace(server_port=8765, token="test-token")
            with mock.patch.dict(os.environ, {"OPENAI_API_KEY": "sk-host-openai-5555"}, clear=True):
                with mock.patch.object(Path, "home", side_effect=RuntimeError("no home")):
                    self.assertFalse(model_config.safe_deepseek_key())
                    stripped = native_launcher.native_env(web_home, backend, False)
                    self.assertNotIn("OPENAI_API_KEY", stripped)
                    self.assertNotIn("DEEPSEEK_API_KEY", stripped)
                with mock.patch.object(Path, "home", return_value=fake_home):
                    with mock.patch.object(model_config, "safe_deepseek_key", return_value=None):
                        propagated = native_launcher.native_env(web_home, backend, True)
                        self.assertEqual(propagated["OPENAI_API_KEY"], "sk-host-openai-5555")

    def test_tasks_execute_redacts_secrets_and_live_sdk_uses_custom_provider(self):
        StubOpenAIServer.requests.clear()
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), StubOpenAIServer)
        port = server.server_address[1]
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            with tempfile.TemporaryDirectory() as tmp:
                base = Path(tmp)
                data_dir = base / "data"
                web_home = base / "dsh-web"
                patch_path = web_home / "profiles" / "web" / "cordis.patch.yml"
                patch_path.parent.mkdir(parents=True, exist_ok=True)
                (web_home / ".credentials.yaml").write_text(
                    "version: 1\nrefs:\n  CUSTOM_STUB_KEY: sk-stub-secret-7777\n",
                    encoding="utf-8",
                )
                patch_path.write_text(
                    f"""- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      customstub:
        displayName: "Custom Stub"
        apiKeyEnv: CUSTOM_STUB_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{port}/v1"
        models:
          - id: custom-model
- id: agent-default-model
  config:
    provider: customstub
    model: custom-model
""",
                    encoding="utf-8",
                )
                proj_root = base / "proj"
                proj_root.mkdir(parents=True)
                proj_item = {
                    "id": "p1",
                    "name": "TestProj",
                    "description": "",
                    "rootPath": str(proj_root),
                    "rails": {"ideas": [], "feed": [], "goals": [], "library": []},
                }
                with mock.patch.object(workspace, "DATA", data_dir):
                    with mock.patch.object(model_config, "safe_deepseek_key", return_value=None):
                        with mock.patch.object(tasks, "project", return_value=proj_item), \
                             mock.patch.object(tasks.project_service, "context", return_value={
                                 "id": "p1", "name": "TestProj", "description": "", "memories": [],
                                 "resources": [], "goals": [], "ideas": [],
                             }), \
                             mock.patch.object(tasks.project_service, "collect_outputs", return_value=[]), \
                             mock.patch.object(tasks.project_service, "remember"):
                            with mock.patch.dict(os.environ, {"LABWEAVE_DSH_WEB_HOME": str(web_home)}, clear=False):
                                tasks.store({
                                    "id": "task-custom-1",
                                    "projectId": "p1",
                                    "sessionId": "sess-custom-1",
                                    "prompt": "Say CUSTOM_PROVIDER_OK cleanly",
                                    "goalId": None,
                                    "resume": False,
                                    "status": "QUEUED",
                                    "created": tasks.now(),
                                    "events": [],
                                    "result": "",
                                    "error": "",
                                })
                                tasks.execute("task-custom-1")
                            done_task = tasks.get("task-custom-1")
                self.assertEqual(done_task["status"], "SUCCEEDED", done_task.get("error"))
                self.assertIn("CUSTOM_PROVIDER_OK", done_task["result"])
                self.assertNotIn("sk-stub-secret-7777", done_task["result"])
                self.assertGreaterEqual(len(StubOpenAIServer.requests), 1)
                self.assertEqual(StubOpenAIServer.requests[-1]["auth"], "Bearer sk-stub-secret-7777")
                self.assertEqual(StubOpenAIServer.requests[-1]["model"], "custom-model")
        finally:
            server.shutdown()
            server.server_close()


if __name__ == "__main__":
    unittest.main()
