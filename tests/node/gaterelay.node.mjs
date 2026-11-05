// MOD-307 (#394): a red gate on a hand-back that claimed gate=pass is run once more on its own before the verdict
// says red; the second run is the one judged. Pure: the gate is answered from a table, as in tests/gaterun.test.ts.
import { test, expect, describe } from './kit.mjs'
import { parseReport } from '../../hooks/lib/brief.ts'
import { verifyNative } from '../../hooks/lib/verify-native.ts'

const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=src/secret/** gate=test budget=2-attempts report=chassis.report.v1]]'
const OUT = '/r/.delegation/T-1'
const RED_OUT = 'collecting\nFAILED test_x\n1 failed\n'
const ok = (stdout = '', exitCode = 0) => ({ ok: true, exitCode, stdout, stderr: '' })
const red = (stdout = RED_OUT) => ok(stdout, 1)
const claim = (lines, name) => lines.find(l => l.startsWith(`claim ${name}:`))
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

// The gate answers `answers` in order (the last one for every run after); the gate runs and the written files are recorded.
function world(answers, over = {}) {
  const gate = []
  const written = new Map()
  const exec = async argv => {
    if (argv[0] === 'git' && over.head && gate.length > 0 && argv.slice(3).join(' ') === 'rev-parse HEAD') return over.head
    const hit = GIT[argv.join(' ')]
    if (hit) return hit
    if (argv[0] === 'git') return { ok: true, exitCode: 1, stdout: '', stderr: `no such answer: ${argv.join(' ')}` }
    gate.push([...argv])
    return answers[Math.min(gate.length - 1, answers.length - 1)]
  }
  const write = async (path, text) => void written.set(path, text)
  return { gate, written, io: { exec, write } }
}
const input = (over = {}) => ({
  repo: REPO,
  report: parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=pass files=src/a.ts,docs/x.md]]'),
  briefText: `${HEADER}\n\nbody\n`,
  gateMap: { test: 'npm test' },
  allowed: argv => argv.join(' ') === 'npm test',
  filesPath: '/r/.delegation/T-1/files.txt',
  ...over,
})
const GATE_RED = 'claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)'

describe('MOD-307: a red first run of a gate=pass hand-back is run once more', () => {
  test('red then green holds, and the claim says the second run confirmed it', async () => {
    const w = world([red(), ok('all green\n')])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('consistent')
    expect(claim(r.lines, 'gate')).toBe('claim gate: held — gate green at a1b2c3d (gate=pass confirmed on re-run (first run red: 1 failed))')
    expect(w.gate).toHaveLength(2)
  })
  test('red then red refutes with the unchanged claim line and the note after the output tail', async () => {
    const w = world([red()])
    const r = await verifyNative(input(), w.io)
    expect(r.verdict).toBe('refuted')
    expect(claim(r.lines, 'gate')).toBe(GATE_RED)
    expect(r.lines).toContain('note: the gate was re-run once on its own and was red again')
    expect(r.lines.indexOf('note: the gate was re-run once on its own and was red again')).toBeGreaterThan(r.lines.indexOf('  | 1 failed'))
    expect(w.gate).toHaveLength(2)
  })
  test('gate=fail with a red first run is not run again', async () => {
    const w = world([red(), ok()])
    const r = await verifyNative(input({ report: parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=fail files=src/a.ts,docs/x.md]]') }), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: held — gate=fail confirmed (gate red at a1b2c3d) — an honest terminal state')
    expect(w.gate).toHaveLength(1)
    expect(r.lines.some(l => l.startsWith('note: the gate was re-run'))).toBe(false)
  })
  test('exit 127 is not run again', async () => {
    const w = world([ok('', 127), ok()])
    const r = await verifyNative(input(), w.io)
    expect(claim(r.lines, 'gate').startsWith('claim gate: unchecked — UNVERIFIABLE')).toBe(true)
    expect(w.gate).toHaveLength(1)
  })
  test('a first run that did not complete is not run again', async () => {
    const w = world([{ ok: false, why: 'gate command timed out' }, ok()])
    const r = await verifyNative(input(), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — gate npm test did not run: gate command timed out')
    expect(w.gate).toHaveLength(1)
  })
  test('a tree that moved during the red first run is not run again', async () => {
    const w = world([red(), ok()], { head: ok('ffffffffffffffffffffffffffffffffffffffff\n') })
    const r = await verifyNative(input(), w.io)
    expect(claim(r.lines, 'gate')).toBe('claim gate: unchecked — the worktree changed while the gate ran (HEAD now fffffff); the gate was not judged')
    expect(w.gate).toHaveLength(1)
  })
  test('the first run of a red pair is written beside the second run\'s output', async () => {
    const w = world([red('first output\n'), red('second output\n')])
    const r = await verifyNative(input({ outDir: OUT, attempt: 2 }), w.io)
    expect(claim(r.lines, 'gate')).toBe(`claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1; output ${OUT}/verify-gate-2.txt)`)
    expect(w.written.get(`${OUT}/verify-gate-2.txt`)).toContain('second output')
    expect(w.written.get(`${OUT}/verify-gate-2-first.txt`)).toContain('first output')
  })
})
