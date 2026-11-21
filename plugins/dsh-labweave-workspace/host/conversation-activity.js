const endStatus = new Map([
  ['completed', 'completed'], ['error', 'failed'], ['blocked', 'failed'], ['max-tokens', 'failed'],
])

export function registerConversationActivity(ctx, { rows, call, ownerRoute }) {
  const native = new Map()
  ctx.on('session/event', (session, event) => {
    if (session.header.origin === 'subagent') return
    if (event.type === 'turn/start') {
      native.set(session.id, { ...native.get(session.id), running: true })
    } else if (event.type === 'turn/end') {
      const previous = native.get(session.id)
      const status = endStatus.get(event.data.reason?.kind)
      const terminal = status ? { id: session.id + '/' + event.seq, status, time: event.time } : previous?.terminal
      native.set(session.id, { running: false, terminal })
    }
  })

  let pending
  async function snapshot() {
    const catalog = rows()
    const projects = new Map(catalog.filter(row => row.scope !== 'global').map(row => [row.scope, row]))
    const dispatches = await call('bot-conversation-activity', { projects: [...projects.keys()] })
    const archived = new Set(ctx.workspaceRegistry.archivedSessionIds)
    const registry = new Map(ctx.workspaceRegistry.list().map(room => [room.id, room]))
    const allowed = new Set()
    const items = new Map()
    const add = (target, activity) => {
      if (!activity?.running && !activity?.terminal) return
      const key = target.sessionId || target.workspaceId + ':' + target.featureId
      const item = items.get(key) || { ...target, running: false }
      item.running ||= activity.running
      if (activity.terminal && (!item.terminal || item.terminal.time <= activity.terminal.time)) {
        item.terminal = activity.terminal
      }
      items.set(key, item)
    }
    for (const row of catalog) {
      const memberIds = registry.get(row.workspaceId)?.sessionIds || []
      const botIds = new Set(row.botSessionIds)
      const featuresBySession = new Map((row.features || []).filter(feature => feature.botSessionId)
        .map(feature => [feature.botSessionId, feature.id]))
      for (const sessionId of memberIds) {
        allowed.add(sessionId)
        if (archived.has(sessionId)) continue
        const featureId = featuresBySession.get(sessionId)
        if (featureId) add({ workspaceId: row.workspaceId, featureId }, native.get(sessionId))
        else if (!botIds.has(sessionId)) add({ workspaceId: row.workspaceId, sessionId }, native.get(sessionId))
      }
    }
    for (const dispatch of dispatches) {
      const row = projects.get(dispatch.project)
      if (!row?.features?.some(feature => feature.id === dispatch.feature)) continue
      const running = dispatch.status === 'queued' || dispatch.status === 'running'
      add({ workspaceId: row.workspaceId, featureId: dispatch.feature }, {
        running,
        terminal: running ? undefined : { id: dispatch.id, time: dispatch.time,
          status: dispatch.status === 'completed' ? 'completed' : 'failed' },
      })
    }
    for (const [id, activity] of native) {
      if (!allowed.has(id) && !activity.running && (activity.terminal?.time || 0) < Date.now() - 60000) native.delete(id)
    }
    return [...items.values()]
  }
  ownerRoute('conversation-activity', ['GET'], () => {
    pending ??= snapshot().finally(() => { pending = undefined })
    return pending
  })
}
