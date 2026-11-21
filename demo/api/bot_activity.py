"""Bot-scoped experiment activity views."""

import features
import project_service
import research_records
import visualizations
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
    allowed = ("id", "name", "parameters", "metrics", "visualizations", "status", "logs", "taskId")
    return research_records.save(project, "experiment", {key: args[key] for key in allowed if key in args}
                                 | {"featureId": feature, "sourceSession": previous.get("sourceSession", session) if previous else session})


def _artifact_names(item):
    names = item["parameters"].get("artifacts", [])
    return [name for name in names if isinstance(name, str)] if isinstance(names, list) else []


def _file_charts(project, item, files):
    file = next((files[name] for name in _artifact_names(item)
                 if name in files and name.lower().endswith((".csv", ".tsv"))), None)
    if file is None:
        return []
    try:
        return project_service.stored_table_charts(project, file)
    except (OSError, workspace.WorkspaceError):
        return []


def summary(project, item, files):
    live_charts = _file_charts(project, item, files)
    charts = live_charts or item.get("visualizations", [])
    metrics = {name: (values[-64:] if isinstance(values, list) else values)
               for name, values in list(item["metrics"].items())[:32]
               if visualizations.numeric(values) or isinstance(values, list) and values
               and all(visualizations.numeric(value) for value in values[-64:])}
    return {"id": item["id"], "kind": "experiment", "title": item["name"], "featureId": item.get("featureId"),
            "created": item["created"], "status": item["status"], "metrics": metrics,
            "visualizations": [{**chart, "points": chart["points"][-64:]} for chart in charts[:3]]}


def view(project, action, args):
    feature = args.get("featureId")
    if action == "bot/experiments":
        bots = features.list_features(project, project)
        if feature == "chat" or not any(bot["id"] == feature for bot in bots):
            raise workspace.WorkspaceError(404, "当前项目没有这个 Bot。")
        hierarchy = {bot["id"]: bot["label"] for bot in bots if bot["id"] == feature
                     or (bot.get("clusterParent") == feature and not bot.get("archived"))}
        state = project_service.project(workspace.snapshot(), project)
        hidden = state.get("dismissedExperimentNodes", {})
        records = [record for record in research_records.records(project, "experiment")
                   if record.get("featureId") in hierarchy and record["id"] not in hidden.get(record["featureId"], [])]
        paths = {name for record in records for name in _artifact_names(record) if name.lower().endswith((".csv", ".tsv"))}
        files = {entry["path"]: entry["id"] for entry in project_service.stored_files(project)
                 if entry.get("path") in paths} if paths else {}
        return [summary(project, record, files) | ({"botLabel": hierarchy[record["featureId"]]} if len(hierarchy) > 1 else {})
                for record in records]
    records = scoped_records(project, feature)
    item = next((entry for entry in records if entry["id"] == args.get("id")), None)
    if item is None:
        raise workspace.WorkspaceError(404, "当前 Bot 没有这条实验记录。")
    if action == "bot/experiment_dismiss":
        def dismiss(state):
            hidden = state.setdefault("dismissedExperimentNodes", {}).setdefault(feature, [])
            if item["id"] not in hidden:
                hidden.append(item["id"])
            for rail in state["rails"]:
                project_service.detach_canvas_parent(state, rail, item["id"])
            return {"ok": True, "id": item["id"]}
        return project_service.mutate(project, dismiss)
    names = set(_artifact_names(item))
    files = {entry["path"]: entry["id"] for entry in project_service.stored_files(project)
             if entry.get("path") in names} if names else {}
    if action == "bot/artifact":
        file = files.get(args.get("name"))
        if file is None:
            raise workspace.WorkspaceError(404, "未找到当前实验的产物。")
        return project_service.read_stored_reference(project, file, artifact_preview=True)
    return {"id": item["id"], "kind": "experiment", "title": item["name"], "featureId": feature,
            "created": item["created"], "status": item["status"],
            "sourceSession": item.get("sourceSession"), "stdout": item["logs"],
            "parameters": item["parameters"], "metrics": item["metrics"], "artifacts": list(files),
            "liveCharts": _file_charts(project, item, files),
            "visualizations": item.get("visualizations", [])}
