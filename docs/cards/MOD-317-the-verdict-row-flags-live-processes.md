---
id: MOD-317
title: The verdict row flags live processes whose command line names the worktree at hand-back, so a worker's leftover test runs are visible
domain: mod
tier: standard
status: merged
issue: 437
scope: [hooks/lib/allow.ts, hooks/lib/liveproc.ts, hooks/register.ts, tests/node/liveproc.node.mjs, tests/allow.test.ts, tests/harness.ts, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/lib/mergecmd.ts, hooks/templates/**, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/liveproc.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

An adopter's worker ran new tests against a live VM, hung on real ssh, had its own kill denied, and handed back with the processes still running; the verifier said nothing. The brain then had no signal that the worktree still had live side effects. A read of the process table at hand-back, filtered on the worktree path, makes that visible on the verdict row without judging it.

## Done when

- hooks/lib/liveproc.ts (new, pure, imports nothing from register.ts) exports `liveInWorktree(psOut: string, worktree: string): { pid: number; command: string }[]`: one entry per line of `ps -axo pid=,command=` output whose command text contains the worktree path (trailing slashes stripped from both) followed by the end of the text, `/`, whitespace, or a quote character, so a sibling worktree `<root>-MOD-31` does not match `<root>-MOD-316/x`; the command is cut to 80 characters. It also exports `liveProcessLine(found: readonly { pid: number; command: string }[]): string | undefined`: undefined for none, else `note: <n> live process(es) name the worktree: pid <p> <command>` joining the first three with `; ` and ending ` (+<k> more)` when more than three (`1 live process`, `2 live processes`).
- hooks/lib/allow.ts (checkArgv) admits exactly the argv `['ps', '-axo', 'pid=,command=']` as a command the mod may run, nothing else that starts with ps. tests/allow.test.ts gains one case: that argv is allowed; `['ps','-axo','pid=,command=','|','grep','x']`, `['ps','aux']` and `['pkill','node']` are refused.
- runVerify (hooks/register.ts ~6289): after the repo=none and not-a-work-tree returns and only when the task is not repo=here, and not for an ad hoc or review spawn, it runs `ps -axo pid=,command=` once through run() (timeout 10 s) before verifyNative; a failed or refused read is one debug line and no note. The output goes through liveInWorktree with the worktree path (no self pid: a hooks module has no process id). liveProcessLine's text, when defined, is pushed last onto runVerify's returned lines (after the claim lines in the full text) and added as its own line right after the quiet verdict line; the ledger row and the verdict itself (consistent or refuted) are unchanged. `/dispatch --verify` reaches runVerify and gets the same note.
- tests/node/liveproc.node.mjs covers: two matching lines and one other give two entries with the command cut to 80 characters; a sibling worktree path with the same prefix does not match; a trailing slash on the worktree argument still matches; a path followed by a quote matches; liveProcessLine for none, one, three and five entries.
- docs/contracts.md, in the 'How a report is verified' section after the paragraph beginning '`consistent` means', gains one sentence: the verdict may carry `note: <n> live process(es) name the worktree: …` when the process table still names the worktree at hand-back; it is a note, not a claim.
- CHANGELOG.md gains a `### Added` heading above `### Fixed` under `## Unreleased` (when none exists) with one bullet naming MOD-317.
- The validate, node and test gates are green.

## Review

Diff read in full. liveInWorktree is pure and matches the worktree path only at a boundary (end, slash, whitespace or quote), so a sibling worktree with the same prefix is not matched; liveProcessLine names the first three with a count of the rest. allow.ts admits exactly the one ps argv. runVerify runs the read once after the repo=none and not-a-work-tree returns, skips repo=here, ad hoc and review spawns, pushes the note last and the caller prints it on its own line after the quiet verdict line; a failed read is one debug line. The hooks.test allow-list assertion gains the ps word; amend granted. Verdict consistent at f5d3a8e after the grant.
