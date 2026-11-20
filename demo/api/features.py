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
BOT_LAYOUTS = {
    "goals": ("checklist", "path", "calendar"),
    "notes": ("library", "timeline", "notebook"),
    "mindmap": ("graph", "lineage", "research-map"),
    "ideas": ("branches", "reasoning", "idea-cards"),
    "engineering": ("sequence", "matrix", "code-map"),
}
FIELD_TYPES = ("text", "number", "date", "boolean", "url", "reference")
FIELD_ROLES = {
    "title": ("text",), "summary": ("text",), "group": ("text",), "date": ("date",),
    "status": ("text", "boolean"), "source": ("url",), "relation": ("reference",),
    "detail": ("text", "number", "date", "boolean", "url"),
}
BOT_RECORD_TEXT_FIELDS = {
    "priority": ("优先级", 80), "completionCriteria": ("完成条件", 1000),
    "relationLabel": ("关系类型", 80), "relationStatus": ("关系核查状态", 80),
    "hypothesis": ("假设", 1000), "validation": ("最小验证", 1000), "result": ("结果", 1000),
    "routeQuestion": ("研究问题", 800), "routeMethods": ("代表方法", 800),
    "routeOpenQuestions": ("待探索问题", 800), "paperAuthors": ("作者", 400), "paperVenue": ("发表来源", 200),
    "ideaEvidence": ("已有依据", 1400), "ideaTradeoffs": ("可行性与限制", 1000),
}
BUILTIN_PARADIGMS = {"goals": ("goals", "checklist"), "library": ("notes", "library"),
                     "feed": ("notes", "timeline"), "ideas": ("ideas", "branches")}
CUSTOM_FEATURE_ID_RE = re.compile(r"^feat_[a-f0-9]{8,24}$")
_AVATAR_CATALOG = Path(__file__).resolve().parents[2] / "plugins/dsh-labweave-workspace/client/assets/bot-avatars.json"
_AVATAR_GROUPS = json.loads(_AVATAR_CATALOG.read_text(encoding="utf-8"))
BOT_SYMBOLS = tuple(item["id"] for group in _AVATAR_GROUPS for item in group["items"])
_LUCIDE_ITEMS = tuple(
    (item["id"], item["label"].lower())
    for group in _AVATAR_GROUPS
    for item in group["items"]
    if item["id"].startswith("lucide:")
)

_PARADIGM_AVATAR_RULES = (
    (re.compile(r"缺陷|bug|故障|报错|异常|排查|调试|defect|debug|issue|error|fix"), "lucide:bug"),
    (re.compile(r"文献|论文|综述|阅读|paper|arxiv|literature|reading|survey|journal"), "lucide:book-open"),
    (re.compile(r"引用|参考文献|引文|出处|citation|reference|quote|\bbib\b"), "lucide:quote"),
    (re.compile(r"核查|审核|审查|证据|合规|验证|audit|verify|review|evidence|fact"), "lucide:shield-check"),
    (re.compile(r"数据集|数据库|语料|样本库|dataset|database|corpus|\bsql\b"), "lucide:database"),
    (re.compile(r"表格|对比表|对照|基准|评测|评估|benchmark|table|matrix|comparison|eval"), "lucide:table"),
    (re.compile(r"折线|趋势|曲线|监控|指标|metric|trend|curve|loss|accuracy"), "lucide:chart-line"),
    (re.compile(r"统计|分布|柱状|直方|stat|histogram|\bbar\b"), "lucide:chart-bar"),
    (re.compile(r"散点|回归|聚类|相关|scatter|cluster|correlation"), "lucide:chart-scatter"),
    (re.compile(r"知识图谱|引证网|关系图|拓扑|网络|graph|network|ontology"), "lucide:chart-network"),
    (re.compile(r"脉络|路线|演进|演化|谱系|lineage|roadmap|route"), "lucide:route"),
    (re.compile(r"流程|工作流|流水线|管线|步骤|workflow|pipeline|process"), "lucide:workflow"),
    (re.compile(r"实验|试跑|消融|化学|烧瓶|试剂|experiment|chemistry|flask|trial|ablation"), "lucide:flask-conical"),
    (re.compile(r"生物|细胞|显微|病理|组织|microscope|biology|cell"), "lucide:microscope"),
    (re.compile(r"基因|蛋白|序列|基因组|\bdna\b|\brna\b|gene|genome|protein"), "lucide:dna"),
    (re.compile(r"物理|量子|原子|粒子|physics|quantum|atom|particle"), "lucide:atom"),
    (re.compile(r"天文|望远镜|轨道|宇宙|astro|telescope|orbit|space"), "lucide:telescope"),
    (re.compile(r"数学|公式|定理|证明|推导|math|formula|theorem|proof|equation|sigma"), "lucide:sigma"),
    (re.compile(r"代码|编程|脚本|实现|coding|code|script|program|\bapi\b"), "lucide:code"),
    (re.compile(r"仓库|开源|github|repo|repository"), "lucide:github"),
    (re.compile(r"分支|版本|发布|\bgit\b|branch|version|release"), "lucide:git-branch"),
    (re.compile(r"终端|命令|部署|运维|terminal|\bcli\b|shell|deploy"), "lucide:terminal"),
    (re.compile(r"算力|硬件|芯片|\bgpu\b|\bcuda\b|\bcpu\b|hardware|chip"), "lucide:cpu"),
    (re.compile(r"服务器|集群|节点|server|infra|cloud"), "lucide:server"),
    (re.compile(r"检索|搜索|查重|专利|search|query|retrieval|patent"), "lucide:file-search"),
    (re.compile(r"动态|资讯|新闻|快讯|周报|日报|news|digest|feed|weekly|report"), "lucide:newspaper"),
    (re.compile(r"日程|排期|会议|截止|\bddl\b|calendar|schedule|meeting|deadline"), "lucide:calendar"),
    (re.compile(r"时间线|编年|历史|日志|timeline|history|changelog|\blog\b"), "lucide:history"),
    (re.compile(r"清单|待办|检查表|任务|checklist|todo|task"), "lucide:list-checks"),
    (re.compile(r"里程碑|阶段|目标|milestone|goal|\bokr\b|\bkpi\b"), "lucide:milestone"),
    (re.compile(r"假设|认知|推理|推演|思考|brain|hypothesis|reasoning|cognition"), "lucide:brain"),
    (re.compile(r"灵感|点子|创意|脑暴|idea|spark|brainstorm|insight"), "lucide:lightbulb"),
    (re.compile(r"笔记|备忘|摘录|notebook|note|memo|diary"), "lucide:notebook"),
    (re.compile(r"书签|收藏|资料|bookmark|collection|archive"), "lucide:book-marked"),
    (re.compile(r"文档|写作|草稿|投稿|稿件|draft|writing|manuscript|submission|\bdoc\b"), "lucide:file-text"),
    (re.compile(r"链接|网站|网址|\burl\b|link|web"), "lucide:link"),
    (re.compile(r"模块|组件|架构|系统|architecture|module|component"), "lucide:blocks"),
    (re.compile(r"插件|工具|扩展|plugin|tool|extension"), "lucide:puzzle"),
    (re.compile(r"绘图|可视化|插图|视觉|figure|plot|visual|draw|design"), "lucide:paintbrush"),
)

_PARADIGM_BASE_POOLS = {
    "goals": ("lucide:milestone", "lucide:list-checks", "lucide:target", "lucide:compass", "lucide:circle-check"),
    "notes": ("lucide:book-marked", "lucide:notebook", "lucide:file-text", "lucide:newspaper", "lucide:archive"),
    "mindmap": ("lucide:chart-network", "lucide:route", "lucide:network", "lucide:workflow", "lucide:git-branch"),
    "ideas": ("lucide:brain", "lucide:sparkles", "lucide:lightbulb", "lucide:focus", "lucide:compass"),
    "engineering": ("lucide:flask-conical", "lucide:workflow", "lucide:table", "lucide:chart-line", "lucide:cpu"),
}


def infer_paradigm_symbol(label, description="", base="notes", layout="", fields=None, used_symbols=(), extra_hint=""):
    """Deterministically pick a matching Lucide icon from bot-avatars.json for a custom paradigm."""
    field_names = " ".join(
        (f["name"] if isinstance(f, dict) else str(f)) for f in (fields or ())
    )
    corpus = f"{label or ''} {description or ''} {field_names} {extra_hint or ''}".lower()
    for pattern, icon_id in _PARADIGM_AVATAR_RULES:
        if icon_id in BOT_SYMBOLS and pattern.search(corpus):
            return icon_id
    for icon_id, item_label in _LUCIDE_ITEMS:
        tokens = [tok for tok in re.split(r"[\s/_-]+", item_label) if len(tok) >= 2]
        if any(tok in corpus for tok in tokens):
            return icon_id
    pool = _PARADIGM_BASE_POOLS.get(base, _PARADIGM_BASE_POOLS["notes"])
    used = set(used_symbols or ())
    digest = int(hashlib.sha256(f"{label}|{base}|{layout}".encode("utf-8")).hexdigest()[:8], 16)
    available = [icon_id for icon_id in pool if icon_id not in used] or list(pool)
    return available[digest % len(available)]


def normalize_paradigm_symbol(symbol, *, lenient=False):
    """Validate/normalize an explicit paradigm symbol; returns '' if empty or (when lenient) unrecognized."""
    if symbol is None:
        return ""
    if not isinstance(symbol, str):
        if lenient:
            return ""
        raise workspace.WorkspaceError(400, "请选择支持的范式头像。")
    cleaned = symbol.strip()
    if not cleaned:
        return ""
    if cleaned in BOT_SYMBOLS:
        return cleaned
    prefixed = "lucide:" + cleaned.lower()
    if prefixed in BOT_SYMBOLS:
        return prefixed
    if lenient:
        return ""
    raise workspace.WorkspaceError(400, "请选择支持的范式头像。")

FEATURE_META = {
    "chat": {
        "hint": "项目主对话空间",
        "emptyText": "",
    },
    "feed": {
        "hint": "订阅并追踪前沿动态",
        "emptyText": "还没有收到任何动态推送",
    },
    "ideas": {
        "hint": "把灵感转化为目标",
        "emptyText": "还没有收集任何点子",
    },
    "goals": {
        "hint": "追踪里程碑和实验",
        "emptyText": "还没有设定任何目标",
    },
    "library": {
        "hint": "文献、仓库和产物",
        "emptyText": "还没有收录任何资源",
    },
}


def ensure_tables(db):
    db.execute("CREATE TABLE IF NOT EXISTS labweave_meta(key TEXT PRIMARY KEY, value TEXT NOT NULL)")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_lifecycle(
        project TEXT NOT NULL, feature TEXT NOT NULL, temporary INTEGER NOT NULL DEFAULT 0,
        archived INTEGER NOT NULL DEFAULT 0, cluster_parent TEXT, PRIMARY KEY(project,feature))""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_project_paradigms(
        project TEXT, id TEXT, label TEXT NOT NULL, base TEXT NOT NULL, layout TEXT NOT NULL,
        elements TEXT NOT NULL, description TEXT NOT NULL, symbol TEXT NOT NULL DEFAULT '',
        PRIMARY KEY(project,id), UNIQUE(project,label))""")
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
    feature_columns = {column[1] for column in db.execute("PRAGMA table_info(labweave_features)")}
    for column in ("paradigm", "layout"):
        if column not in feature_columns:
            db.execute(f"ALTER TABLE labweave_features ADD COLUMN {column} TEXT")
    paradigm_columns = {column[1] for column in db.execute("PRAGMA table_info(labweave_project_paradigms)")}
    if "symbol" not in paradigm_columns:
        db.execute("ALTER TABLE labweave_project_paradigms ADD COLUMN symbol TEXT NOT NULL DEFAULT ''")
    if not db.execute("SELECT 1 FROM labweave_meta WHERE key = 'paradigm_avatar_default_v1'").fetchone():
        was_in_tx = db.in_transaction
        db.execute("UPDATE labweave_feature_profiles SET symbol = '' WHERE symbol = '✦'")
        db.execute("INSERT OR REPLACE INTO labweave_meta(key, value) VALUES('paradigm_avatar_default_v1', '1')")
        if not was_in_tx:
            db.commit()


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
        raise workspace.WorkspaceError(404, "未找到目标项目。")
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


def _project_paradigms(db, project):
    definitions = {}
    used = []
    for identity, label, base, layout, elements, description, symbol in db.execute(
        "SELECT id,label,base,layout,elements,description,COALESCE(symbol,'') FROM labweave_project_paradigms WHERE project=? ORDER BY rowid", (project,)
    ):
        raw = json.loads(elements)
        fields = [{"name": name, "type": "text", "role": "detail"} for name in raw] if isinstance(raw, list) else raw["fields"]
        resolved_symbol = symbol if symbol in BOT_SYMBOLS else infer_paradigm_symbol(
            label, description, base, layout, fields, used_symbols=used,
        )
        used.append(resolved_symbol)
        definitions[identity] = {"id": identity, "label": label, "base": base, "layout": layout,
                                 "elements": [field["name"] for field in fields], "fields": fields,
                                 "description": description, "symbol": resolved_symbol}
    return definitions


def _paradigm_fields(args):
    raw = args.get("fields")
    if "fields" not in args:
        legacy = args.get("elements")
        if not isinstance(legacy, list) or not 1 <= len(legacy) <= 12 or not all(isinstance(name, str) for name in legacy):
            raise workspace.WorkspaceError(400, "请定义 1 至 12 个字段。")
        raw = [{"name": name, "type": "text", "role": "detail"} for name in dict.fromkeys(name.strip() for name in legacy)]
    if not isinstance(raw, list) or not 1 <= len(raw) <= 12:
        raise workspace.WorkspaceError(400, "请定义 1 至 12 个字段。")
    fields, names, roles = [], set(), set()
    for field in raw:
        if not isinstance(field, dict):
            raise workspace.WorkspaceError(400, "字段需要名称、类型和展示用途。")
        name, kind, role = field.get("name"), field.get("type"), field.get("role")
        if not isinstance(name, str) or not 1 <= len(name.strip()) <= 40:
            raise workspace.WorkspaceError(400, "字段名须为 1 至 40 个字符。")
        name = name.strip()
        if not isinstance(role, str) or kind not in FIELD_ROLES.get(role, ()):
            raise workspace.WorkspaceError(400, f"「{name}」的字段类型与展示用途不匹配。")
        if name in names or (role != "detail" and role in roles):
            raise workspace.WorkspaceError(400, "字段名须唯一，每个主展示位置只能指定一个字段。")
        names.add(name)
        roles.add(role)
        fields.append({"name": name, "type": kind, "role": role})
    return fields


def project_paradigms(project):
    with closing(workspace.database()) as db:
        ensure_tables(db)
        return list(_project_paradigms(db, project).values())


def create_project_paradigm(project, args, *, lenient_symbol=False):
    _resolve_target(project, project, require_project_from_global=True, allow_all=False)
    label = naming.display_name(args.get("label"))
    description = workspace.text(args.get("description"), 2000)
    if not description:
        raise workspace.WorkspaceError(400, "请描述这个范式展示什么，以及如何组织这些内容。")
    base, layout = args.get("base"), args.get("layout")
    if not isinstance(base, str) or layout not in BOT_LAYOUTS.get(base, ()):
        raise workspace.WorkspaceError(400, "请选择支持的展示排布。")
    fields = _paradigm_fields(args)
    raw_symbol = args.get("symbol")
    explicit_symbol = normalize_paradigm_symbol(raw_symbol, lenient=lenient_symbol)
    extra_hint = raw_symbol if (lenient_symbol and isinstance(raw_symbol, str) and not explicit_symbol) else ""
    identity = "ext_" + secrets.token_hex(12)
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        existing_map = _project_paradigms(db, project)
        used = [item["symbol"] for item in existing_map.values() if item["label"] != label]
        symbol = explicit_symbol or infer_paradigm_symbol(
            label, description, base, layout, fields, used_symbols=used, extra_hint=extra_hint,
        )
        db.execute(
            "INSERT OR IGNORE INTO labweave_project_paradigms(project,id,label,base,layout,elements,description,symbol) VALUES(?,?,?,?,?,?,?,?)",
            (project, identity, label, base, layout, json.dumps({"fields": fields}, ensure_ascii=False), description, symbol),
        )
        definition = next(item for item in _project_paradigms(db, project).values() if item["label"] == label)
        same_spec = (definition["base"], definition["layout"], definition["fields"], definition["description"]) == (base, layout, fields, description)
        same_symbol = (not explicit_symbol) or definition["symbol"] == explicit_symbol
        if not (same_spec and same_symbol):
            raise workspace.WorkspaceError(409, "当前项目已有同名扩展范式。")
    return definition


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
            "botSessionId": None,
        }]

    with closing(workspace.database()) as db:
        naming.NamingStore._schema(db)
        ensure_tables(db)
        extensions = _project_paradigms(db, target)
        label_rows = db.execute(
            "SELECT scope, feature_id, label FROM labweave_feature_labels WHERE scope IN ('global', ?)",
            (target,),
        ).fetchall()
        feat_rows = db.execute(
            "SELECT f.scope, f.feature_id, label, hint, deleted, sort_order, updated_ts, p.symbol, p.keywords, f.paradigm, f.layout "
            "FROM labweave_features f LEFT JOIN labweave_feature_profiles p USING(scope,feature_id) "
            "WHERE f.scope IN ('all', ?) "
            "ORDER BY CASE WHEN f.scope = 'all' THEN 0 ELSE 1 END, sort_order ASC, updated_ts ASC",
            (target,),
        ).fetchall()
        bot_rows = db.execute(
            "SELECT feature_id, session_id FROM labweave_feature_bots WHERE project_id = ?",
            (target,),
        ).fetchall()
        lifecycle = {fid: (bool(temporary), bool(archived), parent) for fid, temporary, archived, parent in db.execute(
            "SELECT feature,temporary,archived,cluster_parent FROM labweave_bot_lifecycle WHERE project=?", (target,))}

    global_labels = {fid: lbl for sc, fid, lbl in label_rows if sc == "global"}
    proj_labels = {fid: lbl for sc, fid, lbl in label_rows if sc == target}
    bot_map = {fid: sid for fid, sid in bot_rows}

    builtin_overrides = {}
    deleted_all = set()
    deleted_proj = set()
    custom_entries = {}
    for scope, fid, lbl, hint, deleted, sort_order, updated_ts, symbol, keywords, paradigm, layout in feat_rows:
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
            saved_paradigm = paradigm or (prev or {}).get("paradigm") or "notes"
            extension = extensions.get(saved_paradigm)
            base = extension["base"] if extension else saved_paradigm
            custom_entries[fid] = {
                "id": fid,
                "label": lbl,
                "raw_hint": hint or "",
                "shared": prev["shared"] if prev else (scope == "all"),
                "symbol": symbol or "",
                "keywords": parsed_kw,
                "paradigm": saved_paradigm,
                "layout": layout or (prev or {}).get("layout") or BOT_LAYOUTS[base][0],
                "extension": extension,
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
        paradigm, layout = BUILTIN_PARADIGMS.get(fid, (None, None))
        result.append({
            "id": fid,
            "label": label,
            "builtin": True,
            "deletable": fid not in PROTECTED_FEATURES,
            "hint": override.get("hint") or meta["hint"],
            "symbol": override.get("symbol", ""),
            "keywords": override.get("keywords", []),
            "paradigm": paradigm,
            "layout": layout,
            "emptyText": meta["emptyText"],
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
            "paradigm": item["paradigm"],
            "extension": item["extension"],
            "layout": item["layout"],
            "emptyText": f"还没有收到来自「{label}」的推送内容",
            "botSessionId": bot_map.get(fid),
        })
    visible = {item["id"] for item in result}
    for item in result:
        temporary, archived, parent = lifecycle.get(item["id"], (False, False, None))
        item.update(temporary=temporary, archived=archived, clusterParent=parent if parent in visible else None)
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


def create_feature(caller_scope, label, hint="", project_id=None, *, symbol=None, keywords=None, request_id=None,
                   paradigm="notes", layout=None, temporary=False):
    """Add a new custom Feature Bot to an explicit project or across all projects."""
    cleaned_label = naming.display_name(label)
    cleaned_hint = _clean_hint(hint)
    if type(temporary) is not bool or (temporary and caller_scope == "global"):
        raise workspace.WorkspaceError(400, "临时 Bot 只能由具体项目创建。")
    target, _ = _resolve_target(caller_scope, project_id, require_project_from_global=True, allow_all=True)
    if not isinstance(paradigm, str):
        raise workspace.WorkspaceError(400, "请选择目标、笔记、思维导图、点子或工程台范式。")
    extension = next((item for item in project_paradigms(target) if item["id"] == paradigm), None) if paradigm.startswith("ext_") and target != "all" else None
    layouts = (extension["layout"],) if extension else BOT_LAYOUTS.get(paradigm, ())
    if not layouts:
        raise workspace.WorkspaceError(400, "当前项目没有这个范式。")
    if layout is None:
        defaults = {"goals": "calendar", "notes": "notebook", "mindmap": "research-map",
                    "ideas": "idea-cards", "engineering": "code-map"}
        layout = defaults.get(paradigm, layouts[0])
    if layout not in layouts:
        raise workspace.WorkspaceError(400, "当前范式不支持这个排布。")
    symbol = "" if symbol is None else _clean_symbol(symbol, allow_empty=True)
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
            "INSERT OR IGNORE INTO labweave_features (scope, feature_id, label, hint, deleted, sort_order, updated_ts, paradigm, layout) "
            "VALUES (?, ?, ?, ?, 0, ?, ?, ?, ?)",
            (target, fid, cleaned_label, cleaned_hint, next_order, now, paradigm, layout),
        )
        encoded = json.dumps(words,ensure_ascii=False)
        db.execute("INSERT OR IGNORE INTO labweave_feature_profiles VALUES(?,?,?,?)",(target,fid,symbol,encoded))
        saved = db.execute("SELECT label,hint,deleted,symbol,keywords,COALESCE(paradigm,'notes'),COALESCE(layout,'library') FROM labweave_features "
                           "JOIN labweave_feature_profiles USING(scope,feature_id) WHERE scope=? AND feature_id=?",(target,fid)).fetchone()
        if saved != (cleaned_label,cleaned_hint,0,symbol,encoded,paradigm,layout):
            raise workspace.WorkspaceError(409,"创建请求已被使用，请重新打开创建窗口。")
        if temporary:
            db.execute("INSERT OR IGNORE INTO labweave_bot_lifecycle(project,feature,temporary) VALUES(?,?,1)", (target, fid))

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
            "paradigm": paradigm,
            "extension": extension,
            "layout": layout,
            "emptyText": f"还没有收到来自「{cleaned_label}」的推送内容",
            "categories": [["push", "推送消息"], ["file", "文件资源"]],
            "temporary": temporary,
            "botSessionId": None,
        },
    }


def cluster_bots(project, target_id, member_ids):
    if not isinstance(member_ids, list) or not member_ids or not all(isinstance(value, str) for value in member_ids):
        raise workspace.WorkspaceError(400, "请选择要聚类的成员 Bot。")
    target_id = _clean_id(target_id)
    members = set(member_ids)
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        db.execute("BEGIN IMMEDIATE")
        bots = {item["id"]: item for item in list_features(project, project) if item.get("paradigm")}
        target = bots.get(target_id)
        if not target or target["archived"] or target["clusterParent"] or target["temporary"] or target_id in members:
            raise workspace.WorkspaceError(400, "请选择本项目中独立且长期使用的聚类 Bot。")
        parents = {bot["clusterParent"] for bot in bots.values() if bot["clusterParent"]}
        for identity in members:
            member = bots.get(identity)
            if (not member or member["paradigm"] != target["paradigm"] or member["archived"]
                    or identity in parents or member["clusterParent"] not in (None, target_id)):
                raise workspace.WorkspaceError(400, "聚类成员须属于本项目的同一范式，且没有归入其他聚类。")
        db.executemany(
            "INSERT INTO labweave_bot_lifecycle(project,feature,cluster_parent) VALUES(?,?,?) "
            "ON CONFLICT(project,feature) DO UPDATE SET cluster_parent=excluded.cluster_parent",
            ((project, identity, target_id) for identity in sorted(members)),
        )
    return {"targetId": target_id, "members": sorted(members)}


def set_bot_archived(project, feature_id, *, archived):
    fid = _clean_id(feature_id)
    with closing(workspace.database()) as db, db:
        ensure_tables(db)
        db.execute("BEGIN IMMEDIATE")
        state = db.execute("SELECT temporary,cluster_parent FROM labweave_bot_lifecycle WHERE project=? AND feature=?",
                           (project, fid)).fetchone()
        if not state or not state[0]:
            return {"archived": False}
        if archived:
            has_duties = db.execute("SELECT 1 FROM labweave_bot_assignments WHERE project=? AND feature=?", (project, fid)).fetchone()
            has_schedules = db.execute("SELECT 1 FROM labweave_bot_schedules WHERE project=? AND feature=?", (project, fid)).fetchone()
            has_chat = db.execute("SELECT 1 FROM labweave_feature_bots WHERE project_id=? AND feature_id=?", (project, fid)).fetchone()
            if state[1] or has_duties or has_schedules or has_chat:
                return {"archived": False}
        db.execute("UPDATE labweave_bot_lifecycle SET archived=? WHERE project=? AND feature=?", (int(archived), project, fid))
    return {"archived": archived}


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
            db.execute("DELETE FROM labweave_bot_lifecycle WHERE feature=?", (fid,))
            db.execute("UPDATE labweave_bot_lifecycle SET cluster_parent=NULL WHERE cluster_parent=?", (fid,))
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
        db.execute("DELETE FROM labweave_bot_lifecycle WHERE project=? AND feature=?", (target, fid))
        db.execute("UPDATE labweave_bot_lifecycle SET cluster_parent=NULL WHERE project=? AND cluster_parent=?", (target, fid))
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
    cleaned_symbol = _clean_symbol(symbol, allow_empty=True) if symbol is not None else None
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
        next_symbol = cleaned_symbol if cleaned_symbol is not None else (existing[3] if existing and existing[3] is not None else (base.get("symbol") or ""))
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
        for fid, kind, title, instruction in db.execute(
                "SELECT feature,kind,title,instruction FROM labweave_bot_assignments WHERE project=? ORDER BY CASE WHEN kind='storage' THEN 1 ELSE 0 END, title", (project,)):
            normalized = "duty" if kind == "storage" else kind
            result.setdefault(fid, []).append({"kind": normalized, "title": title, "instruction": instruction})
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
            raw_kind = change.get("kind")
            if raw_kind not in ("duty", "storage"):
                raise workspace.WorkspaceError(400, "请选择职责任务。")
            kind = "duty"
            title = naming.display_name(change.get("title"))
            key = (project, fid, kind, title)
            if change.get("remove"):
                db.execute(
                    "DELETE FROM labweave_bot_assignments WHERE project=? AND feature=? AND kind IN ('duty','storage') AND title=?",
                    (project, fid, title),
                )
            else:
                instruction = workspace.text(change.get("instruction"), 3000)
                if not instruction:
                    raise workspace.WorkspaceError(400, "请说明要分配的任务。")
                previous = change.get("originalTitle")
                if previous is not None:
                    previous = naming.display_name(previous)
                    if previous != title:
                        db.execute(
                            "DELETE FROM labweave_bot_assignments WHERE project=? AND feature=? AND kind IN ('duty','storage') AND title=?",
                            (project, fid, previous),
                        )
                db.execute(
                    "DELETE FROM labweave_bot_assignments WHERE project=? AND feature=? AND kind='storage' AND title=?",
                    (project, fid, title),
                )
                db.execute("INSERT OR REPLACE INTO labweave_bot_assignments VALUES(?,?,?,?,?)", (*key, instruction))
        return [
            {"kind": "duty" if kind == "storage" else kind, "title": title, "instruction": instruction}
            for kind, title, instruction in db.execute(
                "SELECT kind,title,instruction FROM labweave_bot_assignments WHERE project=? AND feature=? ORDER BY CASE WHEN kind='storage' THEN 1 ELSE 0 END, title",
                (project, fid),
            )
        ]


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
        raise workspace.WorkspaceError(404, "未找到项目。")
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
        db.execute("DELETE FROM labweave_project_paradigms WHERE project = ?", (project_id,))
        db.execute("DELETE FROM labweave_bot_lifecycle WHERE project = ?", (project_id,))
