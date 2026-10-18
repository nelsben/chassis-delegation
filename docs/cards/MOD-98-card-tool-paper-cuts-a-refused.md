---
id: MOD-98
title: Card tool paper cuts: a refused gate says why, a forbid entry may hold a space, and done-when forbid warnings collapse to one line
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/gates.ts, hooks/lib/repoconfig.ts, hooks/lib/brief.ts, hooks/lib/configcmd.ts, hooks/lib/dispatch.ts, tests/card.test.ts, tests/brief.test.ts, tests/repoconfig.test.ts, tests/configcmd.test.ts, tests/dispatch.test.ts, CHANGELOG.md, docs/configuration.md]
forbid: [docs/cards/**, hooks/lib/verify-native.ts, hooks/lib/attempts.ts, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, docs/internals.md, hooks/lib/allow.ts, bin/**, .chassis-delegation.json]
red_test: new tests in tests/card.test.ts, tests/brief.test.ts and tests/repoconfig.test.ts: the refused env gate's reason in the card output, a spaced forbid entry round-tripping through the header, and five read-only done-when mentions giving one warning line; all fail on origin/main; save that run as the red evidence first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #160, three small things seen over a 60-card session. A gateMap entry refused by the gate deny list (env, for example) is dropped silently, so the card tool then reports a missing gate that reads like a typo. A folder whose name has a space cannot be forbidden at all. And `forbid X matches X named in done-when` fires for every forbid entry a done-when line merely mentions, so the warning that matters is lost.

## Done when

- REFUSED GATE. When the repo config's gateMap has an entry the gate checker in hooks/lib/gates.ts refuses, the loader keeps the reason. The card tool, for a card naming that gate, says `gate "<id>" refused: <reason>; put the command in a script file and name the script as the gate` instead of `gateMap has no gate "<id>"`. `/delegation config` shows the refused entry and its reason on one line under gateMap. The gate stays refused: nothing about what a gate may run changes.
- SPACE IN FORBID. A forbid (and scope) entry may hold a space when given through the card tool's list (a JSON array element), and it is written into the card and the brief header so the header parser reads it back whole, by quoting the entry in the header's list form (and the parser accepting the quote). The verifier then checks a path under a forbidden folder with a space in its name like any other. An entry without a space is written exactly as today, so existing briefs and cards parse unchanged. Tests: round-trip of a spaced entry through card, brief header and parseHeader; the verifier refuting a delta inside a spaced forbid folder.
- ONE LINE OF DONE-WHEN WARNINGS. The `forbid <glob> matches <path> named in done-when` warnings collapse into one line, `warning: forbid covers paths done-when names: <path> (<glob>), …`, unless the done-when statement naming the path says it is written, changed, created, added or updated (a small verb list next to the path), in which case that path keeps its own full warning line, listed first. The scope warnings (`forbid <glob> matches scope <entry>`) are unchanged.
- DOCS. CHANGELOG.md gets one entry under `## Unreleased` naming #160, below the entries already there. docs/configuration.md says a refused gate is shown with its reason and that variables go in a script.
- GATES. The red tests fail on origin/main and pass at the head; validate, node and test are green.

## Review

Read the diff, with most care on the header parser, since every brief goes through it. A list field with no double quote still ends at the first marker, as before, so existing briefs parse unchanged; a quoted entry is read whole and unquoted, and unbalanced quotes fall back to the first marker. Only an entry that looks like a path or glob and holds a space is quoted when written. The refused gate's reason is carried from the loader to the card tool and /delegation config; nothing about what a gate may run changed. The three scope amends (register.ts to pass refusedGates through, one hooks test pinning the old warning, the guide quoting it) are approved. Accepted judgement call: a single read-only done-when path also goes on the collapsed line. Accepted.
