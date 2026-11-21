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

    def test_worker_context_keeps_project_decisions_and_task_relevant_updates(self):
        import project_flow

        def add(session, identity, body, **fields):
            project_flow.write(self.project, {"sessionId": session, "messageId": identity, "text": body, **fields})

        add("project-chat", "original", "Original instructions")
        add("project-chat", "after", "Follow-up for a later run", followUpOf="run")
        add("other-bot-session", "local", "Unrelated Bot conversation")
        add("project-chat", "rule", "Confirmed shared rule", action="decision")
        with closing(workspace.database()) as db, db:
            project_flow.append(db, self.project, "run-progress", "progress", {"taskId": "run", "text": "My progress"})
            project_flow.append(db, self.project, "dependency-result", "task", {"taskId": "dep", "text": "Predecessor result"})
            project_flow.append(db, self.project, "other-run", "progress", {"taskId": "other", "text": "Unrelated progress"})
        audience = {"sessionId": "worker", "parentSessionId": "project-chat",
                    "requestId": "original", "taskIds": ["run", "dep"]}
        result = project_flow.read(self.project, audience=audience)
        self.assertEqual([event["text"] for event in result["events"]],
                         ["Original instructions", "Confirmed shared rule", "My progress", "Predecessor result"])
        self.assertEqual(project_flow.read(self.project, result["cursor"], audience)["events"], [])

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


class MemoryHarnessTests(unittest.TestCase):
    def setUp(self):
        self.temporary = TemporaryDirectory()
        self.previous = workspace.DATA
        workspace.DATA = Path(self.temporary.name) / "data"

    def tearDown(self):
        workspace.DATA = self.previous
        self.temporary.cleanup()

    def test_legacy_five_column_db_migrates_and_restores_with_fts5(self):
        import memory_store
        workspace.DATA.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(workspace.DATA / "workspace.sqlite3")) as db, db:
            db.execute("CREATE TABLE workspace(id INTEGER PRIMARY KEY CHECK (id = 1), revision INTEGER NOT NULL, snapshot TEXT NOT NULL)")
            db.execute("CREATE TABLE projects(id TEXT PRIMARY KEY, position INTEGER, body TEXT)")
            db.execute("CREATE TABLE entities(project TEXT, kind TEXT, id TEXT, position INTEGER, body TEXT, PRIMARY KEY(project, kind, id))")
            db.execute("CREATE TABLE memories(id TEXT PRIMARY KEY, project TEXT, category TEXT, content TEXT, created TEXT)")
            db.execute("CREATE TABLE session_links(project TEXT, thread TEXT, session TEXT, PRIMARY KEY(project, thread))")
            proj_meta = {"id": "proj_legacy_mem", "name": "Old"}
            db.execute("INSERT INTO projects VALUES('proj_legacy_mem', 0, ?)", (json.dumps(proj_meta),))
            db.execute("INSERT INTO workspace VALUES(1, 1, ?)", (json.dumps({"state": {"version": 2, "projects": []}, "settings": {}}),))
            db.execute("INSERT INTO memories VALUES('m_legacy', 'proj_legacy_mem', 'decision', '使用固定随机种子 seed=42 对照', '2026-01-01T00:00:00+00:00')")
            db.execute("PRAGMA user_version=1")

        with closing(workspace.database()) as db:
            self.assertEqual(db.execute("PRAGMA user_version").fetchone()[0], 1)
            cols = {row[1] for row in db.execute("PRAGMA table_info(memories)")}
            self.assertTrue({"source", "pinned", "updated_at"} <= cols)

        hits = memory_store.search_memories("proj_legacy_mem", "随机种子")
        self.assertEqual([h["id"] for h in hits], ["m_legacy"])

        saved = backup.create()
        memory_store.delete_memory("proj_legacy_mem", "m_legacy")
        self.assertEqual(memory_store.search_memories("proj_legacy_mem", "随机种子"), [])
        backup.restore(saved)
        restored = memory_store.search_memories("proj_legacy_mem", "seed=42")
        self.assertEqual([h["id"] for h in restored], ["m_legacy"])

    def test_fts5_cjk_pinning_dedup_and_delete_cascade(self):
        import memory_store
        workspace.save({"revision": 0, "state": {"version": 2, "projects": []}, "settings": {}})
        proj_a = project_service.call("project_create", {"name": "MemA"}, "global")["id"]
        proj_b = project_service.call("project_create", {"name": "MemB"}, "global")["id"]
        project_service.remember("global", "全局偏好：固定PyTorch随机种子", "preference")

        first = project_service.remember(proj_a, "基线模型使用 AdamW lr=1e-4，固定随机种子 42", "decision", source="conversation")
        dup = project_service.remember(proj_a, "基线模型使用   AdamW lr=1e-4，固定随机种子 42", "decision")
        self.assertEqual(dup["id"], first["id"])
        self.assertTrue(dup["deduplicated"])

        pinned_entry = project_service.remember(proj_a, "不可违反的核心约束：对照实验禁止数据泄漏", "decision", pinned=True)
        extra = project_service.remember(proj_a, "对照实验记录：学习率 lr=1e-4 收敛平稳", "research")

        self.assertEqual([m["id"] for m in project_service.memory_list(proj_a)][0], pinned_entry["id"])
        core = memory_store.core_memories(proj_a, max_items=2)
        self.assertEqual(core[0]["id"], pinned_entry["id"])

        cjk_hits = memory_store.search_memories(proj_a, "对照实验")
        self.assertEqual(cjk_hits[0]["id"], pinned_entry["id"])
        self.assertIn(extra["id"], [h["id"] for h in cjk_hits])

        symbol_hits = memory_store.search_memories(proj_a, "lr=1e-4")
        self.assertGreaterEqual(len(symbol_hits), 2)
        single_char_hits = memory_store.search_memories(proj_a, "漏")
        self.assertEqual([h["id"] for h in single_char_hits], [pinned_entry["id"]])
        self.assertEqual(memory_store.search_memories(proj_b, "对照实验"), [])

        project_service.delete_project(proj_a)
        with closing(workspace.database()) as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM memories WHERE project=?", (proj_a,)).fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM memories_fts WHERE project=?", (proj_a,)).fetchone()[0], 0)
        self.assertEqual(len(project_service.memory_list("global")), 1)


if __name__ == "__main__":
    unittest.main()
