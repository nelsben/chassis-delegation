// 3A: verifying a task that has no git repo (pure).
import { test, expect, describe } from 'claude-code/testing'
import { checkArgv } from '../hooks/lib/allow'
import { gateTemplatesOf, resolveGateRuns, splitCommand } from '../hooks/lib/gates'
import {
  globRoot,
  matchGlob,
  noRepoVerdict,
  normalizePath,
  reportFiles,
  resolveFile,
  scopeCheck,
  workTreeArgv,
  isNotWorkTree,
  noRepoVerdictText,
} from '../hooks/lib/norepo'

const MOD = '/Users/b/.claude/dev-mods/s1/chassis-delegation'

describe('3A: the allowlist takes claude plugin validate|test in exactly two shapes', () => {
  test('an absolute folder: accepted', () => {
    expect(checkArgv(['claude', 'plugin', 'validate', MOD]).ok).toBe(true)
    expect(checkArgv(['claude', 'plugin', 'test', MOD]).ok).toBe(true)
  })
  test('anything else under claude: refused', () => {
    for (const argv of [
      ['claude', 'plugin', 'validate'],
      ['claude', 'plugin', 'validate', 'relative/dir'],
      ['claude', 'plugin', 'validate', MOD, '--fix'],
      ['claude', 'plugin', 'install', MOD],
      ['claude', 'plugin', 'test', '/a/../etc'],
      ['claude', 'plugin', 'test', '-p'],
      ['claude', 'plugin', 'test', '/a b'],
      ['claude', 'plugin', 'test', '/a;rm'],
      ['claude', '-p', 'hi'],
      ['claude', 'mcp', 'list'],
    ]) {
      expect(checkArgv(argv).ok).toBe(false)
    }
  })
  test('sf and git push stay refused', () => {
    expect(checkArgv(['sf', 'project', 'deploy', 'start']).ok).toBe(false)
    expect(checkArgv(['git', 'push']).ok).toBe(false)
  })
})

describe('3A: paths and globs', () => {
  test('the first scope root is the folder before the first glob character', () => {
    expect(globRoot(`${MOD}/**`)).toBe(MOD)
    expect(globRoot('/a/src/*.ts')).toBe('/a/src')
    expect(globRoot('/a/foo*')).toBe('/a')
    expect(globRoot('/a/b/')).toBe('/a/b')
    expect(globRoot('/a/b')).toBe('/a/b')
  })
  test('normalized paths; a .. segment is refused', () => {
    expect(normalizePath('/a//b/./c')).toBe('/a/b/c')
    expect(normalizePath('/a/../b')).toBeUndefined()
    expect(resolveFile('hooks/lib/x.ts', MOD)).toBe(`${MOD}/hooks/lib/x.ts`)
    expect(resolveFile('/etc/passwd', MOD)).toBe('/etc/passwd')
  })
  test('globs: ** spans folders, * stays in one, ? is one character', () => {
    expect(matchGlob(`${MOD}/hooks/lib/x.ts`, `${MOD}/**`)).toBe(true)
    expect(matchGlob(MOD, `${MOD}/**`)).toBe(true)
    expect(matchGlob(`${MOD}-other/x.ts`, `${MOD}/**`)).toBe(false)
    expect(matchGlob('/a/src/x.ts', '/a/src/*.ts')).toBe(true)
    expect(matchGlob('/a/src/d/x.ts', '/a/src/*.ts')).toBe(false)
    expect(matchGlob('/a/b/x.ts', '/a/**/x.ts')).toBe(true)
    expect(matchGlob('/a/x.ts', '/a/**/x.ts')).toBe(true)
    expect(matchGlob('/a/x1.ts', '/a/x?.ts')).toBe(true)
    expect(matchGlob('/a/x.md', '/a/*.{ts,md}')).toBe(true)
  })
  test('report files: comma list, none and blanks dropped', () => {
    expect(reportFiles('hooks/a.ts, README.md,,')).toEqual(['hooks/a.ts', 'README.md'])
    expect(reportFiles('none')).toEqual([])
    expect(reportFiles(undefined)).toEqual([])
  })
  test('scope check: out of scope, forbidden, a .. path', () => {
    const r = scopeCheck({
      files: ['hooks/a.ts', '/etc/passwd', 'secret/k.txt', '../x'],
      root: MOD,
      scope: [`${MOD}/**`],
      forbid: [`${MOD}/secret/**`],
    })
    expect(r.inScope).toEqual([`${MOD}/hooks/a.ts`])
    expect(r.outOfScope).toEqual(['/etc/passwd', '../x'])
    expect(r.forbidden).toEqual([`${MOD}/secret/k.txt`])
  })
  test('the work-tree probe and how its answer reads', () => {
    expect(workTreeArgv('/x')).toEqual(['git', '-C', '/x', 'rev-parse', '--is-inside-work-tree'])
    expect(checkArgv(workTreeArgv('/x')).ok).toBe(true)
    expect(isNotWorkTree({ exitCode: 128, stdout: '' })).toBe(true)
    expect(isNotWorkTree({ exitCode: 0, stdout: 'false\n' })).toBe(true)
    expect(isNotWorkTree({ exitCode: 0, stdout: 'true\n' })).toBe(false)
  })
})

describe('3A: the gate of a no-repo brief (resolveGateRuns, shared with the native verifier)', () => {
  const MAP = { prettier: 'bash scripts/ci/gates/prettier-changed.sh {files}' }
  const allowed = (argv: readonly string[]) => checkArgv(argv, { gateTemplates: gateTemplatesOf(MAP) }).ok
  test('a bare command the allowlist accepts runs as written', () => {
    const g = resolveGateRuns(`claude plugin validate ${MOD}`, MAP, allowed, '/s/T/files.txt')
    expect(g.runs).toEqual([{ label: `claude plugin validate ${MOD}`, argv: ['claude', 'plugin', 'validate', MOD] }])
    expect(g.notRerun).toEqual([])
  })
  test('a gate-map id runs its command; an unknown id is named not re-run', () => {
    const g = resolveGateRuns('prettier,G2', MAP, allowed, '/s/T/files.txt')
    expect(g.runs).toEqual([{ label: 'bash scripts/ci/gates/prettier-changed.sh {files}', argv: ['bash', 'scripts/ci/gates/prettier-changed.sh', '/s/T/files.txt'] }])
    expect(g.notRerun).toEqual([{ id: 'G2', why: 'not in gateMap' }])
  })
  test('a command the allowlist refuses never runs', () => {
    const g = resolveGateRuns('npm test', MAP, allowed, '/s/f')
    expect(g.runs).toEqual([])
    expect(g.notRerun).toEqual([{ id: 'npm test', why: 'not in gateMap' }])
    expect(splitCommand('claude  plugin test /x')).toEqual(['claude', 'plugin', 'test', '/x'])
  })
  test('no gate at all', () => {
    expect(resolveGateRuns(undefined, MAP, allowed, '/s/f')).toMatchObject({ runs: [], notRerun: [], none: true })
  })
})

describe('3A: the no-repo verdict', () => {
  const base = { root: MOD, files: [`${MOD}/hooks/a.ts`], missing: [], outOfScope: [], forbidden: [], gates: [{ label: `claude plugin validate ${MOD}`, exitCode: 0 }], notRerun: [], noGate: false }
  test('files there, in scope, the gate exits 0: verified (no repo)', () => {
    const v = noRepoVerdict(base)
    expect(v.verdict).toBe('verified')
    expect(v.lines).toContain(`claim files: held — 1 file under ${MOD}`)
    expect(v.lines).toContain(`claim gate: held — claude plugin validate ${MOD} exited 0`)
    expect(noRepoVerdictText(v)).toBe('verified (no repo)')
  })
  test('a file outside scope: refuted (no repo) and says which', () => {
    const v = noRepoVerdict({ ...base, outOfScope: ['/etc/passwd'], gates: [] })
    expect(v.verdict).toBe('refuted')
    expect(v.why).toBe('out of scope: /etc/passwd')
    expect(noRepoVerdictText(v)).toBe('refuted (no repo): out of scope: /etc/passwd')
  })
  test('a missing file, a forbidden file, a red gate', () => {
    expect(noRepoVerdict({ ...base, missing: [`${MOD}/gone.ts`] }).why).toBe(`missing: ${MOD}/gone.ts`)
    expect(noRepoVerdict({ ...base, forbidden: [`${MOD}/secret/k`] }).why).toBe(`forbidden: ${MOD}/secret/k`)
    const red = noRepoVerdict({ ...base, gates: [{ label: 'claude plugin validate /m', exitCode: 1 }] })
    expect(red.verdict).toBe('refuted')
    expect(red.why).toBe('gate claude plugin validate /m exited 1')
  })
  test('a gate that could not run, or none: unverified, never verified', () => {
    expect(noRepoVerdict({ ...base, gates: [], notRerun: ['G2'] })).toMatchObject({ verdict: 'unverified', why: 'gate not re-run: G2' })
    expect(noRepoVerdict({ ...base, gates: [], noGate: true })).toMatchObject({ verdict: 'unverified', why: 'no gate= in the brief' })
    expect(noRepoVerdict({ ...base, gates: [{ label: 'x', error: 'timed out' }] })).toMatchObject({ verdict: 'unverified', why: 'gate x did not run: timed out' })
  })
})
