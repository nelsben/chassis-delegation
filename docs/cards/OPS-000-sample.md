---
id: OPS-000
title: A sample card (status template, so /dispatch refuses it; copy it to start a real one)
domain: ops
tier: standard
status: template
scope: [docs/**]
forbid: [.chassis-delegation.json]
red_test: none (docs only)
gate: test
budget: 2-attempts
---
## Why

Shows the card format. Copy this file to `agents/tasks/OPS-1-<slug>.md`, give it a
real id, title, scope and red test, set `status: queued`, and ask the brain to
dispatch it (or run `/dispatch OPS-1`).

## Done when

- The red test named above fails on the base branch and passes on the worker's branch.
- The gate (`gate:` ids, mapped in `gateMap`) is green in the worker's worktree.
