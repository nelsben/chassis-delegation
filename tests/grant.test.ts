import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, commandInput, ROOT } from './harness'

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
