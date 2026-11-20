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

    def test_global_stays_chat_only_and_fixed_workers_are_scoped(self):
        a,b=self.projects
        self.assertEqual([f['id'] for f in self.mcp('global','feature_list',{})],['chat'])
        self.assertTrue(self.mcp('global','feature_create',{'label':'missing project'})['isError'])
        created=self.mcp('global','feature_create',{'label':'ignored','paradigm':'notes','projectId':a})
        self.assertEqual(created['feature']['id'],'library')
        self.assertTrue(created['reused'])
        self.assertTrue(self.mcp(b,'feature_create',{'label':'cross scope','projectId':a})['isError'])
        self.assertTrue(self.mcp(a,'feature_delete',{'featureId':'library'})['isError'])
        self.assertEqual(len(self.mcp(a,'feature_list',{})),6)

    def legacy_feature(self, project, label):
        from contextlib import closing
        with closing(workspace.database()) as db, db:
            features.ensure_tables(db)
            db.execute("INSERT INTO labweave_features(scope,feature_id,label,updated_ts,paradigm,layout) VALUES(?,?,?,0,'notes','timeline')",(project,'feat_12345678',label))
        return 'feat_12345678'

    def test_feature_push_upload_and_bot_session_persistence(self):
        a, b = self.projects
        rec_a = self.records[a]
        fid = self.legacy_feature(a, "文献速递")

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

    def test_ui_and_chat_reuse_fixed_worker_without_profile_changes(self):
        a,b=self.projects
        args={'label':'arbitrary name','paradigm':'notes','hint':'arbitrary duty','requestId':'a'*32}
        result=web.dispatch('project',{'workspace':self.records[a],'action':'create_feature_bot','args':args})
        self.assertTrue(result['reused'])
        self.assertEqual(result['feature']['label'],'笔记')
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch('project',{'workspace':self.records[a],'action':'feature_update','args':{'featureId':'library','label':'changed'}})
        chat=self.mcp(a,'feature_create',{'label':'ignored','paradigm':'notes'})
        self.assertEqual(chat['feature'],result['feature'])
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch('project',{'workspace':self.records[a],'action':'create_feature_bot','args':{**args,'projectId':b}})

    def test_feature_push_illustrated_svg_image_path_and_security(self):
        a, b = self.projects
        rec_a = self.records[a]
        fid = self.legacy_feature(a, "实验观察")

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

    def test_fixed_paradigm_avatars_and_extension_creation_blocked(self):
        a,_=self.projects
        workers=[f for f in features.list_features(a) if f.get('fixed')]
        self.assertEqual(len(workers),5)
        self.assertTrue(all(f['symbol']=='' and f['extension'] is None for f in workers))
        with self.assertRaises(workspace.WorkspaceError):
            web.dispatch('project',{'workspace':self.records[a],'action':'create_project_paradigm',
                                   'args':{'label':'custom','description':'new type','base':'notes','layout':'library'}})
        self.assertTrue(self.mcp(a,'project_paradigm_create',{'label':'custom'})['isError'])


if __name__ == "__main__":
    unittest.main()
