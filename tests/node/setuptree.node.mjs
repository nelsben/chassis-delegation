// MOD-285: the tree group of /delegation setup, the pure half. Advice only.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/setup.ts')
const R = 'o/r'
const SIX = ['type:feature', 'type:epic', 'type:story', 'type:task', 'type:bug', 'type:spike']
const good = { ownerRepo: R, labels: SIX, projectSet: true, hasParentCards: false, scopeAmends: 'apply', untyped: [] }
const text = async p => { const m = await lib(); return m.treeText(m.treeLines(p)) }

describe('MOD-285: treeLines', () => {
  test('three labels missing print three gh label create lines', async () => {
    const t = await text({ ...good, labels: ['type:feature', 'type:epic', 'type:story', 'bug'] })
    const fixes = t.split('\n').filter(l => l.includes('gh label create'))
    expect(fixes.map(l => l.trim())).toEqual(['gh label create type:task --repo o/r', 'gh label create type:bug --repo o/r', 'gh label create type:spike --repo o/r'])
    expect(t).toContain('type:task, type:bug, type:spike')
  })
  test('project unset names the config command; none in the repo file is fine', async () => {
    expect(await text({ ...good, projectSet: false })).toContain('/delegation config project <owner>/<number>')
    expect(await text({ ...good, projectSet: true })).not.toContain('config project')
  })
  test('parent cards with scopeAmends apply name within-parent; within-parent or no parents is fine', async () => {
    expect(await text({ ...good, hasParentCards: true })).toContain('/delegation config scopeAmends within-parent')
    expect(await text({ ...good, hasParentCards: true, scopeAmends: 'within-parent' })).not.toContain('config scopeAmends')
    expect(await text({ ...good, scopeAmends: 'apply' })).not.toContain('config scopeAmends')
  })
  test('three untyped issues: the count and one edit line each', async () => {
    const t = await text({ ...good, untyped: [4, 9, 12] })
    expect(t).toContain('3 open issues have no type: label')
    expect(t).toContain('gh issue edit 4 --repo o/r --add-label type:task')
    expect(t).toContain('gh issue edit 12 --repo o/r --add-label type:task')
    expect(t).not.toContain('more')
  })
  test('twelve untyped: the first ten, then and 2 more', async () => {
    const t = await text({ ...good, untyped: Array.from({ length: 12 }, (_, i) => i + 1) })
    expect(t.split('\n').filter(l => l.includes('gh issue edit')).length).toBe(10)
    expect(t).toContain('... and 2 more')
  })
  test('all good prints four ok lines and no fix', async () => {
    const t = await text(good)
    expect(t.split('\n').length).toBe(4)
    expect(t).not.toContain('    ')
  })
  test('skipped prints one line', async () => {
    expect(await text({ skipped: 'gh is not on PATH' })).toBe('· tree checks skipped: gh is not on PATH')
  })
})

describe('MOD-285: the gh reads', () => {
  test('label names and untyped issue numbers out of gh json', async () => {
    const m = await lib()
    expect(m.labelNames('[{"name":"type:task"},{"name":"x"}]')).toEqual(['type:task', 'x'])
    expect(m.labelNames('nope')).toBeUndefined()
    expect(m.untypedIssues('[{"number":3,"labels":[{"name":"type:bug"}]},{"number":5,"labels":[]},{"number":7,"labels":[{"name":"x"}]}]')).toEqual([5, 7])
    expect(m.untypedIssues('{}')).toBeUndefined()
  })
  test('the allowlist passes exactly the two reads', async () => {
    const { checkArgv } = await import('../../hooks/lib/allow.ts')
    const allow = { landRepo: R }
    expect(checkArgv(['gh', 'label', 'list', '--repo', R, '--json', 'name', '--limit', '100'], allow).ok).toBe(true)
    expect(checkArgv(['gh', 'issue', 'list', '--repo', R, '--state', 'open', '--limit', '200', '--json', 'number,labels'], allow).ok).toBe(true)
    expect(checkArgv(['gh', 'label', 'create', 'x', '--repo', R], allow).ok).toBe(false)
    expect(checkArgv(['gh', 'label', 'list', '--repo', 'a/b', '--json', 'name', '--limit', '100'], allow).ok).toBe(false)
  })
})
