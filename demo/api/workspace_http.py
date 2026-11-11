"""HTTP routes for the local workspace."""

import json
import re
from urllib.parse import urlsplit

import automation
import workspace


POST = {
    "state": workspace.save,
    "chat": workspace.chat,
    "automation/run": automation.run_now,
    "feed": workspace.refresh_feed,
    "experiment": workspace.create_experiment,
    "pdf": workspace.save_pdf,
}


def serve(handler, method, path):
    name = path.removeprefix("/api/workspace/")
    try:
        origin = handler.headers.get("Origin")
        host = handler.headers.get("Host", "")
        if host.split(":")[0] not in ("localhost", "127.0.0.1"):
            raise workspace.WorkspaceError(403, "仅允许本机访问。")
        if origin and urlsplit(origin).netloc != host:
            raise workspace.WorkspaceError(403, "仅允许同源访问。")
        if method == "GET":
            if name == "state":
                return handler._json(200, workspace.snapshot())
            if name == "automation":
                return handler._json(200, automation.public_jobs())
            if name == "status":
                return handler._json(200, {
                    "configured": bool(workspace.deepseek_key()),
                    "model": workspace.MODEL,
                })
            match = re.fullmatch(r"pdf/([a-f0-9]{32}\.pdf)", name)
            if match:
                file = workspace.DATA / "pdf" / match[1]
                if file.is_file():
                    body = file.read_bytes()
                    handler.send_response(200)
                    handler.send_header("Content-Type", "application/pdf")
                    handler.send_header("Content-Disposition", "attachment")
                    handler.send_header("X-Content-Type-Options", "nosniff")
                    handler.send_header("Content-Length", str(len(body)))
                    handler.end_headers()
                    return handler.wfile.write(body)
        if method == "POST" and name in POST:
            kind = "application/pdf" if name == "pdf" else "application/json"
            if handler.headers.get_content_type() != kind:
                raise workspace.WorkspaceError(415, "请求格式不受支持。")
            length = int(handler.headers.get("Content-Length") or 0)
            if not 0 < length <= (25 if name == "pdf" else 10) * 1024 ** 2:
                raise workspace.WorkspaceError(413, "请求为空或超过大小限制。")
            body = handler.rfile.read(length)
            data = body if name == "pdf" else json.loads(body)
            if name != "pdf" and not isinstance(data, dict):
                raise ValueError("expected object")
            return handler._json(200, POST[name](data))
        raise workspace.WorkspaceError(404, "找不到该工作区资源。")
    except workspace.WorkspaceError as exc:
        return handler._json(exc.status, {"error": str(exc)})
    except (ValueError, UnicodeError):
        return handler._json(400, {"error": "无效的请求。"})
    except (OSError, workspace.sqlite3.Error):
        return handler._json(500, {"error": "本地数据读写失败。"})
