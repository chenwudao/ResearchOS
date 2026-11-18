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

    def test_global_and_project_memory_tool_isolation(self):
        saved = self.call("global", "global_memory_write", {"content": "全局工作流：使用 PyTorch 与随机种子 42", "category": "preference"})
        self.assertNotIn("isError", saved)
        mid = saved["content"][0]["text"]
        parsed = json.loads(mid)
        self.assertEqual(parsed["source"], "conversation")
        pinned = self.call("global", "global_memory_pin", {"id": parsed["id"], "pinned": True})
        self.assertNotIn("isError", pinned)
        hits = json.loads(self.call("global", "global_memory_search", {"query": "随机种子"})["content"][0]["text"])
        self.assertEqual([h["id"] for h in hits], [parsed["id"]])
        self.assertTrue(self.call("global", "global_memory_write", {"content": "x", "projectId": self.a})["isError"])
        self.assertTrue(self.call(self.a, "global_memory_search", {"query": "PyTorch"})["isError"])
        self.assertTrue(self.call(self.a, "global_memory_write", {"content": "leak"})["isError"])
        self.assertTrue(self.call(self.a, "global_memory_pin", {"id": parsed["id"], "pinned": False})["isError"])
        pmem = json.loads(self.call(self.a, "memory_write", {"text": "项目 A 专有结论", "pinned": True})["content"][0]["text"])
        self.assertTrue(pmem["pinned"])
        self.assertTrue(self.call(self.b, "memory_pin", {"id": pmem["id"], "pinned": False})["isError"])
        self.assertTrue(self.call(self.b, "memory_pin", {"id": pmem["id"], "projectId": self.a, "pinned": False})["isError"])


if __name__ == "__main__":
    unittest.main()
