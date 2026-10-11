---
id: MOD-49
title: The legacy verdict word verified is no longer read: the reader promised until 0.9.0 is removed, and a stored record or row that still says it is reported once and treated as consistent
domain: mod
tier: economy
status: merged
scope: [hooks/register.ts, hooks/lib/legacy.ts, hooks/lib/attempts.ts, hooks/lib/compaction.ts, hooks/lib/quiet.ts, hooks/lib/live.ts, hooks/lib/dashboard.ts, hooks/lib/metrics.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/brain.ts, hooks/lib/version.ts, hooks/lib/cost.ts, bin/**]
red_test: tests/node/consistent.node.mjs with the legacy.ts exemption removed fails today on legacy.ts itself; an engine test in tests/hooks.test.ts that a pre-rename store record reading verified still retires its owed row passes before and after (a guard); red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

MOD-19 renamed the verdict word to consistent and kept hooks/lib/legacy.ts reading the old word verified from stored records and rows until 0.9.0; 0.9.0's README says the next release stops reading it. Every session on this machine has written consistent since 0.8.0, and the ledger is append-only, so old rows stay as history. Removing the reader keeps the promise and takes the one file that still names the old word out of hooks/.

## Done when

- hooks/lib/legacy.ts is removed and nothing in hooks/ or bin/ imports it; the StoredVerdict type and every call site that mapped verified to consistent are gone; the node test tests/node/consistent.node.mjs no longer exempts legacy.ts (so any verified in hooks/ or bin/ fails the build)
- a stored attempt record or a recent-verdict row that still reads verified (written before 0.8.0) is treated as consistent by one small normaliser at the two read sites (attempt records from the store, recent rows), each occurrence logged once at debug level; an engine test with a pre-rename store still retires an owed row and counts a success; a ledger line that reads verified is left as is (append-only)
- README: the deprecation note under the verdict table is replaced by one line saying verified stopped being read in this release; CHANGELOG entry
