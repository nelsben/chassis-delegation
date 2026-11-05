// MOD-312: unionResolve keeps both sides of a diff3 conflict block when the base section is empty
// and both sides only added lines; every other block is refused with a named reason.
import { test, expect, describe } from './kit.mjs'
import { unionResolve } from '../../hooks/lib/mergecmd'

const block = (ours, base, theirs) => ['<<<<<<< ours', ...ours, ...(base === undefined ? [] : ['||||||| base', ...base]), '=======', ...theirs, '>>>>>>> theirs']
const file = (...parts) => parts.flat().join('\n') + '\n'

describe('MOD-312: unionResolve', () => {
  test('an empty-base block resolves to ours then theirs', () => {
    const text = file(['# Changelog', ''], block(['- upstream bullet'], [], ['- branch bullet']), ['', 'tail'])
    expect(unionResolve(text)).toEqual({ text: file(['# Changelog', ''], ['- upstream bullet', '- branch bullet'], ['', 'tail']) })
  })
  test('several empty-base blocks all resolve', () => {
    const text = file(block(['a1'], [], ['b1']), ['mid'], block(['a2', 'a3'], [], ['b2']))
    expect(unionResolve(text)).toEqual({ text: file(['a1', 'b1', 'mid', 'a2', 'a3', 'b2']) })
  })
  test('a non-empty base returns the changed-on-both-sides why', () => {
    expect(unionResolve(file(block(['x'], ['old'], ['y'])))).toEqual({ why: 'a line changed on both sides' })
  })
  test('a merge-style block (no base section) returns the no-base why', () => {
    expect(unionResolve(file(block(['x'], undefined, ['y'])))).toEqual({ why: 'no base section (conflictStyle is not diff3)' })
  })
  test('an empty side returns its why', () => {
    expect(unionResolve(file(block([], [], ['y'])))).toEqual({ why: 'one side is empty' })
    expect(unionResolve(file(block(['x'], [], [])))).toEqual({ why: 'one side is empty' })
  })
  test('a duplicate non-blank line returns its why', () => {
    expect(unionResolve(file(block(['- same', '- a'], [], ['- b', '- same'])))).toEqual({ why: 'the same line was added on both sides' })
  })
  test('blank lines on both sides do not count as duplicates', () => {
    expect(unionResolve(file(block(['', '- a'], [], ['', '- b'])))).toEqual({ text: file(['', '- a', '', '- b']) })
  })
  test('one refused block refuses the file', () => {
    const text = file(block(['a'], [], ['b']), ['mid'], block(['x'], ['old'], ['y']))
    expect(unionResolve(text)).toEqual({ why: 'a line changed on both sides' })
  })
  test('text with no conflict block is refused', () => {
    expect('why' in unionResolve('plain\n')).toBe(true)
  })
})
