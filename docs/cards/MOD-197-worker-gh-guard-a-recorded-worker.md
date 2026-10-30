---
id: MOD-197
title: worker gh guard: a recorded worker's (and reviewer's) Bash is denied any gh command that writes to GitHub; and the merge allowlist passes the MOD-194 read-only issue view so MOD-195's mergeCtx toggle goes
domain: mod
tier: standard
status: merged
scope: [hooks/lib/ghguard.ts, hooks/lib/allow.ts, hooks/register.ts, tests/ghguard.test.ts, tests/node/ghguard.node.mjs, tests/allow.test.ts, tests/merge.test.ts, docs/guide.md, docs/contracts.md, CHANGELOG.md]
forbid: [docs/cards/**, hooks/lib/gitguard.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: tests/node/ghguard.node.mjs: ghWrites('gh issue close 5') and ('cd x && gh pr merge 3 --rebase'), ('gh project item-add 1 --owner o --url u'), ('gh api -X POST repos/o/r/issues'), ('gh api graphql -f query=\"mutation{...}\"'), ('gh label create x') each name a write; ('gh issue view 5'), ('gh pr list'), ('gh api repos/o/r/issues'), ('echo \"gh issue close 5\"'), ('cat <<EOF\\ngh pr merge\\nEOF') name none. tests/ghguard.test.ts: a recorded worker's Bash `gh issue close 5` is denied with a reason naming its task and 'gh writes are the brain's'; the brain's (no agentId) passes to next; a worker's `gh pr view 3` passes. tests/allow.test.ts: with allow.merge set, the exact `gh issue view <n> --repo <landRepo> --json number,title,state,labels,body,subIssues` passes and `gh issue close` is still refused. All fail on main.
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Now the brain files and closes issues, the plan on GitHub is the founder's record; a worker must never close, edit or file issues, merge or edit PRs, or write to the Project, or the tree lies. Workers already get a git guard; this adds the same tripwire for gh. MOD-195 lifted mergeCtx around a single read because allow.ts was out of its scope; this card fixes that properly.

## Done when

- hooks/lib/ghguard.ts (new, pure, no $): ghWrites(command) returns the gh write commands in a Bash command string, reading it as hooks/lib/gitguard.ts does (quotes keep words whole, heredoc bodies skipped, only the first command word of each pipeline/&&/||/; segment after VAR=x assignments counts) — reuse gitguard's exported tokenizer if it exports one, else write a small one here (gitguard.ts is forbidden). A write is: gh issue create|close|reopen|edit|delete|transfer|comment|lock|unlock|pin|unpin|develop; gh pr create|merge|close|reopen|edit|comment|review|ready; gh project anything except list|view|item-list|field-list; gh label|release|repo|secret|variable|workflow|ruleset|gist with a verb other than list|view; gh api when it has -X/--method other than GET, or any -f/-F/--field/--raw-field/--input (gh api graphql with a field counts). Header comment names it an accident tripwire like the git guard.
- A tool.call Bash hook in hooks/register.ts, registered next to the git guard, denies when ghWrites(command) is non-empty and the call's agentId maps (spawnByAgent) to a recorded worker or a reviewer (not adhoc, not the brain): deny text `gh guard: <task label> may not run <verb phrase>; gh writes are the brain's (land, merge finish)`. The brain's calls and ad hoc agents pass through untouched. It is on whenever gitGuard is on (cfg.gitGuard); no new option.
- hooks/lib/allow.ts: inside the allow.merge branch, before the isRemoteArgv refusal, the exact MOD-194 view shape (gh issue view <1-9 digits> --repo <landRepo> --json number,title,state,labels,body,subIssues, landRepo set) passes; every other gh is still refused while merge runs. Header comment updated.
- The MOD-195 toggle in hooks/register.ts (saving and clearing mergeCtx around the parent read) is removed; the read just sets landRepo to the origin's owner/name first. The MOD-195 merge tests still pass unchanged.
- docs/guide.md and docs/contracts.md say workers may not write to GitHub with gh; CHANGELOG.md Unreleased entry.
- The gates pass: claude plugin validate, the node suite, claude plugin test.

## Review

Consistent first attempt. gh guard reuses gitguard's tokenize; denies recorded workers and reviewers only. The merge allowlist now passes exactly the MOD-194 view shape ahead of the remote refusal, and the MOD-195 mergeCtx toggle is gone.
