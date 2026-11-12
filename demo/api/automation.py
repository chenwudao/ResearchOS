"""Run project feeds and recurring research reviews in the local server."""

from contextlib import closing
from datetime import date, datetime, timezone
from hashlib import sha256
import json
import logging
from threading import RLock, Event, Lock, Thread
from time import time

import workspace


INTERVALS = {"feed": 30 * 60, "review": 24 * 60 * 60}
RUN_LOCK = RLock()
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
            {key: item[key] for key in ("id", "text", "due", "done", "dependsOn", "parentId", "ideaId", "paperId", "path", "kind", "url")
             if key in item} for item in items[-8:]
        ]
    hidden = set(project.get("dismissedFeed", []))
    recent = [item for item in feed.get("items", []) if (item.get("url") or item["text"]) not in hidden]
    return {"id": project["id"], "name": project["name"], "description": project.get("description", ""), "topic": project.get("topic"),
            "notes": notes, "recentFeed": recent[:8]}


def review(project, stored, settings):
    import tasks
    active = next((task for task in tasks.all_tasks() if task["projectId"] == project["id"]
                   and task.get("scheduledReview") and task["status"] not in tasks.TERMINAL), None)
    if active:
        return {"reply": "项目复盘正在进行，请查看任务记录。", "actions": [], "taskId": active["id"]}
    task = tasks.create({"projectId": project["id"], "prompt":
        "复盘项目：检查目标依赖、延期、近期动态和项目记忆，提出一到三个后续建议。"
        "使用 researchos 工具保存有依据的新点子和重要研究决策，避免重复。"})
    task["scheduledReview"] = True
    tasks.store(task)
    tasks.approve({"id": task["id"]})
    return {"reply": "已发起 DSH 项目复盘，请查看任务记录。", "actions": [], "taskId": task["id"]}


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
