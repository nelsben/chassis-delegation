---
id: MOD-16
title: Each worker gets its own identity in its Bash environment: CHASSIS_SESSION_ID=<task>-a<attempt>, so a session-keyed lock tells sibling workers apart
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/identity.ts, hooks/templates/brief.md, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/version.ts]
red_test: pure tests in tests/identity.test.ts: attempt 2 of BE-101 main gives CHASSIS_SESSION_ID=BE-101-a2 and a prefix that a shell parses back to the three variables, a subtask ui gives BE-101.ui-a1, and a command that already sets CHASSIS_SESSION_ID is returned unchanged; engine tests in tests/hooks.test.ts: a recorded worker's Bash command comes out of the tool.call hook carrying the prefix, the brain's own Bash command comes out unchanged, and a worker's `git commit` on main is still refused with the same text as before; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Public issue #24 (the first adopter): workers inherit the brain's session id, and the vendored deploy-lock keys a hold on role plus session id, so two sibling workers sharing one scratch org had the same lock identity and one could release the other's live hold. The workaround is a briefExtra line telling every worker to prefix its lock calls by hand, which fails silently the first time a worker forgets. Since 0.7.0 the brain makes every worker's spawn, so the mod's tool.call hook sees each worker's Bash calls (confirmed live with MOD-13) and can set the identity itself.

## Done when

- a recorded worker's Bash tool call is rewritten in the tool.call hook so the command runs with CHASSIS_SESSION_ID=<task>-a<attempt>, CHASSIS_TASK=<task> and CHASSIS_ATTEMPT=<n> exported (a prefix such as `export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; ` with values shell-quoted), using whatever input rewrite the engine's tool.call hook types allow; a subtask other than main adds it, e.g. BE-101.ui-a1
- the brain's own Bash calls, ad hoc agents with no attempt record, and the debrief and eval runners are never rewritten; a command that already sets CHASSIS_SESSION_ID itself is left as typed
- the git guard and delegateOnly judge the command as the worker typed it, not the prefixed one, so no refusal text or decision changes
- the identity is a pure function in a new hooks/lib/identity.ts (attempt record in, the env map and the prefix out); the brief template gains one line telling the worker its identity and that it is already set in every Bash call
- README (a worker's identity, the variables, why) and CHANGELOG; the briefExtra workaround in the README's known-issues text, if any, is removed
