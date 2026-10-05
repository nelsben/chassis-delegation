import { test, expect, describe } from 'claude-code/testing'
import { renderState, isEmptyState, compactBlock, appendInstructions, composeSection, emptySnapshot, KEEP_VERBATIM, SECTION_ID, type StateSnapshot } from '../hooks/lib/compaction'

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
