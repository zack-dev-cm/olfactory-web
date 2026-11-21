import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import { resultReader } from '../device/codex.mjs'
import { DeviceSession, eegTiming } from '../device/session.mjs'
import { startDeviceServer } from '../device/server.mjs'

function fixture(t, mode = 'simulation') {
  const root = mkdtempSync(join(tmpdir(), 'olfactory-device-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const journal = join(root, 'trials.ndjson')
  const callbacks = []
  const dock = {
    mode, status: 'ready', ready: true, muteCount: 0,
    deliver(id, condition, phase) { callbacks.push({ id, condition, phase }); phase('acknowledged') },
    mute() { this.muteCount++ },
    close() {},
  }
  return { root, journal, dock, callbacks }
}

const run = (id = randomUUID()) => ({ id, result: 'private result marker', source: 'codex' })

test('records one cue, consumes one arm, and never retransmits uncertain output after restart', (t) => {
  const { journal, dock, callbacks } = fixture(t)
  const session = new DeviceSession({ journal, dock })
  const first = run()
  session.control({ action: 'arm', condition: 'scent' })
  assert.deepEqual(session.finish(first), { id: first.id, duplicate: false })
  assert.deepEqual(session.finish(first), { id: first.id, duplicate: true })
  assert.equal(session.snapshot().armed, null)
  const next = run()
  session.finish(next)
  assert.equal(callbacks.length, 1)
  assert.equal(session.runs.get(next.id).phase, 'no-cue')

  const restarted = new DeviceSession({ journal, dock })
  assert.equal(restarted.runs.get(first.id).phase, 'unconfirmed')
  assert.equal(restarted.finish(first).duplicate, true)
  assert.equal(callbacks.length, 1)
  assert.doesNotMatch(restarted.exportTrials(), /private result marker/)
})

test('blinds the trial until feedback and records observed timings only on physical trials', (t) => {
  const { journal, dock, callbacks } = fixture(t, 'usb')
  const session = new DeviceSession({ journal, dock, eeg: 'off' })
  const { id, ...rest } = run()
  session.control({ action: 'arm', condition: 'random' })
  session.finish({ id, ...rest })
  callbacks[0].phase('purged')
  assert.equal(session.snapshot().runs[0].condition, 'blinded')
  session.control({ action: 'feedback', id, rating: { noticed: 'yes', intensity: 4, clarity: 3, comfort: 7, notes: '' } })
  assert.equal(session.snapshot().runs[0].condition, callbacks[0].condition)
  assert.throws(() => session.control({ action: 'measurement', id, onsetMs: 70, clearanceMs: 60 }), /ordered/)
  session.control({ action: 'measurement', id, onsetMs: 70, clearanceMs: 600 })
  assert.equal(session.snapshot().runs[0].measurement.clearanceMs, 600)
})

test('calibrates with nonoverlapping samples, gates EEG by the visible window and binds the result ID', (t) => {
  const { journal, dock, callbacks } = fixture(t)
  let wall = 100000
  const now = () => wall
  const owner = randomUUID()
  const options = { journal, dock, eeg: 'brainflow', eegProfile: 'test-recorder', now }
  const session = new DeviceSession(options)
  function sample(score) { session.score({ start: wall - 1190, end: wall, score }) }
  function calibrate(kind, score) {
    sample(null)
    session.control({ action: 'calibrate', kind, owner })
    const { ticket } = session.window
    assert.equal(session.snapshot(randomUUID()).window, null)
    session.control({ action: 'target', ticket, owner, visible: true })
    const first = wall
    for (let i = 1; i <= 7; i++) { wall = first + i * eegTiming.sampleMs; sample(score) }
    wall = first + eegTiming.calibrateMs
    session.expireWindow()
  }
  calibrate('ignore', 0.1)
  calibrate('look', 0.7)
  assert.equal(session.calibration.ignore.length, 7)
  assert.ok(Math.abs(session.calibration.threshold - 0.4) < 1e-8)

  sample(null)
  session.control({ action: 'arm', condition: 'scent', owner, eeg: true })
  const intended = run()
  session.finish(intended)
  callbacks[0].phase('purged')
  const unrelated = run()
  session.finish(unrelated)
  sample(0.8)
  assert.equal(session.lastOpen, null)
  session.control({ action: 'target', ticket: session.window.ticket, owner, visible: true })
  wall += 1200
  sample(0.2)
  wall += 200
  sample(0.8)
  wall += 200
  sample(null)
  wall += 200
  sample(0.8)
  assert.equal(session.lastOpen, null)
  wall += 200
  sample(0.8)
  assert.equal(session.lastOpen.id, intended.id)
  assert.equal(session.lastOpen.via, 'eeg')
  assert.equal(session.runs.get(unrelated.id).opened, undefined)
  const restored = new DeviceSession(options)
  assert.equal(restored.calibration.threshold, session.calibration.threshold)
  assert.equal(new DeviceSession({ ...options, eegProfile: 'different' }).calibration.threshold, null)
})

test('mute disarms a pending cue and rejects a late purge as an EEG trigger', (t) => {
  const { journal, dock, callbacks } = fixture(t)
  const session = new DeviceSession({ journal, dock, eeg: 'brainflow' })
  session.lastSignalAt = Date.now()
  session.calibration.threshold = 0.5
  session.control({ action: 'arm', owner: randomUUID(), condition: 'scent', eeg: true })
  session.finish(run())
  session.control({ action: 'mute' })
  callbacks[0].phase('purged')
  assert.equal(session.window, null)
  assert.equal(session.arm, null)
  assert.equal(dock.muteCount, 1)
})

test('CLI parser requires a successful completed turn and uses the final message', () => {
  const reader = resultReader()
  reader.line('{"type":"turn.started"}')
  assert.throws(() => reader.result(0), /successful turn/)
  reader.line('{"type":"item.completed","item":{"type":"agent_message","phase":"commentary","text":"progress"}}')
  reader.line('{"type":"item.completed","item":{"type":"agent_message","phase":"final_answer","text":"finished"}}')
  reader.line('{"type":"turn.completed"}')
  assert.equal(reader.result(0), 'finished')
  assert.throws(() => reader.result(1), /successful turn/)
  reader.line('{"type":"turn.failed"}')
  assert.throws(() => reader.result(0), /successful turn/)
})

test('local API authenticates tracking, enforces origin, and opens the matching result', async (t) => {
  const { root, dock, callbacks } = fixture(t)
  const server = await startDeviceServer({ port: 0, stateRoot: root, dock, eeg: 'simulation' })
  t.after(() => server.close())
  const { origin, token } = server
  const post = (path, body, headers = {}) => fetch(`${origin}${path}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
  })
  const tracked = run()
  assert.equal((await post('/api/run', tracked)).status, 403)
  assert.equal((await post('/api/control', { action: 'arm', condition: 'scent' }, { Origin: 'https://example.com' })).status, 403)
  assert.equal((await post('/api/control', { action: 'arm', condition: 'scent' }, { Origin: origin })).status, 200)
  const headers = { Authorization: `Bearer ${token}` }
  assert.deepEqual(await (await post('/api/run', tracked, headers)).json(), { duplicate: false, id: tracked.id })
  assert.deepEqual(await (await post('/api/run', tracked, headers)).json(), { duplicate: true, id: tracked.id })
  assert.equal(callbacks.length, 1)
  const path = `${origin}/api/result?id=${tracked.id}`
  assert.equal((await fetch(path)).status, 404)
  const response = await post('/api/control', { action: 'simulate-attention', id: tracked.id }, { Origin: origin })
  assert.deepEqual(await response.json(), { id: tracked.id, result: tracked.result, via: 'simulated-eeg' })
  assert.equal((await fetch(path)).status, 200)
  assert.doesNotMatch(await (await fetch(`${origin}/api/trials.ndjson`)).text(), /private result marker/)
})
