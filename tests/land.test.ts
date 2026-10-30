// MOD-190: /delegation land writes a redacted issue body under .delegation/landed/ and prints the gh line; it files and dispatches nothing.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT } from './harness'
import { LAND_USAGE, parseLandArgs, parseLandTool } from '../hooks/lib/land'

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
    expect(body).toContain('- MOD-3 Card MOD-3')
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

  test('files the issue, adds it to the project, writes the number back and names #42', async ($, on) => {
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

  test('without a project only gh issue create runs, argv exactly as the brief says', async ($, on) => {
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

  test('a failed create reports the gh line and stderr, and writes nothing back', async ($, on) => {
    const w = world(on, { files: { ...files(), ...repoFile('o/1'), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: ghRun({ exitCode: 1, stdout: '', stderr: 'label type:bug not found' }) })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T' }))
    expect(out).toContain('gh issue create --repo o/r')
    expect(out).toContain('label type:bug not found')
    expect((w.files.get(`${LANDED}/t.md`) ?? '').includes('issue: #')).toBe(false)
    expect(w.runs.some(r => r.argv[1] === 'project')).toBe(false)
  })

  test('a failed item-add still reports filed and says why it was not added', async ($, on) => {
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

  test('after a successful file the old issue is closed and the line is reported', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/o/r.git') }, dirs: dirs(), run: run() })
    await $.session.start(sessionStart)
    const out = text(await tool($, { type: 'bug', title: 'T', note: 'wider scope', supersedes: 7 }))
    expect(out).toContain(`filed #42 ${URL42}`)
    expect(out).toContain('closed #7 as superseded by #42')
    expect(w.runs.map(r => r.argv)).toContainEqual(CLOSE)
    expect(w.files.get(`${LANDED}/t.md`) ?? '').toContain('supersedes: #7')
  })

  test('a failed close names the line and gh error; the new issue is still filed', async ($, on) => {
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
