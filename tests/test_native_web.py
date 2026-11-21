"""Regression coverage for native application boundaries and offline recovery."""
import base64
from contextlib import closing
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
        self.root = Path(self.tmp.name).resolve()
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

    def test_composer_references_resolve_only_within_the_project(self):
        alpha, beta = self.projects
        paper = web.projects.create_entry(alpha, "library", {"title": "相识别文献", "text": "本项目的核验依据"})
        web.projects.remember(alpha, "所有结论附原始出处", category="rule", pinned=True)
        rows = web.project_action(alpha, {"action": "composer/references", "args": {"kind": "library", "query": "相识别"}})
        self.assertEqual([row["id"] for row in rows], [paper["id"]])
        reference = {"action": "composer/reference", "args": {"kind": "library", "id": paper["id"]}}
        self.assertIn("核验依据", web.project_action(alpha, reference)["text"])
        with self.assertRaises(workspace.WorkspaceError):
            web.project_action(beta, reference)
        rules = web.project_action(alpha, {"action": "composer/references", "args": {"kind": "rule", "query": "出处"}})
        self.assertEqual([item["name"] for item in rules], ["所有结论附原始出处"])

    def test_create_project_saves_initial_read_only_sources_as_one_operation(self):
        first, second = self.root / "文献", self.root / "笔记"
        first.mkdir()
        second.mkdir()
        (first / "abstract.txt").write_text("可读的项目来源", encoding="utf-8")
        payload = {"name": "带来源的项目", "requestId": "9" * 32}
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("create", {**payload, "sourcePaths": [str(first), str(self.root / "不存在")]})
        self.assertNotIn(payload["name"], [row["name"] for row in web.catalog()])

        request = {**payload, "sourcePaths": [str(first), str(second), str(first)]}
        created = web.dispatch("create", request)
        self.assertEqual(web.dispatch("create", request), created)
        scope = created["scope"]
        row = next(row for row in web.catalog() if row["scope"] == scope)
        record = {"id": "ws-" + scope, "path": row["path"]}
        web.dispatch("bind", {"scope": scope, "workspace": record})
        settings = web.dispatch("project", {"workspace": record, "action": "settings/view"})
        self.assertEqual([source["name"] for source in settings["sources"]], ["文献", "笔记"])
        read = web.dispatch("project", {"workspace": record, "action": "sources/read",
                                        "args": {"sourceId": settings["sources"][0]["id"], "path": "abstract.txt"}})
        self.assertEqual(read["text"], "可读的项目来源")
        self.assertEqual((first / "abstract.txt").read_text(encoding="utf-8"), "可读的项目来源")

    def test_confirmed_deletion_prunes_only_queued_dsh_sessions_offline(self):
        from unittest.mock import patch
        import session_cleanup

        a, b = self.projects
        home = self.root / "web"
        old_home = self.root / "other-web"
        deleted, kept, other_profile = "session-deleted", "session-kept", "session-other"
        for profile, identity in ((home, deleted), (home, kept), (old_home, other_profile)):
            folder = profile / "sessions" / "workspace" / identity
            folder.mkdir(parents=True)
            for name in ("session.v3.jsonl", "session.v4.jsonl.zstd"):
                (folder / name).write_bytes(b"fixture")
        cache = home / "storages" / "session_projcache" / "sessions"
        cache.mkdir(parents=True)
        for identity in (deleted, kept):
            (cache / f"{identity}.json").write_text("{}", encoding="utf-8")
        registry = home / "storages" / "workspace.json"
        registry.write_text(json.dumps({"global": {"archivedSessionIds": [deleted, kept], "pinnedSessionIds": [deleted]},
                                        "tables": {"workspaces": {"other": {"sessionIds": [deleted, kept]}}}}), encoding="utf-8")

        with patch.dict("os.environ", {"LABWEAVE_DSH_WEB_HOME": str(home)}):
            web.dispatch("delete", {"workspace": self.records[a], "sessionIds": [deleted]})
        with patch.dict("os.environ", {"LABWEAVE_DSH_WEB_HOME": str(old_home)}):
            web.dispatch("delete-session", {"workspace": self.records[b], "sessionIds": [other_profile]})
        self.assertTrue((home / "sessions" / "workspace" / deleted / "session.v4.jsonl.zstd").is_file())
        session_cleanup.purge_offline(home)
        session_cleanup.purge_offline(home)
        self.assertFalse((home / "sessions" / "workspace" / deleted).exists())
        self.assertFalse((cache / f"{deleted}.json").exists())
        self.assertTrue((cache / f"{kept}.json").exists())
        left = json.loads(registry.read_text(encoding="utf-8"))
        self.assertEqual(left["global"]["archivedSessionIds"], [kept])
        self.assertEqual(left["tables"]["workspaces"]["other"]["sessionIds"], [kept])
        self.assertTrue((home / "sessions" / "workspace" / kept / "session.v4.jsonl.zstd").is_file())
        self.assertTrue((old_home / "sessions" / "workspace" / other_profile / "session.v4.jsonl.zstd").is_file())
        self.assertTrue(any(row["scope"] == b for row in web.catalog()))

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
            "args": {"label": "实验监视器", "paradigm": "engineering", "layout": "matrix", "requestId": "b"*32},
        })
        bot_id = created_bot["feature"]["id"]
        self.assertEqual((created_bot["feature"]["paradigm"], created_bot["feature"]["layout"]), ("engineering", "matrix"))
        for invalid in ({}, {"paradigm": "extra"}, {"paradigm": "engineering", "layout": "timeline"}):
            with self.assertRaises(workspace.WorkspaceError):
                web.dispatch("project", {"workspace": record, "action": "create_feature_bot",
                             "args": {"label": "无效范式", "requestId": "c"*32, **invalid}})
        updated_bot = web.dispatch("project", {
            "workspace": record,
            "action": "feature_update",
            "args": {"featureId": bot_id, "label": "实验追踪", "hint": "实时查看曲线", "symbol": "λ", "keywords": ["曲线", "loss"]},
        })
        self.assertEqual(updated_bot["feature"]["label"], "实验追踪")
        self.assertEqual(updated_bot["feature"]["hint"], "实时查看曲线")
        self.assertEqual(updated_bot["feature"]["symbol"], "λ")
        self.assertEqual(updated_bot["feature"]["keywords"], ["曲线", "loss"])
        self.assertEqual(updated_bot["feature"]["layout"], "matrix")
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

    def test_project_context_and_search_share_updated_rules_and_results(self):
        a, b = self.projects

        def tool(scope, name, **args):
            return json.loads(web.dispatch("tool", {
                "workspace": self.records[scope], "tool": name, "args": args,
            })["text"])

        rule = tool(a, "memory_write", text="All baseline runs use seed 42", category="rule", pinned=True)
        self.assertEqual(tool(a, "project_get_context")["coreMemories"][0]["id"], rule["id"])
        result = tool(a, "memory_write", text="Verified replay run produced metric 0.76", category="task_result")
        self.assertEqual(tool(a, "memory_search", query="0.76")[0]["id"], result["id"])
        tool(a, "memory_update", id=rule["id"], text="All baseline runs use seed 99")
        self.assertEqual(tool(a, "memory_search", category="rule")[0]["content"], "All baseline runs use seed 99")
        self.assertEqual(tool(a, "project_get_context")["coreMemories"][0]["content"], "All baseline runs use seed 99")
        self.assertEqual(tool(b, "project_get_context")["coreMemories"], [])
        self.assertEqual(tool(b, "memory_search", query="0.76"), [])
        with self.assertRaises(workspace.WorkspaceError):
            tool(b, "memory_search", projectId=a)
        with self.assertRaises(workspace.WorkspaceError):
            tool("global", "memory_search", query="0.76")
        self.assertEqual(tool("global", "memory_search", projectId=a, query="0.76")[0]["id"], result["id"])

    def test_project_paradigm_is_reusable_scoped_and_validates_entries(self):
        a, b = self.projects

        def action(scope, name, **args):
            return web.dispatch("project", {"workspace": self.records[scope], "action": name, "args": args})

        specification = {"label": "数据集追踪", "description": "按时间追踪数据集版本与授权变化",
                         "base": "notes", "layout": "timeline", "elements": ["版本", "授权"]}
        extension = action(a, "create_project_paradigm", **specification)
        self.assertEqual(action(a, "create_project_paradigm", **specification), extension)
        self.assertEqual(action(a, "project_paradigms"), [extension])
        self.assertEqual(action(b, "project_paradigms"), [])
        with self.assertRaises(workspace.WorkspaceError):
            action(b, "create_feature_bot", label="跨项目", paradigm=extension["id"], requestId="d"*32)
        bot = action(a, "create_feature_bot", label="版本变更", paradigm=extension["id"], requestId="e"*32)["feature"]
        self.assertEqual((bot["extension"], bot["layout"]), (extension, "timeline"))
        entry = action(a, "feature_push", featureId=bot["id"], text="新增记录", elements={"版本": "v2"})
        self.assertEqual(entry["elements"], {"版本": "v2"})
        updated = action(a, "feature_push", featureId=bot["id"], id=entry["id"], elements={"授权": "待核对"})
        self.assertEqual(updated["elements"], {"版本": "v2", "授权": "待核对"})
        with self.assertRaises(workspace.WorkspaceError):
            action(a, "feature_push", featureId=bot["id"], text="未定义", elements={"错误字段": "x"})

    def test_typed_paradigm_fields_validate_values_and_record_scope(self):
        a, _ = self.projects

        def action(name, **args):
            return web.dispatch("project", {"workspace": self.records[a], "action": name, "args": args})

        fields = [
            {"name": "版本", "type": "text", "role": "title"},
            {"name": "发布日期", "type": "date", "role": "date"},
            {"name": "样本数", "type": "number", "role": "detail"},
            {"name": "已归档", "type": "boolean", "role": "status"},
            {"name": "原件", "type": "url", "role": "source"},
            {"name": "上一版本", "type": "reference", "role": "relation"},
        ]
        spec = {"label": "版本追踪", "description": "追踪版本变化", "base": "notes", "layout": "timeline"}
        with self.assertRaises(workspace.WorkspaceError):
            action("create_project_paradigm", **spec, fields=[{"name": "日期", "type": "text", "role": "date"}])
        extension = action("create_project_paradigm", **spec, fields=fields)
        self.assertEqual(extension["fields"], fields)
        bot = action("create_feature_bot", label="追踪", paradigm=extension["id"], requestId="a2"*16)["feature"]
        other = action("create_feature_bot", label="隔离", paradigm=extension["id"], requestId="a3"*16)["feature"]
        initial = action("feature_push", featureId=bot["id"], elements={"版本": "v1"})
        data = {"版本": "v2", "发布日期": "2026-11-19", "样本数": 0, "已归档": False,
                "原件": "https://example.org/dataset", "上一版本": initial["id"]}
        latest = action("feature_push", featureId=bot["id"], elements=data)
        self.assertEqual(latest["elements"], data)
        for patch in ({"发布日期": "2026-02-30"}, {"样本数": "12"}, {"已归档": 1}, {"原件": "javascript:alert(1)"}):
            with self.assertRaises(workspace.WorkspaceError):
                action("feature_push", featureId=bot["id"], id=latest["id"], elements=patch)
        with self.assertRaises(workspace.WorkspaceError):
            action("feature_push", featureId=other["id"], elements=data)
        updated = action("feature_push", featureId=bot["id"], id=latest["id"], elements={"发布日期": None})
        self.assertNotIn("发布日期", updated["elements"])
        self.assertIs(updated["elements"]["已归档"], False)
        action("feature_push", featureId=bot["id"], id=latest["id"], parentId=initial["id"])
        with self.assertRaises(workspace.WorkspaceError):
            action("feature_push", featureId=bot["id"], id=initial["id"], parentId=latest["id"])
        action("entry_delete", rail=bot["id"], id=initial["id"])
        [remaining] = action("view")["rails"][bot["id"]]
        self.assertNotIn("上一版本", remaining["elements"])
        self.assertNotIn("parentId", remaining)

    def test_bot_flow_replays_project_updates_and_gates_dependencies(self):
        a, b = self.projects
        bot = features.create_feature(a, "原文核对", paradigm="notes")["feature"]["id"]
        first, next_task = ("weave-bot-run-" + mark * 32 for mark in ("a", "b"))

        def call(route, **data):
            return web.dispatch(route, {"workspace": self.records[a], **data})

        def start(identity, dependencies=(), version=0):
            return call("bot-dispatch-start", parentSessionId="project-chat", jobs=[{
                "id": identity, "featureId": bot, "task": "核验", "requestId": "message-1",
                "dependsOn": list(dependencies), "policyVersion": version,
            }])

        entry = {"action": "input", "sessionId": "project-chat", "messageId": "message-1", "text": "核验原文"}
        call("project-flow", **entry)
        call("project-flow", **entry)
        snapshot = call("project-flow", action="read")
        self.assertEqual(len(snapshot["events"]), 1)
        self.assertEqual(web.dispatch("project-flow", {"workspace": self.records[b], "action": "read"})["events"], [])
        start(first)
        with self.assertRaises(workspace.WorkspaceError):
            start(next_task, [first])
        call("bot-dispatch-update", id=first, status="completed", result={"answer": "已核实", "policyVersion": 0})
        start(next_task, [first])
        updates = call("project-flow", action="read", after=snapshot["cursor"])
        self.assertEqual([event["status"] for event in updates["events"]], ["queued", "completed", "queued"])
        call("project-flow", action="decision", sessionId="project-chat", messageId="rule-2", text="更换验收条件")
        stale = call("bot-dispatch-update", id=next_task, status="completed", result={"answer": "旧版", "policyVersion": 0})
        self.assertEqual(stale["status"], "needs_follow_up")
        with self.assertRaises(workspace.WorkspaceError):
            start("weave-bot-run-" + "c" * 32, [first], call("project-flow", action="read")["version"])
        version = call("project-flow", action="read")["version"]
        call("project-flow", action="retract", sessionId="project-chat",
             messageId="rewind-1", messageIds=["message-1"])
        events = call("project-flow", action="read")["events"]
        self.assertEqual(events[-1]["messageIds"], ["message-1"])
        self.assertFalse(any(event["kind"] == "input" for event in events))
        with self.assertRaises(workspace.WorkspaceError):
            start("weave-bot-run-" + "d" * 32, version=version)

    def test_research_artifact_changes_reach_other_paradigms_and_stale_dependencies_wait(self):
        import research_records
        a, b = self.projects
        notes = features.create_feature(a, "依据", paradigm="notes")["feature"]["id"]
        mindmap = features.create_feature(a, "关系", paradigm="mindmap")["feature"]["id"]
        first, downstream = ("weave-bot-run-" + mark * 32 for mark in ("a", "b"))

        def call(route, **args):
            return web.dispatch(route, {"workspace": self.records[a], **args})

        def start(task, bot, depends=()):
            return call("bot-dispatch-start", parentSessionId="project-chat", jobs=[{
                "id": task, "featureId": bot, "task": "核对资料", "requestId": "research-request",
                "dependsOn": list(depends), "policyVersion": 0,
            }])

        start(first, notes)
        record = web.projects.create_entry(a, notes, {"title": "资料初审", "text": "证据摘要"})
        call("bot-dispatch-update", id=first, status="completed", result={"recordId": record["id"], "policyVersion": 0})
        start(downstream, mindmap, [first])
        web.projects.update_entry(a, notes, {"id": record["id"], "text": "更正后的证据"})
        run = research_records.save(a, "experiment", {"name": "离线基线", "status": "completed",
                                     "metrics": {"accuracy": [0.75, 0.81]}, "logs": "PRIVATE_LOG"})
        audience = {"sessionId": "mindmap-chat", "botId": mindmap, "includeArtifacts": True, "dependencyTaskIds": [first]}
        changes = call("project-flow", action="read", audience=audience)
        self.assertEqual(changes["changedDependencies"], [first])
        last = next(event for event in changes["events"] if event.get("recordId") == run["id"])
        self.assertEqual(last["metrics"], {"accuracy": 0.81})
        self.assertNotIn("PRIVATE_LOG", json.dumps(changes))
        self.assertEqual(changes["version"], 0)
        with self.assertRaises(workspace.WorkspaceError):
            web.projects.create_entry(a, mindmap, {"text": "使用已失效的前置成果",
                                                   "policyVersion": 0, "workflowDependencies": [first]})
        self.assertEqual(call("bot-dispatch-update", id=downstream, status="completed", result={})["status"], "needs_follow_up")
        with self.assertRaises(workspace.WorkspaceError):
            start("weave-bot-run-" + "c" * 32, mindmap, [first])
        self.assertEqual(web.dispatch("project-flow", {"workspace": self.records[b], "action": "read",
                                                     "audience": audience})["events"], [])

    def test_bot_dispatches_update_with_grouping_and_keep_archived_delivery(self):
        import bot_dispatches

        a, b = self.projects
        member = features.create_feature(a, "文献核对", temporary=True)["feature"]["id"]
        target = features.create_feature(a, "论文组")["feature"]["id"]
        identity, stalled = "weave-bot-run-" + "a" * 32, "weave-bot-run-" + "b" * 32

        def dispatch(route, **args):
            return web.dispatch(route, {"workspace": self.records[a], **args})

        def action(name, **args):
            return dispatch("project", action=name, args=args)

        dispatch("bot-dispatch-start", parentSessionId="main-chat", jobs=[
            {"id": identity, "featureId": member, "task": "核对设置"}, {"id": stalled, "featureId": target, "task": "整理资料"},
        ])
        self.assertEqual(action("bot_dispatches", summary=True)["activeCount"], 2)
        dispatch("bot-dispatch-update", id=identity, status="running")
        dispatch("bot-dispatch-draft", id=identity, args={"key": "source", "title": "待核验", "text": "初稿"})
        dispatch("bot-dispatch-draft", id=identity, args={"key": "source", "title": "正在整理", "text": "修订"})
        canvas = action("bot_canvas", featureId=member)
        self.assertEqual(canvas["active"], 1)
        self.assertEqual([draft["text"] for draft in canvas["drafts"]], ["修订"])
        self.assertEqual([(message["id"], message["text"]) for message in canvas["messages"]
                          if not message.get("taskOverview")],
                         [(draft["id"], draft["text"]) for draft in canvas["drafts"]])
        self.assertNotIn("修订", [message["text"] for message in action("bot_canvas", featureId=target)["messages"]])
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("bot-dispatch-draft", {"workspace": self.records[b], "id": identity,
                         "args": {"key": "source", "title": "跨项目", "text": "错误"}})
        self.assertEqual(action("bot_dispatch_detail", id=identity)["status"], "running")
        entry = action("feature_push", featureId=member, text="已核对第 4 页")
        dispatch("bot-dispatch-update", id=identity, status="completed",
                 result={"title": "来源核对", "answer": "已核对第 4 页", "recordId": entry["id"]})
        self.assertFalse(action("bot_canvas", featureId=member)["drafts"])
        with self.assertRaises(workspace.WorkspaceError):
            dispatch("bot-dispatch-draft", id=identity, args={"key": "source", "title": "重试", "text": "已结束"})
        dispatch("bot-dispatch-update", id=identity, status="running")
        dispatch("bot-complete", featureId=member, recordId=entry["id"])
        history = [message for message in action("bot_canvas", featureId=member)["messages"]
                   if not message.get("taskOverview")]
        self.assertEqual([message["text"] for message in history], ["修订", "已核对第 4 页"])
        self.assertEqual(history[-1]["recordId"], entry["id"])
        task = action("bot_dispatch_detail", id=identity)
        self.assertEqual((task["status"], task["botState"], task["answer"]), ("completed", "archived", "已核对第 4 页"))
        action("bot_restore", featureId=member)
        action("bot_cluster", targetId=target, memberIds=[member])
        updated = action("bot_dispatch_detail", id=identity)
        self.assertEqual((updated["botLabel"], updated["clusterLabel"], updated["parentSessionId"]),
                         ("文献核对", "论文组", "main-chat"))
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {"workspace": self.records[b], "action": "bot_dispatch_detail", "args": {"id": identity}})
        bot_dispatches.recover()
        self.assertEqual(action("bot_dispatches", summary=True)["activeCount"], 0)
        self.assertEqual(action("bot_dispatch_detail", id=stalled)["status"], "interrupted")

    def test_bot_canvas_keeps_partial_results_out_of_confirmed_records(self):
        a, _ = self.projects
        bot = features.create_feature(a, "阶段文献", paradigm="notes")["feature"]["id"]
        identity = "weave-bot-run-" + "c" * 32

        def dispatch(route, **args):
            return web.dispatch(route, {"workspace": self.records[a], **args})

        dispatch("bot-dispatch-start", parentSessionId="main-chat",
                 jobs=[{"id": identity, "featureId": bot, "task": "核对两篇来源"}])
        dispatch("bot-dispatch-draft", id=identity, args={"key": "first", "title": "第一篇", "text": "先整理第一篇"})
        dispatch("bot-dispatch-update", id=identity, status="needs_follow_up",
                 result={"title": "阶段回报", "answer": "缺第二篇原件"})
        canvas = dispatch("project", action="bot_canvas", args={"featureId": bot})
        self.assertEqual(canvas["active"], 0)
        self.assertEqual([card["title"] for card in canvas["drafts"]], ["阶段回报", "第一篇"])
        view = dispatch("project", action="view", args={})
        self.assertEqual(view["rails"].get(bot), [])

    def test_worker_experiment_reads_latest_metrics_in_cluster_overview(self):
        project, _ = self.projects
        record = self.records[project]
        root, member = [features.create_feature(project, name, paradigm="engineering")["feature"]["id"]
                        for name in ("运行总览", "训练")]
        features.cluster_bots(project, root, [member])
        run = "weave-bot-run-" + "d" * 32
        web.dispatch("bot-dispatch-start", {"workspace": record, "parentSessionId": "parent", "jobs": [
            {"id": run, "featureId": member, "task": "训练"},
        ]})
        data = {"workspace": record, "tool": "experiment_record", "featureId": member, "sessionId": run,
                "args": {"name": "训练一", "status": "running", "taskId": run,
                         "parameters": {"artifacts": ["outputs/metrics.csv"]}}}
        web.dispatch("tool", data)
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("tool", {**data, "featureId": root})
        output = workspace.DATA / "projects" / project / "outputs"
        output.mkdir(exist_ok=True)
        metrics = output / "metrics.csv"
        metrics.write_text("step,loss\n" + "".join(f"{i},{i}\n" for i in range(1200)), encoding="utf-8")

        def latest():
            return web.dispatch("project", {"workspace": record, "action": "bot/experiments",
                                            "args": {"featureId": root}})[0]

        self.assertEqual(latest()["botLabel"], "训练")
        self.assertEqual(latest()["visualizations"][0]["points"][-1], {"x": 1199, "y": 1199})
        with metrics.open("a", encoding="utf-8") as stream:
            stream.write("1200,0.5\n")
        self.assertEqual(latest()["visualizations"][0]["points"][-1], {"x": 1200, "y": 0.5})

    def test_canvas_links_can_cross_cluster_members_only(self):
        project, _ = self.projects
        record = self.records[project]

        def action(name, **args):
            return web.dispatch("project", {"workspace": record, "action": name, "args": args})

        root, member, other = [features.create_feature(project, label, paradigm="mindmap")["feature"]["id"]
                               for label in ("聚类入口", "成员", "其他 Bot")]
        a, b, c = [action("feature_push", featureId=bot, text=label)["id"]
                   for bot, label in zip((root, member, other), ("前置", "下游", "范围外"), strict=True)]
        with self.assertRaises(workspace.WorkspaceError):
            action("feature_push", featureId=member, id=b, parentId=a)
        action("bot_cluster", targetId=root, memberIds=[member])
        downstream = action("feature_push", featureId=member, id=b, parentId=a, dependsOn=[a], relatedIds=[a])
        self.assertEqual((downstream["parentId"], downstream["dependsOn"], downstream["relatedIds"]), (a, [a], [a]))
        with self.assertRaises(workspace.WorkspaceError):
            action("feature_push", featureId=root, id=a, dependsOn=[b])
        with self.assertRaises(workspace.WorkspaceError):
            action("feature_push", featureId=member, id=b, relatedIds=[c])
        action("entry_delete", rail=root, id=a)
        child = next(entry for entry in action("view")["rails"][member] if entry["id"] == b)
        self.assertNotIn("parentId", child)
        self.assertEqual(child["dependsOn"], [])
        self.assertEqual(child["relatedIds"], [])

    def test_bot_cluster_and_retirement_keep_original_records(self):
        a, b = self.projects
        rec = self.records[a]

        def action(name, **args):
            return web.dispatch("project", {"workspace": rec, "action": name, "args": args})

        def create(label, paradigm="notes"):
            return action("create_feature_bot", label=label, paradigm=paradigm,
                          requestId=label.encode().hex().ljust(32, "0"))["feature"]["id"]

        target, member, other = create("root"), create("child"), create("other", "ideas")
        foreign = features.create_feature(b, "外项目", paradigm="notes")["feature"]["id"]
        for invalid in (other, foreign, target):
            with self.assertRaises(workspace.WorkspaceError):
                action("bot_cluster", targetId=target, memberIds=[member, invalid])
        entry = action("feature_push", featureId=member, text="原始资料")
        action("bot_cluster", targetId=target, memberIds=[member])
        group = json.loads(web.dispatch("tool", {"workspace": rec, "tool": "feature_entries",
                                                "args": {"featureId": target}})["text"])
        self.assertEqual(group["members"][0]["entries"][0]["id"], entry["id"])
        self.assertEqual(next(f for f in action("view")["features"] if f["id"] == member)["clusterParent"], target)

        temporary = features.create_feature(a, "一次性核对", temporary=True)["feature"]["id"]
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("bot-complete", {"workspace": rec, "featureId": temporary, "recordId": entry["id"]})
        for fid, expected in ((target, False), (temporary, True)):
            delivery = action("feature_push", featureId=fid, text="交付结果")
            done = web.dispatch("bot-complete", {"workspace": rec, "featureId": fid, "recordId": delivery["id"]})
            self.assertEqual(done["archived"], expected)
            self.assertEqual(action("view")["rails"][fid][-1]["id"], delivery["id"])
        active = json.loads(web.dispatch("tool", {"workspace": rec, "tool": "feature_list", "args": {}})["text"])
        self.assertNotIn(temporary, [feature["id"] for feature in active])
        action("bot_restore", featureId=temporary)
        self.assertFalse(next(f for f in action("view")["features"] if f["id"] == temporary)["archived"])

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
        root = Path(self.records[a]["path"])
        other = Path(self.records[b]["path"])
        original = self.root / "source.csv"
        original.write_bytes(b"source")
        imported = web.projects.upload({"projectId": a, "name": "imported.csv", "data": "aW1wb3J0ZWQ="})
        imported_path = web.projects.resource_path(a, imported["id"])
        repository_file = root / "repositories" / "demo" / "README"
        repository_file.parent.mkdir(parents=True)
        repository_file.write_bytes(b"repository")
        for relative in ("outputs/report.docx", "experiments/sandbox/run/output/plot.png",
                         "experiments/workflows/run/metrics.json"):
            generated = root / relative
            generated.parent.mkdir(parents=True)
            generated.write_bytes(b"generated")
        (other / "outputs").mkdir()
        (other / "outputs/report.docx").write_bytes(b"other project")
        project_plugins.create(a, {"name": "Private", "prompt": "Only A"})
        self.assertRaises(workspace.WorkspaceError, web.dispatch, "delete", {"workspace": self.records["global"]})
        self.assertEqual(web.dispatch("delete", {"workspace": self.records[a]}), {"ok": True})
        self.assertFalse((root / "outputs").exists())
        self.assertFalse((root / "experiments/sandbox").exists())
        self.assertFalse((root / "experiments/workflows").exists())
        self.assertEqual(imported_path.read_bytes(), b"imported")
        self.assertEqual(repository_file.read_bytes(), b"repository")
        self.assertEqual(original.read_bytes(), b"source")
        self.assertEqual((other / "outputs/report.docx").read_bytes(), b"other project")
        self.assertEqual([r["scope"] for r in web.catalog()], ["global", b])
        self.assertRaises(web.BindingError, web.dispatch, "project", {"workspace": self.records[a], "action": "view"})

    def test_engineering_bot_runs_are_scoped_without_trial_or_budget_routes(self):
        a, b = self.projects
        engineer = features.create_feature(a, "执行工程台", paradigm="engineering")["feature"]["id"]
        another = features.create_feature(a, "第二工程台", paradigm="engineering")["feature"]["id"]
        record = self.records[a]
        with self.assertRaises(workspace.WorkspaceError) as old_trial:
            web.dispatch("sandbox-tool", {"workspace": record, "operation": "run", "args": {}})
        self.assertEqual(old_trial.exception.status, 404)
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {"workspace": record, "action": "sandbox/configure", "args": {"grantSeconds": 10}})

        def tool(feature, **args):
            value = web.dispatch("tool", {"workspace": record, "tool": "experiment_record",
                                 "featureId": feature, "sessionId": "experiment-session", "args": args})
            return json.loads(value["text"])

        run = tool(engineer, name="训练", status="running", parameters={"environment": "cpu", "script": "run.py"})
        tool(engineer, id=run["id"], status="completed", logs="退出码 0", metrics={"score": 0.9})
        with self.assertRaises(workspace.WorkspaceError):
            tool(another, id=run["id"], status="failed")
        args = {"action": "bot/experiment", "args": {"featureId": engineer, "id": run["id"]}}
        result = web.dispatch("project", {"workspace": record, **args})
        self.assertEqual((result["status"], result["parameters"]["environment"], result["stdout"]),
                         ("completed", "cpu", "退出码 0"))
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {"workspace": self.records[b], **args})

    def test_project_file_storage_lists_generated_files_by_project(self):
        a, b = self.projects
        generated = {
            "outputs/report.docx": b"\x00\xff",
            "outputs/nested/report.docx": b"",
            "experiments/sandbox/run/output/figure.svg": b"<svg/>",
            "outputs/notes.txt": "实验原文".encode(),
        }
        for relative, contents in generated.items():
            path = Path(self.records[a]["path"]) / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(contents)
        other_path = Path(self.records[b]["path"]) / "outputs/report.docx"
        other_path.parent.mkdir()
        other_path.write_bytes(b"other")
        records = web.dispatch("project", {"workspace": self.records[a], "action": "files/list"})
        self.assertEqual(set(entry["path"] for entry in records), set(generated))
        for entry in records:
            request = {"action": "files/download", "args": {"id": entry["id"]}}
            value = web.dispatch("project", {"workspace": self.records[a], **request})
            self.assertEqual(value["name"], Path(entry["path"]).name)
            self.assertEqual(base64.b64decode(value["data"]), generated[entry["path"]])
            with self.assertRaises(workspace.WorkspaceError) as error:
                web.dispatch("project", {"workspace": self.records[b], **request})
            self.assertEqual(error.exception.status, 404)
        notes = next(entry for entry in records if entry["name"] == "notes.txt")
        request = {"action": "files/reference", "args": {"id": notes["id"]}}
        excerpt = web.dispatch("project", {"workspace": self.records[a], **request})
        self.assertEqual(excerpt["text"], "实验原文")
        with self.assertRaises(workspace.WorkspaceError) as error:
            web.dispatch("project", {"workspace": self.records[b], **request})
        self.assertEqual(error.exception.status, 404)

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
