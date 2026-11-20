"""Offline disposal of confirmed Weave deletions for the pinned DSH store."""
from contextlib import closing
import json
import os
from pathlib import Path
import re
from tempfile import NamedTemporaryFile

import model_config
import workspace


SESSION_ID = re.compile(r"[A-Za-z0-9_-]{1,160}")
TRANSCRIPT = re.compile(r"session(?:\.v[0-9]+)?\.jsonl(?:\.zstd)?")


def _ensure(db):
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_session_deletions(
        profile TEXT NOT NULL, session TEXT NOT NULL, PRIMARY KEY(profile,session))""")


def enqueue(db, session_ids):
    if not isinstance(session_ids, list) or any(
        not isinstance(identity, str) or not SESSION_ID.fullmatch(identity) for identity in session_ids
    ):
        raise workspace.WorkspaceError(400, "会话标识无法用于本机清理。")
    _ensure(db)
    profile = str(model_config.active_web_home().resolve())
    db.executemany("INSERT OR IGNORE INTO labweave_session_deletions VALUES(?,?)",
                   ((profile, identity) for identity in session_ids))


def queue_session_deletions(session_ids):
    with closing(workspace.database()) as db, db:
        enqueue(db, session_ids)


def _safe(path, root):
    for part in (path, *path.parents):
        if part == root:
            return True
        if part.is_symlink() or part.is_junction():
            return False
    return False


def _prune_logs(home, identities):
    sessions = home / "sessions"
    if not _safe(sessions, home):
        raise OSError("unsafe session storage")
    if sessions.is_dir():
        for bucket in sessions.iterdir():
            if not bucket.is_dir() or not _safe(bucket, home):
                continue
            for folder in bucket.iterdir():
                if folder.name not in identities:
                    continue
                if not _safe(folder, home):
                    raise OSError("unsafe session directory")
                if not folder.is_dir():
                    continue
                for file in folder.iterdir():
                    if not TRANSCRIPT.fullmatch(file.name):
                        continue
                    if not _safe(file, home):
                        raise OSError("unsafe session transcript")
                    if file.is_file():
                        file.unlink()
                if not any(folder.iterdir()):
                    folder.rmdir()
    for identity in identities:
        cache = home / "storages" / "session_projcache" / "sessions" / f"{identity}.json"
        if not _safe(cache, home):
            raise OSError("unsafe session index")
        if cache.is_file():
            cache.unlink()


def _prune_registry(home, identities):
    path = home / "storages" / "workspace.json"
    if not _safe(path, home):
        raise OSError("unsafe workspace registry")
    if not path.is_file():
        return
    data = json.loads(path.read_text(encoding="utf-8"))
    if not isinstance(data, dict) or not isinstance(data.get("global"), dict) or not isinstance(data.get("tables"), dict):
        raise ValueError("unsupported workspace registry")
    state = data["global"]
    registry = data["tables"].get("workspaces", {})
    if not isinstance(registry, dict) or any(not isinstance(entry, dict) for entry in registry.values()):
        raise ValueError("unsupported workspace table")
    snapshot = json.dumps(data, ensure_ascii=False)
    for key in ("archivedSessionIds", "pinnedSessionIds"):
        if key in state:
            if not isinstance(state[key], list):
                raise ValueError("unsupported session index")
            state[key] = [identity for identity in state[key] if identity not in identities]
    for entry in registry.values():
        if "sessionIds" in entry:
            if not isinstance(entry["sessionIds"], list):
                raise ValueError("unsupported workspace sessions")
            entry["sessionIds"] = [identity for identity in entry["sessionIds"] if identity not in identities]
    encoded = json.dumps(data, ensure_ascii=False)
    if snapshot != encoded:
        with NamedTemporaryFile(dir=path.parent, prefix="weave-session-cleanup-", delete=False, mode="w", encoding="utf-8") as file:
            temporary = Path(file.name)
            file.write(encoded)
        try:
            os.replace(temporary, path)
        finally:
            temporary.unlink(missing_ok=True)


def purge_offline(home):
    """Run while the launcher lock is held and the Web process is stopped."""
    home = Path(home).resolve()
    with closing(workspace.database()) as db, db:
        _ensure(db)
        identities = {row[0] for row in db.execute("SELECT session FROM labweave_session_deletions WHERE profile=?", (str(home),))
                      if SESSION_ID.fullmatch(row[0])}
        if not identities:
            return
        _prune_logs(home, identities)
        _prune_registry(home, identities)
        db.executemany("DELETE FROM labweave_session_deletions WHERE profile=? AND session=?",
                       ((str(home), identity) for identity in identities))
