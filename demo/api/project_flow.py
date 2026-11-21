"""Project-local, resumable updates shared by project conversations and Bots."""
from contextlib import closing
from datetime import datetime, timezone
import json

import workspace


def ensure(db):
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_project_flow(
        seq INTEGER PRIMARY KEY, project TEXT NOT NULL, event_key TEXT NOT NULL,
        kind TEXT NOT NULL, payload TEXT NOT NULL, UNIQUE(project,event_key))""")
    db.execute("""CREATE INDEX IF NOT EXISTS labweave_project_flow_scope
        ON labweave_project_flow(project,seq)""")


def append(db, project, key, kind, payload):
    db.execute("""INSERT INTO labweave_project_flow(project,event_key,kind,payload)
        VALUES(?,?,?,?) ON CONFLICT(project,event_key) DO NOTHING""",
               (project, key, kind, json.dumps(payload, ensure_ascii=False)))


def record_change(db, project, rail, record, action):
    if project == "global" or rail in {"chat", "feed"}:
        return
    ensure(db)
    identity = record["id"]
    updated = record.get("updatedAt") or record.get("updated") or record.get("ts") or datetime.now(timezone.utc).isoformat()
    payload = {"recordId": identity, "rail": rail, "action": action, "updatedAt": updated}
    if action != "removed":
        payload["title"] = workspace.text(record.get("title") or record.get("name") or record.get("text"), 180).split("\n", 1)[0]
        payload["summary"] = workspace.text(record.get("summary") or record.get("text"), 420)
        for key in ("status", "done", "featureId", "taskId", "metrics"):
            if key in record:
                payload[key] = record[key]
        sources = record.get("sources")
        if isinstance(sources, list):
            source_ids = [source["recordId"] for source in sources if isinstance(source, dict)
                          and isinstance(source.get("recordId"), str)]
            if source_ids:
                payload["sourceRecordIds"] = source_ids[:12]
    append(db, project, f"artifact:{rail}:{identity}:{action}:{updated}", "artifact", payload)


def write(project, data):
    session = workspace.text(data.get("sessionId"), 160)
    message = workspace.text(data.get("messageId"), 200)
    body = workspace.text(data.get("text"), 4000)
    if not session or not message or not body:
        raise workspace.WorkspaceError(400, "需要项目对话、消息与共享内容。")
    data_fields = {
        name: workspace.text(data.get(name), 400)
        for name in ("botId", "handoffId", "sourceSessionId", "followUpOf")
        if isinstance(data.get(name), str) and data[name]
    }
    kind = "decision" if data.get("action") == "decision" else "input"
    with closing(workspace.database()) as db, db:
        ensure(db)
        append(db, project, kind + ":" + session + ":" + message, kind,
               {"sessionId": session, "messageId": message, "text": body,
                "createdAt": datetime.now(timezone.utc).isoformat(), **data_fields})
    return {"ok": True}


def current_version(db, project):
    return db.execute("""SELECT coalesce(max(seq),0) FROM labweave_project_flow
        WHERE project=? AND kind='decision'""", (project,)).fetchone()[0]


def record_file_changes(project, data):
    session = workspace.text(data.get("sessionId"), 160)
    message = workspace.text(data.get("messageId"), 200)
    files = data.get("files")
    if not session or not message or not isinstance(files, list) or not 1 <= len(files) <= 100:
        raise workspace.WorkspaceError(400, "需要明确的项目对话和文件变更。")
    validated = []
    for item in files:
        path = item.get("path") if isinstance(item, dict) else None
        if (not isinstance(path, str) or len(path) > 1000 or "\\" in path or ":" in path or "\x00" in path
                or any(part in ("", ".", "..", ".git") for part in path.split("/"))
                or item.get("action") not in ("added", "changed", "removed")):
            raise workspace.WorkspaceError(400, "文件必须位于项目目录内。")
        validated.append({"path": path, "action": item["action"]})
    with closing(workspace.database()) as db, db:
        ensure(db)
        append(db, project, f"files:{session}:{message}", "file-change", {
            "sessionId": session, "files": validated, "createdAt": datetime.now(timezone.utc).isoformat(),
        })
    return {"ok": True}


def file_changes(project, session):
    with closing(workspace.database()) as db:
        ensure(db)
        rows = db.execute("""SELECT seq,payload FROM labweave_project_flow WHERE project=? AND kind='file-change'
            AND json_extract(payload,'$.sessionId')=? ORDER BY seq DESC LIMIT 30""", (project, session)).fetchall()
    return [{"id": seq, **json.loads(payload)} for seq, payload in rows]


def changed_prerequisites(db, project, task_ids):
    if not task_ids:
        return []
    if not isinstance(task_ids, list) or len(task_ids) > 12 or any(
            not isinstance(identity, str) or len(identity) > 100 for identity in task_ids):
        raise workspace.WorkspaceError(400, "无效的前置任务引用。")
    return [identity for identity, in db.execute("""SELECT ids.value FROM json_each(?) AS ids
        JOIN labweave_project_flow AS completed
          ON completed.project=? AND completed.event_key=ids.value || ':completed'
        WHERE EXISTS (
          SELECT 1 FROM labweave_project_flow AS revision
          WHERE revision.project=completed.project AND revision.seq>completed.seq AND revision.kind='artifact'
            AND json_extract(revision.payload,'$.action') IN ('updated','removed')
            AND json_extract(revision.payload,'$.recordId')=json_extract(completed.payload,'$.recordId')
        )""", (json.dumps(task_ids), project))]


def retract(project, data):
    session = workspace.text(data.get("sessionId"), 160)
    marker = workspace.text(data.get("messageId"), 200)
    messages = data.get("messageIds")
    if not session or not marker or not isinstance(messages, list) or any(
            not isinstance(message, str) or not 0 < len(message) <= 200 for message in messages):
        raise workspace.WorkspaceError(400, "需要有效的撤回来源。")
    withdrawn = []
    with closing(workspace.database()) as db, db:
        ensure(db)
        for message in dict.fromkeys(messages):
            change = db.execute("""UPDATE labweave_project_flow SET kind='withdrawn',payload='{}'
                WHERE project=? AND event_key=? AND kind='input'""",
                                (project, f"input:{session}:{message}"))
            if change.rowcount:
                withdrawn.append(message)
        if withdrawn:
            append(db, project, f"retraction:{session}:{marker}", "retraction",
                   {"sessionId": session, "messageIds": withdrawn})
    return {"ok": True}


def read(project, after=None, audience=None):
    if after is not None and (type(after) is not int or not 0 <= after < 2**63):
        raise workspace.WorkspaceError(400, "项目事件位置无效。")
    filters = "project=? AND kind NOT IN ('withdrawn','file-change')"
    params = [project]
    if audience and audience.get("artifactsOnly") is True:
        filters += " AND kind IN ('decision','artifact')"
    elif audience:
        session = audience.get("sessionId", "")
        parent = audience.get("parentSessionId") or session
        work = audience.get("taskIds") or []
        scope = """kind='decision'
            OR (kind='retraction' AND json_extract(payload,'$.sessionId') IN (?,?))
            OR (kind='input' AND (json_extract(payload,'$.sessionId')=?
                OR (json_extract(payload,'$.sessionId')=? AND json_extract(payload,'$.messageId')=?)))"""
        params.extend((session, parent, session, parent, audience.get("requestId")))
        if audience.get("includeArtifacts") is True:
            scope += " OR kind='artifact'"
        if work:
            scope += " OR (kind IN ('task','progress') AND json_extract(payload,'$.taskId') IN (" + ",".join("?" for _ in work) + "))"
            params.extend(work)
        else:
            scope += " OR (kind IN ('task','progress') AND json_extract(payload,'$.botId')=?)"
            params.append(audience.get("botId"))
        filters += " AND (" + scope + ")"
    with closing(workspace.database()) as db:
        ensure(db)
        if after is not None:
            filters += " AND seq>?"
            params.append(after)
        order = "DESC" if after is None else "ASC"
        rows = db.execute(f"""SELECT seq,kind,payload FROM labweave_project_flow
            WHERE {filters} ORDER BY seq {order} LIMIT 12""", params).fetchall()
        if after is None:
            rows.reverse()
        version = current_version(db, project)
        dependencies = changed_prerequisites(db, project, (audience or {}).get("dependencyTaskIds"))
    return {"events": [{"seq": seq, "kind": kind, **json.loads(payload)} for seq, kind, payload in rows],
            "cursor": rows[-1][0] if rows else after or 0, "version": version,
            **({"changedDependencies": dependencies} if dependencies else {})}
