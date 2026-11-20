"""Verify the native research Bots with disposable project data and no model calls."""
from pathlib import Path
import json
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
import native_web
import project_service
import research_mcp


def main():
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-goal-planner-") as directory:
            root = Path(directory)
            launcher.workspace.DATA = root / "data"
            with launcher.native_services(0, home=root / "host", configured=False, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_goal_planner.cjs"),
                                sys.executable, __file__, str(root / "data")],
                               cwd=ROOT, input=url, text=True, check=True, timeout=125)
            scope = next(row["scope"] for row in native_web.catalog() if row["name"] == "排期验收")
            view = native_web.project_view(scope)
            bot = next(row for row in view["features"] if row["label"] == "实验日志")
            items = view["rails"][bot["id"]]
            resource, = (item for item in view["rails"]["library"] if item.get("path"))
            reference = {"featureId": "library", "id": resource["id"]}
            assert all(reference in item["recordRefs"] for item in items
                       if item.get("kind") == "note" and not item.get("capturedFrom"))
            note, = (item for item in items if item.get("capturedFrom"))
            paper, = (item for item in view["rails"]["library"] if item.get("kind") == "paper")
            assert {"featureId": "library", "id": paper["id"]} in note["recordRefs"]
            assert paper["url"] == "https://example.test/benchmark"
            files = list((project_service.folder(scope) / "resources").iterdir())
            assert len(files) == 1 and files[0].read_text(encoding="utf-8") == "stage,score\nR2,65.29\n"
    finally:
        launcher.workspace.DATA = previous


def publish_test_suggestions(data, planned_date):
    launcher.workspace.DATA = Path(data)
    project = next(row for row in native_web.catalog() if row["name"] == "排期验收")
    scope = project["scope"]
    bot = next(row for row in features.list_features(scope) if row["label"] == "实验排期")
    for text in ("核对评分表", "检查额外资料"):
        reply = research_mcp.dispatch({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
            "name": "feature_push", "arguments": {
                "featureId": bot["id"], "text": text, "category": "实验验证", "plannedDate": planned_date,
            },
        }}, scope)["result"]
        assert not reply.get("isError"), reply
        assert json.loads(reply["content"][0]["text"])["planningDraft"]


def publish_test_note_suggestion(data):
    launcher.workspace.DATA = Path(data)
    scope = next(row["scope"] for row in native_web.catalog() if row["name"] == "排期验收")
    view = native_web.project_view(scope)
    bot = next(row for row in view["features"] if row["label"] == "实验日志")
    note = next(row for row in view["rails"][bot["id"]] if row.get("title") == "凉亭广场的对照记录")
    result = research_mcp.dispatch({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
        "name": "note_suggest_edit", "arguments": {
            "featureId": bot["id"], "id": note["id"], "baseVersion": note["noteVersion"],
            "text": "保留同一机位，单独检查台阶改动。", "reason": "把复验条件写清楚。",
        },
    }}, scope)["result"]
    assert not result.get("isError"), result


def publish_test_map(data):
    launcher.workspace.DATA = Path(data)
    scope = next(row["scope"] for row in native_web.catalog() if row["name"] == "排期验收")
    bot = next(row for row in features.list_features(scope) if row["label"] == "研究地图")

    def publish(kind, title, text, **data):
        result = research_mcp.dispatch({"jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": {
            "name": "feature_push", "arguments": {
                "featureId": bot["id"], "kind": kind, "title": title, "text": text, **data,
            },
        }}, scope)["result"]
        assert not result.get("isError"), result
        return json.loads(result["content"][0]["text"])["id"]

    topic = publish("topic", "3D 编程基准", "如何评估代码生成的三维场景？")
    scene = publish("route", "场景复现", "以目标场景为参照，检查结构和外观。", parentId=topic,
                    routeQuestion="生成结果是否保留场景结构？", routeMethods="固定机位进行渲染对照",
                    routeOpenQuestions="遮挡会怎样影响评分？")
    edits = publish("route", "局部编辑", "编辑指定对象，同时保留无关部分。", parentId=topic,
                    routeQuestion="改动能否限制在指定对象？", routeMethods="编辑前后分别渲染",
                    routeOpenQuestions="如何衡量未编辑区域的变化？")
    publish("paper", "场景复现基准", "测试数据中的示例论文，用于验证来源和收藏。", parentId=scene,
            paperAuthors="示例作者", paperVenue="示例论文 · 测试数据", eventDate="2025-06-14",
            url="https://example.test/benchmark", mapLinks=[{"id": edits, "type": "related"}])
    publish("method", "固定机位对照", "固定相机和光照，再单独检查结构。", parentId=scene,
            mapLinks=[{"id": edits, "type": "compares", "source": "https://example.test/method"}])
    publish("metric", "未编辑区域变化", "检查编辑是否影响背景物体。", parentId=edits)


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--suggest":
        publish_test_suggestions(*sys.argv[2:])
    elif len(sys.argv) == 3 and sys.argv[1] == "--suggest-note":
        publish_test_note_suggestion(sys.argv[2])
    elif len(sys.argv) == 3 and sys.argv[1] == "--seed-map":
        publish_test_map(sys.argv[2])
    else:
        main()
