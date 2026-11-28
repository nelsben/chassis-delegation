---
id: MOD-425
title: "Release 0.9.73: version bumped in three places, the CHANGELOG's Unreleased section becomes the dated 0.9.73 section, and upgrading.md gains the 0.9.72 to 0.9.73 section"
domain: mod
tier: economy
tier_reason: Mechanical release touch; every release card since MOD-298 shipped on haiku first try
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [hooks/register.ts, hooks/lib/review.ts, hooks/lib/attempts.ts, hooks/lib/quiet.ts, hooks/templates/**, bin/**, docs/internals.md, docs/review-and-merge.md, docs/cards/**, tests/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 3
---
## Why

The re-check review (MOD-424, #533) reaches adopters only in a tagged version.

## Done when

- hooks/lib/version.ts, .claude-plugin/plugin.json (the version value only) and README.md (the line that reads Version 0.9.72, MIT.) all say 0.9.73, and nothing else in those files changes.
- In CHANGELOG.md, the heading line that reads ## Unreleased becomes ## 0.9.73 — 2026-11-27 (em dash). Nothing else in the file changes: every heading and bullet stays word for word, in its order, and no Unreleased heading remains.
- docs/upgrading.md gains a section headed ### From 0.9.72 to 0.9.73 directly above the section headed ### From 0.9.71 to 0.9.72, in the same shape, with this one paragraph word for word: No action needed. When a review refuted rows and you then verify by hand at another sha, the review that follows is a re-check: the reviewer's prompt lists those rows under "Refuted before" and asks for rows only on them and on the change since that review, so a fix is checked as a fix and the whole card is not audited again. The reviewer's first line carries `recheck=<n>`, the row says `re-check:` where it said `review:`, and the ledger review row carries `recheck`. A custom `review.md` needs no change. Detail: [CHANGELOG 0.9.73](../CHANGELOG.md).
- No other file changes.
- The validate and node gates are green.

## Testing

- Planned: none
- Red test: none
- Gate validate: pass · ✔ Validation passed with warnings · 12 s · verify pass reused at merge
- Gate node: pass · 2238 pass, 0 fail, 1237 skipped (engine tests: claude plugin test runs them) · 45 s · verify pass reused at merge
- Test files changed: none
- Worker ran:
  - none beyond the gates.

## Review

Brain review (Fable 5.2): read the diff at aba007c. Version 0.9.73 in version.ts, plugin.json and the README line; the Unreleased heading is now the dated 0.9.73 heading; the upgrading section sits above 0.9.71 to 0.9.72 with the paragraph word for word. Five files, nothing else. Verifier gates green (validate, node 2238). Reviewer: 10 confirmed, 0 refuted, 2 unverifiable (no PR yet, and what the worker did in its own session).
