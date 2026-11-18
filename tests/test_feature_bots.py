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

        # Deleting 'chat' is always forbidden; deleting builtin 'feed' removes it cleanly.
        self.assertTrue(self.mcp(a, "feature_delete", {"featureId": "chat"})["isError"])
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

        # MCP feature_push writes categorized entry persisted in SQLite entities table.
        pushed = self.mcp(a, "feature_push", {"featureId": fid, "text": "本周新增 3 篇相关论文", "category": "push"})
        self.assertEqual(pushed["category"], "push")
        self.assertEqual(len(web.project_view(a)["rails"][fid]), 1)


        # MCP feature_entries returns categories and entries for LLM-driven classification decisions.
        listed = self.mcp(a, "feature_entries", {"featureId": fid})
        self.assertEqual(listed["featureId"], fid)
        self.assertTrue(any(cat[0] == "push" for cat in listed["categories"]))
        self.assertEqual([entry["id"] for entry in listed["entries"]], [pushed["id"]])

        # MCP feature_push with existing id recategorizes entry without duplicating it.
        recat = self.mcp(a, "feature_push", {"featureId": fid, "id": pushed["id"], "category": "核心结论"})
        self.assertEqual(recat["id"], pushed["id"])
        self.assertEqual(recat["text"], "本周新增 3 篇相关论文")
        self.assertEqual(recat["category"], "核心结论")
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


    def test_project_plus_and_chat_share_feature_profile(self):
        a,b=self.projects
        args={"label":"研究笔记","hint":"记录假设","symbol":"✎","keywords":["假设","证据","假设"],"requestId":"a"*32}
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


if __name__ == "__main__":
    unittest.main()
