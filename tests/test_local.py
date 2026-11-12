"""Offline business invariants, migration, restore, project isolation and recovery."""
from contextlib import closing
import base64
import json
from pathlib import Path
import sqlite3
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import workspace, project_service, tasks, backup, research_records


class LocalTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.previous = workspace.DATA
        workspace.DATA = Path(self.temporary.name) / "data"
        workspace.save({"revision":0, "state":{"version":2,"projects":[]}, "settings":{}})
        self.project = project_service.call("project_create", {"name":"A"}, "global")["id"]

    def tearDown(self):
        workspace.DATA = self.previous
        self.temporary.cleanup()

    def test_dependencies_and_isolation(self):
        a = project_service.create_entry(self.project, "goals", {"text":"first"})
        b = project_service.create_entry(self.project, "goals", {"text":"second","dependsOn":[a["id"]],"parentId":a["id"]})
        with self.assertRaises(workspace.WorkspaceError):
            project_service.update_entry(self.project, "goals", {"id":b["id"],"done":True})
        with self.assertRaises(workspace.WorkspaceError):
            tasks.create({"projectId":self.project,"goalId":b["id"],"prompt":"run"})
        project_service.update_entry(self.project, "goals", {"id":a["id"],"done":True})
        project_service.update_entry(self.project, "goals", {"id":b["id"],"done":True})
        with self.assertRaises(workspace.WorkspaceError):
            project_service.update_entry(self.project, "goals", {"id":a["id"],"done":False})
        other = project_service.call("project_create", {"name":"B"}, "global")["id"]
        project_service.remember(self.project, "A private decision")
        self.assertEqual(project_service.memory_list(other), [])
        result = project_service.call("project_list", {}, self.project)
        self.assertEqual([p["id"] for p in result], [self.project])

    def test_backup_restores_files_and_database(self):
        item = project_service.upload({"projectId":self.project,"name":"data.txt","data":base64.b64encode(b"before").decode()})
        path = project_service.resource_path(self.project,item["id"])
        repo = project_service.folder(self.project) / "repositories/demo/.git"
        repo.mkdir(parents=True)
        (repo/"HEAD").write_text("ref: refs/heads/main\n")
        saved = backup.create()
        path.write_text("after")
        extra = path.parent / "new.txt"
        extra.write_text("not in snapshot")
        project_service.create_entry(self.project,"ideas",{"text":"after snapshot"})
        result = backup.restore(saved)
        self.assertEqual(path.read_text(),"before")
        self.assertFalse(extra.exists())
        self.assertTrue((repo/"HEAD").exists())
        self.assertEqual(project_service.project(workspace.snapshot(),self.project)["rails"]["ideas"],[])
        self.assertTrue(backup.archive_path(result["rollback"]).is_file())

    def test_restart_pending_and_guard(self):
        task = tasks.create({"projectId":self.project,"prompt":"no model call"})
        tasks.update(task["id"],pending={"kind":"approval","requestId":"old"})
        self.assertEqual(tasks.approve({"id":task["id"]})["status"],"WAITING_APPROVAL")
        tasks.recover()
        self.assertEqual(tasks.get(task["id"])["status"],"FAILED")
        self.assertIsNone(tasks.get(task["id"])["pending"])

    def test_revision_conflicts(self):
        old = workspace.snapshot()
        project_service.create_entry(self.project,"ideas",{"text":"remote"})
        with self.assertRaises(workspace.WorkspaceError) as error:
            workspace.save(old)
        self.assertEqual(error.exception.status,409)
        self.assertEqual(project_service.project(workspace.snapshot(),self.project)["rails"]["ideas"][0]["text"],"remote")

    def test_experiment_roundtrip_and_validation(self):
        item = research_records.save(self.project,"experiment",{"name":"baseline","metrics":{"loss":.1},"parameters":{"seed":42},"logs":"done","status":"completed"})
        research_records.save(self.project,"experiment",{"id":item["id"],"metrics":{"loss":.05}})
        self.assertEqual(research_records.records(self.project,"experiment")[0]["metrics"]["loss"],.05)
        with self.assertRaises(workspace.WorkspaceError):
            research_records.save(self.project,"experiment",{"name":"invalid","parameters":[]})
        research_records.delete(self.project,"experiment",{"id":item["id"]})
        self.assertEqual(research_records.records(self.project,"experiment"),[])


class MigrationTests(unittest.TestCase):
    def test_old_snapshot_migrates_without_losing_messages(self):
        previous = workspace.DATA
        with TemporaryDirectory() as temporary:
            workspace.DATA = Path(temporary)
            original = {"state":{"version":2,"projects":[{"id":"proj_legacy","name":"old",
                        "rails":{"ideas":[{"id":"note","text":"keep"}]},
                        "threads":[{"id":"thread","messages":[{"id":"message","text":"history"}]}]}]},"settings":{"theme":"dark"}}
            with closing(sqlite3.connect(workspace.DATA/"workspace.sqlite3")) as db, db:
                db.execute("CREATE TABLE workspace(id INTEGER PRIMARY KEY, revision INTEGER, snapshot TEXT)")
                db.execute("INSERT INTO workspace VALUES(1,7,?)",(json.dumps(original),))
            try:
                saved = workspace.snapshot()
                self.assertEqual(saved["revision"],7)
                project=saved["state"]["projects"][0]
                self.assertEqual(project["threads"][0]["messages"][0]["text"],"history")
                self.assertEqual(project["rails"]["ideas"][0]["text"],"keep")
                workspace.save(saved)
                self.assertEqual(workspace.snapshot()["settings"],{"theme":"dark"})
            finally:
                workspace.DATA = previous


if __name__ == "__main__":
    unittest.main()
