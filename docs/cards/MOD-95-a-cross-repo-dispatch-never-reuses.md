---
id: MOD-95
title: A cross-repo dispatch never reuses a brief written for another repo, and its brief carries the target repo's briefExtra
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/crossbrief.ts, tests/dispatch.test.ts, tests/dispatchtool.test.ts, tests/crossbrief.test.ts, tests/hooks.test.ts, CHANGELOG.md, docs/internals.md, docs/guide.md]
forbid: [docs/cards/**, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/storeloss.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, hooks/lib/allow.ts, bin/**, .chassis-delegation.json]
red_test: the new tests (a) to (d) in tests/dispatch.test.ts or tests/dispatchtool.test.ts (or a new tests/crossbrief.test.ts) fail on origin/main: the stale brief is reused and the other repo's brief carries the session repo's briefExtra; save that run as the red evidence first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #154: a card first written for the session repo and then re-carded for another repo kept its old brief at dispatch ("exists — reused, not overwritten"), with the session repo's worktree, card path and gate, so a worker would have worked in the wrong repo. And every brief for the other repo carried the session repo's briefExtra lines, not the target repo's.

## Done when

- STALE BRIEF. When dispatch finds an existing brief for the id, it compares the brief with what this dispatch would write on three points only: the header's repo= (absent, here, none or an absolute path), the worktree the brief names, and the card path it names. All three agree: the brief is reused exactly as today (an amended scope or a hand edit is kept). Any differs and no attempt of the task is running or awaiting its verdict: the brief is rendered fresh in place of it, and the dispatch says `2. brief <path> was written for <what it named>; rewritten for this card (<the points that differed>)`. Any differs and an attempt is open: dispatch refuses with one line naming the brief file, what differed, and the open attempt, and writes nothing (no worktree either).
- BRIEF EXTRA. A brief rendered for a card whose repo is another local repo takes `briefExtra` from that repo's config (its .chassis-delegation.json, or with none there, empty), never the session repo's. A card in the session repo is unchanged. The brief's install line already comes from the target; keep it so.
- TESTS. Engine or unit tests, red on origin/main: (a) a brief written by a first dispatch of id X in the session repo, then a card for X in another repo and a dispatch of X naming that repo: the brief is rewritten, its header names the other repo, its worktree is beside the other repo, and the dispatch output says rewritten; (b) the same with an open attempt: refused, brief file byte-identical; (c) a reused brief whose only change is an amended scope is kept byte-identical; (d) two repos with different briefExtra: the brief for the other repo holds the other repo's line and not the session repo's.
- DOCS. CHANGELOG.md gets one entry under `## Unreleased` naming #154, below any entry already there. docs/internals.md (or the docs page that describes brief reuse) says when a brief is reused, when it is rewritten, and when dispatch refuses.
- GATES. validate, node and test are green.

## Review

Read the diff. The three points are compared with the same values the brief is rendered from (the worktree as dispatch computes it, the card path as cardPath does, repo= as the header writes it), so a brief this dispatch would write itself always reads as matching, and a point the brief does not name is skipped. The comparison runs before anything is written, so a refusal with an attempt open leaves the brief and the worktree untouched. A target repo's brief takes that repo's briefExtra, empty with no config. Accepted change of behaviour: a re-dispatch whose mode differs from the existing brief's now rewrites it (or refuses with an attempt open) instead of letting the old brief decide. Rebased by hand onto MOD-96, keeping all three Unreleased CHANGELOG entries. Accepted.
