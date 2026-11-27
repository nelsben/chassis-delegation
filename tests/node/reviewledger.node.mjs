// MOD-417: a review's ledger row carries the worker's tier, the hand-back's source and the refuted and misreported rows. Pure parts.
import { test, expect, describe } from './kit.mjs'
import { reviewMarker, parseReviewMarker, ledgerLines } from '../../hooks/lib/review.ts'

const BASE = { task: 'T-4', subtask: 'main', attempt: 2, worker: 'agent-4', sha: '1234abcd' }

describe('MOD-417: the marker carries where the reviewer\'s hand-back came from', () => {
  test('transcript and report-only end the marker and round-trip', () => {
    for (const handback of ['transcript', 'report-only']) {
      const line = reviewMarker({ ...BASE, handback })
      expect(line.endsWith(` handback=${handback}]]`)).toBe(true)
      expect(parseReviewMarker(line)).toEqual({ ...BASE, handback })
    }
  })
  test('a marker with no handback is the string it was before', () => {
    expect(reviewMarker(BASE)).toBe('[[review-of v=1 task=T-4 subtask=main attempt=2 worker=agent-4 sha=1234abcd]]')
    expect('handback' in parseReviewMarker(reviewMarker(BASE))).toBe(false)
  })
  test('handback after the worker when there is no sha', () => {
    const { sha, ...noSha } = BASE
    expect(reviewMarker({ ...noSha, handback: 'transcript' })).toBe('[[review-of v=1 task=T-4 subtask=main attempt=2 worker=agent-4 handback=transcript]]')
  })
  test('handback=given and handback=other are dropped; the rest parses', () => {
    for (const word of ['given', 'other']) {
      const m = parseReviewMarker(`[[review-of v=1 task=T-4 subtask=main attempt=2 worker=agent-4 sha=1234abcd handback=${word}]]`)
      expect(m).toEqual(BASE)
      expect('handback' in m).toBe(false)
    }
  })
})

describe('MOD-417: ledgerLines', () => {
  test('14 lines give the first 12', () => {
    const lines = Array.from({ length: 14 }, (_, i) => `refuted: row ${i}`)
    expect(ledgerLines(lines)).toEqual(lines.slice(0, 12))
  })
  test('a 400-character line comes back 300 characters long ending in an ellipsis', () => {
    const out = ledgerLines(['x'.repeat(400)])
    expect(out[0].length).toBe(300)
    expect(out[0].endsWith('…')).toBe(true)
  })
  test('an empty list gives an empty list', () => {
    expect(ledgerLines([])).toEqual([])
  })
})
