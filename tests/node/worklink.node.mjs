// MOD-392 (#547): the Work pane's controls on a remote surface are Markdown links; linkHref and mdLink build them.
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
