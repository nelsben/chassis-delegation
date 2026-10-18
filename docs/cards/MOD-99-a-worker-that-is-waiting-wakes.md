---
id: MOD-99
title: A worker that is waiting wakes the brain once per state, says what it waits on, and says stalled past a ceiling; the polling nudge names the concrete move
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/drive.ts, hooks/lib/watch.ts, hooks/lib/waitstate.ts, hooks/lib/configtable.ts, hooks/lib/configeff.ts, hooks/lib/repoconfig.ts, tests/wakes.test.ts, tests/waitstate.test.ts, tests/drive.test.ts, tests/options.test.ts, tests/hooks.test.ts, CHANGELOG.md, docs/configuration.md, docs/guide.md, docs/internals.md, .claude-plugin/plugin.json]
forbid: [docs/cards/**, hooks/lib/verify-native.ts, hooks/lib/attempts.ts, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/storeloss.ts, hooks/lib/version.ts, README.md, docs/upgrading.md, hooks/lib/allow.ts, bin/**, .chassis-delegation.json]
red_test: new engine tests (tests/wakes.test.ts or a new tests/waitstate.test.ts) counting one wake for ten repeat waits and one stall row at the ceiling, and new tests in tests/drive.test.ts for the named-move nudge; all fail on origin/main; save that run as the red evidence first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #161: a background worker waiting on its own background job woke the lead about ten times in 15 minutes with the same "completed, but waiting" message, each a lead turn at lead prices, and none said whether it was queued on a resource or stalled. Issue #165: the brain's polling nudge says "a standard card would drive this loop" but not how, so the expensive polling went on.

## Done when

- FIND THE SOURCE FIRST. The worker reads where a waiting worker's repeated wake comes from: the mod's own rows (turn.complete, the ready fallback, the wake rows) or the host's notification passing through a hook the mod sees (session.send, turn.start or another). docs/internals.md names the source in one sentence. If the source is the host and no hook the mod has can see or hold it, the worker says so in its report and in Known issues, does the rest of this card, and the ONE PER STATE item is met by the mod's own rows alone.
- ONE PER STATE (#161). For one briefed worker, the mod wakes the brain (a row or a held notification let through) once when the worker starts waiting without a hand-back, and again only when it resumes, hands back, or passes the wait ceiling. Every repeat in the same state is held (debug log only). An engine test drives ten repeat waits of one worker over 15 fake minutes and counts exactly one wake, then one more at hand-back.
- NAME THE WAIT. That one wake says `<id> waiting on <resource> held by <holder>` when the worker's card names a resource the mod tracks and another worker holds it, else `<id> waiting on its own background job (<n> min)`.
- CEILING. Past a wait ceiling (a new option `waitStallMin`, default 20, 0 = off, in the config table with a summary and group like the others, and in tests/options.test.ts) the mod says once `<id> stalled <n> min; resume or stop it`. Engine test: the ceiling row fires once at the ceiling and not again.
- NUDGE (#165). The polling row in hooks/lib/drive.ts names the move. When the repeated command names a resource the repo config or a running card declares, or the brain is waiting on a worker, the row says which: `card it with resources: [<name>] so one worker drives it`, or `wait with the verdict tool (it returns when the worker hands back) instead of polling`; otherwise the row keeps today's text plus `see docs/guide.md#<anchor>` pointing at the section that shows how to declare a one-client resource. tests for each form.
- DOCS. CHANGELOG.md gets one entry under `## Unreleased` naming #161 and #165, below the entries already there. docs/configuration.md lists waitStallMin. The guide anchor the nudge names exists (tests/node/docs.node.mjs checks anchors).
- GATES. Red tests fail on origin/main and pass at the head; validate, node and test are green.

## Review

Attempt 1 was consistent, and review sent it back once: the wait test matched any "wait" in a no-report text, which would have held real no-report and usage-limit hand-backs until the stall row. Attempt 2 narrows it: the usage-limit check runs first, and only the last paragraph counts, with "waiting on/for" or "I'll wait for" plus a named background thing. Tests cover the past tense, a bare "wait", a mid-text "wait" and a usage-limit text. Attempt 2's own verdict was "unverified on scope (no brief)", which is the #155 resume bug on a same-repo card; `/dispatch MOD-99 --verify aa5ee14` re-ran the verifier on the same work and judged it consistent, with every claim held. The repeat wakes in #161 come from the host's notifications, which no hook sees; that is recorded under Known issues, and the mod's own rows are once per state. Amends to configcmd.ts and its test are approved. Accepted.
