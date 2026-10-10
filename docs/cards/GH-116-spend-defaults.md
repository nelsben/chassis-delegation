---
id: GH-116
title: Spend ceilings that fit the host: higher defaults, and setup proposes a ceiling from the gate command
domain: mod
tier: standard
status: merged
scope: [hooks/lib/cost.ts, hooks/lib/setup.ts, hooks/lib/init.ts, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/lib/allow.ts, hooks/lib/verify-native.ts, hooks/lib/card.ts]
red_test: pure tests: DEFAULT_SPEND_BY_TIER is economy 3, standard 10, frontier 25; proposedSpend(gateCommand) returns {standard: 15, frontier: 35} for a gate whose words include sf, sfdx, deploy, or a cloud test runner, and the defaults otherwise; setup's green output names the ceilings it wrote; red first
gate: validate,node,test
budget: 2-attempts
spend: 6
---
## Why

Public issue #34, ask 4. The standard ceiling of $6 is under the observed median for a card on a host
where the gate is a cloud deploy plus two test runs ($10 to $15 before any thinking). The wrap-up at the
ceiling is right; the number is low for that host, and setup says nothing about it.

## What to build

- Defaults become economy 3, standard 10, frontier 25 (`DEFAULT_SPEND_BY_TIER` in hooks/lib/cost.ts; the
  manifest description and README follow).
- `proposedSpend(gateCommands)` in hooks/lib/setup.ts: when any gate command's first word is `sf`, `sfdx`,
  or the command names a deploy or a remote test runner (`deploy`, `--target-org`, `gcloud`, `aws`, `az`,
  `terraform`), propose economy 5, standard 15, frontier 35; else the defaults. Setup writes the proposal as
  `spendByTier` into a fresh config and prints `config: spendByTier = …` with one clause saying why.
- README (the spend section's defaults and setup's rule) and CHANGELOG (GH-116).

Save red output to `.delegation/GH-116/red-1.txt`, name it `red=`. The gate map runs the three gates.
