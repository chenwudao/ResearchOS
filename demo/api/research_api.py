"""HTTP actions for human approvals; MCP exposes drafts and observations only."""
import csv
import json
from pathlib import Path
import random
import shutil
import sys
from uuid import uuid4
import project_service as projects
import research_ledger as ledger
import research_workflows as flows
import workspace


def overview(payload):
    project = payload.get('projectId')
    return {'state': ledger.state(project), 'workflows': flows.all_workflows(project),
            'evidence': ledger.graph(project, payload.get('query', '')), 'directory': str(projects.folder(project))}


def example(payload):
    project = payload.get('projectId')
    relative = 'resources/comparison-' + uuid4().hex[:8]
    directory = ledger.path(project, relative)
    directory.mkdir(parents=True)
    shutil.copy2(Path(__file__).resolve().parents[2] / 'examples/algorithm_comparison/run.py', directory / 'run.py')
    rng = random.Random(742)
    with (directory / 'dataset.csv').open('w', newline='', encoding='utf-8') as file:
        writer = csv.writer(file)
        writer.writerow([*['x' + str(i) for i in range(10)], 'target'])
        for _ in range(1200):
            row = [rng.gauss(0, 1) for _ in range(10)]
            label = int(2 * row[0] - 1.5 * row[1] + row[2] + rng.gauss(0, .5) > 0)
            writer.writerow([*row, label])
    description = '人工生成的二分类演示数据，1200 行、10 个特征，生成随机种子 742。每个实验种子执行分层 75/25 训练池与验证划分；按预算从训练池分层抽样。验证集用于探索，后续须独立留出测试集。此示例不代表真实材料或临床数据。'
    (directory / 'README.txt').write_text(description, encoding='utf-8')
    for filename in ('run.py', 'dataset.csv', 'README.txt'):
        projects.create_entry(project, 'library', {'text': '算法对照示例 · ' + filename, 'path': relative + '/' + filename, 'kind': 'file'})
    return flows.draft(project, {'plan': {
        'question': '在相同数据划分和训练样本预算下，候选算法是否稳定优于 Random Forest？',
        'hypothesis': 'Logistic Regression 或 Extra Trees 在该合成分类数据上能够获得稳定的验证准确率收益。',
        'python': sys.executable, **({'environmentId':payload['environmentId']} if payload.get('environmentId') else {}),
        'inputs': [relative + '/dataset.csv', relative + '/README.txt'],
        'methods': [{'name': method, 'script': relative + '/run.py', 'args': ['--method', method, '--seed', '{seed}', '--budget', '{budget}', '--metrics', '{metrics}']}
                    for method in ('random_forest', 'extra_trees', 'logistic')],
        'matrix': {'seeds': [11, 22, 33, 44, 55], 'budgets': [64, 128, 256]},
        'protocol': {'metric': 'accuracy', 'direction': 'maximize', 'baseline': 'random_forest',
                     'split': description, 'minSeeds': 3, 'minImprovement': .01, 'maxStd': .05},
        'budget': {'maxRuns': 45, 'concurrency': 2, 'timeoutSeconds': 120, 'retries': 1, 'wallSeconds': 900}}})


def plan_with_agent(payload):
    project = payload.get('projectId')
    goal = workspace.text(payload.get('goal'), 8000)
    previous = flows.get(project, payload['parentId']) if payload.get('parentId') else None
    if previous:
        goal = (goal + '\n根据前一轮实际结果制定下一轮计划。parentId 必须设为 ' + previous['id'] +
                '。先调用 workflow_get 核查失败原因或报告，依据收益、波动和预算选择继续、修订或停止。若建议停止，不要强行创建重复实验。'
                '\n前一轮摘要：' + json.dumps({'status': previous['status'], 'analysis': previous.get('analysis'), 'error': previous.get('error')}, ensure_ascii=False))
    if not goal:
        raise workspace.WorkspaceError(400, '请输入要验证的研究目标。')
    import tasks
    prompt = ('读取 research_state_get、resource_search、evidence_search 和已有实验，检查项目里的实际数据、代码及说明。'
              '针对用户目标拟定可编辑的实验计划。必要时通过本机工具准备 Python 适配脚本，但不要启动实验或安装依赖。'
              '使用 workflow_draft 保存草案，不得替用户审批。需要用户提供缺失资料时使用原生问答。'
              '计划格式：plan={question,hypothesis,python(本机绝对解释器路径),inputs:[项目内数据/依赖文件相对路径],'
              'methods:[{name,script:项目内Python脚本相对路径,args:[字符串参数，其中必须包含{seed},{budget},{metrics}占位符]}],'
              'matrix:{seeds:[整数],budgets:[正整数]},protocol:{metric:主指标名,direction:maximize或minimize,baseline:方法名,split:划分协议说明,minSeeds:3,minImprovement:非负收益门槛,maxStd:收益标准差上限},'
              'budget:{maxRuns:矩阵单元数,concurrency:1到8,timeoutSeconds:单次秒数,retries:0到3,wallSeconds:总秒数}}。'
              '脚本输出 JSON 或单行 CSV，必须包含有限数值主指标和字符串 split_id（同种子预算的不同方法必须同划分）。'
              '指标门槛应事先确定；未经验证的想法不得写为已证实结论。'
              '\n用户目标：' + goal)
    task = tasks.create({'projectId': project, 'prompt': prompt})
    return tasks.approve({'id': task['id']})


def call_tool(name, args, project):
    if name == 'research_state_get':
        return ledger.state(project)
    if name == 'research_state_propose':
        return ledger.save_state(project, args, proposal=True)
    if name == 'evidence_search':
        return ledger.graph(project, args.get('query', ''))
    if name == 'evidence_add':
        return ledger.put_node(project, args)
    if name == 'evidence_link':
        return ledger.link(project, args)
    if name == 'workflow_list':
        return flows.all_workflows(project)
    if name == 'workflow_get':
        return flows.get(project, args.get('id'))
    if name == 'workflow_draft':
        import project_sandbox
        return flows.draft(project, {**args,'plan':project_sandbox.bind_plan(project,args.get('plan'))})
    raise workspace.WorkspaceError(404, '未知科研工具。')


def log(payload):
    flow = flows.get(payload.get('projectId'), payload.get('id'))
    run = next((r for r in flow['runs'] if r['id'] == payload.get('runId')), None)
    index = payload.get('attempt', 0)
    filename = payload.get('file')
    if not run or type(index) is not int or not 0 <= index < len(run['attempts']) or filename not in ('stdout.log', 'stderr.log', 'metadata.json'):
        raise workspace.WorkspaceError(400, '运行日志参数无效。')
    target = ledger.path(flow['projectId'], run['attempts'][index]['directory'] + '/' + filename)
    if not target.is_file():
        return {'text': '日志尚未写入。'}
    with target.open('rb') as stream:
        stream.seek(max(0, target.stat().st_size - 65536))
        return {'text': stream.read().decode('utf-8', errors='replace')}


POST = {
    'research/log': log,
    'research/overview': overview,
    'research/state': lambda p: ledger.save_state(p.get('projectId'), p),
    'research/evidence': lambda p: ledger.put_node(p.get('projectId'), p),
    'research/link': lambda p: ledger.link(p.get('projectId'), p),
    'research/review-evidence': lambda p: ledger.set_status(p.get('projectId'), p),
    'research/draft': lambda p: flows.draft(p.get('projectId'), p),
    'research/approve': lambda p: flows.approve(p.get('projectId'), p),
    'research/run': lambda p: flows.launch(p.get('projectId'), p),
    'research/pause': lambda p: flows.stop(p.get('projectId'), p),
    'research/cancel': lambda p: flows.stop(p.get('projectId'), p, cancel=True),
    'research/accept': lambda p: flows.accept(p.get('projectId'), p),
    'research/example': example,
    'research/plan': plan_with_agent,
}
