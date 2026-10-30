// MOD-200: the pure status module.
import { test, expect, describe } from 'claude-code/testing'
import { startedComment, statusFailure, statusFile, superseded, verdictComment } from '../hooks/lib/status'

describe('MOD-200: status', () => {
  test('statusFile names the body file under .delegation/status/', () => {
    expect(statusFile('/r/app', 'MOD-200', 1, 'started')).toBe('/r/app/.delegation/status/MOD-200-attempt-1-started.md')
    expect(statusFile('/r/app/', 'MOD-200', 2, 'verdict')).toBe('/r/app/.delegation/status/MOD-200-attempt-2-verdict.md')
  })
  test('startedComment is one line', () => {
    expect(startedComment({ id: 'MOD-200', attempt: 1, budget: 2, tier: 'standard', alias: 'sonnet' })).toBe('attempt 1/2 started · standard sonnet · card MOD-200')
  })
  test('verdictComment is the row text', () => {
    expect(verdictComment('chassis-delegation: MOD-1 accepted\n')).toBe('chassis-delegation: MOD-1 accepted')
  })
  test('superseded drops an empty reason', () => {
    expect(superseded(12, 'scope changed')).toBe('superseded by #12: scope changed')
    expect(superseded(12, '  ')).toBe('superseded by #12')
  })
  test('statusFailure cuts stderr at 200 chars', () => {
    expect(statusFailure(7, 'x'.repeat(300))).toBe(`status: comment on #7 failed: ${'x'.repeat(200)}`)
  })
})
