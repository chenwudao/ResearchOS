"""Private, per-task MCP HTTP transport for Windows DSH workers."""
from contextlib import contextmanager
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import secrets
from tempfile import TemporaryDirectory
import threading

import research_mcp
import workspace


MAX_REQUEST_BYTES = 1024 * 1024


class _Server(ThreadingHTTPServer):
    daemon_threads = True

    def __init__(self, scope, token, bot_binding):
        self.scope = scope
        self.token = token
        self.bot_binding = bot_binding
        super().__init__(("127.0.0.1", 0), _Handler)

    def handle_error(self, request, client_address):
        # Do not print request headers or transport details from this private bridge.
        pass


class _Handler(BaseHTTPRequestHandler):
    def log_message(self, _format, *args):
        # Requests contain a per-task bearer token and must never be logged.
        pass

    def _send(self, status, body=b"", content_type=None):
        self.send_response(status)
        if content_type:
            self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("X-Content-Type-Options", "nosniff")
        self.end_headers()
        if body:
            self.wfile.write(body)

    def _authorized(self):
        expected_host = f"127.0.0.1:{self.server.server_port}"
        origin = self.headers.get("Origin")
        authorization = self.headers.get("Authorization", "")
        return (self.path == "/mcp" and self.headers.get("Host") == expected_host
                and (not origin or origin == f"http://{expected_host}")
                and authorization.isascii()
                and secrets.compare_digest(authorization, "Bearer " + self.server.token))

    def do_GET(self):
        self._send(405 if self._authorized() else 403)

    def do_POST(self):
        if not self._authorized():
            self._send(403)
            return
        try:
            length = int(self.headers.get("Content-Length", "0"))
            if length <= 0 or length > MAX_REQUEST_BYTES:
                self._send(413)
                return
            request = json.loads(self.rfile.read(length))
            if not isinstance(request, dict):
                self._send(400)
                return
        except (ValueError, UnicodeError, json.JSONDecodeError):
            self._send(400)
            return
        response = research_mcp.dispatch(request, self.server.scope, protocol_version="2025-03-26",
                                         bot_binding=self.server.bot_binding)
        if response is None:
            self._send(202)
        else:
            body = json.dumps(response, ensure_ascii=True).replace(self.server.token, "[redacted]")
            self._send(200, body.encode("utf-8"), "application/json")


@contextmanager
def private_bridge(data_path, scope, token, *, bot_binding=None):
    """Run a scope-bound server only for the lifetime of its DSH worker."""
    workspace.DATA = Path(data_path)
    server = _Server(scope, token, bot_binding)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{server.server_port}/mcp"
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=5)


@contextmanager
def prepare_windows_config(config, redactions):
    """Replace the known stdio MCP patch with a private local HTTP transport."""
    if os.name != "nt":
        yield config
        return
    patches = list(config.get("patches") or [])
    matches = []
    for index, filename in enumerate(patches):
        try:
            patch = json.loads(Path(filename).read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeError):
            continue
        if not isinstance(patch, list):
            continue
        for group in patch:
            if isinstance(group, dict) and isinstance(group.get("insert"), list):
                for item in group["insert"]:
                    if isinstance(item, dict) and item.get("id") == "researchos-mcp":
                        matches.append((index, patch, item))
    if len(matches) != 1:
        raise ValueError("Invalid project MCP configuration")
    index, patch, item = matches[0]
    original = item.get("config", {})
    args = original.get("args")
    expected = Path(__file__).with_name("research_mcp.py").resolve()
    if (item.get("name") != "@deepseek-ai/dsh-mcp-client"
            or original.get("transport") != "stdio" or original.get("serverName") != "researchos"
            or original.get("failOnStartupError") is not True
            or not isinstance(args, list) or len(args) not in (3, 5) or not all(isinstance(arg, str) and arg for arg in args)
            or Path(args[0]).resolve() != expected):
        raise ValueError("Invalid project MCP configuration")
    token = secrets.token_urlsafe(32)
    redactions.add(token)
    private_root = Path.home() / ".labweave" / "run"
    private_root.mkdir(mode=0o700, parents=True, exist_ok=True)
    with TemporaryDirectory(prefix="mcp-", dir=private_root) as directory:
        with private_bridge(args[1], args[2], token, bot_binding=tuple(args[3:]) or None) as url:
            new_config = {key: value for key, value in original.items()
                          if key not in ("transport", "command", "args", "env", "cwd")}
            placeholder = "__LABWEAVE_AUTH_" + secrets.token_hex(16) + "__"
            new_config.update(transport="streamable-http", url=url,
                              headers={"Authorization": placeholder})
            item["config"] = new_config
            # The patch holds an environment reference, never the bearer token.
            # This remains safe if a forced worker termination skips cleanup.
            encoded = json.dumps(patch)
            marker = json.dumps(placeholder)
            if encoded.count(marker) != 1:
                raise ValueError("Invalid project MCP configuration")
            encoded = encoded.replace(marker, '!!js "process.env.LABWEAVE_MCP_TOKEN"')
            patch_path = Path(directory) / "patch.yml"
            patch_path.write_text(encoded, encoding="utf-8")
            patches[index] = str(patch_path)
            env = dict(config.get("env") or {})
            # DSH removes TOKEN-shaped names when launching model tools.
            env["LABWEAVE_MCP_TOKEN"] = "Bearer " + token
            updated = dict(config, patches=patches, env=env)
            updated["initialize_timeout_seconds"] = max(90.0, float(config.get("initialize_timeout_seconds", 30.0)))
            yield updated
