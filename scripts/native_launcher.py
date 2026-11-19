"""Run the pinned DSH Web and its private LabWeave business service together."""
from contextlib import contextmanager
import json
import os
from pathlib import Path
import queue
import re
import secrets
import signal
import socket
import subprocess
import sys
import threading
import time
import webbrowser

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "dsh-labweave-workspace"
LEGACY_PLUGIN = "labweave-dsh-prototype"
LOGIN_URL = re.compile(r"http://127\.0\.0\.1:\d+/\?token=[^\s\x1b]+")
sys.path.insert(0, str(ROOT / "demo" / "api"))
import automation
import model_config
import native_web
import project_sandbox
import research_workflows
import tasks
import workspace


def start_process(command, **kwargs):
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NEW_PROCESS_GROUP
    else:
        kwargs["start_new_session"] = True
    return subprocess.Popen(command, **kwargs)


def stop_process(process):
    if process is None or process.poll() is not None:
        return
    if os.name == "nt":
        # Target only the process tree started by Weave.
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


def profile_home():
    return model_config.profile_home(workspace.DATA)


@contextmanager
def app_lock(home):
    home.mkdir(mode=0o700, parents=True, exist_ok=True)
    with (home / "launcher.lock").open("a+b") as handle:
        handle.seek(0)
        try:
            if os.name == "nt":
                import msvcrt
                msvcrt.locking(handle.fileno(), msvcrt.LK_NBLCK, 1)
            else:
                import fcntl
                fcntl.flock(handle, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except OSError as exc:
            raise RuntimeError("此工作区已启动，请使用已打开的 Weave 页面。") from exc
        yield


def write_changed(path, data):
    encoded = data if isinstance(data, bytes) else data.encode()
    if path.is_file() and path.read_bytes() == encoded:
        return
    pending = path.with_name(path.name + ".labweave-tmp")
    pending.write_bytes(encoded)
    pending.replace(path)


def prepare_profile(home):
    # A project-owned Web profile uses the upstream bundle manifest format. Ship
    # the dependency-free local plugin as an unpacked Node package for offline use.
    profile = home / "profiles/web"
    profile.mkdir(parents=True, exist_ok=True)
    manifest_path = profile / "package.json"
    manifest = (json.loads(manifest_path.read_text(encoding="utf-8")) if manifest_path.exists()
                else {"name": "dsh-profile-web", "private": True, "dsh": {"profile": {
                    "bundles": ["@deepseek-ai/dsh-base", "@deepseek-ai/dsh-web-app"]}}})
    bundles = manifest["dsh"]["profile"]["bundles"]
    dependencies = manifest.setdefault("dependencies", {})
    # Replace the obsolete registration in place, preserving the remaining
    # profile entries and the existing directory for DSH settings and sessions.
    bundles[:] = [bundle for bundle in bundles if bundle != LEGACY_PLUGIN]
    dependencies.pop(LEGACY_PLUGIN, None)
    if "@deepseek-ai/dsh-client-ui-sidebar-browser" not in bundles:
        bundles.append("@deepseek-ai/dsh-client-ui-sidebar-browser")
    package_path = PLUGIN / "package.json"
    package = package_path.read_bytes()
    name = json.loads(package)["name"]
    if name not in bundles:
        bundles.append(name)
    dependencies[name] = "file:" + PLUGIN.as_posix()
    target = profile / "node_modules" / name
    for src in PLUGIN.rglob("*"):
        if src != package_path and src.suffix in (".js", ".json", ".yml", ".svg", ".png") and src.is_file():
            destination = target / src.relative_to(PLUGIN)
            destination.parent.mkdir(parents=True, exist_ok=True)
            write_changed(destination, src.read_bytes())
    write_changed(target / package_path.name, package)
    for filename in ("cordis.yml", "cordis.patch.yml"):
        if not (profile / filename).exists():
            write_changed(profile / filename, "[]\n")
    write_changed(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def native_env(home, backend, configured):
    strip_keys = set(model_config.COMMON_KEY_ENVS) | set(model_config.COMMON_URL_ENVS)
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("DSH_", "DEEPSEEK_", "LABWEAVE_BRIDGE", "LABWEAVE_DSH_WEB_HOME"))
           and k.upper() not in strip_keys}
    env.update(DSH_HOME=str(home), LABWEAVE_BRIDGE_PORT=str(backend.server_port), LABWEAVE_BRIDGE_TOKEN=backend.token)
    if configured:
        for k, v in model_config.configured_env_vars().items():
            if v:
                env[k] = v
        key = model_config.safe_deepseek_key()
        if key:
            env["DEEPSEEK_API_KEY"] = key
    return env


@contextmanager
def native_services(port=8770, *, home=None, configured=True, background=True, timeout=120):
    from deepseek_harness_runtime import resolve_bundled_launch_args
    home = home or profile_home()
    previous_web_home = os.environ.get("LABWEAVE_DSH_WEB_HOME")
    os.environ["LABWEAVE_DSH_WEB_HOME"] = str(home)
    try:
        with app_lock(home):
            if port:
                with socket.socket() as probe:
                    try:
                        # Match the Web listener on POSIX. Connections closing from
                        # the previous run may still be in TIME_WAIT after --stop.
                        if os.name == "posix":
                            probe.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
                        probe.bind(("127.0.0.1", port))
                    except OSError as exc:
                        raise RuntimeError(f"本机端口 {port} 已被占用。") from exc
            prepare_profile(home)
            with native_web.server() as backend:
                thread = threading.Thread(target=backend.serve_forever, daemon=True)
                thread.start()
                process = None
                stop_jobs = None
                try:
                    project_sandbox.recover()
                    if background:
                        tasks.recover()
                        research_workflows.recover()
                        stop_jobs = automation.start()
                    process = start_process([*resolve_bundled_launch_args(), "web", "--host", "127.0.0.1",
                                             "--port", str(port), "--no-open"], cwd=ROOT,
                                            env=native_env(home, backend, configured), stdout=subprocess.PIPE,
                                            stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace")
                    ready = queue.Queue()
                    errors = []
                    def read():
                        for line in process.stdout:
                            match = LOGIN_URL.search(line)
                            if match:
                                ready.put(match.group(0))
                            elif "labweave" in line.lower() and any(s in line.lower() for s in ("error", "failed", "cannot")):
                                # Upstream logs may contain credentials, URLs and user paths.
                                errors.append("插件加载失败")
                        ready.put(None)
                    reader = threading.Thread(target=read, daemon=True)
                    reader.start()
                    try:
                        url = ready.get(timeout=timeout)
                    except queue.Empty as exc:
                        raise RuntimeError("等待本机 Weave 启动超时。") from exc
                    if not url or errors or not backend.ready.wait(timeout):
                        raise RuntimeError("Weave 科研插件未能启动，请检查本地运行环境。")
                    yield url, process
                finally:
                    project_sandbox.shutdown()
                    stop_process(process)
                    if process and process.stdout:
                        process.stdout.close()
                    if stop_jobs is not None:
                        stop_jobs.set()
                        tasks.shutdown()
                        research_workflows.shutdown()
                    backend.shutdown()
                    thread.join()
    finally:
        if previous_web_home is None:
            os.environ.pop("LABWEAVE_DSH_WEB_HOME", None)
        else:
            os.environ["LABWEAVE_DSH_WEB_HOME"] = previous_web_home


@contextmanager
def business_owner():
    # A previous all-in-one legacy service may still own live task workers.
    # Acquire the same loopback port before recovery and hold it for this run.
    with socket.socket() as owner:
        if os.name == "nt":
            owner.setsockopt(socket.SOL_SOCKET, socket.SO_EXCLUSIVEADDRUSE, 1)
        try:
            owner.bind(("127.0.0.1", 8765))
        except OSError as exc:
            raise RuntimeError("本机端口 8765 已被占用。请先关闭占用该端口的服务，再启动 Weave。") from exc
        yield


def offline_backup(identity=None):
    import backup
    home = profile_home()
    with business_owner(), app_lock(home):
        if identity:
            result = backup.restore({"id": identity}, native_home=home)
            print("恢复完成。操作前的备份", backup.archive_path(result["rollback"]))
        else:
            result = backup.create(native_home=home)
            print("已备份科研数据和原生会话", backup.archive_path(result["id"]))


def request_stop():
    home = profile_home()
    marker = home / "instance.json"

    def current_instance():
        try:
            instance = json.loads(marker.read_text(encoding="utf-8")).get("instance")
        except FileNotFoundError:
            return None
        if not isinstance(instance, str) or not re.fullmatch(r"[0-9a-f]{32}", instance):
            raise RuntimeError("无法识别本地科研工作区的运行记录。")
        return instance

    instance = current_instance()
    if instance is None:
        print("当前没有由项目启动器运行的科研工作区。")
        return
    request = home / ("stop-" + instance)
    request.touch()
    deadline = time.monotonic() + 45
    while current_instance() == instance:
        if time.monotonic() >= deadline:
            raise RuntimeError("科研服务尚未响应停止请求。")
        time.sleep(.2)
    request.unlink(missing_ok=True)
    print("科研工作区已关闭。")


def launch(port, no_open):
    def interrupt(_signum, _frame):
        raise KeyboardInterrupt
    signal.signal(signal.SIGTERM, interrupt)
    with business_owner():
        print("正在启动本机 Weave 科研工作区…", flush=True)
        home = profile_home()
        marker = home / "instance.json"
        instance = secrets.token_hex(16)
        request = home / ("stop-" + instance)
        published = False
        try:
            with native_services(port, home=home) as (url, process):
                origin = url.split('/?')[0]
                write_changed(marker, json.dumps({"instance": instance, "origin": origin}))
                published = True
                if no_open:
                    print(url, flush=True)  # Explicit terminal-only login link, like upstream --no-open.
                elif not webbrowser.open(url):
                    print("请在本机浏览器打开以下一次性登录地址：", url, flush=True)
                print(f"科研工作区已启动于 {origin}。按 Ctrl+C 或使用 --stop 关闭。", flush=True)
                while process.poll() is None and not request.exists():
                    time.sleep(.3)
                if process.returncode:
                    raise RuntimeError(f"Weave 已退出（{process.returncode}）。")
        except KeyboardInterrupt:
            pass
        finally:
            if published:
                request.unlink(missing_ok=True)
                marker.unlink(missing_ok=True)
