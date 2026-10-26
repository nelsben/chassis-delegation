---
id: MOD-171
title: `/delegation merge` prints each amend the card carried, and docs/alignment.md states the amend design: `forbid` is the hard boundary, `scope` is the plan, a worker that leaves the plan says so and is checked
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/hooks.test.ts, docs/alignment.md, docs/review-and-merge.md, CHANGELOG.md]
forbid: [README.md, hooks/lib/version.ts, hooks/lib/allow.ts, hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, .claude-plugin/**, docs/cards/**]
red_test: tests/hooks.test.ts
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

A worker's `scope+=` amend is applied on its word by default, by design: it discloses an edit already made. The disclosure shows on the verdict row, which scrolls by; the moment the lead reads the diff is the merge, and merge says nothing about amends today. The alignment page lists the amend under "Where it differs" as a weakness; it should state it as the deliberate choice it is, with the new `scopeAmends` option for those who want it tighter.

## Done when

- `/delegation merge <ID>` (and the merge tool), when the task's brief holds one or more `[[amend …]]` blocks, prints one line per block before its success line: `amend: <block's ops> (<reason>) — check these paths in the diff`, in brief order; a brief with none prints nothing new. The dry run prints the same lines. `--finish` prints nothing new. The PR body the merge writes (pr.md) gains an `## Amends` section listing the same blocks after `## Done when`, only when there are any.
- Tests (red first in tests/hooks.test.ts: at base a merge of a task whose brief holds a `scope+=` block prints no amend line): an engine test asserts the line and its order for two blocks, the `## Amends` section in pr.md, and that a brief with no amends changes neither output.
- docs/alignment.md: the `scope+=` bullet leaves `## Where it differs` and becomes a bullet under `## Where it makes the guidance a check`, stating the design in two or three sentences: `forbid=` is the hard boundary no amend can cross; `scope=` is the plan; a worker that has to leave it discloses the edit with an amend, the files claim is still checked against the real diff, and the merge lists each amend for the lead; `scopeAmends` (`new-files` or `ask`) holds widening amends for approval for repos that want the guidance's stricter reading. It keeps the current source URL and links [contracts.md](contracts.md#amend). docs/review-and-merge.md says, where it describes the merge output, that each amend the card carried is listed. CHANGELOG.md `## Unreleased` gets a `### Changed` entry tagged with this card's id. Wording generic: no product, repo, person, machine path or session names.

## Review

Attempt 1/2 consistent ($0.62, Sonnet). The worker amended scope+=hooks/lib/mergecmd.ts, which is legitimate: prBody lives there and gains the Amends section. Merge prints one amend line per brief block in brief order; pr.md gets ## Amends between Done when and Verdict; no-amend and --finish outputs are unchanged. The alignment.md scope+= bullet moved to "makes the guidance a check": forbid is the hard boundary, scope is the plan, the merge lists each amend, and scopeAmends new-files or ask is the stricter reading. Gap: merge has no dry-run mode, so the card's dry-run clause had nothing to attach to. The README 85>80 node-suite failure is pre-existing (MOD-169).
