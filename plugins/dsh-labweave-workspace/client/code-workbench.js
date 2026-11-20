const shortName = path => path.split('/').at(-1)
const moduleLabel = group => group === '.' ? '根目录' : group
const pythonToken = /(#.*$)|("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*')|\b(def|class|from|import|as|return|if|elif|else|for|while|in|try|except|with|raise|async|await|None|True|False|pass|yield)\b|(\b\d+(?:\.\d+)?\b)/g

export function createCodeWorkbench(React, project, { Btn, Icon, Canvas, Experiments }) {
  const h = React.createElement
  function codeTokens(text) {
    const tokens = []
    let start = 0
    for (const match of text.matchAll(pythonToken)) {
      if (match.index > start) tokens.push(text.slice(start, match.index))
      tokens.push(h('span', { key: match.index, className: match[1] ? 'lw-syntax-comment'
        : match[2] ? 'lw-syntax-string' : match[3] ? 'lw-syntax-keyword' : 'lw-syntax-number' }, match[0]))
      start = match.index + match[0].length
    }
    return [...tokens, text.slice(start) || (tokens.length ? '' : ' ')]
  }
  return function CodeWorkbench({ workspaceId, feature, experimentProps, request, settings, ask, busy }) {
    const [sources, setSources] = React.useState([])
    const [sourceId, setSourceId] = React.useState('project')
    const [scan, setScan] = React.useState(null)
    const [refresh, rescan] = React.useReducer(value => value + 1, 0)
    const [error, setError] = React.useState('')
    const [fileError, setFileError] = React.useState('')
    const [group, setGroup] = React.useState(null)
    const [path, setPath] = React.useState('')
    const [file, setFile] = React.useState(null)
    const [selection, highlight] = React.useState(null)
    const [tab, setTab] = React.useState('code')
    const codeRef = React.useRef(null)
    const source = sources.find(item => item.id === sourceId)
    const records = scan?.sourceId === sourceId ? scan.files : []
    const byPath = new Map(records.map(record => [record.path, record]))
    const modules = new Map()
    for (const record of records) {
      if (!modules.has(record.group)) modules.set(record.group, [])
      modules.get(record.group).push(record)
    }
    const selected = byPath.get(path)
    const content = file?.path === path && file.sourceId === sourceId ? file : null
    const peers = group === null ? [] : modules.get(group) || []

    React.useEffect(() => {
      const controller = new AbortController()
      Promise.all([
        project(workspaceId, 'workbench/sources', { featureId: feature }, controller.signal),
        project(workspaceId, 'workbench/graph', { featureId: feature, sourceId }, controller.signal),
      ]).then(([options, index]) => {
        if (controller.signal.aborted) return
        setSources(options); setScan({ ...index, sourceId }); setError('')
      }).catch(error => { if (!controller.signal.aborted) setError(error.message) })
      return () => controller.abort()
    }, [workspaceId, feature, sourceId, refresh])
    React.useEffect(() => {
      if (!path) return
      const controller = new AbortController()
      project(workspaceId, 'workbench/file', { featureId: feature, sourceId, path }, controller.signal)
        .then(value => { if (!controller.signal.aborted) { setFile({ ...value, sourceId }); setFileError('') } })
        .catch(error => { if (!controller.signal.aborted) setFileError(error.message) })
      return () => controller.abort()
    }, [workspaceId, feature, sourceId, path, refresh])
    React.useEffect(() => {
      if (request?.runId) setTab('runs')
    }, [request])
    React.useLayoutEffect(() => {
      if (!content || !selection || !codeRef.current) return
      const row = codeRef.current.querySelector('[data-line="' + selection.start + '"]')
      if (row) codeRef.current.scrollTop = Math.max(0, row.offsetTop - 15)
    }, [content, selection])

    const neighborPaths = record => [...new Set(record.imports.map(item => item.target).filter(Boolean))]
    const toModule = id => { setGroup(id); setPath(''); highlight(null); setFileError('') }
    function toFile(value) {
      const next = byPath.get(value)
      if (!next) return
      if (value === path) { highlight(null); return }
      toModule(next.group)
      setPath(next.path)
      setFile(null)
    }
    function toSource(id) {
      setSourceId(id); setScan(null); setError(''); toModule(null)
    }
    const groupGraph = [...modules].map(([name, entries]) => ({
      id: name, title: moduleLabel(name), text: entries.length + ' 个 Python 文件',
      dependsOn: [...new Set(entries.flatMap(neighborPaths).map(target => byPath.get(target)?.group)
        .filter(target => target && target !== name))],
    }))
    const fileGraph = [...new Set([...peers.map(item => item.path), ...peers.flatMap(neighborPaths)])]
      .map(value => byPath.get(value)).filter(Boolean).map(record => ({
        id: record.path, title: shortName(record.path),
        text: record.group === group ? record.symbols.length + ' 个函数或类' : '来自 ' + moduleLabel(record.group),
        dependsOn: neighborPaths(record),
      }))
    const selector = group === null ? groupGraph : filesForMenu()
    function filesForMenu() {
      return peers.map(record => ({ id: record.path, title: shortName(record.path) }))
    }
    const jump = (start, end, key) => highlight({ start, end, key })
    function viewSource() {
      if (fileError) return h('p', { role: 'alert', className: 'lw-error' }, fileError)
      if (!content) return h('p', { className: 'lw-hint' }, '正在读取 Python 文件…')
      const lines = content.text.split('\n')
      return h('section', { className: 'lw-code-preview', 'aria-label': 'Python 源码' },
        h('div', { className: 'lw-code-preview-head' }, h('span', null, path),
          Btn({ size: 'xs', onClick: () => ask({ sourceId, source: source?.name, path }), disabled: busy }, '请 Bot 运行此文件')),
        content.error && h('p', { className: 'lw-hint' }, content.error),
        h('pre', { ref: codeRef, tabIndex: 0, className: 'lw-code-lines' }, lines.slice(0, 5000).map((text, i) => {
          const line = i + 1
          return h('span', { key: i, className: 'lw-code-line', 'data-line': line, 'data-active': line >= selection?.start && line <= selection?.end },
            h('button', { type: 'button', tabIndex: -1, title: '第 ' + line + ' 行', onClick: () => jump(line, line) }, line),
            h('code', null, codeTokens(text)))
        })),
        lines.length > 5000 && h('p', { className: 'lw-hint' }, '预览显示前 5000 行。'))
    }
    function outline() {
      return h('aside', { className: 'lw-code-outline', 'aria-label': '代码结构' },
        !selected?.symbols.length && !selected?.imports.length && h('p', { className: 'lw-hint' }, '暂无结构可显示'),
        selected?.symbols.length > 0 && h('section', null, h('h4', null, '函数与类'),
          selected.symbols.map(symbol => {
            const key = 'symbol-' + symbol.line
            return Btn({ key, size: 'xs', variant: 'ghost', 'aria-pressed': selection?.key === key,
              onClick: () => jump(symbol.line, symbol.end, key) },
            h(Icon, { name: symbol.kind === 'class' ? 'repo' : 'code' }), symbol.name,
            h('small', { className: 'lw-hint' }, 'L' + symbol.line))
          })),
        selected?.imports.length > 0 && h('section', null, h('h4', null, '导入关系'),
          selected.imports.map((entry, index) => {
            const key = 'import-' + index
            const target = entry.module + (entry.member ? ' · ' + entry.member : '')
            return h('div', { key, className: 'lw-code-import' },
              Btn({ size: 'xs', variant: 'ghost', 'aria-pressed': selection?.key === key,
                onClick: () => jump(entry.line, entry.line, key) }, target),
              entry.target && Btn({ size: 'xs', variant: 'ghost', 'aria-label': '打开依赖 ' + shortName(entry.target),
                onClick: () => toFile(entry.target) }, '打开'),
              !entry.target && h('small', { className: 'lw-hint', title: '当前代码索引内无匹配项' }, '未解析'))
          })))
    }
    return h('section', { className: 'lw-code-workbench', 'aria-label': '代码工作区' },
      h('header', { className: 'lw-code-header' },
        h('div', { className: 'lw-code-tabs', 'aria-label': '工程视图', role: 'group' },
          [['code', '代码关系'], ['runs', '运行记录']].map(([value, label]) => Btn({
            key: value, size: 'xs', variant: 'ghost', 'aria-pressed': tab === value, onClick: () => setTab(value),
          }, label))),
        tab === 'code' && h('div', { className: 'lw-actions' },
          h('select', { className: 'lw-select', 'aria-label': '代码来源', value: sourceId, onChange: event => toSource(event.target.value) },
            (sources.length ? sources : [{ id: 'project', name: '项目内代码', available: true }]).map(item =>
              h('option', { key: item.id, value: item.id, disabled: !item.available }, item.name))),
          Btn({ size: 'xs', variant: 'ghost', 'aria-label': '刷新索引', title: '刷新索引', onClick: rescan }, h(Icon, { name: 'refresh' })),
          settings && Btn({ size: 'xs', variant: 'ghost', 'aria-label': '管理来源', onClick: () => settings(rescan) }, '管理来源'))),
      tab === 'runs' ? h(Experiments, { ...experimentProps, layout: 'sequence', runRequest: request }) :
        h(React.Fragment, null,
          group !== null &&
            h('nav', { 'aria-label': '代码位置', className: 'lw-code-breadcrumb' },
              Btn({ size: 'xs', variant: 'ghost', onClick: () => toModule(null) }, '项目'),
              h('span', { 'aria-hidden': true }, '/'),
              Btn({ size: 'xs', variant: 'ghost', onClick: () => toModule(group), 'aria-current': !path ? 'page' : undefined }, moduleLabel(group)),
              path && h(React.Fragment, null, h('span', { 'aria-hidden': true }, '/'), h('span', { 'aria-current': 'page' }, shortName(path)))),
          error && h('p', { role: 'alert', className: 'lw-error' }, error),
          !scan && !error && h('p', { className: 'lw-hint' }, '正在建立 Python 索引…'),
          scan?.truncated && h('p', { className: 'lw-hint' }, '索引已截断，最多显示 150 个文件'),
          scan && !records.length && !error && h('p', { className: 'lw-code-empty lw-hint' }, '此来源暂无 Python 文件'),
          records.length > 0 && h('div', { className: 'lw-code-body', 'data-file': Boolean(path) },
            h('nav', { className: 'lw-code-tree', 'aria-label': '代码目录' },
              h('h3', null, group === null ? '项目模块' : '模块文件'),
              selector.map(entry => Btn({ key: entry.id, size: 'xs', variant: 'ghost', 'aria-current': path === entry.id ? 'page' : undefined,
                onClick: () => group === null ? toModule(entry.id) : toFile(entry.id) }, entry.title))),
            path ? viewSource() : h('div', { className: 'lw-code-graph' },
              h('p', { className: 'lw-code-graph-label lw-hint' },
                (group === null ? records.length : peers.length) + ' 个文件 · 静态导入'),
              h(Canvas, { layout: 'graph', nodeKinds: {}, items: group === null ? groupGraph : fileGraph,
                openEntry: entry => group === null ? toModule(entry.id) : toFile(entry.id), label: group === null ? '项目模块关系' : '模块文件关系',
                emptyTitle: '暂无文件' })),
            path && outline())))
  }
}
