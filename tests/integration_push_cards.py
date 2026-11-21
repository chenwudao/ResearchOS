"""Check project push cards in the shipped Web client with disposable data."""

from pathlib import Path
import base64
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
import bot_activity
import project_service as projects


def main():
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-push-cards-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            pid = projects.create_project("推送验证", "proj_push_test")["id"]
            features.enable_builtin(pid, "feed")
            image = ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 320">'
                     '<rect width="600" height="320" fill="#e2e8f0"/>'
                     '<text x="80" y="100" fill="#1e293b" font-size="35">Experiment results</text></svg>')
            chart = {"title": "准确率曲线", "type": "line", "xLabel": "步", "yLabel": "准确率",
                     "points": [{"x": 1, "y": 0.7}, {"x": 3, "y": 0.9}]}
            entry = projects.call("feature_push", {
                "featureId": "feed", "title": "可读的实验插图",
                "summary": "同一条件下比较了两种测评结果。",
                "text": "方法：从三个评测任务采集相同设置下的观测。\n"
                        "**结论：** 仿真与真机的**方法排序**相关。\n"
                        "**局限**：仅覆盖短程操作。\n"
                        "证据等级：摘要和图表已核对。\n\n"
                        "```txt\n方法：这是原样保留的代码块\n```",
                "url": "https://example.org/paper", "source": "待更正期刊", "caption": "实验观察图注", "imageSvg": image,
                "visualizations": [chart],
            }, pid)
            projects.call("feature_push", {"featureId": "feed", "id": entry["id"], "source": "实测期刊"}, pid)
            projects.call("feature_push", {"featureId": "feed", "text": "另一条无图动态",
                                           "url": "https://example.org/second"}, pid)
            bot = features.create_feature(pid, "文献脉络", paradigm="notes", layout="timeline")["feature"]
            projects.call("feature_push", {
                "featureId": bot["id"], "title": "两种评测设置的比较",
                "text": "先梳理两种设置的输入。\n\n- 条件一\n- 条件二",
            }, pid)
            notes = native_upload(pid, bot["id"])
            projects.call("feature_push", {"featureId": bot["id"], "id": notes["id"], "title": "数据附件"}, pid)
            for layout, label in (("star", "方法关系图"), ("bus", "数据总线")):
                feature = features.create_feature(pid, label, paradigm="mindmap")["feature"]["id"]
                projects.call("feature_layout", {"featureId": feature, "layout": layout}, pid)
                root_node = projects.call("feature_push", {"featureId": feature, "text": "中心方法"}, pid)
                projects.call("feature_push", {"featureId": feature, "text": "候选方法", "parentId": root_node["id"]}, pid)
                projects.call("feature_push", {"featureId": feature, "text": "对照方法"}, pid)
                if layout == "star":
                    member = features.create_feature(pid, "同行核对", paradigm="mindmap")["feature"]["id"]
                    projects.call("feature_push", {"featureId": member, "text": "外部证据"}, pid)
                    features.cluster_bots(pid, feature, [member])
            engineer = features.create_feature(pid, "运行追踪", paradigm="engineering", layout="sequence")["feature"]["id"]
            run = bot_activity.record(pid, engineer, "fixture", {
                "name": "训练曲线", "status": "running", "metrics": {"step": [1, 5], "loss": [0.7, 0.4]},
            })
            path = projects.folder(pid) / "outputs" / "scores.csv"
            path.parent.mkdir(exist_ok=True)
            path.write_text("step,loss\n1,0.7\n5,0.4\n", encoding="utf-8")
            bot_activity.record(pid, engineer, "fixture", {
                "id": run["id"], "parameters": {"artifacts": ["outputs/scores.csv"]},
            })
            with launcher.native_services(0, home=root / "home", configured=False, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_push_cards.cjs"), str(path)],
                               input=url, text=True, check=True, timeout=120)
                assert bot_activity.view(pid, "bot/experiment", {"featureId": engineer, "id": run["id"]})["status"] == "running"
    finally:
        launcher.workspace.DATA = previous


def native_upload(project, feature):
    import native_web
    return native_web.project_action(project, {"action": "upload", "args": {
        "name": "measurements.tsv", "featureId": feature,
        "data": base64.b64encode(b"step\taccuracy\n1\t0.7\n5\t0.95\n").decode(),
    }})["linkedItem"]


if __name__ == "__main__":
    main()
