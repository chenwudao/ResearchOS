"""Real SDK user-question request and answer round trip."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os, sys, time
sys.path.insert(0,str(Path(__file__).resolve().parents[1]/"demo/api"))
import workspace,tasks
os.environ["DEEPSEEK_API_KEY"]=workspace.deepseek_key()
with TemporaryDirectory() as temporary:
    workspace.DATA=Path(temporary)/"data"
    workspace.save({"revision":0,"settings":{},"state":{"version":2,"projects":[
        {"id":"proj_question","name":"Question test","rails":{rail:[] for rail in workspace.RAILS}}]}})
    task=tasks.create({"projectId":"proj_question","prompt":
        "Use your native user-question tool to ask me which baseline code to use. You must invoke the tool and wait for my answer; do not ask in plain final text. After I answer, repeat the code exactly in your final response."})
    tasks.approve({"id":task["id"]})
    seen=False
    for _ in range(240):
        current=tasks.get(task["id"])
        pending=current.get("pending")
        if current["status"]=="WAITING_APPROVAL" and pending:
            if pending["kind"]=="question":
                seen=True
                answer={"answers":[{"id":q["id"],"selected":[],"custom":"QUESTION_BASELINE_742"} for q in pending["questions"]]}
            else:
                answer={"outcome":"allowed-once"}
            tasks.respond({"id":task["id"],"answer":answer})
        if current["status"] in tasks.TERMINAL:
            assert seen and current["status"]=="SUCCEEDED" and "QUESTION_BASELINE_742" in current["result"],current.get("error") or current.get("result")
            print("Native user question and answer passed")
            break
        time.sleep(.5)
    else:
        tasks.cancel({"id":task["id"]})
        raise AssertionError("Question test timed out")
