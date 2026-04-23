# Cleanup

Codex can amplify entropy if you never clean the repo. This file defines the garbage-collection loop.

## Weekly sweep

- Collapse duplicated helpers that recent tasks introduced.
- Refresh docs that no longer match the code.
- Remove dead tests, scripts, and examples created by reverted work.
- Tighten recurring review comments into lint rules, checks, or reusable docs.
- Re-scan the public surface for secrets, local paths, copied dashboards, and stale release artifacts.
- Replace maintainer-specific usage examples with generic placeholders unless a real public artifact is required.

## Promote a rule when

- The same issue appears in two or more tasks.
- Review comments keep repeating the same guidance.
- A missing invariant caused wasted time or broken behavior.

## Do not do

- Huge opportunistic rewrites under the label of cleanup.
- Formatting-only churn across unrelated files.
- "Helpful" abstractions with no repeated use yet.
