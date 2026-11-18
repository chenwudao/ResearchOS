r"""Experimental isolated DSH Web preview; does not replace the regular launcher.

From the project directory, Windows:
    .\.venv\Scripts\python.exe scripts\start_dsh_preview.py --use-existing-backend
Linux:
    ./.venv/bin/python scripts/start_dsh_preview.py --use-existing-backend

The flag explicitly reuses a service already listening on 127.0.0.1:8765;
omit it to start and manage a new backend when that port is free. It does not
verify the identity of a pre-existing service. Press Enter for an orderly
shutdown of processes started here; forced termination may leave temporary
files or processes behind. The DSH profile and settings are temporary; use
--use-configured-model to supply the existing local DeepSeek key to DSH via its
process environment. Project-scoped chat is not yet connected. Plugin installation
needs pnpm and may be slow or fail. The regular launcher is unchanged.
"""
from __future__ import annotations

import argparse
import os
from pathlib import Path
import queue
import re
import signal
import socket
import subprocess
import sys
import tempfile
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
DSH = ROOT / ".venv" / ("Scripts/dsh.exe" if os.name == "nt" else "bin/dsh")
PLUGIN = ROOT / "plugins/dsh-labweave-prototype"
URL = re.compile(r"http://127\.0\.0\.1:\d+/\?token=[^\s\x1b]+")


def listening() -> bool:
    try:
        with socket.create_connection(("127.0.0.1", 8765), timeout=0.5):
            return True
    except OSError:
        return False


def stop_process(process: subprocess.Popen | None) -> None:
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        # Only target the process tree created by this launcher, never an
        # existing service on the same port.
        try:
            subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                           check=False, timeout=15)
        except (OSError, subprocess.TimeoutExpired):
            process.terminate()
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
    try:
        process.wait(timeout=15)
    except subprocess.TimeoutExpired:
        process.kill()
        process.wait(timeout=5)


def start_process(command: list[str], **kwargs) -> subprocess.Popen:
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def start_web(env: dict[str, str], timeout: int) -> subprocess.Popen:
    process = start_process(
        [str(DSH), "web", "--host", "127.0.0.1", "--port", "0", "--no-open"],
        cwd=ROOT, env=env, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    lines: queue.Queue[str | None] = queue.Queue(maxsize=128)

    def read_output() -> None:
        assert process.stdout is not None
        for line in process.stdout:
            try:
                lines.put_nowait(line)
            except queue.Full:
                pass
        try:
            lines.put_nowait(None)
        except queue.Full:
            pass

    threading.Thread(target=read_output, daemon=True).start()
    deadline = time.monotonic() + timeout
    try:
        while time.monotonic() < deadline:
            try:
                line = lines.get(timeout=min(1, max(0.01, deadline - time.monotonic())))
            except queue.Empty:
                if process.poll() is not None:
                    raise RuntimeError("DSH Web exited before reporting its launch URL")
                continue
            if line is None:
                raise RuntimeError("DSH Web exited before reporting its launch URL")
            match = URL.search(line)
            if match:
                # The one-time URL contains a credential. Never print or persist it.
                if not webbrowser.open(match.group(0), new=2):
                    raise RuntimeError("Could not open the DSH Web browser")
                return process
        raise RuntimeError("DSH Web did not become ready before the timeout")
    except BaseException:
        stop_process(process)
        raise


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--use-existing-backend", action="store_true",
                        help="Use the already running service on 127.0.0.1:8765; it will not be stopped")
    parser.add_argument("--use-configured-model", action="store_true",
                        help="Pass the existing locally configured DeepSeek key to this isolated DSH process")
    parser.add_argument("--timeout", type=int, default=240,
                        help="Maximum seconds for each startup step (default: 240)")
    args = parser.parse_args()
    if args.timeout < 1:
        parser.error("--timeout must be positive")
    if not DSH.is_file() or not PLUGIN.is_dir():
        raise SystemExit("Project DSH or plugin not found; prepare the project environment first")
    if listening() and not args.use_existing_backend:
        raise SystemExit("Port 8765 is in use. Stop here or explicitly use --use-existing-backend")
    if args.use_existing_backend and not listening():
        raise SystemExit("No backend is listening on 127.0.0.1:8765")

    backend = None
    web = None
    install = None
    home = tempfile.TemporaryDirectory(prefix="labweave-dsh-preview-")
    try:
        env = {key: value for key, value in os.environ.items()
               if not key.upper().startswith(("DSH_", "DEEPSEEK_"))
               and key.upper() not in {"OPENAI_API_KEY", "ANTHROPIC_API_KEY",
                                       "GOOGLE_API_KEY", "GEMINI_API_KEY"}}
        env["DSH_HOME"] = home.name
        print("Installing the preview plugin into an isolated temporary DSH profile...", flush=True)
        # Capture output because DSH may emit credentials. Do not write it to a log.
        plugin_url = "file:" + str(PLUGIN).replace("\\", "/")
        install = start_process([str(DSH), "plugin", "--profile", "web", "add", plugin_url],
                                cwd=ROOT, env=env, stdout=subprocess.DEVNULL,
                                stderr=subprocess.DEVNULL)
        if install.wait(timeout=args.timeout) != 0:
            raise RuntimeError("DSH plugin installation failed")
        if args.use_configured_model:
            # Load only after installation so package-manager processes do not
            # inherit the key. Do not put it on the command line or in a log.
            sys.path.insert(0, str(ROOT / "demo/api"))
            from workspace import deepseek_key
            configured_key = deepseek_key()
            if not configured_key:
                raise RuntimeError("No local DeepSeek key is configured")
            env["DEEPSEEK_API_KEY"] = configured_key
        if not args.use_existing_backend:
            print("Starting the local LabWeave backend...", flush=True)
            backend = start_process([sys.executable, str(ROOT / "demo/api/main.py")], cwd=ROOT)
            deadline = time.monotonic() + args.timeout
            while not listening():
                if backend.poll() is not None:
                    raise RuntimeError("LabWeave backend exited during startup")
                if time.monotonic() >= deadline:
                    raise RuntimeError("LabWeave backend startup timed out")
                time.sleep(0.2)
        print("Starting the isolated DSH Web preview...", flush=True)
        web = start_web(env, args.timeout)
        print("Preview opened. Press Enter to stop services started by this launcher.", flush=True)
        if args.use_existing_backend:
            print("The existing backend will stay running.", flush=True)
        stop_requested = threading.Event()

        def wait_for_enter() -> None:
            try:
                if sys.stdin.readline():
                    stop_requested.set()
            except (OSError, ValueError):
                pass

        threading.Thread(target=wait_for_enter, daemon=True).start()
        while web.poll() is None and (backend is None or backend.poll() is None):
            if stop_requested.wait(0.5):
                break
    except KeyboardInterrupt:
        pass
    except RuntimeError as exc:
        # These messages are defined locally and contain no subprocess output.
        print(f"Preview could not be started: {exc}. The regular launcher remains available.", file=sys.stderr)
        return 1
    except (OSError, subprocess.SubprocessError) as exc:
        # Do not print command output, which may contain the one-time login URL.
        print(f"Preview could not be started ({type(exc).__name__}). The regular launcher remains available.", file=sys.stderr)
        return 1
    finally:
        stop_process(web)
        stop_process(backend)
        stop_process(install)
        home.cleanup()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
