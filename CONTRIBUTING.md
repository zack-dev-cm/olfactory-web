# Contributing

Keep changes focused and reviewable. Olfactory has two main surfaces: the React/Vite web app and the optional Telegram bot helper.

## Local Validation

Run the relevant checks before opening a pull request:

```bash
npm ci
npm run build
npm test
```

When UI behavior changes, verify the placement controls and Web Audio session flow in a browser.

## Public-Surface Review

Before publishing docs, examples, fixtures, or screenshots, check for:

- secrets or token-like strings
- private workstation paths
- live bot tokens or webhook credentials
- medical claims that exceed the non-medical demo scope
- private planning or maintainer-only workflow artifacts
