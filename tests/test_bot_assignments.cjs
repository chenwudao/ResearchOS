const {test}=require('node:test')
const assert=require('node:assert/strict')

test('Bot assignments respect the project, update recurring work and remove only owned schedules',async()=>{
  const {botAssignments}=await import('../plugins/dsh-labweave-workspace/host/bot-assignments.js')
  const rows=['global','a','b'].map(scope=>({scope,workspaceId:scope,features:[{id:'ideas',label:'点子',builtin:true}]}))
  const rooms=Object.fromEntries(rows.map(r=>[r.scope,{id:r.scope,path:'/'+r.scope,sessionIds:['s-'+r.scope]}]))
  const tools=new Map(), tasks=new Map(), rules=new Map(), links=new Map()
  const ctx={tools:{register(t){tools.set(t.name,t)}},schedule:{
    catalog:async()=>[...tasks.values()],create:async spec=>{const id='s'+tasks.size, row={...spec,id,status:'active',rrule:spec.timing.rrule};tasks.set(id,row);return row},
    edit:async req=>{if(req.action==='delete'){tasks.delete(req.id);return {id:req.id,deleted:true}}const row=tasks.get(req.id);Object.assign(row,req.patch);return row},
  }}
  const manager=botAssignments(ctx,{rows:()=>rows,registry:{get:id=>rooms[id]},caller:e=>({row:rows.find(r=>r.scope===e.scope)}),output:{},refresh:async()=>{},
    call:async(route,{workspace,action,args,id,remove,featureId})=>{
      if(route==='assignment-links'){const key=workspace.id+'/'+featureId, set=links.get(key)||new Set();if(id){if(remove)set.delete(id);else set.add(id)}links.set(key,set);return [...set]}
      const key=workspace.id+'/'+args.featureId
      if(action==='bot_assignment_write')rules.set(key,[{kind:args.kind,title:args.title,instruction:args.instruction}])
      return rules.get(key)||[]
    }})
  const assign=(scope,args)=>tools.get('labweave_bot_assign').execute({featureId:'ideas',title:'核查',instruction:'保存来源',...args},
    {scope,agent:{session:{id:'s-'+scope,header:{id:'s-'+scope}}}})
  await assert.rejects(assign('a',{projectId:'b',kind:'duty'}))
  await assign('global',{projectId:'a',kind:'storage'})
  await assign('a',{kind:'schedule',rrule:'FREQ=DAILY'})
  await assign('a',{kind:'schedule',rrule:'FREQ=WEEKLY'})
  await assign('b',{kind:'schedule',rrule:'FREQ=DAILY'})
  assert.equal(tasks.size,2)
  const oldTask = tasks.values().next().value
  assert.ok(oldTask.prompt.startsWith('[Weave a/ideas]'))
  oldTask.prompt = oldTask.prompt.replace('[Weave ', '[LabWeave ')
  const { displayAssignment } = await import('../plugins/dsh-labweave-workspace/host/bot-assignments.js')
  assert.ok(displayAssignment(oldTask).prompt.startsWith('[Weave a/ideas]'))
  assert.ok(oldTask.prompt.startsWith('[LabWeave a/ideas]'))
  const note = { prompt: '[LabWeave a/ideas]\n用户自己输入的内容。' }
  assert.equal(displayAssignment(note), note)
  assert.equal((await manager.list('a', 'ideas'))[0].instruction, '保存来源')
  tasks.values().next().value.prompt='在自动化管理器中修改过的提示'
  assert.deepEqual((await manager.list('a','ideas')).map(r=>r.kind),['schedule','storage'])
  const firstId=oldTask.id
  const edited=await manager.writeSchedule('a',{featureId:'ideas',id:firstId,title:'每周核查',instruction:'## 新要求\n\n- 先核对来源',
    rrule:'FREQ=WEEKLY',expectedUpdatedAt:null})
  assert.ok(edited.prompt.startsWith('[Weave a/ideas]\n## 新要求'))
  const index=await manager.index('a')
  assert.deepEqual(index.map(item=>item.featureId),['ideas'])
  assert.ok(index[0].tasks.some(task=>task.kind==='schedule'&&task.title==='每周核查'))
  assert.ok(index[0].tasks.some(task=>task.kind==='storage'&&task.title==='核查'))
  await manager.deleteSchedule('a',{featureId:'ideas',id:firstId})
  assert.equal(tasks.size,1)
  await manager.cleanup('a','ideas')
  assert.equal(tasks.size,1)
  assert.equal((await manager.list('b','ideas')).length,1)
})
