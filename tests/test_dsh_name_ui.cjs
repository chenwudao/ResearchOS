const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const vm = require('node:vm')
const { test } = require('node:test')

const source = fs.readFileSync(path.join(__dirname, '../plugins/dsh-labweave-prototype/client.js'), 'utf8')

function fixture() {
  const hooks = []
  const effects = []
  const listeners = new Map()
  const requests = []
  let index = 0
  let currentName = 'goat'
  let offline = false
  let rejectSave = false
  let plugin
  const React = {
    createElement(type, props, ...children) { return { type, props: props || {}, children } },
    useState(initial) {
      const at = index++
      if (!(at in hooks)) hooks[at] = initial
      return [hooks[at], (value) => { hooks[at] = typeof value === 'function' ? value(hooks[at]) : value }]
    },
    useEffect(callback, deps) {
      const at = index++
      const old = hooks[at]
      if (!old || deps.some((value, i) => value !== old.deps[i])) {
        effects.push(() => { if (old?.cleanup) old.cleanup(); hooks[at] = { deps, cleanup: callback() } })
      }
    },
  }
  const win = {
    __ModuleLoader__: { load(definition) { plugin = definition.factory(() => React) } },
    addEventListener(name, callback) { listeners.set(name, callback) },
    removeEventListener(name) { listeners.delete(name) },
    dispatchEvent(event) { listeners.get(event.type)?.() },
  }
  const fakeFetch = async (url, options) => {
    requests.push({ url, options })
    if (offline) throw new Error('offline')
    if (options.method === 'POST') {
      if (rejectSave) return Response.json({ error: 'unavailable' }, { status: 503 })
      currentName = JSON.parse(options.body).name
    }
    return Response.json({ name: currentName })
  }
  vm.runInNewContext(source, { window: win, fetch: fakeFetch, Event, AbortController, AbortSignal })
  const registrations = []
  plugin.apply({ slots: { inject(_name, callback) { callback() }, register(options, component) { registrations.push({ ...options, component }) } } })
  const setting = registrations.find((item) => item.name === 'settings.general.item')
  const brand = registrations.find((item) => item.name === 'sidebar.brand.name')
  function render(component = setting.component) {
    index = 0
    const view = component()
    while (effects.length) effects.shift()()
    return view
  }
  return { setting, brand, render, requests,
    setOffline(value) { offline = value }, setRejectSave(value) { rejectSave = value } }
}

function find(node, predicate) {
  if (!node || typeof node !== 'object') return null
  if (predicate(node)) return node
  for (const child of node.children || []) { const value = find(child, predicate); if (value) return value }
  return null
}

const flush = () => new Promise((resolve) => setImmediate(resolve))

test('native general setting reads, validates, saves and updates name through the same-origin bridge', async () => {
  const f = fixture()
  assert.ok(f.setting && f.brand)
  let view = f.render()
  assert.ok(find(view, (node) => node.props.role === 'status'))
  await flush(); await flush()
  view = f.render()
  assert.equal(find(view, (node) => node.type === 'input').props.value, 'goat')
  assert.equal(f.requests[0].url, '/api/labweave/assistant-name')
  assert.equal(f.requests[0].options.credentials, 'same-origin')
  find(view, (node) => node.type === 'input').props.onChange({ target: { value: '科研伙伴' } })
  view = f.render()
  await view.props.onSubmit({ preventDefault() {} })
  view = f.render()
  assert.equal(find(view, (node) => node.type === 'input').props.value, '科研伙伴')
  assert.equal(find(view, (node) => node.props.role === 'status').children[0], '已保存。')
  assert.equal(f.requests[1].url, '/api/labweave/assistant-name')
  assert.deepEqual(JSON.parse(f.requests[1].options.body), { name: '科研伙伴' })
  assert.equal(f.requests[1].options.credentials, 'same-origin')
  assert.equal(f.requests[1].options.redirect, 'error')
})

test('offline and failed saves are visible, retain input and do not claim success', async () => {
  const f = fixture()
  f.setOffline(true)
  f.render(); await flush(); await flush()
  let view = f.render()
  assert.match(find(view, (node) => node.props.role === 'alert').children[0], /无法读取/)
  f.setOffline(false)
  find(view, (node) => node.type === 'button' && node.children.includes('重试')).props.onClick()
  f.render(); await flush(); await flush()
  view = f.render()
  find(view, (node) => node.type === 'input').props.onChange({ target: { value: '新名字' } })
  f.setRejectSave(true)
  view = f.render()
  await view.props.onSubmit({ preventDefault() {} })
  view = f.render()
  assert.equal(find(view, (node) => node.type === 'input').props.value, '新名字')
  assert.match(find(view, (node) => node.props.role === 'alert').children[0], /保存失败/)
  assert.equal(find(view, (node) => node.props.role === 'status'), null)
})

test('brand displays the persisted name or an honest loading/error state', async () => {
  const f = fixture()
  let view = f.render(f.brand.component)
  assert.match(JSON.stringify(view), /正在加载助手名称/)
  await flush(); await flush()
  view = f.render(f.brand.component)
  assert.match(JSON.stringify(view), /全局助手 · goat/)
  assert.match(JSON.stringify(view), /leaweave/)
})

test('brand reports unavailable rather than presenting a guessed name when offline', async () => {
  const f = fixture()
  f.setOffline(true)
  f.render(f.brand.component)
  await flush(); await flush()
  const view = f.render(f.brand.component)
  assert.match(JSON.stringify(view), /助手名称不可用/)
  assert.doesNotMatch(JSON.stringify(view), /全局助手 · goat/)
})
