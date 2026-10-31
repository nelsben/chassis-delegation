---
id: MOD-225
title: "Dogfood: the brain-polling row ignores loop words inside heredoc bodies and quoted text (#305)"
domain: mod
tier: standard
status: merged
issue: 305
scope: [hooks/lib/drive.ts, tests/drive.test.ts, tests/node/*.mjs, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: claude plugin test . (a new tests/drive.test.ts case fails now: `cat > notes.md <<'EOF'` with a body containing "while" and later "sleep" is classed as a poll)
gate: validate, node, test
budget: 2-attempts
spend: 4
---
## Dogfooding feedback (from a consumer repo)

Reported by a lead session in a repo that uses the mod day to day; adds a concrete false positive to issue #305.

## Why

`isPoll` (hooks/lib/drive.ts line 31) tests the whole command text, so `/(^|[\s;&|(])while\s[^]*\bsleep\b/` matches a file write whose heredoc body is prose that says "while" and, anywhere later, "sleep". At a large context the lead got the "the brain polled with ..." row for writing a notes file, which is no poll at all. A row that fires on writes teaches the lead to ignore the row, and then a real poll at 200K+ (#305) goes unnoticed too.

## Done when

- `isPoll` and the repeat key (`commandKey`) look at the command with heredoc bodies (`<<WORD` / `<<'WORD'` / `<<-WORD` up to the closing word) and single- or double-quoted strings removed. The cut is a small pure helper with its own tests.
- Still polls: `until [ -f x ]; do sleep 5; done`, `while true; do ...; sleep 10; done`, `sleep 30 && cat log`, the same inside `bash -c '...'` (a quoted shell body run by bash/sh/zsh -c is kept, not cut).
- No longer polls: a `cat > f <<'EOF'` write whose body holds "while ... sleep" or "until "; `git commit -m "wait until the sleep test passes"`; `echo "sleep 5"`.
- tests/drive.test.ts gains each case above. The #305 row text and threshold are unchanged.
- CHANGELOG.md gains a Fixed entry under `## Unreleased` naming MOD-225 and #305. validate, the node tests and the engine suite pass.

## Review

The poll detector and repeat key now read the command with heredoc bodies cut and quoted strings emptied (cutText in drive.ts); a quoted body after bash/sh/zsh -c is kept, so a poll inside it still counts. Every card case is tested. Side effect, as the card asked: commits with different -m text share one repeat key. The red is a load failure (cutText not yet exported), not an assertion failure.
