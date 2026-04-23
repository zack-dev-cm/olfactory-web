# AGENTS.md

This repository uses a small-file Codex harness for Olfactory Oss Prep. Read this file first, then open only the docs that matter for the task.

## Operating rules

- Restate the goal and name the verification step before making changes.
- Prefer the smallest change that solves the request.
- Keep diffs surgical. Do not refactor adjacent code unless the task requires it.
- Treat this file as an index. Put durable knowledge in versioned docs under `docs/codex/`.
- Use the custom agents in `.codex/agents/` when the user explicitly asks for delegation or parallel agent work.

## Repo map

- [Overview](docs/codex/overview.md)
- [Architecture](docs/codex/architecture.md)
- [Workflow](docs/codex/workflow.md)
- [Evals](docs/codex/evals.md)
- [Cleanup](docs/codex/cleanup.md)

## Default loop

1. Clarify the task and state success checks.
2. Open the smallest relevant docs from the repo map.
3. Implement or revise code with tests or other verification.
4. Run the documented checks.
5. Update docs when the change introduces a durable rule, invariant, or workflow.

## Custom agents

- `architect`: scope, tradeoffs, acceptance criteria, and boundary decisions.
- `implementer`: minimal code and tests.
- `reviewer`: correctness, regressions, and missing checks.
- `evolver`: controlled search over alternatives when the task benefits from measured iteration.
- `cleanup`: entropy reduction, doc refresh, and follow-up cleanup.
