// MOD-143 (#231 part 2): merge checks. Pure: the placeholders, the card-vs-map choice, the refusal rule and the map in the config.
import { test, expect, describe } from './kit.mjs'
import { fillMergeCheck, mergeCheckRefusal, mergeChecksFor, mergeConfig, parseRepoConfig } from '../../hooks/lib/repoconfig.ts'

const V = { card: 'MOD-7', sha: 'a'.repeat(40), worktree: '/w/repo-MOD-7' }

describe('MOD-143: placeholders in a merge check', () => {
  test('several in one word are all filled', () => {
    expect(fillMergeCheck('node check.cjs --id={card}@{sha}', V)).toEqual(['node', 'check.cjs', `--id=MOD-7@${'a'.repeat(40)}`])
    expect(fillMergeCheck('node c.cjs {card}-{card}', V)).toEqual(['node', 'c.cjs', 'MOD-7-MOD-7'])
  })
  test('a command with none comes through as its words', () => {
    expect(fillMergeCheck('  node   check.cjs  ', V)).toEqual(['node', 'check.cjs'])
  })
  test('an unknown {x} is left as it is; {worktree} is the absolute path', () => {
    expect(fillMergeCheck('node c.cjs {x} {worktree}/out', V)).toEqual(['node', 'c.cjs', '{x}', '/w/repo-MOD-7/out'])
  })
  test('a value with a space stays one word', () => {
    expect(fillMergeCheck('node c.cjs {worktree}', { ...V, worktree: '/w/a b' })).toEqual(['node', 'c.cjs', '/w/a b'])
  })
})

describe('MOD-143: which merge checks a card runs', () => {
  const map = { smoke: 'node smoke.cjs {card}', device: 'node device.cjs', test: 'node t.cjs' }
  test('the card\'s own wins over the map', () => {
    expect(mergeChecksFor('node own.cjs', ['test', 'smoke'], map)).toEqual(['node own.cjs'])
  })
  test('else every map entry whose id is in the card\'s gates, in gate order', () => {
    expect(mergeChecksFor(undefined, ['smoke', 'test'], map)).toEqual(['node smoke.cjs {card}', 'node t.cjs'])
    expect(mergeChecksFor('', ['device', 'smoke'], map)).toEqual(['node device.cjs', 'node smoke.cjs {card}'])
  })
  test('no entry for the card\'s gates is no check', () => {
    expect(mergeChecksFor(undefined, ['lint'], map)).toEqual([])
    expect(mergeChecksFor(undefined, [], map)).toEqual([])
  })
  test('an id that is only an inherited object key is not an entry', () => {
    expect(mergeChecksFor(undefined, ['toString', 'constructor'], {})).toEqual([])
  })
})

describe('MOD-143: what a merge check may be', () => {
  test('the gate map\'s rule, with {card} and {sha} read as values', () => {
    expect(mergeCheckRefusal('node check.cjs {card} {sha}')).toBeUndefined()
    expect(mergeCheckRefusal('node check.cjs {worktree}/shots')).toBeUndefined()
    expect(mergeCheckRefusal('curl http://x')).toBe('a gate may not run curl')
    expect(mergeCheckRefusal('node a.cjs; rm x')).toContain('shell syntax')
    expect(mergeCheckRefusal('node a.cjs && node b.cjs')).toContain('one command')
    expect(mergeCheckRefusal('')).toBe('an empty command')
  })
})

describe('MOD-143: mergeCheckMap in the config', () => {
  test('a valid entry is kept, a refused one dropped with a note', () => {
    const { config, errors } = parseRepoConfig(JSON.stringify({ mergeCheckMap: { smoke: 'node s.cjs {card}', bad: 'curl http://x' } }))
    expect(config.mergeCheckMap).toEqual({ smoke: 'node s.cjs {card}' })
    expect(errors.join('\n')).toContain('mergeCheckMap.bad')
  })
  test('it merges per key across the layers, later layers winning a key', () => {
    const eff = mergeConfig({ mergeCheckMap: { a: 'node a.cjs', b: 'node b.cjs' } }, { mergeCheckMap: { b: 'node b2.cjs' } }, { mergeCheckMap: { c: 'node c.cjs' } })
    expect(eff.mergeCheckMap).toEqual({ a: 'node a.cjs', b: 'node b2.cjs', c: 'node c.cjs' })
    expect(mergeConfig({}, {}).mergeCheckMap).toEqual({})
  })
})
