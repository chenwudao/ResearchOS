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
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--backup", action="store_true", help="Back up the stopped workspace and native sessions")
    mode.add_argument("--stop", action="store_true", help="Stop the native service for this project")
    mode.add_argument("--restore", metavar="BACKUP.zip", help="Restore the stopped workspace using a named backup")
    parser.add_argument("--no-open", action="store_true", help="Show the local DSH login URL in this terminal")
    parser.add_argument("--port", type=int, default=8770, help="Local DSH Web port (default: 8770)")
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
    if args.install_only:
        return
    if not 0 <= args.port <= 65535:
        parser.error("Invalid Web port")
    if Path(sys.executable) != python:
        raise SystemExit(subprocess.call([str(python), str(Path(__file__).resolve()), *sys.argv[1:]], cwd=ROOT))
    import native_launcher
    try:
        if args.stop:
            native_launcher.request_stop()
        elif args.backup or args.restore:
            native_launcher.offline_backup(args.restore)
        else:
            native_launcher.launch(args.port, args.no_open)
    except (OSError, RuntimeError, native_launcher.workspace.WorkspaceError) as exc:
        raise SystemExit(str(exc))


if __name__ == "__main__":
    main()
