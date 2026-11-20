"""Verify the native goal planner with disposable project data and no model calls."""
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
            resource, = view["rails"]["library"]
            reference = {"featureId": "library", "id": resource["id"]}
            assert all(reference in item["recordRefs"] for item in items if item.get("kind") == "note")
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


if __name__ == "__main__":
    if len(sys.argv) == 4 and sys.argv[1] == "--suggest":
        publish_test_suggestions(*sys.argv[2:])
    else:
        main()
