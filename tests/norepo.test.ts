// 3A: verifying a task that has no git repo (pure).
import { test, expect, describe } from 'claude-code/testing'
import { world, turnInput, sessionStart, commandInput, brainSpawn, ROOT, SCRATCH, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { checkArgv } from '../hooks/lib/allow'
import { gateTemplatesOf, resolveGateRuns, splitCommand } from '../hooks/lib/gates'
import {
  attributeWrites,
  bashReadOnly,
  chargeDelta,
  deltaPaths,
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

describe('MOD-233: a truncated inline listing is unchecked', () => {
  const e = (path: string) => ({ path, size: 1, mtimeMs: 1 })
  const cut: RootListing = { root: '/out', entries: [e('a')], truncated: true }
  test('never clean, and never read as newly added files', () => {
    const after: RootListing = { root: '/out', entries: [e('a'), e('b'), e('c')] }
    const c = outsideClaim({ before: [cut], after: [after], scope: ['/out/**'], forbid: [] })
    expect(c?.status).toBe('unchecked')
    expect(c?.detail).toContain('cut short')
    // a failure elsewhere still fails
    expect(outsideClaim({ before: [cut, { root: '/x', entries: [] }], after: [after, { root: '/x', entries: [e('z')] }], scope: [], forbid: [] })?.status).toBe('failed')
  })
})

// MOD-256: a file a worker produced through a script it ran is read as the worker's own
describe('MOD-256: a script the worker ran is attributed to it (repo=here)', () => {
  const OPTS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' as const, gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' }
  const LLM = 'app/billing/Rate*.ts'
  const RED = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const report = (files: string) => `Done.\n[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=${files}]]`
  const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
  const edit = ($: any, file: string) => $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b', agentId: 'agent-h' } as never)
  const bash = ($: any, command: string) => $.tool.call({ tool: 'Bash', command, agentId: 'agent-h' } as never)
  const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
  // the dirty tree is a mutable list; `during` runs inside a Bash call, as a script would
  const setup = (on: Parameters<typeof world>[0], tree: string[], during: () => void = () => undefined) => {
    on('tool.call', { tool: 'Edit' }, passed)
    on('tool.call', { tool: 'Bash' }, () => {
      during()
      return passed()
    })
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[3] === 'status') return { exitCode: 0, stdout: [...tree, ''].join('\0') }
      return argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined
    }
    return world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD, ...RED }, dirs, run, agentId: 'agent-h', store: offered })
  }
  const statusRuns = (w: { runs: { argv: string[] }[] }) => w.runs.filter(r => r.argv[3] === 'status').length

  test('an out-of-scope file a script wrote after an earlier in-scope Edit is refuted on scope', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const w = setup(on, tree, () => void tree.push(' M x.txt'))
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
    await edit($, `${ROOT}/app/billing/RateA.ts`)
    await bash($, 'node gen.mjs')
    await $.turn.complete(turnInput('agent-h', report('app/billing/RateA.ts,x.txt')))
    const row = delivered(w)
    expect(row).toContain('verdict=refuted task=BE-101')
    expect(row).toContain('claim scope: failed — out-of-scope path: x.txt')
  })

  test('another session\'s change while no Bash of this worker ran is still not charged', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const w = setup(on, tree)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
    await edit($, `${ROOT}/app/billing/RateA.ts`)
    tree.push(' M src/sibling.ts')
    await bash($, 'node gen.mjs')
    await $.turn.complete(turnInput('agent-h', report('app/billing/RateA.ts')))
    const row = delivered(w)
    expect(row).toContain('verdict=consistent task=BE-101')
    expect(row).toContain('changed during the run, not by this worker: src/sibling.ts')
  })

  test('read-only Bash does zero git', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const w = setup(on, tree)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
    const before = statusRuns(w)
    await bash($, 'ls -la && git status --short | head -5 && cat package.json')
    expect(statusRuns(w)).toBe(before)
    await bash($, 'node gen.mjs')
    expect(statusRuns(w)).toBe(before + 2)
  })
})

// MOD-261: a sibling's write while a worker's command ran is not charged to that worker
describe('MOD-261: two repo=here workers on one checkout', () => {
  const OPTS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' as const, gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' }
  const CARD_B = FIXTURE_CARD.replace(/BE-101/g, 'BE-102')
  const NAME_B = FIXTURE_CARD_NAME.replace('BE-101', 'BE-102')
  const RED = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME, NAME_B] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const report = (files: string) => `Done.\n[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=${files}]]`
  const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
  const tool = ($: any, agentId: string, input: Record<string, unknown>) => $.tool.call({ ...input, agentId } as never)
  const edit = ($: any, agentId: string, file: string) => tool($, agentId, { tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b' })
  const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
  // worker A's Bash call parks inside the engine until `release()`; `entered` resolves once it is there (its before-snapshot is taken)
  const setup = (on: Parameters<typeof world>[0], tree: string[]) => {
    let release = () => {}
    let enter = () => {}
    const gate = new Promise<void>(r => (release = r))
    const entered = new Promise<void>(r => (enter = r))
    let parked = 0
    on('tool.call', { tool: 'Edit' }, passed)
    on('tool.call', { tool: 'Bash' }, async () => {
      // only the first Bash call parks; a sibling's Bash call runs through
      if (parked++ === 0) {
        enter()
        await gate
      }
      return passed()
    })
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[3] === 'status') return { exitCode: 0, stdout: [...tree, ''].join('\0') }
      return argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined
    }
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD, [`${ROOT}/agents/tasks/${NAME_B}`]: CARD_B, ...RED }, dirs, run, agentId: 'agent-h', store: offered })
    return { w, release, entered }
  }
  const start = async ($: any) => {
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('BE-101 --here --scope app/billing/Rate*.ts'))).text))
    await brainSpawn($, String((await $.command.run(commandInput('BE-102 --here --scope y.txt'))).text), { tool_use_id: 'toolu_01BBBBBBBB' })
  }

  test('a sibling\'s Edit during A\'s command is not charged to A', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const { w, release, entered } = setup(on, tree)
    await start($)
    await edit($, 'agent-h', `${ROOT}/app/billing/RateA.ts`)
    const aBash = tool($, 'agent-h', { tool: 'Bash', command: 'node gen.mjs' })
    await entered
    tree.push(' M y.txt')
    await edit($, 'agent-2', `${ROOT}/y.txt`)
    release()
    await aBash
    await $.turn.complete(turnInput('agent-h', report('app/billing/RateA.ts')))
    const row = delivered(w)
    expect(row).not.toContain('claim scope: failed')
    expect(row).toContain('verdict=consistent task=BE-101')
    // the Edit is B's own write, and only B's
    expect(w.store.get('delegation.writes.agent-2')).toEqual([`${ROOT}/y.txt`])
    expect(w.store.get('delegation.writes.agent-h')).toEqual([`${ROOT}/app/billing/RateA.ts`])
  })

  test('a path changed while both workers ran Bash is charged to neither and listed', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const { w, release, entered } = setup(on, tree)
    await start($)
    await edit($, 'agent-h', `${ROOT}/app/billing/RateA.ts`)
    const aBash = tool($, 'agent-h', { tool: 'Bash', command: 'node gen.mjs' })
    await entered
    tree.push(' M z.txt')
    await tool($, 'agent-2', { tool: 'Bash', command: 'node other.mjs' })
    release()
    await aBash
    expect(w.store.get('delegation.writes.agent-h') ?? []).not.toContain(`${ROOT}/z.txt`)
    expect(w.store.get('delegation.writes.agent-2') ?? []).not.toContain(`${ROOT}/z.txt`)
    await $.turn.complete(turnInput('agent-h', report('app/billing/RateA.ts')))
    const row = delivered(w)
    expect(row).not.toContain('claim scope: failed')
    expect(row).toContain('changed while BE-101 and BE-102 both ran: z.txt')
  })

  test('with no sibling running, a script\'s file is still the worker\'s', { options: OPTS }, async ($, on) => {
    const tree = [' M app/billing/RateA.ts']
    const { w, release, entered } = setup(on, tree)
    await start($)
    const aBash = tool($, 'agent-h', { tool: 'Bash', command: 'node gen.mjs' })
    await entered
    tree.push(' M x.txt')
    release()
    await aBash
    expect(w.store.get('delegation.writes.agent-h')).toEqual([`${ROOT}/x.txt`])
  })
})

describe('MOD-256: read-only Bash and snapshot deltas (pure)', () => {
  test('reads are read-only; a script, a redirection or a write verb is not', () => {
    for (const c of ['ls -la', 'cat a.txt | head -5', 'git status --short && git diff', 'git -C /r log --oneline', 'grep -rn x src 2>&1', 'find . -name "*.ts"', 'sed -n 1,5p f', 'echo hi > /dev/null']) expect(bashReadOnly(c)).toBe(true)
    for (const c of ['node gen.mjs', 'npm run build', 'ls > out.txt', 'git commit -m x', 'git checkout b', 'find . -delete', 'sed -i s/a/b/ f', 'cat $(make)', 'ls && node x.js', 'python3 gen.py', '']) expect(bashReadOnly(c)).toBe(false)
  })
  test('paths that appeared, changed or left between two snapshots', () => {
    const a = new Map([['/r/a', ' M|1:1'], ['/r/b', ' M|2:2'], ['/r/c', ' M|3:3']])
    const b = new Map([['/r/a', ' M|1:1'], ['/r/b', ' M|2:9'], ['/r/d', '??|4:4']])
    expect(deltaPaths(a, b).sort()).toEqual(['/r/b', '/r/c', '/r/d'])
    expect(deltaPaths(a, a)).toEqual([])
  })
})

describe('MOD-261: chargeDelta (pure)', () => {
  const base = { agentId: 'a', start: 10, end: 20, keys: ['/r'], delta: ['/r/x', '/r/y'] }
  test('no sibling: every path is the worker\'s', () => {
    expect(chargeDelta({ ...base, events: [], windows: [] })).toEqual({ mine: ['/r/x', '/r/y'], sibling: [], both: [] })
  })
  test('a sibling\'s write inside the window is the sibling\'s; one outside it is not', () => {
    const r = chargeDelta({ ...base, events: [{ agentId: 'b', path: '/r/y', seq: 15 }, { agentId: 'b', path: '/r/x', seq: 5 }], windows: [] })
    expect(r).toEqual({ mine: ['/r/x'], sibling: ['/r/y'], both: [] })
  })
  test('an overlapping sibling command makes the rest unattributable; a window on another checkout or after it does not', () => {
    const w = (o: object) => ({ agentId: 'b', label: 'B-1', keys: ['/r'], start: 12, ...o })
    expect(chargeDelta({ ...base, events: [], windows: [w({})] }).both).toEqual([{ path: '/r/x', labels: ['B-1'] }, { path: '/r/y', labels: ['B-1'] }])
    expect(chargeDelta({ ...base, events: [], windows: [w({ end: 18 })] }).both.length).toBe(2)
    expect(chargeDelta({ ...base, events: [], windows: [w({ keys: ['/other'] })] }).mine.length).toBe(2)
    expect(chargeDelta({ ...base, events: [], windows: [w({ start: 2, end: 9 })] }).mine.length).toBe(2)
  })
})
