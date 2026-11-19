"""Upgrade a real two-plugin Web profile in place with the pinned DSH runtime."""

import argparse
from datetime import UTC, datetime, timedelta
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
from pathlib import Path
import subprocess
import sys
from tempfile import TemporaryDirectory
from threading import Thread


ROOT = Path(__file__).resolve().parents[1]
OLD_PLUGIN = 'labweave-dsh-prototype'
WEAVE_PLUGIN = 'labweave-research-workspace'
API_KEY = 'sk-weave-upgrade-fixture-1234'
DEFAULT_MODEL = 'gpt-4o'
TASK_TITLE = '升级前定时任务'
BEFORE, RESUME, NEW = 'UPGRADE_BEFORE', 'UPGRADE_RESUME', 'UPGRADE_NEW_SESSION'
MARKERS = (BEFORE, RESUME, NEW)

# Use a separate Python process for each source tree so its launcher and business
# modules are loaded from that version. Both receive the same data and Web home.
RUN_WEB = """
from pathlib import Path
import subprocess
import sys
from urllib.parse import urlsplit

root = Path(sys.argv[1])
phase, browser_test = sys.argv[2:]
sys.path.insert(0, str(Path.cwd() / 'scripts'))
import native_launcher as launcher

launcher.workspace.DATA = root / 'data'
port_file = root / 'port'
port = 0 if phase == 'before' else int(port_file.read_text())
with launcher.native_services(port, home=root / 'home', configured=False, background=False) as (url, _):
    if phase == 'before':
        port_file.write_text(str(urlsplit(url).port))
    subprocess.run(['node', browser_test, phase, str(root)], input=url, text=True, check=True, timeout=160)
"""


class ModelStub(BaseHTTPRequestHandler):
    def log_message(self, *_args):
        pass

    def do_POST(self):
        request = json.loads(self.rfile.read(int(self.headers['Content-Length'])))
        messages = request['messages']
        marker = next((tag for message in reversed(messages) if message['role'] == 'user'
                       for tag in MARKERS if tag in str(message['content'])), None)
        schedule_result = next((message['content'] for message in messages
                                if message.get('tool_call_id') == 'call_upgrade_schedule'), None)
        self.server.requests.append({
            'marker': marker, 'path': self.path, 'model': request['model'],
            'authorized': self.headers.get('Authorization') == 'Bearer ' + API_KEY,
            'old_reply': any(message['role'] == 'assistant' and message.get('content') == BEFORE + '_OK'
                             for message in messages),
            'schedule_result': schedule_result,
        })
        delta = {'role': 'assistant', 'content': (marker or 'WEAVE_UPGRADE') + '_OK'}
        finish = 'stop'
        offers_schedule = any(tool['function']['name'] == 'schedule_create' for tool in request.get('tools', []))
        if marker == BEFORE and offers_schedule and schedule_result is None:
            start = datetime.now(UTC) + timedelta(days=1)
            args = {'title': TASK_TITLE, 'prompt': '复查当前会话的科研记录', 'target': 'this_session',
                    'rrule': f'DTSTART:{start:%Y%m%dT%H%M%SZ}\nRRULE:FREQ=DAILY'}
            delta = {'role': 'assistant', 'tool_calls': [{'index': 0, 'id': 'call_upgrade_schedule', 'type': 'function',
                     'function': {'name': 'schedule_create', 'arguments': json.dumps(args, ensure_ascii=False)}}]}
            finish = 'tool_calls'

        def event(content, reason):
            chunk = {'id': 'upgrade-fixture', 'object': 'chat.completion.chunk', 'created': 1, 'model': request['model'],
                     'choices': [{'index': 0, 'delta': content, 'finish_reason': reason}]}
            return 'data: ' + json.dumps(chunk) + '\n\n'

        body = (event(delta, None) + event({}, finish) + 'data: [DONE]\n\n').encode()
        self.send_response(200)
        self.send_header('Content-Type', 'text/event-stream')
        self.send_header('Content-Length', str(len(body)))
        self.end_headers()
        self.wfile.write(body)


def run_phase(source, root, phase):
    subprocess.run([sys.executable, '-c', RUN_WEB, str(root), phase,
                    str(ROOT / 'tests/integration_plugin_upgrade.cjs')], cwd=source, check=True, timeout=240)


def configure_models(home, port):
    profile = home / 'profiles/web'
    profile.mkdir(parents=True)
    credentials = home / '.credentials.yaml'
    credentials.write_text(f'version: 1\nrefs:\n  UPGRADE_API_KEY: {API_KEY}\n', encoding='utf-8')
    credentials.chmod(0o600)
    (profile / 'cordis.patch.yml').write_text(f'''- id: llm-pi-ai
  name: "@deepseek-ai/dsh-llm-pi-ai"
  config:
    providers:
      upgradegateway:
        displayName: "Upgrade Gateway"
        apiKeyEnv: UPGRADE_API_KEY
        api: openai-completions
        baseURL: "http://127.0.0.1:{port}/v1"
        models:
          - id: gpt-4o-mini
            name: GPT-4o Mini Fixture
            contextWindow: 128000
          - id: {DEFAULT_MODEL}
            name: GPT-4o Fixture
            contextWindow: 128000
- id: agent-default-model
  name: "@deepseek-ai/dsh-agent-default-model"
  config:
    provider: upgradegateway
    model: {DEFAULT_MODEL}
''', encoding='utf-8')


def old_task(home):
    tasks = json.loads((home / 'storages/schedule.json').read_text(encoding='utf-8'))['tables']['tasks']
    [(key, task)] = [(key, task) for key, task in tasks.items() if task['record']['title'] == TASK_TITLE]
    return key, task


def exercise_upgrade(old_root, root, server):
    home = root / 'home'
    profile = home / 'profiles/web'
    manifest_path = profile / 'package.json'
    configure_models(home, server.server_port)
    run_phase(old_root, root, 'before')
    proof = json.loads((root / 'session-proof.json').read_text(encoding='utf-8'))
    task = old_task(home)
    assert task[1]['target'] == {'kind': 'session', 'sessionId': proof['sessionId']}
    config_paths = (profile / 'cordis.patch.yml', profile / 'cordis.yml', home / '.credentials.yaml')
    original_config = [file.read_bytes() for file in config_paths]
    expected = json.loads(manifest_path.read_text(encoding='utf-8'))
    expected['dsh']['profile']['bundles'].remove(OLD_PLUGIN)
    expected['dependencies'].pop(OLD_PLUGIN)
    expected['dependencies'][WEAVE_PLUGIN] = 'file:' + (ROOT / 'plugins/dsh-labweave-workspace').as_posix()
    print('旧版已保存同一项目下的会话和定时任务，以及自定义模型配置。', flush=True)

    run_phase(ROOT, root, 'after')
    assert json.loads(manifest_path.read_text(encoding='utf-8')) == expected
    assert [file.read_bytes() for file in config_paths] == original_config
    assert old_task(home) == task
    for tag in MARKERS:
        matching = [request for request in server.requests if request['marker'] == tag]
        assert matching, 'Missing model request for ' + tag
        assert all(item['path'] == '/v1/chat/completions' and item['authorized'] and item['model'] == DEFAULT_MODEL
                   for item in matching), 'Wrong model or credentials for ' + tag
    assert any(item['marker'] == RESUME and item['old_reply'] for item in server.requests)
    print('升级验证通过，旧会话使用原 API 接着对话，新会话继承默认模型，定时任务仍指向旧会话。', flush=True)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--old-root', required=True, type=Path, help='Pre-merge source tree with both plugins')
    args = parser.parse_args()
    old_root = args.old_root.resolve()
    if not (old_root / 'plugins/dsh-labweave-prototype/package.json').is_file():
        parser.error('--old-root must contain the original two-plugin launcher and source')
    with TemporaryDirectory(prefix='weave-plugin-upgrade-') as temporary, \
            ThreadingHTTPServer(('127.0.0.1', 0), ModelStub) as server:
        server.requests = []
        thread = Thread(target=server.serve_forever)
        thread.start()
        try:
            exercise_upgrade(old_root, Path(temporary), server)
        except Exception:
            print('模型服务收到的测试请求:', server.requests, file=sys.stderr)
            raise
        finally:
            server.shutdown()
            thread.join()


if __name__ == '__main__':
    main()
