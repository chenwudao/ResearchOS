export function createToolPane(React, project, ui = {}) {
  const {useEffect, useState} = React
  const h = React.createElement
  const Icon = ui.Icon || (() => null)

  function ToolStyles() {
    return h('style', null, `
      .lw-wsp{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font-size:var(--dsh-content-font-size-secondary,13px);line-height:1.55}
      .lw-wsp-head{box-sizing:border-box;display:flex;align-items:center;gap:2px;flex:none;height:38px;padding:0 6px 0 16px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
      .lw-wsp-head-text{flex:1;min-width:0;font-weight:500;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lw-wsp-head-meta{flex:none;margin-left:8px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;font-variant-numeric:tabular-nums}
      .lw-wsp-icon{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:6px;flex:none;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);cursor:pointer;line-height:1}
      .lw-wsp-icon:hover{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-wsp-icon:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-wsp-icon:disabled{opacity:.4;cursor:not-allowed}
      .lw-wsp-icon .lw-icon{width:15px;height:15px}
      .lw-wsp-body{flex:1;min-height:0;overflow:auto;padding:8px 0 24px;scrollbar-gutter:stable}
      .lw-wsp-note{margin:0;padding:3px 16px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;line-height:1.6;overflow-wrap:anywhere}
      .lw-wsp-error{margin:0;padding:6px 16px;color:var(--dsw-alias-state-error-primary,#dc2626);font-size:12px;line-height:1.6}
      .lw-wsp-empty{display:flex;flex-direction:column;align-items:center;gap:6px;padding:48px 24px;text-align:center;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-wsp-empty .lw-icon{width:28px;height:28px;opacity:.65}
      .lw-wsp-empty strong{font-size:var(--dsh-content-font-size-secondary,13px);font-weight:500;color:var(--dsw-alias-label-secondary,GrayText)}
      .lw-wsp-empty p{margin:0;font-size:12px;line-height:1.6;max-width:17rem}
      .lw-wsp-section{padding:6px 0 10px;border-top:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28))}
      .lw-wsp-section:first-child{border-top:0;padding-top:2px}
      .lw-wsp-section-head{display:flex;align-items:flex-start;gap:6px;padding:8px 8px 2px 16px}
      .lw-wsp-section-title{display:flex;align-items:center;gap:6px;flex:1;min-width:0;font-weight:500}
      .lw-wsp-section-title>.lw-icon{flex:none;width:15px;height:15px;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-wsp-section-name{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-wsp-actions{display:flex;align-items:center;gap:2px;flex:none;margin-top:-4px}
      .lw-wsp-pill{display:inline-flex;align-items:center;flex:none;max-width:100%;padding:1px 7px;border-radius:999px;background:var(--dsw-alias-interactive-bg-hover,rgba(38,49,72,.06));color:var(--dsw-alias-label-secondary,GrayText);font-size:11px;font-weight:500;line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
      .lw-wsp-pill[data-tone=ok]{background:color-mix(in srgb,var(--dsw-alias-state-success-primary,#16a34a) 11%,transparent);color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-wsp-pill[data-tone=warn]{background:var(--dsw-alias-state-warn-tertiary,color-mix(in srgb,var(--dsw-alias-state-warn-primary,#ca8a04) 13%,transparent));color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary,#ca8a04))}
      .lw-wsp-subhead{display:flex;align-items:center;justify-content:space-between;gap:8px;padding:8px 16px 2px;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px}
      .lw-wsp-list{display:grid;gap:0;margin:0;padding:0;list-style:none}
      .lw-wsp-row{display:flex;align-items:center;gap:8px;min-height:30px;margin:0 6px;padding:4px 10px;border-radius:var(--dsw-radius-md,8px);color:inherit}
      .lw-wsp-row:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
      .lw-wsp-row>.lw-icon{flex:none;width:14px;height:14px;color:var(--dsw-alias-label-tertiary,GrayText)}
      .lw-wsp-row-name{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
      .lw-wsp-row-meta{flex:none;color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;font-variant-numeric:tabular-nums}
      .lw-wsp-row-actions{display:flex;align-items:center;gap:2px;flex:none;margin-right:-4px;opacity:.55;transition:opacity .12s ease}
      .lw-wsp-row:hover .lw-wsp-row-actions,.lw-wsp-row:focus-within .lw-wsp-row-actions{opacity:1}
      @media (hover:none){.lw-wsp-row-actions{opacity:1}}
      .lw-wsp-row-actions .lw-wsp-icon{width:24px;height:24px;padding:5px}
      .lw-wsp-code{flex:none;min-width:22px;padding:0 5px;border-radius:4px;background:var(--dsw-alias-bg-layer-2,rgba(128,128,128,.1));color:var(--dsw-alias-label-secondary,GrayText);font-family:var(--dsw-font-mono,ui-monospace,monospace);font-size:11px;line-height:1.6;text-align:center}
      .lw-wsp-code[data-tone=ok]{color:var(--dsw-alias-state-success-primary,#16a34a)}
      .lw-wsp-code[data-tone=warn]{color:var(--dsw-alias-state-warn-label,var(--dsw-alias-state-warn-primary,#ca8a04))}
      .lw-wsp-code[data-tone=err]{color:var(--dsw-alias-state-error-primary,#dc2626)}
      .lw-wsp-details{margin:4px 6px 0}
      .lw-wsp-details>summary{cursor:pointer;padding:4px 10px;border-radius:var(--dsw-radius-md,8px);color:var(--dsw-alias-label-tertiary,GrayText);font-size:12px;list-style:none}
      .lw-wsp-details>summary::-webkit-details-marker{display:none}
      .lw-wsp-details>summary::before{content:'▸';display:inline-block;width:1em;color:var(--dsw-alias-label-dimmed,GrayText)}
      .lw-wsp-details[open]>summary::before{content:'▾'}
      .lw-wsp-details>summary:hover{color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.1))}
    `)
  }

  function IconButton({label, onClick, disabled}, children) {
    return h('button', {
      type: 'button', className: 'lw-wsp-icon', 'aria-label': label, title: label,
      disabled: Boolean(disabled), onClick,
    }, children)
  }

  function Empty({icon, title, children}) {
    return h('div', {className: 'lw-wsp-empty'},
      h(Icon, {name: icon}),
      h('strong', null, title),
      children ? h('p', null, children) : null)
  }

  function GitView({row}) {
    const [data, setData] = useState(null)
    const [error, setError] = useState('')
    const [busy, setBusy] = useState(false)
    async function load() {
      setBusy(true)
      setError('')
      try { setData(await project(row.workspaceId, 'tools/git')) }
      catch (err) { setError(err.message || '无法读取 Git 状态。') }
      finally { setBusy(false) }
    }
    useEffect(() => { load() }, [row.workspaceId])

    const repos = data?.repos || []
    const branchLabel = repo => {
      if (!repo.branch) return null
      return h('span', {className: 'lw-wsp-pill'}, repo.branch)
    }
    const codeTone = code => {
      const mark = String(code || '').trim().charAt(0)
      if (mark === 'A' || mark === '?') return 'ok'
      if (mark === 'D') return 'err'
      if (mark === 'M' || mark === 'R') return 'warn'
      return undefined
    }

    return h('div', {className: 'lw-wsp lw-wsp-git'},
      h(ToolStyles),
      h('div', {className: 'lw-wsp-head'},
        h('span', {className: 'lw-wsp-head-text'}, data ? repos.length + ' 个仓库' : '仓库与工作树'),
        IconButton({label: '刷新 Git 状态', onClick: load, disabled: busy}, h(Icon, {name: 'refresh'}))),
      h('div', {className: 'lw-wsp-body', 'aria-busy': busy ? 'true' : undefined},
        error ? h('p', {className: 'lw-wsp-error', role: 'alert'}, error) : null,
        !data && !error ? h('p', {className: 'lw-wsp-note', role: 'status'}, '正在读取仓库…') : null,
        data && !repos.length ? h(Empty, {icon: 'repo', title: '这个项目还没有 Git 仓库'},
          '在资源库导入 HTTPS 仓库后，仓库和工作树会显示在这里。') : null,
        repos.map(repo => h('section', {key: repo.id, className: 'lw-wsp-section'},
          h('div', {className: 'lw-wsp-section-head'},
            h('span', {className: 'lw-wsp-section-title'},
              h(Icon, {name: 'repo'}),
              h('span', {className: 'lw-wsp-section-name'}, repo.name),
              branchLabel(repo),
              h('span', {className: 'lw-wsp-pill', 'data-tone': repo.clean ? 'ok' : 'warn'},
                repo.clean ? '干净' : repo.files.length + ' 处变更'))),
          h('p', {className: 'lw-wsp-note'}, repo.path === '.' ? '项目目录' : repo.path,
            repo.ahead || repo.behind ? ` · 超前 ${repo.ahead} / 落后 ${repo.behind}` : ''),
          repo.remotes?.length ? h('p', {className: 'lw-wsp-note'},
            repo.remotes.map(remote => remote.name + ' ' + remote.url).join(' · ')) : null,
          repo.files?.length ? h(React.Fragment, null,
            h('div', {className: 'lw-wsp-subhead'}, h('span', null, '变更文件'), h('span', null, repo.files.length)),
            h('ul', {className: 'lw-wsp-list'}, repo.files.map((file, index) => h('li', {key: file.path + index, className: 'lw-wsp-row'},
              h('span', {className: 'lw-wsp-code', 'data-tone': codeTone(file.code)}, String(file.code || 'M').trim() || 'M'),
              h('span', {className: 'lw-wsp-row-name', title: file.path}, file.path))))) : null,
          repo.commits?.length ? h('details', {className: 'lw-wsp-details'},
            h('summary', null, '最近提交 ' + repo.commits.length),
            h('ul', {className: 'lw-wsp-list'}, repo.commits.map(commit => h('li', {key: commit.hash, className: 'lw-wsp-row'},
              h('span', {className: 'lw-wsp-code'}, commit.hash),
              h('span', {className: 'lw-wsp-row-name', title: commit.subject}, commit.subject),
              h('span', {className: 'lw-wsp-row-meta'}, commit.date))))) : null)))
    )
  }

  return function ToolPane({row}) {
    return h(GitView, {row})
  }
}
