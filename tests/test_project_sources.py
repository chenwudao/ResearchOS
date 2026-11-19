from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from unittest.mock import patch
from pypdf import PdfWriter

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import native_web
from project_service import create_project
import project_sources as sources
import workspace


class ProjectSourcesTests(unittest.TestCase):
    def setUp(self):
        temporary = TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        environment = patch.object(workspace, "DATA", self.root / "app")
        environment.start()
        self.addCleanup(environment.stop)
        for scope in ("proj_a", "proj_b"):
            create_project(scope, scope)
        self.documents = self.root / "papers"
        self.documents.mkdir()
        (self.documents / "notes.md").write_text("实验记录\n", encoding="utf-8")

    def test_edit_and_unlink_preserve_files_and_project_scope(self):
        source = sources.save("proj_a", {"path": str(self.documents)})
        self.assertEqual(sources.save("proj_a", {"path": str(self.documents)})["id"], source["id"])
        sources.save("proj_a", {**source, "name": "实验材料"})
        before = native_web.project_action("proj_a", {"action": "settings/view"})
        after = native_web.project_action("proj_a", {
            "action": "settings/update", "args": {"name": "论文研究", "description": "复核结果", "topic": "消融实验"},
        })
        self.assertEqual(after["name"], "论文研究")
        self.assertEqual(after["description"], "复核结果")
        self.assertEqual(after["topic"], "消融实验")
        self.assertEqual(after["directory"], before["directory"])
        self.assertEqual(sources.list_directory("proj_a", source["id"])["entries"],
                         [{"path": "notes.md", "kind": "file"}])
        read = {"sourceId": source["id"], "path": "notes.md"}
        self.assertEqual(sources.read_file("proj_a", read)["source"], "实验材料")
        self.assertEqual(sources.read_file("proj_a", read)["text"], "实验记录\n")
        self.assertEqual(sources.list_sources("proj_b"), [])
        with self.assertRaises(workspace.WorkspaceError):
            sources.read_file("proj_b", read)
        sources.remove("proj_a", source["id"])
        self.assertTrue((self.documents / "notes.md").is_file())
        with self.assertRaises(workspace.WorkspaceError):
            sources.read_file("proj_a", read)

    def test_only_read_registered_paths(self):
        source = sources.save("proj_a", {"path": str(self.documents)})
        for forbidden in ("../app/workspace.sqlite3", "C:/Windows/file.txt", ".env"):
            with self.subTest(path=forbidden), self.assertRaises(workspace.WorkspaceError):
                sources.read_file("proj_a", {"sourceId": source["id"], "path": forbidden})
        with self.assertRaises(workspace.WorkspaceError):
            sources.save("proj_a", {"path": native_web.project_action("proj_b", {"action": "settings/view"})["directory"]})
        try:
            (self.documents / "linked").symlink_to(workspace.DATA, target_is_directory=True)
        except OSError:
            self.skipTest("Host cannot create symlinks")
        with self.assertRaises(workspace.WorkspaceError):
            sources.list_directory("proj_a", source["id"], "linked")

    def test_read_pdf_and_utf8_across_pages_of_text(self):
        text = "a" * (24 * 1024 - 1) + "边界\n"
        (self.documents / "long.md").write_text(text, encoding="utf-8")
        pdf = PdfWriter()
        for _ in range(2):
            pdf.add_blank_page(width=400, height=600)
        pdf.write(self.documents / "source.pdf")
        source = sources.save("proj_a", {"path": str(self.documents)})
        read = {"sourceId": source["id"], "path": "long.md"}
        first = sources.read_file("proj_a", read)
        second = sources.read_file("proj_a", {**read, "offset": first["nextOffset"]})
        self.assertEqual(first["text"] + second["text"], text)
        self.assertIsNone(second["nextOffset"])
        page = sources.read_file("proj_a", {**read, "path": "source.pdf", "page": 2})
        self.assertEqual((page["page"], page["pages"]), (2, 2))


if __name__ == "__main__":
    unittest.main()
