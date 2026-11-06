"""ResearchOS → DeepSeek Harness (dsh web) bridge helpers.

Auth model (DSH):
  - Each `dsh web` process prints a one-shot-per-process launch URL:
      http://127.0.0.1:3080/?token=...
  - Only GET /?token=... exchanges that process token for an HttpOnly
    SameSite=Strict cookie. The token is NOT accepted on /api/* or
    Authorization headers.
  - Therefore a cross-origin shell on :8765 cannot silently use the
    browser cookie; the workable first bridge is:
      1) status probe of :3080
      2) redirect the user's browser through the launch URL (/api/dsh/open)
      3) optional prompt handoff file the user can paste in DSH
  - Full session RPC rides an authenticated WebSocket at /api/remote.mux
    (typert); wiring that end-to-end is a later cut.

Secrets live in demo/.local/dsh-bridge.json (mode 0600). Never return the
raw launch token in JSON API bodies — only redirect through /api/dsh/open.
"""
from __future__ import annotations

import json
import urllib.error
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import Any

ROOT = Path(__file__).resolve().parent.parent
LOCAL = ROOT / ".local"
BRIDGE_PATH = LOCAL / "dsh-bridge.json"
HANDOFF_PATH = LOCAL / "dsh-handoff.json"
DEFAULT_BASE = "http://127.0.0.1:3080"


def _now() -> str:
    return datetime.now().isoformat(timespec="seconds")


def ensure_local() -> None:
    LOCAL.mkdir(parents=True, exist_ok=True)
    try:
        LOCAL.chmod(0o700)
    except OSError:
        pass


def load_bridge() -> dict[str, Any]:
    ensure_local()
    if not BRIDGE_PATH.is_file():
        return {"base": DEFAULT_BASE, "launch_url": "", "cookies": {}}
    try:
        data = json.loads(BRIDGE_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"base": DEFAULT_BASE, "launch_url": "", "cookies": {}}
    if not isinstance(data, dict):
        return {"base": DEFAULT_BASE, "launch_url": "", "cookies": {}}
    data.setdefault("base", DEFAULT_BASE)
    data.setdefault("launch_url", "")
    data.setdefault("cookies", {})
    return data


def save_bridge(data: dict[str, Any]) -> None:
    ensure_local()
    data = dict(data)
    data["updated_at"] = _now()
    BRIDGE_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        BRIDGE_PATH.chmod(0o600)
    except OSError:
        pass


def set_launch_url(url: str) -> dict[str, Any]:
    url = (url or "").strip()
    data = load_bridge()
    if url:
        if "://127.0.0.1:3080/" not in url and "://localhost:3080/" not in url:
            raise ValueError("launch_url must point at local dsh web on :3080")
        if "token=" not in url:
            raise ValueError("launch_url must include ?token= from `dsh web` stdout")
        data["launch_url"] = url
        # Prefer 127.0.0.1 authority for cookie binding consistency.
        data["base"] = "http://127.0.0.1:3080"
    else:
        data["launch_url"] = ""
    save_bridge(data)
    return public_status()


def _probe(base: str, path: str = "/", cookie_header: str = "") -> dict[str, Any]:
    url = base.rstrip("/") + path
    req = urllib.request.Request(url, method="GET")
    req.add_header("Host", "127.0.0.1:3080")
    req.add_header("Accept", "*/*")
    if cookie_header:
        req.add_header("Cookie", cookie_header)
    try:
        with urllib.request.urlopen(req, timeout=2.5) as resp:
            body = resp.read(80)
            return {
                "ok": True,
                "http_status": getattr(resp, "status", 200),
                "content_type": resp.headers.get("Content-Type", ""),
                "body_prefix": body[:40].decode("utf-8", "replace"),
            }
    except urllib.error.HTTPError as e:
        body = e.read(120) if hasattr(e, "read") else b""
        return {
            "ok": False,
            "http_status": e.code,
            "content_type": e.headers.get("Content-Type", "") if e.headers else "",
            "body_prefix": body[:80].decode("utf-8", "replace"),
        }
    except Exception as e:  # noqa: BLE001 — surface probe failures to API
        return {"ok": False, "error": type(e).__name__, "detail": str(e)[:160]}


def cookie_header(data: dict[str, Any] | None = None) -> str:
    data = data or load_bridge()
    cookies = data.get("cookies") or {}
    if not isinstance(cookies, dict):
        return ""
    return "; ".join(f"{k}={v}" for k, v in cookies.items() if k and v)


def public_status() -> dict[str, Any]:
    data = load_bridge()
    base = data.get("base") or DEFAULT_BASE
    unauth = _probe(base, "/")
    cookie = cookie_header(data)
    authed = _probe(base, "/", cookie) if cookie else None
    launch = data.get("launch_url") or ""
    handoff = None
    if HANDOFF_PATH.is_file():
        try:
            handoff = json.loads(HANDOFF_PATH.read_text(encoding="utf-8"))
        except (OSError, json.JSONDecodeError):
            handoff = {"ok": False, "error": "unreadable"}
    listening = bool(unauth.get("http_status") in (200, 401, 303)) or bool(unauth.get("ok"))
    # 401 without cookie still means the process is up.
    if unauth.get("http_status") == 401:
        listening = True
    return {
        "ok": True,
        "bridge": "researchos-dsh",
        "dsh_base": base,
        "listening": listening,
        "unauthenticated_probe": {
            "http_status": unauth.get("http_status"),
            "ok": unauth.get("ok"),
            "error": unauth.get("error"),
        },
        "has_launch_token": bool(launch and "token=" in launch),
        "has_server_cookie": bool(cookie),
        "server_cookie_valid": bool(
            authed and authed.get("http_status") == 200 and "html" in (authed.get("content_type") or "")
        ),
        "open_path": "/api/dsh/open",
        "handoff_path": "/api/dsh/handoff",
        "handoff_pending": bool(handoff and handoff.get("prompt")),
        "handoff_preview": (handoff or {}).get("preview"),
        "session_rpc": {
            "transport": "websocket",
            "path": "/api/remote.mux",
            "note": "Requires browser cookie (SameSite=Strict). Full typért session RPC is next cut.",
        },
        "storage": {
            "dsh_home": "~/.dsh",
            "sessions_expected": "~/.dsh/sessions/ (created after real chats)",
            "bridge_state": str(BRIDGE_PATH.relative_to(ROOT)),
        },
        "how_to": [
            "Keep `dsh web` on :3080 (jerry). Keep ResearchOS on :8765.",
            "If open fails with auth required, paste the printed `dsh web: http://127.0.0.1:3080/?token=...` into POST /api/dsh/launch-url.",
            "Click DSH in the shell (or GET /api/dsh/open) once so THIS browser receives the DSH cookie.",
            "Model replies still need a DeepSeek API key inside DSH Settings → Models.",
        ],
    }


def resolve_open_url() -> str:
    data = load_bridge()
    launch = (data.get("launch_url") or "").strip()
    if launch:
        return launch
    return (data.get("base") or DEFAULT_BASE).rstrip("/") + "/"


def save_handoff(prompt: str, meta: dict[str, Any] | None = None) -> dict[str, Any]:
    ensure_local()
    prompt = (prompt or "").strip()
    payload = {
        "ok": True,
        "prompt": prompt,
        "preview": (prompt[:120] + ("…" if len(prompt) > 120 else "")),
        "meta": meta or {},
        "created_at": _now(),
        "instruction": "Open DSH via /api/dsh/open, then paste this prompt into the DSH composer (full RPC handoff is next cut).",
    }
    HANDOFF_PATH.write_text(json.dumps(payload, ensure_ascii=False, indent=2), encoding="utf-8")
    try:
        HANDOFF_PATH.chmod(0o600)
    except OSError:
        pass
    return {
        "ok": True,
        "preview": payload["preview"],
        "open_path": "/api/dsh/open",
        "chars": len(prompt),
    }


def read_handoff() -> dict[str, Any]:
    if not HANDOFF_PATH.is_file():
        return {"ok": True, "prompt": "", "pending": False}
    try:
        data = json.loads(HANDOFF_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return {"ok": False, "error": "unreadable handoff"}
    return {
        "ok": True,
        "pending": bool(data.get("prompt")),
        "prompt": data.get("prompt") or "",
        "preview": data.get("preview") or "",
        "created_at": data.get("created_at"),
        "instruction": data.get("instruction"),
    }
