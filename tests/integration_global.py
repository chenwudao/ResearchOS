"""Global assistant routes real MCP mutations to a newly created project."""
from pathlib import Path
from tempfile import TemporaryDirectory
import os
import sys
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "demo/api"))
import workspace, tasks
from integration_v2 import wait

key = workspace.deepseek_key()
os.environ["DEEPSEEK_API_KEY"] = key
with TemporaryDirectory() as temporary:
    workspace.DATA = Path(temporary) / "local"
    workspace.save({"revision":0,"settings":{"agent":{"persona":"简洁科研助手"}},
                    "state":{"version":2,"mainThread":{"id":"main","messages":[]},"projects":[]}})
    task = tasks.chat_task({"projectId":"global","threadId":"main","prompt":
        "请通过项目工具新建一个名为 GLOBAL_ACCEPTANCE 的项目，并在这个新项目内创建内容精确为 GLOBAL_IDEA_742 的点子。实际调用工具，最后简短确认。"})
    wait(task["id"])
    saved = workspace.snapshot()
    project = next(p for p in saved["state"]["projects"] if p["name"] == "GLOBAL_ACCEPTANCE")
    assert any(n["text"] == "GLOBAL_IDEA_742" for n in project["rails"]["ideas"])
    assert any(m.get("taskId") == task["id"] for m in saved["state"]["mainThread"]["messages"])
    print("Real global chat, project creation, scoped idea write and durable reply passed")
