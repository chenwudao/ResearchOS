// Old Bot tasks also have the full generated ownership footer. A user-authored
// occurrence of the old product name is ordinary prompt text.
export function displayAssignment(record) {
  const match = /^\[LabWeave ([\w-]+)\/([\w-]+)\]\n/.exec(record.prompt)
  if (!match) return record
  const owner = JSON.stringify({ projectId: match[1], featureId: match[2] })
  if (!record.prompt.includes('\n任务归属：' + owner + '。先读取此 Bot 的分配任务')) return record
  return { ...record, prompt: '[Weave ' + record.prompt.slice('[LabWeave '.length) }
}

// Recurring assignments live in the native scheduler; duties live in the project DB.
export function botAssignments(ctx, {rows, caller, registry, call, output, refresh}) {
  let pending = Promise.resolve()
  function serial(fn) {
    const result = pending.then(fn)
    pending = result.catch(()=>{})
    return result
  }
  const fail=(message,status=400)=>Object.assign(Error(message),{status})
  function target(scope, fid) {
    const row = rows().find(r=>r.scope===scope && scope!=='global')
    const native = row && registry.get(row.workspaceId)
    const bot = row?.features?.find(f=>f.id===fid && fid!=='chat')
    if(!native || !bot) throw Object.assign(Error('请选择当前项目内有效的功能 Bot。'),{status:404})
    return {row,bot,native,workspace:{id:native.id,path:native.path}}
  }
  function marker(t, brand = 'Weave') { return '['+brand+' '+t.row.scope+'/'+t.bot.id+']\n' }
  function prefixFor(t, prompt) {
    return [marker(t), marker(t, 'LabWeave')].find(prefix => prompt?.startsWith(prefix))
  }
  const links=(t,id,remove=false)=>call('assignment-links',{workspace:t.workspace,featureId:t.bot.id,id,remove})
  async function schedules(t) {
    const [jobs,owned]=await Promise.all([ctx.schedule.catalog(),links(t)])
    return jobs.filter(s=>(owned.includes(s.id)||prefixFor(t,s.prompt)) &&
      (s.target?.kind==='session'?t.native.sessionIds.includes(s.target.sessionId):s.target?.create?.cwd===t.native.path))
  }
  const local=(t,action,args)=>call('project',{workspace:t.workspace,action,args:{...args,featureId:t.bot.id}})
  function promptFor(t,instruction) {
    return marker(t)+instruction+'\n任务归属：'+JSON.stringify({projectId:t.row.scope,featureId:t.bot.id})+'。先读取此 Bot 的分配任务，按要求完成并记录结果。'
  }
  function recurrence(rule) {
    const rrule = rule.trim()
    if (!/^(?:FREQ=|RRULE:)/i.test(rrule) || /[\r\n]/.test(rrule)) return {kind:'rrule',rrule}
    const start = new Date().toISOString().replace(/[-:]/g,'').replace(/\.\d{3}Z$/, 'Z')
    return {kind:'rrule',rrule:`DTSTART:${start}\nRRULE:${rrule.replace(/^RRULE:/i,'')}`}
  }
  async function scheduleWrite(method, request, session, signal) {
    try {
      return await ctx.schedule[method](request,session,signal)
    } catch (error) {
      if (error?.name === 'ScheduleInputError') throw fail('定时任务无法保存：' + error.message)
      throw error
    }
  }
  async function list(t) {
    const [rules,jobs]=await Promise.all([local(t,'bot_assignments',{}),schedules(t)])
    return [...jobs.map(s=>{
      const prefix = prefixFor(t, s.prompt)
      return {kind:'schedule',id:s.id,title:s.title,instruction:prefix?s.prompt.slice(prefix.length).split('\n任务归属：')[0]:s.prompt,
        rule:s.rrule||s.timing?.rrule||'',next:s.scheduledAt,status:s.status,
        executionActive:s.executionActive===true,updatedAt:s.updatedAt??null}
    }),...rules]
  }
  async function writeSchedule(scope,args) {
    const t=target(scope,args.featureId)
    const title=String(args.title||'').trim(), instruction=String(args.instruction||'').trim(), rrule=String(args.rrule||'').trim()
    if(!title||title.length>80||!instruction||instruction.length>3000)throw fail('任务名称或说明无效。')
    if(!rrule)throw fail('定时任务需要 RRULE。')
    const prompt=promptFor(t,instruction), timing=recurrence(rrule)
    if(args.id){
      const current=(await schedules(t)).find(s=>s.id===args.id)
      if(!current)throw fail('定时任务已移除，请重新分配。',404)
      if(args.expectedUpdatedAt!==undefined && args.expectedUpdatedAt!==(current.updatedAt??null))
        throw fail('定时任务已变更，请重新读取后操作。',409)
      const result=await edit({id:current.id,action:'update',expectedUpdatedAt:current.updatedAt??null,
        patch:{title,prompt,timing,active:true}})
      await links(t,result.id)
      return result
    }
    const result=await scheduleWrite('create',{title,prompt,timing,target:t.bot.botSessionId && t.native.sessionIds.includes(t.bot.botSessionId)
      ?{kind:'session',sessionId:t.bot.botSessionId}:{kind:'new_once',create:{cwd:t.native.path}}})
    await links(t,result.id)
    return result
  }
  async function deleteSchedule(scope,args) {
    const t=target(scope,args.featureId)
    const job=(await schedules(t)).find(s=>s.id===args.id)
    if(!job)throw fail('定时任务已移除，请重新读取。',404)
    if(args.expectedUpdatedAt!==undefined && args.expectedUpdatedAt!==(job.updatedAt??null))
      throw fail('定时任务已变更，请重新读取后操作。',409)
    await edit({id:job.id,action:'delete',expectedUpdatedAt:job.updatedAt??null})
    await links(t,job.id,true)
    return {id:job.id,deleted:true}
  }
  async function history(scope, fid, id) {
    const t = target(scope, fid)
    if (!(await schedules(t)).some(task => task.id === id)) throw fail('此 Bot 没有这项定时任务。',404)
    const page = await ctx.schedule.history({id,limit:12})
    if (page.code) throw fail('定时任务已移除。',404)
    return page.records.map(record => ({
      id: record.messageId, deliveredAt: record.deliveredAt,
      sessionId: t.native.sessionIds.includes(record.targetSessionId) &&
        !registry.archivedSessionIds?.includes(record.targetSessionId) ? record.targetSessionId : null,
    }))
  }
  async function index(scope) {
    const row=rows().find(r=>r.scope===scope && scope!=='global')
    if(!row||!registry.get(row.workspaceId))throw fail('请选择当前项目内有效的科研项目。',404)
    const entries=[]
    for(const bot of (row.features||[]).filter(f=>f.id!=='chat')){
      const tasks=await list(target(scope,bot.id))
      if(tasks.length)entries.push({featureId:bot.id,label:bot.label,tasks})
    }
    return entries
  }
  async function cleanup(scope,fid) {
    const targets=rows().filter(r=>r.scope!=='global' && (scope==='all'||r.scope===scope) &&
      r.features?.some(f=>f.id===fid && fid!=='chat' && (scope!=='all'||f.builtin||f.shared)))
    for(const row of targets) {
      const t=target(row.scope,fid)
      for(const s of await schedules(t)) await edit({id:s.id,action:'delete',expectedUpdatedAt:s.updatedAt??null})
    }
  }
  async function edit(request,session,signal) {
    const result=await scheduleWrite('edit',request,session,signal)
    if(result.code && result.code!=='schedule_not_found')throw fail('定时任务已变更，请重新读取后操作。',409)
    if(result.code && request.action==='update')throw fail('定时任务已移除，请重新分配。',404)
    return result
  }
  function scoped(args,exec) {
    const {row}=caller(exec)
    if(row.scope!=='global' && args.projectId && args.projectId!==row.scope)throw Error('项目对话只能分配本项目的任务。')
    const scope=row.scope==='global'?args.projectId:row.scope
    const fid=args.featureId || row.features?.find(f=>f.botSessionId===exec.agent.session.header.id)?.id
    return target(scope,fid)
  }
  const properties={featureId:{type:'string'},projectId:{type:'string'},kind:{type:'string',enum:['duty','schedule']},
    title:{type:'string'},instruction:{type:'string'},rrule:{type:'string'}}
  ctx.tools.register({name:'labweave_bot_assign',description:'Assign or update a real task for one project Feature Bot from conversation. Use duty for responsibilities and work rules; instruction is Markdown source rendered in the Bot task panel. Schedule with an RRULE for actual recurring delivery. Same kind and title updates the task. Global chat requires projectId. Resolve featureId from feature_list.',
    parameters:{type:'object',properties,required:['kind','title','instruction'],additionalProperties:false},output,
    async execute(args,exec){return serial(async()=>{
      const t=scoped(args,exec), title=args.title.trim(), instruction=args.instruction.trim()
      if(!title||!instruction||title.length>80||instruction.length>3000)throw Error('任务名称或说明无效。')
      if(args.kind!=='schedule'){
        const rules=await local(t,'bot_assignment_write',{kind:args.kind,title,instruction})
        await refresh()
        return JSON.stringify(rules)
      }
      if(!args.rrule)throw Error('定时任务需要 RRULE。')
      const prompt=promptFor(t,instruction)
      const old=(await schedules(t)).find(s=>s.title===title)
      const timing=recurrence(args.rrule)
      const result=old?await edit({id:old.id,action:'update',expectedUpdatedAt:old.updatedAt??null,patch:{prompt,timing,active:true}},exec.agent.session.id,exec.signal):
        await scheduleWrite('create',{title,prompt,timing,target:t.bot.botSessionId && t.native.sessionIds.includes(t.bot.botSessionId)
          ?{kind:'session',sessionId:t.bot.botSessionId}:{kind:'new_once',create:{cwd:t.native.path}}},exec.agent.session.id,exec.signal)
      await links(t,result.id)
      return JSON.stringify({id:result.id,featureId:t.bot.id,title})
    })}})
  ctx.tools.register({name:'labweave_bot_assignments',description:'Read the duties and native scheduled tasks assigned to a project Feature Bot.',
    parameters:{type:'object',properties:{featureId:properties.featureId,projectId:properties.projectId},additionalProperties:false},output,
    execute:async(args,exec)=>JSON.stringify(await list(scoped(args,exec)))})
  ctx.tools.register({name:'labweave_bot_assignment_index',description:'Read every Feature Bot assignment (duties and scheduled tasks) in one project. Global chat requires an explicit projectId; project chat reads only its own project.',
    parameters:{type:'object',properties:{projectId:properties.projectId},additionalProperties:false},output,
    async execute(args,exec){
      const {row}=caller(exec)
      if(row.scope!=='global' && args.projectId!==undefined && args.projectId!==row.scope)throw Error('项目对话只能读取本项目的 Bot 分工。')
      const scope=row.scope==='global'?args.projectId:row.scope
      if(!scope)throw Error('全局助手读取项目分工时必须显式指定 projectId。')
      return JSON.stringify(await index(scope))
    }})
  ctx.tools.register({name:'labweave_bot_unassign',description:'Withdraw a named duty or scheduled task from a project Feature Bot.',
    parameters:{type:'object',properties:{featureId:properties.featureId,projectId:properties.projectId,kind:properties.kind,title:properties.title},required:['kind','title'],additionalProperties:false},output,
    execute:(args,exec)=>serial(async()=>{
      const t=scoped(args,exec)
      if(args.kind!=='schedule')await local(t,'bot_assignment_write',{kind:args.kind,title:args.title,remove:true})
      else {const job=(await schedules(t)).find(s=>s.title===args.title);if(job){await edit({id:job.id,action:'delete',expectedUpdatedAt:job.updatedAt??null},exec.agent.session.id,exec.signal);await links(t,job.id,true)}}
      if(args.kind!=='schedule')await refresh()
      return JSON.stringify({featureId:t.bot.id,title:args.title})
    })})
  return {serial,cleanup,list:(scope,fid)=>list(target(scope,fid)),writeSchedule,deleteSchedule,index,history}
}
