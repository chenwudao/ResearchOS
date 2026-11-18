"""Structured research state and project-scoped evidence, independent of chat history."""
from contextlib import closing
import hashlib
import json
from pathlib import Path
from uuid import uuid4
import project_service
import workspace

STATES = {'insufficient', 'preliminary', 'confirmed', 'refuted'}
KINDS = {'paper', 'hypothesis', 'experiment', 'conclusion', 'dataset', 'code', 'decision', 'report'}
FIELDS = ('question', 'stage', 'hypotheses', 'blockers', 'nextAction', 'decisions')


def encoded(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, allow_nan=False)


def digest(value):
    return hashlib.sha256(encoded(value).encode()).hexdigest()


def file_hash(path):
    h = hashlib.sha256()
    with path.open('rb') as source:
        for chunk in iter(lambda: source.read(1024 * 1024), b''):
            h.update(chunk)
    return h.hexdigest()


def path(project, relative):
    root = project_service.folder(project)
    if not isinstance(relative, str) or not relative:
        raise workspace.WorkspaceError(400, '请输入项目内的文件路径。')
    target = (root / relative).resolve()
    if not target.is_relative_to(root):
        raise workspace.WorkspaceError(400, '文件必须位于当前项目目录中。')
    return target


def database():
    db = workspace.database()
    db.executescript('''
        CREATE TABLE IF NOT EXISTS research_states(project TEXT PRIMARY KEY, revision INTEGER, body TEXT);
        CREATE TABLE IF NOT EXISTS research_state_history(id TEXT PRIMARY KEY, project TEXT, body TEXT);
        CREATE TABLE IF NOT EXISTS evidence_nodes(id TEXT PRIMARY KEY, project TEXT, body TEXT);
        CREATE TABLE IF NOT EXISTS evidence_edges(id TEXT PRIMARY KEY, project TEXT, source TEXT, target TEXT, relation TEXT, body TEXT);
        CREATE TABLE IF NOT EXISTS research_workflows(id TEXT PRIMARY KEY, project TEXT, revision INTEGER, body TEXT);
    ''')
    return db


def check_project(project):
    if project == 'global':
        raise workspace.WorkspaceError(400, '请选择具体课题。')
    project_service.project(workspace.snapshot(), project)


def state(project):
    check_project(project)
    with closing(database()) as db:
        row = db.execute('SELECT revision,body FROM research_states WHERE project=?', (project,)).fetchone()
    if row:
        value = {'revision': row[0], **json.loads(row[1])}
        invalid = []
        for identity in value.get('evidence', []):
            try:
                if not verify_node(project, get_node(project, identity))['valid']:
                    invalid.append(identity)
            except (OSError, workspace.WorkspaceError):
                invalid.append(identity)
        value['evidenceHealth'] = {'invalid': invalid}
        return value
    return {'revision': 0, **{key: '' for key in FIELDS}, 'evidence': [], 'proposals': []}


def save_state(project, args, *, proposal=False):
    check_project(project)
    with closing(database()) as db, db:
        db.execute('BEGIN IMMEDIATE')
        row = db.execute('SELECT revision,body FROM research_states WHERE project=?', (project,)).fetchone()
        revision = row[0] if row else 0
        body = json.loads(row[1]) if row else {**{key: '' for key in FIELDS}, 'evidence': [], 'proposals': []}
        if not proposal and args.get('revision') != revision:
            raise workspace.WorkspaceError(409, '科研状态已更新，请重新读取后保存。')
        changes = {key: workspace.text(args[key], 8000) for key in FIELDS if key in args}
        if proposal:
            body['proposals'] = [*body.get('proposals', []), {'id': uuid4().hex, 'changes': changes,
                'reason': workspace.text(args.get('reason'), 4000), 'created': project_service.timestamp()}][-30:]
        else:
            body.update(changes)
            if args.get('proposalId'):
                body['proposals'] = [p for p in body.get('proposals', []) if p['id'] != args['proposalId']]
            if 'evidence' in args:
                for identity in args['evidence']:
                    node = get_node(project, identity)
                    if not verify_node(project, node)['valid']:
                        raise workspace.WorkspaceError(409, '关联证据已变化，请重新核查。')
                body['evidence'] = args['evidence']
            body['confirmedAt'] = project_service.timestamp()
        body['updated'] = project_service.timestamp()
        db.execute('INSERT OR REPLACE INTO research_states VALUES(?,?,?)', (project, revision + 1, encoded(body)))
        db.execute('INSERT INTO research_state_history VALUES(?,?,?)',
                   (uuid4().hex, project, encoded({'revision': revision + 1, 'proposalOnly': proposal, **body})))
    return {'revision': revision + 1, **body}


def get_node(project, identity):
    with closing(database()) as db:
        row = db.execute('SELECT body FROM evidence_nodes WHERE id=? AND project=?', (identity, project)).fetchone()
    if not row:
        raise workspace.WorkspaceError(404, '证据对象不存在。')
    return json.loads(row[0])


def put_node(project, args, *, trusted=False):
    check_project(project)
    kind = args.get('kind')
    text = workspace.text(args.get('text'), 16000)
    status = args.get('status', 'insufficient')
    if kind not in KINDS or not text or status not in STATES:
        raise workspace.WorkspaceError(400, '证据类型、内容或状态无效。')
    if not trusted and status != 'insufficient':
        raise workspace.WorkspaceError(400, '助手提出的对象先记为证据不足，确认后再变更状态。')
    sources = args.get('sources', [])
    if not isinstance(sources, list) or len(sources) > 500:
        raise workspace.WorkspaceError(400, '证据来源格式无效。')
    for source in sources:
        if not isinstance(source, dict) or not source.get('location'):
            raise workspace.WorkspaceError(400, '每个来源须填写证据位置。')
        if source.get('path'):
            target = path(project, source['path'])
            if not target.is_file():
                raise workspace.WorkspaceError(400, '来源文件不存在。')
            source['sha256'] = file_hash(target)
    identity = args.get('id') if trusted else None
    node = {'id': identity or uuid4().hex, 'kind': kind, 'text': text, 'status': status,
            'sources': sources, 'created': project_service.timestamp(), 'updated': project_service.timestamp(),
            'origin': args.get('origin', 'user' if trusted else 'assistant')}
    with closing(database()) as db, db:
        existing = db.execute('SELECT project FROM evidence_nodes WHERE id=?', (node['id'],)).fetchone()
        if existing and existing[0] != project:
            raise workspace.WorkspaceError(409, '证据标识属于其他课题。')
        db.execute('INSERT OR REPLACE INTO evidence_nodes VALUES(?,?,?)', (node['id'], project, encoded(node)))
    return node


def verify_node(project, node):
    problems = []
    for source in node.get('sources', []):
        if source.get('path'):
            target = path(project, source['path'])
            if not target.is_file() or file_hash(target) != source.get('sha256'):
                problems.append(source['path'] + '：来源缺失或已变化')
    return {'valid': not problems, 'problems': problems}


def set_status(project, args):
    node = get_node(project, args.get('id'))
    status = args.get('status')
    reason = workspace.text(args.get('reason'), 4000)
    if status not in STATES or not reason:
        raise workspace.WorkspaceError(400, '请选择状态并填写核查理由。')
    verification = verify_node(project, node)
    if status in ('confirmed', 'preliminary', 'refuted') and (not node['sources'] or not verification['valid']):
        raise workspace.WorkspaceError(409, '缺少有效来源，不能确认该结论。')
    node.update(status=status, reviewReason=reason, reviewedAt=project_service.timestamp())
    with closing(database()) as db, db:
        db.execute('UPDATE evidence_nodes SET body=? WHERE project=? AND id=?', (encoded(node), project, node['id']))
    return node


def link(project, args):
    for identity in (args.get('source'), args.get('target')):
        get_node(project, identity)
    relation = args.get('relation')
    if relation not in ('supports', 'contradicts', 'tests', 'uses', 'derived_from', 'motivates'):
        raise workspace.WorkspaceError(400, '无效证据关系。')
    identity = digest([project, args['source'], args['target'], relation])
    result = {'id': identity, 'source': args['source'], 'target': args['target'], 'relation': relation,
              'note': workspace.text(args.get('note'), 2000), 'created': project_service.timestamp()}
    with closing(database()) as db, db:
        db.execute('INSERT OR REPLACE INTO evidence_edges VALUES(?,?,?,?,?,?)',
                   (identity, project, args['source'], args['target'], relation, encoded(result)))
    return result


def graph(project, query=''):
    check_project(project)
    with closing(database()) as db:
        nodes = [json.loads(r[0]) for r in db.execute('SELECT body FROM evidence_nodes WHERE project=? ORDER BY rowid DESC', (project,))]
        edges = [json.loads(r[0]) for r in db.execute('SELECT body FROM evidence_edges WHERE project=?', (project,))]
    if query:
        ids = {n['id'] for n in nodes if query.casefold() in n['text'].casefold()}
        related = {e[k] for e in edges if e['source'] in ids or e['target'] in ids for k in ('source', 'target')}
        nodes = [n for n in nodes if n['id'] in ids | related]
        edges = [e for e in edges if e['source'] in ids | related and e['target'] in ids | related]
    for node in nodes:
        node['verification'] = verify_node(project, node)
        if not node['verification']['valid']:
            node['effectiveStatus'] = 'insufficient'
        else:
            node['effectiveStatus'] = node['status']
    return {'nodes': nodes, 'edges': edges}
