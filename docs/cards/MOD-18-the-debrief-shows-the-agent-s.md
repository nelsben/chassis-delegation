---
id: MOD-18
title: The debrief shows the agent's own process proposals, mod findings post to the mod's tracker from any repo, and a post refuses while the redact list is empty
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/findings.ts, hooks/lib/cleanstop.ts, hooks/lib/repoconfig.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/version.ts, hooks/lib/redact.ts]
red_test: pure tests: rendering a debrief with two proposed_harness_changes gives the proposals header and two lines, with none gives nothing; the issueRepo resolver returns the manifest's owner/name when the repo file leaves it unset and empty when the repo file says \"\"; engine tests in tests/hooks.test.ts: with redact empty, `post 1` runs no gh write and prints the set-redact line, and with redact set it files as before; a repo file without issueRepo shows the default on /delegation; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

The founder asked whether /delegation debrief covers three things: process improvements for the agent, improvements to chassis-delegation, and posting to the public repo. Checked on 2026-10-11, it half does. The debrief JSON already captures the agent's process proposals (proposed_harness_changes, harness_gaps, stale_memory), but the mod never shows them: they sit in a file nobody opens. Mod findings are scrubbed and post works, but only where the repo file sets issueRepo, and the first adopter's repo does not, so a finding there can never be filed. Worse, no redact list is set anywhere, and the automatic scrub only knows the repo's folder name, origin and git identity: a product name that differs from the folder name (the first adopter's does) would pass straight into a public issue.

## Done when

- when a debrief hands back, after the findings lines, the mod prints the agent's own proposals from the debrief JSON: `proposals: n for you to review (never posted)` then one line per proposed_harness_changes entry (target · proposed_diff_summary, cut to one line) and a count of harness_gaps and stale_memory entries; none prints nothing; the same block is shown by `/delegation debrief post` under the findings
- issueRepo defaults to the mod's own repository (read from the manifest's repository or homepage field, owner/name) when the repo file leaves it unset, so a mod finding can be posted from any repo the mod runs in; an explicit empty string in the repo file still turns posting off; /delegation prints `issues: <owner/name> (the mod's own tracker)` for the default
- `/delegation debrief post <n|all>` refuses to file anything while the redact option in /config is empty, saying: set redact in /config to the product, customer, employer and repo names this session must never publish, then post again; the read-only `post` with no argument still shows the drafts, headed by that same warning
- README's debrief section names what each list is for (mod_findings → the tracker after your go; host_findings → never; the agent's proposals → you, never posted), the default issueRepo, and the empty-redact refusal; CHANGELOG entry
