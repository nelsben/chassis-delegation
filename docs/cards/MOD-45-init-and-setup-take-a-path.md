---
id: MOD-45
title: init and setup take a path, so the brain can scaffold a sibling repo before delegating into it
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, hooks/lib/init.ts, hooks/lib/setup.ts, hooks/lib/paths.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/gitguard.ts, hooks/lib/version.ts, hooks/lib/legacy.ts, hooks/lib/redact.ts, bin/**]
red_test: engine tests in tests/hooks.test.ts: /delegation setup /other on a harness repo /other holding package.json with scripts.test writes /other/.chassis-delegation.json naming that gate and the card folder README under /other, and writes nothing under the session root; the setup tool with a relative path is refused; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

Public issue 95, second half. Once card and dispatch take repo as an absolute path (MOD-44), the brain's first move on a new sibling repo is usually to set it up: its card folder README, its .chassis-delegation.json with the detected gate, its .gitignore line. Today init and setup scaffold only the session root, so the brain would have to write those files by hand into another repo, which delegateOnly refuses outside the card folder and which skips setup's checks. Depends on MOD-44.

## Done when

- the init tool, the setup tool, /delegation init and /delegation setup take an optional path (absolute, a git checkout, tilde expanded); with one they run their checks and their scaffold against that repo exactly as they do against the session root today, writing nothing in the session root; without one they are unchanged; a path that is not an absolute git checkout is refused in one line
- setup's handover for a path ends with the card tool line naming repo set to that path, so the brain's next card goes into the sibling repo
- the scaffold writes into another repo only the same files it writes into the session root (the card folder README, .chassis-delegation.json, the .gitignore line), through the mod's own write path, and delegateOnly is not involved (the mod writes them, not the brain)
- engine tests: /delegation setup /other on a harness repo with a package.json test script writes /other/.chassis-delegation.json with that gate and nothing in the session root; a relative path is refused; README (Setup, Delegating into another repo) and CHANGELOG
