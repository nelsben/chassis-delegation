import { expect } from 'claude-code/testing'
import { test, world, spawnInput } from './harness'

// MOD-300: a verify record is the brain judging work already there; it spends no attempt of budget=.
test('a spawn refuted and a verify refuted on a budget=2 card: a dispatch is not refused on budget', async ($, on) => {
  const rec = (n: number, kind: string) => ({ task: 'T-2', subtask: 'main', attempt: n, kind, lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: n })
  const w = world(on, { store: { 'delegation.tasks.T-2': [rec(1, 'spawn'), rec(2, 'verify')] } })
  const r = await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-2 subtask=main tier=standard budget=2-attempts]]' }))
  expect(r.deny).toBeUndefined()
  expect(w.spawns).toHaveLength(1)
})
