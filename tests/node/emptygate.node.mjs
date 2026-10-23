// MOD-122 (#199 item 2): gateMap._empty, the gate a hand-back with no changed files runs. Pure.
import { test, expect, describe } from './kit.mjs'
import { gateForDelta, gateTemplatesOf } from '../../hooks/lib/gates.ts'
import { parseRepoConfig } from '../../hooks/lib/repoconfig.ts'

const MAP = { test: 'npm test', fast: 'npm run lint', _empty: 'fast' }

describe('MOD-122: which gate ids a changed-files listing runs', () => {
  test('an empty listing with _empty runs its id, and says so', () => {
    expect(gateForDelta('test', MAP, [])).toEqual({ gate: 'fast', line: 'gate: test → _empty fast (no changed files)' })
    expect(gateForDelta('test,fast', MAP, []).line).toBe('gate: test, fast → _empty fast (no changed files)')
  })
  test('an empty listing without _empty runs the card gates', () => {
    expect(gateForDelta('test', { test: 'npm test' }, [])).toEqual({ gate: 'test' })
  })
  test('a non-empty or unknown listing runs the card gates', () => {
    expect(gateForDelta('test', MAP, ['a.ts'])).toEqual({ gate: 'test' })
    expect(gateForDelta('test', MAP, undefined)).toEqual({ gate: 'test' })
  })
  test('a brief with no gate stays with none; _empty is no allowlisted command', () => {
    expect(gateForDelta(undefined, MAP, [])).toEqual({ gate: undefined })
    expect(gateTemplatesOf(MAP).some(t => t.join(' ') === 'fast')).toBe(false)
  })
})

describe('MOD-122: _empty in the config', () => {
  test('naming a missing id is a config error and is ignored', () => {
    const { config, errors } = parseRepoConfig(JSON.stringify({ gateMap: { test: 'npm test', _empty: 'nope' } }))
    expect(config.gateMap).toEqual({ test: 'npm test' })
    expect(errors.join('\n')).toContain('gateMap._empty')
  })
  test('naming an id of the map is kept', () => {
    expect(parseRepoConfig(JSON.stringify({ gateMap: MAP })).config.gateMap).toEqual(MAP)
  })
})
