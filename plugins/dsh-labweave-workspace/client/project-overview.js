const modules = [
  { key: 'goals', title: '接下来的待办', empty: '还没有待处理的目标。', icon: 'goals' },
  { key: 'mindmap', title: '研究路线', empty: '还没有研究主线。', icon: 'mindmap' },
  { key: 'notes', title: '最近笔记', empty: '还没有笔记。', icon: 'library' },
  { key: 'ideas', title: '研究灵感', empty: '还没有可探索的点子。', icon: 'ideas' },
  { key: 'engineering', title: '最近运行', empty: '还没有实验运行。', icon: 'activity' },
]
const recentFirst = (a, b) => String(b.date || '').localeCompare(String(a.date || ''))

export function createProjectOverview(React, { Btn, Icon, Markdown, headline, fmtDateTime }) {
  const h = React.createElement
  return function ProjectOverview({ value, openBot, openRecord, openChat }) {
    const bots = value.features.filter(bot => !bot.archived && bot.id !== 'chat')
    const areaOf = bot => bot.extension?.base || bot.paradigm
    const records = bots.flatMap(bot => (value.rails[bot.id] || []).filter(item => !item.planningDraft && item.kind !== 'note-folder')
      .map(item => ({ item, featureId: bot.id, bot: bot.label, area: areaOf(bot), title: headline(item), date: item.updatedAt || item.ts })))
    const next = records.filter(row => row.area === 'goals' && !row.item.done).sort((a, b) =>
      (a.item.plannedDate || a.item.due || '9999').localeCompare(b.item.plannedDate || b.item.due || '9999') || recentFirst(a, b))
    const goals = records.filter(row => row.area === 'goals')
    const done = goals.filter(row => row.item.done).length
    const routes = records.filter(row => row.area === 'mindmap' && ['route', 'topic', undefined].includes(row.item.kind))
    const notes = records.filter(row => row.area === 'notes' && (row.item.kind === 'note' || !row.item.kind))
    const ideas = records.filter(row => row.area === 'ideas' && row.item.ideaState !== 'deferred')
    const runs = (value.recentRuns || []).map(run => ({ featureId: run.featureId, runId: run.id, area: 'engineering',
      title: run.title, date: run.created, context: { completed: '已完成', failed: '失败', running: '运行中', planned: '待运行' }[run.status] }))
    const byArea = { goals: next, mindmap: routes.sort(recentFirst), notes: notes.sort(recentFirst), ideas: ideas.sort(recentFirst), engineering: runs }
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
    return h('section', { className: 'lw-project-overview', 'aria-label': '项目进度与活动' },
      h('header', { className: 'lw-overview-header' },
        h('div', null,
          project.stage && h('p', { className: 'lw-overview-stage' }, project.stage),
          h('h1', null, value.name),
          (project.question || value.topic) && h('p', { className: 'lw-overview-topic' }, project.question || value.topic),
          value.description && h(Markdown, { source: value.description })),
        Btn({ variant: 'primary', size: 'sm', onClick: openChat }, h(Icon, { name: 'chat' }), '打开项目聊天')),
      h('div', { className: 'lw-overview-summary' },
        h('div', { className: 'lw-overview-progress' },
          h('h2', null, '目标进度'),
          goals.length ? h(React.Fragment, null, h('strong', null, done + ' / ' + goals.length),
            h('progress', { 'aria-label': '目标完成进度', value: done, max: goals.length }),
            h('span', { className: 'lw-hint' }, '已完成' + (drafts ? ' · ' + drafts + ' 条待确认排期' : '')))
            : h('p', { className: 'lw-hint' }, drafts ? drafts + ' 条待确认排期' : '等待设置项目目标。')),
        h('div', { className: 'lw-overview-metric' }, h(Icon, { name: 'file' }),
          h('strong', null, paperIdentities.size), h('span', null, '文献')),
        h('div', { className: 'lw-overview-metric' }, h(Icon, { name: 'library' }),
          h('strong', null, notes.length), h('span', null, '笔记'))),
      project.nextAction && h('div', { className: 'lw-overview-next' }, h('strong', null, '已确认的下一步'),
        h(Markdown, { source: project.nextAction })),
      h('div', { className: 'lw-overview-body' },
        h('div', { className: 'lw-overview-grid' }, modules.map(({ key, title, empty, icon }) => {
          const matching = bots.filter(bot => areaOf(bot) === key && !bot.clusterParent)
          return h('article', { key, className: 'lw-overview-card', 'data-area': key, 'aria-label': title },
            h('header', null, h('span', null, h(Icon, { name: icon })), h('h2', null, title)),
            byArea[key].length ? h('ul', null, byArea[key].slice(0, 3).map(row => h('li', { key: keyOf(row) },
              link(row), (row.context || row.item?.plannedDate || row.item?.due) &&
              h('small', { className: 'lw-hint' }, row.context || row.item.plannedDate || '截止 ' + row.item.due))))
              : h('p', { className: 'lw-hint' }, empty),
            matching.length > 0 && h('div', { className: 'lw-overview-open' }, matching.slice(0, 3).map(bot =>
              Btn({ key: bot.id, size: 'xs', variant: 'ghost', onClick: () => openBot(bot.id) }, bot.label))))
        })),
        h('aside', { className: 'lw-overview-activity', 'aria-label': '项目活动' },
          h('h2', null, '最近活动'),
          activity.length ? h('ol', null, activity.map(row => h('li', { key: keyOf(row), 'data-area': row.area },
            h('small', { className: 'lw-hint' }, fmtDateTime(row.date) || ''),
            link(row), h('span', { className: 'lw-hint' }, row.bot || row.context || '工程台'))))
            : h('p', { className: 'lw-hint' }, '项目记录更新后会显示在这里。'))))
  }
}
