---
id: MOD-111
title: docs/upgrading.md cut to what to do per version: every '### From' heading kept, the detail left to CHANGELOG.md
domain: mod
tier: standard
status: merged
scope: [docs/upgrading.md]
forbid: [CHANGELOG.md, README.md, hooks/**, bin/**, tests/**, .claude-plugin/**, docs/cards/**, docs/guide.md, docs/install.md, docs/contracts.md, docs/configuration.md, docs/spend.md, docs/review-and-merge.md, docs/internals.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

upgrading.md is 7,441 words, and most of it repeats the changelog. Someone upgrading wants to know only what they must do or watch for between two versions. `/delegation update` points at the exact '### From <old> to <new>' heading, so those headings must stay, but each section can shrink to its actions and a link to the changelog for the rest.

## Done when

- docs/upgrading.md is at most 2,000 words (wc -w).
- All 27 '### From ...' headings stay, character for character and in the same order (hooks/lib/update.ts matches them exactly; the node suite checks the newest one). Under each, at most 5 lines: a 'What to do:' list of the actions an adopter must take (commands to run, settings to set or check, files to move), or 'Nothing to do.' when there are none, then one line linking to the matching version in CHANGELOG.md for the detail.
- Every command, setting, config key and file path that an upgrade step tells the reader to run, set, check or move is still in the section it belongs to. List them with grep before cutting; after, check each against the new text and put the counts kept in the report's metrics. Description of what changed, without an action, goes (it is in the changelog).
- The top '## Upgrading' section (anchor #upgrading, which other docs link to) becomes the general procedure as a numbered list: how to update, how to reload, how to check the version. At most 200 words.
- Links to CHANGELOG.md resolve (use a plain link to ../CHANGELOG.md, adding an anchor only if the node suite's anchor check accepts it). The node suite passes, including its link and anchor check and its upgrading-heading check. No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. docs/upgrading.md goes from 7,441 to 990 words. The top Upgrading section is a five-step procedure (update, by-hand fallback, reload, check the version, read your step), and step 3 states once that the reload applies at every version. All 27 '### From X to Y' headings are kept character for character and in order, so /delegation update's pointer still lands. Each section is now its version-specific actions, or "Nothing to do.", then a link to CHANGELOG.md for the detail. Attempt 2 removed a reload clause that attempt 1 repeated in every section. The node suite's upgrading-heading and link checks pass. No names, no machine paths.
