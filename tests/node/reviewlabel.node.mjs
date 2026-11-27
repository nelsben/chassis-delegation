// MOD-415: a fourth reviewer label, misreported: the work is right, a statement about it is wrong. Pure.
import { readFileSync } from 'node:fs'
import { test, expect, describe } from './kit.mjs'
import { parseReviewBlock, reviewRows, refutedRows, misreportedRows, reviewAdvice, reviewClause, reviewVerdictLine, reviewResumeText, reviewPlan } from '../../hooks/lib/review.ts'

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')
const BASE = { task: 'T-4', confirmed: 3, refuted: 0, unverifiable: 1 }

describe('MOD-415: the block', () => {
  test('misreported=2 gives misreported 2; 0 is kept', () => {
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=0 unverifiable=1 misreported=2]]')).toEqual({ ...BASE, misreported: 2 })
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=0 unverifiable=1 misreported=0]]')?.misreported).toBe(0)
  })
  test('the three old keys alone parse and carry no misreported key', () => {
    const c = parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=0 unverifiable=1]]')
    expect(c).toEqual(BASE)
    expect('misreported' in c).toBe(false)
  })
  test('misreported=two parses and carries no misreported key', () => {
    const c = parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=0 unverifiable=1 misreported=two]]')
    expect(c).toEqual(BASE)
    expect('misreported' in c).toBe(false)
  })
})

describe('MOD-415: the rows', () => {
  const TEXT = ['confirmed: a — a:1', 'refuted: b — b:2', 'misreported: the count is 4 — grep -c shows 5', 'unverifiable: d — no network'].join('\n')
  test('four labels in order; misreportedRows gives the one line; refutedRows only the refuted', () => {
    expect(reviewRows(TEXT).map(r => r.label)).toEqual(['confirmed', 'refuted', 'misreported', 'unverifiable'])
    expect(misreportedRows(TEXT)).toEqual(['misreported: the count is 4 — grep -c shows 5'])
    expect(misreportedRows(TEXT)[0].startsWith('misreported: ')).toBe(true)
    expect(refutedRows(TEXT)).toEqual(['refuted: b — b:2'])
  })
  test('a bulleted and a bold misreported row are read', () => {
    expect(misreportedRows('- misreported: x — y\n2. **Misreported** - z — w\n* **misreported:** q — r')).toEqual(['misreported: x — y', 'misreported: z — w', 'misreported: q — r'])
  })
})

describe('MOD-415: the advice', () => {
  const base = { counts: { ...BASE, misreported: 3 }, refuted: [], agentId: 'agent-4', attempts: 1, budget: 3, label: 'T-4' }
  test('refuted 0 with misreported 3 is accept; refuted 1 with misreported 3 resumes', () => {
    expect(reviewAdvice(base)).toEqual({ kind: 'accept', next: 'accept' })
    expect(reviewAdvice({ ...base, counts: { ...BASE, refuted: 1, misreported: 3 }, refuted: ['refuted: x — y'] }).kind).toBe('resume')
  })
})

describe('MOD-415: the clause and the verdict line', () => {
  test('misreported above 0 is appended in both forms', () => {
    expect(reviewClause({ ...BASE, confirmed: 3, unverifiable: 1, misreported: 2 })).toBe('review: 3 confirmed, 1 unverifiable, 2 misreported')
    expect(reviewClause({ ...BASE, refuted: 1, unverifiable: 0, misreported: 2 })).toBe('review: 3 confirmed, 1 refuted, 0 unverifiable, 2 misreported')
  })
  test('absent and 0 give today\'s text', () => {
    expect(reviewClause(BASE)).toBe('review: 3 confirmed, 1 unverifiable')
    expect(reviewClause({ ...BASE, misreported: 0 })).toBe('review: 3 confirmed, 1 unverifiable')
    expect(reviewClause({ ...BASE, refuted: 1, misreported: 0 })).toBe('review: 3 confirmed, 1 refuted, 1 unverifiable')
  })
  test('reviewVerdictLine adds misreported=N after unverifiable=N only when above 0', () => {
    const v = counts => reviewVerdictLine({ task: 'T-4', attempt: 1, budget: 3, counts, next: 'accept' })
    expect(v(BASE)).toBe('chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 next=accept')
    expect(v({ ...BASE, misreported: 0 })).toBe(v(BASE))
    expect(v({ ...BASE, misreported: 2 })).toBe('chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 misreported=2 next=accept')
  })
})

describe('MOD-415: the resume text', () => {
  const rows = ['refuted: the gate passes — exit 1']
  const mis = ['misreported: 4 files — it is 5']
  const line = 'These statements in your hand-back were wrong though the work there is right; change nothing in the work for them and state them correctly in your next hand-back:'
  test('with misreported rows: the line and the rows after the refuted rows, before the closing line', () => {
    const t = reviewResumeText({ label: 'T-4', attempt: 1, budget: 3, refuted: rows, said: 's', misreported: mis })
    const lines = t.split('\n')
    expect(lines.indexOf(rows[0])).toBeLessThan(lines.indexOf(line))
    expect(lines.indexOf(line) + 1).toBe(lines.indexOf(mis[0]))
    expect(lines.indexOf(mis[0])).toBeLessThan(lines.findIndex(l => l.startsWith('Fix what is wrong')))
  })
  test('with none it equals today\'s text', () => {
    const today = reviewResumeText({ label: 'T-4', attempt: 1, budget: 3, refuted: rows, said: 's' })
    expect(reviewResumeText({ label: 'T-4', attempt: 1, budget: 3, refuted: rows, said: 's', misreported: [] })).toBe(today)
    expect(today.includes('These statements')).toBe(false)
  })
})

describe('MOD-415: the template', () => {
  const t = read('hooks/templates/review.md')
  test('it holds the misreported label, row and End line; its own End line is no block', () => {
    expect(t.includes('misreported: the work at the sha is right')).toBe(true)
    expect(t.split('\n').some(l => l.startsWith('misreported: <the statement>'))).toBe(true)
    expect(t.trimEnd().split('\n').at(-1)).toBe('[[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N misreported=N]]')
    expect(parseReviewBlock(t.trimEnd().split('\n').at(-1))).toBeUndefined()
  })
  test('reviewKeys ends the appended line with misreported=N', () => {
    const p = reviewPlan({ template: 'x', workerTier: 'standard', tierMap: { cheap: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' }, label: 'T-4', marker: { task: 'T-4', subtask: 'main', attempt: 1, sha: 'abc1234' }, vars: { id: 'T-4' } })
    expect(p.call.prompt.trimEnd().endsWith('confirmed=N refuted=N unverifiable=N misreported=N]]')).toBe(true)
  })
})
