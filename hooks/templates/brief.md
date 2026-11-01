# {{id}} — {{title}}

Card: {{cardPath}} (read-only; the spec).
{{#worktree}}
Worktree: {{worktree}}, branch {{branch}}. Work ONLY there (`git -C {{worktree}} …`); never touch the main checkout or add or remove worktrees.
{{/worktree}}
{{#here}}
Checkout: {{worktree}}, branch {{branch}} (repo=here: no worktree). You share it with the brain and maybe other workers: touch only your scope; never stash, reset, checkout, clean or revert a path you did not write.
{{/here}}
{{#none}}
Working folder: {{worktree}} (repo=none: no worktree, no branch, no commit). Your work is files outside the repo: touch only your scope; never stash, reset, checkout, clean or revert a path you did not write.
{{/none}}
Domain: {{domain}}.
You were started by the brain's own Agent call: the mod recorded this attempt, sees your git commands and checks your report.

## Rules
{{#worktree}}
- Install first, in the worktree: {{install}}.
{{/worktree}}
{{#here}}
- Install only what the checkout lacks: {{install}}.
{{/here}}
{{#none}}
- Install and commit nothing: the work is files outside the repo.
{{/none}}
{{#repo}}
{{#red}}
- Red test first: {{redTest}}. Show it failing before you change code.
- Red evidence: before you change any source, save its failing output to `.delegation/{{id}}/red-<attempt>.txt` in the worktree (make the folder; it is gitignored: the verifier reads the tree, not git). A resume or respawn writes a NEW file, the next free number (a byte-identical one is refuted). Report `red=<path>`, relative to the worktree. A red test that is not a test runner ends the file with `expected: <the green condition>; got: <what the output shows>`.
{{/red}}
{{/repo}}
{{#none}}
- Test: {{redTest}}. No red evidence file: the mod checks your scope, the files you name and your artefacts, then runs the gate.
{{/none}}
- Stay inside the brief's scope= and never touch a forbid= path. A file outside scope: an amend block on its own line, `[[amend v=1 scope+=<path> reason=<one line>]]`. A fix only in a forbid= path: touch nothing, hand back gate=fail with `[[amend v=1 forbid-=<the forbid entry> scope+=<path> reason=<one line>]]`.
{{#outdir}}
- Output folder: {{outdir}}. Deliverables go there. The mod lists it and every outside folder your scope or forbid names, before and after your run: a path changed outside scope or inside a forbid refutes you. Report deliverables as artefacts= (relative to the folder or absolute; each must exist and not be empty) and numbers as metrics="k=v,k=v". Say only what you ran: the verifier re-runs the gate and checks every file you name.
{{/outdir}}
{{#scratch}}
- Scratch: {{scratch}} (make the folder). Helper files, test inputs, intermediate output and logs go there, never in the repo and never in the output folder.
{{/scratch}}
{{#worktree}}
- Gate: {{gate}} green in the worktree, all committed, before you report: the verifier re-runs it there at your sha. If the gate fails with timeouts (ETIMEDOUT, a test timing out), run it once more on its own before handing back gate=fail, and say in the report that it was re-run.{{gateNote}}
- Commit and HOLD: never push, open a PR, merge, or commit on main or master.
{{/worktree}}
{{#none}}
- Gate: {{gate}} runs after your hand-back (a gate command may name {outdir}, the output folder); get it green before you report. If the gate fails with timeouts (ETIMEDOUT, a test timing out), run it once more on its own before handing back gate=fail, and say in the report that it was re-run.{{gateNote}}
{{/none}}
{{#here}}
- Gate: {{gate}} green in this checkout before you report. The verifier re-runs it here on the tree as it stands (uncommitted changes included) and checks files= against `git status`, less the brief's ignore= and the files other in-flight cards claimed. If the gate fails with timeouts (ETIMEDOUT, a test timing out), run it once more on its own before handing back gate=fail, and say in the report that it was re-run.{{gateNote}}
- Do not commit unless the card says so; never push, never open a PR, never merge.
{{/here}}
{{#spend}}
- Spend: about ${{spend}}. Do what the card asks and no more; near it, stop and hand back what you have.
{{/spend}}
- To stop while your own background job runs, print as the last line of that message a pause line, not a report: `[[pause v=1 task={{id}} reason=<one line>]]`. A pause is not an attempt; a third in one attempt is charged, as is a stop with neither line.
- Keep any foreground wait under 5 minutes; kill what hangs and say so.
- The mod already exports `CHASSIS_SESSION_ID={{id}}-a<attempt>` (`{{id}}.<subtask>-a<attempt>` for a subtask), `CHASSIS_TASK` and `CHASSIS_ATTEMPT` in every Bash call you make; do not set them yourself.
{{extra}}

## The card

{{body}}
{{#lessons}}

{{lessons}}
{{/lessons}}

## Report (the last line of your hand-back, exactly)
Amend blocks go on their own lines just above it.
{{#worktree}}
[[report v=1 task={{id}} subtask=main branch={{branch}} pr=none sha=<short sha> gate=pass|fail red={{redField}} files=<comma-separated repo-relative paths>{{reportExtra}}]]
{{/worktree}}
{{#here}}
Report sha=HEAD when you did not commit, else the short sha you committed; files= lists every path you changed.
[[report v=1 task={{id}} subtask=main branch={{branch}} pr=none sha=HEAD gate=pass|fail red={{redField}} files=<comma-separated repo-relative paths>{{reportExtra}}]]
{{/here}}
{{#none}}
Report branch=none, sha=none and red=none; files= names the files you wrote that your scope names by path (or none).
[[report v=1 task={{id}} subtask=main branch=none pr=none sha=none gate=pass|fail red=none files=none{{reportExtra}}]]
{{/none}}
