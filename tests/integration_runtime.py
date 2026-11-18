import os
from pathlib import Path
from tempfile import TemporaryDirectory
import time
import sys
sys.path.insert(0, str(Path("demo/api").resolve()))
import workspace, tasks
key = workspace.deepseek_key()
os.environ["DEEPSEEK_API_KEY"] = key
def wait(task_id):
    for _ in range(120):
        result = tasks.get(task_id)
        if result["status"] in tasks.TERMINAL:
            return result
        time.sleep(.5)
    tasks.cancel({"id":task_id})
    raise AssertionError("timeout")
with TemporaryDirectory() as tmp:
    workspace.DATA = Path(tmp)
    project = {"id":"proj_test", "name":"测试", "rails":{k:[] for k in workspace.RAILS}}
    workspace.save({"revision":0,"state":{"version":2,"projects":[project]},"settings":{}})
    task = tasks.create({"projectId":"proj_test","prompt":"Remember code alpha742. Reply alpha742 only."})
    tasks.approve({"id":task["id"]})
    first = wait(task["id"])
    assert first["status"] == "SUCCEEDED", first
    assert first["events"]
    assert "session-log-deepseek/delivery-accepted" not in str(first["events"])
    task = tasks.create({"projectId":"proj_test","prompt":"Repeat the code from the previous turn.","resume":task["id"]})
    tasks.approve({"id":task["id"]})
    resumed = wait(task["id"])
    assert "alpha742" in resumed["result"], resumed
    task = tasks.create({"projectId":"proj_test","prompt":"Use shell to sleep for 30 seconds then reply DONE."})
    tasks.approve({"id":task["id"]})
    time.sleep(2)
    tasks.cancel({"id":task["id"]})
    assert tasks.get(task["id"])["status"] == "CANCELLED"
    for _ in range(50):
        if not tasks.RUNNING: break
        time.sleep(.1)
    assert not tasks.RUNNING
    print("Real execution, events, resume and process cancellation passed")
