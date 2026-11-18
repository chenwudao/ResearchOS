"""Private MCP transport: authorization, scope and lifecycle invariants."""
from contextlib import redirect_stderr, redirect_stdout
from io import StringIO
import json
import os
from pathlib import Path
import re
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from urllib.error import HTTPError, URLError
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "demo/api"))
import dsh_worker, mcp_http, project_service, workspace


class PrivateMcpTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.root = Path(self.temporary.name)
        self.previous_data = workspace.DATA
        workspace.DATA = self.root / "data"
        workspace.save({"revision": 0, "settings": {}, "state": {"version": 2, "projects": []}})
        self.a = project_service.call("project_create", {"name": "A"}, "global")["id"]
        self.b = project_service.call("project_create", {"name": "B"}, "global")["id"]
        self.token = "fixture-token-never-log"
        self.opener = build_opener(ProxyHandler({}))

    def tearDown(self):
        workspace.DATA = self.previous_data
        self.temporary.cleanup()

    def request(self, url, body, headers=None):
        data = json.dumps(body).encode("utf-8")
        request = Request(url, data=data, headers={"Content-Type": "application/json", **(headers or {})}, method="POST")
        try:
            with self.opener.open(request, timeout=3) as response:
                return response.status, response.read(), dict(response.headers)
        except HTTPError as error:
            return error.code, error.read(), dict(error.headers)

    def test_authorization_origin_scope_and_shutdown(self):
        output = StringIO()
        with redirect_stderr(output), mcp_http.private_bridge(workspace.DATA, self.a, self.token) as url:
            request = {"jsonrpc": "2.0", "id": 1, "method": "tools/list"}
            headers = {"Authorization": "Bearer " + self.token}
            self.assertEqual(self.request(url, request)[0], 403)
            self.assertEqual(self.request(url, request, {"Authorization": "Bearer wrong"})[0], 403)
            self.assertEqual(self.request(url, request, {**headers, "Host": "evil.example"})[0], 403)
            self.assertEqual(self.request(url, request, {**headers, "Origin": "https://evil.example"})[0], 403)
            status, raw, response_headers = self.request(url, request, headers)
            self.assertEqual(status, 200)
            self.assertNotIn("Access-Control-Allow-Origin", response_headers)
            self.assertGreater(len(json.loads(raw)["result"]["tools"]), 20)
            cross_project = {"jsonrpc": "2.0", "id": 2, "method": "tools/call", "params": {
                "name": "project_get_context", "arguments": {"projectId": self.b}}}
            _, raw, _ = self.request(url, cross_project, headers)
            self.assertTrue(json.loads(raw)["result"]["isError"])
            project_list = {"jsonrpc": "2.0", "id": 3, "method": "tools/call", "params": {
                "name": "project_list", "arguments": {}}}
            _, raw, _ = self.request(url, project_list, headers)
            projects = json.loads(json.loads(raw)["result"]["content"][0]["text"])
            self.assertEqual([item["id"] for item in projects], [self.a])
            notification = {"jsonrpc": "2.0", "method": "notifications/initialized"}
            self.assertEqual(self.request(url, notification, headers)[0], 202)
        self.assertNotIn(self.token, output.getvalue())
        with self.assertRaises((URLError, OSError)):
            self.opener.open(url, timeout=2)

    def test_unpublished_delete_tools_cannot_delete_project_data(self):
        with mcp_http.private_bridge(workspace.DATA, self.a, self.token) as url:
            headers = {"Authorization": "Bearer " + self.token}

            def call(name, arguments):
                status, raw, _ = self.request(url, {"jsonrpc": "2.0", "id": 1,
                    "method": "tools/call", "params": {"name": name, "arguments": arguments}}, headers)
                self.assertEqual(status, 200)
                return json.loads(raw)["result"]

            def value(result):
                self.assertNotIn("isError", result)
                return json.loads(result["content"][0]["text"])

            memory = value(call("memory_write", {"text": "isolated fixture memory"}))
            experiment = value(call("experiment_record", {"name": "isolated fixture experiment"}))
            for name, identity in (("memory_delete", memory["id"]),
                                   ("experiment_delete", experiment["id"])):
                self.assertTrue(call(name, {"id": identity})["isError"])
            self.assertEqual([entry["id"] for entry in value(call("memory_search", {}))], [memory["id"]])
            self.assertEqual([entry["id"] for entry in value(call("experiment_list", {}))], [experiment["id"]])
            self.assertTrue(call("memory_write", {"text": "outside", "projectId": self.b})["isError"])
            self.assertTrue(call(["memory_delete"], {"id": memory["id"]})["isError"])

    def test_worker_redacts_sensitive_event_values(self):
        output = StringIO()
        with patch.object(dsh_worker, "REDACTIONS", {self.token}), redirect_stdout(output):
            dsh_worker.emit("event", payload={"message": "Bearer " + self.token})
            error = dsh_worker.redact("Error with " + self.token)
        self.assertNotIn(self.token, output.getvalue())
        self.assertNotIn(self.token, error)
        self.assertIn("[redacted]", output.getvalue())

    def test_non_windows_keeps_original_stdio_config(self):
        config = {"patches": ["existing-stdio-patch.json"], "env": {"EXISTING": "1"}}
        with patch.object(mcp_http.os, "name", "posix"):
            with mcp_http.prepare_windows_config(config, set()) as actual:
                self.assertIs(actual, config)

    @unittest.skipUnless(os.name == "nt", "Windows transport only")
    def test_windows_missing_or_unsafe_mcp_configuration_fails_closed(self):
        missing = self.root / "missing.json"
        missing.write_text("[]", encoding="utf-8")
        with self.assertRaises(ValueError):
            with mcp_http.prepare_windows_config({"patches": [str(missing)]}, set()):
                self.fail("Must not start without the expected scoped MCP tool")
        unsafe = self.root / "unsafe.json"
        unsafe.write_text(json.dumps([{"insert": [{"id": "researchos-mcp", "name": "@deepseek-ai/dsh-mcp-client",
            "config": {"serverName": "researchos", "transport": "stdio", "command": sys.executable,
                       "args": [str(ROOT / "demo/api/research_mcp.py"), str(workspace.DATA), self.a],
                       "failOnStartupError": False}}]}]), encoding="utf-8")
        with self.assertRaises(ValueError):
            with mcp_http.prepare_windows_config({"patches": [str(unsafe)]}, set()):
                self.fail("Must not silently ignore an unavailable project tool")

    @unittest.skipUnless(os.name == "nt", "Windows transport only")
    def test_patch_contains_no_token_and_normal_cleanup(self):
        original = self.root / "original.json"
        original.write_text(json.dumps([{"insert": [{"id": "researchos-mcp", "name": "@deepseek-ai/dsh-mcp-client",
            "config": {"serverName": "researchos", "transport": "stdio", "command": sys.executable,
                       "args": [str(ROOT / "demo/api/research_mcp.py"), str(workspace.DATA), self.a],
                       "failOnStartupError": True}}]}]), encoding="utf-8")
        config = {"patches": [str(original)], "env": {"EXISTING": "1"}}
        redactions = set()
        with patch.object(Path, "home", return_value=self.root), \
             mcp_http.prepare_windows_config(config, redactions) as updated:
            self.assertEqual(updated["env"]["EXISTING"], "1")
            token = next(iter(redactions))
            self.assertEqual(updated["env"]["LABWEAVE_MCP_TOKEN"], "Bearer " + token)
            patch_file = Path(updated["patches"][0])
            body = patch_file.read_text(encoding="utf-8")
            self.assertNotIn(token, body)
            self.assertIn('!!js "process.env.LABWEAVE_MCP_TOKEN"', body)
            self.assertGreaterEqual(updated["initialize_timeout_seconds"], 90)
        self.assertFalse(patch_file.exists())

    @unittest.skipUnless(os.name == "nt", "Windows transport only")
    def test_forced_worker_exit_closes_port_and_leaves_no_token_on_disk(self):
        script = r'''
from pathlib import Path
from unittest.mock import patch
import json, os, re, sys
sys.path.insert(0, sys.argv[1])
import mcp_http
root = Path(sys.argv[2])
original = root / "patch.json"
original.write_text(json.dumps([{"insert":[{"id":"researchos-mcp","name":"@deepseek-ai/dsh-mcp-client",
 "config":{"serverName":"researchos","transport":"stdio","command":sys.executable,
 "args":[str(Path(sys.argv[1]) / "research_mcp.py"),str(root / "data"),"project-a"],"failOnStartupError":True}}]}]))
with patch.object(Path, "home", return_value=root), patch.object(mcp_http.secrets, "token_urlsafe", return_value="forced-stop-fixture-token"):
    with mcp_http.prepare_windows_config({"patches":[str(original)]}, set()) as config:
        path=Path(config["patches"][0]); text=path.read_text()
        print(json.dumps({"path":str(path),"url":re.search(r"http://127\.0\.0\.1:\d+/mcp", text).group()}),flush=True)
        os._exit(0)
'''
        result = subprocess.run([sys.executable, "-c", script, str(ROOT / "demo/api"), str(self.root)],
                                capture_output=True, text=True, timeout=120, check=True)
        record = json.loads(result.stdout)
        body = Path(record["path"]).read_text(encoding="utf-8")
        self.assertNotIn("forced-stop-fixture-token", body)
        with self.assertRaises((URLError, OSError)):
            self.opener.open(record["url"], timeout=2)


if __name__ == "__main__":
    unittest.main()
