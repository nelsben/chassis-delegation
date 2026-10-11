---
id: MOD-40
title: A card's frontmatter value that contains a space and a hash is no longer cut there: the card tool quotes such a value when it writes the card, and the card reader keeps a hash that is not a comment
domain: mod
tier: economy
status: merged
scope: [hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests in tests/card.test.ts: a card whose red_test is \"isCorrection on the first three issue-89 messages\" written with the literal hash form round-trips whole (fails today: the read value stops before the hash); an unquoted legacy red_test line holding a hash directly followed by the letter n (the MOD-31 case) reads whole; an unquoted value holding a hash followed by a space and a trailing note reads only up to the hash; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Found on 2026-10-11 writing MOD-39: its red_test mentioned "the first three #89 messages", and the brief header the dry run printed ended at "first three", so a worker would have been handed a red test cut in half. The same happened, unnoticed, to MOD-31: its red_test was cut at "prints both #n lines", and the worker built from the done-when instead. Card frontmatter is read like YAML, where " #" starts a comment, and the card tool writes values unquoted. Issue numbers (#89), counts (#n) and anchors are common in card text, so this silently drops instructions.

## Done when

- the card tool writes any frontmatter value that contains ` #` (or starts with `#`) double-quoted, with inner double quotes escaped, so the card round-trips byte for byte through the card reader
- the card reader treats ` #` as a comment only outside quotes, and on an unquoted value it keeps a ` #` followed directly by a digit or a letter (an issue number like #89, a placeholder like #n), cutting only at ` # ` (a hash followed by a space) as a comment; a card written before this change that holds `#89` unquoted now reads whole
- the brief header written from such a card carries the whole red_test; a pure round-trip test covers `#89`, `#n` and a value with both a quote and a hash; CHANGELOG
