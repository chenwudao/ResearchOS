"""Kill only the coordinator; verify orphan cleanup and durable checkpoint resume."""
import json
from pathlib import Path
import subprocess
import sys
import time
from tempfile import TemporaryDirectory

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'demo/api'))
import workspace, project_service as projects, research_workflows as flows

if len(sys.argv) > 1:
    workspace.DATA = Path(sys.argv[1])
    flows.launch(sys.argv[2], {'id': sys.argv[3]})
    while flows.ACTIVE:
        time.sleep(.1)
    sys.exit(0)

from test_research_workflows import SCRIPT, WorkflowTests

with TemporaryDirectory() as tmp:
    workspace.DATA = Path(tmp) / 'local'
    workspace.save({'revision': 0, 'state': {'version': 2, 'projects': []}, 'settings': {}})
    project = projects.call('project_create', {'name': 'crash test'}, 'global')['id']
    root = projects.folder(project)
    script = SCRIPT.replace("if a.case=='slow': time.sleep(8)", "if a.seed==22:\n    print('RUNNING',flush=True)\n    time.sleep(4)\n    Path('late-marker').write_text('orphan executed')")
    (root / 'run.py').write_text(script)
    (root / 'data.csv').write_text('x,y\n1,0\n')
    plan = WorkflowTests.plan(None, concurrency=1)
    draft = flows.draft(project, {'plan': plan})
    flow = flows.approve(project, {'id': draft['id'], 'revision': draft['revision']})
    process = subprocess.Popen([sys.executable, __file__, str(workspace.DATA), project, flow['id']])
    try:
        deadline = time.monotonic() + 20
        while time.monotonic() < deadline:
            current = flows.get(project, flow['id'])
            if current['runs'][0]['status'] == 'SUCCEEDED' and current['runs'][1]['attempts']:
                log = root / current['runs'][1]['attempts'][-1]['directory'] / 'stdout.log'
                if log.exists() and 'RUNNING' in log.read_text():
                    break
            time.sleep(.05)
        else:
            raise AssertionError('Child did not start second run')
        completed_attempt = current['runs'][0]['attempts']
        process.terminate()  # Deliberately do not terminate the process tree.
        process.wait(timeout=10)
        time.sleep(4.5)
        assert not (root / 'late-marker').exists(), 'Orphan script survived coordinator death'
        flows.recover()
        recovered = flows.get(project, flow['id'])
        assert recovered['status'] == 'PAUSED'
        assert recovered['runs'][1]['status'] == 'INTERRUPTED'
        flows.launch(project, {'id': flow['id']})
        deadline = time.monotonic() + 30
        while flow['id'] in flows.ACTIVE and time.monotonic() < deadline:
            time.sleep(.1)
        result = flows.get(project, flow['id'])
        assert result['status'] == 'REVIEW', result.get('error')
        assert result['runs'][0]['attempts'] == completed_attempt
        assert len(result['runs'][1]['attempts']) == 2
        print('Coordinator crash, orphan termination, restart recovery and checkpoint reuse passed')
    finally:
        if process.poll() is None:
            process.terminate()
            process.wait()
        flows.shutdown()
