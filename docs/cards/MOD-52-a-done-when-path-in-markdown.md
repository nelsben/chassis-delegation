---
id: MOD-52
title: A done-when path in markdown bold no longer raises forbid warnings: emphasis and trailing punctuation are stripped, and a path the scope already names is not warned
domain: mod
tier: economy
status: merged
scope: [hooks/lib/card.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/register.ts]
red_test: the issue 108 example test in tests/card.test.ts fails on main with forbid warnings; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Issue 108 finding 6: a done-when line such as `**some/file.html:** load …` produced nine warnings of the form "forbid data/** matches **some/file.html:** named in done-when", because the bold markers and the trailing colon were read as part of the path and every forbid glob shaped like ** matched it. The path was in scope, so none of the warnings was true.

## Done when

- donePaths in hooks/lib/card.ts strips leading and trailing `*` and `_` emphasis and trailing punctuation (`:` `.` `,` `;` `!` `?` `)`) from each word in either order, so `**some/file.html:**` and `**some/file.html**:` both give `some/file.html`; a word inside backticks is cleaned the same way
- forbidCollisions skips the done-when warning for a cleaned path that a scope entry already names (equal, or matched by the scope glob under the repo rule): the scope warning already covers a forbid that collides with that entry
- tests in tests/card.test.ts: the issue 108 example (done-when `**some/file.html:** load …`, scope some/file.html, forbid data/** and docs/**) gives no warning; a bold path outside scope that a forbid matches is warned once, naming the cleaned path
- a CHANGELOG entry under Unreleased; the three gates pass
