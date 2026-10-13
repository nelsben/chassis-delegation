// MOD-73: every option, measured. One engine case per manifest userConfig field:
// the field is set through `/delegation config <field> <value>` with no /config rows
// for the mod (the host lists none, as in the VS Code extension), so the value lands
// in the user options file; the case then asserts a change in what the mod does.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, sessionStart } from './harness'

/** The manifest's maxWorkers entry as the loaded copy reads it (an engine test cannot read the file; the mod's own table names every field). */
const manifest = JSON.stringify({ userConfig: { maxWorkers: { type: 'number', title: 'Max workers', default: 0 } } })

const cfg = (args: string) => ({ command: 'delegation', args: `config ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const say = async ($: { command: { run: (e: never) => Promise<{ text?: unknown }> } }, args: string) => String((await $.command.run(cfg(args))).text)
const brief = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard${over}]]\nDo it.`

describe('MOD-73: each option, set with /delegation config, changes what the mod does', () => {
  test('maxWorkers: 3 lets a third briefed worker start at once (the built-in 2 queues it)', async ($, on) => {
    const w = world(on, { listAgents: true, manifest })
    await $.session.start(sessionStart)
    expect(await say($, 'maxWorkers 3')).toBe('maxWorkers = 3 (yours)')
    expect(await say($, '')).toContain('maxWorkers = 3 (yours)')
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    expect(third.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
  })
})
