---
id: MOD-70
title: /delegation config lists the options in named groups, each with a short plain-English line saying what it does
domain: mod
tier: standard
status: merged
scope: [hooks/lib/configcmd.ts, hooks/register.ts, tests/**, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/verify.ts, hooks/lib/verify-native.ts, hooks/lib/allow.ts, hooks/lib/gitguard.ts, README.md]
red_test: a new node test that every userConfig field of .claude-plugin/plugin.json has a group and a summary of at most 90 characters in hooks/lib/configcmd.ts fails on main, which has no such table; red first
gate: validate, node, test
budget: 2-attempts
spend: 6
---
## Why

The person ran /delegation config and got 48 `field = value` lines with no idea what any of them do. The manifest descriptions exist but are long and full of the mod's own terms (T1, brief, amend), and the list shows none of them. Each option needs one short line a newcomer can read, and the list needs grouping so 48 lines can be scanned.

## Done when

- hooks/lib/configcmd.ts holds a table of every manifest userConfig field: its group and a one-line summary. Each summary is plain English, at most 90 characters, and says what the option does for the person, in words a first-time user knows. Do not use the mod's own terms (brief, amend, T1, T2, delta, owed, breadcrumb, lane), and do not repeat the field name. Base each summary on the field's manifest description and the code that reads it, and make it true to both.
- The groups, in this order: Workers and models (tiers, models, effort, spend, budget, maxWorkers, agentTypes, domains, escalation, probing); Checking the work (gateMap, applyAmends, review, reviewTier, verdictVerbosity, ledgerFile, baseRef, ignore); Where things go (briefDir, briefTemplate, briefExtra, worktreeRoot, cardDir); Debriefs (autoDebrief and the debrief*, redact, postFindings fields); Evals (autoEval and the eval*, sessionUsdCap fields); Guards and nudges for the brain (gitGuard, guardBranches, delegateOnly, driveWarn, driveWarnTokens, freshSessionTokens, wakeOnVerdict, readyFallbackMinutes, classifierSecondOpinion); Display (dashboardBand). The worker may move a field to a better-fitting group, and says so in the hand-back.
- `/delegation config` prints each group as a heading line, then each field as `<field> = <value>` with the (default)/(locked) marks as now, with its summary on the next line indented two spaces. A blank line separates groups. The how-to line and the no-rows line stay last.
- Any manifest field missing from the table still lists, under a last group named Other with no summary, so the list never drops an option.
- `/delegation config <field>` shows the summary under the value line, then the kind, the choices and the full manifest description as now.
- Tests: a node test fails when a manifest userConfig field has no table entry, when the table names a field the manifest lacks, or when a summary is longer than 90 characters. Engine tests: the list output has the group headings in order, a field line followed by its indented summary, and Other for a field not in the table. The existing configcmd tests are updated for the new shape and still pass.
- CHANGELOG.md has an entry under a new `## Unreleased` heading above `## 0.9.7 — 2026-10-12`. The three gates pass.

## Review (attempt 1)

Attempt 1 met the card; the manifest has 49 fields, not 48, and all are in the table. Three summaries were corrected in review: delegateOnly takes deny (not refuse), postFindings also takes off, and applyAmends applies additions to both the may-touch and the must-not-touch lists, so "widen" was wrong.
