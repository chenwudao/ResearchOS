"""Tests for dynamic Feature Bots, scoped add/delete/rename, push storage, and bot session bindings."""

import base64
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo" / "api"))
import features
import native_web as web
import research_mcp
import workspace


class FeatureBotsTests(unittest.TestCase):
    def setUp(self):
        self.tmp = TemporaryDirectory(prefix="labweave-feature-bots-")
        self.root = Path(self.tmp.name)
        self.old = workspace.DATA
        workspace.DATA = self.root / "data"
        self.projects = [
            web.dispatch("create", {"name": n, "requestId": k * 32})["scope"]
            for n, k in (("Alpha", "a"), ("Beta", "b"))
        ]
        self.records = {}
        for item in web.catalog():
            record = {"id": "ws-" + item["scope"], "path": item["path"]}
            self.records[item["scope"]] = record
            web.dispatch("bind", {"scope": item["scope"], "workspace": record})

    def tearDown(self):
        workspace.DATA = self.old
        self.tmp.cleanup()

    @staticmethod
    def mcp(scope, name, arguments):
        result = research_mcp.dispatch(
            {"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {"name": name, "arguments": arguments}},
            scope,
        )["result"]
        if result.get("isError"):
            return result
        return json.loads(result["content"][0]["text"])

    def test_calendar_uses_separate_scoped_planning_dates(self):
        a, b = self.projects
        for scope in (a, b):
            features.enable_builtin(scope, "goals")
        calendar = features.create_feature(a, "排期", paradigm="goals")["feature"]
        self.assertEqual(calendar["layout"], "calendar")
        self.assertEqual(next(f["layout"] for f in web.project_view(a)["features"] if f["id"] == "goals"), "checklist")
        goal = self.mcp(a, "goal_create", {
            "text": "核对结果", "plannedDate": "2026-11-21", "due": "2026-11-26",
        })
        args = {"id": goal["id"], "plannedDate": "2026-11-22"}
        self.assertTrue(self.mcp(b, "goal_update", args)["isError"])
        moved = self.mcp(a, "goal_update", args)
        self.assertEqual((moved["plannedDate"], moved["due"]), ("2026-11-22", "2026-11-26"))
        self.assertTrue(self.mcp(a, "goal_update", {**args, "plannedDate": "2026-02-30"})["isError"])
        unscheduled = self.mcp(a, "goal_update", {**args, "plannedDate": None})
        self.assertNotIn("plannedDate", unscheduled)
        self.assertEqual(unscheduled["due"], "2026-11-26")

    def test_assistant_calendar_entries_require_a_user_decision(self):
        a, b = self.projects
        bot_id = features.create_feature(a, "安排", paradigm="goals")["feature"]["id"]
        actor = self.records[a]
        command = {"featureId": bot_id, "text": "确认评测条件", "plannedDate": "2026-11-21"}
        draft = self.mcp(a, "feature_push", command)
        self.assertTrue(draft["planningDraft"])
        self.assertEqual(draft["source"], "AI 建议")
        target = {"featureId": bot_id, "id": draft["id"]}
        self.assertTrue(self.mcp(a, "feature_push", {**target, "done": True})["isError"])
        self.assertTrue(self.mcp(a, "goal_draft_decision", {**target, "accept": True})["isError"])
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {"workspace": self.records[b], "action": "goal_draft_decision",
                                     "args": {**target, "accept": True}})
        decision = {"workspace": actor, "action": "goal_draft_decision", "args": {**target, "accept": True}}
        self.assertNotIn("planningDraft", web.dispatch("project", decision))
        self.assertEqual(web.dispatch("project", decision)["id"], draft["id"])
        self.assertTrue(self.mcp(a, "feature_push", {**target, "plannedDate": "2026-11-27"})["isError"])
        second = self.mcp(a, "feature_push", {**command, "text": "可忽略的建议"})
        decision["args"] = {"featureId": bot_id, "id": second["id"], "accept": False}
        self.assertTrue(web.dispatch("project", decision)["discarded"])
        entries = self.mcp(a, "feature_entries", {"featureId": bot_id})["entries"]
        self.assertEqual([(entry["id"], entry["plannedDate"]) for entry in entries], [(draft["id"], "2026-11-21")])

    def test_record_references_keep_project_scope_and_target_identity(self):
        a, b = self.projects
        for scope in (a, b):
            features.enable_builtin(scope, "library")
        note = self.mcp(a, "feature_push", {"featureId": "library", "text": "同机位渲染"})
        foreign = self.mcp(b, "feature_push", {"featureId": "library", "text": "其他项目"})
        bot = features.create_feature(a, "工程台", paradigm="engineering")["feature"]["id"]
        ref = {"featureId": "library", "id": note["id"]}
        record = self.mcp(a, "feature_push", {"featureId": bot, "text": "结果", "recordRefs": [ref, ref]})
        self.assertEqual(record["recordRefs"], [ref])
        request = {"workspace": self.records[a], "action": "entry_reference", "args": {
            "featureId": bot, "id": record["id"], "target": {"featureId": "library", "id": foreign["id"]},
        }}
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", request)
        request["args"].update(target=ref, remove=True)
        self.assertEqual(web.dispatch("project", request)["recordRefs"], [])
        self.assertEqual(self.mcp(a, "feature_entries", {"featureId": "library"})["entries"][0]["id"], note["id"])

    def test_notebook_suggestions_cannot_overwrite_a_newer_user_revision(self):
        a, b = self.projects
        feature_id = features.create_feature(a, "研究笔记", paradigm="notes")["feature"]["id"]
        target = {"featureId": feature_id}
        def act(name, args):
            return web.dispatch("project", {"workspace": self.records[a], "action": name, "args": args})
        note = act("feature_push", {**target, "title": "实验记录", "text": "原始正文", "kind": "note"})
        target["id"] = note["id"]
        self.assertTrue(self.mcp(a, "feature_push", {**target, "text": "直接覆盖"})["isError"])
        suggestion = self.mcp(a, "note_suggest_edit", {**target, "text": "候选正文", "baseVersion": 1})
        self.assertEqual(act("note/history", target)["versions"][0]["text"], "原始正文")
        self.assertTrue(self.mcp(b, "note_suggest_edit", {**target, "text": "跨项目", "baseVersion": 1})["isError"])
        act("feature_push", {**target, "text": "人工补充", "expectedNoteVersion": 1})
        decision = {**target, "suggestionId": suggestion["id"], "accept": True}
        with self.assertRaises(workspace.WorkspaceError):
            act("note/decision", decision)
        self.assertEqual(act("note/history", target)["versions"][0]["text"], "人工补充")
        suggestion = self.mcp(a, "note_suggest_edit", {**target, "text": "整理后的正文", "baseVersion": 2})
        act("note/decision", {**decision, "suggestionId": suggestion["id"]})
        history = act("note/history", target)["versions"]
        self.assertEqual([(v["version"], v["author"], v["text"]) for v in history],
                         [(3, "assistant", "整理后的正文"), (2, "user", "人工补充"), (1, "user", "原始正文")])

    def test_map_links_and_paper_capture_stay_in_project(self):
        a, b = self.projects
        map_feature = features.create_feature(a, "研究地图", paradigm="mindmap")["feature"]
        self.assertEqual(map_feature["layout"], "research-map")
        origin = {"featureId": map_feature["id"]}
        notebook = features.create_feature(a, "文献笔记", paradigm="notes")["feature"]["id"]
        foreign_notebook = features.create_feature(b, "其他笔记", paradigm="notes")["feature"]["id"]
        route = self.mcp(a, "feature_push", {**origin, "kind": "route", "text": "局部编辑"})
        foreign_map = features.create_feature(b, "其他导图", paradigm="mindmap")["feature"]["id"]
        foreign = self.mcp(b, "feature_push", {"featureId": foreign_map, "kind": "topic", "text": "其他领域"})
        paper = {**origin, "kind": "paper", "text": "同场景对照研究", "parentId": route["id"],
                 "url": "https://example.test/article", "paperAuthors": "作者甲"}
        self.assertTrue(self.mcp(a, "feature_push", {**paper, "mapLinks": [{"id": foreign["id"], "type": "related"}]})["isError"])
        record = self.mcp(a, "feature_push", {**paper, "mapLinks": [{"id": route["id"], "type": "related"}]})
        self.assertEqual(record["mapLinks"], [{"id": route["id"], "type": "related"}])
        request = {"workspace": self.records[a], "action": "map/save-source", "args": {
            **origin, "id": record["id"], "notebookId": foreign_notebook,
        }}
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", request)
        request["args"]["notebookId"] = notebook
        saved = web.dispatch("project", request)
        self.assertTrue(saved["created"])
        self.assertEqual(web.dispatch("project", request), {**saved, "created": False})
        duplicate = self.mcp(a, "feature_push", paper)
        request["args"]["id"] = duplicate["id"]
        web.dispatch("project", request)
        view = web.project_view(a)
        resource, = view["rails"]["library"]
        self.assertEqual(resource["url"], paper["url"])
        note = next(item for item in view["rails"][notebook] if item["id"] == saved["id"])
        self.assertEqual(note["capturedFrom"], {**origin, "id": record["id"]})
        self.assertIn({"featureId": "library", "id": resource["id"]}, note["recordRefs"])
        self.assertIn("作者甲", note["text"])

    def test_global_stays_chat_only_and_scopes_create_rename_delete(self):
        a, b = self.projects
        global_list = self.mcp("global", "feature_list", {})
        self.assertEqual([f["id"] for f in global_list], ["chat"])

        # Global create/delete must specify explicit projectId or 'all'.
        self.assertTrue(self.mcp("global", "feature_create", {"label": "缺失目标"})["isError"])
        self.assertTrue(self.mcp("global", "feature_create", {"label": "越界", "projectId": "global"})["isError"])
        self.assertTrue(self.mcp("global", "feature_delete", {"featureId": "feed"})["isError"])

        # Explicit project creation stays isolated to Alpha.
        only_a = self.mcp("global", "feature_create", {"label": "实验周报", "hint": "按周归档实验进度", "projectId": a})
        fid_a = only_a["feature"]["id"]
        self.assertEqual(only_a["scope"], a)
        self.assertIn(fid_a, [f["id"] for f in web.project_view(a)["features"]])
        self.assertNotIn(fid_a, [f["id"] for f in web.project_view(b)["features"]])

        # Project B cannot rename or delete A's feature or create inside A.
        self.assertTrue(self.mcp(b, "feature_create", {"label": "偷创", "projectId": a})["isError"])
        self.assertTrue(self.mcp(b, "feature_delete", {"featureId": fid_a, "projectId": a})["isError"])
        self.assertTrue(self.mcp(b, "rename_feature", {"featureId": fid_a, "label": "偷改"})["isError"])

        # Project-local rename works on custom feature IDs and preserves isolation.
        renamed = self.mcp(a, "rename_feature", {"featureId": fid_a, "label": "组会周报"})
        self.assertEqual(renamed["label"], "组会周报")
        self.assertEqual(web.project_view(a)["labels"][fid_a], "组会周报")
        self.assertEqual(self.mcp(a, "feature_labels", {})[fid_a], "组会周报")

        # Shared creation with 'all' appears in both; deleting in A leaves B active.
        shared = self.mcp("global", "feature_create", {"label": "投稿清单", "projectId": "all"})["feature"]
        fid_all = shared["id"]
        self.assertIn(fid_all, [f["id"] for f in web.project_view(a)["features"]])
        self.assertIn(fid_all, [f["id"] for f in web.project_view(b)["features"]])
        self.mcp(a, "feature_delete", {"featureId": fid_all})
        self.assertNotIn(fid_all, [f["id"] for f in web.project_view(a)["features"]])
        self.assertIn(fid_all, [f["id"] for f in web.project_view(b)["features"]])

        # New projects start with chat only; deleting 'chat' is always forbidden.
        self.assertEqual([f["id"] for f in web.project_view(a)["features"] if f["builtin"]], ["chat"])
        self.assertEqual([f["id"] for f in web.project_view(b)["features"] if f["builtin"]], ["chat"])
        self.assertTrue(self.mcp(a, "feature_delete", {"featureId": "chat"})["isError"])
        # Once optional builtins are enabled, deleting 'feed' is isolated to the current project.
        features.enable_builtin(a, "feed")
        features.enable_builtin(b, "feed")
        self.mcp(a, "feature_delete", {"featureId": "feed"})
        self.assertNotIn("feed", [f["id"] for f in web.project_view(a)["features"]])
        self.assertIn("feed", [f["id"] for f in web.project_view(b)["features"]])

    def test_feature_push_upload_and_bot_session_persistence(self):
        a, b = self.projects
        rec_a = self.records[a]
        created = self.mcp(a, "feature_create", {"label": "文献速递"})["feature"]
        fid = created["id"]

        # Generic HTTP workspace-page must NOT allow creating or deleting features directly,
        # while scoped per-project feature renaming works on built-in and custom features without crossing projects.
        for forbidden_action in ("feature_create", "feature_delete"):
            with self.subTest(action=forbidden_action), self.assertRaises(workspace.WorkspaceError):
                web.dispatch("project", {"workspace": rec_a, "action": forbidden_action, "args": {"featureId": fid, "label": "绕过"}})
        renamed_custom = web.dispatch("project", {
            "workspace": rec_a, "action": "feature_rename", "args": {"featureId": fid, "label": "论文速报"},
        })
        self.assertEqual(renamed_custom, {"scope": a, "featureId": fid, "label": "论文速报"})
        self.assertEqual(web.project_view(a)["labels"][fid], "论文速报")
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {"workspace": self.records[b], "action": "feature_rename", "args": {"featureId": fid, "label": "越权"}})

        # Bind dedicated DSH Feature Bot session ID and confirm catalog + project_view reflect it.
        web.dispatch("project", {"workspace": rec_a, "action": "bot_session", "args": {"featureId": fid, "sessionId": "sess-bot-001"}})
        view_a = web.project_view(a)
        self.assertIn("sess-bot-001", view_a["botSessionIds"])
        row_a = next(r for r in web.catalog() if r["scope"] == a)
        self.assertEqual(row_a["botSessionIds"], ["sess-bot-001"])
        ctx = features.bot_context_for_session(a, "sess-bot-001")
        self.assertEqual((ctx["featureId"], ctx["label"]), (fid, "论文速报"))

        # MCP feature_push writes timeline entry persisted in SQLite entities table.
        pushed = self.mcp(a, "feature_push", {"featureId": fid, "text": "本周新增 3 篇相关论文"})
        self.assertEqual(pushed["text"], "本周新增 3 篇相关论文")
        self.assertEqual(len(web.project_view(a)["rails"][fid]), 1)

        # MCP feature_entries returns pushed entries for the Bot.
        listed = self.mcp(a, "feature_entries", {"featureId": fid})
        self.assertEqual(listed["featureId"], fid)
        self.assertNotIn("categories", listed)
        self.assertEqual([entry["id"] for entry in listed["entries"]], [pushed["id"]])

        # MCP feature_push with existing id updates entry without duplicating it.
        updated_entry = self.mcp(a, "feature_push", {"featureId": fid, "id": pushed["id"], "text": "本周新增 3 篇核心论文"})
        self.assertEqual(updated_entry["id"], pushed["id"])
        self.assertEqual(updated_entry["text"], "本周新增 3 篇核心论文")
        self.assertEqual(len(web.project_view(a)["rails"][fid]), 1)

        # Cross-project and global scopes cannot inspect custom feature entries of project a.
        self.assertTrue(self.mcp(b, "feature_entries", {"featureId": fid, "projectId": a})["isError"])
        self.assertTrue(self.mcp("global", "feature_entries", {"featureId": fid})["isError"])

        # Upload inside custom feature stores file in library and links categorized entry into rails[fid].
        uploaded = web.dispatch("project", {
            "workspace": rec_a,
            "action": "upload",
            "args": {"name": "notes.txt", "data": base64.b64encode(b"hello world").decode(), "featureId": fid},
        })
        self.assertIn("linkedItem", uploaded)
        view_after = web.project_view(a)
        self.assertEqual(len(view_after["rails"]["library"]), 1)
        self.assertEqual(len(view_after["rails"][fid]), 2)
        self.assertEqual(view_after["rails"][fid][1]["category"], "file")
        self.assertEqual(web.project_view(b)["botSessionIds"], [])

        # Entry deletion inside custom rail removes item cleanly.
        web.dispatch("project", {"workspace": rec_a, "action": "entry_delete", "args": {"rail": fid, "id": pushed["id"]}})
        self.assertEqual(len(web.project_view(a)["rails"][fid]), 1)


    def test_bot_assignment_markdown_rename_and_project_index(self):
        a, b = self.projects
        rec_a, rec_b = self.records[a], self.records[b]
        features.enable_builtin(a, "ideas")
        features.enable_builtin(b, "ideas")
        markdown = "## 筛选标准\n\n- 只保留可验证的假设\n- 记录原文页码"
        rows = web.dispatch("project", {
            "workspace": rec_a, "action": "bot_assignment_write",
            "args": {"featureId": "ideas", "kind": "duty", "title": "筛选假设", "instruction": markdown},
        })
        self.assertEqual(rows, [{"kind": "duty", "title": "筛选假设", "instruction": markdown}])
        self.assertEqual(features.assignment_map(a)["ideas"][0]["instruction"], markdown)
        self.assertEqual(features.assignment_map(b), {})

        renamed = web.dispatch("project", {
            "workspace": rec_a, "action": "bot_assignment_write",
            "args": {"featureId": "ideas", "kind": "duty", "title": "验证假设",
                     "originalTitle": "筛选假设", "instruction": markdown},
        })
        self.assertEqual([item["title"] for item in renamed], ["验证假设"])
        self.assertEqual([item["title"] for item in features.assignment_map(a)["ideas"]], ["验证假设"])

        features.schedule_links(a, "ideas", "schedule-1")
        self.assertEqual(features.schedule_map(a), {"ideas": ["schedule-1"]})
        cat_a = next(row for row in web.catalog() if row["scope"] == a)
        cat_b = next(row for row in web.catalog() if row["scope"] == b)
        idea_a = next(f for f in cat_a["features"] if f["id"] == "ideas")
        idea_b = next(f for f in cat_b["features"] if f["id"] == "ideas")
        self.assertEqual(idea_a["scheduleIds"], ["schedule-1"])
        self.assertEqual(idea_a["assignments"][0]["title"], "验证假设")
        self.assertEqual(idea_b["scheduleIds"], [])
        self.assertEqual(idea_b["assignments"], [])

        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch("project", {
                "workspace": rec_b, "action": "bot_assignment_write",
                "args": {"featureId": "ideas", "kind": "duty", "title": "越权", "instruction": "x", "projectId": a},
            })

        # Legacy storage rows in SQLite remain readable as duty and can be updated or removed cleanly.
        legacy_rows = web.dispatch("project", {
            "workspace": rec_a, "action": "bot_assignment_write",
            "args": {"featureId": "ideas", "kind": "storage", "title": "旧归档规则", "instruction": "保留出处"},
        })
        self.assertTrue(any(item["kind"] == "duty" and item["title"] == "旧归档规则" for item in legacy_rows))
        after_remove = web.dispatch("project", {
            "workspace": rec_a, "action": "bot_assignment_write",
            "args": {"featureId": "ideas", "kind": "duty", "title": "旧归档规则", "remove": True},
        })
        self.assertFalse(any(item["title"] == "旧归档规则" for item in after_remove))

    def test_project_plus_and_chat_share_feature_profile(self):
        a,b=self.projects
        args={"label":"研究笔记","paradigm":"notes","hint":"记录假设","symbol":"✎","keywords":["假设","证据","假设"],"requestId":"a"*32}
        def create(values):
            return web.dispatch("project",{"workspace":self.records[a],"action":"create_feature_bot","args":values})
        first=create(args)["feature"]
        self.assertEqual(create(args)["feature"]["id"],first["id"])
        self.assertEqual(first["keywords"],["假设","证据"])
        with self.assertRaises(workspace.WorkspaceError):
            create({**args,"label":"另一个名字"})
        with self.assertRaises(workspace.WorkspaceError):
            create({**args,"projectId":b})
        self.assertNotIn(first["id"],web.project_view(b)["labels"])
        chat=self.mcp(a,"feature_create",{"label":"推导","symbol":"λ","keywords":["公式"]})["feature"]
        saved=next(f for f in web.project_view(a)["features"] if f["id"]==chat["id"])
        self.assertEqual((saved["symbol"],saved["keywords"]),("λ",["公式"]))

    def test_feature_push_illustrated_svg_image_path_and_security(self):
        a, b = self.projects
        rec_a = self.records[a]
        fid = self.mcp(a, "feature_create", {"label": "实验观察", "hint": "输出关键曲线与对比图"})["feature"]["id"]

        # Text-only push omits image fields when LLM deems plain text clearer.
        plain = self.mcp(a, "feature_push", {"featureId": fid, "text": "仅文本状态提醒", "category": "push"})
        self.assertNotIn("image", plain)
        self.assertNotIn("imageUrl", plain)

        # Illustrated SVG push with title & caption stores sanitized data URI.
        svg = (
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 180">'
            '<rect width="320" height="180" rx="12" fill="#f8fafc"/>'
            '<rect x="40" y="90" width="60" height="60" fill="#0ea5e9"/>'
            '<text x="40" y="36" fill="#0f172a" font-size="16">Metric</text>'
            "</svg>"
        )
        rich = self.mcp(a, "feature_push", {
            "featureId": fid,
            "title": "对照基线准确率对比",
            "text": "新方案较基线提升 4.2%，方差更收敛。",
            "caption": "三组随机种子均值柱状图",
            "imageSvg": svg,
            "category": "push",
        })
        self.assertEqual(rich["title"], "对照基线准确率对比")
        self.assertEqual(rich["caption"], "三组随机种子均值柱状图")
        self.assertTrue(rich["image"].startswith("data:image/svg+xml;base64,"))

        # Project-relative PNG imagePath embeds image safely; traversal & unsafe inputs fail.
        import project_service
        png_1x1 = base64.b64decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII="
        )
        fig = project_service.folder(a) / "figures" / "loss.png"
        fig.parent.mkdir(parents=True, exist_ok=True)
        fig.write_bytes(png_1x1)
        by_path = self.mcp(a, "feature_push", {
            "featureId": fid,
            "title": "训练收敛曲线",
            "text": "第 12 轮后验证损失趋于平稳。",
            "imagePath": "figures/loss.png",
        })
        self.assertEqual(by_path["imagePath"], "figures/loss.png")
        self.assertTrue(by_path["image"].startswith("data:image/png;base64,"))

        # Clear image on update works cleanly.
        cleared = self.mcp(a, "feature_push", {"featureId": fid, "id": rich["id"], "clearImage": True})
        self.assertNotIn("image", cleared)

        # Reject SVG XSS / external beacons / traversal / spoofed raster bytes.
        bad_payloads = [
            {"imageSvg": '<svg viewBox="0 0 10 10"><script>alert(1)</script></svg>'},
            {"imageSvg": '<svg viewBox="0 0 10 10" onload="alert(1)"></svg>'},
            {"imageSvg": '<svg viewBox="0 0 10 10"><foreignObject><div>x</div></foreignObject></svg>'},
            {"imageSvg": '<svg viewBox="0 0 10 10"><image href="https://evil.example/a.png"/></svg>'},
            {"imagePath": "../escape.png"},
            {"imagePath": "missing.png"},
            {"imageData": "data:image/png;base64," + base64.b64encode(b"not-a-png").decode()},
            {"imageUrl": "javascript:alert(1)"},
        ]
        for extra in bad_payloads:
            with self.subTest(extra=extra):
                res = self.mcp(a, "feature_push", {"featureId": fid, "text": "invalid", **extra})
                self.assertTrue(res["isError"])

        # Project b cannot push into project a's image or feature.
        self.assertTrue(self.mcp(b, "feature_push", {"featureId": fid, "text": "leak", "imagePath": "figures/loss.png"})["isError"])

        # Uploading a PNG directly creates a previewable illustrated entry in library & linked feature.
        uploaded = web.dispatch("project", {
            "workspace": rec_a,
            "action": "upload",
            "args": {"name": "plot.png", "data": base64.b64encode(png_1x1).decode(), "featureId": fid},
        })
        self.assertTrue(uploaded["image"].startswith("data:image/png;base64,"))
        self.assertTrue(uploaded["linkedItem"]["image"].startswith("data:image/png;base64,"))

    def test_paradigm_avatars_for_builtin_and_custom_paradigms(self):
        a, _ = self.projects
        rec_a = self.records[a]

        # Newly created bots default to empty symbol (inherit paradigm avatar) instead of legacy '✦'.
        ui_bot = web.dispatch("project", {
            "workspace": rec_a, "action": "create_feature_bot",
            "args": {"label": "阶段目标", "paradigm": "goals", "requestId": "1" * 32},
        })["feature"]
        self.assertEqual(ui_bot["symbol"], "")
        self.assertEqual(ui_bot["paradigm"], "goals")

        mcp_bot = self.mcp(a, "feature_create", {"label": "文献脉络", "paradigm": "mindmap"})["feature"]
        self.assertEqual(mcp_bot["symbol"], "")
        self.assertEqual(mcp_bot["paradigm"], "mindmap")

        # Manually created project extension paradigm automatically gets a matching avatar icon.
        defect_ext = web.dispatch("project", {
            "workspace": rec_a, "action": "create_project_paradigm",
            "args": {
                "label": "缺陷追踪",
                "description": "记录系统故障、报错复现步骤和排查进展。",
                "base": "engineering",
                "layout": "sequence",
                "fields": [{"name": "问题标题", "type": "text", "role": "title"}],
            },
        })
        self.assertEqual(defect_ext["symbol"], "lucide:bug")

        # Conversation-created paradigm auto-matches and tolerates an unrecognized symbol hint.
        paper_ext = self.mcp(a, "project_paradigm_create", {
            "label": "文献精读",
            "description": "按主题整理核心论文与阅读笔记。",
            "base": "notes",
            "layout": "library",
            "symbol": "lucide:not-a-real-icon",
            "fields": [{"name": "论文标题", "type": "text", "role": "title"}],
        })
        self.assertEqual(paper_ext["symbol"], "lucide:book-open")

        # Explicit valid symbol on custom paradigm is preserved (both exact and bare lucide name).
        custom_ext = web.dispatch("project", {
            "workspace": rec_a, "action": "create_project_paradigm",
            "args": {
                "label": "自定义看板",
                "description": "通用结构化记录。",
                "base": "notes",
                "layout": "timeline",
                "symbol": "telescope",
                "fields": [{"name": "条目", "type": "text", "role": "title"}],
            },
        })
        self.assertEqual(custom_ext["symbol"], "lucide:telescope")

        # Bots created from custom extension paradigms carry extension.symbol and default symbol=''.
        ext_bot = web.dispatch("project", {
            "workspace": rec_a, "action": "create_feature_bot",
            "args": {"label": "缺陷清单", "paradigm": defect_ext["id"], "requestId": "2" * 32},
        })["feature"]
        self.assertEqual(ext_bot["symbol"], "")
        self.assertEqual(ext_bot["extension"]["symbol"], "lucide:bug")
        listed_ext = next(f for f in web.project_view(a)["features"] if f["id"] == ext_bot["id"])
        self.assertEqual(listed_ext["symbol"], "")
        self.assertEqual(listed_ext["extension"]["symbol"], "lucide:bug")

        # Legacy '✦' rows migrate cleanly once; later explicit updates to '✦' stay intact.
        from contextlib import closing
        with closing(workspace.database()) as db, db:
            db.execute("DELETE FROM labweave_meta WHERE key = 'paradigm_avatar_default_v1'")
            db.execute("UPDATE labweave_feature_profiles SET symbol = '✦' WHERE scope = ? AND feature_id = ?", (a, ui_bot["id"]))
        migrated = next(f for f in web.project_view(a)["features"] if f["id"] == ui_bot["id"])
        self.assertEqual(migrated["symbol"], "")
        web.dispatch("project", {
            "workspace": rec_a, "action": "feature_update",
            "args": {"featureId": ui_bot["id"], "symbol": "✦"},
        })
        explicit_star = next(f for f in web.project_view(a)["features"] if f["id"] == ui_bot["id"])
        self.assertEqual(explicit_star["symbol"], "✦")


if __name__ == "__main__":
    unittest.main()
