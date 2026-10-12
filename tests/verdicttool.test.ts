import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, composeInput, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { openItemLines } from '../hooks/lib/dashboard'
import { parseVerdictTool, VERDICT_TOOL, VERDICT_TOOL_NAME } from '../hooks/lib/verdicttool'

// MOD-64: wakes are off by default; in the hand-back turn the brain waits for its verdict with the verdict tool.
const TOOL = VERDICT_TOOL_NAME
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const MB = 'b'.repeat(40)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

/** A worker repo answered from memory; `gateMs` is how long the gate takes on the test clock. */
const repo = (clock: { sleep: (ms: number) => Promise<void> }, gateMs = 0) => {
  let head = ''
  return async (argv: string[]): Promise<RunAnswer | undefined> => {
    if (argv[0] === 'npx') {
      if (gateMs > 0) await clock.sleep(gateMs)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = last.slice(0, -'^{commit}'.length).padEnd(40, '0')
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
const setup = (on: any, gateMs = 0, extra: Record<string, unknown> = {}) => {
  const slot: { sleep: (ms: number) => Promise<void> } = { sleep: async () => undefined }
  const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo(slot, gateMs), agentId: 'agent-4', ...extra })
  slot.sleep = ms => w.clock.sleep(ms)
  return w
}
const call = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: TOOL, ...input } as never)

describe('MOD-64: the verdict tool', () => {
  test('its spec and input', () => {
    expect(VERDICT_TOOL.name).toBe('verdict')
    expect(TOOL).toBe('mcp__chassis-delegation__verdict')
    expect(parseVerdictTool({ task: 'T-4' })).toEqual({ task: 'T-4', subtask: 'main', waitSeconds: 600 })
    expect(parseVerdictTool({ task: 'T-4', subtask: 'ui', waitSeconds: 30 })).toEqual({ task: 'T-4', subtask: 'ui', waitSeconds: 30 })
    expect(parseVerdictTool({ task: 'T-4', waitSeconds: 5000 })).toEqual({ task: 'T-4', subtask: 'main', waitSeconds: 900 })
    expect(parseVerdictTool({})).toEqual({ error: 'verdict: task is required (a task id such as BE-101)' })
    expect(parseVerdictTool({ task: 'T-4', waitSeconds: 'soon' })).toEqual({ error: 'verdict: waitSeconds must be a number' })
  })

  test('is registered at session.start beside dispatch and card', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    expect(w.tools).toContain('verdict')
    expect(w.tools.indexOf('verdict')).toBeLessThan(w.tools.indexOf('card'))
  })

  test('already judged: it returns at once with the verdict row exactly as posted', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const posted = w.appended.map(a => a.text).find(t => t.includes('T-4 attempt 1/3 consistent'))
    expect(posted).toBeDefined()
    expect(resultText(await call($, { task: 'T-4' }))).toBe(posted as string)
    expect(w.submitted).toEqual([])
  })

  test('called while the verifier is still running: it returns the verdict when it lands', { options: { ...GM } }, async ($, on) => {
    const w = setup(on, 12_000)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const done = $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const waiting = call($, { task: 'T-4' })
    let settled = false
    void waiting.then(() => (settled = true))
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    expect(settled).toBe(false)
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    await done
    const text = resultText(await waiting)
    expect(text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(text).toBe(w.appended.map(a => a.text).find(t => t.includes('consistent')))
  })

  test('still verifying at the timeout: the line says call it again', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const waiting = call($, { task: 'T-4', waitSeconds: 10 })
    for (let i = 0; i < 3; i++) await w.clock.advance(5000)
    expect(resultText(await waiting)).toBe('T-4: still verifying after 10s; call verdict again')
  })

  test('an unknown task says so', { options: { ...GM } }, async ($, on) => {
    setup(on)
    expect(resultText(await call($, { task: 'T-77' }))).toContain('T-77: no attempt recorded')
  })

  test('with wakes off the ready: line posted beside the verdict comes back with it', { options: { ...GM, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const other = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard]]\nDo it.'
    const queued = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard]]\nDo it.'
    const slot = { sleep: async (_ms: number) => undefined }
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody' }, run: repo(slot) })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: other, tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: queued, tool_use_id: 'toolu_C0000009' }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT))
    const text = resultText(await call($, { task: 'T-4' }))
    expect(text).toContain('T-4 attempt 1/3 consistent')
    expect(text).toContain('ready: T-9')
    expect(w.submitted).toEqual([])
  })
})

describe('MOD-64: the brain is told to use the verdict tool when wakes are off', () => {
  const files = { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const dispatch = ($: any) => $.tool.call({ tool: 'mcp__chassis-delegation__dispatch', task: 'BE-101', scope: 'app/**' } as never)
  const RULE = 'call the verdict tool with task=BE-101 in that turn, before ending it'

  test('the dispatch text under the spawn block carries the rule with wakes off, and not with wakes on', async ($, on) => {
    world(on, { files, dirs, run: () => undefined, store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
    await $.session.start(sessionStart)
    const text = resultText(await dispatch($))
    expect(text).toContain(RULE)
    expect(text.indexOf(RULE)).toBeGreaterThan(text.indexOf('The worker starts when you make this Agent call'))
  })

  test('with wakes on the dispatch text does not name the verdict tool', { options: { briefDir: `${SCRATCH}/briefs`, wakeOnVerdict: true } }, async ($, on) => {
    world(on, { files, dirs, run: () => undefined, store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
    await $.session.start(sessionStart)
    expect(resultText(await dispatch($))).not.toContain('verdict tool')
  })

  const posture = async ($: any) => String((await $.prompt.compose(composeInput(['Agent']))).sections.find((s: { id: string }) => s.id === 'chassis-delegation:state')?.text ?? '')

  test('the state section carries one posture line while a worker runs, with wakes off', { options: { ...GM } }, async ($, on) => {
    setup(on, 0, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const lines = (await posture($)).split('\n').filter(l => l.includes('verdict tool'))
    expect(lines).toHaveLength(1)
  })

  test('with wakes on the state section does not name the verdict tool', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    setup(on, 0, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    expect(await posture($)).not.toContain('verdict tool')
  })

  test('the dashboard says call the verdict tool when wakes are off, and the verdict lands on its own when on', async () => {
    const item = { kind: 'running', task: 'BE-1', tier: 'frontier', alias: 'opus', at: 0, phase: 'verifying' } as never
    expect(openItemLines([item], 65_000, true)).toEqual(['BE-1: verifying frontier/opus 01:05 — call the verdict tool with task=BE-1'])
    expect(openItemLines([item], 65_000, false)).toEqual(['BE-1: verifying frontier/opus 01:05 — the verdict lands on its own'])
  })
})
