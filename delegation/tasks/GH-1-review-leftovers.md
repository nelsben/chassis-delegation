---
id: GH-1
title: The adopter review's remaining items: cardless reports verified, unverified resumes with the unchecked claims, the budget grammar warns, the classifier runs only when needed, and the fable rewrite is said out loud
domain: mod
tier: frontier
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/tier.ts, hooks/lib/dispatch.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, delegation/**, hooks/lib/handback.ts, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts, hooks/lib/init.ts, hooks/lib/gates.ts, hooks/lib/allow.ts]
red_test: engine tests in tests/hooks.test.ts for each item below (a plain Agent spawn with no header whose hand-back carries a [[report]] with a sha not on the branch is refuted, not "unverified: no brief header"; an unverified verdict's next= is a resume naming the unchecked claims; a card budget of frontier-60m produces a warning line and the default budget; a spawn with a header tier makes no classify call; a brief naming model=fable gets a notice that says fable was rewritten to opus), red first
gate: validate,node,test
budget: 3-attempts
---
## Why

Report GH-1 is the second adopter's review.
Items 1 (verified ≠ reviewed), 3 (repo=here) and 4 (red evidence) have their own issues and are done or
pending. These are the rest, in the reviewer's words:

- **Item 2, ad hoc spawns bypass everything.** "The most common way a brain delegates, the Agent tool
  with no card, gets tiered by the classifier but no verification, no budget, no ledger. Any hand-back
  containing a `[[report …]]` line could be verified cardlessly." GH-6 covered an inline header; this is
  a hand-back with a report line and NO header at all.
- **Item 5, `next=check by hand` on unverified gives the brain nothing actionable.** "Resume the worker
  with the list of unchecked claims to prove; that's what we changed."
- **Item 6, budget grammar fails silently.** "Your own fixture card says `budget: frontier-60m`, which
  falls back to the default 3 with no warning. Refuse or warn."
- **Item 8, small things.** "fable → opus rewriting hides a tier silently; the classifier runs on every
  ad hoc spawn, which costs a call per delegation when the brain already knows the tier." (The debrief
  name part of item 8 is already fixed.) The first adopter's triage adds: classify only when there is no header
  AND no caller-model hint.

## Done when

- **Cardless verification.** When an ad hoc spawn (no header, no brief file) hands back a `[[report]]`
  block, the mod verifies the git claims it CAN check without a brief: branch exists, sha resolves and
  is on the branch, `files=` equals the delta, `pr`. Scope, gate and red are `unchecked` with the reason
  "no brief: no scope=/gate=/red_test= to check against". Verdict rules as usual (a failed claim refutes;
  else unchecked → unverified). The tree is the spawn's cwd, else the session root. The row is posted
  like any other, the attempt is recorded under the report's `task=` (or `adhoc-<key>` when the report
  names none), and the ledger line is written. No budget ladder applies to an ad hoc spawn (there is no
  brief to resume against); `next=` says `accept` for verified, `check the diff` otherwise, and never
  `resume`/`respawn`. README: a "Cardless hand-backs" paragraph.
- **Unverified is actionable.** In `advise()` (hooks/lib/verify.ts), an unverified verdict with an
  agentId and a remaining budget advises `next=resume agent=<id> — prove: <claim>, <claim>` listing
  each unchecked claim's name and reason (cut to 160 chars); the resume counts against the budget as a
  failing-verdict resume does. Past the budget, or with no agentId, keep today's "check by hand" text.
  `autoEscalate` performs that resume too, sending the unchecked claim lines.
- **Budget grammar warns.** `parseBudget` (hooks/lib/brief.ts) and `budgetAttempts`
  (hooks/lib/dispatch.ts) return the fallback as today, but `/dispatch` prints
  `warning: budget "frontier-60m" is not <n>-attempts; using the default <n>` once in its output, and the
  spawn hook logs the same line to debug when a header's budget= is malformed. The tier part of a
  `<tier>-<minutes>m` chassis budget is NOT applied as the tier (the card's tier field stays the tier).
- **Classifier only when needed.** `needsClassifier` (hooks/lib/tier.ts) already takes hadHeader,
  headerTier and callerModel: make sure (with a test) that a header with a tier, OR a caller-model hint,
  skips the classify call, and that the debug line says which source picked the tier. If the current
  logic already does this, the test is the deliverable; say so in the hand-back.
- **The fable rewrite is said out loud.** When a brief or caller names `fable` and the mod spawns
  `opus`, the tier notice under the spawn reads `tier=frontier → opus (fable requested; fable is never
  spawned by the mod)` and the attempt record keeps `requestedAlias: fable`. README: one sentence in the
  tier map row.
- CHANGELOG Unreleased entry naming GH-1 items 2, 5, 6 and 8. Save your red output to
  `.delegation/GH-1/red-1.txt` and name it `red=`. Red then green; the three gates (validate, node,
  test: the gate map runs them with {worktree}) green in your worktree.
