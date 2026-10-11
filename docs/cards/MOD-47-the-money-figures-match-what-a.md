---
id: MOD-47
title: The money figures match what a session costs: cache reads at each model's own rate, 1-hour cache writes at 2x, every main-loop turn in the brain record, an ad hoc agent counted once
domain: mod
tier: standard
status: merged
scope: [hooks/lib/cost.ts, hooks/lib/brain.ts, hooks/register.ts, hooks/lib/live.ts, tests/**, README.md, CHANGELOG.md]
forbid: [.claude-plugin/**, .chassis-delegation.json, docs/**, hooks/templates/**, bin/**, hooks/lib/version.ts, hooks/lib/legacy.ts]
red_test: pure tests in tests/node: usdOf for claude-opus-5-5 with 1M cache-read tokens is $0.20 and for claude-fable-5-1 is $0.25; a usage with 1M ephemeral_1h cache-write tokens on Opus 5.5 is $8.00 and 1M 5-minute writes $5.00; engine test in tests/hooks.test.ts: main-loop turns before and after a session-id change (or mod reload) all count in /delegation's brain turns and dollars; an ad hoc agent resumed once is counted once; red first
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

In a Game-Decompiler session (92e94d15, Oct 8-11, read under 0.6.0) the line said `brain: opus $325.56 over 15 turns · workers $174.17 (111 attempts) · brain share 33%`. The worker part is MOD-37's bug, already fixed in 0.8.3: all 111 attempts came from four other repos' sessions. The rest is still wrong in 0.9.0. (1) cost.ts prices every cache read at 0.1x input. List prices are Opus 5.5 $0.20/MTok (0.05x, the table gives $0.40) and Fable 5.1 $0.25 (the table gives $1.00). Every cache write is priced at 1.25x, but Claude Code writes 1-hour entries, which cost 2x: 100% of this session's writes were `ephemeral_1h_input_tokens`. Priced per message from the transcript, the main loop cost $972.23 on the mod's table and $605.26 at list prices; on a big-context brain, cache reads are about 70% of every call. (2) The brain record held 15 turns and $325.56, while the main loop cost $972 on the mod's own table. Two-thirds of the turns are missing. Suspects: $.state keyed by session id, which a resume or compaction changes (the conversation continued as 0c3ff70e); records reset when a session loads a new copy of the mod (dev-mods snapshot of Oct 10 11:53); turn.complete events without usage. (3) The 61 ad hoc agents' delegation.cost records sum to $536.14, while their transcripts priced per message id on the same table give $453.32 (+18%), and $889 if every transcript entry is counted, so part of the usage is counted twice. The founder reads these figures to judge whether the brain is doing worker work. Today they are off by up to 3x in both directions.

## Done when

- hooks/lib/cost.ts prices cache reads per model: Opus 5.5 $0.20/MTok, Fable 5.1 and Fable/Mythos 5.1 ids $0.25, Sonnet 5.5 $0.20, every other model 0.1x input as now; a comment names the pricing page and the date the values were checked
- cache writes are priced by TTL from usage.cache_creation: ephemeral_1h_input_tokens at 2x input, the rest at 1.25x; a usage without the breakdown stays at 1.25x
- the brain record keeps every main-loop turn of a conversation: the cause of the missed turns is found and named in the CHANGELOG, and an engine test whose main-loop turns straddle the suspected boundary (a resume or compaction that changes the session id, or a reload of the mod) keeps every turn's usage in the record
- an ad hoc agent's recorded cost equals its turns priced once each: a fixture of an agent that was resumed (SendMessage) and whose messages span several transcript entries is counted once, and the source of the +18% is named in the CHANGELOG
- README's brain-spend section says the figures are API list prices from the mod's table, priced per message, and what they leave out (Haiku 5.5's long-prompt tier, fast mode)
