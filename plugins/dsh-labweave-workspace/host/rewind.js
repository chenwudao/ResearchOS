import { randomUUID } from 'node:crypto'

const rewindKind = 'labweave-rewind'

function conflict(message) {
  return Object.assign(new Error(message), { status: 409 })
}

function isUserInput(event) {
  return event?.type === 'user/message' && event.data.source.kind === 'user'
}

function isAnswer(event) {
  return event?.type === 'assistant/message'
}

function isConversationEvent(event) {
  return isAnswer(event) || isUserInput(event)
    || (event.type === 'user/message' && event.data.source.kind === rewindKind)
}

export async function rewindConversation(ctx, workspace, { sessionId, seq, role, tail }, retract) {
  if (!Number.isSafeInteger(seq) || seq < 0 || !Number.isSafeInteger(tail)
      || (role !== 'user' && role !== 'assistant')) {
    throw Object.assign(new Error('请选择要撤回的消息。'), { status: 400 })
  }
  if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) {
    throw conflict('请先恢复已归档的对话。')
  }
  const resolved = await ctx.sessionController.resolveAgent(sessionId)
  if (!resolved.agent || resolved.agent.session.header.cwd !== workspace.path) {
    throw conflict('当前对话暂不可撤回。')
  }
  const { agent } = resolved
  const { session } = agent
  let operation
  try {
    operation = agent.runMaintenance(async () => {
      if (ctx.workspaceRegistry.archivedSessionIds.includes(sessionId)) {
        throw conflict('请先恢复已归档的对话。')
      }
      if (agent.inbox.nextTurn.length || agent.inbox.nextStep.length) {
        throw conflict('请等当前回复和排队消息处理完后再撤回。')
      }
      const events = session.snapshotEvents()
      if (events.findLast(isConversationEvent)?.seq !== tail) {
        throw conflict('对话已有更新，请重新选择要撤回的消息。')
      }
      const target = events[seq]
      const nodes = session.surface.nodes
      const index = nodes.indexOf(seq)
      if (!(role === 'user' ? isUserInput(target) : isAnswer(target)) || index < 0) {
        throw conflict('这条消息已撤回或已压缩。请选择仍在当前上下文中的消息。')
      }

      let fromSeq = seq
      let start = index
      if (role === 'assistant') {
        // Drop the selected response's step, while keeping any input admitted in that step.
        const step = events.findLast(event => event.seq < seq && event.type === 'step/start'
          && event.data.turn === target.data.turn && event.data.step === target.data.step)
        if (step) {
          const question = events.findLast(event => event.seq > step.seq && event.seq < seq && isUserInput(event))
          fromSeq = question ? question.seq + 1 : step.seq
          while (start > 0 && nodes[start - 1] >= fromSeq && nodes[start - 1] < seq
                 && events[nodes[start - 1]].type !== 'system/message') start--
        }
      }
      const removed = nodes.slice(start)
      const messageId = randomUUID()
      // The append-only DSH replacement is both the context change and the transcript checkpoint.
      // Use a nonempty marker so later prompts also work with providers that reject empty messages.
      session.append('user/message', {
        id: messageId,
        role: 'user',
        source: { kind: rewindKind, fromSeq },
        content: [{ type: 'text', text: '(A conversation rewind occurred. Use the retained messages as context.)' }],
      }, {
        surfaceOp: { op: 'replace', startSeq: removed[0], endSeq: removed.at(-1) },
        sourceEventSeqs: [...removed].sort((a, b) => a - b),
      })
      const draft = role === 'user'
        ? target.data.content.filter(block => block.type === 'text').map(block => block.text).join('')
        : ''
      const saved = await ctx.sessions.flush(session).catch(() => false)
      if (retract) {
        const messageIds = removed.map(seq => events[seq]).filter(isUserInput).map(event => event.data.id)
        if (messageIds.length) await retract({ sessionId, messageId, messageIds })
      }
      return { draft, saved }
    })
  } catch {
    throw conflict('回复正在生成。请先停止或等待生成结束，再撤回消息。')
  }
  return operation
}
