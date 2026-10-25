---
id: MOD-135
title: The verifier finds the brief on the manual route: a spawn prompt naming .delegation/briefs/<ID>.brief.md by a relative path, or a hand-back whose report task= has a brief at <root>/.delegation/briefs/<task>.brief.md, is verified against that brief instead of "no brief"
domain: mod
tier: standard
status: merged
scope: [hooks/lib/brief.ts, hooks/register.ts, tests/**, docs/contracts.md, CHANGELOG.md]
forbid: [docs/cards/**, bin/**, hooks/templates/**, .chassis-delegation.json, .claude-plugin/**, README.md, docs/upgrading.md]
red_test: engine test: a spawn with prompt `Your brief is .delegation/briefs/T-1.brief.md. Read it whole, then follow it exactly.` (file present in the session root, report files in scope, gate passing) gets verdict consistent; at base it is unverified with `no brief: no scope=/gate=/red_test= to check against`. Red first
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

Issue #222: an adopter who writes briefs with their own tool and spawns the worker by hand gets "unverified on scope (no brief: no scope=/gate=/red_test= to check against)" on every hand-back, because findBriefPath only accepts an absolute path in the spawn prompt. The brief is sitting where the mod itself would have put it, so the verifier should find it.

## Done when

- hooks/lib/brief.ts findBriefPath also returns a relative path ending in .brief.md (e.g. `.delegation/briefs/T-1.brief.md` or `./.delegation/briefs/T-1.brief.md`) found in the prompt with the same delimiters it uses for an absolute one; the absolute form keeps winning when both appear. A new pure helper resolves a relative path against the spawn's cwd, else the session root, and refuses one that climbs out of that folder with `..`.
- hooks/register.ts planSpawn reads a relative named brief resolved that way; a named brief that does not exist still records noBrief with its existing wording.
- At hand-back, a spawn with no brief (adhoc with no briefPath, or a noBrief record) whose [[report]] names a task= that is a valid store key looks for <session root>/.delegation/briefs/<task>.brief.md (and, when subtask= is not main, the subtask file name inlineBriefFileName gives); when that file exists and parses with a header whose task matches, the attempt is verified against it exactly as a dispatched brief would be (scope, forbid, gate, red), the verdict row names the brief, and the attempt is recorded under that task. With no such file the cardless path is unchanged.
- Engine tests in tests/: (1) a spawn whose prompt says `Your brief is .delegation/briefs/T-1.brief.md` with that file in the root, handing back a report whose files are in scope and gate passing, gets a consistent verdict, not `no brief`; (2) an out-of-scope file in the same setup is refuted on scope; (3) a spawn whose prompt names no brief at all, handing back task=T-2 with root/.delegation/briefs/T-2.brief.md present, is verified against it; (4) with no file the verdict keeps NO_BRIEF_REASON; (5) a `../` relative path is not read. Pure tests for findBriefPath (relative, absolute wins, delimiters) and the resolver.
- docs/contracts.md says where the verifier looks for a brief (the absolute path in the prompt, a relative one, then .delegation/briefs/<task>.brief.md from the report's task=); CHANGELOG Unreleased gets one Fixed entry. Wording generic: no product, repo, person, path or session names.

## Review

Attempt 1 consistent at 9c2fa3d (validate, node 1062, engine 1575). findBriefPath accepts a relative .brief.md; resolveBriefPath resolves against the spawn cwd, else the root, and refuses `..`. At hand-back, briefForReport binds a briefless spawn to <root>/.delegation/briefs/<task>.brief.md when the report's task= matches the brief header, and verifies it as a dispatched attempt. CHANGELOG gained a fresh Unreleased section.
