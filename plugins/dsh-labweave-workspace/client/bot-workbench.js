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

  function Chart({ series }) {
    const [column, setColumn] = React.useState(0)
    const { label, values } = series[column]
    const min = Math.min(...values), max = Math.max(...values)
    const scale = Math.max(Math.abs(min), Math.abs(max), Number.MIN_VALUE)
    const span = max / scale - min / scale
    const points = values.map((value, index) =>
      [values.length > 1 ? 8 + index * 304 / (values.length - 1) : 160,
        span ? 84 - (value / scale - min / scale) / span * 76 : 46])
    return h('figure', { className: 'lw-bot-chart' },
      h('figcaption', null, series.length === 1 ? label : h('label', null, '指标',
        h(Select, { inline: true, value: column, ariaLabel: '指标', onChange: setColumn,
          options: series.map((item, index) => ({ value: index, label: item.label || '第 ' + (index + 1) + ' 列' })) }))),
      h('p', { className: 'lw-hint' }, '范围 ' + min + ' 至 ' + max + ' · ' + values.length + ' 行'),
      h('svg', { viewBox: '0 0 320 96', role: 'img', 'aria-label': (label || '数值') + '按表格行序绘制' },
        h('path', { d: 'M8 8V84H312', fill: 'none', stroke: 'currentColor', opacity: '.25' }),
        points.length === 1 ? h('circle', { cx: points[0][0], cy: points[0][1], r: 4,
          fill: 'var(--dsw-alias-state-business-primary,#3b82f6)' })
          : h('polyline', { points: points.map(point => point.join(',')).join(' '), fill: 'none',
            stroke: 'var(--dsw-alias-state-business-primary,#3b82f6)', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' })),
      h('div', { className: 'lw-bot-chart-axis', 'aria-hidden': 'true' },
        h('span', null, '第 1 行'), h('span', null, '第 ' + values.length + ' 行')))
  }

  function MeshPreview({ mesh, name }) {
    const ref = React.useRef(null)
    const drag = React.useRef(null)
    const initial = { pitch: 0.4, yaw: -0.55 }
    const [angle, setAngle] = React.useState(initial)
    const rotate = (x, y) => setAngle(value => ({
      pitch: Math.max(-1.55, Math.min(1.55, value.pitch + y)), yaw: value.yaw + x,
    }))
    React.useLayoutEffect(() => {
      const canvas = ref.current
      const context = canvas.getContext('2d')
      if (!context) return
      const cy = Math.cos(angle.yaw), sy = Math.sin(angle.yaw), cp = Math.cos(angle.pitch), sp = Math.sin(angle.pitch)
      const points = mesh.vertices.map(([x, y, z]) => {
        const horizontal = x * cy + z * sy
        const depth = -x * sy + z * cy
        return [horizontal, y * cp - depth * sp, y * sp + depth * cp]
      })
      const faces = mesh.faces.map(face => face.map(index => points[index])).map(face => ({
        points: face, depth: face.reduce((total, point) => total + point[2], 0) / face.length,
      })).sort((a, b) => a.depth - b.depth)
      const { width, height } = canvas
      context.clearRect(0, 0, width, height)
      for (const face of faces) {
        context.beginPath()
        for (const [x, y] of face.points) context.lineTo(width / 2 + x * height * .27, height / 2 - y * height * .27)
        context.closePath()
        context.fillStyle = 'hsl(211 62% ' + Math.round(55 + face.depth * 11) + '% / .82)'
        context.strokeStyle = '#46638e'
        context.lineWidth = 1
        context.fill()
        context.stroke()
      }
    }, [mesh, angle])
    return h('figure', { className: 'lw-bot-mesh' },
      h('canvas', { ref, width: 640, height: 330, tabIndex: 0, 'aria-label': '三维网格预览 ' + name,
        onPointerDown: event => {
          if (event.button !== 0) return
          drag.current = [event.clientX, event.clientY]
          event.currentTarget.setPointerCapture(event.pointerId)
        },
        onPointerMove: event => {
          if (!drag.current) return
          rotate((event.clientX - drag.current[0]) / 175, (event.clientY - drag.current[1]) / 175)
          drag.current = [event.clientX, event.clientY]
        },
        onLostPointerCapture: () => { drag.current = null },
        onKeyDown: event => {
          const vector = { ArrowRight: [.13, 0], ArrowLeft: [-.13, 0], ArrowDown: [0, .13], ArrowUp: [0, -.13] }[event.key]
          if (vector) { event.preventDefault(); rotate(...vector) }
        },
      }),
      h('figcaption', null, name + ' · ' + mesh.vertices.length + ' 顶点 · ' + mesh.faces.length + ' 面',
        Btn({ size: 'xs', variant: 'ghost', onClick: () => setAngle(initial) }, '重置视角')))
  }

  function Preview({ workspaceId, featureId, run, name }) {
    const [value, setValue] = React.useState(null)
    const [error, setError] = React.useState('')
    React.useEffect(() => {
      const controller = new AbortController()
      project(workspaceId, 'bot/artifact', { featureId, id: run.id, kind: run.kind, name }, controller.signal)
        .then(value => { if (!controller.signal.aborted) setValue(value) })
        .catch(error => { if (!controller.signal.aborted) setError(error.message) })
      return () => controller.abort()
    }, [workspaceId, featureId, run.id, run.kind, name])
    if (error) return alert(error)
    if (!value) return hint('正在打开产物…')
    if (value.image) return h('img', { className: 'lw-bot-artifact-img', src: value.image, alt: nameOf(name) })
    if (value.mesh) return h(MeshPreview, { mesh: value.mesh, name: nameOf(name) })
    if (value.note) return hint(value.note)
    const raw = h('pre', { className: 'lw-bot-output' }, value.text, value.truncated ? '\n…' : '')
    if (!value.series?.length) return raw
    return h(React.Fragment, null, h(Chart, { series: value.series }),
      h('details', { className: 'lw-bot-disclosure' }, h('summary', null, '原始数据'), raw))
  }

  function Experiments({ workspaceId, featureId, updatedEvent, layout, records = [], openRecord, addNode, deleteNode, busy,
    runRequest, notebooks = [], saveResult }) {
    const [items, setItems] = React.useState(null)
    const [selected, select] = React.useState(null)
    const [detail, setDetail] = React.useState(null)
    const [artifact, setArtifact] = React.useState('')
    const [error, setError] = React.useState('')
    const [notebookId, setNotebookId] = React.useState('')
    const destination = notebooks.find(item => item.id === notebookId) || notebooks[0]
    React.useEffect(() => {
      if (runRequest?.runId) show({ id: runRequest.runId, kind: 'experiment' })
    }, [runRequest])
    React.useEffect(() => {
      const controller = new AbortController()
      let loading = false
      async function read() {
        if (loading || document.hidden) return
        loading = true
        try {
          const query = { featureId }
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
      return h('section', { className: 'lw-bot-workstack lw-paradigm-view', 'aria-label': '实验线程' },
        error && alert(error),
        !items && !error && hint('正在读取实验…'),
        items && !entries.length && hint('这个 Bot 的实验运行、日志和产物会显示在这里。'),
        h(Canvas, { layout, busy, addNode: item => addNode(item?.experiment.item),
          deleteNode: item => deleteNode(item.experiment.item), items: entries.map(item => ({
          ...item.item, id: item.id, title: item.title,
          text: item.kind ? fmtDateTime(item.created) : item.summary,
          canvasGroup: item.item?.canvasGroup || item.group || (item.kind ? '实验运行' : '记录'),
          canvasStatus: states[item.status] || item.status, experiment: item,
        })), openEntry: ({ experiment }) => experiment.kind ? show(experiment) : openRecord(experiment) }))
    }
    const runs = detail?.runs?.length ? detail.runs : detail?.plannedRuns || []
    return h('section', { className: 'lw-bot-workstack lw-paradigm-view', 'aria-label': '实验详情' },
      h('div', { className: 'lw-bot-workline' }, Btn({ variant: 'ghost', size: 'xs', onClick: () => show(null) }, '返回实验'),
        status(detail || selected)),
      h('h3', null, detail?.title || selected.title),
      error && alert(error),
      detail ? h(React.Fragment, null,
        saveResult && ['completed', 'failed'].includes(detail.status) && h('div', { className: 'lw-code-save-result' },
          hint('历史运行 · ' + fmtDateTime(detail.created)),
          notebooks.length > 1 && h('select', { className: 'lw-select', 'aria-label': '结果笔记', value: destination?.id,
            onChange: event => setNotebookId(event.target.value) },
            notebooks.map(item => h('option', { key: item.id, value: item.id }, item.label))),
          destination && Btn({ variant: 'primary', size: 'xs', disabled: busy,
            onClick: () => saveResult(detail.id, destination.id) }, '保存结果到笔记')),
        detail.parameters && Object.keys(detail.parameters).length > 0 && h('details', { open: true },
          h('summary', null, '环境与参数'), h('pre', { className: 'lw-bot-output' }, JSON.stringify(detail.parameters, null, 2))),
        detail.metrics && Object.keys(detail.metrics).length > 0 && h('details', { open: true },
          h('summary', null, '运行指标'), h('dl', { className: 'lw-run-metrics' }, Object.entries(detail.metrics).map(([label, value]) =>
            h('div', { key: label }, h('dt', null, label), h('dd', null, typeof value === 'number' ? value : JSON.stringify(value)))))),
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
          artifact && h(Preview, { key: artifact, workspaceId, featureId, run: selected, name: artifact })))
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

  return { Experiments, TaskDeliveries }
}
