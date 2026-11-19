import { randomUUID } from 'node:crypto'

export function registerSandboxTools(ctx, { call, caller, listRows, registry, ownerRoute, output }) {
  const events = new Map()
  function announce(sessionId, scope, id, kind) {
    const row = listRows().find(item => item.scope === scope && scope !== 'global')
    if (!row || !id) return
    events.delete(sessionId)
    events.set(sessionId, { eventId: randomUUID(), at: Date.now(), workspaceId: row.workspaceId, id, kind })
    if (events.size > 512) events.delete(events.keys().next().value)
  }
  ownerRoute('sandbox-event', ['POST'], data => {
    const event = events.get(data.sessionId)
    return event && ctx.sessions.get(data.sessionId) ? event : null
  })
  const projectId = { type: 'string', description: 'Global chat must explicitly select a Weave project.' }
  function targetFor(args, exec) {
    const { row } = caller(exec)
    if (row.scope !== 'global' && args.projectId && args.projectId !== row.scope) throw Error('不能运行或读取其他课题的实验。')
    const target = listRows().find(r => r.scope !== 'global' && r.scope === (args.projectId || row.scope))
    const native = target && registry.get(target.workspaceId)
    if (!native) throw Error('请指定已绑定的科研项目。')
    return { row, target, workspace: { id: native.id, path: native.path } }
  }
  ctx.tools.register({
    name: 'labweave_sandbox_run',
    description: 'Submit a real bounded Python experiment to the project sandbox, directly from this chat. Supply code OR an existing project-relative script. Files in /workspace are read-only, network is off. Write artifacts under /output. The selected project venv is mounted at /env. Runs automatically within the owner-approved trial budget, otherwise enters WAITING_APPROVAL in the sandbox panel. Use sandbox_status to observe the actual result. Formal experiment matrices use workflow_draft.',
    parameters: { type:'object', additionalProperties:false, properties:{
      title:{type:'string'}, code:{type:'string'}, script:{type:'string'}, args:{type:'array',items:{type:'string'}},
      environment:{type:'string',description:'Project environment ID; omit to use its selected venv.'},
      timeoutSeconds:{type:'integer',minimum:1,maximum:60}, projectId,
    },required:['title'] }, output,
    async execute(args, exec) {
      const {row,target,workspace} = targetFor(args,exec)
      const session = exec.agent.session
      const policy = ctx.sandboxPolicy?.resolve({session})
      if (!policy || policy.mode === 'read-only') throw Error('当前对话是只读模式，不能发起代码试跑。')
      const feature = row.features?.find(f=>f.botSessionId===session.header.id)
      const origin = {sessionId:session.header.id,callId:exec.callId,featureId:feature?.id,
        bot: feature?.label || (row.scope==='global'?'全局助手':'项目对话')}
      const result = await call('sandbox-tool', {workspace,operation:'run',args,origin},exec.signal)
      announce(origin.sessionId,target.scope,result.id,'trial')
      return JSON.stringify(result)
    },
  })
  ctx.tools.register({
    name:'labweave_sandbox_status',
    description:'Read the real project sandbox queue, remaining approved seconds and selected venv. Pass runId for stdout, stderr, exit code and artifacts. Use waitSeconds for a running trial.',
    parameters:{type:'object',additionalProperties:false,properties:{projectId,runId:{type:'string'},waitSeconds:{type:'integer',minimum:0,maximum:20}}},output,
    async execute(args,exec) {
      const {workspace}=targetFor(args,exec)
      return JSON.stringify(await call('sandbox-tool',{workspace,operation:'status',args},exec.signal))
    },
  })
  ctx.tools.register({
    name:'labweave_sandbox_run_approved',
    description:'Start an already human-approved formal experiment protocol in its project sandbox. A draft must be approved in the project UI first.',
    parameters:{type:'object',additionalProperties:false,properties:{projectId,workflowId:{type:'string'}},required:['workflowId']},output,
    async execute(args,exec) {
      const {workspace,target}=targetFor(args,exec)
      const session=exec.agent.session
      if (!ctx.sandboxPolicy || ctx.sandboxPolicy.resolve({session}).mode==='read-only') throw Error('当前对话是只读模式。')
      const result=await call('sandbox-tool',{workspace,operation:'approved-workflow',args},exec.signal)
      announce(session.header.id,target.scope,result.id,'workflow')
      return JSON.stringify(result)
    },
  })
  return announce
}
