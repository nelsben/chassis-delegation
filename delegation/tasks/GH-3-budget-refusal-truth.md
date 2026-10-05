---
id: GH-3
title: The budget refusal tells the truth and the brief's budget= is re-read on resume
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/attempts.ts, hooks/lib/brief.ts, tests/**, CHANGELOG.md, README.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/verify-native.ts]
red_test: a test in tests/hooks.test.ts where a task at its budget has its brief file's budget= raised and the next resume (agent.send / SendMessage path) is allowed
gate: validate,node,test
budget: 2-attempts
---
## Why

Report GH-3. The refusal says "budget
exhausted for <task> (<n> attempts); amend the brief's budget= or hand it to <a person>", but the budget is
read from the stored spawn record, so amending the brief file changes nothing and the steward had to
spawn a fresh worker under another subtask to continue.

## Done when

- At resume and respawn time the budget comes from the brief file named in the spawn record when that
  file exists and parses (`parseBudget`), else from the record. Raising `budget=` in the brief lifts
  the refusal; the record is not rewritten.
- The refusal text names what actually works: the brief path and the field, and that the ladder
  continues from the stored attempt count. It names no person.
- The red test goes red then green; validate, the node suite and `claude plugin test .` stay green
  (the three 5D git-guard tests already failing on `{ text }` vs `{ result }` are not yours).
- CHANGELOG.md gets an Unreleased entry naming GH-3.
