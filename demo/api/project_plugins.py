"""Project-scoped instruction plugins; each invocation uses the project's DSH conversation."""
from contextlib import closing
import re
from uuid import uuid4

import naming
import project_service
import workspace


def database():
    db = workspace.database()
    db.execute("""CREATE TABLE IF NOT EXISTS native_plugins(
        id TEXT PRIMARY KEY, scope TEXT NOT NULL, name TEXT NOT NULL, prompt TEXT NOT NULL)""")
    return db


def list_for(scope):
    with closing(database()) as db:
        return [dict(zip(("id", "name", "prompt", "scope"), row)) for row in db.execute(
            "SELECT id,name,prompt,scope FROM native_plugins WHERE scope IN ('all',?) ORDER BY rowid", (scope,))]


def request_id(data):
    key = data.get("requestId")
    if not isinstance(key, str) or not re.fullmatch(r"[a-f0-9]{32}", key):
        raise workspace.WorkspaceError(400, "请求标识无效。")
    return key


def create(scope, data, identity=None):
    if scope != "all":
        if scope == "global" or not isinstance(scope, str):
            raise workspace.WorkspaceError(400, "请选择一个项目或全部项目。")
        project_service.project(workspace.snapshot(), scope)
    name = naming.display_name(data.get("name"))
    prompt = workspace.text(data.get("prompt"), 12000)
    if not prompt:
        raise workspace.WorkspaceError(400, "请输入插件在项目对话中执行的指令。")
    identity = "plugin_" + (identity or uuid4().hex)
    with closing(database()) as db, db:
        db.execute("INSERT OR IGNORE INTO native_plugins VALUES (?,?,?,?)", (identity, scope, name, prompt))
        saved = db.execute("SELECT scope,name,prompt FROM native_plugins WHERE id=?", (identity,)).fetchone()
        if saved != (scope, name, prompt):
            raise workspace.WorkspaceError(409, "该请求已用于不同的插件。")
    return {"id": identity}


def rename(caller, identity, name):
    with closing(database()) as db, db:
        row = db.execute("SELECT scope FROM native_plugins WHERE id=?", (identity,)).fetchone()
        if not row or caller not in ("global", row[0]):
            raise workspace.WorkspaceError(403, "此对话无法更改该插件。")
        label = naming.display_name(name)
        db.execute("UPDATE native_plugins SET name=? WHERE id=?", (label, identity))
    return {"id": identity, "name": label}
