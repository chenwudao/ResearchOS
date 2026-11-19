// Read DSH's effective permission without opening or driving the source Agent.
async function conversationPermission(ctx, workspace, sessionId, signal) {
  const observation = await ctx.sessionQuery.observeSession(sessionId, { signal, projectionMode: 'all' })
  try {
    if (observation.header.origin === 'subagent' || observation.header.cwd !== workspace.path) return null
    const events = observation.events
    const firstPreset = events.find(event => event.type === 'permission/preset')?.seq
    const activity = events.findLast(event =>
      (event.type === 'user/message' && event.data.source.kind === 'user') ||
      (event.type === 'permission/preset' && event.seq !== firstPreset))
    return {
      preset: observation.projections?.values.permissions?.currentValue,
      time: activity?.time ?? 0,
      created: observation.header.createdAt,
    }
  } finally {
    observation[Symbol.dispose]()
  }
}

export async function workspacePermission(ctx, workspace, excluded, signal) {
  if (!workspace) return ctx.permissionPresets.defaultPreset
  const archived = ctx.workspaceRegistry.archivedSessionIds
  const candidates = []
  for (const id of workspace.sessionIds) {
    if (excluded.has(id) || archived.includes(id)) continue
    if (!ctx.sessions.get(id) && !await ctx.sessionPersistence.stat(id)) continue
    const candidate = await conversationPermission(ctx, workspace, id, signal)
    if (candidate?.preset) candidates.push(candidate)
  }
  candidates.sort((a, b) => b.time - a.time || b.created - a.created)
  return candidates[0]?.preset ?? ctx.permissionPresets.defaultPreset
}

export function isBotReminder(row, messages) {
  return messages.some(message => message.source.kind === 'schedule' && message.content.some(block => {
    if (block.type !== 'text') return false
    return row.features?.some(bot => {
      if (bot.id === 'chat') return false
      const owner = JSON.stringify({ projectId: row.scope, featureId: bot.id })
      return (block.text.includes(`[Weave ${row.scope}/${bot.id}]\n`) ||
        block.text.includes(`[LabWeave ${row.scope}/${bot.id}]\n`)) &&
        block.text.includes('\n任务归属：' + owner + '。先读取此 Bot 的分配任务')
    })
  }))
}
