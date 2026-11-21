import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { DeviceSession } from './session.mjs'

export const defaultPort = 8787
const defaultStateRoot = join(process.env.XDG_STATE_HOME || join(homedir(), '.local', 'state'), 'olfactory-device')
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml' }
const csp = "default-src 'self'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'"

export function statePath(port, stateRoot = defaultStateRoot) {
  return join(stateRoot, `device-${port}`)
}

function send(response, status, body, type = 'application/json; charset=utf-8') {
  response.writeHead(status, { 'Content-Type': type, 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': csp })
  response.end(type.startsWith('application/json') ? JSON.stringify(body) : body)
}

async function readJson(request) {
  let size = 0
  const chunks = []
  if (request.headers['content-type']?.split(';')[0] !== 'application/json') {
    throw Object.assign(new Error('Expected a JSON request.'), { statusCode: 415 })
  }
  for await (const chunk of request) {
    size += chunk.length
    if (size > 128000) throw Object.assign(new Error('Request is too large.'), { statusCode: 413 })
    chunks.push(chunk)
  }
  const body = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new SyntaxError('Expected an object.')
  return body
}

export async function startDeviceServer({ port = defaultPort, stateRoot, dist, dock, eeg, eegProfile }) {
  const token = randomBytes(32).toString('hex')
  let session
  let origin
  const server = createServer(async (request, response) => {
    try {
      if (!session) return send(response, 503, { error: 'Device is starting.' })
      if (request.headers.host !== new URL(origin).host) return send(response, 403, { error: 'Use the local device address.' })
      const url = new URL(request.url, origin)
      if (url.origin !== origin) return send(response, 403, { error: 'Use the local device address.' })
      const { pathname } = url
      if (request.method === 'POST') {
        if (pathname === '/api/run') {
          if (request.headers.authorization !== `Bearer ${token}`) return send(response, 403, { error: 'A local tracking key is required.' })
          const { id, result } = await readJson(request)
          return send(response, 200, session.finish({ id, result, source: 'codex' }))
        }
        if (pathname === '/api/control') {
          if (request.headers.origin !== origin) return send(response, 403, { error: 'Control requests must come from this console.' })
          return send(response, 200, session.control(await readJson(request)) ?? {})
        }
      }
      if (request.method === 'GET') {
        if (pathname === '/api/state') return send(response, 200, session.snapshot(url.searchParams.get('owner')))
        if (pathname === '/api/trials.ndjson') {
          response.setHeader('Content-Disposition', 'attachment; filename="olfactory-trials.ndjson"')
          return send(response, 200, session.exportTrials(), 'application/x-ndjson; charset=utf-8')
        }
        if (pathname === '/api/result') {
          const run = session.runs.get(url.searchParams.get('id'))
          if (run?.opened) return send(response, 200, { id: run.id, result: run.result, via: run.opened.via })
        }
        if (dist && ['/', '/device.html'].includes(pathname)) {
          const html = join(dist, 'device.html')
          if (existsSync(html)) return send(response, 200, readFileSync(html), types['.html'])
          return send(response, 503, { error: 'Build the device console with npm run build.' })
        }
        const asset = /^\/assets\/([a-z\d_-]+)(\.js|\.css|\.svg)$/i.exec(pathname)
        if (dist && asset) {
          const path = join(dist, 'assets', asset[1] + asset[2])
          if (existsSync(path)) return send(response, 200, readFileSync(path), types[asset[2]])
        }
      }
      return send(response, 404, { error: 'Unknown device endpoint.' })
    } catch (error) {
      const status = error.statusCode || (error instanceof SyntaxError ? 400 : 500)
      if (!response.headersSent && !response.destroyed) {
        send(response, status, { error: status === 500 ? 'The device request failed. Check the local console.' : error.message })
      }
      if (status === 500) console.error(error)
    }
  })
  await new Promise((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, '127.0.0.1', resolve)
  })
  const actualPort = server.address().port
  origin = `http://127.0.0.1:${actualPort}`
  const directory = statePath(actualPort, stateRoot)
  try {
    mkdirSync(directory, { recursive: true, mode: 0o700 })
    session = new DeviceSession({ journal: join(directory, 'trials.ndjson'), dock, eeg, eegProfile })
    writeFileSync(join(directory, 'bridge.json'), JSON.stringify({ origin, token }), { mode: 0o600 })
  } catch (error) {
    server.close()
    throw error
  }
  const tick = setInterval(() => session.expireWindow(), 150)
  return {
    origin, token, session,
    async close() {
      clearInterval(tick)
      dock.close()
      await new Promise((resolve) => server.close(resolve))
    },
  }
}
