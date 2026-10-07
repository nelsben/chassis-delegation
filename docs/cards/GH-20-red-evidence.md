---
id: GH-20
title: The report names its red-test evidence file (red=) and the verifier checks it exists, shows a failure, and is fresh per attempt
domain: mod
tier: frontier
status: merged
scope: [hooks/lib/brief.ts, hooks/lib/verify-native.ts, hooks/lib/verify.ts, hooks/lib/attempts.ts, hooks/register.ts, templates/brief.md, types/**, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, agents/**, hooks/lib/handback.ts, hooks/lib/scheduler.ts, hooks/lib/gitguard.ts]
red_test: a pure test in tests/verifynative.test.ts for a new redClaim() (red because it does not exist) and an engine test in tests/hooks.test.ts where a report with red=.delegation/T-4/red-1.txt pointing at a non-empty file with a failure line holds, and the same report with no red= is unverified naming the missing evidence
gate: node
budget: 3-attempts
---
## Why

Report GH-20 and GH-1 item 4, from a second
adopter. The brief says "run the red test first and show it failing", but the report grammar has no
place for the evidence, so the verifier takes the worker's word. By the time anyone looks the test
passes. One of their workers pasted attempt 1's red output as attempt 2's; a reviewer caught it only
because the counts did not match.

## Done when

- **Grammar.** `REPORT_FIELDS` in hooks/lib/brief.ts gains an optional `red` (a path, relative to the
  worker's tree, or `none`). `parseReport` carries it. The README's Report contract shows it.
- **Brief template.** templates/brief.md tells the worker: before changing any source, run the red test
  and save its failing output to `.delegation/<task>/red-<attempt>.txt` inside the worktree (make the
  folder; `.delegation/` is gitignored, and that is fine, the verifier reads the tree, not git); on a
  resume write a NEW file for the new attempt; name the file in the report as `red=<path>`. The pure
  template test in tests/node/templates.node.mjs is updated to require that paragraph.
- **The claim.** A new claim `red` in hooks/lib/verify-native.ts, after `gate`, pure function
  `redClaim({ path, exists, bytes, text, priorHashes })` plus the register.ts plumbing that reads the file
  through `$.fs`:
  - the brief's `red_test` is empty or `none` → no claim at all (docs-only cards stay as they are);
  - `red=` absent or `none` while `red_test` is set → `unchecked`: "no red= evidence named; the brief
    asks for the red test's failing output" (so the verdict is unverified, never refuted);
  - the path is outside the worker's tree (absolute elsewhere, or `..`) → `failed`;
  - the file is missing or empty → `failed`;
  - the text holds no failure marker → `unchecked` with "no failure marker found". Markers, case-insensitive,
    any one suffices: `fail`, `failed`, `failing`, `error`, `not ok`, `✗`, `exit code [1-9]`, `exit 1`,
    `AssertionError`, `Expected`, `expected`;
  - byte-identical to a red file from an earlier attempt of the same task and subtask (sha-256 kept on the
    attempt record, `redHash`) → `failed`: "red evidence is attempt <n>'s file again";
  - else `held`, with the byte count and the first marker line (trimmed to 100 chars).
  Pure logic in verify-native.ts; the hash in register.ts with whatever the engine offers (if `$` has no
  hashing, a small pure FNV-1a 64 over the bytes in hooks/lib is fine: it only has to catch a paste).
- **The record.** `AttemptRecord` in hooks/lib/attempts.ts carries `red?: string` and `redHash?: string`;
  `patchRecord` writes them from the verdict. `types/index.d.ts` is updated if the record type lives there.
- **The row.** `verdictVerbosity: full` shows the red claim line like the others.
- **Tests.** The red test above plus: a resume that re-uses attempt 1's bytes is refuted on red; a brief
  with `red_test=none` yields no red claim; the real-git suite in tests/node/verify-native.git.node.mjs
  gains one case with a red file in the temp worktree.
- CHANGELOG.md gets an Unreleased entry naming GH-20. README's verification table gains the `red` row.
- Red then green; `claude plugin validate .`, the node suite and `claude plugin test .` are green in your
  worktree (quote their last lines; only `node` is in the gate map). Save your own red output to
  `.delegation/GH-20/red-1.txt` and name it `red=` in your report: you are the first worker under the rule.
