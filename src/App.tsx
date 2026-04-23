import { useEffect, useMemo, useRef, useState } from 'react'
import './App.css'
import { startBridgeAnalytics } from './bridgeTracking'

type Preset = {
  id: string
  name: string
  description: string
  carrierHz: number
  pulseHz: number
  dutyCycleMs: number
  panOffsetMm: number
  durationSec: number
  docNotes: string[]
}

const referenceUrl = 'https://writetobrain.com/olfactory'
const visualGuideSrc = '/placement-guide_0.jpg'

type FeedbackEntry = {
  id: string
  preset: string
  experience: number
  clarity: number
  comfort: number
  notes?: string
  time: string
}

const PRESETS: Preset[] = [
  {
    id: 'fresh-air',
    name: 'Fresh Air',
    description: 'Bright, oxygen-heavy sensation. Midline placement, neutral steering.',
    carrierHz: 19000,
    pulseHz: 1200,
    dutyCycleMs: 0.35,
    panOffsetMm: 0,
    durationSec: 45,
    docNotes: [
      'Doc: 300 kHz focus, 39 mm depth, 50–55° downward angle.',
      'Stay centered above the frontal sinuses to avoid optic nerve.',
    ],
  },
  {
    id: 'garbage',
    name: 'Garbage / Ferment',
    description: 'Left-biased steering and slightly longer duty to mimic sulfurous feel.',
    carrierHz: 18850,
    pulseHz: 1180,
    dutyCycleMs: 0.45,
    panOffsetMm: -2,
    durationSec: 45,
    docNotes: [
      'Doc: lateral offset ~2° to one side produced distinct garbage smell.',
      'Maintain downward tilt; avoid sliding onto eyebrow ridge.',
    ],
  },
  {
    id: 'ozone',
    name: 'Ozone / Ionizer',
    description: 'Crisp tone with shallow duty and slight right steering.',
    carrierHz: 19800,
    pulseHz: 1230,
    dutyCycleMs: 0.28,
    panOffsetMm: 2,
    durationSec: 40,
    docNotes: [
      'Doc: rapid onset sensation when steering within ~3–4 mm of midline.',
      'Short bursts reduce facial tingling placebo effects.',
    ],
  },
  {
    id: 'campfire',
    name: 'Campfire / Burnt Wood',
    description: 'Lower carrier and deeper duty. Use small right offset.',
    carrierHz: 18200,
    pulseHz: 1100,
    dutyCycleMs: 0.6,
    panOffsetMm: 3.5,
    durationSec: 55,
    docNotes: [
      'Doc: focal shift of ~3.5 mm separated fresh vs burning spots.',
      'Keep the pad firmly coupled; small drifts change the scent.',
    ],
  },
]

const placementSteps = [
  'Place the phone horizontally just above the glabella (between eyebrows), screen toward you.',
  'Angle the top edge downward ~50–55° so audio projects toward the olfactory bulb behind the nasal bridge.',
  'Slide up or down a few millimeters to clear the frontal sinus; stop where coupling feels firm.',
  'For lateral steering, nudge 2–4 mm left/right only; large shifts risk stimulating optic pathways.',
  'Keep gentle pressure and steady contact; skip gel for phone-only runs.',
]

const docSignals = [
  'Core parameters: 300 kHz carrier, 39 mm focal depth, 50–55° steering, 5-cycle pulses at 1200 Hz repetition.',
  'Safety envelope: measured 150–250 kPa focus (~0.4 MI), well below typical tFUS intensity; avoided optic nerve by limiting lateral steer to <15°.',
  'Resolution: scent changes appeared with ~3.5 mm shifts (about 40% of focal spot), implying high functional resolution despite large wavelength.',
  'Testing: blind selection of focal spots produced reliable discrimination between fresh air, garbage, ozone-like, and campfire sensations.',
  'Limitation: this web prototype uses near-ultrasonic audio (18–20 kHz) for consumer speakers, so it is a placement coach and stim emulator, not a medical device.',
]

const improvementIdeas = [
  'Add calibration sweep and output-level check for external piezo drivers (line-out).',
  'Offer multi-spot sequencing to sweep 2–5 mm arcs automatically for faster mapping.',
  'Log subjective feedback after each run to pair focal offsets with perceived scent labels.',
  'Ship a hearing-safety precheck and volume normalization before enabling 18–20 kHz.',
]

const smartphoneLimits = [
  'Phone speakers cap near 20 kHz with low acoustic power; this is far below 300 kHz focused ultrasound, so true bulb stimulation from speakers alone is unlikely.',
  'Air gaps and skull attenuation at audio frequencies limit energy at depth; beam steering and focus need a coupled piezo driver.',
  'Near-ultrasonic playback can create audible artifacts or skin buzz that confound perceived effects.',
]

const smartphonePaths = [
  'Use the phone as controller and signal source into an external amp + piezo transducer that can reach 300 kHz with proper coupling.',
  'Practice placement and repeatability with the audio emulator so positioning is consistent before attaching a real transducer.',
  'Send calibrated waveforms over line-out/USB audio while keeping the same UI presets.',
]

type AudioRefs = {
  ctx: AudioContext | null
  carrierOsc: OscillatorNode | null
  gain: GainNode | null
  scheduler: number | null
  countdown: number | null
  stopTimer: number | null
  nextPulseTime: number
}

const useAudioRefs = (): AudioRefs => ({
  ctx: null,
  carrierOsc: null,
  gain: null,
  scheduler: null,
  countdown: null,
  stopTimer: null,
  nextPulseTime: 0,
})

function App() {
  const [selectedPreset, setSelectedPreset] = useState<Preset>(PRESETS[0])
  const [carrierHz, setCarrierHz] = useState<number>(PRESETS[0].carrierHz)
  const [pulseHz, setPulseHz] = useState<number>(PRESETS[0].pulseHz)
  const [dutyCycleMs, setDutyCycleMs] = useState<number>(PRESETS[0].dutyCycleMs)
  const [panOffsetMm, setPanOffsetMm] = useState<number>(PRESETS[0].panOffsetMm)
  const [intensity, setIntensity] = useState<number>(0.35)
  const [sessionSeconds, setSessionSeconds] = useState<number>(PRESETS[0].durationSec)
  const [remaining, setRemaining] = useState<number>(PRESETS[0].durationSec)
  const [status, setStatus] = useState<string>('Idle')
  const [log, setLog] = useState<string[]>([])
  const [showDocDetails, setShowDocDetails] = useState<boolean>(false)
  const [showImprovements, setShowImprovements] = useState<boolean>(false)
  const [showSmartphoneNotes, setShowSmartphoneNotes] = useState<boolean>(false)
  const [experienceScore, setExperienceScore] = useState<number>(5)
  const [clarityScore, setClarityScore] = useState<number>(5)
  const [comfortScore, setComfortScore] = useState<number>(5)
  const [notes, setNotes] = useState<string>('')
  const [feedbackLog, setFeedbackLog] = useState<FeedbackEntry[]>([])

  const audioRefs = useRef<AudioRefs>(useAudioRefs()).current

  useEffect(() => {
    const analytics = startBridgeAnalytics()
    return () => analytics?.stop()
  }, [])

  useEffect(() => {
    setCarrierHz(selectedPreset.carrierHz)
    setPulseHz(selectedPreset.pulseHz)
    setDutyCycleMs(selectedPreset.dutyCycleMs)
    setPanOffsetMm(selectedPreset.panOffsetMm)
    setSessionSeconds(selectedPreset.durationSec)
    setRemaining(selectedPreset.durationSec)
  }, [selectedPreset])

  useEffect(() => {
    return () => {
      stopTone()
      audioRefs.ctx?.close()
    }
  }, [])

  useEffect(() => {
    setRemaining(sessionSeconds)
  }, [sessionSeconds])

  const addLog = (entry: string) => {
    const stamp = new Date().toLocaleTimeString()
    setLog((prev) => [`${stamp} — ${entry}`, ...prev].slice(0, 12))
  }

  const ensureContext = async () => {
    if (!audioRefs.ctx) {
      audioRefs.ctx = new AudioContext()
    }
    if (audioRefs.ctx.state === 'suspended') {
      await audioRefs.ctx.resume()
    }
    return audioRefs.ctx
  }

  const stopTone = () => {
    if (audioRefs.scheduler) {
      window.clearInterval(audioRefs.scheduler)
      audioRefs.scheduler = null
    }
    if (audioRefs.countdown) {
      window.clearInterval(audioRefs.countdown)
      audioRefs.countdown = null
    }
    if (audioRefs.stopTimer) {
      window.clearTimeout(audioRefs.stopTimer)
      audioRefs.stopTimer = null
    }
    try {
      audioRefs.carrierOsc?.stop()
    } catch (error) {
      // Oscillator might already be stopped; ignore.
    }
    audioRefs.carrierOsc?.disconnect()
    audioRefs.gain?.disconnect()
    audioRefs.carrierOsc = null
    audioRefs.gain = null
    audioRefs.nextPulseTime = 0
    setStatus('Idle')
  }

  const schedulePulses = (gainNode: GainNode) => {
    if (!audioRefs.ctx) return
    const lookAheadSeconds = 0.5
    const scheduleStepMs = 50
    audioRefs.nextPulseTime = audioRefs.ctx.currentTime + 0.02

    audioRefs.scheduler = window.setInterval(() => {
      if (!audioRefs.ctx) return
      while (audioRefs.nextPulseTime < audioRefs.ctx.currentTime + lookAheadSeconds) {
        const start = audioRefs.nextPulseTime
        const peak = start + dutyCycleMs / 1000
        const end = start + 1 / pulseHz
        gainNode.gain.cancelScheduledValues(start)
        gainNode.gain.setValueAtTime(0.0001, start)
        gainNode.gain.linearRampToValueAtTime(intensity, peak)
        gainNode.gain.setValueAtTime(0.0001, end)
        audioRefs.nextPulseTime += 1 / pulseHz
      }
    }, scheduleStepMs)
  }

  const startTone = async () => {
    const ctx = await ensureContext()
    stopTone()
    const carrier = ctx.createOscillator()
    const gain = ctx.createGain()
    const panner = ctx.createStereoPanner()

    carrier.type = 'sine'
    carrier.frequency.value = carrierHz
    gain.gain.value = 0.0001
    panner.pan.value = Math.max(-1, Math.min(1, panOffsetMm / 8))

    carrier.connect(gain).connect(panner).connect(ctx.destination)
    carrier.start()

    audioRefs.carrierOsc = carrier
    audioRefs.gain = gain

    schedulePulses(gain)

    setStatus(`Running ${selectedPreset.name}`)
    setRemaining(sessionSeconds)
    addLog(`Started ${selectedPreset.name} @ ${carrierHz.toFixed(0)} Hz, PRF ${pulseHz} Hz`)

    audioRefs.countdown = window.setInterval(() => {
      setRemaining((prev) => {
        if (prev <= 1) {
          stopTone()
          addLog('Session ended')
          return 0
        }
        return prev - 1
      })
    }, 1000)

    audioRefs.stopTimer = window.setTimeout(() => {
      stopTone()
      addLog('Auto-stopped after session time')
    }, sessionSeconds * 1000)
  }

  const statusBadge = useMemo(() => {
    if (status.startsWith('Running')) return 'live'
    return 'idle'
  }, [status])

  const saveFeedback = () => {
    const entry: FeedbackEntry = {
      id: `${Date.now()}`,
      preset: selectedPreset.name,
      experience: experienceScore,
      clarity: clarityScore,
      comfort: comfortScore,
      notes: notes.trim() || undefined,
      time: new Date().toLocaleTimeString(),
    }
    setFeedbackLog((prev) => [entry, ...prev].slice(0, 8))
    setNotes('')
    addLog(`Feedback saved for ${selectedPreset.name}`)
  }

  return (
    <div className="page">
      <header className="hero">
        <div>
          <p className="eyebrow">Olfactory tFUS playground</p>
          <h1>Forehead ultrasound pilot for scent stimulation</h1>
          <p className="lede">
            Guided placement + near-ultrasonic audio presets inspired by the original experiment
            (300 kHz focus, 39 mm depth, 50–55° steering). Use as a coaching tool with a phone or as
            a driver for an external transducer.
          </p>
          <p className="ref-link">
            Reference writeup: <a href={referenceUrl}>writetobrain.com/olfactory</a>
          </p>
          <div className="tags">
            <span className="chip">300 kHz → emulated 18–20 kHz</span>
            <span className="chip">1200 Hz pulse train</span>
            <span className="chip">Placement coach</span>
            <span className={`chip status ${statusBadge}`}>{status}</span>
          </div>
        </div>
        <div className="session-box">
          <p className="label">Session timer</p>
          <p className="timer">
            {Math.floor(remaining / 60)
              .toString()
              .padStart(2, '0')}
            :
            {(remaining % 60).toString().padStart(2, '0')}
          </p>
          <p className="hint">Keep breaths light; effects peak on a mild inhale.</p>
        </div>
      </header>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Placement coach</p>
              <h2>Positioning for forehead entry</h2>
            </div>
            <div className="chip ghost">Forehead → bulb</div>
          </div>
          <ul className="step-list">
            {placementSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ul>
          <div className="note">
            <strong>Hardware reality:</strong> phone speakers top out near 20 kHz. For true 300 kHz
            stimulation use the audio output to drive an external amplifier + piezo transducer.
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Visual guide</p>
              <h2>Three-step placement walkthrough</h2>
            </div>
            <div className="chip ghost">Illustrated</div>
          </div>
          <img src={visualGuideSrc} alt="Phone placement guide above the glabella with tilt and lateral steering" className="guide-img" />
          <p className="muted">Place above the eyebrows, tilt 50–55°, nudge 2–4 mm for steering.</p>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Control room</p>
              <h2>Presets + live controls</h2>
            </div>
            <div className="chip ghost">Manual override</div>
          </div>

          <div className="preset-row">
            {PRESETS.map((preset) => (
              <button
                key={preset.id}
                className={`preset ${preset.id === selectedPreset.id ? 'active' : ''}`}
                onClick={() => setSelectedPreset(preset)}
              >
                <div className="preset-top">
                  <span className="preset-name">{preset.name}</span>
                  <span className="preset-meta">
                    {preset.carrierHz.toFixed(0)} Hz · {preset.pulseHz} PRF · {preset.dutyCycleMs}
                    ms
                  </span>
                </div>
                <p className="preset-desc">{preset.description}</p>
              </button>
            ))}
          </div>

          <div className="controls">
            <label>
              Carrier frequency ({carrierHz.toFixed(0)} Hz)
              <input
                type="range"
                min={17000}
                max={22000}
                step={10}
                value={carrierHz}
                onChange={(e) => setCarrierHz(Number(e.target.value))}
              />
            </label>
            <label>
              Pulse repetition ({pulseHz.toFixed(0)} Hz)
              <input
                type="range"
                min={800}
                max={1500}
                step={10}
                value={pulseHz}
                onChange={(e) => setPulseHz(Number(e.target.value))}
              />
            </label>
            <label>
              Duty (ms at peak) ({dutyCycleMs.toFixed(2)} ms)
              <input
                type="range"
                min={0.2}
                max={1}
                step={0.01}
                value={dutyCycleMs}
                onChange={(e) => setDutyCycleMs(Number(e.target.value))}
              />
            </label>
            <label>
              Intensity (gain) ({intensity.toFixed(2)})
              <input
                type="range"
                min={0.05}
                max={0.7}
                step={0.01}
                value={intensity}
                onChange={(e) => setIntensity(Number(e.target.value))}
              />
            </label>
            <label>
              Lateral steer (mm) ({panOffsetMm.toFixed(1)} mm)
              <input
                type="range"
                min={-6}
                max={6}
                step={0.1}
                value={panOffsetMm}
                onChange={(e) => setPanOffsetMm(Number(e.target.value))}
              />
            </label>
            <label>
              Session length ({sessionSeconds}s)
              <input
                type="range"
                min={15}
                max={120}
                step={5}
                value={sessionSeconds}
                onChange={(e) => setSessionSeconds(Number(e.target.value))}
              />
            </label>
          </div>

          <div className="actions">
            <button className="primary" onClick={startTone}>
              Start session
            </button>
            <button className="ghost" onClick={stopTone}>
              Stop
            </button>
          </div>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Doc → prototype</p>
              <h2>Key takeaways from the writeup</h2>
            </div>
            <div className="chip ghost">Evidence-informed</div>
            <button className="ghost small" onClick={() => setShowDocDetails((v) => !v)}>
              {showDocDetails ? 'Hide' : 'Expand'}
            </button>
          </div>
          {showDocDetails && (
            <ul className="signal-list">
              {docSignals.map((signal) => (
                <li key={signal}>{signal}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Safety + checklist</p>
              <h2>Guardrails</h2>
            </div>
            <div className="chip ghost">Do no harm</div>
          </div>
          <ul className="checklist">
            <li>
              Stay below 0.7 gain and under 2 minutes per session; rest at least 1 minute between
              runs.
            </li>
            <li>
              Avoid eye line: keep lateral steering within ±5 mm; never angle upward toward the
              orbit.
            </li>
            <li>Use low volume if wearing headphones; prolonged 18–20 kHz can be fatiguing.</li>
            <li>
              This is not a medical device. Use only for benign experimentation with your own
              informed consent.
            </li>
            <li>
              For true ultrasound, connect an external driver and follow the measured MI &lt; 0.4
              envelope described in the doc.
            </li>
          </ul>
        </div>
      </section>

      <section className="grid">
        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Preset notes</p>
              <h2>Experiment notebook</h2>
            </div>
          </div>
          <div className="note-grid">
            {selectedPreset.docNotes.map((note) => (
              <div className="note-card" key={note}>
                {note}
              </div>
            ))}
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Improvements</p>
              <h2>What to add next</h2>
            </div>
            <div className="chip ghost">Roadmap</div>
          </div>
          <button className="ghost small" onClick={() => setShowImprovements((v) => !v)}>
            {showImprovements ? 'Hide' : 'Expand'}
          </button>
          {showImprovements && (
            <ul className="signal-list">
              {improvementIdeas.map((idea) => (
                <li key={idea}>{idea}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Smartphone vs true ultrasound</p>
              <h2>Why it may not work — and how it still helps</h2>
            </div>
            <div className="chip ghost">Hypotheses</div>
          </div>
          <button className="ghost small" onClick={() => setShowSmartphoneNotes((v) => !v)}>
            {showSmartphoneNotes ? 'Hide' : 'Expand'}
          </button>
          {showSmartphoneNotes && (
            <>
              <p className="note">Why speaker-only playback is limited:</p>
              <ul className="signal-list">
                {smartphoneLimits.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <p className="note">Ways the pilot still works:</p>
              <ul className="signal-list">
                {smartphonePaths.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </>
          )}
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Feedback</p>
              <h2>Capture your sensation</h2>
            </div>
            <div className="chip ghost">Subjective data</div>
          </div>
          <div className="feedback-grid">
            <div className="controls">
              <label>
                Scent intensity ({experienceScore}/10)
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={experienceScore}
                  onChange={(e) => setExperienceScore(Number(e.target.value))}
                />
              </label>
              <label>
                Clarity / distinctness ({clarityScore}/10)
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={clarityScore}
                  onChange={(e) => setClarityScore(Number(e.target.value))}
                />
              </label>
              <label>
                Comfort ({comfortScore}/10)
                <input
                  type="range"
                  min={0}
                  max={10}
                  step={1}
                  value={comfortScore}
                  onChange={(e) => setComfortScore(Number(e.target.value))}
                />
              </label>
              <label>
                Notes (optional)
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Describe scent, tingling, onset time..."
                  rows={3}
                />
              </label>
              <div className="actions">
                <button className="primary" onClick={saveFeedback}>
                  Save feedback
                </button>
                <button className="ghost" onClick={() => setNotes('')}>
                  Clear notes
                </button>
              </div>
            </div>
            <div className="feedback-log">
              {feedbackLog.length === 0 ? (
                <p className="muted">No feedback yet. Log your impressions after a run.</p>
              ) : (
                feedbackLog.map((item) => (
                  <div key={item.id} className="feedback-entry">
                    <div className="feedback-top">
                      <strong>{item.preset}</strong>
                      <span className="muted">{item.time}</span>
                    </div>
                    <p className="muted small">
                      Intensity {item.experience}/10 · Clarity {item.clarity}/10 · Comfort {item.comfort}/10
                    </p>
                    {item.notes && <p className="muted">{item.notes}</p>}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-head">
            <div>
              <p className="eyebrow">Live log</p>
              <h2>Events</h2>
            </div>
          </div>
          <div className="log">
            {log.length === 0 && <p className="muted">No events yet. Start a session.</p>}
            {log.map((entry) => (
              <p key={entry} className="log-line">
                {entry}
              </p>
            ))}
          </div>
        </div>
      </section>
    </div>
  )
}

export default App
