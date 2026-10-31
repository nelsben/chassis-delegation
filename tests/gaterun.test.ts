import { test, expect, describe } from 'claude-code/testing'
import { parseReport } from '../hooks/lib/brief'
import { engineLockDecision, ENGINE_POLL_MS, isEngineGate, readEngineLock, waitedLine } from '../hooks/lib/gates'
import { advise, gateNotRerun } from '../hooks/lib/verify'
import { gateFailures, timeoutRerun, verifyNative, type ExecOut } from '../hooks/lib/verify-native'

// MOD-20: a gate red only on timeouts in tests the delta never touched is re-run once; an engine
// gate takes its turn. The output below is what `claude plugin test` prints.
const TIMED_OUT = '  Error: timed out after 5000 ms'
const TWO_TIMEOUTS = [
  'tests/dispatchtool.test.ts:',
  '(pass) dispatch tool registration > lists the card tool [1.2ms]',
  '(fail) dispatch tool registration > registers the card tool [5002.16ms]',
  TIMED_OUT,
  '',
  'tests/dashboard.test.ts:',
  '(pass) the band > idle [0.4ms]',
  '(fail) the band > draws the tiles [5019.45ms]',
  TIMED_OUT,
  '(pass) the band > clears [0.3ms]',
  '',
  ' 764 pass',
  ' 2 fail',
  'Ran 766 tests across 34 files. [71.30s]',
  '',
].join('\n')
const ASSERTION = [
  'tests/brain.test.ts:',
  '(fail) bashWrites > redirects [0.3ms]',
  '  AssertionError: expect(received).toBe()',
  '  ',
  '  Expected: 2',
  '  Received: 1',
  '',
  ' 765 pass',
  ' 1 fail',
  'Ran 766 tests across 34 files. [60.00s]',
].join('\n')
const MIXED = [
  'tests/dashboard.test.ts:',
  '(fail) the band > draws the tiles [5019.45ms]',
  TIMED_OUT,
  'tests/brain.test.ts:',
  '(fail) bashWrites > redirects [0.3ms]',
  '  AssertionError: expect(received).toBe()',
  '',
  ' 764 pass',
  ' 2 fail',
  'Ran 766 tests across 34 files. [60.00s]',
].join('\n')

describe('MOD-20: reading the failures of a test run', () => {
  test('each (fail) line is a test in the file header above it, a timeout when its only detail is the engine timing out', () => {
    expect(gateFailures(TWO_TIMEOUTS)).toEqual({
      failures: [
        { file: 'tests/dispatchtool.test.ts', name: 'dispatch tool registration > registers the card tool', timeout: true },
        { file: 'tests/dashboard.test.ts', name: 'the band > draws the tiles', timeout: true },
      ],
      summary: 2,
    })
    expect(gateFailures(ASSERTION).failures).toEqual([{ file: 'tests/brain.test.ts', name: 'bashWrites > redirects', timeout: false }])
    expect(gateFailures('all green\n')).toEqual({ failures: [] })
  })
  test('a timeout line among other detail is not a timeout-only failure', () => {
    const out = ['tests/a.test.ts:', '(fail) x > y [5000ms]', TIMED_OUT, '  AssertionError: expected 1', '', ' 1 fail'].join('\n')
    expect(gateFailures(out).failures[0]?.timeout).toBe(false)
  })
})

describe('MOD-20: when a red gate is run again', () => {
  const delta = ['hooks/lib/gates.ts', 'tests/gaterun.test.ts']
  test('only timeouts, in test files outside the delta: run again, counting them', () => {
    expect(timeoutRerun(TWO_TIMEOUTS, delta)).toEqual({ rerun: true, timeouts: 2 })
    expect(timeoutRerun(TWO_TIMEOUTS, delta, '/w/repo')).toEqual({ rerun: true, timeouts: 2 })
    expect(timeoutRerun(TWO_TIMEOUTS.replaceAll('tests/', '/w/repo/tests/'), delta, '/w/repo')).toEqual({ rerun: true, timeouts: 2 })
  })
  test('a timeout in a test file the delta changed is never run again', () => {
    const r = timeoutRerun(TWO_TIMEOUTS, [...delta, 'tests/dashboard.test.ts'])
    expect(r).toMatchObject({ rerun: false })
    expect(r.rerun ? '' : r.why).toContain('tests/dashboard.test.ts')
  })
  test('an assertion failure, alone or beside timeouts, is never run again', () => {
    expect(timeoutRerun(ASSERTION, delta)).toMatchObject({ rerun: false })
    expect(timeoutRerun(MIXED, delta)).toMatchObject({ rerun: false })
  })
  test('what cannot be told is not run again: no delta, no failures read, a summary that counts more, no summary', () => {
    expect(timeoutRerun(TWO_TIMEOUTS, undefined)).toMatchObject({ rerun: false })
    expect(timeoutRerun('error: cannot find module\n', delta)).toMatchObject({ rerun: false })
    expect(timeoutRerun('', delta)).toMatchObject({ rerun: false })
    expect(timeoutRerun(TWO_TIMEOUTS.replace(' 2 fail', ' 3 fail'), delta)).toMatchObject({ rerun: false })
    expect(timeoutRerun(TWO_TIMEOUTS.replace(' 2 fail\n', ''), delta)).toMatchObject({ rerun: false })
    // a failure with no file header above it is a test whose file is unknown
    expect(timeoutRerun(['(fail) x [5001ms]', TIMED_OUT, ' 1 fail'].join('\n'), delta)).toMatchObject({ rerun: false })
  })
})

describe('MOD-20: which gate commands take a turn, and who holds it', () => {
  test('claude plugin test is the engine gate; validate, node and any other command are not', () => {
    expect(isEngineGate(['claude', 'plugin', 'test', '/w/repo'])).toBe(true)
    expect(isEngineGate(['/usr/local/bin/claude', 'plugin', 'test', '/w/repo'])).toBe(true)
    expect(isEngineGate(['claude', 'plugin', 'validate', '/w/repo'])).toBe(false)
    expect(isEngineGate(['node', 'tests/node/run.mjs'])).toBe(false)
    expect(isEngineGate([])).toBe(false)
  })
  test('the lock is free when absent, expired or ours; otherwise the holder is waited for, a poll at most', () => {
    const lock = { holder: 'MOD-9', token: 'MOD-9#1', since: 1000, until: 31000 }
    expect(engineLockDecision(undefined, 5000, 'me')).toEqual({ take: true })
    expect(engineLockDecision(lock, 31000, 'me')).toEqual({ take: true })
    expect(engineLockDecision(lock, 40000, 'me')).toEqual({ take: true })
    expect(engineLockDecision(lock, 5000, 'MOD-9#1')).toEqual({ take: true })
    expect(engineLockDecision(lock, 5000, 'me')).toEqual({ take: false, holder: 'MOD-9', waitMs: ENGINE_POLL_MS })
    expect(engineLockDecision(lock, 29000, 'me')).toEqual({ take: false, holder: 'MOD-9', waitMs: 2000 })
  })
  test('a stored value that is not a lock reads as none; the wait is one line', () => {
    expect(readEngineLock({ holder: 'MOD-9', token: 't', since: 1, until: 2 })).toEqual({ holder: 'MOD-9', token: 't', since: 1, until: 2 })
    for (const bad of [undefined, null, 'x', 3, {}, { holder: 'a', token: 'b', since: 1 }, { holder: 1, token: 'b', since: 1, until: 2 }]) expect(readEngineLock(bad)).toBeUndefined()
    expect(waitedLine(40_000, 'MOD-x')).toBe("waited 40 s for MOD-x's engine gate")
    expect(waitedLine(400, 'MOD-x')).toBe("waited 1 s for MOD-x's engine gate")
  })
})

// ---- the verifier, with the gate answered from a table -----------------------------------------
const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=src/secret/** gate=test budget=2-attempts report=chassis.report.v1]]'
const report = () => parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=pass files=src/a.ts,docs/x.md]]')
const ok = (stdout = ''): ExecOut => ({ ok: true, exitCode: 0, stdout, stderr: '' })
const red = (stdout: string): ExecOut => ({ ok: true, exitCode: 1, stdout, stderr: '' })
const git = (...args: string[]) => ['git', '-C', REPO, ...args].join(' ')
const GIT: Record<string, ExecOut> = {
  [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(`${FULL}\n`),
  [git('rev-parse', '--verify', '--quiet', 'refs/heads/agent/ops/T-1')]: ok(`${FULL}\n`),
  [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: ok(),
  [git('rev-parse', '--verify', '--quiet', 'origin/main')]: ok(`${MB}\n`),
  [git('merge-base', 'origin/main', FULL)]: ok(`${MB}\n`),
  [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tdocs/x.md\n'),
  [git('rev-parse', 'HEAD')]: ok(`${FULL}\n`),
  [git('status', '--porcelain')]: ok(''),
  [git('rev-parse', 'HEAD^{tree}')]: ok(`${'e'.repeat(40)}\n`),
}

/** The gate answers `answers` in order (the last one for every run after); the calls and the turns are recorded. */
function world(answers: ExecOut[], over: { delta?: string; turn?: { wait?: string }; head?: ExecOut; written?: Map<string, string>; failWrite?: boolean } = {}) {
  const gate: string[][] = []
  const events: string[] = []
  const exec = async (argv: readonly string[]): Promise<ExecOut> => {
    if (argv[0] === 'git' && over.delta !== undefined && argv[3] === 'diff') return ok(over.delta)
    // MOD-149: once the gate has run, HEAD reads as `over.head` (a moved HEAD, or a worktree that is gone)
    if (argv[0] === 'git' && over.head && gate.length > 0 && argv.slice(3).join(' ') === 'rev-parse HEAD') return over.head
    const hit = GIT[argv.join(' ')]
    if (hit) return hit
    if (argv[0] === 'git') return { ok: true, exitCode: 1, stdout: '', stderr: `no such answer: ${argv.join(' ')}` }
    gate.push([...argv])
    events.push(`run ${argv.join(' ')}`)
    return answers[Math.min(gate.length - 1, answers.length - 1)] as ExecOut
  }
  const turn = over.turn
    ? async (argv: readonly string[]) => {
        events.push(`turn ${argv.join(' ')}`)
        return { ...(over.turn?.wait ? { line: over.turn.wait } : {}), release: async () => void events.push('release') }
      }
    : undefined
  const write = async (path: string, text: string) => {
    if (over.failWrite && path.includes('verify-gate-')) throw new Error('disk full')
    over.written?.set(path, text)
  }
  return { gate, events, io: { exec, write, ...(turn ? { turn } : {}) } }
}
const input = (over: Partial<Parameters<typeof verifyNative>[0]> = {}) => ({
  repo: REPO,
  report: report(),
  briefText: `${HEADER}\n\nbody\n`,
  gateMap: { test: 'npm test' },
  allowed: (argv: readonly string[]) => argv.join(' ') === 'npm test',
  filesPath: '/r/.delegation/T-1/files.txt',
  ...over,
})
const claim = (lines: readonly string[], name: string) => lines.find(l => l.startsWith(`claim ${name}:`))

describe('MOD-20: verifyNative re-runs a gate red on timeouts in untouched tests, once', () => {
  test('red on two timeouts, then green: held, saying so; the gate ran twice', async () => {
    const w = world([red(TWO_TIMEOUTS), ok('all green\n')])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('consistent')
    expect(claim(r.lines, 'gate')).toBe('claim gate: held — gate green on rerun (first run: 2 timeouts in untouched tests) at a1b2c3d (gate=pass confirmed)')
    expect(w.gate).toEqual([['npm', 'test'], ['npm', 'test']])
  })
  test('red on timeouts both times: refuted as today, with the second output, once re-run', async () => {
    const w = world([red(TWO_TIMEOUTS)])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('refuted')
    expect(claim(r.lines, 'gate')).toBe('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
    expect(r.lines).toContain('note: the gate was re-run once after 2 timeouts in untouched tests, and was red again')
    expect(w.gate).toHaveLength(2)
  })
  test('red on timeouts, then red on an assertion: refuted showing the assertion, not run a third time', async () => {
    const w = world([red(TWO_TIMEOUTS), red(ASSERTION)])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('  | Received: 1')
    expect(w.gate).toHaveLength(2)
  })
  test('an assertion failure is not run again', async () => {
    const w = world([red(ASSERTION), ok()])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('refuted')
    expect(claim(r.lines, 'gate')).toBe('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
    expect(r.lines.some(l => l.startsWith('note: the gate was re-run'))).toBe(false)
    expect(w.gate).toHaveLength(1)
  })
  test('a timeout in a test file the delta changed is not run again', async () => {
    const delta = 'A\tsrc/a.ts\nA\tdocs/x.md\nA\ttests/dashboard.test.ts\n'
    const w = world([red(TWO_TIMEOUTS), ok()], { delta })
    const r = await verifyNative(
      input({ briefText: `${HEADER.replace('scope=src/**,docs/', 'scope=src/**,docs/,tests/**')}\n`, report: parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=pass files=src/a.ts,docs/x.md,tests/dashboard.test.ts]]') }),
      w.io,
    )
    expect(claim(r.lines, 'gate')).toBe('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
    expect(w.gate).toHaveLength(1)
  })
  test('a green first run is run once', async () => {
    const w = world([ok()])
    const r = await verifyNative(input(), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: held — gate green at a1b2c3d (gate=pass confirmed)')
    expect(w.gate).toHaveLength(1)
  })
  test('gate=fail over a gate that goes green on the rerun is recorded, not refuted', async () => {
    const w = world([red(TWO_TIMEOUTS), ok()])
    const r = await verifyNative(input({ report: parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=fail files=src/a.ts,docs/x.md]]') }), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — gate=fail claimed but the gate is green — not a refutation, recorded')
  })
})

describe('MOD-20: an engine gate takes its turn', () => {
  const ENGINE = ['claude', 'plugin', 'test', REPO]
  const engineInput = () => input({ gateMap: { test: 'claude plugin test {worktree}' }, allowed: (argv: readonly string[]) => argv[0] === 'claude' })
  test('the turn is taken before the engine run and released after it; the wait is one line, ahead of the gate claim', async () => {
    const w = world([ok()], { turn: { wait: "waited 40 s for MOD-x's engine gate" } })
    const r = await verifyNative(engineInput(), w.io)
    expect(w.events).toEqual([`turn ${ENGINE.join(' ')}`, `run ${ENGINE.join(' ')}`, 'release'])
    expect(r.lines.filter(l => l.includes('engine gate'))).toEqual(["waited 40 s for MOD-x's engine gate"])
    expect(r.lines.indexOf("waited 40 s for MOD-x's engine gate")).toBeLessThan(r.lines.findIndex(l => l.startsWith('claim gate:')))
  })
  test('no wait, no line', async () => {
    const w = world([ok()], { turn: {} })
    const r = await verifyNative(engineInput(), w.io)
    expect(r.lines.some(l => l.startsWith('waited'))).toBe(false)
    expect(w.events).toHaveLength(3)
  })
  test('the rerun happens inside the same turn, and a red gate releases it too', async () => {
    const w = world([red(TWO_TIMEOUTS), ok()], { turn: {} })
    await verifyNative(engineInput(), w.io)
    expect(w.events).toEqual([`turn ${ENGINE.join(' ')}`, `run ${ENGINE.join(' ')}`, `run ${ENGINE.join(' ')}`, 'release'])
    const w2 = world([red(ASSERTION)], { turn: {} })
    await verifyNative(engineInput(), w2.io)
    expect(w2.events.at(-1)).toBe('release')
  })
  test('a gate that is not the engine suite takes no turn', async () => {
    const w = world([ok()], { turn: {} })
    await verifyNative(input(), w.io)
    expect(w.events).toEqual(['run npm test'])
  })
})

describe('MOD-96 (#147): a gate the runner stopped at the limit is advised as a by-hand run and a re-verify', () => {
  const stopped: ExecOut = { ok: false, why: 'Error: process timed out after 540000 ms' }
  const adv = (lines: readonly string[], over = {}) =>
    advise({ verdict: 'unverified', reportGate: 'pass', task: 'T-1', attempts: 1, budget: 3, lineageResumes: 0, tier: 'standard', adhoc: false, agentId: 'agent-1', briefPath: '/b/T-1.brief.md', sha: 'a1b2c3d', lines, ...over })
  test('the verifier leaves the gate unchecked, and the row advises check, not resume', async () => {
    const w = world([stopped])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('unverified')
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — gate npm test did not run: Error: process timed out after 540000 ms')
    const a = adv(r.lines)
    expect(a.kind).toBe('check')
    expect(a.next).toBe("gate npm test hit the verifier's 9-minute limit: time it by hand in the worktree, then re-run the verifier with `/dispatch T-1 --verify a1b2c3d` (no attempt spent)")
    expect(a.next).not.toContain('resume')
  })
})

describe('MOD-149: a red gate saves its full output and says when the tree changed under it', () => {
  const OUT = '/r/.delegation/T-1'
  const RED_OUT = 'collecting\nFAILED test_x\n1 failed\n'
  test('exit 1 writes verify-gate-<attempt>.txt with the full output; the row names the path', async () => {
    const written = new Map<string, string>()
    const w = world([{ ok: true, exitCode: 1, stdout: RED_OUT, stderr: 'warn on stderr\n' }], { written })
    const r = await verifyNative(input({ outDir: OUT, attempt: 1 }), w.io)
    expect(r.verdict).toBe('refuted')
    expect(claim(r.lines, 'gate')).toBe(`claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1; output ${OUT}/verify-gate-1.txt)`)
    const text = written.get(`${OUT}/verify-gate-1.txt`) ?? ''
    expect(text).toContain('FAILED test_x')
    expect(text).toContain('warn on stderr')
    expect(r.lines).toContain('  | 1 failed')
  })
  test('the attempt number names the file', async () => {
    const written = new Map<string, string>()
    const w = world([red(RED_OUT)], { written })
    await verifyNative(input({ outDir: OUT, attempt: 3 }), w.io)
    expect([...written.keys()].filter(k => k.includes('verify-gate-'))).toEqual([`${OUT}/verify-gate-3.txt`])
  })
  test('no outDir, or a failed write: the claim reads as before and no file is written', async () => {
    const written = new Map<string, string>()
    const w = world([red(RED_OUT)], { written })
    const r = await verifyNative(input(), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
    expect([...written.keys()].some(k => k.includes('verify-gate-'))).toBe(false)
    const w2 = world([red(RED_OUT)], { failWrite: true })
    const r2 = await verifyNative(input({ outDir: OUT, attempt: 1 }), w2.io)
    expect(claim(r2.lines, 'gate')).toBe('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
  })
  test('a worktree gone by the end of a red run: unchecked, not refuted on gate', async () => {
    const written = new Map<string, string>()
    const w = world([red(RED_OUT)], { head: { ok: true, exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }, written })
    const r = await verifyNative(input({ outDir: OUT, attempt: 1 }), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — the worktree changed while the gate ran (gone); the gate was not judged')
    expect(r.verdict).not.toBe('refuted')
  })
  test('a HEAD that moved during a red run: unchecked with the new short sha', async () => {
    const w = world([red(RED_OUT)], { head: ok('ffffffffffffffffffffffffffffffffffffffff\n') })
    const r = await verifyNative(input({ outDir: OUT, attempt: 1 }), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — the worktree changed while the gate ran (HEAD now fffffff); the gate was not judged')
    expect(r.verdict).not.toBe('refuted')
  })
  test('a green run is not re-checked and writes nothing', async () => {
    const written = new Map<string, string>()
    const w = world([ok()], { head: { ok: true, exitCode: 128, stdout: '', stderr: '' }, written })
    const r = await verifyNative(input({ outDir: OUT, attempt: 1 }), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: held — gate green at a1b2c3d (gate=pass confirmed)')
    expect(written.size).toBe(1)
  })
})

describe('MOD-219/236: the verifier recording a gate it did not run is what the row calls not re-run', () => {
  test('a gate id missing from gateMap is not re-run, and its claim line is read as not re-run', async () => {
    const w = world([ok()])
    const r = await verifyNative(input({ gateMap: {} }), w.io)
    expect(claim(r.lines, 'gate')).toContain('gate not re-run: test')
    expect(w.gate).toEqual([])
    expect(gateNotRerun(r.lines)).toBe('gate not re-run (not in gateMap)')
  })
  test('a gate that ran is not marked', async () => {
    const w = world([ok()])
    const r = await verifyNative(input(), w.io)
    expect(gateNotRerun(r.lines)).toBeUndefined()
  })
})

describe('MOD-236: the verifier records the tree each passing gate ran on', () => {
  test('a gate that exited 0 is recorded under its id with the worktree tree hash', async () => {
    const w = world([ok()])
    const r = await verifyNative(input(), w.io)
    expect(r.gateTree).toEqual({ test: 'e'.repeat(40) })
  })
  test('a red gate, and a gate id that was not run, record nothing', async () => {
    const red1 = await verifyNative(input(), world([{ ok: true, exitCode: 1, stdout: 'x', stderr: '' }]).io)
    expect(red1.gateTree).toBeUndefined()
    const none = await verifyNative(input({ gateMap: {} }), world([ok()]).io)
    expect(none.gateTree).toBeUndefined()
  })
  test('a gate id of several commands is recorded only when all of them passed', async () => {
    const two = input({ gateMap: { test: 'npm test && npm run lint' }, allowed: () => true })
    const both = await verifyNative(two, world([ok(), ok()]).io)
    expect(both.gateTree).toEqual({ test: 'e'.repeat(40) })
    const second = await verifyNative(two, world([ok(), { ok: true, exitCode: 1, stdout: 'x', stderr: '' }]).io)
    expect(second.gateTree).toBeUndefined()
  })
})
