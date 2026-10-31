// MOD-229 (#323): the spawned gate's pure parts: output kept to a byte cap, the ceiling words, the gate id, the row. Pure.
import { test, expect, describe } from './kit.mjs'
import { passedGateLines, shapeOldGates, cutToBytes, gateIdOf, gateOutput, gateProgressText, pastCeiling, spawnExitCode } from '../../hooks/lib/gaterun.ts'
import { gateTimedOut } from '../../hooks/lib/verify.ts'

describe('MOD-229: a spawned gate\'s output', () => {
  test('cut to a byte cap, never inside a character', () => {
    expect(cutToBytes('abcdef', 4)).toEqual({ text: 'abcd', bytes: 4 })
    expect(cutToBytes('aé', 2)).toEqual({ text: 'a', bytes: 1 })
    expect(cutToBytes('x😀', 5)).toEqual({ text: 'x😀', bytes: 5 })
  })
  test('each stream keeps its first max bytes; the rest is dropped', () => {
    const o = gateOutput(5)
    o.add('stdout', 'abc')
    o.add('stdout', 'defg')
    o.add('stdout', 'h')
    o.add('stderr', 'err')
    expect(o.stdout()).toBe('abcde')
    expect(o.truncated('stdout')).toBe(true)
    expect(o.stderr()).toBe('err')
    expect(o.truncated('stderr')).toBe(false)
  })
  test('a signal ends the child as exit 1', () => {
    expect(spawnExitCode({ code: null })).toBe(1)
    expect(spawnExitCode({ code: 2 })).toBe(2)
  })
})

describe('MOD-229: the ceiling and the row', () => {
  test('the ceiling words name the minutes, and MOD-96 reads them as the verifier\'s limit', () => {
    const why = pastCeiling(45)
    expect(why).toContain('gate ran past gateTimeoutMinutes (45 min)')
    expect(gateTimedOut(`claim gate: unchecked — gate npm test did not run: ${why}`)).toEqual({ id: 'npm test', minutes: 45 })
  })
  test('the gate id of a run label, else the label', () => {
    const map = { test: 'claude plugin test {worktree}', node: 'node a.mjs && node b.mjs' }
    expect(gateIdOf('node,test', map, 'claude plugin test {worktree}')).toBe('test')
    expect(gateIdOf('node,test', map, 'node b.mjs')).toBe('node')
    expect(gateIdOf('claude plugin validate /x', map, 'claude plugin validate /x')).toBe('claude plugin validate /x')
  })
  test('running and waiting rows count whole minutes from their own start', () => {
    expect(gateProgressText({ phase: 'gate', id: 'test', since: 0 }, 3 * 60_000 + 59_000)).toBe('verifying (gate test running 3 min)')
    expect(gateProgressText({ phase: 'lock', since: 60_000 }, 3 * 60_000)).toBe('verifying (waiting for the engine gate 2 min)')
  })
})

describe('MOD-234: what merge-gates.txt keeps', () => {
  const many = Array.from({ length: 100 }, (_, i) => `l${i + 1}`).join('\n')
  test('a pass keeps the last 40 lines, a count and the exit line', () => {
    const out = passedGateLines(many, '')
    expect(out[0]).toBe('(pass) 60 lines elided')
    expect(out.length).toBe(42)
    expect(out[1]).toBe('l61')
    expect(out.at(-1)).toBe('exit 0')
  })
  test('a short pass elides nothing; stderr follows stdout', () => {
    expect(passedGateLines('a\n', 'b\n')).toEqual(['(pass) 0 lines elided', 'a', 'b', 'exit 0'])
  })
  test('an old file keeps its first line and last 40; one already cut is left alone', () => {
    const text = `## g\n${many}\n`
    const out = shapeOldGates(text)
    const lines = out.trimEnd().split('\n')
    expect(lines[0]).toBe('## g')
    expect(lines[1]).toBe('(older file) 60 lines elided')
    expect(lines.length).toBe(42)
    expect(lines.at(-1)).toBe('l100')
    expect(shapeOldGates(out)).toBeUndefined()
  })
})
