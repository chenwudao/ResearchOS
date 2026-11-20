"""Bot-scoped experiment activity views."""

import csv
import io
import json
import math
from uuid import uuid4

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


def _table_series(text):
    rows = list(csv.reader(io.StringIO(text)))
    if len(rows) < 2 or not rows[0]:
        return []
    series = []
    for index, heading in enumerate(rows[0][:16]):
        try:
            values = [float(row[index]) for row in rows[1:] if row]
        except (IndexError, ValueError):
            continue
        if values and all(math.isfinite(number) for number in values):
            series.append({"label": heading, "values": values})
    return series


def _mesh(text):
    vertices, faces = [], []
    for line in text.splitlines():
        fields = line.split("#", 1)[0].split()
        if not fields:
            continue
        if fields[0] == "v":
            vertex = tuple(float(axis) for axis in fields[1:4])
            if len(vertex) != 3 or not all(math.isfinite(axis) and abs(axis) <= 1e12 for axis in vertex):
                raise ValueError("invalid vertex")
            vertices.append(vertex)
        elif fields[0] == "f":
            indices = [int(field.split("/", 1)[0]) for field in fields[1:]]
            if not 3 <= len(indices) <= 80 or not all(-len(vertices) <= index <= len(vertices) and index for index in indices):
                raise ValueError("invalid face")
            faces.append([index - 1 if index > 0 else len(vertices) + index for index in indices])
        if len(vertices) > 3000 or len(faces) > 6000:
            raise ValueError("preview cap exceeded")
    if not vertices or not faces:
        raise ValueError("missing geometry")
    ranges = [(min(axis), max(axis)) for axis in zip(*vertices)]
    center = [(low + high) / 2 for low, high in ranges]
    extent = max(high - low for low, high in ranges) or 1
    return {"vertices": [[(axis - middle) * 2 / extent for axis, middle in zip(vertex, center)] for vertex in vertices],
            "faces": faces}


def _preview(project, file_id):
    name, path = project_service._stored_file(project, file_id)
    extension = path.suffix.lower()
    if extension in project_service.IMAGE_MIME_BY_EXT:
        with path.open("rb") as stream:
            data = stream.read(project_service.MAX_ENTRY_IMAGE_BYTES + 1)
        try:
            image = project_service._encode_image_bytes(data, expected_mime=project_service.IMAGE_MIME_BY_EXT[extension])
        except workspace.WorkspaceError:
            return {"name": name, "note": "图片过大或无法预览。"}
        return {"name": name, "image": image}
    if extension == ".obj":
        with path.open("rb") as stream:
            data = stream.read(256 * 1024 + 1)
        try:
            if len(data) > 256 * 1024:
                raise ValueError("preview cap exceeded")
            return {"name": name, "mesh": _mesh(data.decode("utf-8-sig"))}
        except ValueError:
            return {"name": name, "note": "此 OBJ 过大或无法解析，可从空间存储打开原文件。"}
    value = project_service.read_stored_reference(project, file_id)
    if extension == ".csv" and value.get("text"):
        try:
            text = value["text"].rsplit("\n", 1)[0] if value.get("truncated") else value["text"]
            value["series"] = _table_series(text)
        except csv.Error:
            pass
    return value


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
        return _preview(project, file)
    return {**summary(item), "sourceSession": item.get("sourceSession"), "stdout": item["logs"],
            "parameters": item["parameters"], "metrics": item["metrics"], "artifacts": list(files)}


def save_run_note(project, args):
    feature, run_id, notebook = (args.get(key) for key in ("featureId", "id", "notebookId"))
    layouts = {bot["id"]: bot.get("layout") for bot in features.list_features(project, project) if not bot.get("archived")}
    if not isinstance(feature, str) or not isinstance(notebook, str) or layouts.get(feature) != "code-map" or layouts.get(notebook) != "notebook":
        raise workspace.WorkspaceError(400, "请选择当前项目的工程台和笔记 Bot。")
    run = view(project, "bot/experiment", {"featureId": feature, "id": run_id})
    if run["status"] not in ("completed", "failed"):
        raise workspace.WorkspaceError(409, "运行结束后可以保存结果。")

    def operation(item):
        rails = item["rails"]
        results = rails.setdefault(feature, [])
        record = next((row for row in results if row.get("experimentRun") == run_id), None)
        now = project_service.timestamp()
        if not record:
            record = {"id": "n_" + uuid4().hex, "text": run["title"], "title": run["title"], "ts": now,
                      "source": "工程台", "kind": "experiment-result", "experimentRun": run_id}
            results.append(record)
        reference = {"featureId": feature, "id": record["id"]}
        notes = rails.setdefault(notebook, [])
        note = next((entry for entry in notes if entry.get("capturedFrom") == reference), None)
        if not note:
            refs = [reference]
            refs.extend({"featureId": "library", "id": resource["id"]} for resource in rails.get("library", [])
                        if resource.get("path") in run["artifacts"])
            details = ["**运行状态：** " + ("已完成" if run["status"] == "completed" else "失败"),
                       "**运行记录时间：** " + run["created"]]
            if run["metrics"]:
                details.append("**运行指标**\n\n" + "\n".join(
                    "- " + str(key) + " = " + json.dumps(value, ensure_ascii=False) for key, value in run["metrics"].items())[:4000])
            if run["artifacts"]:
                details.append("**项目产物**\n\n" + "\n".join("- " + name for name in run["artifacts"])[:4000])
            if run["stdout"]:
                details.append("**日志摘录**\n\n```text\n" + run["stdout"][-4000:].replace("```", "'''") + "\n```")
            note = {"id": "n_" + uuid4().hex, "title": run["title"], "text": "\n\n".join(details), "ts": now,
                    "source": "工程台", "kind": "note", "category": "实验结果", "noteOrigin": "user", "noteVersion": 1,
                    "capturedFrom": reference, "recordRefs": refs[:32]}
            notes.append(note)
        return {"featureId": notebook, "id": note["id"]}

    return project_service.mutate(project, operation)
