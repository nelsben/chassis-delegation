---
id: MOD-351
title: A scope or forbid glob that needs a folder at **/ and so misses the files directly in the folder is said at card time, with the entry to add
domain: mod
tier: standard
status: merged
scope: [hooks/lib/card.ts, hooks/register.ts, tests/node/globgap.node.mjs, tests/card.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/guide.md, docs/internals.md, docs/cards/lessons/mod.md, CHANGELOG.md]
forbid: [hooks/lib/verify-native.ts, hooks/lib/norepo.ts, .claude-plugin/**, bin/**]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/globgap.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 8
---
## Why

In a repo path this mod matches globs by the shell `case` rule: `*` crosses folders and `**` is the same as `*`. So `tests/**/*.test.ts` means "tests/, anything, a slash, anything, .test.ts": it needs a folder between, and it does not match `tests/card.test.ts`. Most tools read `**/` as "zero or more folders", so a card author writes `tests/**/*.test.ts` and believes every test is in scope (or, in forbid, that every one is fenced). The worker then meets a refuted hand-back or a held amend for a file the author thought was covered. This card says it when the card is written, with the entry that closes the gap. Nothing is refused and the matcher does not change.

## Before you start

- `hooks/lib/verify-native.ts`: `globMatches` (the matcher; read only, it is forbidden).
- `hooks/lib/card.ts`: `isAbsoluteGlob`, `redTestWarnings`, `forbidCollisions` (the shape of a pure warning helper here).
- `hooks/register.ts`: the block that pushes card warnings (search `MOD-55: a path the red_test names that the scope leaves out`).
- `tests/node/redplaceholder.node.mjs` (a node test of a warning helper) and, in `tests/card.test.ts`, a test that expects `which is outside scope` in the card tool's text.
- `docs/guide.md`: the list under `Glob rules for \`scope\` and \`forbid\``.

## Design (decided by the brain; build it, do not redesign it)

### 1. One pure function in `hooks/lib/card.ts`

```ts
/** MOD-351 … */
export function globGapWarnings(scope: readonly string[], forbid: readonly string[]): string[]
```

For each list in the order scope, forbid, and each entry in list order:

1. Skip an empty entry and an absolute entry (`isAbsoluteGlob`): outside the repo `**/` already matches zero folders.
2. The **fill** is the entry with a leading `**/` removed and then every `/**/` replaced by `/`. When the fill equals the entry, there is no gap: skip.
3. Skip when another entry of the same list (any entry other than this one, empties ignored) equals the fill or matches it as text: `globMatches(fill, other)`. The author already closed the gap.
4. Otherwise push exactly:

   `warning: <list> <entry> needs a folder at every **/ here, so it misses <fill>: add <fill> to the <list>`

   where `<list>` is `scope` or `forbid`.

One line per entry at most; the same entry twice in a list gives one line. The function reads no file and no config.

Worked cases (these are the node tests):

| scope | forbid | result |
|---|---|---|
| `tests/**/*.test.ts` | | one line: scope, fill `tests/*.test.ts` |
| `tests/**/*.test.ts`, `tests/*.test.ts` | | none |
| `tests/**/*.test.ts`, `tests/**` | | none (`tests/**` matches the fill) |
| `**/index.ts` | | one line, fill `index.ts` |
| `a/**/b/**/c.ts` | | one line, fill `a/b/c.ts` |
| `src/**`, `src/*.ts`, `docs/` | | none |
| `~/out/**/x.md`, `/abs/**/x.md` | | none |
| `hooks/lib/a.ts` | `docs/**/secret.md` | one line: forbid, fill `docs/secret.md` |
| `tests/**/x.ts` | `tests/**/x.ts` | two lines, scope first |
| `tests/**/x.ts`, `tests/**/x.ts` | | one line |

### 2. Wiring in `hooks/register.ts`

In the block that pushes the card warnings, straight after the `redTestWarnings` loop, push each line of `globGapWarnings(<the shown scope>, shownForbid)` as `   ${line}` (three spaces, as its neighbours). Use the same scope expression the `redTestWarnings` call uses. No other change to `register.ts`.

### 3. Tests

- `tests/node/globgap.node.mjs` (new): one `MOD-351` describe with the worked cases above, each asserting the exact lines with `toEqual`.
- `tests/card.test.ts`: one engine test under a `MOD-351` describe: a card tool call whose scope is `['tests/**/*.test.ts']` returns text that contains `warning: scope tests/**/*.test.ts needs a folder at every **/ here, so it misses tests/*.test.ts: add tests/*.test.ts to the scope`, and the card file is still written.
- An existing test that pins the whole text of a card or dispatch reply and uses a `/**/` or leading `**/` entry will now see the new line: update that expectation, never the fixture's scope.

### 4. Docs

- `docs/guide.md`, in the glob rules list, extend the first bullet or add one after it: `dir/**/x` needs a folder between and does not match `dir/x`; write `dir/*x` or add `dir/x`; the card tool and dispatch warn.
- `docs/internals.md`: one MOD-351 line where the card warnings are described (beside the MOD-55 text when there is one; otherwise with the card tool).
- `docs/cards/lessons/mod.md`: append one line: `- In a repo path \`tests/**/x\` does not match \`tests/x\` (\`*\` crosses folders, so \`**/\` needs a folder): write \`tests/*.test.ts\`. (MOD-351)`. If the file would pass 40 lines, leave it and say so in the report.
- `CHANGELOG.md`, under `## Unreleased` → `### Added`: one bullet in the style of its neighbours, ending `(MOD-351)`.

## Left to you (list each as a `choice:` line)

- The doc comment on `globGapWarnings` and the wording of the docs lines.
- Whether the guide gains a new bullet or the first bullet is extended.

## Done when

- `globGapWarnings` is exported from `hooks/lib/card.ts` and returns exactly the lines of section 1 for every worked case; the node tests pass.
- The card tool and a dispatch dry run print the line for a repo scope or forbid entry with a gap, and print nothing new for a card without one; the engine test passes.
- No card is refused or rewritten because of the gap, and the matcher files are untouched.
- The guide, the internals notes, the lessons file and the changelog carry the lines of section 4.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: built to the Design. globGapWarnings is pure, skips absolute and empty entries, fills a leading and every inner double-star folder, and stays silent when another entry of the same list equals or matches the fill; the line is wired once after the red_test warnings, so the card tool and dispatch both print it; the matcher is untouched and nothing is refused. Worker choices accepted: the doc comment spells the double star in words (a literal one would close the block comment); a new guide bullet; a new hooks/lib/card.ts row in the internals table since no card-warnings text existed; an entry repeated in a list is deduplicated by exact text.
