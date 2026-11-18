"""Exercise the assistant-name endpoint with isolated workspace data."""

from email.message import Message
from http.server import ThreadingHTTPServer
from io import BytesIO
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
from threading import Thread
import unittest
from urllib.error import HTTPError
from urllib.request import Request, urlopen

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import workspace
import workspace_http
import main


class Handler:
    def __init__(self, body=None, origin=None):
        self.headers = Message()
        self.headers["Host"] = "127.0.0.1:8765"
        if origin:
            self.headers["Origin"] = origin
        encoded = json.dumps(body).encode() if body is not None else b""
        self.headers["Content-Type"] = "application/json"
        self.headers["Content-Length"] = str(len(encoded))
        self.rfile = BytesIO(encoded)
        self.result = None

    def _json(self, status, body):
        self.result = (status, body)


class AssistantNameHTTPTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.previous = workspace.DATA
        workspace.DATA = Path(self.temp.name)

    def tearDown(self):
        workspace.DATA = self.previous
        self.temp.cleanup()

    def test_default_rename_and_cross_origin_rejection(self):
        handler = Handler()
        workspace_http.serve(handler, "GET", "/api/workspace/assistant/name")
        self.assertEqual(handler.result, (200, {"name": "goat"}))
        handler = Handler({"name": "小助手"}, origin="http://127.0.0.1:8765")
        workspace_http.serve(handler, "POST", "/api/workspace/assistant/name")
        self.assertEqual(handler.result, (200, {"name": "小助手"}))
        handler = Handler({"name": "blocked"}, origin="https://example.invalid")
        workspace_http.serve(handler, "POST", "/api/workspace/assistant/name")
        self.assertEqual(handler.result[0], 403)
        handler = Handler()
        workspace_http.serve(handler, "GET", "/api/workspace/assistant/name")
        self.assertEqual(handler.result, (200, {"name": "小助手"}))

    def test_feature_rename_is_not_a_direct_http_operation(self):
        handler = Handler({"featureId": "feed", "label": "new"})
        workspace_http.serve(handler, "POST", "/api/workspace/feature/rename")
        self.assertEqual(handler.result[0], 404)

    def test_real_loopback_server_preserves_origin_checks(self):
        server = ThreadingHTTPServer(("127.0.0.1", 0), main.Handler)
        thread = Thread(target=server.serve_forever, daemon=True)
        thread.start()
        url = f"http://127.0.0.1:{server.server_port}/api/workspace/assistant/name"
        try:
            with urlopen(url, timeout=5) as response:
                self.assertEqual(json.load(response), {"name": "goat"})
            payload = json.dumps({"name": "新助手"}).encode()
            request = Request(url, data=payload, method="POST", headers={
                "Content-Type": "application/json", "Origin": f"http://127.0.0.1:{server.server_port}"})
            with urlopen(request, timeout=5) as response:
                self.assertEqual(json.load(response), {"name": "新助手"})
            request = Request(url, data=payload, method="POST", headers={
                "Content-Type": "application/json", "Origin": "https://example.invalid"})
            with self.assertRaises(HTTPError) as raised:
                urlopen(request, timeout=5)
            self.assertEqual(raised.exception.code, 403)
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)


if __name__ == "__main__":
    unittest.main()
