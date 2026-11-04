import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { parseReport } from '../hooks/lib/brief'
import { verifyNative, type ExecOut } from '../hooks/lib/verify-native'

// MOD-294 (#388): through verifyNative, a round-2 partial files= is held against the round delta
const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const R1 = 'bbbbbbb'
const BRIEF = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=x/** gate=test budget=2-attempts report=chassis.report.v1]]\n\nbody\n'
const ok = (stdout = ''): ExecOut => ({ ok: true, exitCode: 0, stdout, stderr: '' })
const git = (...args: string[]) => ['git', '-C', REPO, ...args].join(' ')
const table: Record<string, ExecOut> = {
  [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(FULL + '\n'),
  [git('rev-parse', '--verify', '--quiet', 'refs/heads/agent/ops/T-1')]: ok(FULL + '\n'),
  [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: ok(),
  [git('rev-parse', '--verify', '--quiet', 'origin/main')]: ok(MB + '\n'),
  [git('merge-base', 'origin/main', FULL)]: ok(MB + '\n'),
  [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tdocs/x.md\n'),
  [git('diff', '--name-status', '-M', R1, FULL)]: ok('A\tdocs/x.md\n'),
  [git('rev-parse', 'a1b2c3d^{commit}', 'HEAD', 'refs/heads/agent/ops/T-1')]: ok([FULL, FULL, FULL].join('\n') + '\n'),
  [git('rev-parse', 'HEAD')]: ok(FULL + '\n'),
  [git('status', '--porcelain=v1', '--untracked-files=all', '-z')]: ok(''),
  'npm test': ok('all green\n'),
}
const run = (files: string, roundBase?: string) =>
  verifyNative(
    {
      repo: REPO,
      report: parseReport(`[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=pass files=${files}]]`),
      briefText: BRIEF,
      gateMap: { test: 'npm test' },
      allowed: (argv: readonly string[]) => argv.join(' ') === 'npm test',
      filesPath: '/r/.delegation/T-1/files.txt',
      ...(roundBase ? { roundBase } : {}),
    },
    { exec: async argv => table[argv.join(' ')] ?? { ok: true, exitCode: 1, stdout: '', stderr: 'no answer' }, write: async () => {}, readRed: async () => ({ exists: false }) },
  )

describe('MOD-294: the files claim of a later round', () => {
  test('a partial list is held against the round delta; a cumulative one against the branch; a short one is refuted naming the round base', async () => {
    expect((await run('docs/x.md', R1)).lines).toContain('claim files: held — files= matches the round delta since bbbbbbb exactly')
    expect((await run('src/a.ts,docs/x.md', R1)).lines.some(l => l.includes('matches the branch delta since'))).toBe(true)
    const bad = await run('src/a.ts', R1)
    expect(bad.verdict).toBe('refuted')
    expect(bad.lines.some(l => l.includes('omits docs/x.md') && l.includes('round base bbbbbbb'))).toBe(true)
    expect((await run('src/a.ts')).lines).toContain('claim files: compared against dispatch base origin/main')
  })
})
