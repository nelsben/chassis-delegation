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
