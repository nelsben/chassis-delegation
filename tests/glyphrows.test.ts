import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, sessionStart } from './harness'

// MOD-78: the model glyph on the host's row (the spawn's description) and on every mod row
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const brief = (task: string, extra = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard budget=2-attempts${extra}]]\nDo it.`
const REPORT = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
const status = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never

describe('MOD-78: the host row', () => {
  test('a briefed spawn tiered to sonnet reaches the host as `🔵 <description>`; the started row carries the glyph before sonnet', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('MOD-1'), description: 'build the thing' }))
    expect(w.spawns[0]!.description).toBe('🔵 build the thing')
    expect(delivered(w)).toContain('MOD-1 started · 🔵 sonnet (standard) · attempt 1/2')
  })

  test('an ad hoc opus spawn reaches the host as `🟣 <description>`', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: 'look around', description: 'look around', model: 'opus' }))
    expect(w.spawns[0]!.model).toBe('opus')
    expect(w.spawns[0]!.description).toBe('🟣 look around')
  })

  test('a description that already starts with a known glyph is not prefixed again', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('MOD-2'), description: '🔵 already marked' }))
    expect(w.spawns[0]!.description).toBe('🔵 already marked')
  })

  test('modelGlyphs off leaves the description and every row bare', { options: { modelGlyphs: 'off' } }, async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('MOD-3'), description: 'plain' }))
    expect(w.spawns[0]!.description).toBe('plain')
    expect(delivered(w)).toContain('MOD-3 started · sonnet (standard) · attempt 1/2')
    await $.turn.complete(turnInput('agent-1', REPORT('MOD-3'), usage('claude-sonnet-5-5', 1000, 500)))
    expect(delivered(w)).toMatch(/MOD-3 handed back · sonnet · /)
    expect(delivered(w)).not.toMatch(/[🟢🔵🟣🟠⚪]/u)
  })
})

describe('MOD-78: a custom map', () => {
  test('sonnet=🟦 shows on the host row, the started row, the handed-back row, the verdict row and the status section', { options: { modelGlyphs: 'sonnet=🟦' } }, async ($, on) => {
    const w = world(on, { listAgents: true, model: 'claude-opus-4-7' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), description: 'go' }))
    expect(w.spawns[0]!.description).toBe('🟦 go')
    expect(delivered(w)).toContain('T-1 started · 🟦 sonnet (standard) · attempt 1/2')
    const out = String((await $.command.run(status)).text).split('\n')
    expect(out[1]).toMatch(/^T-1 · 🟦 sonnet \(standard\) · running/)
    expect(out[2]).toBe('brain: 🟣 opus')
    await $.turn.complete(turnInput('agent-1', REPORT('T-1'), usage('claude-sonnet-5-5', 1000, 500)))
    expect(delivered(w)).toMatch(/T-1 handed back · 🟦 sonnet · /)
    expect(delivered(w)).toMatch(/T-1 attempt 1\/2 .* · 🟦 sonnet/)
  })
})
