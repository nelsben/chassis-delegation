---
id: MOD-190
title: /delegation land files nothing and dispatches nothing: it writes a redacted issue body under .delegation/landed/ and prints the gh issue create line, so new work is landed without derailing the session
domain: mod
tier: standard
status: merged
scope: [hooks/lib/land.ts, hooks/register.ts, tests/land.test.ts, tests/node/land.node.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/card.ts, hooks/lib/scopetree.ts, hooks/lib/mergecmd.ts, hooks/lib/brief.ts, hooks/lib/verify.ts, .claude-plugin/**, hooks/lib/version.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/land.node.mjs fails before hooks/lib/land.ts exists)
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

When a bug, feature or question comes up mid-session, today it either derails the session or is lost. Landing it as a GitHub issue with the context it came from, under the right parent, keeps it without starting work on it. The mod never calls gh, so it writes the body file and prints the one line the brain or the person runs.

## Done when

- `/delegation land <type> <title> [--parent <n>] [--paths a,b] [--note <text>]` is a new subcommand in the /delegation command.run hook in hooks/register.ts, and the usage line there names `land <type> <title>`. type is one of feature, epic, story, task, bug, spike; any other word, a missing title, or a --parent that is not a whole number 1 or more is refused with a one-line usage message naming the six types. The title may be given in double quotes, and the parsing lives in a new pure module hooks/lib/land.ts as an exported `parseLandArgs`.
- hooks/lib/land.ts exports a pure `landedBody(o)` that renders a Markdown issue body: the note when given; a `## Scope` heading followed by a fenced code block with the info string `scope` holding one repo-relative path or glob per line from --paths (the heading and block are left out when no paths are given); and a `## Landed from` section listing the open cards (id and title, one per line; 'none' when there are none) and the default branch. The rendered body is passed through the existing redact helper with the repo's redact rules (the same rules /delegation debrief post uses) before it is written, so no absolute path, home folder or redacted word reaches the file.
- The command writes the body to `<session root>/.delegation/landed/<slug>.md`, the slug being the card tool's existing slugOf of the title; when that file exists it adds -2, -3 and so on. Its reply is three or four lines: the file path; the line `gh issue create --repo <owner/name> --title <title> --label type:<type> [--parent <n>] --body-file <file>` with the title passed through the existing shellWord helper and owner/name from origin the way the merge block finds it; when no --parent was given and a --paths entry falls inside the scope of an open card that has a `parent:` line, the line `parent hint: #<that parent> (from <card id>)`; and a last line saying nothing was filed or dispatched. When origin is not a GitHub remote the gh line is replaced by a line saying so, and the body file is still written.
- Open cards are the cards in the card folder whose status is not merged and whose task id has no accepted or merged row in .delegation/ledger.jsonl, read the way the card tool reads siblings since MOD-188 (reuse openSiblings or the same rule; do not change hooks/lib/scopetree.ts or hooks/lib/card.ts).
- The command makes no gh call, spawns nothing, writes no card and no brief, and touches no file outside .delegation/landed/. hooks/lib/allow.ts is not changed.
- Tests: tests/node/land.node.mjs covers parseLandArgs (each type, a quoted title, --parent, --paths, --note, a bad type, a bad parent) and landedBody (scope block present and absent, open cards listed, an absolute path in the note scrubbed by the redact helper). tests/land.test.ts covers the command end to end with the engine harness: the file written under .delegation/landed/, the slug suffix on a second landing with the same title, the gh line, and the parent hint from an open card.
- docs/guide.md gains a section `## Planning on GitHub` before `## Commands and tools`, covering in plain prose and one table: the six levels and what each is (feature, epic, story, task, bug, spike; only the task leaf becomes a card; levels are optional downward); the issue body's `scope` and `forbid` fenced blocks; the card tool's issue, parent, parentScope and parentForbid fields and the containment and sibling rules (see docs/contracts.md 'Parent scope'); `Refs #n` in pr.md and the printed `gh issue close` at merge finish, and that parents are closed by hand; `/delegation land`; the six `gh label create type:<level> --repo <owner/name>` lines; one user-owned GitHub Project across repos as the view, which the mod never writes to; and setting `/delegation config scopeAmends ask` while parents are in use, because an applied scope amend is not checked against the parent. The Commands and tools section lists /delegation land. CHANGELOG.md gains an Added entry under ## Unreleased. No absolute path and no repo name other than this one in any changed file, fixtures included (use /srv/... and acme/widgets).

## Review

Attempt 1 consistent (sonnet, $0.68). Diff read: one fs.write, under .delegation/landed/; no gh, no spawn. Accepted deviation: origin is read from .git/config through the existing gitConfigValue helper because `git remote get-url` is allowed only during a merge; in a linked worktree the gh line falls back to the not-a-GitHub-remote line. Default branch comes from baseRef, else main. Engine suite also run by the worker (1724 pass).
