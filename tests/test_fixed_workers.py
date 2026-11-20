"""Permanent project Worker identities, structure guards and legacy preservation."""
import json
from contextlib import closing
from pathlib import Path
import sys
from tempfile import TemporaryDirectory
import unittest
from concurrent.futures import ThreadPoolExecutor
sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'demo/api'))
import features, workspace, project_service as projects, research_mcp, native_web, naming

class FixedWorkersTests(unittest.TestCase):
    def setUp(self):
        self.tmp=TemporaryDirectory();self.previous=workspace.DATA;workspace.DATA=Path(self.tmp.name)/'data'
        self.a=projects.create_project('Alpha')['id'];self.b=projects.create_project('Beta')['id']
    def tearDown(self):
        workspace.DATA=self.previous;self.tmp.cleanup()
    def workers(self, project=None):
        return [f for f in features.list_features(project or self.a) if f.get('fixed')]
    def test_five_roles_order_and_stable_ids(self):
        expected=['目标','笔记','思维导图','点子','工程台']
        self.assertEqual([f['label'] for f in self.workers()],expected)
        self.assertEqual([f['workerKey'] for f in self.workers()],list('ABCDE'))
        self.assertEqual([f['layout'] for f in self.workers()],['checklist','library','graph','branches','sequence'])
        self.assertEqual(self.workers(),self.workers())
        self.assertEqual(len(features.list_features('global')),1)
    def test_create_reuses_even_with_temporary_or_layout_override(self):
        for worker in self.workers():
            reused=features.create_feature(self.a,'任意名称',paradigm=worker['paradigm'],layout='invalid',temporary=True)
            self.assertEqual(reused['feature'],worker)
            self.assertTrue(reused['reused'])
        self.assertEqual(len(self.workers()),5)
    def test_concurrent_create_never_adds_worker(self):
        with ThreadPoolExecutor(max_workers=6) as pool:
            results=list(pool.map(lambda _:features.create_feature(self.a,'duplicate',paradigm='notes'),range(15)))
        self.assertEqual({r['feature']['id'] for r in results},{'library'})
    def test_scope_isolation_and_invalid_paradigm(self):
        with self.assertRaises(workspace.WorkspaceError):features.create_feature(self.a,'x',project_id=self.b)
        with self.assertRaises(workspace.WorkspaceError):features.create_feature('global','x')
        with self.assertRaises(workspace.WorkspaceError):features.create_feature(self.a,'x',paradigm='ext_x')
        with self.assertRaises(workspace.WorkspaceError):features.create_project_paradigm(self.a,{})
    def test_structure_guards_preserve_records(self):
        for f in self.workers():
            record=projects.call('feature_push',{'featureId':f['id'],'text':'keep record'},self.a)
            for operation in (lambda:features.delete_feature(self.a,f['id']),
                              lambda:features.rename_feature(self.a,f['id'],'changed'),
                              lambda:features.update_feature(self.a,f['id'],hint='changed'),
                              lambda:naming.NamingStore().rename_feature_from_conversation(self.a,f['id'],'changed')):
                with self.assertRaises(workspace.WorkspaceError):operation()
            self.assertEqual(projects.call('feature_entries',{'featureId':f['id']},self.a)['entries'][0]['id'],record['id'])
        with self.assertRaises(workspace.WorkspaceError):features.cluster_bots(self.a,'goals',['ideas'])
    def test_completion_and_restart_keep_worker_and_session(self):
        features.bind_bot_session(self.a,'ideas','saved-session')
        record=projects.call('feature_push',{'featureId':'ideas','text':'delivered'},self.a)
        row=next(r for r in native_web.catalog() if r['scope']==self.a)
        ref={'id':'test-workspace','path':row['path']}
        native_web.dispatch('bind',{'scope':self.a,'workspace':ref})
        result=native_web.dispatch('bot-complete',{'workspace':ref,'featureId':'ideas','recordId':record['id']})
        self.assertFalse(result['archived'])
        self.assertEqual(next(f for f in self.workers() if f['id']=='ideas')['botSessionId'],'saved-session')
        self.assertFalse(any(f['archived'] or f['temporary'] or f['clusterParent'] for f in self.workers()))
    def test_old_deleted_archived_rows_cannot_hide_fixed_worker(self):
        with closing(workspace.database()) as db, db:
            features.ensure_tables(db)
            db.execute("INSERT OR REPLACE INTO labweave_features(scope,feature_id,label,deleted,updated_ts) VALUES(?,?,?,1,0)",(self.a,'ideas','old'))
            db.execute('INSERT INTO labweave_bot_lifecycle VALUES(?,?,1,1,?)',(self.a,'ideas','library'))
        self.assertEqual(len(self.workers()),5)
        self.assertFalse(next(f for f in self.workers() if f['id']=='ideas')['archived'])
    def test_legacy_preserved_in_history(self):
        fid='feat_12345678'
        with closing(workspace.database()) as db, db:
            features.ensure_tables(db)
            db.execute("INSERT INTO labweave_features(scope,feature_id,label,deleted,updated_ts,paradigm,layout) VALUES(?,?,?,0,0,'notes','timeline')",(self.a,fid,'旧笔记'))
        record=projects.call('feature_push',{'featureId':fid,'text':'historical content'},self.a)
        legacy=next(f for f in features.list_features(self.a) if f['id']==fid)
        self.assertTrue(legacy['legacy']);self.assertEqual(legacy['layout'],'timeline')
        self.assertEqual(projects.call('feature_entries',{'featureId':fid},self.a)['entries'][0]['id'],record['id'])
    def test_tools_and_context_constrain_model(self):
        response=research_mcp.dispatch({'jsonrpc':'2.0','id':1,'method':'tools/list'},self.a)
        names={t['name'] for t in response['result']['tools']}
        self.assertFalse(names & {'feature_create','feature_delete','project_paradigm_create'})
        context=projects.context(self.a)
        self.assertEqual(len(context['workers']),5)
        self.assertEqual(context['projectParadigms'],[])
    def test_contents_remain_editable_and_scoped(self):
        for f in self.workers():
            record=projects.call('feature_push',{'featureId':f['id'],'text':'initial'},self.a)
            projects.call('feature_push',{'featureId':f['id'],'id':record['id'],'text':'updated'},self.a)
            self.assertFalse(projects.call('feature_entries',{'featureId':f['id']},self.b)['entries'])
            projects.delete_entry(self.a,f['id'],record['id'])
            self.assertFalse(projects.call('feature_entries',{'featureId':f['id']},self.a)['entries'])
        self.assertEqual(len(self.workers()),5)

if __name__=='__main__':unittest.main()
