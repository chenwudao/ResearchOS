"""Real 45-run sklearn comparison, pause/resume, report, evidence and state confirmation."""
from pathlib import Path
import json
import sys
import time
from uuid import uuid4

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / 'demo/api'))
import workspace, project_service, research_api, research_workflows as flows, research_ledger as ledger


def wait(project, identity, predicate, timeout=180):
    until = time.monotonic() + timeout
    while time.monotonic() < until:
        value = flows.get(project, identity)
        if predicate(value):
            return value
        if value['status'] == 'FAILED':
            raise AssertionError(json.dumps(value, ensure_ascii=False))
        time.sleep(.2)
    raise AssertionError('Timed out: ' + json.dumps(value, ensure_ascii=False))


def main():
    workspace.DATA = ROOT / 'demo/.local/v3-acceptance' / uuid4().hex
    workspace.save({'revision': 0, 'settings': {}, 'state': {'version': 2, 'projects': []}})
    project = project_service.call('project_create', {'name': 'V3 算法对照验收'}, 'global')['id']
    draft = research_api.example({'projectId': project})
    assert len(draft['plan']['methods']) == 3
    approved = flows.approve(project, {'id': draft['id'], 'revision': draft['revision']})
    assert len(approved['runs']) == 45
    flows.launch(project, {'id': draft['id']})
    wait(project, draft['id'], lambda f: sum(r['status'] == 'SUCCEEDED' for r in f['runs']) >= 4)
    flows.stop(project, {'id': draft['id']})
    while draft['id'] in flows.ACTIVE:
        time.sleep(.1)
    paused = flows.get(project, draft['id'])
    completed = {r['id']: len(r['attempts']) for r in paused['runs'] if r['status'] == 'SUCCEEDED'}
    print('Paused with', len(completed), 'completed runs; resuming without duplicates', flush=True)
    flows.launch(project, {'id': draft['id']})
    reviewed = wait(project, draft['id'], lambda f: f['status'] == 'REVIEW')
    assert all(len(r['attempts']) == completed[r['id']] for r in reviewed['runs'] if r['id'] in completed)
    assert ledger.state(project)['revision'] == 0, 'Unconfirmed results changed authoritative state'
    result = flows.accept(project, {'id': draft['id'], 'revision': reviewed['revision'], 'stateRevision': 0})
    assert result['status'] == 'SUCCEEDED'
    assert ledger.state(project)['evidence']
    assert project_service.memory_list(project)
    graph = ledger.graph(project)
    assert all(n['verification']['valid'] for n in graph['nodes'])
    assert len(graph['edges']) >= 45 * 3
    assert not result['analysis']['problems'], result['analysis']
    assert all(r['attempts'][-1]['exitCode'] == 0 for r in result['runs'])
    report = {'projectId': project, 'workflowId': result['id'], 'data': str(workspace.DATA),
              'runs': len(result['runs']), 'resumedWithoutRepeating': len(completed),
              'evidenceNodes': len(graph['nodes']), 'evidenceEdges': len(graph['edges']),
              'decision': result['analysis']['decision'], 'analysis': result['analysis']}
    (workspace.DATA / 'acceptance.json').write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding='utf-8')
    print(json.dumps(report, ensure_ascii=True, indent=2), flush=True)


if __name__ == '__main__':
    try:
        main()
    finally:
        flows.shutdown()
