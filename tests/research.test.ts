// MOD-22: research cards. A card whose outputs live outside the repo: an output folder
// (outdir), a scratch folder, a before-and-after listing of the absolute scope and forbid
// roots, {outdir} in a gate command, and artefacts= / metrics= in the report. Pure.
import { test, expect, describe } from 'claude-code/testing'
import { checkArgv, checkGateEntry } from '../hooks/lib/allow'
import { parseHeader, parseReport } from '../hooks/lib/brief'
import { parseCard, renderBrief, renderHeader, renderSections } from '../hooks/lib/dispatch'
import { gateTemplatesOf, resolveGateRuns } from '../hooks/lib/gates'
import {
  artefactsCheck,
  artefactsClaim,
  defaultScratch,
  expandTilde,
  metricsLine,
  noRepoVerdict,
  outdirOf,
  outsideCheck,
  outsideClaim,
  outsideRoots,
  reportArtefacts,
  reportMetrics,
  type RootListing,
} from '../hooks/lib/norepo'
import { briefContract, verifyNative, type ExecOut } from '../hooks/lib/verify-native'

const entry = (path: string, size = 1, mtimeMs = 1) => ({ path, size, mtimeMs })
const listing = (root: string, ...entries: ReturnType<typeof entry>[]): RootListing => ({ root, entries })

describe('MOD-22: where a research card works', () => {
  test('the first absolute scope entry is the outdir: its folder before the first glob character', () => {
    expect(outdirOf(['/out/a/**', 'src/x.py'])).toBe('/out/a')
    expect(outdirOf(['src/x.py', '/out/a/**'])).toBe('/out/a')
    expect(outdirOf(['/out/a/*.png', '/out/b/**'])).toBe('/out/a')
    expect(outdirOf(['src/x.py', 'tests/**'])).toBeUndefined()
    expect(outdirOf([])).toBeUndefined()
  })

  test('a card that names outdir: itself wins over the scope', () => {
    expect(outdirOf(['/out/a/**'], '/out/named')).toBe('/out/named')
    expect(outdirOf(['src/x.py'], '/out/named')).toBe('/out/named')
  })

  test('a leading ~ is the home folder; nothing else is changed', () => {
    expect(expandTilde('~/out/**', '/home/u')).toBe('/home/u/out/**')
    expect(expandTilde('~', '/home/u/')).toBe('/home/u')
    expect(expandTilde('~other/x', '/home/u')).toBe('~other/x')
    expect(expandTilde('/out/~/x', '/home/u')).toBe('/out/~/x')
    expect(expandTilde('src/x.py', '/home/u')).toBe('src/x.py')
    expect(expandTilde('~/out/**', '')).toBe('~/out/**')
  })

  test('the roots to list: the folder of every absolute scope and forbid entry, a root inside another dropped', () => {
    expect(outsideRoots(['/out/a/**', 'src/x.py', '/out/a/sub/*.png'], ['/etc/hosts', '/out/b/**'])).toEqual(['/out/a', '/etc/hosts', '/out/b'])
    expect(outsideRoots(['src/**'], ['docs/**'])).toEqual([])
    expect(outsideRoots(['/out/a/sub/**', '/out/a/**'], [])).toEqual(['/out/a'])
  })

  test('the default scratch folder is under the system temp dir, by task', () => {
    expect(defaultScratch('/var/folders/x/T/', 'MOD-22')).toBe('/var/folders/x/T/chassis-delegation/MOD-22')
    expect(defaultScratch('/tmp/td', 'OPS-9')).toBe('/tmp/td/chassis-delegation/OPS-9')
    expect(defaultScratch('', 'OPS-9')).toBe('/tmp/chassis-delegation/OPS-9')
  })
})

describe('MOD-22: the card and the brief header carry the folders', () => {
  test('a card names outdir: and scratch: itself', () => {
    const c = parseCard('---\nid: OPS-9\ntitle: t\ndomain: ops\nrepo: none\nscope: [/out/a/**]\noutdir: /out/named\nscratch: /tmp/mine\ngate: check\n---\nbody\n')
    if ('error' in c) throw new Error(c.error)
    expect(c).toMatchObject({ repo: 'none', outdir: '/out/named', scratch: '/tmp/mine', scope: ['/out/a/**'] })
    const plain = parseCard('---\nid: OPS-9\ntitle: t\ndomain: ops\nscope: [a/**]\n---\nbody\n')
    if ('error' in plain) throw new Error(plain.error)
    expect(plain.outdir).toBeUndefined()
    expect(plain.scratch).toBeUndefined()
  })

  test('the header gains outdir= and scratch= after repo= and before spend=, and reads back', () => {
    const card = parseCard('---\nid: OPS-9\ntitle: t\ndomain: ops\nrepo: none\nscope: [/out/a/**, src/x.py]\nred_test: none\ngate: check\n---\nbody\n')
    if ('error' in card) throw new Error(card.error)
    const header = renderHeader({ card, tier: 'standard', alias: 'sonnet', budget: 2, spend: 6, repo: 'none', outdir: '/out/a', scratch: '/tmp/td/chassis-delegation/OPS-9' })
    expect(header).toBe(
      '[[brief v=1 task=OPS-9 subtask=main purpose=build tier=standard model=sonnet scope=/out/a/**,src/x.py forbid= red_test="none" gate=check repo=none outdir=/out/a scratch=/tmp/td/chassis-delegation/OPS-9 spend=6 budget=2-attempts report=chassis.report.v1]]',
    )
    const parsed = parseHeader(header)
    expect(parsed?.repo).toBe('none')
    expect(parsed?.fields.outdir).toBe('/out/a')
    expect(parsed?.fields.scratch).toBe('/tmp/td/chassis-delegation/OPS-9')
    expect(parsed?.fields.spend).toBe('6')
    expect(briefContract(header)).toMatchObject({ ok: true, scope: ['/out/a/**', 'src/x.py'], outdir: '/out/a' })
    // a card with neither writes neither
    expect(renderHeader({ card, tier: 'standard', alias: 'sonnet', budget: 2 })).not.toContain('outdir=')
  })

  test('the template tells the worker where to put deliverables and where to put helper files', () => {
    const t = 'A\n{{#outdir}}\nOut {{outdir}}.\n{{/outdir}}\n{{#scratch}}\nScratch {{scratch}}: never in the repo.\n{{/scratch}}\nZ{{reportExtra}}'
    const card = parseCard('---\nid: OPS-9\ntitle: t\ndomain: ops\nscope: [a/**]\n---\nbody\n')
    if ('error' in card) throw new Error(card.error)
    const base = { card, worktree: '/w', branch: 'b', cardPath: '/c' }
    expect(renderBrief(t, base)).toBe('A\nZ')
    expect(renderBrief(t, { ...base, outdir: '/out/a', scratch: '/tmp/s', reportExtra: ' artefacts=<x>' })).toBe('A\nOut /out/a.\nScratch /tmp/s: never in the repo.\nZ artefacts=<x>')
    expect(renderBrief(t, { ...base, scratch: '/tmp/s' })).toBe('A\nScratch /tmp/s: never in the repo.\nZ')
    // the markers go with renderSections alone, as the spend markers do
    expect(renderSections(t, false)).not.toContain('{{#')
  })

  test('a repo=none brief keeps the template\'s {{#none}} sections and drops the worktree and here ones', () => {
    const t = 'A\n{{#worktree}}\nW\n{{/worktree}}\n{{#here}}\nH\n{{/here}}\n{{#none}}\nN\n{{/none}}\nZ'
    expect(renderSections(t, 'none')).toBe('A\nN\nZ')
    expect(renderSections(t, 'here')).toBe('A\nH\nZ')
    expect(renderSections(t, 'worktree')).toBe('A\nW\nZ')
    // the boolean spelling the existing callers use still means here / worktree
    expect(renderSections(t, true)).toBe('A\nH\nZ')
    expect(renderSections(t, false)).toBe('A\nW\nZ')
  })
})

describe('MOD-22: the outside delta, a before-and-after listing of the absolute roots', () => {
  const before = [listing('/out/a', entry('old.txt', 3, 100)), listing('/out/b')]

  test('a path added outside every scope entry fails the claim, named, from the outside delta', () => {
    const after = [listing('/out/a', entry('old.txt', 3, 100), entry('n.txt')), listing('/out/b', entry('m.txt'))]
    const c = outsideClaim({ before, after, scope: ['/out/a/**'], forbid: [] })
    expect(c?.status).toBe('failed')
    expect(c?.detail).toContain('/out/b/m.txt')
    expect(c?.detail).toContain('outside delta')
    expect(c?.detail).not.toContain('/out/a/n.txt')
    expect(c?.detail).toBe('out-of-scope path: /out/b/m.txt (outside delta)')
  })

  test('changes inside the scope hold; an unchanged file is not a change; a changed one (size or time) is, and a removed one', () => {
    const after = [listing('/out/a', entry('old.txt', 3, 100), entry('n.txt'), entry('sub/deep.png')), listing('/out/b')]
    const held = outsideClaim({ before, after, scope: ['/out/a/**'], forbid: [] })
    expect(held).toEqual({ status: 'held', detail: 'outside delta: 2 changed paths under /out/a, /out/b, every one within scope and none in forbid' })
    const touched = outsideClaim({ before, after: [listing('/out/a', entry('old.txt', 3, 999)), listing('/out/b')], scope: ['/out/a/**'], forbid: [] })
    expect(touched?.detail).toBe('outside delta: 1 changed path under /out/a, /out/b, every one within scope and none in forbid')
    const grown = outsideClaim({ before, after: [listing('/out/a', entry('old.txt', 4, 100)), listing('/out/b')], scope: ['/out/a/**'], forbid: [] })
    expect(grown?.status).toBe('held')
    expect(grown?.detail).toContain('1 changed path')
    const quiet = outsideClaim({ before, after: before, scope: ['/out/a/**'], forbid: [] })
    expect(quiet).toEqual({ status: 'held', detail: 'outside delta: nothing changed under /out/a, /out/b' })
    const removed = outsideClaim({ before, after: [listing('/out/a'), listing('/out/b')], scope: ['/out/b/**'], forbid: [] })
    expect(removed?.detail).toBe('out-of-scope path: /out/a/old.txt (outside delta)')
  })

  test('a change inside an absolute forbid fails, however wide the scope', () => {
    const after = [listing('/out/a'), listing('/out/b', entry('m.txt'))]
    const c = outsideClaim({ before, after, scope: ['/out/**'], forbid: ['/out/b/**'] })
    expect(c).toEqual({ status: 'failed', detail: 'touches forbid path: /out/b/m.txt (outside delta)' })
  })

  test('a * in an absolute entry stays inside one folder, as for a repo=none brief', () => {
    const after = [listing('/out/a', entry('x.png'), entry('deep/y.png')), listing('/out/b')]
    const c = outsideClaim({ before, after, scope: ['/out/a/*.png'], forbid: [] })
    expect(c?.detail).toBe('out-of-scope path: /out/a/deep/y.png (outside delta)')
  })

  test('several paths: the first is named and the rest counted', () => {
    const grown = [listing('/out/a', entry('old.txt', 3, 100)), listing('/out/b', entry('m.txt'), entry('n.txt'), entry('o.txt'))]
    const c = outsideClaim({ before, after: grown, scope: ['/out/a/**'], forbid: [] })
    expect(c?.detail).toBe('out-of-scope path: /out/b/m.txt (outside delta, +2 more)')
  })

  test('a root that cannot be listed leaves the claim unchecked, never held', () => {
    const c = outsideClaim({ before, after: [{ root: '/out/a', error: 'EACCES' }, listing('/out/b')], scope: ['/out/a/**'], forbid: [] })
    expect(c).toEqual({ status: 'unchecked', detail: 'outside delta: /out/a could not be listed at hand-back: EACCES' })
    const atStart = outsideClaim({ before: [{ root: '/out/a', error: 'too many entries' }], after: [listing('/out/a')], scope: ['/out/a/**'], forbid: [] })
    expect(atStart).toEqual({ status: 'unchecked', detail: 'outside delta: /out/a could not be listed at dispatch: too many entries' })
    // a root nobody listed at dispatch has no before to compare with
    const noBase = outsideClaim({ before: [], after: [listing('/out/a', entry('n.txt'))], scope: ['/out/a/**'], forbid: [] })
    expect(noBase).toEqual({ status: 'unchecked', detail: 'outside delta: no listing of /out/a was taken at dispatch' })
  })

  test('a failure found in a root that listed still fails when another root did not', () => {
    const c = outsideClaim({ before, after: [{ root: '/out/a', error: 'EACCES' }, listing('/out/b', entry('m.txt'))], scope: ['/out/a/**'], forbid: [] })
    expect(c?.status).toBe('failed')
    expect(c?.detail).toContain('/out/b/m.txt')
  })

  test('no listing at all is no claim', () => {
    expect(outsideClaim({ before: [], after: [], scope: ['src/**'], forbid: [] })).toBeUndefined()
  })

  test('outsideCheck lists the baseline roots and the card roots at hand-back, through the injected lister', async () => {
    const asked: string[] = []
    const list = async (root: string): Promise<RootListing> => {
      asked.push(root)
      return root === '/out/a' ? listing('/out/a', entry('n.txt')) : listing(root)
    }
    const c = await outsideCheck(['/out/a/**'], [], { before: [listing('/out/a')], list })
    expect(c?.status).toBe('held')
    expect(asked).toEqual(['/out/a'])
    // a root the card gained by an amendment has no baseline
    const more = await outsideCheck(['/out/a/**', '/out/c/**'], [], { before: [listing('/out/a')], list })
    expect(more).toEqual({ status: 'unchecked', detail: 'outside delta: no listing of /out/c was taken at dispatch' })
    // no baseline at all: not part of the claim
    expect(await outsideCheck(['/out/a/**'], [], undefined)).toBeUndefined()
  })
})

describe('MOD-22: {outdir} in a gate-map command', () => {
  const MAP = { check: 'checker {outdir}', strict: 'checker {outdir} --strict', both: 'claude plugin validate {worktree} && checker {outdir}' }
  const allow = { gateTemplates: gateTemplatesOf(MAP) }

  test('it is filled with an absolute outdir and the allowlist takes it word for word', () => {
    expect(checkArgv(['checker', '/out/a'], allow).ok).toBe(true)
    expect(checkArgv(['checker', '/out/a', '--strict'], allow).ok).toBe(true)
    expect(checkArgv(['claude', 'plugin', 'validate', '/w/tree'], allow).ok).toBe(true)
  })

  test('any other change is refused: an extra word, a changed flag, a relative or climbing path, shell syntax', () => {
    for (const argv of [
      ['checker', '/out/a', '--lax'],
      ['checker', '/out/a', '--strict', '--lax'],
      ['checker'],
      ['checker', 'out/a'],
      ['checker', '/out/../etc'],
      ['checker', '/out/a;rm'],
      ['checker', '/out/a b'],
      ['other', '/out/a'],
    ]) {
      expect(checkArgv(argv, allow).ok).toBe(false)
    }
  })

  test('a gate id fills {outdir} with the brief outdir, and {worktree} too', () => {
    const allowed = (argv: readonly string[]) => checkArgv(argv, allow).ok
    const g = resolveGateRuns('check', MAP, allowed, '/f/files.txt', '/w/tree', '/out/a')
    expect(g.runs).toEqual([{ label: 'checker {outdir}', argv: ['checker', '/out/a'] }])
    expect(g.runs.every(r => allowed(r.argv))).toBe(true)
    const both = resolveGateRuns('both', MAP, allowed, '/f/files.txt', '/w/tree', '/out/a')
    expect(both.runs.map(r => r.argv)).toEqual([['claude', 'plugin', 'validate', '/w/tree'], ['checker', '/out/a']])
  })

  test('a command that names {outdir} when the brief has no outdir= is not re-run, and says why', () => {
    const g = resolveGateRuns('check', MAP, () => true, '/f/files.txt', '/w/tree')
    expect(g.runs).toEqual([])
    expect(g.notRerun).toEqual([{ id: 'check', why: 'the command names {outdir} and the brief has no outdir=' }])
  })

  test('the gate map accepts {outdir} once per word; twice in a word is refused at load', () => {
    expect(checkGateEntry('checker {outdir}').ok).toBe(true)
    expect(checkGateEntry('checker --out={outdir}/x --in {outdir}').ok).toBe(true)
    expect(checkGateEntry('checker {outdir}{outdir}').ok).toBe(false)
    expect(checkGateEntry('checker {outdirs}').ok).toBe(false)
  })
})

describe('MOD-22: the report grammar gains artefacts= and metrics=', () => {
  const REPORT = '[[report v=1 task=OPS-9 subtask=main branch=none pr=none sha=none gate=pass red=none files=none artefacts=a.gltf,b.png metrics="tris=1200,len_s=2.4"]]'

  test('both fields are read, with a quoted metrics value that holds commas', () => {
    const r = parseReport(REPORT)
    expect(r.artefacts).toBe('a.gltf,b.png')
    expect(r.metrics).toBe('tris=1200,len_s=2.4')
    expect(r.files).toBe('none')
    expect(reportArtefacts(r.artefacts)).toEqual(['a.gltf', 'b.png'])
    expect(reportMetrics(r.metrics)).toEqual({ tris: '1200', len_s: '2.4' })
  })

  test('they are optional, and a note after them is still the note', () => {
    const bare = parseReport('[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc gate=pass files=a]]')
    expect(bare.artefacts).toBeUndefined()
    expect(reportArtefacts(bare.artefacts)).toEqual([])
    expect(reportMetrics(bare.metrics)).toEqual({})
    const noted = parseReport(REPORT.replace(']]', ' note=checked by eye]]'))
    expect(noted.metrics).toBe('tris=1200,len_s=2.4')
    expect(noted.note).toBe('checked by eye')
    expect(reportArtefacts('none')).toEqual([])
    expect(reportArtefacts(' a.png , ,b.png ')).toEqual(['a.png', 'b.png'])
  })

  test('the metrics line is what the verdict detail shows', () => {
    expect(metricsLine({ tris: '1200', len_s: '2.4' })).toBe('metrics: tris=1200, len_s=2.4')
  })
})

describe('MOD-22: the artefacts claim', () => {
  test('held when each named path exists and is not empty', () => {
    const c = artefactsClaim([
      { name: 'a.gltf', path: '/out/a/a.gltf', exists: true, size: 1200 },
      { name: '/out/a/b.png', path: '/out/a/b.png', exists: true, size: 3 },
    ])
    expect(c).toEqual({ status: 'held', detail: '2 artefacts exist and are not empty: a.gltf (1200 bytes), /out/a/b.png (3 bytes)' })
  })

  test('failed naming the first missing one', () => {
    const c = artefactsClaim([
      { name: 'a.gltf', path: '/out/a/a.gltf', exists: true, size: 1200 },
      { name: 'b.png', path: '/out/a/b.png', exists: false },
      { name: 'c.png', path: '/out/a/c.png', exists: false },
    ])
    expect(c?.status).toBe('failed')
    expect(c?.detail).toBe('missing: b.png (/out/a/b.png)')
    expect(c?.detail).not.toContain('c.png')
  })

  test('an empty file fails too; a name that climbs out of outdir fails; an unreadable one is unchecked', () => {
    expect(artefactsClaim([{ name: 'a.gltf', path: '/out/a/a.gltf', exists: true, size: 0 }])).toEqual({ status: 'failed', detail: 'empty: a.gltf (/out/a/a.gltf)' })
    expect(artefactsClaim([{ name: '../x.png' }])?.detail).toBe("missing: ../x.png (a '..' segment names no path)")
    expect(artefactsClaim([{ name: 'a.gltf', path: '/out/a/a.gltf', error: 'EACCES' }])).toEqual({ status: 'unchecked', detail: 'could not be read: a.gltf (EACCES)' })
    // a failure found beats an unreadable one before it
    expect(artefactsClaim([{ name: 'a', path: '/o/a', error: 'EACCES' }, { name: 'b', path: '/o/b', exists: false }])?.status).toBe('failed')
  })

  test('absent when the report names none', () => {
    expect(artefactsClaim([])).toBeUndefined()
  })

  test('artefactsCheck reads relative names against the outdir and absolute ones as they are', async () => {
    const asked: string[] = []
    const stat = async (path: string) => {
      asked.push(path)
      return path === '/out/a/a.gltf' ? { exists: true, size: 5 } : { exists: false }
    }
    const c = await artefactsCheck(['a.gltf', '/elsewhere/n.txt'], '/out/a', stat)
    expect(asked).toEqual(['/out/a/a.gltf', '/elsewhere/n.txt'])
    expect(c).toEqual({ status: 'failed', detail: 'missing: /elsewhere/n.txt' })
    expect(await artefactsCheck([], '/out/a', stat)).toBeUndefined()
  })
})

describe('MOD-22: a repo=none verdict with the new claims', () => {
  const base = { root: '/out/a', files: [], missing: [], outOfScope: [], forbidden: [], gates: [{ label: 'checker {outdir}', exitCode: 0 }], notRerun: [], noGate: false }

  test('the outside delta is part of the scope claim; the artefacts claim follows files; metrics are shown last, never judged', () => {
    const v = noRepoVerdict({
      ...base,
      outside: { status: 'held', detail: 'outside delta: 1 changed path under /out/a, every one within scope and none in forbid' },
      artefacts: { status: 'held', detail: '1 artefact exists and is not empty: a.gltf (5 bytes)' },
      metrics: { tris: '1200', len_s: '2.4' },
    })
    expect(v.verdict).toBe('consistent')
    expect(v.lines).toEqual([
      'claim scope: held — every file in scope; outside delta: 1 changed path under /out/a, every one within scope and none in forbid',
      'claim files: held — 0 files under /out/a',
      'claim artefacts: held — 1 artefact exists and is not empty: a.gltf (5 bytes)',
      'claim gate: held — checker {outdir} exited 0',
      'metrics: tris=1200, len_s=2.4',
    ])
  })

  test('an outside path out of scope refutes on scope; a missing artefact refutes on artefacts; an unlisted root leaves it unverified', () => {
    const scope = noRepoVerdict({ ...base, outside: { status: 'failed', detail: 'out-of-scope path: /out/b/m.txt (outside delta)' } })
    expect(scope.verdict).toBe('refuted')
    expect(scope.why).toBe('out-of-scope path: /out/b/m.txt (outside delta)')
    expect(scope.lines[0]).toBe('claim scope: failed — out-of-scope path: /out/b/m.txt (outside delta)')
    const art = noRepoVerdict({ ...base, artefacts: { status: 'failed', detail: 'missing: b.png (/out/a/b.png)' } })
    expect(art.verdict).toBe('refuted')
    expect(art.lines).toContain('claim artefacts: failed — missing: b.png (/out/a/b.png)')
    const unlisted = noRepoVerdict({ ...base, outside: { status: 'unchecked', detail: 'outside delta: /out/a could not be listed at hand-back: EACCES' } })
    expect(unlisted.verdict).toBe('unverified')
    expect(unlisted.lines[0]).toBe('claim scope: unchecked — outside delta: /out/a could not be listed at hand-back: EACCES')
  })

  test('without the new inputs the lines are the ones a repo=none verdict always had', () => {
    expect(noRepoVerdict(base).lines).toEqual(['claim scope: held — every file in scope', 'claim files: held — 0 files under /out/a', 'claim gate: held — checker {outdir} exited 0'])
  })
})

describe('MOD-22: repo=here verified with an output folder', () => {
  const ROOTDIR = '/w/main'
  const HEADER =
    '[[brief v=1 task=OPS-9 subtask=main purpose=build tier=standard scope=/out/hair/**,/out/notes/*.md forbid= red_test="none" gate=check repo=here ignore=.delegation/** outdir=/out/hair scratch=/tmp/td/chassis-delegation/OPS-9 budget=2-attempts report=chassis.report.v1]]'
  const hgit = (...args: string[]) => ['git', '-C', ROOTDIR, ...args].join(' ')
  const STATUS = hgit('status', '--porcelain=v1', '--untracked-files=all', '-z')
  const ok = (stdout = ''): ExecOut => ({ ok: true, exitCode: 0, stdout, stderr: '' })
  const table = (over: Record<string, ExecOut> = {}): Record<string, ExecOut> => ({
    [hgit('rev-parse', '--abbrev-ref', 'HEAD')]: ok('main\n'),
    [STATUS]: ok(''),
    'checker /out/hair': ok('checked\n'),
    ...over,
  })
  const io = (t: Record<string, ExecOut>) => {
    const calls: { argv: string[]; cwd?: string }[] = []
    return {
      calls,
      exec: async (argv: readonly string[], init?: { cwd?: string }): Promise<ExecOut> => {
        calls.push({ argv: [...argv], cwd: init?.cwd })
        return t[argv.join(' ')] ?? { ok: true, exitCode: 1, stdout: '', stderr: `no such answer: ${argv.join(' ')}` }
      },
      write: async () => undefined,
      stat: async (path: string) => (path === '/out/hair/model.glb' ? { exists: true, size: 1200 } : path === '/out/notes/findings.md' ? { exists: true, size: 9 } : { exists: false }),
    }
  }
  const BEFORE = [listing('/out/hair', entry('old.txt', 3, 100)), listing('/out/notes')]
  const outside = (after: RootListing[]) => ({ before: BEFORE, list: async (root: string) => after.find(l => l.root === root) ?? { root, error: 'not listed' } })
  const GOOD_AFTER = [listing('/out/hair', entry('old.txt', 3, 100), entry('model.glb', 1200)), listing('/out/notes', entry('findings.md', 9))]
  const input = (over: Partial<Parameters<typeof verifyNative>[0]> = {}, report = 'files=none artefacts=model.glb,/out/notes/findings.md metrics="tris=1200"') => ({
    repo: ROOTDIR,
    here: true,
    report: parseReport(`[[report v=1 task=OPS-9 subtask=main branch=main pr=none sha=HEAD gate=pass red=none ${report}]]`),
    briefText: `${HEADER}\n\nbody\n`,
    gateMap: { check: 'checker {outdir}' },
    allowed: (argv: readonly string[]) => argv.join(' ') === 'checker /out/hair',
    filesPath: '/w/main/.delegation/OPS-9/files.txt',
    outside: outside(GOOD_AFTER),
    ...over,
  })

  test('a worker that wrote only under its outdir and named its artefacts is consistent; the gate got {outdir}', async () => {
    const t = io(table())
    const r = await verifyNative(input(), t)
    expect(r.verdict).toBe('consistent')
    expect(r.lines).toContain('claim scope: held — every changed path is within scope=[/out/hair/**,/out/notes/*.md], forbid=[] untouched; outside delta: 2 changed paths under /out/hair, /out/notes, every one within scope and none in forbid')
    expect(r.lines).toContain('claim files: held — files= matches the dirty-tree delta exactly')
    expect(r.lines).toContain('claim artefacts: held — 2 artefacts exist and are not empty: model.glb (1200 bytes), /out/notes/findings.md (9 bytes)')
    expect(r.lines).toContain(`claim gate: held — gate green in the shared checkout ${ROOTDIR} (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)`)
    expect(r.lines).toContain('metrics: tris=1200')
    expect(r.metrics).toEqual({ tris: '1200' })
    expect(t.calls.find(c => c.argv[0] === 'checker')).toEqual({ argv: ['checker', '/out/hair'], cwd: ROOTDIR })
  })

  test('a file written outside every scope entry is refuted on scope, the line naming the outside delta', async () => {
    const stray = [listing('/out/hair', entry('old.txt', 3, 100), entry('model.glb', 1200)), listing('/out/notes', entry('findings.md', 9), entry('scratch.txt'))]
    const r = await verifyNative(input({ outside: outside(stray) }), io(table()))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)')
  })

  test('a stray file in the repo is refuted too, and the line says it came from the repo delta', async () => {
    const dirty = table({ [STATUS]: ok(' M scratch.py\0') })
    const r = await verifyNative(input({}, 'files=scratch.py artefacts=model.glb'), io(dirty))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim scope: failed — out-of-scope path: scratch.py (repo delta)')
  })

  test('a root that could not be listed leaves scope unchecked, so the verdict is unverified', async () => {
    const r = await verifyNative(input({ outside: outside([listing('/out/hair', entry('old.txt', 3, 100), entry('model.glb', 1200)), { root: '/out/notes', error: 'EACCES' }]) }), io(table()))
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim scope: unchecked — outside delta: /out/notes could not be listed at hand-back: EACCES')
    expect(r.lines.some(l => l.startsWith('claim scope: held'))).toBe(false)
  })

  test('an artefact the report names that is not there refutes on artefacts, naming the first missing one', async () => {
    const r = await verifyNative(input({}, 'files=none artefacts=model.glb,render.png,sound.wav'), io(table()))
    expect(r.verdict).toBe('refuted')
    expect(r.lines).toContain('claim artefacts: failed — missing: render.png (/out/hair/render.png)')
  })

  test('no artefacts= is no artefacts claim; no baseline is a note, not a claim', async () => {
    const r = await verifyNative(input({ outside: undefined }, 'files=none'), io(table()))
    expect(r.lines.some(l => l.startsWith('claim artefacts'))).toBe(false)
    expect(r.verdict).toBe('consistent')
    expect(r.lines).toContain('note: outside delta not checked: no listing of /out/hair, /out/notes was taken at dispatch')
  })

  test('a gate that names {outdir} with no outdir= in the brief is not re-run (unverified)', async () => {
    const noOutdir = HEADER.replace(' outdir=/out/hair', '')
    const r = await verifyNative(input({ briefText: `${noOutdir}\n\nbody\n` }, 'files=none'), io(table()))
    expect(r.verdict).toBe('unverified')
    expect(r.lines).toContain('claim gate: unchecked — gate not re-run: check (the command names {outdir} and the brief has no outdir=)')
  })
})
