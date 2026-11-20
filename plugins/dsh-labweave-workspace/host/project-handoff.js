import { randomUUID } from 'node:crypto'

const managementTools = new Set([
  'structured_output',
  ...[
    'project_list', 'project_get_context', 'project_create', 'project_update', 'assistant_rename',
    'feature_labels', 'feature_list', 'feature_create', 'feature_delete', 'rename_feature', 'memory_search',
    'assistant_name_get', 'plugin_list', 'plugin_create', 'plugin_rename', 'project_paradigm_create',
    'research_state_get', 'experiment_list', 'task_get',
    'global_memory_search', 'global_memory_write', 'global_memory_pin', 'schedule_list', 'schedule_create',
    'project_handoff',
  ].map(name => 'labweave_' + name),
])

export function registerProjectHandoff(ctx, { caller, rows, ownerRoute, call, output }) {
  const requests = new Map()
  const fail = (message, status = 403) => Object.assign(Error(message), { status })
  const project = projectId => rows().find(row => row.scope === projectId && row.scope !== 'global')

  async function request(agent, { projectId, task, botId, key }, signal) {
    if (caller({ agent }).row.scope !== 'global') throw fail('转交由全局助手发起。')
    const row = project(projectId)
    const clean = typeof task === 'string' ? task.trim() : ''
    if (!row || !clean || clean.length > 8000) throw fail('请明确选择项目并填写任务。', 400)
    const bot = botId && row.features.find(feature => feature.id === botId && !feature.archived)
    if (botId && !bot) throw fail('该项目 Bot 已不可用。', 409)
    const sessionId = agent.session.header.id
    const id = sessionId + '/' + (key || randomUUID())
    if (requests.has(id)) return requests.get(id)
    const { preset } = await call('assistant-permission', {}, signal)
    if (requests.has(id)) return requests.get(id)
    if (requests.size >= 256) {
      const old = [...requests].find(([, item]) => item.status === 'sent' || item.status === 'dismissed')
      if (!old) throw fail('请先处理现有的项目转交请求。', 409)
      requests.delete(old[0])
    }
    const item = { id, sessionId, projectId, projectName: row.name, task: clean, botId,
      status: preset === 'danger-full-access' ? 'ready' : 'pending' }
    requests.set(id, item)
    return item
  }

  ownerRoute('project-handoffs', ['POST'], async data => {
    const items = [...requests.values()].filter(item => item.sessionId === data.sessionId)
    if (!data.action) return items.filter(item => ['pending', 'ready', 'sending'].includes(item.status))
      .map(({ claim: _claim, ...item }) => item)
    const item = items.find(entry => entry.id === data.id)
    if (!item) throw fail('这个转交请求已不可用。', 404)
    if (data.action === 'dismiss' && ['ready', 'pending'].includes(item.status)) {
      item.status = 'dismissed'
      return { ok: true }
    }
    if (data.action === 'claim' && (item.status === 'ready' || (item.status === 'pending' && data.confirm === true))) {
      if (item.status === 'ready' && data.confirm !== true && (await call('assistant-permission', {})).preset !== 'danger-full-access') {
        if (item.status === 'ready') item.status = 'pending'
        throw fail('助手权限已变化，请确认转交。', 409)
      }
      const row = project(item.projectId)
      const workspace = row && ctx.workspaceRegistry.get(row.workspaceId)
      const sid = data.targetSessionId
      if (!workspace?.sessionIds.includes(sid) || row.botSessionIds?.includes(sid)
          || ctx.workspaceRegistry.archivedSessionIds.includes(sid)) throw fail('请选择目标项目的主会话。')
      const target = ctx.sessions.get(sid) || (await ctx.sessionQuery.filterSessions([{ kind: 'id', values: [sid] }]))[0]
      if (!target || target.header.origin === 'subagent' || target.header.cwd !== workspace.path) {
        throw fail('请选择目标项目的主会话。')
      }
      if (item.status !== 'ready' && !(item.status === 'pending' && data.confirm === true)) {
        throw fail('任务已由另一个窗口接收。', 409)
      }
      const bot = item.botId && row.features.find(feature => feature.id === item.botId && !feature.archived)
      if (item.botId && !bot) throw fail('目标 Bot 已不可用。', 409)
      item.status = 'sending'
      item.targetSessionId = sid
      item.claim = randomUUID()
      return { claim: item.claim, task: '来自全局助手的项目转交。请在本项目中处理以下用户任务。'
        + (bot ? '\n交给 Bot「' + bot.label + '」（' + bot.id + '）。' : '') + '\n\n' + item.task }
    }
    if (['sent', 'release'].includes(data.action) && item.status === 'sending' && data.claim === item.claim) {
      item.status = data.action === 'sent' ? 'sent' : 'pending'
      delete item.claim
      if (data.action === 'release') delete item.targetSessionId
      return { ok: true }
    }
    throw fail('任务状态已更新，请重新打开项目转交。', 409)
  })

  ctx.tools.guard(exec => {
    let origin
    try { origin = caller(exec) } catch { return }
    if (origin.row.scope === 'global' && !managementTools.has(exec.name)) {
      return '全局助手负责管理。具体执行请使用 labweave_project_handoff 转交项目会话。'
    }
  })
  ctx.tools.register({
    name: 'labweave_project_handoff', output,
    description: 'Hand a concrete execution task to the main conversation of an explicitly selected Weave project. Use this instead of executing it from global chat.',
    parameters: { type: 'object', additionalProperties: false, required: ['projectId', 'task'], properties: {
      projectId: { type: 'string' }, task: { type: 'string', maxLength: 8000 }, botId: { type: 'string' },
    } },
    async execute(args, exec) {
      const result = await request(exec.agent, { ...args, key: exec.callId }, exec.signal)
      return JSON.stringify({ status: result.status === 'ready' ? '将在项目会话发送' : '等待用户确认转交',
        project: result.projectName, id: result.id })
    },
  }, { when: ({ agent }) => {
    try { return caller({ agent }).row.scope === 'global' } catch { return false }
  } })
  return request
}
