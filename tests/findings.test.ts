import { test, expect, describe } from 'claude-code/testing'
import { coveredBy, parsePostArg, renderPost, survivingWord, type PostFinding } from '../hooks/lib/findings'

const F: PostFinding = {
  kind: 'went_wrong',
  surface: '/delegation accept',
  fault_class: 'bug',
  severity: 'P2',
  title: 'Accepted row stayed owed after accept',
  body: 'The row came back on the next compaction.',
  evidence: ['attempt 2 refuted', 'row still listed'],
}

describe('MOD-7: rendering a finding', () => {
  test('the first body line is Surface / Fault class / Severity; the footer names the version', () => {
    const { title, body } = renderPost(F, '0.6.0')
    expect(title).toBe('Accepted row stayed owed after accept')
    expect(body.split('\n')[0]).toBe('**Surface:** /delegation accept · **Fault class:** bug · **Severity:** P2')
    expect(body).toContain('The row came back on the next compaction.')
    expect(body).toContain('- attempt 2 refuted')
    expect(body).toContain('- row still listed')
    expect(body.trimEnd().split('\n').pop()).toBe('posted by chassis-delegation 0.6.0 via /delegation debrief')
  })
  test('went_well gets the [went well] prefix; went_wrong does not', () => {
    expect(renderPost({ ...F, kind: 'went_well' }, '0.6.0').title).toBe('[went well] Accepted row stayed owed after accept')
    expect(renderPost(F, '0.6.0').title.startsWith('[')).toBe(false)
  })
  test('no evidence leaves no Evidence heading', () => {
    expect(renderPost({ ...F, evidence: [] }, '0.6.0').body).not.toContain('Evidence')
  })
})

describe('MOD-7: dedupe', () => {
  const issues = [
    { number: 7, title: 'Unrelated thing about dashboards', body: '**Surface:** /delegation dashboard · **Fault class:** bug · **Severity:** P3' },
    { number: 9, title: 'Row stayed owed after accept ran', body: '**Surface:** /delegation accept · **Fault class:** bug · **Severity:** P2' },
  ]
  test('covered: same surface and three title words', () => {
    expect(coveredBy(F, issues)).toBe(9)
  })
  test('new: same surface but fewer than three shared title words', () => {
    expect(coveredBy({ ...F, title: 'Accept prints nothing' }, issues)).toBeUndefined()
  })
  test('new: three shared title words but another surface', () => {
    expect(coveredBy({ ...F, surface: '/delegation update' }, issues)).toBeUndefined()
  })
  test('new: no issues', () => {
    expect(coveredBy(F, [])).toBeUndefined()
  })
})

describe('MOD-7: the post argument and the second scrub', () => {
  test('all, a list, and what is refused', () => {
    expect(parsePostArg('all', 3)).toEqual({ all: true, nums: [1, 2, 3] })
    expect(parsePostArg('1,3', 3)).toEqual({ all: false, nums: [1, 3] })
    expect(parsePostArg('1, 3', 3)).toEqual({ all: false, nums: [1, 3] })
    expect('error' in parsePostArg('4', 3)).toBe(true)
    expect('error' in parsePostArg('x', 3)).toBe(true)
  })
  test('survivingWord finds a listed word in any case, and none otherwise', () => {
    expect(survivingWord('see Globex-app', ['globex'])).toBe('globex')
    expect(survivingWord('clean text', ['globex'])).toBeUndefined()
  })
})
