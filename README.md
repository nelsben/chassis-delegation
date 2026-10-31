# chassis-delegation

**Delegate coding tasks to verified Claude workers.**

![chassis-delegation: the brain writes the task card; dispatch spawns a worker at the opus, sonnet or haiku tier; the hand-back comes back with its verdict](docs/chassis-delegation.png)

chassis-delegation is a Claude Code mod for developers who want to hand off several coding tasks at once without losing track of what comes back. You describe a task; Claude writes it up as a task card, and one dispatch call turns the card into a git worktree and a worker on the model its tier names. When the worker hands back, the mod checks its report against git, gives you one verdict line, and shows what is running and what it costs.

## How it works

*Flowchart: you describe a task, the brain writes a card, dispatch makes a worktree and a worker, the verifier checks the hand-back against git, the verdict leads to a merge.*

```mermaid
flowchart LR
  you[You] --> brain[Brain]
  brain --> card[Card]
  card --> dispatch[Dispatch and worktree]
  dispatch --> worker[Worker]
  worker --> verifier[Verifier]
  verifier --> verdict[Verdict]
  verdict --> merge[Merge]
```

The flow in four diagrams, with what the verifier checks: [docs/how-it-works.md](docs/how-it-works.md).

## Why

Anthropic's own guidance recommends delegating to fresh-context subagents, writing self-contained briefs, asking for evidence rather than claims, and using cheaper models for cheaper work. The same guidance notes that a coordinating agent [sometimes starts doing the work itself](https://code.claude.com/docs/en/agent-teams#wait-for-teammates-to-finish), and its remedy is an instruction telling it to wait. The output scan it describes [does not judge truthfulness](https://code.claude.com/docs/en/sub-agents#subagent-output-scanning), and no published mechanism checks a worker's claims against git or caps what one interactive attempt may spend. This mod exists because the brain forgets to delegate and forgets to pick the right tier, so it turns those recommendations into checks that refuse, queue or refute.

## How it fits Anthropic's guidance

- **Follows.** Workers get the brief as their only context, with the objective, boundaries and a check to run, each in a fresh context, and done-when statements are written to be graded one at a time. A separate verifier and an optional reviewer judge the work, not the worker, and cheaper models take cheaper cards.
- **Enforces.** A brief with no scope is refused, and a report with a wrong sha, file list or gate result is refuted. Each attempt has a retry budget; parallel cards may not share files, and no worker or brain pushes to main.
- **Adds.** A worker's claims are checked against git, which the native output scan does not do, and the per-attempt dollar ceiling covers interactive workers. The retry tier depends on which claim failed, with a ledger line per attempt and a dry run before any spawn.

Sources, and where the mod differs: [docs/alignment.md](docs/alignment.md).

## Evidence

- 689 tasks across six repos, from 3 to 20 October 2026.
- 52% of tasks ended consistent: the worker's report matched git. Consistent means the report was honest, not that the task was right.
- 88% of tasks needed one attempt (any final verdict).
- About $1.3 per card through the mod against about $8.6 by hand (mean of three cards each way).

Charts, data tables and lessons: [docs/evidence.md](docs/evidence.md).

## Install

```sh
git clone https://github.com/nelsben/chassis-delegation.git ~/chassis-delegation
claude --plugin-dir ~/chassis-delegation
# then, inside Claude Code, in your repo:
/delegation setup
```

To load it in VS Code, in the desktop app, or in every session, see [docs/install.md](docs/install.md).

## Documentation

- [How it works](docs/how-it-works.md): the flow in sequence diagrams, and what the verifier checks.
- [Evidence](docs/evidence.md): six charts from six repos' ledgers, each with a table and a lesson.
- [Fit with Anthropic's guidance](docs/alignment.md): where the mod follows, enforces and adds to Anthropic's subagent guidance, and where it differs.
- [Install and setup](docs/install.md): every way to load the mod, and what `/delegation setup` checks.
- [Guide](docs/guide.md): the first sixty seconds, what you see, the task card, the dashboard and every command.
- [Contracts and verification](docs/contracts.md): the brief and report lines, and how a report is checked against git.
- [Review and merge](docs/review-and-merge.md): reviewing a hand-back and landing it.
- [Configuration](docs/configuration.md): every option, the debrief, and the host-command allowlist.
- [Spend](docs/spend.md): what the brain and each worker cost, the spend ceiling and effort by tier.
- [Internals](docs/internals.md): running without the engine, known issues, the store and ledger, and developing the mod.
- [Upgrading](docs/upgrading.md): `/delegation update`, and what to do at each version.
- [Changelog](CHANGELOG.md).

Version 0.9.38, MIT.
