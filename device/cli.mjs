import { spawn } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { createInterface } from 'node:readline'
import { fileURLToPath } from 'node:url'
import { parseArgs } from 'node:util'
import { trackCodex } from './codex.mjs'
import { SimulatedDock, UsbDock } from './dock.mjs'
import { defaultPort, startDeviceServer, statePath } from './server.mjs'
import { eegTiming } from './session.mjs'

const options = {
  port: { type: 'string' }, 'state-dir': { type: 'string' }, dock: { type: 'string' },
  eeg: { type: 'string' }, python: { type: 'string' }, channels: { type: 'string' },
}

function recordEeg(values, session) {
  const path = fileURLToPath(new URL('./brainflow_capture.py', import.meta.url))
  const child = spawn(values.python || 'python3', [path, '--port', values.eeg, '--channels', values.channels || '1,2,3',
    '--frequency', String(eegTiming.frequency), '--window-ms', String(eegTiming.sampleMs)], { stdio: ['ignore', 'pipe', 'inherit'] })
  child.on('error', (error) => console.error('EEG recorder:', error.message))
  child.on('close', () => {
    session.lastSignalAt = null
    if (session.window) session.endWindow('signal-lost')
  })
  const lines = createInterface({ input: child.stdout })
  lines.on('line', (line) => {
    try { session.score(JSON.parse(line)) } catch (error) { console.error('EEG recorder:', error.message) }
  })
  return child
}

async function serve(values, port) {
  let dock
  if (values.dock) {
    const { SerialPort, ReadlineParser } = await import('serialport')
    dock = new UsbDock(values.dock, SerialPort, ReadlineParser)
  } else dock = new SimulatedDock()
  const eeg = values.eeg ? 'brainflow' : values.dock ? 'off' : 'simulation'
  const eegProfile = values.eeg ? createHash('sha256').update(JSON.stringify({ port: values.eeg, channels: values.channels || '1,2,3', timing: eegTiming, decoder: 1 })).digest('hex') : null
  const dist = fileURLToPath(new URL('../dist/', import.meta.url))
  let bridge
  try { bridge = await startDeviceServer({ port, stateRoot: values['state-dir'], dist, dock, eeg, eegProfile }) }
  catch (error) { dock.close(); throw error }
  const recorder = values.eeg ? recordEeg(values, bridge.session) : null
  console.log(`Codex Device: ${bridge.origin}`)
  for (const event of ['SIGINT', 'SIGTERM']) process.once(event, async () => {
    recorder?.kill()
    await bridge.close()
  })
}

async function track(values, port, positionals) {
  const prompt = positionals.join(' ').trim()
  if (!prompt) throw new Error('Pass a Codex prompt after --.')
  const path = statePath(port, values['state-dir'])
  const { origin, token } = JSON.parse(readFileSync(join(path, 'bridge.json'), 'utf8'))
  if (origin !== `http://127.0.0.1:${port}` || typeof token !== 'string') throw new Error('Invalid local device address.')
  const health = await fetch(`${origin}/api/state`, { signal: AbortSignal.timeout(2000) })
  if (!health.ok) throw new Error('Start the local device console first.')
  const id = randomUUID()
  const result = await trackCodex(prompt)
  console.log(result)
  const response = await fetch(`${origin}/api/run`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ id, result: result.slice(0, 24000) }), signal: AbortSignal.timeout(5000),
  })
  if (!response.ok) throw new Error('Codex finished, but the bridge did not confirm receipt.')
  console.log(`Recorded tracked run ${id} in the device console.`)
}

try {
  const [mode, ...args] = process.argv.slice(2)
  const { values, positionals } = parseArgs({ args, options, allowPositionals: true })
  const port = values.port ? Number(values.port) : defaultPort
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid device port.')
  if (mode === 'serve') await serve(values, port)
  else if (mode === 'track') await track(values, port, positionals)
  else throw new Error('Usage: node device/cli.mjs (serve | track) [--port NUMBER] [-- prompt]')
} catch (error) {
  console.error(error.code === 'ENOENT' ? 'Start the device console and check the local CLI and hardware setup.' : error.message)
  process.exitCode = 1
}
