"""Tiered FTS5 + recency + pinned memory store scoped per project or 'global'."""
from contextlib import closing
from datetime import datetime, timezone
import re
from uuid import uuid4

ALLOWED_SOURCES = frozenset({"manual", "conversation", "task_result", "confirmed_workflow", "profile"})
_CJK_RUN_RE = re.compile(r"[\u3400-\u9fff]+")
_WORD_RE = re.compile(r"[A-Za-z0-9_.-]+")
_COLUMNS = "id, category, content, created, updated_at, source, pinned"


def _workspace():
    import workspace
    return workspace


def _clip_text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def timestamp():
    return datetime.now(timezone.utc).isoformat()


def _cjk_bigrams(text):
    tokens = []
    for run in _CJK_RUN_RE.findall(text or ""):
        if len(run) == 1:
            tokens.append(run)
        else:
            tokens.extend(run[i:i + 2] for i in range(len(run) - 1))
    return " ".join(tokens)


def _fts_quote(token):
    return '"' + token.replace('"', '""') + '"'


def _query_terms(query):
    clean = (query or "").strip()
    if not clean:
        return []
    groups = []
    for run in _CJK_RUN_RE.findall(clean):
        if len(run) >= 2:
            groups.append(("bigrams", [_fts_quote(run[i:i + 2]) for i in range(len(run) - 1)]))
        else:
            groups.append(("bigrams", [_fts_quote(run)]))
    ascii_part = _CJK_RUN_RE.sub(" ", clean)
    for word in _WORD_RE.findall(ascii_part):
        groups.append(("content", [_fts_quote(word)]))
    return groups


def _sync_fts(db, identity, project_id, category, content):
    db.execute("DELETE FROM memories_fts WHERE id=?", (identity,))
    db.execute(
        "INSERT INTO memories_fts (id, project, category, content, bigrams) VALUES (?, ?, ?, ?, ?)",
        (identity, project_id, category, content, _cjk_bigrams(content)),
    )


def ensure_schema(db):
    """Idempotently evolve memories columns and standalone FTS5 index while keeping PRAGMA user_version=1."""
    db.execute(
        "CREATE TABLE IF NOT EXISTS memories ("
        "id TEXT PRIMARY KEY, project TEXT, category TEXT, content TEXT, created TEXT)"
    )
    cols = {row[1] for row in db.execute("PRAGMA table_info(memories)")}
    changed = False
    if "source" not in cols:
        db.execute("ALTER TABLE memories ADD COLUMN source TEXT NOT NULL DEFAULT 'manual'")
        changed = True
    if "pinned" not in cols:
        db.execute("ALTER TABLE memories ADD COLUMN pinned INTEGER NOT NULL DEFAULT 0")
        changed = True
    if "updated_at" not in cols:
        db.execute("ALTER TABLE memories ADD COLUMN updated_at TEXT NOT NULL DEFAULT ''")
        changed = True
    if changed or db.execute("SELECT 1 FROM memories WHERE COALESCE(updated_at, '') = '' LIMIT 1").fetchone():
        db.execute("UPDATE memories SET updated_at = created WHERE COALESCE(updated_at, '') = ''")

    db.execute(
        "CREATE INDEX IF NOT EXISTS idx_memories_project_pin_time "
        "ON memories(project, pinned DESC, updated_at DESC, created DESC)"
    )

    has_fts = db.execute(
        "SELECT 1 FROM sqlite_master WHERE type='table' AND name='memories_fts'"
    ).fetchone()
    if not has_fts:
        db.execute(
            "CREATE VIRTUAL TABLE memories_fts USING fts5("
            "id UNINDEXED, project UNINDEXED, category UNINDEXED, content, bigrams, "
            "tokenize='unicode61 remove_diacritics 2')"
        )
        db.execute(
            "CREATE TRIGGER IF NOT EXISTS trg_memories_ad AFTER DELETE ON memories BEGIN "
            "DELETE FROM memories_fts WHERE id = old.id; END"
        )
        for identity, project_id, category, content in db.execute(
            "SELECT id, project, category, content FROM memories"
        ).fetchall():
            db.execute(
                "INSERT INTO memories_fts (id, project, category, content, bigrams) VALUES (?, ?, ?, ?, ?)",
                (identity, project_id or "", category or "decision", content or "", _cjk_bigrams(content or "")),
            )
    else:
        db.execute(
            "CREATE TRIGGER IF NOT EXISTS trg_memories_ad AFTER DELETE ON memories BEGIN "
            "DELETE FROM memories_fts WHERE id = old.id; END"
        )


def _row_to_dict(row):
    identity, category, content, created, updated_at, source, pinned = row
    return {
        "id": identity,
        "category": category or "decision",
        "content": content or "",
        "created": created or "",
        "updatedAt": updated_at or created or "",
        "source": source or "manual",
        "pinned": bool(pinned),
    }


def _normalize_source(source, category):
    if source in ALLOWED_SOURCES:
        return source
    if category == "task_result":
        return "task_result"
    if category == "confirmed_workflow":
        return "confirmed_workflow"
    return "manual"


def _norm_content(text):
    return " ".join(str(text or "").split()).casefold()


def list_memories(project_id, *, category=None, limit=None):
    where = "WHERE project=?"
    params = [project_id]
    if category:
        where += " AND category=?"
        params.append(category)
    sql = (
        f"SELECT {_COLUMNS} FROM memories {where} "
        "ORDER BY pinned DESC, COALESCE(NULLIF(updated_at, ''), created) DESC, rowid DESC"
    )
    if limit is not None:
        sql += " LIMIT ?"
        params.append(max(1, int(limit)))
    with closing(_workspace().database()) as db:
        return [_row_to_dict(row) for row in db.execute(sql, params).fetchall()]


def remember(project_id, content, category="decision", identity=None, *, source=None, pinned=None):
    clean = str(content or "").strip()
    cat = _clip_text(category, 60) or "decision"
    now = timestamp()
    deduplicated = False
    with closing(_workspace().database()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        if identity is None:
            target_norm = _norm_content(clean)
            if target_norm:
                for row in db.execute(
                    f"SELECT {_COLUMNS} FROM memories WHERE project=? ORDER BY pinned DESC, rowid DESC",
                    (project_id,),
                ).fetchall():
                    if _norm_content(row[2]) == target_norm:
                        identity = row[0]
                        existing_source = row[5] or "manual"
                        existing_pinned = bool(row[6])
                        final_pinned = int(existing_pinned if pinned is None else bool(pinned))
                        final_source = _normalize_source(source, cat) if source else existing_source
                        db.execute(
                            "UPDATE memories SET category=?, content=?, updated_at=?, source=?, pinned=? "
                            "WHERE project=? AND id=?",
                            (cat, clean, now, final_source, final_pinned, project_id, identity),
                        )
                        _sync_fts(db, identity, project_id, cat, clean)
                        deduplicated = True
                        return {
                            "id": identity,
                            "category": cat,
                            "content": clean,
                            "created": row[3],
                            "updatedAt": now,
                            "source": final_source,
                            "pinned": bool(final_pinned),
                            "deduplicated": True,
                        }
        identity = identity or uuid4().hex
        existing = db.execute(
            "SELECT created, source, pinned FROM memories WHERE project=? AND id=?",
            (project_id, identity),
        ).fetchone()
        final_source = _normalize_source(source, cat) if (source or not existing) else (existing[1] or "manual")
        if pinned is None:
            final_pinned = int(bool(existing[2])) if existing else 0
        else:
            final_pinned = int(bool(pinned))
        created = existing[0] if existing else now
        db.execute(
            "INSERT INTO memories (id, project, category, content, created, updated_at, source, pinned) "
            "VALUES (?, ?, ?, ?, ?, ?, ?, ?) "
            "ON CONFLICT(id) DO UPDATE SET "
            "category=excluded.category, content=excluded.content, updated_at=excluded.updated_at, "
            "source=excluded.source, pinned=excluded.pinned",
            (identity, project_id, cat, clean, created, now, final_source, final_pinned),
        )
        _sync_fts(db, identity, project_id, cat, clean)
    return {
        "id": identity,
        "category": cat,
        "content": clean,
        "created": created,
        "updatedAt": now,
        "source": final_source,
        "pinned": bool(final_pinned),
        "deduplicated": deduplicated,
    }


def update_memory(project_id, memory_id, *, content=None, category=None, pinned=None):
    now = timestamp()
    ws = _workspace()
    with closing(ws.database()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute(
            f"SELECT {_COLUMNS} FROM memories WHERE project=? AND id=?",
            (project_id, memory_id),
        ).fetchone()
        if not row:
            raise ws.WorkspaceError(404, "未找到该条记忆。")
        next_cat = (_clip_text(category, 60) or row[1]) if category is not None else row[1]
        next_content = content.strip() if isinstance(content, str) and content.strip() else row[2]
        next_pinned = int(bool(pinned)) if pinned is not None else int(bool(row[6]))
        db.execute(
            "UPDATE memories SET category=?, content=?, updated_at=?, pinned=? WHERE project=? AND id=?",
            (next_cat, next_content, now, next_pinned, project_id, memory_id),
        )
        _sync_fts(db, memory_id, project_id, next_cat, next_content)
        return {
            "id": memory_id,
            "category": next_cat,
            "content": next_content,
            "created": row[3],
            "updatedAt": now,
            "source": row[5] or "manual",
            "pinned": bool(next_pinned),
        }


def pin_memory(project_id, memory_id, pinned=True):
    return update_memory(project_id, memory_id, pinned=bool(pinned))


def delete_memory(project_id, memory_id):
    with closing(_workspace().database()) as db, db:
        db.execute("DELETE FROM memories WHERE project=? AND id=?", (project_id, memory_id))
        db.execute("DELETE FROM memories_fts WHERE project=? AND id=?", (project_id, memory_id))
    return {"ok": True}


def delete_project_memories(db, project_id):
    db.execute("DELETE FROM memories WHERE project=?", (project_id,))
    if db.execute("SELECT 1 FROM sqlite_master WHERE type='table' AND name='memories_fts'").fetchone():
        db.execute("DELETE FROM memories_fts WHERE project=?", (project_id,))


def _recency_score(updated_at, now_dt):
    if not updated_at:
        return 0.2
    try:
        dt = datetime.fromisoformat(updated_at.replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        age_days = max(0.0, (now_dt - dt).total_seconds() / 86400.0)
        return 1.0 / (1.0 + age_days / 30.0)
    except ValueError:
        return 0.2


def _hybrid_rank(rows_with_bm25, query_folded, now_dt):
    ranked = []
    for entry, raw_bm25 in rows_with_bm25:
        pos_bm25 = max(0.0, -float(raw_bm25))
        rel = pos_bm25 / (1.0 + pos_bm25) if pos_bm25 > 0 else 0.35
        exact_boost = 0.35 if (query_folded and query_folded in entry["content"].casefold()) else 0.0
        recency = _recency_score(entry["updatedAt"], now_dt) * 0.25
        pin_boost = 0.60 if entry["pinned"] else 0.0
        score = round(rel + exact_boost + recency + pin_boost, 4)
        ranked.append((score, entry))
    ranked.sort(key=lambda item: (item[0], item[1]["updatedAt"], item[1]["created"]), reverse=True)
    return [{**item, "score": score} for score, item in ranked]


def search_memories(project_id, query="", *, category=None, limit=20):
    cap = max(1, min(int(limit or 20), 100))
    clean = str(query or "").strip()
    if not clean:
        return list_memories(project_id, category=category, limit=cap)

    terms = _query_terms(clean)
    query_folded = clean.casefold()
    now_dt = datetime.now(timezone.utc)
    seen = {}

    with closing(_workspace().database()) as db:
        if terms:
            strict_parts = [
                f"{col} : ({' '.join(toks)})" if len(toks) > 1 else f"{col} : {toks[0]}"
                for col, toks in terms
            ]
            flat_tokens = [f"{col} : {tok}" for col, toks in terms for tok in toks]
            queries = [" AND ".join(strict_parts)]
            if len(flat_tokens) > 1:
                queries.append(" OR ".join(flat_tokens))

            cat_clause = " AND m.category=?" if category else ""
            for fts_match in queries:
                params = [fts_match, project_id]
                if category:
                    params.append(category)
                params.append(cap * 4)
                sql = (
                    f"SELECT m.id, m.category, m.content, m.created, m.updated_at, m.source, m.pinned, "
                    f"bm25(memories_fts, 2.0, 1.0) AS rank "
                    f"FROM memories_fts f JOIN memories m ON m.id = f.id "
                    f"WHERE memories_fts MATCH ? AND m.project=?{cat_clause} "
                    f"ORDER BY rank ASC LIMIT ?"
                )
                for row in db.execute(sql, params).fetchall():
                    if row[0] not in seen:
                        seen[row[0]] = (_row_to_dict(row[:7]), row[7])
                if len(seen) >= cap:
                    break

        # Substring fallback for 1-char CJK, punctuation symbols, or partial matches FTS missed.
        if len(seen) < cap:
            where = "WHERE project=?"
            params = [project_id]
            if category:
                where += " AND category=?"
                params.append(category)
            for row in db.execute(
                f"SELECT {_COLUMNS} FROM memories {where} ORDER BY pinned DESC, updated_at DESC, created DESC",
                params,
            ).fetchall():
                if row[0] in seen:
                    continue
                if query_folded in (row[2] or "").casefold():
                    seen[row[0]] = (_row_to_dict(row), -0.5)

    return _hybrid_rank(list(seen.values()), query_folded, now_dt)[:cap]


def core_memories(project_id, *, max_items=8, max_chars=1800, preview_chars=320):
    """Build compact Tier-1 Working/Core Memory list: pinned first, filled by recent items within budget."""
    entries = list_memories(project_id, limit=max(max_items * 2, 16))
    selected = []
    total_chars = 0
    for entry in entries:
        if len(selected) >= max_items:
            break
        snippet = entry["content"][:preview_chars]
        if selected and total_chars + len(snippet) > max_chars:
            break
        total_chars += len(snippet)
        selected.append({
            "id": entry["id"],
            "category": entry["category"],
            "content": snippet,
            "pinned": entry["pinned"],
            "source": entry["source"],
        })
    return selected
