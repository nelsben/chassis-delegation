---
id: MOD-166
title: The defaults assume the brain forgets: `review` defaults to on-frontier and `delegateOnly` to warn; the `ration` help text names the band, not a footer
domain: mod
tier: standard
status: merged
scope: [hooks/lib/configtable.ts, hooks/lib/repoconfig.ts, .claude-plugin/plugin.json, tests/review.test.ts, tests/brain.test.ts, tests/hooks.test.ts, tests/configcmd.test.ts, docs/configuration.md, docs/spend.md, docs/review-and-merge.md, CHANGELOG.md]
forbid: [hooks/register.ts, README.md, hooks/lib/version.ts, docs/cards/**]
red_test: tests/review.test.ts
gate: validate, test
budget: 2-attempts
spend: 10
---
## Why

The mod's thesis is that the brain forgets to delegate and skips checks; yet the fresh-context review (the guidance's main correctness check) and the brain guard both ship off, so a fresh install gets neither. Frontier cards are where errors cost most and the reviewer runs a tier lower, so on-frontier is cheap; warn posts one row per turn and refuses nothing. The `ration` help text still says "footer meter" from before the band moved above the prompt.

## Done when

- The resolved default for `review` is `on-frontier` and for `delegateOnly` is `warn`: in hooks/lib/repoconfig.ts the fallback picks (today `pick('review', 'off')` and `pick('delegateOnly', 'off')`) and the type comments change; in hooks/lib/configtable.ts the two rows' default column changes. The layering rule is kept exactly as it is: `off` in the user or host layer still means "not set here" (the manifest default string stays "off" so an untouched settings layer defers), and `off` written in the repo file .chassis-delegation.json still turns the option off (the strict parse). So the one way to switch either off is the repo file, or `/delegation config <option> off` when that writes the repo file; the plugin.json descriptions for both options say so in one added sentence each and name the new default in place of `off`.
- A repo file written by `/delegation setup` does not pin either option to `off`: whatever template or writer puts `"delegateOnly": "off"` (asserted today in tests/hooks.test.ts near the setup test, around line 862) writes the new default, or omits the key, so a freshly set-up repo gets warn and on-frontier; the assertion changes to match. If setup writes `review` too, the same applies.
- Tests (red first: at base `mergeConfig({}, {}).review` is `off` and `mergeConfig({}, {}).delegateOnly` is `off`): tests/review.test.ts asserts the resolved default is `on-frontier`, that a repo-file `off` wins over it, and that a settings-layer `off` still defers to the repo file (the existing cases around lines 248-253 updated, not deleted); tests/brain.test.ts the same for `delegateOnly` with `warn` (the cases around lines 175-183 updated, not deleted). Any other test that assumed the off defaults is updated to set `off` in the repo file explicitly rather than by weakening the assertion. tests/configcmd.test.ts: the option count stays 59 (no row added or removed); only its default-value expectations, if any, change.
- hooks/lib/configtable.ts `ration` row help text reads `Which usage window the band's meter reads: seven_day, five_hour, or off` (the word footer gone); the matching plugin.json description, if it says footer, says band.
- docs/configuration.md rows for `delegateOnly` and `review` show the new defaults; docs/spend.md line 21 area says `default warn` and its options table row for `delegateOnly` shows `warn`; docs/review-and-merge.md's sentence on setting review says the default is `on-frontier` and that `off` in the repo file turns it off. CHANGELOG.md `## Unreleased` gets a `### Changed` entry (create the heading if absent, above the existing `### Fixed`) naming both default changes, how to turn each off, and the ration wording, tagged with this card's id. Wording generic: no product, repo, person, machine path or session names.

## Review

Consistent on attempt 1, red first in review.test.ts and brain.test.ts. `review` resolves to on-frontier and `delegateOnly` to warn via the repoconfig fallback picks and the configtable defaults; the manifest strings stay off so a settings-layer off still defers and a repo-file off still wins (new tests for both). Four scope+= amends were justified: update.ts migrationDefaults() was the writer pinning delegateOnly off (now warn); update.test.ts asserted it; configtable.node.mjs required table default == manifest default and now excepts these two fields with a comment saying why; wakes.test.ts had one case assuming review off. ration text says band's meter in both places. CHANGELOG conflict with MOD-165 resolved by hand keeping both Changed bullets.
