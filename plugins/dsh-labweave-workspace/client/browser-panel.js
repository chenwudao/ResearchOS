const savedTabs = new Map()

const QUICK_LINKS = [
  { label: 'arXiv', url: 'https://arxiv.org/' },
  { label: 'GitHub', url: 'https://github.com/' },
  { label: 'Google Scholar', url: 'https://scholar.google.com/' },
  { label: 'Bing', url: 'https://www.bing.com/' },
]

const SPECIAL_KEY_CODES = {
  Backspace: 8, Tab: 9, Enter: 13, Shift: 16, Control: 17, Alt: 18,
  Escape: 27, Space: 32, ' ': 32, PageUp: 33, PageDown: 34, End: 35, Home: 36,
  ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, Insert: 45, Delete: 46,
}

function mouseButtonName(button) {
  if (button === 0) return 'left'
  if (button === 1) return 'middle'
  if (button === 2) return 'right'
  return 'none'
}

function eventModifiers(e) {
  return (e.altKey ? 1 : 0) | (e.ctrlKey ? 2 : 0) | (e.metaKey ? 4 : 0) | (e.shiftKey ? 8 : 0)
}

async function apiPost(subpath, body, signal) {
  const res = await fetch('/api/labweave/browser/' + subpath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    ...(signal ? { signal } : {}),
  })
  const data = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(data.error || '浏览器请求失败。')
  return data
}

export function createBrowserPane(React, ui = {}) {
  const { useEffect, useRef, useState } = React
  const h = React.createElement
  const LW = ui.LW || (s => s)

  function SvgIcon({ d, size = 15 }) {
    return h('svg', {
      width: size, height: size, viewBox: '0 0 24 24', fill: 'none',
      stroke: 'currentColor', strokeWidth: 1.85, strokeLinecap: 'round', strokeLinejoin: 'round',
      'aria-hidden': 'true',
    }, h('path', { d }))
  }

  function BrowserStyles() {
    return h('style', null, `
      .lw-br{display:flex;flex-direction:column;height:100%;min-height:0;background:var(--dsw-alias-bg-base,Canvas);color:var(--dsw-alias-label-primary,CanvasText);font-size:var(--dsh-content-font-size-secondary,13px);position:relative}
      .lw-br-bar{box-sizing:border-box;display:flex;align-items:center;gap:4px;flex:none;height:40px;padding:4px 8px;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));background:var(--dsw-alias-bg-base,Canvas)}
      .lw-br-btn{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;padding:0;flex:none;border:0;border-radius:var(--dsw-radius-sm,6px);background:transparent;color:var(--dsw-alias-label-secondary,GrayText);cursor:pointer;transition:background-color .12s ease,color .12s ease}
      .lw-br-btn:hover:not(:disabled){color:var(--dsw-alias-label-primary,CanvasText);background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.13))}
      .lw-br-btn:disabled{opacity:.35;cursor:not-allowed}
      .lw-br-btn:focus-visible{outline:var(--dsw-focus-ring-width,2px) solid var(--dsw-focus-ring-color,var(--dsw-alias-state-business-primary,#3b82f6));outline-offset:1px}
      .lw-br-form{flex:1;min-width:0;display:flex}
      .lw-br-input{width:100%;min-width:0;height:28px;padding:0 10px;border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));border-radius:var(--dsw-radius-md,8px);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06));color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12.5px;outline:none;transition:border-color .12s ease,background-color .12s ease}
      .lw-br-input:focus{border-color:var(--dsw-alias-state-business-primary,#3b82f6);background:var(--dsw-alias-bg-base,Canvas)}
      .lw-br-progress{height:2px;flex:none;background:transparent;overflow:hidden;position:relative}
      .lw-br-progress[data-loading="true"]::after{content:"";position:absolute;inset:0;width:42%;background:var(--dsw-alias-state-business-primary,#3b82f6);animation:lw-br-indet 1.1s ease-in-out infinite}
      @keyframes lw-br-indet{0%{transform:translateX(-110%)}100%{transform:translateX(260%)}}
      .lw-br-banner{flex:none;padding:6px 12px;font-size:12px;line-height:1.5;border-bottom:.5px solid var(--dsw-alias-border-l3,rgba(128,128,128,.24));display:flex;align-items:center;justify-content:space-between;gap:8px}
      .lw-br-banner[data-tone="error"]{color:var(--dsw-alias-state-error-primary,#dc2626);background:color-mix(in srgb,var(--dsw-alias-state-error-primary,#dc2626) 8%,transparent)}
      .lw-br-banner[data-tone="info"]{color:var(--dsw-alias-label-secondary,GrayText);background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.06))}
      .lw-br-stage{flex:1;min-height:0;position:relative;overflow:hidden;background:var(--dsw-alias-bg-base,Canvas);outline:none;user-select:none;-webkit-user-select:none}
      .lw-br-canvas{display:block;width:100%;height:100%;cursor:default}
      .lw-br-ime{position:fixed;left:-9999px;top:0;width:1px;height:1px;opacity:0;pointer-events:none}
      .lw-br-empty{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:14px;padding:24px;text-align:center;color:var(--dsw-alias-label-secondary,GrayText);background:var(--dsw-alias-bg-base,Canvas)}
      .lw-br-empty-title{font-size:14px;font-weight:500;color:var(--dsw-alias-label-primary,CanvasText)}
      .lw-br-empty-sub{margin:0;font-size:12px;color:var(--dsw-alias-label-tertiary,GrayText);max-width:26rem;line-height:1.6}
      .lw-br-chips{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;max-width:360px}
      .lw-br-chip{padding:5px 12px;border:1px solid var(--dsw-alias-border-l3,rgba(128,128,128,.28));border-radius:999px;background:var(--dsw-alias-bg-layer-1,rgba(128,128,128,.04));color:var(--dsw-alias-label-primary,CanvasText);font:inherit;font-size:12px;cursor:pointer;transition:background-color .12s ease,border-color .12s ease}
      .lw-br-chip:hover{background:var(--dsw-alias-interactive-bg-hover,rgba(128,128,128,.12));border-color:var(--dsw-alias-border-l4,rgba(128,128,128,.45))}
      .lw-br-toast{position:absolute;bottom:14px;left:50%;transform:translateX(-50%);padding:5px 12px;border-radius:999px;background:rgba(20,24,32,.86);color:#fff;font-size:12px;pointer-events:none;z-index:5}
    `)
  }

  return function BrowserPane({ tabKey = 'default', initialUrl = '', onTitleChange }) {
    const stageRef = useRef(null)
    const canvasRef = useRef(null)
    const imeRef = useRef(null)
    const tabIdRef = useRef(savedTabs.get(tabKey) || '')
    const viewportRef = useRef({ width: 960, height: 720 })
    const composingRef = useRef(false)
    const lastMoveRef = useRef(0)
    const addressFocusedRef = useRef(false)
    const pollAbortRef = useRef(null)
    const drawSeqRef = useRef(0)

    const [address, setAddress] = useState('')
    const [state, setState] = useState({
      url: '', title: '', loading: false, canGoBack: false, canGoForward: false, error: '',
    })
    const [hasFrame, setHasFrame] = useState(false)
    const [booting, setBooting] = useState(false)
    const [error, setError] = useState('')
    const [toast, setToast] = useState('')

    function showToast(msg) {
      setToast(msg)
      window.clearTimeout(showToast._t)
      showToast._t = window.setTimeout(() => setToast(''), 1800)
    }

    function applyState(next) {
      if (!next) return
      setState(prev => ({ ...prev, ...next }))
      if (next.width && next.height) {
        viewportRef.current = { width: next.width, height: next.height }
      }
      if (!addressFocusedRef.current && typeof next.url === 'string' && next.url) {
        setAddress(next.url)
      }
      if (next.error) setError(next.error)
      if (onTitleChange) {
        let label = ''
        if (next.title) label = next.title
        else if (next.url) {
          try { label = new URL(next.url).hostname } catch { label = next.url }
        }
        onTitleChange(label)
      }
    }

    function stopPolling() {
      pollAbortRef.current?.abort()
      pollAbortRef.current = null
    }

    function connectStream(id) {
      stopPolling()
      const ctrl = new AbortController()
      pollAbortRef.current = ctrl
      let stateSeq = 0
      let frameSeq = 0
      ;(async () => {
        while (!ctrl.signal.aborted && tabIdRef.current === id) {
          try {
            const res = await apiPost('poll', { tabId: id, stateSeq, frameSeq }, ctrl.signal)
            if (ctrl.signal.aborted) break
            if (res.stateSeq) stateSeq = res.stateSeq
            if (res.frameSeq) frameSeq = res.frameSeq
            if (res.state) applyState(res.state)
            if (res.frame?.data) {
              if (res.frame.width && res.frame.height) {
                viewportRef.current = { width: res.frame.width, height: res.frame.height }
              }
              renderFrame(res.frame.data)
            }
          } catch (err) {
            if (ctrl.signal.aborted) break
            await new Promise(r => setTimeout(r, 800))
          }
        }
      })()
    }

    function renderFrame(base64) {
      const canvas = canvasRef.current
      if (!canvas) return
      const seq = ++drawSeqRef.current
      const img = new Image()
      img.onload = () => {
        if (seq < drawSeqRef.current - 1) return
        const target = canvasRef.current
        if (!target) return
        if (target.width !== img.naturalWidth || target.height !== img.naturalHeight) {
          target.width = img.naturalWidth
          target.height = img.naturalHeight
        }
        const ctx2d = target.getContext('2d')
        if (ctx2d) ctx2d.drawImage(img, 0, 0)
        setHasFrame(true)
      }
      img.src = 'data:image/jpeg;base64,' + base64
    }

    function stageSize() {
      const rect = stageRef.current?.getBoundingClientRect()
      const width = Math.max(360, Math.round(rect?.width || 720))
      const height = Math.max(280, Math.round(rect?.height || 640))
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5)
      return { width, height, dpr }
    }

    async function ensureTab(urlToOpen = '') {
      if (tabIdRef.current) {
        try {
          const st = await apiPost('action', { tabId: tabIdRef.current, action: 'state' })
          applyState(st)
          if (!pollAbortRef.current || pollAbortRef.current.signal.aborted) {
            connectStream(tabIdRef.current)
          }
          return tabIdRef.current
        } catch {
          tabIdRef.current = ''
          savedTabs.delete(tabKey)
        }
      }
      setBooting(true)
      setError('')
      try {
        const size = stageSize()
        const created = await apiPost('create', { ...size, ...(urlToOpen ? { url: urlToOpen } : {}) })
        tabIdRef.current = created.tabId
        savedTabs.set(tabKey, created.tabId)
        applyState(created)
        connectStream(created.tabId)
        return created.tabId
      } finally {
        setBooting(false)
      }
    }

    async function navigateTo(rawUrl) {
      const target = String(rawUrl ?? '').trim()
      if (!target) return
      setError('')
      setAddress(target)
      try {
        if (!tabIdRef.current) {
          await ensureTab(target)
        } else {
          const st = await apiPost('action', { tabId: tabIdRef.current, action: 'navigate', url: target })
          applyState(st)
          if (!pollAbortRef.current || pollAbortRef.current.signal.aborted) {
            connectStream(tabIdRef.current)
          }
        }
        imeRef.current?.focus({ preventScroll: true })
      } catch (err) {
        setError(err.message || '打开网页失败。')
      }
    }

    async function runNavAction(action) {
      if (!tabIdRef.current) return
      setError('')
      try {
        const st = await apiPost('action', { tabId: tabIdRef.current, action })
        applyState(st)
      } catch (err) {
        setError(err.message || '操作失败。')
      }
    }

    async function copyRemoteSelection() {
      if (!tabIdRef.current) return
      try {
        const res = await apiPost('action', { tabId: tabIdRef.current, action: 'copySelection' })
        if (res?.text) {
          await navigator.clipboard?.writeText(res.text).catch(() => {})
          showToast(LW('已复制选中内容'))
        } else {
          showToast(LW('未选中文字'))
        }
      } catch {}
    }

    // Restore existing tab or open initialUrl on mount
    useEffect(() => {
      let active = true
      const existing = savedTabs.get(tabKey)
      if (existing) {
        tabIdRef.current = existing
        ensureTab().catch(() => {
          if (active) {
            tabIdRef.current = ''
            savedTabs.delete(tabKey)
          }
        })
      } else if (initialUrl) {
        navigateTo(initialUrl)
      }
      const onExternalOpen = ev => {
        const u = ev?.detail?.url
        if (u) navigateTo(u)
      }
      window.addEventListener('labweave:browser-open', onExternalOpen)
      return () => {
        active = false
        window.removeEventListener('labweave:browser-open', onExternalOpen)
        stopPolling()
      }
    }, [tabKey])

    // Sync viewport size when rightbar is resized
    useEffect(() => {
      const el = stageRef.current
      if (!el || typeof ResizeObserver === 'undefined') return
      let timer = null
      const ro = new ResizeObserver(() => {
        if (!tabIdRef.current) return
        window.clearTimeout(timer)
        timer = window.setTimeout(() => {
          const id = tabIdRef.current
          if (!id) return
          const size = stageSize()
          apiPost('action', { tabId: id, action: 'resize', ...size }).then(applyState).catch(() => {})
        }, 180)
      })
      ro.observe(el)
      return () => {
        window.clearTimeout(timer)
        ro.disconnect()
      }
    }, [])

    // Non-passive wheel listener so scrolling moves the remote page instead of parent
    useEffect(() => {
      const el = stageRef.current
      if (!el) return
      const onWheel = e => {
        if (!tabIdRef.current || !state.url) return
        e.preventDefault()
        const pos = toViewportCoords(e)
        void apiPost('input', {
          tabId: tabIdRef.current,
          kind: 'wheel',
          x: pos.x,
          y: pos.y,
          deltaX: e.deltaX,
          deltaY: e.deltaY,
          modifiers: eventModifiers(e),
        }).catch(() => {})
      }
      el.addEventListener('wheel', onWheel, { passive: false })
      return () => el.removeEventListener('wheel', onWheel)
    }, [state.url])

    function toViewportCoords(e) {
      const rect = canvasRef.current?.getBoundingClientRect() || stageRef.current?.getBoundingClientRect()
      if (!rect || rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 }
      const { width, height } = viewportRef.current
      const rx = (e.clientX - rect.left) / rect.width
      const ry = (e.clientY - rect.top) / rect.height
      return {
        x: Math.max(0, Math.min(width, rx * width)),
        y: Math.max(0, Math.min(height, ry * height)),
      }
    }

    function sendMouse(type, e) {
      if (!tabIdRef.current || !state.url) return
      if (type === 'mouseMoved') {
        const now = performance.now()
        if (now - lastMoveRef.current < 28) return
        lastMoveRef.current = now
      }
      const pos = toViewportCoords(e)
      void apiPost('input', {
        tabId: tabIdRef.current,
        kind: 'mouse',
        type,
        x: pos.x,
        y: pos.y,
        button: type === 'mouseMoved' ? 'none' : mouseButtonName(e.button),
        buttons: e.buttons || 0,
        clickCount: type === 'mouseMoved' ? 0 : Math.max(1, e.detail || 1),
        modifiers: eventModifiers(e),
      }).catch(() => {})
    }

    function onKeyDown(e) {
      if (!tabIdRef.current || !state.url) return
      if (composingRef.current || e.isComposing || e.keyCode === 229) return

      const mod = e.ctrlKey || e.metaKey
      if (mod && e.key.toLowerCase() === 'c') {
        e.preventDefault()
        void copyRemoteSelection()
        return
      }
      if (mod && e.key.toLowerCase() === 'v') {
        // Let the native paste event fire on imeRef so we capture clipboard text cleanly
        return
      }

      const keyCode = SPECIAL_KEY_CODES[e.key] || e.keyCode || 0
      const isPrintable = e.key.length === 1 && !mod && !e.altKey
      e.preventDefault()
      if (isPrintable) {
        void apiPost('input', {
          tabId: tabIdRef.current,
          kind: 'key',
          type: 'keyDown',
          key: e.key,
          code: e.code,
          keyCode,
          text: e.key,
          modifiers: eventModifiers(e),
        }).catch(() => {})
      } else {
        void apiPost('input', {
          tabId: tabIdRef.current,
          kind: 'key',
          type: 'rawKeyDown',
          key: e.key,
          code: e.code,
          keyCode,
          modifiers: eventModifiers(e),
        }).catch(() => {})
      }
    }

    function onKeyUp(e) {
      if (!tabIdRef.current || !state.url) return
      if (composingRef.current || e.isComposing || e.keyCode === 229) return
      const keyCode = SPECIAL_KEY_CODES[e.key] || e.keyCode || 0
      void apiPost('input', {
        tabId: tabIdRef.current,
        kind: 'key',
        type: 'keyUp',
        key: e.key,
        code: e.code,
        keyCode,
        modifiers: eventModifiers(e),
      }).catch(() => {})
    }

    function onCompositionStart() {
      composingRef.current = true
    }

    function onCompositionEnd(e) {
      composingRef.current = false
      const text = e.data || imeRef.current?.value || ''
      if (imeRef.current) imeRef.current.value = ''
      if (text && tabIdRef.current) {
        void apiPost('input', { tabId: tabIdRef.current, kind: 'insertText', text }).catch(() => {})
      }
    }

    function onPaste(e) {
      const text = e.clipboardData?.getData('text/plain')
      if (!text || !tabIdRef.current) return
      e.preventDefault()
      if (imeRef.current) imeRef.current.value = ''
      void apiPost('input', { tabId: tabIdRef.current, kind: 'insertText', text }).catch(() => {})
    }

    const showEmpty = !state.url && !hasFrame

    return h('section', { className: 'lw-br', 'aria-label': LW('浏览器') },
      h(BrowserStyles),
      h('div', { className: 'lw-br-bar' },
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': LW('后退'), title: LW('后退'),
          disabled: !state.canGoBack,
          onClick: () => runNavAction('back'),
        }, h(SvgIcon, { d: 'M15 18l-6-6 6-6' })),
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': LW('前进'), title: LW('前进'),
          disabled: !state.canGoForward,
          onClick: () => runNavAction('forward'),
        }, h(SvgIcon, { d: 'M9 18l6-6-6-6' })),
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': state.loading ? LW('停止加载') : LW('刷新'),
          title: state.loading ? LW('停止加载') : LW('刷新'),
          disabled: !state.url,
          onClick: () => runNavAction(state.loading ? 'stop' : 'reload'),
        }, state.loading
          ? h(SvgIcon, { d: 'M18 6L6 18M6 6l12 12' })
          : h(SvgIcon, { d: 'M21 12a9 9 0 1 1-2.64-6.36M21 3v6h-6' })),
        h('form', {
          className: 'lw-br-form',
          onSubmit: e => {
            e.preventDefault()
            addressFocusedRef.current = false
            void navigateTo(address)
          },
        },
          h('input', {
            type: 'text',
            className: 'lw-br-input',
            value: address,
            placeholder: LW('输入网址或搜索内容…'),
            'aria-label': LW('输入网址或搜索内容'),
            spellCheck: false,
            onFocus: e => { addressFocusedRef.current = true; e.target.select() },
            onBlur: () => { addressFocusedRef.current = false },
            onChange: e => setAddress(e.target.value),
          })),
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': LW('前往'), title: LW('前往'),
          disabled: !address.trim() || booting,
          onClick: () => { addressFocusedRef.current = false; void navigateTo(address) },
        }, h(SvgIcon, { d: 'M5 12h14M13 6l6 6-6 6' })),
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': LW('复制选中文字'), title: LW('复制选中文字'),
          disabled: !state.url,
          onClick: () => void copyRemoteSelection(),
        }, h(SvgIcon, { d: 'M9 9h10v10H9zM5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1' })),
        h('button', {
          type: 'button', className: 'lw-br-btn',
          'aria-label': LW('在系统浏览器中打开'), title: LW('在系统浏览器中打开'),
          disabled: !state.url,
          onClick: () => { if (state.url) window.open(state.url, '_blank', 'noopener,noreferrer') },
        }, h(SvgIcon, { d: 'M14 5h5v5M19 5l-9 9M19 14v4a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h4' }))),
      h('div', { className: 'lw-br-progress', 'data-loading': String(Boolean(state.loading || booting)) }),
      error && h('div', { className: 'lw-br-banner', 'data-tone': 'error', role: 'alert' },
        h('span', null, error),
        h('button', {
          type: 'button', className: 'lw-br-btn', 'aria-label': LW('关闭提示'),
          onClick: () => setError(''),
        }, h(SvgIcon, { d: 'M18 6L6 18M6 6l12 12', size: 13 }))),
      h('div', {
        ref: stageRef,
        className: 'lw-br-stage',
        onMouseDown: e => {
          imeRef.current?.focus({ preventScroll: true })
          sendMouse('mousePressed', e)
        },
        onMouseUp: e => sendMouse('mouseReleased', e),
        onMouseMove: e => sendMouse('mouseMoved', e),
        onContextMenu: e => e.preventDefault(),
      },
        h('textarea', {
          ref: imeRef,
          className: 'lw-br-ime',
          'aria-hidden': 'true',
          tabIndex: -1,
          onKeyDown,
          onKeyUp,
          onCompositionStart,
          onCompositionEnd,
          onPaste,
        }),
        h('canvas', {
          ref: canvasRef,
          className: 'lw-br-canvas',
          style: { visibility: hasFrame ? 'visible' : 'hidden' },
        }),
        showEmpty && h('div', { className: 'lw-br-empty' },
          h(SvgIcon, { d: 'M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20ZM2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10Z', size: 32 }),
          h('div', { className: 'lw-br-empty-title' }, LW('Weave 内置浏览器')),
          h('p', { className: 'lw-br-empty-sub' }, LW('由本机真实浏览器内核驱动，支持任意网站、论文页面、PDF 与登录态。在上方输入网址或关键词即可开始浏览。')),
          h('div', { className: 'lw-br-chips' },
            QUICK_LINKS.map(item => h('button', {
              key: item.url,
              type: 'button',
              className: 'lw-br-chip',
              disabled: booting,
              onClick: () => void navigateTo(item.url),
            }, item.label))))),
      toast && h('div', { className: 'lw-br-toast', role: 'status' }, toast))
  }
}
