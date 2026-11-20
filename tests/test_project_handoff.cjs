const assert = require('node:assert/strict')
const { test } = require('node:test')

test('global handoffs obey the assistant preset and can only be sent once to a project main session', async () => {
  const { registerProjectHandoff } = await import('../plugins/dsh-labweave-workspace/host/project-handoff.js')
  const global = { scope: 'global' }
  const project = { scope: 'project', workspaceId: 'project-workspace', name: '课题',
    botSessionIds: ['bot'], features: [{ id: 'engineer', label: '工程台' }] }
  const sessions = new Map(['main', 'bot', 'other'].map(id => [id, { header: { id, cwd: '/project' } }]))
  const workspace = { path: '/project', sessionIds: ['main', 'bot'] }
  const agent = { session: { header: { id: 'global-chat' } } }
  let preset = 'read-only', route, guard
  const request = registerProjectHandoff({
    sessions, workspaceRegistry: { get: id => id === project.workspaceId ? workspace : null, archivedSessionIds: [] },
    tools: { register() {}, guard: fn => { guard = fn } },
  }, {
    caller: () => ({ row: global }),
    rows: () => [global, project],
    ownerRoute: (_name, _methods, handler) => { route = handler },
    call: async () => ({ preset }),
  })
  assert.match(guard({ agent, name: 'bash' }), /转交项目会话/)
  assert.equal(guard({ agent, name: 'labweave_project_handoff' }), undefined)
  const pending = await request(agent, { projectId: project.scope, task: '运行对照实验', botId: 'engineer', key: 'one' })
  const operate = (item, action, extra = {}) => route({ id: item.id, sessionId: 'global-chat', action, ...extra })
  assert.equal(pending.status, 'pending')
  await assert.rejects(operate(pending, 'claim', { targetSessionId: 'main' }))
  for (const targetSessionId of ['bot', 'other']) {
    await assert.rejects(operate(pending, 'claim', { targetSessionId, confirm: true }), /项目的主会话/)
  }
  const claimed = await operate(pending, 'claim', { targetSessionId: 'main', confirm: true })
  assert.match(claimed.task, /工程台.*engineer/)
  await operate(pending, 'sent', { claim: claimed.claim })
  await assert.rejects(operate(pending, 'claim', { targetSessionId: 'main', confirm: true }))
  preset = 'danger-full-access'
  const ready = await request(agent, { projectId: project.scope, task: '整理实验', key: 'two' })
  assert.equal(ready.status, 'ready')
  assert.ok((await operate(ready, 'claim', { targetSessionId: 'main' })).claim)
  const downgraded = await request(agent, { projectId: project.scope, task: '第三个任务', key: 'three' })
  preset = 'workspace-write'
  await assert.rejects(operate(downgraded, 'claim', { targetSessionId: 'main' }), /权限已变化/)
  assert.equal(downgraded.status, 'pending')
})
