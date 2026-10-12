import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, stepInput, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-51: a wake held while the brain's turn is open is dropped at delivery when its task has moved on.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const GMW = { ...GM, wakeOnVerdict: true } // these tests are about the wake itself: it is on
const MB = 'b'.repeat(40)
const fullSha = (sha: string) => sha.padEnd(40, '0')
const mainEnd = () => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer' }) as never

/** A worker repo answered from memory: the gate exit and the origin/main ancestor answer are read afresh on every call. */
const repo = (o: { gate: () => number; ancestor: () => number }) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate(), stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = fullSha(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? o.ancestor() : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}

describe('MOD-51: a held verdict wake is dropped at delivery when its task has moved on', () => {
  test('(1) attempt 1 refuted while the turn is open, attempt 2 consistent in the same turn: only attempt 2 is submitted', { options: { ...GMW } }, async ($, on) => {
    let gate = 1
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => gate, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    gate = 0 // the brain amends the brief and respawns; the next attempt passes
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_02ABCDEFG' }))
    await $.turn.complete(turnInput('agent-2', 'Done.\n' + REPORT('5678abcd')))
    expect(w.submitted).toEqual([]) // both held
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('attempt 2')
    expect(w.submitted[0]?.text).not.toContain('refuted')
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 attempt 1 superseded by attempt 2'))).toBe(true)
  })

  test('(2) a consistent wake whose task is merged before the turn ends is not submitted', { options: { ...GMW } }, async ($, on) => {
    let ancestor = 1
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => ancestor }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    ancestor = 0 // the brain merges in this turn
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 merged before delivery'))).toBe(true)
  })

  test('(2b) MOD-60: a refuted wake whose sha is only an ancestor of origin/main is still delivered at the turn\'s end', { options: { ...GMW } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 1, ancestor: () => 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('refuted')
  })

  test('(3) a ready line is submitted alone when its verdict is dropped', { options: { ...GMW, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    let ancestor = 1
    const other = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard]]\nDo it.'
    const queued = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard]]\nDo it.'
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => ancestor }) })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: other, tool_use_id: 'toolu_B0000002' }))
    const q = await $.agent.spawn(spawnInput({ prompt: queued, tool_use_id: 'toolu_C0000009' }))
    expect(q.deny).toContain('queued: T-9')
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    ancestor = 0
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('ready: T-9')
    expect(w.submitted[0]?.text).not.toContain('refuted')
  })

  test('(4) a lone refuted wake still wakes the brain', { options: { ...GMW } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 1, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('refuted')
  })
})
describe('MOD-57: a held wake is dropped when the brain already messaged its worker', () => {
  const send = ($: any, to: string) => $.session.send({ to, text: 'carry on', origin: { kind: 'model' } } as never)

  test('(1) attempt 1 consistent while the turn is open, the brain resumes the worker in the same turn: no wake is submitted', { options: { ...GMW } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    await send($, 'agent-4')
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 attempt 1: the brain already messaged its worker'))).toBe(true)
  })

  test('(2) control: the message went to a different agent: the wake is submitted', { options: { ...GMW } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    await send($, 'agent-9')
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('attempt 1')
  })

  test('(3) a message sent before the wake was held does not drop it', { options: { ...GMW } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await send($, 'agent-4')
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
  })
})
describe('MOD-62: a held wake is dropped when a later main-loop step of the turn already read its row', () => {
  const step = async ($: any, agentId?: string) => {
    for await (const chunk of $.turn.step(stepInput(agentId))) void chunk
  }
  const setup = async ($: any, on: any, extra: Record<string, unknown> = {}) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }), agentId: 'agent-4', ...extra })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    return w
  }
  const verdict = ($: any, sha: string) => $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT(sha)))

  test('(1) held, then a main-loop step, then the turn ends: nothing is submitted, the skip is logged, the row was appended', { options: { ...GMW } }, async ($, on) => {
    const w = await setup($, on)
    await verdict($, '1234abcd')
    await step($)
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 read in the turn'))).toBe(true)
    expect(w.appended.some(a => a.text.includes('T-4'))).toBe(true)
  })

  test('(2) held and the turn ends with no step after it: it is submitted', { options: { ...GMW } }, async ($, on) => {
    const w = await setup($, on)
    await step($) // a step before the row does not count
    await verdict($, '1234abcd')
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('T-4')
  })

  test('(3) held and only a subagent step follows: it is submitted', { options: { ...GMW } }, async ($, on) => {
    const w = await setup($, on)
    await verdict($, '1234abcd')
    await step($, 'agent-9')
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
  })

  test('(4) two verdicts of different tasks, one held before a main-loop step and one after the last step: only the second is submitted', { options: { ...GMW } }, async ($, on) => {
    const BRIEF5 = `${SCRATCH}/briefs/T-5.brief.md`
    const REPORT5 = '[[report v=1 task=T-5 subtask=main branch=agent/frontend/T-5 pr=none sha=5678abcd gate=pass files=a/x.ts]]'
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody', [BRIEF5]: HEADER.replace('task=T-4', 'task=T-5') + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }) })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF5}.`, tool_use_id: 'toolu_B0000002' }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT('1234abcd')))
    await step($)
    await $.turn.complete(turnInput('agent-2', 'Done.\n' + REPORT5))
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('T-5')
    expect(w.submitted[0]?.text).not.toContain('T-4')
  })

  test('(5) a ready line held with its verdict, then a main-loop step: neither is submitted', { options: { ...GMW, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const queued = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard]]\nDo it.'
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }) })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard]]\nDo it.', tool_use_id: 'toolu_B0000002' }))
    const q = await $.agent.spawn(spawnInput({ prompt: queued, tool_use_id: 'toolu_C0000009' }))
    expect(q.deny).toContain('queued: T-9')
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT('1234abcd')))
    expect(w.appended.some(a => a.text.includes('ready: T-9'))).toBe(true)
    await step($)
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
  })
})
describe('MOD-64: wakes are off by default', () => {
  test('a background worker\'s hand-back with default options submits no wake, and its row is appended', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 0, ancestor: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    expect(w.appended.some(a => a.text.includes('T-4 attempt 1/3 consistent'))).toBe(true)
  })
})
void ROOT
