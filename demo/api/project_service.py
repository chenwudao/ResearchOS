"""Project-scoped business operations shared by HTTP and DSH MCP tools."""
from contextlib import closing
from datetime import datetime, timezone
import base64
import json
from pathlib import Path
import re
import subprocess
from uuid import uuid4
from xml.etree import ElementTree
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
    import memory_store
    return memory_store.list_memories(project_id)


def remember(project_id, content, category="decision", identity=None, source=None, pinned=None):
    import memory_store
    return memory_store.remember(project_id, content, category, identity, source=source, pinned=pinned)


def context(project_id):
    saved = workspace.snapshot()
    item = project(saved, project_id)
    if project_id == "global":
        return {"projects": [{"id": p["id"], "name": p["name"], "topic": p.get("topic")}
                             for p in saved.get("state", {}).get("projects", [])]}
    import automation
    feed = automation.public_jobs().get(project_id, {}).get("feed", {})
    result = automation.project_context(item, feed)
    result["directory"] = str(folder(project_id))
    import research_ledger
    result['researchState'] = research_ledger.state(project_id)
    import research_workflows
    result['researchWorkflows'] = [{'id': w['id'], 'question': w['plan']['question'], 'status': w['status'],
                                  'completed': sum(r['status'] == 'SUCCEEDED' for r in w['runs']),
                                  'total': len(w['runs']), 'error': w.get('error'),
                                  'nextAction': w.get('analysis', {}).get('nextAction')}
                                 for w in research_workflows.all_workflows(project_id)[:10]]
    return result


MAX_ENTRY_IMAGE_BYTES = 1_500_000
IMAGE_MIME_BY_EXT = {
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
    ".gif": "image/gif",
    ".svg": "image/svg+xml",
}
_FORBIDDEN_SVG_TAGS = {
    "script", "foreignobject", "iframe", "object", "embed", "audio", "video", "link", "meta", "base",
}
_DATA_IMAGE_RE = re.compile(
    r"^data:(image/(?:png|jpeg|webp|gif|svg\+xml));base64,([A-Za-z0-9+/=\r\n]+)$",
    re.IGNORECASE,
)


def _detect_raster_mime(raw):
    if raw.startswith(b"\x89PNG\r\n\x1a\n"):
        return "image/png"
    if raw.startswith(b"\xff\xd8\xff"):
        return "image/jpeg"
    if raw[:6] in (b"GIF87a", b"GIF89a"):
        return "image/gif"
    if len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        return "image/webp"
    return None


def _sanitize_svg_to_data_url(raw_svg):
    if isinstance(raw_svg, (bytes, bytearray)):
        text = raw_svg.decode("utf-8", errors="strict")
    elif isinstance(raw_svg, str):
        text = raw_svg
    else:
        raise workspace.WorkspaceError(400, "SVG 图示格式无效。")
    cleaned = text.strip()
    if cleaned.startswith("<?xml"):
        end_decl = cleaned.find("?>")
        if end_decl < 0:
            raise workspace.WorkspaceError(400, "SVG XML 声明不完整。")
        cleaned = cleaned[end_decl + 2:].strip()
    if not cleaned or len(cleaned) > 250_000 or not cleaned.lower().startswith("<svg"):
        raise workspace.WorkspaceError(400, "请提供有效的内联 SVG 图示（<= 250KB）。")
    if re.search(r"<!DOCTYPE|<!ENTITY", cleaned, re.IGNORECASE):
        raise workspace.WorkspaceError(400, "SVG 不允许包含 DOCTYPE 或实体定义。")
    if re.search(r"\bon[a-z]+\s*=|(?:javascript|vbscript):|data\s*:\s*(?:text/html|application/)", cleaned, re.IGNORECASE):
        raise workspace.WorkspaceError(400, "SVG 包含不安全脚本或协议。")
    if re.search(r"(?:href|xlink:href|src)\s*=\s*[\"']\s*https?:|url\s*\(\s*[\"']?\s*https?:", cleaned, re.IGNORECASE):
        raise workspace.WorkspaceError(400, "SVG 不允许引用外部网络地址。")
    try:
        root = ElementTree.fromstring(cleaned)
    except ElementTree.ParseError as exc:
        raise workspace.WorkspaceError(400, "SVG XML 解析失败。") from exc
    if root.tag.rsplit("}", 1)[-1].lower() != "svg":
        raise workspace.WorkspaceError(400, "根节点必须为 svg。")
    for elem in root.iter():
        if elem.tag.rsplit("}", 1)[-1].lower() in _FORBIDDEN_SVG_TAGS:
            raise workspace.WorkspaceError(400, "SVG 包含禁止的元素。")
        if any(attr.rsplit("}", 1)[-1].lower().startswith("on") for attr in elem.attrib):
            raise workspace.WorkspaceError(400, "SVG 不允许事件属性。")
    if "viewBox" not in root.attrib and "viewbox" not in {k.lower() for k in root.attrib} and not (
        "width" in root.attrib and "height" in root.attrib
    ):
        raise workspace.WorkspaceError(400, "SVG 需要提供 viewBox 或明确宽高。")
    raw_bytes = cleaned.encode("utf-8")
    if len(raw_bytes) > MAX_ENTRY_IMAGE_BYTES:
        raise workspace.WorkspaceError(413, "SVG 图示体积超出限制（1.5 MiB）。")
    return "data:image/svg+xml;base64," + base64.b64encode(raw_bytes).decode("ascii")


def _encode_image_bytes(raw, expected_mime=None):
    if not raw or len(raw) > MAX_ENTRY_IMAGE_BYTES:
        raise workspace.WorkspaceError(413, "配图大小需在 1 字节至 1.5 MiB 之间。")
    if expected_mime == "image/svg+xml" or (expected_mime is None and raw.lstrip().startswith((b"<svg", b"<?xml"))):
        return _sanitize_svg_to_data_url(raw)
    detected = _detect_raster_mime(raw)
    if not detected or (expected_mime and detected != expected_mime):
        raise workspace.WorkspaceError(400, "不支持的图片格式或文件头校验失败。")
    return f"data:{detected};base64," + base64.b64encode(raw).decode("ascii")


def _apply_rich_fields(project_id, args, entry, allow_clear=False):
    if "title" in args:
        if args["title"] is None or args["title"] == "":
            if allow_clear:
                entry.pop("title", None)
        else:
            title = workspace.text(args["title"], 240)
            if title:
                entry["title"] = title
    if "caption" in args:
        if args["caption"] is None or args["caption"] == "":
            if allow_clear:
                entry.pop("caption", None)
        else:
            caption = workspace.text(args["caption"], 400)
            if caption:
                entry["caption"] = caption
    if allow_clear and args.get("clearImage"):
        for k in ("image", "imagePath", "imageUrl"):
            entry.pop(k, None)
        return
    if args.get("imageSvg"):
        entry["image"] = _sanitize_svg_to_data_url(args["imageSvg"])
        entry.pop("imagePath", None)
        entry.pop("imageUrl", None)
    elif args.get("imagePath"):
        raw_rel = str(args["imagePath"]).strip().replace("\\", "/")
        if not raw_rel or raw_rel.startswith("/") or ":" in raw_rel.split("/")[0] or ".." in raw_rel.split("/"):
            raise workspace.WorkspaceError(400, "配图路径必须在当前项目目录内。")
        root = folder(project_id).resolve()
        candidate = root / raw_rel
        cur = root
        for part in Path(raw_rel).parts:
            cur = cur / part
            if cur.is_symlink():
                raise workspace.WorkspaceError(400, "配图路径不能经过符号链接。")
        resolved = candidate.resolve()
        if not resolved.is_relative_to(root) or not resolved.is_file():
            raise workspace.WorkspaceError(404, "项目内未找到指定配图文件。")
        mime = IMAGE_MIME_BY_EXT.get(resolved.suffix.lower())
        if not mime:
            raise workspace.WorkspaceError(400, "仅支持 png/jpg/webp/gif/svg 配图文件。")
        entry["image"] = _encode_image_bytes(resolved.read_bytes(), expected_mime=mime)
        entry["imagePath"] = resolved.relative_to(root).as_posix()
        entry.pop("imageUrl", None)
    elif args.get("imageData") or args.get("image"):
        raw_data = args.get("imageData") or args.get("image")
        if not isinstance(raw_data, str):
            raise workspace.WorkspaceError(400, "配图数据无效。")
        m = _DATA_IMAGE_RE.fullmatch(raw_data.strip())
        if not m:
            raise workspace.WorkspaceError(400, "配图需为 data:image/(png|jpeg|webp|gif|svg+xml);base64,... 格式。")
        mime = m[1].lower()
        try:
            decoded = base64.b64decode(m[2], validate=True)
        except ValueError as exc:
            raise workspace.WorkspaceError(400, "配图 Base64 编码无效。") from exc
        entry["image"] = _encode_image_bytes(decoded, expected_mime=mime)
        entry.pop("imageUrl", None)
    elif "imageUrl" in args:
        raw_url = args.get("imageUrl")
        if raw_url is None or raw_url == "":
            if allow_clear:
                entry.pop("imageUrl", None)
        else:
            safe = workspace.safe_link(workspace.text(raw_url, 2000))
            if not safe:
                raise workspace.WorkspaceError(400, "请输入有效的 HTTP 或 HTTPS 配图地址。")
            entry["imageUrl"] = safe
            entry.pop("image", None)
            entry.pop("imagePath", None)


def create_entry(project_id, rail, args):
    import features
    text = workspace.text(args.get("text"), 16000)
    if not features.is_valid_rail(project_id, rail) or not text:
        raise workspace.WorkspaceError(400, "条目内容为空。")
    entry = {"id": "n_" + uuid4().hex, "text": text, "ts": timestamp(),
             "source": workspace.text(args.get("source"), 240) or "Weave"}
    for field in ("due", "url", "parentId", "ideaId", "paperId", "dependsOn", "kind", "path", "taskId", "category", "libraryId"):
        if field in args and args[field] is not None:
            entry[field] = args[field]
    _apply_rich_fields(project_id, args, entry, allow_clear=False)
    def operation(item):
        if rail == "goals":
            ids = {goal["id"] for goal in item["rails"]["goals"]}
            if any(value not in ids for value in entry.get("dependsOn", [])):
                raise workspace.WorkspaceError(400, "前置目标不存在。")
            if entry.get("parentId") and entry["parentId"] not in ids:
                raise workspace.WorkspaceError(400, "父目标不存在。")
        item["rails"].setdefault(rail, []).append(entry)
        return entry
    return mutate(project_id, operation)


def update_entry(project_id, rail, args):
    import features
    if not features.is_valid_rail(project_id, rail):
        raise workspace.WorkspaceError(400, "未找到对应的项目功能。")

    def operation(item):
        entry = next((note for note in item["rails"].get(rail, []) if note["id"] == args.get("id")), None)
        if not entry:
            raise workspace.WorkspaceError(404, "条目不存在。")
        if "text" in args and args["text"] is not None:
            text = workspace.text(args["text"], 16000)
            if not text:
                raise workspace.WorkspaceError(400, "内容为空。")
            entry["text"] = text
        if "category" in args and args["category"] is not None:
            category = workspace.text(args["category"], 80)
            if not category:
                raise workspace.WorkspaceError(400, "归档分类不能为空。")
            entry["category"] = category
        for field in ("url", "kind"):
            if field in args and args[field] is not None:
                entry[field] = args[field]
        if args.get("source") is not None:
            entry["source"] = workspace.text(args["source"], 240) or "Weave"
        _apply_rich_fields(project_id, args, entry, allow_clear=True)
        if rail == "goals":
            if "due" in args:
                entry["due"] = args["due"]
            if "dependsOn" in args:
                raw_deps = args["dependsOn"]
                if not isinstance(raw_deps, list) or not all(isinstance(v, str) for v in raw_deps):
                    raise workspace.WorkspaceError(400, "前置目标格式无效。")
                goals_by_id = {goal["id"]: goal for goal in item["rails"]["goals"]}
                deps = list(dict.fromkeys(raw_deps))
                if entry["id"] in deps or any(dep not in goals_by_id for dep in deps):
                    raise workspace.WorkspaceError(400, "前置目标不存在或形成自依赖。")
                # Prevent dependency cycles from breaking topological timeline layout.
                seen, stack = set(), list(deps)
                while stack:
                    cur = stack.pop()
                    if cur == entry["id"]:
                        raise workspace.WorkspaceError(400, "前置目标不能形成循环依赖。")
                    if cur not in seen:
                        seen.add(cur)
                        stack.extend(goals_by_id[cur].get("dependsOn", []))
                if entry.get("done") and any(not goals_by_id[dep].get("done") for dep in deps):
                    raise workspace.WorkspaceError(409, "已完成的目标不能依赖未完成的目标。")
                entry["dependsOn"] = deps
            if "done" in args:
                if args["done"] and any(not goal.get("done") for goal in item["rails"]["goals"] if goal["id"] in entry.get("dependsOn", [])):
                    raise workspace.WorkspaceError(409, "请先完成前置目标。")
                if not args["done"] and any(goal.get("done") and entry["id"] in goal.get("dependsOn", []) for goal in item["rails"]["goals"]):
                    raise workspace.WorkspaceError(409, "请先撤销依赖此目标的已完成目标。")
                entry["done"] = bool(args["done"])
        entry["updatedAt"] = timestamp()
        return entry
    return mutate(project_id, operation)


def delete_entry(project_id, rail, entry_id):
    import features
    if not features.is_valid_rail(project_id, rail) or not isinstance(entry_id, str) or not entry_id:
        raise workspace.WorkspaceError(400, "无效条目参数。")

    def operation(item):
        entries = item["rails"].get(rail, [])
        target = next((note for note in entries if note["id"] == entry_id), None)
        if not target:
            raise workspace.WorkspaceError(404, "条目不存在。")
        item["rails"][rail] = [note for note in entries if note["id"] != entry_id]
        if rail == "goals":
            for goal in item["rails"]["goals"]:
                if entry_id in goal.get("dependsOn", []):
                    goal["dependsOn"] = [dep for dep in goal["dependsOn"] if dep != entry_id]
                if goal.get("parentId") == entry_id:
                    goal.pop("parentId", None)
        return {"ok": True, "id": entry_id}

    return mutate(project_id, operation)


def dismiss_feed(project_id, args):
    entry_id = args.get("id")
    key = workspace.text(args.get("key"), 4000)

    def operation(item):
        if isinstance(entry_id, str) and entry_id:
            before = len(item["rails"]["feed"])
            item["rails"]["feed"] = [note for note in item["rails"]["feed"] if note.get("id") != entry_id]
            if len(item["rails"]["feed"]) != before:
                return {"ok": True}
        if not key:
            raise workspace.WorkspaceError(400, "缺少动态条目标识。")
        hidden = item.setdefault("dismissedFeed", [])
        if key not in hidden:
            hidden.append(key)
        return {"ok": True}

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
    extra = {}
    mime = IMAGE_MIME_BY_EXT.get(destination.suffix.lower())
    if mime and len(body) <= MAX_ENTRY_IMAGE_BYTES:
        try:
            extra["imageData"] = _encode_image_bytes(body, expected_mime=mime)
        except workspace.WorkspaceError:
            pass
    try:
        return create_entry(project_id, "library", {"text": name, "path": relative, "kind": "file", **extra})
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


def create_project(name, identity=None):
    name = workspace.text(name, 200)
    if not name:
        raise workspace.WorkspaceError(400, "项目名称为空。")
    identity = identity or "proj_" + uuid4().hex
    thread = "thr_" + uuid4().hex
    for _ in range(5):
        saved = workspace.snapshot()
        if saved["revision"] == 0:
            saved.update(state={"version": 2, "projects": []}, settings={})
        existing = next((p for p in saved["state"]["projects"] if p["id"] == identity), None)
        if existing is not None:
            return existing
        item = {"id": identity, "name": name, "createdAt": timestamp(), "updatedAt": timestamp(),
                "activeThreadId": thread, "threads": [{"id": thread, "title": "项目助手", "messages": []}],
                "rails": {rail: [] for rail in workspace.RAILS}}
        saved["state"]["projects"].append(item)
        try:
            workspace.save(saved)
            import features
            features.suppress_optional_builtins(identity)
            return item
        except workspace.WorkspaceError as exc:
            if exc.status != 409:
                raise
    raise workspace.WorkspaceError(409, "项目正在更新，请重试。")


def delete_project(project_id):
    if project_id == "global" or not isinstance(project_id, str) or not project_id.strip():
        raise workspace.WorkspaceError(403, "全局助手工作区不能删除。")
    for _ in range(5):
        saved = workspace.snapshot()
        items = saved.get("state", {}).get("projects", [])
        remaining = [p for p in items if p["id"] != project_id]
        if len(remaining) == len(items):
            raise workspace.WorkspaceError(404, "项目不存在。")
        saved["state"]["projects"] = remaining
        try:
            workspace.save(saved)
            break
        except workspace.WorkspaceError as exc:
            if exc.status != 409:
                raise
    else:
        raise workspace.WorkspaceError(409, "项目正在更新，请重试。")
    with closing(workspace.database()) as db, db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_plugins'").fetchone():
            db.execute("DELETE FROM native_plugins WHERE scope=?", (project_id,))
        import memory_store
        memory_store.delete_project_memories(db, project_id)
    import features
    features.clear_project(project_id)
    return {"ok": True}


def call(name, args, project_id):
    if name == "project_list":
        return [{"id": p["id"], "name": p["name"]} for p in workspace.snapshot().get("state", {}).get("projects", [])
                if project_id == "global" or p["id"] == project_id]
    if name == "project_create":
        if project_id != "global":
            raise workspace.WorkspaceError(403, "请在全局助手创建项目。")
        return create_project(args.get("name"))
    import memory_store
    if name in ("global_memory_search", "global_memory_write", "global_memory_pin"):
        if project_id != "global":
            raise workspace.WorkspaceError(403, "项目会话不能读取或修改全局记忆。")
        if args.get("projectId") not in (None, "global"):
            raise workspace.WorkspaceError(400, "全局记忆工具不接受 projectId，请改用 memory_write 或 memory_search。")
        if name == "global_memory_search":
            return memory_store.search_memories(
                "global",
                args.get("query", ""),
                category=workspace.text(args.get("category"), 60) or None,
                limit=args.get("limit") or 20,
            )
        if name == "global_memory_write":
            raw = args.get("content") if args.get("content") is not None else args.get("text")
            content = workspace.text(raw, 4000)
            if not content:
                raise workspace.WorkspaceError(400, "记忆内容不能为空。")
            pinned = bool(args.get("pinned")) if "pinned" in args else None
            return memory_store.remember(
                "global",
                content,
                workspace.text(args.get("category"), 60) or "note",
                source=args.get("source") or "conversation",
                pinned=pinned,
            )
        return memory_store.pin_memory(
            "global",
            workspace.text(args.get("id"), 100),
            bool(args.get("pinned", True)),
        )
    if project_id == "global":
        project_id = args.get("projectId", "global")
        if project_id == "global":
            raise workspace.WorkspaceError(400, "请先选择 projectId。")

    if name.startswith(('research_state_', 'evidence_', 'workflow_')):
        import research_api
        return research_api.call_tool(name, args, project_id)

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
        return memory_store.delete_memory(project_id, args.get("id"))
    if name == "memory_pin":
        return memory_store.pin_memory(project_id, workspace.text(args.get("id"), 100), bool(args.get("pinned", True)))
    if name == "memory_update":
        raw_text = args.get("text") if args.get("text") is not None else args.get("content")
        next_text = workspace.text(raw_text, 16000) if raw_text is not None else None
        if raw_text is not None and not next_text:
            raise workspace.WorkspaceError(400, "记忆内容不能为空。")
        pinned = bool(args.get("pinned")) if "pinned" in args else None
        return memory_store.update_memory(
            project_id,
            workspace.text(args.get("id"), 100),
            content=next_text,
            category=args.get("category"),
            pinned=pinned,
        )
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
        return memory_store.search_memories(
            project_id,
            args.get("query", ""),
            category=workspace.text(args.get("category"), 60) or None,
            limit=args.get("limit") or 20,
        )
    if name == "memory_write":
        raw = args.get("text") if args.get("text") is not None else args.get("content")
        text = workspace.text(raw, 16000)
        if not text:
            raise workspace.WorkspaceError(400, "记忆内容不能为空。")
        pinned = bool(args.get("pinned")) if "pinned" in args else None
        return remember(
            project_id,
            text,
            args.get("category", "decision"),
            source=args.get("source") or "conversation",
            pinned=pinned,
        )
    if name in ("idea_create", "goal_create"):
        return create_entry(project_id, "ideas" if name.startswith("idea") else "goals", args)
    if name == "feature_entries":
        import features
        fid = args.get("featureId")
        if fid == "chat" or not features.is_valid_rail(project_id, fid):
            raise workspace.WorkspaceError(400, "未找到对应的项目功能。")
        meta = next(f for f in features.list_features("global", project_id) if f["id"] == fid)
        item = project(workspace.snapshot(), project_id)
        entries = list(item["rails"].get(fid, []))
        if fid == "feed":
            import automation
            feed = automation.public_jobs().get(project_id, {}).get("feed", {})
            hidden = set(item.get("dismissedFeed", []))
            entries.extend(e for e in feed.get("items", []) if (e.get("url") or e["text"]) not in hidden)
        return {"featureId": fid, "label": meta["label"], "categories": meta["categories"], "entries": entries}
    if name == "feature_push":
        import features
        fid = args.get("featureId")
        if fid == "chat" or not features.is_valid_rail(project_id, fid):
            raise workspace.WorkspaceError(400, "未找到对应的项目功能。")
        if args.get("id"):
            return update_entry(project_id, fid, args)
        return create_entry(project_id, fid, args)
    if name in ("idea_update", "goal_update"):
        return update_entry(project_id, "ideas" if name.startswith("idea") else "goals", args)
    if name == "task_create":
        import tasks
        return tasks.create({"projectId": project_id, "prompt": args.get("text"), "goalId": args.get("goalId")})
    raise workspace.WorkspaceError(404, "未知业务工具。")
