"""Check project push cards in the shipped Web client with disposable data."""

from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import features
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
            entry = projects.call("feature_push", {
                "featureId": "feed", "title": "可读的实验插图", "text": "结合图表梳理本项目使用的实验方法。",
                "url": "https://example.org/paper", "source": "待更正期刊", "caption": "实验观察图注", "imageSvg": image,
            }, pid)
            projects.call("feature_push", {"featureId": "feed", "id": entry["id"], "source": "实测期刊"}, pid)
            projects.call("feature_push", {"featureId": "feed", "text": "另一条无图动态",
                                           "url": "https://example.org/second"}, pid)
            with launcher.native_services(0, home=root / "home", configured=False, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_push_cards.cjs")],
                               input=url, text=True, check=True, timeout=120)
    finally:
        launcher.workspace.DATA = previous


if __name__ == "__main__":
    main()
