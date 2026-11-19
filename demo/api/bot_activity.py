"""Bot-scoped experiment history and previews over the existing project ledgers."""

from contextlib import closing
import csv
from io import StringIO
import json
import math

import features
import project_sandbox as sandbox
import project_service as projects
import research_ledger as ledger
import research_workflows as workflows
import workspace


def _recent(project, feature, session):
    with closing(sandbox.database()) as db:
        trials = db.execute(
            """SELECT body FROM sandbox_runs WHERE project=?
               AND (json_extract(body,'$.sourceFeature')=?
                    OR (json_extract(body,'$.sourceFeature') IS NULL AND json_extract(body,'$.sourceSession')=?))
               ORDER BY rowid DESC LIMIT 24""", (project, feature, session)).fetchall()
    with closing(ledger.database()) as db:
        flows = db.execute(
            """SELECT body FROM research_workflows WHERE project=? AND json_extract(body,'$.source.featureId')=?
               ORDER BY rowid DESC LIMIT 24""", (project, feature)).fetchall()
    items = [_card(json.loads(body), "trial") for (body,) in trials]
    items.extend(_card(json.loads(body), "workflow") for (body,) in flows)
    return sorted(items, key=lambda item: item["created"], reverse=True)[:24]


def _card(item, kind):
    return {"id": item["id"], "kind": kind, "status": item["status"], "created": item["created"],
            "title": item["title"] if kind == "trial" else item["plan"]["question"]}


def _workflow_files(flow):
    results = []
    if flow.get("reportPath"):
        directory = flow["reportPath"].rsplit("/", 1)[0]
        results = [directory + "/" + name for name in ("report.md", "runs.csv", "analysis.json")]
    for run in flow["runs"]:
        for path in run.get("artifacts", {}):
            if path.lower().endswith((".png", ".jpg", ".jpeg", ".webp", ".svg", ".gif")):
                results.append(path)
    return list(dict.fromkeys(results))[:30]


def _preview(file):
    mime = projects.IMAGE_MIME_BY_EXT.get(file.suffix.lower())
    if mime:
        with file.open("rb") as stream:
            body = stream.read(projects.MAX_ENTRY_IMAGE_BYTES + 1)
        try:
            return {"image": projects._encode_image_bytes(body, expected_mime=mime)}
        except (UnicodeError, workspace.WorkspaceError):
            raise workspace.WorkspaceError(400, "此图无法预览，请从项目目录查看原文件。") from None
    if file.suffix.lower() not in (".csv", ".tsv", ".txt", ".md", ".json", ".log", ".py", ".yaml", ".yml"):
        return {"text": "原文件保存在项目目录。"}
    with file.open("rb") as stream:
        body = stream.read(65537)
    text = body[:65536].decode("utf-8-sig", errors="replace")
    result = {"text": text, "truncated": len(body) > 65536}
    if file.suffix.lower() in (".csv", ".tsv") and not result["truncated"]:
        rows = list(csv.reader(StringIO(text), delimiter="\t" if file.suffix.lower() == ".tsv" else ","))
        if 3 <= len(rows) <= 201 and 0 < len(rows[0]) <= 20 and all(len(r) == len(rows[0]) for r in rows):
            series = []
            for heading, *column in zip(*rows):
                try:
                    values = list(map(float, column))
                except ValueError:
                    continue
                if all(math.isfinite(n) for n in values):
                    series.append({"label": heading[:100], "values": values})
            result["series"] = series
    return result


def view(project, action, args):
    feature = args.get("featureId")
    bot = next((f for f in features.list_features(project, project) if f["id"] == feature and feature != "chat"), None)
    if bot is None:
        raise workspace.WorkspaceError(404, "当前项目没有这个 Bot。")
    session = bot.get("botSessionId")
    if action == "bot/experiments":
        return _recent(project, feature, session)
    identity, kind, name = args.get("id"), args.get("kind"), args.get("name")
    if kind == "trial":
        with closing(sandbox.database()) as db:
            item = sandbox.get(db, project, identity)
        if item.get("sourceFeature") != feature and not (
                item.get("sourceFeature") is None and session and item.get("sourceSession") == session):
            raise workspace.WorkspaceError(404, "这个 Bot 没有这次试跑。")
        if action == "bot/artifact":
            return _preview(sandbox.artifact_path(project, item, name))
        detail = sandbox.detail(project, identity)
        return {**_card(detail, kind), "error": detail.get("error"), "stdout": detail["stdout"], "stderr": detail["stderr"],
                "artifacts": [f["name"] for f in detail["artifacts"]]}
    if kind != "workflow":
        raise workspace.WorkspaceError(400, "实验类型无效。")
    flow = workflows.get(project, identity)
    if (flow.get("source") or {}).get("featureId") != feature:
        raise workspace.WorkspaceError(404, "这个 Bot 没有这项实验。")
    paths = _workflow_files(flow)
    if action == "bot/artifact":
        if name not in paths:
            raise workspace.WorkspaceError(404, "未登记此产物。")
        path = ledger.path(project, name)
        if not path.is_file():
            raise workspace.WorkspaceError(404, "产物已移动。")
        return _preview(path)
    return {**_card(flow, kind), "error": flow.get("error"), "artifacts": paths,
            "completed": sum(r["status"] == "SUCCEEDED" for r in flow["runs"]), "total": len(flow["runs"])}
