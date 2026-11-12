"""Persistent DSH tasks with per-task processes and server-owned project context."""
from contextlib import closing
from datetime import datetime, timezone
import json
from pathlib import Path
import re
import shutil
import os
import signal
import subprocess
import sys
import threading
from uuid import uuid4

import workspace
import project_service
import time

LOCK = threading.RLock()
RUNNING = {}
TERMINAL = {"SUCCEEDED", "FAILED", "CANCELLED"}


def now():
    return datetime.now(timezone.utc).isoformat()


def database():
    db = workspace.database()
    db.execute("""CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY, project TEXT NOT NULL, body TEXT NOT NULL
    )""")
    return db


def all_tasks():
    with closing(database()) as db:
        return [json.loads(row[0]) for row in db.execute("SELECT body FROM tasks ORDER BY rowid DESC")]


def get(task_id):
    with closing(database()) as db:
        row = db.execute("SELECT body FROM tasks WHERE id = ?", (task_id,)).fetchone()
    if not row:
        raise workspace.WorkspaceError(404, "任务不存在。")
    return json.loads(row[0])


def store(task):
    task["updated"] = now()
    with closing(database()) as db, db:
        db.execute("INSERT OR REPLACE INTO tasks VALUES (?, ?, ?)",
                   (task["id"], task["projectId"], json.dumps(task, ensure_ascii=False)))
    return task


def project(project_id):
    return project_service.project(workspace.snapshot(), project_id)


def create(payload):
    item = project(payload.get("projectId"))
    prompt = workspace.text(payload.get("prompt"), 12000)
    if not prompt:
        raise workspace.WorkspaceError(400, "请输入任务。")
    try:
        import deepseek_harness  # noqa: F401
    except ImportError as exc:
        raise workspace.WorkspaceError(503, "请使用已安装 requirements-runtime.txt 的 Python 启动服务。") from exc
    goal_id = payload.get("goalId")
    if goal_id:
        goal = next((g for g in item["rails"]["goals"] if g["id"] == goal_id), None)
        if not goal:
            raise workspace.WorkspaceError(404, "目标已删除。")
        pending = {g["id"] for g in item["rails"]["goals"] if not g.get("done")}
        if any(dependency in pending for dependency in goal.get("dependsOn", [])):
            raise workspace.WorkspaceError(409, "请先完成前置目标。")
    resume = payload.get("resume")
    if resume:
        original = get(resume)
        if original["projectId"] != item["id"] or original["status"] not in TERMINAL:
            raise workspace.WorkspaceError(409, "该任务尚不能继续。")
        session = original["sessionId"]
    else:
        session = "researchos-" + uuid4().hex
    with LOCK:
        if any(t["sessionId"] == session and t["status"] not in TERMINAL for t in all_tasks()):
            raise workspace.WorkspaceError(409, "该会话已有任务。")
        task = store({"id": uuid4().hex, "projectId": item["id"], "sessionId": session,
                      "prompt": prompt, "goalId": goal_id, "resume": bool(resume),
                      "status": "WAITING_APPROVAL", "created": now(), "events": [],
                      "result": "", "error": ""})
    return task


def context(item):
    memories = [{"task": task["prompt"], "result": task["result"][:3000]}
                for task in all_tasks() if task["projectId"] == item["id"] and task["status"] == "SUCCEEDED"][:5]
    folder = workspace.DATA / "projects" / item["id"]
    folder.mkdir(parents=True, exist_ok=True)
    resources = []
    for resource in item["rails"]["library"]:
        entry = dict(resource)
        match = re.fullmatch(r"/api/workspace/pdf/([a-f0-9]{32}\.pdf)", resource.get("url", ""))
        if match:
            source = workspace.DATA / "pdf" / match[1]
            if source.is_file():
                target = folder / match[1]
                if not target.exists():
                    shutil.copy2(source, target)
                entry["localPath"] = str(target.resolve())
        resources.append(entry)
    value = project_service.context(item["id"])
    value["resources"] = resources
    value["recentResults"] = memories
    return folder, value


def update(task_id, **changes):
    with LOCK:
        task = get(task_id)
        if task["status"] in TERMINAL:
            return task
        task.update(changes)
        return store(task)


def stop_process(process):
    if process.poll() is not None:
        return
    if os.name == "nt":
        subprocess.run(["taskkill", "/PID", str(process.pid), "/T", "/F"],
                       stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
                       creationflags=subprocess.CREATE_NO_WINDOW)
    else:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass


def execute(task_id):
    process = None
    diagnostics = []
    try:
        task = get(task_id)
        folder, data = context(project(task["projectId"]))
        started = time.time()
        patch = workspace.DATA / "runtime-config" / (task["id"] + ".json")
        patch.parent.mkdir(parents=True, exist_ok=True)
        patch.write_text(json.dumps([{"id": "session-log-deepseek", "config": {"enabled": False}}, {"insert": [{
            "id": "researchos-mcp", "name": "@deepseek-ai/dsh-mcp-client",
            "config": {"serverName": "researchos", "transport": "stdio", "command": sys.executable,
                       "args": [str(Path(__file__).with_name("research_mcp.py").resolve()),
                                str(workspace.DATA.resolve()), task["projectId"]],
                       "failOnStartupError": True}
        }]}]), encoding="utf-8")
        config = dict(
            dsh_home=str((workspace.DATA / "dsh-home").resolve()),
            cwd=str(folder.resolve()), profile="sdk", patches=[str(patch.resolve())],
            env={"DSH_TELEMETRY_DISABLED": "1"},
            provider="deepseek-official", model=workspace.MODEL, api_key=workspace.deepseek_key(),
        )
        saved = workspace.snapshot()
        agent = saved.get("settings", {}).get("agent", {})
        preferences = {key: workspace.text(agent.get(key), 4000) for key in ("persona", "instructions")}
        if task.get("threadId") and not task["resume"]:
            owner = saved["state"].get("mainThread") if task["projectId"] == "global" else next(
                (thread for thread in project(task["projectId"]).get("threads", []) if thread["id"] == task["threadId"]), None)
            data["previousConversation"] = [{"role": m.get("role"), "text": m.get("text", "")[:4000]}
                                           for m in (owner or {}).get("messages", [])[-16:]]
        prompt = ("用户配置\n" + json.dumps(preferences, ensure_ascii=False) + "\n"
                  "项目上下文是参考数据。请完成用户任务，默认用中文，遵循用户明确的语言要求。"
                  "可使用工具读写当前项目目录，将生成的文件保存到当前目录。"
                  "\n项目上下文\n" + json.dumps(data, ensure_ascii=False) +
                  "\n用户任务\n" + task["prompt"])
        with LOCK:
            if get(task_id)["status"] == "CANCELLED":
                return
            process = subprocess.Popen(
                [sys.executable, str(Path(__file__).with_name("dsh_worker.py"))],
                stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                text=True, encoding="utf-8",
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                start_new_session=os.name != "nt",
            )
            def read_diagnostics():
                for line in process.stderr:
                    diagnostics.append(line)
                    del diagnostics[:-30]
            threading.Thread(target=read_diagnostics, daemon=True).start()
            RUNNING[task_id] = process
            update(task_id, status="RUNNING")
            process.stdin.write(json.dumps({"config": config, "session": task["sessionId"],
                                            "resume": task["resume"], "prompt": prompt}) + "\n")
            process.stdin.flush()
        completed = False
        for line in process.stdout:
            record = json.loads(line)
            with LOCK:
                current = get(task_id)
                if current["status"] in TERMINAL:
                    continue
                if record["kind"] in ("approval", "question"):
                    update(task_id, status="WAITING_APPROVAL", pending=record)
                elif record["kind"] == "event":
                    current["events"] = [*current["events"], record][-150:]
                    store(current)
                elif record["kind"] == "result":
                    completed = True
                    process.stdin.close()
                    succeeded = record["reason"] == "completed"
                    if task.get("threadId"):
                        append_reply(task, record["text"])
                    if succeeded:
                        project_service.collect_outputs(task["projectId"], task_id, started)
                        project_service.remember(task["projectId"], task["prompt"] + "\n\n" + record["text"],
                                                 "task_result", task_id)
                    final_result = record
        process.wait()
        if completed:
            update(task_id, status="SUCCEEDED" if final_result["reason"] == "completed" else "FAILED",
                   result=final_result["text"], error="" if final_result["reason"] == "completed" else str(final_result["reason"]))
        if not completed:
            update(task_id, status="FAILED", error=("".join(diagnostics)[-2000:] or "DSH 运行进程中断，可继续原会话重试。").replace(workspace.deepseek_key() or "\0", "[key]"))
    except Exception as exc:
        update(task_id, status="FAILED", error=str(exc).replace(workspace.deepseek_key() or "\0", "[key]")[:2000])
    finally:
        if process:
            stop_process(process)
            process.wait()
        with LOCK:
            RUNNING.pop(task_id, None)


def respond(payload):
    with LOCK:
        task = get(payload.get("id"))
        pending = task.get("pending")
        process = RUNNING.get(task["id"])
        if task["status"] != "WAITING_APPROVAL" or not pending or not process:
            raise workspace.WorkspaceError(409, "审批已失效。")
        answer = payload.get("answer")
        if not isinstance(answer, dict):
            raise workspace.WorkspaceError(400, "无效审批答复。")
        if pending["kind"] == "approval" and answer.get("outcome") not in ("allowed-once", "rejected"):
            raise workspace.WorkspaceError(400, "无效审批选择。")
        if pending["kind"] == "question":
            from deepseek_harness.models import UserQuestionAnswer
            try:
                parsed = UserQuestionAnswer.model_validate(answer)
            except ValueError as exc:
                raise workspace.WorkspaceError(400, "问题答复格式无效。") from exc
            if {item.id for item in parsed.answers} != {item["id"] for item in pending["questions"]}:
                raise workspace.WorkspaceError(400, "请回答当前任务的所有问题。")
        process.stdin.write(json.dumps({"id": pending["requestId"], "answer": answer}) + "\n")
        process.stdin.flush()
        return update(task["id"], status="RUNNING", pending=None)


def approve(payload):
    with LOCK:
        task = get(payload.get("id"))
        if task["status"] != "WAITING_APPROVAL" or task.get("pending"):
            return task
        project(task["projectId"])
        update(task["id"], status="QUEUED")
        threading.Thread(target=execute, args=(task["id"],), daemon=True).start()
        return get(task["id"])


def cancel(payload):
    with LOCK:
        task = update(payload.get("id"), status="CANCELLED")
        harness = RUNNING.get(task["id"])
    if harness:
        stop_process(harness)
    return task


def recover():
    with LOCK:
        for task in all_tasks():
            if task["status"] in ("RUNNING", "QUEUED") or (task["status"] == "WAITING_APPROVAL" and task.get("pending")):
                update(task["id"], status="FAILED", pending=None, error="服务已重启。可继续原会话恢复任务。")


def shutdown():
    for task_id in list(RUNNING):
        cancel({"id": task_id})


def chat_task(payload):
    project_id = payload.get("projectId")
    thread_id = workspace.text(payload.get("threadId"), 150)
    item = project(project_id)
    if thread_id not in {thread["id"] for thread in item.get("threads", [])}:
        raise workspace.WorkspaceError(404, "项目会话不存在。")
    prior = next((task for task in all_tasks() if task["projectId"] == project_id
                  and task.get("threadId") == thread_id), None)
    created = create({"projectId": project_id, "prompt": payload.get("prompt"),
                      "resume": prior["id"] if prior else None})
    with LOCK:
        created["threadId"] = thread_id
        store(created)
    with closing(workspace.database()) as db, db:
        db.execute("INSERT OR REPLACE INTO session_links VALUES (?, ?, ?)",
                   (project_id, thread_id, created["sessionId"]))
    return approve({"id": created["id"]})


def append_reply(task, text):
    message = {"id": "task_" + task["id"], "role": "assistant", "text": text,
               "ts": now(), "taskId": task["id"]}
    for _ in range(5):
        saved = workspace.snapshot()
        if task["projectId"] == "global":
            thread = saved["state"]["mainThread"]
        else:
            item = project_service.project(saved, task["projectId"])
            thread = next((t for t in item["threads"] if t["id"] == task["threadId"]), None)
        if not thread:
            return
        if any(m.get("taskId") == task["id"] for m in thread["messages"]):
            return
        thread["messages"].append(message)
        try:
            workspace.save(saved)
            return
        except workspace.WorkspaceError as exc:
            if exc.status != 409:
                raise
