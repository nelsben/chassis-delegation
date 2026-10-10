# {{id}} — {{title}}

Card: {{cardPath}} (read-only; the card is the spec).
{{#worktree}}
Worktree: {{worktree}}, branch {{branch}}. Work ONLY there (`git -C {{worktree}} …`); never touch the main checkout, never add or remove worktrees.
{{/worktree}}
{{#here}}
Checkout: {{worktree}}, branch {{branch}} (repo=here: no worktree). You share this checkout with the brain and maybe other workers: touch only your scope, and never stash, reset, checkout, clean or revert a path you did not write.
{{/here}}
Domain: {{domain}}.
You were started by the brain's own Agent call: the mod that dispatched you recorded this attempt, its git guard sees your git commands, and it checks your report against the repo itself.

## Rules
{{#worktree}}
- Install first, in the worktree: {{install}}.
{{/worktree}}
{{#here}}
- Install only what the checkout lacks: {{install}}.
{{/here}}
- Red test first: {{redTest}}. Show it failing before you change code.
- Red evidence: before you change any source, run the red test and save its failing output to `.delegation/{{id}}/red-<attempt>.txt` inside the worktree (make the folder; `.delegation/` is gitignored, and that is fine: the verifier reads the tree, not git). `<attempt>` is 1 on a first run. On a resume or a respawn, write a NEW file with the next free number (red-2.txt, red-3.txt …), never an earlier attempt's file again: the verifier refutes a red file byte-identical to an earlier attempt's. Name the file in your report as `red=<path>` (relative to the worktree); write `red=none` only when the red test above is none.
- Stay inside the brief's scope= and never touch a forbid= path. If you must change a file outside scope, say so in your hand-back with an amend block on its own line, `[[amend v=1 scope+=<path> reason=<one line>]]`; it is appended to this brief before your report is verified.
{{#worktree}}
- Gate: {{gate}} green in the worktree before you report. Leave the worktree clean (everything committed): the verifier re-runs the gate there, at your sha.
- Commit and HOLD: never push, never open a PR, never merge, never commit on main or master.
{{/worktree}}
{{#here}}
- Gate: {{gate}} green in this checkout before you report. The verifier re-runs it here on the tree as it stands (uncommitted changes included) and checks files= against `git status`, less the brief's ignore= and the files other in-flight cards claimed.
- Do not commit unless the card says so; never push, never open a PR, never merge.
{{/here}}
{{#spend}}
- Spend: about ${{spend}} for this attempt. Do what the card asks and no more; when you are near it, stop and hand back what you have with the report line.
{{/spend}}
- Keep any single foreground wait under 5 minutes; kill anything hung and say so.
{{extra}}

## The card

{{body}}

## Report (the last line of your hand-back, exactly)
Any amend blocks go on their own lines just above it.
{{#worktree}}
[[report v=1 task={{id}} subtask=main branch={{branch}} pr=none sha=<short sha> gate=pass|fail red=<path> files=<comma-separated repo-relative paths>]]
{{/worktree}}
{{#here}}
Report sha=HEAD when you did not commit, else the short sha you committed; files= lists every path you changed.
[[report v=1 task={{id}} subtask=main branch={{branch}} pr=none sha=HEAD gate=pass|fail red=<path> files=<comma-separated repo-relative paths>]]
{{/here}}
