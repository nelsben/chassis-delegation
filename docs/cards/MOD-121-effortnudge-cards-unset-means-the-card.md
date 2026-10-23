---
id: MOD-121
title: effortNudge.cards unset means the card folder (<cardDir>/**), so a repo on defaults gets the nudge; an explicit glob still wins and "" still turns it off
domain: mod
tier: standard
status: merged
scope: [hooks/lib/nudge.ts, hooks/lib/repoconfig.ts, hooks/register.ts, .claude-plugin/plugin.json, tests/**, docs/configuration.md, docs/spend.md, CHANGELOG.md]
forbid: [bin/**, hooks/templates/**, .claude-plugin/types/**, docs/cards/**, docs/upgrading.md, .chassis-delegation.json]
red_test: the new engine test on defaults (artefacts=agents/tasks/X.md) fails at the base: the handed-back row has no up nudge
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Found reviewing MOD-114 (#201). The nudge's built-in glob is cards/**, but the built-in cardDir is agents/tasks, so a repo left on defaults never sees the up nudge when a worker hands back cards. The 0.9.19 upgrade note works around it by telling people to set the glob by hand.

## Done when

- When no layer sets effortNudge.cards, the effective glob is `<cardDir>/**` (cardDir as resolved, default agents/tasks); a layer that sets cards wins, and cards "" still turns the nudge off. up and down keep their defaults and merge key by key as today.
- /delegation prints the resolved glob (effort nudge: agents/tasks/** · up high · down medium on defaults).
- The manifest's effortNudge description, docs/configuration.md and docs/spend.md say the default is the card folder. The 0.9.19 section in docs/upgrading.md is left as is; CHANGELOG gains an Unreleased entry.
- Tests: options/merge tests (default cardDir → agents/tasks/**; cardDir set → follows it; explicit cards → wins; cards "" → off) and one engine test: on defaults, a hand-back whose artefacts= names agents/tasks/X.md ends its row with the up nudge.
- No machine paths, user, product or repo names. The validate, node and test gates pass.

## Review

Attempt 1 (sonnet) accepted. mergeConfig sets effortNudge.cards to <cardDir>/** (cardDir as resolved) when no layer sets cards; an explicit glob wins and "" stays off. The built-in default reads agents/tasks/**, so /delegation prints the folder on defaults. The older MOD-114 engine tests now set cards: cards/** explicitly. Red: the defaults engine test (artefacts=agents/tasks/X.md) had no up nudge at base. Gates green: validate, node 992/0, plugin 1510/0.
