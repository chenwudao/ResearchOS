"""Feature naming is scoped by the MCP server, not tool arguments."""

import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo" / "api"))
import project_service
import research_mcp
import workspace


class McpNamingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="labweave-mcp-name-test-")
        self.previous_data = workspace.DATA
        workspace.DATA = Path(self.temp.name)
        projects = [{"id": name, "name": name, "rails": {}, "threads": []}
                    for name in ("proj_a", "proj_b")]
        workspace.save({"revision": 0, "state": {"version": 2, "projects": projects}, "settings": {}})

    def tearDown(self):
        workspace.DATA = self.previous_data
        self.temp.cleanup()

    @staticmethod
    def call(scope, name, arguments):
        result = research_mcp.dispatch({"jsonrpc": "2.0", "id": 1, "method": "tools/call",
                                        "params": {"name": name, "arguments": arguments}}, scope)["result"]
        if result.get("isError"):
            return result
        return json.loads(result["content"][0]["text"])

    def test_conversation_scope_controls_target(self):
        self.assertEqual(self.call("global", "rename_feature", {"featureId": "ideas", "label": "灵感"})["scope"], "global")
        self.assertEqual(self.call("proj_a", "feature_labels", {})["ideas"], "灵感")
        self.assertEqual(self.call("proj_a", "rename_feature", {"featureId": "ideas", "label": "假说"})["scope"], "proj_a")
        self.assertEqual(self.call("proj_a", "feature_labels", {})["ideas"], "假说")
        self.assertEqual(self.call("proj_b", "feature_labels", {})["ideas"], "灵感")
        self.assertTrue(self.call("proj_a", "rename_feature", {"featureId": "ideas", "label": "越权", "projectId": "proj_b", "caller_scope": "global"})["isError"])
        self.assertTrue(self.call("proj_a", "rename_feature", {"featureId": "ideas", "label": "越权", "projectId": "global"})["isError"])
        self.assertEqual(self.call("proj_b", "feature_labels", {})["ideas"], "灵感")

    def test_global_conversation_can_select_project(self):
        result = self.call("global", "rename_feature", {"featureId": "goals", "label": "里程碑", "projectId": "proj_b"})
        self.assertEqual(result["scope"], "proj_b")
        self.assertEqual(self.call("proj_b", "feature_labels", {})["goals"], "里程碑")
        self.assertEqual(self.call("proj_a", "feature_labels", {})["goals"], "目标")
        self.assertTrue(self.call("global", "rename_feature", {"featureId": "goals", "label": "错", "projectId": "proj_missing"})["isError"])

    def test_assistant_name_can_change_from_a_conversation(self):
        self.assertEqual(self.call("global", "assistant_name_get", {}), {"name": "goat"})
        self.assertEqual(self.call("proj_a", "assistant_rename", {"name": "科研伙伴"}), {"name": "科研伙伴"})
        self.assertEqual(self.call("global", "assistant_name_get", {}), {"name": "科研伙伴"})
        self.assertTrue(self.call("global", "assistant_rename", {"name": "  "})["isError"])
        self.assertTrue(self.call("proj_missing", "assistant_rename", {"name": "越权"})["isError"])
        self.assertEqual(self.call("global", "assistant_name_get", {}), {"name": "科研伙伴"})

    def test_project_rename_preserves_identity_and_scope(self):
        updated = self.call("proj_a", "project_update", {"name": "可改名的项目"})
        self.assertEqual((updated["id"], updated["name"]), ("proj_a", "可改名的项目"))
        self.assertTrue(self.call("proj_a", "project_update", {"projectId": "proj_b", "name": "越权"})["isError"])
        projects = {p["id"]: p["name"] for p in workspace.snapshot()["state"]["projects"]}
        self.assertEqual(projects, {"proj_a": "可改名的项目", "proj_b": "proj_b"})

    def test_generic_project_tool_cannot_write_feature_names(self):
        with self.assertRaises(workspace.WorkspaceError) as raised:
            project_service.call("rename_feature", {"featureId": "ideas", "label": "绕过"}, "proj_a")
        self.assertEqual(raised.exception.status, 404)
        self.assertEqual(self.call("proj_a", "feature_labels", {})["ideas"], "点子")


if __name__ == "__main__":
    unittest.main()
