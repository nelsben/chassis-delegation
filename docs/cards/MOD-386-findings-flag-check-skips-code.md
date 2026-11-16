---
id: MOD-386
title: the findings gate skips a ⚠ inside backticks, quotes what it found in a malformed-flag line, and the spike brief says to write ⚠ only to open a flag
domain: mod
tier: standard
status: merged
issue: 536
scope: [hooks/lib/spike.ts, hooks/templates/brief.md, CHANGELOG.md, tests/node/spike.node.mjs, tests/harness.ts, tests/*.test.ts, tests/node/*.node.mjs]
forbid: [bin/**, docs/cards/**, docs/mockups/**, docs/spikes/**, hooks/register.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/spike.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue #536. Two spikes in a row (MOD-383, MOD-384) lost their first attempt to the findings gate's ⚠ rule. One wrote a bare `⚠ Unverified.` with no colon or text. That really is malformed, but the problem line did not show what was wrong. The other named the flag in prose as `` `⚠ Unverified` ``, inside backticks, and the gate read it as a flag. A ⚠ in inline code is a mention, not a flag. The brief also never says that ⚠ is reserved for flags.

## Before you start

- `hooks/lib/spike.ts`, `findingsCheck`: the loop that starts `let flags = 0` and splits each line on `⚠`, and `FLAG_OK`.
- `hooks/templates/brief.md`, the `- Findings format:` line. `tests/harness.ts` holds a copy of that template text (search `Findings format`), and must change with it.
- `tests/node/spike.node.mjs`: the two tests that start `a malformed ⚠ flag` and `a ⚠ with no Unverified`.

## Design (decided by the brain; build it, do not redesign it)

- In `findingsCheck`, the flag loop reads each line with its inline code spans removed: `const bare = line.replace(/`[^`]*`/g, '')`. It skips the line when `bare` has no ⚠, and splits `bare` (not `line`) on ⚠. A ⚠ inside backticks is neither a flag nor a problem, and is not counted in `flags`. Mark it `MOD-386 (#536)`.
- A malformed line's problem keeps its text and adds what it found: `line <n>: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text> (found "⚠ <first malformed part, trimmed, cut to 30 characters>")`. When the part is empty after trimming, it shows `(found "⚠")`. One problem per line, as today, quoting the first malformed part on that line.
- Nothing else in the gate changes: citations, verdicts, sections and the decisions check stay as they are.
- `hooks/templates/brief.md`, the `- Findings format:` line: after the sentence that starts `Flag a claim you could not confirm`, add this sentence word for word: `Write the ⚠ character only to open such a flag, followed by the label, a colon and the text; to mention a flag in prose, write the word Unverified alone.` Make the same change to the copy in `tests/harness.ts`.
- `CHANGELOG.md`, `## Unreleased` (make it above `## 0.9.63` when absent), `### Fixed`: one bullet `(MOD-386, #536)`.

## Tests

- `tests/node/spike.node.mjs` (the red test):
  - A line with ⚠ only inside backticks, such as ``flagged `⚠ Unverified` below``, gives no problem and adds no flag.
  - A line with a good flag and a backticked mention gives no problem and counts one flag.
  - A bare `⚠ Unverified.` gives the problem line ending `(found "⚠ Unverified.")`.
  - Update the two existing malformed-flag tests to the new line with its `(found …)` part.

## Left to you

- Test names and fixture texts.

## Done when

- A ⚠ inside an inline code span is ignored by the flag check.
- A malformed flag's problem line quotes what it found.
- The brief template and its harness copy carry the new sentence.
- Gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. The flag loop strips inline code spans first, so a backticked ⚠ is neither a flag nor a problem. The problem line quotes the first malformed part, trimmed and cut to 30 characters. The brief sentence is word for word in the template and its harness copy. Both choices are sound: the quote reads "⚠ <part>", and the cut measures the part alone. Note for later: a real flag written inside backticks now goes uncounted, which is the intended reading.
