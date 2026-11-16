"""Approved, versioned experiment plans and resumable workflow checkpoints."""
from contextlib import closing
from itertools import product
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import threading
from uuid import uuid4
import project_service as projects
import research_ledger as ledger
import workspace

LOCK = threading.RLock()
ACTIVE = {}
PROCESSES = {}
STEPS = [('inspect', '检查数据与代码', []), ('protocol', '确认评价协议与预算', ['inspect']),
         ('execute', '执行对照实验矩阵', ['protocol']), ('analyze', '分析稳定性与门槛', ['execute']),
         ('report', '保存报告和证据', ['analyze']), ('confirm', '确认结论并更新科研状态', ['report'])]


def all_workflows(project=None):
    with closing(ledger.database()) as db:
        rows = db.execute('SELECT body,revision FROM research_workflows' + (' WHERE project=?' if project else '') + ' ORDER BY rowid DESC', (project,) if project else ())
        return [{**json.loads(row[0]), 'revision': row[1]} for row in rows]


def get(project, identity):
    ledger.check_project(project)
    with closing(ledger.database()) as db:
        row = db.execute('SELECT body,revision FROM research_workflows WHERE project=? AND id=?', (project, identity)).fetchone()
    if not row:
        raise workspace.WorkspaceError(404, '科研工作流不存在。')
    return {**json.loads(row[0]), 'revision': row[1]}


def write(value, db=None):
    """Call inside LOCK in the HTTP/controller process or a database transaction."""
    value['updated'] = projects.timestamp()
    value['revision'] = value.get('revision', 0) + 1
    if db is None:
        with closing(ledger.database()) as connection, connection:
            write_row(connection, value)
    else:
        write_row(db, value)
    return value


def write_row(db, value):
    if value['revision'] == 1:
        db.execute('INSERT INTO research_workflows VALUES(?,?,?,?)',
                   (value['id'], value['projectId'], value['revision'], ledger.encoded(value)))
    else:
        result = db.execute('UPDATE research_workflows SET revision=?,body=? WHERE id=? AND project=? AND revision=?',
                            (value['revision'], ledger.encoded(value), value['id'], value['projectId'], value['revision'] - 1))
        if result.rowcount != 1:
            raise workspace.WorkspaceError(409, '计划已被其他操作更新，请刷新。')


def bounded(value, name, low, high):
    if type(value) is not int or not low <= value <= high:
        raise workspace.WorkspaceError(400, f'{name}必须是 {low}–{high} 的整数。')
    return value


def validate(project, plan):
    if not isinstance(plan, dict):
        raise workspace.WorkspaceError(400, '计划必须是 JSON 对象。')
    plan = json.loads(ledger.encoded(plan))
    for field in ('question', 'hypothesis'):
        if not workspace.text(plan.get(field), 8000):
            raise workspace.WorkspaceError(400, '请填写研究问题和待检验假设。')
    methods = plan.get('methods', [])
    if not isinstance(methods, list) or not 2 <= len(methods) <= 20:
        raise workspace.WorkspaceError(400, '对照实验需要 2–20 个方法。')
    names = []
    for method in methods:
        if not isinstance(method, dict) or method.get('format', 'json') not in ('json', 'csv'):
            raise workspace.WorkspaceError(400, '方法必须为对象，指标格式仅支持 json/csv。')
        name = workspace.text(method.get('name'), 120)
        script = ledger.path(project, method.get('script'))
        if not name or name in names or not script.is_file() or script.suffix != '.py':
            raise workspace.WorkspaceError(400, '方法名称须唯一，且 Python 脚本必须存在。')
        names.append(name)
        args = method.get('args', ['--seed', '{seed}', '--budget', '{budget}', '--metrics', '{metrics}'])
        if not isinstance(args, list) or not all(isinstance(a, str) for a in args):
            raise workspace.WorkspaceError(400, '脚本参数必须是字符串数组。')
        if not all(token in '\n'.join(args) for token in ('{seed}', '{budget}', '{metrics}')):
            raise workspace.WorkspaceError(400, '参数中须包含 {seed}、{budget}、{metrics} 占位符。')
        method['args'] = args
        method['name'] = name
    matrix = plan.get('matrix', {})
    if not isinstance(matrix, dict):
        raise workspace.WorkspaceError(400, '实验矩阵必须是对象。')
    for key in ('seeds', 'budgets'):
        values = matrix.get(key, [])
        if not isinstance(values, list) or not values or not all(type(v) is int for v in values) or len(values) != len(set(values)):
            raise workspace.WorkspaceError(400, '随机种子与样本预算须为非空且不重复的整数列表。')
        for value in values:
            bounded(value, key, 0 if key == 'seeds' else 1, 2147483647)
    protocol = plan.get('protocol', {})
    if not isinstance(protocol, dict):
        raise workspace.WorkspaceError(400, '评价协议必须是对象。')
    if not protocol.get('metric') or protocol.get('direction') not in ('maximize', 'minimize') or protocol.get('baseline') not in names or not protocol.get('split'):
        raise workspace.WorkspaceError(400, '须定义主指标、优化方向、基线方法和数据划分协议。')
    protocol['minSeeds'] = bounded(protocol.get('minSeeds', 3), '最少种子数', 2, 100)
    for key, default in (('minImprovement', .01), ('maxStd', .05)):
        value = protocol.setdefault(key, default)
        if type(value) not in (int, float) or not math.isfinite(value) or value < 0:
            raise workspace.WorkspaceError(400, '收益门槛和波动门槛须为非负有限数值。')
    protocol['requireSplitId'] = True
    budget = plan.get('budget', {})
    if not isinstance(budget, dict):
        raise workspace.WorkspaceError(400, '资源预算必须是对象。')
    count = len(methods) * len(matrix['seeds']) * len(matrix['budgets'])
    budget['maxRuns'] = bounded(budget.get('maxRuns', count), '最多实验数', count, 1000)
    budget['concurrency'] = bounded(budget.get('concurrency', 2), '并发数', 1, min(8, os.cpu_count() or 1))
    budget['timeoutSeconds'] = bounded(budget.get('timeoutSeconds', 120), '单次超时秒数', 1, 86400)
    budget['retries'] = bounded(budget.get('retries', 1), '失败重试次数', 0, 3)
    budget['wallSeconds'] = bounded(budget.get('wallSeconds', 1800), '总运行秒数预算', 1, 86400)
    inputs = plan.get('inputs', [])
    if not isinstance(inputs, list) or not inputs:
        raise workspace.WorkspaceError(400, '请声明至少一个数据文件，并列出所有依赖的代码或配置文件。')
    for value in inputs:
        if not ledger.path(project, value).is_file():
            raise workspace.WorkspaceError(400, '输入文件不存在：' + str(value))
    if plan.get('python') and not isinstance(plan['python'], str):
        raise workspace.WorkspaceError(400, '解释器路径必须是字符串。')
    interpreter = Path(plan.get('python') or sys.executable).resolve()
    if not interpreter.is_file():
        raise workspace.WorkspaceError(400, 'Python 解释器不存在。')
    plan.update(python=str(interpreter), budget=budget, protocol=protocol)
    return plan


def draft(project, args):
    ledger.check_project(project)
    plan = validate(project, args.get('plan'))
    with LOCK, closing(ledger.database()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        identity = args.get('id')
        if identity:
            row = db.execute('SELECT body,revision FROM research_workflows WHERE id=? AND project=?', (identity, project)).fetchone()
            if not row:
                raise workspace.WorkspaceError(404, '计划不存在。')
            old = json.loads(row[0])
            if old['status'] != 'DRAFT' or row[1] != args.get('revision'):
                raise workspace.WorkspaceError(409, '只可编辑当前版本的草案；已批准计划须另建修订版本。')
            revision = row[1]
        else:
            revision = 0
        parent = args.get('parentId')
        if parent:
            get(project, parent)
        value = {'id': identity or uuid4().hex, 'projectId': project, 'revision': revision,
                 'plan': plan, 'status': 'DRAFT', 'parentId': parent, 'created': projects.timestamp(),
                 'steps': [{'id': key, 'title': title, 'dependsOn': deps, 'status': 'PENDING'} for key, title, deps in STEPS],
                 'runs': [], 'approval': None, 'elapsedSeconds': 0, 'error': ''}
        return write(value, db)


def environment(python, root):
    flags = {'creationflags': subprocess.CREATE_NO_WINDOW} if os.name == 'nt' else {}
    result = subprocess.run([python, '-c', 'import json,sys,platform,importlib.metadata as m;print(json.dumps({"python":sys.version,"platform":platform.platform(),"packages":sorted((d.metadata["Name"],d.version) for d in m.distributions())}))'],
                            capture_output=True, text=True, encoding='utf-8', timeout=30, check=True, **flags)
    data = json.loads(result.stdout)
    try:
        commit = subprocess.run(['git', '-C', str(root), 'rev-parse', 'HEAD'], capture_output=True, text=True, timeout=10)
        dirty = subprocess.run(['git', '-C', str(root), 'status', '--porcelain'], capture_output=True, text=True, encoding='utf-8', timeout=10)
        data['git'] = {'commit': commit.stdout.strip() if commit.returncode == 0 else None,
                       'dirty': dirty.stdout.splitlines() if dirty.returncode == 0 else [],
                       'scope': str(root)}
    except (OSError, subprocess.SubprocessError):
        data['git'] = {'commit': None, 'dirty': [], 'scope': str(root)}
    return data


def manifest(project, plan):
    names = set(plan['inputs']) | {m['script'] for m in plan['methods']}
    return {name: ledger.file_hash(ledger.path(project, name)) for name in sorted(names)}


def artifacts_valid(project, run):
    return bool(run.get('artifacts')) and all(ledger.path(project, p).is_file() and ledger.file_hash(ledger.path(project, p)) == h for p, h in run['artifacts'].items())


def check_approved(value):
    approval = value.get('approval')
    project = value['projectId']
    if not approval or approval['planHash'] != ledger.digest(value['plan']):
        raise workspace.WorkspaceError(409, '计划尚未批准或已变化。')
    try:
        if manifest(project, value['plan']) != approval['inputs']:
            raise workspace.WorkspaceError(409, '代码或数据已变化，请创建修订计划并重新审批。')
        env = environment(value['plan']['python'], projects.folder(project))
        if ledger.digest({k: env[k] for k in ('python', 'packages')}) != approval['environmentHash']:
            raise workspace.WorkspaceError(409, 'Python 环境已变化，请重新审批修订计划。')
    except (OSError, subprocess.SubprocessError) as exc:
        raise workspace.WorkspaceError(409, '无法验证原执行环境或文件，请核查后修订计划。') from exc
    for run in value['runs']:
        if run['status'] == 'SUCCEEDED' and not artifacts_valid(project, run):
            raise workspace.WorkspaceError(409, '已完成实验的产物发生变化，不能静默复用；请创建修订计划。')


def approve(project, args):
    with LOCK:
        value = get(project, args.get('id'))
        if value['status'] != 'DRAFT' or value['revision'] != args.get('revision'):
            raise workspace.WorkspaceError(409, '计划已变化，请重新查看并确认。')
        plan = validate(project, value['plan'])
        env = environment(plan['python'], projects.folder(project))
        inputs = manifest(project, plan)
        value['approval'] = {'at': projects.timestamp(), 'planHash': ledger.digest(plan), 'inputs': inputs,
                             'environment': env, 'environmentHash': ledger.digest({k: env[k] for k in ('python', 'packages')}),
                             'maxAttempts': len(plan['methods']) * len(plan['matrix']['seeds']) * len(plan['matrix']['budgets']) * (plan['budget']['retries'] + 1)}
        value['plan'] = plan
        value['runs'] = [{'id': uuid4().hex, 'method': method['name'], 'seed': seed, 'budget': budget,
                          'status': 'PENDING', 'attempts': [], 'metrics': {}, 'error': ''}
                         for method, seed, budget in product(plan['methods'], plan['matrix']['seeds'], plan['matrix']['budgets'])]
        value['status'] = 'APPROVED'
        for step in value['steps'][:2]:
            step.update(status='SUCCEEDED', completed=projects.timestamp())
        write(value)
        from experiment_analysis import register_goals
        register_goals(value)
        return value


def launch(project, args):
    with LOCK:
        value = get(project, args.get('id'))
        if value['status'] not in ('APPROVED', 'PAUSED', 'FAILED', 'CANCELLED') or value['id'] in ACTIVE:
            raise workspace.WorkspaceError(409, '当前工作流不可启动。')
        if value['elapsedSeconds'] >= value['plan']['budget']['wallSeconds']:
            raise workspace.WorkspaceError(409, '总运行预算已用尽，请修订预算并重新审批。')
        check_approved(value)
        for run in value['runs']:
            if run['status'] != 'SUCCEEDED' and len(run['attempts']) <= value['plan']['budget']['retries']:
                run['status'] = 'PENDING'
        event = threading.Event()
        ACTIVE[value['id']] = {'stop': event, 'thread': None}
        value.update(status='RUNNING', error='', startedAt=projects.timestamp())
        value['steps'][2]['status'] = 'RUNNING'
        write(value)
        from experiment_runner import drive
        thread = threading.Thread(target=drive, args=(project, value['id'], event), daemon=True, name='research-' + value['id'][:8])
        ACTIVE[value['id']]['thread'] = thread
        thread.start()
        return value


def stop(project, args, *, cancel=False):
    with LOCK:
        value = get(project, args.get('id'))
        if value['status'] != 'RUNNING':
            return value
        value['status'] = 'CANCELLED' if cancel else 'PAUSED'
        value['steps'][2]['status'] = value['status']
        write(value)
        if value['id'] in ACTIVE:
            ACTIVE[value['id']]['stop'].set()
        processes = list(PROCESSES.get(value['id'], {}).values())
    from tasks import stop_process
    for process in processes:
        stop_process(process)
    return value


def recover():
    with LOCK:
        for value in all_workflows():
            if value['status'] == 'RUNNING':
                from datetime import datetime, timezone
                if value.get('startedAt'):
                    value['elapsedSeconds'] += max(0, (datetime.now(timezone.utc) - datetime.fromisoformat(value['startedAt'])).total_seconds())
                value.update(status='PAUSED', error='服务中断；已完成产物将校验后复用，未完成单元需重新运行。')
                value['steps'][2]['status'] = 'PAUSED'
                for run in value['runs']:
                    if run['status'] == 'RUNNING':
                        run.update(status='INTERRUPTED', error='执行进程中断')
                        if run['attempts']:
                            run['attempts'][-1].update(status='INTERRUPTED', ended=projects.timestamp())
                write(value)


def shutdown():
    for value in all_workflows():
        if value['id'] in ACTIVE:
            stop(value['projectId'], {'id': value['id']})
    for active in list(ACTIVE.values()):
        if active['thread']:
            active['thread'].join(timeout=15)


def accept(project, args):
    with LOCK:
        value = get(project, args.get('id'))
        if value['status'] == 'SUCCEEDED':
            return value
        if value['status'] != 'REVIEW' or value['revision'] != args.get('revision'):
            raise workspace.WorkspaceError(409, '只有当前版本的完整报告可以确认。')
        check_approved(value)
        evidence = value['evidenceIds']
        for identity in evidence:
            node = ledger.get_node(project, identity)
            if not ledger.verify_node(project, node)['valid']:
                raise workspace.WorkspaceError(409, '报告或证据已变化。')
        from experiment_analysis import publish
        value['acceptedStateRevision'] = args.get('stateRevision', value['stateRevisionAtReport'])
        publish(value)
        value['status'] = 'SUCCEEDED'
        value['steps'][-1].update(status='SUCCEEDED', completed=projects.timestamp())
        return write(value)
