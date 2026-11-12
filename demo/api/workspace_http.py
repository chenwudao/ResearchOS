"""HTTP routes for the local workspace."""

import json
import re
from threading import RLock

WRITE_LOCK = RLock()
from urllib.parse import urlsplit

import automation
import workspace
import tasks
import project_service
import backup


POST = {
    "state": workspace.save,
    "resource/upload": project_service.upload,
    "resource/clone": project_service.clone,
    "resource/read": lambda data: project_service.read_resource(data.get("projectId"), data.get("id"), data.get("page", 1)),
    "project/tool": lambda data: project_service.call(data.get("tool"), data.get("args", {}), data.get("projectId")),
    "backup/create": backup.create,
    "backup/restore": backup.restore,
    "tasks/create": tasks.create,
    "tasks/respond": tasks.respond,
    "tasks/chat": tasks.chat_task,
    "tasks/approve": tasks.approve,
    "tasks/cancel": tasks.cancel,
    "chat": tasks.chat_task,
    "automation/run": automation.run_now,
    "feed": workspace.refresh_feed,
    "experiment": workspace.create_experiment,
    "pdf": workspace.save_pdf,
}


def send_file(handler, file, media="application/octet-stream"):
    if not file.is_file():
        raise workspace.WorkspaceError(404, "文件不存在。")
    handler.send_response(200)
    handler.send_header("Content-Type", media)
    handler.send_header("Content-Disposition", "attachment")
    handler.send_header("Content-Length", str(file.stat().st_size))
    handler.send_header("X-Content-Type-Options", "nosniff")
    handler.end_headers()
    with file.open("rb") as source:
        while chunk := source.read(65536):
            handler.wfile.write(chunk)


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
            resource = re.fullmatch(r"resource/file/([A-Za-z0-9_-]+)/([A-Za-z0-9_-]+)", name)
            if resource:
                return send_file(handler, project_service.resource_path(resource[1], resource[2]))
            archive = re.fullmatch(r"backup/file/([A-Za-z0-9_-]+\.zip)", name)
            if archive:
                return send_file(handler, backup.archive_path(archive[1]), "application/zip")
            if name == "backups":
                return handler._json(200, backup.available())
            if name == "tasks":
                return handler._json(200, tasks.all_tasks())
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
        if method == "POST" and name == "backup/import":
            length = int(handler.headers.get("Content-Length") or 0)
            if not 0 < length <= 100 * 1024 ** 2:
                raise workspace.WorkspaceError(413, "备份文件需小于 100 MiB。")
            identity = "import-" + workspace.uuid4().hex + ".zip"
            target = backup.archive_path(identity)
            target.write_bytes(handler.rfile.read(length))
            if not backup.zipfile.is_zipfile(target):
                target.unlink()
                raise workspace.WorkspaceError(400, "无效备份文件。")
            return handler._json(200, {"id": identity})
        if method == "POST" and name in POST:
            kind = "application/pdf" if name == "pdf" else "application/json"
            if handler.headers.get_content_type() != kind:
                raise workspace.WorkspaceError(415, "请求格式不受支持。")
            length = int(handler.headers.get("Content-Length") or 0)
            if not 0 < length <= (25 if name == "pdf" else 40) * 1024 ** 2:
                raise workspace.WorkspaceError(413, "请求为空或超过大小限制。")
            body = handler.rfile.read(length)
            data = body if name == "pdf" else json.loads(body)
            if name != "pdf" and not isinstance(data, dict):
                raise ValueError("expected object")
            with WRITE_LOCK:
                result = POST[name](data)
            return handler._json(200, result)
        raise workspace.WorkspaceError(404, "找不到该工作区资源。")
    except workspace.WorkspaceError as exc:
        return handler._json(exc.status, {"error": str(exc)})
    except (ValueError, UnicodeError, backup.zipfile.BadZipFile):
        return handler._json(400, {"error": "无效的请求。"})
    except (OSError, workspace.sqlite3.Error):
        return handler._json(500, {"error": "本地数据读写失败。"})
