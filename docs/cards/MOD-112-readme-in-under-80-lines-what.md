---
id: MOD-112
title: README in under 80 lines: what it is, an overview diagram, three lines of evidence, install, and a docs map that includes how-it-works and evidence
domain: mod
tier: standard
status: merged
scope: [README.md, CHANGELOG.md]
forbid: [hooks/**, bin/**, tests/**, .claude-plugin/**, docs/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

The README is the first page anyone reads, and it says nothing yet about whether the mod works. docs/how-it-works.md and docs/evidence.md now exist, but the README links to neither. A reader should get what the mod does, the flow at a glance, the proof, and how to install it, all without scrolling past one screen of prose. The docs overhaul also needs its one CHANGELOG entry.

## Done when

- README.md is at most 80 lines and keeps, in this order: the title and bold one-line tagline; the existing hero image line (docs/chassis-delegation.png, unchanged); what it is in at most 3 sentences; '## How it works': a mermaid flowchart (LR, at most 8 nodes: you, brain, card, dispatch/worktree, worker, verifier, verdict, merge) with an italic alt line above it, then one line linking docs/how-it-works.md; '## Evidence': exactly three bullets taken from the top of docs/evidence.md (tasks and repos with the window, the share settled in one attempt, and the hand-vs-mod cost per card: about $1.3 through the mod against about $8.6 by hand, the mean of the three cards each way), then one line linking docs/evidence.md; '## Install' unchanged (the git clone block and /delegation setup); '## Documentation': the existing list plus How it works and Evidence, each one line; the last line 'Version 0.9.17, MIT.' unchanged.
- The Upgrading line in the docs list says what that page now holds ('what to do at each version'). Every docs list entry is at most 15 words after its link.
- Every number in the README appears in docs/evidence.md or docs/evidence/summary.json, or is the mean of the three per-card costs in docs/evidence.md's hand-vs-mod table, rounded to the nearest 10 cents. Repos are named only by count (six repos), never by name.
- CHANGELOG.md, under '## Unreleased', after the two entries already there, gains one entry: '**The docs are half as long, with an evidence page and a README that shows the flow (MOD-106 to MOD-112).**', followed by at most three sentences. They say that docs/evidence.md has six charts from six repos' ledgers, each with a data table and a lesson, and that bin/evidence-charts.mjs redraws them. They say the reference pages were cut from about 38,000 words to about 17,000, in tables and steps, with every command, option and linked heading kept. They say that docs/upgrading.md lists what to do at each version, and that docs/how-it-works.md has three corrections. Nothing else in the CHANGELOG changes.
- The node suite passes (its README checks: at most 80 lines, git clone and /delegation setup present, no '### From', every link and anchor resolves). No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. README.md is 59 lines: tagline and hero image unchanged, what it is in three sentences, a How it works section with an italic alt line, an 8-node mermaid flowchart and a link to docs/how-it-works.md, an Evidence section with three bullets and a link to docs/evidence.md, Install unchanged, and the docs list with How it works and Evidence added and the Upgrading line updated. Checked the numbers: 689 tasks across six repos, 3 to 20 October, and 88% in one attempt match docs/evidence.md; $1.3 and $8.6 are the means of the three per-card costs in its hand-vs-mod table (1.31 and 8.59). CHANGELOG gains one Unreleased entry for the docs overhaul (MOD-106 to MOD-112), after the two already there; nothing else changes. No names, no machine paths.
