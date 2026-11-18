const { test } = require('node:test')
const assert = require('node:assert/strict')
const http = require('node:http')

test('project schedule tools restrict list, edit and creation to the true session workspace', async () => {
  const { registerNative } = await import('../plugins/dsh-labweave-prototype/native.js')
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
  const ctx = { workspaceRegistry: {
    list: () => native, get: id => native.find(w => w.id === id), resolveByPath: async path => native.find(w => w.path === path),
  }, sessions, tools: { register: definition => tools.set(definition.name, definition) }, systemPrompt: { context() {} },
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
