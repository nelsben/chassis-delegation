---
id: MOD-176
title: A tool.call hook on SendMessage budget-checks and records a resume when session.send did not, so a resume is counted exactly once whichever events the host fires
domain: mod
tier: standard
status: merged
scope: [hooks/register.ts, tests/resume.test.ts, docs/internals.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/version.ts, .claude-plugin/**, README.md, docs/cards/**, tests/hooks.test.ts]
red_test: tests/resume.test.ts
gate: validate, test
budget: 3-attempts
spend: 8
---
## Why

MOD-175 found that Anthropic's mods reference names a tool.call hook on SendMessage as the way a mod sees a resume. The mod counts resumes only in its session.send hook. This host fires session.send today, so resumes are counted, but a host that fired only tool.call would leave the two `gap:` cases in tests/resume.test.ts: no budget check at the send, and a same-sha hand-back never counted. Ben approved this hedge on 2026-10-25.

## Done when

- hooks/register.ts gains `on('tool.call', { tool: 'SendMessage' }, …)`. It resolves the addressed agent the way the session.send hook does (an agent id or a name, via the same store keys), and does nothing but pass through when the call is not addressed to a briefed spawn whose last attempt was judged failed (the same guard as session.send: not adhoc, verdictAttempt equal to attempt, lastFailed set).
- Before calling next: when the attempts already used reach the budget (re-read from the brief file, as session.send does), it refuses the call with the same budgetDenyMessage text, so the message is never sent.
- After next returns: when the call did not fail and the spawn's attempt has not moved (session.send did not record it), it calls recordResume with the same arguments session.send uses. When session.send already recorded it, it records nothing. A resume is therefore recorded exactly once whether the host fires session.send only, tool.call only, or both in either order. Pull the shared guard and budget check into one helper both hooks call, rather than copying them.
- The session.send hook's behaviour is unchanged: every existing test in tests/hooks.test.ts and the sequence C case in tests/resume.test.ts pass unchanged.
- tests/resume.test.ts: the two sequence B cases lose their `gap:` names and assert the fixed behaviour (the resume is recorded at the SendMessage call as attempt 2, kind resume, same lineage; a same-sha hand-back after it is judged as attempt 2). New cases: both events firing record one attempt, not two; tool.call only with the budget used refuses the call with the budget message and records nothing. Red first: the flipped sequence B assertions fail at base.
- docs/internals.md, the resume sentence in Store and ledger: says both hooks record a resume and that it is counted once, replacing the gap wording; keep the source URLs and the live-ledger sentence. CHANGELOG.md `## Unreleased` gets a `### Changed` entry tagged MOD-176. Wording generic: no product, repo, person, machine path or session names.

## Review

Consistent on attempt 2/3 ($0.39 + ~$0.04, Sonnet). Attempt 1 was consistent, but on reading the diff I found the new hook tested `.error` to detect a failed call, where the mod's other tool.call hooks use `isError === true`. I resumed the worker once to fix it. The SendMessage tool.call hook now checks `deny` or `isError`, and a new case shows a failed send records no attempt. The shared resumeTarget helper holds the guard and the budget re-read for both hooks. The tool.call hook records a resume only when session.send did not, and both orders count once. The resume itself was counted live as attempt 2/3, which is more evidence that this host fires session.send.
