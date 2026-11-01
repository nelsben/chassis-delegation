---
id: MOD-257
title: Defect: /delegation config says when the repo file's project overrides the user's project option
domain: mod
tier: standard
status: merged
scope: [hooks/lib/configcmd.ts, hooks/lib/configeff.ts, hooks/register.ts, tests/configcmd.test.ts, tests/node/**]
forbid: []
red_test: tests/configcmd.test.ts: repo project none with user project acme/3 shows 'overridden' (fails today)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Since MOD-223, `/delegation config project` shows the repo file's project (owner/number or none) as the value in effect with source (repo), but when the user option is also set nothing says the user value is being overridden, so a user who set project in /config sees it silently ignored. MOD-223's review noted the code had no wording for a user value the repo beats.

## Done when

- The worker first checks whether configView/configcmd already has an overridden-source wording for any option; if it does, project uses exactly that wording; if not, it adds one line after the value: `(your /config value <v> is overridden by the repo file)`.
- With repo project and a different user project, both the long `/delegation config project` and the short view show the note; with equal values or no user value, no note.
- The same note applies to any other option where a repo-file value beats a user /config value, if the code path is shared; otherwise project only, and the report says which.
- tests/configcmd.test.ts covers: repo none + user acme/3 shows the note; repo acme/3 + user acme/3 shows none; no repo project shows today's view.
- Gates validate, node and test are green.
