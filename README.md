# Olfactory Ultrasound Pilot (web)

[Codex Device](device/README.md) is a separate local console for tracked Codex runs, a USB scent dock, and optional recording-only EEG. It runs in simulation with `npm run build` and `npm run device`.

Web-based placement coach and near-ultrasonic tone generator inspired by the olfactory tFUS experiment (300 kHz carrier, 39 mm focal depth, 50–55° steering, 5-cycle pulses @ 1200 Hz). It lets you position a phone on the forehead and play emulated pulse trains for the four reported sensations: fresh air, garbage/ferment, ozone/ionizer, and campfire/burnt wood.

> Hardware note: consumer speakers cap near 20 kHz, so this app emulates the sequencing logic for coaching and for driving external transducers. It is not a medical device.
> Reference: https://writetobrain.com/olfactory

## What’s inside
- React + Vite single-page app with Web Audio pulse scheduling.
- Presets that mirror the writeup: 1200 Hz repetition, narrow duty (0.28–0.6 ms), slight lateral steering.
- Placement coach describing forehead angle and millimeter-level steering from the doc.
- Safety guardrails: short sessions, gain limiter, lateral steering guidance, and explicit non-medical disclaimer.
- Visual guide: `public/placement-guide_0.jpg` illustrating placement/tilt (no gel needed for phone-only use).
- User feedback capture: sliders for intensity/clarity/comfort + optional notes; expandable panels for doc details, roadmap, and smartphone feasibility notes.

## Design choices
- Carrier range 18–20 kHz to stay within phone speaker limits while preserving 1200 Hz pulse sequencing; stereo pan approximates lateral steering.
- Duty capped at 1 ms and gain capped at 0.7 to mirror the low MI (~0.4) envelope described in the doc.
- Session cap (<=120 s) plus rest recommendation to avoid prolonged exposure to near-ultrasonic tones.
- Placement copy mirrors doc guidance: above glabella, 50–55° downward aim, 2–4 mm lateral nudge.

## Improvements to explore
- Add audio output calibration + sweep for external piezo drivers (line-out level set and chirp).
- Multi-spot auto-sweep (2–5 mm arcs) to map scents faster.
- Quick feedback form after each run to pair offsets with perceived scent labels.
- Hearing-safety precheck/volume normalization before unlocking 18–20 kHz playback.

## Running locally
```bash
npm install
npm run dev

# Production build and preview
npm run build
npm start     # serves dist/ on port 8080
```

## Deployment (Cloud Run)
The repo ships with a Dockerfile. From the project root:
```bash
gcloud builds submit --tag gcr.io/energy-meters/olfactory-web:latest
gcloud run deploy olfactory-web \
  --image gcr.io/energy-meters/olfactory-web:latest \
  --region us-east1 \
  --allow-unauthenticated
```

## Using the app
1) Pick a preset and read the notes panel to align the phone just above the glabella.  
2) Angle the phone downward 50–55° toward the nasal bridge; nudge 2–4 mm left/right for steering.  
3) Start the session; breathe lightly in to notice any sensations.  
4) Stop or wait for the auto-timer; rest at least a minute between runs.
5) Log feedback (intensity/clarity/comfort + notes) to track subjective outcomes.

## SEO/GEO bridge attribution
If you deploy the `seogeo` bridge service, set `VITE_SEOGEO_BRIDGE_URL` at build time (example: `https://seogeo-bridge-<hash>.us-east1.run.app`). When launched in Telegram with a `startapp` parameter, the app posts a best-effort attribution ping to `${VITE_SEOGEO_BRIDGE_URL}/api/track`.

## Telegram mini-app bot
- Set `TELEGRAM_BOT_TOKEN` in your environment or Secret Manager (do not commit it).
- Set `WEB_APP_URL` to the deployed web app URL.
- Run locally (long polling):
  ```bash
  TELEGRAM_BOT_TOKEN=... WEB_APP_URL=https://example.com npm run bot
  ```
- Bot replies with inline keyboard to open the placement coach as a Telegram Web App or plain browser link, plus the reference writeup.

## Safety + limitations
- Keep gain below 0.7 and sessions under 2 minutes; this mirrors the low MI envelope (≈0.4) reported in the source doc.
- Avoid eye line; do not angle upward toward the orbit and keep lateral steering within ±5 mm.
- For actual ultrasound stimulation, connect to an external piezo driver and respect measured pressure and duty cycles from the experiment.

For product requirements, see `PRD.md`. Report security issues privately through `SECURITY.md`.
