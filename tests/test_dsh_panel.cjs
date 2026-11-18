const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')

const source = fs.readFileSync(path.join(__dirname, '../plugins/dsh-labweave-prototype/client.js'), 'utf8')
let plugin
const React = {
  createElement(type, props, ...children) { return { type, props: props || {}, children } },
  useState(initial) { return [initial, () => {}] },
  useEffect() {},
}
vm.runInNewContext(source, {
  window: { __ModuleLoader__: { load(definition) { plugin = definition.factory((name) => {
    assert.equal(name, 'react')
    return React
  }) } } },
})
const registrations = []
plugin.apply({ slots: {
  inject(name, callback) { callback() },
  register(options, component) { registrations.push({ ...options, component }) },
} })
assert.ok(!registrations.some((item) => item.name === 'main' || item.name === 'sidebar.workspaces'),
  'native conversation and workspace tree must not be replaced')
assert.ok(!registrations.some((item) => item.name === 'sidebar.footer.action'),
  'the native new-session control is the single conversation entry')
assert.ok(registrations.some((item) => item.name === 'sidebar.brand.name'), 'the native brand seat must be registered')
;(async () => {
  const host = await import('../plugins/dsh-labweave-prototype/index.js')
  const routes = []
  host.apply({ connection: { fetch: { register(value) { routes.push(value) } } } })
  assert.deepEqual(routes.map((route) => route.path), ['/api/labweave/assistant-name'],
    'only the owner-authorized assistant name route should be exposed')
  assert.deepEqual(routes[0].methods, ['GET', 'POST'])
  let upstream
  const fakeBackend = async (url, options) => {
    upstream = { url, options }
    return Response.json({ name: 'goat', secret: 'not returned' })
  }
  const response = await host.assistantNameRequest(new Request('http://localhost/api/labweave/assistant-name'), fakeBackend)
  assert.deepEqual(await response.json(), { name: 'goat' })
  assert.equal(upstream.url, 'http://127.0.0.1:8765/api/workspace/assistant/name')
  assert.equal(upstream.options.redirect, 'error')
  assert.equal(response.headers.get('cache-control'), 'no-store')
  const unicode = await host.assistantNameRequest(new Request('http://localhost/api/labweave/assistant-name'),
    async () => Response.json({ name: '🧪'.repeat(80) }))
  assert.equal(unicode.status, 200)
  assert.equal((await unicode.json()).name, '🧪'.repeat(80))
  const post = new Request('http://localhost/api/labweave/assistant-name', { method: 'POST', body: JSON.stringify({ name: '新名字' }) })
  assert.equal((await host.assistantNameRequest(post, fakeBackend)).status, 200)
  assert.deepEqual(JSON.parse(upstream.options.body), { name: '新名字' })
  const invalid = new Request('http://localhost/api/labweave/assistant-name', { method: 'POST', body: JSON.stringify({ name: 'x', extra: true }) })
  assert.equal((await host.assistantNameRequest(invalid, fakeBackend)).status, 400)
  const offline = await host.assistantNameRequest(new Request('http://localhost/api/labweave/assistant-name'), async () => { throw new Error('offline') })
  assert.equal(offline.status, 503)
  const fixture = { revision: 1, settings: { secret: 'private' }, state: { projects: [
    { id: 'test', name: '测试项目', notes: 'private', rails: { ideas: ['private'] } },
  ] } }
  const selected = await host.loadProjects(async (url, options) => {
    assert.equal(url, 'http://127.0.0.1:8765/api/workspace/state')
    assert.equal(options.redirect, 'error')
    return Response.json(fixture)
  })
  assert.deepEqual(selected, [{ id: 'test', name: '测试项目' }])
  assert.deepEqual(await host.loadProjects(async () => Response.json({ revision: 0 })), [])
  await assert.rejects(host.loadProjects(async () => new Response('offline', { status: 503 })))
  await assert.rejects(host.loadProjects(async () => Response.json({ revision: 1, state: {} })))
  await assert.rejects(host.loadProjects(async () => Response.json(fixture), 0))
  console.log('DSH native controls, owner name bridge and data minimization passed')
})().catch((error) => { console.error(error); process.exitCode = 1 })
