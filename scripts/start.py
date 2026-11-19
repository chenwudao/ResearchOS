"""Shared Windows/Linux launcher with pinned Python dependencies."""
import argparse
import hashlib
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import venv

ROOT = Path(__file__).resolve().parents[1]


def main():
    parser = argparse.ArgumentParser(description="启动和管理本机 Weave 科研工作区。")
    parser.add_argument("--install-only", action="store_true", help="准备 Weave 运行环境")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--backup", action="store_true", help="备份已关闭的工作区及其会话")
    mode.add_argument("--stop", action="store_true", help="关闭此项目的 Weave 服务")
    mode.add_argument("--restore", metavar="BACKUP.zip", help="从指定备份恢复已关闭的工作区")
    parser.add_argument("--no-open", action="store_true", help="在终端显示本机 Weave 登录链接")
    parser.add_argument("--port", type=int, default=8770, help="本机 Weave 端口（默认 8770）")
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
        print("正在安装 Weave 运行环境…", flush=True)
        with tempfile.NamedTemporaryFile(dir=environment, prefix="weave-install-", suffix=".log", delete=False) as log:
            installation = subprocess.run([str(python), "-m", "pip", "install", "-r", str(requirements)],
                                          stdout=log, stderr=subprocess.STDOUT)
        log_path = environment / "weave-install.log"
        os.replace(log.name, log_path)
        if installation.returncode:
            raise SystemExit(f"Weave 运行环境安装失败。详细日志位于 {log_path}")
        stamp.write_text(digest)
        print("Weave 运行环境已就绪。", flush=True)
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
