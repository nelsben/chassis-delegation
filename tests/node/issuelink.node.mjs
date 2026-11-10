// MOD-359: issueLink, a card with no issue gets a note or is refused (pure: the option, the exemptions, the check).
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/issuematch.ts')
const card = (o = {}) => ({ title: 'Export drops a row', scope: ['src/export/**'], hasIssue: false, ...o })

describe('MOD-359: issueLink', () => {
  test('issueLinkOf reads the three values, trimmed and lower-cased, and nothing else', async () => {
    const { issueLinkOf } = await lib()
    expect(issueLinkOf('off')).toBe('off')
    expect(issueLinkOf(' Hint ')).toBe('hint')
    expect(issueLinkOf('REQUIRE')).toBe('require')
    expect(issueLinkOf('suggest')).toBeUndefined()
    expect(issueLinkOf(3)).toBeUndefined()
    expect(issueLinkOf(undefined)).toBeUndefined()
  })

  test('issueLinkExempt: repo none, an all-outside scope and a release title are exempt', async () => {
    const { issueLinkExempt } = await lib()
    expect(issueLinkExempt({ title: 'x', scope: ['src/a.ts'], repo: 'none' })).toBe(true)
    expect(issueLinkExempt({ title: 'x', scope: ['src/a.ts'], repo: ' None ' })).toBe(true)
    expect(issueLinkExempt({ title: 'x', scope: ['/tmp/out/**', '~/notes/a.md'] })).toBe(true)
    expect(issueLinkExempt({ title: 'Release 0.9.58: version bumped', scope: ['a'] })).toBe(true)
    expect(issueLinkExempt({ title: 'release v1.2', scope: ['a'] })).toBe(true)
  })

  test('issueLinkExempt: a mixed scope, an empty scope and look-alike titles are not exempt', async () => {
    const { issueLinkExempt } = await lib()
    expect(issueLinkExempt({ title: 'x', scope: ['/tmp/out/**', 'src/a.ts'] })).toBe(false)
    expect(issueLinkExempt({ title: 'x', scope: [] })).toBe(false)
    expect(issueLinkExempt({ title: 'x', scope: ['', ' '] })).toBe(false)
    expect(issueLinkExempt({ title: 'x', scope: ['src/a.ts'], repo: 'here' })).toBe(false)
    expect(issueLinkExempt({ title: 'Release notes page', scope: ['a'] })).toBe(false)
    expect(issueLinkExempt({ title: 'Prerelease 1.0', scope: ['a'] })).toBe(false)
  })

  test('issueLinkCheck: off, an issue and an exempt card say nothing', async () => {
    const { issueLinkCheck } = await lib()
    expect(issueLinkCheck('off', card())).toEqual({})
    expect(issueLinkCheck('require', card({ hasIssue: true }))).toEqual({})
    expect(issueLinkCheck('hint', card({ hasIssue: true }))).toEqual({})
    expect(issueLinkCheck('require', card({ title: 'Release 1.2.3: bump' }))).toEqual({})
    expect(issueLinkCheck('require', card({ repo: 'none' }))).toEqual({})
  })

  test('issueLinkCheck: require refuses, a lanes call with its own line; hint still gives a lanes call the note', async () => {
    const { issueLinkCheck, ISSUE_LINK_REFUSAL, ISSUE_LINK_LANES_REFUSAL, ISSUE_LINK_HINT } = await lib()
    expect(issueLinkCheck('require', card())).toEqual({ refuse: ISSUE_LINK_REFUSAL })
    expect(issueLinkCheck('require', card({ lanes: false }))).toEqual({ refuse: ISSUE_LINK_REFUSAL })
    expect(issueLinkCheck('require', card({ lanes: true }))).toEqual({ refuse: ISSUE_LINK_LANES_REFUSAL })
    expect(issueLinkCheck('hint', card({ lanes: true }))).toEqual({ hint: ISSUE_LINK_HINT })
    expect(issueLinkCheck('require', card({ lanes: true, repo: 'none' }))).toEqual({})
  })

  test('issueLinkCheck: a planned-task match already named the issue; otherwise hint gives the note', async () => {
    const { issueLinkCheck, ISSUE_LINK_HINT } = await lib()
    expect(issueLinkCheck('hint', card({ matched: true }))).toEqual({})
    expect(issueLinkCheck('hint', card({ lanes: true, matched: true }))).toEqual({})
    expect(issueLinkCheck('hint', card())).toEqual({ hint: ISSUE_LINK_HINT })
    expect(ISSUE_LINK_HINT).toContain('names no issue')
  })
})
