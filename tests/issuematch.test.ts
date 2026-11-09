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
