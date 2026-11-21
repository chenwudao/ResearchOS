const test = require('node:test')

test('Worker activity reports actual tool state without copying private content', async () => {
  const { workerActivity } = await import('../plugins/dsh-labweave-workspace/host/assistant-history.js')
  const events = [
    { seq: 0, type: 'step/start', data: {} },
    { seq: 1, type: 'assistant/live-chunk', data: { chunk: { type: 'reasoning-delta', text: 'private text' } } },
    { seq: 2, type: 'tool/call', data: { callId: 'call', name: 'labweave_paper_search', arguments: 'private arguments' } },
    { seq: 3, type: 'tool/result', data: { message: { toolCallId: 'call', content: 'private result' } } },
    { seq: 4, type: 'approval/asked', data: { id: 'approval', payload: 'private payload' } },
    { seq: 5, type: 'tool/call', data: { callId: 'unknown', name: 'labweave_internal_fixture' } },
    { seq: 6, type: 'tool/call', data: { callId: 'external', name: 'mcp__fixture__lookup' } },
  ]
  const ctx = { sessions: new Map([['worker', { snapshotEvents: (from, to) => events.slice(from, to) }]]) }
  const activity = await workerActivity(ctx, { id: 'worker', status: 'running' })
  assert.equal(activity.phase, 'approval')
  assert.equal(activity.tools[0].status, 'completed')
  assert.equal(activity.tools[0].title, '搜索论文')
  assert.deepEqual(activity.tools.slice(1).map(tool => tool.title), ['项目操作', '调用外部工具'])
  assert.doesNotMatch(JSON.stringify(activity), /private|labweave_|mcp__/)
})
const assert = require('node:assert/strict')

test('assistant history joins tool and approval outcomes across pages and reads later events once',async()=>{
  const {historyReader}=await import('../plugins/dsh-labweave-workspace/host/assistant-history.js')
  const events=[]
  const add=(type,data)=>events.push({type,data,seq:events.length,time:1700000000000+events.length})
  for(let i=0;i<255;i++)add('system/message',{})
  add('tool/call',{name:'paper_search',callId:'one',arguments:'{"query":"entropy"}'})
  add('tool/result',{message:{toolCallId:'one',toolName:'paper_search'}})
  add('approval/asked',{id:'audit',toolName:'bash'})
  let live=true,closed=0
  const read=historyReader({sessions:{get:()=>live?{snapshotEvents:(a,b)=>events.slice(a,b)}:null},
    sessionPersistence:{open:async()=>({read:async(a,n)=>({events:events.slice(a,a+n)}),close:async()=>{closed++}})}})
  const rooms=[{name:'实验甲',sessionIds:['s']}]
  const first=await read(rooms)
  assert.deepEqual(first.activities.map(r=>[r.title,r.detail,r.scope]),[['搜索论文','entropy','实验甲']])
  assert.equal(first.approvals.length,0)
  live=false;add('approval/decided',{id:'audit',outcome:'allowed-once'})
  const next=await read(rooms)
  assert.equal(next.activities.length,1)
  assert.deepEqual(next.approvals.map(r=>[r.title,r.status]),[['bash','已批准']])
  assert.equal(closed,1)
  assert.deepEqual(await read([]),{activities:[],approvals:[]})
})
