---
id: MOD-146
title: The card tool warns on a placeholder red test: a path in red_test that holds an `<…>` placeholder (`test/core/<module>_test.cjs`) gets a warning naming it, on every card and lane
domain: mod
tier: economy
status: merged
scope: [hooks/lib/card.ts, tests/**, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/register.ts, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: pure test in tests/node/: redTestWarnings('node test/core/<module>_test.cjs --run', ['test/**'], []) includes `warning: red_test names test/core/<module>_test.cjs, which holds a placeholder <module>; name the real file or command`; at base it returns no such line. Red first
gate: validate, node, test
budget: 2-attempts
spend: 2
---
## Why

Issue #234: the card tool accepted a red test naming `node test/core/<module>_test.cjs …` on a lane card and wrote it into four briefs, so each worker had to guess the file. A red test is the worker's first instruction; a placeholder in a path is almost always a template left unfilled. Prose placeholders that describe an input (`<3 days after the day start>`) are not paths and stay quiet.

## Done when

- hooks/lib/card.ts redTestWarnings adds, for each path-like word of the red test (the words donePaths already finds, plus any word with a `/` that holds `<` and `>`) that contains an `<…>` placeholder, the line `warning: red_test names <word>, which holds a placeholder <…>; name the real file or command`, once per word, before the scope and forbid warnings for that word (a placeholder word gets no outside-scope warning of its own).
- A `<…>` in prose (not joined to a path: whitespace on both sides, or no `/` in the word) gives no warning, so a red test like MOD-128's `resetsAt: <3 days after the day start>` stays quiet.
- The warning reaches the person through the existing path (the dispatch dry run the card tool runs prints redTestWarnings), for a single card and for each lane card; no other output changes.
- Tests in tests/node/ (pure, node runner): `node test/core/<module>_test.cjs` warns with the exact line; `tests/<name>.test.ts and tests/other.test.ts` warns once for the first only; a prose placeholder and a red test of `none` give no warning; the existing redTestWarnings cases stay green. CHANGELOG.md Unreleased gets one entry. Wording generic: no product, repo, person, path or session names.

## Review

Consistent on attempt 1. redTestWarnings gathers the path words (donePaths plus any slash word holding `<…>`); a word with a slash and a placeholder gets the placeholder warning in place of its scope or forbid line. Prose placeholders (no slash in the word) stay quiet. The ticked/bare split repeats donePaths' own two lines rather than sharing them; small enough to leave.
