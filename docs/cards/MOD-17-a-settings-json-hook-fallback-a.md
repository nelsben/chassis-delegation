---
id: MOD-17
title: A settings.json hook fallback: a no-dependency bin wrapper runs the native verifier after an Agent call and the git guard before a Bash call, so both travel to a host where the mod engine does not load
domain: mod
tier: standard
status: merged
scope: [bin/**, hooks/lib/gitguard.ts, hooks/lib/verify-native.ts, hooks/lib/handback.ts, hooks/lib/brief.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/register.ts, hooks/lib/allow.ts, hooks/lib/card.ts, hooks/lib/dispatch.ts, hooks/lib/version.ts]
red_test: plain-node tests in tests/node/ (a new bin.node.mjs) that build a git repo under tests/.tmp/, then pipe hook input JSON into node bin/chassis-hook.mjs: post-agent with a matching report prints a verified row as additional context, with an out-of-delta file prints a refute, with no report prints nothing; pre-bash with `git commit -m x` on main prints a deny with the guard's reason and on agent/x/y prints nothing; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Public issue #2: the mod is a function-hook plugin, so where the engine's rollout switch serves off, or a host cannot load a hooks module, nothing of it runs. The parts adopters value most are pure functions that already run under plain node: the report and brief grammar, the native verifier, the gate rules and the git guard. A small wrapper exposed through ordinary settings.json command hooks carries those two checks without the engine: no scheduler, no ladder, no runners.

## Done when

- a new bin/chassis-hook.mjs runs under the node on PATH with nothing installed (node's own type stripping or the repo's tests/node/register.mjs loader, whichever this node supports; the README names the minimum node version) and has two modes read from argv: post-agent and pre-bash
- post-agent (a PostToolUse hook on the Agent tool): reads the hook input JSON from stdin, takes the last [[report …]] in the tool result, finds the brief (the path the prompt names, or an inline [[brief …]] header), runs the native verifier in the report's tree, and prints the hook output JSON with the verdict row as additional context in the shape the engine's settings-hook types document; no report prints nothing and exits 0
- pre-bash (a PreToolUse hook on Bash): runs the git guard over the command against the repo the command runs in and, when it refuses, prints the deny decision with the guard's own reason; anything else exits 0 silently
- every command the wrapper itself runs (read-only git, the gate) passes the same allowlist check as the engine path (hooks/lib/allow.ts with the repo file's gate map); the wrapper never pushes, installs or fetches
- the plain-node suite covers both modes against a real git repository built under tests/.tmp/: a matching report gives a verified row, a report naming a file outside the delta gives a refute, a commit on main is denied and a commit on agent/x/y passes
- README gains a section with the two settings.json entries to paste and a plain list of what exists only with the engine (tiering, the queue, the ladder, the dashboard, the debrief, delegateOnly); tests/selfcheck.sh prints the two entries when it finds the rollout switch off; CHANGELOG entry
