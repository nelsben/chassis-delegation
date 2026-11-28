// MOD-424: after a refuted review, the review of a by-hand verify is a re-check: it reads the rows refuted before and the
// change since, not the whole card again. Pure: the helpers are read off the module namespace so a missing export fails its own test.
import { test, expect, describe } from './kit.mjs'
import * as R from '../../hooks/lib/review.ts'

const OLD = 'aaaaaaa1111111222222'
const NEW = 'bbbbbbb3333333444444'
const REFUTED = ['refuted: the docs table still lists the old flag — docs/review-and-merge.md:14 has it', 'refuted: the changelog bullet is missing — CHANGELOG.md has no Unreleased section']
const rec = (over = {}) => ({ ...over })

describe('MOD-424: recheckOf', () => {
  test('an empty list gives undefined', () => {
    expect(R.recheckOf([], NEW)).toBeUndefined()
  })
  test('a last record with lines and a different sha gives the sha and a copy of the lines', () => {
    const lines = [...REFUTED]
    const out = R.recheckOf([rec({ refutedLines: lines, reviewedSha: OLD })], NEW)
    expect(out).toEqual({ sha: OLD, lines: REFUTED })
    expect(out.lines).not.toBe(lines)
  })
  test('a last record with no lines, after an earlier one with lines, gives undefined', () => {
    const earlier = rec({ refutedLines: REFUTED, reviewedSha: OLD })
    const last = rec({ reviewedSha: OLD })
    expect(R.recheckOf([earlier, last], NEW)).toBeUndefined()
  })
  test('the same sha in short and long form gives undefined', () => {
    expect(R.recheckOf([rec({ refutedLines: REFUTED, reviewedSha: OLD })], OLD.slice(0, 7))).toBeUndefined()
    expect(R.recheckOf([rec({ refutedLines: REFUTED, reviewedSha: OLD.slice(0, 7) })], OLD)).toBeUndefined()
  })
  test('an empty sha now under review, and the word HEAD in any case, give undefined', () => {
    const last = [rec({ refutedLines: REFUTED, reviewedSha: OLD })]
    expect(R.recheckOf(last, '')).toBeUndefined()
    expect(R.recheckOf(last, 'HEAD')).toBeUndefined()
    expect(R.recheckOf(last, 'head')).toBeUndefined()
  })
  test('a record with lines and no reviewedSha gives undefined', () => {
    expect(R.recheckOf([rec({ refutedLines: REFUTED })], NEW)).toBeUndefined()
  })
})

describe('MOD-424: recheckNote', () => {
  const note = () => R.recheckNote({ sha: OLD, lines: REFUTED }, '/wt/MOD-424', NEW)
  test('holds both shas and the worktree', () => {
    expect(note()).toContain(OLD)
    expect(note()).toContain(NEW)
    expect(note()).toContain('/wt/MOD-424')
    expect(note()).toContain(`git -C /wt/MOD-424 diff ${OLD} ${NEW}`)
  })
  test('holds the heading "Refuted before:" and each line', () => {
    expect(note()).toContain('Refuted before:')
    for (const line of REFUTED) expect(note()).toContain(line)
  })
  test('the refuted lines come after the heading, one per line', () => {
    const tail = note().slice(note().indexOf('Refuted before:'))
    expect(tail).toContain(`Refuted before:\n${REFUTED[0]}\n${REFUTED[1]}`)
  })
})

describe('MOD-424: handbackSection with a re-check note', () => {
  const LONE = '[[report v=1 task=T-4 sha=abcdef1234567890 gate=pass]]'
  const NOTE = 'a note of the re-check'
  test('report-only with a note starts with the note, an empty line, then the text', () => {
    expect(R.handbackSection({ text: LONE, source: 'report-only' }, 6000, NOTE)).toBe(`${NOTE}\n\n${LONE}`)
  })
  test('given with a note is unchanged', () => {
    const given = 'a hand-back with words of its own, long enough to count as such.'
    expect(R.handbackSection({ text: given, source: 'given' }, 6000, NOTE)).toBe(given)
  })
  test('transcript with a note is unchanged', () => {
    const out = R.handbackSection({ text: 'y'.repeat(50), source: 'transcript' }, 20, NOTE)
    expect(out.startsWith('(The verifier judged this sha with no fresh hand-back.')).toBe(true)
    expect(out).toBe(R.handbackSection({ text: 'y'.repeat(50), source: 'transcript' }, 20))
  })
  test('report-only without a note is unchanged', () => {
    const out = R.handbackSection({ text: LONE, source: 'report-only' }, 6000)
    expect(out.startsWith('(Only the report line is available: the worker')).toBe(true)
  })
})

describe('MOD-424: the marker carries recheck', () => {
  const marker = { task: 'T-4', subtask: 'main', attempt: 1, sha: 'abcdef1', handback: 'report-only', recheck: 2 }
  test('reviewMarker writes recheck=2 last, after handback', () => {
    expect(R.reviewMarker(marker)).toBe('[[review-of v=1 task=T-4 subtask=main attempt=1 sha=abcdef1 handback=report-only recheck=2]]')
  })
  test('parseReviewMarker round-trips recheck=2', () => {
    expect(R.parseReviewMarker(R.reviewMarker(marker))).toMatchObject({ recheck: 2, handback: 'report-only', sha: 'abcdef1' })
  })
  test('recheck=0 and recheck=x are ignored', () => {
    const base = '[[review-of v=1 task=T-4 subtask=main attempt=1 handback=report-only'
    expect(R.parseReviewMarker(`${base} recheck=0]]`)?.recheck).toBeUndefined()
    expect(R.parseReviewMarker(`${base} recheck=x]]`)?.recheck).toBeUndefined()
  })
})

describe('MOD-424: reviewClause with recheck', () => {
  test('recheck true starts with re-check, with and without refuted rows', () => {
    expect(R.reviewClause({ confirmed: 1, refuted: 0, unverifiable: 0 }, true)).toBe('re-check: 1 confirmed, 0 unverifiable')
    expect(R.reviewClause({ confirmed: 1, refuted: 2, unverifiable: 0 }, true)).toBe('re-check: 1 confirmed, 2 refuted, 0 unverifiable')
  })
  test('without recheck it still starts with review', () => {
    expect(R.reviewClause({ confirmed: 1, refuted: 0, unverifiable: 0 })).toBe('review: 1 confirmed, 0 unverifiable')
    expect(R.reviewClause(undefined, true)).toBe('re-check: no review block')
  })
})
