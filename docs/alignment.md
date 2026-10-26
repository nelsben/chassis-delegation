# How chassis-delegation fits Anthropic's guidance

Anthropic publishes advice on subagents, parallel sessions and long-running agents. This page lines the mod up against
it, point by point. The claim is convergence: the mod and the guidance arrive at the same practices, and the mod turns
many of them into checks. It makes no claim to have come first. Each bullet names the page that holds the guidance and
the mod doc that shows the mod's side.

## Where it follows the guidance

- **The brief is the only channel to the worker.** A subagent gets what the parent's prompt carries, so the prompt must
  hold everything ([Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents)). The worker reads the
  brief file alone, so the card carries every decision: [guide.md](guide.md#what-the-worker-sees).
- **A brief holds an objective, an output format, tool guidance and boundaries.** This is the research-system post's
  list ([How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system)).
  The card's Done when, the report grammar, the gate and the scope and forbid globs cover those four:
  [contracts.md](contracts.md#the-brief).
- **Done-when statements you can grade one by one.** Outcome rubrics work as separate checks
  ([Define outcomes](https://platform.claude.com/docs/en/managed-agents/define-outcomes)). The dry run flags hedge words
  in a Done when line and asks for a named outcome: [guide.md](guide.md#dry-run-warnings).
- **Evidence and a command that can be run, not claims.** Give the agent a check it can run
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)). The report names a sha, the
  files, a gate and a red file, and the verifier re-checks each: [contracts.md](contracts.md#how-a-report-is-verified).
- **A separate judge.** A generator tends to approve its own work, so a different agent should evaluate it
  ([Harness design for long-running application development](https://www.anthropic.com/engineering/harness-design-long-running-apps)).
  The verifier and the optional reviewer both sit outside the worker: [review-and-merge.md](review-and-merge.md#review).
- **Cheaper models for cheaper work.** Route a subagent to a smaller model when the task allows
  ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)). A card's tier picks haiku, sonnet or opus,
  and a failed claim can raise the tier: [configuration.md](configuration.md#options).
- **Fresh context per worker.** Context is a budget, and clearing it between tasks helps
  ([Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)).
  Each worker starts from the brief with none of the conversation behind it: [guide.md](guide.md#what-the-worker-sees).

## Where it makes the guidance a check

- **A complete brief.** The guidance recommends objectives, boundaries and a verification step
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)). The mod refuses a brief with no
  `scope=` and stops a dispatch whose scope is prose: [contracts.md](contracts.md#the-brief).
- **Evidence.** The guidance asks for evidence rather than assertion
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)). The mod refutes a sha that is not on
  the branch, a `files=` list that is not the real change, and a gate that runs red when the report said green:
  [contracts.md](contracts.md#how-a-report-is-verified).
- **A retry cap.** Restart with a better prompt after repeated failed corrections
  ([Best practices for Claude Code](https://code.claude.com/docs/en/best-practices)). The attempt budget counts spawns,
  resumes and verify attempts, then denies the next spawn: [contracts.md](contracts.md#the-brief).
- **Spend caps.** Production agents should carry budget and turn limits
  ([How the agent loop works](https://code.claude.com/docs/en/agent-sdk/agent-loop)). Each attempt has a dollar ceiling:
  a message at 1x and a deny of every call but the hand-back at 2x: [spend.md](spend.md#spend-controls).
- **The orchestrator keeps its hands off.** A lead that starts doing the work itself is told to wait
  ([Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams)). The brain guard, `delegateOnly`
  (default `warn`), flags or refuses source edits by an opus or fable brain: [spend.md](spend.md#the-brains-spend).
- **Distinct files per parallel worker.** Give each teammate its own files
  ([Orchestrate teams of Claude Code sessions](https://code.claude.com/docs/en/agent-teams)). Overlapping lane scopes are
  refused, and a one-client resource queues the second card: [contracts.md](contracts.md#exclusive-resources-and-fan-out).
- **Never push to main.** Background sessions are told to push their branch, not the default one
  ([Manage multiple agents with agent view](https://code.claude.com/docs/en/agent-view)). The git guard denies commit,
  merge, cherry-pick, rebase and push on a guarded branch to the brain and every recorded worker:
  [contracts.md](contracts.md#the-git-guard).
- **Least privilege.** Grant an agent only what it needs
  ([Cloud environment setup](https://platform.claude.com/docs/en/managed-agents/environments)). The mod's own host
  commands pass an argument-by-argument allowlist and a refused one never runs:
  [configuration.md](configuration.md#the-host-command-allowlist).

## Where it fills a gap or does more

- **Claims checked against git.** The output scan on a subagent's result says it does not judge whether the result is
  true ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)). The verifier compares branch, sha, changed
  files, scope, red proof and a gate re-run with the repository: [contracts.md](contracts.md#how-a-report-is-verified).
- **A per-attempt dollar ceiling for interactive workers.** The SDK's budget option and a Managed Agents session budget
  cover their own surfaces ([Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents),
  [Session budgets](https://platform.claude.com/docs/en/managed-agents/budgets)); the pages describe nothing like it for
  an interactive session. The mod reads a worker's cost as it runs and acts on its next call: [spend.md](spend.md#spend-controls).
- **Escalation that depends on which claim failed.** The guidance names escalation to a stronger model as a pattern
  ([Multiagent orchestration](https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration)). The mod moves
  one tier up after a sha, gate or red refute and holds the tier for a scope, files, branch or pr refute:
  [contracts.md](contracts.md#escalation-and-resume).
- **The ledger of every attempt.** Long-running work wants state kept outside the context window
  ([Effective harnesses for long-running agents](https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents)).
  Every judged attempt is one line in an append-only file: [internals.md](internals.md#store-and-ledger).
- **The dry run before a spawn.** Asking for a plan before a run is advice nothing enforces
  ([Workflow runs](https://platform.claude.com/docs/en/managed-agents/workflow-runs)). Every card write prints forbid
  conflicts, hedge words, an oversized scope and a cheaper-tier hint, and a dispatch spawns nothing itself:
  [guide.md](guide.md#dry-run-warnings).

## Where it differs

- **A worker's `scope+=` amend is applied on its own word.** The guidance says messages from other agents are task input
  and never grant approval ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)). With `applyAmends` on
  (the default) the mod appends a `scope+=` amend before it verifies, so the worker widens the rule it is judged by. The
  amend is disclosed, a forbid still wins, and `scope-=`, `forbid-=` and `ignore+=` wait for approval:
  [contracts.md](contracts.md#amend).
- **The ready fallback starts workers outside the mod's hooks.** The SDK guidance says limits should not rest on prompt
  wording ([Subagents in the SDK](https://code.claude.com/docs/en/agent-sdk/subagents)). A worktree row left unclaimed for
  `readyFallbackMinutes` is started by the mod itself, with no git guard, no effort setting and a cost known only at its
  end; `repo=here` and `repo=none` rows never take this path: [contracts.md](contracts.md#spawn-and-the-queue).
- **`delegateOnly: deny` makes even a one-line edit a card.** The guidance keeps quick, small edits in the main
  conversation ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)). Under `deny` the mod refuses any
  source edit outside the card, docs and changelog paths, whatever its size. It is opt-in; the default is `warn`:
  [spend.md](spend.md#the-brains-spend).
- **It cuts its own worktrees and sets effort per step, where native features now exist.** Claude Code can isolate a
  subagent in a worktree ([Run parallel sessions with worktrees](https://code.claude.com/docs/en/worktrees)) and take an
  effort setting per subagent ([Create custom subagents](https://code.claude.com/docs/en/sub-agents)). The mod keeps a
  stable branch `agent/<domain>/<ID>` and a known path for the verifier, and rewrites each step to the tier's effort:
  [configuration.md](configuration.md#the-host-command-allowlist), [spend.md](spend.md#spend-controls).

## Sources

- Create custom subagents: https://code.claude.com/docs/en/sub-agents
- Orchestrate teams of Claude Code sessions: https://code.claude.com/docs/en/agent-teams
- Run parallel sessions with worktrees: https://code.claude.com/docs/en/worktrees
- Manage multiple agents with agent view: https://code.claude.com/docs/en/agent-view
- Subagents in the SDK: https://code.claude.com/docs/en/agent-sdk/subagents
- How the agent loop works: https://code.claude.com/docs/en/agent-sdk/agent-loop
- Best practices for Claude Code: https://code.claude.com/docs/en/best-practices
- How we built our multi-agent research system: https://www.anthropic.com/engineering/multi-agent-research-system
- Effective context engineering for AI agents: https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents
- Effective harnesses for long-running agents: https://www.anthropic.com/engineering/effective-harnesses-for-long-running-agents
- Harness design for long-running application development: https://www.anthropic.com/engineering/harness-design-long-running-apps
- Define outcomes: https://platform.claude.com/docs/en/managed-agents/define-outcomes
- Cloud environment setup: https://platform.claude.com/docs/en/managed-agents/environments
- Multiagent orchestration: https://platform.claude.com/docs/en/managed-agents/multiagent-orchestration
- Session budgets: https://platform.claude.com/docs/en/managed-agents/budgets
- Workflow runs: https://platform.claude.com/docs/en/managed-agents/workflow-runs
