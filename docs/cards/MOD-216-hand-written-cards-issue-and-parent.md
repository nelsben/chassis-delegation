---
id: MOD-216
title: "Hand-written cards: issue and parent accept #N and an issue URL, and parked is a documented card status"
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/mergecmd.ts, hooks/lib/land.ts, hooks/register.ts, tests/*.test.ts, tests/node/*.mjs, docs/contracts.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: "claude plugin test . (the #N, URL and parked cases fail now)"
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopter feedback, a follow-up to #303: MOD-209 documented that issue: and parent: must be bare numbers, but a hand-written `#12` or issue URL is silently ignored, so status comments and close-on-merge never fire. The adopter also asks whether `parked` is an accepted card status and whether dispatch and the nudge skip it.

## Done when

- Where the sync reads a card's issue: and parent: (dispatch and verdict status comments, merge finish closes, tree), `12`, `#12` and `https://github.com/<owner>/<repo>/issues/12` all read as 12; a URL naming a different repo than landRepo is not used and dispatch prints one warning line naming it. Anything else that is not a number prints one warning line at dispatch (`issue: <value> is not an issue number; no status comments or close for this card`) instead of being silently ignored.
- `parked` is an accepted card status: dispatch refuses it with `<ID> is parked; set status: queued to dispatch it`; the open-card overlap list in land bodies and the tree's open cards leave parked cards out, as they do merged ones. The land nudge reads no card status and is unchanged.
- docs/contracts.md `Fields the GitHub sync reads` is updated: the three accepted issue/parent forms, the warning, and a status table listing queued, claimed, parked, merged and landed with what each step does with it.
- Tests cover #12 and the URL form getting a status comment (fake gh), a foreign-repo URL warning, a junk value warning, parked refused by dispatch, and parked left out of the land overlap list.
- CHANGELOG.md gains entries under `## Unreleased` naming MOD-216. validate, the node tests and the engine suite pass.

## Review

Read issueRef/issueNote and checkStatus: 12, #12 and a same-repo URL read as the number; a foreign URL or junk is not used and warns at dispatch; parked is refused with the queued hint and left out of the open-card lists. Accepted; no engine test of the land overlap list with a parked card (the node openCards test covers it).
