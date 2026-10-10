import { test, expect, describe } from 'claude-code/testing'
import { renderState, isEmptyState, compactBlock, appendInstructions, composeSection, emptySnapshot, owedRowsFrom, splitOwed, KEEP_VERBATIM, SECTION_ID, type StateSnapshot } from '../hooks/lib/compaction'

// 2026-10-03 14:00Z
const AT = Date.UTC(2026, 9, 3, 14, 0)

const busy = (): StateSnapshot => ({
  ...emptySnapshot(),
  running: [{ task: 'BE-101', tier: 'frontier', agentId: 'agent-1', at: AT }],
  pending: [{ task: 'OPS-232', agentId: 'agent-2' }],
  recent: [
    { line: 'chassis-delegation: OPS-230 attempt 1/3 verified · sonnet · next=accept', at: AT },
    { line: 'chassis-delegation: OPS-231 attempt 1/3 refuted on scope (x) · sonnet · next=resume agent=agent-9', at: AT },
  ],
  queued: [{ task: 'FE-227', position: 1 }],
  owed: ['OPS-231: resume agent=agent-9'],
  debrief: { at: AT, agentId: 'agent-7', path: '/h/.claude/harness/debriefs/2026-10-03-x.json' },
  eval: { tier: 'T1', sha: 'abcdef1234567890', pass: 61, total: 63, at: AT },
  prs: ['#926'],
})

describe('the delegation state', () => {
  test('nothing running, pending, queued or owed is empty, whatever the history says', () => {
    expect(isEmptyState(emptySnapshot())).toBe(true)
    expect(isEmptyState({ ...emptySnapshot(), recent: busy().recent, debrief: busy().debrief, eval: busy().eval })).toBe(true)
    expect(isEmptyState(busy())).toBe(false)
    expect(isEmptyState({ ...emptySnapshot(), owed: ['T-1: respawn at frontier'] })).toBe(false)
  })

  test('renders each part as one line', () => {
    const lines = renderState(busy())
    expect(lines[0]).toBe('Delegation state (chassis-delegation):')
    expect(lines).toContain('- running: BE-101 frontier agent agent-1 since 2026-10-03 14:00Z')
    expect(lines).toContain('- pending verdict: OPS-232 agent agent-2')
    expect(lines).toContain('- queued: FE-227 (position 1)')
    expect(lines).toContain('- owed: OPS-231: resume agent=agent-9')
    expect(lines).toContain('- verdict: chassis-delegation: OPS-230 attempt 1/3 verified · sonnet · next=accept')
    expect(lines).toContain('- last debrief: 2026-10-03 14:00Z agent agent-7 — /h/.claude/harness/debriefs/2026-10-03-x.json')
    expect(lines).toContain('- last eval: T1 61/63 at abcdef12 (2026-10-03 14:00Z)')
    expect(lines).toContain('- PRs named in reports: #926')
  })

  test('MOD-12: a queued row a free slot waits for reads ready, the rest stay queued', () => {
    const s = { ...busy(), queued: [{ task: 'FE-227', position: 1, ready: 'ready: FE-227 — run its spawn block (/dispatch FE-227 prints it again)' }, { task: 'FE-228', position: 2 }] }
    const lines = renderState(s)
    expect(lines).toContain('- ready: FE-227 — run its spawn block (/dispatch FE-227 prints it again)')
    expect(lines).not.toContain('- queued: FE-227 (position 1)')
    expect(lines).toContain('- queued: FE-228 (position 2)')
  })

  test('at most 40 lines and the last 5 verdicts, however much there is', () => {
    const s = busy()
    s.running = Array.from({ length: 30 }, (_, i) => ({ task: `T-${i}`, tier: 'standard', agentId: `a-${i}`, at: AT }))
    s.recent = Array.from({ length: 30 }, (_, i) => ({ line: `v${i}`, at: AT }))
    const lines = renderState(s)
    expect(lines.length).toBeLessThanOrEqual(40)
    expect(lines.filter(l => l.startsWith('- verdict: '))).toEqual(['- verdict: v25', '- verdict: v26', '- verdict: v27', '- verdict: v28', '- verdict: v29'])
  })
})

describe('session.compact instructions', () => {
  test('KEEP VERBATIM, then the state block; appended to what was there', () => {
    expect(KEEP_VERBATIM).toBe(
      'KEEP VERBATIM: (1) the delegation state below; (2) the release recipe pointer (session scratchpad FOLDnn scripts); (3) the brief and report contracts `[[brief v=1 …]]` / `[[report v=1 …]]`; (4) every card held for Ben and every item owed by Ben.',
    )
    const block = compactBlock(busy(), '/s/scratchpad')
    expect(block.split('\n')[0]).toBe(KEEP_VERBATIM)
    expect(block).toContain('Release recipe: the FOLDnn scripts in /s/scratchpad')
    expect(block).toContain('- running: BE-101 frontier agent agent-1 since 2026-10-03 14:00Z')
    expect(compactBlock(emptySnapshot())).toContain('Delegation state (chassis-delegation): nothing running, nothing owed.')
    expect(appendInstructions('keep the plan', 'B')).toBe('keep the plan\nB')
    expect(appendInstructions(undefined, 'B')).toBe('\nB')
  })
})

describe('the prompt.compose section', () => {
  test('present only when the state is not empty, session-scoped, under the mod id', () => {
    expect(composeSection(emptySnapshot())).toBeUndefined()
    const section = composeSection(busy())
    expect(section?.id).toBe(SECTION_ID)
    expect(SECTION_ID).toBe('chassis-delegation:state')
    expect(section?.scope).toBe('session')
    expect(section?.text.split('\n')[0]).toBe('Delegation state (chassis-delegation):')
    expect((section?.text ?? '').split('\n').length).toBeLessThanOrEqual(40)
  })
})

describe('MOD-4: the block keeps the live rows in full and counts the rest', () => {
  const HOUR = 3600_000
  const NOW = AT + 100 * HOUR
  const row = (task: string, at: number, extra: object = {}) => ({ task, attempt: 1, verdict: 'refuted', line: `l ${task}`, at, owed: `${task}: resume`, ...extra })
  test('a retired task has no owed row', () => {
    const rows = owedRowsFrom([row('A-1', AT), row('A-2', AT)], new Set(), new Set(['A-1']))
    expect(rows.map(r => r.task)).toEqual(['A-2'])
  })
  test('owed rows not yet checked or younger than 24 hours are live; the checked old ones are counted', () => {
    const rows = [
      { task: 'A-1', text: 'A-1: resume', at: NOW - HOUR, checked: true },
      { task: 'A-2', text: 'A-2: respawn', at: NOW - 30 * HOUR },
      { task: 'A-3', text: 'A-3: check by hand', at: NOW - 30 * HOUR, checked: true },
      { task: 'A-4', text: 'A-4: resume', at: NOW - 48 * HOUR, checked: true },
    ]
    expect(splitOwed(rows, NOW)).toEqual({ live: ['A-1: resume', 'A-2: respawn'], older: ['A-3', 'A-4'] })
  })
  test('renderState prints the live owed rows, then one older-owed line; the cap holds', () => {
    const s = { ...emptySnapshot(), running: [{ task: 'B-1', tier: 'standard', agentId: 'a1' }], owed: ['A-1: resume'], owedOlder: ['A-3', 'A-4'] }
    const lines = renderState(s)
    expect(lines).toEqual(['Delegation state (chassis-delegation):', '- running: B-1 standard agent a1', '- owed: A-1: resume', '- 2 older owed rows: A-3, A-4'])
    expect(isEmptyState({ ...emptySnapshot(), owedOlder: ['A-3'] })).toBe(false)
    expect(renderState({ ...emptySnapshot(), owed: Array.from({ length: 60 }, (_, i) => `A-${i}: resume`), owedOlder: ['Z-1'] }).length).toBeLessThanOrEqual(40)
    expect(compactBlock(s)).toContain('- 2 older owed rows: A-3, A-4')
    expect(composeSection(s)?.text.split('\n').at(-1)).toBe('- 2 older owed rows: A-3, A-4')
  })
})
