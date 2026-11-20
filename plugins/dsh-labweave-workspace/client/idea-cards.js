const types = { direction: '新方向', extension: '思路延伸', method: '研究方案' }
const states = { active: '待探索', saved: '已收藏', deferred: '暂缓' }
const titleOf = entry => entry.title || entry.text.split('\n')[0]
const sections = [
  ['ideaEvidence', '已有依据'], ['hypothesis', '待验证假设'],
  ['validation', '最小验证'], ['ideaTradeoffs', '可行性与限制'],
]

export function createIdeaCards(React, { Btn, Icon, Markdown, safeUrl }) {
  const h = React.createElement
  return function IdeaCards({ items, topic, request, feature, goals, busy, save, changeState, draftGoal, remove, navigate, links, ask }) {
    const [filter, setFilter] = React.useState('active')
    const [type, setType] = React.useState('')
    const [selected, select] = React.useState('')
    const [editor, edit] = React.useState(null)
    const [prompt, setPrompt] = React.useState(null)
    const [targetGoal, setTargetGoal] = React.useState('')
    const [feedback, setFeedback] = React.useState(null)
    const appliedRequest = React.useRef(null)
    const kinds = new Set(items.map(item => item.kind || 'direction'))
    const effectiveType = kinds.size > 1 && kinds.has(type) ? type : ''
    const visible = items.filter(item => (item.ideaState || 'active') === filter &&
      (!effectiveType || (item.kind || 'direction') === effectiveType))
    const current = visible.find(item => item.id === selected) || visible[0]
    const calendar = goals.find(item => item.id === targetGoal) || goals[0]
    React.useEffect(() => {
      if (!request || appliedRequest.current === request) return
      const target = items.find(item => item.id === request.id)
      if (!target) return
      appliedRequest.current = request
      setFilter(target.ideaState || 'active'); setType(''); select(target.id); edit(null); setPrompt(null)
    }, [request, items])
    React.useEffect(() => {
      if (feedback && items.some(item => item.id === feedback.id && item.ideaState === feedback.state)) {
        setFilter(feedback.state); select(feedback.id); setFeedback(null)
      }
    }, [feedback, items])
    const setStatus = async (item, state) => {
      if (!await changeState(item, state)) return
      setFeedback({ id: item.id, state })
    }
    function start(item) {
      edit(item ? { ...item, title: titleOf(item), kind: item.kind || 'direction' }
        : { canvasRail: feature, title: '', text: '', kind: 'direction' })
      setPrompt(null)
    }
    async function submit(event) {
      event.preventDefault()
      if (!editor.title.trim() || busy) return
      const payload = Object.fromEntries(['id', 'title', 'text', 'kind', 'url', ...sections.map(([key]) => key)]
        .filter(key => editor[key] !== undefined).map(key => [key, editor[key].trim()]))
      if (!payload.text) payload.text = payload.title
      const record = await save(payload, editor.canvasRail)
      if (record) { setFilter(record.ideaState || 'active'); setType(''); select(record.id); edit(null) }
    }
    function formField(key, label, options) {
      const { multiline = false, ...attributes } = options || {}
      return h('label', { key }, label, h(multiline ? 'textarea' : 'input', {
        className: multiline ? 'lw-textarea' : 'lw-input', value: editor[key] || '',
        onChange: event => edit({ ...editor, [key]: event.target.value }), ...attributes,
      }))
    }
    function inspector() {
      if (editor) return h('form', { className: 'lw-idea-form', onSubmit: submit },
        h('h3', null, editor.id ? '编辑点子' : '记录新点子'),
        formField('title', '研究问题', { maxLength: 240, required: true }),
        h('label', null, '类型', h('select', { className: 'lw-select', value: editor.kind, onChange: e => edit({ ...editor, kind: e.target.value }) },
          Object.entries(types).map(([value, label]) => h('option', { key: value, value }, label)))),
        formField('hypothesis', '待验证假设', { multiline: true, rows: 2, maxLength: 1000 }),
        formField('validation', '最小验证', { multiline: true, rows: 2, maxLength: 1000 }),
        h('details', { className: 'lw-idea-disclosure' }, h('summary', null, '补充信息'),
          h('div', { className: 'lw-idea-form' },
            formField('text', '简述', { multiline: true, rows: 3, maxLength: 16000 }),
            formField('ideaEvidence', '已有依据', { multiline: true, rows: 2, maxLength: 1400 }),
            formField('ideaTradeoffs', '可行性与限制', { multiline: true, rows: 2, maxLength: 1000 }),
            formField('url', '文献 URL', { type: 'url', maxLength: 2000 }))),
        h('div', { className: 'lw-actions' },
          Btn({ variant: 'primary', size: 'xs', type: 'submit', disabled: busy || !editor.title.trim() }, '保存点子'),
          Btn({ variant: 'ghost', size: 'xs', onClick: () => edit(null) }, '取消')))
      if (!current) return null
      const url = safeUrl(current.url)
      const content = (key, label) => current[key] && h('section', { key, 'data-idea-field': key },
        h('h4', null, label), h(Markdown, { source: current[key] }))
      const intro = current.text && ![titleOf(current), ...sections.map(([key]) => current[key])].includes(current.text)
      return h(React.Fragment, null,
        h('header', { className: 'lw-idea-detail-head' },
          h('p', { className: 'lw-idea-meta' }, [types[current.kind] || types.direction,
            current.ideaOrigin === 'assistant' && 'AI 建议'].filter(Boolean).join(' · ')),
          h('h3', null, titleOf(current)),
          intro && h(Markdown, { source: current.text })),
        h('div', { className: 'lw-actions lw-idea-tools' },
          goals.length > 1 && h('select', { className: 'lw-select', 'aria-label': '目标日历', value: calendar.id, onChange: e => setTargetGoal(e.target.value) },
            goals.map(item => h('option', { key: item.id, value: item.id }, item.label))),
          calendar && Btn({ variant: 'primary', size: 'xs', disabled: busy, 'aria-label': '转为待办草稿', onClick: async () => {
            const reference = await draftGoal(current, calendar.id)
            if (reference?.id) navigate(reference)
          } }, '转为待办'),
          Btn({ size: 'xs', variant: 'ghost', disabled: busy, 'aria-label': '讨论这个点子', onClick: () => ask('', current) }, '讨论'),
          Btn({ size: 'xs', variant: 'ghost', disabled: busy || !!feedback, 'aria-label': filter === 'saved' ? '取消收藏' : '收藏点子',
            onClick: () => setStatus(current, filter === 'saved' ? 'active' : 'saved') }, filter === 'saved' ? '取消收藏' : '收藏'),
          h('details', { className: 'lw-idea-more', key: current.id + ':' + filter },
            h('summary', null, '更多'),
            h('div', { className: 'lw-idea-menu' },
              Btn({ size: 'xs', variant: 'ghost', onClick: () => start(current) }, '编辑点子'),
              Btn({ size: 'xs', variant: 'ghost', disabled: busy || !!feedback, onClick: () =>
                setStatus(current, filter === 'deferred' ? 'active' : 'deferred') }, filter === 'deferred' ? '恢复探索' : '暂不考虑'),
              Btn({ size: 'xs', variant: 'ghost', className: 'lw-idea-delete', onClick: () => remove(current) }, '删除点子')))),
        (current.hypothesis || current.validation) && h('div', { className: 'lw-idea-main' },
          content('hypothesis', '待验证假设'),
          content('validation', '最小验证')),
        h('details', { className: 'lw-idea-disclosure', key: current.id }, h('summary', null, '依据与关联'),
          h('div', { className: 'lw-idea-support' },
            h('section', null, h('h4', null, '已有依据'),
              current.ideaEvidence && h(Markdown, { source: current.ideaEvidence }),
              url && h('a', { href: url, target: '_blank', rel: 'noopener noreferrer' }, '原文'),
              !current.ideaEvidence && !url && h('p', { className: 'lw-hint' }, '暂无依据')),
            content('ideaTradeoffs', '可行性与限制'),
            links(current))))
    }
    return h('section', { className: 'lw-idea-workspace', 'aria-label': '研究点子卡片' },
      h('header', { className: 'lw-idea-filters' },
        h('nav', { 'aria-label': '点子状态' }, Object.entries(states).map(([state, label]) =>
          Btn({ key: state, size: 'xs', variant: 'ghost', 'aria-pressed': filter === state,
            'aria-label': state === 'deferred' ? '暂不考虑' : undefined, onClick: () => { setFilter(state); edit(null) } }, label))),
        h('div', { className: 'lw-actions' },
          kinds.size > 1 && h('select', { className: 'lw-select', value: effectiveType, 'aria-label': '筛选点子类型', onChange: e => setType(e.target.value) },
            h('option', { value: '' }, '全部类型'), Object.entries(types).filter(([value]) => kinds.has(value))
              .map(([value, label]) => h('option', { key: value, value }, label))),
          Btn({ variant: 'ghost', size: 'xs', 'aria-expanded': prompt !== null,
            onClick: () => setPrompt(prompt === null ? '' : null) }, 'AI 建议'),
          Btn({ size: 'xs', onClick: () => start(), 'aria-label': '新建点子' }, h(Icon, { name: 'plus' }), '新建'))),
      prompt !== null && h('form', { className: 'lw-map-request', onSubmit: async event => {
        event.preventDefault()
        if (await ask(prompt.trim())) setPrompt(null)
      } },
        h('input', { className: 'lw-input', value: prompt, 'aria-label': '本次关注', maxLength: 1000,
          placeholder: topic || '本次关注的问题（可留空）', onChange: e => setPrompt(e.target.value) }),
        Btn({ variant: 'primary', type: 'submit', size: 'xs', disabled: busy }, '生成研究建议')),
      h('div', { className: 'lw-idea-shell' },
        visible.length ? h('nav', { className: 'lw-idea-list', 'aria-label': '点子列表' }, visible.map(item =>
          h('button', { key: item.id, type: 'button', className: 'lw-idea-item', 'aria-pressed': item.id === current?.id,
            onClick: () => { select(item.id); edit(null) } },
            h('span', null, titleOf(item)), h(Icon, { name: 'right' }))))
          : h('p', { className: 'lw-idea-empty lw-hint' }, filter === 'active' && !effectiveType ? '暂无点子' : '没有匹配点子'),
        (current || editor) && h('aside', { className: 'lw-idea-inspector', 'aria-label': '点子详情' }, inspector())))
  }
}
