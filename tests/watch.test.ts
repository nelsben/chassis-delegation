import { test, expect, describe } from 'claude-code/testing'
import { driftMessage, statusText, shouldClearStatus, newAgentTypes, parseCandidateIds, STATUS_IDLE_MS } from '../hooks/lib/watch'

describe('alias drift', () => {
  test('a changed id is news; a first sighting or the same id is not', () => {
    expect(driftMessage('sonnet', 'claude-sonnet-5', 'claude-sonnet-5-5')).toBe('sonnet now resolves to claude-sonnet-5-5 (was claude-sonnet-5)')
    expect(driftMessage('sonnet', undefined, 'claude-sonnet-5-5')).toBeUndefined()
    expect(driftMessage('sonnet', 'claude-sonnet-5-5', 'claude-sonnet-5-5')).toBeUndefined()
    expect(driftMessage('sonnet', 'claude-sonnet-5-5', 'sonnet')).toBeUndefined()
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
