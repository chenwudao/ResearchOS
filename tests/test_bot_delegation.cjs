const assert = require('node:assert/strict')
const test = require('node:test')

test('one batch reserves isolated Bot workers and only archives completed assigned results', async () => {
  const { createBotDelegation } = await import('../plugins/dsh-labweave-workspace/host/bot-delegation.js')
  const bots = [
    { id: 'notes-id', label: '论文笔记', paradigm: 'notes', layout: 'library', assignments: [{ kind: 'duty', instruction: '报告页码' }] },
    { id: 'engineering-id', label: '复现实验', paradigm: 'engineering', layout: 'matrix' },
  ]
  const launches = []
  const archived = []
  const tracked = []
  let tool, draftTool, guard
  const controller = new AbortController()
  const parent = { session: { header: { id: 'parent' } } }
  let mode = 'workspace-write'
  const ctx = {
    tools: { register: definition => {
      if (definition.name === 'labweave_bot_delegate') tool = definition
      if (definition.name === 'labweave_bot_canvas_draft') draftTool = definition
    }, guard: fn => { guard = fn } },
    sandboxPolicy: { resolve: () => ({ mode }) },
    subagents: {
      getProvider: () => ({}),
      resolveMaxDepth: () => 1,
      async startActivation(spec) {
        let finish
        const result = new Promise(resolve => { finish = resolve })
        launches.push({ spec, finish })
        return { result, async dispose() {} }
      },
    },
  }
  const delegation = createBotDelegation(ctx, {
    caller: () => ({ row: { scope: 'project-a', features: bots }, workspace: { path: 'project-path' } }),
    output: {},
    async call(route, data) {
      if (route === 'bot-dispatch-start' || route === 'bot-dispatch-update') {
        tracked.push({ route, ...data })
        return { ok: true }
      }
      if (route === 'bot-dispatch-draft') {
        tracked.push({ route, ...data })
        return { id: 'draft-card' }
      }
      assert.equal(route, 'project')
      archived.push(data.args)
      return { id: 'saved-note' }
    },
  })
  const exec = { agent: parent, signal: controller.signal }
  await assert.rejects(tool.execute({ assignments: [{ featureId: 'other-project', task: 'out of scope' }] }, exec))
  const blocked = JSON.parse(await tool.execute({
    assignments: [{ featureId: bots[0].id, task: '核对下一批资料', dependsOn: ['unfinished'] }],
  }, exec))
  assert.equal(blocked[0].status, 'blocked')
  assert.match(blocked[0].detail, /前置/)
  assert.equal(launches.length, 0)
  assert.equal(tracked.length, 0)
  const pending = tool.execute({ assignments: bots.map(bot => ({ featureId: bot.id, task: bot.label })) }, exec)
  await Promise.resolve()
  assert.equal(launches.length, 2)
  assert.equal(tracked[0].parentSessionId, parent.session.header.id)
  assert.equal(tracked[0].jobs.length, 2)
  const [notes, engineering] = launches.map(run => ({ session: { header: { id: run.spec.childId } } }))
  assert.equal(delegation.binding(notes).bot.id, bots[0].id)
  assert.match(launches[0].spec.prompt[0].text, /报告页码/)
  assert.match(launches[0].spec.prompt[0].text, /weave-research-notes/)
  assert.match(launches[1].spec.prompt[0].text, /weave-research-engineering/)
  assert.equal(launches[0].spec.provider, 'spawn')
  assert.equal(guard({ agent: notes, name: 'labweave_paper_search' }), undefined)
  assert.equal(guard({ agent: notes, name: 'labweave_paper_citations' }), undefined)
  assert.equal(guard({ agent: notes, name: 'labweave_paper_neighbors' }), undefined)
  assert.equal(guard({ agent: notes, name: 'labweave_evidence_add' }), undefined)
  assert.ok(guard({ agent: notes, name: 'labweave_paper_search', arguments: { projectId: 'project-b' } }))
  assert.ok(guard({ agent: notes, name: 'labweave_experiment_list' }))
  assert.equal(guard({ agent: engineering, name: 'labweave_experiment_list' }), undefined)
  assert.ok(guard({ agent: notes, name: 'labweave_memory_search', arguments: { projectId: 'project-b' } }))
  assert.ok(guard({ agent: engineering, name: 'labweave_sandbox_run' }))
  assert.equal(guard({ agent: engineering, name: 'bash' }), undefined)
  assert.ok(guard({ agent: notes, name: 'bash' }))
  mode = 'read-only'
  assert.ok(guard({ agent: engineering, name: 'bash' }))
  assert.ok(guard({ agent: notes, name: 'labweave_evidence_add' }))
  mode = 'workspace-write'
  assert.equal(guard({ agent: notes, name: 'labweave_bot_canvas_draft' }), undefined)
  await assert.rejects(draftTool.execute({ key: 'note', title: '准备', text: '待核验' }, exec))
  await draftTool.execute({ key: 'note', title: '准备', text: '待核验' }, { ...exec, agent: notes })
  assert.equal(tracked.find(item => item.route === 'bot-dispatch-draft').id, launches[0].spec.childId)
  launches[1].finish({ stopReason: 'error' })
  launches[0].finish({ stopReason: 'completed', structured: { title: '来源', answer: '第 4 页', outcome: 'completed' } })
  const result = JSON.parse(await pending)
  assert.deepEqual(result.map(item => item.status), ['completed', 'incomplete'])
  assert.equal(result[0].recordId, 'saved-note')
  assert.deepEqual(archived.map(item => item.featureId), [bots[0].id])
  assert.equal(tracked.find(item => item.status === 'completed').result.recordId, 'saved-note')
  assert.equal(tracked.filter(item => item.status === 'running').length, 2)
  assert.ok(guard({ agent: notes, name: 'labweave_memory_search' }))
})
