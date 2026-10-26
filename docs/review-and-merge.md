# Review and merge

Reviewing a hand-back and landing it.

## Review

A `consistent` verdict says the report matches git, not that the work is right. `review` adds a diff reader.

| `review` | What gets a reviewer |
| --- | --- |
| `off` | nothing |
| `on` | every consistent verdict |
| `on-frontier` (default) | a frontier or premium attempt's consistent verdict |

The default is `on-frontier`. Set it in the repo file (`"review": "on"`), by `/delegation config review on` or in `/config`; `off` in `/config` or the host settings is "not set here", and `"review": "off"` in the repo file turns it off. `reviewTier` pins the reviewer's tier; unpinned, it is one below the worker's, economy at the floor. `tierMap` makes the alias; fable is never spawned.

### What the review must check

The prompt is `hooks/templates/review.md`. It reads the brief, the hand-back (cut at 6000 characters) and the diff at the report's sha. Each claim gets one row: `confirmed`, `refuted` or `unverifiable`, with the deciding command or file and line.

| Claim | Check |
| --- | --- |
| What was built | the diff holds it, at a file and line |
| What the tests and gate show | a read-only command it ran |
| What was left alone | no path changed outside the claim |
| CI or the runtime | usually `unverifiable` |

It ends `[[review v=1 task=T-4 confirmed=1 refuted=1 unverifiable=1]]`. It never re-runs the gate or fixes anything.

### How it runs

1. The row says `next=review` and ends with a spawn block; the brain makes that Agent call.
2. The spawn hook records `kind: review` (`source: review`) and runs it in the worker's worktree.
3. It is on no ladder and never counts against `budget=` or `maxWorkers`.
4. The `tool.call` hook refuses its Edit, Write, MultiEdit and NotebookEdit calls and any Bash write the `delegateOnly` lexer counts (a redirection, `tee`, `sed -i`, the destination of `cp` or `mv`, a `git commit`): a tripwire, not a sandbox.

| The last `[[review]]` block | `next=` | The row says |
| --- | --- | --- |
| `refuted=0` | `accept` | `review: 3 confirmed, 1 unverifiable` |
| `refuted>0` | `resume agent=<the worker>` while the budget lasts, else `check by hand` | `review: 3 confirmed, 1 refuted, 0 unverifiable`, rows quoted |
| missing, malformed, other task | `accept` | `review: no review block` |

A failed review never blocks. Refuted rows go to the worker with `SendMessage` (the mod does it with `autoEscalate` on); that resume spends `budget=` and is reviewed again.

With `verdictVerbosity: full` the row is `chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 usd=… model=… next=accept`. The ledger keeps `review: {confirmed, refuted, unverifiable}`, verdict `reviewed`.

Not reviewed: a hand-back that is not consistent (`gate=fail` included), a `repo=none` brief, a `--replay` run, a cardless hand-back. A consistent `/dispatch <ID> --verify <sha>` is.

## Merging a card

While the verifier runs, the worker's worktree is locked, so `git worktree remove --force` refuses it; land after the verdict. `git worktree unlock <path>` frees one a killed verify left behind, and `/delegation merge <ID> --finish` unlocks before it removes.

After a consistent verdict with next=accept, run `/delegation merge <ID>` (or the `merge` tool with `task: <ID>`). It does the local half; the brain runs the printed lines verbatim.

It refuses in one line, running nothing, when:

- the latest ledger row is not consistent/accept: `<ID>: last verdict is <verdict> · next=<next>; merge needs consistent/accept`;
- the task has no clean worktree on `agent/<domain>/<ID>`, or the main checkout is off the target branch or has tracked changes.

The target branch is the one `baseRef` names (`work` or `origin/work`, when origin has that branch), else the default branch (`main`). A `baseRef` that is a sha or a tag is not a branch: merge targets the default branch and prints one line saying so. Below, `origin/main` and `main` mean that target.

Checklist, in print order:

0. If the card names a [merge check](#merge-checks), it runs first, before anything is rebased.
1. **Review.** Pass `--review <text>` or `--review-file <abs path>`. In the worktree it runs `git fetch origin` and `git rebase origin/main` (the `baseRef`). On a conflict it runs `git rebase --abort`: `<ID>: rebase onto origin/main conflicts in <files>; resolve by hand`.
2. It copies `<cardDir>/<ID>-*.md` into the worktree with `status: merged` and the Review section, and commits `cards: <ID> merged` with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer. 
3. It runs the card's gates into `.delegation/<ID>/merge-gates.txt`. A failure stops: `<ID>: gate <id> failed at <sha>; not pushed`.
4. **Leak check.** Read `.delegation/<ID>/pr.md` (Done-when, verdict, gates). Remove any product, customer or machine name.
5. **Push:** `git -C <worktree> push -u origin agent/<domain>/<ID>`.
6. **PR create:** `gh pr create --repo <owner/repo> --base main --head agent/<domain>/<ID> --title '<card title>' --body-file <root>/.delegation/<ID>/pr.md`.
7. **PR merge:** `gh pr merge --repo <owner/repo> agent/<domain>/<ID> --rebase`.
8. **Finish:** `/delegation merge <ID> --finish`.
   - It runs `git fetch origin`, refusing with `<ID>: <branch> is not in origin/main yet` unless the head, or its rebased twin, is there.
   - Before it removes or pulls anything, it runs `git status --porcelain --ignored --untracked-files=all` in the worktree and keeps the untracked (`??`) and git-ignored (`!!`) paths. A worker's screenshots or logs under an ignored folder are not on origin, and `git worktree remove` deletes them without asking. The skip list is `.delegation/`, `node_modules/`, `.venv/`, `venv/`, `__pycache__/`, `.pytest_cache/`, `.mypy_cache/`, `.ruff_cache/`, `dist/`, `build/`, `coverage/`, `.next/`, `.turbo/`, `target/`, `.cache/`, `.DS_Store` and any `.pyc` (a folder entry covers everything under it at any depth).
   - When paths are left, finish stops and changes nothing: `<ID>: the worktree <path> holds <n> untracked or ignored files the merge does not carry; copy what you need, then run /delegation merge <ID> --finish again, or add --discard to delete them:`, then up to 20 paths (a folder holding more than 3 shows as `<folder>/ (<k> files)`) and `… <m> more`. Copy what you need, then run finish again.
   - `--discard` (`/delegation merge <ID> --finish --discard`, or `discard: true` on the merge tool) goes on as before and adds `note: discarded <n> untracked or ignored files from <path>`. `--discard` without `--finish` is refused. `--discard` deletes ignored files (git removes them with the worktree) but not untracked ones: if any are left, the worktree stays, the branch is kept, no merged row is written, and the answer says `the worktree <path> was not removed: it still holds <k> untracked files …`; delete them by hand and run finish again. The `discarded` note appears only when the worktree was removed. A status read that fails is a note, and finish goes on.
   - It compares the merged card on origin with the root card, status aside. A match removes the root card; else it names the differing lines.
   - It runs `git pull --ff-only`, `git worktree remove` and `git branch -D`, writes `{kind: 'merged', task, sha, pr?}`, and lists the task under `merged:` instead of `running:`.
9. **Delete the branch:** `git push origin --delete agent/<domain>/<ID>`. The answer ends `<ID> merged at <sha>`.
10. **Release extras**, only when `hooks/lib/version.ts` changed: `git tag -a v<version> -m v<version>`, `git push origin v<version>`, and `git -C <loaded clone> pull --ff-only` when the mod loads from another checkout. The last line is `release v<version>: run the block above, then reload the window`.

### Merge checks

A card can name a check that merge runs at the branch head, so a rule about the proof sits beside the proof. Two places name one:

- the card's `merge_check: <command>` (one line; the card tool's `mergeCheck` writes it), which wins when present;
- else the repo's `mergeCheckMap` (gate id → command): every entry whose id is in the card's `gate:` list applies, in gate order.

The dry run prints `merge check: <command>` after the brief line for each one that applies.

Merge runs them when it prepares, after the worktree, main checkout and card checks and before `git fetch` and the rebase. Each command is split into words, then `{card}` (the task id), `{sha}` (the worktree's full head) and `{worktree}` (its absolute path) are replaced inside each word; any other `{x}` stays as written. It runs by argv, never through a shell, with the worktree as its working folder and a 10-minute timeout. A command the gate map would refuse (a denied first word, shell syntax, a publish verb, or a chain with ` && `) is refused the same way at card write, at config load (the entry is dropped with a note) and at merge.

Exit 0 lets merge go on, and its success line ends with `; merge check passed (<command as written>)` for each check. A non-zero exit, a timeout or a command that cannot start refuses: `<ID>: merge check failed: <command as written> exited <code>; nothing was rebased or committed`, then the last 15 lines of its output. The worktree, the branch and the card are left as they were. `merge --finish` runs no check.

### A merged task stays closed

Once a task's last judged attempt is retired (merged, by the retire sweep, a merge command or `/delegation merge --finish`; or accepted by hand), or its card on the default branch reads `status: merged`, the task is closed. A worker that hands back for it later is not verified against the post-merge tree: no verifier runs, no attempt counts against the budget, and no owed row is written. The row reads `<ID>: hand-back after the task closed (merged); not verified, nothing owed`. The same row, with `(branch gone)`, answers a hand-back whose worktree folder no longer exists and whose branch is absent both locally and in the remote-tracking refs. Retiring a task also clears its owed row, and `/delegation` and the state section skip a retired task even when its owed row was written before the retire. A task that is not retired and still has its branch is verified as before, and `/delegation accept --owed` still works. An ad hoc hand-back that commits nothing never retires on its own (the sweep has no sha, patch or card to match); its owed row reads `<ID>: check the diff (ad hoc: clears with /delegation accept <ID>)` and clears with `/delegation accept`.

A card folder in `.git/info/exclude` or `.gitignore` merges the same way, uncommitted. The tool checks `git -C <root> check-ignore -q -- <card path>`; when ignored:

- it marks the root card `status: merged` in place, runs no `git add`, and prints `card kept local (git-ignored): <root card path> marked merged` instead of `card committed as merged`;
- `--finish` keeps the card (the only copy) and confirms the head or its rebased twin is on origin/main, else refuses.

### The allowlist rule

The merge never pushes, calls `gh` or uses the network. Every argv goes through `run()` and `hooks/lib/allow.ts`. While it runs, `AllowConfig.merge` holds the task's paths, branch and id, and permits:

| Where | Allowed |
| --- | --- |
| worktree | `fetch origin`, `rebase <baseRef>`, `rebase --abort`, `add -- <card>`, `commit -q -m 'cards: <ID> merged'` with an optional `Co-Authored-By` trailer |
| main checkout | `fetch origin`, `remote get-url origin`, `pull --ff-only`, `clean -q -f -- <card>`, `worktree remove <worktree>`, `branch -D <branch>` |
| always (read) | `git -C <dir> check-ignore -q -- <one path>` |

Outside a merge these are refused; during one, a push, `gh`, `curl`, `sf` or `wget` is refused first.

## When the verdict is missing or not trustworthy

Use this when the verdict tool says `no attempt recorded`, or `unverified` for a reason the worker cannot fix (no brief, a gate past the 9-minute limit). Do not resume.

1. Run `/dispatch <id> --verify <sha>` on the worker's head: no spawn, no attempt spent.
2. A timed-out gate reads `next=gate <id> hit the verifier's 9-minute limit: time it by hand in the worktree, then re-run the verifier with /dispatch <ID> --verify <sha> (no attempt spent)`.
3. With another claim unchecked too, the advice stays a resume; its `prove:` list excludes the gate.
4. If it still cannot judge, check by hand:
   - the red test fails at the worker's base (its tests copied in) and passes at its head;
   - every changed path is in scope, none in forbid;
   - the full gate suite passes at the head.
5. Merge with a Review section saying it was checked by hand, and why.
