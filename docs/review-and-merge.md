# Review and merge

Reviewing a hand-back and landing it.

## Review

`consistent` says the report matches git. It does not say the work is right:
nothing in that check reads the diff. With the `review` option on, a consistent
verdict is followed by one more agent that does (MOD-21; the second half of
public issue #1). It changed the outcome on roughly one hand-back in three for
the two adopters who first built it by hand.

| `review` | What gets a reviewer |
| --- | --- |
| `off` (default) | nothing: every row, record and ledger line is as it was |
| `on` | every consistent verdict |
| `on-frontier` | a consistent verdict of a frontier or premium attempt only |

Set it in the repo file (`"review": "on"`) or with `/delegation config review on` (or the `/config` menu in a terminal); the setting wins,
and `off` there means "not set here", so the repo file speaks.

**What it checks.** A fresh agent reads the brief, the worker's report and
hand-back, and the diff at the report's sha. It writes one row per factual
claim of the hand-back (what was built, what the tests and the gate show, what
was left alone), each labelled `confirmed`, `refuted` or `unverifiable` and
naming the command it ran or the file and line that decides it, and ends with a
count block:

    confirmed: a/x.ts gains the parser — a/x.ts:12
    refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1
    unverifiable: CI is green — no network from here
    [[review v=1 task=T-4 confirmed=1 refuted=1 unverifiable=1]]

The prompt comes from `hooks/templates/review.md`. The report's own fields
(branch, sha, files, scope, gate, red) were matched against git already; the
reviewer is asked to spend itself on what they cannot say.

**How it runs.** The reviewer is one more Agent call, and the brain makes every
spawn (MOD-12), so the verdict row asks for it the way a respawn does: the row
says `next=review` and ends with a spawn block.

    chassis-delegation: T-4 attempt 1/3 consistent · sonnet · $0.41 · next=review
    spawn: Agent
    ```json
    { "subagent_type": "general-purpose", "model": "haiku", "description": "T-4 review economy haiku", "prompt": "[[review-of v=1 task=T-4 subtask=main attempt=1 worker=<agent> sha=<sha>]]\n…" }
    ```
    The reviewer starts when you make this Agent call: pass the JSON above as its input, verbatim. …

The first line of the prompt is a marker; it is how the spawn hook knows a
spawn is a reviewer's, whatever else the prompt names. The hook records the
reviewer as an attempt of `kind: review` (`source: review`) in the task's
records, and runs it in the worktree the worker used. A reviewer is on no
ladder:

- it never counts against `budget=`, and takes no worker slot (`maxWorkers`),
  and the next worker attempt is numbered as if it had not run;
- it is not a worker on the dashboard; while it runs its task is `pending
  verdict`, and the review is no longer owed;
- it steps at the engine's default effort and keeps the Bash environment it
  inherits (it has no attempt identity).

**What it never does.** It edits nothing. While it runs, the `tool.call` hook
refuses its Edit, Write, MultiEdit and NotebookEdit calls, and any Bash command
the `delegateOnly` lexer counts as a write (a redirection, `tee`, `sed -i`, the
destination of `cp` or `mv`, a `git commit`), read against the worktree it works
in and against the session root. The refusal is one line:

    chassis-delegation: a reviewer never edits (T-4 review): Write refused. Label each claim confirmed, refuted or unverifiable, naming the command or file:line that decides it, and hand back.

That lexer is an accident tripwire, not a sandbox, and the template tells the
reviewer the same rules. The reviewer does not re-run the gate, does not change
the worker's verdict, and does not fix what it finds: it labels, and the worker
fixes.

**At its hand-back** the mod reads the last well-formed `[[review]]` block:

| The block | The row's `next=` | The row says |
| --- | --- | --- |
| `refuted=0` | `accept` | `review: 3 confirmed, 1 unverifiable` |
| `refuted>0` | `resume agent=<the worker>` (while the budget lasts; else `check by hand`) | `review: 3 confirmed, 1 refuted, 0 unverifiable`, and each refuted row quoted under it |
| missing, malformed, or for another task | `accept` | `review: no review block` |

A review never blocks on its own failure: a reviewer that dies, or hands back
without a block, is `next=accept` with the note. With a refuted row the worker is
owed a resume: the brain sends it the refuted rows (`SendMessage`), or, with
`autoEscalate` on, the mod does; that message is the worker's next attempt and
spends `budget=` like any resume. The worker's new hand-back is checked, and if
it is consistent it is reviewed again. The one-line row for a review reads

    chassis-delegation: T-4 attempt 1/3 reviewed · haiku · $0.05 · review: 3 confirmed, 1 unverifiable · next=accept

and the long form (`verdictVerbosity: full`) is
`chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 usd=… model=… next=accept`.
The reviewer's attempt keeps the counts (`review: {confirmed, refuted,
unverifiable}`, verdict `reviewed`), and so does its ledger line.

**The reviewer's tier.** One tier below the worker's: a standard worker is
reviewed by a haiku, a frontier worker by a sonnet, a premium worker by an opus
(economy is the floor, so an economy worker is reviewed by a haiku too). The
`tierMap` turns the tier into an alias as for any spawn, and fable is never
spawned. `reviewTier` (repo file or `/config`) pins the tier instead: `"reviewTier":
"frontier"` reviews every hand-back on an opus.

**Cost.** One more agent per reviewed hand-back. The reviewer reads the
hand-back (quoted in its prompt, cut at 6000 characters), the brief and the diff,
and runs a few read-only commands; one tier below the worker keeps it a fraction
of the worker's own cost, and `on-frontier` spends on the cards where a missed
error costs most. Its cost is on its row and ledger line and in the session
total; the dashboard's "workers" dollars count worker attempts only. A refuted
row costs a resume of the worker and, once it hands back again, another review.

**Not reviewed.** A hand-back that is not consistent (refuted, unverified,
`gate=fail`, no-report); a `repo=none` brief (there is no diff); a `--replay`
run; and a cardless hand-back. `/dispatch <ID> --verify <sha>` is reviewed like
a hand-back when its verdict is consistent. A reviewer is a model: `confirmed`
is its reading of the diff, not a proof, and a claim about CI or the runtime is
usually `unverifiable`.

## Merging a card

After a consistent verdict with next=accept, `/delegation merge <ID>` (or the `merge` tool with
`task: <ID>`) does the local half of the merge. It prints the remote half as one block for the
brain to run verbatim, the way dispatch prints the Agent call.

**What it refuses.** Each refusal is one line, and nothing runs after it:

- the task's latest ledger row is not consistent with next=accept:
  `<ID>: last verdict is <verdict> · next=<next>; merge needs consistent/accept`;
- the task has no worktree on `agent/<domain>/<ID>`, or the worktree is not clean (the line
  names the dirty files);
- the main checkout is not on its default branch, or has tracked changes (untracked files are
  fine; the root card is expected to be one).

**What it does**, by argv, with no shell:

1. In the worktree: `git fetch origin`, then `git rebase origin/main` (the configured
   `baseRef`). On a conflict it runs `git rebase --abort` and answers
   `<ID>: rebase onto origin/main conflicts in <files>; resolve by hand`.
2. It copies the root card `<cardDir>/<ID>-*.md` into the worktree with `status: merged`, with a
   `## Review` section from `--review <text>` or `--review-file <abs path>`. It commits that as
   `cards: <ID> merged`, with a `Co-Authored-By: Claude <model> <noreply@anthropic.com>` trailer
   when the host's model id names a model. A worktree that already carries the merged card is
   not committed again.
3. It runs the card's gates in the worktree through the gate map, the same runner verification
   uses. The output goes to `.delegation/<ID>/merge-gates.txt`. A failing gate answers
   `<ID>: gate <id> failed at <sha>; not pushed` with its last 20 lines, and the command stops.
4. It writes `.delegation/<ID>/pr.md`: the card's Done-when as a checklist, the verdict line,
   the gate results and the Claude Code line. It holds no absolute path and no home folder.

**The first block**, printed when the gates are green:

```sh
git -C <worktree> push -u origin agent/<domain>/<ID>
gh pr create --repo <owner/repo> --base main --head agent/<domain>/<ID> --title '<card title>' --body-file <root>/.delegation/<ID>/pr.md
gh pr merge --repo <owner/repo> agent/<domain>/<ID> --rebase
/delegation merge <ID> --finish
```

**`--finish`**, once the PR has landed, does the following:

1. It runs `git fetch origin` in the main checkout. It refuses with
   `<ID>: <branch> is not in origin/main yet` unless the worktree's head, or its rebased twin
   (same tree, same subject), is in origin/main.
2. It compares the merged card on origin with the root card, with the status line aside (the
   Review section may be extra).
   - When they match, it removes the root card.
   - Otherwise it names the lines that differ and stops there.
3. It runs `git pull --ff-only` in the main checkout, then `git worktree remove` and
   `git branch -D` for the task.
4. It marks the task record `merged` with the sha and writes a ledger row
   `{kind: 'merged', task, sha, pr?}`.
5. `/delegation` lists the task under `merged:` for the rest of the session, and `running:`
   no longer shows it.

**A git-ignored card folder (MOD-86).** A repo that keeps its cards local through
`.git/info/exclude` or `.gitignore` merges the same way, with the card never committed. The merge asks
git `git -C <root> check-ignore -q -- <card path>` (exit 0 = ignored) and, when it is:

- prepare rewrites the root card (the main checkout's) in place with `status: merged`, plus the
  Review section when one is given, runs no `git add` of the card and makes no card commit. The rest
  runs as before: the rebase, the gates in the worktree, the PR body from the card text and the push
  block. The first line says `card kept local (git-ignored): <root card path> marked merged` in place
  of `card committed as merged`.
- `--finish` does not look for the card on origin and does not remove the root card: it is the only
  copy, and it already reads merged. It confirms the merge by the worktree head being on
  origin/main or having a rebased twin there; when neither, it refuses naming the head and changes
  nothing. Then it pulls, removes the worktree and branch, writes the merged ledger row and prints
  the remote cleanup lines as usual.

A tracked card behaves exactly as described above.

**The second block** comes next:

```sh
git push origin --delete agent/<domain>/<ID>
git tag -a v<version> -m v<version>        # only when hooks/lib/version.ts changed
git push origin v<version>                 # likewise
git -C <loaded clone> pull --ff-only       # likewise, when the mod loads from another git checkout
```

The answer ends with `<ID> merged at <sha>`. When the version moved, a last line follows:
`release v<version>: run the block above, then reload the window`.

**The allowlist rule.** The merge never pushes, never calls `gh` and never touches the network.
Every remote step is in the two blocks, and the brain runs them. Every argv the merge runs goes
through the one path to the host, `run()`, and the one allowlist, `hooks/lib/allow.ts`. The
local writes the merge needs are exact shapes in that allowlist. They are on only while the
merge command runs: the command sets `AllowConfig.merge` to the one task's root, worktree, branch,
base ref, card path and id, and clears it when it ends. The shapes are:

- in the worktree: `fetch origin`, `rebase <baseRef>`, `rebase --abort`, `add -- <card>` and
  `commit -q -m 'cards: <ID> merged'`, with an optional `Co-Authored-By` trailer;
- in the main checkout: `fetch origin`, `remote get-url origin`, `pull --ff-only`,
  `clean -q -f -- <card>`, `worktree remove <worktree>` and `branch -D <branch>`.

`git -C <dir> check-ignore -q -- <one path>` is a read shape that passes at any time (any other
option, or more than one path, is refused).

Outside a merge, every one of these is refused as before. While the merge runs, a push, `gh`,
`curl`, `sf` or `wget` is refused ahead of every other rule.

## A gate that hits the verifier's time limit

The verifier stops a gate it re-runs after 9 minutes. When that is the only
unchecked claim, the verdict is `unverified` and the row says
`next=gate <id> hit the verifier's 9-minute limit: time it by hand in the worktree, then re-run the verifier with /dispatch <ID> --verify <sha> (no attempt spent)`,
not a resume: a resume cannot make the gate faster, and the worker would only
repeat its report. Run the gate by hand in the worker's worktree to see its real
time, then run the `--verify` line on the same sha; no attempt is spent. When
another claim is also unchecked the advice stays a resume, and its `prove:` list
says of the gate that it timed out and need not be proved by the worker. A
refuted verdict is advised as before.
