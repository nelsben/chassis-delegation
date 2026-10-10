---
id: MOD-13
title: With workers under the mod's hooks: the git guard covers repo=here workers, the spend ceiling warns and stops mid-run, and standard-tier workers step at medium effort
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/gitguard.ts, hooks/lib/cost.ts, hooks/lib/attempts.ts, hooks/lib/tier.ts, hooks/lib/repoconfig.ts, hooks/lib/init.ts, hooks/lib/verify.ts, hooks/types/**, .claude-plugin/plugin.json, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/card.ts, hooks/lib/setup.ts, hooks/lib/dispatch.ts, hooks/lib/brain.ts, hooks/lib/update.ts, hooks/lib/cleanstop.ts, hooks/lib/findings.ts, hooks/lib/redact.ts, hooks/lib/debriefcheck.ts]
red_test: engine tests in tests/hooks.test.ts: a repo=here worker's `git push origin main` is denied naming its task while a worktree worker's push of agent/mod/X passes; a worker whose turn.complete usage crosses spend= gets one warning row and at twice spend= its next tool call is denied and the attempt reads over-spend; a standard worker's turn.step comes back with effort medium and a frontier worker's with high; pure tests in tests/tier.test.ts for effortByTier defaults and the card override; red first
gate: validate, node, test
budget: 2-attempts
spend: 12
---
## Why

Once the brain makes the spawn (the #22 handshake card), the mod's tool.call and turn.step hooks see every worker. The three things #22 lists as lost today can then be built for real: a repo=here worker on a guarded branch is refused a commit or push like the brain is; the spend ceiling (GH-106) sees a worker's usage at each turn.complete and can warn at the ceiling and stop at twice it while the run is still going, instead of recording over-spend afterwards; and turn.step's rewritable effort lets a standard card run at medium (a frontier card at high) so Sonnet work costs what it should. Depends on the handshake card being on main.

## Done when

- the git guard's tool.call hook applies to a worker whose attempt record exists (matched by agentId from the hook's agent context), with the same main/master rules as the brain; a worktree worker on its own agent/<domain>/<id> branch is untouched; the refusal line names the worker's task
- the spend ceiling reads a worker's turn.complete usage mid-run: at spend= it posts one warning row naming the task and the dollars (once), at twice spend= it sets the attempt's verdict to over-spend, denies the worker's next tool call with a one-line reason telling it to hand back now with what it has, and the ladder treats the hand-back as today's over-spend; the end-of-run accounting stays as the source of the recorded usd
- turn.step on a worker rewrites effort by tier from a new repo-file key effortByTier (defaults economy low, standard medium, frontier high; a card's own effort: wins; 0/empty leaves the engine's default) and records the effort used on the attempt; /delegation prints `effort: economy low · standard medium · frontier high`
- a worker's steps and tool calls are never confused with the brain's: delegateOnly, the brain spend record and the brain's posture lines ignore agent-context calls exactly as before
- the text MOD-12 left describing the old self-spawning behaviour is brought in line: the manifest descriptions of autoEscalate (now resumes only; a respawn prints the next spawn block) and maxWorkers (a freed slot says ready: <id>, the brain makes the spawn), the matching _maxWorkers and _agentTypes notes in the init.ts scaffold, the QueuedSpawn.model doc in hooks/types/index.d.ts, and the respawn advice in hooks/lib/verify.ts that still says the model is omitted so the mod picks
- README (the git guard, the spend ceiling, a new effort paragraph) and CHANGELOG; the manifest declares effortByTier beside spendByTier
