---
id: MOD-93
title: 0.9.16: the version named in its four places, the CHANGELOG dated, and a "From 0.9.15 to 0.9.16" section in docs/upgrading.md
domain: mod
tier: economy
status: merged
scope: [hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md, docs/upgrading.md]
forbid: [docs/cards/**, docs/install.md, docs/guide.md, docs/contracts.md, docs/review-and-merge.md, docs/configuration.md, docs/spend.md, docs/internals.md, docs/chassis-delegation.png, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/update.ts, hooks/lib/retention.ts, hooks/lib/serial.ts, hooks/lib/cleanstop.ts, hooks/templates/**, bin/**, .chassis-delegation.json]
red_test: bump MOD_VERSION in hooks/lib/version.ts to 0.9.16 first and run the node suite: tests/node/version.node.mjs fails on the manifest, the README and the CHANGELOG still naming 0.9.15, and tests/node/docs.node.mjs fails on docs/upgrading.md having no From … to 0.9.16 section; save that run as the red evidence, then bring the rest into line; red first
gate: validate, node, test
budget: 2-attempts
spend: 3
---
## Why

Two fixes sit under CHANGELOG "Unreleased" since v0.9.15: MOD-91 stops a failed debrief check from restarting the same debrief, and MOD-92 stops parallel spawns from killing the hooks worker. Both cost real money or a session's tools until they ship, so they go out together as the next patch.

## Done when

- hooks/lib/version.ts exports MOD_VERSION = '0.9.16'. .claude-plugin/plugin.json says "version": "0.9.16", and nothing else in the manifest changes. README.md's last line says "Version 0.9.16, MIT." The CHANGELOG's "## Unreleased" heading becomes "## 0.9.16 — 2026-10-18". Its two entries are unchanged and in the same order, and no empty Unreleased section is left behind.
- docs/upgrading.md gains "### From 0.9.15 to 0.9.16" directly above "### From 0.9.14 to 0.9.15", in the same voice and shape, with no blank line between bullets: first the line "What the brain will see:"; then one bullet with the bold lead "A failed debrief check no longer restarts the debrief (MOD-91)." and a body saying that the cooldown now counts from the latest start, that a second failed check on the same window stops the automatic start with the row `debrief stopped: the check failed twice on the window from line <n>; run /delegation debrief to retry by hand`, and that `/delegation debrief` still runs by hand; then one bullet with the bold lead "Several Agent calls in one message are decided one at a time (MOD-92)." and a body saying that each spawn is decided in the order the calls came, that an aborted hook starts and records nothing, and that a decision short of time is refused with `<id>: the spawn decision ran out of time; make the Agent call again`, which the brain answers by making that Agent call again. Then the "What to do:" paragraph, copied verbatim from the 0.9.15 section's "What to do:" paragraph.
- Nothing else changes. tests/node/version.node.mjs and tests/node/docs.node.mjs are green, and the three gates pass.

## Review

Attempt 1 (haiku) accepted. Red is the node run after the version bump alone, failing on version.node.mjs and docs.node.mjs. The diff is the version in its four places, the CHANGELOG dated with both entries unchanged and in order, and the From 0.9.15 to 0.9.16 section as asked, with the What to do paragraph identical to the 0.9.15 one. Gates green: validate, node 919/0, engine 1406/0.
