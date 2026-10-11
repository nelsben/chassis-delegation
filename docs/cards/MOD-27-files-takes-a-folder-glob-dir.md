---
id: MOD-27
title: files= takes a folder glob (dir/** or dir/*) as covering the delta paths under it, and the red claim quotes the line that actually failed, not a passing test whose name holds "Error"
domain: mod
tier: economy
status: merged
scope: [hooks/lib/verify-native.ts, tests/**, CHANGELOG.md, README.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, bin/**]
red_test: pure tests in tests/verifynative.test.ts: files= naming objects/Snapshot/** against a delta of six paths under objects/Snapshot/ plus one other listed path holds; objects/Snapshot/* against a delta holding objects/Snapshot/a.xml and objects/Snapshot/fields/b.xml fails naming fields/b.xml as omitted; a red file whose first marker line is `getHeadline_returnsFriendlyErrorNeverAnException Pass` and a later line `x Fail System.AssertException: Expected: 200, Actual: 400` quotes the Fail line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Public issue #56: a hand-back listing a new folder as `<folder>/**` in files= was refuted on files although the six paths under it were exactly the delta, because filesClaim expands an entry only when it ends with `/`; a re-judge with a synthetic report then passed the same sha, so the refute cost a manual step and its advice would have spent a resume on one report line. In the same verdict the red claim quoted a passing test line (`…NeverAnException  Pass`) because RED_MARKER matches "Error" inside a test name, while the real failure (`Fail  System.AssertException: … Expected: 200, Actual: 400`) sat two lines below.

## Done when

- filesClaim treats an entry ending in /** as every delta path under that prefix and one ending in /* as the delta paths exactly one level under it, like a trailing-slash folder entry; a glob that covers no delta path still reads as invented; the existing literal and trailing-slash behaviour is unchanged
- redClaim skips a candidate line whose outcome reads as passing (a whole-word Pass, PASS, passed, ok, or a ✓/✔ mark) and prefers a line that also carries a failing outcome word (Fail, FAIL, failed, not ok, ✗, ✕) before falling back to the first marker match; the claim still holds or fails exactly as before, only the quoted line changes
- pure tests cover both; CHANGELOG
