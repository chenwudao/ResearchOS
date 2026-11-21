"""Binding checks use only temporary projects and a temporary SQLite file."""
from contextlib import closing
from concurrent.futures import ThreadPoolExecutor
import sqlite3
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo" / "api"))
from dsh_workspace_map import BindingError, WorkspaceBindings


class WorkspaceBindingTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="labweave-map-test-")
        self.base = Path(self.temporary.name).resolve()
        self.root = self.base / "projects"
        self.root.mkdir()
        self.a = self.root / "proj_a"
        self.b = self.root / "proj_b"
        self.a.mkdir()
        self.b.mkdir()
        self.global_root = self.base / "global"
        self.global_root.mkdir()
        self.projects = {"proj_a", "proj_b"}
        self.paths = {("local", "ws_a"): self.a, ("local", "ws_b"): self.b,
                      ("local", "ws_alias"): self.a, ("other", "ws_a"): self.a,
                      ("local", "ws_global"): self.global_root}
        self.db_path = self.base / "bindings.sqlite3"
        self.store = self.new_store()

    def tearDown(self):
        self.temporary.cleanup()

    def new_store(self):
        return WorkspaceBindings(self.db_path, self.root, self.projects.__contains__,
                                 lambda profile, identity: self.paths.get((profile, identity)),
                                 self.global_root)

    def test_global_and_project_scopes_are_explicit_and_persistent(self):
        self.store.bind_global("local", "ws_global")
        self.store.bind_global("local", "ws_global")
        self.store.bind("local", "proj_a", "ws_a")
        restored = self.new_store()
        self.assertEqual(restored.scope_for_workspace("local", "ws_global"), {"kind": "global"})
        self.assertEqual(restored.scope_for_workspace("local", "ws_a"),
                         {"kind": "project", "projectId": "proj_a"})
        for profile, workspace_id in (("local", "unknown"), ("other", "ws_a")):
            with self.subTest(profile=profile, workspace=workspace_id), self.assertRaises(BindingError):
                restored.scope_for_workspace(profile, workspace_id)

    def test_global_binding_rejects_project_directories_and_changes(self):
        with self.assertRaises(BindingError):
            self.store.bind_global("local", "ws_a")
        self.store.bind("local", "proj_a", "ws_a")
        self.paths[("local", "ws_a")] = self.global_root
        with self.assertRaises(BindingError):
            self.store.bind_global("local", "ws_a")
        self.paths[("local", "ws_a")] = self.a
        self.store.bind_global("local", "ws_global")
        self.paths[("local", "ws_global")] = self.a
        with self.assertRaises(BindingError):
            self.store.scope_for_workspace("local", "ws_global")
        self.paths[("local", "ws_global")] = self.global_root
        self.paths[("local", "ws_other_global")] = self.global_root
        with self.assertRaises(BindingError):
            self.store.bind_global("local", "ws_other_global")
        self.assertEqual(self.store.scope_for_workspace("local", "ws_a"),
                         {"kind": "project", "projectId": "proj_a"})

    def test_global_directory_cannot_overlap_projects(self):
        nested = WorkspaceBindings(self.db_path, self.root, self.projects.__contains__,
                                   lambda _profile, _identity: self.a, self.a)
        with self.assertRaises(BindingError):
            nested.bind_global("local", "ws_a")

    def test_session_scope_comes_from_trusted_lookup_and_fails_closed(self):
        self.store.bind_global("local", "ws_global")
        self.store.bind("local", "proj_a", "ws_a")
        self.store.bind("local", "proj_b", "ws_b")
        sessions = {("local", "global_session"): "ws_global",
                    ("local", "session_a"): "ws_a",
                    ("local", "session_b"): "ws_b"}
        lookup = lambda profile, session: sessions.get((profile, session))
        self.assertEqual(self.store.scope_for_session("local", "global_session", lookup), {"kind": "global"})
        self.assertEqual(self.store.scope_for_session("local", "session_a", lookup),
                         {"kind": "project", "projectId": "proj_a"})
        self.assertEqual(self.store.scope_for_session("local", "session_b", lookup),
                         {"kind": "project", "projectId": "proj_b"})
        with self.assertRaises(BindingError):
            self.store.scope_for_session("local", "unknown", lookup)
        sessions[("local", "session_a")] = "unbound"
        with self.assertRaises(BindingError):
            self.store.scope_for_session("local", "session_a", lookup)

    def test_idempotent_persistence_and_profiles(self):
        self.store.bind("local", "proj_a", "ws_a")
        self.store.bind("local", "proj_a", "ws_a")
        self.store.bind("other", "proj_a", "ws_a")
        self.assertEqual(self.new_store().project_for_workspace("local", "ws_a"), "proj_a")
        self.assertEqual(self.new_store().project_for_workspace("other", "ws_a"), "proj_a")
        self.assertIsNone(self.store.project_for_workspace("local", "unknown"))
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM dsh_workspace_bindings_v1").fetchone()[0], 2)

    def test_refuses_conflicts_and_preserves_old_binding(self):
        self.store.bind("local", "proj_a", "ws_a")
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_a", "ws_alias")
        self.paths[("local", "ws_a")] = self.b
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_b", "ws_a")
        self.paths[("local", "ws_a")] = self.a
        self.assertEqual(self.store.project_for_workspace("local", "ws_a"), "proj_a")

    def test_fails_closed_if_project_or_workspace_changes(self):
        self.store.bind("local", "proj_a", "ws_a")
        self.paths.pop(("local", "ws_a"))
        with self.assertRaises(BindingError):
            self.store.project_for_workspace("local", "ws_a")
        self.paths[("local", "ws_a")] = self.b
        with self.assertRaises(BindingError):
            self.store.project_for_workspace("local", "ws_a")
        self.paths[("local", "ws_a")] = self.a
        self.projects.remove("proj_a")
        with self.assertRaises(BindingError):
            self.store.project_for_workspace("local", "ws_a")

    def test_concurrent_competing_bindings_do_not_overwrite(self):
        def bind(workspace_id):
            try:
                self.store.bind("local", "proj_a", workspace_id)
                return True
            except BindingError:
                return False
        with ThreadPoolExecutor(max_workers=2) as pool:
            outcomes = list(pool.map(bind, ("ws_a", "ws_alias")))
        self.assertEqual(sorted(outcomes), [False, True])
        with closing(sqlite3.connect(self.db_path)) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM dsh_workspace_bindings_v1").fetchone()[0], 1)

    def test_rejects_invalid_and_untrusted_paths(self):
        for project in ("../proj_a", "global", "proj_../x", "proj_missing"):
            with self.subTest(project=project), self.assertRaises(BindingError):
                self.store.bind("local", project, "ws_a")
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_a", "ws_b")
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_a", "missing")
        self.paths[("local", "relative")] = Path("projects/proj_a")
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_a", "relative")
        with self.assertRaises(BindingError):
            self.store.bind("local\nother", "proj_a", "ws_a")

    def test_rejects_linked_project_directory(self):
        link = self.root / "proj_link"
        try:
            link.symlink_to(self.b, target_is_directory=True)
        except (OSError, NotImplementedError):
            self.skipTest("Creating directory symlinks is unavailable")
        self.projects.add("proj_link")
        self.paths[("local", "ws_link")] = link
        with self.assertRaises(BindingError):
            self.store.bind("local", "proj_link", "ws_link")


if __name__ == "__main__":
    unittest.main()
