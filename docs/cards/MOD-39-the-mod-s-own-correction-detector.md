---
id: MOD-39
title: The mod's own correction detector catches pushback and challenge questions, not only an opening "no" or "stop"
domain: mod
tier: economy
status: merged
scope: [hooks/lib/cleanstop.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests in tests/cleanstop.test.ts: isCorrection on the first three issue 89 messages returns true (fails today) and on the thirteen benign prompts returns false; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Public issue issue 89: across two days the person corrected the brain four times, all worded as pushback or questions ("i dont agree here and i think…", "shouldnt it open a browser window…?", "…reported on something false then alerted. bug?"), and nothing recorded a correction. The person's harness capture script missed them (a proposed fix to that script is with the founder), and the mod's own detector, isCorrection in hooks/lib/cleanstop.ts, which feeds the friction events a debrief uses in events mode, is narrower still: it looks only at the first word. A debrief that cannot see corrections cannot learn from them.

## Done when

- isCorrection keeps today's first-word markers and adds, in the same order and with the same gates as the harness proposal: (f) first-person disagreement or an explicit verdict anywhere (i dont/don't/do not agree, i disagree, that's not right, you're wrong); (g) a challenge question ending in a question mark (shouldn't it/this/that/we/you/there …?, isn't it supposed …?, wasn't it supposed …?, aren't we/you supposed …?) and a message ending in `bug?`; (h) a false-report verdict (reported on something false, seems wrong/off/silly, looks wrong)
- a pure test holds a table of the four issue 89 messages (the first three caught; the fourth, a priority reversal with no marker, documented as not caught) and thirteen benign prompts that must not trip it: do you agree with this plan?, if you disagree say so, what does it do?, go ahead and dispatch, can you check for new issues please?, lets fold in the new release, is there a bug tracker for this?, add a test for the bug path, it should open a browser window, great that sounds like what we need, why does the gate take so long? just curious, whats waiting on me at this point?, go for it do it
- the mod's own prompt.submit friction hook still ignores the plugin's own submits; README (what the mod counts as a correction) and CHANGELOG
