// Display only user-facing action summaries. Tool inputs, outputs and approval payloads stay in DSH.
const titles = {
  web_search: '搜索网页', paper_search: '搜索论文', resource_search: '搜索项目资料',
  project_list: '查看科研项目', project_get_context: '读取项目资料', resource_read: '阅读资料',
  feature_create: '创建功能 Bot', feature_push: '整理功能记录', sandbox_run: '提交实验试跑',
  sandbox_status: '查看实验进度', workflow_draft: '拟定实验计划', schedule_create: '创建预定任务',
}
const outcomes = {'allowed-once':'已批准', rejected:'已拒绝', cancelled:'已取消', unavailable:'未获批准'}
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
function actionTitle(name) {
  return titles[String(name).replace(/^labweave_/, '')] || name || '工具调用'
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
