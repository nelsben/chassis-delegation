import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, bandProps } from './harness'

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
