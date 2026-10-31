---
id: MOD-241
title: loadRepoConfig reads its three files only when one changed
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/repoconfig.test.ts, tests/hooks.test.ts, tests/harness.ts, tests/node/**, CHANGELOG.md]
forbid: []
red_test: tests/repoconfig.test.ts: a second loadRepoConfig with unchanged files makes 0 fs.read calls (fails today: 3)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

loadRepoConfig (hooks/register.ts near 1163) reads .chassis-delegation.json, the user options file and the plugin's plugin.json on every call, from 29 call sites including per-Bash brain guards and per-spawn decisions. $.fs.stat is already used elsewhere (near 5076).

## Done when

- loadRepoConfig keeps the last parsed result with each file's $.fs.stat mtime and size; a call where all three stats are unchanged returns the cached result with no fs.read.
- A missing file (stat rejects ENOENT) is cached as the state 'missing' and compares as unchanged; any other stat error falls back to reading, as today.
- The `/delegation config` paths that already pass force (near 7824-7860) still re-read; a different $.session.root() invalidates the cache.
- tests/harness.ts: fs.stat answers a file kind for the manifest path (size from options.manifest, mtime from w.mtimes) and, when w.mtimes has no entry for a path, derives mtimeMs from a content hash so a test that replaces a file's text is picked up; tests that skip fs.read keep working.
- Accepted and stated in a code comment: an edit of identical size within the host's mtime resolution is missed.
- An engine test asserts two consecutive loadRepoConfig calls with unchanged files do no second fs.read, and that editing .chassis-delegation.json between calls is picked up; existing tests in tests/hooks.test.ts that rewrite .chassis-delegation.json stay green.
- CHANGELOG.md gets an Unreleased line.
- Gates validate, node and test are green.
