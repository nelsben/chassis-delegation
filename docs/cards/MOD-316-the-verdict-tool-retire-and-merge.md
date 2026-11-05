---
id: MOD-316
title: The verdict tool, retire and merge finish never count the dispatch base as landed, so an unbuilt worktree whose head is still the base is never reported merged
domain: mod
tier: standard
effort: high
effort_reason: three call sites and a self-healing retire marker; the ancestry rule must stay correct for rebased twins
status: merged
issue: 436
scope: [hooks/lib/verdicttool.ts, hooks/lib/attempts.ts, hooks/register.ts, tests/node/mergedverdict.node.mjs, tests/mergedverdict.test.ts, tests/merge.test.ts, tests/harness.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/mergecmd.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/mergedverdict.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An adopter saw the verdict tool answer "merged at <sha>" for a card whose worker had not committed yet, and append an accept row with how=merged to the ledger: mergedNow in hooks/register.ts takes the worktree head (or any attempt sha) and asks git merge-base --is-ancestor against origin/<default>, which a head equal to the base passes trivially. The attempt is then retired as merged, a later real hand-back gets "hand-back after the task closed (merged); not verified", and merge refuses because the last verdict is refuted, so the card can only be landed by hand.

## Done when

- AttemptRecord (hooks/lib/attempts.ts) gains two optional fields, `baseSha?: string` (the full sha of `origin/<default>` the worktree was cut from at dispatch) and `mergedSha?: string` (the sha the merged retire marker was set on; mergeFinish already writes it through a cast at register.ts ~3872, so declare it and drop the cast). At dispatch, right after the worktree is created (register.ts ~8427, after `git worktree add` succeeds and also on the `exists — reused` branch), the mod reads `git -C <repoRoot> rev-parse origin/<default>` (the base the dispatch line names; a sha base is used as is) and records it as `baseSha` on the attempt record it creates for the spawn; an empty or non-sha answer records nothing. No read is added anywhere else.
- hooks/lib/verdicttool.ts exports a pure `landedSha(sha: string, baseSha: string | undefined): boolean`: false when `baseSha` is a sha and equals `sha` (prefix-equal when either is short: the shorter one is a prefix of the longer); true otherwise (no baseSha recorded: the old rule stands). mergedVerdict is unchanged.
- mergedNow (hooks/register.ts, the verdict tool's merged check): the candidate list drops every sha for which landedSha(sha, baseSha) is false, where baseSha is the one on the newest attempt record of the task that has one; with no candidate left it returns undefined (not merged), so no accept row is appended, no retire marker is set and no owed row is cleared. The worktree head of an unbuilt worktree equals the recorded base, so it never reads merged. When mergedNow does retire, its patch also records `mergedSha: d.sha`.
- retireProbe (hooks/register.ts, the `merge-base --is-ancestor <sha> origin/main` read): the caller passes the attempt's baseSha; when landedSha(sha, baseSha) is false the direct-ancestor branch is skipped (`ancestor` stays unset, no git read) and the cherry-mark read runs as it does for a non-ancestor. mergeFinish (the `anc` read at register.ts ~3814): the head is accepted as the landing only when landedSha(head, baseSha of the last main attempt) holds; the rebased-twin search skips a log line whose sha equals the head (no new git read; twinIn gets the head to skip, or the line is filtered before twinIn); otherwise it returns the existing not-in-origin line. The stored merge-prepare record for the task with `head` equal to the worktree head still counts as the landing when the ancestor read says yes.
- closedReason (hooks/register.ts), for `last.retired === 'merged'` only (`'accepted'` is unchanged): with `s = last.mergedSha ?? last.sha` and `last.baseSha` both set and landedSha(s, last.baseSha) false, the marker is cleared (patchRecord with retired, retireTriedAt, retireCheckedAt and mergedSha undefined), one debug line `<label>: retire marker cleared: <sha7> is the dispatch base, not the task's commit` is logged, and the hand-back is verified as a normal attempt. With either unset, the marker stands. The card-reads-merged branch is unchanged.
- tests/node/mergedverdict.node.mjs gains a describe block for landedSha: equal full shas → false; short attempt sha that is a prefix of the full base → false; different shas → true; no baseSha → true.
- tests/mergedverdict.test.ts gains two engine cases (the fake answers `rev-parse origin/main` with one sha and the worktree `rev-parse HEAD` with the same sha, and `--is-ancestor` with exit 0): (1) a dispatched task with no commits and a pending attempt: the verdict tool does not answer merged, the ledger gets no accept row, the attempt is not retired; (2) an attempt record retired as merged with mergedSha equal to its baseSha: the next hand-back is verified (the text `hand-back after the task closed (merged)` does not appear) and the retire marker is gone from the record. The existing MOD-292 case (T-4, a merged head with no baseSha on the record) keeps passing unchanged. tests/merge.test.ts's exact finish command list (~350-361) keeps passing: no git read is added to finish.
- docs/internals.md's attempt-record and accept-row text says a merged accept row is written only for a sha that differs from the dispatch base (`baseSha`), never for a head equal to the base, and names `baseSha` and `mergedSha` as fields of the attempt record.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-316.
- The validate, node and test gates are green.

## Review

Diff read in full. landedSha is pure and prefix-safe; dispatch records the base sha under a brief-keyed store key after worktree add or reuse and the spawn hook copies it onto the attempt record, a resume inheriting its lineage's; mergedNow filters candidates by it and records mergedSha; retireProbe skips the ancestor read for the base; mergeFinish accepts the head only when landed or seen by merge prepare, and the twin search drops the head's own log line; closedReason clears a marker set on the base and lets the hand-back be judged. Four exact dispatch command-list tests gained the rev-parse line; amend granted. Nit carried: on a reused worktree the base recorded is origin/main now, not the reused head, so a stale unbuilt worktree after main moved could still read as landed; a later card could record the worktree head instead. Verdict consistent at 2ffb446 after the grant.
