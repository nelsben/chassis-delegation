---
id: MOD-203
title: gh guard reads the verb past -R/--repo/--hostname after the noun, and covers run, cache and the other write nouns
domain: mod
tier: standard
status: merged
scope: [hooks/lib/ghguard.ts, tests/ghguard.test.ts, CHANGELOG.md]
forbid: [hooks/register.ts, hooks/lib/allow.ts, hooks/lib/land.ts, docs/cards/**]
red_test: claude plugin test . (tests/ghguard.test.ts: the -R-before-verb cases fail now)
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A review found the worker gh guard (MOD-197) blind to a flag between the noun and the verb: gh accepts `gh issue -R o/r close 5`, but ghWrites takes the flag's value as the verb and reports nothing, so a worker can close issues or merge PRs past the guard. It also misses write nouns such as run and cache.

## Done when

- In ghWrites (hooks/lib/ghguard.ts), after the noun the verb is the first word that is not an option, where -R, --repo and --hostname consume the next word, and --repo=<v>, --hostname=<v> and any other --flag=<v> or -x flag consume nothing more; the same skip as before the noun.
- ghWrites returns ["gh issue close"] for `gh issue -R o/r close 5`, ["gh pr merge"] for `gh pr --repo o/r merge 3 --rebase`, ["gh issue close"] for `gh issue --repo=o/r close 5`, ["gh run cancel"] for `gh run cancel 9`, ["gh cache delete"] for `gh cache delete --all`.
- New write nouns: run (cancel, rerun, delete, and any verb but list, view, watch, download), cache (delete; list is a read), and codespace, extension, alias, ssh-key, gpg-key, config treated like the existing VERB_NOUNS (every verb but list and view is a write; for config, set is a write and get and list are reads).
- Reads still pass: `gh issue -R o/r view 5`, `gh pr --repo o/r list`, `gh run list`, `gh run view 9`, `gh cache list` return [].
- tests/ghguard.test.ts has one case per spelling above, writes and reads; the existing cases still pass. CHANGELOG.md gains a Fixed entry under a `## Unreleased` heading at the top naming MOD-203.
- validate, the node tests and the engine suite pass.

## Review

Consistent first attempt. Verb lookup after the noun now skips -R/--repo/--hostname with their values; run, cache, config set and five more nouns added. Reviewed the diff: matches the card.
