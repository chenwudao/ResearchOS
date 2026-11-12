"""Experiment runs and evidence-backed task quality assessments."""
from contextlib import closing
import json
import math
from uuid import uuid4
import workspace
import project_service

DIMENSIONS = ("completeness", "correctness", "evidence", "reproducibility")


def database():
    db = workspace.database()
    db.execute("""CREATE TABLE IF NOT EXISTS research_records (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, kind TEXT NOT NULL, body TEXT NOT NULL)""")
    return db


def records(project_id, kind):
    project_service.project(workspace.snapshot(), project_id)
    with closing(database()) as db:
        return [json.loads(row[0]) for row in db.execute(
            "SELECT body FROM research_records WHERE project=? AND kind=? ORDER BY rowid DESC",
            (project_id, kind))]


def save(project_id, kind, args):
    project_service.project(workspace.snapshot(), project_id)
    identity = workspace.text(args.get("id"), 100) or uuid4().hex
    existing = next((item for item in records(project_id, kind) if item["id"] == identity), {})
    if args.get("id") and not existing:
        raise workspace.WorkspaceError(404, "记录不存在。")
    item = {**existing, **args, "id": identity, "updated": project_service.timestamp()}
    item.setdefault("created", item["updated"])
    if kind == "experiment":
        item["name"] = workspace.text(item.get("name"), 300)
        if not item["name"]:
            raise workspace.WorkspaceError(400, "请输入实验名称。")
        for key in ("parameters", "metrics"):
            if not isinstance(item.setdefault(key, {}), dict):
                raise workspace.WorkspaceError(400, "参数和指标需为 JSON 对象。")
        if item.get("status", "planned") not in ("planned", "running", "completed", "failed"):
            raise workspace.WorkspaceError(400, "无效实验状态。")
        item.setdefault("status", "planned")
        item["logs"] = workspace.text(item.get("logs"), 50000)
    else:
        import tasks
        task = tasks.get(item.get("taskId"))
        if task["projectId"] != project_id or task["status"] != "SUCCEEDED":
            raise workspace.WorkspaceError(400, "请选择本项目已完成任务。")
        scores = item.get("scores", {})
        if set(scores) != set(DIMENSIONS) or any(type(v) not in (int, float) or not math.isfinite(v) or not 0 <= v <= 5 for v in scores.values()):
            raise workspace.WorkspaceError(400, "完整性、正确性、证据、可复现性均需填写 0–5 分。")
        item["rationale"] = workspace.text(item.get("rationale"), 16000)
        if not item["rationale"]:
            raise workspace.WorkspaceError(400, "请填写评分依据。")
        item["score"] = round(sum(scores.values()) / 20 * 100, 1)
        item["evaluator"] = workspace.text(item.get("evaluator"), 100) or "用户"
    if item.get("taskId"):
        import tasks
        if tasks.get(item["taskId"])["projectId"] != project_id:
            raise workspace.WorkspaceError(400, "任务属于其他项目。")
    with closing(database()) as db, db:
        db.execute("INSERT OR REPLACE INTO research_records VALUES (?, ?, ?, ?)",
                   (identity, project_id, kind, json.dumps(item, ensure_ascii=False, allow_nan=False)))
    return item


def delete(project_id, kind, args):
    with closing(database()) as db, db:
        db.execute("DELETE FROM research_records WHERE project=? AND kind=? AND id=?",
                   (project_id, kind, args.get("id")))
    return {"ok": True}
