# Evals

Use this file to define the ratchet that keeps Codex runs honest.

## Rules

- Every meaningful task should name one primary success check.
- Keep a baseline before you change behavior.
- Prefer fast, deterministic checks before expensive end-to-end runs.
- Record when a change improves quality, speed, reliability, or cost.
- Public repos need a leak gate for secrets, private paths, and local URLs before merge.

## Required checks

- Unit: [replace with the command or suite]
- Integration: [replace with the command or suite]
- Smoke: [replace with the fastest realistic user-path check]
- Open-source gate: `python3 -m codex_harness audit . --strict --min-score 90`
- Manual: [describe any manual verification that still matters]

## Experiment log

| Date | Change | Metric | Result | Kept |
| --- | --- | --- | --- | --- |
| YYYY-MM-DD | baseline | [metric] | [value] | yes |
