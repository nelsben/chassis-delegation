---
id: MOD-359
title: A new option issueLink (off, hint, require; default hint): a card with no issue gets a note from the card tool and the dispatch dry run, or is refused under require; release cards and cards with no repo work are exempt; this repo sets require
domain: mod
tier: standard
status: merged
scope: [hooks/lib/issuematch.ts, hooks/lib/repoconfig.ts, hooks/lib/configtable.ts, hooks/register.ts, .claude-plugin/plugin.json, .chassis-delegation.json, tests/node/issuelink.node.mjs, tests/options.test.ts, tests/issuematch.test.ts, tests/card.test.ts, tests/*.test.ts, tests/node/*.node.mjs, tests/harness.ts, docs/configuration.md, docs/guide.md, CHANGELOG.md]
forbid: [bin/**, docs/cards/**, docs/mockups/**, hooks/lib/allow.ts, hooks/lib/version.ts, hooks/lib/work.ts, hooks/lib/workpane.tsx, README.md, docs/upgrading.md]
red_test: node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs tests/node/issuelink.node.mjs
gate: validate, node, test
budget: 2-attempts
spend: 10
---
## Why

The Work view (MOD-353) joins cards to issues through each card's `issue:` line. A card without one cannot be placed under its epic or feature and lands in the `No epic` group; in this repo 41 of about 384 cards carry the line. `issueMatch` (MOD-287) only speaks when a planned task overlaps the card's scope, so most cards with no issue get no word at all. This card adds a separate, plain rule: a card with no issue is told so (`hint`, the default) or refused (`require`), with two exemptions for cards that have no issue by nature.

## Before you start

- `hooks/lib/issuematch.ts`: `ISSUE_MATCH_MODES`, `issueMatchOf`, `refusalLine` (the shape to mirror).
- Every place `issueMatch` is declared; `issueLink` is declared beside each, the same way: `hooks/lib/repoconfig.ts` (the config type, `REPO_KEYS`, the parse `case`, the effective `pick`), `hooks/lib/configtable.ts` (its row), `.claude-plugin/plugin.json` (its `userConfig` entry), `hooks/register.ts` (the `cfg` type and where `issueMatch: eff.issueMatch` is set).
- `hooks/register.ts`, the two checks: in the card tool, search `MOD-287: a card with no issue is matched against the planned tasks; require refuses it before anything is written`; in dispatch, search `MOD-287: a card with no issue: require refuses it while a planned task overlaps its scope`, and the dry run's last line `plannedHits.map(p => plannedLine(p))`.
- `tests/node/issuematch.node.mjs`, `tests/issuematch.test.ts`, and in `tests/options.test.ts` the `issueMatch` lines (the tests to mirror).

## Design (decided by the brain; build it, do not redesign it)

### 1. Pure, in `hooks/lib/issuematch.ts` (append under a `// MOD-359` comment)

```ts
export const ISSUE_LINK_MODES = ['off', 'hint', 'require'] as const
export type IssueLinkMode = (typeof ISSUE_LINK_MODES)[number]
export function issueLinkOf(v: unknown): IssueLinkMode | undefined   // as issueMatchOf
export const ISSUE_LINK_HINT = 'note: this card names no issue; pass issue: <n> so the Work view lists it under its parent (file one with the land tool, or set issueLink off)'
export const ISSUE_LINK_REFUSAL = 'this card names no issue (issueLink require); file one with the land tool and pass issue: <n>, or set issueLink hint'
export function issueLinkExempt(c: { title: string; scope: readonly string[]; repo?: string }): boolean
export function issueLinkCheck(mode: IssueLinkMode, c: { title: string; scope: readonly string[]; repo?: string; hasIssue: boolean; lanes?: boolean; matched?: boolean }): { refuse?: string; hint?: string }
```

- `issueLinkExempt` is true when any of these holds:
  1. `repo` (trimmed, lower-cased) is `none`: the card does no repo work.
  2. `scope` has at least one non-empty entry and every non-empty entry starts with `/` or `~`: all its outputs sit outside the repo.
  3. the title, trimmed, matches `/^release v?\d+(\.\d+)+\b/i`: a release card (`Release 0.9.58: …`).
- `issueLinkCheck`, first match wins:
  1. `mode` is `off`, or `hasIssue`, or the card is exempt: `{}`.
  2. `mode` is `require`: `{ refuse: ISSUE_LINK_REFUSAL }`, or for a lanes call `{ refuse: ISSUE_LINK_LANES_REFUSAL }` (`'lanes cannot name an issue (issueLink require); cut one card per issue with issue: <n>, or set issueLink hint'`). A lanes call cannot carry an issue, and dispatch would refuse each lane's card anyway, so the card tool refuses it before anything is written (amended in review: the first design gave a lanes call the note, which wrote cards dispatch then refused).
  3. `matched` is true (the planned-task match already printed the issue to pass): `{}`.
  4. otherwise `{ hint: ISSUE_LINK_HINT }`.

### 2. The option

`issueLink`, a repo option, default `hint`, values `off`, `hint`, `require`, declared beside `issueMatch` in each place listed above and read the same way.

- `repoconfig.ts`: a bad value gives the error `issueLink<where>: needs off, hint or require (ignored)`; the value is kept in the parsed config under the rule the `issueMatch` case uses, with `hint` in the place of `suggest`.
- `configtable.ts`: the row after `issueMatch`'s: group `Checking the work`, summary `A card with no issue: off, hint (a note) or require (refused)`, a choice of the three, default `hint`.
- `.claude-plugin/plugin.json`: the entry after `issueMatch`'s, in the same shape: title `Issue link (off | hint | require)`; description: `What a card with no issue gets. hint (the default): the card tool and /dispatch's dry run add one note naming the way out, and the card is still written. require: the card tool and /dispatch refuse the card. off: nothing. A release card (its title starts "Release <version>"), a card with repo none and a card whose whole scope sits outside the repo are never asked for an issue. A lanes call cannot carry an issue, so require refuses it too unless its cards are exempt.` Nothing else in the file changes.

### 3. Wiring in `hooks/register.ts`

- **The card tool**, straight after the `issueMatch` `require` refusal and before the first file is written: for each card made, `issueLinkCheck(cfg.issueLink, { title, scope, repo, hasIssue: input.issue !== undefined, lanes: <the call gave lanes>, matched: <its matches list is not empty> })`, taking the title, scope and repo mode from the made card. The first `refuse` returns `card refused: <refuse>` and nothing is written. The hints: after the planned-task lines are pushed, push `ISSUE_LINK_HINT` once (one line however many cards asked for it).
- **Dispatch**, straight after the `issueMatch` `require` refusal: the same check for the card read from the board (`hasIssue` from `issueRef(card.fields.issue)`, `matched` from `plannedHits.length > 0`, the repo mode from the card's `repo:` field, no `lanes`). Not on a `replay`. A `refuse` returns `/dispatch <id>: refused — <refuse>`. A `hint` is printed by the dry run only, on the line after the planned-task lines.
- `verify=` and `amend=` calls are untouched.
- Use the config object the `issueMatch` check beside each uses.

### 4. This repo

`.chassis-delegation.json` gains, after the `ignore` pair, the two keys `"_issueLink": "Every card names its issue, so the Work view places it under its epic or feature; release cards and no-repo cards are exempt."` and `"issueLink": "require"`. Nothing else in the file changes.

### 5. Tests

- `tests/node/issuelink.node.mjs` (new, one `MOD-359` describe): `issueLinkOf` (the three values, case and spaces, a bad value); `issueLinkExempt` for `repo: none`, an all-absolute scope, a mixed scope (not exempt), an empty scope (not exempt), `Release 0.9.58: version bumped`, `release v1.2`, `Release notes page` (not exempt), `Prerelease 1.0` (not exempt); `issueLinkCheck` for every branch of section 1, with `toEqual`.
- `tests/options.test.ts`: beside the `issueMatch` lines: the default reads `issueLink = hint (default)`, a set to `require` reads back, the repo file's value is read, and a bad value gives the error line.
- An engine describe `MOD-359` (in `tests/issuematch.test.ts` or `tests/card.test.ts`, whichever has the fixtures): under the default the card tool's reply for a card with no issue contains `ISSUE_LINK_HINT` and the card file is written; with `issue` passed it does not contain it; under `require` the reply is `card refused: ` plus the refusal and no card file is written; under `require` a card titled `Release 9.9.9: version bumped` is written; under `require` a `/dispatch` of a board card with no issue is refused with the line, and of one with `issue: 12` is not; under `off` nothing is said.
- The default is `hint`, so an existing test that pins the **whole** text of a card-tool reply or of a dispatch dry run for a card with no issue now sees one more line. Update that expectation; never change a fixture to dodge the line. A test that only checks a part of the text is left alone.

### 6. Docs

- `docs/configuration.md`: a row for `issueLink` after `issueMatch`'s, in the table's style, saying the three values, the two lines, the exemptions and the lanes rule.
- `docs/guide.md`: in the adoption list, the step that begins `**Cut every card from its issue.**` gains one sentence: with `/delegation config issueLink require` a card with no `issue:` is refused, release and no-repo cards apart. In the `## Work` section, one sentence that a card with no issue is listed under `No epic` and that `issueLink` says so when the card is cut.
- `CHANGELOG.md`: when the file has no `## Unreleased` heading, add `## Unreleased` above the newest version heading; under `### Added` (add the heading when absent) one bullet in the style of its neighbours, ending `(MOD-359)`.

## Left to you (list each as a `choice:` line)

- Which engine test file takes the `MOD-359` describe, and its fixtures.
- The wording of the docs row and sentences and of the changelog bullet.

## Done when

- The exports of section 1 exist in `hooks/lib/issuematch.ts` and behave as written; the node tests pass.
- `issueLink` parses from the repo file and `/delegation config`, defaults to `hint`, and is listed in the config table and the manifest.
- The card tool and dispatch give the note, the refusal or nothing as sections 1 and 3 say; exempt cards are never noted or refused; a replay, a `verify=` and an `amend=` are untouched.
- This repo's config file sets `issueLink` to `require`.
- The docs and the changelog carry the lines of section 6.
- The gates `validate`, `node` and `test` pass.

## Review

Brain review: read the whole diff over both commits. issuematch.ts carries the modes, the two lines, issueLinkExempt (repo none, a scope that is all absolute or home paths, a title that starts Release <version>) and issueLinkCheck. The option is declared beside issueMatch in repoconfig.ts (type, keys, parse with the bad-value error, effective pick with default hint), configtable.ts, the manifest and the config read in register.ts. The card tool checks every made card before the first file is written and pushes the note once; dispatch checks after the issueMatch refusal, not on a replay, and prints the note in the dry run only; verify= and amend= branch off before the check. This repo's config sets require. One design change in review, raised by the worker: the first design gave a lanes call the note under require, which wrote cards that dispatch then refused; a resume changed it so require refuses a lanes call up front with its own line, exempt lanes apart, and the card text was amended to match. Worker choices accepted: the engine describe sits in tests/issuematch.test.ts; the option count in tests/configcmd.test.ts moved from 72 to 73. Known limit: a card cut before the option was set to require and dispatched again afterwards is refused until it names an issue or the option is set to hint. Approved by the owner on 2026-11-09 as a harness logic change.
