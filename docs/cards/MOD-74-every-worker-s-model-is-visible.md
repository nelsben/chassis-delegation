---
id: MOD-74
title: Every worker's model is visible all the time: a row when it starts and when it hands back, and a running: section in /delegation status with model, elapsed time and spend
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dashboard.ts, hooks/lib/status*.ts, hooks/lib/rows*.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/configcmd.ts, hooks/lib/config*.ts, hooks/lib/repoconfig.ts, README.md]
red_test: a new engine test that a briefed spawn posts a row `MOD-1 started · sonnet (standard) · attempt 1/2` fails on main, where no row is posted at spawn; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

In the VS Code extension the host shows a worker as one collapsed row whose label names the model only if the brain typed it, and shows nothing at all about which model the brain itself runs on. The person could not tell whether 94 tool calls belonged to the brain or to a worker. The mod knows the model of every spawn it tiers and the brain's own model; it should say so where the person looks: the transcript rows and /delegation status.

## Done when

- When a briefed spawn starts (the Agent call the mod recorded), the mod posts one row: `<task> started · <alias> (<tier>) · attempt <n>/<budget>` (a resume says `resumed`, a queued start says `started from queue`). An ad hoc spawn posts nothing.
- When a briefed worker hands back, before verification, the mod posts one row: `<task> handed back · <alias> · <m> min · $<usd> · verifying`, with the elapsed wall time and the worker's spend as the mod already computes them for the verdict row; `$?` when the spend is not yet known. The verdict row follows as now. Nothing else about the existing verdict row changes.
- `/delegation` status gains a `running:` section as its FIRST lines when any worker is live, queued or being verified: one line per worker `<task> · <alias> (<tier>) · <state: running|verifying|queued> · <m> min · $<usd>`; and a line `brain: <model alias or id the session runs on>` taken from the host (the session's current model as the mod can read it; `brain: unknown` if the host gives none). With nothing live, the section is `running: none · brain: <model>`.
- The dashboard pane and the band (where the screen places them) show the same per-worker alias; where the dashboard text already shows it, it stays.
- verdictVerbosity=silent suppresses the started and handed-back rows too; line and full post them.
- Engine tests: the started row text and timing; the handed-back row with elapsed and spend; the running: section with one live, one queued and one verifying worker; `running: none`; silent suppresses both rows; an ad hoc spawn posts no started row. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create the heading if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $1.15) accepted as handed back; no fixes. Rebased over MOD-73 with one CHANGELOG conflict (both
added `## Unreleased`): the two entries now sit under one heading. The band's queued rows still carry no alias; the
worker said so.
