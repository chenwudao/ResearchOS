// Display names for the wire IDs used in active calls and persisted history.
export const toolLabels = {
  web_search: '搜索网页', paper_search: '搜索论文', resource_search: '搜索资源库',
  project_list: '查看项目', project_get_context: '读取项目进展', resource_read: '阅读资源库',
  feature_create: '创建功能 Bot', feature_layout: '调整 Bot 排布', feature_push: '整理功能记录', sandbox_run: '提交实验试跑',
  sandbox_status: '查看实验进度', workflow_draft: '拟定实验计划', schedule_create: '创建定时任务',
  sandbox_run_approved: '执行已批准的实验', schedule_list: '查看定时任务',
  workflow_run: '运行项目实验', workflow_pause: '暂停项目实验', project_handoff: '转交项目执行',
  bot_assign: '分派 Bot 任务', bot_assignments: '查看 Bot 分工', bot_assignment_index: '查看功能 Bot 分工',
  bot_unassign: '撤销 Bot 分工',
  plugin_create: '创建项目插件', plugin_rename: '重命名插件', plugin_list: '查看项目插件',
  assistant_name_get: '查看助手名称', assistant_rename: '重命名助手',
  feature_labels: '查看功能名称', feature_list: '查看功能 Bot', feature_delete: '移除功能 Bot',
  feature_entries: '读取功能记录', rename_feature: '重命名功能 Bot',
  research_state_get: '读取项目状态', research_state_propose: '提议更新项目状态',
  evidence_search: '查找项目证据', evidence_add: '提议添加证据', evidence_link: '关联项目证据',
  workflow_list: '查看实验计划列表', workflow_get: '查看实验计划',
  task_get: '查看任务结果', task_create: '提交待确认任务',
  experiment_list: '查看实验记录', experiment_record: '保存实验记录',
  benchmark_list: '查看质量评估', benchmark_record: '保存质量评估',
  project_create: '新建项目', project_update: '更新项目信息',
  paper_citations: '查看参考文献', paper_read: '阅读论文',
  paper_lookup: '核对论文标识', paper_neighbors: '追踪论文引用',
  idea_create: '保存点子', idea_update: '修改点子',
  goal_create: '创建项目目标', goal_update: '更新项目目标',
  memory_search: '查找项目记忆', memory_write: '保存项目记忆', memory_update: '更新项目记忆', memory_pin: '调整项目记忆置顶状态',
  bot_delegate: '分派 Bot',
  bot_publish_drafts: '发布 Bot 草稿',
  bot_canvas_draft: '更新 Bot 工作进度', structured_output: '提交结构化成果',
  bot_blocked: '记录任务阻塞',
  bot_cluster: '聚类功能 Bot',
  global_memory_search: '查找全局记忆', global_memory_write: '保存全局记忆',
  global_memory_pin: '调整全局记忆置顶状态',
  workspace_trees: '查看工作树目录', git_status: '查看 Git 状态',
  storage_list: '查看空间存储', storage_define: '定义存储类别',
  storage_save: '归档到空间存储', storage_remove: '移出空间存储',
}

const workerActions = {
  read: '阅读工作区文件', write: '写入工作区文件', edit: '修改工作区文件',
  bash: '运行工作区命令', powershell: '运行工作区命令', pwsh: '运行工作区命令',
  grep: '查找工作区内容', glob: '查找工作区文件',
}
export const recordWriteTools = new Set([
  'memory_write', 'memory_update', 'memory_pin', 'memory_delete',
  'goal_create', 'goal_update', 'idea_create', 'idea_update', 'feature_push',
  'bot_canvas_draft', 'bot_publish_drafts', 'structured_output', 'experiment_record',
])

function actionTitle(name, worker = false) {
  if (!name) return '工具调用'
  const action = String(name).replace(/^labweave_/, '')
  if (Object.hasOwn(toolLabels, action)) return toolLabels[action]
  if (action !== name) return '项目操作'
  if (worker) return Object.hasOwn(workerActions, name) ? workerActions[name] : '调用外部工具'
  return name
}

const outcomes = {'allowed-once':'已批准', rejected:'已拒绝', cancelled:'已取消', unavailable:'未获批准'}
export async function workerActivity(ctx, task) {
  const live = ctx.sessions.get(task.id)
  let reader
  const calls = new Map()
  const approvals = new Map()
  let phase
  let reasoned = false
  try {
    if (!live) {
      if (ctx.sessionPersistence.stat && !await ctx.sessionPersistence.stat(task.id)) return null
      reader = await ctx.sessionPersistence.open(task.id, 'read')
    }
    for (let offset = 0; ;) {
      const events = live ? live.snapshotEvents(offset, offset + 256) : (await reader.read(offset, 256)).events
      for (const { seq, type, time, data } of events) {
        if (type === 'step/start') phase = 'preparing'
        if (type === 'assistant/live-chunk') {
          if (data.chunk?.type === 'reasoning-delta') phase = 'reasoning'
          if (data.chunk?.type === 'text-delta') phase = 'reply'
        }
        if (type === 'assistant/message' && !data.interrupted &&
            data.message?.content?.some(block => block.type === 'reasoning' && block.text?.trim())) reasoned = true
        if (type === 'tool/call' && !recordWriteTools.has(data.name?.replace(/^labweave_/, ''))) {
          phase = 'tool'
          const title = actionTitle(data.name, true)
          calls.set(data.callId, { id: seq, time, title, status: 'running' })
          if (calls.size > 80) calls.delete(calls.keys().next().value)
        }
        if (type === 'tool/result') {
          const entry = calls.get(data.message?.toolCallId)
          if (entry) entry.status = data.message.isError ? 'failed' : 'completed'
        }
        if (type === 'approval/asked') approvals.set(data.id, true)
        if (type === 'approval/decided') approvals.delete(data.id)
        offset = seq + 1
      }
      if (events.length < 256) break
    }
  } finally { if (reader) await reader.close() }
  const running = ['queued', 'running'].includes(task.status)
  return { phase: running ? approvals.size ? 'approval' : phase : null, reasoned,
    tools: [...calls.values()].map(entry => !running && entry.status === 'running' ? { ...entry, status: 'stopped' } : entry) }
}

export function intervalSeconds(schedule) {
  if (schedule.kind === 'every') return schedule.everySeconds
  if (schedule.kind !== 'rrule') return null
  const line=String(schedule.rrule).split(/\r?\n/).find(l=>/^(RRULE:)?FREQ=/i.test(l))
  if (!line) return null
  const rule=Object.fromEntries(line.toUpperCase().replace(/^RRULE:/,'').split(';').map(field=>field.split('=')))
  if (Object.keys(rule).some(key=>!['FREQ','INTERVAL'].includes(key))) return null
  const unit={MINUTELY:60,HOURLY:3600}[rule.FREQ]
  return unit ? unit*Number(rule.INTERVAL || 1) : null
}
function keep(list, row) {
  list.push(row)
  if (list.length > 200) list.shift()
}
export function historyReader(ctx) {
  const cache = new Map()
  let pending
  async function read(workspaces) {
    const activities = [], approvals = [], ids = new Set()
    for (const room of workspaces) {
      for (const id of room.sessionIds) {
        ids.add(id)
        const state = cache.get(id) || {offset:0, calls:new Map(), asks:new Map(), activities:[], approvals:[]}
        const live = ctx.sessions.get(id)
        let reader
        try {
          if (!live) {
            if (ctx.sessionPersistence.stat && !await ctx.sessionPersistence.stat(id)) continue
            reader = await ctx.sessionPersistence.open(id, 'read')
          }
          for (;;) {
            const events = live ? live.snapshotEvents(state.offset, state.offset+256) : (await reader.read(state.offset, 256)).events
            for (const event of events) {
              const d = event.data, base = {id:id+'/'+event.seq,time:event.time}
              if (event.type === 'tool/call') {
                let args = {}
                try { args=JSON.parse(d.arguments) || {} } catch {}
                const detail = /search/.test(d.name) ? args.query : undefined
                state.calls.set(d.callId,{title:actionTitle(d.name),detail:typeof detail==='string'?detail.slice(0,180):''})
              } else if (event.type === 'tool/result') {
                const m=d.message, call=state.calls.get(m.toolCallId)
                keep(state.activities,{...base,...(call || {title:actionTitle(m.toolName)}),status:m.isError?'失败':'已完成'})
                state.calls.delete(m.toolCallId)
              } else if(event.type === 'approval/asked') {
                state.asks.set(d.id,actionTitle(d.toolName))
              } else if(event.type === 'approval/decided') {
                keep(state.approvals,{...base,title:state.asks.get(d.id)||'工具请求',status:outcomes[d.outcome]||'已处理'})
                state.asks.delete(d.id)
              }
              state.offset=event.seq+1
            }
            if(events.length<256)break
          }
        } finally { if(reader)await reader.close() }
        cache.set(id,state)
        activities.push(...state.activities.map(row=>({...row,scope:room.name})))
        approvals.push(...state.approvals.map(row=>({...row,scope:room.name})))
      }
    }
    for(const key of cache.keys())if(!ids.has(key))cache.delete(key)
    const recent=list=>list.sort((a,b)=>b.time-a.time).slice(0,200)
    return {activities:recent(activities),approvals:recent(approvals)}
  }
  return workspaces => pending ||= read(workspaces).finally(()=>{pending=undefined})
}
