export function createWorkbenchViews(React, project, { Btn, Icon, Tag, fmtDateTime }) {
  const h = React.createElement
  const states = {
    WAITING_APPROVAL: '待批准', QUEUED: '排队中', RUNNING: '运行中', SUCCEEDED: '已完成',
    FAILED: '失败', CANCELLED: '已取消', INTERRUPTED: '已中断', BLOCKED: '环境未就绪',
    DRAFT: '待审批', APPROVED: '已批准', PAUSED: '已暂停', REVIEW: '待核查',
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
      [8 + index * 304 / (values.length - 1), span ? 84 - (value / scale - min / scale) / span * 76 : 46])
    return h('figure', { className: 'lw-bot-chart' },
      h('figcaption', null, series.length === 1 ? label : h('label', null, '指标',
        h('select', { className: 'lw-select', value: column, onChange: event => setColumn(Number(event.target.value)) },
          series.map((item, index) => h('option', { key: index, value: index }, item.label || '第 ' + (index + 1) + ' 列'))))),
      h('p', { className: 'lw-hint' }, '范围 ' + min + ' 至 ' + max + ' · ' + values.length + ' 行'),
      h('svg', { viewBox: '0 0 320 96', role: 'img', 'aria-label': (label || '数值') + '按表格行序绘制' },
        h('path', { d: 'M8 8V84H312', fill: 'none', stroke: 'currentColor', opacity: '.25' }),
        h('polyline', { points: points.map(point => point.join(',')).join(' '), fill: 'none',
          stroke: 'var(--dsw-alias-state-business-primary,#3b82f6)', strokeWidth: 2, vectorEffect: 'non-scaling-stroke' })),
      h('div', { className: 'lw-bot-chart-axis', 'aria-hidden': 'true' },
        h('span', null, '第 1 行'), h('span', null, '第 ' + values.length + ' 行')))
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
    const raw = h('pre', { className: 'lw-bot-output' }, value.text, value.truncated ? '\n…' : '')
    if (!value.series?.length) return raw
    return h(React.Fragment, null, h(Chart, { series: value.series }),
      h('details', { className: 'lw-bot-disclosure' }, h('summary', null, '原始数据'), raw))
  }

  function Experiments({ workspaceId, featureId, openSandbox, updatedEvent }) {
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
    if (!selected) return h('section', { className: 'lw-bot-workstack', 'aria-label': '实验线程' },
      h('h3', null, '实验线程'), error && alert(error),
      !items ? hint('正在读取实验…') : !items.length ? hint('这个 Bot 发起的试跑和实验计划会显示在这里。')
        : h('ul', { className: 'lw-bot-thread-list' }, items.map(item => h('li', { key: item.kind + item.id },
          h('button', { className: 'lw-bot-thread', type: 'button', onClick: () => show(item) },
            h(Icon, { name: item.kind === 'trial' ? 'activity' : 'list' }),
            h('span', { className: 'lw-bot-thread-label' }, h('strong', null, item.title),
              h('small', null, (item.kind === 'trial' ? '试跑 · ' : '实验计划 · ') + fmtDateTime(item.created))),
            status(item))))),
    )
    return h('section', { className: 'lw-bot-workstack', 'aria-label': '实验详情' },
      h('div', { className: 'lw-bot-workline' }, Btn({ variant: 'ghost', size: 'xs', onClick: () => show(null) }, '返回实验'),
        status(detail || selected)),
      h('h3', null, selected.title),
      error && alert(error),
      Btn({ size: 'sm', onClick: () => openSandbox(selected) }, '在项目代码沙盒打开'),
      detail ? h(React.Fragment, null,
        detail.total > 0 && hint(`已完成 ${detail.completed} / ${detail.total} 次运行`),
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
