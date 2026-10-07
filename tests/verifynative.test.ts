import { test, expect, describe } from 'claude-code/testing'
import { parseReport } from '../hooks/lib/brief'
import { BASE_REFS, briefContract, filesClaim, ignoredLine, nameStatusDelta, NO_BRIEF_REASON, pathMatchesAny, porcelainPaths, prNumber, redClaim, subtractDelta, verifyCardless, verifyNative, type ExecOut, type RedEvidence } from '../hooks/lib/verify-native'

const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=src/secret/** red_test="npm test" gate=test budget=2-attempts report=chassis.report.v1]]'
const BRIEF = `${HEADER}\n\nbody\n`
// GH-20: the brief has a red test, so the report names its failing output (red=), a file in the worker's tree
const RED_PATH = '.delegation/T-1/red-1.txt'
const RED_TEXT = '(fail) sums > adds two numbers\n    expected 3 toBe 4\n\n 0 pass\n 1 fail\n'
/** The table's stand-in for sha-256: equal bytes, equal hash. */
const fakeHash = (text: string) => `fake:${text}`
const report = (over: Record<string, string> = {}) => {
  const f = { branch: 'agent/ops/T-1', sha: 'a1b2c3d', gate: 'pass', files: 'src/a.ts,docs/x.md', pr: 'none', red: RED_PATH, ...over }
  const red = f.red === '' ? '' : ` red=${f.red}`
  return parseReport(`[[report v=1 task=T-1 subtask=main branch=${f.branch} pr=${f.pr} sha=${f.sha} gate=${f.gate}${red} files=${f.files}]]`)
}

type Table = Record<string, ExecOut | ((cwd?: string) => ExecOut)>
const ok = (stdout = ''): ExecOut => ({ ok: true, exitCode: 0, stdout, stderr: '' })
const exit = (code: number, stdout = '', stderr = ''): ExecOut => ({ ok: true, exitCode: code, stdout, stderr })
const git = (...args: string[]) => ['git', '-C', REPO, ...args].join(' ')

/** A repo where everything holds: the branch and sha exist, the tree is clean at the sha, the gate is green. */
function happy(over: Table = {}): Table {
  return {
    [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(FULL + '\n'),
    [git('rev-parse', '--verify', '--quiet', 'refs/heads/agent/ops/T-1')]: ok(FULL + '\n'),
    [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: ok(),
    [git('rev-parse', '--verify', '--quiet', 'origin/main')]: ok(MB + '\n'),
    [git('merge-base', 'origin/main', FULL)]: ok(MB + '\n'),
    [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tdocs/x.md\n'),
    [git('rev-parse', 'HEAD')]: ok(FULL + '\n'),
    [git('status', '--porcelain')]: ok(''),
    'npm test': ok('all green\n'),
    ...over,
  }
}

function io(table: Table, files: Record<string, string> = { [`${REPO}/${RED_PATH}`]: RED_TEXT }) {
  const calls: { argv: string[]; cwd?: string }[] = []
  const writes: Record<string, string> = {}
  const reads: string[] = []
  return {
    calls,
    writes,
    reads,
    readRed: async (path: string): Promise<RedEvidence> => {
      reads.push(path)
      const text = files[path]
      return text === undefined ? { exists: false } : { exists: true, bytes: new TextEncoder().encode(text).length, text, hash: fakeHash(text) }
    },
    exec: async (argv: readonly string[], init?: { cwd?: string }): Promise<ExecOut> => {
      calls.push({ argv: [...argv], cwd: init?.cwd })
      const hit = table[argv.join(' ')]
      if (hit === undefined) return exit(1, '', `no such answer: ${argv.join(' ')}`)
      return typeof hit === 'function' ? hit(init?.cwd) : hit
    },
    write: async (path: string, text: string) => {
      writes[path] = text
    },
  }
}

const input = (over: Partial<Parameters<typeof verifyNative>[0]> = {}) => ({
  repo: REPO,
  report: report(),
  briefText: BRIEF,
  gateMap: { test: 'npm test' },
  allowed: (argv: readonly string[]) => argv.join(' ') === 'npm test',
  filesPath: '/r/.delegation/T-1/files.txt',
  ...over,
})

describe('5A: matching paths the way the chassis verifier matched them', () => {
  test('* crosses folders, a trailing / means everything under it, ** is *', () => {
    expect(pathMatchesAny('src/a/b.ts', ['src/*'])).toBe(true)
    expect(pathMatchesAny('docs/a/b.md', ['docs/'])).toBe(true)
    expect(pathMatchesAny('chassis/bin/x.sh', ['chassis/**'])).toBe(true)
    expect(pathMatchesAny('app/billing/RateService.ts', ['app/billing/Rate*.ts'])).toBe(true)
    expect(pathMatchesAny('README.md', ['src/**', 'docs/'])).toBe(false)
    expect(pathMatchesAny('a.ts', ['?.ts'])).toBe(true)
    expect(pathMatchesAny('ab.ts', ['?.ts'])).toBe(false)
  })
})

describe('5A: the brief contract (scope, forbid, amendments, refusals)', () => {
  test('scope_globs and forbid_globs replace scope and forbid', () => {
    const c = briefContract(`[[brief v=1 task=T scope=the Rate classes scope_globs=a/**,b.ts forbid=x/** forbid_globs=y/** gate=g]]`)
    expect(c).toMatchObject({ ok: true, scope: ['a/**', 'b.ts'], forbid: ['y/**'] })
  })
  test('a prose scope with no scope_globs= is ok with scope [] and scopeProse (GH-103); no scope= at all is BRIEF-UNPARSEABLE', () => {
    const prose = briefContract('[[brief v=1 task=T scope=the provider classes and their tests gate=g]]')
    expect(prose).toMatchObject({ ok: true, scope: [], scopeProse: true })
    const none = briefContract('[[brief v=1 task=T gate=g]]')
    expect(none.ok ? '' : none.line).toContain('refuse: BRIEF-UNPARSEABLE — the brief header carries no scope= field')
    const open = briefContract('no header here')
    expect(open.ok ? '' : open.line).toContain('refuse: BRIEF-UNPARSEABLE — no closing ]] found in the brief header')
  })
  test('amend blocks in the brief widen it in order, each disclosed; a malformed one is refused and leaves scope unknowable', () => {
    const c = briefContract(`${HEADER}\nbody\n[[amend v=1 scope+=scripts/x.sh reason=the selftest lives there]]\n[[amend v=1 forbid+=src/gen/** reason=generated]]\n`)
    expect(c).toMatchObject({ ok: true, scope: ['src/**', 'docs/', 'scripts/x.sh'], forbid: ['src/secret/**', 'src/gen/**'] })
    expect(c.ok ? c.lines : []).toEqual([
      'amendment: #1 scope+=scripts/x.sh — reason: the selftest lives there',
      'amendment: #2 forbid+=src/gen/** — reason: generated',
    ])
    const bad = briefContract(`${HEADER}\n[[amend v=1 scope+=x reason=]]\n`)
    expect(bad).toMatchObject({ ok: true, amendBad: true, scope: ['src/**', 'docs/'] })
    expect(bad.ok ? bad.lines[0] : '').toContain('amendment: REFUSED — AMEND-MALFORMED:')
  })
})

describe('5A: the files claim names what is missing and what is extra', () => {
  test('equal sets hold; a difference fails naming each path', () => {
    expect(filesClaim(['b', 'a'], ['a', 'b'])).toBe('claim files: held — files= matches the sha delta exactly')
    expect(filesClaim(['a', 'c'], ['a', 'b'])).toBe('claim files: failed — files= does not match the actual delta (omits or invents a path): omits b; invents c')
  })
  test('a trailing-slash folder entry stands for the delta files under it (GH-4)', () => {
    const delta = ['docs/img/a.png', 'docs/img/b.png']
    expect(filesClaim(['docs/img/'], delta)).toBe('claim files: held — files= matches the sha delta exactly (1 folder entry expanded)')
    expect(filesClaim(['docs/img/', 'x.md'], [...delta, 'x.md'])).toContain('(1 folder entry expanded)')
    expect(filesClaim(['docs/img/', 'docs/old/'], delta)).toBe('claim files: failed — files= does not match the actual delta (omits or invents a path): invents docs/old/')
    expect(filesClaim(['docs/img/', 'docs/'], delta)).toContain('(2 folder entries expanded)')
    expect(filesClaim(['docs/img/a.png'], delta)).toContain('omits docs/img/b.png')
  })
  test('pr= as a number, a pull URL, or none', () => {
    expect(prNumber('12')).toBe('12')
    expect(prNumber('https://github.com/o/r/pull/931/files')).toBe('931')
    expect(prNumber('none')).toBeUndefined()
    expect(prNumber('main')).toBeNull()
  })
})

describe('5A: verifyNative against a repo answered from a table', () => {
  test('every claim holds: verified; files.txt written before the gate; the gate runs in the worker worktree', async () => {
    const t = io(happy())
    const r = await verifyNative(input(), t)
    expect(r.verdict).toBe('verified')
    expect(r.lines).toEqual([
      'claim branch: held — refs/heads/agent/ops/T-1',
      'claim sha: held — a1b2c3d4e reachable on agent/ops/T-1',
      'claim scope: held — every changed path since origin/main is within scope=[src/**,docs/], forbid=[src/secret/**] untouched',
      'claim files: held — files= matches the sha delta exactly',
      'claim gate: held — gate green at a1b2c3d (gate=pass confirmed)',
      'claim red: held — .delegation/T-1/red-1.txt, 70 bytes, first failure line: (fail) sums > adds two numbers',
      'claim pr: held — no PR claimed',
    ])
    expect(t.writes['/r/.delegation/T-1/files.txt']).toBe('src/a.ts\ndocs/x.md\n')
    expect(t.calls.find(c => c.argv[0] === 'npm')).toEqual({ argv: ['npm', 'test'], cwd: REPO })
    // never a fresh checkout: no worktree add, no fetch, no bootstrap
    expect(t.calls.some(c => c.argv.includes('worktree') || c.argv.includes('fetch'))).toBe(false)
  })
  test('a sha that does not exist is a fabrication: refuted', async () => {
    const t = io(happy({ [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: exit(1) }))
    const r = await verifyNative(input(), t)
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain(`claim sha: failed — sha 'a1b2c3d' does not exist in ${REPO} (fabrication)`)
  })
  test('a sha not on the branch: refuted', async () => {
    const t = io(happy({ [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: exit(1) }))
    const r = await verifyNative(input(), t)
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim sha: failed — sha a1b2c3d exists but is NOT reachable on agent/ops/T-1')
  })
  test('a dirty tree, or a HEAD other than the sha: the gate is unchecked and never run', async () => {
    const dirty = io(happy({ [git('status', '--porcelain')]: ok(' M src/a.ts\n?? tmp.txt\n') }))
    const r = await verifyNative(input(), dirty)
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim gate: unchecked — tree not at sha: 2 uncommitted paths in the worktree; the gate was not re-run')
    expect(dirty.calls.some(c => c.argv[0] === 'npm')).toBe(false)
    const moved = io(happy({ [git('rev-parse', 'HEAD')]: ok('f'.repeat(40) + '\n') }))
    expect((await verifyNative(input(), moved)).lines).toContain(`claim gate: unchecked — tree not at sha: HEAD is ffffffffff, not a1b2c3d4e5; the gate was not re-run`)
  })
  test('files= that misses a changed path: refuted, naming it', async () => {
    const r = await verifyNative(input({ report: report({ files: 'src/a.ts' }) }), io(happy()))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): omits docs/x.md')
  })
  test('GH-102: a rename line in the diff is its new path, listed once; an old path in files= is dropped', async () => {
    const diff = { [git('diff', '--name-status', '-M', MB, FULL)]: ok('R100\tdocs/old/x.md\tdocs/new/x.md\nA\tsrc/a.ts\n') }
    const once = await verifyNative(input({ report: report({ files: 'src/a.ts,docs/new/x.md' }) }), io(happy(diff)))
    expect(once.lines).toContain('claim files: held — files= matches the sha delta exactly')
    const both = await verifyNative(input({ report: report({ files: 'src/a.ts,docs/old/x.md,docs/new/x.md' }) }), io(happy(diff)))
    expect(both.lines).toContain('claim files: held — files= matches the sha delta exactly (1 rename collapsed)')
    const missing = await verifyNative(input({ report: report({ files: 'src/a.ts' }) }), io(happy(diff)))
    expect(missing.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): omits docs/new/x.md')
  })
  test('GH-102: nameStatusDelta reads M, A, D, and R lines', () => {
    expect(nameStatusDelta('M\ta.ts\nR087\tb/o.md\tb/n.md\nD\tc.ts\n')).toEqual({ paths: ['a.ts', 'b/n.md', 'c.ts'], renamedFrom: ['b/o.md'] })
  })
  test('GH-102: filesClaim drops an old path of a rename', () => {
    expect(filesClaim(['n', 'o'], ['n'], 'the sha delta', ['o'])).toBe('claim files: held — files= matches the sha delta exactly (1 rename collapsed)')
    expect(filesClaim(['n'], ['n'], 'the sha delta', ['o'])).toBe('claim files: held — files= matches the sha delta exactly')
  })
  test('a path out of scope, or in a forbid: refuted on scope', async () => {
    const out = await verifyNative(input({ report: report({ files: 'src/a.ts,README.md' }) }), io(happy({ [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tREADME.md\n') })))
    expect(out.lines).toContain('claim scope: failed — out-of-scope path: README.md')
    const forb = await verifyNative(input({ report: report({ files: 'src/secret/k.ts' }) }), io(happy({ [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/secret/k.ts\n') })))
    expect(forb.lines).toContain('claim scope: failed — touches forbid path: src/secret/k.ts')
  })
  test('a red gate under gate=pass: refuted, with the gate output tail under the claim', async () => {
    const out = Array.from({ length: 10 }, (_, i) => `line ${i + 1}`).join('\n')
    const r = await verifyNative(input(), io(happy({ 'npm test': exit(1, out, 'boom') })))
    expect(r.verdict).toBe('refuted')
    const at = r.lines.indexOf('claim gate: failed — gate=pass claimed but the gate is RED at a1b2c3d (exit 1)')
    expect(at).toBeGreaterThan(-1)
    expect(r.lines.slice(at + 1, at + 9)).toEqual(['  | line 4', '  | line 5', '  | line 6', '  | line 7', '  | line 8', '  | line 9', '  | line 10', '  | boom'])
    // an honest gate=fail over a red gate holds
    const honest = await verifyNative(input({ report: report({ gate: 'fail' }) }), io(happy({ 'npm test': exit(1) })))
    expect(honest.lines).toContain('claim gate: held — gate=fail confirmed (gate red at a1b2c3d) — an honest terminal state')
  })
  test('126/127 is the environment, not a red gate: unchecked', async () => {
    const r = await verifyNative(input(), io(happy({ 'npm test': exit(127, '', 'npm: command not found') })))
    expect(r.verdict).toBe('unverified')
    expect(r.lines.some(l => l.startsWith("claim gate: unchecked — UNVERIFIABLE — environment not established: gate 'npm test' exited 127"))).toBe(true)
  })
  test('a gate id the map lacks is named, never run raw', async () => {
    const t = io(happy())
    const r = await verifyNative(input({ gateMap: {} }), t)
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim gate: unchecked — gate not re-run: test (not in gateMap)')
    expect(t.calls.some(c => c.argv[0] === 'npm' || c.argv[0] === 'test')).toBe(false)
  })
  test('a replay verifies against its base, not origin/main', async () => {
    const t = io(happy({ [git('merge-base', '96014e3b', FULL)]: ok(MB + '\n') }))
    const r = await verifyNative(input({ base: '96014e3b' }), t)
    expect(r.verdict).toBe('verified')
    expect(t.calls.some(c => c.argv.join(' ') === git('merge-base', 'origin/main', FULL))).toBe(false)
  })
  test('with no origin the base falls back to main, then master', async () => {
    expect(BASE_REFS).toEqual(['origin/main', 'main', 'origin/master', 'master'])
    const t = io(happy({ [git('rev-parse', '--verify', '--quiet', 'origin/main')]: exit(1), [git('rev-parse', '--verify', '--quiet', 'main')]: ok(MB + '\n'), [git('merge-base', 'main', FULL)]: ok(MB + '\n') }))
    expect((await verifyNative(input(), t)).verdict).toBe('verified')
  })
  test('a PR number must exist (gh pr view <n> --json state); a missing one is unchecked', async () => {
    const seen = io(happy({ 'gh pr view 931 --json state': ok('{"state":"OPEN"}') }))
    const r = await verifyNative(input({ report: report({ pr: '931' }) }), seen)
    expect(r.lines).toContain('claim pr: held — PR #931 exists (OPEN)')
    const gone = await verifyNative(input({ report: report({ pr: '932' }) }), io(happy()))
    expect(gone.verdict).toBe('unverified')
    expect(gone.lines).toContain('claim pr: unchecked — gh could not resolve 932 (offline / auth / not found)')
  })
  test('GH-103: a prose scope= with no scope_globs= leaves the scope claim unchecked and checks every other claim', async () => {
    const prose = BRIEF.replace('scope=src/**,docs/', 'scope=the provider classes and their tests')
    const r = await verifyNative(input({ briefText: prose }), io(happy()))
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim scope: unchecked — scope= reads as prose; add scope_globs= to the brief to check it')
    expect(r.lines).toContain('claim files: held — files= matches the sha delta exactly')
    expect(r.lines).toContain('claim gate: held — gate green at a1b2c3d (gate=pass confirmed)')
    expect(r.lines.filter(l => l.startsWith('claim ') && !l.startsWith('claim scope:')).every(l => l.startsWith('claim ') && l.includes(': held'))).toBe(true)
  })
  test('a refused brief runs nothing', async () => {
    const t = io(happy())
    const r = await verifyNative(input({ briefText: '[[brief v=1 task=T-1 gate=test]]' }), t)
    expect(r.verdict).toBe('refused')
    expect(t.calls).toHaveLength(0)
  })
})

describe('GH-20: redClaim, the red-test evidence a report names (red=)', () => {
  const ev = { redTest: 'npm test', path: RED_PATH, repo: REPO, exists: true, bytes: 70, text: RED_TEXT, hash: 'h1', priorHashes: [] as { attempt: number; hash: string }[] }
  test('a non-empty file in the worker tree with a failure line holds, with its size and first failure line', () => {
    expect(redClaim(ev)).toEqual({ status: 'held', detail: '.delegation/T-1/red-1.txt, 70 bytes, first failure line: (fail) sums > adds two numbers' })
  })
  test('the brief has no red test (absent, empty, none): no claim at all', () => {
    for (const redTest of [undefined, '', '  ', 'none', 'NONE', 'none (docs only)']) expect(redClaim({ ...ev, redTest })).toBeUndefined()
  })
  test('no red= (absent, empty or none) while the brief has a red test: unchecked, never failed', () => {
    for (const path of [undefined, '', 'none']) {
      expect(redClaim({ ...ev, path, exists: false })).toEqual({ status: 'unchecked', detail: "no red= evidence named; the brief asks for the red test's failing output" })
    }
  })
  test('a path outside the worker tree (absolute elsewhere, or ..) fails; an absolute or ./ path inside it holds', () => {
    expect(redClaim({ ...ev, path: '/etc/red.txt' })).toEqual({ status: 'failed', detail: `red=/etc/red.txt lies outside the worker's tree ${REPO}` })
    expect(redClaim({ ...ev, path: '../repo-T-0/.delegation/T-1/red-1.txt' })?.status).toBe('failed')
    expect(redClaim({ ...ev, path: '.delegation/../../x.txt' })?.status).toBe('failed')
    expect(redClaim({ ...ev, path: `${REPO}-other/red.txt` })?.status).toBe('failed')
    expect(redClaim({ ...ev, path: `${REPO}/.delegation/T-1/red-1.txt` })?.status).toBe('held')
    expect(redClaim({ ...ev, path: './.delegation/T-1/red-1.txt' })?.status).toBe('held')
  })
  test('a missing or empty file fails; one that could not be read is unchecked', () => {
    expect(redClaim({ ...ev, exists: false, bytes: undefined, text: undefined })).toEqual({ status: 'failed', detail: "red=.delegation/T-1/red-1.txt does not exist in the worker's tree" })
    expect(redClaim({ ...ev, bytes: 0, text: '' })).toEqual({ status: 'failed', detail: 'red=.delegation/T-1/red-1.txt is empty' })
    expect(redClaim({ ...ev, bytes: 3, text: ' \n\n' })?.status).toBe('failed')
    expect(redClaim({ ...ev, bytes: undefined, text: undefined, error: 'over 4 MiB' })).toEqual({ status: 'unchecked', detail: 'red=.delegation/T-1/red-1.txt could not be read: over 4 MiB' })
  })
  test('no failure marker in the text: unchecked', () => {
    expect(redClaim({ ...ev, text: 'all good\n 3 pass\n', bytes: 18 })).toEqual({ status: 'unchecked', detail: 'no failure marker found in red=.delegation/T-1/red-1.txt (18 bytes)' })
    expect(redClaim({ ...ev, text: 'exit code 0\n', bytes: 12 })?.status).toBe('unchecked')
  })
  test('any one marker suffices, case-insensitive', () => {
    for (const line of ['FAILED: 2', 'failing test', 'Error: boom', 'not ok 3 - sums', '\u2717 sums', 'Exit code 2', 'exit 1', 'AssertionError [ERR_ASSERTION]', 'Expected: 4', 'expected 3 toBe 4']) {
      expect(redClaim({ ...ev, text: `ran\n${line}\n`, bytes: 20 })).toEqual({ status: 'held', detail: `.delegation/T-1/red-1.txt, 20 bytes, first failure line: ${line}` })
    }
  })
  test('the first failure line is trimmed and cut to 100 characters', () => {
    const long = 'FAIL ' + 'x'.repeat(200)
    expect(redClaim({ ...ev, text: `ok\n   ${long}   \nfail again\n`, bytes: 300 })?.detail).toBe(`.delegation/T-1/red-1.txt, 300 bytes, first failure line: ${long.slice(0, 100)}`)
  })
  test("byte-identical to an earlier attempt's red file: failed, naming that attempt", () => {
    expect(redClaim({ ...ev, path: '.delegation/T-1/red-2.txt', priorHashes: [{ attempt: 1, hash: 'h1' }] })).toEqual({
      status: 'failed',
      detail: "red evidence is attempt 1's file again (red=.delegation/T-1/red-2.txt is byte-identical to it)",
    })
    expect(redClaim({ ...ev, hash: 'h2', priorHashes: [{ attempt: 1, hash: 'h1' }] })?.status).toBe('held')
    // no hash while earlier attempts have one: freshness is unknown, so unchecked
    expect(redClaim({ ...ev, hash: undefined, priorHashes: [{ attempt: 1, hash: 'h1' }] })?.status).toBe('unchecked')
  })
})

describe('GH-20: verifyNative reads the red evidence in the worker tree, after the gate', () => {
  const NO_RED = BRIEF.replace(' red_test="npm test"', ' red_test=none')
  test('held: the file is read under the repo, and the result carries its path and hash for the attempt record', async () => {
    const t = io(happy())
    const r = await verifyNative(input(), t)
    expect(r.verdict).toBe('verified')
    expect(t.reads).toEqual([`${REPO}/${RED_PATH}`])
    expect(r.red).toEqual({ path: RED_PATH, hash: fakeHash(RED_TEXT) })
  })
  test('no red= while the brief has a red test: unverified, naming the missing evidence; nothing is read', async () => {
    const t = io(happy())
    const r = await verifyNative(input({ report: report({ red: '' }) }), t)
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain("claim red: unchecked — no red= evidence named; the brief asks for the red test's failing output")
    expect(t.reads).toEqual([])
    expect(r.red).toBeUndefined()
  })
  test('red= naming a file not in the tree: refuted on red', async () => {
    const r = await verifyNative(input({ report: report({ red: '.delegation/T-1/red-9.txt' }) }), io(happy()))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain("claim red: failed — red=.delegation/T-1/red-9.txt does not exist in the worker's tree")
  })
  test('a brief with red_test=none yields no red claim', async () => {
    const r = await verifyNative(input({ briefText: NO_RED, report: report({ red: '' }) }), io(happy()))
    expect(r.verdict).toBe('verified')
    expect(r.lines.some(l => l.startsWith('claim red:'))).toBe(false)
  })
  test("a resume whose red file is byte-identical to attempt 1's: refuted on red", async () => {
    const files = { [`${REPO}/.delegation/T-1/red-2.txt`]: RED_TEXT }
    const r = await verifyNative(input({ report: report({ red: '.delegation/T-1/red-2.txt' }), priorRed: [{ attempt: 1, hash: fakeHash(RED_TEXT) }] }), io(happy(), files))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain("claim red: failed — red evidence is attempt 1's file again (red=.delegation/T-1/red-2.txt is byte-identical to it)")
  })
})

describe('GH-16: repo=here, the shared checkout (no worktree)', () => {
  const ROOTDIR = '/w/main'
  const HERE_HEADER = '[[brief v=1 task=GH-16 subtask=main purpose=build tier=frontier scope=src/**,docs/ forbid=src/secret/** gate=test repo=here ignore=.delegation/**,notes/scratch.md budget=3-attempts report=chassis.report.v1]]'
  const hgit = (...args: string[]) => ['git', '-C', ROOTDIR, ...args].join(' ')
  // staged, unstaged, untracked, a rename (-z: the new path, then the old one), the brain's notes, another card's file
  const PORCELAIN = [' M src/a.ts', 'A  src/new.ts', '?? .delegation/briefs/GH-16.brief.md', '?? notes/scratch.md', ' M src/b.ts', 'R  docs/new.md', 'docs/old.md', ''].join('\0')
  const hereTable = (over: Table = {}): Table => ({
    [hgit('rev-parse', '--abbrev-ref', 'HEAD')]: ok('main\n'),
    [hgit('status', '--porcelain=v1', '--untracked-files=all', '-z')]: ok(PORCELAIN),
    'npm test': ok('all green\n'),
    ...over,
  })
  const hereReport = (over: Record<string, string> = {}) => {
    const f = { branch: 'main', sha: 'HEAD', gate: 'pass', files: 'src/a.ts,src/new.ts,docs/new.md', ...over }
    return parseReport(`[[report v=1 task=GH-16 subtask=main branch=${f.branch} pr=none sha=${f.sha} gate=${f.gate} files=${f.files}]]`)
  }
  const hereInput = (over: Partial<Parameters<typeof verifyNative>[0]> = {}) => ({
    repo: ROOTDIR,
    here: true,
    report: hereReport(),
    briefText: `${HERE_HEADER}\n\nbody\n`,
    gateMap: { test: 'npm test' },
    allowed: (argv: readonly string[]) => argv.join(' ') === 'npm test',
    filesPath: '/w/main/.delegation/GH-16/files.txt',
    others: [{ card: 'GH-19', files: ['src/b.ts'] }],
    ...over,
  })

  test("files= is checked against the dirty-tree delta minus ignore= and minus another in-flight card's files", async () => {
    const t = io(hereTable())
    const r = await verifyNative(hereInput(), t)
    expect(r.lines).toEqual([
      'claim branch: held — main is the current branch of /w/main',
      'claim sha: held — sha=HEAD: the delta is the working tree (git status: staged, unstaged and untracked)',
      'ignored: 2 paths by ignore= (.delegation/briefs/GH-16.brief.md, notes/scratch.md), 1 path belonging to GH-19 (src/b.ts)',
      'claim scope: held — every changed path is within scope=[src/**,docs/], forbid=[src/secret/**] untouched',
      'claim files: held — files= matches the dirty-tree delta exactly',
      'claim gate: held — gate green in the shared checkout /w/main (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)',
      'claim pr: held — no PR claimed',
    ])
    expect(r.verdict).toBe('verified')
    expect(t.writes['/w/main/.delegation/GH-16/files.txt']).toBe('src/a.ts\nsrc/new.ts\ndocs/new.md\n')
    expect(t.calls.find(c => c.argv[0] === 'npm')).toEqual({ argv: ['npm', 'test'], cwd: ROOTDIR })
    // no worktree, no fetch, and no clean-tree check
    expect(t.calls.some(c => c.argv.includes('worktree') || c.argv.includes('fetch'))).toBe(false)
    expect(t.calls.some(c => c.argv.join(' ') === hgit('status', '--porcelain'))).toBe(false)
  })

  test('without the other card in flight its file stays in the delta: refuted, naming it', async () => {
    const r = await verifyNative(hereInput({ others: [] }), io(hereTable()))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('ignored: 2 paths by ignore= (.delegation/briefs/GH-16.brief.md, notes/scratch.md)')
    expect(r.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): omits src/b.ts')
  })

  test('a committed sha: the delta is merge-base(base, sha)..sha, base the brief names; ignore= still comes off', async () => {
    const briefText = `${HERE_HEADER.replace(' repo=here', ' repo=here base=main')}\n\nbody\n`
    const t = io(hereTable({
      [hgit('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(FULL + '\n'),
      [hgit('merge-base', 'main', FULL)]: ok(MB + '\n'),
      [hgit('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\t.delegation/notes.md\n'),
    }))
    const r = await verifyNative(hereInput({ briefText, report: hereReport({ sha: 'a1b2c3d', files: 'src/a.ts' }), others: [] }), t)
    expect(r.verdict).toBe('verified')
    expect(r.lines.slice(1, 3)).toEqual(['claim sha: held — a1b2c3d4e resolves in /w/main', 'ignored: 1 path by ignore= (.delegation/notes.md)'])
    expect(r.lines).toContain('claim files: held — files= matches the sha delta exactly')
    // no status read for a committed sha, and origin/main is never asked for
    expect(t.calls.some(c => c.argv.includes('status'))).toBe(false)
    expect(t.calls.some(c => c.argv.includes('origin/main'))).toBe(false)
  })

  test('the branch must be the checkout current one (else unchecked); a made-up sha is still a fabrication', async () => {
    const other = await verifyNative(hereInput({ report: hereReport({ branch: 'agent/mod/GH-16' }) }), io(hereTable()))
    expect(other.verdict).toBe('unverified')
    expect(other.lines[0]).toBe('claim branch: unchecked — report branch=agent/mod/GH-16 but /w/main is on main')
    const made = await verifyNative(hereInput({ report: hereReport({ sha: 'deadbeef' }) }), io(hereTable()))
    expect(made.verdict).toBe('refuted')
    expect(made.lines).toContain("claim sha: failed — sha 'deadbeef' does not exist in /w/main (fabrication)")
    expect(made.lines).toContain('claim gate: unchecked — sha missing — cannot re-run the gate')
    // sha=none reads the working tree too
    expect((await verifyNative(hereInput({ report: hereReport({ sha: 'none' }) }), io(hereTable()))).verdict).toBe('verified')
  })

  test('git status failing leaves scope and files unchecked', async () => {
    const r = await verifyNative(hereInput(), io(hereTable({ [hgit('status', '--porcelain=v1', '--untracked-files=all', '-z')]: exit(128, '', 'not a git repository') })))
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim scope: unchecked — could not read git status in /w/main')
    expect(r.lines).toContain('claim files: unchecked — no delta to compare against (could not read git status in /w/main)')
    expect(r.lines.some(l => l.startsWith('ignored:'))).toBe(false)
  })

  test('a red gate in the shared checkout under gate=pass: refuted, the line says the dirty tree was allowed', async () => {
    const r = await verifyNative(hereInput(), io(hereTable({ 'npm test': exit(1, 'boom') })))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim gate: failed — gate=pass claimed but the gate is RED in the shared checkout /w/main (exit 1; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)')
    const honest = await verifyNative(hereInput({ report: hereReport({ gate: 'fail' }) }), io(hereTable({ 'npm test': exit(1) })))
    expect(honest.lines).toContain('claim gate: held — gate=fail confirmed (gate red in the shared checkout /w/main; repo=here: the dirty tree is allowed, the clean-tree rule does not apply) — an honest terminal state')
  })

  test("an ignore+= amend in the brief and the config's ignore come off too, disclosed", async () => {
    const briefText = `${HERE_HEADER.replace(' ignore=.delegation/**,notes/scratch.md', '')}\n\nbody\n[[amend v=1 ignore+=notes/** reason=the brain keeps notes there]]\n`
    const r = await verifyNative(hereInput({ briefText, ignore: ['.delegation/**'] }), io(hereTable()))
    expect(r.verdict).toBe('verified')
    expect(r.lines[0]).toBe('amendment: #1 ignore+=notes/** — reason: the brain keeps notes there')
    expect(r.lines).toContain('ignored: 2 paths by ignore= (.delegation/briefs/GH-16.brief.md, notes/scratch.md), 1 path belonging to GH-19 (src/b.ts)')
  })

  test('a path out of scope after the subtraction still refutes', async () => {
    const r = await verifyNative(hereInput({ report: hereReport({ files: 'src/a.ts,src/new.ts,docs/new.md,README.md' }) }), io(hereTable({
      [hgit('status', '--porcelain=v1', '--untracked-files=all', '-z')]: ok(PORCELAIN + ' M README.md\0'),
    })))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim scope: failed — out-of-scope path: README.md')
  })
})

describe('GH-16: the porcelain delta and the subtraction, piece by piece', () => {
  test('git status -z: staged and unstaged once each, untracked, deleted, a rename or copy as its new path', () => {
    const out = ['MM src/a.ts', 'D  gone.ts', '?? new dir/x.ts', 'R  b2.ts', 'b1.ts', 'C  c2.ts', 'c1.ts', ' R d2.ts', 'd1.ts', '?? child/', ''].join('\0')
    expect(porcelainPaths(out)).toEqual(['src/a.ts', 'gone.ts', 'new dir/x.ts', 'b2.ts', 'c2.ts', 'd2.ts', 'child/'])
    expect(porcelainPaths('')).toEqual([])
  })
  test('ignore first, then the first card that claims the path (a folder entry covers what is under it)', () => {
    const s = subtractDelta(['a.ts', 'out/x', 'lib/y.ts', 'lib/z.ts'], ['out/**'], [{ card: 'A-1', files: ['lib/'] }, { card: 'B-2', files: ['lib/z.ts'] }])
    expect(s).toEqual({ kept: ['a.ts'], ignored: ['out/x'], byCard: [{ card: 'A-1', paths: ['lib/y.ts', 'lib/z.ts'] }, { card: 'B-2', paths: [] }] })
    expect(ignoredLine(s)).toBe('ignored: 1 path by ignore= (out/x), 2 paths belonging to A-1 (lib/y.ts, lib/z.ts)')
  })
  test('the ignored line names at most five paths a group', () => {
    const many = Array.from({ length: 7 }, (_, i) => `t/${i}`)
    expect(ignoredLine(subtractDelta(many, ['t/**'], []))).toBe('ignored: 7 paths by ignore= (t/0, t/1, t/2, t/3, t/4, +2 more)')
    expect(ignoredLine(subtractDelta(['a'], [], []))).toBe('ignored: 0 paths by ignore=')
  })
})

describe('GH-10: the base a brief names', () => {
  test('worktree mode: the brief base= beats the config baseRef, which beats the origin/main chain; a replay base beats them all', async () => {
    const named = io(happy({ [git('merge-base', 'develop', FULL)]: ok(MB + '\n') }))
    const r = await verifyNative(input({ briefText: `${HEADER.replace(' gate=test', ' gate=test base=develop')}\n` }), named)
    expect(r.verdict).toBe('verified')
    expect(named.calls.some(c => c.argv.includes('origin/main'))).toBe(false)
    const fromConfig = io(happy({ [git('merge-base', 'agent/ops/T-0', FULL)]: ok(MB + '\n') }))
    expect((await verifyNative(input({ baseRef: 'agent/ops/T-0' }), fromConfig)).verdict).toBe('verified')
    expect(fromConfig.calls.some(c => c.argv.includes('origin/main'))).toBe(false)
    const replay = io(happy({ [git('merge-base', '96014e3b', FULL)]: ok(MB + '\n') }))
    expect((await verifyNative(input({ base: '96014e3b', baseRef: 'develop', briefText: `${HEADER.replace(' gate=test', ' gate=test base=develop')}\n` }), replay)).verdict).toBe('verified')
    expect(replay.calls.some(c => c.argv.includes('develop'))).toBe(false)
  })
  test('a base= that is not a git ref makes the brief unusable: refused, nothing runs', async () => {
    const t = io(happy())
    const r = await verifyNative(input({ briefText: `${HEADER.replace(' gate=test', ' gate=test base=--output=/tmp/x')}\n` }), t)
    expect(r.verdict).toBe('refused')
    expect(r.lines).toEqual(['refuse: BRIEF-BAD-BASE — base= ("--output=/tmp/x") is not a git ref; name a branch, HEAD or a sha.'])
    expect(t.calls).toHaveLength(0)
    expect(briefContract(`${HEADER.replace(' gate=test', ' gate=test base=main ignore=a/**,b.ts')}\n`)).toMatchObject({ ok: true, base: 'main', ignore: ['a/**', 'b.ts'] })
  })
})

describe('GH-1 item 2: a cardless report (no header, no brief)', () => {
  const NB = `${NO_BRIEF_REASON}`
  test('branch, sha, files and pr are checked by git alone; scope, gate and red are unchecked; nothing is written and no gate runs', async () => {
    const t = io(happy())
    const r = await verifyCardless({ repo: REPO, report: report() }, t)
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toEqual([
      'claim branch: held — refs/heads/agent/ops/T-1',
      `claim sha: held — ${FULL.slice(0, 9)} reachable on agent/ops/T-1`,
      `claim scope: unchecked — ${NB}`,
      'claim files: held — files= matches the sha delta exactly',
      `claim gate: unchecked — ${NB}`,
      `claim red: unchecked — ${NB}`,
      'claim pr: held — no PR claimed',
    ])
    expect(Object.keys(t.writes)).toEqual([])
    expect(t.reads).toEqual([])
    expect(t.calls.some(c => c.argv[0] === 'npm')).toBe(false)
  })
  test('a sha off the branch, or a files= that invents a path, refutes', async () => {
    const off = await verifyCardless({ repo: REPO, report: report() }, io(happy({ [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: exit(1) })))
    expect(off.verdict).toBe('refuted')
    expect(off.lines).toContain('claim sha: failed — sha a1b2c3d exists but is NOT reachable on agent/ops/T-1')
    const invents = await verifyCardless({ repo: REPO, report: report({ files: 'src/a.ts,docs/x.md,src/b.ts' }) }, io(happy()))
    expect(invents.verdict).toBe('refuted')
    expect(invents.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): invents src/b.ts')
  })
  test('a baseRef names the delta base, as for a brief', async () => {
    const t = io(happy({ [git('merge-base', 'develop', FULL)]: ok(MB + '\n') }))
    await verifyCardless({ repo: REPO, report: report(), baseRef: 'develop' }, t)
    expect(t.calls.some(c => c.argv.join(' ') === git('merge-base', 'develop', FULL))).toBe(true)
  })
})
