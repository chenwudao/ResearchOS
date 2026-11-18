"""Regression coverage for native application boundaries and offline recovery."""
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import backup
import native_web as web
import project_plugins
import workspace


class NativeWorkspaceTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.old = workspace.DATA
        workspace.DATA = self.root / "data"
        self.projects = [web.dispatch("create", {"name": n, "requestId": k * 32})["scope"]
                         for n, k in (("Alpha", "a"), ("Beta", "b"))]
        self.records = {}
        for item in web.catalog():
            record = {"id": "ws-" + item["scope"], "path": item["path"]}
            self.records[item["scope"]] = record
            web.dispatch("bind", {"scope": item["scope"], "workspace": record})

    def tearDown(self):
        workspace.DATA = self.old
        self.tmp.cleanup()

    def test_legacy_items_and_fixed_session_scope(self):
        a, b = self.projects
        record = self.records[a]
        self.assertEqual(web.dispatch("create", {"name": "Alpha", "requestId": "a"*32})["scope"], a)
        web.dispatch("tool", {"workspace": record, "tool": "idea_create", "args": {"text": "only A"}})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "tool", {
            "workspace": record, "tool": "idea_create", "args": {"text": "cross", "projectId": b}})
        self.assertRaises(web.BindingError, web.dispatch, "tool", {
            "workspace": {**record, "path": self.records[b]["path"]}, "tool": "project_list"})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": record, "action": "rename_feature", "args": {"featureId": "ideas", "label": "x"}})
        self.assertEqual(web.project_view(a)["rails"]["ideas"][0]["text"], "only A")
        self.assertFalse(web.project_view(b)["rails"]["ideas"])

    def test_all_project_and_private_plugins(self):
        a, b = self.projects
        shared = project_plugins.create("all", {"name": "All", "prompt": "Read the current project's sources"})
        private = project_plugins.create(a, {"name": "Private", "prompt": "Read A"})
        self.assertEqual(len(web.project_view(a)["plugins"]), 2)
        self.assertEqual([p["id"] for p in web.project_view(b)["plugins"]], [shared["id"]])
        self.assertRaises(workspace.WorkspaceError, project_plugins.rename, b, private["id"], "other")
        self.assertRaises(workspace.WorkspaceError, project_plugins.rename, a, shared["id"], "changed")
        self.assertEqual(project_plugins.rename("global", shared["id"], "All 2")["name"], "All 2")

    def test_offline_backup_restores_business_and_session_as_a_pair(self):
        home = self.root / "profile"
        (home / "sessions").mkdir(parents=True)
        (home / "storages").mkdir()
        session = home / "sessions/sample.jsonl"
        registry = home / "storages/workspace.json"
        secret = home / ".credentials.yaml"
        session.write_text("before"); registry.write_text("{}"); secret.write_text("test-only")
        artifact = web.global_directory() / "notes.md"
        artifact.write_text("global")
        archive = backup.create(native_home=home)
        with ZipFile(backup.archive_path(archive["id"])) as z:
            self.assertNotIn(".credentials.yaml", " ".join(z.namelist()))
            self.assertIn("native/sessions/sample.jsonl", z.namelist())
        session.write_text("after"); secret.write_text("current"); artifact.write_text("changed")
        self.assertRaises(workspace.WorkspaceError, backup.restore, archive)
        result = backup.restore(archive, native_home=home)
        self.assertEqual(session.read_text(), "before")
        self.assertEqual(secret.read_text(), "current")
        self.assertEqual(artifact.read_text(), "global")
        with ZipFile(backup.archive_path(result["rollback"])) as z:
            self.assertEqual(z.read("native/sessions/sample.jsonl"), b"after")


if __name__ == "__main__":
    unittest.main()
