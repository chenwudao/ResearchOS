"""Portable local backups with SQLite snapshot and validated staged restore."""
from contextlib import closing
from datetime import datetime
import json
from pathlib import Path
import shutil
import sqlite3
import tempfile
from uuid import uuid4
import zipfile

import workspace
from functools import wraps

NATIVE_PATHS = ("sessions", "storages/workspace.json", "storages/schedule.json",
                "storages/session_projcache")
BUSINESS_DIRS = ("pdf", "projects", "dsh-home", "experiments")


def backup_dir():
    path = workspace.DATA.parent / "backups"
    path.mkdir(parents=True, exist_ok=True)
    return path


def archive_path(identity):
    if not isinstance(identity, str) or not identity.endswith(".zip") or Path(identity).name != identity:
        raise workspace.WorkspaceError(400, "无效备份名称。")
    return backup_dir() / identity


def available():
    return [{"id": path.name, "bytes": path.stat().st_size}
            for path in sorted(backup_dir().glob("*.zip"), reverse=True)]


def idle():
    import project_sandbox
    if project_sandbox.ACTIVE:
        raise workspace.WorkspaceError(409, "请先停止项目代码沙盒中的运行。")
    import tasks
    import research_workflows
    if research_workflows.ACTIVE or any(w['status'] == 'RUNNING' for w in research_workflows.all_workflows()):
        raise workspace.WorkspaceError(409, '请先暂停科研工作流并等待实验进程停止。')
    if any(task["status"] in ("RUNNING", "QUEUED") or task.get("pending")
           for task in tasks.all_tasks() if task["status"] not in tasks.TERMINAL):
        raise workspace.WorkspaceError(409, "请先完成或取消正在执行的任务。")


def quiescent(operation):
    @wraps(operation)
    def run(*args, **kwargs):
        import automation, tasks, research_workflows
        with automation.RUN_LOCK, tasks.LOCK, research_workflows.LOCK:
            return operation(*args, **kwargs)
    return run


@quiescent
def create(payload=None, *, native_home=None):
    idle()
    identity = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid4().hex[:8] + ".zip"
    destination = archive_path(identity)
    with tempfile.TemporaryDirectory(dir=destination.parent) as temporary:
        snapshot = Path(temporary) / "workspace.sqlite3"
        pending = Path(temporary) / "snapshot.zip"
        with closing(workspace.database()) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
        with zipfile.ZipFile(pending, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(snapshot, "workspace.sqlite3")
            manifest = {"format": 1} if native_home is None else {
                "format": 2, "dataRoot": str(workspace.DATA.resolve())}
            archive.writestr("backup.json", json.dumps(manifest))
            if native_home is not None:
                for name in NATIVE_PATHS:
                    source = native_home / name
                    paths = source.rglob("*") if source.is_dir() else (source,)
                    for path in paths:
                        if path.is_file() and not path.is_symlink() and path.resolve().is_relative_to(native_home.resolve()):
                            archive.write(path, "native/" + path.relative_to(native_home).as_posix())
            roots = BUSINESS_DIRS + (("web-global",) if native_home is not None else ())
            for root in roots:
                folder = workspace.DATA / root
                if not folder.exists():
                    continue
                for path in folder.rglob("*"):
                    relative = path.relative_to(workspace.DATA)
                    if (path.is_file() and not path.is_symlink()
                            and path.resolve().is_relative_to(workspace.DATA.resolve())
                            and not any(part in (".venv", "node_modules", "cache", "credentials") for part in relative.parts)
                            and not any(word in path.name.lower() for word in ("credential", "secret", ".key"))):
                        archive.write(path, relative.as_posix())
        pending.replace(destination)
    return {"id": identity}


@quiescent
def restore(payload, *, native_home=None):
    idle()
    source = archive_path(payload.get("id"))
    if not source.is_file():
        raise workspace.WorkspaceError(404, "备份不存在。")
    with tempfile.TemporaryDirectory(prefix="researchos-restore-", dir=workspace.DATA.parent) as temporary:
        stage = Path(temporary).resolve()
        with zipfile.ZipFile(source) as archive:
            if sum(item.file_size for item in archive.infolist()) > 512 * 1024 ** 2:
                raise workspace.WorkspaceError(413, "备份展开后超过 512 MiB。")
            for member in archive.infolist():
                target = (stage / member.filename).resolve()
                if not target.is_relative_to(stage) or "\\" in member.filename:
                    raise workspace.WorkspaceError(400, "备份包含无效路径。")
                if (member.external_attr >> 16) & 0o170000 == 0o120000:
                    raise workspace.WorkspaceError(400, "备份包含符号链接。")
            archive.extractall(stage)
        manifest = json.loads((stage / "backup.json").read_text())
        native = manifest.get("format") == 2
        if native and native_home is None:
            raise workspace.WorkspaceError(409, "请关闭 Weave，使用项目启动器的 --restore 恢复原生会话。")
        if native and manifest.get("dataRoot") != str(workspace.DATA.resolve()):
            raise workspace.WorkspaceError(409, "原生会话绑定了绝对目录，请在原项目数据位置恢复。")
        if not native and manifest != {"format": 1}:
            raise workspace.WorkspaceError(400, "备份版本不支持。")
        with closing(sqlite3.connect(stage / "workspace.sqlite3")) as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise workspace.WorkspaceError(400, "备份数据库损坏。")
            if db.execute("PRAGMA user_version").fetchone()[0] != 1:
                raise workspace.WorkspaceError(400, "备份数据版本不支持。")
        rollback = create(native_home=native_home)
        swapped = []
        # The native profile can be on a different drive from the research data.
        native_stage = tempfile.TemporaryDirectory(dir=native_home) if native else None
        try:
            if native:
                staging = Path(native_stage.name)
                for index, name in enumerate(NATIVE_PATHS):
                    destination = native_home / name
                    incoming = stage / "native" / name
                    previous = staging / f"previous-{index}"
                    replacement = staging / f"incoming-{index}"
                    if incoming.is_dir():
                        shutil.copytree(incoming, replacement)
                    elif incoming.is_file():
                        shutil.copy2(incoming, replacement)
                    destination.parent.mkdir(exist_ok=True, parents=True)
                    if destination.exists():
                        destination.rename(previous)
                    swapped.append((destination, previous))
                    if replacement.exists():
                        replacement.rename(destination)
            roots = BUSINESS_DIRS + (("web-global",) if native else ())
            for name in roots:
                destination = workspace.DATA / name
                previous = stage / ("previous-" + name)
                if destination.exists():
                    destination.rename(previous)
                swapped.append((destination, previous))
                if (stage / name).is_dir():
                    (stage / name).rename(destination)
            shutil.copy2(stage / "workspace.sqlite3", workspace.DATA / "restore.sqlite3")
            (workspace.DATA / "restore.sqlite3").replace(workspace.DATA / "workspace.sqlite3")
        except Exception:
            for destination, previous in reversed(swapped):
                if destination.exists():
                    destination.rename(previous.with_name("failed-" + previous.name))
                if previous.exists():
                    previous.rename(destination)
            raise
        finally:
            if native_stage is not None:
                native_stage.cleanup()
        import tasks
        tasks.recover()
        import research_workflows
        research_workflows.recover()
    return {"restored": source.name, "rollback": rollback["id"]}
