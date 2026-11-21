const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

const referenceServices = () => ({ effect: setup => setup(), sessionReferenceResolver: {
  config: { candidateLimit: 20 }, listCandidates: async () => [], prepare: async () => [],
} })

test('project schedule tools restrict list, edit and creation to the true session workspace', async () => {
  const { registerNative } = await import('../plugins/dsh-labweave-workspace/host/native.js')
  const rows = ['global', 'proj_a', 'proj_b'].map(scope => ({ scope, path: '/' + scope, name: scope }))
  const native = rows.map(row => ({ id: row.scope, path: row.path, title: row.scope, sessionIds: ['s-' + row.scope],
    async setTitle(title) { this.title = title } }))
  const sessions = new Map(native.map(row => { const id = row.sessionIds[0]; return [id, { id, header: { id } }] }))
  const tools = new Map(), hooks = new Map()
  const records = rows.map(row => ({ id: row.scope, title: row.scope, target: { kind: 'new_once', create: { cwd: row.path } }, updatedAt: 'rev' }))
  let scheduled
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-only')
    for await (const chunk of req) void chunk
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/catalog' ? rows : req.url === '/tools' ? [] : {}))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const ctx = { ...referenceServices(), workspaceRegistry: {
    list: () => native, get: id => native.find(w => w.id === id), resolveByPath: async path => native.find(w => w.path === path),
  }, sessions, tools: { register: definition => tools.set(definition.name, definition), guard() {} }, systemPrompt: { context() {} },
  schedule: { catalog: async () => records, view: async ({ id }) => records.find(r => r.id === id) || {},
    create: async req => { scheduled = req; return { id: 'new' } } },
  connection: { fetch: { register() {} } }, on: (name, fn) => hooks.set(name, fn) }
  try {
    await registerNative(ctx, String(server.address().port), 'test-only')
    const exec = scope => ({ agent: { session: sessions.get('s-' + scope) }, signal: new AbortController().signal })
    const list = tools.get('labweave_schedule_list')
    assert.deepEqual(JSON.parse(await list.execute({}, exec('proj_a'))).map(r => r.id), ['proj_a'])
    const create = tools.get('labweave_schedule_create')
    await assert.rejects(create.execute({ projectId: 'proj_b' }, exec('proj_a')))
    await create.execute({ title: 'Review', prompt: 'Research', rrule: 'FREQ=DAILY', projectId: 'proj_b' }, exec('global'))
    assert.equal(scheduled.target.create.cwd, '/proj_b')
    const pre = hooks.get('tools/pre-execute')
    const check = (name, args) => pre({ ...exec('proj_a'), name, arguments: args }, async () => ({ kind: 'allow' }))
    assert.equal((await check('schedule_list', {})).kind, 'deny')
    assert.equal((await check('schedule_edit', { id: 'proj_b', expectedUpdatedAt: 'rev' })).kind, 'deny')
    assert.equal((await check('schedule_edit', { id: 'proj_a' })).kind, 'deny')
    assert.equal((await check('schedule_edit', { id: 'proj_a', expectedUpdatedAt: 'rev' })).kind, 'allow')
    await assert.rejects(list.execute({}, { agent: { session: { header: { id: 's-proj_a' } } } }))
  } finally { await new Promise(resolve => server.close(resolve)) }
})

test('workspace-page feature_rename forwards scoped project action and refreshes catalog', async () => {
  const { registerNative } = await import('../plugins/dsh-labweave-workspace/host/native.js')
  const rows = ['global', 'proj_a', 'proj_b'].map(scope => ({ scope, path: '/' + scope, name: scope, workspaceId: scope }))
  const native = rows.map(row => ({ id: row.scope, path: row.path, title: row.name, sessionIds: [], async setTitle(title) { this.title = title } }))
  const routes = new Map()
  const calls = []
  let catalogReads = 0
  const server = http.createServer(async (req, res) => {
    assert.equal(req.headers.authorization, 'Bearer test-only')
    const chunks = []
    for await (const chunk of req) chunks.push(chunk)
    const body = chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null
    if (req.url === '/catalog') catalogReads += 1
    else if (req.url === '/project') calls.push(body)
    res.setHeader('Content-Type', 'application/json')
    res.end(JSON.stringify(req.url === '/catalog' ? rows : req.url === '/tools' ? [] : { labels: { chat: '课题讨论' } }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const ctx = {
    ...referenceServices(),
    workspaceRegistry: { list: () => native, get: id => native.find(w => w.id === id), resolveByPath: async p => native.find(w => w.path === p) },
    sessions: new Map(),
    tools: { register() {}, guard() {} },
    systemPrompt: { context() {} },
    schedule: { catalog: async () => [], view: async () => ({}), create: async () => ({}) },
    connection: { fetch: { register(route) { routes.set(route.path, route) } } },
    on() {},
  }
  try {
    await registerNative(ctx, String(server.address().port), 'test-only')
    const baseCatalogReads = catalogReads
    const route = routes.get('/api/labweave/workspace-page')
    assert.ok(route)
    const req = (payload) => route.fetch(new Request('http://localhost/api/labweave/workspace-page', {
      method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload),
    }))
    const okRes = await req({ workspaceId: 'proj_a', action: 'feature_rename', args: { featureId: 'chat', label: '课题讨论' } })
    assert.equal(okRes.status, 200)
    assert.deepEqual(calls, [{ workspace: { id: 'proj_a', path: '/proj_a' }, action: 'feature_rename', args: { featureId: 'chat', label: '课题讨论' } }])
    assert.ok(catalogReads > baseCatalogReads)
    const globalRes = await req({ workspaceId: 'global', action: 'feature_rename', args: { featureId: 'chat', label: 'bad' } })
    assert.equal(globalRes.status, 403)
    const missingRes = await req({ workspaceId: 'unknown', action: 'feature_rename', args: { featureId: 'chat', label: 'bad' } })
    assert.equal(missingRes.status, 403)
    native.find(w => w.id === 'proj_a').sessionIds.push('feature-session-a')
    const bind = workspaceId => req({workspaceId, action:'bot_session', args:{featureId:'ideas',sessionId:'feature-session-a'}})
    assert.equal((await bind('proj_b')).status, 403)
    assert.equal((await bind('proj_a')).status, 200)
  } finally { await new Promise(resolve => server.close(resolve)) }
})
