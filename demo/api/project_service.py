"""Project-scoped business operations shared by HTTP and DSH MCP tools."""
from contextlib import closing
from datetime import date, datetime, timezone
import base64
import codecs
from hashlib import sha256
import json
from pathlib import Path
import re
import shutil
import subprocess
from urllib.parse import urlsplit
from uuid import uuid4
from xml.etree import ElementTree
import workspace


MAX_RESOURCE_BYTES = 25 * 1024 ** 2
OUTPUT_DIRECTORY = "outputs"
# The experiment services already write their run files to these project-owned directories.
GENERATED_DIRECTORIES = (OUTPUT_DIRECTORY, "experiments/sandbox", "experiments/workflows")


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
            if not getattr(exc, "retryable", False):
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
    import memory_store
    result["coreMemories"] = memory_store.core_memories(project_id)
    import features
    result["projectParadigms"] = features.project_paradigms(project_id)
    directory = folder(project_id)
    result["directory"] = str(directory)
    result["outputDirectory"] = str(directory / OUTPUT_DIRECTORY)
    import research_ledger
    result['researchState'] = research_ledger.state(project_id)
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


def _valid_date(value):
    if not isinstance(value, str) or not re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
        return False
    try:
        date.fromisoformat(value)
    except ValueError:
        return False
    return True


def _bot_record_fields(args, entry):
    from features import BOT_RECORD_TEXT_FIELDS
    for key, (_, limit) in BOT_RECORD_TEXT_FIELDS.items():
        if key in args:
            entry[key] = workspace.text(args[key], limit)
    if "eventDate" in args:
        if args["eventDate"] is None:
            entry.pop("eventDate", None)
        elif _valid_date(args["eventDate"]):
            entry["eventDate"] = args["eventDate"]
        else:
            raise workspace.WorkspaceError(400, "事件日期须使用 YYYY-MM-DD。")
    if "plannedDate" in args:
        if args["plannedDate"] in (None, ""):
            entry.pop("plannedDate", None)
        elif _valid_date(args["plannedDate"]):
            entry["plannedDate"] = args["plannedDate"]
        else:
            raise workspace.WorkspaceError(400, "安排日期须使用 YYYY-MM-DD。")


def _entry_elements(args, entry, extension, records):
    if "elements" not in args:
        return
    values = args["elements"]
    if not extension or not isinstance(values, dict):
        raise workspace.WorkspaceError(400, "只能填写这个项目扩展范式定义的元素。")
    fields = {field["name"]: field["type"] for field in extension["fields"]}
    merged = dict(entry.get("elements", {}))
    for name, value in values.items():
        kind = fields.get(name)
        if kind is None:
            raise workspace.WorkspaceError(400, "只能填写这个项目扩展范式定义的元素。")
        if value is None:
            merged.pop(name, None)
            continue
        valid = False
        if kind == "number":
            valid = type(value) in (int, float) and -1e308 <= value <= 1e308
        elif kind == "boolean":
            valid = isinstance(value, bool)
        elif kind == "date":
            valid = _valid_date(value)
        elif isinstance(value, str) and len(value) <= 4000:
            if kind == "url":
                try:
                    valid = bool(workspace.safe_link(value) and urlsplit(value).hostname)
                except ValueError:
                    valid = False
            elif kind == "reference":
                valid = value != entry["id"] and any(record["id"] == value for record in records)
            else:
                valid = kind == "text"
        if not valid:
            raise workspace.WorkspaceError(400, f"「{name}」的值不符合字段类型或引用范围。")
        merged[name] = value
    entry["elements"] = merged


def _record_reference(value, rails, source):
    if not isinstance(value, dict):
        raise workspace.WorkspaceError(400, "关联记录格式无效。")
    feature_id, entry_id = value.get("featureId"), value.get("id")
    if not isinstance(feature_id, str) or not isinstance(entry_id, str) or (feature_id, entry_id) == source:
        raise workspace.WorkspaceError(400, "请选择本项目中的另一条记录。")
    if not any(record["id"] == entry_id for record in rails.get(feature_id, [])):
        raise workspace.WorkspaceError(404, "关联记录不存在于本项目。")
    return {"featureId": feature_id, "id": entry_id}


def _apply_record_references(args, entry, rail, rails):
    if "recordRefs" not in args:
        return
    values = args["recordRefs"]
    if not isinstance(values, list) or len(values) > 32:
        raise workspace.WorkspaceError(400, "每条记录最多可关联 32 条项目记录。")
    references = []
    for value in values:
        ref = _record_reference(value, rails, (rail, entry["id"]))
        if ref not in references:
            references.append(ref)
    entry["recordRefs"] = references


NOTE_FIELDS = ("title", "text", "category", "noteTags")


def _note_payload(args, entry):
    if "category" in args:
        value = args["category"]
        if not isinstance(value, str) or len(value) > 80:
            raise workspace.WorkspaceError(400, "目录路径须在 80 字以内。")
        parts = value.split("/") if value else []
        if any(not part.strip() or part.strip() in (".", "..") or "\\" in part for part in parts) or len(parts) > 6:
            raise workspace.WorkspaceError(400, "目录路径无效，最多支持六层。")
        entry["category"] = "/".join(part.strip() for part in parts)
    if "noteTags" in args:
        tags = args["noteTags"]
        if not isinstance(tags, list) or len(tags) > 12 or any(not isinstance(tag, str) or len(tag) > 32 for tag in tags):
            raise workspace.WorkspaceError(400, "最多 12 个标签，每个标签不超过 32 字。")
        entry["noteTags"] = list(dict.fromkeys(tag.strip() for tag in tags if tag.strip()))


def _note_version(entry):
    return {"version": entry.get("noteVersion", 1),
            "at": entry.get("noteEditedAt") or entry.get("ts"),
            "author": entry.get("noteEditor") or entry.get("noteOrigin", "user"),
            **{field: entry.get(field) for field in NOTE_FIELDS}}


def _record_note_edit(entry, previous, author):
    if any(entry.get(field) != previous[field] for field in NOTE_FIELDS):
        entry["noteHistory"] = [previous, *entry.get("noteHistory", [])][:8]
        entry.update(noteVersion=previous["version"] + 1, noteEditedAt=timestamp(), noteEditor=author)


def create_entry(project_id, rail, args, *, planning_draft=False, assistant=False):
    import features
    if not features.is_valid_rail(project_id, rail):
        raise workspace.WorkspaceError(400, "未找到对应的项目功能。")
    bot = next((feature for feature in features.list_features(project_id, project_id) if feature["id"] == rail), {}) if rail.startswith("feat_") else {}
    extension = bot.get("extension")
    notebook = bot.get("layout") == "notebook"
    text = workspace.text(args.get("text"), 16000)
    if not text and extension and isinstance(args["elements"], dict):
        display = {field["role"]: args["elements"].get(field["name"]) for field in extension["fields"]}
        text = next((workspace.text(display[role], 4000) for role in ("summary", "title")
                     if isinstance(display.get(role), str) and display[role].strip()), "")
    if not text:
        raise workspace.WorkspaceError(400, "条目内容为空。")
    entry = {"id": "n_" + uuid4().hex, "text": text, "ts": timestamp(),
             "source": workspace.text(args.get("source"), 240) or "Weave"}
    if planning_draft:
        entry.update(planningDraft=True, source="AI 建议")
    for field in ("due", "url", "parentId", "ideaId", "paperId", "dependsOn", "kind", "path", "taskId", "category", "libraryId"):
        if field in args and args[field] is not None:
            entry[field] = args[field]
    _apply_rich_fields(project_id, args, entry, allow_clear=False)
    _bot_record_fields(args, entry)
    if notebook:
        _note_payload(args, entry)
        if entry.get("kind") == "note-folder" and not entry.get("category"):
            raise workspace.WorkspaceError(400, "请输入目录名称。")
        entry.update(noteVersion=1, noteOrigin="assistant" if assistant else "user")
    def operation(item):
        records = item["rails"].setdefault(rail, [])
        if notebook and entry.get("kind") == "note-folder" and any(
                record.get("kind") == "note-folder" and record.get("category") == entry["category"] for record in records):
            raise workspace.WorkspaceError(409, "该目录已存在。")
        _entry_elements(args, entry, extension, records)
        _apply_record_references(args, entry, rail, item["rails"])
        if rail == "goals" or rail.startswith("feat_") or "parentId" in entry:
            ids = {record["id"] for record in records}
            dependencies = entry.get("dependsOn", [])
            if not isinstance(dependencies, list) or any(not isinstance(value, str) or value not in ids for value in dependencies):
                raise workspace.WorkspaceError(400, "前置条目不存在。")
            if "parentId" in entry and (not isinstance(entry["parentId"], str) or entry["parentId"] not in ids):
                raise workspace.WorkspaceError(400, "关联条目不在这个 Bot 内。")
        records.append(entry)
        return entry
    return mutate(project_id, operation)


def update_entry(project_id, rail, args, *, draft_only=False, assistant=False):
    import features
    if not features.is_valid_rail(project_id, rail):
        raise workspace.WorkspaceError(400, "未找到对应的项目功能。")
    bot = next((feature for feature in features.list_features(project_id, project_id) if feature["id"] == rail), {}) if rail.startswith("feat_") else {}
    extension = bot.get("extension")
    notebook = bot.get("layout") == "notebook"
    is_goal = rail == "goals" or bot.get("paradigm") == "goals" or bool(extension and extension["base"] == "goals")

    def operation(item):
        entry = next((note for note in item["rails"].get(rail, []) if note["id"] == args.get("id")), None)
        if not entry:
            raise workspace.WorkspaceError(404, "条目不存在。")
        if draft_only and not entry.get("planningDraft"):
            raise workspace.WorkspaceError(409, "正式排期由用户修改。请创建待确认的排期建议。")
        if entry.get("planningDraft") and "done" in args:
            raise workspace.WorkspaceError(409, "请先确认排期，再更新完成状态。")
        previous_note = _note_version(entry) if notebook else None
        if notebook and assistant and entry.get("noteOrigin") != "assistant" and any(field in args for field in NOTE_FIELDS):
            raise workspace.WorkspaceError(409, "修改用户笔记请提交 AI 整理草稿，由用户确认。")
        if notebook and "expectedNoteVersion" in args and (
                type(args["expectedNoteVersion"]) is not int or args["expectedNoteVersion"] != previous_note["version"]):
            raise workspace.WorkspaceError(409, "笔记已有新版本。请重新打开后合并修改。")
        if "text" in args and args["text"] is not None:
            text = workspace.text(args["text"], 16000)
            if not text:
                raise workspace.WorkspaceError(400, "内容为空。")
            entry["text"] = text
        if not notebook and "category" in args and args["category"] is not None:
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
        _bot_record_fields(args, entry)
        if notebook:
            _note_payload(args, entry)
            _record_note_edit(entry, previous_note, "assistant" if assistant else "user")
        records = item["rails"].get(rail, [])
        _entry_elements(args, entry, extension, records)
        _apply_record_references(args, entry, rail, item["rails"])
        if "parentId" in args and (is_goal or rail.startswith("feat_")):
            parent = args["parentId"]
            if parent is None:
                entry.pop("parentId", None)
            else:
                by_id = {record["id"]: record for record in records}
                if not isinstance(parent, str) or parent not in by_id:
                    raise workspace.WorkspaceError(400, "关联条目不在这个 Bot 内。")
                seen = {entry["id"]}
                current = parent
                while isinstance(current, str) and current in by_id:
                    if current in seen:
                        raise workspace.WorkspaceError(400, "关联条目不能形成循环。")
                    seen.add(current)
                    current = by_id[current].get("parentId")
                entry["parentId"] = parent
        if is_goal:
            if "due" in args:
                entry["due"] = args["due"]
            if "dependsOn" in args:
                raw_deps = args["dependsOn"]
                if not isinstance(raw_deps, list) or not all(isinstance(v, str) for v in raw_deps):
                    raise workspace.WorkspaceError(400, "前置目标格式无效。")
                goals_by_id = {goal["id"]: goal for goal in item["rails"].get(rail, [])}
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
                if args["done"] and any(not goal.get("done") for goal in item["rails"].get(rail, []) if goal["id"] in entry.get("dependsOn", [])):
                    raise workspace.WorkspaceError(409, "请先完成前置目标。")
                if not args["done"] and any(goal.get("done") and entry["id"] in goal.get("dependsOn", []) for goal in item["rails"].get(rail, [])):
                    raise workspace.WorkspaceError(409, "请先撤销依赖此目标的已完成目标。")
                entry["done"] = bool(args["done"])
        entry["updatedAt"] = timestamp()
        return entry
    return mutate(project_id, operation)


def decide_goal_draft(project_id, feature_id, entry_id, accept):
    import features
    bot = next((f for f in features.list_features(project_id, project_id) if f["id"] == feature_id), {})
    if bot.get("layout") != "calendar" or type(accept) is not bool:
        raise workspace.WorkspaceError(400, "无效的排期草稿操作。")

    def operation(item):
        records = item["rails"].get(feature_id, [])
        draft = next((record for record in records if record["id"] == entry_id), None)
        if not draft:
            raise workspace.WorkspaceError(404, "排期草稿不存在。")
        if not draft.get("planningDraft"):
            if accept:
                return draft
            raise workspace.WorkspaceError(409, "该条目已确认，请在待办详情中编辑。")
        if accept:
            draft.pop("planningDraft")
            draft["updatedAt"] = timestamp()
            return draft
        records.remove(draft)
        for record in records:
            if record.get("parentId") == entry_id:
                record.pop("parentId", None)
            if entry_id in (record.get("dependsOn") or []):
                record["dependsOn"] = [value for value in record["dependsOn"] if value != entry_id]
        return {"id": entry_id, "discarded": True}
    return mutate(project_id, operation)


def change_record_reference(project_id, rail, entry_id, reference, remove):
    import features
    if not features.is_valid_rail(project_id, rail) or type(remove) is not bool:
        raise workspace.WorkspaceError(400, "无效关联操作。")

    def operation(item):
        rails = item["rails"]
        entry = next((record for record in rails.get(rail, []) if record["id"] == entry_id), None)
        if not entry:
            raise workspace.WorkspaceError(404, "条目不存在。")
        refs = entry.setdefault("recordRefs", [])
        if remove:
            if not isinstance(reference, dict):
                raise workspace.WorkspaceError(400, "关联记录格式无效。")
            target = {"featureId": reference.get("featureId"), "id": reference.get("id")}
            if target in refs:
                refs.remove(target)
        else:
            target = _record_reference(reference, rails, (rail, entry_id))
            if target not in refs:
                if len(refs) >= 32:
                    raise workspace.WorkspaceError(400, "每条记录最多可关联 32 条项目记录。")
                refs.append(target)
        entry["updatedAt"] = timestamp()
        return entry
    return mutate(project_id, operation)


def _find_notebook_entry(item, rail, entry_id):
    if not isinstance(rail, str) or not isinstance(entry_id, str):
        raise workspace.WorkspaceError(400, "无效笔记标识。")
    entry = next((record for record in item["rails"].get(rail, []) if record["id"] == entry_id), None)
    if not entry or "noteVersion" not in entry or entry.get("kind") == "note-folder":
        raise workspace.WorkspaceError(404, "笔记不存在。")
    return entry


def note_history(project_id, rail, entry_id):
    entry = _find_notebook_entry(project(workspace.snapshot(), project_id), rail, entry_id)
    return {"versions": [_note_version(entry), *entry.get("noteHistory", [])]}


def suggest_note_edit(project_id, args):
    body = workspace.text(args.get("text"), 16000)
    if not body or type(args.get("baseVersion")) is not int:
        raise workspace.WorkspaceError(400, "须提供整理后的正文和现有版本号。")

    def operation(item):
        entry = _find_notebook_entry(item, args.get("featureId"), args.get("id"))
        if entry["noteVersion"] != args["baseVersion"]:
            raise workspace.WorkspaceError(409, "笔记已有新版本，请重新读取后再提出建议。")
        if entry["text"] == body:
            raise workspace.WorkspaceError(400, "整理建议与当前正文相同。")
        proposal = {"id": "suggest_" + uuid4().hex, "baseVersion": entry["noteVersion"], "text": body,
                    "reason": workspace.text(args.get("reason"), 500), "at": timestamp()}
        entry["noteSuggestion"] = proposal
        return proposal
    return mutate(project_id, operation)


def decide_note_edit(project_id, args):
    if type(args.get("accept")) is not bool:
        raise workspace.WorkspaceError(400, "无效的笔记草稿操作。")

    def operation(item):
        entry = _find_notebook_entry(item, args.get("featureId"), args.get("id"))
        proposal = entry.get("noteSuggestion")
        if not proposal or proposal["id"] != args.get("suggestionId"):
            raise workspace.WorkspaceError(409, "整理草稿已被更新或处理。")
        if args["accept"]:
            previous = _note_version(entry)
            if previous["version"] != proposal["baseVersion"]:
                raise workspace.WorkspaceError(409, "原笔记已有改动，请重新生成整理建议。")
            entry["text"] = proposal["text"]
            _record_note_edit(entry, previous, "assistant")
            entry["updatedAt"] = timestamp()
        entry.pop("noteSuggestion")
        return {"id": entry["id"], "accepted": args["accept"], "version": entry["noteVersion"]}
    return mutate(project_id, operation)


def delete_entry(project_id, rail, entry_id):
    import features
    if not features.is_valid_rail(project_id, rail) or not isinstance(entry_id, str) or not entry_id:
        raise workspace.WorkspaceError(400, "无效条目参数。")
    bot = next((bot for bot in features.list_features(project_id, project_id) if bot["id"] == rail), {})
    reference_fields = [field["name"] for field in (bot.get("extension") or {}).get("fields", [])
                        if field["type"] == "reference"]

    def operation(item):
        entries = item["rails"].get(rail, [])
        target = next((note for note in entries if note["id"] == entry_id), None)
        if not target:
            raise workspace.WorkspaceError(404, "条目不存在。")
        item["rails"][rail] = [note for note in entries if note["id"] != entry_id]
        for entry in item["rails"][rail]:
            if entry.get("parentId") == entry_id:
                entry.pop("parentId", None)
            dependencies = entry.get("dependsOn")
            if isinstance(dependencies, list) and entry_id in dependencies:
                entry["dependsOn"] = [dep for dep in dependencies if dep != entry_id]
            elements = entry.get("elements") or {}
            for name in reference_fields:
                if elements.get(name) == entry_id:
                    elements.pop(name)
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


def _stored_file_entries(project_id):
    item = project(workspace.snapshot(), project_id)
    return [entry for entry in item["rails"]["library"]
            if entry.get("kind") == "file" and str(entry.get("path", "")).startswith("resources/")]


def _generated_directories(root):
    for relative in GENERATED_DIRECTORIES:
        path = root
        for part in Path(relative).parts:
            path /= part
            if path.is_symlink() or path.is_junction():
                break
        else:
            if path.is_dir() and path.resolve().is_relative_to(root):
                yield path


def _generated_files(root):
    for directory in _generated_directories(root):
        for parent, directories, filenames in directory.walk(follow_symlinks=False):
            directories[:] = [name for name in directories
                              if not (parent / name).is_symlink() and not (parent / name).is_junction()]
            for name in filenames:
                path = parent / name
                if path.is_symlink() or path.is_junction() or not path.is_file():
                    continue
                relative = path.relative_to(root).as_posix()
                identity = "generated_" + sha256(f"{root.name}/{relative}".encode("utf-8")).hexdigest()
                yield identity, relative, path


def stored_files(project_id):
    entries = [{"id": entry["id"], "name": entry["text"], "storedAt": entry.get("ts")}
               for entry in _stored_file_entries(project_id)]
    if project_id != "global":
        for identity, relative, path in _generated_files(folder(project_id)):
            try:
                modified = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).isoformat()
            except FileNotFoundError:
                continue
            entries.append({"id": identity, "name": path.name, "path": relative, "storedAt": modified})
    return sorted(entries, key=lambda entry: (entry.get("storedAt") or "", entry["id"]), reverse=True)


def _stored_file(project_id, file_id):
    entries = _stored_file_entries(project_id)
    root = folder(project_id)
    entry = next((file for file in entries if file["id"] == file_id), None)
    if entry:
        path = resource_path(project_id, file_id)
        name = entry["text"]
        if not path.is_relative_to(root / "resources") or not path.is_file():
            raise workspace.WorkspaceError(404, "本机上的文件已移除或不可用。")
    elif project_id != "global" and isinstance(file_id, str) and file_id.startswith("generated_"):
        path = next((file for identity, _, file in _generated_files(root) if identity == file_id), None)
        if path is None or not path.resolve().is_relative_to(root):
            raise workspace.WorkspaceError(404, "未找到这个项目的文件。")
        name = path.name
    else:
        raise workspace.WorkspaceError(404, "未找到这个项目的文件。")
    return name, path


def read_stored_reference(project_id, file_id, page=1):
    name, path = _stored_file(project_id, file_id)
    with path.open("rb") as file:
        if path.suffix.lower() == ".pdf":
            from pypdf import PdfReader
            from pypdf.errors import PdfReadError
            if path.stat().st_size > 50 * 1024**2:
                return {"name": name, "note": "PDF 超过可预览大小。"}
            try:
                reader = PdfReader(file)
                if not 1 <= page <= len(reader.pages):
                    raise workspace.WorkspaceError(400, "引用的 PDF 页码超出范围。")
                return {"name": name, "page": page, "pages": len(reader.pages),
                        "text": (reader.pages[page - 1].extract_text() or "")[:12000]}
            except PdfReadError as exc:
                raise workspace.WorkspaceError(400, "无法解析引用的 PDF。") from exc
        data = file.read(12001)
    try:
        if b"\0" in data:
            raise UnicodeError
        truncated = len(data) > 12000
        decoder = codecs.getincrementaldecoder("utf-8-sig")()
        return {"name": name, "text": decoder.decode(data[:12000], final=not truncated), "truncated": truncated}
    except UnicodeError:
        return {"name": name, "note": "此格式只提供文件引用，可在空间存储中打开。"}


def download_stored_file(project_id, file_id):
    name, path = _stored_file(project_id, file_id)
    try:
        with path.open("rb") as file:
            data = file.read(MAX_RESOURCE_BYTES + 1)
    except FileNotFoundError as exc:
        raise workspace.WorkspaceError(404, "本机上的文件已移除或不可用。") from exc
    if len(data) > MAX_RESOURCE_BYTES:
        raise workspace.WorkspaceError(413, "文件超过 25 MiB，无法从此面板下载。")
    return {"name": name, "data": base64.b64encode(data).decode("ascii")}


def upload(payload):
    project_id = payload.get("projectId")
    name = Path(workspace.text(payload.get("name"), 200)).name
    if not name or "/" in name or "\\" in name:
        raise workspace.WorkspaceError(400, "无效文件名。")
    body = base64.b64decode(payload.get("data", ""), validate=True)
    if not body or len(body) > MAX_RESOURCE_BYTES:
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


def create_project(name, identity=None, *, source_paths=None):
    name = workspace.text(name, 200)
    if not name:
        raise workspace.WorkspaceError(400, "项目名称为空。")
    identity = identity or "proj_" + uuid4().hex
    thread = "thr_" + uuid4().hex
    sources = None
    for _ in range(5):
        saved = workspace.snapshot()
        if saved["revision"] == 0:
            saved.update(state={"version": 2, "projects": []}, settings={})
        existing = next((p for p in saved["state"]["projects"] if p["id"] == identity), None)
        if existing is not None:
            return existing
        if sources is None and source_paths is not None:
            from project_sources import prepare_initial
            sources = prepare_initial(source_paths)
        item = {"id": identity, "name": name, "createdAt": timestamp(), "updatedAt": timestamp(),
                "activeThreadId": thread, "threads": [{"id": thread, "title": "项目助手", "messages": []}],
                "rails": {rail: [] for rail in workspace.RAILS}}
        if sources:
            item["sourceFolders"] = sources
        saved["state"]["projects"].append(item)
        try:
            workspace.save(saved)
            import features
            features.suppress_optional_builtins(identity)
            return item
        except workspace.WorkspaceError as exc:
            if not getattr(exc, "retryable", False):
                raise
    raise workspace.WorkspaceError(409, "项目正在更新，请重试。")


def delete_project(project_id, *, session_ids=None):
    if project_id == "global" or not isinstance(project_id, str) or not project_id.strip():
        raise workspace.WorkspaceError(403, "全局助手工作区不能删除。")
    for _ in range(5):
        saved = workspace.snapshot()
        items = saved.get("state", {}).get("projects", [])
        remaining = [p for p in items if p["id"] != project_id]
        if len(remaining) == len(items):
            raise workspace.WorkspaceError(404, "项目不存在。")
        base = (workspace.DATA / "projects").resolve()
        candidate = base / project_id
        if not re.fullmatch(r"[A-Za-z0-9_-]+", project_id) or candidate.is_symlink() or candidate.is_junction():
            raise workspace.WorkspaceError(400, "无效项目目录。")
        root = candidate.resolve()
        if root.parent != base:
            raise workspace.WorkspaceError(400, "无效项目目录。")

        def commit_deletion(db):
            if session_ids:
                import session_cleanup
                session_cleanup.enqueue(db, session_ids)
            try:
                for directory in _generated_directories(root):
                    shutil.rmtree(directory)
            except OSError as exc:
                raise workspace.WorkspaceError(423, "无法删除项目生成的文件，请关闭占用文件的程序后重试。") from exc

        saved["state"]["projects"] = remaining
        try:
            workspace.save(saved, before_commit=commit_deletion)
            break
        except workspace.WorkspaceError as exc:
            if not getattr(exc, "retryable", False):
                raise
    else:
        raise workspace.WorkspaceError(409, "项目正在更新，请重试。")
    with closing(workspace.database()) as db, db:
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='native_plugins'").fetchone():
            db.execute("DELETE FROM native_plugins WHERE scope=?", (project_id,))
        if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='sandbox_runs'").fetchone():
            now = timestamp()
            for (run_id, body) in db.execute(
                "SELECT id, body FROM sandbox_runs WHERE project=? AND status IN ('WAITING_APPROVAL','QUEUED')",
                (project_id,),
            ).fetchall():
                item = json.loads(body)
                item.update(status="CANCELLED", ended=now)
                db.execute(
                    "UPDATE sandbox_runs SET status='CANCELLED', body=? WHERE project=? AND id=?",
                    (json.dumps(item, ensure_ascii=False), project_id, run_id),
                )
        import memory_store
        memory_store.delete_project_memories(db, project_id)
    import features
    features.clear_project(project_id)
    import bot_dispatches
    bot_dispatches.clear_project(project_id)
    return {"ok": True}


def call(name, args, project_id, *, assistant=False):
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
    if name.startswith("memory_"):
        project(workspace.snapshot(), project_id)

    if name.startswith(('research_state_', 'evidence_')):
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
    if name == "project_paradigm_create":
        import features
        return features.create_project_paradigm(project_id, args, lenient_symbol=True)
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
        bots = features.list_features("global", project_id)
        meta = next(f for f in bots if f["id"] == fid)
        item = project(workspace.snapshot(), project_id)
        entries = list(item["rails"].get(fid, []))
        if fid == "feed":
            import automation
            feed = automation.public_jobs().get(project_id, {}).get("feed", {})
            hidden = set(item.get("dismissedFeed", []))
            entries.extend(e for e in feed.get("items", []) if (e.get("url") or e["text"]) not in hidden)
        members = [{"featureId": bot["id"], "label": bot["label"],
                    "entries": item["rails"].get(bot["id"], [])}
                   for bot in bots if bot.get("clusterParent") == fid]
        return {"featureId": fid, "label": meta["label"], "entries": entries, **({"members": members} if members else {})}
    if name == "feature_push":
        import features
        fid = args.get("featureId")
        if fid == "chat" or not features.is_valid_rail(project_id, fid):
            raise workspace.WorkspaceError(400, "未找到对应的项目功能。")
        draft = assistant and any(f["id"] == fid and f.get("layout") == "calendar"
                                  for f in features.list_features(project_id, project_id))
        if args.get("id"):
            return update_entry(project_id, fid, args, draft_only=draft, assistant=assistant)
        return create_entry(project_id, fid, args, planning_draft=draft, assistant=assistant)
    if name == "note_suggest_edit":
        return suggest_note_edit(project_id, args)
    if name in ("idea_update", "goal_update"):
        return update_entry(project_id, "ideas" if name.startswith("idea") else "goals", args)
    if name == "task_create":
        import tasks
        return tasks.create({"projectId": project_id, "prompt": args.get("text"), "goalId": args.get("goalId")})
    raise workspace.WorkspaceError(404, "未知业务工具。")
