---
id: MOD-375
title: a root outside the repo that was listed in full at dispatch is listed in full at hand-back, so one that grew past 10000 files during the run is still judged
domain: mod
tier: standard
status: merged
issue: 514
scope: [hooks/lib/norepo.ts, hooks/register.ts, CHANGELOG.md, tests/node/outsidegrow.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/outsidegrow.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #514: a card's output folder outside the repo held a few files at dispatch and about 11,800 at hand-back. The verdict was unverified on scope. The cause is in `listRoot` (hooks/register.ts). A root of 10000 files or fewer is listed in full at dispatch. At hand-back, `outsideCheck` lists it again with no `since`, and a root now past `OUTSIDE_MAX_ENTRIES` comes back as a watermark. `outsideClaim` then reads a full listing before and a watermark after as `outside delta: <root> was not listed at hand-back`, so the claim is unchecked. A root that is already big at dispatch works today: it gets a watermark then, and the hand-back walk keeps only the files newer than it.

## Before you start

- `hooks/lib/norepo.ts`: `RootListing`, `OUTSIDE_WALK_CEILING`, `outsideClaim` (the `'since' in a` branch under a full `b`), `OutsideInput`, `outsideCheck`.
- `hooks/register.ts`: `OUTSIDE_MAX_ENTRIES`, `listRoot` and its doc comment, `outsideFor` (search `const list = (root: string, since?: number) => listRoot`). The other two `listRoot(` calls are the dispatch listings; leave them as they are.
- `tests/norepo.test.ts`: how the `outsideCheck` tests pass a fake `list`.

## Design (decided by the brain; build it, do not redesign it)

- `OutsideInput.list` becomes `(root: string, since?: number, full?: boolean) => Promise<RootListing>`. Its doc says that `full` asks for every entry, up to `OUTSIDE_WALK_CEILING`, never a watermark.
- `outsideCheck` passes `full = true` when the dispatch listing of that root has `entries` and is not `truncated`. A watermark mark still passes `since` as today. A root with no mark, or a mark that is an error, passes neither.
- `listRoot($, root, since?, full?)`: with `full` (and no `since`), the walk keeps every file entry. It does not count towards or switch to a watermark at `OUTSIDE_MAX_ENTRIES`. The `OUTSIDE_WALK_CEILING` error stays as it is. It returns `{ root, entries }`. The doc comment adds one sentence on `full`, marked MOD-375 (#514). `outsideFor`'s `list` passes the third argument through.
- `outsideClaim` is unchanged. A full listing at both ends goes down the existing entry-by-entry branch, which already judges every added, removed or changed path.
- A dispatch listing that was truncated (MOD-233, the inline fallback) stays unchecked as today. This card does not touch it.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.61` when absent), `### Fixed`: one bullet `(MOD-375, #514)`.

## Tests

- `tests/node/outsidegrow.node.mjs` (new, the red test). `outsideCheck` with a full dispatch listing and a fake `list` that records its arguments: it is called with `full === true`. Fed back a full after-listing that adds a path inside scope, the claim holds; one that adds a forbidden path fails and names it. A watermark mark is still called with `since` and without `full`.
- An engine test in `tests/norepo.test.ts` (or the file the existing outside engine tests are in): dispatch with a root of a few files, add more than 10000 files under it before the hand-back, and check that the scope claim is judged, not unchecked. If the harness cannot hold that many files in reasonable time, write the node test only and say so in a `choice:` line.

## Left to you

- Fixture texts, test names, and whether `full` is a positional argument or an options object, as long as the `since` call sites read the same.

## Done when

- A root listed in full at dispatch that grows past 10000 files is judged at hand-back: an in-scope change holds and a forbidden one fails.
- A root that was a watermark at dispatch behaves as before.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. outsideCheck asks for full only when the dispatch mark is an untruncated entries listing. listRoot with full keeps every file, up to the walk ceiling, and never returns a watermark. outsideFor passes full through, the dispatch listings are untouched, and outsideClaim is unchanged. The engine test grows a root from 2 files to over 10000 during the run: the claim holds for an in-scope change and fails naming a forbidden path. A note for later cards: the worker left two shell wait loops polling `pgrep -f` on its own command line, which matches itself, so they never exit.
