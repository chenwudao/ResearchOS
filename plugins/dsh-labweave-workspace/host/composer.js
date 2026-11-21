import { randomUUID } from 'node:crypto'

const globalCommands = [
  ['新建项目', '填写项目名称后发送', 'Use labweave_project_create with the project name supplied by the user.'],
  ['查全局记忆', '查找偏好、决定和历史记录', 'Search with labweave_global_memory_search.'],
  ['查看任务', '查看定时任务', 'Read the task catalog with labweave_schedule_list.'],
  ['协调项目', '填写要协调的项目和事项', 'Resolve the projects by name, then use labweave_project_get_context with each explicit projectId.'],
  ['转交项目', '选择目标项目并说明要做什么', 'Use labweave_project_handoff with the explicitly identified project and the requested work. Ask for the project if unclear.'],
]
const projectCommands = [
  ['分派任务', '填写具体任务，可点名承接 Bot', 'Choose a suitable project Bot when none is named and use labweave_bot_delegate.'],
  ['查项目记忆', '查找本项目的规则、决定和结果', 'Search with labweave_memory_search.'],
  ['保存项目规则', '填写用户确认的项目规则', 'Search for an existing rule, then revise it or use labweave_memory_write with category rule and pinned true.'],
  ['打开空间存储', '按时间查看项目文件', null, 'labweave-files'],
]
const researchCommands = {
  literature: ['查文献', '填写主题和关注范围', 'Find literature on the requested topic. Cite original sources and distinguish retrieved papers from claims verified in full text.'],
  evidence: ['核验证据', '填写待核查的结论，可用 @ 引用原文', 'Verify the requested claim against the referenced or original evidence. Report supporting, conflicting, and unverified points.'],
  analysis: ['分析数据', '用 @ 选数据，说明要回答的问题', 'Analyze the specified data against the requested question or comparison. Report the result, metrics, and limitations.'],
  chart: ['生成图表', '用 @ 选数据，说明要展示的趋势或对比', 'Make a chart using actual values from the selected data, with clear axes and units.'],
  plan: ['制定实验方案', '填写假设、比较对象和成功标准', 'Draft an experiment plan with inputs, comparison, success criteria, and resource assumptions. Run nothing unless execution is expressly requested.'],
  report: ['整理报告', '填写报告用途，可用 @ 引用成果', 'Produce the requested report with traceable evidence and limitations. Use cited project materials when available.'],
}
const researchMenu = Object.values(researchCommands)
const projectOverview = ['查看项目进展', '查看成果、待处理事项和下一步', 'Summarize known project progress, completed deliverables and open issues using current project data.']
const referenceGroups = [
  { kind: 'library', filter: '文献', label: '文献与资料' },
  { kind: 'result', filter: '成果', label: '项目成果' },
  { kind: 'experiment', filter: '实验', label: '实验记录' },
  { kind: 'rule', filter: '规则', label: '项目规则' },
  { kind: 'decision', filter: '决定', label: '项目决定' },
  { kind: 'dispatch', filter: '任务', label: 'Bot 任务' },
]
const botCommands = [
  ['查看职责', '查看当前 Bot 的职责', 'Read this Bot’s duties with labweave_bot_assignments.'],
  projectCommands[1],
]
const paradigmCommands = {
  notes: [['原文核对', '引用文件并填写要核对的内容', 'Verify the claim against the referenced source. Read the requested page and cite it.']],
  goals: [['检查目标', '检查目标进度和前置依赖', 'Read the project goals and report dependencies and remaining work.']],
  mindmap: [['核对关系', '检查关系和对应证据', 'Check the requested relationship against this Bot’s records and project evidence.']],
  ideas: [['梳理点子', '整理现有点子与可验证假设', 'Read this Bot’s related records and organize the requested ideas and ways to verify them.']],
  engineering: [
    ['查看运行', '查看本项目的实验状态', 'Use labweave_experiment_list.'],
    ['运行实验', '说明脚本、环境和实验目标', 'Record the experiment, run it with the permitted project execution tools, then update the same experiment record with observed results.'],
  ],
}
const managedCommands = new Set([...globalCommands, ...projectCommands, ...botCommands, ...researchMenu, projectOverview,
  ...Object.values(paradigmCommands).flat()].map(([name]) => name))
const mentionPattern = /@\[((?:\\.|[^\\\]])*)\]\(weave-ref:([^\s)]*)\)|(weave-ref:[A-Za-z0-9_-]+)/gu
const nativePattern = /dsh-session:([A-Za-z0-9_-]+)/gu
const commandName = text => /^\s*\/([^\s]+)(?:\s|$)/u.exec(text)?.[1]
const encodeSegment = value => value.replace(/[/%\s]/gu, character => encodeURIComponent(character))
function decodeSegment(value) {
  try { return decodeURIComponent(value) } catch { return value }
}

function mention(label, value) {
  return '@[' + label.replace(/[\\\]]/gu, match => '\\' + match) + '](weave-ref:' +
    Buffer.from(JSON.stringify(value)).toString('base64url') + ')'
}

function decode(value) {
  try {
    if (!/^[A-Za-z0-9_-]+$/u.test(value) || value.length > 4096) throw Error()
    const parsed = JSON.parse(Buffer.from(value, 'base64url').toString('utf8'))
    if (Buffer.from(JSON.stringify(parsed)).toString('base64url') !== value) throw Error()
    return parsed
  } catch {
    throw Error('此引用无效，请从 @ 菜单重新选择。')
  }
}

function commandCatalog(scope) {
  if (scope.row.scope === 'global') return globalCommands
  if (!scope.bot) return [projectCommands[0], ...researchMenu, projectOverview, ...projectCommands.slice(1)]
  const base = scope.bot.extension?.base || scope.bot.paradigm
  const relevant = {
    notes: ['literature', 'evidence'], mindmap: ['evidence'], ideas: ['plan'],
    engineering: ['analysis', 'chart', 'plan'],
  }[base] || []
  return [...(paradigmCommands[base] || [
    ['查看成果', '查看当前 Bot 已保存的成果', 'Read this Bot’s records with labweave_feature_entries.'],
  ]), ...relevant.map(key => researchCommands[key]), ...botCommands]
}

function earlierReplies(session, actor) {
  if (!session.surface?.nodes || typeof session.snapshotEvents !== 'function') return ''
  const events = session.snapshotEvents()
  const previous = session.surface.nodes.map(seq => events[seq]).filter(event =>
    event?.type === 'user/message' && event.data.source.kind === 'labweave-speaker'
    && event.data.source.speakerId === actor.bot.id && event.data.source.projectId === actor.row.scope
    && event.data.source.status === 'completed')
  return previous.slice(-3).map(event => event.data.content.filter(part => part.type === 'text')
    .map(part => part.text).join('\n').slice(0, 1200)).join('\n\n')
}

export function registerComposer(ctx, { refs, rows, call, ownerRoute, delegation, handoff, intake }) {
  function scopeFor(session) {
    const scope = refs.memberScope(session)
    if (!scope) throw Error('当前对话没有可用的工作区。')
    const bot = scope.row.features?.find(item => item.botSessionId === session.header.id)
    return { ...scope, bot }
  }

  function target(scope, reference) {
    const row = rows().find(item => item.scope === reference.project && item.scope !== 'global')
    const workspace = row && ctx.workspaceRegistry.get(row.workspaceId)
    if (!workspace || (scope.row.scope !== 'global' && scope.row.scope !== row.scope)) {
      throw Error('引用或邀请超出当前工作区。')
    }
    return { row, workspace: { id: workspace.id, path: workspace.path } }
  }

  function inviteTarget(scope, reference) {
    const selection = target(scope, reference)
    const bot = reference.id === 'chat' && (scope.bot || scope.row.scope === 'global')
      ? { id: 'chat', label: '项目助手' }
      : selection.row.features.find(item => item.id === reference.id && item.paradigm && !item.archived)
    if (!bot || bot.id === scope.bot?.id) throw Error('此发言者当前不可邀请。')
    return { ...selection, bot }
  }

  async function candidates(session, trigger, query) {
    const scope = scopeFor(session)
    const needle = query.trim().toLocaleLowerCase()
    const matches = name => name.toLocaleLowerCase().includes(needle)
    if (trigger === '/') return commandCatalog(scope).filter(([name, description]) => matches(name) || matches(description))
      .map(command => {
        const [name, description, , tab] = command
        return { name, description, section: researchMenu.includes(command) ? '科研指令' : '指令', text: '/' + name + ' ', tab }
      })
    if (trigger !== '@') return []
    const items = []
    const choice = (name, section, ref, description) => ({ name, section, description,
      ...(ref && { text: mention(name, ref) }) })
    const global = scope.row.scope === 'global'
    const [filterName, ...keywords] = needle.split('/')
    const referenceGroup = global || !keywords.length ? null : referenceGroups.find(group =>
      group.filter === filterName || group.label === filterName)
    const search = referenceGroup ? keywords.join('/').trim() : needle
    const projectRows = global ? rows().filter(item => item.scope !== 'global') : [scope.row]
    const prefixFor = item => {
      const suffix = projectRows.filter(row => row.name === item.name).length > 1 ? '·' + item.scope.slice(-8) : ''
      return encodeSegment(item.name + suffix)
    }
    const project = global ? projectRows.find(item => query.startsWith(prefixFor(item) + '/')) : scope.row
    if (global && !project) items.push(...projectRows.filter(row => matches(row.name))
      .map(row => ({ ...choice(row.name, '选择项目',
        null, projectRows.some(other => other !== row && other.name === row.name) ? row.scope.slice(-8) : undefined),
        drill: prefixFor(row) + '/' })))
    if (project && !referenceGroup) {
      const actorNeedle = global ? needle.slice(prefixFor(project).length + 1) : needle
      const actors = [...(global || scope.bot ? [{ id: 'chat', label: '项目助手' }] : []),
        ...(project.features || []).filter(item => item.paradigm && !item.archived && item.id !== scope.bot?.id)]
      items.push(...actors.filter(item => item.label.toLocaleLowerCase().includes(actorNeedle)).slice(0, 12)
        .map(item => {
          const label = global ? project.name + ' / ' + item.label : item.label
          return { ...choice(label, global ? '转交到项目' : '邀请发言',
            { kind: 'actor', project: project.scope, id: item.id }, item.hint),
            name: item.label, label }
        }))
    }
    if (!global) {
      const workspace = { id: scope.workspace.id, path: scope.workspace.path }
      const invoke = (action, args) => call('project', { workspace, action, args })
      if (!referenceGroup) items.push(...referenceGroups.filter(group => matches(group.filter) || matches(group.label))
        .map(group => ({ ...choice(group.label, '按类型查找'), drill: group.filter + '/' })))
      const responses = await Promise.allSettled([
        !referenceGroup && invoke('files/list', {}),
        !referenceGroup && invoke('sources/list', {}),
        referenceGroup?.kind !== 'dispatch' && invoke('composer/references', { query: search, kind: referenceGroup?.kind || undefined }),
        (!referenceGroup || referenceGroup.kind === 'dispatch') && invoke('composer/tasks',
          { featureId: scope.bot?.id, query: search, expanded: Boolean(referenceGroup) }),
      ])
      const [files, sources, records, dispatches] = responses.map(response => response.value || [])
      if (referenceGroup && responses.every(response => response.status === 'rejected' || !response.value)) {
        throw Error('此类引用暂不可用，请重试。')
      }
      items.push(...records.map(item => choice(item.name, referenceGroups.find(group => group.kind === item.kind)?.label || '项目资料',
        { kind: 'research', category: item.kind, project: scope.row.scope, id: item.id }, item.description)))
      items.push(...dispatches.map(task => choice(task.title.split('\n')[0].slice(0, 100), 'Bot 任务',
          { kind: 'task', project: scope.row.scope, id: task.id, bot: task.featureId }, task.botName)))
      items.push(...files.filter(item => matches(item.name) || matches(item.path || '')).slice(0, 12).map(item =>
        choice(item.name, '空间存储', { kind: 'file', project: scope.row.scope, id: item.id }, item.path)))
      const available = sources.filter(item => item.available)
      const sourcePrefix = item => encodeSegment(item.name + (
        referenceGroups.some(group => group.filter === item.name || group.label === item.name)
          || available.some(other => other !== item && other.name === item.name)
          ? '·' + item.id.slice(-8) : ''))
      items.push(...available.filter(item => matches(item.name)).slice(0, 8).map(item =>
        ({ ...choice(item.name, '项目来源', { kind: 'source', project: scope.row.scope, id: item.id }),
          drill: sourcePrefix(item) + '/' })))
      const source = available.find(item => query.startsWith(sourcePrefix(item) + '/'))
      if (source) {
        const relative = query.slice(sourcePrefix(source).length + 1)
        const slash = relative.lastIndexOf('/')
        const directory = slash < 0 ? '' : relative.slice(0, slash + 1).split('/').map(decodeSegment).join('/')
        const prefix = decodeSegment(relative.slice(slash + 1)).toLocaleLowerCase()
        const result = await invoke('sources/directory', { sourceId: source.id, path: directory || '.' })
        items.push(...result.entries.filter(item => item.path.slice(directory.length).toLocaleLowerCase().includes(prefix))
          .slice(0, 12).map(item => item.kind === 'directory'
            ? { ...choice(item.path.slice(directory.length), '项目来源'),
              drill: sourcePrefix(source) + '/' + item.path.split('/').map(encodeSegment).join('/') + '/' }
            : choice(item.path.split('/').at(-1), '项目来源',
              { kind: 'source', project: scope.row.scope, id: source.id, path: item.path }, item.path)))
      }
    }
    const history = referenceGroup ? [] : await ctx.sessionReferenceResolver.listCandidates({ id: session.header.id, session }, query, 12)
    items.push(...history.map(item => ({
      name: item.displayTitle || item.label, section: '对话',
      text: '@[' + (item.displayTitle || item.label).replace(/[\\\]]/gu, value => '\\' + value) + '](dsh-session:' +
        Buffer.from(JSON.stringify(item.sessionId)).toString('base64url') + ')',
    })))
    return items
  }

  ownerRoute('composer-candidates', ['POST'], async ({ sessionId, trigger, query }) => {
    const session = typeof sessionId === 'string' && (ctx.sessions.get(sessionId) ||
      (await ctx.sessionQuery.filterSessions([{ kind: 'id', values: [sessionId] }]))[0])
    if (!session || typeof query !== 'string' || query.length > 600 || !refs.memberScope(session)) {
      throw Object.assign(Error('当前对话没有可用的工作区。'), { status: 403 })
    }
    return candidates(session, trigger, query)
  })

  async function material(scope, reference, page, signal) {
    if (scope.row.scope === 'global' || reference.project !== scope.row.scope) throw Error('只能引用当前项目的资料。')
    const { workspace } = target(scope, reference)
    const invoke = (action, args) => call('project', { workspace, action, args }, signal)
    if (reference.kind === 'file') return invoke('files/reference', { id: reference.id, page })
    if (reference.kind === 'source') {
      if (reference.path) return invoke('sources/read', { sourceId: reference.id, path: reference.path, page })
      const { source, entries } = await invoke('sources/directory', { sourceId: reference.id })
      return { source, entries: entries.slice(0, 30) }
    }
    if (reference.kind === 'record' && scope.bot && scope.bot.id === reference.bot) {
      const result = await invoke('view', {})
      const record = result.rails?.[reference.bot]?.find(item => item.id === reference.id)
      if (record) return { title: record.title, text: record.text, id: record.id }
    }
    if (reference.kind === 'research') {
      return invoke('composer/reference', { id: reference.id, kind: reference.category })
    }
    if (reference.kind === 'task' && (!scope.bot || scope.bot.id === reference.bot)) {
      const task = await invoke('bot_dispatch_detail', { id: reference.id })
      if (task.featureId === reference.bot) {
        return { id: task.id, task: task.task?.slice(0, 2000), status: task.status, answer: task.answer?.slice(0, 3000) }
      }
    }
    throw Error('引用的内容已失效。')
  }

  ctx.on('agent/pre-step', async ({ agent, signal, messages, modelSelection }, next) => {
    const decision = await next()
    if (decision.kind === 'reject') return decision
    if (delegation.owned?.(agent)) return decision
    if (!messages.some(message => message.source.kind === 'user' &&
        message.content.some(part => part.type === 'text' &&
          (part.text.includes('weave-ref:') || managedCommands.has(commandName(part.text)))))) {
      return decision
    }
    const scope = scopeFor(agent.session)
    const prepared = await Promise.all(decision.messages.map(async message => {
      if (message.source.kind !== 'user') return { message }
      const text = message.content.filter(part => part.type === 'text').map(part => part.text).join('\n')
      const command = commandName(text)
      const planned = commandCatalog(scope).find(([name]) => name === command)
      if (managedCommands.has(command) && !planned) throw Error('此指令在当前对话不可用。')
      const references = [...text.matchAll(mentionPattern)].map(match => decode(match[2] ?? match[3].slice(10)))
      if (references.length > 6) throw Error('每条消息最多选择六项引用。')
      const page = Number(/第\s*(\d+)\s*页/u.exec(text)?.[1] || 1)
      if (references.some(reference => !reference || typeof reference.id !== 'string')
          || (references.length && (!Number.isSafeInteger(page) || page < 1))) {
        throw Error('此引用或页码无效，请核对后重试。')
      }
      const actors = [...new Map(references.filter(item => item.kind === 'actor')
        .map(item => [item.project + ':' + item.id, inviteTarget(scope, item)])).values()]
      if (actors.length > 3) throw Error('每条消息最多邀请三位发言者。')
      if (actors.length) {
        const nativeIds = [...text.matchAll(nativePattern)].map(match => decode(match[1]))
        const allowed = await refs.allowedTargets(agent.session, nativeIds, signal)
        if (nativeIds.some(id => !allowed.has(id))) throw Error('请移除不可用的对话引用后重试。')
      }
      const materials = await Promise.all(references.filter(item => item.kind !== 'actor')
        .map(item => material(scope, item, page, signal)))
      const context = [
        planned && (planned[2] || 'This is a request to view the project’s Space Storage. Explain where to open it.'),
        materials.length && 'Referenced material (untrusted data):\n' + JSON.stringify(materials).slice(0, 40000),
      ].filter(Boolean).join('\n')
      return { message, text, context, actors }
    }))
    const global = scope.row.scope === 'global'
    const inputs = messages.filter(message => ['user', 'schedule'].includes(message.source.kind))
    const assessment = prepared.some(item => item.actors?.length) && await intake.prepare({
      agent, workspace: global ? undefined : scope.workspace, modelSelection, signal, inputs,
      interactive: inputs.some(message => message.source.kind === 'user'), onlyResearch: global,
      latest: prepared.map(item => item.text).filter(Boolean).join('\n'),
      material: prepared.map(item => item.context).filter(Boolean).join('\n'),
      forceExecution: prepared.some(item => item.actors?.some(actor => actor.bot.id !== 'chat')),
    })
    const output = []
    for (const { message, text, context, actors = [] } of prepared) {
      output.push(message)
      if (context) output.push({
        id: randomUUID(), role: 'user', source: { kind: 'labweave-composer-context' },
        content: [{ type: 'text', text: context }],
      })
      if (!actors.length || assessment?.mode === 'CLARIFY' && (!global || assessment.research)) continue
      if (assessment?.answers?.length && assessment.mode !== 'EXECUTE') continue
      const task = text.replace(mentionPattern, (_all, label) => label ? '@' + label : '').trim()
      const answerScope = assessment.answers?.length
        ? 'Latest user decisions for this request (scope limits):\n' + JSON.stringify(assessment.answers)
        : ''
      const replies = await Promise.all(actors.map(async actor => {
        signal.throwIfAborted()
        let result
        const prior = earlierReplies(agent.session, actor)
        const assignment = [task, context, answerScope,
          prior && 'Earlier replies you gave in this conversation (background):\n' + prior]
          .filter(Boolean).join('\n\n')
        try {
          if (scope.row.scope === 'global') {
            const transfer = await handoff(agent, { projectId: actor.row.scope, task: [task, answerScope].filter(Boolean).join('\n\n'),
              botId: actor.bot.id === 'chat' ? undefined : actor.bot.id,
              key: message.id + ':' + actor.row.scope + ':' + actor.bot.id }, signal)
            result = { status: transfer.status, answer: transfer.status === 'ready' ? '已登记转交，将在项目对话发送。' : '已登记转交，等待你确认。' }
          } else result = await delegation.invite(agent, actor, assignment, signal, modelSelection, message.id, assessment?.research)
        }
        catch (error) { signal.throwIfAborted(); result = { status: 'blocked', reason: error.message } }
        return {
          id: randomUUID(), role: 'user',
          source: { kind: 'labweave-speaker', label: scope.row.scope === 'global' ? '项目转交' : actor.bot.label, replyTo: message.id, speakerId: actor.bot.id,
            projectId: actor.row.scope, status: result.status },
          content: [{ type: 'text', text: result.answer || result.detail || result.reason || '暂未收到回复。' }],
        }
      }))
      output.push(...replies)
    }
    return { ...decision, messages: output }
  })
}
