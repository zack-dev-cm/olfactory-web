# PRD — Olfactory Ultrasound Pilot (Web)

## Goal
Provide a web app that coaches forehead placement and plays near-ultrasonic pulse trains modeled after the documented olfactory ultrasound experiment (300 kHz, 39 mm focal depth, 50–55° steering, 5-cycle pulses @ 1200 Hz). The web app should run on a phone and optionally drive an external transducer via audio out.

## Background from the doc
- Successful sensations: fresh air, garbage/ferment, ozone/ionizer, campfire/burnt wood.
- Beam setup: 300 kHz carrier, ~39 mm focus, 50–55° downward steering; lateral offsets of ~3.5 mm produced distinct scents.
- Safety envelope: measured 150–250 kPa at focus (MI ≈0.4), well below typical tFUS; kept lateral steering under 15° to avoid the optic nerve.
- Coupling: forehead placement above the sinuses with gel/jello pad; stability mattered to hold the focal spot.
- Observations: scents strongest on light inhale; discrimination verified via blind trial.
- Reference writeup: https://writetobrain.com/olfactory

## Users & scenarios
- **Experimenters** with access to a piezo transducer and amp using a phone as waveform source.
- **Curious testers** using only phone speakers for coaching and sensation emulation (acknowledging 20 kHz limit).
- **Clinicians/researchers** needing quick visual instructions and preset parameters before deeper lab setups.

## Requirements
### Functional
- Presets for the four sensations with parameter hints (carrier, PRF, duty, lateral steering, duration).
- Manual controls to override carrier frequency, pulse repetition frequency, duty, intensity, steering, and session time.
- Placement coach: step-by-step forehead placement and steering guidance.
- Safety guardrails: gain cap (<0.7), session duration cap (<2 minutes), explicit disclaimer.
- Live timer and event log for session starts/stops.
- Works on mobile browsers (Web Audio) with no install.
- Capture subjective feedback (intensity/clarity/comfort sliders + notes) per session.

### Non-functional
- Clear copy about hardware limits and non-medical status.
- Minimal latency in pulse scheduling; schedule pulses ahead to reduce jitter.
- Deployable as a static bundle (Cloud Run / Cloudflare Pages) with HTTPS.

### Out of scope (for now)
- Actual 300 kHz hardware driver integration (requires external amp/transducer).
- User accounts, persistence, or analytics.
- Automated scent discrimination testing.

## UX flow
1) Land on hero with context + safety tags.  
2) Select a preset; read notes about placement/offsets.  
3) Fine-tune sliders (carrier, PRF, duty, intensity, steer, duration).  
4) Place phone on forehead per coach, start session; watch timer.  
5) Stop or auto-complete; review log; rest and repeat.

## Technical approach
- React + Vite SPA; styling via `src/App.css`/`src/index.css`.
- Web Audio: single carrier oscillator (18–22 kHz), gain node gated by ahead-of-time `AudioParam` scheduling approximating 1200 Hz burst trains.
- Lateral steering emulated via stereo panner to hint left/right offsets.
- Dockerfile builds static bundle and serves via `serve` on port 8080.

## Safety messaging
- Emphasize MI ≈0.4 envelope from source doc; cap gain and session time.
- Advise against eye-line steering; encourage gel pad/soft spacer for coupling.
- State non-medical, personal-experiment use only.

## Success criteria
- Mobile web loads and plays pulse trains without console errors.
- Preset and manual controls feel responsive; timer and logs update correctly.
- Deployment reachable over HTTPS (Cloud Run) and instructions documented.

## Open questions / future work
- Add multi-spot auto-sweeps (2–5 mm arcs) to map scents faster.
- Add audio calibration (line-out level and chirp sweeps) for external piezo drivers.
- Add subjective feedback collection after each run to link focal offsets with perceived scents.
- Provide hearing-safety precheck/volume normalization before enabling 18–20 kHz.
- Consider a Flutter native build if offline/low-latency playback is required.
