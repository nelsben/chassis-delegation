---
id: MOD-122
title: gateMap "_empty" names the gate the verifier runs when a hand-back changes no repo file, so research and render cards skip the full suite
domain: mod
tier: standard
status: merged
scope: [hooks/lib/gates.ts, hooks/lib/repoconfig.ts, hooks/lib/verify-native.ts, hooks/lib/init.ts, hooks/register.ts, tests/**, docs/configuration.md, CHANGELOG.md]
forbid: [bin/**, hooks/templates/**, .claude-plugin/**, docs/cards/**, .chassis-delegation.json]
red_test: the new engine test with gateMap {\"test\": <failing cmd>, \"fast\": <passing cmd>, \"_empty\": \"fast\"} and a hand-back that changes no file fails at the base: the verifier runs test
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #199, item 2. Every card names its gate by hand, and a card whose delta is empty (research, renders, reads) still pays for whatever its gate id maps to; one adopter's full suite took 30 minutes and ran twice per card. A fallback gate for an empty change set lets those cards run a smoke gate instead.

## Done when

- gateMap may hold the key `_empty` whose value is a gate id the same map has (not a command). It is kept as a key, unlike other `_`-prefixed keys, which stay comments; a value that names no id in the map is named in the config errors and ignored.
- When the verifier's changed-files listing for a hand-back is empty and gateMap._empty is set, it runs that gate id instead of the card's gate ids, and the verdict's gate lines say so (`gate: <card ids> → _empty <id> (no changed files)`). A non-empty delta runs the card's gates as today. The merge tool's gate re-run follows the same rule.
- The repo file's `_gateMap` help text written by init names `_empty`; docs/configuration.md's gateMap row documents it. CHANGELOG gains an Unreleased entry naming #199 item 2.
- Tests: pure (gate choice: empty listing with _empty → its id; empty without _empty → card gates; non-empty → card gates; _empty naming a missing id → config error) and engine (a hand-back with no changed files runs the _empty gate and is consistent).
- No machine paths, user, product or repo names. The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) accepted. A new gateForDelta in hooks/lib/gates.ts runs gateMap._empty's gate id when the changed-files listing is empty, with a gate line naming the switch; non-empty or no _empty runs the card's gates. _empty is kept as a map key, never becomes an allowlisted command or a card gate id, and a value naming no id in the map is a config error. The verifier and the merge gate re-run both apply it. Red: at base the verifier ran test on an empty delta and refuted. Gates green: validate, node 1003/0, plugin 1513/0.
