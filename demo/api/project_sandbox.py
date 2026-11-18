"""Durable project trial queue. Only the authenticated owner may grant runtime budget."""

from contextlib import closing
import hashlib
import json
import math
import os
from pathlib import Path
import stat
import threading
import time
from uuid import uuid4

import project_service as projects
import research_ledger as ledger
import sandbox_runtime as runtime
import workspace

LOCK = threading.RLock()
ACTIVE = {}
closing_down = False


def database():
    db = workspace.database()
    db.executescript(
        """
        CREATE TABLE IF NOT EXISTS sandbox_settings(
            project TEXT PRIMARY KEY, environment TEXT NOT NULL DEFAULT 'default', seconds INTEGER NOT NULL DEFAULT 0);
        CREATE TABLE IF NOT EXISTS sandbox_runs(
            id TEXT PRIMARY KEY, project TEXT NOT NULL, request TEXT NOT NULL, status TEXT NOT NULL, body TEXT NOT NULL,
            UNIQUE(project,request));
        CREATE INDEX IF NOT EXISTS sandbox_project_runs ON sandbox_runs(project,status);
        CREATE INDEX IF NOT EXISTS sandbox_source_session ON sandbox_runs(json_extract(body,'$.sourceSession'));
        CREATE TABLE IF NOT EXISTS sandbox_grants(project TEXT,request TEXT,seconds INTEGER,PRIMARY KEY(project,request));
        CREATE TABLE IF NOT EXISTS sandbox_grant_times(project TEXT,request TEXT,at TEXT NOT NULL,PRIMARY KEY(project,request));
    """
    )
    return db


def settings(db, project):
    row = db.execute(
        "SELECT environment,seconds FROM sandbox_settings WHERE project=?", (project,)
    ).fetchone()
    return {"environment": row[0], "seconds": row[1]} if row else {"environment": "default", "seconds": 0}


def store(db, item):
    db.execute(
        "UPDATE sandbox_runs SET status=?,body=? WHERE project=? AND id=?",
        (item["status"], ledger.encoded(item), item["projectId"], item["id"]),
    )


def summary(item):
    return {k: v for k, v in item.items() if k not in ("code", "fingerprint", "args")}


def get(db, project, identity):
    row = db.execute(
        "SELECT body FROM sandbox_runs WHERE project=? AND id=?", (project, identity)
    ).fetchone()
    if not row:
        raise workspace.WorkspaceError(404, "当前项目没有这次试跑。")
    return json.loads(row[0])


def dashboard(project):
    with closing(database()) as db:
        rows = db.execute(
            "SELECT body FROM sandbox_runs WHERE project=? ORDER BY rowid DESC LIMIT 60", (project,)
        )
        return {**settings(db, project), "runs": [summary(json.loads(row[0])) for row in rows]}


def environments(project, create=None):
    options = runtime.info(project, "create" if create else "list", create or "default")
    if not any(o["id"] == "default" for o in options):
        options.insert(0, {"id": "default", "pending": True})
    return options


def bind_plan(project, plan):
    if not isinstance(plan, dict):
        raise workspace.WorkspaceError(400, "无效实验计划。")
    with closing(database()) as db:
        selected = plan.get("environmentId") or settings(db, project)["environment"]
    return {**plan, "environmentId": runtime.environment_id(selected)}


def workflows(project):
    import research_workflows as flows

    result = []
    for flow in flows.all_workflows(project):
        plan = flow["plan"]
        result.append(
            {
                "id": flow["id"],
                "revision": flow["revision"],
                "title": plan["question"],
                "status": flow["status"],
                "environment": plan.get("environmentId"),
                "budget": plan["budget"],
                "methods": [m["name"] for m in plan["methods"]],
                "total": len(flow["runs"]),
                "completed": sum(r["status"] == "SUCCEEDED" for r in flow["runs"]),
            }
        )
    return result


def prepare_workflow(project, args, *, launch=False):
    import research_workflows as flows

    with flows.LOCK:
        flow = flows.get(project, args.get("id"))
        if flow["revision"] != args.get("revision") or flow["status"] != "DRAFT":
            raise workspace.WorkspaceError(409, "计划版本已变化，请刷新后核对。")
        if not flow["plan"].get("environmentId") or args.get("environment"):
            plan = bind_plan(
                project,
                {
                    **flow["plan"],
                    "environmentId": args.get("environment") or flow["plan"].get("environmentId"),
                },
            )
            flow = flows.draft(
                project,
                {
                    "id": flow["id"],
                    "revision": flow["revision"],
                    "parentId": flow.get("parentId"),
                    "plan": plan,
                },
            )
        approved = flows.approve(project, {"id": flow["id"], "revision": flow["revision"]})
        return flows.launch(project, {"id": flow["id"]}) if launch else approved


def configure(project, args):
    ledger.check_project(project)
    selected = args.get("environment")
    if selected is not None and runtime.environment_id(selected) not in {
        e["id"] for e in environments(project)
    }:
        raise workspace.WorkspaceError(400, "该项目没有这个环境。")
    grant = args.get("grantSeconds", 0)
    if type(grant) is not int or not 0 <= grant <= 3600:
        raise workspace.WorkspaceError(400, "每次授权的试跑预算范围为 1–3600 秒。")
    with LOCK, closing(database()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        if grant:
            key = args.get("requestId")
            if not isinstance(key, str) or not 1 <= len(key) <= 100:
                raise workspace.WorkspaceError(400, "缺少授权请求标识。")
            old = db.execute(
                "SELECT seconds FROM sandbox_grants WHERE project=? AND request=?", (project, key)
            ).fetchone()
            if old and old[0] != grant:
                raise workspace.WorkspaceError(409, "同一授权请求的额度不一致。")
            if old:
                grant = 0
            else:
                db.execute("INSERT INTO sandbox_grants VALUES(?,?,?)", (project, key, grant))
                db.execute("INSERT INTO sandbox_grant_times VALUES(?,?,?)", (project, key, projects.timestamp()))
        db.execute("INSERT OR IGNORE INTO sandbox_settings(project) VALUES(?)", (project,))
        db.execute(
            "UPDATE sandbox_settings SET environment=COALESCE(?,environment),seconds=seconds+? WHERE project=?",
            (selected, grant, project),
        )
    pump()
    return dashboard(project)


def submit(project, args, origin):
    ledger.check_project(project)
    code, script = args.get("code"), args.get("script")
    if bool(code) == bool(script):
        raise workspace.WorkspaceError(400, "请提供一段 Python 代码或一个项目内的 .py 脚本。")
    if code is not None and (not isinstance(code, str) or not code.strip() or len(code.encode()) > 65536):
        raise workspace.WorkspaceError(400, "试跑代码为空或超过 64 KiB。")
    if script:
        if not isinstance(script, str) or Path(script).is_absolute() or ".." in Path(script).parts:
            raise workspace.WorkspaceError(400, "脚本必须是项目内相对路径。")
    argv, seconds = args.get("args", []), args.get("timeoutSeconds", 20)
    if (
        not isinstance(argv, list)
        or len(argv) > 64
        or not all(isinstance(a, str) and len(a) <= 2048 and "\0" not in a for a in argv)
    ):
        raise workspace.WorkspaceError(400, "脚本参数需要字符串列表。")
    if type(seconds) is not int or not 1 <= seconds <= 60:
        raise workspace.WorkspaceError(400, "单次试跑限时为 1–60 秒。正式实验请提交项目实验计划。")
    key = origin["sessionId"] + "/" + origin["callId"]
    fingerprint = ledger.digest(args)
    with LOCK, closing(database()) as db, db:
        db.execute("BEGIN IMMEDIATE")
        old = db.execute(
            "SELECT body FROM sandbox_runs WHERE project=? AND request=?", (project, key)
        ).fetchone()
        if old:
            item = json.loads(old[0])
            if item["fingerprint"] != fingerprint:
                raise workspace.WorkspaceError(409, "同一次工具调用不能更改试跑内容。")
            return summary(item)
        if script:
            target = ledger.path(project, script)
            if target.suffix != ".py" or not target.is_file():
                raise workspace.WorkspaceError(400, "找不到项目内的 Python 脚本。")
            script = target.relative_to(projects.folder(project)).as_posix()
            script_hash = ledger.file_hash(target)
        else:
            script_hash = hashlib.sha256(code.encode("utf-8")).hexdigest()
        if (
            db.execute(
                "SELECT count(*) FROM sandbox_runs WHERE project=? AND status='WAITING_APPROVAL'",
                (project,),
            ).fetchone()[0]
            >= 30
        ):
            raise workspace.WorkspaceError(409, "请先处理项目沙盒中等待预算的试跑。")
        pref = settings(db, project)
        identity = uuid4().hex
        item = {
            "id": identity,
            "projectId": project,
            "title": workspace.text(args.get("title"), 160) or script or "Python 试跑",
            "environment": runtime.environment_id(args.get("environment") or pref["environment"]),
            "args": argv,
            "script": script,
            "scriptHash": script_hash,
            "code": code,
            "fingerprint": fingerprint,
            "timeoutSeconds": seconds,
            "sourceSession": origin["sessionId"],
            "sourceBot": origin.get("bot") or "项目对话",
            "sourceFeature": origin.get("featureId"),
            "previousRun": origin.get("previousRun"),
            "status": "WAITING_APPROVAL",
            "created": projects.timestamp(),
            "exitCode": None,
            "artifacts": [],
        }
        db.execute(
            "INSERT INTO sandbox_runs VALUES(?,?,?,?,?)",
            (identity, project, key, item["status"], ledger.encoded(item)),
        )
    pump()
    with closing(database()) as db:
        return summary(get(db, project, identity))


def approve_trial(project, identity):
    with LOCK, closing(database()) as db, db:
        item = get(db, project, identity)
        if item["status"] == "WAITING_APPROVAL":
            item.update(status="QUEUED", approvedOnce=True, approvedAt=projects.timestamp())
            store(db, item)
    pump()
    return detail(project, identity)


def retry(project, args):
    with closing(database()) as db:
        old = get(db, project, args.get("id"))
    if old["status"] not in ("BLOCKED", "FAILED", "INTERRUPTED", "CANCELLED"):
        raise workspace.WorkspaceError(409, "只有未完成的试跑可以重新提交。")
    key = args.get("requestId")
    if not isinstance(key, str) or not 1 <= len(key) <= 100:
        raise workspace.WorkspaceError(400, "缺少重试标识。")
    fields = {k: old[k] for k in ("title", "code", "script", "args", "timeoutSeconds")}
    fields["environment"] = args.get("environment") or old["environment"]
    return submit(
        project,
        fields,
        {
            "sessionId": old["sourceSession"],
            "callId": "retry-" + key,
            "bot": old["sourceBot"],
            "featureId": old.get("sourceFeature"),
            "previousRun": old["id"],
        },
    )


def pump():
    with LOCK, closing(database()) as db:
        if closing_down:
            return
        pending = db.execute(
            "SELECT body FROM sandbox_runs WHERE status IN ('WAITING_APPROVAL','QUEUED') ORDER BY rowid"
        ).fetchall()
        for (body,) in pending:
            item = json.loads(body)
            project, identity = item["projectId"], item["id"]
            with db:
                if not item.get("approvedOnce") and not item.get("reservedSeconds"):
                    reserved = db.execute(
                        "UPDATE sandbox_settings SET seconds=seconds-? WHERE project=? AND seconds>=?",
                        (item["timeoutSeconds"], project, item["timeoutSeconds"]),
                    )
                    if reserved.rowcount != 1:
                        continue
                    item.update(reservedSeconds=item["timeoutSeconds"], status="QUEUED")
                    store(db, item)
                if len(ACTIVE) >= 4 or sum(p == project for p, _, _ in ACTIVE.values()) >= 2:
                    continue
                item.update(status="RUNNING", started=projects.timestamp())
                store(db, item)
            stop = threading.Event()
            thread = threading.Thread(
                target=work, args=(item, stop), name="sandbox-" + identity[:8], daemon=True
            )
            ACTIVE[identity] = (project, stop, thread)
            thread.start()


def files_in(directory):
    files = []
    for root, children, names in os.walk(directory, followlinks=False):
        children[:] = sorted(
            c for c in children if not (Path(root) / c).is_junction() and not (Path(root) / c).is_symlink()
        )
        for name in sorted(names):
            file = Path(root) / name
            if not file.is_symlink() and stat.S_ISREG(file.lstat().st_mode):
                files.append({"name": file.relative_to(directory).as_posix(), "bytes": file.stat().st_size})
                if len(files) == 100:
                    return files
    return files


def publish(item):
    """Archive the observed run and its outputs, once, without confirming a scientific claim."""
    project, identity = item["projectId"], item["id"]
    feature = item.get("sourceFeature")
    if not item["artifacts"] and not feature:
        return
    if feature:
        import features
        if not any(f["id"] == feature for f in features.list_features(project, project)):
            feature = None

    def update(p):
        rails = p["rails"]
        stamp = {
            "ts": item["ended"],
            "source": "项目代码沙盒",
            "sandboxRunId": identity,
            "sourceSession": item["sourceSession"],
        }
        library = rails.setdefault("library", [])
        known = {entry["id"] for entry in library}
        for f in item["artifacts"] if item["status"] == "SUCCEEDED" else []:
            key = "sb_" + ledger.digest([identity, f["name"]])[:32]
            if key not in known:
                library.append(
                    {
                        **stamp,
                        "id": key,
                        "kind": "output",
                        "category": "实验产物",
                        "text": f["name"],
                        "path": f"experiments/sandbox/{identity}/output/" + f["name"],
                    }
                )
        if feature and feature != "chat":
            records = rails.setdefault(feature, [])
            if not any(n["id"] == "sb_run_" + identity for n in records):
                records.append(
                    {
                        **stamp,
                        "id": "sb_run_" + identity,
                        "category": "实验记录",
                        "kind": "note",
                        "text": item["title"] + " · " + item["status"] + " · " + item["environment"],
                    }
                )

    projects.mutate(project, update)


def run_dir(project, identity):
    return ledger.path(project, "experiments/sandbox/" + identity)


def work(item, stop):
    project, identity = item["projectId"], item["id"]
    started = time.monotonic()
    status, code, error, artifacts = "FAILED", None, "", []
    try:
        directory = run_dir(project, identity)
        directory.mkdir(parents=True, exist_ok=False)
        output = directory / "output"
        output.mkdir()
        script = item["script"]
        if (
            script
            and item.get("scriptHash")
            and ledger.file_hash(ledger.path(project, script)) != item["scriptHash"]
        ):
            raise workspace.WorkspaceError(409, "提交后项目脚本已改变，请核对新版本后重新提交。")
        if item["code"]:
            local = directory / "experiment.py"
            local.write_text(item["code"], encoding="utf-8")
            script = local.relative_to(projects.folder(project)).as_posix()
        code = runtime.execute(
            project,
            item["environment"],
            script,
            item["args"],
            output,
            directory,
            item["timeoutSeconds"],
            stop,
        )
        status = "SUCCEEDED" if code == 0 else "FAILED"
        if code:
            error = (
                tail(directory / "stderr.log")[-1500:]
                or tail(directory / "stdout.log")[-1000:]
                or f"退出码 {code}"
            )
        artifacts = files_in(output)
    except InterruptedError as exc:
        status, error = "CANCELLED", str(exc)
    except (workspace.WorkspaceError, OSError) as exc:
        status, error = "BLOCKED", str(exc)
    except Exception as exc:
        error = str(exc)
    finally:
        with LOCK:
            if stop.is_set():
                status = "INTERRUPTED" if closing_down else "CANCELLED"
            elapsed = max(1, math.ceil(time.monotonic() - started))
            item.update(
                status=status,
                exitCode=code,
                error=error,
                artifacts=artifacts,
                seconds=elapsed,
                ended=projects.timestamp(),
            )
            try:
                publish(item)
            except Exception as exc:
                item["archiveError"] = str(exc)
            with closing(database()) as db, db:
                store(db, item)
                if not item.get("approvedOnce"):
                    refund = (
                        item["timeoutSeconds"]
                        if status == "BLOCKED"
                        else max(0, item["timeoutSeconds"] - elapsed)
                    )
                    db.execute(
                        "UPDATE sandbox_settings SET seconds=seconds+? WHERE project=?", (refund, project)
                    )
            ACTIVE.pop(identity, None)
        pump()


def tail(path):
    if not path.is_file() or path.is_symlink():
        return ""
    with path.open("rb") as f:
        f.seek(max(0, path.stat().st_size - 65536))
        data = f.read()
    encoding = "utf-16-le" if b"\0" in data[:160] else "utf-8"
    return data.decode(encoding, "replace")


def detail(project, identity, wait=0):
    if type(wait) is not int or not 0 <= wait <= 20:
        raise workspace.WorkspaceError(400, "等待时限为 0–20 秒。")
    deadline = time.monotonic() + wait
    while True:
        with closing(database()) as db:
            item = get(db, project, identity)
        if item["status"] not in ("QUEUED", "RUNNING") or time.monotonic() >= deadline:
            break
        time.sleep(0.2)
    directory = run_dir(project, identity)
    return {
        **summary(item),
        "code": item["code"],
        "args": item["args"],
        "stdout": tail(directory / "stdout.log"),
        "stderr": tail(directory / "stderr.log"),
    }


def dialog_delivery(scope, session, identity=None, file=None):
    # The native host establishes the session/workspace association before dispatch.
    sql = ("SELECT r.body,json_extract(p.body,'$.name') FROM sandbox_runs r JOIN projects p ON p.id=r.project "
           "WHERE json_extract(r.body,'$.sourceSession')=?")
    values = [session]
    if scope != "global":
        sql += " AND r.project=?"
        values.append(scope)
    if identity:
        sql += " AND r.id=?"
        values.append(identity)
    with closing(database()) as db:
        rows = db.execute(sql + " ORDER BY r.rowid DESC LIMIT 12", values).fetchall()
    if identity:
        if not rows:
            raise workspace.WorkspaceError(404, "此对话没有这项任务。")
        run = json.loads(rows[0][0])
        if file:
            return artifact(run["projectId"], identity, file)
        result = detail(run["projectId"], identity)
        return {key: result.get(key) for key in ("stdout", "stderr", "error", "exitCode", "artifacts")}
    receipts = []
    for body, project_name in rows:
        run = json.loads(body)
        receipt = {key: run[key] for key in ("id", "title", "status")}
        if scope == "global":
            receipt["projectName"] = project_name
        receipts.append(receipt)
    return receipts


def artifact(project, identity, name):
    with closing(database()) as db:
        item = get(db, project, identity)
    if not any(f["name"] == name for f in item["artifacts"]):
        raise workspace.WorkspaceError(404, "未登记此产物。")
    output = run_dir(project, identity) / "output"
    file = output / name
    if not file.resolve().is_relative_to(output.resolve()) or file.is_symlink() or not file.is_file():
        raise workspace.WorkspaceError(404, "产物已移动。")
    if file.suffix.lower() not in (".txt", ".md", ".csv", ".json", ".py", ".tsv", ".log", ".yaml", ".yml"):
        return {
            "name": name,
            "text": "二进制产物已保存在项目目录。",
            "path": file.relative_to(projects.folder(project)).as_posix(),
        }
    with file.open("rb") as f:
        data = f.read(65537)
    return {"name": name, "text": data[:65536].decode("utf-8", "replace"), "truncated": len(data) > 65536}


def cancel(project, identity):
    with LOCK, closing(database()) as db, db:
        item = get(db, project, identity)
        if identity in ACTIVE:
            ACTIVE[identity][1].set()
        elif item["status"] in ("WAITING_APPROVAL", "QUEUED"):
            if item.get("reservedSeconds"):
                db.execute(
                    "UPDATE sandbox_settings SET seconds=seconds+? WHERE project=?",
                    (item["reservedSeconds"], project),
                )
            item.update(status="CANCELLED", ended=projects.timestamp())
            store(db, item)
    return summary(item)


def recover():
    global closing_down
    with LOCK, closing(database()) as db, db:
        closing_down = False
        for (body,) in db.execute("SELECT body FROM sandbox_runs WHERE status='RUNNING'").fetchall():
            item = json.loads(body)
            item.update(
                status="INTERRUPTED",
                ended=projects.timestamp(),
                error="服务已中断。请在核对日志后重新试跑。",
            )
            store(db, item)
    pump()


def shutdown():
    global closing_down
    with LOCK:
        closing_down = True
        jobs = list(ACTIVE.values())
        for _, stop, _ in jobs:
            stop.set()
    for _, _, thread in jobs:
        thread.join(timeout=15)
