---
id: MOD-80
title: /delegation debrief post and apply find the findings where the debrief wrote them, including ~/.claude/harness/debriefs, and a refusal names every folder it looked in
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/debriefdir.ts, hooks/lib/cleanstop.ts, hooks/lib/findings.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/verdicttool.ts, hooks/lib/mergecmd.ts, hooks/lib/live.ts, hooks/lib/band.tsx, hooks/lib/watch.ts, hooks/lib/dashboard.ts]
red_test: a new engine test: the harness debrief skill wrote this session's findings file under <home>/.claude/harness/debriefs and this session's debrief record names its debrief path; `/delegation debrief post` (no argument) must show that file's findings; on main it answers "no .findings.json under <root>/.delegation/debriefs/"; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

When the person's own debrief skill is installed, the debrief writes its file and the .findings.json beside it under ~/.claude/harness/debriefs (debriefFolder in hooks/register.ts). The by-hand doors never look there: postCore lists only <root>/.delegation/debriefs, and latestProposals and settledNotes fall back to that folder too. So on a machine with the skill, `/delegation debrief post 1` always answers "no .findings.json under <root>/.delegation/debriefs/. Run /delegation debrief first." right after a debrief that did write one, and the posture line keeps telling the brain to post findings it cannot reach. The automatic post works only because afterFindings hands postCore the path directly. Live: a session in another repo ran a debrief that wrote 2026-10-15-<slug>.findings.json under the harness folder, then `/delegation debrief post 1` was refused this way.

## Done when

- ONE RESOLVER. A pure function (a new hooks/lib/debriefdir.ts, or beside findingsPathOf in hooks/lib/cleanstop.ts) decides which findings file the by-hand doors read, from: this session's debrief record path (DebriefRecord.path, `~/` expanded), the repo folder <root>/.delegation/debriefs listing, the harness folder <home>/.claude/harness/debriefs listing, and the session id. Order: (1) the record's path, its .findings.json via findingsPathOf, when that file exists; (2) the newest .findings.json in the repo folder; (3) the newest .findings.json in the harness folder whose debrief belongs to this session (its `debrief` field names a debrief file whose `session_id` is this session's id) or, when no session matches, none. A harness file from another session is never picked by default, because that folder is shared by every repo on the machine. It returns the path or the list of folders it looked in.
- POST. postCore uses the resolver whenever opts.path is not given. When nothing resolves, the reply is `debrief post: no findings file for this session; looked in <repo folder>/, <harness folder>/ (only this session's debriefs) and this session's debrief record. Run /delegation debrief first.` with the real paths. The auto path (afterFindings, opts.path given) is unchanged.
- APPLY. latestProposals and settledNotes read through the same resolver and folders (settledNotes reads the last few debriefs from both folders, harness ones filtered to this session as above), and the apply refusal names the folders the same way. `/delegation debrief apply` on a harness-folder debrief from this session lists its proposals.
- TESTS. Engine cases in tests/ (a new tests/debriefdir.test.ts or beside the existing debrief post tests): the harness skill wrote this session's findings under <home>/.claude/harness/debriefs and the record names it: `debrief post` (the read-only form) shows it; the record is gone but the harness file's debrief names this session: it is still found; a newer harness findings file from another session is ignored and the refusal names both folders; a repo-folder file is still found as before; `debrief apply` lists a harness-folder debrief's proposals. Pure cases for the resolver's order. Existing debrief tests stay green unchanged except where they pin the old refusal text.
- DOCS. README's debrief post / apply text says where the findings are looked for. CHANGELOG.md has an entry under `## Unreleased` above the latest version heading (create the heading if there is none). The three gates pass.

## Review

Attempt 1 (sonnet, $0.62) accepted as handed back. The harness folder is shared by every repo on the machine, so it is read only for debriefs whose session_id is this session's; the record's path is tried first, which is what fixes the live case. Accepted decision: a by-hand post of a harness-folder file writes its gh body files under <root>/.delegation/debriefs, because the allowlist reads body files only there. Red evidence was produced in a scratch copy of the plugin holding only the new test file, to save a full engine run. At merge the rebase onto MOD-81 conflicted only in CHANGELOG.md; both Unreleased entries were kept.
