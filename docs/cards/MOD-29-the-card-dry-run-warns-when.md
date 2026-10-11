---
id: MOD-29
title: The card dry run warns when a forbid glob matches a scope entry or a path named in done-when, and the card tool says that * crosses folders
domain: mod
tier: economy
status: merged
scope: [hooks/lib/card.ts, hooks/lib/brief.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/dispatch.ts, bin/**]
red_test: pure tests in tests/card.test.ts: forbid artifacts/*.html with done-when \"`artifacts/kit/index.html` exists\" warns naming both; forbid artifacts/*.html with scope [artifacts/kit/**] warns; forbid docs/** with scope [src/**] and no done-when path warns nothing; an absolute forbid /out/*.png does not match /out/sub/a.png; engine test in tests/hooks.test.ts: the card tool's dry run for the first case prints the warning and still writes the card; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Public issue #63 (posted by the first adopter's debrief): a card forbade `artifacts/*.html` to keep the worker off the existing pages, while its done-when required `artifacts/kit/index.html`. In this mod `*` in a repo glob crosses folders, so the forbid matched the required file and attempt 1 was refuted on scope; the work was right and was merged by hand. The README says how `*` works, but the card tool, where the brain writes globs, does not, and nothing checks a card's forbid against its own scope and done-when before a worker spends an attempt on it.

## Done when

- the card tool's dry run (and dispatch's) prints one warning line per collision: `warning: forbid <glob> matches scope <entry>` when a forbid glob matches a literal scope path or the literal prefix of a scope glob, and `warning: forbid <glob> matches <path> named in done-when` for any path-like token in a done-when line (a word with a slash and a dot, in backticks or bare) that the forbid matches; nothing is refused, the card is still written
- the warning uses the same glob rule the verifier uses for that entry (repo entries: * crosses folders; absolute entries: * stays in one folder), so what the dry run warns about is exactly what the verifier would refute
- the card tool's scope and forbid parameter descriptions each gain one clause: in a repo path * crosses folders (artifacts/*.html also matches artifacts/kit/index.html); write artifacts/[^/]*.html or list the files
- pure tests for the collision finder; README's card section names the warning; CHANGELOG
