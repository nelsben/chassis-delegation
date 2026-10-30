import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, workerCall, SCRATCH } from './harness'
import { ghWrites } from '../hooks/lib/ghguard'

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

  test('MOD-200: ghWrites still lists the comment and close the mod now runs itself', () => {
    expect(ghWrites('gh issue comment 5 --repo o/r --body-file /r/.delegation/status/T-1-attempt-1-started.md')).toContain('gh issue comment')
    expect(ghWrites('gh issue close 5 --repo o/r --comment done')).toContain('gh issue close')
  })

  test('MOD-203: the verb is read past -R/--repo/--hostname after the noun', () => {
    expect(ghWrites('gh issue -R o/r close 5')).toEqual(['gh issue close'])
    expect(ghWrites('gh pr --repo o/r merge 3 --rebase')).toEqual(['gh pr merge'])
    expect(ghWrites('gh issue --repo=o/r close 5')).toEqual(['gh issue close'])
    expect(ghWrites('gh issue --hostname h -R o/r close 5')).toEqual(['gh issue close'])
    expect(ghWrites('gh pr -R o/r --web merge 3')).toEqual(['gh pr merge'])
    expect(ghWrites('gh issue -R o/r view 5')).toEqual([])
    expect(ghWrites('gh pr --repo o/r list')).toEqual([])
  })

  test('MOD-203: run, cache and the other write nouns', () => {
    expect(ghWrites('gh run cancel 9')).toEqual(['gh run cancel'])
    expect(ghWrites('gh run rerun 9')).toEqual(['gh run rerun'])
    expect(ghWrites('gh run delete 9')).toEqual(['gh run delete'])
    expect(ghWrites('gh run list')).toEqual([])
    expect(ghWrites('gh run view 9')).toEqual([])
    expect(ghWrites('gh run watch 9')).toEqual([])
    expect(ghWrites('gh run download 9')).toEqual([])
    expect(ghWrites('gh cache delete --all')).toEqual(['gh cache delete'])
    expect(ghWrites('gh cache list')).toEqual([])
    for (const n of ['codespace', 'extension', 'alias', 'ssh-key', 'gpg-key']) {
      expect(ghWrites(`gh ${n} delete x`)).toEqual([`gh ${n} delete`])
      expect(ghWrites(`gh ${n} list`)).toEqual([])
      expect(ghWrites(`gh ${n} view`)).toEqual([])
    }
    expect(ghWrites('gh config set editor vim')).toEqual(['gh config set'])
    expect(ghWrites('gh config get editor')).toEqual([])
    expect(ghWrites('gh config list')).toEqual([])
  })
})
