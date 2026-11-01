// MOD-190: /delegation land writes a redacted issue body under .delegation/landed/ and prints the gh line; it files and dispatches nothing.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT } from './harness'
import { LAND_USAGE, LAND_TOOL, parseLandArgs, parseLandTool } from '../hooks/lib/land'

const land = (args: string) => ({ command: 'delegation', args: `land ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const ABS = `/${'home'}/someone/x.ts`
const CARDS = `${ROOT}/docs/cards`
const LANDED = `${ROOT}/.delegation/landed`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const card = (id: string, status: string, scope: string, extra = '') => ['---', `id: ${id}`, `title: Card ${id}`, 'domain: mod', 'tier: standard', `status: ${status}`, `scope: [${scope}]`, 'gate: node', ...(extra ? [extra] : []), '---', '## Done when', '', '- It works.', ''].join('\n')
const files = () => ({
  [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
  [`${CARDS}/MOD-1-a.md`]: card('MOD-1', 'queued', 'src/export/**', 'parent: 9'),
  [`${CARDS}/MOD-2-b.md`]: card('MOD-2', 'merged', 'docs/**'),
  [`${CARDS}/MOD-3-c.md`]: card('MOD-3', 'queued', 'lib/**'),
})
const dirs = () => ({ [CARDS]: ['MOD-1-a.md', 'MOD-2-b.md', 'MOD-3-c.md'] })
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })

describe('MOD-190: /delegation land', () => {
  test('writes the body, prints the gh line and the hint, files nothing', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('git@github.com:acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land(`bug "Export drops a row" --paths src/export/a.ts --note "see ${ABS}" --dry-run`))).text)
    const file = `${LANDED}/export-drops-a-row.md`
    expect(out.split('\n')).toEqual([
      file,
      `gh issue create --repo acme/widgets --title 'Export drops a row' --label type:bug --body-file ${file}`,
      'parent hint: #9 (from MOD-1)',
      'nothing was filed or dispatched',
    ])
    const body = w.files.get(file) ?? ''
    expect(body).toContain('```scope\nsrc/export/a.ts\n```')
    expect(body).toContain('- MOD-1 Card MOD-1')
    expect(body.includes('MOD-3')).toBe(false)
    expect(body.includes('MOD-2')).toBe(false)
    expect(body.includes(ABS)).toBe(false)
    expect([...w.files.keys()].filter(k => k.startsWith(`${ROOT}/.delegation/`) && !k.startsWith(LANDED))).toEqual([])
    expect(w.spawns.length).toBe(0)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('a second landing with the same title gets -2; --parent is passed through and no hint is printed', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    await $.command.run(land('task Same title --dry-run'))
    const out = String((await $.command.run(land('task Same title --parent 4 --paths src/export/a.ts --dry-run'))).text).split('\n')
    expect(out[0]).toBe(`${LANDED}/same-title-2.md`)
    expect(out[1]).toBe(`gh issue create --repo acme/widgets --title 'Same title' --label type:task --parent 4 --body-file ${LANDED}/same-title-2.md`)
    expect(out.length).toBe(3)
    expect(w.files.has(`${LANDED}/same-title.md`)).toBe(true)
  })

  test('an origin that is not GitHub replaces the gh line; the file is still written', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('git@example.org:acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land('spike Try it --dry-run'))).text).split('\n')
    expect(out[1]).toContain('not a GitHub remote')
    expect(w.files.has(`${LANDED}/try-it.md`)).toBe(true)
  })

  test('a bad type or parent is refused with the usage line and writes nothing', async ($, on) => {
    const w = world(on, { files: files(), dirs: dirs() })
    await $.session.start(sessionStart)
    for (const bad of ['chore Do it', 'bug', 'bug T --parent 0']) {
      const out = String((await $.command.run(land(bad))).text)
      expect(out).toContain('feature, epic, story, task, bug, spike')
    }
    expect([...w.files.keys()].some(k => k.startsWith(LANDED))).toBe(false)
  })

  test('--dry-run parses: the flag is dropped from the title and the type is still checked', async ($, on) => {
    world(on, { files: files(), dirs: dirs() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land('bug --dry-run'))).text)
    expect(out).toContain('feature, epic, story, task, bug, spike')
  })
})

describe('MOD-192: land files the issue itself', () => {
  const URL42 = 'https://github.com/o/r/issues/42'
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const repoFile = (project?: string) => ({ [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards', ...(project ? { project } : {}) }) })
  const ghRun = (create: { exitCode: number; stdout: string; stderr?: string }, add: { exitCode: number; stdout: string; stderr?: string } = { exitCode: 0, stdout: '' }) => async (argv: string[]) =>
    argv[0] === 'gh' ? (argv[2] === 'create' ? create : add) : undefined

  test('files the issue, adds it to the project, writes the number back and names #42', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun({ exitCode: 0, stdout: `${URL42}\n` }) })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'Export drops a row', parent: 9, paths: ['src/export/a.ts'] }))
    const file = `${LANDED}/export-drops-a-row.md`
    const gh = w.runs.map(r => r.argv).filter(a => a[0] === 'gh')
    expect(gh).toEqual([
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Export drops a row', '--label', 'type:bug', '--parent', '9', '--body-file', file],
      ['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', URL42],
    ])
    expect((w.files.get(file) ?? '').trimEnd().split('\n').pop()).toBe(`issue: #42 ${URL42}`)
    expect(out).toContain(file)
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out).toContain('added to project o/1')
    expect(out.includes('nothing was filed or dispatched')).toBe(false)
  })

  test('without a project only gh issue create runs, argv exactly as the brief says', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun({ exitCode: 0, stdout: `${URL42}\n` }) })
    await $.session.start(sessionStart)
    await tool($, { type: 'bug', title: 'T' })
    expect(w.runs.map(r => r.argv).filter(a => a[0] === 'gh')).toEqual([['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'T', '--label', 'type:bug', '--body-file', `${LANDED}/t.md`]])
  })

  test('dryRun writes the body and prints the line only', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'task', title: 'Dry one', dryRun: true }))
    expect(out).toContain('nothing was filed or dispatched')
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('a failed create reports the gh line and stderr, and writes nothing back', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun({ exitCode: 1, stdout: '', stderr: 'label type:bug not found' }) })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(out).toContain('gh issue create --repo o/r')
    expect(out).toContain('label type:bug not found')
    expect((w.files.get(`${LANDED}/t.md`) ?? '').includes('issue: #')).toBe(false)
    expect(w.runs.some(r => r.argv[1] === 'project')).toBe(false)
  })

  test('a failed item-add still reports filed and says why it was not added', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun({ exitCode: 0, stdout: URL42 }, { exitCode: 1, stdout: '', stderr: 'no such project' }) })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out).toContain('not added to project o/1: no such project')
    expect(w.files.get(`${LANDED}/t.md`) ?? '').toContain(`issue: #42 ${URL42}`)
  })

  test('an origin that is not GitHub behaves as dryRun and says why', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('git@example.org:o/r.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(out).toContain('not a GitHub remote')
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })
})

describe('MOD-200: land --supersedes', () => {
  const URL42 = 'https://github.com/o/r/issues/42'
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const run = (close: { exitCode: number; stdout: string; stderr?: string } = { exitCode: 0, stdout: '' }) => async (argv: string[]) =>
    argv[0] !== 'gh' ? undefined : argv[2] === 'create' ? { exitCode: 0, stdout: `${URL42}\n` } : argv[2] === 'close' ? close : { exitCode: 0, stdout: '' }
  const CLOSE = ['gh', 'issue', 'close', '7', '--repo', 'o/r', '--comment', 'superseded by #42: wider scope']

  test('both parse forms carry supersedes, the usage line names it', () => {
    expect((parseLandArgs('bug T --supersedes 7') as { supersedes?: number }).supersedes).toBe(7)
    expect((parseLandTool({ type: 'bug', title: 'T', supersedes: 7 }) as { supersedes?: number }).supersedes).toBe(7)
    expect('error' in parseLandArgs('bug T --supersedes 0')).toBe(true)
    expect('error' in parseLandArgs('bug T --supersedes x')).toBe(true)
    expect('error' in parseLandArgs('bug T --supersedes')).toBe(true)
    expect('error' in parseLandTool({ type: 'bug', title: 'T', supersedes: 1.5 })).toBe(true)
    expect(LAND_USAGE).toContain('--supersedes')
  })

  test('after a successful file the old issue is closed and the line is reported', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: run() })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', note: 'wider scope', supersedes: 7 }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out).toContain('closed #7 as superseded by #42')
    expect(w.runs.map(r => r.argv)).toContainEqual(CLOSE)
    expect(w.files.get(`${LANDED}/t.md`) ?? '').toContain('supersedes: #7')
  })

  test('a failed close names the line and gh error; the new issue is still filed', { options: { landAuto: true } }, async ($, on) => {
    world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: run({ exitCode: 1, stdout: '', stderr: 'no permission' }) })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', note: 'wider scope', supersedes: 7 }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out).toContain(CLOSE.join(' ').replace('superseded by #42: wider scope', "'superseded by #42: wider scope'"))
    expect(out).toContain('no permission')
    expect(out).not.toContain('closed #7')
  })

  test('dryRun prints the close line and runs nothing', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: run() })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', note: 'wider scope', supersedes: 7, dryRun: true }))
    expect(out).toContain('gh issue close 7 --repo o/r')
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })
})

describe('MOD-193: land_plan', () => {
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const repoFile = (project?: string) => ({ [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards', ...(project ? { project } : {}) }) })
  const fake = (failAt?: number) => {
    let n = 49
    let creates = 0
    return async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      creates++
      if (creates === failAt) return { exitCode: 1, stdout: '', stderr: 'boom: rate limited' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
  }
  const plan = (over: Record<string, unknown> = {}) => ({
    feature: { title: 'Export rework', paths: ['src/export/**'] },
    tasks: [
      { title: 'Fix header', paths: ['src/export/a.ts'] },
      { title: 'Fix footer', type: 'bug', paths: ['src/export/b.ts'] },
    ],
    ...over,
  })
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')

  test('MOD-244: a second call with no card changed reads no card; a changed card is read again', async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake() })
    for (const n of ['MOD-1-a.md', 'MOD-2-b.md', 'MOD-3-c.md']) w.mtimes.set(`${CARDS}/${n}`, 1000)
    await $.session.start(sessionStart)
    const cardReads = () => w.reads.filter(p => p.startsWith(`${CARDS}/`)).length
    await planTool($, plan())
    expect(cardReads()).toBeGreaterThan(0)
    const before = cardReads()
    await planTool($, plan())
    expect(cardReads()).toBe(before)
    w.mtimes.set(`${CARDS}/MOD-3-c.md`, 2000)
    await planTool($, plan())
    expect(cardReads()).toBe(before + 1)
  })

  test('without confirm: bodies written, no gh, the tree shown', async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake() })
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan()))
    expect(gh(w)).toEqual([])
    expect(w.files.get(`${LANDED}/export-rework.md`) ?? '').toContain('```scope\nsrc/export/**\n```')
    expect(w.files.get(`${LANDED}/fix-header.md`) ?? '').toContain('```scope\nsrc/export/a.ts\n```')
    expect(w.files.has(`${LANDED}/fix-footer.md`)).toBe(true)
    expect(out).toContain('feature: Export rework [src/export/**]')
    expect(out).toContain('  task: Fix header [src/export/a.ts]')
    expect(out).toContain('nothing filed: call land_plan again with confirm: true once the person says yes')
  })

  test('with confirm: feature first, tasks under it, then item-add per issue', async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake() })
    await $.session.start(sessionStart)
    await planTool($, plan())
    const out = text(await planTool($, plan({ confirm: true })))
    const u = (n: number) => `https://github.com/o/r/issues/${n}`
    expect(gh(w)).toEqual([
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Export rework', '--label', 'type:feature', '--body-file', `${LANDED}/export-rework.md`],
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix header', '--label', 'type:task', '--parent', '50', '--body-file', `${LANDED}/fix-header.md`],
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix footer', '--label', 'type:bug', '--parent', '50', '--body-file', `${LANDED}/fix-footer.md`],
      ['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', u(50)],
      ['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', u(51)],
      ['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', u(52)],
    ])
    expect([...w.files.keys()].filter(k => k.startsWith(LANDED))).toHaveLength(3)
    expect(w.files.get(`${LANDED}/export-rework.md`) ?? '').toContain(`issue: #50 ${u(50)}`)
    expect(out).toContain(`filed #50 ${u(50)} Export rework`)
    expect(out).toContain(`filed #52 ${u(52)} Fix footer`)
    expect(out).toContain('added to project o/1')
    expect(out).toContain('tree: #50 with 2 tasks')
  })

  test('a task path outside the feature paths refuses before any gh or write', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake() })
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan({ tasks: [{ title: 'Stray one', paths: ['docs/other.md'] }], confirm: true })))
    expect(out).toContain('Stray one')
    expect(out).toContain('docs/other.md')
    expect(out).toContain('src/export/**')
    expect(gh(w)).toEqual([])
    expect([...w.files.keys()].some(k => k.startsWith(LANDED))).toBe(false)
  })

  test('the second create failing lists #50 and #51, names the failed task and stops', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake(3) })
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan({ tasks: [{ title: 'T one', paths: ['src/export/a.ts'] }, { title: 'T two', paths: ['src/export/b.ts'] }, { title: 'T three', paths: ['src/export/c.ts'] }], confirm: true })))
    expect(out).toContain('filed #50')
    expect(out).toContain('filed #51')
    expect(out).toContain('not filed: T two')
    expect(out).toContain('not filed: T three')
    expect(out).toContain('boom: rate limited')
    expect(gh(w).filter((a: string[]) => a[2] === 'create')).toHaveLength(3)
  })

  test('MOD-198: a retry after a failed create reuses the filed feature, files the rest and adds the first call\'s issues to the project', async ($, on) => {
    let mode: 'fail' | 'ok' = 'fail'
    let creates = 0
    let n = 49
    const run = async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'view') return { exitCode: 0, stdout: JSON.stringify({ number: Number(argv[3]), state: 'OPEN' }) }
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      creates++
      if (mode === 'fail' && creates === 2) return { exitCode: 1, stdout: '', stderr: 'boom: rate limited' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    const u = (k: number) => `https://github.com/o/r/issues/${k}`
    const first = text(await planTool($, plan({ confirm: true })))
    expect(first).toContain('not filed: Fix header')
    expect(gh(w).filter((a: string[]) => a[1] === 'project')).toEqual([['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', u(50)]])
    expect(first).toContain('added to project o/1')
    mode = 'ok'
    w.runs.length = 0
    const out = text(await planTool($, plan({ confirm: true })))
    expect(gh(w).filter((a: string[]) => a[2] === 'create')).toEqual([
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix header', '--label', 'type:task', '--parent', '50', '--body-file', `${LANDED}/fix-header.md`],
      ['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix footer', '--label', 'type:bug', '--parent', '50', '--body-file', `${LANDED}/fix-footer.md`],
    ])
    expect([...w.files.keys()].filter(k => k.startsWith(LANDED) && /-2\.md$/.test(k))).toEqual([])
    const lines = out.split('\n')
    const at = lines.indexOf(`already filed #50 ${u(50)} Export rework`)
    expect(at).toBeGreaterThan(-1)
    expect(lines[at + 1]).toBe(`filed #51 ${u(51)} Fix header`)
    expect(lines[at + 2]).toBe(`filed #52 ${u(52)} Fix footer`)
    expect(out).toContain('tree: #50 with 2 tasks')
  })
})

describe('MOD-204: land hardening', () => {
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')

  test('a title holding a redact-list word reaches gh and the dry-run line redacted', { options: { redact: 'globex', landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: async argv => (argv[0] === 'gh' ? { exitCode: 0, stdout: 'https://github.com/o/r/issues/42\n' } : undefined) })
    await $.session.start(sessionStart)
    const dry = text(await tool($, { type: 'bug', title: 'Globex export drops a row', dryRun: true }))
    expect(dry.includes('Globex')).toBe(false)
    await tool($, { type: 'bug', title: 'Globex export drops a row' })
    const create = gh(w).find((a: string[]) => a[2] === 'create')
    expect(create[create.indexOf('--title') + 1].includes('Globex')).toBe(false)
    expect(create[create.indexOf('--title') + 1]).toContain('export drops a row')
    expect([...w.files.keys()].some(k => k.toLowerCase().includes('globex'))).toBe(false)
  })

  test('a land_plan title holding a redact-list word is redacted before gh', { options: { redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: async argv => (argv[0] === 'gh' ? { exitCode: 0, stdout: 'https://github.com/o/r/issues/50\n' } : undefined) })
    await $.session.start(sessionStart)
    await planTool($, { feature: { title: 'Globex rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }], confirm: true })
    const titles = gh(w).filter((a: string[]) => a[2] === 'create').map((a: string[]) => a[a.indexOf('--title') + 1])
    expect(titles.length).toBe(2)
    expect(titles.some((t: string) => t.includes('Globex'))).toBe(false)
  })

  test('the body lists only the open cards whose scope holds a path, and no section without a path', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    await $.command.run(land('task With paths --paths src/export/a.ts --dry-run'))
    await $.command.run(land('task Without paths --dry-run'))
    await $.command.run(land('task Elsewhere --paths other/z.ts --dry-run'))
    const withPaths = w.files.get(`${LANDED}/with-paths.md`) ?? ''
    expect(withPaths).toContain('## Landed from')
    expect(withPaths).toContain('- MOD-1 Card MOD-1')
    expect(withPaths.includes('MOD-3')).toBe(false)
    for (const n of ['without-paths', 'elsewhere']) {
      const b = w.files.get(`${LANDED}/${n}.md`) ?? ''
      expect(b.includes('## Landed from')).toBe(false)
      expect(b.includes('MOD-')).toBe(false)
    }
  })

  test('MOD-259: the overlap list of a landed plan leaves out a parked card and a merged card, and keeps an open one', async ($, on) => {
    const CARD_FILES = {
      [`${CARDS}/MOD-1-a.md`]: card('MOD-1', 'queued', 'src/export/**'),
      [`${CARDS}/MOD-4-d.md`]: card('MOD-4', 'parked', 'src/export/**'),
      [`${CARDS}/MOD-5-e.md`]: card('MOD-5', 'merged', 'src/export/**'),
    }
    const w = world(on, { files: { ...files(), ...CARD_FILES, ...gitCfg('https://github.com/o/r.git') }, dirs: { [CARDS]: ['MOD-1-a.md', 'MOD-4-d.md', 'MOD-5-e.md'] } })
    await $.session.start(sessionStart)
    await planTool($, { feature: { title: 'Export rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }] })
    const bodies = [...w.files.entries()].filter(([k]) => k.startsWith(LANDED) && k.endsWith('.md')).map(([, v]) => v)
    expect(bodies.length).toBe(2)
    for (const b of bodies) {
      expect(b).toContain('## Landed from')
      expect(b).toContain('- MOD-1 Card MOD-1')
      expect(b.includes('MOD-4')).toBe(false)
      expect(b.includes('MOD-5')).toBe(false)
    }
  })

  test('a retry after a partial failure reuses the filed items even when the open cards changed', async ($, on) => {
    let creates = 0
    let n = 49
    let fail = true
    let views = 0
    const run = async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'view') {
        views++
        return { exitCode: 0, stdout: JSON.stringify({ number: Number(argv[3]), state: 'OPEN', subIssues: [{ number: 51, title: 'Fix header', state: 'OPEN' }] }) }
      }
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      creates++
      if (fail && creates === 3) return { exitCode: 1, stdout: '', stderr: 'boom' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    const input = { feature: { title: 'Export rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }, { title: 'Fix footer', paths: ['src/export/b.ts'] }], confirm: true }
    await planTool($, input)
    expect(creates).toBe(3)
    // between the calls the overlapping card changes its title
    w.files.set(`${CARDS}/MOD-1-a.md`, card('MOD-1', 'queued', 'src/export/**', 'parent: 9').replace('title: Card MOD-1', 'title: A renamed card'))
    fail = false
    const out = text(await planTool($, input))
    expect(creates).toBe(4)
    expect(views).toBeGreaterThan(0)
    expect(out).toContain('already filed #50')
    expect(out).toContain('already filed #51')
    expect([...w.files.keys()].filter(k => k.startsWith(LANDED) && /(export-rework|fix-header)-\d\.md$/.test(k))).toEqual([])
  })

  test('a closed issue is filed anew', async ($, on) => {
    let n = 49
    const run = async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'view') return { exitCode: 0, stdout: JSON.stringify({ number: Number(argv[3]), state: 'CLOSED' }) }
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    const input = { feature: { title: 'Export rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }], confirm: true }
    await planTool($, input)
    await planTool($, input)
    expect(gh(w).filter((a: string[]) => a[2] === 'create').length).toBe(4)
  })
})

describe('MOD-205: landAuto', () => {
  const URL42 = 'https://github.com/o/r/issues/42'
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const ghRun = async (argv: string[]) => (argv[0] === 'gh' ? { exitCode: 0, stdout: `${URL42}\n` } : undefined)
  const CLOSING = 'nothing filed: landAuto is off; call land again with confirm: true once the person says yes'
  const setup = (on: any) => world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun })

  test('the tool schema and parser carry confirm; the usage names --confirm', () => {
    expect((LAND_TOOL.inputSchema.properties as Record<string, { type: string }>).confirm?.type).toBe('boolean')
    expect((parseLandTool({ type: 'bug', title: 'T', confirm: true }) as { confirm?: boolean }).confirm).toBe(true)
    expect((parseLandTool({ type: 'bug', title: 'T' }) as { confirm?: boolean }).confirm).toBeUndefined()
    expect((parseLandArgs('bug T --confirm') as { confirm?: boolean }).confirm).toBe(true)
    expect(LAND_USAGE).toContain('--confirm')
  })

  test('off without confirm: body written, issue shown, no gh issue create, closing line', { options: { landAuto: false } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'Export drops a row', parent: 9, paths: ['src/export/a.ts'] }))
    expect(out).toContain(`${LANDED}/export-drops-a-row.md`)
    expect(out).toContain('gh issue create --repo o/r')
    expect(out.split('\n').pop()).toBe(CLOSING)
    expect(w.files.has(`${LANDED}/export-drops-a-row.md`)).toBe(true)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('off with confirm: true files as today', { options: { landAuto: false } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', confirm: true }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(w.runs.filter(r => r.argv[1] === 'issue' && r.argv[2] === 'create')).toHaveLength(1)
  })

  test('MOD-208: unset landAuto means off: land files nothing, closing line shown', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(out.split('\n').pop()).toBe(CLOSING)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('on ignores confirm and files', { options: { landAuto: true } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', confirm: false }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out.includes(CLOSING)).toBe(false)
    expect(w.runs.filter(r => r.argv[2] === 'create')).toHaveLength(1)
  })

  test('off: /delegation land files nothing without --confirm, and files with it', { options: { landAuto: false } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land('bug T'))).text)
    expect(out.split('\n').pop()).toBe(CLOSING)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
    const out2 = String((await $.command.run(land('bug T --confirm'))).text)
    expect(out2).toContain(`filed #42 ${URL42}`)
  })
})

// MOD-207: land resume is keyed to the plan; preview runs no gh; confirm reuses the preview file.
describe('MOD-207: land resume keyed to the plan', () => {
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const landTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')
  const creates = (w: any) => gh(w).filter((a: string[]) => a[2] === 'create')
  // a tiny GitHub: create numbers from 50 and records --parent; view answers state and subIssues
  const sim = (opts: { failCreateAt?: number } = {}) => {
    let n = 49
    let made = 0
    const issues = new Map<number, { title: string; state: string; parent?: number }>()
    const run = async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'view') {
        const num = Number(argv[3])
        const it = issues.get(num)
        if (!it) return { exitCode: 1, stdout: '', stderr: 'not found' }
        const subIssues = [...issues.entries()].filter(([, v]) => v.parent === num).map(([k, v]) => ({ number: k, title: v.title, state: v.state }))
        return { exitCode: 0, stdout: JSON.stringify({ number: num, title: it.title, state: it.state, labels: [], body: '', subIssues }) }
      }
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      made++
      if (made === opts.failCreateAt) return { exitCode: 1, stdout: '', stderr: 'boom' }
      n++
      const p = argv.indexOf('--parent')
      issues.set(n, { title: argv[argv.indexOf('--title') + 1] as string, state: 'OPEN', ...(p >= 0 ? { parent: Number(argv[p + 1]) } : {}) })
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
    return { run, issues }
  }
  const setup = (on: any, run: any) => world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run })
  const planA = (over: Record<string, unknown> = {}) => ({ feature: { title: 'Export rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }, { title: 'Fix footer', paths: ['src/export/b.ts'] }], confirm: true, ...over })

  test('two plans with different features and a task of the same title: the second files a new task', async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await planTool($, planA())
    w.runs.length = 0
    const out = text(await planTool($, { feature: { title: 'Import rework', paths: ['src/import/**'] }, tasks: [{ title: 'Fix header', paths: ['src/import/a.ts'] }], confirm: true }))
    expect(creates(w)).toHaveLength(2)
    expect(creates(w)[1]).toEqual(['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix header', '--label', 'type:task', '--parent', '53', '--body-file', `${LANDED}/fix-header-2.md`])
    expect(out.includes('already filed')).toBe(false)
  })

  test('two features with the same title and different paths: the second files a new feature', async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await planTool($, planA())
    w.runs.length = 0
    const out = text(await planTool($, { feature: { title: 'Export rework', paths: ['src/export/sub/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/sub/a.ts'] }], confirm: true }))
    expect(creates(w)).toHaveLength(2)
    expect(creates(w)[0]).toEqual(['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Export rework', '--label', 'type:feature', '--body-file', `${LANDED}/export-rework-2.md`])
    expect(out.includes('already filed')).toBe(false)
    expect(w.files.get(`${LANDED}/export-rework-2.md`) ?? '').toMatch(/^plan: export-rework-[0-9a-f]{8}$/m)
  })

  test('a partial-failure retry of the same plan reuses its filed items', async ($, on) => {
    const g = sim({ failCreateAt: 3 })
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    const first = text(await planTool($, planA()))
    expect(first).toContain('not filed: Fix footer')
    w.runs.length = 0
    const out = text(await planTool($, planA()))
    expect(out).toContain('already filed #50')
    expect(out).toContain('already filed #51')
    expect(creates(w)).toEqual([['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Fix footer', '--label', 'type:task', '--parent', '50', '--body-file', `${LANDED}/fix-footer.md`]])
    expect(gh(w).filter((a: string[]) => a[2] === 'view')).toHaveLength(1)
  })

  test('a land_plan preview runs no gh and says may reuse', async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await planTool($, planA())
    w.runs.length = 0
    const out = text(await planTool($, planA({ confirm: false })))
    expect(gh(w)).toEqual([])
    expect(out).toContain('may reuse #50 (checked on confirm)')
    expect(out).toContain('may reuse #51 (checked on confirm)')
  })

  test('every landed plan file carries the plan: line before the issue: line', async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await planTool($, planA())
    const lines = (w.files.get(`${LANDED}/fix-header.md`) ?? '').trimEnd().split('\n')
    expect(lines[lines.length - 1]).toMatch(/^issue: #51 /)
    expect(lines[lines.length - 2]).toMatch(/^plan: export-rework-[0-9a-f]{8}$/)
  })

  test('land preview then confirm leaves exactly one landed file and files from it', { options: { landAuto: false } }, async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await landTool($, { type: 'bug', title: 'Export drops a row', paths: ['src/export/a.ts'] })
    const out = text(await landTool($, { type: 'bug', title: 'Export drops a row', paths: ['src/export/a.ts'], confirm: true }))
    expect([...w.files.keys()].filter(k => k.startsWith(LANDED))).toEqual([`${LANDED}/export-drops-a-row.md`])
    expect(creates(w)).toHaveLength(1)
    expect(creates(w)[0]?.at(-1)).toBe(`${LANDED}/export-drops-a-row.md`)
    expect(out).toContain('filed #50')
  })

  test('land confirm after a timed-out create with an OPEN issue on the file reports already filed and creates nothing', { options: { landAuto: false } }, async ($, on) => {
    const g = sim()
    g.issues.set(42, { title: 'Export drops a row', state: 'OPEN' })
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    await landTool($, { type: 'bug', title: 'Export drops a row' })
    const file = `${LANDED}/export-drops-a-row.md`
    w.files.set(file, `${w.files.get(file) ?? ''}issue: #42 https://github.com/o/r/issues/42\n`)
    w.runs.length = 0
    const out = text(await landTool($, { type: 'bug', title: 'Export drops a row', confirm: true }))
    expect(out).toContain('already filed #42 https://github.com/o/r/issues/42')
    expect(creates(w)).toHaveLength(0)
    expect([...w.files.keys()].filter(k => k.startsWith(LANDED))).toEqual([file])
  })
})

describe('MOD-218: same-repo land, dotfolders, project precedence', () => {
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const repoFile = (project?: string) => ({ [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards', ...(project ? { project } : {}) }) })
  const run = async (argv: string[]) => (argv[0] === 'gh' ? { exitCode: 0, stdout: argv[2] === 'create' ? 'https://github.com/o/acme-app/issues/42\n' : '' } : undefined)
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')
  const adds = (w: any) => gh(w).filter((a: string[]) => a[1] === 'project')
  const origin = gitCfg('https://github.com/o/acme-app.git')

  test('same-repo land keeps the repo name in the title and body; a listed word and a dotfolder are handled', { options: { landAuto: true, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await tool($, { type: 'bug', title: 'acme-app drops a row', note: 'config in ~/.globex/x and acme-app, Globex' })
    const create = gh(w).find((a: string[]) => a[2] === 'create')
    expect(create[create.indexOf('--title') + 1]).toBe('acme-app drops a row')
    const body = w.files.get(`${LANDED}/acme-app-drops-a-row.md`) ?? ''
    expect(body).toContain('config in ~/.globex/x and acme-app, <redacted>')
  })

  test('land_plan keeps the repo name too', { options: { redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await planTool($, { feature: { title: 'acme-app rework', paths: ['src/export/**'], note: 'see ~/.globex/' }, tasks: [{ title: 'Fix acme-app header', paths: ['src/export/a.ts'] }], confirm: true })
    const titles = gh(w).filter((a: string[]) => a[2] === 'create').map((a: string[]) => a[a.indexOf('--title') + 1])
    expect(titles).toEqual(['acme-app rework', 'Fix acme-app header'])
  })

  test('a repo-level project beats a user-level one', { options: { landAuto: true, project: 'u/9' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await tool($, { type: 'bug', title: 'T' })
    expect(adds(w)).toEqual([['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', 'https://github.com/o/acme-app/issues/42']])
  })

  test('a repo-level project none beats a user-level one: no item-add and no line', { options: { landAuto: true, project: 'u/9' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('none'), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(adds(w)).toEqual([])
    expect(out).toContain('filed #42')
    expect(out.includes('project')).toBe(false)
  })

  test('the user-level project still applies when the repo sets none', { options: { landAuto: true, project: 'u/9' } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await tool($, { type: 'bug', title: 'T' })
    expect(adds(w).length).toBe(1)
    expect(adds(w)[0].slice(0, 6)).toEqual(['gh', 'project', 'item-add', '9', '--owner', 'u'])
  })

  test('project: false runs no item-add for that call only', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'First', project: false }))
    expect(adds(w)).toEqual([])
    expect(out.includes('project')).toBe(false)
    await tool($, { type: 'bug', title: 'Second' })
    expect(adds(w).length).toBe(1)
  })

  test('/delegation land --no-project skips the add', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await $.command.run(land('bug Third --no-project'))
    expect(gh(w).some((a: string[]) => a[2] === 'create')).toBe(true)
    expect(adds(w)).toEqual([])
  })

  test('land_plan with project: false adds nothing', async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...origin }, dirs: dirs(), run })
    await $.session.start(sessionStart)
    await planTool($, { feature: { title: 'Rework', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }], confirm: true, project: false })
    expect(adds(w)).toEqual([])
  })
})

describe('MOD-213: land_plan parent and no-path items', () => {
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')
  const creates = (w: any) => gh(w).filter((a: string[]) => a[2] === 'create')
  const fake = () => {
    let n = 49
    return async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
  }
  const setup = (on: any) => world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: fake() })
  const base = (over: Record<string, unknown> = {}) => ({ feature: { title: 'Export epic', type: 'epic', paths: ['src/export/**'] }, tasks: [{ title: 'Fix header', paths: ['src/export/a.ts'] }], ...over })

  test('a top item with a parent files under it; the preview says under #n and runs no gh', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const pre = text(await planTool($, base({ feature: { title: 'Export epic', type: 'epic', paths: ['src/export/**'] }, parent: 7 })))
    expect(pre).toContain('under #7')
    expect(gh(w)).toEqual([])
    await planTool($, base({ parent: 7, confirm: true }))
    expect(creates(w)[0]).toEqual(['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Export epic', '--label', 'type:epic', '--parent', '7', '--body-file', `${LANDED}/export-epic.md`])
    expect(creates(w)[1]).toContain('50')
  })

  test('the same plan under a different parent files a new top issue', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await planTool($, base({ parent: 7, confirm: true }))
    w.runs.length = 0
    await planTool($, base({ parent: 8, confirm: true }))
    expect(creates(w)).toHaveLength(2)
    expect(creates(w)[0]).toContain('8')
    expect(creates(w)[0]).toContain(`${LANDED}/export-epic-2.md`)
  })

  test('a bad parent is refused', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    expect(text(await planTool($, base({ parent: 0, confirm: true })))).toContain('parent')
    expect(text(await planTool($, base({ parent: 1.5, confirm: true })))).toContain('parent')
    expect(gh(w)).toEqual([])
  })

  test('a story with paths: [] is accepted and its body says scope none; preview shows scope: none', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, base({ tasks: [{ title: 'Process story', type: 'story', paths: [] }, { title: 'Left out', type: 'story' }] })))
    expect(out).toContain('scope: none')
    const body = w.files.get(`${LANDED}/process-story.md`) ?? ''
    expect(body).toContain('scope: none')
    expect(body).not.toContain('```scope')
  })

  test('a task with no paths is still refused', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, base({ tasks: [{ title: 'Bare task', paths: [] }], confirm: true })))
    expect(out).toContain('needs at least one path')
    expect(gh(w)).toEqual([])
  })

  test('a child path outside a parent that has paths is still refused; children of a no-path parent are accepted', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    expect(text(await planTool($, base({ tasks: [{ title: 'Stray', paths: ['docs/x.md'] }], confirm: true })))).toContain('outside the feature paths')
    expect(gh(w)).toEqual([])
    const out = text(await planTool($, base({ feature: { title: 'Loose epic', type: 'epic' }, tasks: [{ title: 'Anywhere', paths: ['docs/x.md'] }], confirm: true })))
    expect(out).toContain('tree: #50 with 1 tasks')
    expect(creates(w)).toHaveLength(2)
  })

  test('a plan with no tasks files just the top issue, under its parent', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, { feature: { title: 'Lonely epic', type: 'epic', paths: [] }, parent: 3, confirm: true }))
    expect(creates(w)).toEqual([['gh', 'issue', 'create', '--repo', 'o/r', '--title', 'Lonely epic', '--label', 'type:epic', '--parent', '3', '--body-file', `${LANDED}/lonely-epic.md`]])
    expect(out).toContain('tree: #50 with 0 tasks')
    const none = text(await planTool($, { feature: { title: 'Empty tasks', paths: ['a/**'] }, tasks: [] }))
    expect(none).toContain('nothing filed')
  })
})

describe('MOD-214: an item filed already done is closed at once with its evidence', () => {
  const tool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land', ...input } as never)
  const planTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__land_plan', ...input } as never)
  const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')
  const closes = (w: any) => gh(w).filter((a: string[]) => a[2] === 'close')
  const creates = (w: any) => gh(w).filter((a: string[]) => a[2] === 'create')
  // numbers from 50; `states` answers gh issue view per number (OPEN unless set); `failClose` numbers refuse to close
  const fake = (states: Record<number, string> = {}, failClose: number[] = [], subs: { number: number; state: string }[] = []) => {
    let n = 49
    return async (argv: string[]) => {
      if (argv[0] !== 'gh') return undefined
      if (argv[2] === 'view') return { exitCode: 0, stdout: JSON.stringify({ number: Number(argv[3]), state: states[Number(argv[3])] ?? 'OPEN', subIssues: subs }) }
      if (argv[2] === 'close') return failClose.includes(Number(argv[3])) ? { exitCode: 1, stdout: '', stderr: 'no permission' } : { exitCode: 0, stdout: '' }
      if (argv[2] !== 'create') return { exitCode: 0, stdout: '' }
      n++
      return { exitCode: 0, stdout: `https://github.com/o/r/issues/${n}\n` }
    }
  }
  const setup = (on: any, run = fake()) => world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run })
  const plan = (closeTasks: (string | undefined)[], closeFeature: string | undefined = 'shipped in v1', over: Record<string, unknown> = {}) => ({
    feature: { title: 'Export rework', paths: ['src/export/**'], ...(closeFeature ? { close: closeFeature } : {}) },
    tasks: [
      { title: 'Fix header', paths: ['src/export/a.ts'], ...(closeTasks[0] ? { close: closeTasks[0] } : {}) },
      { title: 'Fix footer', paths: ['src/export/b.ts'], ...(closeTasks[1] ? { close: closeTasks[1] } : {}) },
    ],
    ...over,
  })

  test('land --closed files, then closes with the redacted comment and writes a closed: line', { options: { landAuto: true, redact: 'globex' } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'story', title: 'Old export', closed: 'shipped by globex in v1' }))
    expect(out).toContain('filed #50')
    expect(closes(w)).toEqual([['gh', 'issue', 'close', '50', '--repo', 'o/r', '--comment', expect.stringMatching(/^done before filing: shipped by .* in v1$/)]])
    expect(closes(w)[0][7]).not.toContain('globex')
    expect(out).toContain('closed #50')
    expect(w.files.get(`${LANDED}/old-export.md`) ?? '').toMatch(/issue: #50 \S+\nclosed: \d{4}-\d\d-\d\dT[\d:.]+Z\n$/)
    const parsed = parseLandArgs('story Old export --closed shipped in v1 --paths a.ts')
    expect('error' in parsed ? '' : parsed.closed).toBe('shipped in v1')
    expect(LAND_USAGE).toContain('--closed')
  })

  test('land without closed runs no close', { options: { landAuto: true } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await tool($, { type: 'story', title: 'Plain' })
    expect(closes(w)).toEqual([])
  })

  test('land_plan with every child closed closes the children, then the parent', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan(['in v1', 'in v2'], 'whole thing in v2', { confirm: true })))
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['51', '52', '50'])
    expect(closes(w)[2][7]).toBe('done before filing: whole thing in v2')
    expect(out).not.toContain('left open')
    expect(w.files.get(`${LANDED}/fix-header.md`) ?? '').toMatch(/closed: \d{4}-/)
  })

  test('one open child keeps the parent open and the result says so', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan(['in v1', undefined], 'all of it', { confirm: true })))
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['51'])
    expect(out).toContain('#50 left open: 1 open children')
  })

  test('a child with close under a parent without close leaves the parent open', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan(['in v1', 'in v2'], '', { confirm: true })))
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['51', '52'])
    expect(out).not.toContain('left open')
  })

  test('the preview marks the item (filed closed: ...) and runs no gh', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan(['in v1', undefined])))
    expect(out).toContain('  task: Fix header [src/export/a.ts] (filed closed: in v1)')
    expect(out).toContain('(filed closed: shipped in v1)')
    expect(out).not.toContain('Fix footer [src/export/b.ts] (filed')
    expect(gh(w)).toEqual([])
    const land = text(await tool($, { type: 'story', title: 'Old export', closed: 'in v1', dryRun: true }))
    expect(land).toContain('(filed closed: in v1)')
    expect(gh(w)).toEqual([])
  })

  test('a retry closes a reused item that is still open, and leaves a closed one as is', async ($, on) => {
    const states: Record<number, string> = {}
    const failing = [51]
    const inner = fake(states, [], [{ number: 51, state: 'OPEN' }, { number: 52, state: 'OPEN' }])
    const run = async (argv: string[]) => {
      if (argv[0] === 'gh' && argv[2] === 'close' && failing.includes(Number(argv[3]))) return { exitCode: 1, stdout: '', stderr: 'no permission' }
      if (argv[0] === 'gh' && argv[2] === 'view') return { exitCode: 0, stdout: JSON.stringify({ number: Number(argv[3]), state: states[Number(argv[3])] ?? 'OPEN', subIssues: [{ number: 51, state: states[51] ?? 'OPEN' }, { number: 52, state: states[52] ?? 'OPEN' }] }) }
      return inner(argv)
    }
    const w = setup(on, run)
    await $.session.start(sessionStart)
    const input = plan(['in v1', 'in v2'], '', { confirm: true })
    const first = text(await planTool($, input))
    expect(first).toContain('close #51 failed: no permission')
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['51', '52'])
    states[52] = 'CLOSED'
    failing.length = 0
    w.runs.length = 0
    const out = text(await planTool($, input))
    expect(creates(w)).toEqual([])
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['51'])
    expect(out).toContain('already filed #51')
    expect(out).not.toContain('failed')
  })

  test('a failed close is reported once, not retried, and no closed: line is written', async ($, on) => {
    const w = setup(on, fake({}, [51]))
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan(['in v1', undefined], '', { confirm: true })))
    expect(out.split('\n').filter(l => l.startsWith('close #51 failed'))).toHaveLength(1)
    expect(closes(w)).toHaveLength(1)
    expect(w.files.get(`${LANDED}/fix-header.md`) ?? '').not.toContain('closed:')
  })

  test('a close that is not text is refused before anything is written', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await planTool($, plan([], '', { feature: { title: 'Export rework', paths: ['src/export/**'], close: 5 } })))
    expect(out).toContain('close')
    expect([...w.files.keys()].some(k => k.startsWith(LANDED))).toBe(false)
  })
})
