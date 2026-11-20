"""Verify the native goal planner with disposable project data and no model calls."""
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher


def main():
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="weave-goal-planner-") as directory:
            root = Path(directory)
            launcher.workspace.DATA = root / "data"
            with launcher.native_services(0, home=root / "host", configured=False, background=False) as (url, _):
                subprocess.run(["node", str(ROOT / "tests/integration_goal_planner.cjs")],
                               cwd=ROOT, input=url, text=True, check=True, timeout=125)
    finally:
        launcher.workspace.DATA = previous


if __name__ == "__main__":
    main()
