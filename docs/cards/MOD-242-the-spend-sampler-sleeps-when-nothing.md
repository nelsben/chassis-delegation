---
id: MOD-242
title: The spend sampler sleeps when nothing is running, redraws only when the figure moved, and the model probe backs off
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/live.ts, tests/live.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/live.test.ts: an idle session makes 0 ui invalidations from the sampler between fake minute 1 and fake minute 10 (fails today: about 9)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

sampleSpend/scheduleSample (hooks/register.ts near 1872-1889) reschedule forever at 15 s live / 60 s idle, call liveState and session usage, append a timestamped point to a 240-point series and redraw() every tick even when idle. The opt-in daily model probe (near 9070, probe near 4804) re-asks the same unanswered model ids every day forever.

## Done when

- With no live or queued worker and no brain turn in progress, the sampler does not reschedule; it is re-armed at turn.start, in the agent.spawn hook / decideSpawn when a worker starts, and in writeQueue when the queue changes.
- A tick appends a point and calls redraw() only when the session dollar figure or the live-worker count changed since the last point; on a skipped tick the last point is kept, and when the sampler is re-armed after a pause it appends a point at the new time so the curve is flat across the gap (geo and recentSpend in hooks/lib/live.ts keep working).
- The live interval stays 15 s while a worker is live.
- The model probe keeps failure counts in a store key delegation.models.failed (id to {n, idsHash}); an id with n >= 3 is skipped until cfg.candidateIds changes; a success clears its entry.
- Engine tests: the red test; a live worker still samples every 15 s; the probe stops after 3 failures.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
