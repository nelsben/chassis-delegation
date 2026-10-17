# chassis-delegation

**Delegate coding tasks to verified Claude workers.**

![chassis-delegation: the brain writes the task card; dispatch spawns a worker at the opus, sonnet or haiku tier; the hand-back comes back with its verdict](docs/chassis-delegation.png)

chassis-delegation is a Claude Code mod for developers who already use Claude Code on a real repo and want to hand off several tasks at once without losing track of what comes back.

You describe a task in a sentence. Claude writes it up as a task card: what to change, which files are in scope, the test that must fail first, and the gate that must pass. One dispatch call turns the card into a git worktree and a worker on the model the card's tier names: Haiku, Sonnet or Opus. When the worker hands back, the mod checks its report against git rather than taking its word: the branch, the commit, the files changed, the scope and the gate. You get one verdict line with the next step, and a band above the prompt shows what is running and what it has cost.

It needs nothing from any other repo: no scripts, no harness, no network.

## Install

```sh
git clone https://github.com/nelsben/chassis-delegation.git ~/chassis-delegation
claude --plugin-dir ~/chassis-delegation
# then, inside Claude Code, in your repo:
/delegation setup
```

To load it in VS Code, in the desktop app, or in every session, see [docs/install.md](docs/install.md).

## Documentation

- [Install and setup](docs/install.md): every way to load the mod, and what `/delegation setup` checks.
- [Guide](docs/guide.md): the first sixty seconds, what you see, the task card, the dashboard and every command.
- [Contracts and verification](docs/contracts.md): the brief and report lines, and how a report is checked against git.
- [Review and merge](docs/review-and-merge.md): reviewing a hand-back and landing it.
- [Configuration](docs/configuration.md): every option, the debrief, and the host-command allowlist.
- [Spend](docs/spend.md): what the brain and each worker cost, the spend ceiling and effort by tier.
- [Internals](docs/internals.md): running without the engine, known issues, the store and ledger, and developing the mod.
- [Upgrading](docs/upgrading.md): `/delegation update`, and what changed at each version.
- [Changelog](CHANGELOG.md).

Version 0.9.13, MIT.
