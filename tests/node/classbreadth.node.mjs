// MOD-409: a card's class sizes it by breadth (narrow, mid, wide), and rows stamped with an old size are classed again. Pure.
import { test, expect, describe } from './kit.mjs'

const X = () => import('../../hooks/lib/explore.ts')
const K = () => import('../../hooks/lib/classof.ts')
const C = () => import('../../hooks/lib/choice.ts')

const card = (fm, body = '## Done when\n\n- one thing\n') => `---\n${fm}\n---\n${body}`

describe('MOD-409: cardSize by breadth', () => {
  test('docs, test and .md paths do not count', async () => {
    const { cardSize } = await X()
    expect(cardSize(['hooks/lib/a.ts', 'tests/a.test.ts', 'CHANGELOG.md', 'docs/guide.md'])).toBe('narrow')
    expect(cardSize(['tests/**', 'docs/**'])).toBe('narrow')
    expect(cardSize([])).toBe('narrow')
  })
  test('three or four source files is mid; five is wide; a glob is wide', async () => {
    const { cardSize } = await X()
    expect(cardSize(['a.ts', 'b.ts', 'c.ts'])).toBe('mid')
    expect(cardSize(['a.ts', 'b.ts', 'c.ts', 'd.ts'])).toBe('mid')
    expect(cardSize(['a.ts', 'b.ts', 'c.ts', 'd.ts', 'e.ts'])).toBe('wide')
    expect(cardSize(['hooks/lib/*.ts'])).toBe('wide')
  })
})

describe('MOD-409: classOfCardText and liveClass', () => {
  test('four source paths give feature/mid', async () => {
    const { classOfCardText } = await K()
    expect(classOfCardText(card('id: A-1\ntitle: Add a thing\ndomain: mod\nscope: [a.ts, b.ts, c.ts, d.ts]\nred_test: a test'))).toBe('feature/mid')
  })
  test('old sizes are not live', async () => {
    const { liveClass } = await X()
    expect(liveClass('feature/large')).toBeUndefined()
    expect(liveClass('bug/small')).toBeUndefined()
    expect(liveClass('feature/mid')).toBe('feature/mid')
    expect(liveClass('')).toBeUndefined()
    expect(liveClass(undefined)).toBeUndefined()
    expect(liveClass(3)).toBeUndefined()
  })
  test('cardOutcomes classes an old-stamped row from its card file', async () => {
    const { cardOutcomes } = await C()
    const rows = [{ kind: 'spawn', task: 'A-1', attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 1, class: 'feature/large' }]
    const classOf = () => 'feature/narrow'
    expect(cardOutcomes(rows, 'feature/narrow', classOf).map(c => c.task)).toEqual(['A-1'])
    expect(cardOutcomes(rows, 'feature/large', classOf).map(c => c.task)).toEqual([])
  })
})
