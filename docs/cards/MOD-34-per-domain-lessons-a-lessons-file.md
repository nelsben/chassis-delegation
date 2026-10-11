---
id: MOD-34
title: Per-domain lessons: a lessons file beside the cards is appended to every brief in that domain, capped, with /delegation lesson to add one and a count on the card dry run
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/dispatch.ts, hooks/lib/card.ts, hooks/lib/init.ts, hooks/templates/brief.md, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: pure tests in tests/dispatch.test.ts: rendering a brief for domain mod with a 3-line lessons file appends the Lessons heading and the three lines after Done when; a 45-line file is cut at 40 with the prune line; no file adds nothing; engine tests in tests/hooks.test.ts: /delegation lesson mod \"never forbid tests/** on a bump\" creates docs/cards/lessons/mod.md with the dated line and prints the count; a domain not in the list is refused naming the list; the card dry run prints lessons: 1 lines; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Public issue #65 (the first adopter, a went_well with an ask): driving the live page after each merge found bugs the verifier cannot see; two cards that restated those lessons as rules in their Why were consistent on attempt 1 and needed no fixes after merge, the first time in that run. Today a lesson lives in the brain's context and reaches a worker only when the brain remembers to restate it on each card; after a compaction or in a new session it is gone, and briefExtra is one blob for the whole repo. A committed file per domain beside the cards travels to every session and reaches every worker in that domain without the brain rewriting it. This repo has the same need: today's card-writing lessons (never forbid tests/** on a version bump, never forbid the manifest when the card needs it) belong in a mod lessons file.

## Done when

- dispatch reads <cardDir>/lessons/<domain>.md when it exists and appends it to the brief under a `## Lessons (<domain>)` heading after the Done when section, as the file stands, capped at 40 lines: a longer file is cut at 40 with a last line `(n more lines not carried; prune <path>)` and the dispatch output warns once; a missing file adds nothing and the header is unchanged
- /delegation lesson <domain> <text> appends `- <YYYY-MM-DD> <text>` to that file (creating the folder and file), refuses a domain not in the repo's domains list naming the list, and prints the file's line count and the cap; /delegation lesson <domain> alone prints the file; the file is brain-writable under delegateOnly deny because it is under the card folder
- the card tool's dry run and dispatch print `lessons: n lines from <path>` when a file exists (and `0` is not printed); the brief template gains one line telling the worker the Lessons section is the repo's own rules for this domain, learned from earlier cards, and binds like the Rules
- the init scaffold's card-folder README mentions the lessons folder; README (a Lessons section with the #65 story and the cap) and CHANGELOG
