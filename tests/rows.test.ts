import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, sessionStart } from './harness'
import { handedBackRow, runningSection, startedRow } from '../hooks/lib/rows'

// MOD-74: what reached the brain as a row (the appended user row, or the transcript log line the kit keeps)
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const brief = (task: string, extra = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard budget=2-attempts${extra}]]\nDo it.`
const REPORT = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
const status = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never

describe('MOD-74: a row when a worker starts', () => {
  test('a briefed spawn posts `MOD-1 started · sonnet (standard) · attempt 1/2` at spawn', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('MOD-1') }))
    expect(delivered(w)).toContain('MOD-1 started · sonnet (standard) · attempt 1/2')
    expect(w.appended.length + w.logs.length).toBeGreaterThan(0)
  })

  test('an ad hoc spawn posts no started row', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: 'look around' }))
    expect(delivered(w)).not.toContain(' started · ')
  })

  test('a queued task that starts later says `started from queue`', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    const queued = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queued.deny).toContain('queued: T-9')
    expect(delivered(w)).not.toContain('T-9 started')
    w.agents[0]!.status = 'completed'
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(delivered(w)).toContain('T-9 started from queue · sonnet (standard) · attempt 1/2')
  })

  test('a message to a failed worker that records its resume says `resumed`', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-5') }))
    await $.turn.complete(turnInput('agent-1', 'I got stuck, no report.'))
    await $.session.send({ to: 'agent-1', text: 'try again', origin: { kind: 'model' } } as never)
    expect(delivered(w)).toContain('T-5 resumed · sonnet (standard) · attempt 2/2')
  })

  test('verdictVerbosity=silent posts neither the started nor the handed-back row; line posts both', { options: { verdictVerbosity: 'silent' } }, async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-6') }))
    await $.turn.complete(turnInput('agent-1', REPORT('T-6'), usage('claude-sonnet-5-5', 1000, 500)))
    expect(delivered(w)).not.toContain('T-6 started')
    expect(delivered(w)).not.toContain('T-6 handed back')
  })
})

describe('MOD-74: a row when a worker hands back', () => {
  test('the row carries the alias, elapsed minutes and the worker spend, before the verdict', { options: { verdictVerbosity: 'line' } }, async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-4') }))
    await w.clock.advance(7 * 60_000)
    await $.turn.complete(turnInput('agent-1', REPORT('T-4'), usage('claude-sonnet-5-5', 1_000_000, 100_000)))
    const text = delivered(w)
    expect(text).toMatch(/T-4 handed back · sonnet · 7 min · \$\d+\.\d\d · verifying/)
    expect(text.indexOf('T-4 handed back')).toBeLessThan(text.indexOf('T-4 attempt 1/2'))
  })

  test('one row per attempt, however many times the hand-back fires', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-4') }))
    await $.turn.complete(turnInput('agent-1', REPORT('T-4')))
    await $.turn.complete(turnInput('agent-1', REPORT('T-4'), undefined, 'turn-again'))
    expect(delivered(w).split('T-4 handed back').length).toBe(2)
  })

  test('the pure rows: `$?` while the spend is unknown', () => {
    expect(handedBackRow({ label: 'T-4', alias: 'opus', minutes: 12 })).toBe('chassis-delegation: T-4 handed back · opus · 12 min · $? · verifying')
    expect(handedBackRow({ label: 'T-4', alias: 'opus', minutes: 12, usd: 1.4 })).toContain('· 12 min · $1.40 · verifying')
    expect(startedRow({ label: 'T-4', alias: 'opus', tier: 'frontier', attempt: 2, budget: 3, kind: 'resumed' })).toBe('chassis-delegation: T-4 resumed · opus (frontier) · attempt 2/3')
  })
})

describe('MOD-74: the running: section of /delegation status', () => {
  test('one live, one verifying and one queued worker, then the brain, as the first lines', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true, model: 'claude-opus-4-7' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    w.agents[0]!.status = 'completed' // handed back, verdict still owed
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    await w.clock.advance(4 * 60_000)
    const out = String((await $.command.run(status)).text).split('\n')
    expect(out[0]).toBe('running:')
    expect(out.slice(1, 4)).toEqual([
      expect.stringMatching(/^T-1 · sonnet \(standard\) · running · 4 min · \$\d+\.\d\d$/),
      expect.stringMatching(/^T-2 · sonnet \(standard\) · verifying · 4 min · \$\d+\.\d\d$/),
      expect.stringMatching(/^T-9 · sonnet \(standard\) · queued · \d+ min · \$0\.00$/),
    ])
    expect(out[4]).toBe('brain: opus')
  })

  test('nothing live: `running: none · brain: <model>`; no model from the host: unknown', async ($, on) => {
    world(on, { model: 'claude-opus-4-7' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(status)).text)
    expect(out.split('\n')[0]).toBe('running: none · brain: opus')
    expect(runningSection([], undefined)).toEqual(['running: none · brain: unknown'])
  })
})
