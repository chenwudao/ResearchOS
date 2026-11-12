"""Versioned relational projection of the backward-compatible workspace API."""
import json

KINDS = ("ideas", "feed", "goals", "library")


def initialize(db):
    db.execute("CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, position INTEGER, body TEXT)")
    db.execute("""CREATE TABLE IF NOT EXISTS entities (
        project TEXT, kind TEXT, id TEXT, position INTEGER, body TEXT,
        PRIMARY KEY(project, kind, id))""")
    db.execute("""CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY, project TEXT, category TEXT, content TEXT, created TEXT)""")
    db.execute("""CREATE TABLE IF NOT EXISTS session_links (
        project TEXT, thread TEXT, session TEXT, PRIMARY KEY(project, thread))""")
    version = db.execute("PRAGMA user_version").fetchone()[0]
    if version == 0:
        row = db.execute("SELECT snapshot FROM workspace WHERE id=1").fetchone()
        if row:
            write(db, json.loads(row[0])["state"])
        db.execute("PRAGMA user_version=1")
    if version > 1:
        raise ValueError("Unsupported database schema")
    db.commit()


def write(db, state):
    db.execute("DELETE FROM projects")
    db.execute("DELETE FROM entities")
    for position, project in enumerate(state.get("projects", [])):
        meta = {k: v for k, v in project.items() if k not in ("rails", "threads")}
        db.execute("INSERT INTO projects VALUES (?, ?, ?)",
                   (project["id"], position, json.dumps(meta, ensure_ascii=False)))
        groups = {**project.get("rails", {}), "threads": project.get("threads", [])}
        for kind, values in groups.items():
            for index, value in enumerate(values):
                db.execute("INSERT INTO entities VALUES (?, ?, ?, ?, ?)",
                           (project["id"], kind, value["id"], index, json.dumps(value, ensure_ascii=False)))


def read(db, state):
    projects = []
    for project_id, body in db.execute("SELECT id,body FROM projects ORDER BY position"):
        project = json.loads(body)
        project["rails"] = {kind: [] for kind in KINDS}
        project["threads"] = []
        for kind, entity in db.execute("SELECT kind,body FROM entities WHERE project=? ORDER BY position", (project_id,)):
            target = project["threads"] if kind == "threads" else project["rails"].setdefault(kind, [])
            target.append(json.loads(entity))
        projects.append(project)
    return {**state, "projects": projects}
