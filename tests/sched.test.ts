// MOD-252: loadThrottle. On a loaded machine the queue starts fewer workers at once: the effective slot count is
// max(1, floor(slots / 2)); a claim beyond it is held; a running worker is never touched.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput } from './harness'

const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard model=sonnet]]\nDo it.`
const id = (n: number) => `toolu_${'ABCDEFGH'[n]}000000${n}`
const HELD = 'held: machine loaded (20/10)'
const loadRun = (load: { v: string }) => async (argv: string[]) => (argv[0] === 'sysctl' ? { exitCode: 0, stdout: `{ ${load.v} 0.00 0.00 }\n10\n` } : undefined)
const sysctls = (w: { runs: { argv: string[] }[] }) => w.runs.filter(r => r.argv[0] === 'sysctl' || r.argv[0] === 'nproc').length

describe('MOD-252: loadThrottle', () => {
  test('on, slots 3, load 2x the cores: the third claim is held; the first two start', { options: { maxWorkers: 3, loadThrottle: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '20.00' }) })
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))).deny).toBeUndefined()
    const second = await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: id(1) }))
    expect(second.deny).toContain(HELD)
    expect(w.spawns).toHaveLength(1)
  })

  test('on, slots 4: two start, the third is held with the line', { options: { maxWorkers: 4, loadThrottle: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '20.00' }) })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: id(1) }))).deny).toBeUndefined()
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: id(2) }))
    expect(third.deny).toContain(HELD)
    expect(third.deny).toMatch(/^queued: T-3/)
    expect(w.spawns).toHaveLength(2)
  })

  test('off (the default): the same claim is granted and the load is never read', { options: { maxWorkers: 3 } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '20.00' }) })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: id(1) }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: id(2) }))
    expect(third.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
    expect(sysctls(w)).toBe(0)
  })

  test('on but the machine is not loaded: granted', { options: { maxWorkers: 3, loadThrottle: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '19.90' }) })
    for (let n = 0; n < 3; n++) expect((await $.agent.spawn(spawnInput({ prompt: brief(`T-${n + 1}`), tool_use_id: id(n) }))).deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
  })

  test('the floor: slots 1 is never held, however loaded', { options: { maxWorkers: 1, loadThrottle: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '90.00' }) })
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))).deny).toBeUndefined()
    expect(w.spawns).toHaveLength(1)
  })

  test('slots 2 under load: floor(2/2) = 1, the first starts, the second is held', { options: { maxWorkers: 2, loadThrottle: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: loadRun({ v: '20.00' }) })
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))).deny).toBeUndefined()
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: id(1) }))).deny).toContain(HELD)
    expect(w.spawns).toHaveLength(1)
  })

  test('a running worker is untouched when the load rises; the next claim is held; when it drops the held task starts', { options: { maxWorkers: 3, loadThrottle: true } }, async ($, on) => {
    const load = { v: '1.00' }
    const w = world(on, { listAgents: true, run: loadRun(load) })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: id(0) }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: id(1) }))
    load.v = '20.00'
    expect(w.agents.map(a => a.status)).toEqual(['running', 'running'])
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: id(2) }))
    expect(third.deny).toContain(HELD)
    expect(w.agents.map(a => a.status)).toEqual(['running', 'running'])
    load.v = '1.00'
    const again = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: id(3) }))
    expect(again.deny).toBeUndefined()
  })
})
