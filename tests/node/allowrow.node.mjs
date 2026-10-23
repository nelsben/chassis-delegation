// MOD-126: the allow clause rides inside the verdict row, before next=; the config view names briefLocal's default. Pure.
import { test, expect, describe } from './kit.mjs'

const BASE = { task: 'T-4', attempt: 1, budget: 3, verdict: 'consistent', alias: 'sonnet', usd: 1.5, lines: [] }

describe('MOD-126: allow in the quiet line', () => {
  test('the clause sits before next=, and next= is last', async () => {
    const { quietLine } = await import('../../hooks/lib/quiet.ts')
    const line = quietLine({ ...BASE, allow: ['live-reads'], next: 'accept' })
    expect(line.endsWith(' · next=accept')).toBe(true)
    expect(line).toContain(' · allow live-reads · ')
    expect(line).toBe('chassis-delegation: T-4 attempt 1/3 consistent · sonnet · $1.50 · allow live-reads · next=accept')
  })
  test('several ids join with a comma, after the amend clauses', async () => {
    const { quietLine } = await import('../../hooks/lib/quiet.ts')
    const line = quietLine({ ...BASE, allow: ['a', 'b'], next: 'accept', lines: ['amended: scope+=x (reason y)'] })
    expect(line.indexOf('amended')).toBeLessThan(line.indexOf('allow a,b'))
    expect(line.indexOf('allow a,b')).toBeLessThan(line.indexOf('next='))
  })
  test('no allow ids: the line is what it was', async () => {
    const { quietLine } = await import('../../hooks/lib/quiet.ts')
    const want = 'chassis-delegation: T-4 attempt 1/3 consistent · sonnet · $1.50 · next=accept'
    expect(quietLine({ ...BASE, next: 'accept' })).toBe(want)
    expect(quietLine({ ...BASE, allow: [], next: 'accept' })).toBe(want)
  })
})

describe('MOD-126: allow in the full verdict line', () => {
  test('allow= before next=, next= last', async () => {
    const { verdictLine } = await import('../../hooks/lib/verify.ts')
    const v = { verdict: 'consistent', task: 'T-4', attempt: 1, budget: 3, next: 'accept' }
    expect(verdictLine({ ...v, allow: ['live-reads'] })).toBe('chassis-delegation: verdict=consistent task=T-4 attempt=1/3 · allow=live-reads · next=accept')
    expect(verdictLine({ ...v, allow: ['a', 'b'] }).endsWith(' · allow=a,b · next=accept')).toBe(true)
  })
  test('no allow ids: unchanged', async () => {
    const { verdictLine } = await import('../../hooks/lib/verify.ts')
    const v = { verdict: 'consistent', task: 'T-4', attempt: 1, budget: 3, next: 'accept' }
    expect(verdictLine(v)).toBe('chassis-delegation: verdict=consistent task=T-4 attempt=1/3 next=accept')
    expect(verdictLine({ ...v, allow: [] })).toBe(verdictLine(v))
  })
})

describe('MOD-126: the config view names briefLocal default', () => {
  test('empty reads none: no local rules; a value shows none', async () => {
    const { inEffect } = await import('../../hooks/lib/configcmd.ts')
    expect(inEffect('briefLocal', { briefLocal: '' })).toBe('none: no local rules')
    expect(inEffect('briefLocal', { briefLocal: '.delegation/x.md' })).toBe(undefined)
  })
})
