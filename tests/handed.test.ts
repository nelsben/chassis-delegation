// MOD-273: a spawn is a card's worker only when its prompt hands the brief; a prompt that merely cites the path runs ad hoc.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, ROOT } from './harness'

const BRIEF = `${ROOT}/.delegation/briefs/T-1.brief.md`
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid= gate=node budget=2-attempts report=chassis.report.v1]]'
const TASKS = `delegation.tasks.T-1@${ROOT}`
const NOTE = "T-1's brief is named but not handed; this agent runs ad hoc"
const setup = (on: any) => world(on, { files: { [BRIEF]: HEADER + '\nbody' } })
const stored = (w: { store: Map<string, unknown> }) => (w.store.get(TASKS) ?? []) as { attempt: number }[]
const said = (w: { notices: string[]; debugLogs: string[] }) => [...w.notices, ...w.debugLogs].join('\n')

describe('MOD-273: only a handed brief claims the spawn', () => {
  test('a brief path cited in parentheses runs ad hoc on the requested model and spends no attempt', async ($, on) => {
    const w = setup(on)
    const r = await $.agent.spawn(spawnInput({ prompt: `Review the card (its brief: ${BRIEF})`, model: 'fable' }))
    expect(stored(w)).toEqual([])
    expect((r as { model?: string }).model).toBe('fable')
    expect(said(w)).toContain(NOTE)
  })

  test('the spawnPrompt form still records attempt 1', async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).not.toContain(NOTE)
  })

  test('the backticked form still records', async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file \`${BRIEF}\`. Read it whole, then follow it exactly.` }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
  })

  test('an inline header still records', async ($, on) => {
    const w = world(on, {})
    await $.agent.spawn(spawnInput({ prompt: HEADER + '\nDo the thing.' }))
    expect(stored(w).map(r => r.attempt)).toEqual([1])
    expect(said(w)).not.toContain(NOTE)
  })
})
