---
id: MOD-33
title: /delegation debrief apply turns the agent's own proposals into actions the brain shows and the person approves: list them, print one as a ready edit or card, mark it done or dismissed
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/cleanstop.ts, hooks/lib/findings.ts, hooks/lib/compaction.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: pure tests: rendering two proposals gives two numbered lines with target and status open; after a done record the second reads done with its note; the instruction block for target memory/x.md says draft, show, apply only on yes, then mark done, and for target other says show it and ask; engine tests in tests/hooks.test.ts: `/delegation debrief apply` lists the latest debrief's proposals; `apply 2 done fixed in memory` writes proposals_status to the .findings.json and the list shows it; the next debrief's prompt carries `already done:` for a proposal with the same summary; the state section carries the open-proposals line while one is open and not after; red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

A debrief ends with the agent's proposals (proposed_harness_changes, with a target such as CLAUDE.md, a memory file, a command, an agent, or other, a rationale and a one-line diff summary), printed for the person and never posted. Today they stop at that printout: nothing turns a good proposal into a change, and the same proposal can come back debrief after debrief. The founder wants a step that turns proposal n into a card or an edit, shown first, acted on only on their go. The mod must not write the person's harness files itself (the debrief skill's own boundary, and ~/.claude is outside the repo); the brain does, with the person's yes, which is already how memory edits happen.

## Done when

- /delegation debrief apply (no argument) lists the latest debrief's proposals numbered, each with target, the diff summary cut to one line, and a status: open, done (with the note and date) or dismissed (with the reason); none prints `no proposals in <debrief path>`
- /delegation debrief apply <n> prints the proposal in full (target, rationale, proposed diff) and then one instruction block for the brain, by target: for CLAUDE.md, a memory file, a command or an agent file: `draft the edit to <target> as a diff, show it to the person, apply it only on their yes, then run /delegation debrief apply <n> done <one line>`; for a target that is a mod surface or reads as code in this repo: `write a card with the card tool from this proposal, show the dry run, dispatch on go, then mark it done naming the card id`; for other: show it and ask. The mod itself writes nothing but its own record
- /delegation debrief apply <n> done [note] and apply <n> dismiss [reason] record { n, status, note, at } in the .findings.json beside the debrief (a proposals_status array), so the list shows it and the next debrief's prompt carries `already done: <summary>` / `dismissed: <summary>` for proposals whose summary matches an earlier one word for word, so the agent does not propose them again; an unknown n prints one line
- the delegation-state section, while the latest debrief has open proposals, carries one line: `n debrief proposals open — /delegation debrief apply`, and nothing more (no posture to act without asking: proposals always wait for the person)
- README debrief section (the apply step, what the mod never writes) and CHANGELOG
