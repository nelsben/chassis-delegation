// MOD-271: effort per role (reviewEffort) and the maxEffort cap (default high).
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, sessionStart, stepInput, ROOT, SCRATCH } from './harness'
import { reviewMarker } from '../hooks/lib/review'
import { clampEffort, effortLabel, effortText } from '../hooks/lib/tier'

const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const runStep = async ($: { turn: { step: (e: never) => AsyncIterable<unknown> } }, input: never) => {
  for await (const chunk of $.turn.step(input)) void chunk
}
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const reviewSpawn = ($: { agent: { spawn: (e: never) => Promise<unknown> } }) =>
  $.agent.spawn(spawnInput({ prompt: `${reviewMarker({ task: 'T-4', subtask: 'main', attempt: 1 })}\nReview the work.` }))

describe('MOD-271: pure', () => {
  test('clampEffort keeps a level at or under the cap and names what it capped from', () => {
    expect(clampEffort('max', 'high')).toEqual({ effort: 'high', cappedFrom: 'max' })
    expect(clampEffort('xhigh', 'high')).toEqual({ effort: 'high', cappedFrom: 'xhigh' })
    expect(clampEffort('medium', 'high')).toEqual({ effort: 'medium' })
    expect(clampEffort('max', 'max')).toEqual({ effort: 'max' })
    expect(clampEffort(undefined, 'high')).toEqual({ effort: undefined })
    expect(effortLabel(clampEffort('max', 'high'))).toBe('high (capped from max)')
  })
  test('the /delegation effort line shows the reviewer level and the cap', () => {
    const table = { economy: 'low', standard: 'medium', frontier: 'high' } as const
    expect(effortText(table, 'medium', 'high')).toBe('effort: economy low · standard medium · frontier high · review medium · cap high')
    expect(effortText(table, '', 'max')).toBe('effort: economy low · standard medium · frontier high · review default · cap max')
  })
})

describe('MOD-271: engine', () => {
  test('a reviewer\'s step is rewritten to reviewEffort (medium by default)', async ($, on) => {
    const w = world(on, { agentId: 'agent-r' })
    await $.session.start(sessionStart)
    await reviewSpawn($)
    await runStep($, stepInput('agent-r', 'xhigh'))
    expect(w.steps).toEqual([{ agentId: 'agent-r', effort: 'medium' }])
    expect(w.notices.join('\n')).toContain('effort medium')
  })

  test('an empty reviewEffort keeps the engine default for a reviewer', async ($, on) => {
    const w = world(on, { agentId: 'agent-r', files: { [REPO_FILE]: JSON.stringify({ reviewEffort: '' }) } })
    await $.session.start(sessionStart)
    await reviewSpawn($)
    await runStep($, stepInput('agent-r', 'xhigh'))
    expect(w.steps).toEqual([{ agentId: 'agent-r', effort: 'xhigh' }])
  })

  test('a reviewEffort above the cap is clamped to it', async ($, on) => {
    const w = world(on, { agentId: 'agent-r', files: { [REPO_FILE]: JSON.stringify({ reviewEffort: 'max' }) } })
    await $.session.start(sessionStart)
    await reviewSpawn($)
    await runStep($, stepInput('agent-r', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-r', effort: 'high' }])
  })

  test('a card effort: max is clamped to high and the started row discloses it', async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, agentId: 'agent-4' })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' }))
    await $.session.start(sessionStart)
    w.store.set(`delegation.effort.T-4@${ROOT}`, 'max')
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await runStep($, stepInput('agent-4', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-4', effort: 'high' }])
    expect(delivered(w)).toContain('effort high (capped from max)')
  })

  test('raising maxEffort to max lets it through, with no disclosure', { options: { maxEffort: 'max' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, agentId: 'agent-4' })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' }))
    await $.session.start(sessionStart)
    w.store.set(`delegation.effort.T-4@${ROOT}`, 'max')
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await runStep($, stepInput('agent-4', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-4', effort: 'max' }])
    expect(delivered(w)).not.toContain('capped from')
  })

  test('/delegation shows the reviewer level and the cap', async ($, on) => {
    world(on, {})
    await $.session.start(sessionStart)
    const out = String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(out).toContain('effort: economy low · standard medium · frontier high · review medium · cap high')
  })
})
