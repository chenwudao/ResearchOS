"""Bounded Python matrix execution with durable attempts and automatic metadata."""
from concurrent.futures import ThreadPoolExecutor, as_completed
import csv
import json
import math
import os
from pathlib import Path
import subprocess
import sys
import time
import project_service as projects
import research_ledger as ledger
import research_workflows as flows
import sandbox_runtime
from tasks import stop_process


def metrics(path, primary):
    if path.is_symlink() or not path.is_file() or path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError('未生成指标文件，或文件超过 4 MiB。')
    if path.suffix == '.csv':
        with path.open(encoding='utf-8-sig', newline='') as source:
            rows = list(csv.DictReader(source))
        if len(rows) != 1:
            raise ValueError('CSV 指标须包含表头和恰好一行结果。')
        value = rows[0]
        for key in list(value):
            if key != 'split_id':
                try:
                    value[key] = float(value[key])
                except ValueError:
                    pass
    else:
        value = json.loads(path.read_text(encoding='utf-8-sig'))
    if not isinstance(value, dict) or type(value.get(primary)) not in (float, int) or not math.isfinite(value[primary]):
        raise ValueError('缺少有限数值的主评价指标：' + primary)
    if not isinstance(value.get('split_id'), str) or not value['split_id']:
        raise ValueError('指标须包含 split_id，才能核查不同方法是否使用同一数据划分。')
    ledger.encoded(value)
    return value


def failure_kind(error, log=''):
    message = (str(error) + ' ' + log).lower()
    if any(s in message for s in ('modulenotfounderror', 'importerror', 'no module', '解释器')):
        return 'environment'
    if any(s in message for s in ('filenotfounderror', 'dataset', '数据', 'split_id')):
        return 'data'
    if any(s in message for s in ('timeout', '超时', '预算')):
        return 'budget'
    return 'implementation'


def run_cell(project, workflow_id, run_id, event, deadline):
    while True:
        with flows.LOCK:
            flow = flows.get(project, workflow_id)
            run = next(r for r in flow['runs'] if r['id'] == run_id)
            if event.is_set() or flow['status'] != 'RUNNING' or run['status'] == 'SUCCEEDED':
                return
            if time.monotonic() >= deadline or len(run['attempts']) > flow['plan']['budget']['retries']:
                return
            plan = flow['plan']
            method = next(m for m in plan['methods'] if m['name'] == run['method'])
            number = len(run['attempts']) + 1
            relative = f'experiments/workflows/{workflow_id}/{run_id}/attempt-{number}'
            directory = ledger.path(project, relative)
            directory.mkdir(parents=True, exist_ok=True)
            output = directory / ('metrics.csv' if method.get('format') == 'csv' else 'metrics.json')
            tokens = {'{seed}': str(run['seed']), '{budget}': str(run['budget']), '{metrics}': str(output), '{output}': str(directory), '{project}': str(projects.folder(project))}
            if plan.get('environmentId'):
                output = directory / 'output' / output.name
                output.parent.mkdir()
                tokens.update({'{metrics}': '/output/' + output.name, '{output}': '/output', '{project}': '/workspace'})
            args = list(method['args'])
            for key, replacement in tokens.items():
                args = [arg.replace(key, replacement) for arg in args]
            argv = [plan['python'], str(ledger.path(project, method['script'])), *args]
            if plan.get('environmentId'):
                argv = ['/env/bin/python', '/workspace/' + Path(method['script']).as_posix(), *args]
            attempt = {'number': number, 'argv': argv, 'cwd': str(projects.folder(project)),
                       'seed': run['seed'], 'budget': run['budget'], 'started': projects.timestamp(),
                       'status': 'RUNNING', 'directory': relative, 'inputs': flow['approval']['inputs'],
                       'environment': flow['approval']['environment'], 'planHash': flow['approval']['planHash']}
            if plan.get('environmentId'):
                attempt.update(cwd='/workspace', environmentId=plan['environmentId'], sandbox='bubblewrap')
            run['attempts'].append(attempt)
            run.update(status='RUNNING', error='')
            flows.write(flow)
        process = None
        started = time.monotonic()
        error = ''
        result = None
        exit_code = None
        try:
            if flows.manifest(project, plan) != flow['approval']['inputs']:
                raise ValueError('批准后代码或数据发生变化。')
            if plan.get('environmentId'):
                exit_code = sandbox_runtime.execute(project, plan['environmentId'], method['script'], args,
                                                    output.parent, directory, plan['budget']['timeoutSeconds'],
                                                    event, deadline, seed=run['seed'])
            else:
                base_python = getattr(sys, '_base_executable', '')
                worker_python = base_python if base_python and Path(base_python).exists() else sys.executable
                with (directory / 'stdout.log').open('wb') as stdout, (directory / 'stderr.log').open('wb') as stderr:
                    process = subprocess.Popen([worker_python, '-S', str(Path(__file__).with_name('experiment_worker.py'))],
                        stdin=subprocess.PIPE, stdout=stdout, stderr=stderr,
                        creationflags=subprocess.CREATE_NO_WINDOW if os.name == 'nt' else 0,
                        start_new_session=os.name != 'nt')
                    with flows.LOCK:
                        flows.PROCESSES.setdefault(workflow_id, {})[run_id] = process
                    # On Windows process creation itself can block. Re-check the
                    # approval budget before releasing the experimental command.
                    if event.is_set():
                        raise InterruptedError('用户暂停或取消了工作流。')
                    if time.monotonic() >= min(deadline, started + plan['budget']['timeoutSeconds']):
                        raise TimeoutError('启动实验进程时预算已用尽。')
                    config = {'argv': argv, 'cwd': str(projects.folder(project)), 'parent': os.getpid(),
                              'env': {'PYTHONHASHSEED': str(run['seed']), 'OMP_NUM_THREADS': '1',
                                      'OPENBLAS_NUM_THREADS': '1', 'MKL_NUM_THREADS': '1'}}
                    process.stdin.write((json.dumps(config) + '\n').encode())
                    process.stdin.close()
                    while process.poll() is None:
                        if event.is_set():
                            raise InterruptedError('用户暂停或取消了工作流。')
                        if time.monotonic() >= deadline or time.monotonic() - started >= plan['budget']['timeoutSeconds']:
                            raise TimeoutError('实验超时或总运行预算已用尽。')
                        time.sleep(.1)
                    exit_code = process.returncode
            if exit_code:
                raise RuntimeError('实验进程退出码：' + str(exit_code))
            if event.is_set():
                raise InterruptedError('执行已中断。')
            if flows.manifest(project, plan) != flow['approval']['inputs']:
                raise ValueError('实验执行期间代码或数据发生变化，结果不能用于比较。')
            result = metrics(output, plan['protocol']['metric'])
        except Exception as exc:
            error = str(exc) or type(exc).__name__
        finally:
            if process:
                stop_process(process)
                if process.stdin and not process.stdin.closed:
                    process.stdin.close()
                process.wait()
                exit_code = process.returncode
            with flows.LOCK:
                flows.PROCESSES.get(workflow_id, {}).pop(run_id, None)
        stderr_text = (directory / 'stderr.log').read_text(encoding='utf-8', errors='replace')[-6000:] if (directory / 'stderr.log').exists() else ''
        attempt.update(ended=projects.timestamp(), durationSeconds=round(time.monotonic() - started, 3),
                       exitCode=exit_code, status='SUCCEEDED' if result is not None else 'INTERRUPTED' if event.is_set() else 'FAILED',
                       error=error, failureKind=failure_kind(error, stderr_text) if error else None)
        (directory / 'metadata.json').write_text(ledger.encoded(attempt), encoding='utf-8')
        root = projects.folder(project)
        artifacts = {str(p.relative_to(root)).replace('\\', '/'): ledger.file_hash(p)
                     for p in directory.rglob('*') if p.is_file() and not p.is_symlink()}
        with flows.LOCK:
            flow = flows.get(project, workflow_id)
            run = next(r for r in flow['runs'] if r['id'] == run_id)
            run['attempts'][-1] = attempt
            run.update(status=attempt['status'], metrics=result or {}, error=error,
                       failureKind=attempt['failureKind'], artifacts=artifacts)
            flows.write(flow)
        if result is not None or event.is_set() or number > plan['budget']['retries']:
            return


def drive(project, workflow_id, event):
    started = time.monotonic()
    initial_elapsed = flows.get(project, workflow_id)['elapsedSeconds']
    try:
        flow = flows.get(project, workflow_id)
        remaining = flow['plan']['budget']['wallSeconds'] - flow['elapsedSeconds']
        deadline = started + remaining
        pending = [r['id'] for r in flow['runs'] if r['status'] == 'PENDING']
        with ThreadPoolExecutor(max_workers=flow['plan']['budget']['concurrency']) as pool:
            futures = [pool.submit(run_cell, project, workflow_id, identity, event, deadline) for identity in pending]
            for future in as_completed(futures):
                future.result()
        with flows.LOCK:
            flow = flows.get(project, workflow_id)
            flow['elapsedSeconds'] = initial_elapsed + round(time.monotonic() - started, 3)
            if flow['status'] != 'RUNNING':
                flows.write(flow)
                return
            if any(r['status'] != 'SUCCEEDED' for r in flow['runs']):
                flow.update(status='FAILED', error='部分实验未完成。检查单元日志与剩余预算；用尽重试次数时须修订计划后重新审批。')
                flow['steps'][2]['status'] = 'FAILED'
                flows.write(flow)
                return
            flows.check_approved(flow)
            from experiment_analysis import report
            report(flow)
            flow['status'] = 'REVIEW'
            for step in flow['steps'][2:5]:
                step.update(status='SUCCEEDED', completed=projects.timestamp())
            flows.write(flow)
            from experiment_analysis import register_goals
            register_goals(flow)
    except Exception as exc:
        with flows.LOCK:
            flow = flows.get(project, workflow_id)
            flow['elapsedSeconds'] = initial_elapsed + round(time.monotonic() - started, 3)
            if flow['status'] == 'RUNNING':
                flow.update(status='FAILED', error=str(exc) or type(exc).__name__)
                flow['steps'][2]['status'] = 'FAILED'
                flows.write(flow)
    finally:
        with flows.LOCK:
            flows.ACTIVE.pop(workflow_id, None)
            flows.PROCESSES.pop(workflow_id, None)
