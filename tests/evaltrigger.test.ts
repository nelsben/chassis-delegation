import { test, expect, describe } from 'claude-code/testing'
import {
  DEFAULT_EVAL_COMMAND,
  DEFAULT_EVAL_LIVE_COMMAND,
  revParseArgv,
  parseSha,
  shouldEval,
  liveEligible,
  evalRunnerPrompt,
  extractEvalBlock,
  parseEvalBlock,
  evalToast,
  failingLines,
  type EvalTriggerInput,
} from '../hooks/lib/evaltrigger'
import { checkArgv } from '../hooks/lib/allow'

const A = 'a'.repeat(40)
const B = 'b'.repeat(40)

describe('the eval commands', () => {
  test('5E: standalone there is no default eval command (the repo file or /config names one)', () => {
    expect(DEFAULT_EVAL_COMMAND).toBe('')
    expect(DEFAULT_EVAL_LIVE_COMMAND).toBe('')
  })
  test('the mod reads origin/main with an allowlisted rev-parse, and never runs sf itself', () => {
    expect(revParseArgv('/r')).toEqual(['git', '-C', '/r', 'rev-parse', 'origin/main'])
    expect(checkArgv(revParseArgv('/r'))).toEqual({ ok: true })
    expect(checkArgv('sf apex run test -n SampleEvalTest --synchronous'.split(' ')).ok).toBe(false)
  })
  test('a sha is 40 hex on the first line; anything else is none', () => {
    expect(parseSha(`${A}\n`)).toBe(A)
    expect(parseSha('fatal: ambiguous argument')).toBeUndefined()
    expect(parseSha('')).toBeUndefined()
  })
})

describe('the eval trigger', () => {
  const idle: EvalTriggerInput = { autoEval: true, inTurn: false, running: 0, pending: 0, queued: 0, sha: B, lastSha: A, inFlight: false }
  const cases: [string, Partial<EvalTriggerInput>, string | undefined][] = [
    ['origin/main moved and the session is idle', {}, undefined],
    ['no eval has run yet', { lastSha: undefined }, undefined],
    ['origin/main has not moved', { sha: A }, `origin/main unchanged at ${A.slice(0, 8)}`],
    ['origin/main could not be read', { sha: undefined }, 'origin/main unknown'],
    ['autoEval off', { autoEval: false }, 'autoEval off'],
    ['a turn is running', { inTurn: true }, 'a turn is running'],
    ['a worker is running', { running: 1 }, '1 worker running'],
    ['a verdict is pending', { pending: 1 }, '1 verdict pending'],
    ['a spawn is queued', { queued: 2 }, '2 spawns queued'],
    ['an eval runner is already out', { inFlight: true }, 'an eval runner is already running'],
  ]
  for (const [name, over, why] of cases) {
    test(name, () => {
      const r = shouldEval({ ...idle, ...over })
      if (why === undefined) expect(r).toEqual({ ok: true })
      else expect(r).toEqual({ ok: false, why })
    })
  }

  test('T2 runs only behind evalLive, once a session, after a clean T1, inside the cost ceiling', () => {
    const ok = { evalLive: true, usd: 10, maxUsd: 1, cap: 50, liveRanThisSession: false, t1Fail: 0 }
    expect(liveEligible(ok)).toEqual({ ok: true })
    expect(liveEligible({ ...ok, evalLive: false })).toEqual({ ok: false, why: 'evalLive off' })
    expect(liveEligible({ ...ok, usd: 49 })).toEqual({ ok: true }) // 49 + 1 = 50, at the cap
    expect(liveEligible({ ...ok, usd: 49.5 })).toEqual({ ok: false, why: 'session $49.50 + $1.00 would pass the $50.00 cap' })
    expect(liveEligible({ ...ok, usd: undefined })).toEqual({ ok: false, why: 'session cost unknown' })
    expect(liveEligible({ ...ok, liveRanThisSession: true })).toEqual({ ok: false, why: 'T2 already ran this session' })
    expect(liveEligible({ ...ok, t1Fail: 2 })).toEqual({ ok: false, why: 'T1 failed 2' })
  })
})

describe('the eval runner', () => {
  test('its prompt: the command once, the report contract, and what it must never do', () => {
    const p = evalRunnerPrompt({ tier: 'T1', command: 'npm run eval', root: '/r', sha: A })
    expect(p).toContain('Run `npm run eval` once in /r')
    expect(p).toContain(`[[eval v=1 tier=T1 sha=${A} total=N pass=N fail=N result=<path or none>]]`)
    expect(p).toContain('the failing test names')
    expect(p).toContain('Never retry, never deploy, never change files.')
    expect(p).not.toContain('$')
    const live = evalRunnerPrompt({ tier: 'T2', command: 'npm run eval:live', root: '/r', sha: A, maxUsd: 1 })
    expect(live).toContain('tier=T2')
    expect(live).toContain('at most $1.00')
  })

  test('the last [[eval]] block is read; numbers parse; failing names are the lines after it', () => {
    const answer = [
      'Ran it.',
      `[[eval v=1 tier=T1 sha=${A} total=60 pass=60 fail=0 result=none]]`,
      `[[eval v=1 tier=T1 sha=${A} total=63 pass=61 fail=2 result=/tmp/r.txt]]`,
      'failing: EvalA.verbLed',
      'failing: EvalB.noDiagnoses',
    ].join('\n')
    const block = extractEvalBlock(answer) ?? ''
    expect(block).toBe(`[[eval v=1 tier=T1 sha=${A} total=63 pass=61 fail=2 result=/tmp/r.txt]]`)
    expect(parseEvalBlock(block)).toEqual({ tier: 'T1', sha: A, total: 63, pass: 61, fail: 2, result: '/tmp/r.txt' })
    expect(failingLines(answer)).toEqual(['failing: EvalA.verbLed', 'failing: EvalB.noDiagnoses'])
    expect(extractEvalBlock('no block here')).toBeUndefined()
  })

  test('a hand-back the harness indents two spaces a line: the last block still reads, and its numbers land', () => {
    const handback = [
      'Ran T1 once against dev-frontend-2.',
      `[[eval v=1 tier=T1 sha=${A} total=60 pass=59 fail=1 result=none]]`,
      'That was the warm-up; the real run:',
      `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`,
    ]
      .map(l => '  ' + l)
      .join('\n')
    const block = extractEvalBlock(handback) ?? ''
    expect(block).toBe(`[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`)
    expect(parseEvalBlock(block)).toEqual({ tier: 'T1', sha: A, total: 63, pass: 63, fail: 0, result: 'none' })
    expect(evalToast('T1', parseEvalBlock(block))).toBe('T1 63/63')
    expect(failingLines(handback)).toEqual([])
  })

  test('a block the framing wraps or spaces out still reads; failing lines after it come back trimmed', () => {
    const wrapped = [`  [[eval`, `  v=1 tier=T1 sha=${A}`, `  total=63 pass=61 fail=2 result=none]]`, '  failing: EvalA.verbLed', '  failing: EvalB.noDiagnoses'].join('\n')
    expect(extractEvalBlock(wrapped)).toBe(`[[eval v=1 tier=T1 sha=${A} total=63 pass=61 fail=2 result=none]]`)
    expect(parseEvalBlock(extractEvalBlock(wrapped) ?? '')).toMatchObject({ total: 63, pass: 61, fail: 2, result: 'none' })
    expect(failingLines(wrapped)).toEqual(['failing: EvalA.verbLed', 'failing: EvalB.noDiagnoses'])
    expect(extractEvalBlock(`[[ eval v=1 tier=T1 sha=${A} total=5 pass=5 fail=0 result=none ]]`)).toBe(`[[eval v=1 tier=T1 sha=${A} total=5 pass=5 fail=0 result=none]]`)
    expect(parseEvalBlock(`[[eval v=1 tier=T1 sha=${A} total=5 pass=5 fail=0 result=none]]`).result).toBe('none')
  })

  test('the toast: the pass count, and a pointer to the transcript on a failure or no block', () => {
    expect(evalToast('T1', { tier: 'T1', sha: A, total: 63, pass: 63, fail: 0, result: 'none' })).toBe('T1 63/63')
    expect(evalToast('T1', { tier: 'T1', sha: A, total: 63, pass: 61, fail: 2, result: 'none' })).toBe('T1 61/63 — see transcript')
    expect(evalToast('T2', undefined)).toBe('T2 eval: no [[eval]] block — see transcript')
  })
})
