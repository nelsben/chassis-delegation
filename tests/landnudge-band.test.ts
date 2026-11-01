import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, bandProps, ROOT, NOW } from './harness'

// MOD-201: the band draws the nudge line alone, and last beside the live view.
const LINE = 'lead: land this as an issue (land or land_plan) or say it is not work'
const PROMPT = 'the merge button is broken on dark mode'
const land = { tool: 'mcp__chassis-delegation__land', type: 'bug', title: 'x', dryRun: true }
const mount = async ($: any, props = bandProps()) => {
  try {
    return await $.ui.mount({ plugin: 'chassis-delegation', surface: 'terminal', component: 'AbovePrompt', props } as never)
  } catch {
    return undefined
  }
}
const submit = async ($: any, on: any) => {
  on('prompt.submit', (_$: unknown, e: { text: string }) => ({ text: e.text }))
}

describe('MOD-201: the nudge line in the band', () => {
  test('flagged prompt, turn ends with no land call: the line draws alone, without the live view', { options: { landAuto: true } }, async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    await $.prompt.submit({ text: PROMPT } as never)
    expect(await (await mount($))?.find({ type: 'Text', text: /lead: land this/ })).toBeUndefined()
    await $.turn.complete({ turnId: 't1', answer: 'ok' } as never)
    const ui = await mount($)
    expect(await ui?.find({ type: 'Text', text: LINE })).toBeDefined()
  })

  test('with the live view active the line is the last row of the band', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    w.state.set('chassis-delegation.queue', [{ prompt: '', description: '', subagentType: 'general-purpose', task: 'T-3', at: 1 }])
    await $.prompt.submit({ text: PROMPT } as never)
    await $.turn.complete({ turnId: 't1', answer: 'ok' } as never)
    const ui = await mount($)
    expect(await ui?.find({ type: 'Text', text: LINE })).toBeDefined()
    expect(await ui?.find({ key: 'dash-band' })).toBeDefined()
  })

  test('a later prompt of the person clears it', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    await $.prompt.submit({ text: PROMPT } as never)
    await $.turn.complete({ turnId: 't1', answer: 'ok' } as never)
    await $.prompt.submit({ text: 'go ahead' } as never)
    expect(await (await mount($))?.find({ type: 'Text', text: LINE })).toBeUndefined()
  })
})

describe('MOD-210 (#302): a turn that drives an existing card stays quiet', () => {
  for (const tool of ['dispatch', 'verdict', 'merge']) {
    test(`flagged prompt then a ${tool} call: no land line at the turn's end`, { options: { landAuto: true } }, async ($, on) => {
      world(on)
      await $.session.start(sessionStart)
      await $.prompt.submit({ text: PROMPT } as never)
      try {
        await $.tool.call({ tool: `mcp__chassis-delegation__${tool}`, task: 'T-9', scope: 'a/**' } as never)
      } catch {
        // the call may refuse an unknown card; the hook still saw it
      }
      await $.turn.complete({ turnId: 't1', answer: 'ok' } as never)
      expect(await (await mount($))?.find({ type: 'Text', text: LINE })).toBeUndefined()
    })
  }

  test('flagged prompt with none of those calls still shows the line', { options: { landAuto: true } }, async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    await $.prompt.submit({ text: PROMPT } as never)
    await $.turn.complete({ turnId: 't1', answer: 'ok' } as never)
    expect(await (await mount($))?.find({ type: 'Text', text: LINE })).toBeDefined()
  })
})

describe('MOD-255: an owed review row clears from the band once a review accepts the attempt', () => {
  const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
  const verified = { task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', sha: '1234abcd', verdict: 'consistent', next: 'review', agentId: 'ag1' }
  const jsonl = (rows: object[]) => rows.map(r => JSON.stringify(r)).join('\n') + '\n'
  const OWED = /1 owed/
  // the task's agent handed back and its spawn is still open: the band counts it as a verdict owed
  const seed = (w: ReturnType<typeof world>, review: object) => {
    w.agents.push({ id: 'ag1', type: 'general-purpose', description: 'T-4', status: 'completed' })
    w.store.set('delegation.agent.ag1', 'k1')
    w.store.set('delegation.spawn.k1', { key: 'k1', task: 'T-4', subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 3, purpose: 'build', prompt: '', description: '', subagentType: 'general-purpose', agentId: 'ag1', at: NOW - 60_000 })
    w.store.set(`delegation.tasks.T-4@${ROOT}`, [{ task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'pending', at: NOW - 60_000, sessionId: 'sess-1' }])
    w.files.set(LEDGER, jsonl([verified, review]))
  }

  test('a consistent next=review row followed by an accepting review row: no owed row in the band', { options: { dashboardBand: true } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    seed(w, { task: 'T-4', subtask: 'main', attempt: 1, kind: 'review', verdict: 'reviewed', next: 'accept' })
    await $.session.start(sessionStart)
    expect(await (await mount($))?.find({ type: 'Text', text: OWED })).toBeUndefined()
  })

  test('a review that refutes leaves the owed row', { options: { dashboardBand: true } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    seed(w, { task: 'T-4', subtask: 'main', attempt: 1, kind: 'review', verdict: 'refuted', next: 'respawn' })
    await $.session.start(sessionStart)
    expect(await (await mount($))?.find({ type: 'Text', text: OWED })).toBeDefined()
  })
})
