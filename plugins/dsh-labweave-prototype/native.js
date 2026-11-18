// DSH 0.2.2-rc.2 supplies the calling Agent on each native tool execution.
import { registerSandboxTools } from './sandbox.js'
import { botAssignments } from './bot-assignments.js'
import { historyReader, intervalSeconds } from './assistant-history.js'
function failure(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

export function sessionWorkspace(registry, sessionId) {
  if (typeof sessionId !== 'string' || !sessionId) throw failure('需要已绑定的会话。', 403)
  const matches = registry.list().filter(row => row.sessionIds.includes(sessionId))
  if (matches.length !== 1) throw failure('会话未关联到唯一的科研工作区。', 403)
  return { id: matches[0].id, path: matches[0].path }
}

function scheduleMatches(record, workspace, native) {
  const target = record.target
  if (!target) return false
  return target.kind === 'session' ? native.sessionIds.includes(target.sessionId)
    : target.create?.cwd === workspace.path
}

function privateClient(port, token) {
  if (!/^\d+$/.test(port) || +port < 1 || +port > 65535 || !token) throw Error('Invalid local bridge configuration')
  return async (route, data = {}, signal) => {
    const timeout = AbortSignal.timeout(['project','tool','sandbox-tool'].includes(route) ? 150000 : 15000)
    const response = await fetch(`http://127.0.0.1:${port}/${route}`, {
      method: 'POST', redirect: 'error', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
      body: JSON.stringify(data), signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    })
    const value = await response.json()
    if (!response.ok) throw failure(value.error || '本地服务不可用。', response.status)
    return value
  }
}

export async function registerNative(ctx, port, token) {
  const call = privateClient(port, token)
  const registry = ctx.workspaceRegistry
  let rows = []
  let pending
  let globalProfile = null
  let projectCoreMemories = new Map()
  const refreshGlobalProfile = () => call('assistant-profile', {})
    .then(value => { if (value && typeof value.name === 'string') globalProfile = value; return value })
    .catch(() => null)
  async function synchronize() {
    const catalog = await call('catalog')
    const next = []
    const nextCore = new Map()
    for (const item of catalog) {
      let native = await registry.resolveByPath(item.path)
      if (item.boundId && native?.id !== item.boundId) {
        // Removing a native registration never silently reassigns its sessions.
        if (item.scope === 'global') throw failure('全局工作区绑定已失效，请恢复原生工作区备份。', 409)
        continue
      }
      if (!native && item.scope === 'global') {
        await registry.initializeDefault(async () => item.path)
        native = await registry.resolveByPath(item.path)
      }
      native ??= await registry.create(item.path, item.name)
      await call('bind', { scope: item.scope, workspace: { id: native.id, path: native.path } })
      // DSH's schedule editor explicitly defaults to the workspace with this reserved title.
      const title = item.scope === 'global' ? 'default-workspace'
        : item.name === 'default-workspace' ? 'default-workspace (项目)' : item.name
      if (native.title !== title) await native.setTitle(title)
      nextCore.set(native.id, Array.isArray(item.coreMemories) ? item.coreMemories : [])
      next.push({ workspaceId: native.id, scope: item.scope, name: item.name,
        ...(item.scope === 'global' ? {
          tagline: item.tagline || '',
          hasCustomAvatar: Boolean(item.hasCustomAvatar),
          avatar: item.avatar || '',
        } : {}),
        features: item.features || [], botSessionIds: item.botSessionIds || [] })
    }
    projectCoreMemories = nextCore
    rows = next
    return rows
  }
  function sync() {
    pending ??= synchronize().finally(() => { pending = undefined })
    return pending
  }
  await sync()
  void refreshGlobalProfile()
  const refreshAfterWrite = async () => {
    if (pending) await pending
    return sync()
  }

  function ownerRoute(path, methods, handler) {
    ctx.connection.fetch.register({ path: '/api/labweave/' + path, methods, requestBody: 'buffered',
      async fetch(request) {
        try {
          const data = request.method === 'POST' ? await request.json() : {}
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('无效请求。')
          const value = await handler(data)
          return Response.json(value, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          return Response.json({ error: error.status ? error.message : '科研服务暂不可用，请重试。' },
            { status: error.status || 503, headers: { 'Cache-Control': 'no-store' } })
        }
      },
    })
  }
  ownerRoute('assistant-name', ['GET', 'POST'], async data => {
    if (Object.keys(data).some(k => k !== 'name')) throw failure('无效名称。')
    const result = await call('name', data)
    if ('name' in data) {
      await refreshAfterWrite()
      void refreshGlobalProfile()
    }
    return result
  })
  ownerRoute('assistant-profile', ['GET', 'POST'], async data => {
    const isMutation = Object.keys(data).length > 0 && data.action !== 'memory_search'
    const result = await call('assistant-profile', data)
    if (result && typeof result.name === 'string' && !('query' in result)) globalProfile = result
    if (isMutation) await refreshAfterWrite()
    return result
  })
  ownerRoute('catalog', ['GET'], sync)
  ownerRoute('dialog-delivery', ['POST'], data => call('dialog-delivery', {
    workspace: sessionWorkspace(registry, data.sessionId), sessionId: data.sessionId,
    runId: data.runId, file: data.file,
  }))
  const readHistory = historyReader(ctx)
  ownerRoute('assistant-history', ['GET'], async () => {
    const rooms = rows.map(row => ({name:row.name, sessionIds:registry.get(row.workspaceId)?.sessionIds || []}))
    const [history, schedules, audit] = await Promise.all([readHistory(rooms),ctx.schedule.catalog(),call('assistant-audit')])
    return {activities:history.activities,approvals:[...history.approvals,...audit].sort((a,b)=>(b.time||0)-(a.time||0)).slice(0,200),
      schedules:schedules.filter(s=>s.status==='active').map(s=>({
      id:s.id,title:s.title,scheduledAt:s.scheduledAt,interval:intervalSeconds(s),
    })).sort((a,b)=>String(a.scheduledAt).localeCompare(String(b.scheduledAt)))}
  })
  ownerRoute('create', ['POST'], async data => {
    const { scope } = await call('create', { name: data.name, requestId: data.requestId })
    const updated = await refreshAfterWrite()
    const row = updated.find(item => item.scope === scope)
    // Only the owner directory picker needs the path to complete its native adoption.
    return { ...row, path: registry.get(row.workspaceId).path }
  })
  ownerRoute('plugin', ['POST'], data => call('plugin', { scope: data.scope, name: data.name, prompt: data.prompt, requestId: data.requestId }))
  async function projectAction(workspace, data) {
    if(data.action==='bot_assignments' || data.action==='remove_feature_bot'){
      if(data.args?.projectId!==undefined)throw failure('项目范围由当前工作区确定。',400)
      const scope=rows.find(r=>r.workspaceId===workspace.id)?.scope, fid=data.args?.featureId
      if(data.action==='bot_assignments')return assigned.list(scope,fid)
      return assigned.serial(async()=>{
        await assigned.cleanup(scope,fid)
        const result=await call('project',{workspace,action:data.action,args:data.args})
        await refreshAfterWrite()
        return result
      })
    }
    if (data.action === 'bot_session' && sessionWorkspace(registry, data.args?.sessionId).id !== workspace.id) {
      throw failure('功能 Bot 只能绑定本项目的对话。', 403)
    }
    const result = await call('project', { workspace, action: data.action, args: data.args })
    if ([
      'bot_session', 'create_feature_bot', 'feature_rename', 'rename_feature',
      'feature_update', 'update_feature', 'memory_write', 'memory_pin', 'memory_update', 'memory_delete',
    ].includes(data.action)) await refreshAfterWrite()
    return result
  }
  ownerRoute('project', ['POST'], data => projectAction(sessionWorkspace(registry, data.sessionId), data))
  ownerRoute('workspace-page', ['POST'], async data => {
    const row = rows.find(r => r.workspaceId === data.workspaceId && r.scope !== 'global')
    const native = row && registry.get(row.workspaceId)
    if (!native) throw failure('科研项目未绑定。', 403)
    return projectAction({ id: native.id, path: native.path }, data)
  })
  ownerRoute('rename', ['POST'], async data => {
    const row = rows.find(item => item.workspaceId === data.workspaceId)
    const native = registry.get(data.workspaceId)
    if (!row || !native) throw failure('工作区未绑定。', 403)
    if (row.scope === 'global') {
      await call('name', { name: data.name })
      void refreshGlobalProfile()
    } else await call('project', { workspace: { id: native.id, path: native.path }, action: 'rename', args: { name: data.name } })
    await refreshAfterWrite()
    return { ok: true }
  })
  ownerRoute('delete', ['POST'], async data => {
    const row = rows.find(item => item.workspaceId === data.workspaceId)
    const native = registry.get(data.workspaceId)
    if (!row || !native) throw failure('工作区未绑定。', 403)
    if (row.scope === 'global') throw failure('全局助手不能删除。', 403)
    await call('delete', { workspace: { id: native.id, path: native.path } })
    await refreshAfterWrite()
    return { ok: true }
  })

  function caller(exec) {
    const session = exec.agent?.session
    if (!session || ctx.sessions.get(session.header.id) !== session) throw failure('需要真实的宿主会话。', 403)
    const workspace = sessionWorkspace(registry, session.header.id)
    const row = rows.find(r => r.workspaceId === workspace.id)
    if (!row) throw failure('会话没有科研工作区。', 403)
    return { workspace, row }
  }
  const output = { schema: { type: 'string' }, render: (_args, value) => [{ type: 'text', text: value }] }
  const assigned=botAssignments(ctx,{rows:()=>rows,caller,registry,call,output,refresh:refreshAfterWrite})
  const announceSandbox = registerSandboxTools(ctx, {call, caller, listRows:()=>rows, registry, ownerRoute, output})
  ctx.tools.register({
    name: 'labweave_schedule_list', description: 'List scheduled research tasks visible in this conversation, with edit revisions.',
    parameters: { type: 'object', properties: {}, additionalProperties: false }, output,
    async execute(_args, exec) {
      const { workspace, row } = caller(exec)
      const records = await ctx.schedule.catalog()
      return JSON.stringify(records.filter(r => row.scope === 'global' || scheduleMatches(r, workspace, registry.get(workspace.id)))
        .map(r => ({ id: r.id, title: r.title, prompt: r.prompt, status: r.status, updatedAt: r.updatedAt ?? null })))
    },
  })
  ctx.tools.register({
    name: 'labweave_schedule_create', description: 'Schedule a research prompt. Global chat defaults to its own workspace and may select an explicit projectId. Project chat schedules only in its own project. Use the DSH recurrence rule format.',
    parameters: { type: 'object', properties: { title: { type: 'string' }, prompt: { type: 'string' },
      rrule: { type: 'string' }, projectId: { type: 'string' } }, required: ['title', 'prompt', 'rrule'], additionalProperties: false }, output,
    async execute(args, exec) {
      const { row } = caller(exec)
      if (row.scope !== 'global' && args.projectId !== undefined && args.projectId !== row.scope) throw failure('不能安排其他项目的任务。', 403)
      const target = rows.find(r => r.scope === (args.projectId ?? row.scope))
      const native = target && registry.get(target.workspaceId)
      if (!native) throw failure('目标项目未绑定。', 403)
      await call('project', { workspace: { id: native.id, path: native.path }, action: 'view' }, exec.signal)
      const result = await ctx.schedule.create({ title: args.title, prompt: args.prompt,
        timing: { kind: 'rrule', rrule: args.rrule }, target: { kind: 'new_once', create: { cwd: native.path } } },
        exec.agent.session.id, exec.signal)
      return JSON.stringify({ id: result.id, scope: target.scope })
    },
  })
  ctx.on('tools/pre-execute', async (exec, next) => {
    if (!exec.name.startsWith('schedule_')) return next()
    let origin
    try { origin = caller(exec) } catch { return { kind: 'deny', reason: '需要已绑定的科研会话。' } }
    if (origin.row.scope === 'global' || exec.name === 'schedule_create') return next()
    if (exec.name === 'schedule_edit') {
      const record = await ctx.schedule.view({ id: exec.arguments.id })
      if (scheduleMatches(record, origin.workspace, registry.get(origin.workspace.id))
          && Object.hasOwn(exec.arguments, 'expectedUpdatedAt') && exec.arguments.expectedUpdatedAt === (record.updatedAt ?? null)) return next()
    }
    return { kind: 'deny', reason: '请使用 labweave_schedule_list 查看本项目任务。修改本项目任务时请传入其最新 expectedUpdatedAt。' }
  })
  ctx.systemPrompt.context({ name: 'labweave.research', order: 40, required: true, interpolate: false,
    text({ scope }) {
      if (!scope?.session) return ''
      let row
      try { row = caller({ agent: scope }).row } catch { return '' }
      const sid = scope.session.header?.id
      const bot = row.scope !== 'global' && sid && (row.features || []).find(f => f.id !== 'chat' && f.botSessionId === sid)
      let context = row.scope === 'global'
        ? 'This is the global assistant (chat only). Call labweave_global_memory_search to recall past preferences, and call labweave_global_memory_write (use pinned:true for core preferences) or labweave_global_memory_pin to preserve durable cross-project norms. Use labweave_feature_create / labweave_feature_delete / labweave_rename_feature with an explicit projectId or "all" when managing project features.'
        : 'This is a project conversation. Read labweave_project_get_context before research work. Use labweave_memory_search for archived project decisions/experiments and labweave_memory_write (set pinned:true for core constraints/baselines) or labweave_memory_pin to save durable takeaways before context compaction. You may manage features within this project via labweave_feature_create / labweave_feature_delete / labweave_rename_feature.'
      if (row.scope === 'global' && globalProfile) {
        const profileData = {
          name: globalProfile.name,
          tagline: globalProfile.tagline,
          persona: globalProfile.persona,
          soul: globalProfile.soul,
          totalMemoryCount: globalProfile.memories?.length || 0,
          memories: (globalProfile.memories || []).slice(0, 12).map(m => ({
            id: m.id, category: m.category, pinned: Boolean(m.pinned), source: m.source || 'manual', content: m.content,
          })),
        }
        context += ` Global assistant profile & memory (data): ${JSON.stringify(profileData)}.`
      }
      if (row.scope !== 'global') {
        const core = projectCoreMemories.get(row.workspaceId) || []
        if (core.length) context += ` Project core memories (data, pinned first): ${JSON.stringify(core)}.`
      }
      context += ' For user requests to delegate responsibilities, storage rules or repeated work to a Bot, actually use labweave_bot_assign. Prefer this tool over general schedule creation for Bot-owned recurring work.'
      if (bot) {
        context += ' Current user-assigned responsibilities and storage rules (project data): '+JSON.stringify(bot.assignments||[])+'.'
        context += ' Read labweave_bot_assignments for this Bot at the start of work and follow its responsibilities and storage instructions.'
        context += ` Active Feature Bot identity (data): ${JSON.stringify({ featureId: bot.id, label: bot.label, hint: bot.hint, keywords: bot.keywords || [], categories: bot.categories || [] })}. Focus on this feature's responsibilities. Inspect current archived entries with labweave_feature_entries(featureId=${JSON.stringify(bot.id)}) and decide categories via labweave_feature_push(featureId=${JSON.stringify(bot.id)}, text, category) (or pass id to recategorize/update an existing entry). When pushing entries, judge from this Bot's purpose whether an illustrated card adds clarity: if helpful (e.g. experiment curves/results, paper architecture, workflows, comparative insights, study roadmaps), attach a clear figure via imagePath (PNG/JPG/WEBP/SVG inside the project folder) or a self-contained inline imageSvg (crisp <svg viewBox="0 0 640 360"> diagram/chart with legible labels, zero scripts or external URLs) or imageUrl along with title and caption; otherwise keep the push crisp and text-only.`
      }
      if (bot || row.scope === 'global') {
        context += ' Speak like a person messaging a colleague, in the user’s language. Default to one short, complete message. For a quick action, perform it first and confirm the actual result. For a question lead with a useful judgment and its main reason. For a longer job acknowledge only once a tool actually accepted it, naming what is happening. Mention blockers or decisions when needed. No pretend progress, artificial delays, repeated acknowledgements, automatic recap or splitting a long essay into bubbles. If asked to explain or write a full artifact, give the requested depth.'
        context += bot
          ? ' You are the assigned specialist. File detailed findings in the appropriate project record with sources when relevant; reply with the finding and where it is saved. Stay with your assigned work.'
          : ' You are the personal assistant. Lead with the one cross-project change, decision or next action that matters to the user. Delegate with an explicit target project when useful; summarize only relevant exceptions and outcomes.'
      }
      return context + ' Workspace identity (data): ' + JSON.stringify({ scope: row.scope, name: row.name }) +
        '. When an empirical check is needed, call labweave_sandbox_run first, then inspect labweave_sandbox_status. When a script path or code is supplied, submit it directly: the runner validates inputs. Do not probe the shell or run experiment code via terminal/bash. If WAITING_APPROVAL, tell the user where to approve without resubmitting. Use workflow_draft for formal comparison protocols. Experimental budgets require human approval.'
    } })
  for (const tool of await call('tools')) {
    ctx.tools.register({
      name: 'labweave_' + tool.name, description: tool.description, parameters: tool.inputSchema,
      output,
      async execute(args, exec) {
        const { workspace, row } = caller(exec)
        if(tool.name==='feature_delete')return assigned.serial(async()=>{
          if(row.scope!=='global' && args.projectId && args.projectId!==row.scope)throw failure('不能删除其他项目的功能。',403)
          const scope=row.scope==='global'?args.projectId:row.scope
          await assigned.cleanup(scope,args.featureId)
          const result=await call('tool',{workspace,tool:tool.name,args},exec.signal)
          await refreshAfterWrite()
          return result.text
        })
        const result = await call('tool', { workspace, tool: tool.name, args }, exec.signal)
        if (tool.name === 'workflow_draft') {
          const flow = JSON.parse(result.text)
          announceSandbox(exec.agent.session.header.id, row.scope === 'global' ? args.projectId : row.scope, flow.id, 'workflow')
        }
        if ([
          'project_create', 'project_update', 'assistant_rename', 'feature_create', 'feature_delete',
          'rename_feature', 'feature_push', 'idea_create', 'goal_create',
          'memory_write', 'memory_pin', 'memory_update', 'global_memory_write', 'global_memory_pin',
        ].includes(tool.name)) await refreshAfterWrite()
        if (['assistant_rename', 'global_memory_write', 'global_memory_pin'].includes(tool.name)) void refreshGlobalProfile()
        return result.text
      },
    })
  }
  await call('ready')
}
