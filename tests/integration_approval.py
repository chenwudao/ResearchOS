"""Verify real DSH permission requests can be denied through ResearchOS."""
import os
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time
sys.path.insert(0, str(Path("demo/api").resolve()))
import workspace, tasks
os.environ["DEEPSEEK_API_KEY"] = workspace.deepseek_key()
with TemporaryDirectory() as temporary:
    workspace.DATA = Path(temporary) / "local"
    workspace.save({"revision":0, "state":{"version":2,"projects":[{
        "id":"proj_approval","name":"Approval test","rails":{k:[] for k in workspace.RAILS}}]}, "settings":{}})
    outside = Path(temporary) / "outside.txt"
    task = tasks.create({"projectId":"proj_approval", "prompt":
        "Use your shell to write the text APPROVAL_TEST to this absolute path outside your workspace: "
        + str(outside) + ". Request permission if needed. If rejected, stop immediately."})
    tasks.approve({"id":task["id"]})
    saw_approval = False
    for _ in range(180):
        current = tasks.get(task["id"])
        if current.get("pending") and current["pending"]["kind"] == "approval":
            saw_approval = True
            tasks.respond({"id":task["id"],"answer":{"outcome":"rejected"}})
        if current["status"] in tasks.TERMINAL:
            break
        time.sleep(.5)
    else:
        tasks.cancel({"id":task["id"]})
        raise AssertionError("Approval test timed out")
    assert saw_approval, current
    assert not outside.exists()
    print("Native tool approval and rejection passed")
