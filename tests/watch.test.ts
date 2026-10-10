import { test, expect, describe } from 'claude-code/testing'
import { aliasLines, driftMessage, statusText, shouldClearStatus, newAgentTypes, parseCandidateIds, STATUS_IDLE_MS } from '../hooks/lib/watch'

describe('alias drift', () => {
  test('a changed id is news; a first sighting or the same id is not', () => {
    expect(driftMessage('sonnet', 'claude-sonnet-5', 'claude-sonnet-5-5')).toBe('sonnet now resolves to claude-sonnet-5-5 (was claude-sonnet-5)')
    expect(driftMessage('sonnet', undefined, 'claude-sonnet-5-5')).toBeUndefined()
    expect(driftMessage('sonnet', 'claude-sonnet-5-5', 'claude-sonnet-5-5')).toBeUndefined()
    expect(driftMessage('sonnet', 'claude-sonnet-5-5', 'sonnet')).toBeUndefined()
  })
})

describe('alias sightings', () => {
  const d = (m: number, day: number) => Date.UTC(2026, m - 1, day, 12)
  test('one line per alias seen, with when it moved; a recent move gets a second line', () => {
    const store = {
      haiku: { id: 'claude-haiku-5-5', since: d(10, 8), previous: { id: 'claude-haiku-4-5-20251001', until: d(10, 7) } },
      sonnet: 'claude-sonnet-5-5',
      opus: { id: 'claude-opus-5-5', since: d(9, 1) },
    }
    const lines = aliasLines(store, d(10, 10))
    expect(lines[0]).toBe('aliases: haiku → claude-haiku-5-5 (since 10-08; was claude-haiku-4-5-20251001 until 10-07) · sonnet → claude-sonnet-5-5 · opus → claude-opus-5-5')
    expect(lines[1]).toBe('haiku moved on 10-08: economy cards now run on Haiku 5.5; re-run the economy cases of tests/eval/classifier-cases.jsonl')
    expect(lines).toHaveLength(2)
  })
  test('a move older than 7 days is one line; nothing seen is no line', () => {
    const store = { haiku: { id: 'claude-haiku-5-5', since: d(10, 8), previous: { id: 'claude-haiku-4-5-20251001', until: d(10, 7) } } }
    expect(aliasLines(store, d(10, 20))).toHaveLength(1)
    expect(aliasLines({}, d(10, 20))).toEqual([])
  })
})

describe('new agent types', () => {
  test('the first look seeds silently; later newcomers are named once', () => {
    expect(newAgentTypes(undefined, ['Explore', 'Plan'])).toEqual({ added: [], next: ['Explore', 'Plan'], seeded: true })
    expect(newAgentTypes(['Explore'], ['Explore', 'Plan', 'Plan'])).toEqual({ added: ['Plan'], next: ['Explore', 'Plan'], seeded: false })
    expect(newAgentTypes(['Explore'], ['Explore'])).toEqual({ added: [], next: ['Explore'], seeded: false })
  })
  test('candidate ids', () => {
    expect(parseCandidateIds(' claude-a , ,claude-b ')).toEqual(['claude-a', 'claude-b'])
    expect(parseCandidateIds('')).toEqual([])
  })
})

describe('status line', () => {
  test('text', () => {
    expect(statusText({ running: 2, usd: 3.456, pct: 41 })).toBe('2 workers · $3.46 · ctx 41%')
    expect(statusText({ running: 1, usd: undefined, pct: undefined })).toBe('1 worker · $– · ctx –')
  })
  test('cleared when nothing runs and cost has not moved for ten minutes', () => {
    expect(STATUS_IDLE_MS).toBe(600000)
    expect(shouldClearStatus({ running: 0, now: 700000, lastCostChangeAt: 0 })).toBe(true)
    expect(shouldClearStatus({ running: 0, now: 500000, lastCostChangeAt: 0 })).toBe(false)
    expect(shouldClearStatus({ running: 1, now: 9e9, lastCostChangeAt: 0 })).toBe(false)
  })
})
