import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, workerCall, SCRATCH } from './harness'

// MOD-197: a recorded worker's gh writes are denied; the brain's pass.
describe('MOD-197: the gh guard on Bash', () => {
  const HEAD = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier spend=2 budget=3-attempts report=chassis.report.v1]]`
  const briefOf = (task: string) => `${SCRATCH}/briefs/${task}.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const boot = async ($: Parameters<Parameters<typeof test>[2]>[0], on: Parameters<Parameters<typeof test>[2]>[1], task: string, agentId: string) => {
    const w = world(on, { files: { [briefOf(task)]: HEAD(task) + '\nbody' }, run: () => undefined, agentId })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' }))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${briefOf(task)}.` }))
    return w
  }

  test('a recorded worker `gh issue close 5` is denied naming its task', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-7', 'agent-7')
    const r = await workerCall($, w, 'agent-7', { tool: 'Bash', command: 'gh issue close 5' })
    const deny = r.seen ? r.result.deny : undefined
    expect(deny).toContain('T-7')
    expect(deny).toContain("gh writes are the brain's")
  })

  test('a worker reading with gh passes', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-8', 'agent-8')
    const r = await workerCall($, w, 'agent-8', { tool: 'Bash', command: 'gh pr view 3' })
    expect(r.seen ? r.result.deny : 'unseen').toBeUndefined()
  })

  test('the brain (no agentId) passes to next', { options: { ...GM } }, async ($, on) => {
    await boot($, on, 'T-9', 'agent-9')
    const r = await $.tool.call({ tool: 'Bash', command: 'gh issue close 5' } as never)
    expect((r as { deny?: string }).deny).toBeUndefined()
  })
})
