"""Run the pinned DSH Web and its private LabWeave business service together."""
from contextlib import contextmanager
import hashlib
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

from start_dsh_preview import URL, start_process, stop_process

ROOT = Path(__file__).resolve().parents[1]
PLUGIN = ROOT / "plugins" / "dsh-labweave-prototype"
sys.path.insert(0, str(ROOT / "demo" / "api"))
import automation
import native_web
import research_workflows
import tasks
import workspace


def profile_home():
    identifier = hashlib.sha256(os.path.normcase(str(workspace.DATA.resolve())).encode()).hexdigest()[:16]
    base = (Path(os.environ.get("LOCALAPPDATA") or Path.home() / "AppData/Local") if os.name == "nt"
            else Path(os.environ.get("XDG_STATE_HOME") or Path.home() / ".local/state"))
    return base / "LabWeave" / "web" / identifier


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
            raise RuntimeError("此工作区已启动，请使用已打开的 DSH 页面。") from exc
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
    for plugin in (PLUGIN, ROOT / "plugins/dsh-labweave-workspace"):
        name = json.loads((plugin / "package.json").read_text())["name"]
        if name not in bundles:
            bundles.append(name)
        manifest.setdefault("dependencies", {})[name] = "file:" + plugin.as_posix()
        target = profile / "node_modules" / name
        target.mkdir(parents=True, exist_ok=True)
        for src in plugin.iterdir():
            if src.suffix in (".js", ".json", ".yml", ".svg", ".png"):
                write_changed(target / src.name, src.read_bytes())
    for filename in ("cordis.yml", "cordis.patch.yml"):
        if not (profile / filename).exists():
            write_changed(profile / filename, "[]\n")
    write_changed(manifest_path, json.dumps(manifest, ensure_ascii=False, indent=2) + "\n")


def native_env(home, backend, configured):
    env = {k: v for k, v in os.environ.items() if not k.upper().startswith(("DSH_", "DEEPSEEK_", "LABWEAVE_BRIDGE"))
           and k.upper() not in {"OPENAI_API_KEY", "ANTHROPIC_API_KEY", "GOOGLE_API_KEY", "GEMINI_API_KEY"}}
    env.update(DSH_HOME=str(home), LABWEAVE_BRIDGE_PORT=str(backend.server_port), LABWEAVE_BRIDGE_TOKEN=backend.token)
    if configured:
        key = workspace.deepseek_key()
        if key:
            env["DEEPSEEK_API_KEY"] = key
    return env


@contextmanager
def native_services(port=8770, *, home=None, configured=True, background=True, timeout=120):
    from deepseek_harness_runtime import resolve_bundled_launch_args
    home = home or profile_home()
    with app_lock(home):
        if port:
            with socket.socket() as probe:
                try:
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
                        match = URL.search(line)
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
                    raise RuntimeError("等待本机 DSH 启动超时。") from exc
                if not url or errors or not backend.ready.wait(timeout):
                    raise RuntimeError("DSH 科研插件未能启动，请检查本地运行环境。")
                yield url, process
            finally:
                stop_process(process)
                if process and process.stdout:
                    process.stdout.close()
                if stop_jobs is not None:
                    stop_jobs.set()
                    tasks.shutdown()
                    research_workflows.shutdown()
                backend.shutdown()
                thread.join()


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
            raise RuntimeError("旧版或另一份 LabWeave 服务占用 8765。请先关闭它，再启动科研工作区。") from exc
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
        print("正在启动本机 DSH 科研工作区…", flush=True)
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
                    raise RuntimeError(f"DSH 已退出（{process.returncode}）。")
        except KeyboardInterrupt:
            pass
        finally:
            if published:
                request.unlink(missing_ok=True)
                marker.unlink(missing_ok=True)
