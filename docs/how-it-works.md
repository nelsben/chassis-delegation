# How it works

Four sequence diagrams show the mod's flow: a card going to merge, what the verifier checks, how a resume spends the attempt budget, and a card for another repo. Each has a plain-text walkthrough beneath it. The reference is in [contracts](contracts.md) and [review and merge](review-and-merge.md).

## Card to merge

*A person's request becomes a card, a brief and a worker, whose report is verified and then merged through GitHub.*

```mermaid
sequenceDiagram
    participant P as Person
    participant B as Brain
    participant T as Card and dispatch tools
    participant W as Worker (in its worktree)
    participant V as Verifier
    participant M as Merge tool
    participant G as GitHub
    P->>B: say the task
    B->>T: card tool
    T-->>B: card and dry run (scope, gate, red test)
    P->>B: say go
    B->>T: dispatch tool
    T-->>B: brief, worktree, spawn block
    B->>W: Agent call with the spawn block
    W->>W: red test fails, then the work, then the gate passes
    W-->>V: hand-back ending in the report block
    V->>V: check the report against git
    V-->>B: verdict row with next=accept
    B->>M: merge tool for the task
    M-->>B: prints the push, PR and merge lines
    B->>G: runs the printed lines
    B->>M: merge --finish
    M-->>B: merged at sha
```

1. The person states the task in a sentence.
2. The brain calls the card tool, which writes the card and prints the dry run.
3. The person says go, and the brain calls the dispatch tool.
4. Dispatch writes the brief, cuts the worktree and prints the spawn block.
5. The brain makes the Agent call with that block, and the worker starts.
6. The worker shows its red test failing, does the work, and runs the gate.
7. It ends its hand-back with the report block.
8. The verifier checks that report against git in the worker's worktree.
9. The verdict row says consistent, with next=accept.
10. The merge tool rebases, commits the merged card, runs the gates and prints the push, PR and merge lines.
11. The brain runs those lines against GitHub.
12. `merge --finish` pulls, removes the worktree and branch, and answers merged at sha.

## What the verifier checks

*The report's claims are each checked against git in the worker's worktree, and the outcome decides the next= advice.*

```mermaid
sequenceDiagram
    participant W as Worker
    participant V as Verifier
    participant R as Git in the worker's worktree
    participant B as Brain
    W->>V: report block (branch, sha, files, gate, red)
    V->>R: does the branch exist
    V->>R: is the sha reachable from the branch
    V->>R: does files= equal the delta from base
    V->>R: is every path in scope and none in forbid
    V->>R: does the red evidence file hold a failure
    V->>R: re-run the gate at the sha
    R-->>V: each claim held, failed or unchecked
    alt every claim held
        V-->>B: consistent, next=accept
    else a claim failed
        V-->>B: refuted, next=resume agent=id
    else a claim could not be checked
        V-->>B: unverified, next=resume with prove, else check by hand
    else no report block
        V-->>B: no-report, next=resume, then a respawn
    end
```

1. The worker's report names a branch, sha, files, gate and red file.
2. The verifier reads the worker's own worktree with read-only git.
3. The branch must exist.
4. The sha must resolve and be reachable from the branch.
5. The delta from base must equal files= exactly.
6. Every changed path must sit inside scope and outside forbid.
7. The red evidence file must exist and hold the failing run's marker, or be a short file with no marker (2048 bytes or less) that the red test's own run at the head confirms.
8. The gate re-runs only when the tree is clean and HEAD is the sha.
9. All claims held: consistent, and next=accept.
10. Any claim failed: refuted, and next=resume agent=id.
11. A claim unchecked, none failed: unverified, and next=resume with the claims to prove.
12. No report line: no-report, and next=resume, then a respawn.

## Resume and the attempt budget

*A refuted or unverified attempt is resumed or respawned against the same brief until the budget runs out, and a re-verify spends no attempt.*

```mermaid
sequenceDiagram
    participant B as Brain
    participant D as Dispatch tool
    participant W as Worker
    participant V as Verifier
    V-->>B: refuted or unverified, next=resume agent=id
    B->>W: SendMessage with the claim lines
    W-->>V: new hand-back at a new sha
    V->>V: judge it against the same brief
    V-->>B: verdict row, attempt 2 of the budget
    alt consistent
        B->>B: next=accept
    else still failing, budget left
        B->>D: respawn with the same brief
    else budget spent
        V-->>B: judged, next=stop, raise budget= in the brief
    end
    B->>D: /dispatch id --verify sha
    D->>V: judge the work already in the worktree
    V-->>B: re-judging attempt n, no attempt spent
```

1. A refuted or unverified verdict advises next=resume agent=id while the budget lasts.
2. The brain sends the worker the claim lines with SendMessage.
3. The worker fixes the work and hands back at a new sha.
4. That resume is the next attempt, and it counts against budget=.
5. The verifier judges it against the same brief: same scope, forbid and gate.
6. Consistent: the advice is accept.
7. Still failing with budget left: the advice is a resume, later a respawn.
8. The budget is spent: the attempt is still judged, but the advice is next=stop. Raise budget= in the brief and the ladder resumes from that attempt, with the brief re-read.
9. For finished work or a missing verdict, `/dispatch <id> --verify <sha>` runs the verifier with no spawn.
10. It re-judges the same attempt, and no attempt is spent.

## A card for another repo

*A card with repo set to another checkout is cut, briefed, verified and counted in that repo, while its brief stays with the session.*

```mermaid
sequenceDiagram
    participant P as Person
    participant B as Brain
    participant C as Card tool
    participant D as Dispatch tool
    participant R as Other repo
    participant W as Worker
    participant V as Verifier
    P->>B: build it in the sibling repo
    B->>C: card tool with repo=path
    C-->>B: card and dry run naming the repo and its gate
    B->>D: dispatch tool
    D->>R: git fetch origin main
    D->>R: cut the worktree from origin/main
    D-->>B: brief kept in the session's briefDir, spawn block
    B->>W: Agent call, worker runs in that worktree
    W-->>V: hand-back with the report block
    V->>R: delta and gate taken in that repo
    V-->>B: verdict, attempt counted for that repo
```

1. The brain calls the card tool with repo set to the absolute path of the other checkout.
2. The card tool's dry run names that repo, its config and the gate it will use.
3. On the dispatch tool call, dispatch fetches that repo's origin/main and cuts the worktree from it.
4. The brief stays in the session's briefDir, and its header carries repo=path.
5. The worker runs in the other repo's worktree.
6. The verifier takes the delta and runs the gate in that worktree.
7. Attempts are counted per repo, so the same task id in two repos does not share a budget.

See also: [how a report is verified](contracts.md#how-a-report-is-verified), [delegating into another repo](contracts.md#delegating-into-another-repo) and [merging a card](review-and-merge.md#merging-a-card).
