import { execFile } from 'node:child_process'
import { isSea } from 'node:sea'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'
import { toolLabels } from './assistant-history.js'
import { displayAssignment } from './bot-assignments.js'
import { registerBranding } from './branding.js'
import { registerBrowser } from './browser.js'
import { registerNative } from './native.js'

export const name = 'labweave-research-workspace'
export const inject = ['webServer', 'connection', 'workspaceRegistry', 'tools', 'sessions', 'sessionController',
  'sessionPersistence', 'sessionQuery', 'sessionReferenceResolver', 'permissionPresets', 'systemPrompt', 'schedule', 'sandboxPolicy',
  'llm', 'agents', 'agentDefaultModel', 'subagents']

const port = process.env.LABWEAVE_BRIDGE_PORT
const token = process.env.LABWEAVE_BRIDGE_TOKEN
if (token) delete process.env.LABWEAVE_BRIDGE_TOKEN

export async function apply(ctx) {
  const pickerPython = process.env.LABWEAVE_WINDOWS_PICKER_PYTHON
  if (process.platform === 'win32' && isSea() && pickerPython) {
    // The 0.2.2rc2 EXE treats the native picker worker path as a profile name.
    const script = fileURLToPath(new URL('./windows-directory-picker.py', import.meta.url))
    const runFile = promisify(execFile)
    ctx.inject(['directoryPicker'], scope => {
      const capability = scope.directoryPicker.capability()
      if (capability.kind !== 'native') return
      scope.effect(() => {
        const original = capability.pick
        const pick = async signal => {
          const { stdout } = await runFile(pickerPython, ['-I', script], { signal, windowsHide: true })
          return JSON.parse(stdout)
        }
        capability.pick = pick
        return () => { if (capability.pick === pick) capability.pick = original }
      }, 'Weave Windows native directory picker')
    })
  }
  registerBranding(ctx)
  registerBrowser(ctx)
  const labels = JSON.stringify(toolLabels).replaceAll('<', '\\u003c')
  const metadata = `<script type="application/json" id="weave-tool-labels">${labels}</script>`
  ctx.effect(() => ctx.webServer.tapIndex(html => html.replace('</head>', () => metadata + '</head>')), 'Weave tool display names')

  // The scheduler UI opens and edits a copy of the catalog row. Leave its
  // stored prompt, execution target and compare-and-swap revision intact.
  ctx.effect(() => {
    const schedule = ctx.schedule
    const own = Object.getOwnPropertyDescriptor(schedule, 'catalog')
    const catalog = schedule.catalog
    const displayCatalog = async function (...args) {
      return (await catalog.apply(this, args)).map(displayAssignment)
    }
    schedule.catalog = displayCatalog
    return () => {
      if (Object.getOwnPropertyDescriptor(schedule, 'catalog')?.value !== displayCatalog) return
      if (own) Object.defineProperty(schedule, 'catalog', own)
      else delete schedule.catalog
    }
  }, 'Weave scheduled task descriptions')
  return registerNative(ctx, port, token)
}
