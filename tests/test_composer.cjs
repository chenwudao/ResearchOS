const assert = require('node:assert/strict')
const { test } = require('node:test')

async function fixture(decision = { mode: 'EXECUTE', missing: [] }) {
  const { registerComposer } = await import('../plugins/dsh-labweave-workspace/host/composer.js')
  const rows = [
    { workspaceId: 'one', scope: 'p1', name: '项目 甲', features: [
      { id: 'notes', paradigm: 'notes', label: '核对员', botSessionId: 'bot' },
      { id: 'old', paradigm: 'notes', label: '已归档 Bot', archived: true },
    ] },
    { workspaceId: 'two', scope: 'p2', name: '乙项目', features: [
      { id: 'external', paradigm: 'engineering', label: '另一个 Bot' },
    ] },
    { workspaceId: 'global', scope: 'global', name: 'Weave', features: [] },
  ]
  const workspaces = new Map(rows.map(row => [row.workspaceId, { id: row.workspaceId, path: '/' + row.workspaceId }]))
  const sessions = new Map([['project', rows[0]], ['bot', rows[0]], ['assistant', rows[2]]]
    .map(([id, row]) => [id, { header: { id }, row }]))
  const reads = [], workers = [], transfers = []
  const routes = {}, hooks = {}
  const ctx = {
    workspaceRegistry: workspaces, sessions,
    sessionReferenceResolver: { listCandidates: async () => [] },
    on: (name, fn) => { hooks[name] = fn },
  }
  registerComposer(ctx, {
    intake: { prepare: async () => decision },
    refs: {
      memberScope: session => session?.row && { row: session.row, workspace: workspaces.get(session.row.workspaceId) },
      allowedTargets: async () => new Set(),
    },
    rows: () => rows,
    ownerRoute: (name, _methods, fn) => { routes[name] = fn },
    async call(_route, { action, args, workspace }) {
      if (action === 'files/list') return [{ id: 'file-1', name: '依据.pdf' }]
      if (action === 'sources/list') return []
      if (action === 'view') return { rails: { notes: [] } }
      if (action === 'composer/tasks') return []
      if (action === 'composer/references') return args.kind === 'library' && args.query === '核验'
        ? [{ id: 'paper-1', kind: 'library', name: '核验文献', description: '文献与资料' }] : []
      if (action === 'composer/reference') {
        assert.deepEqual([workspace.id, args], ['one', { id: 'paper-1', kind: 'library' }])
        return { title: '核验文献', text: '原文摘要' }
      }
      if (action === 'files/reference') {
        reads.push([workspace.id, args])
        return { text: '原始依据' }
      }
      throw Error(action)
    },
    delegation: { async invite(agent, actor, task) {
      workers.push({ session: agent.session.header.id, actor: actor.bot.label, project: actor.row.scope, task })
      return { status: 'completed', answer: '看到原文' }
    } },
    async handoff(agent, args) {
      transfers.push({ session: agent.session.header.id, ...args })
      return { status: 'pending' }
    },
  })
  return {
    rows, reads, workers, transfers,
    suggest: (sessionId, trigger, query = '') => routes['composer-candidates']({ sessionId, trigger, query }),
    async send(sessionId, text) {
      const messages = [{ id: 'from-user', source: { kind: 'user' }, content: [{ type: 'text', text }] }]
      return hooks['agent/pre-step']({ agent: { session: sessions.get(sessionId) }, messages,
        signal: new AbortController().signal }, async () => ({ kind: 'enter', messages }))
    },
  }
}

test('slash commands and explicit global invitation scopes differ by session', async () => {
  const { suggest, send, workers, transfers } = await fixture()
  assert.ok((await suggest('assistant', '/')).some(item => item.name === '新建项目'))
  assert.ok((await suggest('project', '/')).some(item => item.tab === 'labweave-files'))
  assert.ok((await suggest('bot', '/')).some(item => item.name === '原文核对'))
  await assert.rejects(send('bot', '/分派任务 把资料交给核对员'), /此指令在当前对话不可用/)
  const rule = await send('project', '/保存项目规则 所有结果附原始出处')
  assert.match(rule.messages.at(-1).content[0].text, /labweave_memory_write/)
  assert.deepEqual(workers, [])
  const project = (await suggest('assistant', '@')).find(item => item.name === '项目 甲')
  assert.ok(!(await suggest('assistant', '@')).some(item => item.section === '邀请发言'))
  const actor = (await suggest('assistant', '@', project.drill)).find(item => item.name === '核对员')
  const result = await send('assistant', actor.text + ' 请加入讨论')
  assert.deepEqual(workers, [])
  assert.deepEqual(transfers.map(({ session, projectId, botId }) => [session, projectId, botId]), [['assistant', 'p1', 'notes']])
  assert.equal(result.messages.at(-1).source.label, '项目转交')
})

test('a named Bot does not start work while its scope is unresolved', async () => {
  const { suggest, send, workers } = await fixture({ mode: 'CLARIFY', missing: ['data'] })
  const bot = (await suggest('project', '@')).find(item => item.name === '核对员')
  const result = await send('project', bot.text + ' 分析一下数据')
  assert.equal(result.messages.some(message => message.source.kind === 'labweave-speaker'), false)
  assert.deepEqual(workers, [])
})

test('research menus offer project commands and resolve a selected paper by project', async () => {
  const { suggest, send } = await fixture()
  assert.ok((await suggest('assistant', '/')).some(item => item.name === '转交项目'))
  assert.ok(!(await suggest('assistant', '/')).some(item => item.name === '分析数据'))
  assert.ok((await suggest('project', '/')).some(item => item.name === '生成图表'))
  assert.ok(!(await suggest('bot', '/')).some(item => item.name === '生成图表'))
  assert.ok((await suggest('bot', '/')).some(item => item.name === '查文献'))
  const category = (await suggest('project', '@')).find(item => item.drill === '文献/')
  const [paper] = await suggest('project', '@', category.drill + '核验')
  assert.equal(paper.name, '核验文献')
  const result = await send('project', '/核验证据 ' + paper.text + ' 检查原文结论')
  assert.match(result.messages.at(-1).content[0].text, /原文摘要/)
  await assert.rejects(send('assistant', paper.text), /只能引用当前项目/)
})

test('project @ is revalidated and file content follows the named invitation', async () => {
  const { rows, suggest, send, reads, workers } = await fixture()
  const options = await suggest('project', '@')
  assert.ok(!options.some(item => /已归档|另一个 Bot/.test(item.name)))
  const bot = options.find(item => item.name === '核对员')
  const file = options.find(item => item.name === '依据.pdf')
  const foreign = (await suggest('assistant', '@', '乙项目/')).find(item => item.name === '另一个 Bot')
  await assert.rejects(send('project', foreign.text), /超出当前工作区/)
  await assert.rejects(send('assistant', file.text), /只能引用当前项目/)
  assert.deepEqual(workers, [])
  assert.deepEqual(reads, [])
  const result = await send('project', bot.text + ' 核对 ' + file.text + ' 第 3 页')
  assert.deepEqual(reads, [['one', { id: 'file-1', page: 3 }]])
  assert.match(workers[0].task, /原始依据/)
  assert.equal(result.messages.at(-1).source.replyTo, 'from-user')
  rows[0].features[0].archived = true
  await assert.rejects(send('project', bot.text), /此发言者当前不可邀请/)
  const assistant = (await suggest('bot', '@')).find(item => item.name === '项目助手')
  const reply = await send('bot', assistant.text + ' 补充背景')
  assert.equal(reply.messages.at(-1).source.label, '项目助手')
})
