---
id: MOD-145
title: A queued dispatch and the /delegation limits line name where the worker limit came from: `maxWorkers 3 from your options file` (or the repo file, the host options, the default; the tier cap by name when a tier's cap is what queued it)
domain: mod
tier: standard
status: merged
scope: [hooks/lib/scheduler.ts, hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/configeff.ts]
red_test: engine test: repo file maxWorkers 12, options file maxWorkers 1, one worker live: a second dispatch's queued line ends `limit: maxWorkers 1 from your options file)`; at base it ends `0 queued: )` with no limit. Red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Issue #234: a dispatch said it was queued with 3 live right after the repo config raised maxWorkers to 12, because the person's options file set 3 and wins over the repo file. Nothing said so, and finding the layer took a search. The config resolver already knows each field's source; the queued line and the limits line should say it.

## Done when

- A pure helper in hooks/lib/scheduler.ts, `limitSourceText(field, value, source)`, renders `<field> <value> from <place>` where place is `the default` for default, `the repo file` for repo, `your options file` for yours, `the host options` for host and `the host options (locked)` for locked; e.g. `maxWorkers 3 from your options file`, `maxWorkersByTier.standard 2 from the repo file`.
- queuedDeny (and alreadyQueuedDeny) take an optional limit text and, when given, end the parenthesis with `; limit: <text>`, e.g. `queued: MOD-9 — the mod will tell you when a slot frees (3 live: a, b, c; 0 queued: ; limit: maxWorkers 3 from your options file)`. isQueuedDeny, alreadyQueuedPart and every reader of these lines still recognise them (their tests stay green).
- hooks/register.ts passes that text wherever it builds a queued deny for a full slot: the field is maxWorkersByTier.<tier> when the tier cap is what is full, else maxWorkers, and the source is read from the resolved config's `sources` (readConfig already returns `resolved`). A queue wait on a resource gets no limit text.
- The `/delegation` summary's `max workers …` part appends ` (from <place>)` for maxWorkers, and for each tier in maxWorkersByTier whose source differs from maxWorkers's, e.g. `max workers 3 (from your options file; standard 2 from the repo file)`.
- Tests: pure tests of limitSourceText for all five sources and of queuedDeny with and without the limit text; an engine test where the repo file sets maxWorkers 12 and the options file sets 1, a second dispatch while one worker is live is queued and its line ends `limit: maxWorkers 1 from your options file)`; an engine test with maxWorkersByTier {standard: 1} from the repo file names `maxWorkersByTier.standard 1 from the repo file`; the /delegation summary test reads the source. Existing tests that hold the exact queued text are updated to the new tail. CHANGELOG.md Unreleased gets one entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. limitSourceText and sourcePlace in scheduler.ts; claimSlot passes the full limit (maxWorkersByTier.<tier> when the tier cap is full, else maxWorkers) with its source from resolvedNow.sources, and a resource wait gets none. The already-queued line puts `; limit: …` after the position, and alreadyQueuedPart still matches with that tail. The resolver keeps one source per field, so a tier's source is the whole maxWorkersByTier map's; the /delegation line names tiers only when that differs from maxWorkers's. Existing exact-text tests now end `from the host options`, since the test harness feeds options as host options.
