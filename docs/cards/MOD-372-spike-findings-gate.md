---
id: MOD-372
title: a built-in findings gate checks a spike's findings file at the sha (questions answered or marked unanswered, citations under the allowed sources, flags, verdicts, decisions), at verify and again at merge
domain: mod
tier: standard
status: merged
issue: 512
scope: [hooks/lib/spike.ts, hooks/lib/verify-native.ts, hooks/lib/brief.ts, hooks/register.ts, tests/node/spike.node.mjs, tests/node/verify-native.git.node.mjs, tests/merge.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts]
forbid: [bin/**, docs/**, hooks/lib/dispatch.ts, hooks/lib/explore.ts, hooks/lib/card.ts, hooks/templates/**, hooks/lib/gates.ts, hooks/lib/version.ts, .claude-plugin/plugin.json, README.md, CHANGELOG.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/spike.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

Research cards (spikes) hand back a findings file, not code. Today they run as build cards with `red_test: none` and a gate that checks nothing about the findings, so a consistent verdict says only that the scope held. This card adds the check: a gate id `findings`, run in-process by the verifier and by merge, that reads the findings file at the sha and holds it to the card's questions. The card side (the brief header fields, the dispatch refusals, the brief's spike rules, the card tool) is the next card, MOD-373; this card reads the header fields that card will write.

## Before you start

- `hooks/lib/verify-native.ts`: `BriefContract` and `briefContract`; in `verifyNative`, the `claim` helper, `out`, `full`, `here`, and section 5 (search `// 5. the gate`) to the end of the `gateTree` block.
- `hooks/lib/brief.ts`: `BRIEF_FIELDS`, `parseFields`, `parseHeader`.
- `hooks/lib/gates.ts`: `gateForDelta`, `resolveGateRuns` (read only; this card does not change it).
- `hooks/register.ts`: the merge gate loop (search `MOD-122: a branch that changes no file runs gateMap._empty`), `reusableGates`, and how `card` is parsed there (`parseCard`).
- `hooks/lib/dispatch.ts`: `parseCard` and its `asList` (read only), for the card fields merge reads.
- `tests/node/verify-native.git.node.mjs` (how a real repo, a brief and a report are set up) and `tests/merge.test.ts` (search `gate reused`).

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, new `hooks/lib/spike.ts` (no host calls; head comment `MOD-372 (#512)`)

```ts
export const FINDINGS_GATE = 'findings'
export type SpikeQuestion = { n: number; text: string; verdict: boolean }
export function spikeQuestions(text: string): { questions: SpikeQuestion[] } | { error: string }
export function sourceAllowed(url: string, sources: readonly string[]): boolean
export type FindingsInput = { text: string | undefined; path: string; questions: readonly SpikeQuestion[]; sources: readonly string[]; verdicts: readonly string[] }
export type FindingsCheck = { ok: boolean; problems: string[]; summary: string }
export function findingsCheck(i: FindingsInput): FindingsCheck
export function splitFindingsGate(gate: string | undefined, findings: string | undefined): { builtin: boolean; rest: string | undefined }
```

**`spikeQuestions(text)`**: the text is a card body or a whole brief. Start after the first line that is exactly `## The card` when there is one, else at the top. Find the first line matching `^##\s+Questions\s*$`. Its lines run to the next line matching `^#{1,2}\s`. Each line matching `^\s*(\d+)[.)]\s+(.+?)\s*$` is a question; other lines (blank, prose, sub-bullets) are skipped. `verdict` is true when the question text ends with `(verdict)` (case-insensitive); `text` keeps the words as written. The numbers must run 1, 2, … N in order, else `{ error: 'the Questions are numbered <list as found>, not 1 to <N>' }`. No `## Questions` heading, or one with no numbered line: `{ error: 'the card has no ## Questions list' }`.

**The findings file grammar** (`findingsCheck`):

- A question section starts at a line matching `^#{2,3}\s+Q(\d+)\b` and runs to the next line matching `^#{1,3}\s`.
- The decisions section starts at a line matching `^##\s+Decisions this implies\s*$` (case-insensitive) and runs to the next line matching `^#{1,2}\s`.
- A marker line: take the line, trim it, strip a leading `- `, then strip leading and trailing `*` and `_`. The line is `Unanswered:` when it then starts with `Unanswered:` and has text after the colon (case-insensitive). It is `Verdict: <word>` the same way; the word is the first word after the colon, lowercased, with trailing `.,;:` stripped. Markup between the colon and the word (`**Verdict:** adopt`) counts: strip `*` and `_` from the part after the colon too.
- A URL is `https?://` followed by characters other than whitespace, `)`, `>`, `]`, `"`, `'` and backtick; then strip trailing `.,;:`.
- A path citation is a token `<path>:<line>` where path is `[\w.-]+(?:/[\w.-]+)*\.\w+`, line is digits, optionally `-<digits>`, and the token starts the line or follows whitespace, `(`, `[` or a backtick. A URL never counts as a path citation.
- A citation is a URL or a path citation.

**Problems**, in this order (each a line; `ok` is `problems.length === 0`):

1. `text === undefined`: the one problem `findings file <path> not found` and stop.
2. Text that is empty after trim: the one problem `findings file <path> is empty` and stop.
3. For each card question n with no section: `Q<n> has no section`. A second section for the same n: `Q<n> has two sections`. A section whose n is no card question: `Q<n> is not a card question`.
4. For each question whose section has no `Unanswered:` line:
   - no citation in the section: `Q<n> cites nothing (a URL or path:line) and is not marked Unanswered:`;
   - when `verdict` is true and the section has no `Verdict:` line: `Q<n> asks for a verdict and has none`;
   - when `verdict` is true, `verdicts` is not empty, and the word is not one of them (compared lowercased): `Q<n> verdict '<word>' is not one of <verdicts joined by ', '>`.
   A section marked `Unanswered:` needs no citation and no verdict.
5. When `sources` is not empty: each distinct URL in the whole file, in order of first appearance, that `sourceAllowed` refuses: `<url> is not under an allowed source (<sources joined by ', '>)`. At most 5 such lines; when more, one line `+<k> more URLs outside the allowed sources`.
6. Each line holding `⚠` where some `⚠` in it is not followed by optional spaces, then `Unverified:` or `Conflict:`, then optional spaces and at least one non-space character: `line <1-based line number>: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text>`.
7. No decisions section: `no ## Decisions this implies section`. One with no line matching `^\s*[-*]\s+\S`: `## Decisions this implies has no item (write - none when it implies none)`.

**`summary`**: `<path>: <N> question(s), <a> answered, <u> unanswered, <c> citation(s), <f> flag(s)` where N is the card's question count, a and u count the sections found (u = marked `Unanswered:`), c counts citations in the whole file (distinct URLs plus path citations, each occurrence of a path citation counted), f counts well-formed flags. Singular when the count is 1.

**`sourceAllowed(url, sources)`**: an empty `sources` allows everything. Parse the URL with the regex `^https?://([^/?#:]+)(?::\d+)?([^?#]*)`; no match: refused. Host lowercased, a leading `www.` dropped; path as written, trailing `/` dropped. Each source: lowercased, a leading `http://` or `https://` dropped, a leading `www.` dropped, trailing `/` dropped; the part before the first `/` is its host, the rest (with its leading `/`) its path, or no path. A source allows the URL when the URL host equals the source host or ends with `.` + source host, and, when the source has a path, the URL path equals it or starts with it + `/`. No `URL` global: the engine module has none.

**`splitFindingsGate(gate, findings)`**: the gate ids are `gate` split on `,`, trimmed, empties dropped. `builtin` is true only when `findings` is a non-empty string and the ids include `findings`; then `rest` is the other ids joined by `,` (undefined when none). Otherwise `builtin` is false and `rest` is `gate` unchanged. So a repo whose gateMap has its own `findings` id keeps it on every brief without `findings=`.

### 2. `hooks/lib/brief.ts`

`BRIEF_FIELDS` gains `'findings'`, `'sources'`, `'verdicts'` (after `'allow'`). Nothing else changes there.

### 3. `hooks/lib/verify-native.ts`

- `BriefContract`'s ok shape gains `findings?: string; sources: string[]; verdicts: string[]`: `findings` from the header's `findings=` trimmed (absent when empty), `sources` and `verdicts` its `csv` of `sources=` and `verdicts=` (`[]` when absent). Every ok return sets them, the amend-malformed one too. `CARDLESS_CONTRACT` gets `sources: [], verdicts: []`.
- In section 5, before `gateForDelta`: `const split = cardless ? { builtin: false, rest: contract.gate } : splitFindingsGate(contract.gate, contract.findings)`. `gateForDelta`, `resolveGateRuns` and `gateIdOf` take `split.rest` where they took `contract.gate`. When `split.builtin` is true and `split.rest` is undefined, the `no gate command available` claim is not made (`gates.none` is ignored).
- When `split.builtin` is true, the findings gate runs first, before the gate runs, and makes one `gate` claim:
  - `contract.findings` starts with `/`, or has a `..` segment: `claim('gate', 'unchecked', 'findings gate not run: findings= must be a path inside the repo')`.
  - `spikeQuestions(input.briefText)` is an error: `claim('gate', 'unchecked', \`findings gate not run: ${error}\`)`.
  - Not `here` and no `full` sha: `claim('gate', 'unchecked', 'findings gate not run: sha missing')`.
  - Else read the text: not `here`, `await out('show', \`${full}:${contract.findings}\`)` (undefined when git fails: the file is not at the sha); `here`, `io.readRed` of `${repo}/${contract.findings}` (its `text` when `exists`; undefined when it does not exist; no `readRed`: `claim('gate', 'unchecked', 'findings gate not run: the verifier has no file reader')`).
  - Judge `findingsCheck({ text, path: contract.findings, questions, sources: contract.sources, verdicts: contract.verdicts })` against the report's `gate`, with `at` as section 5 writes it (`at <sha>` or `in the shared checkout <repo>`):
    - `pass`, ok: `claim('gate', 'held', \`findings gate green ${at}: ${summary}\`)`;
    - `pass`, not ok: `claim('gate', 'failed', \`gate=pass claimed but the findings gate is RED ${at}: ${problems.length} problem(s)\`)`, then each problem as a line `  - <problem>`;
    - `fail`, not ok: `claim('gate', 'held', \`gate=fail confirmed (findings gate red ${at}: ${problems.length} problem(s)) — an honest terminal state\`)`, then the problem lines;
    - `fail`, ok: `claim('gate', 'unchecked', 'gate=fail claimed but the findings gate is green — not a refutation, recorded')`;
    - any other value: `claim('gate', 'unchecked', \`report gate='<value>' is not pass|fail\`)`.
- `gateTree`: when the findings gate held under `pass`, not `here`, and HEAD read now equals `full`, `gateTree.findings` is set to `HEAD^{tree}` the way the existing block sets it (create the record when the gate runs left it undefined; keep the other ids).

### 4. `hooks/register.ts`, the merge gate loop

- The loop's id list is built as today. When an id is `FINDINGS_GATE` and the card's `findings` field (`asText`-style string of `card.fields.findings`, trimmed) is not empty, that id is the built-in, not a gateMap id:
  - `reusable.get('findings')` set: the same `gate reused` line and result as any reused gate.
  - Else read `${wt.path}/${findings}` with `$.fs.read` (a throw reads as undefined), run `findingsCheck` with `spikeQuestions(card.body)` (an error: the merge stops, `${id}: gate findings not run at ${short} (${error}); not pushed`), `sources` and `verdicts` from `card.fields.sources` / `card.fields.verdicts` as lists (a YAML list or a comma string, entries trimmed, empties dropped).
  - Log `## findings: built-in`, then the summary when ok, else the problem lines. Not ok: write the log and return `${id}: gate findings failed at ${short}; not pushed` followed by the problem lines. Ok: push `{ id: 'findings', label: 'findings (built-in)', ok: true }`.
- The `_empty` swap is untouched.

### 5. Tests

- `tests/node/spike.node.mjs` (new, the red test): `spikeQuestions` (a card body; a whole brief where only the card's `## Questions` counts; `(verdict)`; misnumbered; missing); `sourceAllowed` (host, subdomain, `www.`, host+path prefix, a path that only shares a prefix such as `/anthropics-x`, empty sources, a non-URL); `findingsCheck`, one test per problem line above and one clean file that passes with the exact summary; `splitFindingsGate` (no findings=, findings alone, findings with node).
- `tests/node/verify-native.git.node.mjs`, a `MOD-372` describe on a real repo: a committed clean findings file under `gate=findings`: consistent with the held line; a bad one under `gate=pass`: refuted, the problem lines shown; the file absent at the sha: refuted with `not found`; `gate=findings,<id>` where the map has the other id: both claims made; a gateMap with its own `findings` id and no `findings=` in the brief: the map's command runs.
- The merge path: one test in `tests/merge.test.ts` that a spike card's merge runs the built-in (a bad findings file stops the merge with `gate findings failed`); put the rest of the logic in node tests.

## Left to you

- The test fixture texts and test names.
- Where in `spike.ts` the regexes live and how the file is split into sections, as long as the grammar above holds.

## Done when

- `hooks/lib/spike.ts` exports the five names above with the behaviour above, and `tests/node/spike.node.mjs` covers each problem line, the summary, `sourceAllowed` and `splitFindingsGate`.
- A brief with `findings=` and `gate=findings` gets one `gate` claim from the built-in check at the sha, never `gate not re-run: findings (not in gateMap)`; a brief without `findings=` is verified exactly as before.
- A spike card's merge runs the built-in check or reuses the verify pass, and a failing findings file stops the merge.
- `gates.ts`, `dispatch.ts` and the brief template are unchanged; gate validate, node and test are green.

## Review

Brain review (Opus 5.5): built as designed. spike.ts follows the grammar (sections, markers, URL and path citations, sources by host and path prefix with no URL global, flag forms, decisions). The verifier runs the built-in first and judges it against gate=pass|fail like the other gates, passes only the other ids to gateForDelta/resolveGateRuns, skips the no-gate claim when findings is the only id, and records gateTree.findings when HEAD is still the sha. Merge reuses that pass, else reads the file in the worktree and stops on problems. A brief without findings= is unchanged (splitFindingsGate returns the gate as given). The worker found what the design missed: the git allowlist refused `show <sha>:<path>` outside card files, so every verify would have read "not found". Granted hooks/lib/allow.ts for one read-only shape (a full 40-64 hex sha, a repo path, no `..`, not starting with - or /). Choices are reasonable; the case-sensitive ⚠ labels match the brief's wording.
