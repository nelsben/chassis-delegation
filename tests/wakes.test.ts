import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-51: a wake held while the brain's turn is open is dropped at delivery when its task has moved on.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
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
  test('(1) attempt 1 refuted while the turn is open, attempt 2 consistent in the same turn: only attempt 2 is submitted', { options: { ...GM } }, async ($, on) => {
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

  test('(2) a refuted wake whose task is accepted before the turn ends is not submitted', { options: { ...GM } }, async ($, on) => {
    let ancestor = 1
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 1, ancestor: () => ancestor }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toEqual([])
    ancestor = 0 // the brain merges in this turn
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 merged before delivery'))).toBe(true)
  })

  test('(3) a ready line is submitted alone when its verdict is dropped', { options: { ...GM, briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    let ancestor = 1
    const other = '[[brief v=1 task=T-5 subtask=main purpose=build tier=standard]]\nDo it.'
    const queued = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard]]\nDo it.'
    const w = world(on, { listAgents: true, files: { [BRIEF]: HEADER + '\nbody' }, run: repo({ gate: () => 1, ancestor: () => ancestor }) })
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

  test('(4) a lone refuted wake still wakes the brain', { options: { ...GM } }, async ($, on) => {
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
void ROOT
