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
        h('span', null, 'Weave'),
        h('span', { style: { fontSize: 11, fontWeight: 400, opacity: .7, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } },
          name === null ? (failed ? '助手名称不可用' : '正在加载助手名称…') : `全局助手 · ${name}`))
    }

    return {
      inject: ['slots'],
      apply(ctx) {
        ctx.slots.inject('sidebar.brand.name', () => ctx.slots.register(
          { name: 'sidebar.brand.name', priority: -10 },
          BrandName,
        ))
      },
    }
  },
})
