// MOD-131 (#219): per-tier worker slots. maxWorkersByTier caps the briefed workers of each tier beside
// the maxWorkers total; the queue plans per tier; the queued deny and /delegation name the tier.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart } from './harness'

const cmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

const brief = (task: string, tier: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=${tier}]]\nDo it.`
const report = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
const userRows = (w: { appended: { type: string; text: string }[]; logs: string[] }) => [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].join('\n')
const OPTS = { options: { maxWorkers: 6, maxWorkersByTier: '{"frontier":2}' } }

describe('MOD-131: per-tier slots in the spawn hook', () => {
  test('two frontier workers live under {frontier: 2}: a third frontier spawn is queued naming the tier, a standard spawn starts', OPTS, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1', 'frontier'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2', 'frontier'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3', 'frontier'), tool_use_id: 'toolu_C0000003' }))
    expect(third.deny).toBe('queued: T-3 — the mod will tell you when a frontier slot frees (2 live: T-1, T-2; 1 queued: T-3)')
    const std = await $.agent.spawn(spawnInput({ prompt: brief('T-4', 'standard'), tool_use_id: 'toolu_D0000004' }))
    expect(std.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
    // asked again: it keeps its place and the line names the tier
    const again = await $.agent.spawn(spawnInput({ prompt: brief('T-3', 'frontier'), tool_use_id: 'toolu_E0000003' }))
    expect(again.deny).toMatch(/^queued: T-3 — the mod will tell you when a frontier slot frees; already queued since \d\d:\d\d \(position 1\)$/)
  })

  test('with the total full the deny is the unchanged one', { options: { maxWorkers: 2, maxWorkersByTier: '{"frontier":2}' } }, async ($, on) => {
    world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1', 'frontier'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2', 'frontier'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3', 'frontier'), tool_use_id: 'toolu_C0000003' }))
    expect(third.deny).toBe('queued: T-3 — the mod will tell you when a slot frees (2 live: T-1, T-2; 1 queued: T-3)')
  })

  test('a standard row queued behind two queued frontier rows is ready when a standard worker hands back while both frontier workers run', { options: { maxWorkers: 3, maxWorkersByTier: '{"frontier":2}' } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('F-1', 'frontier'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('F-2', 'frontier'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('S-1', 'standard'), tool_use_id: 'toolu_C0000003' }))
    await $.agent.spawn(spawnInput({ prompt: brief('F-3', 'frontier'), tool_use_id: 'toolu_D0000004' }))
    await $.agent.spawn(spawnInput({ prompt: brief('F-4', 'frontier'), tool_use_id: 'toolu_E0000005' }))
    await $.agent.spawn(spawnInput({ prompt: brief('S-2', 'standard'), tool_use_id: 'toolu_F0000006' }))
    expect(w.spawns).toHaveLength(3)
    await $.turn.complete(turnInput('agent-3', report('S-1')))
    const rows = userRows(w)
    expect(rows).toContain('ready: S-2 — run its spawn block')
    expect(rows).not.toContain('ready: F-3')
    expect(rows).not.toContain('ready: F-4')
  })
})

describe('MOD-131: /delegation names the tier caps', () => {
  test('max workers shows the total alone when the map is empty, and the tiers in ladder order when it is set', { options: { maxWorkers: 6, maxWorkersByTier: '{"frontier":2,"standard":5,"economy":5}' } }, async ($, on) => {
    world(on, {})
    await $.session.start(sessionStart)
    const status = String((await $.command.run(cmd('status'))).text)
    expect(status).toContain('max workers 6 (economy 5, standard 5, frontier 2)')
  })

  test('an empty map prints max workers as it always did', { options: { maxWorkers: 2 } }, async ($, on) => {
    world(on, {})
    await $.session.start(sessionStart)
    const status = String((await $.command.run(cmd('status'))).text)
    expect(status).toContain('max workers 2 ·')
  })
})
