"""Regression tests for approved budgets, provenance and checkpoint semantics."""
import json
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import time
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'demo/api'))
import workspace, project_service as projects, research_workflows as flows, research_ledger as ledger
import experiment_analysis, experiment_runner, backup

SCRIPT = '''import argparse,json,time,sys
from pathlib import Path
p=argparse.ArgumentParser()
p.add_argument('--method');p.add_argument('--seed',type=int);p.add_argument('--budget',type=int);p.add_argument('--metrics');p.add_argument('--case',default='ok')
a=p.parse_args()
if a.case=='slow': time.sleep(8)
if a.case=='retry' and Path(a.metrics).parent.name=='attempt-1':
    print('temporary failure',file=sys.stderr);sys.exit(2)
if a.case=='failure':
    print('ModuleNotFoundError: missing_fixture',file=sys.stderr);sys.exit(2)
split=str(a.seed)+'-'+str(a.budget)
if a.case=='split' and a.method=='candidate': split+='different'
score=.5 if a.method=='baseline' else .6
Path(a.metrics).write_text(json.dumps({'score':score,'split_id':split}))
print('completed',a.method,a.seed)
'''


class WorkflowTests(unittest.TestCase):
    def setUp(self):
        self.temp = TemporaryDirectory()
        self.original = workspace.DATA
        workspace.DATA = Path(self.temp.name) / 'data'
        workspace.save({'revision': 0, 'state': {'version': 2, 'projects': []}, 'settings': {}})
        self.project = projects.call('project_create', {'name': 'test'}, 'global')['id']
        root = projects.folder(self.project)
        (root / 'run.py').write_text(SCRIPT, encoding='utf-8')
        (root / 'data.csv').write_text('x,y\n1,0\n2,1\n')

    def tearDown(self):
        flows.shutdown()
        workspace.DATA = self.original
        self.temp.cleanup()

    def plan(self, case='ok', **budget):
        return {'question': 'Is candidate better?', 'hypothesis': 'Candidate improves score', 'python': sys.executable,
                'inputs': ['data.csv'], 'methods': [{'name': name, 'script': 'run.py', 'args': ['--method', name, '--seed', '{seed}', '--budget', '{budget}', '--metrics', '{metrics}', '--case', case]} for name in ('baseline', 'candidate')],
                'matrix': {'seeds': [11, 22, 33], 'budgets': [10]},
                'protocol': {'metric': 'score', 'direction': 'maximize', 'baseline': 'baseline', 'split': 'paired', 'minSeeds': 3, 'minImprovement': .05, 'maxStd': .02},
                'budget': {'maxRuns': 6, 'concurrency': 2, 'timeoutSeconds': 10, 'retries': 1, 'wallSeconds': 60, **budget}}

    def create(self, case='ok', **budget):
        draft = flows.draft(self.project, {'plan': self.plan(case, **budget)})
        return flows.approve(self.project, {'id': draft['id'], 'revision': draft['revision']})

    def finish(self, flow):
        flows.launch(self.project, {'id': flow['id']})
        until = time.monotonic() + 30
        while flow['id'] in flows.ACTIVE and time.monotonic() < until:
            time.sleep(.05)
        self.assertNotIn(flow['id'], flows.ACTIVE)
        return flows.get(self.project, flow['id'])

    def test_approval_and_optimistic_revision(self):
        draft = flows.draft(self.project, {'plan': self.plan()})
        with self.assertRaises(workspace.WorkspaceError):
            flows.launch(self.project, {'id': draft['id']})
        revised = flows.draft(self.project, {'id': draft['id'], 'revision': draft['revision'], 'plan': self.plan()})
        with self.assertRaises(workspace.WorkspaceError):
            flows.approve(self.project, {'id': draft['id'], 'revision': draft['revision']})
        approved = flows.approve(self.project, {'id': revised['id'], 'revision': revised['revision']})
        with self.assertRaises(workspace.WorkspaceError):
            flows.draft(self.project, {'id': approved['id'], 'revision': approved['revision'], 'plan': self.plan()})

    def test_changed_code_requires_new_approval(self):
        flow = self.create()
        (projects.folder(self.project) / 'run.py').write_text(SCRIPT + '\n# modified')
        with self.assertRaises(workspace.WorkspaceError):
            flows.launch(self.project, {'id': flow['id']})
        self.assertFalse(flows.ACTIVE)

    def test_retry_budget_and_logs(self):
        flow = self.finish(self.create('retry'))
        self.assertEqual(flow['status'], 'REVIEW', flow.get('error'))
        self.assertTrue(all(len(r['attempts']) == 2 for r in flow['runs']))
        self.assertTrue(all(r['attempts'][0]['exitCode'] == 2 for r in flow['runs']))
        self.assertEqual(flow['analysis']['decision'], '继续验证')
        self.assertEqual(ledger.state(self.project)['revision'], 0)

    def test_exhausted_attempts_do_not_restart(self):
        flow = self.finish(self.create('failure', retries=0))
        self.assertEqual(flow['status'], 'FAILED')
        self.assertTrue(all(r['failureKind'] == 'environment' for r in flow['runs']))
        second = self.finish(flow)
        self.assertEqual([len(r['attempts']) for r in second['runs']], [1] * 6)

    def test_split_mismatch_never_claims_improvement(self):
        flow = self.finish(self.create('split'))
        self.assertEqual(flow['analysis']['decision'], '补充证据')
        self.assertEqual(flow['analysis']['evidenceStatus'], 'insufficient')

    def test_tampered_result_blocks_confirmation(self):
        flow = self.finish(self.create())
        run = flow['runs'][0]
        path = ledger.path(self.project, run['attempts'][-1]['directory'] + '/metrics.json')
        path.write_text('{"score":999,"split_id":"forged"}')
        with self.assertRaises(workspace.WorkspaceError):
            flows.accept(self.project, {'id': flow['id'], 'revision': flow['revision']})
        graph = ledger.graph(self.project)
        self.assertTrue(any(not n['verification']['valid'] for n in graph['nodes']))
        self.assertEqual(ledger.state(self.project)['revision'], 0)

    def test_confirm_is_idempotent_and_memory_has_evidence(self):
        flow = self.finish(self.create())
        args = {'id': flow['id'], 'revision': flow['revision'], 'stateRevision': 0}
        accepted = flows.accept(self.project, args)
        self.assertEqual(flows.accept(self.project, args)['revision'], accepted['revision'])
        self.assertEqual(len(projects.memory_list(self.project)), 1)
        self.assertTrue(ledger.state(self.project)['evidence'])
        report = ledger.path(self.project, flow['reportPath'])
        report.write_text('tampered')
        self.assertTrue(ledger.state(self.project)['evidenceHealth']['invalid'])

    def test_state_proposals_do_not_overwrite_confirmed_state(self):
        saved = ledger.save_state(self.project, {'revision': 0, 'stage': 'baseline'})
        proposed = ledger.save_state(self.project, {'stage': 'unverified', 'reason': 'idea'}, proposal=True)
        self.assertEqual(proposed['stage'], 'baseline')
        self.assertEqual(proposed['proposals'][0]['changes']['stage'], 'unverified')
        with self.assertRaises(workspace.WorkspaceError):
            ledger.save_state(self.project, {'revision': saved['revision'], 'stage': 'stale'})

    def test_cancel_and_backup_guard(self):
        flow = self.create('slow')
        flows.launch(self.project, {'id': flow['id']})
        time.sleep(.4)
        with self.assertRaises(workspace.WorkspaceError):
            backup.create()
        snapshot = workspace.snapshot()
        snapshot['state']['projects'] = []
        with self.assertRaises(workspace.WorkspaceError):
            workspace.save(snapshot)
        flows.stop(self.project, {'id': flow['id']}, cancel=True)
        while flow['id'] in flows.ACTIVE:
            time.sleep(.1)
        self.assertEqual(flows.get(self.project, flow['id'])['status'], 'CANCELLED')
        self.assertFalse(flows.PROCESSES)

    def test_confirmation_recovers_partial_publication(self):
        flow = self.finish(self.create())
        args = {'id': flow['id'], 'revision': flow['revision'], 'stateRevision': 0}
        with patch.object(projects, 'remember', side_effect=OSError('simulated interruption')):
            with self.assertRaises(OSError):
                flows.accept(self.project, args)
        self.assertEqual(ledger.state(self.project)['revision'], 1)
        accepted = flows.accept(self.project, args)
        self.assertEqual(accepted['status'], 'SUCCEEDED')
        self.assertEqual(ledger.state(self.project)['revision'], 1)
        self.assertEqual(len(projects.memory_list(self.project)), 1)

    def test_timeout_and_total_budget(self):
        flow = self.finish(self.create('slow', timeoutSeconds=1, wallSeconds=2, retries=0))
        self.assertEqual(flow['status'], 'FAILED')
        self.assertLessEqual(sum(len(r['attempts']) for r in flow['runs']), 4)
        self.assertTrue(any(r.get('failureKind') == 'budget' for r in flow['runs']))
        with self.assertRaises(workspace.WorkspaceError):
            flows.launch(self.project, {'id': flow['id']})

    def test_scope_and_source_validation(self):
        node = ledger.put_node(self.project, {'kind': 'hypothesis', 'text': 'test', 'sources': []})
        other = projects.call('project_create', {'name': 'other'}, 'global')['id']
        with self.assertRaises(workspace.WorkspaceError):
            ledger.get_node(other, node['id'])
        with self.assertRaises(workspace.WorkspaceError):
            ledger.set_status(self.project, {'id': node['id'], 'status': 'confirmed', 'reason': 'no evidence'})
        with self.assertRaises(workspace.WorkspaceError):
            ledger.put_node(self.project, {'kind': 'conclusion', 'text': 'unsupported', 'status': 'confirmed'})

    def test_csv_contract_and_nonfinite(self):
        path = projects.folder(self.project) / 'metrics.csv'
        path.write_text('score,split_id\n0.75,abc\n')
        self.assertEqual(experiment_runner.metrics(path, 'score')['score'], .75)
        path.write_text('score,split_id\nnan,abc\n')
        with self.assertRaises(ValueError):
            experiment_runner.metrics(path, 'score')


if __name__ == '__main__':
    unittest.main()
