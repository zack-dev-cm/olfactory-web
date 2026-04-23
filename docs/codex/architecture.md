# Architecture

Use this file to document the boundaries Codex should preserve in Olfactory Oss Prep.

## Domains

- Domain: [name] | Owners: [team or role] | Entry points: [paths or modules]
- Domain: [name] | Allowed dependencies: [what it can talk to]

## Guardrails

- Parse and validate data at boundaries.
- Prefer boring, inspectable dependencies over opaque magic.
- Keep modules small enough that an agent can reason about them locally.
- Write down invariants here before they spread only through chat or tribal memory.

## Do-not-break list

- Public APIs or CLIs: [list them]
- Migrations or schemas: [list them]
- Long-running jobs or background loops: [list them]
- External integrations and credentials: [list them]
