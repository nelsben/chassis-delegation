---
id: MOD-247
title: The ledger is held as a parsed index in memory, so an append and each reader stop re-parsing every row
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/ledger.ts, hooks/lib/storeloss.ts, hooks/lib/land.ts, hooks/lib/attempts.ts, tests/ledger.test.ts, tests/storeloss.test.ts, tests/land.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/ledger.test.ts: two ledger reads with no append between them make one fs.read of .delegation/ledger.jsonl (fails today: two); the harness fs.list reports mtimeMs and size from w.mtimes and the text
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

appendLedger (hooks/register.ts near 2532-2548) reads the whole ledger (357 KB, 771 rows), JSON-parses every line in ledgerHas (hooks/lib/attempts.ts near 286), then rewrites the file; eight reader sites (mergeCommand, landWith, treeWith, planWith, ledgerText, the card tool) each re-parse every row. It is 0.73 ms today but grows ~1.5 KB per task, and the host fs has no append.

## Done when

- The parsed ledger is kept in memory keyed on the (mtimeMs, size) pair of .delegation/ledger.jsonl from $.fs.list of .delegation (MOD-241's stat-keyed helper where it fits); an unchanged pair returns the parsed rows with no read.
- After the mod's own append it verifies the file's size is the pre-append size plus the appended bytes; if so the new row is pushed onto the cached rows and the key updated, else the cache is dropped and the next read re-parses.
- A row appended by another writer (another session) changes the size and is seen on the next read.
- The readers in hooks/lib/storeloss.ts, land.ts and attempts.ts take parsed rows instead of the raw text, so a read is not parsed twice.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
