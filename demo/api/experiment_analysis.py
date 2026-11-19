"""Protocol-bound paired comparisons and traceable publication of confirmed results."""
from collections import defaultdict
from contextlib import closing
import csv
import json
import random
import statistics
import project_service as projects
import research_ledger as ledger
import research_records
import workspace


def describe(values):
    return {'n': len(values), 'mean': statistics.mean(values),
            'std': statistics.stdev(values) if len(values) > 1 else 0,
            'min': min(values), 'max': max(values)}


def analyze(plan, runs):
    protocol = plan['protocol']
    metric = protocol['metric']
    baseline = protocol['baseline']
    sign = 1 if protocol['direction'] == 'maximize' else -1
    groups = defaultdict(list)
    for run in runs:
        if run['status'] == 'SUCCEEDED':
            groups[(run['method'], run['budget'])].append(run)
    summaries, comparisons, problems = [], [], []
    for (method, budget), items in sorted(groups.items()):
        summaries.append({'method': method, 'budget': budget, **describe([r['metrics'][metric] for r in items])})
    for method in (m['name'] for m in plan['methods'] if m['name'] != baseline):
        for budget in plan['matrix']['budgets']:
            base = {r['seed']: r for r in groups[(baseline, budget)]}
            candidate = {r['seed']: r for r in groups[(method, budget)]}
            deltas = []
            for seed in plan['matrix']['seeds']:
                if seed not in base or seed not in candidate:
                    problems.append(f'{method}/{budget}/{seed}：缺少配对结果')
                elif base[seed]['metrics']['split_id'] != candidate[seed]['metrics']['split_id']:
                    problems.append(f'{method}/{budget}/{seed}：划分标识不一致')
                else:
                    deltas.append(sign * (candidate[seed]['metrics'][metric] - base[seed]['metrics'][metric]))
            if not deltas:
                continue
            desc = describe(deltas)
            rng = random.Random(742)
            bootstrap = sorted(statistics.mean(rng.choices(deltas, k=len(deltas))) for _ in range(2000))
            sufficient = len(deltas) >= protocol['minSeeds'] and len(deltas) == len(plan['matrix']['seeds'])
            passes = sufficient and desc['mean'] >= protocol['minImprovement'] and desc['std'] <= protocol['maxStd'] and desc['min'] >= 0
            comparisons.append({'method': method, 'budget': budget, **desc,
                                'bootstrap95': [bootstrap[49], bootstrap[1949]], 'sufficient': sufficient, 'passes': passes})
    methods = [m['name'] for m in plan['methods'] if m['name'] != baseline]
    passing = [method for method in methods if all(any(c['method'] == method and c['budget'] == b and c['passes'] for c in comparisons) for b in plan['matrix']['budgets'])]
    incomplete = len(runs) != len(plan['methods']) * len(plan['matrix']['seeds']) * len(plan['matrix']['budgets']) or any(r['status'] != 'SUCCEEDED' for r in runs)
    if problems or incomplete or any(not c['sufficient'] for c in comparisons) or not comparisons:
        decision, status = '补充证据', 'insufficient'
        next_action = '核查数据划分和失败单元，补足预注册随机种子；在重新审批后补充实验。'
    elif passing:
        decision, status = '继续验证', 'preliminary'
        next_action = '达到当前协议门槛的方法：' + '、'.join(passing) + '。下一步使用独立留出数据和消融实验确认，避免在同一评价集反复调参。'
    elif all(c['max'] < 0 for c in comparisons):
        decision, status = '停止当前方案', 'refuted'
        next_action = '所有配对实验均低于基线；在当前代码、数据和预算范围内停止该方案，先检查假设和实现，再提出新的审批计划。'
    else:
        decision, status = '修改方案', 'insufficient'
        next_action = '收益未稳定达到预注册门槛。先检查实现、数据划分与失败情形，再提出稳定性或消融实验，不自动扩大计算预算。'
    return {'metric': metric, 'baseline': baseline, 'direction': protocol['direction'], 'summaries': summaries,
            'comparisons': comparisons, 'problems': problems, 'decision': decision, 'evidenceStatus': status,
            'nextAction': next_action, 'passingMethods': passing,
            'limitations': '结果仅适用于声明的代码、数据和划分。split_id 由脚本提供，不能证明无数据泄漏；bootstrap 区间为探索性描述，不是独立验证或多重比较校正。'}


def register_resource(project, identity, text, relative):
    def operation(item):
        if not any(n['id'] == identity for n in item['rails']['library']):
            item['rails']['library'].append({'id': identity, 'text': text, 'path': relative, 'kind': 'output', 'source': '科研工作流', 'ts': projects.timestamp()})
    projects.mutate(project, operation)


def register_goals(flow, completed=False):
    def operation(item):
        goals = item['rails']['goals']
        root = 'wf_' + flow['id']
        if not any(n['id'] == root for n in goals):
            goals.append({'id': root, 'text': flow['plan']['question'], 'ts': projects.timestamp(), 'source': '科研工作流', 'workflowId': flow['id']})
        for step in flow['steps']:
            identity = root + '_' + step['id']
            existing = next((n for n in goals if n['id'] == identity), None)
            if existing is None:
                existing = {'id': identity, 'text': step['title'], 'parentId': root,
                            'dependsOn': [root + '_' + d for d in step['dependsOn']], 'ts': projects.timestamp(), 'workflowId': flow['id']}
                goals.append(existing)
            existing['done'] = completed or step['status'] == 'SUCCEEDED'
        next(n for n in goals if n['id'] == root)['done'] = completed
    projects.mutate(flow['projectId'], operation)


def report(flow):
    project, identity = flow['projectId'], flow['id']
    result = analyze(flow['plan'], flow['runs'])
    relative = f'outputs/workflows/{identity}'
    directory = ledger.path(project, relative)
    directory.mkdir(parents=True, exist_ok=True)
    (directory / 'analysis.json').write_text(ledger.encoded(result), encoding='utf-8')
    (directory / 'protocol.json').write_text(ledger.encoded({'plan': flow['plan'], 'approval': flow['approval']}), encoding='utf-8')
    with (directory / 'runs.csv').open('w', encoding='utf-8-sig', newline='') as file:
        writer = csv.writer(file)
        writer.writerow(['run_id', 'method', 'seed', 'budget', result['metric'], 'split_id', 'attempts', 'directory'])
        for run in flow['runs']:
            writer.writerow([run['id'], run['method'], run['seed'], run['budget'], run['metrics'][result['metric']], run['metrics']['split_id'], len(run['attempts']), run['attempts'][-1]['directory']])
    lines = ['# 科研对照实验报告', '', flow['plan']['question'], '', '## 预注册协议', '',
             '- 假设：' + flow['plan']['hypothesis'], '- 基线：' + result['baseline'],
             '- 主指标：' + result['metric'] + '（' + result['direction'] + '）',
             '- 数据划分：' + flow['plan']['protocol']['split'],
             '- 计划指纹：' + flow['approval']['planHash'], '', '## 按样本预算比较', '',
             '| 方法 | 样本预算 | 种子数 | 均值 | 标准差 | 最低 | 最高 |', '|---|---:|---:|---:|---:|---:|---:|']
    for row in result['summaries']:
        lines.append(f"| {row['method']} | {row['budget']} | {row['n']} | {row['mean']:.6f} | {row['std']:.6f} | {row['min']:.6f} | {row['max']:.6f} |")
    lines += ['', '## 相对基线的配对收益', '', '| 方法 | 预算 | 平均收益 | 收益标准差 | 最差收益 | 探索性 95% 区间 | 达到门槛 |', '|---|---:|---:|---:|---:|---|---|']
    for row in result['comparisons']:
        lines.append(f"| {row['method']} | {row['budget']} | {row['mean']:.6f} | {row['std']:.6f} | {row['min']:.6f} | {row['bootstrap95']} | {row['passes']} |")
    lines += ['', '## 行动建议（待确认）', '', result['decision'], '', result['nextAction'], '', '## 异常与范围', '', result['limitations'], *result['problems'], '',
              '## 追溯文件', '', '- protocol.json：批准的计划、输入哈希、环境依赖和 Git 信息。',
              '- runs.csv：全部实验单元及其运行目录。', '- analysis.json：汇总统计与配对判断。',
              '- 每个运行目录包含 metadata.json、stdout.log、stderr.log 和脚本指标文件。',
              '', '成功执行仅说明程序按协议产生结果；结论仍须人工确认，不能据此声称一般性优越。']
    (directory / 'report.md').write_text('\n'.join(lines) + '\n', encoding='utf-8')
    ids = []
    def add(suffix, kind, text, sources, status='insufficient'):
        node = ledger.put_node(project, {'id': identity + '_' + suffix, 'kind': kind, 'text': text, 'sources': sources,
                                           'status': status, 'origin': 'workflow:' + identity}, trusted=True)
        ids.append(node['id'])
        return node['id']
    def source(path, location):
        return {'path': path, 'location': location}
    hypothesis = add('hypothesis', 'hypothesis', flow['plan']['hypothesis'], [source(relative + '/protocol.json', 'plan.hypothesis')])
    code = add('code', 'code', '批准的代码版本与环境', [source(name, '批准时的完整文件 SHA256') for name in sorted({m['script'] for m in flow['plan']['methods']})])
    dataset = add('dataset', 'dataset', '声明的数据及依赖文件', [source(name, '批准时的完整文件 SHA256') for name in flow['plan']['inputs']])
    for run in flow['runs']:
        run_node = add(run['id'], 'experiment', f"{run['method']} / seed={run['seed']} / budget={run['budget']} / {result['metric']}={run['metrics'][result['metric']]}",
                       [source(p, '实验产物及元数据；主指标 ' + result['metric']) for p in run['artifacts']], 'preliminary')
        for target, relation in ((hypothesis, 'tests'), (code, 'uses'), (dataset, 'uses')):
            ledger.link(project, {'source': run_node, 'target': target, 'relation': relation})
        with closing(research_records.database()) as db, db:
            record = {'id': 'run_' + run['id'], 'name': f"{run['method']} / seed {run['seed']} / budget {run['budget']}",
                      'parameters': {'seed': run['seed'], 'budget': run['budget'], 'method': run['method']},
                      'metrics': run['metrics'], 'logs': run['attempts'][-1]['directory'], 'status': 'completed',
                      'workflowId': identity, 'created': run['attempts'][0]['started'], 'updated': projects.timestamp()}
            db.execute('INSERT OR REPLACE INTO research_records VALUES(?,?,?,?)', (record['id'], project, 'experiment', ledger.encoded(record)))
    report_id = add('report', 'report', '实验报告：' + flow['plan']['question'],
                    [source(relative + '/' + name, '完整文件') for name in ('report.md', 'analysis.json', 'protocol.json', 'runs.csv')], 'preliminary')
    conclusion = add('conclusion', 'conclusion', result['decision'] + '：' + result['nextAction'],
                     [source(relative + '/analysis.json', 'decision, comparisons, problems')], result['evidenceStatus'])
    ledger.link(project, {'source': conclusion, 'target': report_id, 'relation': 'derived_from'})
    ledger.link(project, {'source': conclusion, 'target': hypothesis, 'relation': 'contradicts' if result['evidenceStatus'] == 'refuted' else 'supports' if result['evidenceStatus'] == 'preliminary' else 'tests'})
    for run in flow['runs']:
        ledger.link(project, {'source': report_id, 'target': identity + '_' + run['id'], 'relation': 'derived_from'})
    for name in ('report.md', 'analysis.json', 'protocol.json', 'runs.csv'):
        register_resource(project, 'wf_' + identity + '_' + name.replace('.', '_'), '对照实验：' + name, relative + '/' + name)
    flow.update(analysis=result, reportPath=relative + '/report.md', evidenceIds=ids,
                stateRevisionAtReport=ledger.state(project)['revision'])
    register_goals(flow)


def publish(flow):
    project = flow['projectId']
    current = ledger.state(project)
    marker = '工作流 ' + flow['id']
    already_saved = marker in current['decisions'] and set(flow['evidenceIds']).issubset(current['evidence'])
    if not already_saved and current['revision'] != flow.get('acceptedStateRevision', flow['stateRevisionAtReport']):
        raise workspace.WorkspaceError(409, '科研状态已更新，请重新核对状态后确认报告。')
    result = flow['analysis']
    decision = marker + '：' + result['decision']
    decisions = current['decisions'] if marker in current['decisions'] else (current['decisions'] + '\n' + decision).strip()
    if not already_saved:
        ledger.save_state(project, {'revision': current['revision'], 'question': flow['plan']['question'],
        'stage': '结果已核查，待下一轮验证', 'hypotheses': flow['plan']['hypothesis'],
        'blockers': '\n'.join(result['problems']) or ('当前协议下未达到稳定收益门槛' if result['evidenceStatus'] == 'insufficient' else ''),
        'nextAction': result['nextAction'], 'decisions': decisions,
        'evidence': list(dict.fromkeys([*current['evidence'], *flow['evidenceIds']]))})
    projects.remember(project, decision + '\n' + result['nextAction'] + '\n报告：' + flow['reportPath'], 'confirmed_workflow', 'workflow_' + flow['id'])
    decision_node = ledger.put_node(project, {'id': flow['id'] + '_decision', 'kind': 'decision',
        'text': decision, 'status': result['evidenceStatus'], 'origin': 'user_confirmed_workflow',
        'sources': [{'path': flow['reportPath'], 'location': '行动建议与范围'}]}, trusted=True)
    ledger.link(project, {'source': decision_node['id'], 'target': flow['id'] + '_conclusion', 'relation': 'derived_from'})
    register_goals(flow, completed=True)
