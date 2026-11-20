import { readFileSync } from 'node:fs'

// The pinned runtime emits this plain-text response before index HTML exists.
// Keep its admission decision, redirects, cookies, and empty HEAD response.
const nativeLoginMessage = 'dsh web authentication required; reopen the URL printed by dsh web.\n'
const loginHelp = {
  zh: '请回到启动 Weave 时打开的浏览器窗口，或使用本次启动的登录链接。',
  en: 'Return to the browser window opened by Weave, or use the login link for this session.',
  ja: 'Weave の起動時に開いたブラウザーウィンドウに戻るか、今回のログインリンクを使ってください。',
  es: 'Vuelve a la ventana del navegador que abrió Weave o usa el enlace de acceso de esta sesión.',
  fr: 'Revenez à la fenêtre du navigateur ouverte par Weave ou utilisez le lien de connexion de cette session.',
  de: 'Kehre zum Browserfenster zurück, das Weave geöffnet hat, oder verwende den Anmeldelink für diese Sitzung.',
  ru: 'Вернитесь в окно браузера, открытое при запуске Weave, или используйте ссылку для входа в этот сеанс.',
  pt: 'Volte à janela do navegador aberta pelo Weave ou use o link de acesso desta sessão.',
}

function localLoginHelp(acceptLanguage) {
  if (!acceptLanguage) return loginHelp.zh
  const preferences = String(acceptLanguage).toLowerCase().split(',').map(entry => {
    const [tag, quality = 'q=1'] = entry.trim().split(/\s*;\s*/)
    return { language: tag.split('-')[0], quality: Number(quality.replace(/^q=/, '')) }
  })
  const best = preferences.filter(p => p.quality > 0 && Object.hasOwn(loginHelp, p.language))
    .sort((a, b) => b.quality - a.quality)[0]
  return loginHelp[best?.language] ?? loginHelp.en
}

function brandIndexLoginMessage(connection) {
  const ownMethod = Object.getOwnPropertyDescriptor(connection, 'authorizeIndex')
  const authorizeIndex = connection.authorizeIndex
  function brandedIndex(request, response) {
    let status
    return authorizeIndex.call(this, request, {
      writeHead(code, headers) {
        status = code
        return response.writeHead(code, headers)
      },
      end(body) {
        if (status === 401 && body === nativeLoginMessage) {
          const language = request.headers.get?.('accept-language') ?? request.headers['accept-language'] ?? ''
          body = localLoginHelp(language) + '\n'
        }
        return response.end(body)
      },
    })
  }
  connection.authorizeIndex = brandedIndex
  return () => {
    // Cordis wraps method reads; compare the installed descriptor on disposal.
    if (Object.getOwnPropertyDescriptor(connection, 'authorizeIndex')?.value !== brandedIndex) return
    if (ownMethod) Object.defineProperty(connection, 'authorizeIndex', ownMethod)
    else delete connection.authorizeIndex
  }
}

export function registerBranding(ctx) {
  const asset = file => readFileSync(new URL('../client/assets/' + file, import.meta.url))
  function serve(paths, type, bytes) {
    for (const path of paths) {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact', path,
        resource: () => new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } }),
      }), 'Weave brand ' + path)
    }
  }
  serve(['/weave-orbit.svg', '/labweave-orbit.svg', '/favicon.svg', '/favicon-dark.svg'], 'image/svg+xml', asset('labweave-orbit.svg'))
  serve(['/labweave-bot-avatars.svg'], 'image/svg+xml', asset('bot-avatars.svg'))
  serve(['/labweave-bot-avatars.json'], 'application/json', asset('bot-avatars.json'))
  serve(['/labweave-tools-panel.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/tools-panel.js', import.meta.url)))
  serve(['/labweave-browser-panel.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/browser-panel.js', import.meta.url)))
  serve(['/labweave-bot-workbench.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/bot-workbench.js', import.meta.url)))
  serve(['/labweave-goal-planner.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/goal-planner.js', import.meta.url)))
  serve(['/labweave-notebook.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/notebook.js', import.meta.url)))
  serve(['/labweave-research-map.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/research-map.js', import.meta.url)))
  serve(['/labweave-idea-cards.js'], 'text/javascript; charset=utf-8',
    readFileSync(new URL('../client/idea-cards.js', import.meta.url)))
  serve(['/icon-192.png', '/apple-touch-icon.png'], 'image/png', asset('orbit-192.png'))
  serve(['/icon-512.png'], 'image/png', asset('orbit-512.png'))
  serve(['/icon-maskable-512.png'], 'image/png', asset('orbit-maskable-512.png'))
  serve(['/manifest.webmanifest'], 'application/manifest+json', JSON.stringify({
    name: 'Weave', short_name: 'Weave', start_url: './', scope: './', display: 'standalone',
    background_color: '#ffffff', theme_color: '#ffffff',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }))
  ctx.effect(() => ctx.webServer.tapIndex(html => html
    .replace(/<title>[^<]*<\/title>/i, '<title>Weave</title>')
    .replace(/(name="apple-mobile-web-app-title" content=")[^"]*(")/, '$1Weave$2')
  ), 'Weave browser branding')
  ctx.effect(() => brandIndexLoginMessage(ctx.connection), 'Weave index login message')
}
