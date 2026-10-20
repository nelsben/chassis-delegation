---
id: MOD-106
title: docs/evidence.md proves the mod's efficacy from six repos' ledgers: accessible SVG charts generated from a committed summary, each with a data table and the lesson it taught
domain: mod
tier: standard
status: merged
scope: [docs/evidence.md, docs/evidence/**, bin/evidence-charts.mjs, tests/node/evidence-charts.node.mjs, tests/fixtures/evidence-charts/**]
forbid: [CHANGELOG.md, README.md, hooks/**, .claude-plugin/**, docs/cards/**, bin/evidence.mjs, docs/guide.md, docs/install.md, docs/contracts.md, docs/configuration.md, docs/spend.md, docs/review-and-merge.md, docs/internals.md, docs/upgrading.md, docs/how-it-works.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs (the new tests/node/evidence-charts.node.mjs fails: bin/evidence-charts.mjs does not exist)
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

The repo claims the mod works but shows no numbers, and the person wants production-grade proof. Six repos have run it for two weeks; bin/evidence.mjs already turns their ledgers into an anonymized summary. This card commits that summary, adds a small script that draws the charts from it so they can be regenerated, and writes one page that a reader can scan in two minutes, including the failures and what each one changed.

## Done when

- The inputs are the files /private/tmp/claude-501/-Users-bennelsen-Documents-chassis-delegation/7595c35d-55fa-4b9c-a706-a473dfef605a/scratchpad/evidence-2026-10-19.json (the summary) and evidence-notes.md beside it (the checked facts). The summary is copied unchanged to docs/evidence/summary.json. Every number on the page comes from summary.json or evidence-notes.md; nothing else is invented. Repos are named only A–F, and nothing says what a repo is, builds, or who owns it.
- `node bin/evidence-charts.mjs <summary.json> <outdir>` (Node built-ins only) writes these SVG files and exits 0: outcomes.svg (final verdict per task, horizontal bars), attempts.svg (tasks by attempts to settle: 1, 2, 3), tiers.svg (per tier: mean $ and median minutes, two small bar panels), spend-by-day.svg (usd per day, with a labelled vertical marker at 2026-10-08 'spend ceiling, 0.5.0'), repos.svg (per repo A–F, verdict mix as 100% stacked horizontal bars). A sixth, hand-vs-mod.svg (cost per card, grouped bars, by hand vs through the mod), takes its numbers from a small constant in the script that matches the eval table in evidence-notes.md. The generated files are committed under docs/evidence/.
- Every SVG is accessible and theme-safe: role="img", a <title> and a <desc> that states the main finding in one sentence; every bar has a visible text value; categories are told apart by label and position, never by colour alone; text is at least 12px; a <style> block with @media (prefers-color-scheme: dark) sets text and axis colours so it reads on GitHub's light and dark themes; transparent background; width 720, height fits content.
- docs/evidence.md is at most 1200 words. It opens with a 3-line summary (tasks, share settled in one attempt, landed, worker spend, window), then one section per chart: the image with meaningful alt text, a compact markdown data table of the same numbers under it, and one bold 'Lesson:' line. It ends with: the hand-vs-mod eval table; the outside adopter's eight asks with the version each shipped in (found in CHANGELOG.md, 'open' if none) as a table; a short 'Wins and gaps from 120 debriefs' list; and 'Reproduce it': the two commands, run on your own ledgers.
- The lessons are the checked ones in evidence-notes.md, stated plainly, including the bad numbers: repo C's unverified run and its cause (#164, fixed in 0.9.17), repo D's 7 Oct spend and the spend ceiling, repo F's cardless delegation, and that refutes are the verifier catching unbacked claims.
- tests/node/evidence-charts.node.mjs runs the script on tests/fixtures/evidence-charts/summary.json (a small fixture) into a temp dir and checks: the six files exist, each parses as XML-ish text with role="img", <title> and <desc>, every bar value appears as text, the dark-mode media query is present, and no file holds a path or a task-id-shaped token. It runs in the existing node suite.
- The node suite's link check passes (images and links in docs/evidence.md resolve). No machine paths, user names, or product or customer names anywhere in the change.

## Review

Reviewed by the brain. docs/evidence.md (1,187 words) opens with a three-line summary, then six charts, each with alt text, a data table and a bold lesson: final verdicts, attempts to settle, cost and time per tier, spend per day with the 0.5.0 ceiling marked, verdict mix per repo A-F, and hand vs mod cost per card. It ends with the hand-vs-mod eval table, the adopter's eight asks and where each shipped, wins and gaps from the debriefs, and the two commands that reproduce it. docs/evidence/summary.json is byte-identical to the summary generated from main. The six SVGs come from bin/evidence-charts.mjs (Node built-ins only) and carry role=img, title, desc, a visible value on every bar, numbered legends so colour is never the only cue, and a dark-mode style block; rendered and checked by eye. Checked against CHANGELOG.md: asks 2-6 and 8 shipped in 0.4.0, asks 1 and 7 in 0.8.0. Where the notes and the JSON differed (Opus n=75 vs 72, repo counts per task rather than per attempt), the worker followed the JSON, which is right. tests/node/evidence-charts.node.mjs covers the script on a small fixture. Leak scan of the change: 0 names, 0 machine paths. One known limit: the SVG colour scheme follows the reader's system setting, so a reader who forces GitHub's theme opposite to their system sees low-contrast text.
