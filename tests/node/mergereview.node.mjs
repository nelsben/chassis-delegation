// MOD-231: merge reads a review row with next=accept as the consistent row it reviewed, now next=accept. Pure.
import { test, expect, describe } from './kit.mjs'
import { latestVerdictRow, reviewAcceptedAttempt, verdictRefusal } from '../../hooks/lib/mergecmd.ts'

const jsonl = rows => rows.map(r => JSON.stringify(r)).join('\n') + '\n'
const VERIFIED = { task: 'T-9', subtask: 'main', attempt: 1, sha: 'abc1234', verdict: 'consistent', next: 'review' }
const REVIEWED = next => ({ task: 'T-9', subtask: 'main', attempt: 1, kind: 'review', verdict: 'reviewed', next })
const refusal = rows => verdictRefusal('T-9', latestVerdictRow(jsonl(rows), 'T-9'))

describe('MOD-231: merge after a review', () => {
  test('(a) consistent next=review then reviewed next=accept merges, with the consistent row\'s attempt and sha', () => {
    const row = latestVerdictRow(jsonl([VERIFIED, REVIEWED('accept')]), 'T-9')
    expect(row).toMatchObject({ verdict: 'consistent', next: 'accept', attempt: 1, sha: 'abc1234' })
    expect(refusal([VERIFIED, REVIEWED('accept')])).toBeUndefined()
  })
  test('(b) reviewed next=check by hand still refuses', () => {
    expect(refusal([VERIFIED, REVIEWED('check by hand')])).toContain('merge needs consistent/accept')
    expect(refusal([VERIFIED, REVIEWED('resume agent=a')])).toContain('merge needs consistent/accept')
  })
  test('(c) consistent next=accept alone merges', () => {
    expect(refusal([{ ...VERIFIED, next: 'accept' }])).toBeUndefined()
  })
  test('(d) consistent next=review alone refuses', () => {
    expect(refusal([VERIFIED])).toContain('consistent · next=review')
  })
  test('reviewAcceptedAttempt: the attempt a newest accepting review row stands for; none after a later row or another next', () => {
    expect(reviewAcceptedAttempt(jsonl([VERIFIED, REVIEWED('accept')]), 'T-9')).toBe(1)
    expect(reviewAcceptedAttempt(jsonl([VERIFIED, REVIEWED('check by hand')]), 'T-9')).toBeUndefined()
    expect(reviewAcceptedAttempt(jsonl([VERIFIED]), 'T-9')).toBeUndefined()
    expect(reviewAcceptedAttempt(jsonl([VERIFIED, REVIEWED('accept'), { ...VERIFIED, attempt: 2 }]), 'T-9')).toBeUndefined()
  })
})
