---
id: MOD-46
title: 0.9.0: the version named in its four places, the CHANGELOG dated, and a README "From 0.8.3 to 0.9.0" section that tells the brain it can delegate into another repo
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, tests/**]
forbid: [.claude-plugin/types/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/types/**, bin/**]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.0 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.8.3; save that run as the red evidence, then bring the other three into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two changes sit under CHANGELOG "Unreleased" since v0.8.3, and together they change what "the repo" means for a task: card and dispatch take repo as an absolute path to another local git checkout, whose card folder, base, worktree, gate and verifier the task then uses (MOD-44, public issue 95), and init and setup take a path so the brain can scaffold that repo first (MOD-45). The brief header's repo= field now carries a path, a contract change, so this is a minor bump. The legacy verdict word verified is read until 0.9.0, so this release is also where the README says that reading stops (the code change that drops it is a later card). A test may pin the version string, so tests/** stays in scope.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.0', .claude-plugin/plugin.json says "version": "0.9.0" and nothing else in the manifest changes, README.md says "Version 0.9.0, MIT.", and the CHANGELOG's "## Unreleased" heading becomes "## 0.9.0 — 2026-10-11" with its entries unchanged and no empty Unreleased section left behind
- README.md gains "### From 0.8.3 to 0.9.0" directly above "### From 0.8.2 to 0.8.3", in the same voice and shape: "What the brain will see:" then a bullet that the brain can now delegate into another local repo (card or dispatch with repo set to its absolute path; setup with that path first when it has no config), a bullet for init and setup taking a path, and a bullet that the old verdict word verified is still read in this release and will stop being read in the next; and a "What to do" note: nothing in an existing repo's config needs to change
- any test that pins the version string derives it from MOD_VERSION; no other change; tests/node/version.node.mjs is green and the three gates pass
