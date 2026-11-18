"""Validate feature creation via both real DSH chats in disposable projects."""
import json
from pathlib import Path
import subprocess
import sys
from http.cookiejar import CookieJar
from tempfile import TemporaryDirectory
from urllib.parse import urlsplit
from urllib.request import HTTPCookieProcessor, ProxyHandler, Request, build_opener

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as launcher
import naming
import project_service


def main():
    previous = launcher.workspace.DATA
    try:
        with TemporaryDirectory(prefix="labweave-feature-chats-") as directory:
            root = Path(directory)
            launcher.workspace.DATA = root / "data"
            alpha = project_service.create_project("文献梳理")
            beta = project_service.create_project("方法复现")
            shared = "--shared" in sys.argv[1:]
            proof = root / "shared-proof.json"
            with launcher.native_services(0, home=root / "host", configured=True, background=False) as (url, _):
                payload = {"url": url, "alpha": alpha["id"], "beta": beta["id"],
                           "assistant": naming.NamingStore().assistant_name(), "browser": str(root / "browser"),
                           "shared": shared, "form": "--form" in sys.argv[1:], "assign": "--assign" in sys.argv[1:],
                           "messaging": "--messaging" in sys.argv[1:], "proof": str(proof)}
                subprocess.run(["node", str(ROOT / "tests/integration_feature_chats.cjs")], cwd=ROOT,
                               input=json.dumps(payload), text=True, check=True, timeout=540)
            if shared:
                expected = json.loads(proof.read_text(encoding="utf-8"))
                with launcher.native_services(0, home=root / "host", configured=False, background=False) as (url, _):
                    http = build_opener(ProxyHandler({}), HTTPCookieProcessor(CookieJar()))
                    with http.open(url, timeout=15):
                        pass
                    base = "http://" + urlsplit(url).netloc + "/api/labweave/"
                    for key in ("a", "b"):
                        body = json.dumps({"workspaceId": expected[key], "action": "view"}).encode()
                        req = Request(base+"workspace-page", data=body, headers={"Content-Type": "application/json"})
                        with http.open(req, timeout=15) as response:
                            view = json.load(response)
                        ids = {f["id"] for f in view["features"]}
                        assert expected["sharedId"] in ids
                        assert (expected["localId"] in ids) == (key == "a")
                        records = view["rails"][expected["sharedId"]]
                        assert any("核对本周取样" in r["text"] for r in records) == (key == "a")
                print("重启后共享功能 ID、项目专属功能和彼此独立的记录仍可读取。", flush=True)
    finally:
        launcher.workspace.DATA = previous


if __name__ == "__main__":
    main()
