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
    import tasks
    if any(task["status"] in ("RUNNING", "QUEUED") or task.get("pending")
           for task in tasks.all_tasks() if task["status"] not in tasks.TERMINAL):
        raise workspace.WorkspaceError(409, "请先完成或取消正在执行的任务。")


def quiescent(operation):
    @wraps(operation)
    def run(*args, **kwargs):
        import automation, tasks
        with automation.RUN_LOCK, tasks.LOCK:
            return operation(*args, **kwargs)
    return run


@quiescent
def create(payload=None):
    idle()
    identity = datetime.now().strftime("%Y%m%d-%H%M%S-") + uuid4().hex[:8] + ".zip"
    destination = archive_path(identity)
    with tempfile.TemporaryDirectory() as temporary:
        snapshot = Path(temporary) / "workspace.sqlite3"
        with closing(workspace.database()) as source, closing(sqlite3.connect(snapshot)) as target:
            source.backup(target)
        with zipfile.ZipFile(destination, "w", zipfile.ZIP_DEFLATED) as archive:
            archive.write(snapshot, "workspace.sqlite3")
            archive.writestr("backup.json", json.dumps({"format": 1}))
            for root in ("pdf", "projects", "dsh-home", "experiments"):
                folder = workspace.DATA / root
                if not folder.exists():
                    continue
                for path in folder.rglob("*"):
                    relative = path.relative_to(workspace.DATA)
                    if (path.is_file() and not path.is_symlink()
                            and not any(part in (".venv", "node_modules", "cache", "credentials") for part in relative.parts)
                            and not any(word in path.name.lower() for word in ("credential", "secret", ".key"))):
                        archive.write(path, relative.as_posix())
    return {"id": identity}


@quiescent
def restore(payload):
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
        if json.loads((stage / "backup.json").read_text()) != {"format": 1}:
            raise workspace.WorkspaceError(400, "备份版本不支持。")
        with closing(sqlite3.connect(stage / "workspace.sqlite3")) as db:
            if db.execute("PRAGMA integrity_check").fetchone()[0] != "ok":
                raise workspace.WorkspaceError(400, "备份数据库损坏。")
            if db.execute("PRAGMA user_version").fetchone()[0] != 1:
                raise workspace.WorkspaceError(400, "备份数据版本不支持。")
        rollback = create()
        swapped = []
        try:
            for name in ("pdf", "projects", "dsh-home", "experiments"):
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
                    destination.rename(stage / ("failed-" + destination.name))
                if previous.exists():
                    previous.rename(destination)
            raise
        import tasks
        tasks.recover()
    return {"restored": source.name, "rollback": rollback["id"]}
