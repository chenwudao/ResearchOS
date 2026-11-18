"""Trusted Linux/WSL worker. Only the wrapped argv ever executes project Python."""

import contextlib
import fcntl
import hashlib
import json
import os
from pathlib import Path
import re
import resource
import select
import shutil
import signal
import subprocess
import sys
import tempfile
import time
import venv


def bwrap():
    executable = shutil.which("bwrap", path="/usr/bin:/bin") or (
        Path.home() / ".local/share/labweave/tools/bubblewrap/usr/bin/bwrap"
    )
    if not os.access(executable, os.X_OK):
        raise ValueError("沙盒未就绪：请在 Linux 或 WSL2 发行版中安装 bubblewrap。")
    return str(executable)


def environments(root, make=None):
    namespace = hashlib.sha256(os.fsencode(root)).hexdigest()[:32]
    home = Path.home() / ".local/share/labweave/environments" / namespace
    home.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (home / ".lock").open("a+") as lock:
        fcntl.flock(lock, fcntl.LOCK_EX)
        if make:
            if (
                not re.fullmatch(r"[a-zA-Z0-9][a-zA-Z0-9_-]{0,39}", make)
                or make.startswith("local-")
                or make
                in (
                    "project",
                    "experiments",
                )
            ):
                raise ValueError("环境名须为 1–40 位英文、数字、下划线或减号。")
            target = home / make
            if not target.exists():
                # Do not expose a half-created venv. Keep its final path for activation scripts.
                try:
                    venv.EnvBuilder(symlinks=True, with_pip=False).create(target)
                except Exception:
                    if target.is_dir() and not target.is_symlink():
                        shutil.rmtree(target)
                    raise
        candidates = {d.name: d for d in home.iterdir() if d.is_dir() and not d.is_symlink()}
        for key, rel in (("project", ".venv"), ("experiments", "experiments/.venv")):
            folder = root / rel
            if folder.is_dir() and folder.resolve().is_relative_to(root):
                candidates[key] = folder
        # Discover named project venvs without walking datasets and repositories.
        for rel in (".venvs", "experiments/environments"):
            parent = root / rel
            if not parent.is_dir() or not parent.resolve().is_relative_to(root):
                continue
            for folder in parent.iterdir():
                if folder.is_dir() and not folder.is_symlink() and folder.resolve().is_relative_to(root):
                    key = "local-" + hashlib.sha256(os.fsencode(folder.relative_to(root))).hexdigest()[:16]
                    candidates[key] = folder
        return {
            k: d
            for k, d in candidates.items()
            if (d / "pyvenv.cfg").is_file() and (d / "bin/python").is_file()
        }


def within(root, relative, *, directory=False):
    if not relative or Path(relative).is_absolute() or ".." in Path(relative).parts:
        raise ValueError("沙盒路径必须在当前项目内。")
    target = (root / relative).resolve(strict=True)
    correct_type = target.is_dir() if directory else target.is_file()
    if not target.is_relative_to(root) or target == root or not correct_type:
        raise ValueError("沙盒输入或输出路径无效。")
    return target


def command(root, env_id, env, out, args, seed=0):
    cmd = [
        bwrap(),
        "--unshare-all",
        "--unshare-user",
        "--disable-userns",
        "--new-session",
        "--die-with-parent",
        "--cap-drop",
        "ALL",
        "--clearenv",
        "--ro-bind",
        "/usr",
        "/usr",
    ]
    for folder in ("/bin", "/lib", "/lib64", "/sbin"):
        path = Path(folder)
        if path.is_symlink():
            cmd.extend(["--symlink", os.readlink(path), folder])
        elif path.is_dir():
            cmd.extend(["--ro-bind", folder, folder])
    cmd.extend(
        [
            "--proc",
            "/proc",
            "--dev",
            "/dev",
            "--size",
            str(64 << 20),
            "--tmpfs",
            "/tmp",
            "--ro-bind",
            str(root),
            "/workspace",
            "--ro-bind",
            str(env),
            "/env",
        ]
    )
    if out is not None:
        cmd.extend(["--bind", str(out), "/output"])
    cmd.extend(["--remount-ro", "/", "--chdir", "/workspace"])
    variables = {
        "VIRTUAL_ENV": "/env",
        "PATH": "/env/bin:/usr/bin:/bin",
        "HOME": "/tmp",
        "TMPDIR": "/tmp",
        "LANG": "C.UTF-8",
        "PYTHONNOUSERSITE": "1",
        "PYTHONUTF8": "1",
        "PYTHONHASHSEED": str(seed),
        "OMP_NUM_THREADS": "1",
        "OPENBLAS_NUM_THREADS": "1",
        "MKL_NUM_THREADS": "1",
        "LABWEAVE_ENV_ID": env_id,
        "LABWEAVE_PROJECT": "/workspace",
        "LABWEAVE_OUTPUT_DIR": "/output",
    }
    for name, value in variables.items():
        cmd.extend(["--setenv", name, value])
    return cmd + ["--", "/env/bin/python", "-B", "-u", *args]


def limit_resources(timeout):
    def cap(kind, amount):
        _, hard = resource.getrlimit(kind)
        maximum = amount if hard == resource.RLIM_INFINITY else min(hard, amount)
        resource.setrlimit(kind, (maximum, maximum))

    cap(resource.RLIMIT_CPU, timeout + 2)
    cap(resource.RLIMIT_AS, 2 << 30)
    cap(resource.RLIMIT_FSIZE, 32 << 20)
    cap(resource.RLIMIT_NOFILE, 256)
    cap(resource.RLIMIT_NPROC, 192)
    cap(resource.RLIMIT_CORE, 0)


def supervise(argv, timeout):
    # The open stdin pipe is a lease held by the host. EOF also reaches WSL on a host crash.
    with tempfile.TemporaryFile() as info:
        confined = [argv[0], "--info-fd", str(info.fileno()), *argv[1:]]
        process = subprocess.Popen(
            confined,
            stdin=subprocess.DEVNULL,
            start_new_session=True,
            preexec_fn=lambda: limit_resources(timeout),
            pass_fds=(info.fileno(),),
        )
        code = watch(process, timeout)
        info.seek(0)
        if not info.read(4096).strip() and code not in (124, 130):
            raise ValueError("内核未能建立受限沙盒，请查看启动日志。")
        return code


def watch(process, timeout):
    try:
        deadline = time.monotonic() + timeout
        while process.poll() is None:
            if time.monotonic() >= deadline:
                print("沙盒运行超时。", file=sys.stderr, flush=True)
                return 124
            if select.select([sys.stdin.buffer], [], [], 0.1)[0]:
                return 130
        return process.returncode
    finally:
        if process.poll() is None:
            with contextlib.suppress(ProcessLookupError):
                os.killpg(process.pid, signal.SIGKILL)
            process.wait()


def main():
    spec = json.loads(sys.stdin.buffer.readline())
    root = Path(sys.argv[1]).resolve(strict=True)
    if not root.is_dir():
        raise ValueError("项目目录不存在。")
    op = spec["operation"]
    env_id = spec.get("environment", "default")
    bwrap()
    envs = environments(
        root, make=env_id if op == "create" or (env_id == "default" and op in ("run", "inspect")) else None
    )
    if op in ("list", "create"):
        if op == "create" and env_id not in envs:
            raise ValueError("该项目环境不完整，请选择或创建另一个环境。")
        result = []
        for key, folder in sorted(envs.items()):
            cfg = (folder / "pyvenv.cfg").read_text(encoding="utf8", errors="replace")
            version = re.search(r"^version\s*=\s*([0-9.]+)", cfg, re.M)
            label = folder.relative_to(root).as_posix() if folder.is_relative_to(root) else key
            result.append(
                {
                    "id": key,
                    "label": label,
                    "path": str(folder),
                    "pythonVersion": version[1] if version else "",
                }
            )
        print(json.dumps(result))
        return 0
    if env_id not in envs:
        raise ValueError("所选项目 Python 环境不存在或与 Linux 执行后端不兼容。")
    if op == "inspect":
        probe = (
            "import json,sys,platform,importlib.metadata as m;"
            'print(json.dumps({"python":sys.version,"platform":platform.platform(),'
            '"packages":sorted((d.metadata["Name"],d.version) for d in m.distributions() if d.metadata["Name"])}))'
        )
        argv = command(root, env_id, envs[env_id], None, ["-I", "-c", probe])
        return subprocess.run(
            argv, stdin=subprocess.DEVNULL, timeout=35, preexec_fn=lambda: limit_resources(35)
        ).returncode
    if op != "run":
        raise ValueError("未知的沙盒操作。")
    script = within(root, spec["script"])
    out = within(root, spec["output"], directory=True)
    if (
        script.suffix != ".py"
        or not isinstance(spec["args"], list)
        or not all(isinstance(s, str) for s in spec["args"])
    ):
        raise ValueError("需要项目内 Python 脚本和参数列表。")
    timeout = int(spec["timeout"])
    if not 1 <= timeout <= 86400:
        raise ValueError("运行时限无效。")
    argv = command(
        root,
        env_id,
        envs[env_id],
        out,
        ["/workspace/" + script.relative_to(root).as_posix(), *spec["args"]],
        int(spec.get("seed", 0)),
    )
    exit_code = supervise(argv, timeout)
    # The guest sees this directory only through the read-only project mount.
    (out.parent / ".sandbox-exit").write_text(str(exit_code), encoding="ascii")
    return exit_code


if __name__ == "__main__":
    try:
        sys.exit(main())
    except (OSError, ValueError, subprocess.SubprocessError) as error:
        print("项目沙盒：" + str(error), file=sys.stderr)
        sys.exit(125)
