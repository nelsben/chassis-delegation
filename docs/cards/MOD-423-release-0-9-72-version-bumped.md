---
id: MOD-423
title: "Release 0.9.72: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.72 section, upgrading.md gains the 0.9.71 to 0.9.72 section, and four phrases about the own-job pause cap are corrected"
domain: mod
tier: economy
tier_reason: Mechanical release touch plus four exact phrase swaps; every release card since MOD-298 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md, docs/guide.md, docs/configuration.md]
forbid: [hooks/register.ts, hooks/lib/waitstate.ts, hooks/lib/review.ts, hooks/lib/landtree.ts, hooks/templates/**, bin/**, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 3
---
## Why

The own-job wait rule, the reviewer's read of the output folder and the bug and spike types in tree import (MOD-422, #604) reach adopters only in a tagged version. The MOD-422 review also found two statements in the docs that say too much: an own-job wait has a pause cap of 12, so a worker pauses 11 times and the twelfth is charged (the docs say "up to 12 times"), and the rule reads the word queued, not "a queue". This card corrects those phrases as it releases.

## Design

Four phrase swaps, each exact. In every pair below the first line is the text in the file now and the second line is what it becomes. Each first line occurs once in its file. Change nothing else on those lines.

~~~
CHANGELOG.md (the first bullet under Unreleased)
old: the GPU lock, a queue or the background
new: the GPU lock or the background, or says it is queued

CHANGELOG.md (the same bullet)
old: may pause up to 12 times in one attempt (or the repo's `pauseCap` when that is higher) before the cap charges it
new: gets a pause cap of 12 in one attempt (or the repo's `pauseCap` when that is higher), so it may pause 11 times before the twelfth is charged

docs/configuration.md (the pauseCap row)
old: gets 12, or `pauseCap` when that is higher
new: gets a cap of 12, or `pauseCap` when that is higher

docs/guide.md (the paragraph that starts "A worker that must stop")
old: gets 12 before the cap charges it (or `pauseCap` when that is higher)
new: gets a cap of 12 (or `pauseCap` when that is higher), so its twelfth pause is the one charged
~~~

## Done when

- The four phrase swaps above are made, and nothing else changes in docs/guide.md or docs/configuration.md.
- hooks/lib/version.ts, .claude-plugin/plugin.json (the version value only) and README.md (the line that reads Version 0.9.71, MIT.) all say 0.9.72, and nothing else in those files changes.
- In CHANGELOG.md, the heading line that reads ## Unreleased becomes ## 0.9.72 — 2026-11-27 (em dash). Apart from that heading and the two swaps in the first bullet, nothing in the file changes: every heading and bullet stays word for word, in its order, and no Unreleased heading remains.
- docs/upgrading.md gains a section headed ### From 0.9.71 to 0.9.72 directly above the section headed ### From 0.9.70 to 0.9.71, in the same shape, with this one paragraph word for word: No action needed. A pause that waits on the worker's own job, a lease, the GPU lock or the gate gets a pause cap of 12 per attempt (or your `pauseCap` when higher), so it may pause 11 times before the twelfth is charged, and a hand-back with no report that says it is waiting on its own run is now a pause, not a no-report; other pauses keep the cap of 3. When a brief names an output folder (`outdir=`), the reviewer is told it may read it, images included, and never write there, and its copy of the hand-back is cut at 40,000 characters (was 6,000); a custom `review.md` keeps working and can use the new keys `{{readable}}` and `{{outdirrule}}`. A tree import plan may now hold `bug` and `spike` items, filed like tasks with their own `type:` label (create the `type:bug` and `type:spike` labels if your repo lacks them). Detail: [CHANGELOG 0.9.72](../CHANGELOG.md).
- No other file changes.
- The validate and node gates are green.

## Review

Brain review (Fable 5.2): read the diff at 5fbd2b3. Version 0.9.72 in version.ts, plugin.json and the README line; the Unreleased heading is now the dated 0.9.72 heading; the upgrading section sits above 0.9.70 to 0.9.71 with the paragraph word for word; the four phrase swaps are exact (a cap of 12, so 11 pauses and the twelfth charged; "says it is queued"). Seven files, nothing else. Verifier gates green (validate, node 2220). Reviewer: 11 confirmed, 0 refuted, 1 unverifiable (no PR yet, which is a GitHub fact).
