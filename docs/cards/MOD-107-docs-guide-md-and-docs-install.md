---
id: MOD-107
title: docs/guide.md and docs/install.md cut to half: tables and short steps instead of prose, every command and anchor kept
domain: mod
tier: standard
status: merged
scope: [docs/guide.md, docs/install.md]
forbid: [CHANGELOG.md, README.md, hooks/**, bin/**, tests/**, .claude-plugin/**, docs/cards/**, docs/contracts.md, docs/configuration.md, docs/spend.md, docs/review-and-merge.md, docs/internals.md, docs/upgrading.md, docs/how-it-works.md, docs/evidence.md, docs/evidence/**]
red_test: none
gate: validate, node
budget: 2-attempts
spend: 10
---
## Why

The person says the repo reads like an overly verbose novel. guide.md is 3,708 words and install.md 1,117; a new user should get from clone to first verdict by scanning, not reading. The flow is now drawn in docs/how-it-works.md, so the guide can link there instead of narrating it.

## Done when

- docs/guide.md is at most 1,800 words and docs/install.md at most 600 (wc -w). Both read as reference: short lists, tables, and numbered steps; sentences under 25 words; no paragraph over 4 lines.
- Every command, slash command, tool name, option, config key and file path that the current text names still appears in the new text (a table row is enough). Before cutting, list them with grep; after, check the list against the new text and say in the report's metrics how many were kept.
- These headings keep their exact text, because other docs and the code link to them: in guide.md '## Dashboard' and '## One-client resources'; in install.md '## Setup'. Other headings may be merged or renamed only if nothing in README.md or docs/*.md links to them (grep for the anchor first).
- Where the guide narrates the card-to-merge flow, replace the narration with a one-line pointer to docs/how-it-works.md. Where it restates contract or configuration detail, keep one line and link to docs/contracts.md or docs/configuration.md. A fact that is found nowhere else in docs/ stays, compressed.
- No history in reference text: no card ids, no 'since 0.x', no 'used to' or 'now'. State what the mod does today.
- The node suite passes, including its link and anchor check. No machine paths, user names, or product or customer names.

## Review

Reviewed by the brain. docs/guide.md goes from 3,708 to 1,800 words and docs/install.md from 1,117 to 597. Both now read as reference: numbered steps, tables for the dry-run warnings, owed-row rules, dashboard and commands, and a pointer to docs/how-it-works.md instead of narrating the flow. The worker grepped every backticked command, tool, option, key and path before cutting; 206 of 208 survive, and the two dropped are example wording (a removed accept example's fragment, and a live timer written as mm:ss). The headings other pages and the code link to (Dashboard, One-client resources, Setup) keep their exact text, and the node suite's link and anchor check passes. Attempt 2 replaced example paths that came from a real project (a folder and test module in the sample card line, and an outdir/scratch pair) with generic ones. No history wording, no machine paths, no names.
