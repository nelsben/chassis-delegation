---
id: MOD-355
title: Release 0.9.57: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.57 section, upgrading.md gains the 0.9.56 to 0.9.57 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; MOD-298, 302, 320, 323, 327, 330, 346 and 352 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, hooks/lib/allow.ts, bin/**, docs/contracts.md, docs/guide.md, docs/install.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

MOD-353 and MOD-354 add the Work view: `/delegation work` joins the repo's issues to its cards and opens them as a tracker pane, with a text form for a screen that places no panes. They reach adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json and README.md (the `Version 0.9.56, MIT.` line) all say 0.9.57 and nothing else in those files changes.
- In CHANGELOG.md the heading line `## Unreleased` becomes `## 0.9.57 — 2026-11-09` (em dash). Nothing else in the file changes: every bullet under `### Added` below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.56 to 0.9.57` directly above `### From 0.9.55 to 0.9.56`, in the same shape, with this one paragraph word for word: No action needed. `/delegation work` is new: it opens the Work pane, a tracker table of the repo's epics, features and leaf issues joined to their cards, with one state per leaf, state chips, search and Show done. A screen that places no panes gets the same listing as text, and `/delegation work text` always prints it. The view makes one new read-only call, `gh issue list` on the repo's own issues, at most once every five minutes; a repo whose origin is not on GitHub shows its cards alone. Detail: [CHANGELOG 0.9.57](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review: diff read whole. Three version mentions bumped, the Unreleased heading became the dated 0.9.57 heading with its two bullets untouched, and the upgrading section is word for word.
