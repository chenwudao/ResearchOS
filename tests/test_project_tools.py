"""Work-tree listings, Git status and keyword-category storage."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import project_service as projects
import project_tools
import workspace


class ProjectToolsTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.old = workspace.DATA
        workspace.DATA = Path(self.temp.name) / "data"
        self.project = projects.create_project("工具验收")["id"]
        self.root = projects.folder(self.project)
        (self.root / "notes").mkdir()
        (self.root / "notes" / "todo.md").write_text("# 待办\n", encoding="utf-8")

    def tearDown(self):
        workspace.DATA = self.old
        self.temp.cleanup()

    def test_trees_and_listdir(self):
        listing = project_tools.trees(self.project)
        self.assertEqual(listing["trees"][0]["id"], "project")
        self.assertEqual(listing["trees"][0]["name"], "工具验收")
        entries = project_tools.listdir(self.project, "project")["entries"]
        names = {item["name"] for item in entries}
        self.assertIn("notes", names)
        nested = project_tools.listdir(self.project, "project", "notes")["entries"]
        self.assertEqual(nested[0]["name"], "todo.md")
        self.assertEqual(nested[0]["kind"], "file")
        with self.assertRaises(workspace.WorkspaceError):
            project_tools.listdir(self.project, "project", "../..")

    def test_git_repo_and_worktree_discovery(self):
        repo = self.root / "repositories" / "demo-lib"
        repo.mkdir(parents=True)
        subprocess.run(["git", "init", "-b", "main"], cwd=repo, check=True, capture_output=True)
        (repo / "readme.md").write_text("lib\n", encoding="utf-8")
        subprocess.run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", "add", "."], cwd=repo, check=True, capture_output=True)
        subprocess.run(["git", "-c", "user.email=a@b.c", "-c", "user.name=t", "commit", "-m", "init"], cwd=repo, check=True, capture_output=True)
        trees = project_tools.trees(self.project)["trees"]
        self.assertTrue(any(item["kind"] == "repository" and item["path"].endswith("demo-lib") for item in trees))
        status = project_tools.git_status(self.project)
        self.assertEqual(len(status["repos"]), 1)
        self.assertEqual(status["repos"][0]["branch"], "main")
        self.assertTrue(status["repos"][0]["clean"])
        self.assertEqual(status["repos"][0]["commits"][0]["subject"], "init")
        (repo / "extra.txt").write_text("x\n", encoding="utf-8")
        dirty = project_tools.git_status(self.project)["repos"][0]
        self.assertFalse(dirty["clean"])
        self.assertTrue(any(f["path"] == "extra.txt" for f in dirty["files"]))

    def test_storage_categories_and_files(self):
        created = project_tools.storage_define(self.project, "文献", ["论文", "PDF"])
        self.assertEqual(created["name"], "文献")
        updated = project_tools.storage_define(self.project, "文献", ["论文", "综述"])
        self.assertEqual(updated["id"], created["id"])
        self.assertEqual(updated["keywords"], ["论文", "综述"])
        saved = project_tools.storage_save(self.project, "文献", source="notes/todo.md")
        listing = project_tools.storage_list(self.project)
        self.assertEqual(len(listing["categories"]), 1)
        self.assertEqual(listing["categories"][0]["files"][0]["name"], "todo.md")
        self.assertTrue((self.root / saved["path"]).is_file())
        with self.assertRaises(workspace.WorkspaceError):
            project_tools.storage_save(self.project, "文献", source="../secret.txt")
        project_tools.storage_remove_file(self.project, "文献", saved["path"])
        self.assertEqual(project_tools.storage_list(self.project)["categories"][0]["files"], [])
        project_tools.storage_remove_category(self.project, created["id"])
        self.assertEqual(project_tools.storage_list(self.project)["categories"], [])

    def test_handle_unknown_is_none(self):
        self.assertIsNone(project_tools.handle(self.project, "view", {}))


if __name__ == "__main__":
    unittest.main()
