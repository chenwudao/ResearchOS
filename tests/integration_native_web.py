"""Exercise the installed DSH Web, including a restart, against disposable data."""
import argparse
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from pypdf import PdfWriter

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--model", action="store_true", help="Also send a synthetic project tool request to DeepSeek")
    args = parser.parse_args()
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="labweave-native-e2e-") as tmp:
            root = Path(tmp)
            launcher.workspace.DATA = root / "data"
            pdf = PdfWriter()
            for _ in range(2):
                pdf.add_blank_page(width=400, height=600)
            pdf.write(root / "fixture.pdf")
            for phase in ("initial", "restart"):
                with launcher.native_services(0, home=root / "home", configured=args.model, background=False) as (url, _):
                    subprocess.run(["node", str(ROOT / "tests/integration_native_web.cjs"), phase, str(root),
                                    "model" if args.model else "offline"], input=url, text=True, check=True, timeout=300)
    finally:
        launcher.workspace.DATA = previous


if __name__ == "__main__":
    main()
