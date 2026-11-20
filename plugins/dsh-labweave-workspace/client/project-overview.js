const modules = [
  { key: 'mindmap', action: '看研究路线', title: '研究路线', empty: '暂无路线', icon: 'mindmap' },
  { key: 'notes', action: '读写笔记', title: '最近笔记', empty: '暂无笔记', icon: 'library' },
  { key: 'goals', action: '排待办', title: '待办', empty: '暂无待办', icon: 'goals' },
  { key: 'ideas', action: '看点子', title: '点子', empty: '暂无点子', icon: 'ideas' },
  { key: 'engineering', action: '看代码与运行', title: '最近运行', empty: '暂无运行', icon: 'activity' },
]
const recentFirst = (a, b) => String(b.date || '').localeCompare(String(a.date || ''))

export function createProjectOverview(React, { Btn, Icon, Markdown, headline, fmtDateTime }) {
  const h = React.createElement
  return function ProjectOverview({ value, openBot, openRecord, openChat, createBot }) {
    const bots = value.features.filter(bot => !bot.archived && bot.id !== 'chat')
    const areaOf = bot => bot.extension?.base || bot.paradigm
    const records = bots.flatMap(bot => (value.rails[bot.id] || []).filter(item => !item.planningDraft && item.kind !== 'note-folder')
      .map(item => ({ item, featureId: bot.id, bot: bot.label, area: areaOf(bot), title: headline(item), date: item.updatedAt || item.ts })))
    const next = records.filter(row => row.area === 'goals' && !row.item.done).sort((a, b) =>
      (a.item.plannedDate || a.item.due || '9999').localeCompare(b.item.plannedDate || b.item.due || '9999') || recentFirst(a, b))
    const goals = records.filter(row => row.area === 'goals')
    const done = goals.filter(row => row.item.done).length
    const completedGoals = new Set(goals.filter(row => row.item.done).map(row => row.featureId + ':' + row.item.id))
    const nextReady = next.find(row => !Array.isArray(row.item.dependsOn) ||
      row.item.dependsOn.every(id => completedGoals.has(row.featureId + ':' + id)))
    const routes = records.filter(row => row.area === 'mindmap' && ['route', 'topic', undefined].includes(row.item.kind))
    const notes = records.filter(row => row.area === 'notes' && (row.item.kind === 'note' || !row.item.kind))
    const ideas = records.filter(row => row.area === 'ideas' && row.item.ideaState !== 'deferred')
    const runs = (value.recentRuns || []).map(run => ({ featureId: run.featureId, runId: run.id, area: 'engineering',
      title: run.title, date: run.created, context: { completed: '已完成', failed: '失败', running: '运行中', planned: '待运行' }[run.status] }))
    const runAction = ['已完成', '失败'].includes(runs[0]?.context) ? '看运行结果' : '看最近运行'
    const byArea = { goals: next, mindmap: routes.sort(recentFirst), notes: notes.sort(recentFirst), ideas: ideas.sort(recentFirst), engineering: runs }
    const workspaces = modules.map(module => ({
      ...module, matching: bots.filter(bot => areaOf(bot) === module.key && !bot.clusterParent),
    })).filter(module => module.matching.length || byArea[module.key].length)
    const goalBots = workspaces.find(module => module.key === 'goals')?.matching || []
    const goalDestination = nextReady?.featureId || (goalBots.length === 1 ? goalBots[0].id : null)
    const activity = [...records.filter(row => !row.item.experimentRun && row.date), ...runs].sort(recentFirst).slice(0, 7)
    const drafts = bots.filter(bot => areaOf(bot) === 'goals').reduce((total, bot) =>
      total + (value.rails[bot.id] || []).filter(item => item.planningDraft).length, 0)
    const project = value.confirmedResearch || {}
    const paperIdentities = new Set([
      ...(value.rails.library || []).filter(entry => entry.kind === 'paper').map(entry => entry.url || entry.id),
      ...records.filter(row => row.area === 'mindmap' && row.item.kind === 'paper').map(row => row.item.url || row.item.id),
    ])
    const keyOf = row => row.featureId + ':' + (row.runId || row.item.id)
    const go = row => openRecord(row.runId ? { featureId: row.featureId, runId: row.runId } : { featureId: row.featureId, id: row.item.id })
    const link = row => Btn({ variant: 'ghost', size: 'xs', title: row.title, onClick: () => go(row) }, row.title)
    const chat = Btn({ variant: bots.length ? 'secondary' : 'primary', size: 'sm', onClick: openChat },
      h(Icon, { name: 'chat' }), '打开项目聊天')
    return h('section', { className: 'lw-project-overview', 'aria-label': '项目进度与活动' },
      h('header', { className: 'lw-overview-header' },
        h('div', null,
          project.stage && h('p', { className: 'lw-overview-stage' }, project.stage),
          h('h1', null, value.name),
          (project.question || value.topic) && h('p', { className: 'lw-overview-topic' }, project.question || value.topic),
          value.description && h('details', { className: 'lw-record-picker' }, h('summary', null, '项目简介'),
            h(Markdown, { source: value.description }))),
        bots.length > 0 && chat),
      !bots.length && h('section', { className: 'lw-overview-next', 'aria-label': '开始项目' },
        h('div', null, h('h2', null, '你想做什么？'),
          h('p', { className: 'lw-hint' }, '在项目聊天里说说研究主题，或者直接创建一个 Bot 开始记录。')),
        h('span', { className: 'lw-actions' }, chat, Btn({ variant: 'secondary', size: 'sm', onClick: createBot }, '创建 Bot'))),
      (project.nextAction || nextReady) && h('section', { className: 'lw-overview-next', 'aria-label': '下一步' },
        h('div', null, h('h2', null, project.nextAction ? '已确认的下一步' : '下一项待办'),
          project.nextAction ? h(Markdown, { source: project.nextAction }) : h(React.Fragment, null,
            h('strong', null, nextReady.title),
            h('span', { className: 'lw-hint' }, nextReady.item.plannedDate || (nextReady.item.due ? '截止 ' + nextReady.item.due : '未排期')))),
        project.nextAction
          ? goalDestination && Btn({ variant: 'primary', size: 'sm', onClick: () => openBot(goalDestination) }, '查看待办')
          : Btn({ variant: 'primary', size: 'sm', onClick: () => go(nextReady) }, '打开这项待办')),
      workspaces.length > 0 && h('nav', { className: 'lw-overview-entry', 'aria-label': '工作入口' },
        workspaces.filter(module => module.matching.length).map(({ key, action, icon, matching }) =>
          matching.length === 1 ? Btn({ key, variant: 'secondary', title: matching[0].label,
            onClick: () => key === 'engineering' && runs.length ? go(runs[0]) : openBot(matching[0].id) },
            h(Icon, { name: icon }), key === 'engineering' && runs.length ? runAction : action)
            : h('details', { key, className: 'lw-overview-choice' },
              h('summary', null, h(Icon, { name: icon }), action),
              h('div', null, matching.map(bot => Btn({ key: bot.id, variant: 'ghost', size: 'xs', onClick: () => openBot(bot.id) }, bot.label)))))),
      h('div', { className: 'lw-overview-summary' },
        h('div', { className: 'lw-overview-progress' },
          h('h2', null, '目标进度'),
          goals.length ? h(React.Fragment, null, h('strong', null, done + ' / ' + goals.length),
            h('progress', { 'aria-label': '目标完成进度', value: done, max: goals.length }),
            drafts > 0 && h('span', { className: 'lw-hint' }, drafts + ' 条待确认'))
            : h('p', { className: 'lw-hint' }, drafts ? drafts + ' 条待确认' : '暂无目标')),
        h('div', { className: 'lw-overview-metric' }, h(Icon, { name: 'file' }),
          h('strong', null, paperIdentities.size), h('span', null, '文献')),
        h('div', { className: 'lw-overview-metric' }, h(Icon, { name: 'library' }),
          h('strong', null, notes.length), h('span', null, '笔记'))),
      workspaces.length > 0 && h('details', { className: 'lw-overview-records' }, h('summary', null, '项目记录'),
        h('div', { className: 'lw-overview-grid' }, workspaces.map(({ key, title, empty, icon }) =>
          h('article', { key, className: 'lw-overview-card', 'data-area': key, 'aria-label': title },
            h('header', null, h('span', null, h(Icon, { name: icon })), h('h2', null, title)),
            byArea[key].length ? h('ul', null, byArea[key].slice(0, 3).map(row => h('li', { key: keyOf(row) },
              link(row), (row.context || row.item?.plannedDate || row.item?.due) &&
              h('small', { className: 'lw-hint' }, row.context || row.item.plannedDate || '截止 ' + row.item.due))))
              : h('p', { className: 'lw-hint' }, empty))))),
      activity.length > 0 && h('details', { className: 'lw-overview-activity', 'aria-label': '项目活动' },
          h('summary', null, '最近活动'),
          h('ol', null, activity.map(row => h('li', { key: keyOf(row), 'data-area': row.area },
            h('small', { className: 'lw-hint' }, fmtDateTime(row.date) || ''),
            link(row), h('span', { className: 'lw-hint' }, row.bot || row.context || '工程台'))))))
  }
}
