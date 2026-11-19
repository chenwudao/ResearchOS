"""Per-project dynamic Feature Bot catalog, isolation, and bot session bindings."""

from contextlib import closing
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import secrets
import time

import naming
import workspace

BUILTIN_ORDER = ("chat", "feed", "ideas", "goals", "library")
OPTIONAL_BUILTINS = ("feed", "ideas", "goals", "library")
PROTECTED_FEATURES = frozenset({"chat"})
CUSTOM_FEATURE_ID_RE = re.compile(r"^feat_[a-f0-9]{8,24}$")
_AVATAR_CATALOG = Path(__file__).resolve().parents[2] / "plugins/dsh-labweave-workspace/client/assets/bot-avatars.json"
BOT_SYMBOLS = tuple(item["id"] for group in json.loads(_AVATAR_CATALOG.read_text(encoding="utf-8"))
                    for item in group["items"])

FEATURE_META = {
    "chat": {
        "hint": "项目主对话空间",
        "emptyText": "",
        "categories": [],
    },
    "feed": {
        "hint": "订阅并追踪前沿动态",
        "emptyText": "还没有收到任何动态推送",
        "categories": [
            ["paper", "论文"],
            ["news", "新闻"],
            ["repository", "仓库"],
            ["push", "推送动态"],
            ["file", "文件资源"],
        ],
    },
    "ideas": {
        "hint": "把灵感转化为目标",
        "emptyText": "还没有收集任何点子",
        "categories": [
            ["fresh", "待验证灵感"],
            ["converted", "已转入目标"],
            ["review", "复盘建议"],
            ["push", "推送点子"],
            ["file", "文件资源"],
        ],
    },
    "goals": {
        "hint": "追踪里程碑和实验",
        "emptyText": "还没有设定任何目标",
        "categories": [
            ["pending", "追踪中"],
            ["completed", "已完成"],
            ["workflow", "实验与证据"],
            ["push", "推送目标"],
            ["file", "文件资源"],
        ],
    },
    "library": {
        "hint": "文献、仓库和产物",
        "emptyText": "还没有收录任何资源",
        "categories": [
            ["pdf", "论文 PDF"],
            ["repository", "代码仓库"],
            ["output", "实验产物"],
            ["link", "网页链接"],
            ["file", "文件资源"],
        ],
    },
}


def ensure_tables(db):
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_schedules(
        project TEXT, feature TEXT, schedule TEXT, PRIMARY KEY(project,feature,schedule))""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_assignments(
        project TEXT, feature TEXT, kind TEXT, title TEXT, instruction TEXT NOT NULL,
        PRIMARY KEY(project,feature,kind,title))""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_feature_profiles(
        scope TEXT, feature_id TEXT, symbol TEXT NOT NULL, keywords TEXT NOT NULL,
        PRIMARY KEY(scope,feature_id))""")
    """Create dynamic feature and Feature Bot session tables inside SQLite without altering user_version."""
    db.execute(
        "CREATE TABLE IF NOT EXISTS labweave_features ("
        "scope TEXT NOT NULL, feature_id TEXT NOT NULL, label TEXT NOT NULL, "
        "hint TEXT NOT NULL DEFAULT '', deleted INTEGER NOT NULL DEFAULT 0, "
        "sort_order INTEGER NOT NULL DEFAULT 100, updated_ts INTEGER NOT NULL, "
        "PRIMARY KEY (scope, feature_id))"
    )
    db.execute(
        "CREATE TABLE IF NOT EXISTS labweave_feature_bots ("
        "project_id TEXT NOT NULL, feature_id TEXT NOT NULL, session_id TEXT NOT NULL, "
        "updated_ts INTEGER NOT NULL, PRIMARY KEY (project_id, feature_id))"
    )


def suppress_optional_builtins(project_id):
    """New projects start with chat only. Existing projects are left unchanged."""
    if not isinstance(project_id, str) or not project_id.startswith("proj_"):
        return
    now = int(time.time())
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        for fid in OPTIONAL_BUILTINS:
            db.execute(
                "INSERT INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
                "VALUES (?, ?, ?, '', 1, 999, ?) "
                "ON CONFLICT(scope, feature_id) DO NOTHING",
                (project_id, fid, naming.DEFAULT_FEATURE_LABELS[fid], now),
            )


def enable_builtin(project_id, feature_id):
    """Re-enable an optional built-in Feature Bot in one project (tests and later restore)."""
    fid = _clean_id(feature_id)
    if fid not in OPTIONAL_BUILTINS:
        raise workspace.WorkspaceError(400, "只能恢复可选的内置功能。")
    now = int(time.time())
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        db.execute(
            "INSERT INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
            "VALUES (?, ?, ?, '', 0, ?, ?) "
            "ON CONFLICT(scope, feature_id) DO UPDATE SET deleted = 0, updated_ts = excluded.updated_ts",
            (project_id, fid, naming.DEFAULT_FEATURE_LABELS[fid], (BUILTIN_ORDER.index(fid) + 1) * 10, now),
        )


def _projects_index():
    return {p["id"]: p for p in workspace.snapshot().get("state", {}).get("projects", [])}


def _validate_caller(caller_scope, projects):
    if not isinstance(caller_scope, str) or (
        caller_scope != "global" and caller_scope not in projects
    ):
        raise workspace.WorkspaceError(404, "未找到对应的工作区会话。")


def _resolve_target(caller_scope, project_id=None, *, require_project_from_global=False, allow_all=False):
    projects = _projects_index()
    _validate_caller(caller_scope, projects)
    if caller_scope != "global":
        if project_id is not None and project_id != caller_scope:
            raise workspace.WorkspaceError(403, "项目对话只能调整当前项目自己的功能。")
        return caller_scope, projects
    if project_id == "all":
        if not allow_all:
            raise workspace.WorkspaceError(400, "该操作不支持对 'all' 执行。")
        return "all", projects
    if project_id in (None, "", "global"):
        if require_project_from_global:
            raise workspace.WorkspaceError(400, "全局助手操作项目功能时，必须显式指定 projectId（或 'all'）。")
        return "global", projects
    if project_id not in projects:
        raise workspace.WorkspaceError(404, "未找到目标科研项目。")
    return project_id, projects


def _clean_hint(value):
    if value is None:
        return ""
    if not isinstance(value, str):
        raise workspace.WorkspaceError(400, "功能说明必须是文本。")
    cleaned = " ".join(value.strip().split())
    if len(cleaned) > 200:
        raise workspace.WorkspaceError(400, "功能说明不能超过 200 个字符。")
    return cleaned


def _clean_id(value, err_msg="未知功能标识。"):
    if not isinstance(value, str) or not value.strip():
        raise workspace.WorkspaceError(400, err_msg)
    return value.strip()


def _clean_symbol(symbol, *, allow_empty=False):
    if not isinstance(symbol, str) or (symbol == "" and not allow_empty) or (symbol != "" and symbol not in BOT_SYMBOLS):
        raise workspace.WorkspaceError(400, "请选择支持的符号头像。")
    return symbol


def _clean_keywords(keywords):
    words = [] if keywords is None else keywords
    if not isinstance(words, list) or len(words) > 24 or not all(isinstance(w, str) and len(w.strip()) <= 60 for w in words):
        raise workspace.WorkspaceError(400, "关键词最多 24 个，每个最多 60 个字符。")
    return list(dict.fromkeys(w.strip() for w in words if w.strip()))


def list_features(caller_scope, project_id=None):
    """Return ordered, non-deleted Feature Bots visible in the requested scope."""
    target, projects = _resolve_target(caller_scope, project_id, require_project_from_global=False, allow_all=False)
    if target == "global":
        labels = naming.NamingStore().feature_labels("global")
        return [{
            "id": "chat",
            "label": labels["chat"],
            "builtin": True,
            "deletable": False,
            "hint": "独立全局助手空间",
            "emptyText": "",
            "categories": [],
            "botSessionId": None,
        }]

    with closing(workspace.database()) as db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        label_rows = db.execute(
            "SELECT scope, feature_id, label FROM labweave_feature_labels WHERE scope IN ('global', ?)",
            (target,),
        ).fetchall()
        feat_rows = db.execute(
            "SELECT f.scope, f.feature_id, label, hint, deleted, sort_order, updated_ts, p.symbol, p.keywords "
            "FROM labweave_features f LEFT JOIN labweave_feature_profiles p USING(scope,feature_id) "
            "WHERE f.scope IN ('all', ?) "
            "ORDER BY CASE WHEN f.scope = 'all' THEN 0 ELSE 1 END, sort_order ASC, updated_ts ASC",
            (target,),
        ).fetchall()
        bot_rows = db.execute(
            "SELECT feature_id, session_id FROM labweave_feature_bots WHERE project_id = ?",
            (target,),
        ).fetchall()

    global_labels = {fid: lbl for sc, fid, lbl in label_rows if sc == "global"}
    proj_labels = {fid: lbl for sc, fid, lbl in label_rows if sc == target}
    bot_map = {fid: sid for fid, sid in bot_rows}

    builtin_overrides = {}
    deleted_all = set()
    deleted_proj = set()
    custom_entries = {}
    for scope, fid, lbl, hint, deleted, sort_order, updated_ts, symbol, keywords in feat_rows:
        if deleted:
            (deleted_all if scope == "all" else deleted_proj).add(fid)
            continue
        parsed_kw = json.loads(keywords) if keywords else []
        if fid in BUILTIN_ORDER:
            prev = builtin_overrides.get(fid)
            if prev is None or scope == target:
                builtin_overrides[fid] = {
                    "hint": hint or "",
                    "symbol": symbol or "",
                    "keywords": parsed_kw,
                }
            continue
        prev = custom_entries.get(fid)
        if prev is None or scope == target:
            custom_entries[fid] = {
                "id": fid,
                "label": lbl,
                "raw_hint": hint or "",
                "shared": prev["shared"] if prev else (scope == "all"),
                "symbol": symbol or "",
                "keywords": parsed_kw,
                "sort_order": prev["sort_order"] if prev else sort_order,
                "updated_ts": updated_ts,
            }

    result = []
    for fid in BUILTIN_ORDER:
        if fid not in PROTECTED_FEATURES and (fid in deleted_proj or fid in deleted_all):
            continue
        meta = FEATURE_META[fid]
        label = proj_labels.get(fid) or global_labels.get(fid) or naming.DEFAULT_FEATURE_LABELS[fid]
        override = builtin_overrides.get(fid) or {}
        result.append({
            "id": fid,
            "label": label,
            "builtin": True,
            "deletable": fid not in PROTECTED_FEATURES,
            "hint": override.get("hint") or meta["hint"],
            "symbol": override.get("symbol", ""),
            "keywords": override.get("keywords", []),
            "emptyText": meta["emptyText"],
            "categories": meta["categories"],
            "botSessionId": None if fid == "chat" else bot_map.get(fid),
        })

    for item in sorted(custom_entries.values(), key=lambda x: (x["sort_order"], x["updated_ts"], x["id"])):
        fid = item["id"]
        if fid in deleted_proj or (item["shared"] and fid in deleted_all):
            continue
        label = proj_labels.get(fid) or item["label"]
        result.append({
            "id": fid,
            "label": label,
            "builtin": False,
            "deletable": True,
            "shared": item["shared"],
            "hint": item["raw_hint"] or f"围绕「{label}」沉淀推送消息与文件资源",
            "symbol": item["symbol"],
            "keywords": item["keywords"],
            "emptyText": f"还没有收到来自「{label}」的推送内容",
            "categories": [["push", "推送消息"], ["file", "文件资源"]],
            "botSessionId": bot_map.get(fid),
        })
    return result


def feature_labels_map(project_id):
    """Return {featureId: displayLabel} for all active features of project_id."""
    return {item["id"]: item["label"] for item in list_features("global", project_id)}


def bot_sessions(project_id):
    """Return active {featureId: sessionId} bindings for a project."""
    return {
        item["id"]: item["botSessionId"]
        for item in list_features("global", project_id)
        if item["id"] != "chat" and item.get("botSessionId")
    }


def bot_session_ids(project_id):
    """Return list of DSH session IDs reserved for project Feature Bots."""
    return list(bot_sessions(project_id).values())


def is_valid_rail(project_id, rail):
    """Return True if rail matches an active project feature (non-chat) or a built-in data rail."""
    if not isinstance(rail, str) or not rail:
        return False
    if rail in workspace.RAILS:
        return True
    return any(item["id"] == rail and item["id"] != "chat" for item in list_features("global", project_id))


def create_feature(caller_scope, label, hint="", project_id=None, *, symbol="✦", keywords=None, request_id=None):
    """Add a new custom Feature Bot to an explicit project or across all projects."""
    cleaned_label = naming.display_name(label)
    cleaned_hint = _clean_hint(hint)
    target, _ = _resolve_target(caller_scope, project_id, require_project_from_global=True, allow_all=True)
    symbol = _clean_symbol(symbol)
    words = _clean_keywords(keywords)
    if request_id is not None and (not isinstance(request_id,str) or not re.fullmatch(r"[0-9a-f]{32}",request_id)):
        raise workspace.WorkspaceError(400, "创建请求标识无效。")
    fid = "feat_" + (hashlib.sha256((target+"/"+request_id).encode()).hexdigest()[:20] if request_id else secrets.token_hex(8))
    now = int(time.time())

    with closing(workspace.database()) as db, db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT COALESCE(MAX(sort_order), 100) FROM labweave_features").fetchone()
        next_order = int(row[0] or 100) + 10
        db.execute(
            "INSERT OR IGNORE INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
            "VALUES (?, ?, ?, ?, 0, ?, ?)",
            (target, fid, cleaned_label, cleaned_hint, next_order, now),
        )
        encoded = json.dumps(words,ensure_ascii=False)
        db.execute("INSERT OR IGNORE INTO labweave_feature_profiles VALUES(?,?,?,?)",(target,fid,symbol,encoded))
        saved = db.execute("SELECT label,hint,deleted,symbol,keywords FROM labweave_features "
                           "JOIN labweave_feature_profiles USING(scope,feature_id) WHERE scope=? AND feature_id=?",(target,fid)).fetchone()
        if saved != (cleaned_label,cleaned_hint,0,symbol,encoded):
            raise workspace.WorkspaceError(409,"创建请求已被使用，请重新打开创建窗口。")

    effective_hint = cleaned_hint or f"围绕「{cleaned_label}」沉淀推送消息与文件资源"
    return {
        "scope": target,
        "feature": {
            "id": fid,
            "label": cleaned_label,
            "builtin": False,
            "deletable": True,
            "shared": target == "all",
            "hint": effective_hint,
            "symbol": symbol,
            "keywords": words,
            "emptyText": f"还没有收到来自「{cleaned_label}」的推送内容",
            "categories": [["push", "推送消息"], ["file", "文件资源"]],
            "botSessionId": None,
        },
    }


def delete_feature(caller_scope, feature_id, project_id=None):
    """Remove a removable built-in or custom Feature Bot within allowed scope."""
    fid = _clean_id(feature_id)
    if fid in PROTECTED_FEATURES:
        raise workspace.WorkspaceError(400, "「聊天」为核心功能，不可删除。")
    target, _ = _resolve_target(caller_scope, project_id, require_project_from_global=True, allow_all=True)
    now = int(time.time())

    with closing(workspace.database()) as db, db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        if target == "all":
            is_known = fid in naming.DEFAULT_FEATURE_LABELS or db.execute(
                "SELECT 1 FROM labweave_features WHERE scope = 'all' AND feature_id = ? AND deleted = 0",
                (fid,),
            ).fetchone() is not None
            if not is_known:
                raise workspace.WorkspaceError(404, "未找到要删除的全局共享功能。")
            db.execute(
                "INSERT INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
                "VALUES ('all', ?, ?, '', 1, 999, ?) "
                "ON CONFLICT(scope, feature_id) DO UPDATE SET deleted = 1, updated_ts = excluded.updated_ts",
                (fid, naming.DEFAULT_FEATURE_LABELS.get(fid, fid), now),
            )
            db.execute("DELETE FROM labweave_feature_bots WHERE feature_id = ?", (fid,))
            db.execute("DELETE FROM labweave_bot_assignments WHERE feature=?", (fid,))
            db.execute("DELETE FROM labweave_bot_schedules WHERE feature=?", (fid,))
            return {"scope": "all", "deleted": fid}

        active = {item["id"]: item for item in list_features("global", target)}
        if fid not in active:
            raise workspace.WorkspaceError(404, "当前项目中不存在该功能。")
        existing_label = active[fid]["label"]
        db.execute(
            "INSERT INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
            "VALUES (?, ?, ?, '', 1, 999, ?) "
            "ON CONFLICT(scope, feature_id) DO UPDATE SET deleted = 1, updated_ts = excluded.updated_ts",
            (target, fid, existing_label, now),
        )
        db.execute("DELETE FROM labweave_feature_bots WHERE project_id = ? AND feature_id = ?", (target, fid))
        db.execute("DELETE FROM labweave_bot_assignments WHERE project=? AND feature=?", (target,fid))
        db.execute("DELETE FROM labweave_bot_schedules WHERE project=? AND feature=?", (target,fid))
    return {"scope": target, "deleted": fid}


def rename_feature(caller_scope, feature_id, label, project_id=None):
    """Rename either a built-in feature or a custom Feature Bot within caller_scope."""
    fid = _clean_id(feature_id)
    if fid in naming.DEFAULT_FEATURE_LABELS:
        return naming.NamingStore().rename_feature_from_conversation(caller_scope, fid, label, project_id=project_id)

    cleaned_label = naming.display_name(label)
    target, projects = _resolve_target(caller_scope, project_id, require_project_from_global=True, allow_all=True)
    now = int(time.time())
    iso_now = datetime.now(timezone.utc).isoformat()

    with closing(workspace.database()) as db, db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        if target == "all":
            row = db.execute(
                "SELECT label, deleted FROM labweave_features WHERE scope = 'all' AND feature_id = ?",
                (fid,),
            ).fetchone()
            if not row or row[1]:
                raise workspace.WorkspaceError(400, "未知功能标识。")
            prev = row[0]
            db.execute(
                "UPDATE labweave_features SET label = ?, updated_ts = ? WHERE scope = 'all' AND feature_id = ?",
                (cleaned_label, now, fid),
            )
            db.execute(
                "INSERT INTO labweave_feature_label_audit "
                "(at, caller_scope, target_scope, feature_id, previous_label, label) VALUES (?, ?, ?, ?, ?, ?)",
                (iso_now, caller_scope, "all", fid, prev, cleaned_label),
            )
            return {"scope": "all", "featureId": fid, "label": cleaned_label}

        active = {item["id"]: item for item in list_features("global", target)}
        if fid not in active:
            raise workspace.WorkspaceError(400, "未知功能标识。")
        prev = active[fid]["label"]
        db.execute(
            "INSERT INTO labweave_feature_labels (scope, feature_id, label) VALUES (?, ?, ?) "
            "ON CONFLICT(scope, feature_id) DO UPDATE SET label = excluded.label",
            (target, fid, cleaned_label),
        )
        db.execute(
            "INSERT INTO labweave_feature_label_audit "
            "(at, caller_scope, target_scope, feature_id, previous_label, label) VALUES (?, ?, ?, ?, ?, ?)",
            (iso_now, caller_scope, target, fid, prev, cleaned_label),
        )
    return {"scope": target, "featureId": fid, "label": cleaned_label}


def update_feature(caller_scope, feature_id, *, label=None, hint=None, symbol=None, keywords=None, project_id=None):
    """Update a Feature Bot's profile (label, hint, symbol, keywords) within allowed scope."""
    fid = _clean_id(feature_id)
    if fid in PROTECTED_FEATURES:
        raise workspace.WorkspaceError(400, "「聊天」不是功能 Bot，如需改名请使用重命名功能。")
    target, _ = _resolve_target(caller_scope, project_id, require_project_from_global=True, allow_all=True)

    active = {item["id"]: item for item in list_features("global", target)} if target != "all" else None
    if target == "all":
        if fid not in BUILTIN_ORDER:
            with closing(workspace.database()) as db:
                ensure_tables(db)
                exists = db.execute(
                    "SELECT 1 FROM labweave_features WHERE scope = 'all' AND feature_id = ? AND deleted = 0",
                    (fid,),
                ).fetchone()
            if not exists:
                raise workspace.WorkspaceError(400, "未知功能标识。")
    elif fid not in active:
        raise workspace.WorkspaceError(400, "未知功能标识。")

    cleaned_label = naming.display_name(label) if label is not None else None
    cleaned_hint = _clean_hint(hint) if hint is not None else None
    cleaned_symbol = _clean_symbol(symbol, allow_empty=(fid in BUILTIN_ORDER)) if symbol is not None else None
    cleaned_keywords = _clean_keywords(keywords) if keywords is not None else None

    if cleaned_label is not None:
        rename_target = None if target == "all" and fid in naming.DEFAULT_FEATURE_LABELS else project_id
        rename_feature(caller_scope, fid, cleaned_label, project_id=rename_target)

    now = int(time.time())
    with closing(workspace.database()) as db, db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        db.execute("BEGIN IMMEDIATE")
        existing = db.execute(
            "SELECT f.label, f.hint, f.sort_order, p.symbol, p.keywords "
            "FROM labweave_features f LEFT JOIN labweave_feature_profiles p USING(scope, feature_id) "
            "WHERE f.scope = ? AND f.feature_id = ?",
            (target, fid),
        ).fetchone()
        base = (active[fid] if active else None) or {}
        next_label = cleaned_label or (existing[0] if existing else None) or base.get("label") or naming.DEFAULT_FEATURE_LABELS.get(fid, fid)
        next_hint = cleaned_hint if cleaned_hint is not None else (existing[1] if existing else "")
        default_order = (BUILTIN_ORDER.index(fid) + 1) * 10 if fid in BUILTIN_ORDER else 200
        next_order = existing[2] if existing else default_order
        next_symbol = cleaned_symbol if cleaned_symbol is not None else (existing[3] if existing and existing[3] is not None else (base.get("symbol") or ("✦" if fid not in BUILTIN_ORDER else "")))
        next_keywords = json.dumps(cleaned_keywords, ensure_ascii=False) if cleaned_keywords is not None else (existing[4] if existing and existing[4] is not None else json.dumps(base.get("keywords", []), ensure_ascii=False))

        db.execute(
            "INSERT INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts) "
            "VALUES (?, ?, ?, ?, 0, ?, ?) "
            "ON CONFLICT(scope, feature_id) DO UPDATE SET label = excluded.label, hint = excluded.hint, deleted = 0, updated_ts = excluded.updated_ts",
            (target, fid, next_label, next_hint, next_order, now),
        )
        db.execute(
            "INSERT INTO labweave_feature_profiles (scope, feature_id, symbol, keywords) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(scope, feature_id) DO UPDATE SET symbol = excluded.symbol, keywords = excluded.keywords",
            (target, fid, next_symbol, next_keywords),
        )

    if target == "all":
        return {
            "scope": "all",
            "feature": {
                "id": fid,
                "label": next_label,
                "hint": next_hint,
                "symbol": next_symbol,
                "keywords": json.loads(next_keywords),
            },
        }
    updated_item = next(item for item in list_features("global", target) if item["id"] == fid)
    return {"scope": target, "feature": updated_item}


def assignment_map(project):
    with closing(workspace.database()) as db:
        ensure_tables(db)
        result = {}
        for fid,kind,title,instruction in db.execute(
                "SELECT feature,kind,title,instruction FROM labweave_bot_assignments WHERE project=? ORDER BY kind,title",(project,)):
            result.setdefault(fid,[]).append({"kind":kind,"title":title,"instruction":instruction})
        return result


def schedule_map(project):
    with closing(workspace.database()) as db:
        ensure_tables(db)
        result = {}
        for fid,schedule in db.execute(
                "SELECT feature,schedule FROM labweave_bot_schedules WHERE project=? ORDER BY schedule",(project,)):
            result.setdefault(fid,[]).append(schedule)
        return result


def schedule_links(project, fid, identity=None, remove=False):
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        if identity and remove:
            db.execute("DELETE FROM labweave_bot_schedules WHERE project=? AND feature=? AND schedule=?", (project,fid,identity))
        elif identity:
            db.execute("INSERT OR IGNORE INTO labweave_bot_schedules VALUES(?,?,?)", (project,fid,identity))
        return [r[0] for r in db.execute("SELECT schedule FROM labweave_bot_schedules WHERE project=? AND feature=?", (project,fid))]


def assignments(project, fid, change=None):
    if fid == "chat" or not any(f["id"] == fid for f in list_features(project, project)):
        raise workspace.WorkspaceError(404, "当前项目没有这个功能 Bot。")
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        if change is not None:
            kind = change.get("kind")
            if kind not in ("duty", "storage"):
                raise workspace.WorkspaceError(400, "请选择职责或存储要求。")
            title = naming.display_name(change.get("title"))
            key = (project, fid, kind, title)
            if change.get("remove"):
                db.execute("DELETE FROM labweave_bot_assignments WHERE project=? AND feature=? AND kind=? AND title=?", key)
            else:
                instruction = workspace.text(change.get("instruction"), 3000)
                if not instruction:
                    raise workspace.WorkspaceError(400, "请说明要分配的任务。")
                previous = change.get("originalTitle")
                if previous is not None:
                    previous = naming.display_name(previous)
                    if previous != title:
                        db.execute("DELETE FROM labweave_bot_assignments WHERE project=? AND feature=? AND kind=? AND title=?",
                                   (project, fid, kind, previous))
                db.execute("INSERT OR REPLACE INTO labweave_bot_assignments VALUES(?,?,?,?,?)", (*key, instruction))
        return [dict(zip(("kind", "title", "instruction"), r)) for r in db.execute(
            "SELECT kind,title,instruction FROM labweave_bot_assignments WHERE project=? AND feature=? ORDER BY kind,title", (project,fid))]


def bind_bot_session(project_id, feature_id, session_id):
    """Persist the dedicated DSH session ID backing a project's Feature Bot."""
    fid = _clean_id(feature_id)
    if fid in PROTECTED_FEATURES:
        raise workspace.WorkspaceError(400, "聊天功能不使用后台 Bot 会话绑定。")
    if not isinstance(session_id, str) or not session_id.strip() or len(session_id.strip()) > 128:
        raise workspace.WorkspaceError(400, "Bot 会话 ID 无效。")
    sid = session_id.strip()
    projects = _projects_index()
    if project_id not in projects:
        raise workspace.WorkspaceError(404, "未找到科研项目。")
    if not any(item["id"] == fid for item in list_features("global", project_id)):
        raise workspace.WorkspaceError(404, "当前项目中不存在该功能。")
    now = int(time.time())
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        db.execute(
            "INSERT INTO labweave_feature_bots (project_id, feature_id, session_id, updated_ts) "
            "VALUES (?, ?, ?, ?) "
            "ON CONFLICT(project_id, feature_id) DO UPDATE SET session_id = excluded.session_id, updated_ts = excluded.updated_ts",
            (project_id, fid, sid, now),
        )
    return {"featureId": fid, "sessionId": sid}


def bot_context_for_session(scope, session_id):
    """Return {featureId, label, hint} if session_id is a bound Feature Bot inside scope."""
    if not scope or scope == "global" or not isinstance(session_id, str) or not session_id:
        return None
    for item in list_features("global", scope):
        if item["id"] != "chat" and item.get("botSessionId") == session_id:
            return {"featureId": item["id"], "label": item["label"], "hint": item.get("hint", "")}
    return None


def clear_project(project_id):
    """Remove project-scoped dynamic feature records when a project is deleted."""
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        db.execute("DELETE FROM labweave_features WHERE scope = ?", (project_id,))
        db.execute("DELETE FROM labweave_bot_assignments WHERE project=?", (project_id,))
        db.execute("DELETE FROM labweave_bot_schedules WHERE project=?", (project_id,))
        db.execute("DELETE FROM labweave_feature_profiles WHERE scope = ?", (project_id,))
        db.execute("DELETE FROM labweave_feature_bots WHERE project_id = ?", (project_id,))
