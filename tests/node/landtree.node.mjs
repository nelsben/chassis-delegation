// MOD-215: tree import, the pure half: the plan file validator, the folder rule, the counts and the batch option.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/landtree.ts')
const file = o => JSON.stringify(o)
const task = (title, paths = ['src/a.ts']) => ({ type: 'task', title, paths })

describe('MOD-215: parseTreePlan', () => {
  test('a three-level file is normalised, with defaults and item paths', async () => {
    const { parseTreePlan } = await lib()
    const r = parseTreePlan(file({ version: 1, parent: 9, items: [{ type: 'feature', title: ' Big  one ', children: [{ type: 'epic', title: 'E', paths: ['src/**'], children: [task('T')] }] }] }))
    expect('errors' in r).toBe(false)
    expect(r.plan.parent).toBe(9)
    const f = r.plan.items[0]
    expect(f.title).toBe('Big one')
    expect(f.paths).toEqual([])
    expect(f.children[0].at).toBe('items[0].children[0]')
    expect(f.children[0].children[0].at).toBe('items[0].children[0].children[0]')
    expect(f.children[0].children[0].idx).toEqual([0, 0, 0])
  })
  test('every error names its item path and all are returned together', async () => {
    const { parseTreePlan } = await lib()
    const r = parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A' }, { type: 'epic', title: 'B', children: [{ type: 'task', title: 'no paths' }, { type: 'story', title: '' }, { type: 'chore', title: 'x' }] }] }))
    expect(r.errors).toEqual([
      'items[1].children[0]: a task needs at least one path',
      'items[1].children[1]: needs a title',
      'items[1].children[2]: type must be one of feature, epic, story, task',
    ])
  })
  test('a child path outside a parent that has paths is refused; under a parent without paths it is free', async () => {
    const { parseTreePlan } = await lib()
    const bad = parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A', paths: ['src/x/**'], children: [task('T', ['docs/a.md'])] }] }))
    expect(bad.errors[0]).toContain('items[0].children[0]: path docs/a.md is outside the parent paths')
    const ok = parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A', children: [task('T', ['docs/a.md'])] }] }))
    expect('errors' in ok).toBe(false)
  })
  test('nesting stops at 4 levels', async () => {
    const { parseTreePlan } = await lib()
    const deep = { type: 'task', title: 'd5', paths: ['a'] }
    const ok = parseTreePlan(file({ version: 1, items: [{ type: 'feature', title: 'l1', children: [{ type: 'epic', title: 'l2', children: [{ type: 'story', title: 'l3', children: [{ type: 'task', title: 'l4', paths: ['a'] }] }] }] }] }))
    expect('errors' in ok).toBe(false)
    const bad = parseTreePlan(file({ version: 1, items: [{ type: 'feature', title: 'l1', children: [{ type: 'epic', title: 'l2', children: [{ type: 'story', title: 'l3', children: [{ type: 'story', title: 'l4', children: [deep] }] }] }] }] }))
    expect(bad.errors).toEqual(['items[0].children[0].children[0].children[0].children[0]: nested deeper than 4 levels'])
  })
  test('the sub-issue cap of 100 is checked per parent, and for the top items only under a parent issue', async () => {
    const { parseTreePlan } = await lib()
    const many = n => Array.from({ length: n }, (_, i) => task(`t${i}`))
    const bad = parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A', children: many(101) }] }))
    expect(bad.errors).toEqual(['items[0]: 101 children; GitHub allows 100 sub-issues per parent'])
    expect('errors' in parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A', children: many(100) }] }))).toBe(false)
    const tops = Array.from({ length: 101 }, (_, i) => ({ type: 'epic', title: `e${i}` }))
    expect('errors' in parseTreePlan(file({ version: 1, items: tops }))).toBe(false)
    expect(parseTreePlan(file({ version: 1, parent: 3, items: tops })).errors).toEqual(['items: 101 items under #3; GitHub allows 100 sub-issues per parent'])
  })
  test('version, parent, items, close, issue and bad JSON are checked', async () => {
    const { parseTreePlan } = await lib()
    expect(parseTreePlan('{nope').errors[0]).toContain('not valid JSON')
    expect(parseTreePlan(file({ version: 2, items: [] })).errors).toContain('version must be 1')
    expect(parseTreePlan(file({ version: 1, items: [] })).errors).toContain('items must be a list of 1 or more')
    expect(parseTreePlan(file({ version: 1, parent: 0, items: [{ type: 'epic', title: 'A' }] })).errors).toEqual(['parent must be a whole number, 1 or more'])
    const r = parseTreePlan(file({ version: 1, items: [{ type: 'epic', title: 'A', close: '  ', issue: 1.5 }] }))
    expect(r.errors).toEqual(['items[0]: close must be evidence text', 'items[0]: issue must be a whole number, 1 or more'])
  })
})

describe('MOD-215: counts, lines and the folder rule', () => {
  test('counts per type, new, may reuse and filed closed', async () => {
    const { parseTreePlan, treeCounts } = await lib()
    const r = parseTreePlan(file({ version: 1, items: [{ type: 'feature', title: 'F', issue: 5, children: [{ type: 'epic', title: 'E', close: 'shipped', children: [task('T1'), { ...task('T2'), issue: 8 }] }] }] }))
    expect(treeCounts(r.plan)).toEqual({ byType: { feature: 1, epic: 1, story: 0, task: 2 }, total: 4, fresh: 2, reuse: 2, closed: 1 })
  })
  test('the preview indents two spaces a level', async () => {
    const { parseTreePlan, treeLines } = await lib()
    const r = parseTreePlan(file({ version: 1, parent: 4, items: [{ type: 'feature', title: 'F', issue: 5, children: [{ type: 'epic', title: 'E', close: 'shipped', children: [task('T1')] }] }] }))
    expect(treeLines(r.plan)).toEqual(['feature: F [scope: none] may reuse #5 (checked on confirm)', '  epic: E [scope: none] (filed closed: shipped)', '    task: T1 [src/a.ts]'])
  })
  test('only a .json file under .delegation/plans/ is accepted', async () => {
    const { planFileOf } = await lib()
    expect(planFileOf('/r', '.delegation/plans/a.json')).toBe('/r/.delegation/plans/a.json')
    expect(planFileOf('/r', '/r/.delegation/plans/sub/a.json')).toBe('/r/.delegation/plans/sub/a.json')
    for (const bad of ['plans/a.json', '.delegation/plans/../a.json', '/etc/a.json', '.delegation/plans/a.txt', '.delegation/landed/a.json', '/r/.delegation/plans-x/a.json', '']) expect(planFileOf('/r', bad)).toBe(undefined)
  })
  test('the batch option is 1 to 100, default 20', async () => {
    const { treeBatch } = await lib()
    expect([undefined, 0, 101, 'x', 2.5, -1].map(treeBatch)).toEqual([20, 20, 20, 20, 20, 20])
    expect([1, 7, 100].map(treeBatch)).toEqual([1, 7, 100])
  })
  test('the issue number is written into the raw file at the item', async () => {
    const { setIssueAt } = await lib()
    const raw = { version: 1, items: [{ type: 'epic', title: 'A', children: [{ type: 'task', title: 'T', paths: ['a'] }] }] }
    setIssueAt(raw, [0, 0], 12)
    expect(raw.items[0].children[0].issue).toBe(12)
  })
  test('the arguments: file, --dry-run, --confirm', async () => {
    const { parseTreeImportArgs } = await lib()
    expect(parseTreeImportArgs('.delegation/plans/a.json --dry-run')).toEqual({ file: '.delegation/plans/a.json', confirm: false, dryRun: true })
    expect(parseTreeImportArgs('.delegation/plans/a.json --confirm')).toEqual({ file: '.delegation/plans/a.json', confirm: true, dryRun: false })
    expect('error' in parseTreeImportArgs('')).toBe(true)
  })
})
