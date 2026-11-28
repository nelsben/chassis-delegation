---
id: MOD-420
title: Over 3.5 MiB the store prune also deletes undated records whose task is closed or gone, the four card families and the overlap log are in the plan, and an ad hoc spawn record carries its time
domain: mod
tier: standard
status: merged
issue: 600
fixes: []
scope: [hooks/lib/retention.ts, hooks/register.ts, tests/node/retentionundated.node.mjs, tests/node/*.mjs, tests/*.test.ts, CHANGELOG.md, docs/internals.md]
forbid: [docs/cards/**, docs/spikes/**, docs/mockups/**, hooks/templates/**, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/retentionundated.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #600. The shared plugin store reached 4,192,855 characters of the host's 4,194,304 limit and refused writes, while the prune deleted nothing: 2.7 MiB of it was records the plan cannot reach, because they have no timestamp of their own and the task record they would borrow one from is already gone (ad hoc postedRow and posted entries, card postedRow entries whose task record aged out, delegation.both overlap logs whose agent pointer aged out, and the tierReason, effortReason, cardClass and baseSha families that the plan does not know at all). A hand prune freed room for now; without this card the store fills again.

## Done when

- retentionPlan in hooks/lib/retention.ts, when the store is over PRESSURE_BYTES, deletes records that have no timestamp, belong to a family the plan knows, are not in keep, and whose task is not open (or have no task because the record they hang off is gone), before it deletes any dated record younger than RETAIN_MS, and stops once the store is under TARGET_BYTES
- Below PRESSURE_BYTES an undated record is still never deleted, so the existing engine test 'a record with no timestamp is left alone' in tests/retention.test.ts holds without being edited
- The plan knows delegation.tierReason, delegation.effortReason and delegation.cardClass as per-task families (task from the key, as the other per-task families), delegation.baseSha as a per-brief family, and delegation.both as a per-agent family resolved through the agent pointer, as delegation.writes is
- Global keys (adhoc, evals, alias, updateCheck, brain, postAsk, prune and any other key outside the plan's families), session-level families and ration keys are never deleted by the undated pass, under pressure or not
- The ad hoc fallback SpawnRecord in hooks/register.ts (the one with task adhoc-<last 8 of tool_use_id>) carries at, the time the hand-back is handled
- A new node test file tests/node/retentionundated.node.mjs covers the undated pass: deleted under pressure (ad hoc postedRow, an orphan both log, a card postedRow and a cardClass of a task with no task record), kept below pressure, kept for an open task, kept for a keep key, global keys kept under pressure, undated records go before a young dated one, and the pass stops under TARGET_BYTES
- docs/internals.md, the Pruning paragraph, names the undated pass and the four new families and both; CHANGELOG.md has one bold-led entry under a new ## Unreleased section above 0.9.70, under ### Fixed, ending (MOD-<id>, #600) with the card's real id

## Before you start

- `hooks/lib/retention.ts`: read `metas`, `openTasks` and `retentionPlan` whole (about lines 59 to 210). Today `closed` keeps only metas with a `ts`, so a record with no timestamp is never deleted, under pressure or not. Records borrow a timestamp from their task's `delegation.tasks.<ID>` record (`withTask`) or their spawn (`spawnMeta`); once those age out, what hangs off them has no timestamp and stays forever.
- `tests/retention.test.ts`: the engine tests of the plan. Its `spawn` and `attempts` builders show the record shapes. Do not edit the existing expectations; if one fails, the code is wrong.
- `tests/node/waitwords.node.mjs` or `tests/node/reviewlabel.node.mjs`: the shape of a node test file (imports from `./kit.mjs`, a lazy import of the lib file).
- `hooks/register.ts`: the store key builders near line 457 (`baseSha`, `both`, `tierReason`, `effortReason`, `cardClass`) for the key shapes, and the ad hoc fallback `SpawnRecord` near line 11355 (`task: \`adhoc-${e.tool_use_id.slice(-8)}\``, `adhoc: true`). Other spawn records set `at: await now($)`.
- What the real store held when it filled (keys, then size of the unreachable part): ad hoc `postedRow` 309 keys 0.91 M; card `postedRow` with no task record 13 keys more; `both` 48 keys 0.74 M, all with no agent pointer; `tierReason`, `effortReason`, `cardClass` 1,232 keys each, 1,208 with no task record, 0.48 M together; `baseSha` 1,013 keys. `tierReason`, `effortReason`, `cardClass` and `baseSha` are written by every dispatch, dry run included, so losing one for a card not yet dispatched is harmless: the next dispatch writes it again.

## Design (decided by the brain; build it, do not redesign it)

1. **Families.** Add `tierReason`, `effortReason` and `cardClass` to `BY_TASK`. Add `baseSha` to `BY_BRIEF`. Add a `BOTH = \`${P}both.\`` family resolved like `WRITES`: `spawnMeta(str(AGENT + key.slice(BOTH.length)))`.
2. **Mark the plan's records.** `Meta` gains a boolean (name it as you like, e.g. `owned`) that is true for every key matched by one of the per-task, per-attempt, per-brief, spawn, agent, agentName, cost, writes, foreign or both branches of `metas`, and false for the session-level, ration and global branches. Session and ration records keep their own age rule and are never in the undated pass.
3. **The undated pass.** In `retentionPlan`, only when `before > PRESSURE_BYTES`, and before the existing young pass: take the metas that are owned, have no `ts`, are not in `keep`, and whose task is undefined or not open. Sort them by key (they have no age to sort by). Drop them one at a time with the existing `drop`, stopping as soon as `size < TARGET_BYTES`. Then the existing young pass runs on what is left, unchanged, also stopping under `TARGET_BYTES`. The `old` pass (dated and older than the retain time) is unchanged and runs first, as now.
4. **The result order.** `delete` lists the old and young keys by age as now, followed by the undated keys in key order. Keep `before` and `after` as they are computed now.
5. **The ad hoc spawn's time.** The ad hoc fallback `SpawnRecord` in `hooks/register.ts` gains `at: await now($)`. Change nothing else in `hooks/register.ts`.
6. Update the doc comment of `retentionPlan` to say that over PRESSURE_BYTES undated records of the plan's families go first, and that below it they stay.

Do not touch `slimSpawns`, `scanDue`, `openTasks` or the constants.

## Tests

Node tests in the new file `tests/node/retentionundated.node.mjs` (write them first; they are the red test). Import `retentionPlan`, `PRESSURE_BYTES`, `TARGET_BYTES` and `MIB` from `../../hooks/lib/retention.ts`. Build pressure with one or more dated filler records of a closed task whose `at` is recent (so the old pass leaves them), each a few hundred KiB of string, plus the undated records under test. Cases, at least:

- Over pressure: `delegation.postedRow.adhoc-1a2b3c4d:1:1`, `delegation.posted.adhoc-1a2b3c4d:1:1`, `delegation.both.ag-gone` (no `delegation.agent.ag-gone`), `delegation.postedRow.T-9:1:1` and `delegation.cardClass.T-9@/some/repo` with no `delegation.tasks.T-9` are all in `delete`.
- The same records with the store under PRESSURE_BYTES: `delete` is empty.
- Over pressure, an undated record of an open task (pass it in `open`, and separately a task whose `delegation.tasks` record has a pending attempt younger than RETAIN_MS) is not in `delete`.
- Over pressure, an undated record in `keep` is not in `delete`.
- Over pressure, `delegation.adhoc`, `delegation.evals`, `delegation.alias.sonnet`, `delegation.updateCheck`, `delegation.brain.1`, `delegation.postAsk.1`, `delegation.prune` and a `delegation.recent.<sid>` with no timestamp are not in `delete`.
- Undated first: when dropping the undated records alone brings the store under TARGET_BYTES, a young dated record of a closed task is not in `delete`.
- The pass stops: with more undated bytes than needed, `after` is under TARGET_BYTES and some undated records are not in `delete`.
- `baseSha` and `effortReason` and `tierReason` keys are reached the same way (one case is enough for the three).

Engine tests: none required. Whether an engine test can cheaply assert the ad hoc spawn's `at` is left to you; if none can within the harness, say so in the hand-back.

## Left to you

- The name of the owned flag and of the `BOTH` constant, the wording of the doc comment, the docs paragraph and the changelog entry.
- How the node file builds its filler and groups its cases.
- Whether to add an engine test for the ad hoc spawn's `at` (see Tests).

## Testing

- Planned: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/retentionundated.node.mjs
- Red test: failed before the change (.delegation/MOD-420/red-1.txt)
- Gate validate: pass · ✔ Validation passed with warnings · 4 s · verify pass reused at merge
- Gate node: pass · 2209 pass, 0 fail, 1230 skipped (engine tests: claude plugin test runs them) · 10 s · verify pass reused at merge
- Gate test: pass · 2348 pass, 0 fail, Ran 2348 tests across 111 files. [205.85s] · 3.4 min · verify pass reused at merge
- Test files changed: 1 (tests/node/retentionundated.node.mjs); tests added: 10
- Worker ran:
  - could not run an engine test for the ad hoc spawn's `at` (the fallback record is built deep inside the Agent post-tool hook, which the harness cannot drive chea
  - plan outputs on synthetic stores -> the 10 node cases pass (undated deleted over pressure, none below it, open and pending-attempt tasks kept, `keep` kept, glob

## Review

Brain review (Opus 5.5): I read the whole diff at 4815f78. It is the card's design and nothing more: tierReason, effortReason and cardClass join the per-task families, baseSha the per-brief ones, both resolves through the agent pointer like writes; Meta gains owned on every plan-family branch; over PRESSURE_BYTES an undated pass runs after the old pass and before the young one, takes owned keys with no timestamp that are not in keep and whose task is unknown or not open, in key order, and stops under TARGET_BYTES; the undated keys are appended to delete after the dated ones, and they cannot be counted twice because closed still requires a timestamp. register.ts gains only at: await now($) on the ad hoc fallback spawn. I ran the new plan read-only on the backup of the store as it was when it filled: 4,206,692 bytes to 3,145,597, 2,178 keys (agent 12, baseSha 991, both 48, cardClass 1,127), stopping before postedRow because key order reached the target first. The live store is at 3,514,564 bytes, below pressure, so today's plan deletes nothing. The economy reviewer confirmed 14 rows, 2 unverifiable (red-before-fix order; the harness claim), none refuted. Limits I accept: the undated pass picks by key order, not by size, so it can delete many small records before a few large ones; an ad hoc agent of another session that is still live can lose its postedRow under pressure (its record is only a re-post guard). Not checked: the type-check (no tsc on PATH).
