# Worktrees: Claude Code's and the mod's

Claude Code has git worktrees built in, and the mod uses git worktrees too. Both give an agent its own checkout on its own branch, so parallel work never collides in your main folder. This page sets out what each one does, and why the mod cuts its own worktrees instead of using the built-in ones.

In short, the built-in feature is isolation. The mod adds a lifecycle around the worktree: a known base, a known path and branch tied to a task card, a check of the work against git, and cleanup only once the work has landed.

## The built-in feature

Claude Code's docs: [worktrees](https://code.claude.com/docs/en/worktrees).

- **A session:**
  - `claude --worktree <name>` (or `-w`) starts a session in `<repo>/.claude/worktrees/<name>/`, on a new branch `worktree-<name>`.
  - It is cut from `origin/<default branch>` by default (`worktree.baseRef`).
  - On exit, a clean worktree is removed (an unnamed one without asking). One that holds work asks whether to keep it.
  - The desktop app has a **Worktree** toggle for a new session.
- **A subagent:** `isolation: worktree` runs a subagent in its own worktree, which is removed when the subagent makes no changes. A worktree with changes stays on disk until a periodic sweep removes it.
- **Hooks and settings:**
  - `WorktreeCreate` and `WorktreeRemove` replace the git logic, for example to support another version control system.
  - `.worktreeinclude` copies ignored files in.
  - The `worktree` settings set the base, the location, symlinked folders and sparse paths.
- **What it checks:** guards keep the agent's edits and commands inside its worktree. Nothing checks the work itself: no tests run, and no diff is compared with what the agent said it did.

## What the mod does

`dispatch` cuts the worktree itself, before the worker starts:

- **Path and branch:**
  - The worktree is a sibling of the repo, `<repo>-<ID>`, or under `worktreeRoot`.
  - It sits on the branch `agent/<domain>/<ID>`, so `chassis-delegation-MOD-397` is on `agent/mod/MOD-397`.
- **Base:** it is cut fresh from `origin/main`, or from a sha the card names. A replay of a merged card gets its own `-replay` worktree.
- **Tied to the task:**
  - The brief names the worktree, and the ledger records each attempt against it.
  - The Work pane and the dashboard show it as a row, with its state, model and cost.
- **Checked:**
  - When the worker hands back, the verifier works in that worktree. It runs the card's gates there itself.
  - It checks every changed file against the card's scope and forbid lists, and checks the worker's report against the diff.
  - While the verifier runs, the worktree is locked.
- **Kept until merge:**
  - A refuted attempt resumes in the same worktree, so nothing done is lost.
  - `merge` rebases it onto `origin/main` and runs the gates again.
  - The worktree is removed only by `merge --finish`, after the branch is on origin. Before that, finish lists any untracked or ignored files and stops until you copy them or pass `--discard`.
- **Other shapes:**
  - `repo=<abs path>` cuts the worktree in another local repo, and that repo's gates and config apply.
  - `repo=here` skips the worktree, and the worker shares your checkout.

## Side by side

| | Built-in | The mod |
| --- | --- | --- |
| Who makes it | Claude Code, when the session or subagent starts | `dispatch`, before the worker starts |
| Where | `<repo>/.claude/worktrees/<name>/` | `<repo>-<ID>` beside the repo, or under `worktreeRoot` |
| Branch | `worktree-<name>`, or a generated name | `agent/<domain>/<ID>` |
| Base | `origin/<default branch>` or local HEAD | `origin/main` fetched at dispatch, or a named sha |
| Tied to | the session or subagent | the task card, its brief and its ledger rows |
| Work checked | no | yes: gates, scope, forbid and the report against git |
| Across attempts | not in the docs | the same worktree is resumed |
| Removed | on exit when clean; a subagent's when it made no changes | at `merge --finish`, after the branch has landed |
| Other repos | the session's own repo | any local repo, by absolute path |

## Why the mod cuts its own

The mod's guarantees all hang on knowing exactly where the work is and what it was cut from:

1. **The verifier needs the path before the worker starts.** The brief names the worktree. The verifier reads the delta there against a known base, and the ledger keys every attempt to it. A worktree named by the harness at spawn time would leave each of these to be discovered afterwards.
2. **The branch name drives the merge.** `merge` and `merge --finish` find the work on `agent/<domain>/<ID>`. They print the push and PR lines for it, and accept a rebased or squashed twin of it on origin as landed.
3. **The worktree has to outlive the worker.** It stays through verification, review, a resume after a refute, and the rebase at merge. The built-in cleanup is tied to the end of the session or subagent, not to the work landing.
4. **Cleanup has to be safe.** `merge --finish` removes the worktree only once the branch is on origin, and stops on any untracked or ignored file it would lose.
5. **One mechanism for every repo.** The same dispatch works for this repo, another local repo, or no worktree at all (`repo=here`).

The built-in feature is the right tool when you only want parallel sessions that don't collide. For delegated cards the mod owns the worktree, because the verdict depends on it.
