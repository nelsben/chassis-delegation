// MOD-416: the reviewer is given the worker's own hand-back when the verifier passed only the report line. Pure.
// The helpers are read off the module namespace so a missing export fails its own test, not the whole file.
import { readFileSync } from 'node:fs'
import { test, expect, describe } from './kit.mjs'
import * as R from '../../hooks/lib/review.ts'

const read = p => readFileSync(new URL(`../../${p}`, import.meta.url), 'utf8')

const PARA = 'The worker added the scope check to the review block and ran the pure suite, which stayed green.'
const REPORT_S = '[[report v=1 task=T-4 branch=agent/mod/T-4 sha=abcdef1234567890 gate=pass]]'
const LONE = '[[report v=1 task=T-4 sha=abcdef1234567890 gate=pass]]'

describe('MOD-416: handbackHasWords', () => {
  test('a lone report line is false', () => {
    expect(R.handbackHasWords(LONE)).toBe(false)
  })
  test('a report line plus a 10-character word is false', () => {
    expect(R.handbackHasWords(`${LONE}\nabcdefghij`)).toBe(false)
  })
  test('a paragraph and a report line is true', () => {
    expect(R.handbackHasWords(`${PARA}\n\n${LONE}`)).toBe(true)
  })
  test('two report blocks and nothing else is false', () => {
    expect(R.handbackHasWords(`${LONE}\n${REPORT_S}`)).toBe(false)
  })
})

describe('MOD-416: reviewHandback', () => {
  test('a given text with words of its own is returned as given, whatever the transcript holds', () => {
    const given = `${PARA}\n\n${LONE}`
    expect(R.reviewHandback(given, [`${PARA} again, longer than forty characters.\n${REPORT_S}`], 'abcdef1234567890')).toEqual({ text: given, source: 'given' })
  })
  test('a lone report with a transcript entry naming the same sha gives transcript and that entry', () => {
    const entry = `${PARA}\n\n${REPORT_S}`
    expect(R.reviewHandback(LONE, [entry], 'abcdef1234567890')).toEqual({ text: entry, source: 'transcript' })
  })
  test('the 7-character prefix of the entry sha matches, and the entry sha as the prefix of the review sha matches', () => {
    const entry = `${PARA}\n\n${REPORT_S}`
    expect(R.reviewHandback(LONE, [entry], 'abcdef1')).toEqual({ text: entry, source: 'transcript' })
    const short = `${PARA}\n\n[[report v=1 task=T-4 sha=abcdef1 gate=pass]]`
    expect(R.reviewHandback(LONE, [short], 'abcdef1234567890')).toEqual({ text: short, source: 'transcript' })
  })
  test('sha matching ignores case', () => {
    const entry = `${PARA}\n\n[[report v=1 task=T-4 sha=ABCDEF1234567890 gate=pass]]`
    expect(R.reviewHandback(LONE, [entry], 'abcdef1234567890').source).toBe('transcript')
  })
  test('with two matching entries the later one wins', () => {
    const older = `${PARA}\n\n${REPORT_S}`
    const newer = `Second run hand-back, with its own words, long enough to count.\n\n${REPORT_S}`
    expect(R.reviewHandback(LONE, [older, newer], 'abcdef1234567890')).toEqual({ text: newer, source: 'transcript' })
  })
  test('an entry for another sha, an entry with no report block and a lone report line are passed over', () => {
    const otherSha = `${PARA}\n\n[[report v=1 task=T-4 sha=1111111222222 gate=pass]]`
    const noReport = `${PARA} and nothing that says which sha it judged.`
    const lone = LONE
    expect(R.reviewHandback(LONE, [`${PARA} that came first.\n\n${REPORT_S}`, otherSha, noReport, lone], 'abcdef1234567890')).toEqual({ text: `${PARA} that came first.\n\n${REPORT_S}`, source: 'transcript' })
  })
  test('no match gives report-only and the given text', () => {
    const otherSha = `${PARA}\n\n[[report v=1 task=T-4 sha=1111111222222 gate=pass]]`
    expect(R.reviewHandback(LONE, [otherSha], 'abcdef1234567890')).toEqual({ text: LONE, source: 'report-only' })
    expect(R.reviewHandback(LONE, [], 'abcdef1234567890')).toEqual({ text: LONE, source: 'report-only' })
  })
  test('an empty sha or the word HEAD gives report-only even when an entry says sha=HEAD', () => {
    const head = `${PARA}\n\n[[report v=1 task=T-4 sha=HEAD gate=pass]]`
    expect(R.reviewHandback(LONE, [head], '')).toEqual({ text: LONE, source: 'report-only' })
    expect(R.reviewHandback(LONE, [head], 'HEAD')).toEqual({ text: LONE, source: 'report-only' })
    expect(R.reviewHandback(LONE, [head], 'head')).toEqual({ text: LONE, source: 'report-only' })
  })
})

describe('MOD-416: handbackSection', () => {
  test('for given, a text under the cap comes back unchanged and one over it is cut to cap characters ending in an ellipsis', () => {
    expect(R.handbackSection({ text: 'short words here', source: 'given' }, 100)).toBe('short words here')
    const long = 'x'.repeat(50)
    const cut = R.handbackSection({ text: long, source: 'given' }, 20)
    expect(cut).toBe(`${'x'.repeat(19)}…`)
    expect(cut.length).toBe(20)
  })
  test('for transcript, the first line is the exact note, the second empty, the rest the cut text', () => {
    const note = '(The verifier judged this sha with no fresh hand-back. What follows is the worker\'s own hand-back for the same sha, read from its transcript.)'
    const out = R.handbackSection({ text: 'y'.repeat(50), source: 'transcript' }, 20)
    const lines = out.split('\n')
    expect(lines[0]).toBe(note)
    expect(lines[1]).toBe('')
    expect(out.slice(note.length + 2)).toBe(`${'y'.repeat(19)}…`)
  })
  test('for report-only, the first line is the exact note, the second empty, the rest the text', () => {
    const note = '(Only the report line is available: the worker\'s own words for this sha could not be read. Take each Done-when statement of the card as one claim and check it against the diff. Write no row about what the hand-back says or leaves out.)'
    const out = R.handbackSection({ text: LONE, source: 'report-only' }, 6000)
    const lines = out.split('\n')
    expect(lines[0]).toBe(note)
    expect(lines[1]).toBe('')
    expect(out.slice(note.length + 2)).toBe(LONE)
  })
  test('the note is not counted against the cap', () => {
    const text = 'z'.repeat(30)
    const out = R.handbackSection({ text, source: 'transcript' }, 30)
    expect(out.slice(out.indexOf('\n\n') + 2)).toBe(text)
  })
})

describe('MOD-416: the template', () => {
  const T = read('hooks/templates/review.md')
  test('line 3 says an unverifiable row when sha=HEAD and a later write would explain the difference', () => {
    expect(T).toContain('With sha=HEAD a file may have been written after the hand-back')
    expect(T).toContain('the row is unverifiable, not refuted')
  })
  test('label only what you can read: a statement outside the tree, the brief and the prompt is unverifiable', () => {
    expect(T).toContain('Label only what you can read.')
    expect(T).toContain('is unverifiable.')
  })
  test('what the hand-back does not say is not a claim, and a Done-when the diff does not meet is refuted whether or not it is mentioned', () => {
    expect(T).toContain('What the hand-back does not say is not a claim')
    expect(T).toContain('whether or not the hand-back mentions it')
  })
})
