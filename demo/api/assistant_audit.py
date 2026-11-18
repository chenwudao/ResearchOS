"""Owner-visible LabWeave budget decisions, including historical approvals without timestamps."""
from contextlib import closing
from datetime import datetime
import json

import workspace


def records():
    with closing(workspace.database()) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        names = {pid: json.loads(body).get("name", pid) for pid, body in db.execute("SELECT id, body FROM projects")}
        rows = []

        def add(pid, key, title, at):
            if pid in names:
                rows.append({"id": key, "scope": names[pid], "title": title, "status": "已批准",
                             "time": int(datetime.fromisoformat(at).timestamp()*1000) if at else None})

        if "sandbox_grants" in tables:
            dated = "sandbox_grant_times" in tables
            query = ("SELECT g.project,g.request,g.seconds,t.at FROM sandbox_grants g LEFT JOIN "
                     "sandbox_grant_times t ON t.project=g.project AND t.request=g.request"
                     if dated else "SELECT project,request,seconds,NULL FROM sandbox_grants")
            for pid, request, seconds, at in db.execute(query):
                add(pid, "grant/"+pid+"/"+request, f"授权项目试跑 {seconds} 秒", at)
        if "sandbox_runs" in tables:
            for pid, identity, title, at in db.execute(
                "SELECT project,id,json_extract(body,'$.title'),json_extract(body,'$.approvedAt') "
                "FROM sandbox_runs WHERE json_extract(body,'$.approvedOnce')=1"
            ):
                add(pid, "trial/"+identity, title or "批准单次试跑", at)
        if "research_workflows" in tables:
            for pid, identity, title, at in db.execute(
                "SELECT project,id,json_extract(body,'$.plan.question'),json_extract(body,'$.approval.at') "
                "FROM research_workflows WHERE json_extract(body,'$.approval.at') IS NOT NULL"
            ):
                add(pid, "workflow/"+identity, title or "批准实验计划", at)
        return sorted(rows, key=lambda r:r["time"] or 0, reverse=True)[:200]
