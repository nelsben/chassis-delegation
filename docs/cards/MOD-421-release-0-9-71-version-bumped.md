---
id: MOD-421
title: Release 0.9.71: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.71 section, upgrading.md gains the 0.9.70 to 0.9.71 section
domain: mod
tier: economy
tier_reason: Mechanical release touch; every release card since MOD-298 shipped on haiku first try
status: merged
issue: 602
fixes: []
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/retention.ts, hooks/templates/**, bin/**, docs/guide.md, docs/internals.md, docs/cards/**, tests/**]
red_test: none
gate: validate
budget: 2-attempts
spend: 3
---
## Why

Issue #602. The store prune fix (MOD-420, #600) reaches adopters only in a tagged version, and the shared store is filling again (3.51 MB of the 4.19 M character limit, an hour after a hand prune), so every session needs the release before it reaches the limit again.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the version value only) and README.md (the line `Version 0.9.70, MIT.`) all say 0.9.71, and nothing else in those files changes.
- In CHANGELOG.md, the heading line `## Unreleased` becomes `## 0.9.71 — 2026-11-27` (em dash). Nothing else in the file changes: every heading and bullet below it stays word for word, in its order, and no `## Unreleased` heading remains.
- docs/upgrading.md gains a section `### From 0.9.70 to 0.9.71` directly above `### From 0.9.69 to 0.9.70`, in the same shape, with this one paragraph word for word: No action needed, but reload every session soon: the plugin store is shared by every session, and only a session running this version prunes the records that filled it. Over 3.5 MiB the prune now also deletes records that carry no timestamp of their own and whose task is closed or gone, and it knows the tierReason, effortReason, cardClass, baseSha and both records; below 3.5 MiB nothing changes. An ad hoc agent's spawn record now carries its time. Detail: [CHANGELOG 0.9.71](../CHANGELOG.md).
- No other file changes.
- The validate gate is green.

## Review

Brain review (Opus 5.5): Mechanical and exact. I read the whole diff at d9733f1: the version is 0.9.71 in all three places, the changelog heading is dated 2026-11-27 with an em dash and the rest of the file is untouched, and the upgrading section sits above 0.9.69 to 0.9.70 with the paragraph word for word. No reviewer ran: the repo's review-on trial line was stashed for MOD-420's merge, so the default on-frontier applied. The engine suite was not run on this card (gate validate only); it last ran green on MOD-420's tree, which holds every change this release carries.
