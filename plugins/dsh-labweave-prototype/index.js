import { registerNative } from './native.js'

export const name = 'labweave-dsh-prototype'
const port = process.env.LABWEAVE_BRIDGE_PORT
const token = process.env.LABWEAVE_BRIDGE_TOKEN
if (token) delete process.env.LABWEAVE_BRIDGE_TOKEN
export const inject = port ? ['connection', 'workspaceRegistry', 'tools', 'sessions', 'systemPrompt', 'schedule'] : ['connection']

const MAX_SNAPSHOT_BYTES = 50 * 1024 * 1024

// Only a loopback port is configurable: never accept an arbitrary upstream URL.
export async function loadProjects(fetchImpl = fetch, port = 8765) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('invalid backend port')
  const response = await fetchImpl(`http://127.0.0.1:${port}/api/workspace/state`, {
    method: 'GET', redirect: 'error', signal: AbortSignal.timeout(5000),
  })
  if (!response.ok || !response.body) throw new Error('workspace unavailable')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > MAX_SNAPSHOT_BYTES) throw new Error('workspace response too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const body = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.byteLength }
  const snapshot = JSON.parse(new TextDecoder().decode(body))
  // A fresh workspace has revision 0 without a state yet.
  const projects = snapshot.revision === 0 && snapshot.state === undefined ? [] : snapshot.state?.projects
  if (!Array.isArray(projects)) throw new Error('invalid workspace response')
  return projects.filter((project) => project && typeof project.id === 'string' && typeof project.name === 'string')
    .map((project) => ({ id: project.id, name: project.name }))
}

async function readLimited(response, limit) {
  if (!response.body) throw new Error('empty response')
  const reader = response.body.getReader()
  const chunks = []
  let size = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      size += value.byteLength
      if (size > limit) throw new Error('response too large')
      chunks.push(value)
    }
  } finally {
    await reader.cancel().catch(() => {})
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return JSON.parse(new TextDecoder().decode(bytes))
}

// The DSH owner connection authenticates this route before dispatch. Only the
// assistant display name is proxied; project data and model keys are not.
export async function assistantNameRequest(request, fetchImpl = fetch) {
  if (!['GET', 'POST'].includes(request.method)) return new Response(null, { status: 405 })
  const options = { method: request.method, redirect: 'error', signal: AbortSignal.timeout(5000) }
  if (request.method === 'POST') {
    try {
      const text = await request.text()
      if (new TextEncoder().encode(text).length > 1024) throw new Error('too large')
      const value = JSON.parse(text)
      if (!value || typeof value.name !== 'string' || Object.keys(value).some((key) => key !== 'name')) throw new Error('invalid')
      options.headers = { 'Content-Type': 'application/json' }
      options.body = JSON.stringify({ name: value.name })
    } catch {
      return Response.json({ error: 'invalid_request' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    }
  }
  try {
    const result = await fetchImpl('http://127.0.0.1:8765/api/workspace/assistant/name', options)
    if (result.status === 400) return Response.json({ error: 'invalid_name' }, { status: 400, headers: { 'Cache-Control': 'no-store' } })
    if (!result.ok) throw new Error('backend unavailable')
    const data = await readLimited(result, 2048)
    if (!data || typeof data.name !== 'string' || Array.from(data.name).length > 80) throw new Error('invalid response')
    return Response.json({ name: data.name }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return Response.json({ error: 'workspace_unavailable' }, { status: 503, headers: { 'Cache-Control': 'no-store' } })
  }
}

export async function apply(ctx) {
  if (port) return registerNative(ctx, port, token)
  ctx.connection.fetch.register({
    path: '/api/labweave/assistant-name', methods: ['GET', 'POST'], requestBody: 'buffered',
    fetch: assistantNameRequest,
  })
}
