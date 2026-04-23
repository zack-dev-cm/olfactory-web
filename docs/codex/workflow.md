# Workflow

This starter uses a role-based sprint loop for Codex.

## Default loop

1. Clarify: restate the goal, assumptions, and verification.
2. Plan: choose the smallest architecture that can work.
3. Implement: write the change and the checks.
4. Review: inspect for correctness, regressions, security, and missing tests.
5. Verify: run the highest-signal local validation plus the public-surface gate.
6. Ship: summarize outcome and residual risk.
7. Cleanup: remove entropy or write a durable rule for the next run.

## When to use which agent

- `architect` when the problem is ambiguous or the main work is decision-making.
- `implementer` when the path is known and the goal is a focused code change.
- `reviewer` after implementation or when you need a bug-focused second pass.
- `evolver` when several candidate approaches can be compared with a clear metric.
- `cleanup` after a landing, a refactor wave, or visible doc drift.

## Parallel work

Only spawn subagents when the user explicitly asks for delegation or parallel agent work. Keep tasks disjoint and concrete.
