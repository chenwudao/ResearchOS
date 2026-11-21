"""Project-local history for one-time assignments sent to native Bot workers."""
from contextlib import closing
from datetime import datetime, timezone
import json
import re
from uuid import NAMESPACE_URL, uuid5

import features
import project_flow
import project_service
import visualizations
import workspace


TERMINAL = frozenset({"completed", "blocked", "needs_follow_up", "incomplete",
                      "failed", "cancelled", "interrupted"})
IDENTITY = re.compile(r"weave-bot-run-[0-9a-f]{32}")
CARD_LINK_FIELDS = ("parentId", "dependsOn", "relatedIds")
DETAIL_COLUMNS = """id, feature, bot_name, parent_session, task, status, title, answer,
                    record_id, detail, created_at, updated_at"""
PREVIEW_COLUMNS = """id, feature, bot_name, parent_session, substr(task,1,180), status, title, '',
                     record_id, '', created_at, updated_at"""


def _time():
    return datetime.now(timezone.utc).isoformat()


def _ensure(db):
    project_flow.ensure(db)
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_dispatches(
        project TEXT NOT NULL, id TEXT NOT NULL, feature TEXT NOT NULL, bot_name TEXT NOT NULL,
        parent_session TEXT NOT NULL, task TEXT NOT NULL, status TEXT NOT NULL,
        title TEXT NOT NULL DEFAULT '', answer TEXT NOT NULL DEFAULT '',
        record_id TEXT NOT NULL DEFAULT '', detail TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project,id))""")
    db.execute("""CREATE INDEX IF NOT EXISTS labweave_bot_dispatch_project_time
        ON labweave_bot_dispatches(project, updated_at DESC)""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_canvas_drafts(
        project TEXT NOT NULL, dispatch TEXT NOT NULL, card TEXT NOT NULL,
        title TEXT NOT NULL, body TEXT NOT NULL, category TEXT NOT NULL, updated_at TEXT NOT NULL,
        PRIMARY KEY(project,dispatch,card))""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_dispatch_links(
        project TEXT NOT NULL, dispatch TEXT NOT NULL, request_id TEXT NOT NULL,
        dependencies TEXT NOT NULL, policy_version INTEGER, PRIMARY KEY(project,dispatch))""")
    db.execute("""CREATE TABLE IF NOT EXISTS labweave_bot_draft_media(
        project TEXT NOT NULL, dispatch TEXT NOT NULL, card TEXT NOT NULL,
        media TEXT NOT NULL, PRIMARY KEY(project,dispatch,card))""")


def start(project, parent, jobs):
    if not isinstance(parent, str) or not parent or len(parent) > 160 or not isinstance(jobs, list) or not 1 <= len(jobs) <= 3:
        raise workspace.WorkspaceError(400, "需要发起对话和一至三项 Bot 任务。")
    bots = {item["id"]: item for item in features.list_features(project, project)
            if item.get("paradigm") and not item.get("archived")}
    now = _time()
    pending = []
    for job in jobs:
        if not isinstance(job, dict):
            raise workspace.WorkspaceError(400, "无效的分派任务。")
        identity, fid, task = job.get("id"), job.get("featureId"), workspace.text(job.get("task"), 8000)
        if not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(fid, str) or fid not in bots or not task:
            raise workspace.WorkspaceError(400, "请提供本项目已有 Bot 和具体任务。")
        request = workspace.text(job.get("requestId"), 200)
        dependencies = job.get("dependsOn", [])
        if not isinstance(dependencies, list) or len(dependencies) > 12 or any(
                not isinstance(dep, str) or not IDENTITY.fullmatch(dep) for dep in dependencies):
            raise workspace.WorkspaceError(400, "无效的前置任务。")
        version = job.get("policyVersion")
        if version is not None and (type(version) is not int or version < 0):
            raise workspace.WorkspaceError(400, "无效的项目规则版本。")
        acceptance = workspace.text(job.get("acceptance"), 1600)
        public_task = workspace.text(job.get("publicTask"), 1000)
        pending.append((identity, fid, task, request, dependencies, version, acceptance, public_task))
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("BEGIN IMMEDIATE")
        if db.execute("SELECT 1 FROM projects WHERE id=?", (project,)).fetchone() is None:
            raise workspace.WorkspaceError(404, "项目不存在。")
        current_version = project_flow.current_version(db, project)
        for identity, fid, task, request, dependencies, version, acceptance, public_task in pending:
            if version is not None and version != current_version:
                raise workspace.WorkspaceError(409, "项目规则有更新，请同步后重新分派。")
            if request and db.execute("""SELECT 1 FROM labweave_project_flow
                    WHERE project=? AND event_key=? AND kind='withdrawn'""",
                                      (project, f"input:{parent}:{request}")).fetchone():
                raise workspace.WorkspaceError(409, "发起消息已撤回，请用更新后的要求重新分派。")
            for dep in dependencies:
                valid = db.execute("""SELECT 1 FROM labweave_bot_dispatches AS task
                    JOIN labweave_bot_dispatch_links AS link ON task.project=link.project AND task.id=link.dispatch
                    WHERE task.project=? AND task.id=? AND task.parent_session=?
                    AND task.status='completed' AND link.request_id=? AND link.policy_version=?""",
                    (project, dep, parent, request, current_version)).fetchone()
                if not request or not valid:
                    raise workspace.WorkspaceError(409, "前置任务尚未在本次请求中完成。")
            if project_flow.changed_prerequisites(db, project, dependencies):
                raise workspace.WorkspaceError(409, "前置成果已更新或撤回，请先重新核对。")
            db.execute("""INSERT INTO labweave_bot_dispatches
                (project,id,feature,bot_name,parent_session,task,created_at,updated_at,status)
                VALUES(?,?,?,?,?,?,?,?,'queued') ON CONFLICT(project,id) DO NOTHING""",
                       (project, identity, fid, bots[fid]["label"], parent, task, now, now))
            if request:
                db.execute("""INSERT INTO labweave_bot_dispatch_links VALUES(?,?,?,?,?)
                    ON CONFLICT(project,dispatch) DO NOTHING""",
                           (project, identity, request, json.dumps(dependencies), version))
            project_flow.append(db, project, identity + ":queued", "task",
                                {"taskId": identity, "requestId": request, "sessionId": parent,
                                 "botId": fid, "status": "queued", "text": public_task or task[:1000],
                                 **({"publicTask": public_task} if public_task else {}),
                                 **({"acceptance": acceptance} if acceptance else {})})
    return {"accepted": True}


def update(project, identity, status, result):
    if (not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(status, str)
            or (status != "running" and status not in TERMINAL) or not isinstance(result, dict)):
        raise workspace.WorkspaceError(400, "无效的 Bot 任务状态。")
    detail = next((text for key in ("archiveError", "retirementError", "detail", "reason")
                   if (text := workspace.text(result.get(key), 1600))), "")
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("BEGIN IMMEDIATE")
        version = result.get("policyVersion")
        link = db.execute("SELECT dependencies FROM labweave_bot_dispatch_links WHERE project=? AND dispatch=?",
                          (project, identity)).fetchone()
        if status == "completed" and link and project_flow.changed_prerequisites(db, project, json.loads(link[0])):
            status = "needs_follow_up"
            detail = "前置成果已变化，请重新核对。"
            result = {**result, "recordId": ""}
        if status == "completed" and version is not None and version != project_flow.current_version(db, project):
            status = "needs_follow_up"
            detail = "项目规则已更新，请核对阶段成果并重新分派。"
            result = {**result, "recordId": ""}
        if status == "running":
            changed = db.execute("""UPDATE labweave_bot_dispatches SET status=?,updated_at=?
                WHERE project=? AND id=? AND status='queued'""", (status, _time(), project, identity))
        else:
            changed = db.execute("""UPDATE labweave_bot_dispatches
                SET status=?,title=?,answer=?,record_id=?,detail=?,updated_at=?
                WHERE project=? AND id=? AND status IN ('queued','running')""",
                       (status, workspace.text(result.get("title"), 200), workspace.text(result.get("answer"), 16000),
                        workspace.text(result.get("recordId"), 160), detail, _time(), project, identity))
        if changed.rowcount:
            if status == "completed" and version is not None:
                db.execute("""UPDATE labweave_bot_dispatch_links SET policy_version=?
                    WHERE project=? AND dispatch=?""", (version, project, identity))
            fid, parent = db.execute("""SELECT feature,parent_session FROM labweave_bot_dispatches
                WHERE project=? AND id=?""", (project, identity)).fetchone()
            project_flow.append(db, project, identity + ":" + status, "task",
                                {"taskId": identity, "sessionId": parent, "botId": fid, "status": status,
                                 "text": workspace.text(result.get("answer"), 1400) or detail,
                                 "recordId": workspace.text(result.get("recordId"), 160)})
        else:
            existing = db.execute("""SELECT status,detail FROM labweave_bot_dispatches
                WHERE project=? AND id=?""", (project, identity)).fetchone()
            if not existing:
                raise workspace.WorkspaceError(404, "未找到本项目的 Bot 任务。")
            status, detail = existing
    return {"ok": True, "status": status, **({"detail": detail} if detail else {})}


def _present(row, bots):
    identity, fid, original, parent, task, status, title, answer, record, detail, created, updated = row
    bot = bots.get(fid)
    cluster = bots.get(bot.get("clusterParent")) if bot else None
    return {"id": identity, "featureId": fid, "botLabel": bot["label"] if bot else original,
            "clusterId": cluster["id"] if cluster else None, "clusterLabel": cluster["label"] if cluster else None,
            "parentSessionId": parent, "status": status, "task": task, "title": title, "answer": answer,
            "recordId": record, "detail": detail, "createdAt": created, "updatedAt": updated,
            "botState": "removed" if bot is None else "archived" if bot.get("archived") else "active"}


def _draft_links(project, feature, identity, card, entries, args):
    prefix = f"draft:{identity}:"
    siblings = [{"id": prefix + key, **json.loads(row[3] or "{}")} for key, row in entries.items()
                if key != card]
    existing = json.loads(entries[card][3] or "{}") if card in entries else {}
    edited = set(args).intersection(CARD_LINK_FIELDS)
    links = {field: args.get(field, existing.get(field)) for field in CARD_LINK_FIELDS
             if field in edited or field in existing}
    if not edited:
        return links

    if links.get("parentId") is None:
        links.pop("parentId", None)
    state = project_service.project(workspace.snapshot(), project)
    rails = project_service._canvas_link_rails(project, feature)
    candidates = [*siblings, *project_service._canvas_link_records(state, rails)]
    project_service._check_canvas_direction(
        {"id": prefix + card, **links}, state, feature, candidates, False, edited=edited,
    )
    available = {entry["id"] for entry in candidates}
    for field in ("dependsOn", "relatedIds"):
        if field in edited:
            ids = links[field]
            if not isinstance(ids, list) or len(ids) > 12 or any(
                    not isinstance(target, str) or target not in available for target in ids):
                raise workspace.WorkspaceError(400, "草稿连线只能指向本次任务的草稿，或当前 Bot 和同一聚类中已保存的卡片。")
            links[field] = list(dict.fromkeys(ids))
    return links


def publish_draft(project, identity, args):
    if not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(args, dict):
        raise workspace.WorkspaceError(400, "无效的 Bot 分派草稿。")
    card = args.get("key")
    title = workspace.text(args.get("title"), 200)
    body = workspace.text(args.get("text"), 8000)
    category = workspace.text(args.get("category"), 80)
    if not isinstance(card, str) or not re.fullmatch(r"[a-zA-Z0-9_-]{1,48}", card) or not title or not body:
        raise workspace.WorkspaceError(400, "请填写草稿的标识、标题和内容。")
    media = {
        "summary": workspace.text(args.get("summary"), 240),
        "visualizations": visualizations.validate(args["visualizations"]) if "visualizations" in args else [],
        "outputFiles": project_service.output_references(project, args["files"]) if "files" in args else [],
    }
    if "sources" in args:
        media["sources"] = project_service.record_sources(project, args["sources"])
    stamp = _time()
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("BEGIN IMMEDIATE")
        job = db.execute("SELECT status,feature,parent_session FROM labweave_bot_dispatches WHERE project=? AND id=?",
                         (project, identity)).fetchone()
        if not job or job[0] not in ("queued", "running"):
            raise workspace.WorkspaceError(409, "只有工作中的 Bot 可以更新这项草稿。")
        entries = {key: (heading, text, group, stored_media) for key, heading, text, group, stored_media in db.execute(
            """SELECT d.card,d.title,d.body,d.category,m.media FROM labweave_bot_canvas_drafts d
                LEFT JOIN labweave_bot_draft_media m ON d.project=m.project AND d.dispatch=m.dispatch AND d.card=m.card
                WHERE d.project=? AND d.dispatch=?""", (project, identity))}
        if len(entries) >= 12 and card not in entries and card != "worker-result":
            raise workspace.WorkspaceError(400, "请更新本次任务已有的草稿。")
        media.update(_draft_links(project, job[1], identity, card, entries, args))
        encoded = json.dumps(media, ensure_ascii=False)
        result = {"id": f"draft:{identity}:{card}", "files": media["outputFiles"]}
        if entries.get(card) == (title, body, category, encoded):
            return result
        db.execute("""INSERT INTO labweave_bot_canvas_drafts VALUES(?,?,?,?,?,?,?)
            ON CONFLICT(project,dispatch,card) DO UPDATE SET title=excluded.title,body=excluded.body,
            category=excluded.category,updated_at=excluded.updated_at""",
                   (project, identity, card, title, body, category, stamp))
        db.execute("""INSERT INTO labweave_bot_draft_media VALUES(?,?,?,?)
            ON CONFLICT(project,dispatch,card) DO UPDATE SET media=excluded.media""",
                   (project, identity, card, encoded))
        project_flow.append(db, project, identity + ":" + card + ":" + stamp, "progress",
                            {"taskId": identity, "sessionId": job[2], "botId": job[1], "draftId": card,
                             "title": title, "text": body[:1400], "files": media["outputFiles"],
                             "charts": [{key: chart[key] for key in ("title", "xLabel", "yLabel", "type")}
                                        for chart in media["visualizations"]]})
    return result


def _publication_input(db, project, identity, parent):
    job = db.execute("""SELECT feature,bot_name,status,record_id,title,answer,updated_at
        FROM labweave_bot_dispatches WHERE project=? AND id=? AND parent_session=?""",
                     (project, identity, parent)).fetchone()
    if not job:
        raise workspace.WorkspaceError(404, "未找到由此项目对话发起的 Bot 任务。")
    rows = db.execute("""SELECT d.card,d.title,d.body,d.category,d.updated_at,m.media
        FROM labweave_bot_canvas_drafts d LEFT JOIN labweave_bot_draft_media m
        ON d.project=m.project AND d.dispatch=m.dispatch AND d.card=m.card
        WHERE d.project=? AND d.dispatch=? ORDER BY d.card""", (project, identity)).fetchall()
    link = db.execute("""SELECT request_id,policy_version FROM labweave_bot_dispatch_links
        WHERE project=? AND dispatch=?""", (project, identity)).fetchone()
    return job, rows, link


def _published_result(project, identity, feature, record):
    if not record:
        return None
    with closing(workspace.database()) as db:
        refs = db.execute("""SELECT id,json_extract(body,'$.publishedDraftId') FROM entities
            WHERE project=? AND kind=? AND json_extract(body,'$.dispatchId')=?""",
                          (project, feature, identity)).fetchall()
    if any(identity == record for identity, _ in refs):
        return {"recordId": record,
                "cardIds": {draft: identity for identity, draft in refs if draft and identity != record}}
    return None


def promote_drafts(project, identity, parent, selection=None, *, final=None):
    if not isinstance(identity, str) or not IDENTITY.fullmatch(identity) or not isinstance(parent, str) or not parent:
        raise workspace.WorkspaceError(400, "需要原分派和发起对话。")
    if selection is not None and (not isinstance(selection, list) or len(selection) > 12 or
                                  any(not isinstance(target, str) for target in selection)):
        raise workspace.WorkspaceError(400, "请提供本次任务返回的草稿引用。")
    with closing(workspace.database()) as db:
        _ensure(db)
        original = _publication_input(db, project, identity, parent)
    job, rows, link = original
    feature, bot, status, previous_record, title, answer, _ = job
    if status == "completed":
        published = _published_result(project, identity, feature, previous_record)
        if published:
            return published
    permitted = {"queued", "running"} if final is not None else {"needs_follow_up"}
    if status not in permitted or previous_record:
        raise workspace.WorkspaceError(409, "当前任务状态无法发布草稿。")
    bot_config = next((item for item in features.list_features(project, project)
                       if item["id"] == feature and item.get("paradigm") and not item.get("archived")), None)
    if not bot_config:
        raise workspace.WorkspaceError(404, "找不到接收正式卡片的活动 Bot。")
    prefix = f"draft:{identity}:"
    summary_id = prefix + "worker-result"
    drafts = {prefix + key: {
        "title": label, "text": text, "ts": stamp, **({"category": category} if category else {}),
        **json.loads(media or "{}"),
    } for key, label, text, category, stamp, media in rows}
    if summary_id not in drafts:
        raise workspace.WorkspaceError(409, "这次分派没有可发布的交付汇总。")
    summary = drafts[summary_id]
    summary["text"] = workspace.text((final or {}).get("answer"), 16000) or answer or summary["text"]
    summary["title"] = workspace.text((final or {}).get("title"), 200) or title or summary["title"]
    pending = [summary_id, *(selection or ())]
    chosen = {}
    while pending:
        target = pending.pop()
        if target in chosen:
            continue
        if target not in drafts:
            raise workspace.WorkspaceError(400, "正式发布只能转换同次分派中已保存的草稿。")
        draft = drafts[target]
        chosen[target] = draft
        related = [draft.get("parentId"), *draft.get("dependsOn", []), *draft.get("relatedIds", [])]
        pending.extend(ref for ref in related if isinstance(ref, str) and ref.startswith("draft:"))
    if len(chosen) < 2:
        raise workspace.WorkspaceError(409, "找不到要转为正式记录的明细草稿。")

    mapping = {key: "n_" + uuid5(NAMESPACE_URL, f"weave:{project}:{key}").hex for key in chosen}
    link_rails = project_service._canvas_link_rails(project, feature)
    ordered = sorted(chosen, key=lambda key: (key == summary_id, chosen[key]["ts"], key))

    def operation(state):
        records = state["rails"].setdefault(feature, [])
        if any(entry["id"] in mapping.values() for entry in records):
            raise workspace.WorkspaceError(409, "这次分派已发布过正式卡片。")
        new_entries = []
        for key in ordered:
            entry = {**chosen[key], "id": mapping[key], "source": bot,
                     "dispatchId": identity, "publishedDraftId": key}
            if "parentId" in entry:
                entry["parentId"] = mapping.get(entry["parentId"], entry["parentId"])
            for field in ("dependsOn", "relatedIds"):
                if field in entry:
                    entry[field] = [mapping.get(value, value) for value in entry[field]]
            if "sources" in entry:
                entry["sources"] = project_service.record_sources(project, entry["sources"], state)
            if key == summary_id and (final or {}).get("elements"):
                project_service._entry_elements({"elements": final["elements"]}, entry, bot_config.get("extension"), records)
            new_entries.append(entry)
        candidates = [*project_service._canvas_link_records(state, link_rails), *new_entries]
        for entry in new_entries:
            fields = set(entry).intersection(CARD_LINK_FIELDS)
            project_service._check_canvas_direction(entry, state, feature, candidates, False, edited=fields)
        # Apply symmetric associations using the full proposed graph so a later
        # card's update cannot erase backlinks from an earlier one.
        pairs = {entry["id"]: set(entry.get("relatedIds", [])) for entry in new_entries}
        for source, targets in list(pairs.items()):
            for target in targets:
                if target in pairs:
                    pairs[target] = pairs[target] | {source}
        for entry in new_entries:
            targets = pairs[entry["id"]]
            if targets:
                project_service._entry_relations({"relatedIds": sorted(targets)}, entry, candidates)
        records.extend(new_entries)
        return {"recordId": mapping[summary_id],
                "cardIds": {key: mapping[key] for key in ordered if key != summary_id}}

    def commit(db):
        if _publication_input(db, project, identity, parent) != original:
            raise workspace.WorkspaceError(409, "任务或草稿已有更新，请重新读取后发布。")
        if project_service._canvas_link_rails(project, feature) != link_rails:
            raise workspace.WorkspaceError(409, "Bot 聚类已变化，请重新核对连线。")
        if link:
            request_id, version = link
            dependencies = db.execute("SELECT dependencies FROM labweave_bot_dispatch_links WHERE project=? AND dispatch=?",
                                      (project, identity)).fetchone()
            if dependencies and project_flow.changed_prerequisites(db, project, json.loads(dependencies[0])):
                raise workspace.WorkspaceError(409, "前置成果已变化，请核对后再发布。")
            if version is not None and project_flow.current_version(db, project) != version:
                raise workspace.WorkspaceError(409, "项目规则已更新，请核对阶段成果后继续。")
            if db.execute("""SELECT 1 FROM labweave_project_flow WHERE project=? AND event_key=? AND kind='withdrawn'""",
                          (project, f"input:{parent}:{request_id}")).fetchone():
                raise workspace.WorkspaceError(409, "发起消息已撤回，不能发布这次交付。")
        db.execute("""UPDATE labweave_bot_dispatches SET status='completed',record_id=?,title=?,answer=?,detail='',updated_at=?
            WHERE project=? AND id=?""",
                   (mapping[summary_id], summary["title"], summary["text"], _time(), project, identity))
        project_flow.append(db, project, identity + ":completed", "task",
                            {"taskId": identity, "sessionId": parent, "botId": feature, "status": "completed",
                             "recordId": mapping[summary_id], "text": summary["text"][:1400]})
        project_flow.record_change(db, project, feature, {**summary, "id": mapping[summary_id],
                                   "taskId": identity, "status": "completed"}, "saved")

    try:
        return project_service.mutate(project, operation, before_commit=commit)
    except workspace.WorkspaceError as error:
        if error.status == 409:
            published = _published_result(project, identity, feature, mapping[summary_id])
            if published:
                return published
        raise


def canvas(project, feature):
    project_bots = features.list_features(project, project)
    bot_sessions = {bot["botSessionId"]: bot["label"] for bot in project_bots if bot.get("botSessionId")}
    members = [bot for bot in project_bots
               if bot["id"] == feature or bot.get("clusterParent") == feature]
    if not members or not any(bot["id"] == feature and bot.get("paradigm") for bot in members):
        raise workspace.WorkspaceError(404, "未找到这个 Bot。")
    names = {bot["id"]: bot["label"] for bot in members}
    slots = ",".join("?" for _ in names)
    with closing(workspace.database()) as db:
        _ensure(db)
        db.execute("BEGIN")
        columns = "id,feature,status,task,title,answer,updated_at,record_id,detail,created_at,parent_session"
        canvas_jobs = db.execute(f"""SELECT {columns}
            FROM labweave_bot_dispatches WHERE project=? AND feature IN ({slots}) AND record_id=''
            ORDER BY (status IN ('queued','running')) DESC,updated_at DESC LIMIT 30""",
                                 (project, *names)).fetchall()
        linked_jobs = db.execute(f"""SELECT {columns} FROM labweave_bot_dispatches AS job
            WHERE project=? AND feature IN ({slots}) AND record_id<>'' AND EXISTS (
                SELECT 1 FROM labweave_bot_draft_media AS draft WHERE draft.project=job.project AND draft.dispatch=job.id
                AND draft.card<>'worker-result'
                AND (json_extract(draft.media,'$.parentId') IS NOT NULL OR
                     json_array_length(draft.media,'$.dependsOn')>0 OR json_array_length(draft.media,'$.relatedIds')>0))
            ORDER BY updated_at DESC LIMIT 30""", (project, *names)).fetchall()
        canvas_jobs += linked_jobs
        own_jobs = db.execute(f"""SELECT {columns} FROM labweave_bot_dispatches
            WHERE project=? AND feature=?
            ORDER BY (status IN ('queued','running')) DESC,updated_at DESC LIMIT 30""",
                              (project, feature)).fetchall()
        published = dict(db.execute("""SELECT json_extract(body,'$.publishedDraftId'),id FROM entities
            WHERE project=? AND json_type(body,'$.publishedDraftId')='text'""", (project,)))
        canvas_ids = {job[0] for job in canvas_jobs}
        own_ids = {job[0] for job in own_jobs}
        jobs = {job[0]: job for job in [*canvas_jobs, *own_jobs]}
        followups = {}
        if own_ids:
            select_ids = ",".join("?" for _ in own_ids)
            rows = db.execute(f"""SELECT payload FROM labweave_project_flow
                WHERE project=? AND kind='input'
                AND json_extract(payload,'$.followUpOf') IN ({select_ids})
                ORDER BY seq DESC LIMIT 90""", (project, *own_ids))
            for payload, in rows:
                item = json.loads(payload)
                followups.setdefault(item["followUpOf"], []).append(item)
        items = []
        messages = []
        for identity, bot, status, task, title, answer, stamp, record, detail, created, parent in jobs.values():
            drafts = db.execute("""SELECT d.card,d.title,d.body,d.category,d.updated_at,m.media
                FROM labweave_bot_canvas_drafts d LEFT JOIN labweave_bot_draft_media m
                ON d.project=m.project AND d.dispatch=m.dispatch AND d.card=m.card
                WHERE d.project=? AND d.dispatch=? ORDER BY d.updated_at DESC,d.card""",
                                (project, identity)).fetchall()
            queued = db.execute("SELECT payload FROM labweave_project_flow WHERE project=? AND event_key=?",
                                (project, identity + ":queued")).fetchone()
            queued_payload = json.loads(queued[0]) if queued else {}
            public_task = queued_payload.get("publicTask") or task
            heading = title or public_task.splitlines()[0][:120]
            final = {"id": f"draft:{identity}:final:result", "title": heading, "text": answer or detail,
                     "ts": stamp, "canvasDraft": True, "dispatchStatus": status, "canvasRail": bot,
                     "recordId": record}
            cards = [{"id": f"draft:{identity}:{card}", "title": label, "text": body,
                      "category": category, "ts": updated, "canvasDraft": True, "dispatchStatus": status,
                      **json.loads(media or "{}"), "canvasRail": bot,
                      **({"canvasGroup": names[bot]} if len(names) > 1 else {})}
                     for card, label, body, category, updated, media in drafts]
            if identity in own_ids:
                origin = db.execute("""SELECT link.request_id,flow.kind,flow.payload,link.dependencies
                    FROM labweave_bot_dispatch_links AS link
                    LEFT JOIN labweave_project_flow AS flow ON flow.project=link.project
                    AND flow.event_key='input:'||?||':'||link.request_id
                    WHERE link.project=? AND link.dispatch=?""", (parent, project, identity)).fetchone()
                source = json.loads(origin[2]) if origin and origin[1] == "input" else {}
                acceptance = queued_payload.get("acceptance", "")
                dependency_titles = []
                for dependency in json.loads(origin[3]) if origin else []:
                    previous = db.execute("SELECT title,task FROM labweave_bot_dispatches WHERE project=? AND id=?",
                                          (project, dependency)).fetchone()
                    if previous:
                        dependency_titles.append(previous[0] or previous[1].splitlines()[0][:120])
                messages.append({**final, "id": f"draft:{identity}:overview", "title": "收到项目分派",
                                 "text": public_task, "ts": created, "recordId": "", "taskOverview": True,
                                 "dispatchId": identity, "taskTitle": title, "parentSessionId": parent,
                                 "originBotLabel": bot_sessions.get(parent, ""),
                                 "sourceMessageId": origin[0] if origin and origin[1] != "withdrawn" else "",
                                 "sourceWithdrawn": bool(origin and origin[1] == "withdrawn"),
                                 "acceptance": acceptance, "dependencyTitles": dependency_titles,
                                 "sourceText": source.get("text", ""), "followUpOf": source.get("followUpOf", "")})
                messages.extend({"id": item["messageId"], "text": item["text"], "ts": item["createdAt"],
                                 "dispatchId": identity, "taskFollowUp": True,
                                 "parentSessionId": parent, "sourceMessageId": item["messageId"]}
                                for item in reversed(followups.get(identity, [])) if item.get("createdAt"))
                final_card = next((card for card in cards if card["id"] == f"draft:{identity}:worker-result"), {})
                messages.extend({**card, "dispatchId": identity, "recordId": published.get(card["id"], "")} for card in cards
                                if status not in TERMINAL or card is not final_card)
                if status in TERMINAL:
                    messages.append({**final_card, **final, "taskResult": True, "dispatchId": identity})
            if identity not in canvas_ids:
                continue
            if record:
                cards = [card for card in cards if card["id"] != f"draft:{identity}:worker-result"]
                endpoints = set()
                for card in cards:
                    targets = [card.get("parentId"), *card.get("dependsOn", []), *card.get("relatedIds", [])]
                    if any(targets):
                        endpoints.update([card["id"], *targets])
                cards = [card for card in cards if card["id"] in endpoints and card["id"] not in published]
                for card in cards:
                    if card.get("parentId") in published:
                        card["parentId"] = published[card["parentId"]]
                    for field in ("dependsOn", "relatedIds"):
                        if field in card:
                            card[field] = [published.get(target, target) for target in card[field]]
            elif not drafts:
                cards.append({**final, "id": f"draft:{identity}:overview", "text": answer or public_task})
            elif answer and status in ("needs_follow_up", "completed") and all(card["text"] != answer for card in cards):
                cards.insert(0, final)
            if len(names) > 1:
                for card in cards:
                    card["canvasGroup"] = names[bot]
            items.extend(cards)
    return {"active": sum(job[2] in ("queued", "running") for job in canvas_jobs), "drafts": items, "messages": messages}


def conversation_activity(projects):
    """Return only the current activity and newest reportable outcome of each Bot."""
    if not projects:
        return []
    placeholders = ",".join("?" for _ in projects)
    with closing(workspace.database()) as db:
        rows = db.execute(f"""WITH ranked AS (
            SELECT project, feature, id, status, updated_at,
                   status IN ('queued','running') AS active,
                   ROW_NUMBER() OVER (
                       PARTITION BY project, feature, status IN ('queued','running')
                       ORDER BY updated_at DESC, rowid DESC
                   ) AS position
            FROM labweave_bot_dispatches
            WHERE project IN ({placeholders})
              AND status IN ('queued','running','completed','failed','blocked','incomplete','interrupted')
        )
        SELECT project, feature, id, status, updated_at FROM ranked WHERE position=1""", projects)
        return [{"project": project, "feature": feature, "id": identity, "status": status,
                 "time": int(datetime.fromisoformat(updated).timestamp() * 1000)}
                for project, feature, identity, status, updated in rows]


def reference_candidates(project, query, feature=None, *, limit=12):
    with closing(workspace.database()) as db:
        _ensure(db)
        rows = db.execute("""SELECT id,feature,bot_name,COALESCE(NULLIF(title,''),task)
            FROM labweave_bot_dispatches WHERE project=? AND (? IS NULL OR feature=?)
            AND instr(lower(title || ' ' || task || ' ' || bot_name),?) > 0
            ORDER BY updated_at DESC,rowid DESC LIMIT ?""",
                          (project, feature, feature, query.lower(), limit))
        return [{"id": identity, "featureId": feature_id, "botName": name, "title": title}
                for identity, feature_id, name, title in rows]


def view(project, *, summary=False, identity=None):
    link = None
    with closing(workspace.database()) as db:
        _ensure(db)
        if identity is None:
            active = db.execute("""SELECT COUNT(*) FROM labweave_bot_dispatches
                WHERE project=? AND status IN ('queued','running')""", (project,)).fetchone()[0]
            if summary:
                return {"activeCount": active}
            rows = db.execute(
                f"""SELECT {PREVIEW_COLUMNS} FROM labweave_bot_dispatches WHERE project=?
                    ORDER BY (status IN ('queued','running')) DESC, updated_at DESC, rowid DESC LIMIT ?""",
                (project, active + 60),
            ).fetchall()
        else:
            row = db.execute(
                f"SELECT {DETAIL_COLUMNS} FROM labweave_bot_dispatches WHERE project=? AND id=?", (project, identity)
            ).fetchone()
            if row is None:
                raise workspace.WorkspaceError(404, "没有找到该项目的 Bot 任务。")
            link = db.execute("""SELECT request_id,dependencies FROM labweave_bot_dispatch_links
                WHERE project=? AND dispatch=?""", (project, identity)).fetchone()
        ids = [row[0]] if identity is not None else [task[0] for task in rows]
        summaries = {}
        if ids:
            params = ",".join("?" for _ in ids)
            summaries = {key.removesuffix(":queued"): text for key, text in db.execute(f"""
                SELECT event_key, json_extract(payload, '$.publicTask') FROM labweave_project_flow
                WHERE project=? AND event_key IN ({params}) AND json_type(payload, '$.publicTask')='text'""",
                (project, *(task + ":queued" for task in ids)))}
    if identity is None and not rows:
        return {"activeCount": active, "tasks": []}
    bots = {bot["id"]: bot for bot in features.list_features(project, project)}
    if identity is not None:
        return _present(row, bots) | {"publicTask": summaries.get(identity, "")} | (
            {"requestId": link[0], "dependsOn": json.loads(link[1])} if link else {})
    return {"activeCount": active, "tasks": [_present(row, bots) | {"publicTask": summaries.get(row[0], "")}
                                             for row in rows]}


def recover():
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("""UPDATE labweave_bot_dispatches SET status='interrupted',updated_at=?
            WHERE status IN ('queued','running')""", (_time(),))


def clear_project(project):
    with closing(workspace.database()) as db, db:
        _ensure(db)
        db.execute("DELETE FROM labweave_bot_canvas_drafts WHERE project=?", (project,))
        db.execute("DELETE FROM labweave_bot_dispatches WHERE project=?", (project,))
        db.execute("DELETE FROM labweave_bot_dispatch_links WHERE project=?", (project,))
        db.execute("DELETE FROM labweave_bot_draft_media WHERE project=?", (project,))
        db.execute("DELETE FROM labweave_project_flow WHERE project=?", (project,))
