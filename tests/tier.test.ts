import { test, expect, describe } from 'claude-code/testing'
import {
  pickTier,
  needsClassifier,
  finalAlias,
  aliasOf,
  nextTier,
  noticeText,
  fableRequested,
  tierPickLine,
  classifierText,
  TIER_LABEL_GUIDE,
  CLASSIFIER_LABELS,
  BUILTIN_TIER_MAP,
} from '../hooks/lib/tier'

describe('precedence', () => {
  test('header tier beats the caller model beats the classifier', () => {
    expect(pickTier({ hadHeader: true, headerTier: 'economy', callerModel: 'opus', classified: 'frontier' })).toEqual({ tier: 'economy', source: 'brief' })
    expect(pickTier({ hadHeader: false, callerModel: 'opus', classified: 'economy' })).toEqual({ tier: 'frontier', source: 'caller', callerAlias: 'opus' })
    expect(pickTier({ hadHeader: false, classified: 'economy' })).toEqual({ tier: 'economy', source: 'classified' })
  })
  test('a header without tier= floors at standard and never asks the classifier', () => {
    expect(needsClassifier({ hadHeader: true })).toBe(false)
    expect(needsClassifier({ hadHeader: false, callerModel: 'haiku' })).toBe(false)
    expect(needsClassifier({ hadHeader: false })).toBe(true)
    expect(pickTier({ hadHeader: true, classified: 'frontier' })).toEqual({ tier: 'standard', source: 'floor' })
  })
  test('a classifier answer outside the labels floors at standard', () => {
    expect(pickTier({ hadHeader: false, classified: undefined })).toEqual({ tier: 'standard', source: 'floor' })
  })
  test('a caller id maps to its family alias', () => {
    expect(aliasOf('claude-sonnet-5-5')).toBe('sonnet')
    expect(aliasOf('claude-haiku-4-5-20251001')).toBe('haiku')
    expect(aliasOf('OPUS')).toBe('opus')
    expect(aliasOf('gpt-x')).toBeUndefined()
  })
  test('a failed prior attempt escalates the respawn one tier above the brief', () => {
    expect(pickTier({ hadHeader: true, headerTier: 'standard', escalateFrom: 'standard' })).toEqual({ tier: 'frontier', source: 'escalated' })
    expect(pickTier({ hadHeader: true, headerTier: 'frontier', escalateFrom: 'economy' })).toEqual({ tier: 'frontier', source: 'brief' })
    expect(nextTier('frontier')).toBe('frontier')
    expect(nextTier('economy')).toBe('standard')
  })
  test('GH-104: a respawn after a no-report is held at that attempt tier, never one up and never below it', () => {
    expect(pickTier({ hadHeader: true, headerTier: 'standard', holdAt: 'standard' })).toEqual({ tier: 'standard', source: 'brief' })
    // the no-report came from an attempt already escalated to frontier: the respawn stays there
    expect(pickTier({ hadHeader: true, headerTier: 'standard', holdAt: 'frontier' })).toEqual({ tier: 'frontier', source: 'held' })
    expect(tierPickLine('T-4', 'frontier', { tier: 'frontier', source: 'held' }, undefined, false)).toBe(
      "T-4: tier=frontier picked by the last attempt's tier (a respawn after a no-report is held there, never escalated) (no classify call)",
    )
  })
})

describe('alias mapping', () => {
  test('5B: the built-in tier map, and the configured tierMap entry beside it', () => {
    expect(BUILTIN_TIER_MAP).toEqual({ economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' })
    expect(finalAlias({ tier: 'standard', source: 'brief' }, undefined)).toEqual({ alias: 'sonnet', fableRewritten: false })
    expect(finalAlias({ tier: 'economy', source: 'brief' }, 'haiku')).toEqual({ alias: 'haiku', fableRewritten: false })
    // a repo that runs its standard tier on opus
    expect(finalAlias({ tier: 'standard', source: 'brief' }, 'opus')).toEqual({ alias: 'opus', fableRewritten: false })
    // the caller's own family still wins over the map
    expect(finalAlias({ tier: 'frontier', source: 'caller', callerAlias: 'opus' }, 'sonnet')).toEqual({ alias: 'opus', fableRewritten: false })
  })
  test('fable is never a spawn target: rewritten to opus', () => {
    expect(finalAlias({ tier: 'premium', source: 'brief' }, undefined)).toEqual({ alias: 'opus', fableRewritten: true })
    expect(finalAlias({ tier: 'premium', source: 'caller', callerAlias: 'fable' }, undefined)).toEqual({ alias: 'opus', fableRewritten: true })
    expect(finalAlias({ tier: 'frontier', source: 'brief' }, 'claude-fable-1')).toEqual({ alias: 'opus', fableRewritten: true })
  })
  test('an id in the tier map is passed as its alias, never as the id', () => {
    expect(finalAlias({ tier: 'standard', source: 'brief' }, 'claude-sonnet-5-5')).toEqual({ alias: 'sonnet', fableRewritten: false })
  })
  test('notice text', () => {
    expect(noticeText({ tier: 'standard', source: 'brief' }, 'sonnet', false)).toBe('tier=standard → sonnet (brief)')
    // GH-1 item 8: the rewrite is said out loud, at the tier the spawn runs at
    expect(noticeText({ tier: 'premium', source: 'brief' }, 'opus', true)).toBe('tier=frontier → opus (fable requested; fable is never spawned by the mod)')
    expect(noticeText({ tier: 'premium', source: 'caller', callerAlias: 'fable' }, 'opus', true)).toBe('tier=frontier → opus (fable requested; fable is never spawned by the mod)')
    expect(noticeText({ tier: 'economy', source: 'classified' }, 'haiku', false)).toBe('tier=economy → haiku (classified)')
  })
  test('GH-104: a briefed spawn notice ends with its attempt of the budget', () => {
    expect(noticeText({ tier: 'standard', source: 'brief' }, 'sonnet', false, { attempt: 2, budget: 3 })).toBe('tier=standard → sonnet (brief) · attempt 2/3')
    expect(noticeText({ tier: 'premium', source: 'brief' }, 'opus', true, { attempt: 1, budget: 2 })).toBe('tier=frontier → opus (fable requested; fable is never spawned by the mod) · attempt 1/2')
  })
})

describe('classifier guide', () => {
  test('the guide names the three labels and is exported for the eval', () => {
    expect(CLASSIFIER_LABELS).toEqual(['economy', 'standard', 'frontier'])
    for (const label of CLASSIFIER_LABELS) expect(TIER_LABEL_GUIDE).toContain(label)
    const text = classifierText('x'.repeat(20000))
    expect(text.startsWith(TIER_LABEL_GUIDE)).toBe(true)
    expect(text.length).toBeLessThan(9000)
  })
})

describe('GH-1 item 8: the tier source and the fable rewrite, said out loud', () => {
  test('the debug line names the source that picked the tier and whether the classifier was called', () => {
    expect(tierPickLine('T-7', 'economy', { tier: 'economy', source: 'brief' }, undefined, false)).toBe("T-7: tier=economy picked by the brief header's tier= (no classify call)")
    expect(tierPickLine('adhoc-1', 'economy', { tier: 'economy', source: 'caller', callerAlias: 'haiku' }, 'haiku', false)).toBe("adhoc-1: tier=economy picked by the caller's model hint (haiku) (no classify call)")
    expect(tierPickLine('adhoc-2', 'frontier', { tier: 'frontier', source: 'classified' }, undefined, true)).toBe('adhoc-2: tier=frontier picked by the classifier (classify called)')
    expect(tierPickLine('T-1', 'standard', { tier: 'standard', source: 'floor' }, undefined, false)).toBe('T-1: tier=standard picked by the standard floor (no classify call)')
  })
  test('a header tier or a caller model never needs the classifier, whatever the rest', () => {
    expect(needsClassifier({ hadHeader: true, headerTier: 'frontier' })).toBe(false)
    expect(needsClassifier({ hadHeader: false, headerTier: undefined, callerModel: 'claude-opus-5-5' })).toBe(false)
    expect(needsClassifier({ hadHeader: true, callerModel: 'sonnet' })).toBe(false)
  })
  test('fable is requested when the map gave it (rewritten) or the brief model= names it, and opus spawns', () => {
    expect(fableRequested('opus', true)).toBe(true)
    expect(fableRequested('opus', false, 'fable')).toBe(true)
    expect(fableRequested('opus', false, 'claude-fable-1')).toBe(true)
    expect(fableRequested('opus', false, 'opus')).toBe(false)
    // the brief's model= is advisory: a tier that runs haiku is not a fable rewrite
    expect(fableRequested('haiku', false, 'fable')).toBe(false)
    expect(noticeText({ tier: 'frontier', source: 'brief' }, 'opus', true)).toBe('tier=frontier → opus (fable requested; fable is never spawned by the mod)')
    expect(noticeText({ tier: 'frontier', source: 'brief' }, 'opus', false)).toBe('tier=frontier → opus (brief)')
  })
})
