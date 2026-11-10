// MOD-287: the card tool names the planned task a card with no issue overlaps (suggest), and refuses it under issueMatch require.
import { expect, describe } from 'claude-code/testing'
import { test, world, sessionStart, ROOT, SCRATCH } from './harness'

const TOOL = 'mcp__chassis-delegation__card'
const LANDED = `${ROOT}/.delegation/landed`
const CARD_FOLDER = `${ROOT}/agents/tasks`
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const landed = ['Export drops a row.', '', '## Scope', '', '```scope', 'src/export/a.ts', '```', '', 'type: task', 'parent: #9', 'issue: #12 https://github.com/acme/widgets/issues/12', ''].join('\n')
const given = {
  title: 'Fix the export row drop',
  why: 'Rows go missing on export.',
  doneWhen: ['export keeps every row'],
  scope: ['src/export/**'],
  redTest: 'npm test',
}

describe('MOD-287: the card tool and a planned task', () => {
  test('a card with no issue gets one line for the planned task its scope overlaps, with its parent', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' } }), [`${LANDED}/export-drops-a-row.md`]: landed },
      dirs: { [CARD_FOLDER]: ['README.md'], [LANDED]: ['export-drops-a-row.md'] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(w.files.has(`${CARD_FOLDER}/OPS-1-fix-the-export-row-drop.md`)).toBe(true)
    expect(out).toContain('planned task #12 "export drops a row" (under #9) overlaps this scope; pass issue: 12, parent: 9')
    expect(w.spawns).toHaveLength(0)
  })

  test('under issueMatch require the card tool refuses a card with no issue and writes nothing', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' }, issueMatch: 'require' }), [`${LANDED}/export-drops-a-row.md`]: landed },
      dirs: { [CARD_FOLDER]: ['README.md'], [LANDED]: ['export-drops-a-row.md'] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toBe('card refused: planned task #12 "export drops a row" (under #9) overlaps this scope; pass issue: 12 (or set issueMatch suggest)')
    expect(w.files.has(`${CARD_FOLDER}/OPS-1-fix-the-export-row-drop.md`)).toBe(false)
  })
})

// MOD-339: a planned task whose issue is closed is not suggested; the state of each candidate is read first, one gh view each.
const GIT_CFG = { [`${ROOT}/.git/config`]: '[remote "origin"]\n\turl = https://github.com/acme/widgets.git\n' }
const landedOf = (issue: number, paths: string[]) =>
  ['Export task.', '', '## Scope', '', '```scope', ...paths, '```', '', 'type: task', `issue: #${issue} https://github.com/acme/widgets/issues/${issue}`, ''].join('\n')
const planned = (issues: [number, string[]][]) => {
  const files: Record<string, string> = {}
  for (const [n, paths] of issues) files[`${LANDED}/export-task-${n}.md`] = landedOf(n, paths)
  return files
}
const stateOf = (states: Record<number, string>) => (argv: string[]) => {
  if (argv[0] !== 'gh' || argv[1] !== 'issue' || argv[2] !== 'view') return undefined
  const n = Number(argv[3])
  return n in states ? { exitCode: 0, stdout: JSON.stringify({ number: n, title: `T${n}`, state: states[n] }) } : { exitCode: 1, stdout: '', stderr: 'no such issue' }
}
const cardRun = (on: never, files: Record<string, string>, run: (argv: string[]) => unknown, require = false) =>
  world(on, {
    files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' }, ...(require ? { issueMatch: 'require' } : {}) }), ...GIT_CFG, ...files },
    dirs: { [CARD_FOLDER]: ['README.md'], [LANDED]: Object.keys(files).filter(f => f.startsWith(LANDED)).map(f => f.slice(LANDED.length + 1)) },
    store: { 'delegation.agentTypes': ['general-purpose'] },
    run: run as never,
  })

describe('MOD-339: a closed planned task is never suggested', () => {
  test('a candidate read as closed gets no hint line; the open one gets its line', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = cardRun(on as never, planned([[75, ['src/export/a.ts']], [58, ['src/export/a.ts']]]), stateOf({ 75: 'CLOSED', 58: 'OPEN' }))
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain('planned task #58 "export task" overlaps this scope; pass issue: 58')
    expect(out).not.toContain('#75')
    expect(w.files.has(`${CARD_FOLDER}/OPS-1-fix-the-export-row-drop.md`)).toBe(true)
  })

  test('with four closed candidates ahead by overlap, the open fifth is suggested', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    cardRun(on as never, planned([[1, ['src/export/a.ts', 'src/export/b.ts']], [2, ['src/export/a.ts', 'src/export/b.ts']], [3, ['src/export/a.ts', 'src/export/b.ts']], [4, ['src/export/a.ts', 'src/export/b.ts']], [5, ['src/export/a.ts']]]), stateOf({ 1: 'CLOSED', 2: 'CLOSED', 3: 'CLOSED', 4: 'CLOSED', 5: 'OPEN' }))
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain('planned task #5 "export task" overlaps this scope; pass issue: 5')
    expect(out).not.toMatch(/planned task #[1-4] /)
  })

  test('with gh failing for every view, the hints print as before', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    cardRun(on as never, planned([[12, ['src/export/a.ts']]]), () => ({ exitCode: 1, stdout: '', stderr: 'boom' }))
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain('planned task #12 "export task" overlaps this scope; pass issue: 12')
  })

  test('under issueMatch require a card whose only candidate is closed is written, not refused', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = cardRun(on as never, planned([[75, ['src/export/a.ts']]]), stateOf({ 75: 'CLOSED' }), true)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).not.toContain('card refused')
    expect(w.files.has(`${CARD_FOLDER}/OPS-1-fix-the-export-row-drop.md`)).toBe(true)
  })

  test('a card whose scope overlaps no planned task runs no gh issue view', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = cardRun(on as never, planned([[12, ['src/other/a.ts']]]), stateOf({ 12: 'OPEN' }))
    await $.session.start(sessionStart)
    await $.tool.call({ tool: TOOL, ...given } as never)
    expect(w.runs.some(r => r.argv[0] === 'gh' && r.argv[1] === 'issue' && r.argv[2] === 'view')).toBe(false)
  })
})

describe('MOD-350: an issue state read for the match is remembered', () => {
  const views = (w: { runs: { argv: string[] }[] }, n?: number) => w.runs.filter(r => r.argv[0] === 'gh' && r.argv[1] === 'issue' && r.argv[2] === 'view' && (n === undefined || r.argv[3] === String(n))).length
  test('two card calls over the same candidates run one view per candidate', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = cardRun(on as never, planned([[75, ['src/export/a.ts']], [58, ['src/export/a.ts']]]), stateOf({ 75: 'CLOSED', 58: 'OPEN' }))
    await $.session.start(sessionStart)
    await $.tool.call({ tool: TOOL, ...given } as never)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, title: 'Fix the export row drop again' } as never))
    expect(views(w)).toBe(2)
    expect(out).toContain('planned task #58 "export task" overlaps this scope; pass issue: 58')
    expect(out).not.toContain('#75')
  })

  test('a candidate whose view failed is read again on the next call', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = cardRun(on as never, planned([[75, ['src/export/a.ts']], [58, ['src/export/a.ts']]]), stateOf({ 58: 'OPEN' }))
    await $.session.start(sessionStart)
    await $.tool.call({ tool: TOOL, ...given } as never)
    const [first75, first58] = [views(w, 75), views(w, 58)]
    await $.tool.call({ tool: TOOL, ...given, title: 'Fix the export row drop again' } as never)
    expect(first58).toBe(1)
    expect(views(w, 75)).toBeGreaterThan(first75) // the failed read is tried again
    expect(views(w, 58)).toBe(1) // the read one is not
  })
})

// MOD-359: issueLink: a card with no issue gets a note (hint, the default) or is refused (require); release cards are exempt.
describe('MOD-359: issueLink in the card tool and dispatch', () => {
  const HINT = 'note: this card names no issue; pass issue: <n> so the Work view lists it under its parent (file one with the land tool, or set issueLink off)'
  const REFUSAL = 'this card names no issue (issueLink require); file one with the land tool and pass issue: <n>, or set issueLink hint'
  const DISPATCH = 'mcp__chassis-delegation__dispatch'
  const FILE = `${CARD_FOLDER}/OPS-1-fix-the-export-row-drop.md`
  const linkWorld = (on: never, link: string | undefined, files: Record<string, string> = {}) =>
    world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' }, ...(link !== undefined ? { issueLink: link } : {}) }), ...files },
      dirs: { [CARD_FOLDER]: ['README.md', ...Object.keys(files).map(f => f.slice(CARD_FOLDER.length + 1))] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
  const boardCard = (issue: boolean) =>
    ['---', 'id: OPS-9', 'title: The ninth', 'domain: ops', 'tier: standard', 'status: queued', ...(issue ? ['issue: 12'] : []), 'scope: [src/**]', 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A card.', ''].join('\n')
  const BOARD = `${CARD_FOLDER}/OPS-9-the-ninth.md`
  const O = { options: { briefDir: `${SCRATCH}/briefs` } }

  test('under the default a card with no issue is written and the reply carries the note once', O, async ($, on) => {
    const w = linkWorld(on as never, undefined)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(w.files.has(FILE)).toBe(true)
    expect(out.split(HINT).length - 1).toBe(1)
  })

  test('with an issue passed the reply has no note', O, async ($, on) => {
    const w = linkWorld(on as never, undefined)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, issue: 12 } as never))
    expect(w.files.has(FILE)).toBe(true)
    expect(out).not.toContain('names no issue')
  })

  test('under require the card tool refuses a card with no issue and writes nothing', O, async ($, on) => {
    const w = linkWorld(on as never, 'require')
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: TOOL, ...given } as never))).toBe(`card refused: ${REFUSAL}`)
    expect(w.files.has(FILE)).toBe(false)
  })

  test('under require a release card is written', O, async ($, on) => {
    const w = linkWorld(on as never, 'require')
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, title: 'Release 9.9.9: version bumped' } as never))
    expect(out).not.toContain('card refused')
    expect(out).not.toContain('names no issue')
    expect(w.files.has(`${CARD_FOLDER}/OPS-1-release-9-9-9-version-bumped.md`)).toBe(true)
  })

  test('under off nothing is said', O, async ($, on) => {
    const w = linkWorld(on as never, 'off')
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(w.files.has(FILE)).toBe(true)
    expect(out).not.toContain('names no issue')
  })

  test('under require /dispatch refuses a board card with no issue and not one with issue: 12', O, async ($, on) => {
    linkWorld(on as never, 'require', { [BOARD]: boardCard(false) })
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-9', dryRun: true } as never))).toBe(`/dispatch OPS-9: refused — ${REFUSAL}`)
  })

  test('under require /dispatch of a board card with issue: 12 is not refused and has no note', O, async ($, on) => {
    linkWorld(on as never, 'require', { [BOARD]: boardCard(true) })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-9', dryRun: true } as never))
    expect(out).not.toContain('refused')
    expect(out).not.toContain('names no issue')
  })

  test('under the default the dispatch dry run prints the note for a board card with no issue', O, async ($, on) => {
    linkWorld(on as never, undefined, { [BOARD]: boardCard(false) })
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-9', dryRun: true } as never))).toContain(HINT)
  })
})
