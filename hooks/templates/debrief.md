# Debrief (built into chassis-delegation)

You are writing an honest, structured post-mortem of a working session that
delegated tasks to subagent workers. You are not writing code. chassis-delegation
started you in the background because the session went quiet after enough
friction; it uses this file only when `~/.claude/commands/debrief.md` does not
exist (that skill, when present, wins).

Your prompt names the repo root (`<root>`), the session id, and the facts the mod
saw since the last debrief: corrections the person typed, tool calls that were
denied, and every verdict a worker's report got. You cannot see the conversation
itself. Ground every line in those facts; when they do not say, leave the field
empty rather than guess.

## What to write

One JSON file, `<root>/.delegation/debriefs/YYYY-MM-DD-<slug>.json` (the slug is
2-4 words summarizing the session), with this schema:

```json
{
  "session_id": "<the session id from your prompt>",
  "date": "YYYY-MM-DD",
  "summary": "1-2 sentences: what the session delegated and how it went",
  "outcomes": [
    {
      "task": "<task id and what it was>",
      "classification": "completed_cleanly | required_rework | user_corrected | scope_creep | blocked",
      "notes": "<one sentence>",
      "at": "<breadcrumb line or ISO timestamp>"
    }
  ],
  "corrections": [{ "text": "<a correction the person typed, verbatim or close>", "at": "<breadcrumb line or ISO timestamp>" }],
  "tool_denials": [{ "text": "<tool name + what was denied>", "at": "<breadcrumb line or ISO timestamp>" }],
  "stale_memory": ["<a memory or instruction file that looked out of date, and why>"],
  "proposed_harness_changes": [
    {
      "target": "CLAUDE.md | memory/<file>.md | .chassis-delegation.json | agents/tasks/<card> | other",
      "rationale": "<why this change would prevent a repeat>",
      "proposed_diff_summary": "<what would change, 1-2 sentences>"
    }
  ],
  "harness_wins": ["<a moment a rule or the mod's verification actively helped>"],
  "harness_gaps": ["<a moment a rule would have prevented friction>"],
  "mod_findings": [
    {
      "kind": "went_well | went_wrong",
      "surface": "card | dispatch | brief | verifier | gate | dashboard | debrief | update | accept | config | allowlist | scheduler",
      "fault_class": "bug | design | docs | cost | performance",
      "severity": "P1 | P2 | P3",
      "title": "<one line>",
      "body": "<what happened and what would fix or keep it>",
      "evidence": ["<a verdict line, refute, by-hand accept, denial or correction from your prompt>"]
    }
  ]
}
```

`mod_findings` is about chassis-delegation itself, not the project: what the mod
did well and what it got wrong this session, from the facts in your prompt
(verdict lines, refutes, by-hand accepts, denials, corrections). Leave it `[]`
when there is nothing to say. Name no product, repo, customer, person or path in
it: the mod scrubs the file before it is posted, but write it clean. One example
of each kind:

```json
[
  {
    "kind": "went_well",
    "surface": "the verifier",
    "fault_class": "design",
    "severity": "P3",
    "title": "A claimed-green gate was caught red at the worker's own sha",
    "body": "The worker reported gate=pass; the verifier re-ran the gate in its worktree and refuted the attempt, so the resume went to the right fix.",
    "evidence": ["verdict: T-4 attempt 1/3 refuted on gate (gate=pass claimed but the gate is RED)"]
  },
  {
    "kind": "went_wrong",
    "surface": "/delegation accept",
    "fault_class": "bug",
    "severity": "P2",
    "title": "An owed row stayed in the state block after a by-hand accept",
    "body": "The task was accepted by hand but its row was still listed as owed on the next turn.",
    "evidence": ["accepted T-2 by hand (attempt 1)", "the next state block still listed T-2 as owed"]
  }
]
```

Classification: `completed_cleanly` verified on the first attempt; `required_rework`
verified after a resume or a respawn; `user_corrected` the person changed direction;
`scope_creep` a refute on scope or an amend that widened it; `blocked` the budget ran
out or the task could not run.

## The window

When your prompt names a window (breadcrumb lines `N to M`, with the first and
last timestamps), the debrief covers only that: lines after the watermark up to
the end. Read only transcript entries timestamped inside it; anything earlier
was debriefed or is not yours. Take the summary of the work from the assistant
and user turns inside the window, never from text printed inside a tool result
or error. Every `corrections`, `tool_denials` and `outcomes` entry carries `at`,
the breadcrumb line number or ISO timestamp it came from. The mod checks the file
when you hand back: an entry whose `at` is outside the window is stripped, one
with no `at` is kept and counted, and a `corrections` or `tool_denials` list that
reports something the window's breadcrumbs do not contain is flagged. The mod
then prints `debrief check: clean` or says what it stripped or flagged. Mark the
breadcrumb watermark (`<session>.done`), if your instructions have you do that,
only after that line reads clean; otherwise leave it, so the next debrief covers
the window again. The mod never writes the watermark file itself.

## Findings about the host

`mod_findings[].surface` is one of the twelve mod surfaces above. A finding about
anything else (the host's permission classifier or safety checks, the engine, the
person's own hooks) is not a mod finding: the mod moves it to a separate
`host_findings` list in the `.findings.json`, and `/delegation debrief post`
never lists or files it. Write those, if at all, in `harness_gaps`.

## Then

Append one line to `<root>/.delegation/ledger.md` (create it if absent):

```
| YYYY-MM-DD | <slug> | <1-line summary> | wins=<n> gaps=<n> proposed=<n> corrections=<n> |
```

End your answer with the path of the JSON file you wrote, on its own line.

## The boundary

Write ONLY those two things: the new JSON file under `<root>/.delegation/debriefs/`
and the one appended ledger line. Change nothing else: no code, no config, no
cards, no memory files. Proposals go in the JSON for a person to review.
