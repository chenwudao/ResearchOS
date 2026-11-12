"""Live SDK business-tool, approval, memory, migration and backup regression checks."""
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time
sys.path.insert(0, str(Path("demo/api").resolve()))
import workspace
import tasks
import project_service
import backup

os.environ["DEEPSEEK_API_KEY"] = workspace.deepseek_key()


def wait(identity):
    for _ in range(240):
        task = tasks.get(identity)
        if task.get("pending") and task["status"] == "WAITING_APPROVAL":
            pending = task["pending"]
            if pending["kind"] == "approval":
                tasks.respond({"id":identity, "answer":{"outcome":"allowed-once"}})
            else:
                tasks.respond({"id":identity, "answer":{"cancelled":True}})
        if task["status"] in tasks.TERMINAL:
            assert task["status"] == "SUCCEEDED", task.get("error")
            return task
        time.sleep(.5)
    tasks.cancel({"id":identity})
    raise AssertionError("task timeout")


def main():
    with TemporaryDirectory() as temporary:
        workspace.DATA = Path(temporary) / "local"
        project = {"id":"proj_v2", "name":"V2 测试", "threads": [],
                   "rails":{rail:[] for rail in workspace.RAILS}}
        workspace.save({"revision":0,"state":{"version":2,"projects":[project]},"settings":{}})
        task = tasks.create({"projectId":"proj_v2","prompt":
            "Use the registered researchos MCP tools to create an idea with exact text "
            "V2_MEMORY_TEST. Then write a memory saying 'The selected baseline is alpha742'. "
            "You must call the tools, not just describe them. Reply DONE when saved."})
        tasks.approve({"id":task["id"]})
        wait(task["id"])
        saved = workspace.snapshot()
        assert any(item["text"] == "V2_MEMORY_TEST" for item in saved["state"]["projects"][0]["rails"]["ideas"])
        assert any("alpha742" in item["content"] for item in project_service.memory_list("proj_v2"))
        archive = backup.create()
        project_service.create_entry("proj_v2", "ideas", {"text":"remove by restore"})
        backup.restore(archive)
        assert len(workspace.snapshot()["state"]["projects"][0]["rails"]["ideas"]) == 1
        workspace.DATA = Path(temporary) / "restored"
        backup.restore(archive)
        recovered = tasks.create({"projectId":"proj_v2","resume":task["id"],
                                  "prompt":"Do not use tools. Repeat the selected baseline from our previous turn."})
        tasks.approve({"id":recovered["id"]})
        assert "alpha742" in wait(recovered["id"])["result"]
        print("Live MCP writes, durable memory, backup restore and relocated session resume passed")


if __name__ == "__main__":
    main()
