import { randomUUID } from 'node:crypto'

const unavailable = '只能引用当前工作区内未归档的对话。请移除不可用的对话引用后重试。'

export function registerSessionReferences(ctx, listRows) {
  const registry = ctx.workspaceRegistry
  const resolver = ctx.sessionReferenceResolver

  function memberScope(session) {
    const header = session?.header
    if (!header || header.origin === 'subagent' || registry.archivedSessionIds.includes(header.id)) return
    const matches = registry.list().filter(workspace => workspace.sessionIds.includes(header.id))
    if (matches.length !== 1 || matches[0].path !== header.cwd) return
    const workspace = matches[0]
    const row = listRows().find(item => item.workspaceId === workspace.id)
    if (!row || row.features?.some(bot => bot.botSessionId === header.id && bot.archived)) return
    return { workspace, row }
  }

  async function allowedTargets(session, ids, signal) {
    const scope = memberScope(session)
    if (!scope) return new Set()
    const { workspace } = scope
    const candidates = [...new Set(ids)].filter(id => id !== session.id && workspace.sessionIds.includes(id))
    if (!candidates.length) return new Set()
    const records = await ctx.sessionQuery.filterSessions([{ kind: 'id', values: candidates }], signal)
    if (memberScope(session)?.workspace.id !== workspace.id) return new Set()
    return new Set(records.filter(record => memberScope(record)?.workspace.id === workspace.id)
      .map(record => record.header.id))
  }

  // The pinned resolver both serves the native @ menu and injects referenced
  // transcripts into the model context. Apply the same policy at both boundaries.
  ctx.effect(() => {
    const { listCandidates, prepare } = resolver
    const scopedCandidates = async function (agent, query, limit = resolver.config.candidateLimit, signal) {
      const scope = memberScope(agent.session)
      if (!scope || scope.workspace.sessionIds.length < 2) return []
      // Apply scope before the visible limit, including when foreign sessions are newer.
      const results = await listCandidates.call(this, agent, query, Number.MAX_SAFE_INTEGER, signal)
      const allowed = await allowedTargets(agent.session, results.map(candidate => candidate.sessionId), signal)
      return results.filter(candidate => allowed.has(candidate.sessionId)).slice(0, limit)
    }
    const scopedPrepare = async function (agent, content, references, route, signal) {
      const ids = references.map(reference => reference?.sessionId)
      const allowed = await allowedTargets(agent.session, ids, signal)
      if (ids.some(id => !allowed.has(id))) throw new Error(unavailable)
      return prepare.call(this, agent, content, references, route, signal)
    }
    const restore = Object.entries({ listCandidates: scopedCandidates, prepare: scopedPrepare }).map(([key, method]) => {
      const descriptor = Object.getOwnPropertyDescriptor(resolver, key)
      resolver[key] = method
      return () => {
        if (resolver[key] !== method) return
        if (descriptor) Object.defineProperty(resolver, key, descriptor)
        else delete resolver[key]
      }
    })
    return () => restore.forEach(dispose => dispose())
  }, 'Weave session reference scope')

  ctx.on('agent/pre-step', async ({ agent, signal }, next) => {
    const { session } = agent
    const events = session.snapshotEvents()
    const retained = session.surface.nodes.map(seq => events[seq]).filter(event =>
      event?.type === 'user/message' && event.data.source.kind === 'session-reference')
    if (!retained.length) return next()
    const ids = event => (event.data.source.references || []).map(reference => reference.sessionId)
    const allowed = await allowedTargets(session, retained.flatMap(ids), signal)
    signal.throwIfAborted()
    for (const event of retained) {
      const sources = ids(event)
      if (sources.length && sources.every(id => allowed.has(id))) continue
      // Preserve the journal while removing the old snapshot from the model surface.
      session.append('user/message', {
        id: randomUUID(),
        role: 'user',
        source: { kind: 'labweave-reference-unavailable' },
        content: [{ type: 'text', text: '(A previously referenced conversation is no longer available in this workspace.)' }],
      }, {
        surfaceOp: { op: 'replace', startSeq: event.seq, endSeq: event.seq },
        sourceEventSeqs: [event.seq],
      })
    }
    return next()
  }, { prepend: true })
  return { memberScope, allowedTargets }
}
