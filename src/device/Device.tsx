import { useCallback, useEffect, useRef, useState } from 'react'
import type { FormEvent } from 'react'
import PerceptionFields from '../PerceptionFields'
import type { Perception } from '../PerceptionFields'

type Result = { id: string; result: string; via: 'button' | 'eeg' | 'simulated-eeg' }
type Run = {
  id: string; at: number; source: 'codex' | 'demo'; phase: string; condition: string | null; dockMode: 'simulation' | 'usb'
  eligible: boolean; opened?: { via: Result['via'] }; feedback?: Perception & { noticed: string; notes: string }
  measurement?: { onsetMs: number; clearanceMs: number }
}
type VisualWindow = { ticket: string; kind: 'select' | 'ignore' | 'look'; start: number | null; duration: number; frequency: number }
type State = {
  dock: { mode: 'simulation' | 'usb'; ready: boolean; status: string }
  armed: string | null
  eeg: { mode: 'simulation' | 'brainflow' | 'off'; ready: boolean; threshold: number | null; ignore: number; look: number }
  window: VisualWindow | null; runs: Run[]; lastOpen: { id: string; at: number; via: Result['via'] } | null
}
type Command = (action: string, data?: Record<string, unknown>) => Promise<unknown>
const reduceMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches
const label = (value: string) => value.replaceAll('-', ' ')
const formatTime = (at: number) => new Intl.DateTimeFormat(undefined, { timeStyle: 'medium' }).format(at)

async function json<T>(url: string, options?: RequestInit): Promise<T> {
  const response = await fetch(url, { cache: 'no-store', ...options })
  if (!response.ok) {
    const error = await response.json().catch(() => ({}))
    throw new Error(error.error || 'Device console is unavailable.')
  }
  return response.json() as Promise<T>
}

function VisualTarget({ state, command }: { state: VisualWindow; command: Command }) {
  const { ticket, kind, duration, frequency } = state
  const target = useRef<HTMLSpanElement>(null)
  useEffect(() => {
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)')
    let nextFrame = 0
    const stop = () => {
      if (target.current) target.current.style.animation = 'none'
      void command('target', { ticket, visible: false }).catch(() => {})
    }
    const onVisibility = () => { if (document.hidden || motion.matches) stop() }
    const frame = requestAnimationFrame(() => {
      nextFrame = requestAnimationFrame(() => {
        if (document.hidden || motion.matches) stop()
        else void command('target', { ticket, visible: true }).catch(stop)
      })
    })
    document.addEventListener('visibilitychange', onVisibility)
    motion.addEventListener('change', onVisibility)
    return () => {
      cancelAnimationFrame(frame)
      cancelAnimationFrame(nextFrame)
      document.removeEventListener('visibilitychange', onVisibility)
      motion.removeEventListener('change', onVisibility)
    }
  }, [ticket, command])

  return (
    <div className="visual-target">
      <span ref={target} className="visual-tag" aria-hidden="true" style={{ animationDuration: `${1 / frequency}s`, animationIterationCount: duration * frequency / 1000 }} />
      <div>
        <strong>{kind === 'select' ? 'Open result' : kind === 'look' ? 'Look at the target' : 'Ignore the target'}</strong>
        <p>{kind === 'ignore' ? 'Continue reading or typing as usual.' : 'Rest your gaze on the small square.'}</p>
      </div>
      <button type="button" className="secondary" onClick={() => {
        if (target.current) target.current.style.animation = 'none'
        void command('target', { ticket, visible: false }).catch(() => {})
      }}>Stop target</button>
    </div>
  )
}

function TrialForm({ run, command, physical }: { run: Run; command: Command; physical: boolean }) {
  const [value, setValue] = useState<Perception>(() => ({
    intensity: run.feedback?.intensity ?? 5, clarity: run.feedback?.clarity ?? 5, comfort: run.feedback?.comfort ?? 5,
  }))
  const [noticed, setNoticed] = useState(run.feedback?.noticed || '')
  const [notes, setNotes] = useState(run.feedback?.notes || '')
  const [saved, setSaved] = useState(Boolean(run.feedback))
  const [measured, setMeasured] = useState(Boolean(run.measurement))
  const [saving, setSaving] = useState(false)
  const [measuring, setMeasuring] = useState(false)

  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    try {
      await command('feedback', { id: run.id, rating: { ...value, noticed, notes } })
      setSaved(true)
    } catch { setSaved(false) } finally { setSaving(false) }
  }

  async function measure(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    setMeasuring(true)
    try {
      await command('measurement', { id: run.id, onsetMs: Number(fields.get('onset')), clearanceMs: Number(fields.get('clearance')) })
      setMeasured(true)
    } catch { setMeasured(false) } finally { setMeasuring(false) }
  }

  return (
    <section className="card">
      <div className="card-heading"><h2>Trial feedback</h2><time className="tag" dateTime={new Date(run.at).toISOString()}>{formatTime(run.at)}</time></div>
      <form className="field-list" onSubmit={save} onChange={() => setSaved(false)}>
        <label>Did you perceive a scent?
          <select required value={noticed} onChange={(event) => setNoticed(event.target.value)}>
            <option value="">Choose an answer</option><option value="yes">Yes</option><option value="no">No</option><option value="unsure">Unsure</option>
          </select>
        </label>
        <PerceptionFields value={value} onChange={setValue} />
        <label>Notes <textarea rows={2} maxLength={300} value={notes} onChange={(event) => setNotes(event.target.value)} /></label>
        <div className="actions"><button disabled={saving}>Save feedback</button><span role="status">{saved ? 'Saved' : ''}</span></div>
      </form>
      {physical && run.condition && <details>
        <summary>External sensor timings</summary>
        <form className="field-list" onSubmit={measure}>
          <p>Enter measurements at the nose position in milliseconds after the cue request.</p>
          <div className="measurement">
            <label>Onset <input name="onset" type="number" min={0} max={120000} required defaultValue={run.measurement?.onsetMs} /></label>
            <label>Clearance <input name="clearance" type="number" min={1} max={120000} required defaultValue={run.measurement?.clearanceMs} /></label>
          </div>
          <div className="actions"><button className="secondary" disabled={measuring}>Save timings</button><span role="status">{measured ? 'Saved' : ''}</span></div>
        </form>
      </details>}
    </section>
  )
}

export default function Device() {
  const [owner] = useState(() => crypto.randomUUID())
  const [state, setState] = useState<State | null>(null)
  const [offline, setOffline] = useState(false)
  const [condition, setCondition] = useState('scent')
  const [useEeg, setUseEeg] = useState(false)
  const [result, setResult] = useState<Result | null>(null)
  const [trialId, setTrialId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const seenOpen = useRef('')
  const resultRequest = useRef(0)

  const refresh = useCallback(async () => {
    try {
      const next = await json<State>(`/api/state?owner=${owner}`, { signal: AbortSignal.timeout(1500) })
      setState(next)
      setOffline(false)
    } catch { setOffline(true) }
  }, [owner])

  useEffect(() => {
    void refresh()
    const interval = setInterval(() => void refresh(), 400)
    return () => clearInterval(interval)
  }, [refresh])

  useEffect(() => {
    const opened = state?.lastOpen
    if (opened?.via !== 'eeg' || seenOpen.current === opened.id) return
    seenOpen.current = opened.id
    const current = ++resultRequest.current
    void json<Result>(`/api/result?id=${encodeURIComponent(opened.id)}`)
      .then((value) => {
        if (resultRequest.current === current) { setResult(value); setTrialId(value.id) }
      })
      .catch(() => { if (resultRequest.current === current) seenOpen.current = '' })
  }, [state?.lastOpen])

  const command: Command = useCallback(async (action, data = {}) => {
    try {
      const value = await json<unknown>('/api/control', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...data, action, owner }), signal: AbortSignal.timeout(2000),
      })
      setError('')
      await refresh()
      return value
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'The device request failed.')
      throw cause
    }
  }, [owner, refresh])

  async function perform(action: string, data?: Record<string, unknown>) {
    setBusy(true)
    const opensResult = action === 'open' || action === 'simulate-attention'
    if (opensResult) resultRequest.current++
    try {
      const value = await command(action, data)
      if (opensResult) {
        resultRequest.current++
        const opened = value as Result
        setResult(opened)
        setTrialId(opened.id)
      }
    } catch { /* The command renders the error. */ } finally { setBusy(false) }
  }

  const latest = state?.runs[0]
  const trial = trialId ? state?.runs.find((run) => run.id === trialId) : latest
  const calibrated = state?.eeg.threshold != null

  return (
    <main className="console">
      <header className="page-header">
        <div><p className="brand">Olfactory</p><h1>Codex Device</h1><p className="summary">One scent cue when a tracked run finishes.</p></div>
        <div className="header-actions">
          {state && !offline && <a href="/api/trials.ndjson" download>Export trial log</a>}
          <button className="mute" type="button" disabled={!state || offline} onClick={() => void perform('mute')}>Mute dock</button>
        </div>
      </header>

      {offline && <p className="notice" role="alert">Local bridge unavailable. Run <code>npm run device</code> and open the address it prints.</p>}
      {error && <p className="notice" role="alert">{error}</p>}
      {state && !offline && <div className="workspace">
        <section className="card session">
          <div className="card-heading"><h2>Cue session</h2><span className="tag">{state.dock.mode === 'simulation' ? 'Simulated dock' : 'USB dock'}</span></div>
          <p className="status" role="status"><span className={state.dock.ready ? 'dot ready' : 'dot'} />{state.armed ? 'Armed for the next run' : `Dock ${state.dock.status}`}</p>
          <label>Cue condition
            <select value={condition} onChange={(event) => setCondition(event.target.value)}>
              <option value="scent">Scent</option><option value="blank">Clean-air blank</option><option value="random">Blinded scent or blank</option>
            </select>
          </label>
          {state.eeg.mode === 'brainflow' && <label className="checkbox">
            <input type="checkbox" checked={useEeg && condition !== 'random'} onChange={(event) => setUseEeg(event.target.checked)} disabled={!calibrated || !state.eeg.ready || condition === 'random' || reduceMotion()} />
            Enable the EEG target for this run
          </label>}
          <div className="actions">
            <button disabled={!state.dock.ready || busy} onClick={() => void perform('arm', { condition, eeg: Boolean(useEeg && calibrated && state.eeg.ready && condition !== 'random' && !reduceMotion()) })}>Arm next cue</button>
            {state.dock.mode === 'simulation' && <button className="secondary" disabled={busy} onClick={() => void perform('demo')}>Simulate completion</button>}
          </div>
          <p className="hint">From a terminal, use <code>npm run device:track -- "your task"</code> to track a Codex run.</p>
        </section>

        <section className="card">
          <div className="card-heading"><h2>Latest run</h2>{latest && <span className="tag">{latest.source === 'demo' ? 'Demo' : 'Codex'}</span>}</div>
          {state.window && <VisualTarget key={state.window.ticket} state={state.window} command={command} />}
          {latest ? <>
            <p className="status"><time dateTime={new Date(latest.at).toISOString()}>{formatTime(latest.at)}</time> <span className="separator">·</span> Cue {label(latest.phase)}</p>
            <div className="actions">
              <button disabled={busy} onClick={() => void perform('open', { id: latest.id })}>Open result</button>
              {state.eeg.mode === 'simulation' && latest.eligible && <button className="secondary" disabled={busy} onClick={() => void perform('simulate-attention', { id: latest.id })}>Simulate EEG selection</button>}
            </div>
          </> : <p className="hint">The result will appear here after a tracked run finishes.</p>}
          {state.eeg.mode === 'brainflow' && <details>
            <summary>EEG calibration</summary>
            <p>{!state.eeg.ready ? 'Waiting for recorder samples.' : calibrated ? 'Calibration ready for this session.' : 'Record one ignore block and one look block.'}</p>
            {reduceMotion() ? <p>Reduced motion is enabled. Use the result button.</p> : <div className="actions">
              <button className="secondary" disabled={!state.eeg.ready || !!state.window || busy} onClick={() => void perform('calibrate', { kind: 'ignore' })}>{state.eeg.ignore ? 'Repeat ignore block' : 'Start ignore block'}</button>
              <button className="secondary" disabled={!state.eeg.ready || !!state.window || busy} onClick={() => void perform('calibrate', { kind: 'look' })}>{state.eeg.look ? 'Repeat look block' : 'Start look block'}</button>
            </div>}
            <p className="hint">The calibration uses a brief, small flickering target. The result button is always available.</p>
          </details>}
        </section>

        {result && <section className="card result">
          <div className="card-heading"><h2>Run result</h2><span className="tag">{result.via === 'simulated-eeg' ? 'Simulated EEG' : result.via === 'eeg' ? 'EEG' : 'Button'}</span></div>
          <pre>{result.result}</pre>
        </section>}

        {trial && <TrialForm key={trial.id} run={trial} command={command} physical={trial.dockMode === 'usb'} />}
        <section className="card history">
          <h2>Recent trials</h2>
          {state.runs.length ? <ul>{state.runs.map((run) => <li key={run.id}>
            <div><strong>{run.source === 'demo' ? 'Demo' : 'Codex'} · {formatTime(run.at)}</strong><span>{run.condition ? label(run.condition) : 'Unarmed'} · {label(run.phase)}{run.feedback ? ' · Feedback saved' : ''}</span></div>
            <button className="secondary" disabled={busy} onClick={() => void perform('open', { id: run.id })}>View</button>
          </li>)}</ul> : <p className="hint">No trials recorded yet.</p>}
        </section>
      </div>}
    </main>
  )
}
