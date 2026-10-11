---
id: MOD-55
title: A gate failure that only a forbidden file can fix gets a next step that works: the worker asks for forbid-= in an amend, the verdict says approve it then resume, and the dry run warns about a red test outside scope
domain: mod
tier: standard
status: merged
scope: [hooks/lib/verify.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/templates/brief.md, hooks/register.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, bin/**, hooks/lib/verify-native.ts, hooks/lib/allow.ts]
red_test: a pure test in tests/verify.test.ts: advise for a confirmed gate=fail whose lines hold a held forbid-= amend returns the approve step; on main it returns resume; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Issue 108 finding 2: twice a card changed a value that an older test in forbid= asserted exactly. Each worker stopped short of the forbidden test, reported gate=fail with the one-line fix, and got next=resume, which cannot help because the worker still may not touch the file; the brain fixed it in the merge commit by hand. The amend protocol already holds a forbid-= block for the brain's approval, but the brief never tells the worker to use it, and the verdict's next step ignores it. The same review saw a brief drop a path the red test named, which the worker had to amend back.

## Done when

- hooks/templates/brief.md's scope rule (the line naming `[[amend v=1 scope+=…]]`) gains one sentence: when the only fix lies in a forbid= path, do not touch it; hand back gate=fail with `[[amend v=1 forbid-=<the forbid entry that covers it> scope+=<path> reason=<the one-line fix>]]`, which the brain approves or refuses
- advise in hooks/lib/verify.ts: a failing verdict (refuted on the gate, or a confirmed gate=fail) whose lines hold an `amend needs approval:` line carrying forbid-= gets next=`approve the amend (append it to <brief>), then resume agent=<id> to make the fix; or refuse it` (with no agent left, the same brief respawned at the same tier); it never escalates the tier, and an exhausted budget still stops
- dispatch warns once, in the MOD-29 style, when a path-like word of red_test (the donePaths rule) is outside the scope (`warning: red_test names <path>, which is outside scope`) or inside a forbid (`… which is inside forbid <glob>`); nothing is added to the scope automatically
- tests: pure tests for the new advise branch and the red_test warning; tests/node/templates.node.mjs stays green; README (the amend paragraph in the contracts) and a CHANGELOG entry under Unreleased; the three gates pass
