export const nodeKinds = {
  topic: '研究主题', route: '研究主线', method: '方法', paper: '论文', metric: '评测', file: '资料',
}
const relationKinds = { cites: '引用', builds_on: '方法继承', compares: '对比', related: '主题关联' }
const titleOf = record => record.title || String(record.text || '').split('\n', 1)[0]

function literatureTree(records, root) {
  if (!records.length) return []
  const ids = new Set(records.map(record => record.id))
  const trunk = root && ids.has(root.id) ? root : { id: 'tree:root', title: '研究图谱', treeGroup: true }
  const groups = new Map()
  const labels = { paper: '参考文献', method: '研究方法', metric: '评测指标', file: '资料' }
  const branches = records.filter(record => record.id !== trunk.id).map(record => {
    if (ids.has(record.parentId)) return { ...record, treeParentId: record.parentId }
    const label = labels[record.kind]
    if (!label) return { ...record, treeParentId: trunk.id, treeGrouping: true }
    const id = 'tree:' + record.kind
    if (!groups.has(id)) groups.set(id, { id, title: label, treeParentId: trunk.id, treeGroup: true, treeGrouping: true })
    return { ...record, treeParentId: id, treeGrouping: true }
  })
  return [trunk, ...branches, ...groups.values()]
}

export function createResearchMap(React, { Btn, Canvas, Markdown, safeUrl }) {
  const h = React.createElement
  const options = (values, label) => Object.entries(values).map(([value, name]) =>
    h('option', { key: value, value }, label ? label(name) : name))
  const routeFields = [['研究问题', 'routeQuestion'], ['代表方法', 'routeMethods'], ['待探索问题', 'routeOpenQuestions']]
  const paperFields = [['作者', 'paperAuthors'], ['发表来源', 'paperVenue'], ['发表日期', 'eventDate', 'date']]

  return function ResearchMap({ items, feature, notebooks, rails, busy, request, save, remove, capture, navigate, links, ask }) {
    const [selected, setSelected] = React.useState('')
    const [route, setRoute] = React.useState('')
    const [collapsed, setCollapsed] = React.useState([])
    const [kind, setKind] = React.useState('')
    const [editor, setEditor] = React.useState(null)
    const [notebookId, setNotebookId] = React.useState('')
    const [draftTopic, setDraftTopic] = React.useState(null)
    const inspectorRef = React.useRef(null)
    const editing = Boolean(editor)
    const byId = new Map(items.map(record => [record.id, record]))
    const routes = items.filter(record => record.kind === 'route')
    const parents = new Set(items.map(record => record.parentId).filter(id => byId.has(id)))
    const root = items.find(record => record.kind === 'topic' && !record.parentId)
    const active = byId.get(selected) || root || items[0]
    const activeRoute = byId.get(route)
    const targetNotebook = notebooks.find(item => item.id === notebookId) || notebooks[0]
    const sourceRail = active?.canvasRail
    const savedNote = active && targetNotebook && (rails[targetNotebook.id] || []).find(entry =>
      entry.capturedFrom?.id === active.id && entry.capturedFrom?.featureId === sourceRail)
    const trace = record => {
      const ids = new Set([record.id])
      for (let parent = record.parentId; byId.has(parent) && !ids.has(parent); parent = byId.get(parent).parentId) ids.add(parent)
      return ids
    }
    const related = new Set()
    if (activeRoute) {
      for (const link of activeRoute.mapLinks || []) related.add(link.id)
      for (const record of items) {
        if (record.mapLinks?.some(link => link.id === activeRoute.id)) related.add(record.id)
      }
    }
    const lanes = items.filter(record => {
      const ancestry = trace(record)
      return (!activeRoute || record === root || ancestry.has(activeRoute.id) || trace(activeRoute).has(record.id) || related.has(record.id)) &&
        !collapsed.some(id => id !== record.id && ancestry.has(id)) &&
        (!kind || record.kind === kind || record.kind === 'topic' || record.kind === 'route')
    })
    const inRoute = items.filter(record => !activeRoute || trace(record).has(activeRoute.id) || related.has(record.id))
    const papers = inRoute.filter(record => record.kind === 'paper')
    const steps = [['topic', '研究问题'], ['route', '研究路线'], ['paper', '参考文献'], ['metric', '评测指标']]
      .map(([type, label]) => ({ type, label, record: type === 'topic' ? root : items.find(item => item.kind === type) }))
      .filter(step => step.record)
    const dated = papers.filter(record => record.eventDate).sort((a, b) => a.eventDate.localeCompare(b.eventDate))
    const undated = papers.filter(record => !record.eventDate)
    const select = record => { setSelected(record.id); setEditor(null) }
    React.useLayoutEffect(() => {
      if (inspectorRef.current) inspectorRef.current.scrollTop = 0
    }, [selected, editing])
    React.useEffect(() => {
      if (request) {
        setSelected(request.id); setRoute(''); setCollapsed([]); setKind(''); setEditor(null)
      }
    }, [request])

    function focus(record) {
      select(record)
      setRoute(record.id)
      setKind('')
      setCollapsed(ids => ids.filter(id => !trace(record).has(id)))
    }
    function openStep({ type, record }) {
      select(record)
      setRoute('')
      setCollapsed([])
      setKind(type === 'topic' ? '' : type)
    }
    function toggleBranch(record) {
      setCollapsed(ids => ids.includes(record.id) ? ids.filter(id => id !== record.id) : [...ids, record.id])
    }
    function start(parent) {
      setEditor({ title: '', text: '', kind: !parent ? 'topic' : parent.kind === 'topic' ? 'route' : 'paper',
        parentId: parent?.id || '', canvasRail: parent?.canvasRail || feature, mapLinks: [] })
    }
    async function commit(event) {
      event.preventDefault()
      if (!editor?.title.trim() || busy) return
      const payload = { title: editor.title.trim(), text: editor.text.trim() || editor.title.trim(),
        kind: editor.kind, url: editor.url || '', parentId: editor.parentId || null, mapLinks: editor.mapLinks,
        ...(editor.id && { id: editor.id }),
        ...Object.fromEntries([...routeFields, ...paperFields].map(([, key]) =>
          [key, key === 'eventDate' ? editor[key] || null : editor[key] || ''])) }
      const result = await save(payload, editor.canvasRail)
      if (!result) return
      setSelected(result.id)
      setCollapsed(ids => ids.filter(id => !trace(result).has(id)))
      setEditor(null)
    }
    const field = (label, key, props = {}) => h('label', { key }, label,
      h('input', { className: 'lw-input', value: editor[key] || '', onChange: e => setEditor({ ...editor, [key]: e.target.value }), ...props }))
    const recordLink = record => Btn({ variant: 'ghost', size: 'xs', onClick: () => {
      setRoute(''); setKind(''); setCollapsed([]); select(record)
    } }, titleOf(record))
    function sourceLink(value, label, accessibleName) {
      const url = safeUrl(value)
      return url && h('a', { href: url, target: '_blank', rel: 'noopener noreferrer', 'aria-label': accessibleName }, label)
    }
    function inspector() {
      if (editor) return h('form', { className: 'lw-map-form', onSubmit: commit },
        h('h3', null, editor.id ? '编辑节点' : '新建节点'),
        field('节点名称', 'title', { maxLength: 240, required: true }),
        h('label', null, '节点类型', h('select', { className: 'lw-select', value: editor.kind, onChange: e => setEditor({ ...editor, kind: e.target.value }) },
          options(nodeKinds))),
        h('label', null, '上级节点', h('select', { className: 'lw-select', value: editor.parentId || '',
          onChange: e => setEditor({ ...editor, parentId: e.target.value }) }, h('option', { value: '' }, '无上级节点'),
          items.filter(item => !item.canvasDraft && item.canvasRail === editor.canvasRail && item.id !== editor.id && !trace(item).has(editor.id))
            .map(item => h('option', { key: item.id, value: item.id }, titleOf(item))))),
        h('label', null, editor.kind === 'paper' ? '摘要' : '说明', h('textarea', { className: 'lw-textarea', rows: 3,
          value: editor.text, maxLength: 16000, onChange: e => setEditor({ ...editor, text: e.target.value }) })),
        field('原始来源 URL', 'url', { type: 'url' }),
        (editor.kind === 'route' ? routeFields : editor.kind === 'paper' ? paperFields : []).map(([label, key, type]) =>
          field(label, key, { type: type || 'text' })),
        items.some(item => !item.canvasDraft && item.canvasRail === editor.canvasRail && item.id !== editor.id) &&
          h('details', { className: 'lw-map-form-links' }, h('summary', null, '文献或方法关系'),
            editor.mapLinks.map((link, index) => {
              const change = updates => setEditor({ ...editor, mapLinks: editor.mapLinks.map((item, n) => n === index ? { ...item, ...updates } : item) })
              return h('div', { key: index, className: 'lw-map-form' },
                h('label', null, '目标节点', h('select', { className: 'lw-select', value: link.id, required: true,
                  onChange: e => change({ id: e.target.value }) }, h('option', { value: '' }, '选择节点'),
                  items.filter(item => !item.canvasDraft && item.id !== editor.id && item.canvasRail === editor.canvasRail)
                    .map(item => h('option', { key: item.id, value: item.id }, titleOf(item))))),
                h('label', null, '关系', h('select', { className: 'lw-select', value: link.type, onChange: e => change({ type: e.target.value }) },
                  options(relationKinds))),
                h('label', null, '关系来源 URL', h('input', { className: 'lw-input', type: 'url', value: link.source || '',
                  onChange: e => change({ source: e.target.value }), placeholder: '留空即标为待核验' })),
                Btn({ variant: 'ghost', size: 'xs', onClick: () => setEditor({ ...editor,
                  mapLinks: editor.mapLinks.filter((_, n) => n !== index) }) }, '移除关系'))
            }),
            Btn({ variant: 'ghost', size: 'xs', disabled: editor.mapLinks.length >= 24, onClick: () =>
              setEditor({ ...editor, mapLinks: [...editor.mapLinks, { id: '', type: 'related' }] }) }, '添加关系')),
        h('div', { className: 'lw-actions' },
          Btn({ variant: 'primary', type: 'submit', size: 'xs', disabled: busy || !editor.title.trim() }, '保存节点'),
          Btn({ variant: 'ghost', size: 'xs', onClick: () => setEditor(null) }, '取消')))
      if (!active) return null
      const connections = [...(active.mapLinks || []).map(link => ({ ...link, direction: '至', record: byId.get(link.id) })),
        ...items.flatMap(record => (record.mapLinks || []).filter(link => link.id === active.id)
          .map(link => ({ ...link, direction: '来自', record })))]
      return h(React.Fragment, null,
        h('span', { className: 'lw-map-kind', 'data-kind': active.kind }, nodeKinds[active.kind] || '记录'),
        h('h3', null, titleOf(active)),
        active.canvasDraft && h('p', { className: 'lw-hint' }, 'Bot 草稿 · 待核验'),
        active.text !== titleOf(active) && h(Markdown, { source: active.text }),
        (active.kind === 'paper' ? [active.paperAuthors, active.paperVenue, active.eventDate].filter(Boolean).length > 0 &&
          h('p', { className: 'lw-hint' }, [active.paperAuthors, active.paperVenue, active.eventDate].filter(Boolean).join(' · ')) : null),
        sourceLink(active.url, '原文', '查看原始来源'),
        connections.length > 0 && h('section', { 'aria-label': '研究关系', className: 'lw-map-relations' },
          h('h4', null, '研究关系'),
          connections.map((link, index) => h('div', { key: index },
            h('small', { className: 'lw-hint' }, [relationKinds[link.type], link.direction].join(' ')),
            link.record && recordLink(link.record),
            link.source ? sourceLink(link.source, '关系来源') : h('span', { className: 'lw-map-evidence' }, '推断 · 待核验')))),
        !active.canvasDraft && h('div', { className: 'lw-actions' },
          Btn({ size: 'xs', variant: 'ghost', onClick: () => setEditor({ ...active, kind: active.kind || 'topic', mapLinks: active.mapLinks || [] }) }, '编辑节点'),
          Btn({ size: 'xs', variant: 'ghost', onClick: () => start(active) }, '添加分支'),
          Btn({ size: 'xs', variant: 'ghost', onClick: () => remove(active) }, '删除节点')),
        !active.canvasDraft && ['paper', 'route'].includes(active.kind) && h('div', { className: 'lw-map-form' },
          targetNotebook ? h(React.Fragment, null, notebooks.length > 1 && h('select', { className: 'lw-select', 'aria-label': '收藏到笔记 Bot',
            value: targetNotebook.id, onChange: e => setNotebookId(e.target.value) },
            notebooks.map(item => h('option', { key: item.id, value: item.id }, item.label))),
          Btn({ variant: 'primary', size: 'xs', disabled: busy, onClick: async () => {
            const target = savedNote ? { featureId: targetNotebook.id, id: savedNote.id } : await capture(active, targetNotebook.id)
            if (target?.id) navigate(target)
          } }, savedNote ? '打开笔记' : active.kind === 'paper' ? '收藏到笔记' : '保存主线到笔记')) :
            h('p', { className: 'lw-hint' }, '创建一个笔记 Bot 后即可收藏。')),
        !active.canvasDraft && h('details', { className: 'lw-map-record-links' },
          h('summary', null, '关联记录'), links(active)))
    }
    return h('section', { className: 'lw-research-map', 'aria-label': '研究知识地图' },
      steps.length > 0 && h('nav', { className: 'lw-map-path', 'aria-label': '主要科研路径' },
        h('strong', null, '主要科研路径'),
        h('ol', null, steps.map(step => h('li', { key: step.type },
          Btn({ variant: 'ghost', size: 'xs', 'aria-pressed': !route && (kind || 'topic') === step.type,
            onClick: () => openStep(step) }, step.label))))),
      draftTopic !== null && h('form', { className: 'lw-map-request', onSubmit: async event => {
        event.preventDefault()
        if (draftTopic.trim() && await ask(draftTopic.trim())) setDraftTopic(null)
      } },
        h('input', { className: 'lw-input', value: draftTopic, 'aria-label': '研究主题', maxLength: 1000,
          placeholder: '例如：3D 编程基准的研究主线', onChange: e => setDraftTopic(e.target.value) }),
        Btn({ variant: 'primary', type: 'submit', size: 'xs', disabled: busy || !draftTopic.trim() }, '整理研究地图')),
      h('div', { className: 'lw-map-shell' },
        h('nav', { className: 'lw-map-routes', 'aria-label': '研究主线' },
          Btn({ variant: 'ghost', size: 'xs', 'aria-current': activeRoute ? undefined : 'page', 'aria-label': '完整地图',
            onClick: () => { setRoute(''); setKind(''); setCollapsed([]) } }, '全部主线'),
          routes.map(record => h('div', { className: 'lw-map-route-row', key: record.id },
            parents.has(record.id) && Btn({ variant: 'ghost', size: 'xs', 'aria-expanded': !collapsed.includes(record.id),
              'aria-label': (collapsed.includes(record.id) ? '展开 ' : '收起 ') + titleOf(record),
              onClick: () => toggleBranch(record) }, collapsed.includes(record.id) ? '+' : '−'),
            Btn({ variant: 'ghost', size: 'xs', 'aria-current': route === record.id ? 'page' : undefined,
              onClick: () => focus(record) }, titleOf(record)))),
          h('select', { className: 'lw-select', value: kind, 'aria-label': '筛选节点类型', onChange: e => setKind(e.target.value) },
            h('option', { value: '' }, '全部类型'), options(nodeKinds))),
        h('div', { className: 'lw-map-canvas' },
          h(Canvas, { layout: 'graph', tree: true, items: literatureTree(lanes, root), activeId: active?.id, openEntry: select, busy, nodeKinds,
            label: '文献与方法关系图', emptyTitle: items.length ? '没有匹配节点' : '暂无节点',
            toolbarActions: h('div', { className: 'lw-actions' },
              Btn({ variant: 'ghost', size: 'xs', 'aria-expanded': draftTopic !== null,
                onClick: () => setDraftTopic(draftTopic === null ? '' : null) }, 'AI 梳理'),
              Btn({ size: 'xs', onClick: () => start(null) }, '添加节点')) })),
        (active || editor) && h('aside', { ref: inspectorRef, className: 'lw-map-inspector', 'aria-label': '节点详情' }, inspector())),
      (routes.length > 0 || papers.length > 0) && h('div', { className: 'lw-map-overviews' },
        routes.length > 0 && h('details', null, h('summary', null, '路线概览'),
          h('div', { className: 'lw-map-overview-grid' }, (activeRoute ? [activeRoute] : routes).map(record =>
            h('article', { key: record.id },
              Btn({ variant: 'ghost', size: 'xs', onClick: () => focus(record) }, titleOf(record)),
              h('dl', null, routeFields.filter(([, key]) => record[key]).map(([label, key]) =>
                h('div', { key }, h('dt', null, label), h('dd', null, record[key])))))))),
        papers.length > 0 && h('details', null, h('summary', null, '文献时间线'),
          h('ol', { className: 'lw-map-timeline' }, [...dated, ...undated].map(record => h('li', { key: record.id },
            h('span', { className: 'lw-hint' }, record.eventDate || '发表日期待确认'), recordLink(record)))))))
  }
}
