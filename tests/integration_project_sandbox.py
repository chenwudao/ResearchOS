"""Exercise the native conversation -> isolated project experiment -> right panel with disposable data."""

from pathlib import Path
import json
import subprocess
import sys
import time
from tempfile import TemporaryDirectory
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "scripts"))
import native_launcher as app
import project_sandbox as sandbox
import project_service as projects
import native_web


def check_runner(pid, other, nonce):
    job = sandbox.submit(
        pid,
        {"title": "真实运行", "script": "check.py", "timeoutSeconds": 15},
        {"sessionId": "fixture", "callId": "run", "bot": "项目对话"},
    )
    job = sandbox.detail(pid, job["id"], 20)
    assert job["status"] == "SUCCEEDED", job
    assert nonce in job["stdout"] and json.loads(
        sandbox.artifact(pid, job["id"], "result.json")["text"]
    ) == {"check": nonce}
    assert not sandbox.dashboard(other)["runs"]
    second = sandbox.submit(
        pid,
        {
            "title": "第二个环境",
            "environment": "default",
            "code": "import os; print(os.environ['LABWEAVE_ENV_ID'])",
            "timeoutSeconds": 10,
        },
        {"sessionId": "fixture", "callId": "second"},
    )
    assert sandbox.detail(pid, second["id"], 20)["stdout"].strip() == "default"
    root = projects.folder(pid)
    (root / "data.txt").write_text("1")
    (root / "matrix.py").write_text(
        "import argparse,json,os\np=argparse.ArgumentParser()\nfor k in ('method','seed','budget','metrics'): p.add_argument('--'+k)\na=p.parse_args(); assert os.environ['LABWEAVE_ENV_ID']=='verification'\nwith open(a.metrics,'w') as f: json.dump({'score':int(a.method=='candidate'),'split_id':'one-split'},f)\n",
        encoding="utf8",
    )
    plan = {
        "question": "matrix",
        "hypothesis": "candidate improves",
        "inputs": ["data.txt"],
        "methods": [
            {
                "name": n,
                "script": "matrix.py",
                "args": [
                    "--method",
                    n,
                    "--seed",
                    "{seed}",
                    "--budget",
                    "{budget}",
                    "--metrics",
                    "{metrics}",
                ],
            }
            for n in ("base", "candidate")
        ],
        "matrix": {"seeds": [1, 2], "budgets": [1]},
        "protocol": {
            "metric": "score",
            "direction": "maximize",
            "baseline": "base",
            "split": "one",
            "minSeeds": 2,
        },
        "budget": {"maxRuns": 4, "concurrency": 2, "timeoutSeconds": 25, "retries": 0, "wallSeconds": 100},
    }
    flow = native_web.project_action(pid, {"action": "research/draft", "args": {"plan": plan}})
    native_web.project_action(
        pid, {"action": "sandbox/approve-run", "args": {"id": flow["id"], "revision": flow["revision"]}}
    )
    limit = time.monotonic() + 105
    while flow["id"] in native_web.research_api.flows.ACTIVE and time.monotonic() < limit:
        time.sleep(0.2)
    result = native_web.research_api.flows.get(pid, flow["id"])
    assert result["status"] == "REVIEW", result["error"]
    assert all(c["attempts"][0]["sandbox"] == "bubblewrap" for c in result["runs"])
    print("真实试跑、两个项目 venv、只读输入、禁网、结果文件、跨项目隔离及四单元正式矩阵通过。", flush=True)


def main():
    queue_only = "--queue-only" in sys.argv[1:]
    previous = app.workspace.DATA
    try:
        with TemporaryDirectory(prefix="labweave-sandbox-ui-") as temp:
            root = Path(temp)
            app.workspace.DATA = root / "data"
            pid = projects.create_project("沙盒验收")["id"]
            other = projects.create_project("隔离对照")["id"]
            nonce = "LW" + uuid4().hex[:10]
            (projects.folder(other) / "private.txt").write_text("fixture")
            (projects.folder(pid) / "check.py").write_text(
                "import json,os,sys,time\nfrom pathlib import Path\n"
                'assert sys.prefix=="/env" and os.environ["LABWEAVE_ENV_ID"]=="verification"\n'
                'assert not Path("/mnt/c").exists() and not Path("/home").is_dir()\n'
                'assert not os.environ.get("DEEPSEEK_API_KEY")\n'
                'try:\n Path("/workspace/forbidden.txt").touch()\nexcept PermissionError:\n pass\n'
                'except OSError as e:\n assert e.errno==30\nelse:\n raise AssertionError("project should be read-only")\n'
                'assert all(line.split(":")[0].strip()=="lo" for line in Path("/proc/net/dev").read_text().splitlines()[2:])\n'
                f'time.sleep(1)\nprint("{nonce}",flush=True)\nPath("/output/result.json").write_text(json.dumps({{"check":"{nonce}"}}))\n',
                encoding="utf8",
            )
            if not queue_only:
                sandbox.environments(pid, "verification")
                sandbox.configure(
                    pid, {"environment": "verification", "grantSeconds": 100, "requestId": "fixture-budget"}
                )
                print("隔离测试项目已绑定 verification 环境及试跑预算。", flush=True)
            if "--runner-only" in sys.argv[1:]:
                check_runner(pid, other, nonce)
                return
            with app.native_services(0, home=root / "home", configured=True, background=False) as (url, _):
                print("原生 DSH 与项目工具已就绪。", flush=True)
                payload = {
                    "url": url,
                    "nonce": nonce,
                    "project": pid,
                    "other": other,
                    "queueOnly": queue_only,
                    "browserDir": str(root / "browser"),
                }
                subprocess.run(
                    ["node", str(ROOT / "tests/integration_project_sandbox.cjs")],
                    input=json.dumps(payload),
                    text=True,
                    check=True,
                    cwd=ROOT,
                    timeout=385,
                )
    finally:
        app.workspace.DATA = previous


if __name__ == "__main__":
    main()
