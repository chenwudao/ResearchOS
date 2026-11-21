"""Private business API for the DSH owner plugin. The launcher owns the bearer."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import sqlite3
import threading

import assistant_profile
import bot_activity
import composer_references
import project_flow
import bot_dispatches
import automation
from dsh_workspace_map import BindingError, WorkspaceBindings
import features
import naming
import project_service as projects
import project_sources
import project_tools
import project_plugins
import research_api
import research_mcp
import session_cleanup
import tasks
import workspace

PROFILE = "labweave-web"
MAX_BODY = 36 * 1024 * 1024


def global_directory():
    return workspace.DATA / "web-global"


def catalog():
    saved = workspace.snapshot()
    root = workspace.DATA / "projects"
    root.mkdir(exist_ok=True)
    global_directory().mkdir(exist_ok=True)
    rows = [{
        "scope": "global",
        "name": naming.NamingStore().assistant_name(),
        "path": str(global_directory()),
        **assistant_profile.summary_for_catalog(),
    }]
    for item in saved.get("state", {}).get("projects", []):
        identity = item["id"]
        if not re.fullmatch(r"proj_[A-Za-z0-9_-]{1,120}", identity):
            continue
        path = root / identity
        if path.is_symlink() or path.is_junction():
            continue
        path.mkdir(exist_ok=True)
        feat_list = features.list_features("global", identity)
        assigned = features.assignment_map(identity)
        schedules = features.schedule_map(identity)
        rows.append({
            "scope": identity,
            "name": item["name"],
            "path": str(path),
            "features": [{**{k:f.get(k) for k in ("id","label","builtin","shared","hint","symbol","keywords","botSessionId","paradigm","layout","extension","temporary","archived","clusterParent")},
                          "assignments":assigned.get(f["id"],[]),
                          "scheduleIds":schedules.get(f["id"],[])} for f in feat_list],
            "botSessionIds": [f["botSessionId"] for f in feat_list if f.get("botSessionId")],
        })
    with closing(workspace.database()) as db:
        tables = {r[0] for r in db.execute("SELECT name FROM sqlite_master WHERE type='table'")}
        known = {}
        if "dsh_workspace_bindings_v1" in tables:
            known.update(db.execute("SELECT project_id,workspace_id FROM dsh_workspace_bindings_v1 WHERE profile=?", (PROFILE,)))
        if "dsh_global_workspace_v1" in tables:
            known.update(db.execute("SELECT 'global',workspace_id FROM dsh_global_workspace_v1 WHERE profile=?", (PROFILE,)))
        for row in rows:
            if row["scope"] in known:
                row["boundId"] = known[row["scope"]]
    return rows


def bindings(record):
    def exists(identity):
        with closing(workspace.database()) as db:
            return db.execute("SELECT 1 FROM projects WHERE id=?", (identity,)).fetchone() is not None

    return WorkspaceBindings(workspace.DATA / "workspace.sqlite3", workspace.DATA / "projects", exists,
                             lambda profile, wid: record["path"] if wid == record["id"] else None,
                             global_directory())


def project_view(scope):
    if scope == "global":
        labels = naming.NamingStore().feature_labels(scope)
        return {"scope": scope, "name": naming.NamingStore().assistant_name(), "labels": labels,
                "features": features.list_features("global")}
    item = projects.project(workspace.snapshot(), scope)
    feature_list = features.list_features("global", scope)
    labels = {f["id"]: f["label"] for f in feature_list}
    jobs = automation.public_jobs().get(scope, {})
    feed = jobs.get("feed", {})
    review = jobs.get("review", {})
    hidden = set(item.get("dismissedFeed", []))
    rails = dict(item["rails"])
    for f in feature_list:
        if f["id"] != "chat":
            rails.setdefault(f["id"], [])
    rails["feed"] = [*rails.get("feed", []), *(e for e in feed.get("items", []) if (e.get("url") or e["text"]) not in hidden)]
    return {
        "scope": scope,
        "name": item["name"],
        "description": item.get("description", ""),
        "topic": item.get("topic", ""),
        "autoReview": bool(item.get("autoReview")),
        "labels": labels,
        "features": feature_list,
        "botSessionIds": [f["botSessionId"] for f in feature_list if f.get("botSessionId")],
        "rails": rails,
        "feedMeta": {"updated": feed.get("updated"), "error": feed.get("error"), "unavailable": feed.get("unavailable", [])},
        "reviews": review.get("reviews", []),
        "memories": [{"id": m["id"], "category": m["category"], "pinned": m["pinned"], "source": m["source"],
                      "content": (m.get("content") or "")[:200]}
                     for m in projects.memory_list(scope)[:12]],
        "plugins": project_plugins.list_for(scope),
    }


def project_action(scope, data):
    action, args = data.get("action"), data.get("args", {})
    if not isinstance(args, dict) or "projectId" in args:
        raise workspace.WorkspaceError(400, "无效项目参数。")
    if action == "view":
        return project_view(scope)
    if scope == "global":
        raise workspace.WorkspaceError(403, "请选择明确的项目。")
    if action == "composer/references":
        return composer_references.candidates(scope, args)
    if action == "composer/reference":
        return composer_references.read(scope, args)
    if action == "composer/tasks":
        feature = args.get("featureId")
        if feature is not None and not isinstance(feature, str):
            raise workspace.WorkspaceError(400, "无效的 Bot 标识。")
        return bot_dispatches.reference_candidates(scope, workspace.text(args.get("query"), 600), feature,
                                                  limit=12 if args.get("expanded") is True else 4)
    if action == "bot_dispatches":
        return bot_dispatches.view(scope, summary=args.get("summary") is True)
    if action == "bot_canvas":
        return bot_dispatches.canvas(scope, args.get("featureId"))
    if action == "bot_source_record":
        return projects.source_record(scope, args.get("id"))
    if action == "bot_dispatch_detail":
        identity = args.get("id")
        if not isinstance(identity, str) or not bot_dispatches.IDENTITY.fullmatch(identity):
            raise workspace.WorkspaceError(400, "无效的 Bot 任务标识。")
        return bot_dispatches.view(scope, identity=identity)
    if action == "project_paradigms":
        return features.project_paradigms(scope)
    if action == "create_project_paradigm":
        return features.create_project_paradigm(scope, args)
    if action == "settings/view":
        return project_sources.settings(scope)
    if action == "settings/update":
        if not args or set(args) - {"name", "description", "topic"}:
            raise workspace.WorkspaceError(400, "无效的项目设置。")
        fields = {**args}
        if "name" in fields:
            fields["name"] = naming.display_name(fields["name"])
        projects.call("project_update", fields, scope)
        return project_sources.settings(scope)
    if action == "sources/save":
        return project_sources.save(scope, args)
    if action == "sources/remove":
        return project_sources.remove(scope, args.get("id"))
    if action == "sources/list":
        return project_sources.list_sources(scope)
    if action == "sources/directory":
        return project_sources.list_directory(scope, args.get("sourceId"), args.get("path"))
    if action == "sources/read":
        return project_sources.read_file(scope, args)
    if action in ("bot/experiments", "bot/experiment", "bot/artifact", "bot/experiment_dismiss"):
        return bot_activity.view(scope, action, args)
    if action == "navigation":
        feat_list = features.list_features("global", scope)
        return {
            "labels": {f["id"]: f["label"] for f in feat_list},
            "features": feat_list,
            "botSessionIds": [f["botSessionId"] for f in feat_list if f.get("botSessionId")],
            "plugins": project_plugins.list_for(scope),
        }
    if action == "bot_session":
        return features.bind_bot_session(scope, args.get("featureId"), args.get("sessionId"))
    if action in ("bot_assignments", "bot_assignment_write"):
        return features.assignments(scope,args.get("featureId"),args if action=="bot_assignment_write" else None)
    if action == "remove_feature_bot":
        return features.delete_feature(scope,args.get("featureId"))
    if action == "create_feature_bot":
        return features.create_feature(scope,args.get("label"),args.get("hint",""),symbol=args.get("symbol"),
                                       keywords=args.get("keywords"), request_id=project_plugins.request_id(args),
                                       paradigm=args.get("paradigm"), layout=args.get("layout"))
    if action == "bot_cluster":
        return features.cluster_bots(scope, args.get("targetId"), args.get("memberIds"))
    if action == "bot_restore":
        return features.set_bot_archived(scope, args.get("featureId"), archived=False)
    if action in ("feature_rename", "rename_feature"):
        return features.rename_feature(scope, args.get("featureId"), args.get("label"))
    if action in ("feature_update", "update_feature"):
        return features.update_feature(
            scope,
            args.get("featureId"),
            label=args.get("label"),
            hint=args.get("hint"),
            symbol=args.get("symbol"),
            keywords=args.get("keywords"),
        )
    if action == "feature_push":
        return projects.call("feature_push", args, scope)
    if action == "rename":
        return {"name": projects.call("project_update", {"name": naming.display_name(args.get("name"))}, scope)["name"]}
    if action == "description":
        return {"description": projects.call("project_update", {"description": args.get("description", "")}, scope).get("description", "")}
    if action in ("idea_create", "idea_update", "goal_create", "goal_update",
                  "memory_search", "memory_write", "memory_delete", "memory_pin", "memory_update",
                  "experiment_list", "experiment_record", "experiment_delete",
                  "benchmark_list", "benchmark_record", "benchmark_delete",
                  "paper_citations"):
        payload = {"source": "manual", **args} if action == "memory_write" else args
        return projects.call(action, payload, scope)
    if action == "entry_delete":
        return projects.delete_entry(scope, args.get("rail"), args.get("id"))
    if action == "dismiss_feed":
        return projects.dismiss_feed(scope, args)
    if action == "topic":
        projects.call("project_update", {"topic": args.get("topic")}, scope)
        return {"ok": True}
    if action == "auto_review":
        enabled = bool(args.get("enabled"))
        projects.mutate(scope, lambda item: item.update(autoReview=enabled))
        return {"autoReview": enabled}
    if action == "refresh_feed":
        return automation.run_now({"projectId": scope, "kind": "feed"})
    if action == "run_review":
        return automation.run_now({"projectId": scope, "kind": "review"})
    if action == "experiment_env":
        return workspace.create_experiment({"projectId": scope})
    if action == "link":
        url = workspace.safe_link(workspace.text(args.get("url"), 2000))
        if not url:
            raise workspace.WorkspaceError(400, "请输入 HTTP 或 HTTPS 链接。")
        return projects.create_entry(scope, "library", {"text": workspace.text(args.get("text"), 200) or url,
                                                        "kind": args.get("kind") or "link", "url": url})
    if action == "upload":
        uploaded = projects.upload({**args, "projectId": scope})
        fid = args.get("featureId")
        if fid and fid != "library" and fid != "chat" and features.is_valid_rail(scope, fid):
            linked = projects.create_entry(scope, fid, {
                "text": uploaded["text"],
                "libraryId": uploaded["id"],
                "path": uploaded.get("path"),
                "url": uploaded.get("url"),
                "kind": uploaded.get("kind", "file"),
                "category": "file",
                "source": "上传文件",
                **({"imageData": uploaded["image"]} if uploaded.get("image") else {}),
            })
            return {**uploaded, "linkedItem": linked}
        return uploaded
    if action == "clone":
        return projects.clone({**args, "projectId": scope})
    if action == "files/list":
        return projects.stored_files(scope)
    if action == "files/reference":
        page = args.get("page", 1)
        if type(page) is not int or page < 1:
            raise workspace.WorkspaceError(400, "文件页码无效。")
        return projects.read_stored_reference(scope, args.get("id"), page)
    if action == "files/download":
        return projects.download_stored_file(scope, args.get("id"))
    if action == "read":
        return projects.read_resource(scope, args.get("id"), args.get("page", 1))
    if action == "tasks":
        return [t for t in tasks.all_tasks() if t["projectId"] == scope]
    task_actions = {"task/approve": tasks.approve, "task/respond": tasks.respond, "task/cancel": tasks.cancel}
    if action in task_actions:
        if tasks.get(args.get("id"))["projectId"] != scope:
            raise workspace.WorkspaceError(404, "任务不存在。")
        return task_actions[action](args)
    if action in ("research/overview", "research/draft", "research/approve", "research/run", "research/pause",
                  "research/cancel", "research/accept", "research/log", "research/state", "research/review-evidence",
                  "research/plan", "research/evidence", "research/link"):
        return research_api.POST[action]({**args, "projectId": scope})
    tools_result = project_tools.handle(scope, action, args)
    if tools_result is not None:
        return tools_result
    raise workspace.WorkspaceError(404, "未知项目操作。")


def dispatch(route, data):
    if route == "assistant-audit":
        from assistant_audit import records
        return records()
    if route == "catalog":
        return catalog()
    if route == "bot-conversation-activity":
        scopes = data.get("projects")
        if not isinstance(scopes, list) or any(
            not isinstance(scope, str) or not re.fullmatch(r"proj_[A-Za-z0-9_-]{1,120}", scope) for scope in scopes
        ):
            raise ValueError
        return bot_dispatches.conversation_activity(scopes)
    if route == "name":
        store = naming.NamingStore()
        return {"name": store.rename_assistant(data["name"]) if "name" in data else store.assistant_name()}
    if route == "assistant-profile":
        return assistant_profile.update_profile(data) if data else assistant_profile.get_profile()
    if route == "assistant-permission":
        return assistant_profile.assistant_permission(data)
    if route == "assistant-model":
        return assistant_profile.assistant_model(data)
    if route == "create":
        item = projects.create_project(naming.display_name(data.get("name")), "proj_" + project_plugins.request_id(data),
                                       source_paths=data.get("sourcePaths"))
        return {"scope": item["id"]}
    if route == "plugin":
        return project_plugins.create(data.get("scope"), data, project_plugins.request_id(data))
    if route == "tools":
        return research_mcp.dispatch({"method": "tools/list", "id": 1}, "global")["result"]["tools"]
    if route not in ("bind", "delete", "delete-session", "project", "tool", "assignment-links",
                     "bot-complete", "bot-dispatch-start", "bot-dispatch-update", "bot-dispatch-draft",
                     "bot-dispatch-promote", "project-flow"):
        raise workspace.WorkspaceError(404, "未知接口。")
    record = data.get("workspace")
    if not isinstance(record, dict) or not all(isinstance(record.get(k), str) and record[k] for k in ("id", "path")):
        raise workspace.WorkspaceError(403, "工作区未绑定。")
    registry = bindings(record)
    if route == "bind":
        if data["scope"] == "global":
            registry.bind_global(PROFILE, record["id"])
        else:
            registry.bind(PROFILE, data["scope"], record["id"])
        return {"ok": True}
    resolved = registry.scope_for_workspace(PROFILE, record["id"])
    if route == "delete":
        if resolved.get("kind") != "project":
            raise workspace.WorkspaceError(403, "全局助手工作区不能删除。")
        projects.delete_project(resolved["projectId"], session_ids=data.get("sessionIds"))
        registry.unbind_project(PROFILE, resolved["projectId"])
        return {"ok": True}
    if route == "delete-session":
        session_cleanup.queue_session_deletions(data.get("sessionIds"))
        return {"ok": True}
    scope = resolved.get("projectId", "global")
    if route == "project-flow":
        if scope == "global":
            raise workspace.WorkspaceError(403, "项目事件需要明确的项目。")
        if data.get("action") == "read":
            return project_flow.read(scope, data.get("after"), data.get("audience"))
        if data.get("action") == "file-change":
            return project_flow.record_file_changes(scope, data)
        if data.get("action") == "file-changes":
            return project_flow.file_changes(scope, data.get("sessionId"))
        if data.get("action") in ("input", "decision"):
            return project_flow.write(scope, data)
        if data.get("action") == "retract":
            return project_flow.retract(scope, data)
        raise workspace.WorkspaceError(400, "项目事件操作无效。")
    if route in ("bot-dispatch-start", "bot-dispatch-update", "bot-dispatch-draft", "bot-dispatch-promote"):
        if scope == "global":
            raise workspace.WorkspaceError(403, "Bot 分派必须属于项目。")
        if route == "bot-dispatch-start":
            return bot_dispatches.start(scope, data.get("parentSessionId"), data.get("jobs"))
        if route == "bot-dispatch-draft":
            return bot_dispatches.publish_draft(scope, data.get("id"), data.get("args", {}))
        if route == "bot-dispatch-promote":
            return bot_dispatches.promote_drafts(scope, data.get("id"), data.get("parentSessionId"),
                                                 data.get("publishDraftIds"), final=data.get("final"))
        return bot_dispatches.update(scope, data.get("id"), data.get("status"), data.get("result", {}))
    if route == "bot-complete":
        fid, record = data.get("featureId"), data.get("recordId")
        if scope == "global" or not isinstance(fid, str) or not record:
            raise workspace.WorkspaceError(400, "需要具体项目的 Bot 交付记录。")
        item = projects.project(workspace.snapshot(), scope)
        if not any(entry["id"] == record for entry in item["rails"].get(fid, [])):
            raise workspace.WorkspaceError(404, "找不到该 Bot 的交付。")
        return features.set_bot_archived(scope, fid, archived=True)
    if route == "assignment-links" and scope != "global":
        return features.schedule_links(scope,data["featureId"],data.get("id"),data.get("remove",False))
    if route == "project":
        return project_action(scope, data)
    if route == "tool" and data.get("tool") == "experiment_record" and scope != "global" and data.get("featureId"):
        result = bot_activity.record(scope, data["featureId"], data.get("sessionId"), data.get("args", {}))
        return {"text": json.dumps(result, ensure_ascii=False)}
    result = research_mcp.dispatch({"method": "tools/call", "id": 1, "params": {
        "name": data.get("tool"), "arguments": data.get("args", {})}}, scope)["result"]
    if result.get("isError"):
        raise workspace.WorkspaceError(400, result["content"][0]["text"])
    return {"text": result["content"][0]["text"]}


class NativeHandler(BaseHTTPRequestHandler):
    def log_message(self, *args):
        pass

    def reply(self, code, data):
        body = json.dumps(data, ensure_ascii=False).encode()
        self.send_response(code)
        self.send_header("Content-Type", "application/json")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        auth = self.headers.get("Authorization", "")
        if (self.headers.get("Origin") or self.headers.get("Host") != f"127.0.0.1:{self.server.server_port}"
                or not auth.isascii() or not secrets.compare_digest(auth, "Bearer " + self.server.token)):
            return self.reply(403, {"error": "需要本机 Weave 宿主授权。"})
        try:
            size = int(self.headers.get("Content-Length", 0))
            if not 0 < size <= MAX_BODY:
                return self.reply(413, {"error": "请求大小超限。"})
            data = json.loads(self.rfile.read(size))
            if not isinstance(data, dict) or self.headers.get_content_type() != "application/json":
                raise ValueError
            if self.path == "/ready":
                self.server.ready.set()
                result = {"ok": True}
            else:
                result = dispatch(self.path.removeprefix("/"), data)
        except BindingError:
            return self.reply(403, {"error": "项目与原生工作区的绑定无效。"})
        except workspace.WorkspaceError as exc:
            return self.reply(exc.status, {"error": str(exc)})
        except (ValueError, KeyError, TypeError):
            return self.reply(400, {"error": "无效的请求。"})
        except (OSError, sqlite3.Error):
            return self.reply(500, {"error": "本机存储暂不可用。"})
        return self.reply(200, result)


def server(port=0):
    bot_dispatches.recover()
    httpd = ThreadingHTTPServer(("127.0.0.1", port), NativeHandler)
    httpd.token = secrets.token_urlsafe(32)
    httpd.ready = threading.Event()
    return httpd
