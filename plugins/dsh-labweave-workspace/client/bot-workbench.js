export function createWorkbenchViews(React, project, { Btn, Icon, Tag, Select, fmtDateTime, Canvas }) {
  const h = React.createElement
  const states = {
    WAITING_APPROVAL: '待批准', QUEUED: '排队中', RUNNING: '运行中', SUCCEEDED: '已完成',
    FAILED: '失败', CANCELLED: '已取消', INTERRUPTED: '已中断', BLOCKED: '环境未就绪',
    DRAFT: '草稿', APPROVED: '待运行', PAUSED: '已暂停', REVIEW: '待核查', PENDING: '待执行', PLANNED: '未开始',
    planned: '待运行', running: '运行中', completed: '已完成', failed: '失败',
  }
  const waiting = new Set(['WAITING_APPROVAL', 'DRAFT', 'REVIEW'])
  const nameOf = path => path.split('/').at(-1)
  const hint = text => h('p', { className: 'lw-hint' }, text)
  const alert = text => h('p', { role: 'alert', className: 'lw-error' }, text)
  const status = item => h(Tag, { tone: waiting.has(item.status) ? 'warning'
    : item.status === 'SUCCEEDED' ? 'success' : item.status === 'FAILED' ? 'danger' : 'neutral' },
  states[item.status] || item.status)

  const chartTypes = { line: '折线图', bar: '柱状图', scatter: '散点图' }
  const formatNumber = new Intl.NumberFormat(undefined, { maximumSignificantDigits: 5 })
  function formatAxis(value) {
    if (typeof value !== 'number') return value
    const magnitude = Math.abs(value)
    return magnitude >= 1e6 || magnitude && magnitude < 0.001 ? value.toExponential(2) : formatNumber.format(value)
  }
  function axisScale(values, from, to, includeZero = false) {
    const min = Math.min(...values, ...(includeZero ? [0] : []))
    const max = Math.max(...values, ...(includeZero ? [0] : []))
    const magnitude = Math.max(Math.abs(min), Math.abs(max), Number.MIN_VALUE)
    const span = max / magnitude - min / magnitude
    return {
      ticks: min === max ? [min] : [min, min / 2 + max / 2, max],
      position: value => span ? from + (value / magnitude - min / magnitude) / span * (to - from) : (from + to) / 2,
    }
  }
  function Chart({ chart, type, preview }) {
    const numericX = typeof chart.points[0].x === 'number'
    const points = numericX ? [...chart.points].sort((a, b) => a.x - b.x) : chart.points
    const [cursor, setCursor] = React.useState(0)
    const index = Math.min(cursor, points.length - 1)
    const active = points[index]
    const xs = points.map((point, i) => numericX ? point.x : i)
    const x = axisScale(xs, 12, 488)
    const y = axisScale(points.map(point => point.y), 144, 12, type === 'bar')
    const plot = points.map((point, i) => [x.position(xs[i]), y.position(point.y)])
    const barWidth = Math.max(1, Math.min(24, 432 / points.length))
    const marks = type === 'bar' ? plot.map(([px, py], i) => h('rect', { key: i, x: px - barWidth / 2, width: barWidth,
      y: Math.min(y.position(0), py), height: Math.abs(y.position(0) - py), className: 'lw-chart-mark' }))
      : type === 'scatter' || plot.length === 1 ? plot.map(([px, py], i) => h('circle', { key: i, cx: px, cy: py, r: 4, className: 'lw-chart-mark' }))
        : h('polyline', { points: plot.map(point => point.join(',')).join(' '), className: 'lw-chart-line' })
    if (preview) return h('svg', { className: 'lw-canvas-chart-thumb', viewBox: '0 0 500 156', 'aria-hidden': true }, marks)
    const inspect = event => {
      const bounds = event.currentTarget.getBoundingClientRect()
      const position = (event.clientX - bounds.left) * 500 / bounds.width
      const nearest = plot.reduce((best, [px], candidate) =>
        Math.abs(px - position) < Math.abs(plot[best][0] - position) ? candidate : best, 0)
      setCursor(nearest)
    }
    return h(React.Fragment, null,
      h('div', { className: 'lw-bot-chart-axis' }, h('span', null, chart.yLabel)),
      h('div', { className: 'lw-bot-chart-plot' },
        h('div', { className: 'lw-bot-chart-ticks', 'aria-hidden': true },
          [...y.ticks].reverse().map((tick, i) => h('span', { key: i }, formatAxis(tick)))),
        h('svg', { viewBox: '0 0 500 156', role: 'img', 'aria-label': chart.title + ' · ' + chartTypes[type] + ' · ' + chart.xLabel + ' / ' + chart.yLabel,
          onPointerMove: event => { if (event.pointerType === 'mouse') inspect(event) }, onPointerDown: inspect },
          y.ticks.map((tick, i) => h('line', { key: i, x1: 0, x2: 500, y1: y.position(tick), y2: y.position(tick), className: 'lw-chart-grid' })),
          marks,
          h('line', { x1: plot[index][0], x2: plot[index][0], y1: 12, y2: 144, className: 'lw-chart-grid' }),
          h('circle', { cx: plot[index][0], cy: plot[index][1], r: 5, className: 'lw-chart-active' }))),
      h('div', { className: 'lw-bot-chart-axis' },
        h('span', null, formatAxis(points[0].x)), h('span', null, chart.xLabel),
        points.length > 1 && h('span', null, formatAxis(points.at(-1).x))),
      h('label', { className: 'lw-bot-chart-inspect' },
        h('output', null, chart.xLabel + ' ' + active.x + ' · ' + chart.yLabel + ' ' + active.y),
        points.length > 1 && h('input', { type: 'range', min: 0, max: points.length - 1, value: index,
          'aria-label': '查看数据点', 'aria-valuetext': String(active.x) + ' / ' + active.y,
          onChange: event => setCursor(Number(event.target.value)) })))
  }

  function Charts({ charts, table = false, truncated = false, switchType = table, preview = false }) {
    const [column, setColumn] = React.useState(0)
    const [mode, setMode] = React.useState('')
    if (!charts?.length) return null
    const selected = Math.min(column, charts.length - 1)
    const chart = charts[selected]
    const type = mode || chart.type
    if (preview) return h(Chart, { chart, type, preview })
    return h('figure', { className: 'lw-bot-chart' },
      h('figcaption', null,
        charts.length === 1 ? h('strong', null, chart.title) : h('label', null, '指标',
          h(Select, { inline: true, value: selected, ariaLabel: '指标', onChange: value => { setColumn(value); setMode('') },
            options: charts.map((item, index) => ({ value: index, label: item.title })) })),
        table ? h(Select, { inline: true, value: type, ariaLabel: '图表类型', onChange: setMode,
          options: Object.entries(chartTypes).map(([value, label]) => ({ value, label })) })
          : switchType && h('div', { className: 'lw-actions', role: 'group', 'aria-label': '图表类型' },
            Object.entries(chartTypes).map(([value, label]) => h('button', { key: value, type: 'button',
              className: 'lw-btn lw-btn-secondary lw-btn-xs', 'aria-pressed': value === type,
              onClick: () => setMode(value) }, label)))),
      h(Chart, { key: selected, chart, type }),
      table && truncated && hint('图表基于文件预览中的数据。'))
  }

  function metricCharts(metrics = {}) {
    const axis = Object.keys(metrics).find(key => /^(step|epoch|iteration|time|timestamp)$/i.test(key)
      && Array.isArray(metrics[key]) && metrics[key].length && metrics[key].every(Number.isFinite))
    return Object.entries(metrics)
      .filter(([name, values]) => name !== axis && Array.isArray(values) && values.length && values.every(Number.isFinite))
      .map(([name, values]) => {
        const x = axis && metrics[axis].length === values.length ? metrics[axis] : null
        const start = Math.max(0, values.length - 1000)
        return { title: name, type: 'line', xLabel: x ? axis : '测量序号', yLabel: name,
          points: values.slice(start).map((y, index) => ({ x: x ? x[start + index] : start + index + 1, y })) }
      })
  }

  function Preview({ workspaceId, featureId, run, name, running }) {
    const [value, setValue] = React.useState(null)
    const [error, setError] = React.useState('')
    React.useEffect(() => {
      const controller = new AbortController()
      let timer
      async function refresh() {
        try {
          if (document.hidden && running) return
          const value = await project(workspaceId, 'bot/artifact', { featureId, id: run.id, kind: run.kind, name }, controller.signal)
          if (!controller.signal.aborted) { setValue(value); setError('') }
        } catch (error) {
          if (!controller.signal.aborted) setError(error.message)
        } finally {
          if (running && !controller.signal.aborted) timer = setTimeout(refresh, 3000)
        }
      }
      void refresh()
      return () => { controller.abort(); clearTimeout(timer) }
    }, [workspaceId, featureId, run.id, run.kind, name, running])
    if (error) return alert(error)
    if (!value) return hint('正在打开产物…')
    if (value.image) return h('img', { className: 'lw-bot-artifact-img', src: value.image, alt: nameOf(name) })
    const raw = h('pre', { className: 'lw-bot-output' }, value.text || value.note, value.truncated ? '\n…' : '')
    if (!value.visualizations?.length) return raw
    return h(React.Fragment, null, h(Charts, { charts: value.visualizations, table: true }),
      h('details', { className: 'lw-bot-disclosure' }, h('summary', null, '原始数据'), raw))
  }

  function Experiments({ workspaceId, featureId, updatedEvent, layout, fields, records = [], openRecord, addNode, deleteNode, editLinks, busy, activeTasks,
    onMinimize, onFillChat, chatFilled, canvasReady, canvasHidden }) {
    const [items, setItems] = React.useState(null)
    const [selected, select] = React.useState(null)
    const [detail, setDetail] = React.useState(null)
    const [artifact, setArtifact] = React.useState('')
    const [error, setError] = React.useState('')
    React.useEffect(() => {
      const controller = new AbortController()
      let loading = false
      async function read() {
        if (loading || document.hidden) return
        loading = true
        try {
          const query = { featureId: selected?.featureId || featureId }
          const result = selected
            ? await project(workspaceId, 'bot/experiment', { ...query, id: selected.id, kind: selected.kind }, controller.signal)
            : await project(workspaceId, 'bot/experiments', query, controller.signal)
          if (!controller.signal.aborted) {
            if (selected) setDetail(result)
            else setItems(result)
            setError('')
          }
        } catch (error) {
          if (!controller.signal.aborted) setError(error.message)
        } finally { loading = false }
      }
      void read()
      const timer = setInterval(read, 3000)
      window.addEventListener(updatedEvent, read)
      return () => { controller.abort(); clearInterval(timer); window.removeEventListener(updatedEvent, read) }
    }, [workspaceId, featureId, selected, updatedEvent])
    function show(item) {
      select(item)
      setDetail(null)
      setArtifact('')
      setError('')
    }
    if (!selected) {
      const entries = [...(items || []), ...records].sort((a, b) =>
        (Date.parse(b.date || b.created) || 0) - (Date.parse(a.date || a.created) || 0))
      const experimentSources = (items || []).map(item => ({
        id: item.id, title: item.title, canvasGroup: item.botLabel,
      }))
      return h('section', { className: 'lw-bot-workstack lw-paradigm-view', 'aria-label': '实验线程', 'data-bot-canvas': true },
        error && alert(error),
        h(Canvas, { layout, fields, busy, activeTasks, onMinimize, onFillChat, chatFilled,
          canvasReady: canvasReady && Boolean(items || error), canvasHidden,
          emptyTitle: !items && !error ? '正在读取实验…' : '这个 Bot 的实验运行、日志和产物会显示在这里。',
          addNode: item => addNode(item?.experiment.item || item),
          deleteNode: item => deleteNode(item.experiment.item || item),
          editLinks: item => editLinks(item.experiment.item, experimentSources), items: entries.map(item => {
            const charts = item.visualizations?.length ? item.visualizations : metricCharts(item.metrics)
            const latest = new Map(charts.map(chart => [chart.yLabel, chart.points.at(-1).y]))
            for (const [name, value] of Object.entries(item.metrics || {})) {
              if (Number.isFinite(value) && !latest.has(name)) latest.set(name, value)
            }
            const readings = [...latest].slice(0, 3).map(([name, value]) => name + ' ' + formatAxis(value)).join(' · ')
            return {
              ...item.item, id: item.id, title: item.title, created: item.created,
              text: item.kind ? readings || fmtDateTime(item.created) : item.summary,
              eventDate: item.kind ? item.created : item.item?.eventDate,
              visualizations: item.kind ? charts : item.item?.visualizations,
              canvasGroup: item.botLabel || item.item?.canvasGroup || item.group || (item.kind ? '实验运行' : '记录'),
              canvasRail: item.featureId || item.item?.canvasRail,
              canvasStatus: states[item.status] || item.status, experiment: item, externalRun: Boolean(item.kind),
            }
          }), openEntry: ({ experiment }) => experiment.kind ? show(experiment) : openRecord(experiment) }))
    }
    const runs = detail?.runs?.length ? detail.runs : detail?.plannedRuns || []
    const charts = detail?.liveCharts?.length ? detail.liveCharts
      : detail?.visualizations?.length ? detail.visualizations : metricCharts(detail?.metrics)
    return h('section', { className: 'lw-bot-workstack lw-paradigm-view', 'aria-label': '实验详情' },
      h('div', { className: 'lw-bot-workline' }, Btn({ variant: 'ghost', size: 'xs', onClick: () => show(null) }, '返回实验'),
        status(detail || selected),
        onFillChat && Btn({ variant: 'ghost', size: 'xs', 'aria-label': chatFilled ? '展开对话流' : '占满对话流并收起对话',
          'aria-pressed': Boolean(chatFilled), 'data-canvas-fill-chat': true, onClick: onFillChat }, chatFilled ? '显示对话' : '占满对话'),
        onMinimize && Btn({ variant: 'ghost', size: 'xs', 'data-canvas-minimize': true, onClick: onMinimize }, '最小化画布')),
      h('h3', null, selected.title),
      error && alert(error),
      detail ? h(React.Fragment, null,
        detail.parameters && Object.keys(detail.parameters).length > 0 && h('details', { open: true },
          h('summary', null, '环境与参数'), h('pre', { className: 'lw-bot-output' }, JSON.stringify(detail.parameters, null, 2))),
        charts.length > 0 && h(Charts, { charts }),
        detail.metrics && Object.keys(detail.metrics).length > 0 && h('details', { open: charts.length === 0 },
          h('summary', null, '运行指标'), h('pre', { className: 'lw-bot-output' }, JSON.stringify(detail.metrics, null, 2))),
        detail.total > 0 && hint(`已完成 ${detail.completed} / ${detail.total} 次运行`),
        layout === 'matrix' && runs.length > 0 && h(Canvas, { layout, label: '并行运行',
          items: runs.map(run => ({ id: run.id, title: '种子 ' + run.seed, text: '样本数 ' + run.budget,
            canvasGroup: run.method, canvasStatus: states[run.status] || run.status })) }),
        layout !== 'matrix' && detail.steps?.length > 0 && h(Canvas, { layout: 'path', label: '实验阶段',
          items: detail.steps.map(step => ({ ...step, canvasStatus: states[step.status] || step.status })) }),
        detail.error && alert(detail.error),
        (detail.stdout || detail.stderr) && h('details', { className: 'lw-bot-disclosure' },
          h('summary', null, '运行日志'),
          h('pre', { className: 'lw-bot-output' }, [detail.stdout, detail.stderr].filter(Boolean).join('\n'))),
        detail.artifacts.length > 0 && h('section', { className: 'lw-bot-workstack', 'aria-label': '实验产物' },
          h('h4', null, '实验产物'),
          h('ul', { className: 'lw-bot-thread-list' }, detail.artifacts.map(name => h('li', { key: name },
            h('button', { className: 'lw-bot-thread', type: 'button', 'aria-pressed': artifact === name,
              title: name, onClick: () => setArtifact(artifact === name ? '' : name) },
            h(Icon, { name: 'file' }), nameOf(name))))),
          artifact && detail.artifacts.includes(artifact) && h(Preview, { key: artifact, workspaceId, featureId: selected.featureId || featureId,
            run: selected, name: artifact, running: ['RUNNING', 'running'].includes(detail.status) })))
        : !error && hint('正在读取实验详情…'))
  }

  function DeliveryHistory({ workspaceId, featureId, taskId, openConversation }) {
    const [records, setRecords] = React.useState(null)
    const [error, setError] = React.useState('')
    React.useEffect(() => {
      const controller = new AbortController()
      let timer
      async function refresh() {
        try {
          if (document.hidden) return
          const value = await project(workspaceId, 'bot_schedule_history', { featureId, id: taskId }, controller.signal)
          if (!controller.signal.aborted) { setRecords(value); setError('') }
        } catch (error) {
          if (!controller.signal.aborted) setError(error.message)
        } finally {
          if (!controller.signal.aborted) timer = setTimeout(refresh, 3000)
        }
      }
      void refresh()
      return () => { controller.abort(); clearTimeout(timer) }
    }, [workspaceId, featureId, taskId])
    if (error) return alert(error)
    if (!records) return hint('正在读取投递记录…')
    if (!records.length) return hint('还没有投递记录。')
    return h('ol', { className: 'lw-bot-delivery-list' }, records.map(record => h('li', { key: record.id },
      h('span', null, fmtDateTime(record.deliveredAt)),
      record.sessionId && Btn({ variant: 'ghost', size: 'xs', onClick: () => openConversation(record.sessionId) }, '打开对话'))))
  }

  function TaskDeliveries(props) {
    const [open, setOpen] = React.useState(false)
    return h('details', { className: 'lw-bot-disclosure', onToggle: event => setOpen(event.currentTarget.open) },
      h('summary', null, '投递记录'), open && h(DeliveryHistory, props))
  }

  return { Experiments, TaskDeliveries, Charts }
}
