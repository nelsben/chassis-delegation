---
id: MOD-31
title: After a debrief, the mod asks whether to post its findings (postFindings: ask by default, nothing posted without a yes), and postFindings: auto posts every new finding scrubbed, while off never asks
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/findings.ts, hooks/lib/cleanstop.ts, hooks/lib/compaction.ts, hooks/lib/repoconfig.ts, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts: with postFindings unset and redact set, a debrief hand-back with two new findings ends with the question line naming 2 and runs no gh issue create; the state section carries the ask-once line; with postFindings auto and redact set, the same hand-back runs exactly two gh issue create calls and prints both #n lines; with auto and seven new findings, five are posted and the output says two stay drafts; with auto and redact empty, nothing is posted and the question line appears with the set-redact line; with off, neither question nor posting; a postFindings key in .chassis-delegation.json is ignored; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

The founder wants the debrief's mod findings to reach the mod's tracker without the person having to remember a second command, but never without their say: by default the mod prompts and the answer is no until the person says yes; a person who trusts the scrub can set it to yes so every finding is posted, with identifiable details scrubbed out. Today a debrief ends with the drafts and a path, and posting happens only if someone types /delegation debrief post. Posting runs gh as the person, under their own GitHub account, so the setting is the person's (/config), never the repo file's, which every contributor shares.

## Done when

- a new /config option postFindings (ask | auto | off; default ask) is declared in the manifest and never read from .chassis-delegation.json; /delegation prints `post findings: <mode> → <issueRepo>` beside the issues line
- ask: when a debrief hands back with at least one new mod finding (not covered by an existing issue), the findings output ends with one question line, `post n findings to <issueRepo>? say yes to post them all, scrubbed, or name some (/delegation debrief post 1,3); nothing is posted without a yes`, and the delegation-state section tells the brain to ask the person that once and never post without an explicit yes in the person's own words; with wakeOnVerdict on, the question also arrives as the plugin's wake message; host findings and the agent's proposals are never in the question
- auto: right after the scrub, the mod posts every new mod finding through the same path as `/delegation debrief post all` (the second scrub, the survive check, the dedupe), at most 5 per debrief (the rest stay drafts and the output says how many), prints `#n <url>` per issue and records the numbers; a covered finding is skipped, never commented on, in auto; while the redact list is empty auto posts nothing, prints the set-redact line and falls back to the ask question
- off: no question and no posting; the drafts are still written and listed as today
- README (Posting the findings: the three modes, why the setting is the person's, the cap) and CHANGELOG
