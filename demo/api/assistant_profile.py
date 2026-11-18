"""Persistent profile, avatar, persona, SOUL, and global memories for the global assistant."""

import base64
from contextlib import closing
from datetime import datetime, timezone
import re

import naming
import project_service
import workspace


DEFAULT_TAGLINE = "理性、严谨、好奇，以证据与直觉共织科研灵感"
DEFAULT_PERSONA = (
    "专注科研思考与本地实验协作：重逻辑层次与实证依据，"
    "克制而有深度，清晰区分已验证结论与待探索假设。"
)
DEFAULT_SOUL = (
    "1. 实事求是：严格区分已验证事实、实验观察与推测假设，绝不编造数据、引用或实验结果。\n"
    "2. 证据先行：重要论断尽量追溯至项目文献、代码仓库或实际运行记录。\n"
    "3. 边界清晰：尊重科研项目上下文隔离与实验预算审批，绝不越权修改未指定的项目。\n"
    "4. 克制高效：用逻辑清晰、结构分明的语言协助研究者梳理方向与推进实验。"
)

MAX_AVATAR_BYTES = 1_500_000
_AVATAR_DATA_RE = re.compile(r"^data:image/(png|jpeg|webp|gif);base64,([A-Za-z0-9+/=]+)$")
_TEXT_LIMITS = {
    "tagline": 200,
    "persona": 2000,
    "soul": 8000,
}


def _now_iso():
    return datetime.now(timezone.utc).isoformat()


def _schema(db):
    db.execute(
        """CREATE TABLE IF NOT EXISTS labweave_assistant_profile (
            profile_key TEXT PRIMARY KEY,
            value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )"""
    )


def _clean_multiline(value, limit, field_label):
    if not isinstance(value, str):
        raise workspace.WorkspaceError(400, f"{field_label}必须是文本。")
    for char in value:
        code = ord(char)
        if code == 127 or (code < 32 and char not in ("\n", "\r", "\t")):
            raise workspace.WorkspaceError(400, f"{field_label}包含无效控制字符。")
    cleaned = value.replace("\r\n", "\n").strip()
    if len(cleaned) > limit:
        raise workspace.WorkspaceError(400, f"{field_label}不能超过 {limit} 个字符。")
    return cleaned


def _validate_avatar(value):
    if value is None or value == "":
        return ""
    if not isinstance(value, str):
        raise workspace.WorkspaceError(400, "头像格式无效。")
    match = _AVATAR_DATA_RE.fullmatch(value.strip())
    if not match:
        raise workspace.WorkspaceError(400, "仅支持 PNG、JPEG、WEBP 或 GIF 头像图片。")
    fmt, encoded = match.groups()
    try:
        raw = base64.b64decode(encoded, validate=True)
    except (ValueError, TypeError) as exc:
        raise workspace.WorkspaceError(400, "头像图片编码无效。") from exc
    if not 0 < len(raw) <= MAX_AVATAR_BYTES:
        raise workspace.WorkspaceError(400, "头像图片大小须在 1 字节至 1.5 MiB 之间。")
    valid_magic = (
        (fmt == "png" and raw.startswith(b"\x89PNG\r\n\x1a\n"))
        or (fmt == "jpeg" and raw.startswith(b"\xff\xd8\xff"))
        or (fmt == "webp" and len(raw) >= 12 and raw[:4] == b"RIFF" and raw[8:12] == b"WEBP")
        or (fmt == "gif" and (raw.startswith(b"GIF87a") or raw.startswith(b"GIF89a")))
    )
    if not valid_magic:
        raise workspace.WorkspaceError(400, "头像图片内容与格式声明不匹配。")
    return f"data:image/{fmt};base64,{base64.b64encode(raw).decode('ascii')}"


def _read_rows(db):
    rows = {}
    for key, value, updated_at in db.execute(
        "SELECT profile_key, value, updated_at FROM labweave_assistant_profile"
    ):
        rows[key] = (value, updated_at)
    return rows


def get_profile():
    name = naming.NamingStore().assistant_name()
    saved = workspace.snapshot()
    project_count = len(saved.get("state", {}).get("projects", []))
    with closing(workspace.database()) as db:
        _schema(db)
        rows = _read_rows(db)
    memories = project_service.memory_list("global")[:60]
    tagline_row = rows.get("tagline")
    persona_row = rows.get("persona")
    soul_row = rows.get("soul")
    avatar_row = rows.get("avatar")
    avatar = avatar_row[0] if avatar_row else ""
    soul_updated = soul_row[1] if soul_row else (persona_row[1] if persona_row else "")
    memory_updated = (memories[0].get("updatedAt") or memories[0]["created"]) if memories else ""
    return {
        "name": name,
        "tagline": tagline_row[0] if tagline_row and tagline_row[0] else DEFAULT_TAGLINE,
        "persona": persona_row[0] if persona_row and persona_row[0] else DEFAULT_PERSONA,
        "soul": soul_row[0] if soul_row and soul_row[0] else DEFAULT_SOUL,
        "soulUpdatedAt": soul_updated,
        "hasCustomAvatar": bool(avatar),
        "avatar": avatar,
        "memories": memories,
        "memoryUpdatedAt": memory_updated,
        "stats": {
            "projectCount": project_count,
            "memoryCount": len(memories),
        },
    }


def _set_field(db, key, value, now):
    db.execute(
        "INSERT OR REPLACE INTO labweave_assistant_profile(profile_key, value, updated_at) VALUES (?, ?, ?)",
        (key, value, now),
    )


def update_profile(data):
    if not isinstance(data, dict):
        raise workspace.WorkspaceError(400, "无效资料参数。")
    import memory_store
    action = data.get("action")
    if action == "memory_search":
        query = data.get("query", "")
        if query is not None and not isinstance(query, str):
            raise workspace.WorkspaceError(400, "搜索关键词无效。")
        cat = data.get("category")
        cleaned_cat = _clean_multiline(cat, 40, "记忆分类") if isinstance(cat, str) and cat.strip() else None
        return {
            "query": (query or "").strip(),
            "results": memory_store.search_memories("global", query or "", category=cleaned_cat, limit=40),
        }
    if action == "memory_add":
        content = _clean_multiline(data.get("content", ""), 4000, "记忆内容")
        if not content:
            raise workspace.WorkspaceError(400, "记忆内容不能为空。")
        raw_cat = data.get("category", "note")
        category = _clean_multiline(raw_cat if isinstance(raw_cat, str) and raw_cat.strip() else "note", 40, "记忆分类")
        pinned = bool(data.get("pinned")) if "pinned" in data else None
        project_service.remember("global", content, category, source="manual", pinned=pinned)
        return get_profile()
    if action == "memory_pin":
        mid = data.get("id")
        if not isinstance(mid, str) or not mid.strip():
            raise workspace.WorkspaceError(400, "无效记忆标识。")
        memory_store.pin_memory("global", mid.strip(), bool(data.get("pinned", True)))
        return get_profile()
    if action == "memory_update":
        mid = data.get("id")
        if not isinstance(mid, str) or not mid.strip():
            raise workspace.WorkspaceError(400, "无效记忆标识。")
        content = _clean_multiline(data.get("content", ""), 4000, "记忆内容")
        if not content:
            raise workspace.WorkspaceError(400, "记忆内容不能为空。")
        category = data.get("category")
        cleaned_cat = (_clean_multiline(category, 40, "记忆分类") or "note") if category is not None else None
        pinned = bool(data.get("pinned")) if "pinned" in data else None
        memory_store.update_memory("global", mid.strip(), content=content, category=cleaned_cat, pinned=pinned)
        return get_profile()
    if action == "memory_delete":
        mid = data.get("id")
        if not isinstance(mid, str) or not mid.strip():
            raise workspace.WorkspaceError(400, "无效记忆标识。")
        memory_store.delete_memory("global", mid.strip())
        return get_profile()
    if action == "reset_soul":
        now = _now_iso()
        with closing(workspace.database()) as db, db:
            _schema(db)
            _set_field(db, "soul", DEFAULT_SOUL, now)
        return get_profile()

    allowed = {"name", "tagline", "persona", "soul", "avatar"}
    unknown = set(data.keys()) - allowed
    if unknown:
        raise workspace.WorkspaceError(400, "包含不支持的资料字段。")

    if "name" in data:
        naming.NamingStore().rename_assistant(data["name"])

    now = _now_iso()
    labels = {"tagline": "一句话简介", "persona": "风格气质", "soul": "SOUL 核心准则"}
    updates = []
    for key, limit in _TEXT_LIMITS.items():
        if key in data:
            cleaned = _clean_multiline(data[key], limit, labels[key])
            if key == "tagline" and not cleaned:
                cleaned = DEFAULT_TAGLINE
            elif key == "persona" and not cleaned:
                cleaned = DEFAULT_PERSONA
            elif key == "soul" and not cleaned:
                cleaned = DEFAULT_SOUL
            updates.append((key, cleaned))
    if "avatar" in data:
        updates.append(("avatar", _validate_avatar(data["avatar"])))

    if updates:
        with closing(workspace.database()) as db, db:
            _schema(db)
            for key, value in updates:
                _set_field(db, key, value, now)

    return get_profile()


def summary_for_catalog():
    """Lightweight summary fields attached to the global catalog row."""
    with closing(workspace.database()) as db:
        _schema(db)
        rows = _read_rows(db)
    tagline_row = rows.get("tagline")
    avatar_row = rows.get("avatar")
    return {
        "tagline": tagline_row[0] if tagline_row and tagline_row[0] else DEFAULT_TAGLINE,
        "hasCustomAvatar": bool(avatar_row and avatar_row[0]),
        "avatar": avatar_row[0] if avatar_row else "",
    }
