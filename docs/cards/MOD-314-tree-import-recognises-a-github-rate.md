---
id: MOD-314
title: tree import recognises a GitHub rate limit, stops with the reset time, and the next run resumes from the manifest
domain: mod
tier: standard
status: merged
issue: 428
scope: [hooks/lib/landtree.ts, hooks/register.ts, tests/node/landtree.node.mjs, tests/landtree.test.ts, tests/harness.ts, docs/guide.md, CHANGELOG.md]
forbid: [hooks/lib/allow.ts, hooks/lib/scheduler.ts, hooks/lib/verify-native.ts, hooks/templates/**, docs/cards/**, hooks/lib/reconcile.ts]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/landtree.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

A 294-issue import hit GitHub's rate limit mid-run; the failure printed as an ordinary `not filed … gh said: …` and the person needed two sessions to work out what had happened and finish. treeImportWith in hooks/register.ts stops on the first create failure with no reading of the error.

## Done when

- hooks/lib/landtree.ts exports a pure `rateLimited(text: string): { kind: 'primary' | 'secondary' } | undefined` over gh's error text: /API rate limit (already )?exceeded/i and HTTP 403 or 429 together with /rate/i give primary; /secondary rate limit/i and /submitted too quickly/i give secondary; anything else returns undefined. No header parsing: gh prints no response headers, and `gh api rate_limit` is not run (the allowlist would refuse it).
- In treeImportWith (hooks/register.ts), when a create fails and rateLimited(fileOne's `failed` text) holds, the run stops with one line in place of the `not filed:` and `gh said:` pair: `filed <k> of <n>; GitHub rate limit hit on "<title>"; resets within the hour: run again then` for primary, or `…; retry in a few minutes: run again then` for secondary; the issues filed before it stay recorded in the plan file as today.
- A failed `gh issue view` of a recorded issue during the import goes through a tree-import variant of viewIssue that returns `{ failed: string }` (viewIssue itself and its other callers are unchanged); when rateLimited holds on that text the run stops with `tree import: GitHub rate limit hit reading #<n>; resets within the hour: run again then` (or the retry wording for secondary) in place of `could not read #n (…)`.
- tests/node/landtree.node.mjs gains cases for rateLimited with gh's exact strings: `GraphQL: API rate limit exceeded for user ID 1234.` and `API rate limit already exceeded for user ID 1234` give primary; `GraphQL: was submitted too quickly (createIssue)` and `HTTP 403: You have exceeded a secondary rate limit` give secondary; `boom` gives undefined. tests/landtree.test.ts gains one engine case where the third create fails with the submitted-too-quickly text: the output ends with the retry line, the first two issues are recorded, and a re-run files from the third.
- docs/guide.md, in the Tree import section, gains two sentences on the rate-limit stop and resuming.
- CHANGELOG.md gains one bullet under `## Unreleased` / `### Fixed` naming MOD-314.
- The validate, node and test gates are green.

## Review

Diff read in full: pure rateLimited in landtree.ts with secondary checked first; viewIssueForTree returns {failed} with gh's text; both stops in treeImportWith read as the card asks and the resume is the existing manifest path; four node cases, one engine case, guide sentences, CHANGELOG bullet. Verdict consistent at 02da88c.
