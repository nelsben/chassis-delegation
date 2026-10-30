---
id: MOD-185
title: A repo=none card's outside check ignores what the mod and the lead write in the session checkout (its .delegation/ folder and the cards folder), so a forbid of that checkout no longer refutes on the ledger, a brief edit or a new card file
domain: mod
tier: standard
status: merged
scope: [hooks/lib/norepo.ts, hooks/register.ts, tests/norepo.test.ts, tests/hooks.test.ts, docs/contracts.md, docs/guide.md, CHANGELOG.md]
forbid: [README.md, hooks/lib/version.ts, hooks/lib/retention.ts, hooks/lib/allow.ts, .claude-plugin/**, docs/cards/**]
red_test: tests/norepo.test.ts
gate: validate, test
budget: 3-attempts
spend: 8
---
## Why

A research card (repo=none) lists its absolute scope and forbid roots before the run and refutes on any changed path under a forbid root. When a forbid names the session's own checkout, the mod's own writes there (the ledger row at spawn, a brief the lead edits mid-run, a new card file the card tool writes for another task) show up in the delta and refute the card falsely: one card was refuted twice this way and had to be accepted by hand. The founder approved this harness change.

## Done when

- In the outside delta of a repo=none card (hooks/lib/norepo.ts outsideClaim / outsideCheck, fed from hooks/register.ts), a changed path is ignored, for scope and forbid alike, when it lies under the session checkout's `.delegation/` folder or under the repo's configured cards folder (the `cards` setting of .chassis-delegation.json, default `docs/cards`) in the session checkout. The ignore list is passed in as absolute folder prefixes (an input field such as `ignore: string[]`), so outsideClaim stays pure; register.ts computes it from the session root and the repo config. Paths anywhere else are judged exactly as today.
- When at least one changed path was ignored, the claim detail gains `; ignored <n> path(s) the mod and the lead write (.delegation/, <cards folder>)`; with none ignored the detail is unchanged byte for byte, so every existing norepo test passes unchanged.
- Tests in tests/norepo.test.ts, red first at base: a forbid root over the session checkout with a newer `.delegation/ledger.jsonl`, a newer `.delegation/briefs/T-1.brief.md` and a new `docs/cards/T-2-x.md` holds (not refuted) and names `ignored 3 paths`; the same listing with also a newer `hooks/x.ts` under the forbid root still fails naming `hooks/x.ts` only; a custom cards folder from the config is ignored and `docs/cards` then is not; the ignore applies in the modification-time (watermark) mode too. An engine test (tests/norepo.test.ts or the engine test file that already drives a repo=none dispatch and verdict) shows a repo=none card whose forbid covers the session checkout comes back consistent after the ledger was written and the brief was edited between dispatch and hand-back.
- Docs: docs/contracts.md, where repo=none scope checking is described (or docs/guide.md if that is where it lives), gains one sentence: the mod's own `.delegation/` folder and the cards folder in the session checkout are not counted in the outside delta, because the mod and the lead write there during a run. CHANGELOG.md `## Unreleased` (create it if absent, above the newest release heading) gets a `### Fixed` entry tagged MOD-185. Wording generic: no product, repo, person, machine path or session names.
- Nothing else changes: no change to repos with a worktree (the git delta), to the forbid semantics for any other path, or to the store layout.

## Review

Harness fix approved by the founder. Consistent on attempt 1 ($0.37, Sonnet), red first (5 new norepo tests failed at base). outsideClaim takes an optional ignore list of absolute folder prefixes, folder-bounded, applied in snapshot and modification-time modes; register.ts passes the session's .delegation and the configured cards folder. The detail names the ignored count; with none ignored it is unchanged byte for byte. An engine test forbids the whole session checkout, writes the ledger and edits the brief mid-run, and comes back consistent. One sentence in contracts.md, a Fixed entry in CHANGELOG.
