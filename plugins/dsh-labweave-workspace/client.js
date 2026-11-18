window.__ModuleLoader__.load({
  id: 'labweave-research-workspace',
  factory: require => {
    const React = require('react')
    const h = React.createElement
    const features = { chat: '聊天', feed: '动态', ideas: '点子', goals: '目标', library: '资源库' }
    const updated = 'labweave:project-updated'
    const manage = 'labweave:manage-plugins'
    const nameChanged = 'labweave:assistant-name-changed'
    const pageKey = 'labweave-project-page'
    const selectionKey = 'labweave.project-page.v2'
    const navEvent = 'labweave:navigate'
    const requestId = () => crypto.randomUUID().replaceAll('-', '')
    const styles = `
      .lw-bar,.lw-actions{display:flex;gap:.35rem;align-items:center;flex-wrap:wrap;min-width:0}
      .lw-bar{padding:.25rem .5rem;margin:0 auto .25rem;max-width:100%;font-size:.81rem}
      .lw-bar button,.lw-actions button,.lw-form button,.lw-panel button,.lw-more{font:inherit;color:inherit;border:0;border-radius:6px;background:transparent;cursor:pointer;padding:.3rem .5rem}
      .lw-bar button:hover,.lw-actions button:hover,.lw-panel button:hover,.lw-more:hover{background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.15))}
      .lw-bar button:focus-visible,.lw-form :focus-visible,.lw-panel :focus-visible{outline:2px solid currentColor;outline-offset:2px}
      .lw-bar button:first-child{font-weight:600}.lw-more{text-align:start;width:100%}
      .lw-dialog{box-sizing:border-box;width:min(25rem,calc(100vw - 2rem));max-height:85vh;overflow:auto;padding:1.25rem;border:1px solid var(--dsw-alias-border-default,#888);border-radius:12px;color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-bg-base,Canvas)}
      .lw-dialog::backdrop{background:rgba(0,0,0,.3)}.lw-dialog h2,.lw-panel h3{margin:0 0 .8rem;font-size:1rem}
      .lw-form{display:grid;gap:.65rem;min-width:0}.lw-form label{display:grid;gap:.3rem}
      .lw-form input,.lw-form textarea,.lw-form select,.lw-panel input,.lw-panel textarea{box-sizing:border-box;width:100%;max-width:100%;font:inherit;color:inherit;background:var(--dsw-alias-bg-base,Canvas);border:1px solid var(--dsw-alias-border-default,#888);border-radius:6px;padding:.45rem .6rem}
      .lw-form textarea{resize:vertical}.lw-form button[type=submit],.lw-panel button[type=submit]{background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.16));justify-self:start}
      .lw-panel{box-sizing:border-box;overflow-wrap:anywhere;font-size:.875rem}
      .lw-panel ul{list-style:none;margin:.85rem 0;padding:0}.lw-panel li{padding:.6rem 0;border-bottom:1px solid var(--dsw-alias-border-default,#8885)}
      .lw-panel pre{white-space:pre-wrap;font:inherit}.lw-panel details{margin-top:1rem}.lw-panel summary{cursor:pointer;font-weight:600}
      .lw-hint{color:var(--dsw-alias-label-secondary,GrayText)}.lw-panel [role=alert],.lw-dialog [role=alert]{color:var(--dsw-alias-state-error-primary,#b34835)}
      .lw-tree{padding:8px 0 18px;min-width:0;color:var(--dsw-alias-label-primary,inherit);font-size:13px}
      .lw-tree-head,.lw-row{display:flex;align-items:center;min-width:0;gap:4px}
      .lw-tree-head{padding:0 6px 8px 10px;font-weight:600;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-tree-head span{flex:1}.lw-tree button,.lw-page button,.lw-starters button,.lw-history button{font-family:inherit;color:inherit;cursor:pointer}
      .lw-tree button,.lw-page-head button,.lw-chats button,.lw-starters button,.lw-history button{border:0;background:transparent}
      .lw-tree button:hover,.lw-chats button:hover,.lw-tree [aria-current="page"],.lw-starters button:hover,.lw-history button:hover{background:var(--dsw-alias-bg-secondary,rgba(128,128,128,.13))}
      .lw-tree button:focus-visible,.lw-page button:focus-visible,.lw-starters button:focus-visible{outline:2px solid currentColor;outline-offset:-2px}
      .lw-icon{display:inline-block;width:16px;height:16px;flex:none}
      .lw-tree .lw-tool{display:inline-grid;place-items:center;width:26px;height:26px;border-radius:6px;padding:0}
      .lw-row-main{display:flex;align-items:center;gap:8px;min-width:0;flex:1;height:31px;border-radius:7px;text-align:start;padding:0 7px;font-size:inherit}
      .lw-row-main span{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-tier{margin:1px 0 5px 14px;padding-inline-start:7px;border-inline-start:1px solid var(--dsw-alias-border-default,#8884)}
      .lw-tree .lw-tier .lw-icon{width:14px;height:14px}.lw-sessions{margin-inline-start:19px}.lw-sessions .lw-row-main{font-size:12px;height:27px}
      .lw-tree [aria-current="page"]{font-weight:600}.lw-tree small{display:block;margin:5px 8px;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-page{box-sizing:border-box;width:100%;height:100%;min-width:0;min-height:0;overflow:auto;scrollbar-gutter:stable;background:var(--dsw-alias-bg-base);color:var(--dsw-alias-label-primary);font-family:inherit;font-size:14px;line-height:1.6}
      .lw-page-inner{box-sizing:content-box;max-width:960px;margin:0 auto;padding:28px clamp(24px,4vw,48px) 48px}
      .lw-page-head{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:24px}
      .lw-page-head small{color:var(--dsw-alias-label-secondary,GrayText);font-size:13px}
      .lw-page h1{font-size:20px;line-height:28px;font-weight:500;margin:3px 0 0}
      .lw-page .lw-form{max-width:100%}.lw-page .lw-entry{display:flex;align-items:end;gap:8px;flex-wrap:wrap}
      .lw-page .lw-entry label{flex:1 1 170px}.lw-page .lw-form input,.lw-page .lw-form select,.lw-page .lw-form textarea,.lw-query input{min-height:36px;border:.5px solid var(--dsw-alias-border-l3);border-radius:10px;padding:6px 12px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-base)}
      .lw-page .lw-form input:focus,.lw-query input:focus{outline:none;border-color:var(--dsw-alias-state-business-primary)}
      .lw-query input{box-sizing:border-box;width:calc(100% - 14px);margin:0 7px 8px;font:inherit}
      .lw-page .lw-entry button,.lw-page-head button{height:32px;border-radius:16px;padding:0 14px;font-size:13px;line-height:20px;background:var(--dsw-alias-label-primary);color:var(--dsw-alias-bg-base)}
      .lw-page button:disabled{opacity:.45;cursor:default}
      .lw-panel li{border-color:var(--dsw-alias-border-l3);padding:12px 2px}
      .lw-chats{list-style:none;margin:0;padding:0}.lw-chats li+li{border-top:1px solid var(--dsw-alias-border-default,#8884)}
      .lw-chats button{width:100%;display:flex;align-items:center;gap:10px;padding:14px 8px;border-radius:8px;text-align:start;font-size:14px}
      .lw-chats time{margin-inline-start:auto;color:var(--dsw-alias-label-secondary,GrayText);font-size:12px}
      .lw-wordmark{white-space:nowrap;display:inline-block;font:inherit;line-height:1.14;letter-spacing:-.045em}
      [class*="brandIdentity"]:has(.lw-wordmark){align-items:center;overflow:visible}
      .lw-brand-mark{display:block;flex:none;object-fit:contain}
      [data-chat-running] [class*="runningIcon"]{background:url("./labweave-orbit.svg") center/contain no-repeat}
      [data-chat-running] [class*="runningIcon"]>*{display:none}
      .lw-starters{display:flex;flex-wrap:wrap;justify-content:center;gap:6px;margin:8px auto 0;order:2}
      .lw-starters button,.lw-history button{font-size:12px;line-height:1.4;border:1px solid var(--dsw-alias-border-default,#8884);border-radius:18px;padding:6px 11px}
      [data-content-phase]:not([data-content-phase="hero"]) .lw-starters{display:none}
      [data-content-phase="hero"]:has(.lw-starters) [class*="heroWorkspaceRow"]>:first-child{display:none}
      [data-conversation-content] [class*="previewBadge"]:empty{display:none}
      .lw-history{display:flex;gap:5px;align-items:center}.lw-history button{border:0}
      @media(max-width:767px){.lw-page-inner{padding:24px 16px 36px}.lw-page-head{margin-bottom:20px}.lw-starters{gap:4px}}
    `

    async function api(route, body, signal) {
      const resp = await fetch('/api/labweave/' + route, { method: body === undefined ? 'GET' : 'POST',
        credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        ...(body === undefined ? {} : { headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }),
        signal: signal || AbortSignal.timeout(150000) })
      const result = await resp.json()
      if (!resp.ok) throw Error(result.error || '操作失败，请重试。')
      return result
    }
    const project = (workspaceId, action, args = {}, signal) => api('workspace-page', { workspaceId, action, args }, signal)

    function useProject(workspaceId, action = 'view') {
      const [state, setState] = React.useState({})
      React.useEffect(() => {
        let controller
        const refresh = () => {
          controller?.abort()
          controller = new AbortController()
          const signal = controller.signal
          project(workspaceId, action, {}, signal).then(value => {
            if (!signal.aborted) setState({ workspaceId, value })
          }).catch(error => { if (!signal.aborted) setState({ workspaceId, error: error.message }) })
        }
        refresh()
        window.addEventListener(updated, refresh)
        window.addEventListener('focus', refresh)
        return () => { controller.abort(); window.removeEventListener(updated, refresh); window.removeEventListener('focus', refresh) }
      }, [workspaceId, action])
      return state.workspaceId === workspaceId ? state : {}
    }

    function Dialog({ title, close, children }) {
      const ref = React.useRef(null)
      React.useEffect(() => {
        const node = ref.current
        node.showModal()
        return () => node.close()
      }, [])
      return h('dialog', { className: 'lw-dialog', ref, 'aria-label': title, onCancel: event => { event.preventDefault(); close() } },
        h('h2', null, title), children)
    }
    function ProjectForm({ busy, onPicked, onCancel, refresh, onCreated }) {
      const [name, setName] = React.useState('')
      const [waiting, setWaiting] = React.useState(false)
      const [error, setError] = React.useState('')
      const [id] = React.useState(requestId)
      const submit = async e => {
        e.preventDefault()
        if (busy || waiting || !name.trim()) return
        setWaiting(true)
        try {
          const row = await api('create', { name, requestId: id })
          await refresh()
          if (onCreated) onCreated(row)
          else onPicked(row.path)
        } catch (err) { setError(err.message); setWaiting(false) }
      }
      return h(Dialog, { title: '创建科研项目', close: onCancel }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, '项目名称', h('input', { autoFocus: true, required: true, maxLength: 80, value: name, onChange: e => setName(e.target.value) })),
        error && h('span', { role: 'alert' }, error),
        h('div', { className: 'lw-actions' }, h('button', { type: 'submit', disabled: busy || waiting }, waiting ? '创建中…' : '创建'),
          h('button', { type: 'button', onClick: onCancel }, '取消'))))
    }

    function PluginForm({ rows, close }) {
      const [scope, setScope] = React.useState('')
      const [name, setName] = React.useState('')
      const [prompt, setPrompt] = React.useState('')
      const [status, setStatus] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [id] = React.useState(requestId)
      const submit = async e => {
        e.preventDefault()
        if (busy) return
        setBusy(true)
        try {
          await api('plugin', { name, prompt, scope, requestId: id })
          window.dispatchEvent(new Event(updated))
          close()
        } catch (err) { setStatus(err.message); setBusy(false) }
      }
      return h(Dialog, { title: '创建项目插件', close }, h('form', { className: 'lw-form', onSubmit: submit },
        h('label', null, '插件名称', h('input', { required: true, autoFocus: true, maxLength: 80, value: name, onChange: e => setName(e.target.value) })),
        h('label', null, '适用范围', h('select', { required: true, value: scope, onChange: e => setScope(e.target.value) },
          h('option', { value: '', disabled: true }, '选择项目或全部项目'), h('option', { value: 'all' }, '全部项目'),
          rows.filter(r => r.scope !== 'global').map(r => h('option', { key: r.scope, value: r.scope }, r.name)))),
        h('label', null, '交给项目助手的指令', h('textarea', { rows: 4, required: true, maxLength: 12000, value: prompt, onChange: e => setPrompt(e.target.value) })),
        status && h('span', { role: 'alert' }, status), h('div', { className: 'lw-actions' },
          h('button', { type: 'submit', disabled: busy }, '创建插件'), h('button', { type: 'button', onClick: close }, '取消'))))
    }

    function EvidenceDetails({ node, graph, review }) {
      const labels = { insufficient: '证据不足', preliminary: '初步支持', confirmed: '已核查', refuted: '已反驳' }
      const [status, setStatus] = React.useState(node.effectiveStatus || node.status)
      const [reason, setReason] = React.useState('')
      const [open, setOpen] = React.useState(false)
      const related = open ? graph.edges.filter(e => e.source === node.id || e.target === node.id) : []
      const relations = { supports: '支持', contradicts: '反驳', tests: '验证', uses: '使用', derived_from: '源自', motivates: '促成' }
      const name = id => graph.nodes.find(n => n.id === id)?.text || id
      return h('details', { onToggle: e => setOpen(e.currentTarget.open) }, h('summary', null, node.text),
        open && h(React.Fragment, null, h('p', null, labels[node.effectiveStatus] || node.status),
          node.sources.map((source, index) => h('p', { key: index }, [source.path || source.url, source.location].filter(Boolean).join(' · '))),
          node.verification.problems.map(problem => h('p', { key: problem, role: 'alert' }, problem)),
          related.map(edge => h('p', { key: edge.id }, name(edge.source), ' → ', relations[edge.relation], ' → ', name(edge.target))),
          node.reviewReason && h('p', null, node.reviewReason),
          h('form', { className: 'lw-form', onSubmit: e => { e.preventDefault(); review({ id: node.id, status, reason }) } },
            h('label', null, '核查状态', h('select', { value: status, onChange: e => setStatus(e.target.value) },
              Object.entries(labels).map(([id, label]) => h('option', { key: id, value: id }, label)))),
            h('label', null, '核查依据', h('textarea', { required: true, value: reason, onChange: e => setReason(e.target.value) })),
            h('button', { type: 'submit', disabled: !reason.trim() }, '保存核查'))))
    }

    function WorkflowList({ workspaceId, run }) {
      const [overview, setOverview] = React.useState()
      const [tasks, setTasks] = React.useState([])
      const [answers, setAnswers] = React.useState({})
      const [error, setError] = React.useState('')
      const [log, setLog] = React.useState()
      const refresh = React.useCallback(async () => {
        try {
          const [state, jobs] = await Promise.all([project(workspaceId, 'research/overview'), project(workspaceId, 'tasks')])
          setOverview(state); setTasks(jobs); setError('')
        } catch (e) { setError(e.message) }
      }, [workspaceId])
      React.useEffect(() => {
        refresh()
        const timer = setInterval(() => { if (document.visibilityState === 'visible') refresh() }, 6000)
        return () => clearInterval(timer)
      }, [refresh])
      const taskAction = (action, id, answer) => run(async () => {
        await project(workspaceId, 'task/' + action, { id, answer }); await refresh()
      })
      const actions = { DRAFT: [['approve', '批准计划与预算']], APPROVED: [['run', '运行实验']],
        RUNNING: [['pause', '暂停实验'], ['cancel', '取消运行']], PAUSED: [['run', '继续实验']],
        FAILED: [['run', '重新尝试']], REVIEW: [['accept', '确认结论']] }
      const statuses = { DRAFT: '草案', APPROVED: '已批准', RUNNING: '运行中', PAUSED: '已暂停',
        FAILED: '失败', REVIEW: '待确认', SUCCEEDED: '已完成', CANCELLED: '已取消', PENDING: '待运行' }
      const showLog = (flow, cell, attempt, file) => run(async () => {
        const result = await project(workspaceId, 'research/log', { id: flow.id, runId: cell.id, attempt, file })
        setLog({ title: cell.method + ' · ' + file, text: result.text })
      })
      return h('div', null, error && h('p', { role: 'alert' }, error),
        h('button', { type: 'button', onClick: refresh }, '刷新实验状态'),
        h('button', { type: 'button', onClick: () => run(async () => {
          await project(workspaceId, 'research/example'); await refresh()
        }) }, '创建算法对照示例草案'),
        overview?.workflows.map(flow => h('article', { key: flow.id }, h('strong', null, flow.plan.question),
          h('p', null, statuses[flow.status] || flow.status, ' · ', flow.plan.budget.maxRuns, ' 次预算'),
          h('details', null, h('summary', null, '协议、命令与预算'), h('pre', null, JSON.stringify(flow.plan, null, 2))),
          flow.error && h('p', { role: 'alert' }, flow.error),
          flow.analysis && h('details', { open: flow.status === 'REVIEW' }, h('summary', null, '实验结果与适用范围'),
            h('p', null, flow.analysis.decision), h('p', null, flow.analysis.nextAction), h('p', null, flow.analysis.limitations),
            flow.analysis.problems.map(problem => h('p', { key: problem }, problem)),
            h('pre', null, JSON.stringify(flow.analysis.comparisons, null, 2))),
          flow.runs?.length > 0 && h('details', null, h('summary', null, '运行与日志'),
            flow.runs.map(cell => h('details', { key: cell.id },
              h('summary', null, cell.method, ' · 种子 ', cell.seed, ' · 预算 ', cell.budget, ' · ', statuses[cell.status] || cell.status),
              cell.attempts.map((attempt, index) => h('div', { key: index, className: 'lw-actions' }, '第 ', index + 1, ' 次',
                ['stdout.log', 'stderr.log', 'metadata.json'].map(file => h('button', { key: file,
                  onClick: () => showLog(flow, cell, index, file) }, file))))))),
          (actions[flow.status] || []).map(([action, label]) => h('button', { key: action, onClick: () => run(async () => {
            await project(workspaceId, 'research/' + action, { id: flow.id, revision: flow.revision, stateRevision: overview.state.revision })
            await refresh()
          }) }, label)))),
        overview?.workflows.length === 0 && h('p', { className: 'lw-hint' }, '项目助手拟定的实验计划会显示在这里。'),
        log && h('section', { 'aria-label': log.title }, h('h4', null, log.title), h('pre', null, log.text || '没有输出'),
          h('button', { onClick: () => setLog(null) }, '关闭日志')),
        overview?.evidence?.nodes?.length > 0 && h('details', null, h('summary', null, '证据与来源'),
          overview.evidence.nodes.map(node => h(EvidenceDetails, { key: node.id, node, graph: overview.evidence, review: args => run(async () => {
            await project(workspaceId, 'research/review-evidence', args); await refresh()
          }) }))),
        tasks.map(task => h('details', { key: task.id }, h('summary', null, task.prompt, ' · ', task.status),
          h('pre', null, task.result || task.error || ''),
          task.pending?.kind === 'approval' && h('div', null, h('pre', null, JSON.stringify(task.pending, null, 2)),
            h('button', { onClick: () => taskAction('respond', task.id, { outcome: 'allowed-once' }) }, '允许这一次'),
            h('button', { onClick: () => taskAction('respond', task.id, { outcome: 'rejected' }) }, '拒绝')),
          task.pending?.kind === 'question' && h('form', { className: 'lw-form', onSubmit: e => {
            e.preventDefault(); taskAction('respond', task.id, { answers: task.pending.questions.map(q => ({
              id: q.id, selected: [], custom: answers[task.id + q.id] || '' })) })
          } }, task.pending.questions.map(q => h('label', { key: q.id }, q.question || q.prompt || q.id,
            h('input', { required: true, value: answers[task.id + q.id] || '', onChange: e => setAnswers({ ...answers, [task.id + q.id]: e.target.value }) }))),
          h('button', { type: 'submit' }, '提交答复')),
          task.status === 'WAITING_APPROVAL' && !task.pending && h('button', { onClick: () => taskAction('approve', task.id) }, '确认执行'),
          !['SUCCEEDED','FAILED','CANCELLED'].includes(task.status) && h('button', { onClick: () => taskAction('cancel', task.id) }, '取消任务'))))
    }

    function Panel({ workspaceId, feature, draft }) {
      const { value, error: loadError } = useProject(workspaceId)
      const [entry, setEntry] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [error, setError] = React.useState('')
      const [reading, setReading] = React.useState()
      const [selectedPapers, setSelectedPapers] = React.useState([])
      const [experiments, showExperiments] = React.useState(false)
      const run = async action => {
        if (busy) return
        setBusy(true); setError('')
        try { await action(); window.dispatchEvent(new Event(updated)) }
        catch (err) { setError(err.message) } finally { setBusy(false) }
      }
      if (!value?.rails) return h('div', { className: 'lw-panel', role: loadError ? 'alert' : 'status' }, loadError || '正在读取项目…')
      const label = value.labels[feature]
      const items = value.rails[feature] || []
      const papers = feature === 'library' ? items.filter(item => item.kind === 'pdf' || /\.pdf$/i.test(item.path || item.text)) : []
      const action = (name, args) => project(workspaceId, name, args)
      const read = (id, page = 1) => run(async () => setReading({ id, ...await action('read', { id, page }) }))
      const fields = { ideas: '新点子', goals: '新目标', feed: '订阅关键词', library: '资源链接' }
      const save = () => run(async () => {
        if (feature === 'library') await action('link', { url: entry })
        else if (feature === 'feed') await action('topic', { topic: entry })
        else await action(feature === 'ideas' ? 'idea_create' : 'goal_create', { text: entry })
        setEntry('')
      })
      const importFile = file => run(async () => {
        if (!file || !file.size || file.size > 25 * 1024 * 1024) throw Error('请选择 25 MiB 以内的文件。')
        const data = await new Promise((resolve, reject) => {
          const reader = new FileReader()
          reader.onload = () => resolve(reader.result.split(',')[1])
          reader.onerror = reject
          reader.readAsDataURL(file)
        })
        await action('upload', { name: file.name, data })
      })
      return h('section', { className: 'lw-panel', 'aria-label': label },
        h('form', { className: 'lw-form lw-entry', onSubmit: e => { e.preventDefault(); save() } },
          h('label', null, fields[feature], h('input', { required: true, value: entry, type: feature === 'library' ? 'url' : 'text',
            placeholder: feature === 'feed' ? value.topic : undefined, onChange: e => setEntry(e.target.value) })),
          h('button', { type: 'submit', disabled: busy || !entry.trim() }, feature === 'feed' ? '保存订阅' : '添加')),
        feature === 'feed' && h('button', { disabled: busy || !value.topic, onClick: () => run(() => action('refresh_feed')) }, '刷新动态'),
        feature === 'library' && h('div', { className: 'lw-form' },
          h('label', null, '导入文件', h('input', { type: 'file', disabled: busy, onChange: e => { const file = e.target.files[0]; e.target.value = ''; if (file) importFile(file) } })),
          h('button', { disabled: busy || !entry.trim(), onClick: () => run(async () => { await action('clone', { url: entry }); setEntry('') }) }, '将此链接作为 Git 仓库导入')),
        papers.length > 1 && h('details', null, h('summary', null, '论文对比'),
          papers.map(paper => h('label', { key: paper.id, style: { display: 'block' } },
            h('input', { type: 'checkbox', style: { width: 'auto' }, checked: selectedPapers.includes(paper.id),
              onChange: e => setSelectedPapers(e.target.checked ? [...selectedPapers, paper.id] : selectedPapers.filter(id => id !== paper.id)) }), paper.text)),
          h('button', { disabled: papers.filter(p => selectedPapers.includes(p.id)).length < 2, onClick: () => run(() => {
            const sources = papers.filter(p => selectedPapers.includes(p.id)).map(p => p.id + ' ' + p.text).join('\n')
            draft(value.scope, '请用 labweave_paper_read 逐页比较以下项目论文的研究问题、方法、数据、指标和局限。给出资源 ID 与页码，标出无法核实的内容。\n' + sources)
          }) }, '在项目聊天中对比')),
        error && h('p', { role: 'alert' }, error), busy && h('p', { role: 'status' }, '正在处理…'),
        h('ul', null, items.map(item => h('li', { key: item.id },
          feature === 'goals' && h('input', { style: { width: 'auto' }, type: 'checkbox', checked: !!item.done, disabled: busy,
            'aria-label': '完成 ' + item.text, onChange: e => run(() => action('goal_update', { id: item.id, done: e.target.checked })) }),
          item.url && /^https?:\/\//i.test(item.url) ? h('a', { href: item.url, target: '_blank', rel: 'noreferrer' }, item.text) : item.text,
          feature === 'library' && (item.path || item.url?.startsWith('/api/workspace/pdf/')) &&
            h('button', { onClick: () => read(item.id) }, '阅读')))),
        reading && h('section', { 'aria-label': '资源内容' }, h('pre', null, reading.text || reading.files?.join('\n')),
          reading.pages && h('div', { className: 'lw-actions' },
            h('button', { disabled: busy || reading.page <= 1, onClick: () => read(reading.id, reading.page - 1) }, '上一页'),
            h('span', null, reading.page, ' / ', reading.pages),
            h('button', { disabled: busy || reading.page >= reading.pages, onClick: () => read(reading.id, reading.page + 1) }, '下一页'))),
        !items.length && h('p', { className: 'lw-hint' }, '还没有条目。'),
        feature === 'goals' && h('details', { onToggle: e => showExperiments(e.currentTarget.open) }, h('summary', null, '实验与证据'),
          experiments && h(WorkflowList, { key: workspaceId, workspaceId, run })))
    }

    const paths = {
      folder: 'M2.5 5.5h6l2 2h11v11.5H2.5z', chat: 'M4 4.5h16v12H10l-5.5 4V16H4z',
      feed: 'M3 13h4l3-7 4 12 3-7h4', ideas: 'M9 16c0-2-3-3-3-7a6 6 0 0 1 12 0c0 4-3 5-3 7z M10 20h4',
      goals: 'M5 21V3m1 1h13l-2.5 4L19 12H6', library: 'M3 5h4v14H3z M10 5h4v14h-4z M16 6l3-1 3 13-3 1z',
      plugin: 'M5 5h5a2.5 2.5 0 1 1 5 0h4v5a2.5 2.5 0 1 0 0 5v4H5z', plus: 'M12 5v14 M5 12h14',
      down: 'M6 9l6 6 6-6', right: 'M9 6l6 6-6 6', search: 'M16 16l4.5 4.5 M18 10a7 7 0 1 1-14 0 7 7 0 0 1 14 0z',
      edit: 'M4 16l11-11 4 4-11 11-5 1z M13 7l4 4',
    }
    function Icon({ name }) {
      return h('svg', { className: 'lw-icon', viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor',
        strokeWidth: 1.65, strokeLinecap: 'round', strokeLinejoin: 'round', 'aria-hidden': true }, h('path', { d: paths[name] }))
    }
    function useStore(source) {
      return React.useSyncExternalStore(fn => source.subscribe(fn), () => source.getSnapshot())
    }
    function sessionsFor(workspaceId, catalog, sessions) {
      const member = catalog.items.find(item => item.workspaceId === workspaceId)
      const archived = new Set(catalog.archivedSessionIds)
      return (member?.sessionIds || []).filter(id => !archived.has(id)).map(id => sessions.byId[id]).filter(Boolean)
        .filter(row => row.origin !== 'subagent').sort((a, b) => b.updatedAt - a.updatedAt)
    }
    const chatTitle = s => s.title?.trim() || (s.blank ? '新对话' : '未命名对话')

    function install(ctx) {
      let rows = []
      let disposed = false
      let revision = 0, choice, nameStrings, initialNavigation = false
      try { choice = JSON.parse(sessionStorage.getItem(selectionKey)) } catch {}
      const changed = () => { revision++; window.dispatchEvent(new Event(navEvent)) }
      const useNav = () => React.useSyncExternalStore(fn => {
        window.addEventListener(navEvent, fn); return () => window.removeEventListener(navEvent, fn)
      }, () => revision)
      const globalRow = () => rows.find(r => r.scope === 'global')
      const refresh = async () => {
        const value = await api('catalog')
        if (!disposed && JSON.stringify(rows) !== JSON.stringify(value)) {
          const oldName = globalRow()?.name
          rows = value
          const name = globalRow()?.name
          if (name && name !== oldName) {
            nameStrings?.()
            nameStrings = ctx.locale.register('labweave.assistant', { zh: { name }, en: { name } })
          }
          changed()
        }
        return value
      }
      const notice = msg => window.dispatchEvent(new CustomEvent('labweave:notice', { detail: msg }))
      const ready = refresh().catch(err => { notice(err.message); return [] })
      function wrap(object, key, implementation) {
        const original = object[key]
        const replacement = function (...args) { return implementation.call(this, original.bind(this), ...args) }
        object[key] = replacement
        return () => { if (object[key] === replacement) object[key] = original }
      }
      const nav = ctx.uiWorkspace
      const currentSession = () => Object.values(ctx.sessions.list.getSnapshot().byId).find(s => s.retainedBy.mainView > 0)
      const currentRow = () => {
        const current = currentSession()
        const native = current && ctx.workspaces.list.getSnapshot().items.find(w => w.sessionIds.includes(current.id))
        return native && rows.find(r => r.workspaceId === native.workspaceId)
      }
      function selectPage(workspaceId, feature) {
        if (!rows.some(r => r.workspaceId === workspaceId && r.scope !== 'global') || !features[feature]) return
        choice = { workspaceId, feature }
        sessionStorage.setItem(selectionKey, JSON.stringify(choice))
        ctx.layout.selectPanel(pageKey)
        changed()
      }
      function forgetPage() { sessionStorage.removeItem(selectionKey) }
      function openChat(id) { forgetPage(); nav.openSession(id); changed() }
      function draft(scope, prompt) {
        const row = rows.find(r => r.scope === scope)
        if (!row) throw Error('项目工作区未连接。')
        forgetPage()
        nav.startSession(row.workspaceId, { prompt, whenDraftExists: 'append' })
      }
      let generation = 0
      ctx.effect(() => wrap(nav, 'startSession', (start, id, options) => {
        const turn = ++generation
        if (id !== undefined) return start(id, options)
        const openGlobal = () => {
          const global = rows.find(r => r.scope === 'global')
          if (disposed || turn !== generation) return
          if (!global) { notice('无法打开全局助手，请重新连接科研服务。'); return }
          forgetPage()
          const last = sessionsFor(global.workspaceId, ctx.workspaces.list.getSnapshot(), ctx.sessions.list.getSnapshot())[0]
          if (!options && last) openChat(last.id)
          else start(global.workspaceId, options)
        }
        if (rows.length) openGlobal()
        else ready.then(() => rows.length ? openGlobal() : refresh().then(openGlobal)).catch(err => notice(err.message))
      }), 'LabWeave global new session')
      ctx.effect(() => wrap(ctx.workspaces, 'rename', async (rename, id, title) => {
        if (!rows.some(r => r.workspaceId === id)) return rename(id, title)
        await api('rename', { workspaceId: id, name: title })
        await refresh()
        window.dispatchEvent(new Event(nameChanged)); window.dispatchEvent(new Event(updated))
        return ctx.workspaces.list.getSnapshot().items.find(r => r.workspaceId === id)
      }), 'LabWeave workspace names')
      ctx.effect(() => wrap(ctx.workspaces, 'delete', async (remove, id) => {
        const known = await refresh()
        if (known.find(r => r.workspaceId === id)?.scope === 'global') throw Error('全局助手保留所有全局对话。可在侧栏归档单个会话。')
        return remove(id)
      }), 'LabWeave global workspace lifetime')
      // Pinned rc.2 translators are cached closures over translate(). Override only
      // the workspace labels for Chinese and English and keep all other dictionaries.
      if (typeof ctx.locale.translate === 'function') ctx.effect(() => wrap(ctx.locale, 'translate', (original, ns, key, params) => {
        const originalText = original(ns, key, params)
        if (key === 'brand.localBuild') return 'leaweave'
        if (ns === 'sidebar' && (key === 'session.new' || key === 'session.new.label')) return globalRow()?.name || 'goat'
        if (ns === 'conversation') {
          if (key === 'workspace.defaultName') return globalRow()?.name || 'goat'
          if (!['hero.headline', 'hero.preview', 'placeholder.hero'].includes(key)) return originalText
          const room = currentRow()
          if (key === 'hero.headline') return room?.scope === 'global' || !room ? (globalRow()?.name || 'goat') : room.name
          if (key === 'hero.preview') return ''
          if (key === 'placeholder.hero' && /[\u3400-\u9fff]/.test(originalText)) return room?.scope === 'global' || !room
            ? '和助手聊聊你的研究…' : '在这个项目里继续讨论…'
        }
        if (!['workspace', 'schedule.manager'].includes(ns)) return originalText
        const cn = /[\u3400-\u9fff]/.test(originalText)
        if (key === 'workspace.defaultName' || key === 'host.defaultProject') return rows.find(r => r.scope === 'global')?.name || originalText
        if (key === 'section.workspaces' && (cn || originalText === 'Workspaces')) return cn ? '科研项目' : 'Research projects'
        if (key === 'workspace.add' && (cn || /^add workspace$/i.test(originalText))) return cn ? '创建科研项目' : 'Create research project'
        return originalText
      }), 'LabWeave project labels')
      ctx.effect(() => {
        const style = document.createElement('style'); style.textContent = styles; document.head.appendChild(style)
        const names = () => { refresh().catch(err => notice(err.message)) }
        window.addEventListener(nameChanged, names)
        let updateTimer, catalogTimer
        const offSessions = ctx.sessions.list.subscribe(() => {
          clearTimeout(updateTimer)
          updateTimer = setTimeout(() => window.dispatchEvent(new Event(updated)), 300)
        })
        const offWorkspaces = ctx.workspaces.list.subscribe(() => {
          clearTimeout(catalogTimer)
          catalogTimer = setTimeout(names, 350)
        })
        // The bundled DSH build also writes its compiled product title when a session changes.
        const brandTitle = () => {
          const title = document.title
          const branded = title.replace(/(^| — )DeepSeek Harness$/, '$1leaweave')
          if (title !== branded) document.title = branded
        }
        const titleObserver = new MutationObserver(brandTitle)
        titleObserver.observe(document.head.querySelector('title'), { subtree: true, childList: true, characterData: true })
        brandTitle()
        return () => {
          disposed = true; nameStrings?.(); titleObserver.disconnect(); style.remove(); window.removeEventListener(nameChanged, names)
          offSessions(); offWorkspaces(); clearTimeout(updateTimer); clearTimeout(catalogTimer)
        }
      }, 'LabWeave appearance')
      const slot = (name, options, component) => ctx.slots.inject(name, () => ctx.slots.register({ name, ...options }, component))
      const BrandMark = ({ size }) => h('img', {
        src: './labweave-orbit.svg', alt: '', 'aria-hidden': true, draggable: false,
        width: size, height: size, className: 'lw-brand-mark',
      })
      slot('sidebar.brand.mark', { priority: -30 }, BrandMark)
      slot('conversation.hero.brand.mark', { priority: -30 }, BrandMark)
      slot('conversation.hero.frame', { id: 'pixel-whale', priority: -30 }, ({ children }) => children)
      // Presets still compose the Agent at creation. Only the two conversation controls are replaced.
      slot('conversation.hero.agentPreset', { priority: -30 }, () => null)
      slot('conversation.session.header.actions', { id: 'agent-preset', priority: -30, order: -10 }, () => null)
      const picker = props => props.open ? h(ProjectForm, { ...props, refresh }) : null
      slot('conversation.hero.workspace.directoryFlow', { priority: -20 }, picker)
      slot('sidebar.brand.name', { priority: -30 }, () => {
        const rev = useNav(), ref = React.useRef(null)
        React.useLayoutEffect(() => { ref.current?.closest('button')?.setAttribute('aria-label', 'leaweave 首页') }, [rev])
        return h('span', { ref, className: 'lw-wordmark' }, 'leaweave')
      })

      const tool = (name, label, onClick) => h('button', { type: 'button', className: 'lw-tool',
        'aria-label': label, title: label, onClick }, h(Icon, { name }))
      function closeDrawer() {
        if (document.querySelector('[data-sidebar-drawer]:not([data-sidebar-collapsed])')) ctx.layout.toggleSidebar()
      }
      function openPage(row, feature) { selectPage(row.workspaceId, feature); closeDrawer() }
      function startProjectChat(row) { forgetPage(); nav.startSession(row.workspaceId); closeDrawer() }
      function jump(id) { openChat(id); closeDrawer() }
      function ProjectBranch({ row, sessions, activePage, current, filter }) {
        const { value, error } = useProject(row.workspaceId, 'navigation')
        const [chatsOpen, setChatsOpen] = React.useState(true)
        const labels = value?.labels || features
        const matches = sessions.filter(s => !filter || chatTitle(s).toLocaleLowerCase().includes(filter))
        const entry = (id, text, icon, click, active) => h('button', { type: 'button', className: 'lw-row-main',
          'aria-current': active ? 'page' : undefined, onClick: click }, h(Icon, { name: icon }), h('span', null, text))
        return h('nav', { className: 'lw-tier', 'aria-label': row.name + ' 项目功能' },
          Object.keys(features).map(id => h(React.Fragment, { key: id },
            h('div', { className: 'lw-row' }, entry(id, labels[id], id, () => {
              if (id === 'chat') setChatsOpen(true)
              openPage(row, id)
            }, activePage === id || (id === 'chat' && !!current)),
            id === 'chat' && tool(chatsOpen ? 'down' : 'right', chatsOpen ? '收起项目对话' : '展开项目对话', () => setChatsOpen(!chatsOpen))),
            id === 'chat' && chatsOpen && matches.length > 0 && h('div', { className: 'lw-sessions', 'aria-label': row.name + ' 对话' },
              matches.map(s => h('div', { className: 'lw-row', key: s.id },
                h('button', { className: 'lw-row-main', 'aria-current': current === s.id ? 'page' : undefined,
                  onClick: () => jump(s.id) }, h('span', null, chatTitle(s)))))))),
          value?.plugins.map(p => h('div', { className: 'lw-row', key: p.id },
            entry(p.id, p.name, 'plugin', () => { draft(row.scope, p.prompt); closeDrawer() }))),
          error && h('small', { role: 'alert' }, error))
      }
      function ResearchTree({ wide, expandSidebar }) {
        useNav()
        const workspace = useStore(ctx.workspaces.list), sessions = useStore(ctx.sessions.list), panel = useStore(ctx.layout.panelInfo)
        const [expanded, setExpanded] = React.useState({})
        const [filter, setFilter] = React.useState(null)
        const [dialog, setDialog] = React.useState()
        const [rename, setRename] = React.useState('')
        const [err, setErr] = React.useState('')
        const current = Object.values(sessions.byId).find(s => s.retainedBy.mainView > 0)
        const selected = panel.activePanelId === pageKey ? choice : null
        React.useEffect(() => {
          if (initialNavigation || !globalRow() || sessions.phase !== 'ready' || workspace.phase !== 'ready') return
          initialNavigation = true
          if (choice && sessionStorage.getItem(selectionKey) && rows.some(r => r.workspaceId === choice.workspaceId))
            return selectPage(choice.workspaceId, choice.feature)
          if (!current && !panel.activePanelId) nav.startSession()
        }, [revision, sessions.phase, workspace.phase, current, panel.activePanelId])
        React.useEffect(() => {
          if (selected?.workspaceId) setExpanded(prev => ({ ...prev, [selected.workspaceId]: true }))
        }, [selected?.workspaceId])
        const q = filter?.trim().toLocaleLowerCase() || ''
        function close() { setDialog(undefined); setErr('') }
        function created(row) { close(); setExpanded(prev => ({ ...prev, [row.workspaceId]: true })); openPage(row, 'chat') }
        if (!wide) return h('div', { className: 'lw-tree' }, tool('folder', '展开科研项目', expandSidebar))
        return h('section', { className: 'lw-tree', 'aria-label': '科研项目' },
          h('header', { className: 'lw-tree-head' }, h('span', null, '科研项目'),
            tool('search', '搜索科研项目和对话', () => setFilter(filter === null ? '' : null)),
            tool('plus', '创建科研项目', () => setDialog({ type: 'create' }))),
          filter !== null && h('label', { className: 'lw-query' }, h('input', { type: 'search', autoFocus: true,
            'aria-label': '搜索项目和对话', placeholder: '搜索项目和对话', value: filter, onChange: e => setFilter(e.target.value) })),
          rows.filter(r => r.scope !== 'global').map(row => {
            const id = row.workspaceId, members = sessionsFor(id, workspace, sessions)
            const inside = !panel.activePanelId && members.some(s => s.id === current?.id)
            const matchesName = row.name.toLocaleLowerCase().includes(q)
            if (!matchesName && !members.some(s => chatTitle(s).toLocaleLowerCase().includes(q))) return null
            const open = q ? true : (expanded[id] ?? (choice?.workspaceId === id || inside))
            return h('div', { key: id }, h('div', { className: 'lw-row' },
              h('button', { className: 'lw-row-main', type: 'button', 'aria-expanded': !!open,
                onClick: () => setExpanded(prev => ({ ...prev, [id]: !open })) },
                h(Icon, { name: open ? 'down' : 'right' }), h(Icon, { name: 'folder' }), h('span', null, row.name)),
              open && tool('edit', '重命名' + row.name, () => { setRename(row.name); setDialog({ type: 'rename', row }) })),
              open && h(ProjectBranch, { row, sessions: members, activePage: selected?.workspaceId === id && selected.feature,
                current: inside && current.id, filter: matchesName ? '' : q }))
          }),
          !rows.some(r => r.scope !== 'global') && h('small', null, '用上方的 + 创建第一个项目。'),
          dialog?.type === 'create' && h(ProjectForm, { refresh, onCreated: created, onCancel: close }),
          dialog?.type === 'rename' && h(Dialog, { title: '重命名项目', close }, h('form', { className: 'lw-form',
            onSubmit: async e => { e.preventDefault(); try { await ctx.workspaces.rename(dialog.row.workspaceId, rename); close() }
              catch (error) { setErr(error.message) } } }, h('label', null, '项目名称', h('input', { required: true, autoFocus: true,
              value: rename, maxLength: 80, onChange: e => setRename(e.target.value) })), err && h('p', { role: 'alert' }, err),
            h('div', { className: 'lw-actions' }, h('button', { type: 'submit' }, '保存'), h('button', { type: 'button', onClick: close }, '取消')))))
      }
      slot('sidebar.workspaces', { priority: -25 }, ResearchTree)

      function ChatList({ row, workspace, sessions }) {
        const items = sessionsFor(row.workspaceId, workspace, sessions)
        return items.length ? h('ul', { className: 'lw-chats', 'aria-label': row.name + ' 的对话列表' },
          items.map(s => h('li', { key: s.id }, h('button', { onClick: () => jump(s.id) }, h(Icon, { name: 'chat' }),
            chatTitle(s), s.updatedAt > 0 && h('time', null, new Date(s.updatedAt).toLocaleDateString())))))
          : h('p', { className: 'lw-hint' }, '这个项目还没有对话。')
      }
      function ProjectPage({ row, feature }) {
        const { value } = useProject(row.workspaceId, 'navigation')
        const workspace = useStore(ctx.workspaces.list), sessions = useStore(ctx.sessions.list)
        const title = value?.labels[feature] || features[feature]
        return h('main', { className: 'lw-page', 'aria-label': row.name + ' · ' + title },
          h('div', { className: 'lw-page-inner' }, h('header', { className: 'lw-page-head' },
            h('div', null, h('small', null, row.name), h('h1', null, title)),
            feature === 'chat' && h('button', { onClick: () => startProjectChat(row) }, '新建项目对话')),
          feature === 'chat' ? h(ChatList, { row, workspace, sessions }) : h(Panel, { workspaceId: row.workspaceId, feature, draft })))
      }
      slot('main', { key: pageKey }, () => {
        useNav()
        const row = rows.find(r => r.workspaceId === choice?.workspaceId && r.scope !== 'global')
        return row && features[choice.feature] ? h(ProjectPage, { key: row.workspaceId + choice.feature, row, feature: choice.feature })
          : h('p', { className: 'lw-hint', role: 'status' }, '请从侧栏选择科研项目。')
      })
      slot('conversation.input.dock', { id: 'labweave-assistant-starters', order: -20, inject: sessionId => ({ sessionId }) }, ({ sessionId }) => {
        useNav()
        const workspace = useStore(ctx.workspaces.list)
        const global = globalRow()
        if (!global || !workspace.items.find(w => w.workspaceId === global.workspaceId)?.sessionIds.includes(sessionId)) return null
        return h('div', { className: 'lw-starters', 'aria-label': '全局助手建议' },
          [['梳理研究方向', '和我一起梳理一个值得研究的问题。'], ['查看项目进展', '请总结我的科研项目进展和待确认的事项。'],
            ['规划下一步', '根据我的项目目标，帮我规划接下来优先做的事。']].map(([label, prompt]) =>
            h('button', { key: label, onClick: () => draft('global', prompt) }, label)))
      })
      slot('conversation.session.header.utilities', { id: 'labweave-global-history', order: -15, inject: sessionId => ({ sessionId }) }, ({ sessionId }) => {
        useNav()
        const workspace = useStore(ctx.workspaces.list), sessions = useStore(ctx.sessions.list)
        const [open, setOpen] = React.useState(false)
        const row = globalRow(), members = row && sessionsFor(row.workspaceId, workspace, sessions)
        if (!members?.some(s => s.id === sessionId)) return null
        return h('div', { className: 'lw-history' }, h('button', { onClick: () => setOpen(true) }, '助手对话'),
          open && h(Dialog, { title: '助手对话', close: () => setOpen(false) },
            h('button', { onClick: () => { setOpen(false); startProjectChat(row) } }, '开始新对话'),
            h('ul', { className: 'lw-chats' }, members.map(s => h('li', { key: s.id }, h('button', { onClick: () => { setOpen(false); jump(s.id) } }, chatTitle(s)))))))
      })
      slot('sidebar.panellist.actions', { id: 'labweave-create-plugin', order: 20 }, ({ onDismiss }) =>
        h('button', { type: 'button', role: 'menuitem', className: 'lw-more', onClick: () => { onDismiss(); window.dispatchEvent(new Event(manage)) } }, '创建项目插件'))
      slot('shell.overlay', { id: 'labweave-plugins' }, function Overlay() {
        const [options, setOptions] = React.useState(null)
        const [error, setError] = React.useState('')
        React.useEffect(() => {
          const open = () => refresh().then(setOptions).catch(err => setError(err.message))
          const report = e => setError(e.detail)
          window.addEventListener(manage, open); window.addEventListener('labweave:notice', report)
          return () => { window.removeEventListener(manage, open); window.removeEventListener('labweave:notice', report) }
        }, [])
        if (error) return h(Dialog, { title: '科研工作区', close: () => setError('') }, h('p', { role: 'alert' }, error),
          h('button', { onClick: () => setError('') }, '关闭'))
        return options && h(PluginForm, { rows: options, close: () => setOptions(null) })
      })
    }
    return { inject: ['slots', 'uiWorkspace', 'workspaces', 'sessions', 'layout', 'locale'], apply: install }
  },
})
