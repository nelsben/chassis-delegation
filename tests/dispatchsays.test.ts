// MOD-219: dispatch says what it holds. A path named only in red_test is read, so an outside one does not warn;
// a lane held by a tier cap says its position; a verdict whose gate was not re-run says so in the row.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, sessionStart } from './harness'
import { redTestWarnings } from '../hooks/lib/card'
import { verdictLine, gateNotRerun } from '../hooks/lib/verify'
import { gateForDelta } from '../hooks/lib/gates'

const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=frontier]]\nDo it.`

describe('MOD-219: a path only red_test names is read', () => {
  test('an absolute or home path in red_test warns nothing; a repo path outside scope still does', () => {
    expect(redTestWarnings('run /opt/validators/check.py against the output', ['hooks/lib/a.ts'], [])).toEqual([])
    expect(redTestWarnings('run ~/validators/check.py', ['hooks/lib/a.ts'], ['**'])).toEqual([])
    expect(redTestWarnings('a test in tests/verify.test.ts', ['hooks/lib/a.ts'], [])).toEqual(['warning: red_test names tests/verify.test.ts, which is outside scope'])
  })
})

describe('MOD-219: a lane held by a tier cap says its position', () => {
  test('frontier cap 2 and 4 dispatches: the third and fourth read position k of n', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await $.command.run({ command: 'delegation', args: 'config maxWorkers 6', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    await $.command.run({ command: 'delegation', args: 'config maxWorkersByTier frontier=2', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    const fourth = await $.agent.spawn(spawnInput({ prompt: brief('T-4'), tool_use_id: 'toolu_D0000004' }))
    expect(third.deny).toContain('queued: position 1 of 1 (frontier cap 2 running)')
    expect(fourth.deny).toContain('queued: position 2 of 2 (frontier cap 2 running)')
    expect(w.spawns).toHaveLength(2)
    const again = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_E0000003' }))
    expect(again.deny).toContain('queued: position 1 of 2 (frontier cap 2 running)')
  })
})

describe('MOD-222: a lane held by the total maxWorkers cap says its position', () => {
  test('maxWorkers 1, no tier caps, 3 dispatches: positions 1 of 2 and 2 of 2; a repeat shows its place', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await $.command.run({ command: 'delegation', args: 'config maxWorkers 1', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    const second = await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    expect(second.deny).toContain(' — queued: position 1 of 1 (maxWorkers 1 running)')
    expect(third.deny).toContain(' — queued: position 2 of 2 (maxWorkers 1 running)')
    expect(w.spawns).toHaveLength(1)
    const again = await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_D0000002' }))
    expect(again.deny).toMatch(/already queued since \d\d:\d\d \(position 1\).* — queued: position 1 of 2 \(maxWorkers 1 running\)$/)
  })
})

describe('MOD-219/236: a verdict says why its gate was not re-run', () => {
  const v = { verdict: 'consistent' as const, task: 'T-1', attempt: 1, budget: 2, next: 'accept' }
  test('the row carries the reason; a re-run gate does not', () => {
    expect(verdictLine({ ...v, gateNotRerun: 'gate not re-run (tree not at sha)' })).toContain(' · gate not re-run (tree not at sha) next=accept')
    expect(verdictLine(v)).not.toContain('gate not re-run')
    expect(verdictLine(v)).not.toContain('gate reused')
  })
  test('a recorded gate that was not re-run names its reason; the _empty swap does not', () => {
    expect(gateNotRerun(['claim gate: unchecked — gate not re-run: prettier (not in gateMap)'])).toBe('gate not re-run (not in gateMap)')
    expect(gateNotRerun(['claim gate: unchecked — tree not at sha: 1 uncommitted path in the worktree; the gate was not re-run'])).toBe('gate not re-run (tree not at sha)')
    expect(gateNotRerun(['claim gate: unchecked — gate not re-run: lint (gateMap command refused: a gate may not run sh)'])).toBe('gate not re-run (refused)')
    const line = gateForDelta('test', { test: 'npm test', fast: 'echo ok', _empty: 'fast' }, []).line
    expect(gateNotRerun([line as string])).toBeUndefined()
    expect(gateNotRerun(['claim gate: held — gate green at abc'])).toBeUndefined()
  })
})
