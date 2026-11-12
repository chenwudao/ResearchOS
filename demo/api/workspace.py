"""Local workspace persistence and integrations for the ResearchOS interface."""

from contextlib import closing
from datetime import date, timedelta
import json
import project_store
import os
from pathlib import Path
import re
import sqlite3
from subprocess import CalledProcessError
from threading import Lock
import venv
from urllib.error import HTTPError, URLError
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen
from uuid import uuid4
from xml.etree import ElementTree


DATA = Path(__file__).resolve().parents[1] / ".local"
MODEL = "deepseek-flash"
RAILS = {"ideas", "feed", "goals", "library"}
ENVIRONMENT_LOCK = Lock()


class WorkspaceError(Exception):
    def __init__(self, status, message):
        super().__init__(message)
        self.status = status


def database():
    DATA.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DATA / "workspace.sqlite3")
    db.execute("""CREATE TABLE IF NOT EXISTS workspace (
        id INTEGER PRIMARY KEY CHECK (id = 1),
        revision INTEGER NOT NULL,
        snapshot TEXT NOT NULL
    )""")
    project_store.initialize(db)
    return db


def snapshot():
    with closing(database()) as db:
        db.execute("BEGIN")
        row = db.execute("SELECT revision, snapshot FROM workspace").fetchone()
        if not row:
            return {"revision": 0}
        value = json.loads(row[1])
        value["state"] = project_store.read(db, value["state"])
        return {"revision": row[0], **value}


def save(payload):
    revision = payload.get("revision")
    state = payload.get("state")
    settings = payload.get("settings")
    if (type(revision) is not int or revision < 0 or not isinstance(state, dict)
            or state.get("version") != 2 or not isinstance(settings, dict)):
        raise WorkspaceError(400, "无效的工作区数据。")
    encoded = json.dumps({"state": {**state, "projects": []}, "settings": settings}, ensure_ascii=False)
    with closing(database()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        row = db.execute("SELECT revision FROM workspace").fetchone()
        if revision != (row[0] if row else 0):
            raise WorkspaceError(409, "其他标签页已保存更新。请复制未保存内容后刷新页面。")
        project_store.write(db, state)
        db.execute("INSERT OR REPLACE INTO workspace VALUES (1, ?, ?)",
                   (revision + 1, encoded))
    return {"revision": revision + 1}


def text(value, limit):
    return value.strip()[:limit] if isinstance(value, str) else ""


def deepseek_key():
    key = os.environ.get("DEEPSEEK_API_KEY", "").strip()
    if key:
        return key
    try:
        return (DATA / "deepseek.key").read_text(encoding="utf-8").strip()
    except FileNotFoundError:
        return ""


def fetch_source(url):
    request = Request(url, headers={"User-Agent": "ResearchOS/1.0"})
    with urlopen(request, timeout=12) as response:
        return response.read(2_000_000)


def safe_link(url):
    return url if isinstance(url, str) and urlsplit(url).scheme in ("http", "https") else ""


def recent_papers(topic):
    query = urlencode({"query.bibliographic": topic, "rows": 8,
                       "filter": f"from-pub-date:{date.today() - timedelta(days=365)}"})
    results = json.loads(fetch_source("https://api.crossref.org/works?" + query))
    for paper in results["message"]["items"]:
        title = (paper.get("title") or [""])[0]
        published = (paper.get("published", {}).get("date-parts") or [[]])[0]
        if title:
            yield {"text": title, "url": safe_link(paper.get("URL")),
                   "published": "-".join(f"{part:02d}" for part in published),
                   "source": "Crossref", "kind": "paper"}


def recent_news(topic):
    query = urlencode({"q": f"{topic} when:30d", "hl": "zh-CN", "gl": "CN", "ceid": "CN:zh-Hans"})
    feed = ElementTree.fromstring(fetch_source("https://news.google.com/rss/search?" + query))
    for item in feed.findall("./channel/item")[:8]:
        title = item.findtext("title", "")
        if title:
            yield {"text": title, "url": safe_link(item.findtext("link", "")),
                   "published": item.findtext("pubDate", ""),
                   "source": item.findtext("source", "Google News"), "kind": "news"}


def recent_repositories(topic):
    query = urlencode({"q": f"{topic} archived:false", "sort": "updated", "per_page": 5})
    result = json.loads(fetch_source("https://api.github.com/search/repositories?" + query))
    for repository in result["items"]:
        name = repository.get("full_name")
        if name:
            yield {"text": name, "url": safe_link(repository.get("html_url")),
                   "published": (repository.get("pushed_at") or "")[:10],
                   "source": "GitHub", "kind": "repository"}


def refresh_feed(payload):
    topic = text(payload.get("topic"), 150)
    if not topic:
        raise WorkspaceError(400, "请输入项目关注主题。")
    items, unavailable = [], []
    sources = {"Crossref": recent_papers, "Google News": recent_news, "GitHub": recent_repositories}
    for name, fetch in sources.items():
        try:
            items.extend(list(fetch(topic)))
        except (OSError, ValueError, KeyError, TypeError, ElementTree.ParseError):
            unavailable.append(name)
    if len(unavailable) == len(sources):
        raise WorkspaceError(502, "论文、新闻和仓库数据源暂时不可用。")
    return {"items": items, "unavailable": unavailable}


def save_pdf(body):
    if not body.startswith(b"%PDF-"):
        raise WorkspaceError(400, "请选择有效的 PDF 文件。")
    folder = DATA / "pdf"
    folder.mkdir(parents=True, exist_ok=True)
    name = uuid4().hex + ".pdf"
    (folder / name).write_bytes(body)
    return {"url": "/api/workspace/pdf/" + name}


def create_experiment(payload):
    project = text(payload.get("projectId"), 100)
    if not re.fullmatch(r"proj_[a-z0-9]+", project):
        raise WorkspaceError(400, "无效的项目标识。")
    import project_service
    folder = project_service.folder(project) / "experiments"
    folder.mkdir(parents=True, exist_ok=True)
    environment = folder / ".venv"
    interpreter = environment / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
    with ENVIRONMENT_LOCK:
        pip = interpreter.with_name("pip.exe" if os.name == "nt" else "pip")
        if not interpreter.is_file() or not pip.is_file() or not (environment / "pyvenv.cfg").is_file():
            try:
                venv.create(environment, with_pip=True)
            except (OSError, ValueError, CalledProcessError) as exc:
                raise WorkspaceError(500, "无法创建虚拟环境。") from exc
    return {"path": str(folder), "venv": str(environment), "python": str(interpreter)}
