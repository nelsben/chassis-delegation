import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, ROOT } from './harness'

// MOD-175: what fires when the brain resumes a briefed worker with SendMessage, and what the mod counts.
// Host (Anthropic's mods reference, https://code.claude.com/docs/en/plugins/mods/reference, Subagents): on a SendMessage resume
// "your agent.spawn hook doesn't run again"; the call is visible to a tool.call hook; session.send fires "when a message ... is about to go to another agent".
// The sub-agents page (https://code.claude.com/docs/en/sub-agents#resume-subagents) says a resume "starts a new run of the agent under the same ID".
// The test engine fires only the events a test emits, so each sequence the host may send is a case here.

const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const WT = `${ROOT}-T-4`
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const SEND = { tool: 'SendMessage', to: 'agent-4', message: 'fix it' }

const records = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[]
const ledger = (w: { files: Map<string, string> }) =>
  (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>).filter(r => r.event !== 'spawn')
const attemptsOf = (w: { files: Map<string, string> }) => ledger(w).map(r => [r.attempt, r.kind])
/** The spawn decisions the mod's agent.spawn handler made: each briefed one posts a tier notice. */
const spawnDecisions = (w: { notices: string[] }) => w.notices.filter(n => n.startsWith('tier=')).length

const setup = (on: Parameters<typeof world>[0]) =>
  world(on, {
    files: { [BRIEF]: HEADER + '\nbody' },
    dirs: { [WT]: [] },
    run: argv => (argv[0] === 'npx' ? { exitCode: 1, stdout: 'a/x.ts: not formatted\n' } : undefined),
    agentId: 'agent-4',
  })

/** Spawn, then a refuted first hand-back. */
const firstRound = async ($: Parameters<Parameters<typeof test>[2]>[0], w: ReturnType<typeof world>) => {
  await $.session.start(sessionStart)
  await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
  await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
  expect(w.spawns).toHaveLength(1)
}

describe('MOD-175: a SendMessage resume of a briefed worker', () => {
  test('the first round: one spawn decision, one attempt in the ledger', { options: GM }, async ($, on) => {
    const w = setup(on)
    await firstRound($, w)
    expect(spawnDecisions(w)).toBe(1)
    expect(attemptsOf(w)).toEqual([[1, 'spawn']])
  })

  test('sequence A (the docs rule it out: agent.spawn does not run on a resume): a second agent.spawn with the same agent id is a new lineage, not a resume', { options: GM }, async ($, on) => {
    const w = setup(on)
    await firstRound($, w)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT, tool_use_id: 'toolu_resume' }))
    expect(spawnDecisions(w)).toBe(2) // the spawn handler ran again
    expect(w.spawns).toHaveLength(2)
    // counted as attempt 2 of the budget, but as kind spawn in lineage 2 (escalated a tier), not kind resume: internals.md's old sentence was wrong for this sequence
    expect(records(w).map(r => [r.attempt, r.kind, r.lineage])).toEqual([[1, 'spawn', 1], [2, 'spawn', 2]])
    expect(w.notices.at(-1)).toBe('tier=frontier → opus (escalated) · attempt 2/3')
  })

  test('sequence B (tool.call only): gap: the SendMessage call reaches the hooks but records no attempt, so nothing is counted or budget-checked until the next hand-back', { options: GM }, async ($, on) => {
    const reached: unknown[] = []
    on('tool.call', { tool: 'SendMessage' }, async () => (reached.push(1), { result: 'queued' })) // the engine answers tool.call only when a test does
    const w = setup(on)
    await firstRound($, w)
    expect(await $.tool.call(SEND as never)).toEqual({ result: 'queued' }) // the mod's own tool.call hooks passed it on, none denied it
    expect(reached).toHaveLength(1)
    expect(spawnDecisions(w)).toBe(1)
    expect(w.spawns).toHaveLength(1)
    expect(records(w).map(r => [r.attempt, r.kind])).toEqual([[1, 'spawn']]) // gap: no attempt is recorded at the send, so the budget is not checked and no "started attempt 2" row is posted
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222')))
    // counted late, at the hand-back: a judged worker handing back at a new sha is the next attempt (MOD-41)
    expect(attemptsOf(w)).toEqual([[1, 'spawn'], [2, 'resume']])
    expect(records(w).map(r => [r.attempt, r.kind, r.lineage])).toEqual([[1, 'spawn', 1], [2, 'resume', 1]])
  })

  test('sequence B: gap: a resumed worker that hands back at the same sha is not counted at all', { options: GM }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const w = setup(on)
    await firstRound($, w)
    await $.tool.call(SEND as never)
    await $.turn.complete(turnInput('agent-4', 'Nothing changed.\n' + REPORT('1111111')))
    expect(attemptsOf(w)).toEqual([[1, 'spawn']])
    expect(records(w)).toHaveLength(1)
  })

  test('sequence C (session.send to the worker): the resume is recorded at the send, before the hand-back', { options: GM }, async ($, on) => {
    const w = setup(on)
    await firstRound($, w)
    await $.session.send({ to: 'agent-4', text: 'fix it', origin: { kind: 'model' } } as never)
    expect(spawnDecisions(w)).toBe(1) // the spawn handler does not run
    expect(w.spawns).toHaveLength(1)
    expect(records(w).map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'refuted'], [2, 'resume', 1, 'pending']])
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222')))
    expect(attemptsOf(w)).toEqual([[1, 'spawn'], [2, 'resume']])
  })
})
