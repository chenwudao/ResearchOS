const assert = require('node:assert/strict')
const { test } = require('node:test')

async function fixture() {
  const { registerSessionReferences } = await import('../plugins/dsh-labweave-workspace/host/session-references.js')
  const a = { id: 'a', path: '/projects/a', sessionIds: ['current', 'same', 'archived', 'worker', 'archived-bot', 'wrong-path'] }
  const b = { id: 'b', path: '/projects/b', sessionIds: ['foreign'] }
  const global = { id: 'global', path: '/assistant', sessionIds: ['assistant', 'assistant-old'] }
  const session = (id, cwd, origin = 'user') => ({ id, header: { id, cwd, origin } })
  const records = [
    session('foreign', b.path), session('legacy', a.path), session('same', a.path),
    session('archived', a.path), session('worker', a.path, 'subagent'), session('archived-bot', a.path),
    session('wrong-path', b.path), session('current', a.path), session('assistant-old', global.path),
    session('assistant', global.path),
  ]
  const read = []
  const handlers = {}
  const ctx = {
    workspaceRegistry: { list: () => [a, b, global], archivedSessionIds: ['archived'] },
    sessionQuery: {
      filterSessions: async ([{ values }]) => records.filter(record => values.includes(record.id)),
    },
    sessionReferenceResolver: {
      config: { candidateLimit: 1 },
      listCandidates: async (_agent, query, limit) => records.filter(record => record.id.includes(query))
        .slice(0, limit).map(record => ({ sessionId: record.id })),
      async prepare(_agent, _content, references) {
        read.push(...references.map(reference => reference.sessionId))
        return 'prepared'
      },
    },
    effect: apply => apply(),
    on: (name, listener) => { handlers[name] = listener },
  }
  let rows = [{ workspaceId: a.id, features: [{ botSessionId: 'archived-bot', archived: true }] },
    { workspaceId: b.id }, { workspaceId: global.id }]
  registerSessionReferences(ctx, () => rows)
  return {
    ctx, read, handlers, find: id => records.find(record => record.id === id),
    deleteProject: () => { rows = rows.filter(row => row.workspaceId !== a.id) },
  }
}

test('native @ candidates are scoped before the result limit', async () => {
  const { ctx, find, deleteProject } = await fixture()
  const resolver = ctx.sessionReferenceResolver
  const list = (id, query = '') => resolver.listCandidates({ session: find(id) }, query)
  assert.deepEqual(await list('current'), [{ sessionId: 'same' }])
  assert.deepEqual(await list('assistant'), [{ sessionId: 'assistant-old' }])
  for (const hidden of ['foreign', 'legacy', 'archived', 'worker', 'archived-bot', 'wrong-path']) {
    assert.deepEqual(await list('current', hidden), [])
  }
  deleteProject()
  assert.deepEqual(await list('current'), [])
})

test('native reference authorization runs before DSH reads transcripts', async () => {
  const { ctx, find, read } = await fixture()
  const prepare = (...ids) => ctx.sessionReferenceResolver.prepare(
    { session: find('current') }, [], ids.map(sessionId => ({ sessionId })))
  await assert.rejects(prepare('same', 'foreign'), /只能引用当前工作区/)
  await assert.rejects(prepare('archived'), /只能引用当前工作区/)
  assert.deepEqual(read, [])
  assert.equal(await prepare('same'), 'prepared')
  assert.deepEqual(read, ['same'])
})

test('legacy snapshots that lost authorization are replaced on the model surface', async () => {
  const { handlers, find } = await fixture()
  const snapshot = (seq, sessionId) => ({
    seq, type: 'user/message', data: { source: { kind: 'session-reference', references: [{ sessionId }] } },
  })
  const session = find('current')
  session.snapshotEvents = () => [snapshot(0, 'foreign'), snapshot(1, 'same'), snapshot(2, 'archived')]
  session.surface = { nodes: [0, 1, 2] }
  const replaced = []
  session.append = (_kind, message, intent) => {
    assert.equal(message.source.kind, 'labweave-reference-unavailable')
    replaced.push(intent.sourceEventSeqs[0])
  }
  await handlers['agent/pre-step']({ agent: { session }, signal: new AbortController().signal }, () => {
    assert.deepEqual(replaced, [0, 2])
  })
})
