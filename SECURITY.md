# Security Policy

## Supported Scope

Security review covers the open-source web app and bot helper in this repository. Hosted deployments, bot accounts, and analytics services are operator-owned and must be configured outside the repo.

## Reporting a Vulnerability

Please report suspected vulnerabilities privately to the repository maintainers. Include the affected component, reproduction steps, impact, and any relevant logs with secrets redacted.

Do not open a public issue for live bot tokens, deployment secrets, or webhook credentials.

## Security Expectations

- Keep Telegram bot tokens and deployment secrets in a secret manager or local environment.
- Do not present this software as a medical device or therapeutic treatment.
- Keep the non-medical disclaimer visible in forks and deployments.
- Avoid collecting health or biometric data unless your deployment adds an explicit privacy policy and consent flow.
