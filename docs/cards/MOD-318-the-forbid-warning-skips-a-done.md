---
id: MOD-318
title: The forbid warning skips a done-when path the sentence says is forbidden, and a bounded retry loop is not reported as polling
domain: mod
tier: standard
status: merged
issue: 438
scope: [hooks/lib/card.ts, hooks/lib/drive.ts, tests/node/boundedpoll.node.mjs, tests/card.test.ts, tests/drive.test.ts, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/boundedpoll.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Two noisy advisories an adopter reported: `warning: forbid covers paths done-when names: <path>` fires on a card whose done-when says that very file is forbidden, and the brain-polling row fires on a single bounded retry loop around a flaky push (`for i in 1 2 3; do git push && break; sleep 5; done`), which is not polling. Both are heuristics in pure code with their own tests.

## Done when

- hooks/lib/drive.ts: isPoll is false when every `sleep` and every `while`/`until` in the cut text lies inside a bounded loop's `do … done`. A bounded loop is a `for <name> in …` loop, or a `while`/`until` loop whose condition or body holds `-lt`, `-le`, `-gt` or `-ge`, or a `((` … `))` not preceded by `$` that holds `<`, `<=`, `>`, `>=`, `==` or `!=`. A sleep outside any bounded loop keeps isPoll true, so `while true; do …; sleep 1; done`, `until <cmd>; do sleep 2; done` and a bare `sleep 5` stay polls; `-eq` and `-ne` alone do not bound a loop, so `until [ "$(curl …)" -eq 200 ]; do sleep 2; done` stays a poll. driveStep is unchanged.
- hooks/lib/card.ts: a done-when mention of a path whose before/after window (the windows isWritten reads) holds one of these as whole words, case-insensitive: `forbidden`, `forbid`, `untouched`, `unchanged`, `not touched`, `not changed`, `not written`, `never written`, `never changed`, `stays`, `left alone`, `read-only`, `only read`, is not a write: isWritten skips that mention (the negation wins over WRITE_VERB in the same window), and forbidCollisions leaves the path off the quiet line `warning: forbid covers paths done-when names: …`. A path with another mention that is a write keeps its own line as today.
- tests/node/boundedpoll.node.mjs (new) covers isPoll: a `for i in 1 2 3; do git push && break; sleep 5; done` loop, a `while [ $n -lt 5 ]` loop with a sleep, and a `(( n < 5 ))` loop with a sleep are false; the three poll shapes above and the `-eq` curl loop are true.
- tests/card.test.ts gains two cases: a done-when `docs/findings.md is forbidden` with forbid [docs/findings.md] and a scope that does not name it produces no quiet-line warning; `writes docs/findings.md` with the same forbid still produces `warning: forbid docs/findings.md matches docs/findings.md named in done-when`. tests/drive.test.ts gains one case: the bounded `for` retry loop around git push, at a context above driveWarnTokens, produces no polling row.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-318.
- The validate, node and test gates are green.

## Review

Diff read in full. card.ts: NEGATION whole-word set and mentionOf(path, statements) returning write/negated/other; a negation in the isWritten window wins over WRITE_VERB, and forbidCollisions drops negated-only paths from the quiet line while a path with a separate write mention keeps its line. drive.ts: boundedText (-lt/-le/-gt/-ge not followed by a word char, or a (( … )) not preceded by $ holding a comparison), loopsOf tokenizer over for/while/until/do/done/sleep, isPoll true for any sleep outside a bounded loop body or any while/until neither bounded nor nested in one; bare sleep, while true, until <cmd> and the -eq curl loop stay polls. Worker's call that a sleepless while/until nested in a bounded loop counts as covered is acceptable. Node test (4 cases), card.test.ts (2), drive.test.ts (1) match the card. Nit: the CHANGELOG bullet is followed by a stray blank line; folded into the 0.9.51 release card. Verdict consistent at cb9cca7.
