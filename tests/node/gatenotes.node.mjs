// MOD-406: the verifier records each gate run on its result as `gates` (id, ok, ms, result line, rerun).
// gateSummaryLine is pure; the gate loop is driven through verifyNative with a fake io and a fake clock.
import { test, expect, describe } from './kit.mjs'
import { parseReport } from '../../hooks/lib/brief.ts'
import { verifyNative } from '../../hooks/lib/verify-native.ts'
import { gateSummaryLine } from '../../hooks/lib/gaterun.ts'

describe('gateSummaryLine', () => {
  test('the node runner ending reads as its count lines', () => {
    const out = 'x\n\n 2074 pass\n 0 fail\n 2 skipped (engine tests: claude plugin test runs them)\n'
    expect(gateSummaryLine(out, '')).toBe('2074 pass, 0 fail, 2 skipped (engine tests: claude plugin test runs them)')
  })
  test('output with no count line gives its last non-blank line', () => {
    expect(gateSummaryLine('first\nall good\n\n', '')).toBe('all good')
  })
  test('no output gives an empty string', () => {
    expect(gateSummaryLine('', '')).toBe('')
    expect(gateSummaryLine('\n  \n', '\n')).toBe('')
  })
  test('a 300-character last line is cut to 160 ending with an ellipsis', () => {
    const r = gateSummaryLine(`${'a'.repeat(300)}\n`, '')
    expect(r).toHaveLength(160)
    expect(r.endsWith('…')).toBe(true)
  })
  test('a count line on stderr is read', () => {
    expect(gateSummaryLine('noise\n', '12 passed\n')).toBe('12 passed')
  })
})

const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=src/secret/** gate=test budget=2-attempts report=chassis.report.v1]]'
const ok = (stdout = '', exitCode = 0) => ({ ok: true, exitCode, stdout, stderr: '' })
const git = (...args) => ['git', '-C', REPO, ...args].join(' ')
const GIT = {
  [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(`${FULL}\n`),
  [git('rev-parse', '--verify', '--quiet', 'refs/heads/agent/ops/T-1')]: ok(`${FULL}\n`),
  [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: ok(),
  [git('rev-parse', '--verify', '--quiet', 'origin/main')]: ok(`${MB}\n`),
  [git('merge-base', 'origin/main', FULL)]: ok(`${MB}\n`),
  [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tdocs/x.md\n'),
  [git('rev-parse', 'a1b2c3d^{commit}', 'HEAD', 'refs/heads/agent/ops/T-1')]: ok(`${FULL}\n${FULL}\n${FULL}\n`),
  [git('rev-parse', 'HEAD')]: ok(`${FULL}\n`),
  [git('status', '--porcelain=v1', '--untracked-files=all', '-z')]: ok(''),
  [git('rev-parse', 'HEAD^{tree}')]: ok(`${'e'.repeat(40)}\n`),
}

// The gate answers `answers` in order (the last one for every run after); the clock gives 1000, 1750, ... in steps of `step`.
function world(answers, step = 750) {
  let gateRuns = 0
  let t = 1000 - step
  const exec = async argv => {
    const hit = GIT[argv.join(' ')]
    if (hit) return hit
    if (argv[0] === 'git') return { ok: true, exitCode: 1, stdout: '', stderr: `no such answer: ${argv.join(' ')}` }
    gateRuns += 1
    return answers[Math.min(gateRuns - 1, answers.length - 1)]
  }
  return { io: { exec, write: async () => undefined, now: () => (t += step) } }
}
const input = (claim = 'pass') => ({
  repo: REPO,
  report: parseReport(`[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=${claim} files=src/a.ts,docs/x.md]]`),
  briefText: `${HEADER}\n\nbody\n`,
  gateMap: { test: 'npm test' },
  allowed: argv => argv.join(' ') === 'npm test',
  filesPath: '/r/.delegation/T-1/files.txt',
})

describe('MOD-406: the gate loop records one note per gate id', () => {
  test('a passing gate gives one note with the summary line and the clock difference', async () => {
    const r = await verifyNative(input(), world([ok('some\n 41 pass\n 0 fail\n')]).io)
    expect(r.gates).toEqual([{ id: 'test', ok: true, ms: 750, line: '41 pass, 0 fail' }])
  })
  test('a red gate gives ok false', async () => {
    const r = await verifyNative(input('fail'), world([ok('1 failed\n', 1)]).io)
    expect(r.gates).toEqual([{ id: 'test', ok: false, ms: 750, line: '1 failed' }])
  })
  test('a gate that exits 127 gives no note', async () => {
    const r = await verifyNative(input(), world([ok('', 127)]).io)
    expect(r.gates).toBeUndefined()
  })
  test('a red first run of a gate=pass claim that passes when run again gives rerun own and ok true', async () => {
    const r = await verifyNative(input(), world([ok('1 failed\n', 1), ok('5 pass\n')]).io)
    expect(r.gates).toEqual([{ id: 'test', ok: true, ms: 750, line: '5 pass', rerun: 'own' }])
  })
})
