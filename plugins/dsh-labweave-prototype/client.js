window.__ModuleLoader__.load({
  id: 'labweave-dsh-prototype',
  factory: (require) => {
    const React = require('react')
    const h = React.createElement
    const NAME_PATH = '/api/labweave/assistant-name'
    const NAME_CHANGED = 'labweave:assistant-name-changed'

    async function getName(signal) {
      const response = await fetch(NAME_PATH, { credentials: 'same-origin', cache: 'no-store', redirect: 'error',
        signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) })
      if (!response.ok) throw new Error('name unavailable')
      const value = await response.json()
      if (!value || typeof value.name !== 'string' || !value.name || value.name.length > 160) throw new Error('invalid name')
      return value.name
    }

    function BrandName() {
      const [name, setName] = React.useState(null)
      const [failed, setFailed] = React.useState(false)
      React.useEffect(() => {
        let active = true
        let controller
        const refresh = () => {
          if (controller) controller.abort()
          controller = new AbortController()
          setFailed(false)
          getName(controller.signal)
            .then((value) => { if (active) setName(value) })
            .catch((error) => { if (active && error.name !== 'AbortError') { setName(null); setFailed(true) } })
        }
        window.addEventListener(NAME_CHANGED, refresh)
        refresh()
        return () => { active = false; window.removeEventListener(NAME_CHANGED, refresh); controller.abort() }
      }, [])
      return h('span', { style: { display: 'flex', flexDirection: 'column', minWidth: 0 } },
        h('span', null, 'leaweave'),
        h('span', { style: { fontSize: 11, fontWeight: 400, opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          name === null ? (failed ? '助手名称不可用' : '正在加载助手名称…') : `全局助手 · ${name}`))
    }

    function AssistantNameSetting() {
      const [name, setName] = React.useState('')
      const [savedName, setSavedName] = React.useState('')
      const [status, setStatus] = React.useState('loading')
      const [loadAttempt, setLoadAttempt] = React.useState(0)
      React.useEffect(() => {
        let active = true
        const controller = new AbortController()
        setStatus('loading')
        getName(controller.signal).then((value) => {
          if (active) { setName(value); setSavedName(value); setStatus('ready') }
        }).catch((error) => {
          if (active && error.name !== 'AbortError') setStatus('load-error')
        })
        return () => { active = false; controller.abort() }
      }, [loadAttempt])
      const save = async (event) => {
        event.preventDefault()
        const trimmed = name.trim()
        if (!trimmed || trimmed.length > 160) { setStatus('invalid'); return }
        setStatus('saving')
        try {
          const response = await fetch(NAME_PATH, {
            method: 'POST', credentials: 'same-origin', cache: 'no-store', redirect: 'error',
            headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: trimmed }), signal: AbortSignal.timeout(5000),
          })
          if (!response.ok) { setStatus(response.status === 400 ? 'invalid' : 'save-error'); return }
          const data = await response.json()
          if (!data || typeof data.name !== 'string' || !data.name || data.name.length > 160) throw new Error('invalid response')
          setName(data.name)
          setSavedName(data.name)
          setStatus('saved')
          window.dispatchEvent(new Event(NAME_CHANGED))
        } catch { setStatus('save-error') }
      }
      const unavailable = status === 'loading' || status === 'load-error'
      return h('form', { onSubmit: save, style: { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 10, padding: '12px 0' } },
        h('div', { style: { flex: '1 1 180px', minWidth: 0 } },
          h('label', { htmlFor: 'labweave-assistant-name', style: { display: 'block', fontWeight: 600, marginBottom: 4 } }, '全局助手名称'),
          h('span', { style: { fontSize: 12, opacity: .7 } }, '仅修改显示名称，不改变项目或对话。')),
        h('input', { id: 'labweave-assistant-name', type: 'text', value: name, maxLength: 160, disabled: unavailable || status === 'saving',
          onChange: (event) => { setName(event.target.value); if (status !== 'saving') setStatus('ready') },
          style: { minWidth: 0, width: 150, maxWidth: '100%', padding: '6px 8px', color: 'inherit', background: 'transparent', border: '1px solid var(--dsw-alias-border-default, #8a8a8a)', borderRadius: 6 } }),
        h('button', { type: 'submit', disabled: unavailable || status === 'saving' || name.trim() === savedName,
          style: { padding: '6px 10px', cursor: 'pointer' } }, status === 'saving' ? '保存中…' : '保存'),
        status === 'loading' ? h('span', { role: 'status', style: { flexBasis: '100%' } }, '正在加载助手名称…') : null,
        status === 'load-error' ? h('div', { role: 'alert', style: { flexBasis: '100%' } }, '无法读取助手名称，请确认本地后端已启动。 ',
          h('button', { type: 'button', onClick: () => setLoadAttempt((value) => value + 1) }, '重试')) : null,
        status === 'invalid' ? h('span', { role: 'alert', style: { flexBasis: '100%' } }, '请输入有效名称（最多 80 个字符）。') : null,
        status === 'save-error' ? h('span', { role: 'alert', style: { flexBasis: '100%' } }, '保存失败，名称尚未更改，请重试。') : null,
        status === 'saved' ? h('span', { role: 'status', style: { flexBasis: '100%' } }, '已保存。') : null)
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
          { name: 'sidebar.brand.name', priority: -10 },
          BrandName,
        ))
        ctx.slots.inject('settings.general.item', () => ctx.slots.register(
          { name: 'settings.general.item', id: 'labweave-assistant-name', order: 25 },
          AssistantNameSetting,
        ))
      },
    }
  },
})
