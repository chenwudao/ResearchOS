"""Private business API for the DSH owner plugin. The launcher owns the bearer."""
from contextlib import closing
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import re
import secrets
import sqlite3
import threading

import automation
from dsh_workspace_map import BindingError, WorkspaceBindings
import naming
import project_service as projects
import project_plugins
import research_api
import research_mcp
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
    rows = [{"scope": "global", "name": naming.NamingStore().assistant_name(), "path": str(global_directory())}]
    for item in saved.get("state", {}).get("projects", []):
        identity = item["id"]
        if not re.fullmatch(r"proj_[A-Za-z0-9_-]{1,120}", identity):
            continue
        path = root / identity
        if path.is_symlink() or path.is_junction():
            continue
        path.mkdir(exist_ok=True)
        rows.append({"scope": identity, "name": item["name"], "path": str(path)})
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
    labels = naming.NamingStore().feature_labels(scope)
    if scope == "global":
        return {"scope": scope, "name": naming.NamingStore().assistant_name()}
    item = projects.project(workspace.snapshot(), scope)
    feed = automation.public_jobs().get(scope, {}).get("feed", {})
    hidden = set(item.get("dismissedFeed", []))
    rails = dict(item["rails"])
    rails["feed"] = [*rails["feed"], *(e for e in feed.get("items", []) if (e.get("url") or e["text"]) not in hidden)]
    return {"scope": scope, "name": item["name"], "topic": item.get("topic", ""), "labels": labels,
            "rails": rails, "plugins": project_plugins.list_for(scope)}


def project_action(scope, data):
    action, args = data.get("action"), data.get("args", {})
    if not isinstance(args, dict) or "projectId" in args:
        raise workspace.WorkspaceError(400, "无效项目参数。")
    if action == "view":
        return project_view(scope)
    if scope == "global":
        raise workspace.WorkspaceError(403, "请选择明确的科研项目。")
    if action == "navigation":
        return {"labels": naming.NamingStore().feature_labels(scope), "plugins": project_plugins.list_for(scope)}
    if action == "rename":
        return {"name": projects.call("project_update", {"name": naming.display_name(args.get("name"))}, scope)["name"]}
    if action in ("idea_create", "idea_update", "goal_create", "goal_update"):
        return projects.call(action, args, scope)
    if action == "topic":
        projects.call("project_update", {"topic": args.get("topic")}, scope)
        return {"ok": True}
    if action == "refresh_feed":
        return automation.run_now({"projectId": scope, "kind": "feed"})
    if action == "link":
        url = workspace.safe_link(workspace.text(args.get("url"), 2000))
        if not url:
            raise workspace.WorkspaceError(400, "请输入 HTTP 或 HTTPS 链接。")
        return projects.create_entry(scope, "library", {"text": workspace.text(args.get("text"), 200) or url,
                                                        "kind": "link", "url": url})
    if action in ("upload", "clone"):
        return (projects.upload if action == "upload" else projects.clone)({**args, "projectId": scope})
    if action == "read":
        return projects.read_resource(scope, args.get("id"), args.get("page", 1))
    if action == "tasks":
        return [t for t in tasks.all_tasks() if t["projectId"] == scope]
    task_actions = {"task/approve": tasks.approve, "task/respond": tasks.respond, "task/cancel": tasks.cancel}
    if action in task_actions:
        if tasks.get(args.get("id"))["projectId"] != scope:
            raise workspace.WorkspaceError(404, "任务不存在。")
        return task_actions[action](args)
    if action in ("research/overview", "research/example", "research/draft", "research/approve", "research/run", "research/pause",
                  "research/cancel", "research/accept", "research/log", "research/state", "research/review-evidence"):
        return research_api.POST[action]({**args, "projectId": scope})
    raise workspace.WorkspaceError(404, "未知项目操作。")


def dispatch(route, data):
    if route == "catalog":
        return catalog()
    if route == "name":
        store = naming.NamingStore()
        return {"name": store.rename_assistant(data["name"]) if "name" in data else store.assistant_name()}
    if route == "create":
        item = projects.create_project(naming.display_name(data.get("name")), "proj_" + project_plugins.request_id(data))
        return {"scope": item["id"]}
    if route == "plugin":
        return project_plugins.create(data.get("scope"), data, project_plugins.request_id(data))
    if route == "tools":
        return research_mcp.dispatch({"method": "tools/list", "id": 1}, "global")["result"]["tools"]
    if route not in ("bind", "project", "tool"):
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
    scope = resolved.get("projectId", "global")
    if route == "project":
        return project_action(scope, data)
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
            return self.reply(403, {"error": "需要本机 DSH 宿主授权。"})
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
    httpd = ThreadingHTTPServer(("127.0.0.1", port), NativeHandler)
    httpd.token = secrets.token_urlsafe(32)
    httpd.ready = threading.Event()
    return httpd
