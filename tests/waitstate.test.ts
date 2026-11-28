import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, agentResult, SCRATCH, type RunAnswer } from './harness'
import { saysWaiting, waitStep, waitText, stallText, ownJobWait, pauseCapFor, OWN_WAIT_CAP } from '../hooks/lib/waitstate'

// MOD-99 (#161): a worker that is waiting wakes the brain once per state, says what it waits on, and says stalled past a ceiling.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const OPTS = { gateMap: '{"prettier":"npx prettier --check {files}"}', wakeOnVerdict: true }
const MB = 'b'.repeat(40)
const MIN = 60_000
const WAITING = 'The bench is running in the background.\n\nWaiting on the background job to finish.'

const repo = (argv: string[]): RunAnswer | undefined => {
  if (argv[0] === 'npx') return { exitCode: 0, stdout: '' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length).padEnd(40, '0')}\n` }
  if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : '1234abcd'.padEnd(40, '0')}\n` }
  if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${'1234abcd'.padEnd(40, '0')}\n` }
  if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
  if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
  return undefined
}

describe('MOD-99: the wait state (pure)', () => {
  test('a turn that says it is waiting and carries no report is a wait; a report is not', () => {
    expect(saysWaiting(WAITING)).toBe(true)
    expect(saysWaiting('Done.')).toBe(false)
    expect(saysWaiting(`waiting\n${REPORT}`)).toBe(false)
  })
  test('the first sighting speaks, a repeat is held, the ceiling speaks once', () => {
    const a = waitStep(undefined, 0, 20, 'T-4')
    expect(a.say).toBe('T-4 waiting on its own background job (0 min)')
    const b = waitStep(a.state, 5 * MIN, 20, 'T-4')
    expect(b.say).toBeUndefined()
    const c = waitStep(b.state, 20 * MIN, 20, 'T-4')
    expect(c.say).toBe('T-4 stalled 20 min; resume or stop it')
    expect(waitStep(c.state, 30 * MIN, 20, 'T-4').say).toBeUndefined()
  })
  test('a ceiling of 0 never says stalled', () => {
    const a = waitStep(undefined, 0, 0, 'T-4')
    expect(waitStep(a.state, 600 * MIN, 0, 'T-4').say).toBeUndefined()
  })
  test('a worker whose card names a resource another worker holds says which', () => {
    expect(waitText('T-5', 0, { resource: 'blender-live', holder: 'T-4' })).toBe('T-5 waiting on blender-live held by T-4')
    expect(stallText('T-5', 25 * MIN)).toBe('T-5 stalled 25 min; resume or stop it')
  })
})

describe('MOD-99: only a worker waiting now is a wait', () => {
  test('a real wait is one', () => {
    expect(saysWaiting('Waiting on the background render (job 3) before I continue.')).toBe(true)
    expect(saysWaiting("Tests started.\n\nI'll wait for the background job to finish.")).toBe(true)
    expect(saysWaiting(WAITING)).toBe(true)
  })
  test('past tense, a bare wait, or wait mid-text under a summary is not', () => {
    expect(saysWaiting('I waited for the tests to finish')).toBe(false)
    expect(saysWaiting('wait, the gate failed')).toBe(false)
    expect(saysWaiting('I will wait for the build to settle.\n\nSummary: the change is done and the gate failed on a.ts.')).toBe(false)
  })
  test('a usage-limit text is never a wait', () => {
    expect(saysWaiting("You've hit your usage limit. Please wait for the background job; resets at 5pm.")).toBe(false)
  })
})

describe('MOD-99: a waiting worker wakes the brain once per state', () => {
  const setup = async ($: never, on: never) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo, agentId: 'agent-4' })
    await ($ as { agent: { spawn: (x: never) => Promise<unknown> } }).agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    return w
  }
  const texts = (w: { submitted: { text: string }[] }) => w.submitted.map(s => s.text)

  test('ten repeat waits over 15 fake minutes wake the brain once; the hand-back wakes it once more', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 0; i < 10; i++) {
      await $.turn.complete(turnInput('agent-4', WAITING, undefined, `turn-w${i}`))
      await w.clock.advance((15 * MIN) / 10)
    }
    expect(texts(w).filter(t => t.includes('T-4 waiting on its own background job'))).toHaveLength(1)
    expect(w.submitted).toHaveLength(1)
    expect(w.debugLogs.some(l => l.includes('T-4 still waiting'))).toBe(true)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT, undefined, 'turn-final'))
    expect(w.submitted).toHaveLength(2)
    expect(texts(w)[1]).toContain('T-4 attempt 1')
  })

  test('the ceiling row fires once at the ceiling and not again', { options: { ...OPTS, waitStallMin: 20 } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 0; i < 8; i++) {
      await $.turn.complete(turnInput('agent-4', WAITING, undefined, `turn-w${i}`))
      await w.clock.advance(5 * MIN)
    }
    const stalled = texts(w).filter(t => t.includes('T-4 stalled'))
    expect(stalled).toHaveLength(1)
    expect(stalled[0]).toContain('T-4 stalled 20 min; resume or stop it')
    expect(w.submitted).toHaveLength(2)
  })

  test('a silent worker is called stalled by the clock alone', { options: { ...OPTS, waitStallMin: 10 } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', WAITING))
    await w.clock.advance(10 * MIN)
    expect(texts(w).filter(t => t.includes('T-4 stalled 10 min; resume or stop it'))).toHaveLength(1)
  })

  test('"I waited for the tests to finish" with no report still gets the no-report verdict row', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', 'I waited for the tests to finish'))
    expect(texts(w).some(t => t.includes('no-report'))).toBe(true)
    expect(texts(w).some(t => t.includes('waiting on'))).toBe(false)
  })

  test('a usage-limit text containing wait is judged as before', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', "You've hit your usage limit. Please wait for the background job; resets at 5pm."))
    expect(texts(w).some(t => t.includes('no-report (rate limited'))).toBe(true)
    expect(texts(w).some(t => t.includes('waiting on'))).toBe(false)
  })

  test('waitStallMin 0 turns the ceiling off', { options: { ...OPTS, waitStallMin: 0 } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 0; i < 6; i++) {
      await $.turn.complete(turnInput('agent-4', WAITING, undefined, `turn-w${i}`))
      await w.clock.advance(30 * MIN)
    }
    expect(texts(w).filter(t => t.includes('stalled'))).toHaveLength(0)
    expect(w.submitted).toHaveLength(1)
  })
})

// MOD-226 (#270): a worker that stops while its own background job runs prints a pause line; that is a pause, not a charged attempt.
const PAUSE = '[[pause v=1 task=T-4 reason=bench running in the background, back when it ends]]'

describe('MOD-226: a pause line is a pause, not an attempt', () => {
  const setup = async ($: never, on: never) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo, agentId: 'agent-4' })
    await ($ as { agent: { spawn: (x: never) => Promise<unknown> } }).agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    return w
  }
  const texts = (w: { submitted: { text: string }[] }) => w.submitted.map(s => s.text)

  test('pause then report = attempt 1, nothing charged', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', 'Bench started.\n' + PAUSE, undefined, 'turn-p1'))
    const first = texts(w).join('\n')
    expect(first).toContain('paused')
    expect(first).toContain('next=resume')
    expect(first).toContain('bench running in the background')
    expect(first).toContain('T-4 waiting on its own background job')
    expect(first).not.toContain('no-report')
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT, undefined, 'turn-final'))
    const last = texts(w).at(-1) ?? ''
    expect(last).toContain('T-4 attempt 1')
    expect(last).not.toContain('attempt 2')
  })

  test('a stop with neither line is charged as before', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', 'I stopped here.'))
    expect(texts(w).join('\n')).toContain('no-report')
    expect(texts(w).join('\n')).not.toContain('paused')
  })

  // MOD-422: the cap of 3 now holds for a pause that is not a wait on the worker's own job
  const ASK = '[[pause v=1 task=T-4 reason=need the lead to answer which scope to keep]]'
  test('the third pause in one attempt is charged, with a row saying why', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 1; i <= 2; i++) await $.turn.complete(turnInput('agent-4', `Stopped (${i}).\n` + ASK, undefined, `turn-p${i}`))
    expect(texts(w).join('\n')).not.toContain('no-report')
    await $.turn.complete(turnInput('agent-4', 'Stopped (3).\n' + ASK, undefined, 'turn-p3'))
    const last = texts(w).at(-1) ?? ''
    expect(last).toContain('no-report')
    expect(last).toContain('pause cap')
  })
})

// MOD-422: a worker waiting on its own job is not charged an attempt.
describe('MOD-422: an own-job wait is not an attempt', () => {
  const setup = async ($: never, on: never) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo, agentId: 'agent-4' })
    await ($ as { agent: { spawn: (x: never) => Promise<unknown> } }).agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    return w
  }
  const texts = (w: { submitted: { text: string }[] }) => w.submitted.map(s => s.text)

  test('ownJobWait reads own-job, lease, lock and gate reasons, and not a question for the lead', () => {
    for (const r of ['waiting on my render (gpu_lock)', 'render lease queued', 'my gate run', 'bench running in the background', 'my own two renders'])
      expect(ownJobWait(r)).toBe(true)
    for (const r of ["need the lead's answer", 'blocked on a decision', 'no reason given']) expect(ownJobWait(r)).toBe(false)
  })
  test('pauseCapFor gives own-job waits the larger cap and keeps a higher repo cap', () => {
    expect(pauseCapFor('my render', 3)).toBe(OWN_WAIT_CAP)
    expect(pauseCapFor('my render', 20)).toBe(20)
    expect(pauseCapFor('a question', 3)).toBe(3)
  })
  test('four own-job pauses in one attempt are all paused, none charged; the report is attempt 1', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 1; i <= 4; i++) await $.turn.complete(turnInput('agent-4', `Render ${i} going.\n` + PAUSE, undefined, `turn-o${i}`))
    const all = texts(w).join('\n')
    expect(all).not.toContain('no-report')
    expect(all).not.toContain('pause cap')
    expect(all).toContain('paused (4/11)')
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT, undefined, 'turn-done'))
    const last = texts(w).at(-1) ?? ''
    expect(last).toContain('T-4 attempt 1')
    expect(last).not.toContain('attempt 2')
  })
  test('the twelfth own-job pause is charged', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    for (let i = 1; i <= 11; i++) await $.turn.complete(turnInput('agent-4', `Render ${i} going.\n` + PAUSE, undefined, `turn-t${i}`))
    expect(texts(w).join('\n')).not.toContain('no-report')
    await $.turn.complete(turnInput('agent-4', 'Render 12 going.\n' + PAUSE, undefined, 'turn-t12'))
    const last = texts(w).at(-1) ?? ''
    expect(last).toContain('no-report')
    expect(last).toContain('pause cap')
  })
  test('no report and no pause line, last paragraph waits on its own background run: a paused row, no no-report row', { options: { ...OPTS } }, async ($, on) => {
    world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: repo, agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Bench started.\n\nI am waiting on my background render to finish.', 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_fg000001' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}.` })
    const ours = (r.context ?? []).filter(c => c.startsWith('chassis-delegation:')).join('\n')
    expect(ours).toContain('paused')
    expect(ours).not.toContain('no-report')
  })
  test('a report wins over a wait sentence', { options: { ...OPTS } }, async ($, on) => {
    const w = await setup($ as never, on as never)
    await $.turn.complete(turnInput('agent-4', 'Waiting on the background render.\n' + REPORT, undefined, 'turn-r'))
    const last = texts(w).at(-1) ?? ''
    expect(last).not.toContain('paused')
    expect(last).toContain('T-4 attempt 1')
  })
})
