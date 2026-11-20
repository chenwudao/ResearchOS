"""Project-local history for one-time assignments sent to native Bot workers."""
from contextlib import closing
from datetime import datetime, timezone
import re

import features
import workspace


TERMINAL = frozenset({"completed", "blocked", "needs_follow_up", "incomplete",
                      "failed", "cancelled", "interrupted"})
IDENTITY = re.compile(r"weave-bot-run-[0-9a-f]{32}")
DETAIL_COLUMNS = """id, feature, bot_name, parent_session, task, status, title, answer,
                    record_id, detail, created_at, updated_at"""
PREVIEW_COLUMNS = """id, feature, bot_name, parent_session, substr(task,1,180), status, title, '',
                     record_id, '', created_at, updated_at"""


def _time():
    return datetime.now(timezone.utc).isoformat()


def _ensure(db):
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_dispatches(
        project TEXT NOT NULL, id TEXT NOT NULL, feature TEXT NOT NULL, bot_name TEXT NOT NULL,
        parent_session TEXT NOT NULL, task TEXT NOT NULL, status TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project,id))""")
    db.execute("""CREATE INDEX IF NOT EXISTS labweave_bot_dispatch_project_time
        ON labweave_bot_dispatches(project, updated_at DESC)""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_canvas_drafts(
        project TEXT NOT NULL, dispatch TEXT NOT NULL, card TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project,dispatch,card))""")


def start(project, parent, jobs):
    if not isinstance(parent, str) or not parent or len(parent) > 160 or not isinstance(jobs, list) or not 1 <= len(jobs) <= 3:
        raise workspace.WorkspaceError(400, "需要发起对话和一至三项 Bot 任务。")
    bots = {item["id"]: item for item in features.list_features(project, project)
            if item.get("paradigm") and not item.get("archived")}
    now = _time()
    pending = []
    for job in jobs:
        if not isinstance(job, dict):
            raise workspace.WorkspaceError(400, "无效的分派任务。")
        identity, fid, task = job.get("id"), job.get("featureId"), workspace.text(job.get("task"), 8000)
        if not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(fid, str) or fid not in bots or not task:
            raise workspace.WorkspaceError(400, "请提供本项目已有 Bot 和具体任务。")
        pending.append((project, identity, fid, bots[fid]["label"], parent, task, now, now))
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM projects WHERE id=?", (project,)).fetchone() is None:
            raise workspace.WorkspaceError(404, "科研项目不存在。")
        db.executemany("""INSERT INTO labweave_bot_dispatches
            (project,id,feature,bot_name,parent_session,task,created_at,updated_at,status)
            VALUES(?,?,?,?,?,?,?,?,'queued') ON CONFLICT(project,id) DO NOTHING""", pending)
    return {"accepted": True}


def update(project, identity, status, result):
    if (not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(status, str)
            or (status != "running" and status not in TERMINAL) or not isinstance(result, dict)):
        raise workspace.WorkspaceError(400, "无效的 Bot 任务状态。")
    detail = next((text for key in ("archiveError", "retirementError", "detail", "reason")
                   if (text := workspace.text(result.get(key), 1600))), "")
    with closing(workspace.database()) as db, db:
        _ensure(db)
        if status == "running":
            db.execute("""UPDATE labweave_bot_dispatches SET status=?,updated_at=?
                WHERE project=? AND id=? AND status='queued'""", (status, _time(), project, identity))
        else:
            db.execute("""UPDATE labweave_bot_dispatches
                SET status=?,title=?,answer=?,record_id=?,detail=?,updated_at=?
                WHERE project=? AND id=? AND status IN ('queued','running')""",
                       (status, workspace.text(result.get("title"), 200), workspace.text(result.get("answer"), 16000),
                        workspace.text(result.get("recordId"), 160), detail, _time(), project, identity))
    return {"ok": True}


def _present(row, bots):
    identity, fid, original, parent, task, status, title, answer, record, detail, created, updated = row
    bot = bots.get(fid)
    cluster = bots.get(bot.get("clusterParent")) if bot else None
    return {"id": identity, "featureId": fid, "botLabel": bot["label"] if bot else original,
            "clusterId": cluster["id"] if cluster else None, "clusterLabel": cluster["label"] if cluster else None,
            "parentSessionId": parent, "status": status, "task": task, "title": title, "answer": answer,
            "recordId": record, "detail": detail, "createdAt": created, "updatedAt": updated,
            "botState": "removed" if bot is None else "archived" if bot.get("archived") else "active"}


def publish_draft(project, identity, args):
    if not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(args, dict):
        raise workspace.WorkspaceError(400, "无效的 Bot 分派草稿。")
    card = args.get("key")
    title = workspace.text(args.get("title"), 200)
    body = workspace.text(args.get("text"), 8000)
    category = workspace.text(args.get("category"), 80)
    if not isinstance(card, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", card) or not title or not body:
        raise workspace.WorkspaceError(400, "请填写草稿的标识、标题和内容。")
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("BEGIN IMMEDIATE")
        job = db.execute("SELECT status FROM labweave_bot_dispatches WHERE project=? AND id=?",
                         (project, identity)).fetchone()
        if not job or job[0] not in ("queued", "running"):
            raise workspace.WorkspaceError(409, "只有工作中的 Bot 可以更新这项草稿。")
        entries = db.execute("SELECT card FROM labweave_bot_canvas_drafts WHERE project=? AND dispatch=?",
                             (project, identity)).fetchall()
        if len(entries) >= 12 and (card,) not in entries:
            raise workspace.WorkspaceError(400, "请更新本次任务已有的草稿。")
        db.execute("""INSERT INTO labweave_bot_canvas_drafts VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(project,dispatch,card) DO UPDATE SET title=excluded.title,body=excluded.body,
            category=excluded.category,updated_at=excluded.updated_at""",
                   (project, identity, card, title, body, category, _time()))
    return {"id": f"draft:{identity}:{card}"}


def canvas(project, feature):
    members = [bot for bot in features.list_features(project, project)
               if bot["id"] == feature or bot.get("clusterParent") == feature]
    if not members or not any(bot["id"] == feature and bot.get("paradigm") for bot in members):
        raise workspace.WorkspaceError(404, "未找到这个 Bot。")
    names = {bot["id"]: bot["label"] for bot in members}
    slots = ",".join("?" for _ in names)
    with closing(workspace.database()) as db:
        _ensure(db)
        jobs = db.execute(f"""SELECT id,feature,status,task,title,answer,updated_at
            FROM labweave_bot_dispatches WHERE project=? AND feature IN ({slots}) AND record_id=''
            ORDER BY (status IN ('queued','running')) DESC,updated_at DESC LIMIT 30""",
                          (project, *names)).fetchall()
        items = []
        for identity, bot, status, task, title, answer, stamp in jobs:
            drafts = db.execute("""SELECT card,title,body,category,updated_at FROM labweave_bot_canvas_drafts
                WHERE project=? AND dispatch=? ORDER BY updated_at DESC, card""", (project, identity)).fetchall()
            if not drafts and status in ("queued", "running", "needs_follow_up", "completed"):
                drafts = [("overview", title or task.splitlines()[0][:120], answer or task, "", stamp)]
            elif answer and status in ("needs_follow_up", "completed") and all(draft[2] != answer for draft in drafts):
                drafts.insert(0, ("final:result", title or task.splitlines()[0][:120], answer, "", stamp))
            items.extend({"id": f"draft:{identity}:{card}", "title": heading, "text": body,
                          "category": category, "ts": updated, "canvasDraft": True, "dispatchStatus": status,
                          "canvasRail": bot, **({"canvasGroup": names[bot]} if len(names) > 1 else {})}
                         for card, heading, body, category, updated in drafts)
    return {"active": sum(job[2] in ("queued", "running") for job in jobs), "drafts": items}


def view(project, *, summary=False, identity=None):
    with closing(workspace.database()) as db:
        _ensure(db)
        if identity is None:
            active = db.execute("""SELECT COUNT(*) FROM labweave_bot_dispatches
                WHERE project=? AND status IN ('queued','running')""", (project,)).fetchone()[0]
            if summary:
                return {"activeCount": active}
            rows = db.execute(
                f"""SELECT {PREVIEW_COLUMNS} FROM labweave_bot_dispatches WHERE project=?
                    ORDER BY (status IN ('queued','running')) DESC, updated_at DESC, rowid DESC LIMIT ?""",
                (project, active + 60),
            ).fetchall()
        else:
            row = db.execute(
                f"SELECT {DETAIL_COLUMNS} FROM labweave_bot_dispatches WHERE project=? AND id=?", (project, identity)
            ).fetchone()
            if row is None:
                raise workspace.WorkspaceError(404, "没有找到该项目的 Bot 任务。")
    if identity is None and not rows:
        return {"activeCount": active, "tasks": []}
    bots = {bot["id"]: bot for bot in features.list_features(project, project)}
    if identity is not None:
        return _present(row, bots)
    return {"activeCount": active, "tasks": [_present(row, bots) for row in rows]}


def recover():
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("""UPDATE labweave_bot_dispatches SET status='interrupted',updated_at=?
            WHERE status IN ('queued','running')""", (_time(),))


def clear_project(project):
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("DELETE FROM labweave_bot_canvas_drafts WHERE project=?", (project,))
        db.execute("DELETE FROM labweave_bot_dispatches WHERE project=?", (project,))
