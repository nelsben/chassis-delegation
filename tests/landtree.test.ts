// MOD-215: /delegation tree import and the tree_import tool: a multi-level plan file filed in one reviewed step.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT } from './harness'
import { parseTreePlan } from '../hooks/lib/landtree'

const LANDED = `${ROOT}/.delegation/landed`
const PLANS = `${ROOT}/.delegation/plans`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const importTool = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__tree_import', ...input } as never)
const cmd = ($: any, args: string) => $.command.run({ command: 'delegation', args: `tree import ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
const gh = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh')
const creates = (w: any) => gh(w).filter((a: string[]) => a[2] === 'create')
const planJson = (over: Record<string, unknown> = {}) => ({
  version: 1,
  items: [
    { type: 'feature', title: 'Alpha', children: [
      { type: 'epic', title: 'Beta', paths: ['src/**'], children: [
        { type: 'task', title: 'Gamma', paths: ['src/a.ts'] },
        { type: 'task', title: 'Delta', paths: ['src/b.ts'] },
      ] },
    ] },
  ],
  ...over,
})
const sim = (opts: { failCreateAt?: number } = {}) => {
  let n = 49
  let made = 0
  const issues = new Map<number, { title: string; state: string; parent?: number }>()
  const run = async (argv: string[]) => {
    if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
    if (argv[0] !== 'gh') return undefined
    if (argv[2] === 'view') {
      const num = Number(argv[3])
      const it = issues.get(num)
      if (!it) return { exitCode: 1, stdout: '', stderr: 'not found' }
      return { exitCode: 0, stdout: JSON.stringify({ number: num, title: it.title, state: it.state, labels: [], body: '', subIssues: [] }) }
    }
    if (argv[2] === 'close') {
      const it = issues.get(Number(argv[3]))
      if (it) it.state = 'CLOSED'
      return { exitCode: 0, stdout: '' }
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
const setup = (on: any, run: any, plan: unknown = planJson(), name = 'p.json') =>
  world(on, { files: { [REPO_FILE]: JSON.stringify({ domains: ['mod'] }), ...gitCfg('https://github.com/o/r.git'), [`${PLANS}/${name}`]: JSON.stringify(plan) }, dirs: {}, run })
const rel = '.delegation/plans/p.json'

describe('MOD-215: tree import', () => {
  test('a dry run prints the tree and counts and runs no gh', async ($, on) => {
    const w = setup(on, sim().run)
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel, confirm: true, dryRun: true }))
    const out2 = String((await cmd($, `${rel} --dry-run`)).text)
    for (const o of [out, out2]) {
      expect(o).toContain('feature: Alpha [scope: none]')
      expect(o).toContain('  epic: Beta [src/**]')
      expect(o).toContain('    task: Gamma [src/a.ts]')
      expect(o).toContain('counts: feature 1, epic 1, story 0, task 2 (4 items); new 4, may reuse 0, filed closed 0')
      expect(o).toContain('nothing filed')
    }
    expect(gh(w)).toEqual([])
    expect([...w.files.keys()].some(k => k.startsWith(LANDED))).toBe(false)
  })

  test('without confirm it only previews', async ($, on) => {
    const w = setup(on, sim().run)
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel }))
    expect(out).toContain('nothing filed')
    expect(gh(w)).toEqual([])
  })

  test('a 3-level file is filed parents first, the numbers are written into the file', async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel, confirm: true }))
    expect(creates(w).map((a: string[]) => [a[a.indexOf('--title') + 1], a[a.indexOf('--label') + 1], a.includes('--parent') ? a[a.indexOf('--parent') + 1] : ''])).toEqual([
      ['Alpha', 'type:feature', ''],
      ['Beta', 'type:epic', '50'],
      ['Gamma', 'type:task', '51'],
      ['Delta', 'type:task', '51'],
    ])
    const saved = JSON.parse(w.files.get(`${PLANS}/p.json`) ?? '{}')
    expect(saved.items[0].issue).toBe(50)
    expect(saved.items[0].children[0].issue).toBe(51)
    expect(saved.items[0].children[0].children[1].issue).toBe(53)
    expect(w.files.get(`${PLANS}/p.json`)).toBe(`${JSON.stringify(saved, null, 2)}\n`)
    expect(w.files.get(`${LANDED}/gamma.md`) ?? '').toMatch(/^plan: p-[0-9a-f]{8}$/m)
    expect(out).toContain('filed #50')
    expect(w.clockSleeps.length + w.runs.filter((r: any) => r.argv[0] === 'sleep').length).toBeGreaterThanOrEqual(3)
  })

  test('a re-run after a partial failure files only the missing items', async ($, on) => {
    const g = sim({ failCreateAt: 3 })
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    const first = text(await importTool($, { file: rel, confirm: true }))
    expect(first).toContain('not filed: Gamma')
    expect(creates(w)).toHaveLength(3)
    w.runs.length = 0
    const out = text(await importTool($, { file: rel, confirm: true }))
    expect(creates(w).map((a: string[]) => a[a.indexOf('--title') + 1])).toEqual(['Gamma', 'Delta'])
    expect(creates(w)[0]).toContain('51')
    expect(out).toContain('already filed #50')
    expect(out).toContain('already filed #51')
  })

  test('the batch option stops the run and says how to continue', { options: { treeImportBatch: 2 } }, async ($, on) => {
    const g = sim()
    const w = setup(on, g.run)
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel, confirm: true }))
    expect(creates(w)).toHaveLength(2)
    expect(out.split('\n').pop()).toBe('filed 2 of 4; run again to continue')
    w.runs.length = 0
    const out2 = text(await importTool($, { file: rel, confirm: true }))
    expect(creates(w)).toHaveLength(2)
    expect(out2).not.toContain('run again to continue')
  })

  test('a validation error names the item path and files nothing', async ($, on) => {
    const bad = planJson({ items: [{ type: 'feature', title: 'A', children: [{ type: 'task', title: 'No paths' }] }] })
    const w = setup(on, sim().run, bad)
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel, confirm: true }))
    expect(out).toContain('items[0].children[0]: a task needs at least one path')
    expect(gh(w)).toEqual([])
  })

  test('a file outside .delegation/plans/ is refused', async ($, on) => {
    const w = setup(on, sim().run)
    w.files.set(`${ROOT}/plan.json`, JSON.stringify(planJson()))
    await $.session.start(sessionStart)
    for (const f of ['plan.json', '.delegation/plans/../../plan.json']) {
      const out = text(await importTool($, { file: f, confirm: true }))
      expect(out).toContain('.delegation/plans/')
    }
    expect(gh(w)).toEqual([])
  })

  test('a closed item is filed, then closed, a CLOSED reuse is accepted only with close', async ($, on) => {
    const g = sim()
    const plan = planJson({ items: [{ type: 'epic', title: 'Done thing', close: 'shipped in 1.0', children: [{ type: 'task', title: 'Part', paths: ['a'], close: 'shipped in 1.0' }] }] })
    const w = setup(on, g.run, plan)
    await $.session.start(sessionStart)
    const pre = text(await importTool($, { file: rel }))
    expect(pre).toContain('filed closed 2')
    await importTool($, { file: rel, confirm: true })
    expect(gh(w).filter((a: string[]) => a[2] === 'close').map((a: string[]) => a[3])).toEqual(['51', '50'])
    w.runs.length = 0
    await importTool($, { file: rel, confirm: true })
    expect(creates(w)).toHaveLength(0)
  })

  test('MOD-221: a CLOSED recorded issue with no close is reused, not filed again', async ($, on) => {
    const g = sim()
    g.issues.set(7, { title: 'Old', state: 'CLOSED' })
    const plan = planJson({ items: [
      { type: 'task', title: 'Old', paths: ['a'], issue: 7 },
      { type: 'epic', title: 'Wrap', close: 'shipped', children: [{ type: 'task', title: 'Kid', paths: ['b'], issue: 7 }] },
    ] })
    const w = setup(on, g.run, plan)
    await $.session.start(sessionStart)
    const pre = text(await importTool($, { file: rel }))
    expect(gh(w)).toEqual([])
    expect(pre).toContain('nothing filed')
    const out = text(await importTool($, { file: rel, confirm: true }))
    expect(out).toContain('already filed #7 (closed) Old')
    expect(out).toContain('already filed 2')
    expect(creates(w).map((a: string[]) => a[a.indexOf('--title') + 1])).toEqual(['Wrap'])
    expect(gh(w).filter((a: string[]) => a[2] === 'close').map((a: string[]) => a[3])).toEqual(['50'])
  })

  test('a parent in the file files the top items under it', async ($, on) => {
    const w = setup(on, sim().run, planJson({ parent: 7 }))
    await $.session.start(sessionStart)
    const out = text(await importTool($, { file: rel }))
    expect(out).toContain('under #7')
    await importTool($, { file: rel, confirm: true })
    expect(creates(w)[0]).toContain('7')
  })
})

describe('MOD-215: the validator is the same one the engine uses', () => {
  test('imports', () => {
    expect('errors' in parseTreePlan('{"version":1,"items":[{"type":"epic","title":"A"}]}')).toBe(false)
  })
})
