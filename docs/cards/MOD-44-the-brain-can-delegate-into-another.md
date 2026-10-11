---
id: MOD-44
title: The brain can delegate into another local git repo: card and dispatch take repo set to an absolute path, the worktree is cut from that repo's origin/main, and the verifier, the gate and the config are that repo's
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/brief.ts, hooks/lib/repoconfig.ts, hooks/lib/paths.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/setup.ts, hooks/lib/scheduler.ts, hooks/lib/live.ts, hooks/lib/dashboard.ts, hooks/lib/pane.tsx, hooks/templates/brief.md, hooks/types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, hooks/lib/cleanstop.ts, hooks/lib/debriefcheck.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts with a second harness repo at /other (its own origin/main, a package.json with a test script, no config): the card tool with repo /other writes the card under the session's .delegation/cards/other/ and its dry run names the detected gate; dispatch with repo /other runs git -C /other fetch and worktree add for /other-T-1, and the spawn block names the brief; a hand-back from that worker is verified in /other-T-1 against /other's origin/main and its gate; repo set to a relative path or to the session root is refused; a pure allowlist test accepts git -C /other worktree add only for a task naming /other; red first
gate: validate, node, test
budget: 2-attempts
spend: 15
---
## Why

Public issue 95 (the first adopter): a brain rooted in one repo was asked to build the first version of a new sibling repo with its own origin/main and its own gates (npm run build, npm test) and no .chassis-delegation.json. card, dispatch and init all act on the session root, so the build went out as a plain Agent spawn with a hand-written brief: no tier pick, no ledger row, no verification, on a greenfield repo where those matter most. Putting the card in the session repo's own card folder would put another project's work on this project's board. The mod should treat a named checkout as the repo for one task: its card folder, its base, its worktree, its gate, its verifier.

## Done when

- the card tool and dispatch (tool and /dispatch) take repo as an absolute path to a git checkout (the folder holding .git; tilde expanded); anything else (not absolute, not a checkout, the session root itself) is refused in one line naming why; the existing worktree, here and none values are unchanged
- for a task with repo set to a path, every place the task touches a repo uses that path instead of the session root: the card is written to that repo's card folder when it has a .chassis-delegation.json (its cardDir), else under the session's own .delegation/cards/<repo folder name>/; the brief header carries repo=<abs path>; the base is that repo's origin/main (fetched there); the worktree is cut from that repo beside it (<repo>-<ID>); the verifier, the scope delta, the red file and the gate run there; the attempt record's root (MOD-37) is that repo; the ledger row and the verdict row go to the session as today
- that repo's .chassis-delegation.json supplies the gate map, domains, cardDir and spend when it exists; when it does not, the gate is the repo's own detected gate (setup's detectGate: package.json scripts.test, else pytest, cargo or go test) and a card may also name a one-off gate command, as for repo=here; the dry run prints `repo: <path> (config: its own | none, gate: <cmd>)`
- the host-command allowlist accepts the same git forms (fetch origin main, worktree add, diff, merge-base, status, log) with -C equal to the task's repo path for a task that names it, and nothing broader; the git guard refuses a worker's commit or push on that repo's main or master exactly as for the session root
- the scheduler, the dashboard and /delegation show the repo folder name beside a task whose repo is not the session root
- README (Delegating into another repo, with the sibling-repo example scrubbed of private names) and CHANGELOG; init taking a path is a separate card
