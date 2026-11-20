"""Real native browser fixture; no model or user project mutations."""
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
import json, subprocess, sys
ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
import native_launcher as launcher
import features, project_service as projects
previous=launcher.workspace.DATA
try:
    with TemporaryDirectory() as tmp:
        root=Path(tmp);launcher.workspace.DATA=root/'data'
        project=projects.create_project('固定工作组')['id']
        for worker in features.list_features(project):
            if worker.get('fixed'):
                projects.call('feature_push',{'featureId':worker['id'],'title':worker['label']+'示例','text':'需要核查的测试记录','category':'测试分类'},project)
        with closing(launcher.workspace.database()) as db, db:
            features.ensure_tables(db)
            db.execute("INSERT INTO labweave_features(scope,feature_id,label,updated_ts,paradigm,layout) VALUES(?,?,?,0,'notes','timeline')",(project,'feat_12345678','旧资料追踪'))
        projects.call('feature_push',{'featureId':'feat_12345678','text':'历史资料仍然保留'},project)
        with launcher.native_services(0,home=root/'host',configured=False,background=False) as (url,_):
            subprocess.run(['node','tests/integration_fixed_workers.cjs'],cwd=ROOT,input=json.dumps({'url':url,'project':project}),text=True,check=True,timeout=180)
finally:launcher.workspace.DATA=previous
