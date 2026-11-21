import { randomInt, randomUUID } from 'node:crypto'
import { appendFileSync, existsSync, readFileSync } from 'node:fs'

export const eegTiming = { frequency: 15, sampleMs: 1200, selectMs: 6500, calibrateMs: 11000 }
const resultAgeMs = 45000
const maxResult = 24000
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function requireValue(ok, message) {
  if (!ok) throw Object.assign(new Error(message), { statusCode: 400 })
}

export class DeviceSession {
  constructor({ journal, dock, eeg = 'simulation', eegProfile = null, now = Date.now }) {
    this.journal = journal
    this.dock = dock
    this.eeg = eeg
    this.eegProfile = eegProfile
    this.now = now
    this.runs = new Map()
    this.events = []
    this.arm = null
    this.window = null
    this.calibration = { ignore: [], look: [], threshold: null }
    this.lastSignalAt = null
    this.lastOpen = null
    this.muteVersion = 0
    if (existsSync(journal)) {
      for (const line of readFileSync(journal, 'utf8').split('\n').filter(Boolean)) {
        this.apply(JSON.parse(line))
      }
    }
    for (const run of this.runs.values()) {
      if (['requested', 'acknowledged'].includes(run.phase)) {
        this.record('cue', { id: run.id, phase: 'unconfirmed' })
      }
    }
  }

  record(type, data = {}) {
    const entry = { type, at: this.now(), ...data }
    appendFileSync(this.journal, `${JSON.stringify(entry)}\n`, { mode: 0o600, flush: true })
    this.apply(entry)
    return entry
  }

  apply(entry) {
    this.events.push(entry)
    if (entry.type === 'calibration' && this.eeg === 'brainflow' && entry.profile === this.eegProfile) {
      this.calibration = { ignore: entry.ignore, look: entry.look, threshold: entry.threshold }
    }
    if (entry.type === 'run') {
      this.runs.set(entry.id, { ...entry, phase: entry.condition ? 'requested' : 'no-cue' })
      return
    }
    const run = this.runs.get(entry.id)
    if (entry.type === 'cue' && run) run.phase = entry.phase
    if (entry.type === 'feedback' && run) run.feedback = entry
    if (entry.type === 'measurement' && run) run.measurement = entry
    if (entry.type === 'open' && run) {
      run.opened = entry
      this.lastOpen = entry
    }
  }

  finish({ id, result, source }) {
    requireValue(typeof id === 'string' && uuid.test(id), 'Invalid run ID.')
    requireValue(typeof result === 'string' && result.length > 0, 'A result is required.')
    requireValue(['codex', 'demo'].includes(source), 'Invalid run source.')
    if (this.runs.has(id)) return { duplicate: true, id }

    const arm = this.arm
    const condition = arm?.condition === 'random' ? ['scent', 'blank'][randomInt(2)] : arm?.condition
    const run = this.record('run', {
      id, source, result: result.slice(0, maxResult), dockMode: this.dock.mode,
      condition: condition ?? null, blinded: arm?.condition === 'random',
    })
    if (arm) {
      this.arm = null
      const muteVersion = this.muteVersion
      const onPhase = (phase) => {
        this.record('cue', { id, phase })
        this.expireWindow()
        if (phase === 'purged' && arm.eeg && this.muteVersion === muteVersion && !this.window && this.signalReady && this.calibration.threshold !== null && this.canSelect(id)) {
          this.prepare('select', arm.owner, id)
        }
      }
      if (this.dock.ready) this.dock.deliver(id, condition, onPhase)
      else onPhase('unavailable')
    }
    return { duplicate: false, id: run.id }
  }

  get signalReady() {
    return this.lastSignalAt !== null && this.now() - this.lastSignalAt < 1500
  }

  setArm({ condition, owner, eeg }) {
    requireValue(['scent', 'blank', 'random'].includes(condition), 'Invalid cue condition.')
    requireValue(this.dock.ready, 'Dock is unavailable or busy.')
    if (eeg) {
      requireValue(typeof owner === 'string' && uuid.test(owner), 'Invalid display ID.')
      requireValue(this.eeg === 'brainflow' && this.signalReady && this.calibration.threshold !== null, 'Calibrate the EEG recorder first.')
      requireValue(condition !== 'random', 'Run blinded scent trials with the button response.')
    }
    this.record('arm', { condition, eeg: eeg === true })
    this.arm = { condition, owner, eeg: eeg === true }
  }

  mute() {
    this.arm = null
    this.muteVersion++
    this.dock.mute()
    if (this.window) this.endWindow('muted')
    this.record('mute')
  }

  prepare(kind, owner, id) {
    this.expireWindow()
    requireValue(this.eeg === 'brainflow' && this.signalReady, 'No current EEG stream.')
    requireValue(typeof owner === 'string' && uuid.test(owner), 'Invalid display ID.')
    requireValue(['select', 'ignore', 'look'].includes(kind) && !this.window, 'An EEG window is already active or invalid.')
    if (kind === 'select') requireValue(this.calibration.threshold !== null && this.canSelect(id), 'This result is outside the selection window.')
    const duration = kind === 'select' ? eegTiming.selectMs : eegTiming.calibrateMs
    this.window = { ticket: randomUUID(), kind, owner, runId: id, duration, expires: this.now() + 3500, start: null, scores: [], lastEnd: 0, streak: 0 }
    this.record('target-prepared', { ticket: this.window.ticket, kind, id })
  }

  target({ ticket, owner, visible }) {
    this.expireWindow()
    const window = this.window
    requireValue(window?.ticket === ticket && window.owner === owner, 'The EEG window has expired.')
    if (!visible) this.endWindow('hidden')
    else if (window.start === null) {
      this.record('target-visible', { ticket, id: window.runId, kind: window.kind })
      window.start = this.now()
      window.expires = window.start + window.duration
    }
  }

  expireWindow() {
    if (this.window && this.now() >= this.window.expires) this.endWindow('expired')
  }

  endWindow(reason) {
    const window = this.window
    this.window = null
    this.record('target-ended', { ticket: window.ticket, kind: window.kind, id: window.runId, reason, samples: window.scores.length })
    if (reason !== 'expired' || window.kind === 'select' || window.scores.length < 5) return
    const { ignore, look } = { ...this.calibration, [window.kind]: window.scores }
    let threshold = null
    if (ignore.length && look.length) {
      const floor = Math.max(0, ...ignore)
      const sortedLook = [...look].sort((a, b) => a - b)
      const median = sortedLook[Math.floor(sortedLook.length / 2)]
      if (median > floor + 0.04) threshold = (floor + median) / 2
    }
    this.record('calibration', { profile: this.eegProfile, threshold, ignore, look })
  }

  score({ start, end, score }) {
    this.expireWindow()
    if (this.eeg !== 'brainflow' || ![start, end].every(Number.isFinite)) return
    const now = this.now()
    if (end > now + 150 || end < now - 900 || end <= start) return
    this.lastSignalAt = now
    const window = this.window
    if (!window || window.start === null || start < window.start || end <= window.lastEnd) return
    if (window.kind !== 'select') {
      if (start >= window.lastEnd && Number.isFinite(score)) {
        window.scores.push(score)
        window.lastEnd = end
      }
      return
    }
    const consecutive = end - window.lastEnd <= 450
    window.lastEnd = end
    if (!Number.isFinite(score) || score < this.calibration.threshold) {
      window.streak = 0
      return
    }
    window.streak = consecutive ? window.streak + 1 : 1
    if (window.streak >= 2 && this.canSelect(window.runId)) {
      this.open(window.runId, 'eeg', score)
    }
  }

  canSelect(id) {
    const run = this.runs.get(id)
    return Boolean(run && !run.opened && this.now() - run.at <= resultAgeMs)
  }

  open(id, via, score) {
    const run = this.runs.get(id)
    requireValue(run, 'Run not found.')
    if (!run.opened) this.record('open', { id, via, score })
    if (this.window?.runId === id) this.endWindow('opened')
    return { id, result: run.result, via: run.opened.via }
  }

  control({ action, id, owner, condition, eeg, kind, ticket, visible, rating, onsetMs, clearanceMs }) {
    switch (action) {
      case 'arm': return this.setArm({ condition, owner, eeg })
      case 'mute': return this.mute()
      case 'open': return this.open(id, 'button')
      case 'demo':
        requireValue(this.dock.mode === 'simulation', 'Demo completions require the simulated dock.')
        return this.finish({ id: randomUUID(), source: 'demo', result: 'Demo result. The tracked run completed. The local result view has opened.' })
      case 'simulate-attention':
        requireValue(this.eeg === 'simulation' && this.canSelect(id), 'There is no eligible simulated result.')
        return this.open(id, 'simulated-eeg')
      case 'calibrate':
        requireValue(['look', 'ignore'].includes(kind), 'Invalid calibration condition.')
        return this.prepare(kind, owner)
      case 'target': return this.target({ ticket, owner, visible: visible === true })
      case 'feedback': {
        requireValue(this.runs.has(id), 'Run not found.')
        const { noticed, intensity, clarity, comfort, notes } = rating ?? {}
        requireValue(['yes', 'no', 'unsure'].includes(noticed), 'Select whether you perceived the scent.')
        requireValue([intensity, clarity, comfort].every((n) => Number.isInteger(n) && n >= 0 && n <= 10) && typeof notes === 'string' && notes.length <= 300, 'Invalid trial ratings.')
        return this.record('feedback', { id, noticed, intensity, clarity, comfort, notes })
      }
      case 'measurement': {
        const run = this.runs.get(id)
        requireValue(run?.condition && run.dockMode === 'usb', 'Select a physical cue trial.')
        requireValue([onsetMs, clearanceMs].every(Number.isFinite) && 0 <= onsetMs && onsetMs < clearanceMs && clearanceMs <= 120000, 'Enter ordered onset and clearance times in milliseconds.')
        return this.record('measurement', { id, onsetMs, clearanceMs })
      }
      default: requireValue(false, 'Unknown device action.')
    }
  }

  snapshot(owner) {
    this.expireWindow()
    const window = this.window?.owner === owner ? this.window : null
    return {
      dock: { mode: this.dock.mode, status: this.dock.status, ready: this.dock.ready },
      armed: this.arm?.condition ?? null,
      eeg: { mode: this.eeg, ready: this.signalReady, threshold: this.calibration.threshold, ignore: this.calibration.ignore.length, look: this.calibration.look.length },
      window: window ? { ticket: window.ticket, kind: window.kind, start: window.start, duration: window.duration, expires: window.expires, frequency: eegTiming.frequency } : null,
      lastOpen: this.lastOpen,
      runs: [...this.runs.values()].slice(-12).reverse().map(({ result: _result, condition, ...run }) => ({
        ...run, condition: run.blinded && !run.feedback ? 'blinded' : condition,
        eligible: this.canSelect(run.id),
      })),
    }
  }

  exportTrials() {
    return this.events.map(({ result: _result, ...event }) => JSON.stringify(event)).join('\n') + '\n'
  }
}
