---
id: MOD-368
title: bin/advisor.mjs reads session transcripts and ledgers and prints one anonymized summary of advisor use, by caller, by day, by rule and by cue
domain: mod
tier: standard
status: merged
issue: 501
scope: [bin/advisor.mjs, tests/node/advisorreport.node.mjs, tests/fixtures/advisor/*, tests/node/*.node.mjs, docs/guide.md, CHANGELOG.md]
forbid: [hooks/**, docs/cards/**, docs/mockups/**, bin/evidence.mjs, bin/evidence-charts.mjs, bin/chassis-hook.mjs, .claude-plugin/plugin.json, README.md, docs/upgrading.md, tests/harness.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/advisorreport.node.mjs
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

A ledger is per repo and holds only a carded worker's advisor calls (MOD-365). The brain's own calls, ad hoc agents and sessions outside the mod are in no ledger, and the mod cannot read a session transcript each turn (they run to hundreds of megabytes). The owner wants every advisor call reportable across all sessions before deciding how stepping up should work. A script that streams the transcript files, and joins the ledgers it is given, answers: who called, what it cost, whether the rule was kept, whether a cue was followed, and whether a frontier card with the call did better than one without.

## Before you start

- `bin/evidence.mjs` and `tests/node/evidence.node.mjs`: the house pattern for a script (Node built-ins only, reads only the files named, writes nothing, anonymized output, `skippedLines`) and for its test (spawned with `spawnSync`, fixtures under `tests/fixtures/`). Follow both.
- `hooks/lib/cost.ts`: the price table. Read only.
- The shapes below were read from real transcripts on 2026-11-11. Write the fixtures in these shapes; do not invent others.

A transcript is JSON lines. An assistant message is written as several rows (one per content block) that repeat the same `message.id` and the same `message.usage`:

```json
{"type":"assistant","timestamp":"2026-11-11T02:14:07.120Z","message":{"id":"msg_01","model":"claude-opus-5-5","usage":{"input_tokens":4,"output_tokens":493,"iterations":[{"type":"message","input_tokens":2,"output_tokens":344},{"type":"advisor_message","model":"claude-fable-5-2","input_tokens":52430,"output_tokens":2210,"cache_read_input_tokens":0,"cache_creation_input_tokens":0},{"type":"message","input_tokens":2,"output_tokens":149}]},"content":[{"type":"server_tool_use","name":"advisor","input":{}}]}}
```

A main session's file is `<projects>/<project folder>/<session id>.jsonl`. A subagent's is `<projects>/<project folder>/<session id>/subagents/agent-<agent id>.jsonl`.

## Design (decided by the brain; build it, do not redesign it)

### 1. Command line

`node bin/advisor.mjs [--text] [--since YYYY-MM-DD] [--ledger <ledger.jsonl>]… <file or folder>…`

- Each positional is a `.jsonl` file or a folder walked to any depth for `.jsonl` files. None given, an unknown flag, or a bad date: the usage line on stderr and exit 2.
- Files are read as a stream, line by line (`node:readline` over `createReadStream`), never whole. A line is parsed only when it contains the text `"advisor_message"`; other lines are not parsed and not counted as skipped. A line that contains it and is not valid JSON adds 1 to `skippedLines`.
- A file is `subagent` when its path has a `subagents` folder in it, else `main`. Its session id is the `<session id>` part of the two path shapes above.

### 2. Counting

- Within one file a `message.id` is counted once. Each entry of `message.usage.iterations` with `type === 'advisor_message'` is one call, with: the day (UTC) of the row's `timestamp`, the caller's family from `message.model`, the advisor's family from the entry's `model`, `in` (`input_tokens` + `cache_read_input_tokens` + `cache_creation_input_tokens`), `out`, and dollars.
- Family: `fable`, `opus`, `sonnet`, `haiku` when the model id contains that word, else `other`.
- Dollars: the script holds its own table for the advisor models only, per million tokens: `claude-fable-5-2` in 8, out 40, cache read 0.2; `claude-fable-5-1` 10, 50, 0.25; `claude-opus-5-5` 4, 20, 0.2. A model id matches when it starts with the key. Cache creation tokens are priced as input. Another model: the call is counted, its dollars are not, and `unpriced` goes up by 1.
- `--since`: calls on days before it are left out, and so are ledger rows whose `at` is before it.
- `self`: a call whose caller family equals its advisor family.
- `uncounted` (a check that the host's transcript shape has not moved): a line is also parsed when it contains the text `"advisor_tool_result"`. Within a file, the distinct `message.id`s that hold a content block of type `advisor_tool_result`, less the calls counted in that file, floored at 0, summed over files. It is 0 while the shape holds; above 0 means calls were made that this script could not count.

### 3. The ledgers (`--ledger`, any number)

Rows are read by field name; a row without the field is not part of that count. A line that is not JSON adds to `skippedLines`.

- `carded`: over rows with an `advisor` object (MOD-365): the sum of `advisor.calls` and of `advisor.usd`.
- `rules`: over rows with `advisorRule` (MOD-366) and a `verdict`, grouped by `tier` then by rule, leaving out rows whose `advisorRuleSource` is `card` (a hand-set rule is not part of the split): `attempts`, `consistent` (the verdict is `consistent` or the legacy `verified`), `usd` (sum of the row's `usd`), `calls` (sum of `advisor.calls`), `over` (rows with `advisorOver`), `changed`, `noChange` (by `advisorSaid`).
- `cues`: over rows with `kind === 'advisor-cue'` (MOD-367), grouped by `cue`: `raised`, and `followed`: the cue's `sessionId` is the session id of a `main` file that was read, and that file has a call stamped from the cue's `at` to 15 minutes after it. One call can follow at most one cue (the earliest). Also per cue kind, `mergedFollowed` and `mergedNot`: of the followed cues, and of those not followed, how many have a later row in the same ledger for the same `task` with `kind === 'accept'` and `how === 'merged'`.

### 4. Output

JSON on stdout, keys sorted, dollars rounded to 2 places:

```json
{
  "window": { "first": "2026-11-10", "last": "2026-11-11" },
  "files": 31, "sessions": 6, "skippedLines": 0, "unpriced": 0, "uncounted": 0,
  "totals": { "calls": 13, "usd": 12.9, "in": 1530000, "out": 61000, "self": 2 },
  "sides": { "main": { "calls": 5, "usd": 6.1 }, "subagent": { "calls": 8, "usd": 6.8 } },
  "callers": { "haiku": { "calls": 2, "usd": 0.9 }, "opus": { "calls": 10, "usd": 10.4 } },
  "advisors": { "fable": { "calls": 13, "usd": 12.9 } },
  "days": { "2026-11-11": { "calls": 13, "usd": 12.9 } },
  "projects": { "A": { "calls": 9, "usd": 8.2 }, "B": { "calls": 4, "usd": 4.7 } },
  "carded": { "calls": 8, "usd": 6.8 },
  "rules": { "frontier": { "once": { "attempts": 3, "consistent": 2, "usd": 14.1, "calls": 3, "over": 0, "changed": 1, "noChange": 2 } } },
  "cues": { "refute2": { "raised": 1, "followed": 1, "mergedFollowed": 1, "mergedNot": 0 } }
}
```

- `projects` are lettered `A`, `B`, … in the sorted order of the project folders; `sessions` counts distinct session ids with at least one call; `files` counts files read. `carded`, `rules` and `cues` are present only when a `--ledger` was given. With no call at all, `window` is `null`.
- The output never holds a path, a folder name, a session id, an agent id, a task id or free text (`advisorWhat` is not read).
- `--text` prints the same numbers as plain lines instead: one totals line, then one line per key of `sides`, `callers`, `days`, `rules` and `cues`.

### 5. Tests, `tests/node/advisorreport.node.mjs`, fixtures in `tests/fixtures/advisor/`

- A folder with one main file and one subagent file under the two path shapes: the whole JSON compared with `toEqual`.
- A message written as three rows with the same id is one call; two `advisor_message` entries in one message are two calls.
- A broken line holding the marker text counts in `skippedLines`; a broken line without it does not.
- A message with an `advisor_tool_result` block and no `advisor_message` entry gives `uncounted: 1`; a cued task later merged counts in `mergedFollowed` or `mergedNot`.
- `--since` drops the earlier day. An unpriced advisor model. A `self` call.
- A ledger fixture with the three kinds of rows: `carded`, `rules` and `cues` compared whole; a cue followed inside 15 minutes, one not followed, one whose session file was not read.
- The script's price numbers equal `priceFor` of `hooks/lib/cost.ts` for the three models (import it in the test; the script itself imports nothing from `hooks/`).
- The output of the fixtures run holds none of the fixture's folder names or session ids.
- No argument and an unknown flag: exit 2 with the usage line.

### 6. Docs

- `docs/guide.md`, beside the `bin/evidence.mjs` section: how to run it over the transcripts folder with each repo's ledger, and one paragraph on reading `rules` (compare frontier `once` with frontier `none`) and `cues`.
- `CHANGELOG.md`: under `## Unreleased`, `### Added`: one bullet ending `(MOD-368)`.

## Left to you (list each as a `choice:` line)

- The layout of the `--text` lines.
- The fixture contents beyond the shapes given.
- The wording of the docs and the changelog bullet.

## Done when

- The script prints the stated JSON for transcripts alone and for transcripts with ledgers, reading every file as a stream.
- The tests of section 5 pass and the output holds no path, id or free text.
- The docs and the changelog carry the lines of section 6.
- The gates `validate` and `node` pass.

## Review

Brain review (Opus 5.5): read the whole diff. The script follows the card: transcripts are streamed, only lines holding the marker text are parsed, a message is counted once by id, prices match cost.ts (checked by the test), and the output is anonymized. Run over the real transcripts since 2026-11-10 (4,002 files, 16 s): 27 advisor calls, $38.70, uncounted 0 (shape holds), self 2. Hand check: 3.57M in x $8/M + 253k out x $40/M = $38.70. The worker's choices are sound; "later row" taken as file order matches how the ledger is appended.
