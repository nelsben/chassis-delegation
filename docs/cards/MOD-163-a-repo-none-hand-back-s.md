---
id: MOD-163
title: A repo=none hand-back's gate fills {worktree} with the checkout the worker ran in, not the output folder, so a research card's validate gate can pass; dispatch says where the gate runs
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/gates.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/card.ts]
red_test: engine test: a repo=none hand-back with gate map `validate: claude plugin validate {worktree}` and scope an absolute folder outside the repo records a gate argv whose last word is the session root; at base it is the output folder. Red first
gate: validate, node, test
budget: 2-attempts
spend: 5
---
## Why

Five repo=none research cards were refuted on gate: the verifier filled `claude plugin validate {worktree}` with the card's output folder (the first scope root), which is not a plugin, so the gate exited 1 on every attempt and the budget was spent on rework the verifier could never pass. The worker ran the same gate in the session checkout and it passed. For a card with no worktree the only sensible {worktree} is the checkout the worker ran in.

## Done when

- In hooks/register.ts verifyNoRepo, the gate runs resolved by resolveGateRuns fill `{worktree}` with the session root (or the task's other repo path per MOD-44 when the card names one), not scopeRoot, and the gate command's cwd is that same root. `{outdir}` and `{files}` fill as today. The verdict's gate line for a repo=none hand-back names where it ran: `gate <id> ran in the checkout (repo=none)`.
- Dispatch's research-card line (`research card: outdir=… · scratch=…`) gains ` · gate <ids> runs in <root>` so the brain sees where the gate will run before the spawn; the card tool's dry run for repo=none prints the same note.
- Tests (red first: at base the gate argv carries the output folder): an engine test with a gate map entry whose command names {worktree} and a repo=none card whose scope is an absolute folder outside the repo asserts the recorded gate argv carries the session root and cwd is the session root, and the verdict line names the checkout; a second test asserts {outdir} still fills with the output folder; a third asserts the dispatch line names the gate and root. CHANGELOG.md Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. verifyNoRepo fills {worktree} and the gate cwd with the session root (or the task's other repo per MOD-44) instead of the output folder; {outdir} and {files} fill as before; the verdict adds `gate <ids> ran in the checkout (repo=none)` and the research-card dispatch line ends `· gate <ids> runs in <root>`. gates.ts was already parameterised, so untouched. One existing assertion that pinned the old cwd was inverted. Found by five research cards all refuted on `claude plugin validate <output folder>`.
