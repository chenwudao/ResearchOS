"""Check the actual HTTP shell, including responses generated before client JS."""
from contextlib import closing
from http.client import HTTPConnection
import os
from pathlib import Path
import socket
import sys
from tempfile import TemporaryDirectory
from unittest import TestCase, main, skipUnless
from unittest.mock import patch
from urllib.parse import urlsplit

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher


class ShellBrandTest(TestCase):
    @skipUnless(os.name == "posix", "POSIX Web listener restart")
    def test_restart_on_recently_used_port(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix="weave-restart-")))
        self.enterContext(patch.object(native_launcher.workspace, "DATA", root / "data"))
        with socket.socket() as old_server:
            old_server.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
            old_server.bind(("127.0.0.1", 0))
            port = old_server.getsockname()[1]
            old_server.listen()
            with self.assertRaisesRegex(RuntimeError, "已被占用"):
                with native_launcher.native_services(port, home=root / "web", configured=False, background=False):
                    self.fail("An active listener must keep its port")
            with socket.create_connection(("127.0.0.1", port), timeout=3) as client:
                peer, _ = old_server.accept()
                peer.close()
                self.assertEqual(client.recv(1), b"")
        with native_launcher.native_services(port, home=root / "web", configured=False, background=False) as (url, _):
            self.assertEqual(urlsplit(url).port, port)

    def test_native_index_and_authentication(self):
        root = Path(self.enterContext(TemporaryDirectory(prefix="weave-shell-")))
        self.enterContext(patch.object(native_launcher.workspace, "DATA", root / "data"))
        login_url, _ = self.enterContext(native_launcher.native_services(
            0, home=root / "web", configured=False, background=False,
        ))
        url = urlsplit(login_url)
        client = self.enterContext(closing(HTTPConnection(url.hostname, url.port, timeout=10)))

        def request(method, target, headers=None):
            client.request(method, target, headers=headers or {})
            response = client.getresponse()
            return response, response.read().decode()

        for target in ("/", "/index.html", "/?token=invalid-session"):
            denied, message = request("GET", target)
            self.assertEqual(denied.status, 401)
            self.assertEqual(denied.getheader("Cache-Control"), "no-store")
            self.assertIsNone(denied.getheader("Set-Cookie"))
            self.assertIn("Weave", message)
            self.assertNotRegex(message, r"(?i)DeepSeek Harness|LabWeave|\bdsh\b")
        head, body = request("HEAD", "/")
        self.assertEqual((head.status, body), (401, ""))
        for language, expected in [
            ("zh-CN", "登录链接"), ("en-GB", "login link"), ("ja", "ログイン"),
            ("es", "acceso"), ("fr", "connexion"), ("de", "Anmeldelink"),
            ("ru", "входа"), ("pt-BR", "acesso"), ("ko", "login link"),
            ("en;q=0,fr;q=0.9,de;q=1", "Anmeldelink"),
        ]:
            denied, message = request("GET", "/", {"Accept-Language": language})
            self.assertEqual(denied.status, 401)
            self.assertIn(expected, message)

        login, _ = request("GET", url.path + "?" + url.query)
        self.assertEqual(login.status, 303)
        self.assertEqual(login.getheader("Location"), "./")
        cookie = login.getheader("Set-Cookie")
        self.assertTrue(cookie and "HttpOnly" in cookie)
        page, html = request("GET", "/", {"Cookie": cookie.split(";", 1)[0]})
        self.assertEqual(page.status, 200)
        self.assertIn("<title>Weave</title>", html)
        self.assertIn('name="apple-mobile-web-app-title" content="Weave"', html)
        for path in ("/favicon.svg", "/favicon-dark.svg", "/weave-orbit.svg", "/labweave-orbit.svg"):
            icon, svg = request("GET", path)
            self.assertEqual(icon.status, 200)
            self.assertIn('<title id="title">Weave</title>', svg)


if __name__ == "__main__":
    main()
