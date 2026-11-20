"""Bot-scoped experiment activity views."""

import features
import project_service
import research_records
import workspace


def scoped_records(project, feature):
    bot = next((f for f in features.list_features(project, project) if f["id"] == feature and feature != "chat"), None)
    if bot is None:
        raise workspace.WorkspaceError(404, "当前项目没有这个 Bot。")
    return [item for item in research_records.records(project, "experiment") if item.get("featureId") == feature]


def record(project, feature, session, args):
    records = scoped_records(project, feature)
    if not isinstance(args, dict) or not isinstance(session, str) or not session:
        raise workspace.WorkspaceError(400, "需要实验记录及发起会话。")
    previous = next((item for item in records if item["id"] == args.get("id")), None)
    if args.get("id") and previous is None:
        raise workspace.WorkspaceError(404, "实验记录不属于当前 Bot。")
    allowed = ("id", "name", "parameters", "metrics", "status", "logs", "taskId")
    return research_records.save(project, "experiment", {key: args[key] for key in allowed if key in args}
                                 | {"featureId": feature, "sourceSession": previous.get("sourceSession", session) if previous else session})


def summary(item):
    return {"id": item["id"], "kind": "experiment", "title": item["name"],
            "created": item["created"], "status": item["status"]}


def view(project, action, args):
    records = scoped_records(project, args.get("featureId"))
    if action == "bot/experiments":
        return [summary(item) for item in records]
    item = next((entry for entry in records if entry["id"] == args.get("id")), None)
    if item is None:
        raise workspace.WorkspaceError(404, "当前 Bot 没有这条实验记录。")
    names = item["parameters"].get("artifacts", [])
    files = {entry["path"]: entry["id"] for entry in project_service.stored_files(project)
             if isinstance(names, list) and entry.get("path") in names}
    if action == "bot/artifact":
        file = files.get(args.get("name"))
        if file is None:
            raise workspace.WorkspaceError(404, "未找到当前实验的产物。")
        return project_service.read_stored_reference(project, file)
    return {**summary(item), "sourceSession": item.get("sourceSession"), "stdout": item["logs"],
            "parameters": item["parameters"], "metrics": item["metrics"], "artifacts": list(files)}
