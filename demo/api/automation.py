"""Run project feeds and recurring research reviews in the local server."""

from contextlib import closing
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import logging
from threading import Event, Lock, Thread
from time import time

import workspace


INTERVALS = {"feed": 30 * 60, "review": 24 * 60 * 60}
RUN_LOCK = Lock()
LOGGER = logging.getLogger(__name__)


def connect():
    db = workspace.database()
    db.execute("""CREATE TABLE IF NOT EXISTS project_jobs (
        project TEXT NOT NULL,
        kind TEXT NOT NULL,
        input TEXT NOT NULL,
        attempted REAL NOT NULL,
        result TEXT NOT NULL,
        PRIMARY KEY (project, kind)
    )""")
    return db


def jobs():
    with closing(connect()) as db:
        rows = db.execute("SELECT project, kind, input, attempted, result FROM project_jobs")
        return {(project, kind): {"input": key, "attempted": attempted, **json.loads(result)}
                for project, kind, key, attempted, result in rows}


def public_jobs():
    active = workspace.snapshot().get("state", {}).get("projects", [])
    stored = jobs()
    result = {}
    for project in active:
        project_id = project["id"]
        for kind in INTERVALS:
            item = stored.get((project_id, kind))
            if item and item["input"] == job_input(project, kind):
                result.setdefault(project_id, {})[kind] = item
    return result


def job_input(project, kind):
    if kind == "feed":
        return workspace.text(project.get("topic"), 150)
    return "daily" if project.get("autoReview") else ""


def project_context(project, feed):
    notes = {}
    for rail, items in project["rails"].items():
        notes[rail] = [
            {key: item[key] for key in ("id", "text", "due", "done", "dependsOn", "url")
             if key in item} for item in items[-8:]
        ]
    hidden = set(project.get("dismissedFeed", []))
    recent = [item for item in feed.get("items", []) if (item.get("url") or item["text"]) not in hidden]
    return {"id": project["id"], "name": project["name"], "topic": project.get("topic"),
            "notes": notes, "recentFeed": recent[:8]}


def review(project, stored, settings):
    feed = stored.get((project["id"], "feed"), {})
    if feed.get("input") != job_input(project, "feed"):
        feed = {}
    return workspace.chat({
        "messages": [{"role": "user", "text": (
            "请复盘本项目：指出延期目标和前置依赖，结合已有点子、动态和资源提出"
            "一到三个具体的下一步，并用 actions 给出值得新增的点子或目标。"
            "说明点子承接的旧点子，目标引用已有目标 ID 表明前置依赖。"
            "不要重复已有条目，不要声称已执行任务。")}],
        "context": {"scope": "project-review", "today": date.today().isoformat(),
                    "agent": settings.get("agent", {}),
                    "projects": [project_context(project, feed)]},
        "allowedProjects": [project["id"]],
    })


def run_job(project, kind, stored, settings, force=False):
    key = job_input(project, kind)
    if not key:
        raise workspace.WorkspaceError(400, "请先保存主题或启用自动复盘。")
    job_id = (project["id"], kind)
    previous = stored.get(job_id, {})
    same_input = previous.get("input") == key
    now = time()
    interval = INTERVALS[kind]
    if previous.get("error"):
        interval = min(interval, 30 * 60)
    if same_input and not force and now - previous["attempted"] < interval:
        return previous
    result = {field: value for field, value in previous.items()
              if same_input and field not in ("input", "attempted", "error")}
    timestamp = datetime.now(timezone.utc).isoformat()
    try:
        if kind == "feed":
            refreshed = workspace.refresh_feed({"topic": key})
            items = {}
            for item in refreshed["items"] + result.get("items", []):
                identity = item.get("url") or item["text"]
                digest = sha256(identity.encode()).hexdigest()[:24]
                items.setdefault(identity, {
                    "id": "feed_" + digest, "ts": timestamp, "automatic": True, **item,
                })
            result.update(items=list(items.values())[:60], unavailable=refreshed["unavailable"])
        else:
            entry = {"id": workspace.uuid4().hex, "ts": timestamp, **review(project, stored, settings)}
            result["reviews"] = [entry, *result.get("reviews", [])][:12]
        result["updated"] = timestamp
    except workspace.WorkspaceError as exc:
        result["error"] = str(exc)
    with closing(connect()) as db, db:
        db.execute("INSERT OR REPLACE INTO project_jobs VALUES (?, ?, ?, ?, ?)",
                   (*job_id, key, now, json.dumps(result, ensure_ascii=False)))
    result.update(input=key, attempted=now)
    stored[job_id] = result
    return result


def run_now(payload):
    project_id = payload.get("projectId")
    kind = payload.get("kind")
    if kind not in INTERVALS:
        raise workspace.WorkspaceError(400, "无效的自动化类型。")
    with RUN_LOCK:
        saved = workspace.snapshot()
        project = next((item for item in saved.get("state", {}).get("projects", [])
                        if item["id"] == project_id), None)
        if project is None:
            raise workspace.WorkspaceError(404, "项目不存在或尚未保存。")
        stored = jobs()
        prior = stored.get((project_id, kind), {})
        if prior.get("input") == job_input(project, kind) and time() - prior["attempted"] < 30:
            return prior
        return run_job(project, kind, stored, saved.get("settings", {}), force=True)


def run_due():
    with RUN_LOCK:
        saved = workspace.snapshot()
        stored = jobs()
        for project in saved.get("state", {}).get("projects", []):
            for kind in INTERVALS:
                if job_input(project, kind):
                    run_job(project, kind, stored, saved.get("settings", {}))


def start():
    stop = Event()

    def worker():
        while not stop.is_set():
            try:
                run_due()
            except (OSError, workspace.sqlite3.Error, KeyError, TypeError):
                LOGGER.exception("Unable to run scheduled workspace jobs")
            stop.wait(30)

    Thread(target=worker, name="project-automation", daemon=True).start()
    return stop
