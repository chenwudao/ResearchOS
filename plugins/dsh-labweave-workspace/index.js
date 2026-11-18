import { readFileSync } from 'node:fs'

export const name = 'labweave-research-workspace'
export const inject = ['webServer']

export function apply(ctx) {
  const asset = file => readFileSync(new URL(file, import.meta.url))
  function serve(paths, type, bytes) {
    for (const path of paths) {
      ctx.effect(() => ctx.webServer.register({
        kind: 'exact', path,
        resource: () => new Response(bytes, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } }),
      }), 'LabWeave brand ' + path)
    }
  }
  serve(['/labweave-orbit.svg', '/favicon.svg', '/favicon-dark.svg'], 'image/svg+xml', asset('./labweave-orbit.svg'))
  serve(['/icon-192.png', '/apple-touch-icon.png'], 'image/png', asset('./orbit-192.png'))
  serve(['/icon-512.png'], 'image/png', asset('./orbit-512.png'))
  serve(['/icon-maskable-512.png'], 'image/png', asset('./orbit-maskable-512.png'))
  serve(['/manifest.webmanifest'], 'application/manifest+json', JSON.stringify({
    name: 'leaweave', short_name: 'leaweave', start_url: './', scope: './', display: 'standalone',
    background_color: '#ffffff', theme_color: '#ffffff',
    icons: [
      { src: 'icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: 'icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: 'icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  }))
  ctx.effect(() => ctx.webServer.tapIndex(html => html
    .replace(/(href=["'])(?:\.?\/)?favicon(?:-dark)?\.svg(["'])/g, '$1./labweave-orbit.svg$2')
    .replace(/(name="apple-mobile-web-app-title" content=")[^"]*(")/, '$1leaweave$2')
  ), 'LabWeave browser branding')
}
