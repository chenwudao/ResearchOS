"""Project-scoped business operations shared by HTTP and DSH MCP tools."""
from contextlib import closing
from datetime import datetime, timezone
import base64
import json
from pathlib import Path
import re
import subprocess
from uuid import uuid4
import workspace


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def project(saved, project_id):
    if project_id == "global":
        return {"id": "global", "name": "全局助手", "rails": {kind: [] for kind in workspace.RAILS},
                "threads": [{"id": "main"}]}
    item = next((p for p in saved.get("state", {}).get("projects", []) if p["id"] == project_id), None)
    if not item:
        raise workspace.WorkspaceError(404, "项目不存在。")
    return item


def mutate(project_id, operation):
    for _ in range(5):
        saved = workspace.snapshot()
        item = project(saved, project_id)
        result = operation(item)
        item["updatedAt"] = timestamp()
        try:
            workspace.save(saved)
            return result
        except workspace.WorkspaceError as exc:
            if exc.status != 409:
                raise
    raise workspace.WorkspaceError(409, "项目正在更新，请重试。")


def folder(project_id):
    project(workspace.snapshot(), project_id)
    if not re.fullmatch(r"[A-Za-z0-9_-]+", project_id):
        raise workspace.WorkspaceError(400, "无效项目标识。")
    path = workspace.DATA / "projects" / project_id
    path.mkdir(parents=True, exist_ok=True)
    return path.resolve()


def memory_list(project_id):
    with closing(workspace.database()) as db:
        return [dict(zip(("id", "category", "content", "created"), row)) for row in
                db.execute("SELECT id,category,content,created FROM memories WHERE project=? ORDER BY created DESC",
                           (project_id,))]


def remember(project_id, content, category="decision", identity=None):
    identity = identity or uuid4().hex
    with closing(workspace.database()) as db, db:
        db.execute("INSERT OR REPLACE INTO memories VALUES (?, ?, ?, ?, ?)",
                   (identity, project_id, category, content, timestamp()))
    return {"id": identity}


def context(project_id):
    saved = workspace.snapshot()
    item = project(saved, project_id)
    if project_id == "global":
        return {"projects": [{"id": p["id"], "name": p["name"], "topic": p.get("topic")}
                             for p in saved.get("state", {}).get("projects", [])]}
    import automation
    feed = automation.public_jobs().get(project_id, {}).get("feed", {})
    result = automation.project_context(item, feed)
    result.update(memories=memory_list(project_id)[:30], directory=str(folder(project_id)))
    return result


def create_entry(project_id, rail, args):
    text = workspace.text(args.get("text"), 16000)
    if rail not in workspace.RAILS or not text:
        raise workspace.WorkspaceError(400, "条目内容为空。")
    entry = {"id": "n_" + uuid4().hex, "text": text, "ts": timestamp(), "source": "DSH"}
    for field in ("due", "url", "parentId", "ideaId", "paperId", "dependsOn", "kind", "path", "taskId"):
        if field in args:
            entry[field] = args[field]
    def operation(item):
        if rail == "goals":
            ids = {goal["id"] for goal in item["rails"]["goals"]}
            if any(value not in ids for value in entry.get("dependsOn", [])):
                raise workspace.WorkspaceError(400, "前置目标不存在。")
            if entry.get("parentId") and entry["parentId"] not in ids:
                raise workspace.WorkspaceError(400, "父目标不存在。")
        item["rails"][rail].append(entry)
        return entry
    return mutate(project_id, operation)


def update_entry(project_id, rail, args):
    def operation(item):
        entry = next((note for note in item["rails"][rail] if note["id"] == args.get("id")), None)
        if not entry:
            raise workspace.WorkspaceError(404, "条目不存在。")
        if "text" in args:
            text = workspace.text(args["text"], 16000)
            if not text:
                raise workspace.WorkspaceError(400, "内容为空。")
            entry["text"] = text
        if rail == "goals":
            if "due" in args:
                entry["due"] = args["due"]
            if "done" in args:
                if args["done"] and any(not goal.get("done") for goal in item["rails"]["goals"] if goal["id"] in entry.get("dependsOn", [])):
                    raise workspace.WorkspaceError(409, "请先完成前置目标。")
                if not args["done"] and any(goal.get("done") and entry["id"] in goal.get("dependsOn", []) for goal in item["rails"]["goals"]):
                    raise workspace.WorkspaceError(409, "请先撤销依赖此目标的已完成目标。")
                entry["done"] = bool(args["done"])
        entry["updatedAt"] = timestamp()
        return entry
    return mutate(project_id, operation)


def resource_path(project_id, resource_id):
    item = project(workspace.snapshot(), project_id)
    resource = next((note for note in item["rails"]["library"] if note["id"] == resource_id), None)
    if not resource:
        raise workspace.WorkspaceError(404, "资源不存在。")
    if resource.get("path"):
        path = (folder(project_id) / resource["path"]).resolve()
        if not path.is_relative_to(folder(project_id)):
            raise workspace.WorkspaceError(400, "资源路径超出项目目录。")
        return path
    match = re.fullmatch(r"/api/workspace/pdf/([a-f0-9]{32}\.pdf)", resource.get("url", ""))
    if match:
        return workspace.DATA / "pdf" / match[1]
    raise workspace.WorkspaceError(400, "此资源是链接，请先导入本地文件或仓库。")


def read_resource(project_id, resource_id, page=1):
    path = resource_path(project_id, resource_id)
    if path.is_dir():
        files = [str(file.relative_to(path)) for file in path.rglob("*")
                 if file.is_file() and ".git" not in file.parts][:300]
        return {"files": files}
    if path.suffix.lower() == ".pdf":
        from pypdf import PdfReader
        reader = PdfReader(path)
        index = max(0, int(page) - 1)
        if index >= len(reader.pages):
            raise workspace.WorkspaceError(400, "页码超出范围。")
        return {"pages": len(reader.pages), "page": index + 1,
                "text": (reader.pages[index].extract_text() or "")[:30000]}
    if path.stat().st_size > 2 * 1024 * 1024:
        raise workspace.WorkspaceError(413, "文本文件过大。")
    return {"text": path.read_text(encoding="utf-8", errors="replace")[:30000]}


def upload(payload):
    project_id = payload.get("projectId")
    name = Path(workspace.text(payload.get("name"), 200)).name
    if not name or "/" in name or "\\" in name:
        raise workspace.WorkspaceError(400, "无效文件名。")
    body = base64.b64decode(payload.get("data", ""), validate=True)
    if not body or len(body) > 25 * 1024 ** 2:
        raise workspace.WorkspaceError(413, "文件大小需在 1 字节至 25 MiB 之间。")
    relative = "resources/" + uuid4().hex + "-" + name
    destination = folder(project_id) / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    destination.write_bytes(body)
    try:
        return create_entry(project_id, "library", {"text": name, "path": relative, "kind": "file"})
    except Exception:
        destination.unlink(missing_ok=True)
        raise


def clone(payload):
    project_id = payload.get("projectId")
    url = workspace.text(payload.get("url"), 1000)
    if not re.fullmatch(r"https://[A-Za-z0-9.-]+/[A-Za-z0-9_./-]+", url):
        raise workspace.WorkspaceError(400, "请输入 HTTPS 仓库地址。")
    relative = "repositories/" + uuid4().hex
    target = folder(project_id) / relative
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        subprocess.run(["git", "-c", "core.longpaths=true", "clone", "--depth", "1", "--", url, str(target)],
                       check=True, timeout=120, capture_output=True,
                       env={**workspace.os.environ, "GIT_TERMINAL_PROMPT": "0"})
    except (subprocess.SubprocessError, OSError) as exc:
        detail = (getattr(exc, "stderr", b"") or b"").decode("utf-8", errors="replace")[-1000:]
        raise workspace.WorkspaceError(502, "仓库导入失败，请检查地址和访问权限。 " + detail) from exc
    return create_entry(project_id, "library", {"text": url, "url": url, "path": relative, "kind": "repository"})


def collect_outputs(project_id, task_id, since):
    root = folder(project_id)
    item = project(workspace.snapshot(), project_id)
    known = {entry.get("path") for entry in item["rails"]["library"]}
    for path in root.rglob("*"):
        relative = path.relative_to(root)
        if (not path.is_file() or path.is_symlink() or re.fullmatch(r"[a-f0-9]{32}\.pdf", path.name) or any(part in (".git", ".venv", "repositories", "resources") for part in relative.parts)
                or path.stat().st_mtime < since or str(relative) in known):
            continue
        create_entry(project_id, "library", {"text": path.name, "path": str(relative), "kind": "output", "taskId": task_id})


def call(name, args, project_id):
    if name == "project_list":
        return [{"id": p["id"], "name": p["name"]} for p in workspace.snapshot().get("state", {}).get("projects", [])
                if project_id == "global" or p["id"] == project_id]
    if name == "project_create":
        if project_id != "global":
            raise workspace.WorkspaceError(403, "请在全局助手创建项目。")
        name_value = workspace.text(args.get("name"), 200)
        if not name_value:
            raise workspace.WorkspaceError(400, "项目名称为空。")
        saved = workspace.snapshot()
        identity = "proj_" + uuid4().hex
        thread = "thr_" + uuid4().hex
        item = {"id": identity, "name": name_value, "createdAt": timestamp(), "updatedAt": timestamp(),
                "activeThreadId": thread, "threads": [{"id": thread, "title": "项目助手", "messages": []}],
                "rails": {rail: [] for rail in workspace.RAILS}}
        saved["state"]["projects"].append(item)
        workspace.save(saved)
        return item
    if project_id == "global":
        project_id = args.get("projectId", "global")
        if project_id == "global":
            raise workspace.WorkspaceError(400, "请先选择 projectId。")

    if name.startswith(("experiment_", "benchmark_")):
        import research_records
        kind, operation = name.split("_", 1)
        if operation == "list":
            return research_records.records(project_id, kind)
        if operation == "record":
            return research_records.save(project_id, kind, args)
        if operation == "delete":
            return research_records.delete(project_id, kind, args)
    if name == "task_get":
        import tasks
        task = tasks.get(args.get("id"))
        if task["projectId"] != project_id:
            raise workspace.WorkspaceError(404, "任务不存在。")
        return task
    if name == "project_update":
        def change(item):
            for field in ("name", "description", "topic"):
                if field in args:
                    item[field] = workspace.text(args[field], 2000)
            return item
        return mutate(project_id, change)
    if name == "memory_delete":
        with closing(workspace.database()) as db, db:
            db.execute("DELETE FROM memories WHERE project=? AND id=?", (project_id, args.get("id")))
        return {"ok": True}
    if name == "paper_citations":
        from urllib.parse import quote
        doi = workspace.text(args.get("doi"), 250)
        if not doi.startswith("10."):
            raise workspace.WorkspaceError(400, "请输入 DOI。")
        value = json.loads(workspace.fetch_source("https://api.crossref.org/works/" + quote(doi, safe="")))
        return {"doi": doi, "references": value["message"].get("reference", [])[:150]}
    if name == "project_get_context":
        return context(project_id)
    if name == "resource_search":
        entries = project(workspace.snapshot(), project_id)["rails"]["library"]
        query = str(args.get("query", "")).casefold()
        return [entry for entry in entries if query in entry["text"].casefold()]
    if name in ("resource_read", "paper_read"):
        return read_resource(project_id, args.get("id"), args.get("page", 1))
    if name == "paper_search":
        return list(workspace.recent_papers(workspace.text(args.get("query"), 150)))
    if name == "memory_search":
        query = str(args.get("query", "")).casefold()
        return [entry for entry in memory_list(project_id) if query in entry["content"].casefold()]
    if name == "memory_write":
        return remember(project_id, workspace.text(args.get("text"), 16000), args.get("category", "decision"))
    if name in ("idea_create", "goal_create"):
        return create_entry(project_id, "ideas" if name.startswith("idea") else "goals", args)
    if name in ("idea_update", "goal_update"):
        return update_entry(project_id, "ideas" if name.startswith("idea") else "goals", args)
    if name == "task_create":
        import tasks
        return tasks.create({"projectId": project_id, "prompt": args.get("text"), "goalId": args.get("goalId")})
    raise workspace.WorkspaceError(404, "未知业务工具。")
