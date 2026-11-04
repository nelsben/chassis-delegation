---
id: MOD-285
title: /delegation setup checks what the issue tree needs: the six type labels, the project option, scopeAmends with parents, and open issues with no type label, each with its fix line
domain: mod
tier: standard
status: merged
scope: [hooks/lib/setup.ts, hooks/register.ts, tests/node/setuptree.node.mjs, tests/setup.test.ts, docs/install.md, CHANGELOG.md]
forbid: [hooks/lib/ghguard.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, docs/cards/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/setuptree.node.mjs) — the 'three labels missing print three gh label create lines' case fails on main (no tree group exists) and passes after
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Adopting the issue tree in a repo is a checklist held in people's heads: create six labels, set project, set scopeAmends within-parent, type the issues that were filed by hand. Setup already prints one line per check with its fix; it knows nothing about any of these. The next repos to adopt the tree should get the list from setup, not from memory.

## Done when

- hooks/lib/setup.ts gains a 'tree' group of advice checks (never required: setup must still scaffold without them). The pure half takes what register.ts read and returns the lines; register.ts does the reads. The checks, each as one advice line with its fix indented under it when it fails: (a) the six labels type:feature, type:epic, type:story, type:task, type:bug, type:spike exist on the repo's origin; when some are missing the fix is one `gh label create type:<x> --repo <owner/repo>` line per missing label; (b) the `project` option is set (repo file or user option) or the repo file says none; the fix names `/delegation config project <owner>/<number>`; (c) when any card in the card folder has a `parent:` field and the effective scopeAmends is not within-parent, the fix is `/delegation config scopeAmends within-parent`; (d) the count of open issues on origin with no type: label, with the fix `gh issue edit <n> --repo <owner/repo> --add-label type:task` printed for the first ten and `... and <k> more` after.
- The reads in hooks/register.ts are read-only gh calls run the way the tree tool runs `gh issue view` (through `run` with the same timeout): `gh label list --repo <owner/repo> --json name --limit 100` and `gh issue list --repo <owner/repo> --state open --limit 200 --json number,labels`. When gh is not on PATH, origin does not resolve, or a read fails, the tree group prints one line `tree checks skipped: <reason>` and setup is otherwise unchanged. The gh guard (hooks/lib/ghguard.ts) is not touched: these are reads.
- The `setup` tool and `/delegation setup` both print the group; `/delegation init` does not run the reads.
- docs/install.md Setup section lists the four tree checks under a 'Tree' heading with their fix lines, and says they are advice.
- tests/node gains a pure test of the tree lines (labels missing, project unset, parent cards with scopeAmends apply, three untyped issues, and all-good prints four ok lines); one engine test in tests/setup.test.ts (or the existing setup test file) checks the skipped line when gh is absent, using the harness test wrapper.
- CHANGELOG.md Unreleased gains one line for this change. No other file changes.

## Review

Brain review: pure treeLines/treeText and the two JSON readers in setup.ts; gatherTree in register.ts does the two reads with the tree tool's run/timeout and skips with one line on any failure; two exact read-only argv shapes added to allow.ts under an approved amend, landRepo only. Nit, not refuted: gatherTree sets the module-level landRepo and sessionRoot so the reads pass, so `setup <other path>` leaves landRepo on that repo for the session. First attempt, $0.56.
