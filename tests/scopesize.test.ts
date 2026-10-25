import { test, expect, describe } from 'claude-code/testing'
import { SCOPE_FILES_MAX, TIER_HINT_SCOPE_MAX, TIER_HINT_DONE_MAX, scopeSizeWarning, tierHint } from '../hooks/lib/dispatch'
import { doneStatementCount } from '../hooks/lib/card'
import { world, commandInput, sessionStart, ROOT } from './harness'
import type { TestBody } from 'claude-code/testing'

const files = (n: number): string[] => Array.from({ length: n }, (_, i) => `src/f${i}.ts`)

describe('MOD-54: the scope-size warning', () => {
  test('the limit is the named constant 6', () => {
    expect(SCOPE_FILES_MAX).toBe(6)
  })
  test('six literal entries do not warn', () => {
    expect(scopeSizeWarning(files(6))).toBeUndefined()
  })
  test('seven literal entries warn, counting globs in the line', () => {
    expect(scopeSizeWarning([...files(7), 'tests/**'])).toBe('warning: scope names 7 files (and 1 globs); cost tracks the files a card touches: split it')
  })
  test('globs are counted but never trigger it', () => {
    expect(scopeSizeWarning([...files(6), 'a/**', 'b/*.ts', 'c/?.md'])).toBeUndefined()
    expect(scopeSizeWarning(['a/**', 'b/**', 'c/**', 'd/**', 'e/**', 'f/**', 'g/**', 'h/**'])).toBeUndefined()
  })
  test('an empty scope does not warn', () => {
    expect(scopeSizeWarning([])).toBeUndefined()
  })
})

describe('MOD-54: the economy-tier hint', () => {
  const ok = (over: Partial<Parameters<typeof tierHint>[0]> = {}) => tierHint({ tier: 'standard', scope: ['src/a.ts', 'tests/a.test.ts'], doneCount: 3, redTest: 'npm test', ...over })
  test('the thresholds are named constants', () => {
    expect(TIER_HINT_SCOPE_MAX).toBe(2)
    expect(TIER_HINT_DONE_MAX).toBe(3)
  })
  test('a small standard card gets the hint, tests/ entries left out of the count', () => {
    expect(ok()).toBe('hint: tier economy would do: 1 files in scope, 3 done-when lines, a red test')
  })
  test('two entries is at the limit, three is over', () => {
    expect(ok({ scope: ['a.ts', 'b.ts', 'test/x.ts'] })).toBe('hint: tier economy would do: 2 files in scope, 3 done-when lines, a red test')
    expect(ok({ scope: ['a.ts', 'b.ts', 'c.ts'] })).toBeUndefined()
  })
  test('three done-when lines is at the limit, four is over', () => {
    expect(ok({ doneCount: 3 })).toBeDefined()
    expect(ok({ doneCount: 4 })).toBeUndefined()
  })
  test('a glob entry (outside tests/) stops it', () => {
    expect(ok({ scope: ['src/**'] })).toBeUndefined()
    expect(ok({ scope: ['src/a.ts', 'b?.ts'] })).toBeUndefined()
  })
  test('only the standard tier is hinted', () => {
    expect(ok({ tier: 'economy' })).toBeUndefined()
    expect(ok({ tier: 'frontier' })).toBeUndefined()
  })
  test('a red_test of none stops it', () => {
    expect(ok({ redTest: 'none' })).toBeUndefined()
    expect(ok({ redTest: ' None ' })).toBeUndefined()
  })
})

describe('MOD-54: counting done-when statements', () => {
  test('counts the non-blank lines, a wrapped bullet line as one with its bullet', () => {
    expect(doneStatementCount(['', '- one', '  continued', '- two', '', '- three', ''])).toBe(3)
    expect(doneStatementCount([])).toBe(0)
    expect(doneStatementCount(['', 'one', 'two'])).toBe(2)
  })
})

describe('MOD-140: the hedge hint in the dry run', () => {
  type Tester = Parameters<TestBody>[0]
  const card = (second: string) => `---\nid: BE-201\ntitle: A card\ndomain: backend\ntier: standard\nstatus: queued\nowner: backend\npriority: P3\nblocked_by: []\ngate: G2\nred_test: "a test fails on main"\nscope: src/a.ts\nforbid: vendor/**\nbudget: 3-attempts\n---\n\n## Why\n\nA reason.\n\n## Done when\n\n- Writes the file.\n- ${second}\n`
  const name = 'BE-201-a-card.md'
  const run = async ($: Tester, on: unknown, second: string) => {
    world(on as never, { files: { [`${ROOT}/agents/tasks/${name}`]: card(second), '/tpl/brief.md': 'Rules.\n{{extra}}\n\n## The card\n\n{{body}}\n', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }) }, dirs: { [`${ROOT}/agents/tasks`]: [name] } })
    await $.session.start(sessionStart)
    return String((await $.command.run(commandInput('BE-201 --dry-run'))).text)
  }
  test('a second line that says appropriately prints the hint', async ($, on) => {
    expect(await run($, on, 'Handle errors appropriately.')).toContain('hint: done-when line 2 says "appropriately"')
  })
  test('a card with no hedge words prints no hedge hint', async ($, on) => {
    expect(await run($, on, 'Returns the count.')).not.toContain('hint: done-when line')
  })
})
