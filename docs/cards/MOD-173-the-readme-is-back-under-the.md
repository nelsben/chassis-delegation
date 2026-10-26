---
id: MOD-173
title: The README is back under the front-door limit (at most 75 lines), and the pre-bash "no repository" test uses a folder outside the checkout, so the node suite is green on main
domain: mod
tier: standard
status: merged
scope: [README.md, tests/node/bin.node.mjs, CHANGELOG.md]
forbid: [hooks/**, .claude-plugin/**, docs/**, tests/node/docs.node.mjs]
red_test: tests/node/docs.node.mjs
gate: validate, node
budget: 2-attempts
spend: 5
---
## Why

MOD-169's "How it fits Anthropic's guidance" section took README.md to 85 lines, and the node docs test allows 80, so the node suite has been red on main since then. Neither the validate nor the test gate runs that suite. A second node test, the pre-bash "folder that is no repository" case, builds its folder under tests/.tmp inside the checkout, so it fails when the suite runs from a checkout on main, where the hook rightly denies a commit. The 0.9.30 release waits on both.

## Done when

- README.md has at most 75 lines (`wc -l README.md` prints 75 or less), giving headroom under the test's limit of 80.
- The cut comes from the `## How it fits Anthropic's guidance` section: its three labelled lists (Follows, Enforces, Adds) become three bullets, each starting with the bold word `**Follows.**`, `**Enforces.**` or `**Adds.**` and then one or two sentences that keep every point the lists made. The per-attempt dollar ceiling is named once, under Adds, not twice. The section keeps its heading and its closing `Sources, and where the mod differs: [docs/alignment.md](docs/alignment.md).` line.
- Nothing else in README.md changes: every other section, link and the last line `Version 0.9.29, MIT.` are byte-identical. If 75 lines cannot be reached from that section alone, cut a blank line or the Documentation list's Changelog entry rather than any other content, and say which in the report.
- tests/node/bin.node.mjs: the test `a folder that is no repository, a non-Bash call, and input that is not JSON: nothing printed, exit 0` makes its folder with `mkdtempSync(join(tmpdir(), 'plain-'))` from node:os, outside any repository, and it passes whether the suite runs from a checkout on main or on a branch. No other test changes; the hook code is not changed.
- The node suite (`node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs`) reports 0 fail. To show the second fix, run that one file from a checkout whose branch is main, or describe in the report how the test now cannot see the checkout.
- CHANGELOG.md `## Unreleased` gets a `### Fixed` entry (or adds to the existing one) tagged MOD-173: the README fits its front-door limit again, and the no-repository pre-bash test no longer depends on the checkout's branch. Wording generic: no product, repo, person, machine path or session names.

## Review

The worker committed the work but handed back a placeholder instead of a report, so it counted as no-report on attempt 1. `dispatch verify=322dffc` then judged it consistent on attempt 2/2, with every claim held and the validate and node gates green. README.md is now 73 lines, and the three lists are three bold-led bullets with every point kept. The no-repository pre-bash test makes its folder under os.tmpdir(). The CHANGELOG has a Fixed entry. One miss: Enforces still says "a retry budget and a dollar ceiling", so the ceiling is named twice. The 0.9.30 release card MOD-174, which already touches README.md, carries that one-phrase fix.
