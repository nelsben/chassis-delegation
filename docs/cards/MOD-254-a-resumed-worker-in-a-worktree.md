---
id: MOD-254
title: A resumed worker in a worktree that already has its install skips the install step
domain: mod
tier: standard
status: merged
scope: [hooks/lib/dispatch.ts, hooks/templates/brief.md, tests/dispatch.test.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/node/templates.node.mjs: the rendered brief's install line is conditional (`npm ci` unless node_modules/.package-lock.json exists and is newer than package-lock.json), on the first attempt and on a resume alike (fails today: an unconditional npm ci)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A brief is made once per task and reused across attempts (dispatch reuses an existing brief unless briefDrift marks it stale), so the brief cannot know whether this is a resume. The install line must therefore be conditional in the template itself: a worker resuming in a worktree that already has node_modules spends 30-60 s on an unconditional npm ci.

## Done when

- hooks/templates/brief.md's install instruction reads: run `npm ci` unless node_modules/.package-lock.json exists and is newer than package-lock.json; the earlier wording is replaced, not kept beside it.
- The dispatch renderer passes nothing new; the line is the same on every attempt.
- Pinned renders in tests/node/templates.node.mjs and tests/dispatch.test.ts are updated.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
