"""Regression coverage for native application boundaries and offline recovery."""
import base64
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import ProxyHandler, Request, build_opener
from zipfile import ZipFile

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import backup
import native_web as web
import project_plugins
import features
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
        self.assertEqual([f["id"] for f in web.project_view(a)["features"]], ["chat"])
        self.assertEqual([f["id"] for f in web.project_view(b)["features"]], ["chat"])
        self.assertEqual(web.dispatch("create", {"name": "Alpha", "requestId": "a"*32})["scope"], a)
        web.dispatch("tool", {"workspace": record, "tool": "idea_create", "args": {"text": "only A"}})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "tool", {
            "workspace": record, "tool": "idea_create", "args": {"text": "cross", "projectId": b}})
        self.assertRaises(web.BindingError, web.dispatch, "tool", {
            "workspace": {**record, "path": self.records[b]["path"]}, "tool": "project_list"})
        renamed = web.dispatch("project", {
            "workspace": record, "action": "feature_rename", "args": {"featureId": "chat", "label": "课题讨论"}})
        self.assertEqual(renamed, {"scope": a, "featureId": "chat", "label": "课题讨论"})
        self.assertEqual(web.project_view(a)["labels"]["chat"], "课题讨论")
        self.assertEqual(web.project_view(b)["labels"]["chat"], "聊天")
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": record, "action": "feature_rename", "args": {"featureId": "ideas", "label": "x", "projectId": b}})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": self.records["global"], "action": "feature_rename", "args": {"featureId": "chat", "label": "全局"}})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": record, "action": "feature_rename", "args": {"featureId": "ideas", "label": "   "}})
        features.enable_builtin(a, "goals")
        features.enable_builtin(b, "goals")
        updated_goals = web.dispatch("project", {
            "workspace": record,
            "action": "feature_update",
            "args": {"featureId": "goals", "label": "研究目标", "hint": "跟踪里程碑", "symbol": "◎", "keywords": ["里程碑", "实验"]},
        })
        self.assertEqual(updated_goals["feature"]["label"], "研究目标")
        self.assertEqual(updated_goals["feature"]["hint"], "跟踪里程碑")
        self.assertEqual(updated_goals["feature"]["symbol"], "◎")
        self.assertEqual(updated_goals["feature"]["keywords"], ["里程碑", "实验"])
        self.assertEqual(web.project_view(b)["labels"]["goals"], "目标")
        created_bot = web.dispatch("project", {
            "workspace": record,
            "action": "create_feature_bot",
            "args": {"label": "实验监视器", "hint": "", "symbol": "✦", "keywords": ["监控"], "requestId": "b"*32},
        })
        bot_id = created_bot["feature"]["id"]
        updated_bot = web.dispatch("project", {
            "workspace": record,
            "action": "feature_update",
            "args": {"featureId": bot_id, "label": "实验追踪", "hint": "实时查看曲线", "symbol": "λ", "keywords": ["曲线", "loss"]},
        })
        self.assertEqual(updated_bot["feature"]["label"], "实验追踪")
        self.assertEqual(updated_bot["feature"]["hint"], "实时查看曲线")
        self.assertEqual(updated_bot["feature"]["symbol"], "λ")
        self.assertEqual(updated_bot["feature"]["keywords"], ["曲线", "loss"])
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": record, "action": "feature_update", "args": {"featureId": "chat", "label": "全局"}})
        self.assertEqual(web.project_view(a)["rails"]["ideas"][0]["text"], "only A")
        self.assertFalse(web.project_view(b)["rails"]["ideas"])

    def test_enriched_project_view_and_scoped_muse_actions(self):
        a, b = self.projects
        rec_a, rec_b = self.records[a], self.records[b]
        web.dispatch("project", {"workspace": rec_a, "action": "description", "args": {"description": "课题背景A"}})
        web.dispatch("project", {"workspace": rec_a, "action": "auto_review", "args": {"enabled": True}})
        mem_a = web.dispatch("project", {"workspace": rec_a, "action": "memory_write", "args": {"text": "A 记忆 基线实验 seed=42"}})
        mem_a2 = web.dispatch("project", {"workspace": rec_a, "action": "memory_write", "args": {"text": "A 核心约束：对照组不可改阈值"}})
        web.dispatch("project", {"workspace": rec_a, "action": "memory_pin", "args": {"id": mem_a2["id"], "pinned": True}})
        web.dispatch("project", {"workspace": rec_a, "action": "memory_update", "args": {"id": mem_a["id"], "text": "A 记忆 基线实验 seed=99"}})
        view_a = web.project_view(a)
        view_b = web.project_view(b)
        self.assertEqual(view_a["description"], "课题背景A")
        self.assertTrue(view_a["autoReview"])
        self.assertEqual([m["content"] for m in view_a["memories"]], ["A 核心约束：对照组不可改阈值", "A 记忆 基线实验 seed=99"])
        self.assertTrue(view_a["memories"][0]["pinned"])
        self.assertEqual(view_a["memories"][0]["source"], "manual")
        searched_a = web.dispatch("project", {"workspace": rec_a, "action": "memory_search", "args": {"query": "seed=99"}})
        self.assertEqual([m["id"] for m in searched_a], [mem_a["id"]])
        self.assertEqual(view_a["memories"][0]["id"], mem_a2["id"])
        self.assertEqual(view_b["memories"], [])
        self.assertFalse(view_b["autoReview"])

        g1 = web.dispatch("project", {"workspace": rec_a, "action": "goal_create", "args": {"text": "G1"}})
        g2 = web.dispatch("project", {"workspace": rec_a, "action": "goal_create", "args": {"text": "G2", "dependsOn": [g1["id"]]}})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": rec_a, "action": "goal_update", "args": {"id": g1["id"], "dependsOn": [g2["id"]]}})
        web.dispatch("project", {"workspace": rec_a, "action": "entry_delete", "args": {"rail": "goals", "id": g1["id"]}})
        self.assertEqual([g["dependsOn"] for g in web.project_view(a)["rails"]["goals"]], [[]])
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "project", {
            "workspace": rec_b, "action": "memory_write", "args": {"text": "x", "projectId": a}})

    def test_all_project_and_private_plugins(self):
        a, b = self.projects
        shared = project_plugins.create("all", {"name": "All", "prompt": "Read the current project's sources"})
        private = project_plugins.create(a, {"name": "Private", "prompt": "Read A"})
        self.assertEqual(len(web.project_view(a)["plugins"]), 2)
        self.assertEqual([p["id"] for p in web.project_view(b)["plugins"]], [shared["id"]])
        self.assertRaises(workspace.WorkspaceError, project_plugins.rename, b, private["id"], "other")
        self.assertRaises(workspace.WorkspaceError, project_plugins.rename, a, shared["id"], "changed")
        self.assertEqual(project_plugins.rename("global", shared["id"], "All 2")["name"], "All 2")

    def test_project_delete_cleans_binding_and_blocks_global(self):
        a, b = self.projects
        project_plugins.create(a, {"name": "Private", "prompt": "Only A"})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "delete", {"workspace": self.records["global"]})
        self.assertEqual(web.dispatch("delete", {"workspace": self.records[a]}), {"ok": True})
        self.assertEqual([r["scope"] for r in web.catalog()], ["global", b])
        self.assertRaises(web.BindingError, web.dispatch, "project", {"workspace": self.records[a], "action": "view"})

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

    def test_loopback_assistant_name_and_host_origin_auth(self):
        opener = build_opener(ProxyHandler({}))
        with web.server() as server:
            thread = Thread(target=server.serve_forever, daemon=True)
            thread.start()
            url = f"http://127.0.0.1:{server.server_port}/name"
            try:
                def post(payload, headers):
                    req = Request(url, data=json.dumps(payload).encode(), method="POST", headers=headers)
                    with opener.open(req, timeout=5) as resp:
                        return json.load(resp)

                auth = {"Content-Type": "application/json", "Authorization": "Bearer " + server.token}
                self.assertEqual(post({}, auth), {"name": "Weave"})
                self.assertEqual(post({"name": "新助手"}, auth), {"name": "新助手"})
                self.assertEqual(post({}, auth), {"name": "新助手"})
                for bad_headers in (
                    {"Content-Type": "application/json"},
                    {**auth, "Origin": "https://example.invalid"},
                ):
                    with self.assertRaises(HTTPError) as raised:
                        post({"name": "blocked"}, bad_headers)
                    self.assertEqual(raised.exception.code, 403)
            finally:
                server.shutdown()
                thread.join(timeout=5)

    def test_assistant_profile_avatar_soul_and_global_memories(self):
        initial = web.dispatch("assistant-profile", {})
        self.assertEqual(initial["name"], "Weave")
        self.assertFalse(initial["hasCustomAvatar"])
        self.assertEqual(initial["stats"]["projectCount"], 2)
        self.assertEqual(initial["memories"], [])

        png_bytes = b"\x89PNG\r\n\x1a\n" + b"\x00" * 16
        png_url = "data:image/png;base64," + base64.b64encode(png_bytes).decode("ascii")
        updated = web.dispatch("assistant-profile", {
            "name": "Yukino",
            "tagline": "理性与直觉并行",
            "persona": "缜密、克制而有深度",
            "soul": "1. 严格以证据为准。",
            "avatar": png_url,
        })
        self.assertEqual(updated["name"], "Yukino")
        self.assertEqual(updated["tagline"], "理性与直觉并行")
        self.assertEqual(updated["persona"], "缜密、克制而有深度")
        self.assertEqual(updated["soul"], "1. 严格以证据为准。")
        self.assertTrue(updated["hasCustomAvatar"])
        self.assertEqual(updated["avatar"], png_url)
        global_cat = next(r for r in web.catalog() if r["scope"] == "global")
        self.assertEqual(global_cat["name"], "Yukino")
        self.assertEqual(global_cat["avatar"], png_url)

        for bad_avatar in (
            "data:image/svg+xml;base64," + base64.b64encode(b"<svg/>").decode("ascii"),
            "data:image/png;base64," + base64.b64encode(b"not-a-png").decode("ascii"),
            "https://example.com/avatar.png",
        ):
            self.assertRaises(workspace.WorkspaceError, web.dispatch, "assistant-profile", {"avatar": bad_avatar})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "assistant-profile", {"unknownField": "x"})

        added = web.dispatch("assistant-profile", {"action": "memory_add", "content": "全局偏好：中文回复", "category": "preference"})
        self.assertEqual(len(added["memories"]), 1)
        mem_id = added["memories"][0]["id"]
        self.assertEqual(web.project_view(self.projects[0])["memories"], [])

        second = web.dispatch("assistant-profile", {"action": "memory_add", "content": "第二条长期偏好：实验优先固定随机种子", "category": "research"})
        self.assertEqual(len(second["memories"]), 2)
        pinned_prof = web.dispatch("assistant-profile", {"action": "memory_pin", "id": mem_id, "pinned": True})
        self.assertEqual(pinned_prof["memories"][0]["id"], mem_id)
        self.assertTrue(pinned_prof["memories"][0]["pinned"])

        edited = web.dispatch("assistant-profile", {"action": "memory_update", "id": mem_id, "content": "全局偏好：双语对照"})
        self.assertEqual(edited["memories"][0]["content"], "全局偏好：双语对照")
        g_hits = web.dispatch("assistant-profile", {"action": "memory_search", "query": "双语"})
        self.assertEqual([h["id"] for h in g_hits["results"]], [mem_id])

        web.dispatch("assistant-profile", {"action": "memory_delete", "id": second["memories"][0]["id"]})
        deleted = web.dispatch("assistant-profile", {"action": "memory_delete", "id": mem_id})
        self.assertEqual(deleted["memories"], [])

        reset = web.dispatch("assistant-profile", {"avatar": "", "action": "reset_soul"})
        self.assertEqual(reset["soul"], web.assistant_profile.DEFAULT_SOUL)
        cleared = web.dispatch("assistant-profile", {"avatar": ""})
        self.assertFalse(cleared["hasCustomAvatar"])


if __name__ == "__main__":
    unittest.main()
