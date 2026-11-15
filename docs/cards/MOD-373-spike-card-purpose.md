---
id: MOD-373
title: a `purpose: spike` card dispatches with findings=, sources= and verdicts= in its brief header, a spike rules section in the brief, refusals for a malformed spike, kind spike that never explores, and spike fields in the card tool
domain: mod
tier: standard
status: merged
issue: 512
scope: [hooks/lib/dispatch.ts, hooks/lib/explore.ts, hooks/lib/classof.ts, hooks/lib/card.ts, hooks/templates/brief.md, hooks/register.ts, docs/guide.md, CHANGELOG.md, tests/node/spikecard.node.mjs, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/spike.ts, hooks/lib/verify-native.ts, hooks/lib/brief.ts, hooks/lib/gates.ts, hooks/lib/storeloss.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/spikecard.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

MOD-372 built the `findings` gate: the verifier and merge check a findings file against the card's `## Questions`, reading `findings=`, `sources=` and `verdicts=` from the brief header. Nothing writes those fields yet, the worker is never told the file's format, and a spike card would still explore like a build card. This card makes `purpose: spike` a card a brain can write by hand or with the card tool, dispatch, and have checked.

## Before you start

- `hooks/lib/spike.ts` (MOD-372), whole: `FINDINGS_GATE`, `spikeQuestions`, the findings grammar in its comments. Use these; do not copy them.
- `hooks/lib/dispatch.ts`: `Card`, `parseCard`, `asText`, `asList`, `renderHeader`, `stageBrief`, `renderBriefChecked`, `leftoverMarker`.
- `hooks/templates/brief.md`, whole; and the stand-in `TEMPLATE` in `tests/harness.ts`.
- `hooks/lib/explore.ts`: `CARD_KINDS`, `cardKind`, `explorePlan`. Its callers: `hooks/lib/classof.ts`, `hooks/lib/card.ts` (search `cardKind(`), `hooks/register.ts` (search `cardKind(`, three places).
- `hooks/register.ts`, the dispatch path: from `const tier: Tier = tierOf(card.tier)` through the MOD-366 advisor check (search `advisorFieldRefusal(advisorWord)`).
- `hooks/lib/card.ts`: `CARD_TOOL`'s input schema, `cardFromFields` (the frontmatter and body it renders), `cardsFromFields` (lanes).
- `docs/guide.md` `## The card` and its subsections.

## Design (decided by the brain; build it, do not redesign it)

### 1. The card format (what every part below reads)

```yaml
purpose: spike
findings: docs/spikes/MOD-400-findings.md      # repo-relative, inside scope
sources: [docs.anthropic.com, github.com/anthropics]   # optional; absent = any source
verdicts: [adopt, adapt, skip]                  # optional; absent = any word
red_test: none
gate: findings                                  # may add gateMap ids: findings, validate
```

and in the body a `## Questions` section, `1. …`, `2. …`, a question that ends `(verdict)` wanting a `Verdict:` line (the grammar `spikeQuestions` reads).

### 2. `hooks/lib/dispatch.ts` (mark additions `MOD-373 (#512)`)

```ts
export type SpikeFields = { findings: string; sources: string[]; verdicts: string[] }
export function spikeOf(card: Card): SpikeFields | undefined
export function spikeRefusal(card: Card): string | undefined
```

- `spikeOf`: undefined unless `asText(card.fields.purpose).trim().toLowerCase() === 'spike'`; else `findings` = `asText(card.fields.findings).trim()`, `sources` and `verdicts` = `asList` of their fields.
- `spikeRefusal`, the first that applies:
  1. `purpose` present, not empty, and (lowercased) neither `build` nor `spike`: `purpose: <value> is not build or spike`.
  2. Not a spike: undefined.
  3. `findings` empty: `a spike card names its findings file: findings: <repo path>`.
  4. `findings` starts with `/` or `~`, or has a `..` segment: `findings: must be a path inside the repo`.
  5. `card.repo === 'none'`: `a spike card writes its findings in a repo: drop repo: none`.
  6. `findings` matched by no `card.scope` entry (the same glob matcher the verifier's scope claim uses; find it, do not write a new one): `findings: <path> is not in the card's scope`.
  7. `card.gate` does not include `findings`: `a spike card's gate names findings`.
  8. `card.redTest`, trimmed and lowercased, is not `none`: `a spike card's red_test is none`.
  9. `spikeQuestions(card.body)` is an error: that error.
- `renderHeader`: `purpose=spike` when `spikeOf(card)`, else `purpose=build` as today. After the `allow=` part: ` findings=<path>` for a spike, then ` sources=<a,b>` and ` verdicts=<a,b>` each only when its list is not empty (comma-joined, no spaces). A build card's header is byte-identical to today's.
- `stageBrief`: a `{{#spike}}…{{/spike}}` section kept only for a spike (the same `keep` as `red`). Values: `findings` (the path, '' for a build card), `sources` (the list joined by `, `, or `any source` when empty), `verdictWords` (` (one of: <verdicts joined by ', '>)` when the list is not empty, else ''). Add them so `renderBriefChecked` knows them.

### 3. `hooks/templates/brief.md`, and the same section in `tests/harness.ts`'s `TEMPLATE`

Insert directly before the line that starts `- Stay inside the brief's scope=`:

```
{{#spike}}
- Spike: the card asks questions and your deliverable is the findings file {{findings}}. Write only that file and the other paths the scope names; change no source, test or config file. Web search and web fetch are allowed. Cite only from: {{sources}}.
- Findings format: one section per card question, headed `## Q<n>` with the card's number; in it the answer, every claim cited by a URL or a repo `path:line`. A question the sources do not answer gets a line `Unanswered: <why>`, never a guess. A question marked (verdict) gets a line `Verdict: <word>`{{verdictWords}}. Flag a claim you could not confirm `⚠ Unverified: <what>` and sources that disagree `⚠ Conflict: <what>`. End with `## Decisions this implies`, one `- ` line per decision (`- none` when there is none).
- The gate `findings` is built in: the verifier checks the file at your sha against the card's questions, the sources and this format. There is no red test: report red=none.
{{/spike}}
```

### 4. `hooks/register.ts`, dispatch

- Directly after the MOD-366 advisor check: `const spikeWhy = spikeRefusal(card); if (spikeWhy !== undefined) return \`/dispatch ${id}: refused, no brief written: ${spikeWhy}\``. The dry run is refused alike.
- The three `cardKind(` calls pass `purpose: card.fields.purpose` (at the `c.title` one, the record it reads has the card fields only if it already carries them; when it does not, leave that call as it is and say so in a `choice:` line).

### 5. `hooks/lib/explore.ts`, `hooks/lib/classof.ts`

- `CARD_KINDS` becomes `['release', 'docs', 'bug', 'test', 'feature', 'spike']`.
- `cardKind`'s input gains `purpose?: unknown`. A purpose that reads `spike` (trimmed, lowercased) gives `spike`, before the card's own `kind:`. Doc comment says so.
- `explorePlan` skips `spike` as it skips `release` and `docs`; its doc comment names spike.
- `classof.ts` passes `purpose: card.fields.purpose`.

### 6. `hooks/lib/card.ts`, the card tool

- `CARD_TOOL` input gains:
  - `purpose`: `{ type: 'string', enum: ['build', 'spike'], description: 'build (default), or spike: a research card whose hand-back is a cited findings file, checked by the built-in findings gate; needs questions and findings, redTest "none"' }`
  - `questions`: `{ type: 'array', items: { type: 'string' }, description: 'With purpose spike: the questions, one each, numbered in that order; end one with (verdict) to want a Verdict: line' }`
  - `findings`: `{ type: 'string', description: 'With purpose spike: the findings file, a repo path; added to scope when no scope entry matches it' }`
  - `sources`: `{ type: 'array', items: { type: 'string' }, description: 'With purpose spike: the URL prefixes a citation may come from, e.g. ["docs.anthropic.com", "github.com/anthropics"]; absent: any' }`
  - `verdicts`: `{ type: 'array', items: { type: 'string' }, description: 'With purpose spike: the words a (verdict) question may answer with, e.g. ["adopt", "adapt", "skip"]; absent: any word' }`
- `cardFromFields`:
  - `purpose` other than `build` or `spike`: error `purpose must be build or spike`.
  - Not a spike and any of `questions`, `findings`, `sources`, `verdicts` given: error `<the first such field> belongs to a spike card (purpose: spike)`.
  - A spike: `questions` must hold at least one non-empty string (error `a spike card needs questions: one string each`); `findings` non-empty (error `a spike card needs findings: the findings file, a repo path`), not starting with `/` or `~`, no `..` segment (error `findings must be a path inside the repo`); `redTest` trimmed lowercased must be `none` (error `a spike card's redTest is "none": the findings gate checks it`); `repo: none` is an error (`a spike card writes its findings in a repo`). `findings` goes first in scope when no given scope entry matches it. `gate` absent: `findings`; given without `findings`: `findings` is put first.
  - Frontmatter for a spike, after the `allow:` line and before `red_test:`: `purpose: spike`, `findings: <path>`, then `sources: [..]` and `verdicts: [..]` only when given. A build card's text is byte-identical to today's.
  - Body for a spike: after `## Why` and its text, `## Questions` then one line `<n>. <question>` each, then `## Done when` as today.
- `cardsFromFields`: `purpose: spike` with `lanes` is an error `a spike is one card; drop lanes`.

### 7. Docs

- `docs/guide.md`: a new `### Spike cards` subsection at the end of `## The card`: what a spike is for, the card format of §1, the findings format (the three template lines in plain words), what the gate checks (MOD-372's problem list in one line each, short), that a spike never explores, and that the brain spot-checks a few cited URLs at review since the gate makes no network call.
- `CHANGELOG.md`: under `## Unreleased` (make it above `## 0.9.61` when absent), `### Added`: one bullet for spike cards and the findings gate, naming `(MOD-372, MOD-373)`.

### 8. Tests

- `tests/node/spikecard.node.mjs` (new, the red test): `spikeOf`; each `spikeRefusal` line; `renderHeader` for a spike (fields present, order) and for a build card (unchanged); `renderBrief` keeps the spike section only for a spike and leaves no marker; `cardKind` with `purpose: spike` over a `kind:`; `explorePlan` never explores a spike; `cardFromFields` for a spike (frontmatter, `## Questions`, scope and gate defaults) and each error.
- An engine test that `/dispatch` refuses a spike card with no `findings:` before writing a brief.

## Left to you

- Fixture texts, test names, where in `dispatch.ts` the new functions sit.
- The guide's wording, inside §7.

## Done when

- A spike card written by hand per §1 or by the card tool dispatches with `purpose=spike findings=… [sources=…] [verdicts=…]` in its header and the spike rules in its brief; a build card's header, brief and card text are unchanged.
- Each malformed spike of §2 is refused at dispatch with its line, and no brief is written.
- `cardKind` reads a spike as `spike` and `explorePlan` never explores one.
- The guide has `### Spike cards`, the changelog has its bullet, and gate validate, node and test are green.

## Review

Brain review (Opus 5.5): Built as designed. spikeOf and spikeRefusal give the nine rules in order and reuse the verifier's pathMatchesAny. The header adds purpose=spike plus findings, sources and verdicts after allow=, and a build card's header is unchanged. The {{#spike}} section uses the same keep() as the red section. The refusal sits right after the MOD-366 advisor check. cardKind reads spike before kind:, and explorePlan skips it. The card tool lets findings through the gateMap check and defaults gate to findings. The worker's choices are sound, including leaving the NewCard cardKind call alone. Nit, not blocking: cardFromFields adds findings to scope and refuses lanes only when input.purpose is exactly 'spike'. The later check lowercases, so purpose 'Spike' passes validation but skips the scope add and the lane refusal. Fold this into a later card.
