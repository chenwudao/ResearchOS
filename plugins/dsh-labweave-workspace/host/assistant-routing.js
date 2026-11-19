// The pinned DSH compactor reserves 65,536 tokens by default, in addition to
// its output allowance. A smaller window still needs room for the input.
const headroom = 65_536
const windows = [96_000, 128_000, 192_000, 256_000, 384_000, 512_000, 768_000]
const reserve = (maxTokens = 0) => headroom + maxTokens
const routeIs = (left, right) => left?.provider === right?.provider && left?.model === right?.model

function textTokens(text) {
  // Estimate ASCII and other scripts separately. Native DSH still measures
  // the assembled request and manages compaction.
  const ascii = text.replace(/[^\x00-\x7f]/g, '').length
  return Math.ceil(ascii / 3) + text.length - ascii
}

function messageTokens(message) {
  return 12 + (message.content || []).reduce((total, part) =>
    total + (part.type === 'image' ? 2048 : typeof part.text === 'string' ? textTokens(part.text) : 0), 0)
}

function profile(model) {
  return {
    provider: model.provider,
    model: model.id,
    label: model.name,
    contextWindow: model.context?.contextWindow,
    contextOptions: windows.filter(size => size < model.context?.contextWindow && size >= reserve(model.defaultMaxTokens) + 8192),
    outputTokens: model.defaultMaxTokens,
    inputModalities: model.inputModalities,
    efforts: model.reasoning?.efforts || [],
    defaultEffort: model.reasoning?.defaultEffort,
  }
}

export function chooseAssistantRoute(models, preference, message, history, defaultRoute) {
  const hasImage = message.content.some(part => part.type === 'image')
  const candidates = hasImage
    ? models.filter(model => !model.inputModalities || model.inputModalities.includes('image'))
    : models
  if (preference?.mode === 'fixed') {
    const model = candidates.find(candidate => routeIs(candidate, preference))
    if (!model) throw Error('助手的固定模型当前不可用或不支持此输入，请在助手设置中调整。')
    if (preference.reasoningEffort && !model.efforts.some(effort => effort.id === preference.reasoningEffort))
      throw Error('助手固定的推理强度已不可用，请在助手设置中重新选择。')
    if (preference.contextWindow && !model.contextOptions.includes(preference.contextWindow))
      throw Error('助手固定的上下文窗口已不可用，请在助手设置中重新选择。')
    return { provider: model.provider, model: model.model, reasoningEffort: preference.reasoningEffort,
      contextWindow: preference.contextWindow }
  }

  const text = message.content.filter(part => part.type === 'text').map(part => part.text).join(' ').trim()
  const complexity = textTokens(text) >= 1200 ||
    /推导|论证|对比|比较|复现|实验设计|多步|审稿|因果|反例|长文|derive|prove|compare|replicat|benchmark|experiment design|trade.off/i.test(text)
    ? 'high' : !hasImage && textTokens(text) <= 75 ? 'low' : 'standard'
  const input = Math.ceil(1.25 * (messageTokens(message) + history.reduce((count, item) => count + messageTokens(item), 0))) + 8192
  const needed = model => input + reserve(model.outputTokens)
  const fits = model => (model.contextWindow ?? 0) >= needed(model)
  const lightweight = model => /(?:^|[-_. /])(flash|mini|lite|haiku|nano|small)(?:$|[-_. /]|\d)/i.test(model.model)
  const available = [...candidates].sort((a, b) =>
    Number(fits(b)) - Number(fits(a)) ||
    (complexity === 'high' ? Number(b.efforts.length > 0) - Number(a.efforts.length > 0) : 0) ||
    (complexity === 'low' ? Number(lightweight(b)) - Number(lightweight(a)) : 0) ||
    (complexity === 'high' ? Number(lightweight(a)) - Number(lightweight(b)) : 0) ||
    (!fits(a) ? (b.contextWindow ?? 0) - (a.contextWindow ?? 0) : 0) ||
    Number(routeIs(b, defaultRoute)) - Number(routeIs(a, defaultRoute)))
  const model = available[0]
  if (!model) return null
  const effort = complexity === 'high' ? model.efforts.at(-1)?.id : complexity === 'low' ? model.efforts[0]?.id : model.defaultEffort
  return {
    provider: model.provider,
    model: model.model,
    reasoningEffort: effort,
    contextWindow: model.contextOptions.find(size => size >= needed(model)),
  }
}

export async function registerAssistantRouting(ctx, { call, ownerRoute, failure, owns }) {
  let preference = await call('assistant-model')
  let models = []
  let pending
  let saving = Promise.resolve()
  let catalogRevision = 0
  let loadedRevision = -1
  const turns = new WeakMap()

  function loadModels() {
    if (pending) return pending
    pending = ctx.agents.withoutInitiator(async () => {
      while (loadedRevision !== catalogRevision) {
        const revision = catalogRevision
        const groups = await Promise.all(ctx.llm.listProviders().map(async provider => {
          try {
            const entries = await ctx.llm.listModels(provider.id)
            const metadata = await Promise.allSettled(entries.map(entry => ctx.llm.resolveModelInfo(provider.id, entry.id)))
            return metadata.flatMap(result => result.status === 'fulfilled'
              ? [{ ...profile(result.value), label: result.value.name + '（' + provider.name + '）' }]
              : [])
          } catch {
            return []
          }
        }))
        models = groups.flat()
        loadedRevision = revision
      }
    }).finally(() => { pending = undefined })
    return pending
  }

  const refreshModels = () => {
    catalogRevision++
    return loadModels()
  }
  ctx.on('llm/adapters-updated', refreshModels)
  ctx.on('llm/models-updated', refreshModels)
  ctx.on('agent/created', async ({ agent }) => {
    if (owns(agent.session)) await loadModels()
  })
  void loadModels().catch(() => {})

  ownerRoute('assistant-model', ['GET', 'POST'], async data => {
    await loadModels()
    if (Object.keys(data).length) {
      const write = saving.then(async () => {
        if (data.preference?.mode === 'fixed' && !(data.initialize && preference)) {
          const match = models.find(model => routeIs(model, data.preference))
          if (!match || data.preference.reasoningEffort && !match.efforts.some(effort => effort.id === data.preference.reasoningEffort)
            || data.preference.contextWindow && !match.contextOptions.includes(data.preference.contextWindow))
            throw failure('所选模型、推理强度或上下文窗口当前不可用。')
        }
        preference = await call('assistant-model', data)
      })
      saving = write.catch(() => {})
      await write
    }
    return { preference, models }
  })

  // DSH emits claimed synchronously before it captures the step's selection.
  // Keep one decision for the whole turn, including any tool calls and retries.
  ctx.on('agent/inbox/claimed', ({ agent, message, turn }) => {
    const previous = turns.get(agent)
    if (!['user', 'schedule'].includes(message.source.kind) || !owns(agent.session) || previous?.turn === turn) return
    if (!message.content.length && preference?.mode !== 'fixed') {
      if (previous && !previous.error && routeIs(previous, agent.model.current()))
        turns.set(agent, { ...previous, turn })
      return
    }
    try {
      const configured = ctx.agentDefaultModel.currentSelection()
      const choice = chooseAssistantRoute(models, preference, message,
        preference?.mode === 'fixed' ? [] : agent.session.deriveMessages(), configured)
      if (!choice) return
      const { contextWindow, ...pick } = choice
      const selection = pick.reasoningEffort ? pick : { provider: pick.provider, model: pick.model }
      const current = agent.model.current()
      if (!routeIs(current, selection) || current?.reasoningEffort !== selection.reasoningEffort)
        agent.model.select(selection)
      turns.set(agent, { turn, ...selection, contextWindow })
    } catch (error) {
      turns.set(agent, { turn, error })
    }
  })
  ctx.on('agent/pre-step', ({ agent, turn }, next) => {
    const choice = turns.get(agent)
    if (choice?.turn === turn && choice.error) throw choice.error
    return next()
  })
  function contextLimit(provider, model, metadata, maximumOutput) {
    const agent = ctx.agents.currentInitiator()
    const choice = agent && turns.get(agent)
    const cap = choice?.contextWindow
    if (cap && agent.status === 'running' && choice.provider === provider && choice.model === model &&
        cap < metadata.context?.contextWindow && cap >= reserve(maximumOutput) + 8192 && owns(agent.session)) {
      return { ...metadata, context: { ...metadata.context, contextWindow: cap } }
    }
    return metadata
  }

  // Keep the assistant's window scoped to its native DSH driver. Compaction
  // reads exact model info; the session journals the prepared call's window.
  ctx.effect(() => {
    const llm = ctx.llm
    const methods = {
      prepareCall: original => async function (config, ...args) {
        const result = await original.call(this, config, ...args)
        return contextLimit(config.provider, config.model, result, result.config.maxTokens)
      },
      resolveModelInfo: original => async function (provider, model, ...args) {
        const result = await original.call(this, provider, model, ...args)
        return contextLimit(provider, model, result, result.defaultMaxTokens)
      },
    }
    const restore = Object.entries(methods).map(([key, adapt]) => {
      const descriptor = Object.getOwnPropertyDescriptor(llm, key)
      const replacement = adapt(llm[key])
      llm[key] = replacement
      return () => {
        if (llm[key] !== replacement) return
        if (descriptor) Object.defineProperty(llm, key, descriptor)
        else delete llm[key]
      }
    })
    return () => restore.forEach(dispose => dispose())
  }, 'Weave assistant context window')
}
