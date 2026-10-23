---
id: MOD-114
title: The rows nudge the brain's own effort (raise on a hand-back with cards, back down once the judgment is over) and the started row names the worker's effort
domain: mod
tier: frontier
status: done
scope: [hooks/lib/nudge.ts, hooks/lib/rows.ts, hooks/lib/repoconfig.ts, hooks/lib/configtable.ts, hooks/lib/configeff.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/rows.test.ts, tests/tier.test.ts, tests/options.test.ts, tests/configcmd.test.ts, docs/configuration.md, docs/spend.md, CHANGELOG.md]
forbid: [bin/**]
red_test: none
gate: validate, node, test
budget: 2-attempts
spend: 25
---
## Why

Issue #201. The brain's effort is the user's `/model` setting, which the mod cannot and should not change. The user's standing rule is medium for procedural turns and high for the few that need judgment: reading the cards a worker hands back, designing a lever, applying a build. The prompt up worked from memory; the prompt down did not exist, and the user sat on high for hours of dispatching, waiting and bookkeeping. The mod already sees the two events that bracket most judgment turns: a hand-back whose report names cards, and the moment no such hand-back is waiting any more.

## Done when

- A hand-back whose report's `artefacts=` names a file the `effortNudge.cards` glob takes (default `cards/**`, anchored at any folder) ends its handed-back row `· lead: judgment next, raise to high`. The attempt is remembered until its verdict.
- Once no remembered hand-back awaits its verdict, the first verdict row that accepts another task (`next=accept`, not the nudged task's own row), or the next started row (not a resume), ends `· lead: back to medium`, once; the nudge then closes until the next cards hand-back.
- The started row names the effort the worker's steps run at: `· effort high` (from `effortByTier` or the card's `effort:`); nothing when the engine's default is kept.
- Repo option `effortNudge` `{cards, up, down}` merges key by key over `{cards: "cards/**", up: "high", down: "medium"}`; `cards: ""` turns the nudge off; a bad key or value is named and dropped. The manifest, the config table, `docs/configuration.md` and `docs/spend.md` carry it; `/delegation` prints `effort nudge: cards/** · up high · down medium` (or `off`).
- The mod never changes the session model or effort. Tests: pure (rows, parser, glob) and engine (up on hand-back, no down on the nudged task's own accept, down on another task's accept and on the next started row, the repo-file words, off). The validate, node and plugin suites pass.

## Review

Done by the brain on a branch after the user's walk-through and apply (the mod-change rule of 2026-10-23); the user installs with `/delegation update` and a restart. Plugin suite 1496 pass, node suite 987 pass, validate passed.
