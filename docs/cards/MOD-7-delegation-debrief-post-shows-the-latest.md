---
id: MOD-7
title: /delegation debrief post shows the latest debrief's scrubbed findings as they would be posted, and on a second explicit call sends the named ones to the configured issue repo, one issue per finding, skipping what an existing issue already covers
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/repoconfig.ts, hooks/lib/findings.ts, hooks/lib/redact.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/dispatch.ts, hooks/lib/attempts.ts, hooks/lib/brief.ts, hooks/lib/update.ts, hooks/lib/cleanstop.ts, hooks/templates/**]
red_test: pure tests in tests/findings.test.ts: rendering a finding gives the Surface/Fault class/Severity first line, the [went well] prefix for went_well, and the footer; dedupe marks a finding covered by an issue that shares its surface and three title words and new otherwise; allow tests in the existing allow suite: the two forms pass only for the configured issueRepo with a body file under .delegation/debriefs/, and the refused forms stay refused; engine tests in tests/hooks.test.ts: with issueRepo set and a .findings.json of two findings, post alone prints both with their status and runs no gh write; post 1 runs exactly one gh issue create with that argv and records the number; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

The founder wants what went well and what went wrong with the mod posted to its public repo so it can be fixed. The gate matters: fourteen issues on that tracker already carry product, repo, employer and home-path names that adopter sessions typed from memory, so nothing may leave the machine without being shown first and scrubbed again, and the allowlist (which refuses every gh write today) grows by exactly two forms tied to one configured repo. Builds on the .findings.json and redact from the debrief card.

## Done when

- a new repo-file key issueRepo (owner/name; empty means posting is off) is declared beside the other REPO_KEYS in hooks/lib/repoconfig.ts with a _issueRepo note in the scaffold, and /delegation prints issues: <owner/name> when it is set
- /delegation debrief post with no argument reads the latest .findings.json under <root>/.delegation/debriefs/ and prints every finding in full as it would be posted: the title (prefixed [went well] for went_well), a body whose first line is **Surface:** <surface> · **Fault class:** <fault_class> · **Severity:** <severity> (the tracker's existing shape), the body text, an Evidence list, and a footer posted by chassis-delegation <version> via /delegation debrief; scrubbed, each with [n] and a status: new, or covered by #<k> when an issue in the repo (gh issue list --state all --limit 200 --json number,title,body, read-only) shares the surface and at least three title words with it; this form posts nothing
- /delegation debrief post 1,3 (or all) posts the named findings whose status is new with gh issue create --repo <issueRepo> --title <t> --body-file <path>, one per finding, prints #<n> <url> per issue and records the number on the finding in the .findings.json so a later post skips it; a covered finding is skipped with its #k unless named explicitly, in which case gh issue comment <k> --repo <issueRepo> --body-file <path> adds it as a comment; with issueRepo empty the command says so and posts nothing
- every body is scrubbed again with redact at post time and the post is refused, naming the finding, when any word of the redact list survives
- the allowlist gains exactly two forms: gh issue create --repo <issueRepo> --title <…> --body-file <a path under <root>/.delegation/debriefs/> and gh issue comment <number> --repo <issueRepo> --body-file <the same kind of path>, the repo equal to the configured issueRepo only; tests show any other repo, --body inline, a body file elsewhere, gh issue edit, close and delete, and gh pr create all refused
- README: the post step and the two-step rule with the hygiene reason; CHANGELOG entry
