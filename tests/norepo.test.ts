// 3A: verifying a task that has no git repo (pure).
import { test, expect, describe } from 'claude-code/testing'
import { checkArgv } from '../hooks/lib/allow'
import { gateTemplatesOf, resolveGateRuns, splitCommand } from '../hooks/lib/gates'
import {
  attributeWrites,
  isDelegationPath,
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
  outsideCheck,
  outsideClaim,
  outsideDirOf,
  outsideFileName,
  outsideFilePath,
  isOutsideFile,
  type RootListing,
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
  test('files there, in scope, the gate exits 0: consistent (no repo)', () => {
    const v = noRepoVerdict(base)
    expect(v.verdict).toBe('consistent')
    expect(v.lines).toContain(`claim files: held — 1 file under ${MOD}`)
    expect(v.lines).toContain(`claim gate: held — claude plugin validate ${MOD} exited 0`)
    expect(noRepoVerdictText(v)).toBe('consistent (no repo)')
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
  test('a gate that could not run, or none: unverified, never consistent', () => {
    expect(noRepoVerdict({ ...base, gates: [], notRerun: ['G2'] })).toMatchObject({ verdict: 'unverified', why: 'gate not re-run: G2' })
    expect(noRepoVerdict({ ...base, gates: [], noGate: true })).toMatchObject({ verdict: 'unverified', why: 'no gate= in the brief' })
    expect(noRepoVerdict({ ...base, gates: [{ label: 'x', error: 'timed out' }] })).toMatchObject({ verdict: 'unverified', why: 'gate x did not run: timed out' })
  })
})

describe('MOD-85: a root too big to list is checked by modification time', () => {
  const mark: RootListing = { root: '/big', since: 1000, files: 30000 }
  const after = (entries: { path: string; size: number; mtimeMs: number }[], dirs: { path: string; mtimeMs: number }[] = []): RootListing => ({ root: '/big', entries, dirs })

  test('a file newer than since under a forbid root fails the claim, naming it', () => {
    const c = outsideClaim({ before: [mark], after: [after([{ path: 'a/b.txt', size: 1, mtimeMs: 2000 }, { path: 'old.txt', size: 1, mtimeMs: 10 }])], scope: ['/out/**'], forbid: ['/big/**'] })
    expect(c).toEqual({ status: 'failed', detail: 'touches forbid path: /big/a/b.txt (outside delta)' })
  })
  test('only a newer folder (a deletion) under a forbid root fails, naming the folder', () => {
    const c = outsideClaim({ before: [mark], after: [after([], [{ path: 'a', mtimeMs: 2000 }])], scope: [], forbid: ['/big/**'] })
    expect(c).toEqual({ status: 'failed', detail: 'touches forbid path: /big/a (outside delta)' })
    const root = outsideClaim({ before: [mark], after: [after([], [{ path: '', mtimeMs: 2000 }])], scope: [], forbid: ['/big/**'] })
    expect(root?.detail).toBe('touches forbid path: /big (outside delta)')
  })
  test('nothing newer holds, said to be checked by modification time', () => {
    const c = outsideClaim({ before: [mark], after: [after([])], scope: [], forbid: ['/big/**'] })
    expect(c?.status).toBe('held')
    expect(c?.detail).toContain('modification time')
  })
  test('a newer path within scope and outside forbid holds', () => {
    const c = outsideClaim({ before: [mark], after: [after([{ path: 'n.txt', size: 1, mtimeMs: 2000 }])], scope: ['/big/**'], forbid: [] })
    expect(c?.status).toBe('held')
  })
  test('a walk past the hard ceiling is unchecked, naming the root and the ceiling', async () => {
    const c = await outsideCheck([], ['/big/**'], { before: [mark], list: async root => ({ root, error: 'more than 1000000 entries' }) })
    expect(c?.status).toBe('unchecked')
    expect(c?.detail).toContain('/big')
    expect(c?.detail).toContain('1000000')
  })
  test('outsideCheck hands the watermark time to the lister', async () => {
    const seen: (number | undefined)[] = []
    await outsideCheck([], ['/big/**'], { before: [mark], list: async (root, since) => (seen.push(since), after([])) })
    expect(seen).toEqual([1000])
  })
})

describe('MOD-185: the mod and the lead write in the session checkout, and the outside delta ignores it', () => {
  const S = '/s/co'
  const IGN = [`${S}/.delegation`, `${S}/docs/cards`]
  const e = (path: string, mtimeMs: number, size = 1) => ({ path, size, mtimeMs })
  const before: RootListing = { root: S, entries: [e('hooks/x.ts', 10), e('.delegation/ledger.jsonl', 10), e('.delegation/briefs/T-1.brief.md', 10)] }
  const afterMod: RootListing = { root: S, entries: [e('hooks/x.ts', 10), e('.delegation/ledger.jsonl', 20, 2), e('.delegation/briefs/T-1.brief.md', 20, 2), e('docs/cards/T-2-x.md', 20)] }
  const claim = (after: RootListing, ignore: readonly string[] | undefined, b: RootListing = before) =>
    outsideClaim({ before: [b], after: [after], scope: ['/out/**'], forbid: [`${S}/**`], ...(ignore ? { ignore } : {}) })

  test('a forbid over the checkout holds when only the ledger, a brief and a new card changed, and names the count', () => {
    const c = claim(afterMod, IGN)
    expect(c?.status).toBe('held')
    expect(c?.detail).toContain('ignored 3 paths the mod and the lead write (.delegation/, docs/cards)')
  })
  test('without an ignore list the same listing is refuted as before', () => {
    expect(claim(afterMod, undefined)?.status).toBe('failed')
  })
  test('a real change beside them still fails, naming only that path', () => {
    const c = claim({ root: S, entries: [...afterMod.entries.filter(x => x.path !== 'hooks/x.ts'), e('hooks/x.ts', 20, 5)] }, IGN)
    expect(c).toEqual({ status: 'failed', detail: `touches forbid path: ${S}/hooks/x.ts (outside delta)` })
  })
  test('a custom cards folder is ignored and docs/cards then is not', () => {
    const c = claim({ root: S, entries: [...afterMod.entries, e('work/cards/T-3.md', 20)] }, [`${S}/.delegation`, `${S}/work/cards`])
    expect(c).toEqual({ status: 'failed', detail: `touches forbid path: ${S}/docs/cards/T-2-x.md (outside delta)` })
    const ok = claim({ root: S, entries: [...before.entries, e('work/cards/T-3.md', 20)] }, [`${S}/.delegation`, `${S}/work/cards`])
    expect(ok?.detail).toContain('ignored 1 path the mod and the lead write (.delegation/, work/cards)')
  })
  test('a sibling folder sharing the prefix is not ignored', () => {
    const c = claim({ root: S, entries: [...before.entries, e('.delegation-x/a', 20)] }, IGN)
    expect(c?.status).toBe('failed')
  })
  test('nothing ignored leaves the detail unchanged', () => {
    const c = claim(before, IGN)
    expect(c?.detail).toBe(`outside delta: nothing changed under ${S}`)
  })
  test('the ignore applies in modification-time mode, files and folders alike', () => {
    const mark: RootListing = { root: S, since: 15, files: 20000 }
    const after: RootListing = { root: S, entries: [e('.delegation/ledger.jsonl', 20), e('.delegation/briefs/T-1.brief.md', 20), e('docs/cards/T-2-x.md', 20), e('hooks/old.ts', 5)], dirs: [{ path: '.delegation/briefs', mtimeMs: 20 }] }
    const c = claim(after, IGN, mark)
    expect(c?.status).toBe('held')
    expect(c?.detail).toContain('ignored 4 paths the mod and the lead write')
    expect(c?.detail).toContain('modification time')
    const bad = claim({ ...after, entries: [...after.entries, e('hooks/x.ts', 20)] }, IGN, mark)
    expect(bad).toEqual({ status: 'failed', detail: `touches forbid path: ${S}/hooks/x.ts (outside delta)` })
  })
  test('outsideCheck passes the ignore list on', async () => {
    const c = await outsideCheck([], [`${S}/**`], { before: [before], list: async () => afterMod }, IGN)
    expect(c?.status).toBe('held')
  })
})

describe('MOD-186: a repo=none listing lives in a file under the session .delegation/outside/ folder', () => {
  const S = '/s/co'
  test('the file name is the scoped id with every character outside [A-Za-z0-9._-] made _', () => {
    expect(outsideFileName('OPS-9@/srv/my repo')).toBe('OPS-9__srv_my_repo.json')
    expect(outsideFileName('T-1')).toBe('T-1.json')
  })
  test('the folder and the path sit under the session root, a trailing slash ignored', () => {
    expect(outsideDirOf(`${S}/`)).toBe(`${S}/.delegation/outside`)
    expect(outsideFilePath(S, 'T-1@/o')).toBe(`${S}/.delegation/outside/T-1__o.json`)
  })
  test('only a file directly under that folder is one the mod may drop', () => {
    expect(isOutsideFile(S, `${S}/.delegation/outside/T-1.json`)).toBe(true)
    expect(isOutsideFile(S, `${S}/.delegation/outside/../ledger.jsonl`)).toBe(false)
    expect(isOutsideFile(S, `${S}/.delegation/ledger.jsonl`)).toBe(false)
    expect(isOutsideFile(S, `/elsewhere/.delegation/outside/T-1.json`)).toBe(false)
    expect(isOutsideFile(S, `${S}/.delegation/outside/a/b.json`)).toBe(false)
    expect(isOutsideFile('', `/x.json`)).toBe(false)
  })
})

describe('MOD-217: attributing changed paths to the worker', () => {
  test('an empty or absent log attributes every path to the worker', () => {
    expect(attributeWrites(['/a/x', '/a/y'], undefined)).toEqual({ mine: ['/a/x', '/a/y'], foreign: [] })
    expect(attributeWrites(['/a/x'], [])).toEqual({ mine: ['/a/x'], foreign: [] })
  })
  test('a path in the log is the worker\'s; the rest are foreign', () => {
    expect(attributeWrites(['/a/x', '/a/y'], ['/a/x'])).toEqual({ mine: ['/a/x'], foreign: ['/a/y'] })
  })
  test('a folder the worker wrote into, and a file under a folder it wrote, are the worker\'s; a trailing slash is ignored', () => {
    expect(attributeWrites(['/a/dir', '/a/new/f.txt', '/a/other/'], ['/a/dir/f.txt', '/a/new'])).toEqual({ mine: ['/a/dir', '/a/new/f.txt'], foreign: ['/a/other/'] })
    expect(attributeWrites(['/a/dir/'], ['/a/dir/f.txt'])).toEqual({ mine: ['/a/dir/'], foreign: [] })
  })
  test('.delegation is recognised under any root, and not as a substring', () => {
    expect(isDelegationPath('/repo/.delegation/T-1/files.txt')).toBe(true)
    expect(isDelegationPath('.delegation/briefs/T-1.brief.md')).toBe(true)
    expect(isDelegationPath('/work/wt/.delegation')).toBe(true)
    expect(isDelegationPath('/repo/x.delegation/a')).toBe(false)
    expect(isDelegationPath('/repo/src/delegation/a')).toBe(false)
  })
  test('the outside claim leaves .delegation out and lists an unwritten path without judging it', () => {
    const before: RootListing[] = [{ root: '/out', entries: [] }]
    const after: RootListing[] = [{ root: '/out', entries: [{ path: 'a/mine.txt', size: 1, mtimeMs: 1 }, { path: 'a/theirs.txt', size: 1, mtimeMs: 1 }, { path: 'wt/.delegation/T-2/files.txt', size: 1, mtimeMs: 1 }] }]
    const r = outsideClaim({ before, after, scope: ['/out/a/mine.txt'], forbid: ['/out/wt/**'], writes: ['/out/a/mine.txt'] })
    expect(r?.status).toBe('held')
    expect(r?.foreign).toEqual(['/out/a/theirs.txt'])
    expect(outsideClaim({ before, after, scope: ['/out/a/mine.txt'], forbid: [], writes: ['/out/a/theirs.txt'] })?.status).toBe('failed')
  })
})
