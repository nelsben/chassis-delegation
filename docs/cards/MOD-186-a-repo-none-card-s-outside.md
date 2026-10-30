---
id: MOD-186
title: A repo=none card's outside listing is kept in a file under the session's .delegation/outside/ folder, not in the store, so several research cards in flight never push the store past its 4 MiB cap; the file goes when its store record is pruned
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/norepo.ts, tests/norepo.test.ts, tests/hooks.test.ts, tests/retention.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [README.md, hooks/lib/version.ts, hooks/lib/allow.ts, .claude-plugin/**, docs/cards/**]
red_test: tests/norepo.test.ts
gate: validate, test
budget: 3-attempts
spend: 8
---
## Why

At dispatch a research card (repo=none) lists every absolute scope and forbid root and saves the listing in the mod's store as the 'before' of its outside delta. A listing of a few thousand files is about a megabyte, retention keeps an open task's records, and four research cards in flight pushed the store past the host's 4 MiB limit: the fourth listing was refused and the store warned that new workers may get no verdict. The founder approved this harness change. It lands after MOD-185, which makes the outside check ignore the session's .delegation/ folder, so the new listing files never count against a card.

## Done when

- recordOutside in hooks/register.ts writes the listing (the same RootListing[] as today) as JSON to `<session root>/.delegation/outside/<file>.json`, where <file> is the store key's scoped id made filename-safe (every character outside [A-Za-z0-9._-] becomes `_`), through $.fs; the store key `delegation.outside.<ID>@<repo>` then holds only `{ at, briefPath, file, files }` (file = the absolute path, files = the entry count), a few hundred characters. outsideFor reads `roots` from that file; a store value that still carries `roots` inline (written by an older version) is read as today, so a card dispatched before an update still verifies. A missing or unreadable file makes the scope claim unchecked naming the file, never a crash and never consistent on scope.
- A reused brief keeps its first listing as today (the store record and its file both stand). A brief that names no outside root deletes both the store key and its file, as today it deletes the key.
- When retention deletes a `delegation.outside.*` key (hooks/lib/retention.ts plans it, register.ts runs the plan), register.ts also deletes the file the record names when that file lies under the session's `.delegation/outside/` folder; a failure is a debug line, never a stop. retentionPlan stays pure and unchanged in what it selects.
- Tests, red first at base in tests/norepo.test.ts (or the engine test file that already drives a repo=none dispatch): after a repo=none dispatch whose roots hold 2000 files, the store value under `delegation.outside.<ID>@<repo>` is under 1000 characters and the file exists with every entry; the verdict reads it and refutes a forbid touch exactly as before; an inline-roots value from an older version still verifies; a missing file gives `claim scope: unchecked` naming it. An engine test shows retention of an old closed task removes the file too. Existing tests pass unchanged.
- Docs: docs/internals.md, the store table row for `delegation.outside.<ID>@<repo>` says it holds a pointer to the listing file under `.delegation/outside/`, and the Pruning paragraph says the file goes with its record. CHANGELOG.md `## Unreleased` gets a `### Fixed` entry tagged MOD-186 (keep any MOD-185 entry there). Wording generic: no product, repo, person, machine path or session names.

## Review

Harness fix approved by the founder. Consistent on attempt 1 ($0.61, Sonnet). A research card's outside listing is now a JSON file under the session's .delegation/outside/; the store key holds only { at, briefPath, file, files }. Older inline-roots values still verify; a missing file makes scope unchecked, never held. One accepted deviation: the host's $.fs has no delete and rm is not on the allowlist, so a pruned record's file is emptied rather than deleted (a few bytes stay). Two MOD-22 engine tests that read roots from the store now read the file. Plugin test 1709 pass, node 1137 pass.
