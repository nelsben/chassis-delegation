import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, ROOT, SCRATCH, NOW, type RunAnswer, type World } from './harness'
import { mergeConfig, parseRepoConfig } from '../hooks/lib/repoconfig'
import { VERDICT_TOOL_NAME } from '../hooks/lib/verdicttool'

// MOD-229 (#323): the verifier's gate is a spawned child, so the host's 10-minute cap on one run
// never applies; the mod's own ceiling (gateTimeoutMinutes, 1 to 120, default 30) ends it. Every
// world here keeps the host's rule on $.process.run (hostCap): a run past its timeoutMs is refused.
const MIN = 60_000
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const header = (gate: string) => `[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=${gate} budget=3-attempts report=chassis.report.v1]]`
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const MB = 'b'.repeat(40)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const delivered = (w: World) => [...w.appended.map(a => a.text), ...w.logs].join('\n')

/** The worker repo from memory; the gate (npx or claude) takes `gateMs` on the test clock, and so does each `sleep`. */
const repo = (slot: { w?: World }, gateMs: number) => {
  let head = ''
  return async (argv: string[]): Promise<RunAnswer | undefined> => {
    const clock = (slot.w as World).clock
    if (argv[0] === 'sleep') {
      await clock.sleep(Number(argv[1]) * 1000)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] === 'npx' || argv[0] === 'claude') {
      await clock.sleep(gateMs)
      return { exitCode: 0, stdout: 'all green\n' }
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

type Setup = { gateMs: number; minutes?: number; gate?: 'prettier' | 'test'; store?: Record<string, unknown> }
const setup = (on: unknown, o: Setup): World => {
  const slot: { w?: World } = {}
  const repoFile = { gateMap: { prettier: 'npx prettier --check {files}', test: 'claude plugin test {worktree}' }, ...(o.minutes !== undefined ? { gateTimeoutMinutes: o.minutes } : {}) }
  const w = world(on as never, {
    files: { [BRIEF]: `${header(o.gate ?? 'prettier')}\nbody`, [REPO_FILE]: JSON.stringify(repoFile) },
    run: repo(slot, o.gateMs),
    agentId: 'agent-4',
    hostCap: true,
    ...(o.store ? { store: o.store } : {}),
  })
  slot.w = w
  return w
}

/** Hands back and lets the verifier run; the clock moves a minute at a time until the verdict lands (or `max` minutes pass). */
const handBack = async ($: any, w: World, max: number, at?: { minute: number; look: () => Promise<void> }) => {
  await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
  let done = false
  const judged = $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`)).then(() => (done = true))
  await w.clock.settle()
  let minutes = 0
  while (!done && minutes < max) {
    await w.clock.advance(MIN)
    minutes += 1
    if (at && minutes === at.minute) await at.look()
  }
  await w.clock.advance(1000)
  expect(done).toBe(true)
  await judged
  return minutes
}
const verdictNow = async ($: any) => resultText(await $.tool.call({ tool: VERDICT_TOOL_NAME, task: 'T-4', waitSeconds: 0 } as never))

describe('MOD-229: the gate is spawned, under the mod\'s own ceiling', () => {
  test('an 11-minute gate under gateTimeoutMinutes 30 passes: the verdict is consistent', async ($, on) => {
    const w = setup(on, { gateMs: 11 * MIN, minutes: 30 })
    await handBack($, w, 20)
    expect(delivered(w)).toContain('T-4 attempt 1/3 consistent')
    expect(delivered(w)).not.toContain('gateTimeoutMinutes')
    const gate = w.runs.find(r => r.argv[0] === 'npx')
    expect(gate?.spawned).toBe(true)
  })

  test('an 11-minute gate under the default ceiling (unset) passes and records consistent', async ($, on) => {
    const w = setup(on, { gateMs: 11 * MIN })
    await handBack($, w, 20)
    expect(delivered(w)).toContain('T-4 attempt 1/3 consistent')
    const recs = (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as { verdict?: string }[]
    expect(recs.at(-1)?.verdict).toBe('consistent')
  })

  test('a gate past gateTimeoutMinutes 2 is stopped at 2 minutes: unverified on gate, with the ceiling named', async ($, on) => {
    const w = setup(on, { gateMs: 5 * MIN, minutes: 2 })
    const took = await handBack($, w, 20)
    expect(took).toBeLessThanOrEqual(3)
    const text = delivered(w)
    expect(text).toContain('T-4 attempt 1/3 unverified')
    expect(text).toContain('gate ran past gateTimeoutMinutes (2 min)')
    expect(text).not.toContain('consistent')
  })

  test('while the gate runs, the verdict tool says which gate and for how long', async ($, on) => {
    const w = setup(on, { gateMs: 11 * MIN })
    let seen = ''
    await handBack($, w, 20, { minute: 3, look: async () => void (seen = await verdictNow($)) })
    expect(seen).toContain('verifying (gate prettier running 3 min)')
    expect(delivered(w)).toContain('T-4 attempt 1/3 consistent')
    // once judged, the reply is the verdict row again
    expect(await verdictNow($)).not.toContain('running')
  })

  test('time waiting for the engine gate is shown apart and not counted toward the ceiling', async ($, on) => {
    const lock = { holder: 'X-9', token: 'X-9#1', since: NOW, until: NOW + 5 * MIN }
    const w = setup(on, { gateMs: 1.5 * MIN, minutes: 2, gate: 'test', store: { 'delegation.engineGate': lock } })
    let seen = ''
    await handBack($, w, 20, { minute: 3, look: async () => void (seen = await verdictNow($)) })
    expect(seen).toContain('waiting for the engine gate 3 min')
    expect(seen).not.toContain('running')
    const text = delivered(w)
    expect(text).toContain("for X-9's engine gate")
    expect(text).toContain('T-4 attempt 1/3 consistent')
    expect(text).not.toContain('gate ran past')
  })
})

describe('MOD-229: gateTimeoutMinutes takes 1 to 120, default 30', () => {
  test('1, 30 and 120 are taken; unset is 30', () => {
    for (const v of [1, 30, 120]) expect(parseRepoConfig(JSON.stringify({ gateTimeoutMinutes: v }))).toEqual({ config: { gateTimeoutMinutes: v }, errors: [] })
    expect(mergeConfig({}, {}).gateTimeoutMinutes).toBe(30)
  })
  test('121 and 0 are refused with the 1-to-120 message', () => {
    for (const v of [121, 0, 2.5]) {
      const r = parseRepoConfig(JSON.stringify({ gateTimeoutMinutes: v }))
      expect(r.config.gateTimeoutMinutes).toBeUndefined()
      expect(r.errors).toEqual(['gateTimeoutMinutes: needs a whole number of minutes, 1 to 120 (ignored; 30 is used)'])
    }
  })
})
