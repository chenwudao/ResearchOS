import { spawn } from 'node:child_process'
import { existsSync, mkdirSync } from 'node:fs'
import { randomBytes, randomUUID, createHash } from 'node:crypto'
import net from 'node:net'
import os from 'node:os'
import path from 'node:path'

const IDLE_TAB_MS = 30 * 60 * 1000
const LAUNCH_TIMEOUT_MS = 15000
const CDP_TIMEOUT_MS = 20000
const MIN_WIDTH = 320
const MAX_WIDTH = 1920
const MIN_HEIGHT = 240
const MAX_HEIGHT = 1200

function failure(message, status = 400) {
  return Object.assign(new Error(message), { status })
}

function clamp(value, min, max, fallback) {
  const n = Number(value)
  if (!Number.isFinite(n)) return fallback
  return Math.max(min, Math.min(max, Math.round(n)))
}

export function findBrowserExecutable() {
  const envPath = process.env.WEAVE_BROWSER_PATH || process.env.LABWEAVE_BROWSER_PATH
  if (envPath && existsSync(envPath)) return envPath

  const candidates = []
  if (process.platform === 'win32') {
    const pf86 = process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)'
    const pf = process.env.ProgramFiles || 'C:\\Program Files'
    const local = process.env.LOCALAPPDATA || ''
    candidates.push(
      path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      local && path.join(local, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      local && path.join(local, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(pf, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      local && path.join(local, 'Chromium', 'Application', 'chrome.exe'),
    )
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    )
  } else {
    candidates.push(
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/microsoft-edge',
      '/usr/bin/microsoft-edge-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
      '/snap/bin/chromium',
    )
  }

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate
  }
  return null
}

export function normalizeTargetUrl(rawInput, appOrigin = '') {
  const input = String(rawInput ?? '').trim()
  if (!input) throw failure('请输入网址或搜索关键词。')

  let candidate = input
  const schemeMatch = input.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/)
  if (schemeMatch) {
    const scheme = schemeMatch[1].toLowerCase()
    if (scheme !== 'http' && scheme !== 'https') {
      throw failure('仅支持打开 HTTP 或 HTTPS 网页地址。')
    }
  } else if (/\s/.test(input)) {
    candidate = `https://www.bing.com/search?q=${encodeURIComponent(input)}`
  } else if (/^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?(\/|$)/i.test(input)) {
    candidate = `http://${input}`
  } else if (/^([a-zA-Z0-9-]+\.)+[a-zA-Z]{2,}(:\d+)?(\/.*)?$/.test(input) || /^\d{1,3}(\.\d{1,3}){3}(:\d+)?(\/.*)?$/.test(input)) {
    candidate = `https://${input}`
  } else {
    candidate = `https://www.bing.com/search?q=${encodeURIComponent(input)}`
  }

  let parsed
  try {
    parsed = new URL(candidate)
  } catch {
    throw failure('无法识别该网页地址。')
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw failure('仅支持打开 HTTP 或 HTTPS 网页地址。')
  }
  if (appOrigin) {
    try {
      const own = new URL(appOrigin)
      if (parsed.origin === own.origin) {
        throw failure('不能在嵌入浏览器中打开 Weave 应用自身。')
      }
    } catch (err) {
      if (err?.status) throw err
    }
  }
  return parsed.href
}

// Lightweight zero-dependency RFC 6455 client for local ws://127.0.0.1 CDP connections.
// Used as fallback if globalThis.WebSocket is unavailable in the host runtime.
class LocalWsClient {
  constructor(wsUrl) {
    this.url = new URL(wsUrl)
    this.socket = null
    this.buffer = Buffer.alloc(0)
    this.handshaken = false
    this.closed = false
    this.onopen = null
    this.onmessage = null
    this.onclose = null
    this.onerror = null
    this.fragments = []
    this._connect()
  }

  _connect() {
    const key = randomBytes(16).toString('base64')
    const expectedAccept = createHash('sha1').update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11').digest('base64')
    const port = Number(this.url.port) || 80
    const host = this.url.hostname
    const reqPath = this.url.pathname + this.url.search
    this.socket = net.createConnection({ host, port }, () => {
      const req = [
        `GET ${reqPath} HTTP/1.1`,
        `Host: ${host}:${port}`,
        'Upgrade: websocket',
        'Connection: Upgrade',
        `Sec-WebSocket-Key: ${key}`,
        'Sec-WebSocket-Version: 13',
        '',
        '',
      ].join('\r\n')
      this.socket.write(req)
    })
    this.socket.on('data', chunk => {
      this.buffer = Buffer.concat([this.buffer, chunk])
      if (!this.handshaken) {
        const end = this.buffer.indexOf('\r\n\r\n')
        if (end === -1) return
        const header = this.buffer.subarray(0, end).toString('utf8')
        this.buffer = this.buffer.subarray(end + 4)
        if (!/^HTTP\/1\.1 101 /i.test(header) || !header.toLowerCase().includes(expectedAccept.toLowerCase())) {
          this._fail(new Error('CDP WebSocket 握手失败'))
          return
        }
        this.handshaken = true
        this.onopen?.()
      }
      this._drainFrames()
    })
    this.socket.on('error', err => this._fail(err))
    this.socket.on('close', () => {
      if (this.closed) return
      this.closed = true
      this.onclose?.()
    })
  }

  _fail(err) {
    if (this.closed) return
    this.closed = true
    this.onerror?.(err)
    this.onclose?.()
    try { this.socket?.destroy() } catch {}
  }

  _drainFrames() {
    while (this.buffer.length >= 2) {
      const b0 = this.buffer[0]
      const b1 = this.buffer[1]
      const fin = (b0 & 0x80) !== 0
      const opcode = b0 & 0x0f
      const masked = (b1 & 0x80) !== 0
      let len = b1 & 0x7f
      let offset = 2
      if (len === 126) {
        if (this.buffer.length < 4) return
        len = this.buffer.readUInt16BE(2)
        offset = 4
      } else if (len === 127) {
        if (this.buffer.length < 10) return
        const hi = this.buffer.readUInt32BE(2)
        const lo = this.buffer.readUInt32BE(6)
        len = hi * 0x100000000 + lo
        offset = 10
      }
      const maskLen = masked ? 4 : 0
      if (this.buffer.length < offset + maskLen + len) return
      let payload = this.buffer.subarray(offset + maskLen, offset + maskLen + len)
      if (masked) {
        const mask = this.buffer.subarray(offset, offset + 4)
        payload = Buffer.from(payload)
        for (let i = 0; i < payload.length; i++) payload[i] ^= mask[i & 3]
      }
      this.buffer = this.buffer.subarray(offset + maskLen + len)

      if (opcode === 0x8) {
        this.close()
        return
      }
      if (opcode === 0x9) {
        this._sendFrame(0xA, payload)
        continue
      }
      if (opcode === 0xA) continue
      if (opcode === 0x1 || opcode === 0x2 || opcode === 0x0) {
        this.fragments.push(payload)
        if (fin) {
          const full = this.fragments.length === 1 ? this.fragments[0] : Buffer.concat(this.fragments)
          this.fragments = []
          this.onmessage?.({ data: full.toString('utf8') })
        }
      }
    }
  }

  _sendFrame(opcode, payload) {
    if (this.closed || !this.socket || this.socket.destroyed) return
    const data = Buffer.isBuffer(payload) ? payload : Buffer.from(String(payload), 'utf8')
    const len = data.length
    let header
    if (len < 126) {
      header = Buffer.alloc(2)
      header[0] = 0x80 | opcode
      header[1] = 0x80 | len
    } else if (len < 65536) {
      header = Buffer.alloc(4)
      header[0] = 0x80 | opcode
      header[1] = 0x80 | 126
      header.writeUInt16BE(len, 2)
    } else {
      header = Buffer.alloc(10)
      header[0] = 0x80 | opcode
      header[1] = 0x80 | 127
      header.writeUInt32BE(Math.floor(len / 0x100000000), 2)
      header.writeUInt32BE(len >>> 0, 6)
    }
    const mask = randomBytes(4)
    const masked = Buffer.alloc(len)
    for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3]
    this.socket.write(Buffer.concat([header, mask, masked]))
  }

  send(text) {
    this._sendFrame(0x1, text)
  }

  close() {
    if (this.closed) return
    this.closed = true
    try { this._sendFrame(0x8, Buffer.alloc(0)) } catch {}
    try { this.socket?.end() } catch {}
    this.onclose?.()
  }
}

class CdpConnection {
  constructor(wsUrl) {
    this.wsUrl = wsUrl
    this.ws = null
    this.nextId = 1
    this.pending = new Map()
    this.listeners = new Set()
    this.closed = false
  }

  connect() {
    return new Promise((resolve, reject) => {
      const WsCtor = typeof globalThis.WebSocket === 'function' ? globalThis.WebSocket : LocalWsClient
      const ws = new WsCtor(this.wsUrl)
      this.ws = ws
      let settled = false
      const done = (ok, val) => {
        if (settled) return
        settled = true
        ok ? resolve(val) : reject(val)
      }
      ws.onopen = () => done(true)
      ws.onerror = err => done(false, err instanceof Error ? err : new Error('CDP 连接失败'))
      ws.onclose = () => {
        this.closed = true
        for (const { reject: rej, timer } of this.pending.values()) {
          clearTimeout(timer)
          rej(new Error('浏览器连接已断开'))
        }
        this.pending.clear()
        done(false, new Error('CDP 连接已关闭'))
      }
      ws.onmessage = event => {
        let msg
        try {
          msg = JSON.parse(typeof event.data === 'string' ? event.data : String(event.data))
        } catch {
          return
        }
        if (msg.id) {
          const entry = this.pending.get(msg.id)
          if (!entry) return
          this.pending.delete(msg.id)
          clearTimeout(entry.timer)
          if (msg.error) entry.reject(new Error(msg.error.message || 'CDP 命令失败'))
          else entry.resolve(msg.result || {})
          return
        }
        if (msg.method) {
          for (const fn of this.listeners) {
            try { fn(msg) } catch {}
          }
        }
      }
    })
  }

  onEvent(fn) {
    this.listeners.add(fn)
    return () => this.listeners.delete(fn)
  }

  send(method, params = {}, sessionId = undefined) {
    if (this.closed || !this.ws) return Promise.reject(new Error('浏览器连接已断开'))
    const id = this.nextId++
    const payload = sessionId ? { id, method, params, sessionId } : { id, method, params }
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`CDP 命令超时: ${method}`))
      }, CDP_TIMEOUT_MS)
      this.pending.set(id, { resolve, reject, timer })
      try {
        this.ws.send(JSON.stringify(payload))
      } catch (err) {
        clearTimeout(timer)
        this.pending.delete(id)
        reject(err)
      }
    })
  }

  close() {
    this.closed = true
    try { this.ws?.close() } catch {}
  }
}

function profileDirectory() {
  const base = process.env.DSH_HOME || path.join(os.homedir(), '.labweave')
  const dir = path.join(base, 'weave-browser-profile')
  mkdirSync(dir, { recursive: true })
  return dir
}

class LiveBrowserManager {
  constructor() {
    this.proc = null
    this.cdp = null
    this.starting = null
    this.tabs = new Map()
    this.targetToTab = new Map()
    this.sessionToTab = new Map()
    this.disposed = false
    this.gcTimer = setInterval(() => this._gcIdleTabs(), 60_000)
    this.gcTimer.unref?.()
  }

  async ensureStarted() {
    if (this.disposed) throw failure('浏览器服务已关闭。', 503)
    if (this.cdp && !this.cdp.closed && this.proc && this.proc.exitCode === null) return this.cdp
    if (this.starting) return this.starting
    this.starting = this._launch().finally(() => { this.starting = null })
    return this.starting
  }

  async _launch() {
    const exe = findBrowserExecutable()
    if (!exe) {
      throw failure('未检测到本机 Edge 或 Chrome 浏览器。请安装 Microsoft Edge / Google Chrome，或通过环境变量 WEAVE_BROWSER_PATH 指定路径。', 503)
    }
    const userDataDir = profileDirectory()
    const args = [
      '--headless=new',
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1',
      `--user-data-dir=${userDataDir}`,
      '--no-first-run',
      '--no-default-browser-check',
      '--disable-background-timer-throttling',
      '--disable-backgrounding-occluded-windows',
      '--disable-renderer-backgrounding',
      '--disable-features=TranslateUI',
      '--hide-scrollbars=false',
      '--window-size=1280,820',
      '--lang=zh-CN',
      'about:blank',
    ]

    const proc = spawn(exe, args, { stdio: ['ignore', 'ignore', 'pipe'], windowsHide: true })
    this.proc = proc

    const wsUrl = await new Promise((resolve, reject) => {
      let stderr = ''
      let done = false
      const timer = setTimeout(() => {
        if (done) return
        done = true
        try { proc.kill() } catch {}
        reject(failure('本机浏览器内核启动超时。', 503))
      }, LAUNCH_TIMEOUT_MS)

      const finish = (ok, val) => {
        if (done) return
        done = true
        clearTimeout(timer)
        ok ? resolve(val) : reject(val)
      }

      proc.stderr.on('data', chunk => {
        stderr += chunk.toString('utf8')
        const match = stderr.match(/DevTools listening on (ws:\/\/127\.0\.0\.1:\d+\/devtools\/browser\/[^\s]+)/)
        if (match) finish(true, match[1])
      })
      proc.once('error', err => finish(false, failure(`无法启动本机浏览器：${err.message}`, 503)))
      proc.once('exit', code => finish(false, failure(`本机浏览器提前退出（code=${code}）。`, 503)))
    })

    const cdp = new CdpConnection(wsUrl)
    await cdp.connect()
    this.cdp = cdp

    proc.once('exit', () => {
      if (this.proc === proc) {
        this.proc = null
        this.cdp?.close()
        this.cdp = null
        for (const tab of this.tabs.values()) {
          tab.error = '浏览器进程已退出，请刷新或重新打开网址。'
          tab.notifyState()
          tab.wakeWaiters()
        }
        this.tabs.clear()
        this.targetToTab.clear()
        this.sessionToTab.clear()
      }
    })

    await cdp.send('Target.setDiscoverTargets', { discover: true }).catch(() => {})
    cdp.onEvent(msg => this._onCdpEvent(msg))
    return cdp
  }

  _onCdpEvent(msg) {
    // Intercept popup tabs created via target="_blank" or window.open
    if (msg.method === 'Target.targetCreated') {
      const info = msg.params?.targetInfo
      if (info && info.type === 'page' && info.openerId && !this.targetToTab.has(info.targetId)) {
        const openerTab = this.targetToTab.get(info.openerId)
        if (openerTab && info.url && /^https?:\/\//i.test(info.url)) {
          void this.cdp?.send('Target.closeTarget', { targetId: info.targetId }).catch(() => {})
          void this.navigate(openerTab.id, info.url, openerTab.appOrigin).catch(() => {})
        }
      }
      return
    }
    if (msg.method === 'Target.targetInfoChanged') {
      const info = msg.params?.targetInfo
      const tab = info && this.targetToTab.get(info.targetId)
      if (tab) {
        if (info.title && info.title !== 'about:blank') tab.title = info.title
        if (info.url && info.url !== 'about:blank') tab.url = info.url
        tab.notifyState()
      }
      return
    }
    const tab = msg.sessionId && this.sessionToTab.get(msg.sessionId)
    if (!tab) return

    if (msg.method === 'Page.screencastFrame') {
      const { data, sessionId: frameSessionId, metadata } = msg.params || {}
      void this.cdp?.send('Page.screencastFrameAck', { sessionId: frameSessionId }, tab.cdpSessionId).catch(() => {})
      if (data) {
        tab.lastFrame = { data, width: metadata?.deviceWidth || tab.width, height: metadata?.deviceHeight || tab.height }
        tab.frameSeq++
        tab.wakeWaiters()
      }
      return
    }

    if (msg.method === 'Page.windowOpen') {
      const targetUrl = msg.params?.url
      if (targetUrl && /^https?:\/\//i.test(targetUrl)) {
        void this.navigate(tab.id, targetUrl, tab.appOrigin).catch(() => {})
      }
      return
    }

    if (msg.method === 'Page.frameStartedLoading') {
      tab.loading = true
      tab.notifyState()
      return
    }

    if (msg.method === 'Page.frameStoppedLoading' || msg.method === 'Page.loadEventFired') {
      tab.loading = false
      void this._syncHistory(tab)
      return
    }

    if (msg.method === 'Page.frameNavigated') {
      const frame = msg.params?.frame
      if (frame && !frame.parentId) {
        if (frame.url && frame.url !== 'about:blank') tab.url = frame.url
        void this._syncHistory(tab)
      }
      return
    }

    if (msg.method === 'Page.navigatedWithinDocument') {
      if (msg.params?.url && msg.params.url !== 'about:blank') {
        tab.url = msg.params.url
      }
      void this._syncHistory(tab)
    }
  }

  async _syncHistory(tab) {
    if (!this.cdp || this.cdp.closed || tab.closed) return
    try {
      const history = await this.cdp.send('Page.getNavigationHistory', {}, tab.cdpSessionId)
      const idx = history.currentIndex ?? -1
      const entries = history.entries || []
      const current = entries[idx]
      if (current) {
        if (current.url && current.url !== 'about:blank') tab.url = current.url
        if (current.title) tab.title = current.title
      }
      // Index 0 is often the initial about:blank entry
      const firstReal = entries.findIndex(e => e.url && e.url !== 'about:blank')
      tab.canGoBack = firstReal >= 0 ? idx > firstReal : idx > 0
      tab.canGoForward = idx >= 0 && idx < entries.length - 1
      tab.notifyState()
    } catch {}
  }

  async createTab({ width, height, dpr, url, appOrigin } = {}) {
    const cdp = await this.ensureStarted()
    const w = clamp(width, MIN_WIDTH, MAX_WIDTH, 960)
    const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT, 720)
    const scale = Math.max(1, Math.min(2, Number(dpr) || 1))

    const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' })
    const { sessionId: cdpSessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true })

    const tab = {
      id: randomUUID(),
      targetId,
      cdpSessionId,
      appOrigin: appOrigin || '',
      url: '',
      title: '',
      loading: false,
      canGoBack: false,
      canGoForward: false,
      width: w,
      height: h,
      dpr: scale,
      error: '',
      lastFrame: null,
      stateSeq: 1,
      frameSeq: 0,
      screencasting: false,
      screencastStopTimer: null,
      closed: false,
      lastActive: Date.now(),
      waiters: new Set(),
      publicState() {
        return {
          tabId: this.id,
          url: this.url,
          title: this.title,
          loading: this.loading,
          canGoBack: this.canGoBack,
          canGoForward: this.canGoForward,
          width: this.width,
          height: this.height,
          dpr: this.dpr,
          error: this.error,
        }
      },
      notifyState() {
        this.stateSeq++
        this.wakeWaiters()
      },
      wakeWaiters() {
        for (const wake of this.waiters) {
          try { wake() } catch {}
        }
        this.waiters.clear()
      },
    }

    this.tabs.set(tab.id, tab)
    this.targetToTab.set(targetId, tab)
    this.sessionToTab.set(cdpSessionId, tab)

    await cdp.send('Page.enable', {}, cdpSessionId)
    await cdp.send('Runtime.enable', {}, cdpSessionId)
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: scale, mobile: false,
    }, cdpSessionId)
    await cdp.send('Page.setLifecycleEventsEnabled', { enabled: false }, cdpSessionId).catch(() => {})

    if (url) {
      await this.navigate(tab.id, url, appOrigin)
    }
    return tab.publicState()
  }

  getTab(tabId) {
    const tab = this.tabs.get(tabId)
    if (!tab || tab.closed) throw failure('浏览器标签页不存在或已关闭。', 404)
    tab.lastActive = Date.now()
    return tab
  }

  async _ensureScreencast(tab) {
    if (tab.closed || !this.cdp || this.cdp.closed) return
    clearTimeout(tab.screencastStopTimer)
    tab.screencastStopTimer = setTimeout(() => {
      if (tab.waiters.size > 0 || tab.closed) return
      if (tab.screencasting) {
        tab.screencasting = false
        void this.cdp?.send('Page.stopScreencast', {}, tab.cdpSessionId).catch(() => {})
      }
    }, 6000)
    tab.screencastStopTimer.unref?.()
    if (tab.screencasting) return
    tab.screencasting = true
    try {
      await this.cdp.send('Page.startScreencast', {
        format: 'jpeg',
        quality: 82,
        maxWidth: Math.round(tab.width * Math.min(tab.dpr, 1.5)),
        maxHeight: Math.round(tab.height * Math.min(tab.dpr, 1.5)),
        everyNthFrame: 1,
      }, tab.cdpSessionId)
    } catch {
      tab.screencasting = false
    }
  }

  async _restartScreencast(tab) {
    if (!tab.screencasting || !this.cdp || this.cdp.closed || tab.closed) return
    tab.screencasting = false
    await this.cdp.send('Page.stopScreencast', {}, tab.cdpSessionId).catch(() => {})
    await this._ensureScreencast(tab)
  }

  async poll(tabId, { stateSeq = 0, frameSeq = 0 } = {}, signal = null) {
    const tab = this.getTab(tabId)
    await this._ensureScreencast(tab)

    const buildPayload = () => ({
      stateSeq: tab.stateSeq,
      state: tab.stateSeq > stateSeq ? tab.publicState() : undefined,
      frameSeq: tab.frameSeq,
      frame: tab.frameSeq > frameSeq ? tab.lastFrame : undefined,
    })

    if (tab.stateSeq > stateSeq || tab.frameSeq > frameSeq) {
      return buildPayload()
    }

    await new Promise(resolve => {
      let done = false
      const finish = () => {
        if (done) return
        done = true
        clearTimeout(timer)
        tab.waiters.delete(finish)
        signal?.removeEventListener('abort', finish)
        resolve()
      }
      const timer = setTimeout(finish, 10000)
      tab.waiters.add(finish)
      signal?.addEventListener('abort', finish, { once: true })
    })

    return buildPayload()
  }

  async navigate(tabId, rawUrl, appOrigin = '') {
    const tab = this.getTab(tabId)
    const targetUrl = normalizeTargetUrl(rawUrl, appOrigin || tab.appOrigin)
    tab.error = ''
    tab.loading = true
    tab.url = targetUrl
    tab.notifyState()
    const cdp = await this.ensureStarted()
    const result = await cdp.send('Page.navigate', { url: targetUrl }, tab.cdpSessionId)
    if (result?.errorText) {
      tab.loading = false
      tab.error = `页面加载失败：${result.errorText}`
      tab.notifyState()
    }
    return tab.publicState()
  }

  async back(tabId) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    const history = await cdp.send('Page.getNavigationHistory', {}, tab.cdpSessionId)
    const idx = history.currentIndex ?? 0
    const entries = history.entries || []
    const firstReal = entries.findIndex(e => e.url && e.url !== 'about:blank')
    const minIdx = firstReal >= 0 ? firstReal : 0
    if (idx > minIdx) {
      tab.error = ''
      tab.loading = true
      tab.notifyState()
      await cdp.send('Page.navigateToHistoryEntry', { entryId: entries[idx - 1].id }, tab.cdpSessionId)
    }
    return tab.publicState()
  }

  async forward(tabId) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    const history = await cdp.send('Page.getNavigationHistory', {}, tab.cdpSessionId)
    const idx = history.currentIndex ?? 0
    const entries = history.entries || []
    if (idx < entries.length - 1) {
      tab.error = ''
      tab.loading = true
      tab.notifyState()
      await cdp.send('Page.navigateToHistoryEntry', { entryId: entries[idx + 1].id }, tab.cdpSessionId)
    }
    return tab.publicState()
  }

  async reload(tabId) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    tab.error = ''
    tab.loading = true
    tab.notifyState()
    await cdp.send('Page.reload', {}, tab.cdpSessionId)
    return tab.publicState()
  }

  async stop(tabId) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    await cdp.send('Page.stopLoading', {}, tab.cdpSessionId).catch(() => {})
    tab.loading = false
    tab.notifyState()
    return tab.publicState()
  }

  async resize(tabId, width, height, dpr) {
    const tab = this.getTab(tabId)
    const w = clamp(width, MIN_WIDTH, MAX_WIDTH, tab.width)
    const h = clamp(height, MIN_HEIGHT, MAX_HEIGHT, tab.height)
    const scale = Math.max(1, Math.min(2, Number(dpr) || tab.dpr))
    if (w === tab.width && h === tab.height && Math.abs(scale - tab.dpr) < 0.05) {
      return tab.publicState()
    }
    tab.width = w
    tab.height = h
    tab.dpr = scale
    const cdp = await this.ensureStarted()
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: w, height: h, deviceScaleFactor: scale, mobile: false,
    }, tab.cdpSessionId)
    await this._restartScreencast(tab)
    return tab.publicState()
  }

  async copySelection(tabId) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    const res = await cdp.send('Runtime.evaluate', {
      expression: 'String(window.getSelection ? window.getSelection().toString() : "")',
      returnByValue: true,
    }, tab.cdpSessionId)
    return { text: String(res?.result?.value || '') }
  }

  async dispatchInput(tabId, payload) {
    const tab = this.getTab(tabId)
    const cdp = await this.ensureStarted()
    const kind = payload?.kind
    if (kind === 'mouse') {
      const type = payload.type
      if (!['mouseMoved', 'mousePressed', 'mouseReleased'].includes(type)) return { ok: true }
      await cdp.send('Input.dispatchMouseEvent', {
        type,
        x: Math.max(0, Math.min(tab.width, Number(payload.x) || 0)),
        y: Math.max(0, Math.min(tab.height, Number(payload.y) || 0)),
        button: payload.button || 'none',
        buttons: Number(payload.buttons) || 0,
        clickCount: Number(payload.clickCount) || (type === 'mouseMoved' ? 0 : 1),
        modifiers: Number(payload.modifiers) || 0,
      }, tab.cdpSessionId)
      return { ok: true }
    }
    if (kind === 'wheel') {
      await cdp.send('Input.dispatchMouseEvent', {
        type: 'mouseWheel',
        x: Math.max(0, Math.min(tab.width, Number(payload.x) || 0)),
        y: Math.max(0, Math.min(tab.height, Number(payload.y) || 0)),
        deltaX: Number(payload.deltaX) || 0,
        deltaY: Number(payload.deltaY) || 0,
        modifiers: Number(payload.modifiers) || 0,
      }, tab.cdpSessionId)
      return { ok: true }
    }
    if (kind === 'key') {
      const type = payload.type
      if (!['rawKeyDown', 'keyDown', 'keyUp', 'char'].includes(type)) return { ok: true }
      const params = {
        type,
        key: typeof payload.key === 'string' ? payload.key : undefined,
        code: typeof payload.code === 'string' ? payload.code : undefined,
        windowsVirtualKeyCode: Number.isFinite(Number(payload.keyCode)) ? Number(payload.keyCode) : undefined,
        nativeVirtualKeyCode: Number.isFinite(Number(payload.keyCode)) ? Number(payload.keyCode) : undefined,
        text: typeof payload.text === 'string' ? payload.text : undefined,
        unmodifiedText: typeof payload.text === 'string' ? payload.text : undefined,
        modifiers: Number(payload.modifiers) || 0,
      }
      await cdp.send('Input.dispatchKeyEvent', params, tab.cdpSessionId)
      return { ok: true }
    }
    if (kind === 'insertText') {
      const text = typeof payload.text === 'string' ? payload.text : ''
      if (text) {
        await cdp.send('Input.insertText', { text }, tab.cdpSessionId)
      }
      return { ok: true }
    }
    throw failure('不支持的输入事件类型。')
  }

  async closeTab(tabId) {
    const tab = this.tabs.get(tabId)
    if (!tab) return { ok: true }
    tab.closed = true
    clearTimeout(tab.screencastStopTimer)
    tab.wakeWaiters()
    this.tabs.delete(tab.id)
    this.targetToTab.delete(tab.targetId)
    this.sessionToTab.delete(tab.cdpSessionId)
    if (this.cdp && !this.cdp.closed) {
      await this.cdp.send('Page.stopScreencast', {}, tab.cdpSessionId).catch(() => {})
      await this.cdp.send('Target.closeTarget', { targetId: tab.targetId }).catch(() => {})
    }
    return { ok: true }
  }

  _gcIdleTabs() {
    const cutoff = Date.now() - IDLE_TAB_MS
    for (const tab of this.tabs.values()) {
      if (tab.waiters.size === 0 && tab.lastActive < cutoff) {
        void this.closeTab(tab.id)
      }
    }
  }

  dispose() {
    this.disposed = true
    clearInterval(this.gcTimer)
    for (const tab of this.tabs.values()) {
      tab.closed = true
      clearTimeout(tab.screencastStopTimer)
      tab.wakeWaiters()
    }
    this.tabs.clear()
    this.targetToTab.clear()
    this.sessionToTab.clear()
    try { this.cdp?.close() } catch {}
    this.cdp = null
    if (this.proc && this.proc.exitCode === null) {
      try { this.proc.kill() } catch {}
    }
    this.proc = null
  }
}

export function registerBrowser(ctx) {
  const manager = new LiveBrowserManager()
  const onExit = () => manager.dispose()
  process.once('exit', onExit)

  ctx.effect(() => () => {
    process.off('exit', onExit)
    manager.dispose()
  }, 'Weave live browser daemon')

  function jsonRoute(subpath, handler) {
    ctx.connection.fetch.register({
      path: '/api/labweave/browser/' + subpath,
      methods: ['POST'],
      requestBody: 'buffered',
      async fetch(request) {
        try {
          const data = await request.json()
          if (!data || typeof data !== 'object' || Array.isArray(data)) throw failure('无效请求。')
          const origin = request.headers.get('origin') || new URL(request.url).origin
          const result = await handler(data, origin, request.signal)
          return Response.json(result, { headers: { 'Cache-Control': 'no-store' } })
        } catch (error) {
          return Response.json(
            { error: error?.status ? error.message : (error?.message || '浏览器服务暂不可用，请重试。') },
            { status: error?.status || 503, headers: { 'Cache-Control': 'no-store' } },
          )
        }
      },
    })
  }

  jsonRoute('create', async (data, origin) => manager.createTab({
    width: data.width,
    height: data.height,
    dpr: data.dpr,
    url: data.url,
    appOrigin: origin,
  }))

  jsonRoute('action', async (data, origin) => {
    const { tabId, action } = data
    if (typeof tabId !== 'string' || !tabId) throw failure('缺少浏览器标签页标识。')
    if (action === 'navigate') return manager.navigate(tabId, data.url, origin)
    if (action === 'back') return manager.back(tabId)
    if (action === 'forward') return manager.forward(tabId)
    if (action === 'reload') return manager.reload(tabId)
    if (action === 'stop') return manager.stop(tabId)
    if (action === 'resize') return manager.resize(tabId, data.width, data.height, data.dpr)
    if (action === 'copySelection') return manager.copySelection(tabId)
    if (action === 'close') return manager.closeTab(tabId)
    if (action === 'state') return manager.getTab(tabId).publicState()
    throw failure('不支持的浏览器操作。')
  })

  jsonRoute('input', async data => {
    const { tabId } = data
    if (typeof tabId !== 'string' || !tabId) throw failure('缺少浏览器标签页标识。')
    return manager.dispatchInput(tabId, data)
  })

  jsonRoute('poll', async (data, _origin, signal) => {
    const { tabId, stateSeq, frameSeq } = data
    if (typeof tabId !== 'string' || !tabId) throw failure('缺少浏览器标签页标识。')
    return manager.poll(tabId, { stateSeq: Number(stateSeq) || 0, frameSeq: Number(frameSeq) || 0 }, signal)
  })
}
