const labels = { WAITING_APPROVAL:'等待试跑额度', QUEUED:'排队中', BLOCKED:'执行环境未就绪', RUNNING:'运行中', SUCCEEDED:'已完成', FAILED:'失败',
  CANCELLED:'已取消', INTERRUPTED:'已中断', DRAFT:'待审批', APPROVED:'已批准', PAUSED:'已暂停', REVIEW:'待核查结果', PENDING:'排队中' }

export function createPanel(React, project, openSource, ui = {}) {
  const h = React.createElement
  const Icon = ui.Icon || (() => null)
  const Btn = ui.Btn || ((props, ...children) => React.createElement('button', props, ...children))

  function SandboxStyles() {
    return h('style', null, `
      .lw-sbx{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.55}
      .lw-sbx-head{box-sizing:border-box;display:flex;align-items:center;gap:8px;flex:none;height:38px;padding:0 6px 0 16px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
      .lw-sbx-budget{display:flex;align-items:center;gap:6px;flex:1;min-width:0;color:var(--dsw-alias-label-secondary,GrayText);font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lw-sbx-tool{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;flex:none;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);cursor:pointer;line-height:1}
      .lw-sbx-tool:hover{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-sbx-tool:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-sbx-tool:disabled{opacity:.4;cursor:not-allowed}
      .lw-sbx-tool .lw-icon{width:15px;height:15px}
      .lw-sbx-body{flex:1;min-height:0;overflow:auto;padding:0 0 24px;scrollbar-gutter:stable}
      .lw-sbx-setup{display:grid;gap:8px;padding:10px 16px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
      .lw-sbx-field{display:grid;gap:4px;min-width:0;color:var(--dsw-alias-label-secondary,GrayText);font-size:12px}
      .lw-sbx-select,.lw-sbx-input{box-sizing:border-box;width:100%;height:32px;min-width:0;padding:0 9px;border:.5px solid var(--dsw-alias-border-l4,rgba(128,128,128,.4));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font:inherit}
      .lw-sbx-select:focus,.lw-sbx-input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary,#3b82f6)}
      .lw-sbx-input::placeholder{color:var(--dsw-alias-label-dimmed,GrayText)}
      .lw-sbx-manage{margin:0}
      .lw-sbx-manage>summary{display:flex;align-items:center;gap:4px;width:fit-content;max-width:100%;padding:3px 6px 3px 0;border-radius:var(--dsw-radius-sm,6px);color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;cursor:pointer;list-style:none}
      .lw-sbx-manage>summary::-webkit-details-marker{display:none}
      .lw-sbx-manage>summary::before{content:'▸';display:inline-block;width:1em;color:var(--dsw-alias-label-dimmed,GrayText)}
      .lw-sbx-manage[open]>summary::before{content:'▾'}
      .lw-sbx-manage>summary:hover{color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-sbx-manage[open]>summary{color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-sbx-manage-body{display:grid;gap:8px;padding-top:8px}
      .lw-sbx-actions{display:flex;flex-wrap:wrap;align-items:flex-end;gap:6px}
      .lw-sbx-actions .lw-sbx-field{flex:1 1 120px}
      .lw-sbx-note{margin:0;padding:2px 16px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
      .lw-sbx-error{margin:0;padding:6px 16px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px;line-height:1.6}
      .lw-sbx-tabs{display:flex;align-items:center;gap:4px;padding:8px 16px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
      .lw-sbx-tab{display:inline-flex;align-items:center;gap:6px;min-height:26px;padding:1px 10px;border:0;border-radius:999px;background:transparent;color:var(--dsw-alias-label-tertiary,GrayText);font:inherit;font-size:12px;cursor:pointer;white-space:nowrap}
      .lw-sbx-tab:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-sbx-tab[aria-selected=true]{background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-primary,CanvasText);font-weight:500}
      .lw-sbx-count{font-size:11px;line-height:1.4;padding:0 5px;border-radius:999px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));color:var(--dsw-alias-label-tertiary,GrayText);font-variant-numeric:tabular-nums}
      .lw-sbx-list{display:grid;gap:0;margin:4px 0 0;padding:0;list-style:none}
      .lw-sbx-row{display:flex;align-items:center;gap:8px;width:calc(100% - 12px);min-height:32px;margin:0 6px;padding:5px 10px;border:0;border-radius:var(--dsw-radius-md,8px);background:transparent;color:inherit;font:inherit;text-align:start;cursor:pointer}
      .lw-sbx-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
      .lw-sbx-row:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-sbx-dot{width:7px;height:7px;border-radius:999px;flex:none;background:var(--dsw-alias-label-tertiary,#94a3b8)}
      .lw-sbx-dot[data-tone=ok]{background:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-sbx-dot[data-tone=active]{background:var(--dsw-alias-state-business-primary,#3b82f6)}
      .lw-sbx-dot[data-tone=err]{background:var(--dsw-alias-state-error-primary,#dc2626)}
      .lw-sbx-row-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-sbx-row-meta{flex:none;max-width:45%;color:var(--dsw-alias-label-tertiary,GrayText);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lw-sbx-tag{flex:none;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1));color:var(--dsw-alias-label-secondary,GrayText);font-size:11px;font-weight:500;white-space:nowrap}
      .lw-sbx-tag[data-tone=ok]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 11%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-sbx-tag[data-tone=active]{background:color-mix(in srgb,var(--dsw-alias-state-business-primary,#3b82f6) 11%,transparent);color:var(--dsw-alias-state-business-primary,#3b82f6)}
      .lw-sbx-tag[data-tone=err]{background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 11%,transparent);color:var(--dsw-alias-state-error-primary,#dc2626)}
      .lw-sbx-empty{display:flex;flex-direction:column;align-items:center;gap:4px;padding:40px 24px;text-align:center;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px}
      .lw-sbx-empty .lw-icon{width:26px;height:26px;opacity:.6}
      .lw-sbx-empty strong{font-weight:500;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-sbx-empty p{margin:0;line-height:1.6;max-width:17rem}
      .lw-sbx-detail{display:grid;gap:0}
      .lw-sbx-detail-head{display:flex;align-items:flex-start;gap:4px;padding:8px 12px 2px 6px}
      .lw-sbx-back{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;flex:none;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);cursor:pointer}
      .lw-sbx-back:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-sbx-back .lw-icon{width:15px;height:15px}
      .lw-sbx-detail-title{flex:1;min-width:0;padding-top:3px;font-weight:500;overflow-wrap:anywhere}
      .lw-sbx-detail-head .lw-sbx-tag{margin-top:4px}
      .lw-sbx-detail-meta{margin:0;padding:0 16px 4px 38px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
      .lw-sbx-section{display:grid;gap:6px;padding:10px 16px 0}
      .lw-sbx-section-actions{padding:8px 16px 0}
      .lw-sbx-label{color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;font-weight:500}
      .lw-sbx-pre{margin:0;padding:8px 10px;border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-primary,CanvasText);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11.5px;line-height:1.6;max-height:220px;overflow:auto;white-space:pre-wrap;overflow-wrap:anywhere}
      .lw-sbx-progress{display:grid;gap:4px}
      .lw-sbx-progress-line{display:flex;align-items:center;justify-content:space-between;gap:8px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px}
      .lw-sbx-meter{height:5px;border-radius:999px;background:var(--dsw-alias-border-l1,rgba(128,128,128,.14));overflow:hidden}
      .lw-sbx-meter>span{display:block;height:100%;border-radius:999px;background:var(--dsw-alias-state-success-primary,#16a34a);transition:width .2s ease}
      .lw-sbx-files{display:flex;flex-wrap:wrap;gap:6px}
      .lw-sbx-artifact{padding:8px 16px 0}
      ${''}
    `)
  }

  return function SandboxPanel({row, notice}) {
    const ws = row.workspaceId
    const [data, setData] = React.useState(null)
    const [envs, setEnvs] = React.useState([])
    const [selected, select] = React.useState(notice ? {id: notice.id, kind: notice.kind} : null)
    const [tab, setTab] = React.useState(notice?.kind === 'workflow' ? 'workflows' : 'runs')
    const [detail, setDetail] = React.useState(null)
    const [file, setFile] = React.useState(null)
    const [cellId, setCell] = React.useState('')
    const [cellLog, setCellLog] = React.useState('')
    const [error, setError] = React.useState('')
    const [envError, setEnvError] = React.useState('')
    const [busy, setBusy] = React.useState(false)
    const [fresh, setFresh] = React.useState(0)
    const [budget, setBudget] = React.useState(120)
    const [newEnv, setNewEnv] = React.useState('')
    const autoSelect = React.useRef(true)
    const api = (action, args = {}, signal) => project(ws, action, args, signal)

    React.useEffect(() => {
      if (!notice) return
      autoSelect.current = true
      setTab(notice.kind === 'workflow' ? 'workflows' : 'runs')
      select({id: notice.id, kind: notice.kind})
      setFile(null)
    }, [notice?.eventId])

    React.useEffect(() => {
      const ctrl = new AbortController()
      api('sandbox/environments', {}, ctrl.signal).then(value => {
        if (!ctrl.signal.aborted) { setEnvs(value); setEnvError('') }
      }).catch(err => { if (!ctrl.signal.aborted) setEnvError(err.message) })
      return () => ctrl.abort()
    }, [ws, fresh])

    React.useEffect(() => {
      const ctrl = new AbortController()
      let timer
      async function refresh() {
        try {
          const next = await api('sandbox/list', {}, ctrl.signal)
          if (ctrl.signal.aborted) return
          setData(next)
          if (!selected) {
            const candidates = tab === 'workflows' ? next.workflows : next.runs
            if (autoSelect.current && candidates[0]) {
              select({id: candidates[0].id, kind: tab === 'workflows' ? 'workflow' : 'trial'})
              return
            }
            setDetail(null)
            return
          }
          const info = await api(selected.kind === 'trial' ? 'sandbox/detail' : 'sandbox/flow', {id: selected.id}, ctrl.signal)
          if (ctrl.signal.aborted) return
          setDetail(info)
          if (selected.kind === 'workflow') {
            const cell = info.runs.find(run => run.id === cellId) || info.runs.find(run => run.status === 'RUNNING') || info.runs.find(run => run.attempts.length)
            if (cell?.attempts?.length) {
              const args = {id: info.id, runId: cell.id, attempt: cell.attempts.length - 1}
              const logs = await Promise.all(['stdout.log', 'stderr.log'].map(name => api('research/log', {...args, file: name}, ctrl.signal)))
              if (!ctrl.signal.aborted) setCellLog(logs.map((value, index) => (index ? 'stderr' : 'stdout') + '\n' + value.text).join('\n'))
            } else if (!ctrl.signal.aborted) setCellLog('')
          }
        } catch (err) {
          if (!ctrl.signal.aborted) setError(err.message)
        } finally {
          if (!ctrl.signal.aborted) timer = setTimeout(refresh, 1850)
        }
      }
      refresh()
      return () => { ctrl.abort(); clearTimeout(timer) }
    }, [ws, selected?.id, selected?.kind, cellId, fresh, tab])

    async function act(fn) {
      if (busy) return
      setBusy(true)
      setError('')
      try { await fn(); setFresh(value => value + 1) }
      catch (err) { setError(err.message) }
      finally { setBusy(false) }
    }

    const button = (label, fn, disabled = false, variant = 'secondary') =>
      h('button', {type: 'button', className: 'lw-btn lw-btn-xs lw-btn-' + variant, disabled: disabled || busy, onClick: () => act(fn)}, label)

    function choose(item, kind) {
      autoSelect.current = false
      setTab(kind === 'workflow' ? 'workflows' : 'runs')
      select({id: item.id, kind})
      setDetail(null)
      setFile(null)
      setCell('')
      setCellLog('')
      setError('')
    }

    function goBack() {
      autoSelect.current = false
      select(null)
      setDetail(null)
      setFile(null)
      setCell('')
      setCellLog('')
      setError('')
    }

    function switchTab(next) {
      if (next === tab) return
      autoSelect.current = false
      setTab(next)
      select(null)
      setDetail(null)
      setFile(null)
      setCell('')
      setCellLog('')
      setError('')
    }

    const status = value => labels[value] || value
    const tone = value => value === 'SUCCEEDED' || value === 'APPROVED' ? 'ok'
      : value === 'RUNNING' || value === 'WAITING_APPROVAL' ? 'active'
      : ['FAILED', 'BLOCKED'].includes(value) ? 'err' : 'muted'
    const info = detail?.id === selected?.id ? detail : null
    const trial = selected?.kind === 'trial'
    const succeededCount = info && !trial ? info.runs.filter(run => run.status === 'SUCCEEDED').length : 0
    const runPct = info && !trial && info.runs.length ? Math.round((succeededCount / info.runs.length) * 100) : 0
    const runs = data?.runs || []
    const workflows = data?.workflows || []
    const items = tab === 'workflows' ? workflows : runs
    const environmentPath = envs.find(item => item.id === data?.environment)?.path || ''
    const environmentOption = option => (option.label || option.id) + (option.pending ? '（首次运行创建）' : option.pythonVersion ? '，Python ' + option.pythonVersion : '')

    const detailActions = info ? h('div', {className: 'lw-sbx-section-actions'},
      h('div', {className: 'lw-sbx-actions'},
        trial && info.sourceSession && button('发起对话', () => openSource(row, info.sourceSession)),
        trial && info.status === 'WAITING_APPROVAL' && button('批准本次试跑并运行', () => api('sandbox/approve-trial', {id: info.id}), false, 'primary'),
        trial && ['WAITING_APPROVAL', 'QUEUED', 'RUNNING'].includes(info.status) && button('停止试跑', () => api('sandbox/cancel', {id: info.id})),
        trial && ['BLOCKED', 'FAILED', 'INTERRUPTED', 'CANCELLED'].includes(info.status) && button('用当前环境重试', async () => {
          const next = await api('sandbox/retry', {id: info.id, environment: data.environment, requestId: crypto.randomUUID()})
          choose(next, 'trial')
        }),
        !trial && info.status === 'DRAFT' && button('批准计划并运行', () => api('sandbox/approve-run', {id: info.id, revision: info.revision}), false, 'primary'),
        !trial && info.status !== 'DRAFT' && !info.plan.environmentId && button('用当前环境建立修订', async () => {
          const next = await api('sandbox/revise', {id: info.id, environment: data.environment})
          choose(next, 'workflow')
        }),
        !trial && info.plan.environmentId && ['APPROVED', 'PAUSED', 'FAILED'].includes(info.status) && button('运行已批准的实验', () => api('research/run', {id: info.id}), false, 'primary'),
        !trial && info.status === 'RUNNING' && button('暂停实验', () => api('research/pause', {id: info.id})))) : null

    const trialDetail = info && trial ? h(React.Fragment, null,
      h('p', {className: 'lw-sbx-detail-meta'},
        [info.environment && '环境 ' + info.environment, info.sourceBot, info.timeoutSeconds != null && '时限 ' + info.timeoutSeconds + ' 秒',
          info.exitCode != null && '退出码 ' + info.exitCode].filter(Boolean).join(' · ')),
      detailActions,
      h('div', {className: 'lw-sbx-section'},
        h('details', {className: 'lw-sbx-manage'},
          h('summary', null, '代码与参数'),
          h('pre', {className: 'lw-sbx-pre'}, (info.code || info.script) + '\n' + JSON.stringify(info.args)))),
      h('div', {className: 'lw-sbx-section'},
        h('span', {className: 'lw-sbx-label'}, 'stdout'),
        h('pre', {className: 'lw-sbx-pre'}, info.stdout || '暂无输出')),
      (info.stderr || info.error) ? h('div', {className: 'lw-sbx-section'},
        h('span', {className: 'lw-sbx-label'}, 'stderr'),
        h('pre', {className: 'lw-sbx-pre'}, info.stderr || info.error)) : null,
      info.artifacts?.length ? h('div', {className: 'lw-sbx-artifact'},
        h('span', {className: 'lw-sbx-label'}, '运行产物'),
        h('div', {className: 'lw-sbx-files', style: {marginTop: 6}},
          info.artifacts.map(item => h('span', {key: item.name},
            button(item.name, async () => setFile(await api('sandbox/artifact', {id: info.id, name: item.name}))))))) : null,
      file ? h('div', {className: 'lw-sbx-section'},
        h('pre', {className: 'lw-sbx-pre', 'aria-label': '产物内容'}, file.text)) : null) : null

    const workflowDetail = info && !trial ? h(React.Fragment, null,
      h('p', {className: 'lw-sbx-detail-meta'},
        [status(info.status), info.plan.environmentId || '旧版环境',
          info.plan.budget?.maxRuns != null && '最多 ' + info.plan.budget.maxRuns + ' 次运行']
          .filter(Boolean).join(' · ')),
      h('div', {className: 'lw-sbx-section'},
        h('div', {className: 'lw-sbx-progress'},
          h('div', {className: 'lw-sbx-progress-line'}, h('span', null, '实验进度'), h('span', null, succeededCount + ' / ' + info.runs.length)),
          h('div', {className: 'lw-sbx-meter', 'aria-hidden': true}, h('span', {style: {width: runPct + '%'}})))),
      detailActions,
      info.error ? h('p', {className: 'lw-sbx-error', role: 'alert'}, info.error) : null,
      h('div', {className: 'lw-sbx-section'},
        h('details', {className: 'lw-sbx-manage'},
          h('summary', null, '实验协议与预算'),
          h('pre', {className: 'lw-sbx-pre'}, JSON.stringify(info.plan, null, 2)))),
      info.reportPath ? h('div', {className: 'lw-sbx-artifact'},
        h('span', {className: 'lw-sbx-label'}, '实验报告'),
        h('div', {className: 'lw-sbx-files', style: {marginTop: 6}},
          ['report.md', 'analysis.json', 'runs.csv'].map(name => h('span', {key: name},
            button(name, async () => setFile(await api('read', {id: 'wf_' + info.id + '_' + name.replace('.', '_')}))))))) : null,
      file ? h('div', {className: 'lw-sbx-section'},
        h('pre', {className: 'lw-sbx-pre', 'aria-label': '实验报告内容'}, file.text)) : null,
      info.runs.some(cell => cell.attempts.length) ? h('div', {className: 'lw-sbx-section'},
        h('label', {className: 'lw-sbx-field'}, h('span', null, '单元日志'),
          h('select', {className: 'lw-sbx-select', value: cellId, onChange: event => setCell(event.target.value)},
            h('option', {value: ''}, '跟随当前单元'),
            info.runs.filter(cell => cell.attempts.length).map(cell => h('option', {key: cell.id, value: cell.id},
              cell.method + '，' + cell.seed + '，' + status(cell.status)))))) : null,
      cellLog ? h('div', {className: 'lw-sbx-section'}, h('pre', {className: 'lw-sbx-pre'}, cellLog)) : null) : null

    const detailTitle = info ? (trial ? info.title : info.plan.question) : ''

    return h('section', {className: 'lw-sbx', 'aria-label': row.name + ' 项目代码沙盒'},
      h(SandboxStyles),
      h('div', {className: 'lw-sbx-head'},
        h('span', {className: 'lw-sbx-budget'},
          h('span', {className: 'lw-sbx-dot', 'data-tone': data?.seconds > 0 ? 'ok' : undefined, 'aria-hidden': true}),
          data ? '可用试跑预算 ' + data.seconds + ' 秒 · 项目只读 · 禁网' : '正在读取项目代码沙盒…'),
        h('button', {
          type: 'button', className: 'lw-sbx-tool', 'aria-label': '刷新项目代码沙盒', title: '刷新项目代码沙盒',
          disabled: busy, onClick: () => setFresh(value => value + 1),
        }, h(Icon, {name: 'refresh'}))),
      h('div', {className: 'lw-sbx-body'},
        h('div', {className: 'lw-sbx-setup'},
          h('label', {className: 'lw-sbx-field'}, h('span', null, '下次试跑环境'),
            h('select', {
              className: 'lw-sbx-select', 'aria-label': '下次试跑环境', value: data?.environment || 'default',
              disabled: busy || !data,
              onChange: event => { const environment = event.target.value; act(() => api('sandbox/configure', {environment})) },
            }, (envs.length ? envs : [{id: data?.environment || 'default'}]).map(option => h('option', {key: option.id, value: option.id},
              environmentOption(option))))),
          h('details', {className: 'lw-sbx-manage'},
            h('summary', null, '管理环境与试跑预算'),
            h('div', {className: 'lw-sbx-manage-body'},
              environmentPath ? h('pre', {className: 'lw-sbx-pre'}, environmentPath) : null,
              h('div', {className: 'lw-sbx-actions'},
                h('label', {className: 'lw-sbx-field'}, h('span', null, '新环境名称'),
                  h('input', {
                    className: 'lw-sbx-input', placeholder: '例如 repro-cpu', value: newEnv, maxLength: 40,
                    onChange: event => setNewEnv(event.target.value),
                  })),
                button('创建环境', async () => {
                  await api('sandbox/create-env', {name: newEnv.trim()})
                  await api('sandbox/configure', {environment: newEnv.trim()})
                  setNewEnv('')
                }, !newEnv.trim())),
              h('div', {className: 'lw-sbx-actions'},
                h('label', {className: 'lw-sbx-field'}, h('span', null, '增加试跑秒数'),
                  h('input', {
                    className: 'lw-sbx-input', type: 'number', min: 1, max: 3600, value: budget,
                    onChange: event => setBudget(event.target.value),
                  })),
                button('授权项目试跑', () => api('sandbox/configure', {
                  grantSeconds: Number(budget), requestId: crypto.randomUUID(),
                }), !Number.isInteger(Number(budget)) || budget < 1 || budget > 3600, 'primary')),
              h('p', {className: 'lw-sbx-note', style: {padding: 0}}, '预算只用于本项目试跑，未用完的秒数会保留。'))),
          envError ? h('p', {className: 'lw-sbx-error', role: 'alert', style: {padding: 0}}, envError) : null),
        error ? h('p', {className: 'lw-sbx-error', role: 'alert'}, error) : null,
        h('div', {className: 'lw-sbx-tabs', role: 'tablist', 'aria-label': '沙盒视图'},
          h('button', {
            type: 'button', className: 'lw-sbx-tab', role: 'tab', 'aria-selected': tab === 'runs' ? 'true' : 'false',
            onClick: () => switchTab('runs'),
          }, '试跑', h('span', {className: 'lw-sbx-count'}, runs.length)),
          h('button', {
            type: 'button', className: 'lw-sbx-tab', role: 'tab', 'aria-selected': tab === 'workflows' ? 'true' : 'false',
            onClick: () => switchTab('workflows'),
          }, '正式实验', h('span', {className: 'lw-sbx-count'}, workflows.length))),
        !data ? h('p', {className: 'lw-sbx-note', role: 'status', style: {paddingTop: 12}}, '正在读取沙盒…') : null,
        data && !items.length && !selected ? h('div', {className: 'lw-sbx-empty'},
          h(Icon, {name: 'activity'}),
          h('strong', null, tab === 'workflows' ? '还没有正式实验' : '还没有试跑记录'),
          h('p', null, tab === 'workflows'
            ? '在项目聊天里提交正式实验计划后，审批和运行状态会显示在这里。'
            : '在项目聊天里运行代码后，进程、日志和产物会显示在这里。')) : null,
        data && !selected ? h('ul', {className: 'lw-sbx-list'}, items.map(item => h('li', {key: item.id},
          h('button', {
            type: 'button', className: 'lw-sbx-row',
            onClick: () => choose(item, tab === 'workflows' ? 'workflow' : 'trial'),
          },
          h('span', {className: 'lw-sbx-dot', 'data-tone': tone(item.status), 'aria-hidden': true}),
          h('span', {className: 'lw-sbx-row-name'}, tab === 'workflows' ? item.title : item.title),
          h('span', {className: 'lw-sbx-row-meta'},
            tab === 'workflows'
              ? (item.completed || 0) + ' / ' + (item.total || 0) + ' 单元 · ' + (item.environment || '旧版环境')
              : [item.environment, item.sourceBot].filter(Boolean).join(' · ')),
          h('span', {className: 'lw-sbx-tag', 'data-tone': tone(item.status)}, status(item.status)))))) : null,
        selected ? h('div', {className: 'lw-sbx-detail'},
          h('div', {className: 'lw-sbx-detail-head'},
            h('button', {
              type: 'button', className: 'lw-sbx-back', 'aria-label': '返回沙盒列表', title: '返回沙盒列表',
              onClick: goBack,
            }, h(Icon, {name: 'back'})),
            h('span', {className: 'lw-sbx-detail-title'}, detailTitle || '正在读取…'),
            info ? h('span', {className: 'lw-sbx-tag', 'data-tone': tone(info.status)}, status(info.status)) : null),
          !info ? h('p', {className: 'lw-sbx-note', role: 'status'}, '正在读取运行详情…') : null,
          trialDetail,
          workflowDetail) : null))
  }
}
