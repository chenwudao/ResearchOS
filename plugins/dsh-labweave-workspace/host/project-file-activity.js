import { lstatSync, readdirSync, realpathSync } from 'node:fs'
import { isAbsolute, join, relative, resolve, sep } from 'node:path'

const fileTools = new Set(['write', 'edit'])
const commandTools = new Set(['bash', 'powershell', 'pwsh', 'apply_patch'])
const scanLimit = 5000

function inside(root, filename) {
  const suffix = relative(root, filename)
  return Boolean(suffix) && suffix !== '..' && !suffix.startsWith('..' + sep) && !isAbsolute(suffix)
}

function signature(target) {
  const stat = lstatSync(target, { bigint: true, throwIfNoEntry: false })
  // Execution permissions may change file metadata without changing project content.
  return stat?.isFile() ? [stat.ino, stat.size, stat.mtimeNs].join('/') : undefined
}

function fileSnapshot(root, target) {
  const files = new Map()
  function add(filename) {
    const entry = signature(filename)
    if (entry !== undefined) files.set(relative(root, filename).split(sep).join('/'), entry)
  }
  if (target) {
    // Check existing ancestors also when the target is about to be created.
    for (let ancestor = target; inside(root, ancestor); ancestor = resolve(ancestor, '..')) {
      try {
        const canonical = realpathSync(ancestor)
        if (!inside(root, canonical) || relative(ancestor, canonical)) return files
        break
      } catch (error) {
        if (error.code !== 'ENOENT') throw error
      }
    }
    add(target)
    return files
  }
  const todo = [root]
  let visited = 0
  while (todo.length) {
    const directory = todo.pop()
    for (const item of readdirSync(directory, { withFileTypes: true })) {
      if (++visited > scanLimit) return null
      if (item.name === '.git') continue
      const name = join(directory, item.name)
      if (item.isDirectory()) todo.push(name)
      else if (item.isFile()) add(name)
    }
  }
  return files
}

export function registerProjectFileActivity(ctx, { caller, call }) {
  const calls = new Map()
  const active = new Map()
  ctx.on('session/event', (session, event) => {
    if (event.type !== 'tool/call' && event.type !== 'tool/result' && event.type !== 'turn/end') return
    if (event.type === 'turn/end') {
      for (const [key, run] of calls) {
        if (run.session !== session.id) continue
        calls.delete(key)
        active.get(run.root)?.delete(run)
        if (!active.get(run.root)?.size) active.delete(run.root)
      }
      return
    }
    if (event.type === 'tool/call') {
      const { name, callId } = event.data
      if (!callId || (!fileTools.has(name) && !commandTools.has(name))) return
      try {
        const { workspace, row, delegated } = caller({ agent: { session } })
        if (row.scope === 'global') return
        const root = realpathSync(workspace.path)
        const args = event.data.arguments ?? event.data.args
        const requested = fileTools.has(name) && typeof args === 'string' ? JSON.parse(args) : args
        const filename = requested?.path || requested?.file_path
        const target = fileTools.has(name) && typeof filename === 'string'
          ? resolve(session.header.cwd || root, filename) : undefined
        if (fileTools.has(name) && (!target || !inside(root, target) || relative(root, target).split(sep).includes('.git'))) return
        const before = fileSnapshot(root, target)
        if (!before) return
        const run = { root, workspace, session: session.id, owner: delegated?.parentId || session.id, before, target }
        const siblings = active.get(root) || new Set()
        for (const other of siblings) {
          if (run.owner === other.owner) continue
          // A broad command scan cannot attribute edits from an overlapping chat.
          if (!other.target) other.overlap = true
          if (!target) run.overlap = true
        }
        siblings.add(run)
        active.set(root, siblings)
        calls.set(session.id + '/' + callId, run)
      } catch {}
      return
    }
    const key = session.id + '/' + event.data.message?.toolCallId
    const run = calls.get(key)
    if (!run) return
    calls.delete(key)
    const siblings = active.get(run.root)
    siblings?.delete(run)
    if (!siblings?.size) active.delete(run.root)
    if (run.overlap) return
    try {
      const after = fileSnapshot(run.root, run.target)
      if (!after) return
      const files = []
      for (const [path, stamp] of after) {
        if (!run.before.has(path)) files.push({ path, action: 'added' })
        else if (run.before.get(path) !== stamp) files.push({ path, action: 'changed' })
      }
      for (const path of run.before.keys()) {
        if (!after.has(path)) files.push({ path, action: 'removed' })
      }
      if (files.length) void call('project-flow', { workspace: run.workspace, action: 'file-change',
        sessionId: run.owner, messageId: session.id + '/' + event.seq, files: files.slice(0, 100) }).catch(() => {})
    } catch {}
  })
}
