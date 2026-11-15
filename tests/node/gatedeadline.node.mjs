// MOD-377 (#513): the gate deadline env var, the output tail of a gate stopped at the ceiling. Pure.
import { test, expect, describe } from './kit.mjs'
import { gateDeadlineEnv, GATE_DEADLINE_ENV, outputTail, pastCeilingWith, pastCeiling } from '../../hooks/lib/gaterun.ts'
import { gateTimedOut } from '../../hooks/lib/verify.ts'

describe('MOD-377 (#513): the deadline a gate is told', () => {
  test('the env name and the whole seconds until the ceiling', () => {
    expect(GATE_DEADLINE_ENV).toBe('CHASSIS_GATE_DEADLINE')
    expect(gateDeadlineEnv(30)).toEqual({ CHASSIS_GATE_DEADLINE: '1800' })
  })
})

describe('MOD-377 (#513): the tail of a gate\'s output', () => {
  test('blank lines dropped, stdout before stderr, the last n kept', () => {
    expect(outputTail('a\n\n  \nb\n', 'c\n\nd\n', 3)).toEqual(['b', 'c', 'd'])
    expect(outputTail('a\nb\n', 'c\n', 10)).toEqual(['a', 'b', 'c'])
    expect(outputTail('', '', 3)).toEqual([])
  })
  test('each line trimmed at the end', () => {
    expect(outputTail('x   \n', '', 1)).toEqual(['x'])
  })
})

describe('MOD-377 (#513): the ceiling words with a tail', () => {
  test('no tail: the same words as pastCeiling', () => {
    expect(pastCeilingWith(2, [])).toBe(pastCeiling(2))
  })
  test('a tail adds its last 3 lines, joined, and stays a timed-out gate for MOD-96', () => {
    const tail = ['one', 'two', 'three', 'four']
    const why = pastCeilingWith(2, tail)
    expect(why).toBe(`${pastCeiling(2)}; last output: two | three | four`)
    expect(gateTimedOut(`claim gate: unchecked — gate node did not run: ${why}`)).toEqual({ id: 'node', minutes: 2 })
  })
  test('a long tail is cut to 240 characters and ends in an ellipsis', () => {
    const tail = [`${'x'.repeat(200)}`, `${'y'.repeat(200)}`]
    const why = pastCeilingWith(45, tail)
    const at = why.indexOf('; last output: ')
    expect(at > 0).toBe(true)
    const shown = why.slice(at + '; last output: '.length)
    expect(shown.length).toBe(240)
    expect(shown.endsWith('…')).toBe(true)
    expect(gateTimedOut(`claim gate: unchecked — gate npm test did not run: ${why}`)).toEqual({ id: 'npm test', minutes: 45 })
  })
})
