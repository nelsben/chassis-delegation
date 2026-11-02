// MOD-277: a card's class from its card file, so ledger rows written before the class was recorded are not thrown away. Pure.
import { test, expect, describe } from './kit.mjs'

const K = () => import('../../hooks/lib/classof.ts')
const C = () => import('../../hooks/lib/choice.ts')

const card = (fm, body = '## Done when\n\n- one thing\n') => `---\n${fm}\n---\n${body}`

describe('MOD-277: classOfCardText', () => {
  test('kind: wins; else inferred from the title and scope; size small when the economy hint fires', async () => {
    const { classOfCardText } = await K()
    expect(classOfCardText(card('id: A-1\ntitle: Add a thing\ndomain: mod\ntier: standard\nkind: bug\nscope: [hooks/lib/x.ts]\nred_test: a test'))).toBe('bug/small')
    expect(classOfCardText(card('id: A-2\ntitle: Fix the thing\ndomain: mod\ntier: standard\nscope: [hooks/**]\nred_test: a test'))).toBe('bug/large')
    expect(classOfCardText(card('id: A-3\ntitle: Docs\ndomain: mod\ntier: standard\nscope: [docs/**, CHANGELOG.md]\nred_test: none'))).toBe('docs/large')
    expect(classOfCardText(card('id: A-4\ntitle: Add tests\ndomain: mod\ntier: frontier\nscope: [tests/**]\nred_test: a test'))).toBe('test/large')
    expect(classOfCardText(card('id: A-5\ntitle: Add a thing\ndomain: mod\nscope: [hooks/lib/a.ts, hooks/lib/b.ts]\nred_test: a test'))).toBe('feature/small')
  })
  test('text that is not a card has no class', async () => {
    const { classOfCardText } = await K()
    expect(classOfCardText('no frontmatter here')).toBeUndefined()
    expect(classOfCardText('')).toBeUndefined()
  })
})

describe('MOD-277: classOfFiles feeds cardOutcomes', () => {
  test('a classless row takes its card file\'s class; a row\'s own class wins; a missing card file leaves it unclassed', async () => {
    const { classOfFiles } = await K()
    const { cardOutcomes } = await C()
    const classOf = classOfFiles({
      'MOD-1-add-a-thing.md': card('id: MOD-1\ntitle: Add a thing\ndomain: mod\nkind: bug\nscope: [hooks/lib/x.ts]\nred_test: a test'),
      'MOD-10-other.md': card('id: MOD-10\ntitle: Other\ndomain: mod\nscope: [hooks/**]\nred_test: a test'),
    })
    const sp = (task, over = {}) => ({ kind: 'spawn', task, attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', ...over })
    const rows = [sp('MOD-1'), sp('MOD-10'), sp('MOD-2'), sp('MOD-3', { class: 'test/large' })]
    expect(classOf('MOD-1')).toBe('bug/small')
    expect(classOf('MOD-10')).toBe('feature/large') // MOD-1 never matches MOD-10's file
    expect(classOf('MOD-2')).toBeUndefined()
    expect(cardOutcomes(rows, 'bug/small', classOf).map(c => c.task)).toEqual(['MOD-1'])
    expect(cardOutcomes(rows, 'feature/large', classOf).map(c => c.task)).toEqual(['MOD-10'])
    expect(cardOutcomes(rows, 'test/large', classOf).map(c => c.task)).toEqual(['MOD-3'])
    expect(cardOutcomes(rows, undefined, classOf).find(c => c.task === 'MOD-2').cls).toBeUndefined()
  })
})
