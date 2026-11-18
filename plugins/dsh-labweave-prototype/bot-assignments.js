// Recurring assignments live in DSH's scheduler; duties and storage rules live in the project DB.
export function botAssignments(ctx, {rows, caller, registry, call, output, refresh}) {
  let pending = Promise.resolve()
  function serial(fn) {
    const result = pending.then(fn)
    pending = result.catch(()=>{})
    return result
  }
  function target(scope, fid) {
    const row = rows().find(r=>r.scope===scope && scope!=='global')
    const native = row && registry.get(row.workspaceId)
    const bot = row?.features?.find(f=>f.id===fid && fid!=='chat')
    if(!native || !bot) throw Object.assign(Error('请选择当前项目内有效的功能 Bot。'),{status:404})
    return {row,bot,native,workspace:{id:native.id,path:native.path}}
  }
  function marker(t) { return '[LabWeave '+t.row.scope+'/'+t.bot.id+']\n' }
  const links=(t,id,remove=false)=>call('assignment-links',{workspace:t.workspace,featureId:t.bot.id,id,remove})
  async function schedules(t) {
    const prefix=marker(t)
    const [jobs,owned]=await Promise.all([ctx.schedule.catalog(),links(t)])
    return jobs.filter(s=>(owned.includes(s.id)||s.prompt?.startsWith(prefix)) &&
      (s.target?.kind==='session'?t.native.sessionIds.includes(s.target.sessionId):s.target?.create?.cwd===t.native.path))
  }
  const local=(t,action,args)=>call('project',{workspace:t.workspace,action,args:{...args,featureId:t.bot.id}})
  async function list(t) {
    const [rules,jobs]=await Promise.all([local(t,'bot_assignments',{}),schedules(t)])
    return [...jobs.map(s=>({kind:'schedule',id:s.id,title:s.title,instruction:s.prompt.startsWith(marker(t))?s.prompt.slice(marker(t).length).split('\n任务归属：')[0]:s.prompt,
      rule:s.rrule||'',next:s.scheduledAt,status:s.status})),...rules]
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
    const result=await ctx.schedule.edit(request,session,signal)
    if(result.code && result.code!=='schedule_not_found')throw Error('定时任务已变更，请重新读取后操作。')
    if(result.code && request.action==='update')throw Error('定时任务已移除，请重新分配。')
    return result
  }
  function scoped(args,exec) {
    const {row}=caller(exec)
    if(row.scope!=='global' && args.projectId && args.projectId!==row.scope)throw Error('项目对话只能分配本项目的任务。')
    const scope=row.scope==='global'?args.projectId:row.scope
    const fid=args.featureId || row.features?.find(f=>f.botSessionId===exec.agent.session.header.id)?.id
    return target(scope,fid)
  }
  const properties={featureId:{type:'string'},projectId:{type:'string'},kind:{type:'string',enum:['duty','storage','schedule']},
    title:{type:'string'},instruction:{type:'string'},rrule:{type:'string'}}
  ctx.tools.register({name:'labweave_bot_assign',description:'Assign or update a real task for one project Feature Bot from conversation. Use duty for responsibilities, storage for what to collect and where to keep it, schedule with a DSH RRULE for actual recurring delivery. Same kind and title updates the task. Global chat requires projectId. Resolve featureId from feature_list.',
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
      const prompt=marker(t)+instruction+'\n任务归属：'+JSON.stringify({projectId:t.row.scope,featureId:t.bot.id})+'。先读取此 Bot 的分配任务，按存储要求将结果写入对应功能。'
      const old=(await schedules(t)).find(s=>s.title===title)
      const timing={kind:'rrule',rrule:args.rrule}
      const result=old?await edit({id:old.id,action:'update',expectedUpdatedAt:old.updatedAt??null,patch:{prompt,timing,active:true}},exec.agent.session.id,exec.signal):
        await ctx.schedule.create({title,prompt,timing,target:t.bot.botSessionId && t.native.sessionIds.includes(t.bot.botSessionId)
          ?{kind:'session',sessionId:t.bot.botSessionId}:{kind:'new_once',create:{cwd:t.native.path}}},exec.agent.session.id,exec.signal)
      await links(t,result.id)
      return JSON.stringify({id:result.id,featureId:t.bot.id,title})
    })}})
  ctx.tools.register({name:'labweave_bot_assignments',description:'Read the duties, storage instructions and native scheduled tasks assigned to a project Feature Bot.',
    parameters:{type:'object',properties:{featureId:properties.featureId,projectId:properties.projectId},additionalProperties:false},output,
    execute:async(args,exec)=>JSON.stringify(await list(scoped(args,exec)))})
  ctx.tools.register({name:'labweave_bot_unassign',description:'Withdraw a named duty, storage instruction or scheduled task from a project Feature Bot.',
    parameters:{type:'object',properties:{featureId:properties.featureId,projectId:properties.projectId,kind:properties.kind,title:properties.title},required:['kind','title'],additionalProperties:false},output,
    execute:(args,exec)=>serial(async()=>{
      const t=scoped(args,exec)
      if(args.kind!=='schedule')await local(t,'bot_assignment_write',{kind:args.kind,title:args.title,remove:true})
      else {const job=(await schedules(t)).find(s=>s.title===args.title);if(job){await edit({id:job.id,action:'delete',expectedUpdatedAt:job.updatedAt??null},exec.agent.session.id,exec.signal);await links(t,job.id,true)}}
      if(args.kind!=='schedule')await refresh()
      return JSON.stringify({featureId:t.bot.id,title:args.title})
    })})
  return {serial,cleanup,list:(scope,fid)=>list(target(scope,fid))}
}
