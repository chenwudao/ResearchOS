const weekdays = ['一', '二', '三', '四', '五', '六', '日']

function dateKey(day) {
  return [day.getFullYear(), String(day.getMonth() + 1).padStart(2, '0'),
    String(day.getDate()).padStart(2, '0')].join('-')
}

function dayAt(key) {
  return new Date(key + 'T12:00:00')
}

function addDays(day, amount) {
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() + amount, 12)
}

export function calendarPeriod(key, scale) {
  const day = dayAt(key)
  const year = day.getFullYear(), month = day.getMonth()
  const first = scale === '月' ? new Date(year, month, 1, 12) : day
  const start = scale === '日' ? day : addDays(first, -((first.getDay() + 6) % 7))
  const count = scale === '月' ? 42 : scale === '周' ? 7 : 1
  return {
    dates: Array.from({ length: count }, (_, index) => dateKey(addDays(start, index))),
    label: scale === '月' ? year + ' 年 ' + (month + 1) + ' 月'
      : scale === '日' ? key : dateKey(start) + ' 至 ' + dateKey(addDays(start, 6)),
  }
}

export function createGoalPlanner(React) {
  const h = React.createElement
  const validDate = value => typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)
  const planned = item => [item.plannedDate, item.due].find(validDate) || ''
  const itemTitle = item => item.title || item.text
  const btn = (label, props = {}) => h('button', { type: 'button', ...props }, label)

  return function GoalPlanner({ items, busy, openEntry, onSave, onMove, onToggle }) {
    const today = dateKey(new Date())
    const [selected, setSelected] = React.useState(today)
    const [scale, setScale] = React.useState('周')
    const [view, setView] = React.useState('日历')
    const [title, setTitle] = React.useState('')
    const [stage, setStage] = React.useState('')
    const [deadline, setDeadline] = React.useState('')
    const [filter, setFilter] = React.useState('选中日期')
    const [dropDay, setDropDay] = React.useState('')
    const [dragging, setDragging] = React.useState(null)
    const { dates, label } = calendarPeriod(selected, scale)
    const byDay = new Map()
    const stages = new Map()
    for (const item of items) {
      const date = planned(item)
      if (date) {
        if (!byDay.has(date)) byDay.set(date, [])
        byDay.get(date).push(item)
      }
      const name = item.category || '未分阶段'
      if (!stages.has(name)) stages.set(name, [])
      stages.get(name).push(item)
    }
    const overdue = items.filter(item => !item.done && validDate(item.due) && item.due < today)
    const unscheduled = items.filter(item => !planned(item) && !item.done)
    const visible = filter === '未排期' ? unscheduled : filter === '逾期' ? overdue : byDay.get(selected) || []
    const selectable = (name, active, select) => btn(name, { key: name, 'aria-pressed': active === name, onClick: () => select(name) })
    const movable = item => !busy && !item.canvasDraft
    function step(amount) {
      const current = dayAt(selected)
      const next = scale === '月' ? new Date(current.getFullYear(), current.getMonth() + amount, 1, 12)
        : addDays(current, amount * (scale === '周' ? 7 : 1))
      setSelected(dateKey(next))
    }
    const formSubmit = async event => {
      event.preventDefault()
      if (!title.trim() || busy) return
      if (await onSave({ text: title.trim(), plannedDate: filter === '未排期' ? null : selected,
        ...(stage.trim() && { category: stage.trim() }), ...(deadline && { due: deadline }) })) {
        setTitle('')
        setDeadline('')
      }
    }
    function row(item, compact = false) {
      const name = itemTitle(item)
      return h('div', { className: 'lw-goal-task', key: item.id, 'data-done': Boolean(item.done),
        draggable: movable(item), onDragStart: event => {
          event.dataTransfer.effectAllowed = 'move'
          event.dataTransfer.setData('text/plain', name)
          setDragging(item.id)
        }, onDragEnd: () => { setDragging(null); setDropDay('') } },
        !compact && h('input', { type: 'checkbox', checked: Boolean(item.done), disabled: !movable(item),
          'aria-label': '完成 ' + name, onChange: () => onToggle(item) }),
        btn(name, { onClick: () => openEntry(item), title: name }),
        item.canvasDraft && h('small', null, 'AI 草稿'),
        !compact && h('div', { className: 'lw-goal-task-dates' },
          h('label', null, '安排', h('input', { type: 'date', value: validDate(item.plannedDate) ? item.plannedDate : '', disabled: !movable(item),
            'aria-label': '安排日期 ' + name, onChange: event => onMove(item, event.target.value || null) })),
          item.due && h('small', null, '截止 ' + item.due)))
    }
    return h('section', { className: 'lw-goal-planner', 'aria-label': '目标日历与待办' },
      h('div', { className: 'lw-goal-stages', 'aria-label': '阶段进度' },
        [...stages].map(([name, list]) => {
          const done = list.filter(item => item.done).length
          return h('div', { key: name, className: 'lw-goal-stage' },
            h('span', null, name), h('progress', { value: done, max: list.length, 'aria-label': name + ' 完成进度' }),
            h('small', null, done + ' / ' + list.length))
        })),
      h('div', { className: 'lw-goal-toolbar' },
        h('div', { role: 'group', 'aria-label': '任务视图' }, ['日历', '看板', '时间线'].map(name => selectable(name, view, setView))),
        view === '日历' && h('div', { role: 'group', 'aria-label': '日历范围' }, ['月', '周', '日'].map(name => selectable(name, scale, setScale)))),
      h('div', { className: 'lw-goal-columns' },
        view === '日历' ? h('div', { className: 'lw-goal-calendar' },
          h('header', { className: 'lw-goal-toolbar' }, h('strong', null, label),
            h('div', null, btn('‹', { onClick: () => step(-1), 'aria-label': '上一' + scale }),
              btn('今天', { onClick: () => setSelected(today) }),
              btn('›', { onClick: () => step(1), 'aria-label': '下一' + scale }))),
          h('div', { className: 'lw-goal-days', 'data-scale': scale },
            scale !== '日' && weekdays.map(name => h('span', { key: name, className: 'lw-goal-weekday' }, name)),
            dates.map(key => h('div', { className: 'lw-goal-day', key, 'data-selected': key === selected,
              'data-outside': scale === '月' && key.slice(0, 7) !== selected.slice(0, 7), 'data-drop': dropDay === key,
              onDragOver: event => { if (dragging) { event.preventDefault(); setDropDay(key) } },
              onDragLeave: event => { if (!event.currentTarget.contains(event.relatedTarget)) setDropDay('') },
              onDrop: event => {
                event.preventDefault()
                const item = items.find(record => record.id === dragging)
                if (item && movable(item)) onMove(item, key)
                setDragging(null); setDropDay('')
              } },
              btn(String(Number(key.slice(-2))), { 'aria-label': key, 'aria-pressed': key === selected,
                'aria-current': key === today ? 'date' : undefined, onClick: () => { setSelected(key); setFilter('选中日期') } }),
              (byDay.get(key) || []).map(item => row(item, true))))))
        : h('div', { className: 'lw-goal-board', 'data-view': view },
          (view === '看板' ? [['待办', items.filter(item => !item.done)], ['已完成', items.filter(item => item.done)]]
            : [...byDay].sort(([left], [right]) => left.localeCompare(right)).concat([['未排期', items.filter(item => !planned(item))]]))
            .map(([name, list]) => h('section', { key: name }, h('h3', null, name),
              list.length ? list.map(item => row(item)) : h('p', { className: 'lw-hint' }, '暂无待办')))),
        h('aside', { className: 'lw-goal-agenda', 'aria-label': '待办' },
          h('div', { className: 'lw-goal-toolbar' }, h('strong', null, '待办'),
            h('div', null, ['选中日期', '逾期', '未排期'].map(name => selectable(name, filter, setFilter)))),
          filter === '选中日期' && h('small', null, selected),
          visible.length ? visible.map(item => row(item)) : h('p', { className: 'lw-hint' }, '暂无待办'),
          h('form', { className: 'lw-goal-form', onSubmit: formSubmit },
            h('input', { className: 'lw-input', value: title, placeholder: '添加待办', 'aria-label': '新待办名称',
              required: true, onChange: event => setTitle(event.target.value) }),
            h('input', { className: 'lw-input', value: stage, placeholder: '所属阶段（可选）', 'aria-label': '所属阶段',
              onChange: event => setStage(event.target.value) }),
            h('label', null, '截止日期', h('input', { type: 'date', value: deadline, onChange: event => setDeadline(event.target.value) })),
            h('button', { type: 'submit', disabled: busy || !title.trim() }, '添加待办')))))
  }
}
