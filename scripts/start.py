"""Shared Windows/Linux launcher with pinned Python dependencies."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import venv

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--install-only", action="store_true", help="Prepare dependencies without starting the server")
    args = parser.parse_args()
    if sys.version_info[:2] != (3, 12):
        raise SystemExit("Use Python 3.12 (validated with 3.12.6).")
    environment = ROOT / ".venv"
    python = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    if not python.is_file():
        venv.create(environment, with_pip=True)
    requirements = ROOT / "requirements-runtime.txt"
    digest = hashlib.sha256(requirements.read_bytes()).hexdigest()
    stamp = environment / ".researchos-dependencies"
    if not stamp.is_file() or stamp.read_text() != digest:
        subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)], check=True)
        stamp.write_text(digest)
    if not args.install_only:
        print("ResearchOS: http://127.0.0.1:8765", flush=True)
        try:
            subprocess.run([str(python), str(ROOT / "demo/api/main.py")], cwd=ROOT, check=True)
        except KeyboardInterrupt:
            pass


if __name__ == "__main__":
    main()
