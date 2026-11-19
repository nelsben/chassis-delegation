// MOD-392 (#547): the Work pane's controls on a remote surface are Markdown links; linkHref and mdLink build them. MOD-402 (#564): mdEscape and firstCol.
import { test, expect, describe } from './kit.mjs'

describe('MOD-392: linkHref', () => {
  test('a key becomes a work.invalid link with the key encoded', async () => {
    const { linkHref } = await import('../../hooks/lib/work.ts')
    expect(linkHref('work-open-i13')).toBe('https://work.invalid/work-open-i13')
  })
})

describe('MOD-392: mdLink', () => {
  test('a plain label becomes a Markdown link to the href', async () => {
    const { mdLink } = await import('../../hooks/lib/work.ts')
    expect(mdLink('Clear filters', 'https://work.invalid/work-clear')).toBe('[Clear filters](https://work.invalid/work-clear)')
  })

  test('each Markdown metacharacter in the label gets a backslash', async () => {
    const { mdLink } = await import('../../hooks/lib/work.ts')
    expect(mdLink('a[b]*c_d`e', 'https://work.invalid/x')).toBe('[a\\[b\\]\\*c\\_d\\`e](https://work.invalid/x)')
    expect(mdLink('\\<>~|#', 'https://work.invalid/x')).toBe('[\\\\\\<\\>\\~\\|\\#](https://work.invalid/x)')
  })

  test('a newline in the label becomes a space', async () => {
    const { mdLink } = await import('../../hooks/lib/work.ts')
    expect(mdLink('line one\nline two', 'https://work.invalid/x')).toBe('[line one line two](https://work.invalid/x)')
  })
})

// MOD-402 (#564): mdEscape is the escaping mdLink uses, and firstCol picks the column a stacked board opens on.
describe('MOD-402: mdEscape', () => {
  test('mdLink escapes its label through mdEscape', async () => {
    const { mdEscape, mdLink } = await import('../../hooks/lib/work.ts')
    for (const label of ['a[b]*c_d`e', '\\<>~|#', 'line one\nline two', 'Show done ☐']) expect(mdLink(label, 'https://work.invalid/x')).toBe(`[${mdEscape(label)}](https://work.invalid/x)`)
  })

  test('a metacharacter gets a backslash and a newline becomes a space', async () => {
    const { mdEscape } = await import('../../hooks/lib/work.ts')
    expect(mdEscape('#13 a*b')).toBe('\\#13 a\\*b')
    expect(mdEscape('one\ntwo')).toBe('one two')
  })
})

describe('MOD-402: firstCol', () => {
  const counts = (c) => ({ backlog: 0, queued: 0, working: 0, review: 0, done: 0, ...c })

  test('working when it has cards', async () => {
    const { firstCol } = await import('../../hooks/lib/work.ts')
    expect(firstCol(counts({ working: 1, review: 3, queued: 2, backlog: 4, done: 5 }))).toBe('working')
  })

  test('review when only review and done have cards', async () => {
    const { firstCol } = await import('../../hooks/lib/work.ts')
    expect(firstCol(counts({ review: 1, done: 5 }))).toBe('review')
  })

  test('queued before backlog, and backlog when only backlog and done have cards', async () => {
    const { firstCol } = await import('../../hooks/lib/work.ts')
    expect(firstCol(counts({ queued: 1, backlog: 4 }))).toBe('queued')
    expect(firstCol(counts({ backlog: 2, done: 1 }))).toBe('backlog')
  })

  test('done when everything else is 0', async () => {
    const { firstCol } = await import('../../hooks/lib/work.ts')
    expect(firstCol(counts({}))).toBe('done')
    expect(firstCol(counts({ done: 3 }))).toBe('done')
  })
})
