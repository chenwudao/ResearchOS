"""Naming behavior against an isolated copy of the local workspace database."""

from contextlib import closing
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo" / "api"))
import naming
import workspace


class NamingTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="labweave-naming-test-")
        self.previous_data = workspace.DATA
        workspace.DATA = Path(self.temp.name)
        projects = [
            {"id": project_id, "name": name, "rails": {}, "threads": []}
            for project_id, name in (("proj_a", "A"), ("proj_b", "B"))
        ]
        workspace.save({"revision": 0, "state": {"version": 2, "projects": projects}, "settings": {}})
        self.store = naming.NamingStore()

    def tearDown(self):
        workspace.DATA = self.previous_data
        self.temp.cleanup()

    def test_default_and_user_rename_persist(self):
        self.assertEqual(self.store.assistant_name(), "goat")
        self.assertEqual(self.store.rename_assistant("  研究伙伴  "), "研究伙伴")
        self.assertEqual(naming.NamingStore().assistant_name(), "研究伙伴")
        for value in ("", " ", "a\nb", "x" * 81, None):
            with self.subTest(value=value), self.assertRaises(workspace.WorkspaceError):
                self.store.rename_assistant(value)

    def test_global_and_project_names_are_scoped_and_stable(self):
        self.assertEqual(self.store.feature_labels("global"), naming.DEFAULT_FEATURE_LABELS)
        self.store.rename_feature_from_conversation("global", "ideas", "灵感")
        self.assertEqual(self.store.feature_labels("proj_a")["ideas"], "灵感")
        self.store.rename_feature_from_conversation("proj_a", "ideas", "假说")
        self.assertEqual(self.store.feature_labels("proj_a")["ideas"], "假说")
        self.assertEqual(self.store.feature_labels("proj_b")["ideas"], "灵感")
        self.assertEqual(self.store.feature_labels("global")["ideas"], "灵感")
        self.store.rename_feature_from_conversation("global", "ideas", "灵感库", project_id="proj_b")
        self.assertEqual(self.store.feature_labels("proj_b")["ideas"], "灵感库")
        self.assertEqual(set(self.store.feature_labels("proj_b")), set(naming.DEFAULT_FEATURE_LABELS))

    def test_rejects_cross_project_invalid_feature_and_unknown_scope(self):
        for caller, feature, label, target, status in (
            ("proj_a", "ideas", "其他", "proj_b", 403),
            ("proj_a", "ideas", "其他", "global", 403),
            ("proj_a", "unknown", "其他", None, 400),
            ("proj_missing", "ideas", "其他", None, 404),
            ("global", "ideas", "其他", "proj_missing", 404),
        ):
            with self.subTest(caller=caller, feature=feature, target=target):
                with self.assertRaises(workspace.WorkspaceError) as raised:
                    self.store.rename_feature_from_conversation(caller, feature, label, project_id=target)
                self.assertEqual(raised.exception.status, status)
        with self.assertRaises(workspace.WorkspaceError):
            self.store.feature_labels("proj_a", "proj_b")

    def test_general_snapshot_saves_do_not_override_names(self):
        self.store.rename_assistant("自定义")
        self.store.rename_feature_from_conversation("proj_a", "ideas", "假说")
        saved = workspace.snapshot()
        saved["settings"]["assistantName"] = "forged"
        saved["state"]["projects"][0]["featureLabels"] = {"ideas": "forged"}
        workspace.save(saved)
        self.assertEqual(self.store.assistant_name(), "自定义")
        self.assertEqual(self.store.feature_labels("proj_a")["ideas"], "假说")
        with closing(workspace.database()) as db:
            row = db.execute("SELECT caller_scope,target_scope,feature_id,previous_label,label FROM labweave_feature_label_audit").fetchone()
        self.assertEqual(row, ("proj_a", "proj_a", "ideas", "点子", "假说"))


if __name__ == "__main__":
    unittest.main()
