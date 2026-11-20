"""Verify engineering Bot run previews and scope isolation on the pinned Web runtime."""

import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path[:0] = [str(ROOT / "scripts"), str(ROOT / "demo/api")]
import bot_activity
import features
import native_launcher as launcher
import native_web
from project_service import folder


def seed_project(number, name, title, values):
    scope = native_web.dispatch("create", {"name": name, "requestId": str(number) * 32})["scope"]
    bot = features.create_feature(scope, "评测工程台", paradigm="engineering")["feature"]["id"]
    sibling = features.create_feature(scope, "复核工程台", paradigm="engineering")["feature"]["id"]
    output = folder(scope) / "outputs"
    output.mkdir(exist_ok=True)
    (output / "scores.csv").write_text("accuracy\n" + "\n".join(values) + "\n", encoding="utf-8")
    (output / "unrelated.csv").write_text("accuracy\n0.50\n", encoding="utf-8")
    run = bot_activity.record(scope, bot, "integration-engineering", {
        "name": title, "status": "completed", "logs": "完成评测",
        "parameters": {"artifacts": ["outputs/scores.csv"]},
    })
    return {"scope": scope, "name": name, "title": title, "bot": bot, "sibling": sibling, "run": run["id"]}


def main():
    saved_data = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-bot-workbench-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            first = seed_project(1, "试验工作区", "消融对照", ["0.72", "0.84", "0.89"])
            second = seed_project(2, "文献工作区", "证据核对", ["0.91", "0.92", "0.93"])
            with launcher.native_services(0, home=root / "web", configured=False, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_bot_workbench.cjs")],
                               input=json.dumps({"url": url, "first": first, "second": second}),
                               text=True, cwd=ROOT, check=True, timeout=100)
    finally:
        launcher.workspace.DATA = saved_data


if __name__ == "__main__":
    main()
