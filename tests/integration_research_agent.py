"""Exercise actual DSH planning tools without approving or executing experiments."""
import json
import os
from pathlib import Path
from tempfile import TemporaryDirectory
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / 'demo/api'))
import workspace, tasks, project_service as projects, research_api, research_workflows as flows, research_ledger as ledger
from integration_v2 import wait

os.environ['DEEPSEEK_API_KEY'] = workspace.deepseek_key()
with TemporaryDirectory() as tmp:
    workspace.DATA = Path(tmp) / 'local'
    workspace.save({'revision': 0, 'state': {'version': 2, 'projects': []}, 'settings': {}})
    project = projects.call('project_create', {'name': '真实规划验收'}, 'global')['id']
    example = research_api.example({'projectId': project})
    plan = example['plan']
    plan['methods'] = [m for m in plan['methods'] if m['name'] != 'extra_trees']
    plan['matrix'] = {'seeds': [11, 22, 33], 'budgets': [64]}
    plan['budget']['maxRuns'] = 6
    try:
        task = research_api.plan_with_agent({'projectId': project, 'goal':
            '验证 logistic 相比 random_forest 的收益。已有真实示例数据和代码，请读取资源核查后保存一份新的草案。'
            '不要运行实验，不要安装依赖，不需要提问。用户预先给定以下完整协议，保持参数：' + json.dumps(plan, ensure_ascii=False)})
        result = wait(task['id'])
        drafts = [f for f in flows.all_workflows(project) if f['id'] != example['id']]
        assert drafts, result['result']
        assert all(f['status'] == 'DRAFT' and not f['runs'] for f in drafts)
        assert drafts[0]['plan']['matrix'] == plan['matrix']
        assert ledger.state(project)['revision'] == 0
        assert not flows.ACTIVE
        print('Real DSH resource inspection and workflow_draft passed; no execution or state promotion')
    finally:
        tasks.shutdown()
        flows.shutdown()
