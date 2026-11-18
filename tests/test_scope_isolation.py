"""Exercise real private MCP transports with independent project scopes."""

from contextlib import ExitStack
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from urllib.request import ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "demo/api"))
import mcp_http
import project_service
import workspace


class ScopeIsolationTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory(prefix="labweave-scope-test-")
        self.original_data = workspace.DATA
        workspace.DATA = Path(self.temp.name) / "data"
        workspace.save({"revision": 0, "settings": {}, "state": {"version": 2, "projects": []}})
        self.a = project_service.call("project_create", {"name": "A"}, "global")["id"]
        self.b = project_service.call("project_create", {"name": "B"}, "global")["id"]
        self.stack = ExitStack()
        self.token = "isolated-test-token"
        self.urls = {scope: self.stack.enter_context(mcp_http.private_bridge(workspace.DATA, scope, self.token))
                     for scope in ("global", self.a, self.b)}
        self.opener = build_opener(ProxyHandler({}))

    def tearDown(self):
        self.stack.close()
        workspace.DATA = self.original_data
        self.temp.cleanup()

    def call(self, scope, name, arguments):
        body = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                           "params": {"name": name, "arguments": arguments}}).encode()
        request = Request(self.urls[scope], data=body, method="POST",
                          headers={"Content-Type": "application/json", "Authorization": "Bearer " + self.token})
        with self.opener.open(request, timeout=5) as response:
            return json.loads(response.read())["result"]

    def test_project_servers_cannot_act_on_another_project(self):
        self.assertNotIn("isError", self.call(self.a, "idea_create", {"text": "A only"}))
        self.assertTrue(self.call(self.a, "idea_create", {"text": "wrong", "projectId": self.b})["isError"])
        self.assertTrue(self.call(self.b, "project_get_context", {"projectId": self.a})["isError"])
        state = workspace.snapshot()["state"]
        projects = {item["id"]: item for item in state["projects"]}
        self.assertEqual([idea["text"] for idea in projects[self.a]["rails"]["ideas"]], ["A only"])
        self.assertEqual(projects[self.b]["rails"]["ideas"], [])

    def test_global_requires_explicit_project_for_project_mutation(self):
        self.assertTrue(self.call("global", "idea_create", {"text": "unscoped"})["isError"])
        self.assertNotIn("isError", self.call("global", "idea_create", {"text": "B explicitly", "projectId": self.b}))
        projects = {item["id"]: item for item in workspace.snapshot()["state"]["projects"]}
        self.assertEqual(projects[self.a]["rails"]["ideas"], [])
        self.assertEqual([idea["text"] for idea in projects[self.b]["rails"]["ideas"]], ["B explicitly"])


if __name__ == "__main__":
    unittest.main()
