"""Host transport for the same confined project runner on Linux and Windows/WSL2."""

import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import threading
import time

import project_service as projects
import workspace

WORKER = Path(__file__).with_name("sandbox_worker.py").resolve()
LOG_LIMIT = 1024 * 1024
FLAGS = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}


def environment_id(value):
    if not isinstance(value, str) or not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}", value):
        raise workspace.WorkspaceError(400, "请选择有效的项目虚拟环境。")
    return value


def host_env():
    keys = ("SystemRoot", "WINDIR", "LOCALAPPDATA", "USERPROFILE", "HOME", "PATH", "TEMP", "TMP", "LANG")
    return {key: os.environ[key] for key in keys if key in os.environ}


def wsl():
    exe = shutil.which("wsl.exe")
    if not exe:
        raise workspace.WorkspaceError(503, "项目代码沙盒需要 WSL2（Linux 发行版和 bubblewrap）。")
    distro = os.environ.get("LABWEAVE_WSL_DISTRO")
    return [exe] + (["--distribution", distro] if distro else []) + ["--cd", "/", "--exec"]


def diagnostics(proc):
    raw = proc.stderr.strip() or proc.stdout.strip()
    encoding = "utf-16-le" if b"\x00" in raw[:160] else "utf-8"
    text = raw.decode(encoding, "replace").replace("\x00", "").strip()
    return re.sub(r"\x1b\[[0-9;]*[A-Za-z]", "", text)[-700:]


# Resolve both paths inside the same WSL activation as the worker. No shell
# interprets either path and the parent's stdin lease survives execv.
WSL_START = """
import os, subprocess, sys
paths = [subprocess.check_output(['/usr/bin/wslpath','-a','-u',p], encoding='utf-8').strip() for p in sys.argv[1:]]
os.execv('/usr/bin/python3', ['/usr/bin/python3', '-I', *paths])
"""


def invocation(project, spec):
    root = projects.folder(project)
    expected = workspace.DATA / "projects" / project
    if (
        expected.is_symlink()
        or expected.is_junction()
        or root.parent != (workspace.DATA / "projects").resolve()
    ):
        raise workspace.WorkspaceError(403, "项目沙盒目录绑定无效。")
    launcher = (
        wsl() + ["/usr/bin/python3", "-I", "-c", WSL_START]
        if os.name == "nt"
        else ["/usr/bin/python3", "-I"]
    )
    return [*launcher, str(WORKER), str(root)], (json.dumps(spec, ensure_ascii=True) + "\n").encode()


def info(project, op, env_id="default"):
    try:
        launcher, data = invocation(project, {"operation": op, "environment": environment_id(env_id)})
        proc = subprocess.run(
            launcher, input=data, capture_output=True, timeout=65, env=host_env(), **FLAGS
        )
        if proc.returncode:
            reason = diagnostics(proc)
            raise workspace.WorkspaceError(503, reason or "Linux 项目沙盒未就绪。")
        return json.loads(proc.stdout)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        raise workspace.WorkspaceError(
            503, "无法连接 Linux 项目沙盒。请检查 Python 3、venv 和 bubblewrap。"
        ) from exc


def copy_log(stream, path):
    with stream, path.open("wb", buffering=0) as log:
        left = LOG_LIMIT
        for chunk in iter(lambda: os.read(stream.fileno(), 16384), b""):
            if left > 0:
                log.write(chunk[:left])
                left -= min(left, len(chunk))
                if not left:
                    log.write("\n[日志已达到 1 MiB 上限]\n".encode())


def execute(project, env_id, script, args, output, logs, timeout, stop, deadline=None, *, seed=0):
    root = projects.folder(project)
    launcher, data = invocation(
        project,
        {
            "operation": "run",
            "environment": environment_id(env_id),
            "script": script,
            "args": args,
            "output": output.relative_to(root).as_posix(),
            "timeout": timeout,
            "seed": seed,
        },
    )
    if stop.is_set():
        raise InterruptedError("运行已停止。")
    with subprocess.Popen(
        launcher,
        stdin=subprocess.PIPE,
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        env=host_env(),
        **FLAGS,
    ) as proc:
        readers = [
            threading.Thread(target=copy_log, args=(stream, logs / name), daemon=True)
            for stream, name in ((proc.stdout, "stdout.log"), (proc.stderr, "stderr.log"))
        ]
        for thread in readers:
            thread.start()
        try:
            proc.stdin.write(data)
            proc.stdin.flush()
            # Interpreter setup/WSL launch also has a finite host-side deadline.
            end = min(deadline or float("inf"), time.monotonic() + timeout + 25)
            while proc.poll() is None:
                if stop.wait(0.12):
                    raise InterruptedError("运行已停止。")
                if time.monotonic() >= end:
                    raise TimeoutError("运行时间预算已用尽。")
            code = proc.returncode
        finally:
            try:
                proc.stdin.close()
            except OSError:
                pass
            try:
                proc.wait(timeout=8)
            except subprocess.TimeoutExpired:
                proc.kill()
                proc.wait()
            for thread in readers:
                thread.join(timeout=4)
    receipt = logs / ".sandbox-exit"
    if not receipt.is_file():
        from types import SimpleNamespace

        message = diagnostics(
            SimpleNamespace(
                stdout=(logs / "stdout.log").read_bytes()[:4000],
                stderr=(logs / "stderr.log").read_bytes()[:4000],
            )
        )
        raise workspace.WorkspaceError(503, message or f"沙盒执行器未就绪（{code}）。")
    return int(receipt.read_text(encoding="ascii"))
