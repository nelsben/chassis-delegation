import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, commandInput, spawnInput, turnInput, ROOT } from './harness'
import { briefHash } from '../hooks/lib/brief'

// MOD-293 (#389, #393): dispatch amend= writes the brain's grant into the brief; no worker is spawned by it alone.
describe('MOD-293: dispatch amend=', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = (forbid: string) => `[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=${forbid} gate=prettier budget=3-attempts report=chassis.report.v1]]`

  test('a grant rewrites the header and appends one amend line; a scope+= under a forbid is refused and nothing is written', async ($, on) => {
    const w = world(on, { files: { [BRIEF]: `${HEADER('c/**')}\n\nbody\n` } })
    await $.session.start(sessionStart)
    const refused = String((await $.command.run(commandInput('T-4 --amend scope+=c/x.ts'))).text)
    expect(refused).toContain('scope+=c/x.ts is under forbid c/**; add forbid-=c/** to lift it')
    expect(w.files.get(BRIEF)).toBe(`${HEADER('c/**')}\n\nbody\n`)
    const out = String((await $.command.run(commandInput('T-4 --amend scope+=c/x.ts forbid-=c/**'))).text)
    expect(out).toContain('[[amend v=1 scope+=c/x.ts forbid-=c/** reason=brain grant]]')
    expect(out).not.toContain('spawn: Agent')
    const text = String(w.files.get(BRIEF))
    expect(text).toContain('scope=a/**,c/x.ts forbid= ')
    expect(text).toContain('[[amend v=1 scope+=c/x.ts forbid-=c/** reason=brain grant]]\n')
  })
})

// MOD-308 (#395): a grant appended between spawn and verdict: the spawn row, an amend row and the verdict row name the brief they used.
describe('MOD-308: the brief hash on the ledger rows', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
  const ledgerRows = (w: { files: Map<string, string> }) => (w.files.get(LEDGER) ?? '').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)

  test('a grant between spawn and verdict: spawn and verdict differ, the amend row holds the verdict hash', async ($, on) => {
    const w = world(on, { files: { [BRIEF]: `${HEADER}\n\nbody\n` }, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const out = String((await $.command.run(commandInput('T-4 --amend scope+=c/x.ts'))).text)
    expect(out).toContain('granted in')
    const granted = String(w.files.get(BRIEF))
    await $.turn.complete(turnInput('agent-4', 'Done, no report.'))
    const [spawnRow, amendRow, verdictRow] = ledgerRows(w)
    expect(spawnRow).toMatchObject({ event: 'spawn', task: 'T-4', attempt: 1 })
    expect(spawnRow?.briefHash).toBe(briefHash(`${HEADER}\n\nbody\n`))
    expect(amendRow?.kind).toBe('amend')
    expect(amendRow?.task).toBe('T-4')
    expect(amendRow?.attempt).toBe(1)
    expect(amendRow?.source).toBe('brain')
    expect(amendRow?.tokens).toBe('scope+=c/x.ts')
    expect(amendRow?.briefHash).toBe(briefHash(granted))
    expect(verdictRow?.verdict).toBeDefined()
    expect(verdictRow?.briefHash).toBe(amendRow?.briefHash)
    expect(verdictRow?.briefHash).not.toBe(spawnRow?.briefHash)
  })
})
