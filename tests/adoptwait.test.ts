import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, ROOT, type RunAnswer } from './harness'

// MOD-148 (#222): a briefless spawn whose report names task= is adopted onto the task's brief; its attempt is on
// record, pending, before the verify runs, so the verdict tool called in the hand-back turn waits for the row.
const MB = 'b'.repeat(40)
const BRIEF = `${ROOT}/.delegation/briefs/T-9.brief.md`
const HEADER = '[[brief v=1 task=T-9 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-9 subtask=main branch=agent/frontend/T-9 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}', verdictVerbosity: 'full' }
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const records = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-9@${ROOT}`) ?? []) as Record<string, unknown>[]

/** A repo answered from memory; the gate (npx) waits on a promise the test releases. */
const setup = (on: any) => {
  let release: () => void = () => undefined
  const held = new Promise<void>(r => (release = r))
  const slot: { sleep: (ms: number) => Promise<void> } = { sleep: async () => undefined }
  let head = ''
  const run = async (argv: string[]): Promise<RunAnswer | undefined> => {
    if (argv[0] === 'sleep') {
      await slot.sleep(Number(argv[1]) * 1000)
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] === 'npx') {
      await held
      return { exitCode: 0, stdout: '' }
    }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = last.slice(0, -'^{commit}'.length).padEnd(40, '0')
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
  const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run, agentId: 'agent-9', classify: 'standard' })
  slot.sleep = ms => w.clock.sleep(ms)
  return { w, release }
}
const call = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: 'mcp__chassis-delegation__verdict', ...input } as never)

describe('MOD-148: the verdict tool waits for an adopted hand-back', () => {
  test('called while the gate of an adopted spawn is held, it waits and returns the T-9 attempt 1 row; one record', { options: GM }, async ($, on) => {
    const { w, release } = setup(on)
    await $.agent.spawn(spawnInput({ prompt: 'Fix the date test.' }))
    const done = $.turn.complete(turnInput('agent-9', 'Done.\n' + REPORT))
    await w.clock.advance(10)
    const waiting = call($, { task: 'T-9' })
    let settled = false
    void waiting.then(() => (settled = true))
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    expect(settled).toBe(false)
    release()
    for (let i = 0; i < 2; i++) await w.clock.advance(5000)
    await done
    const text = resultText(await waiting)
    expect(text).toContain('verdict=consistent task=T-9 attempt=1/3')
    expect(text).not.toContain('no attempt recorded')
    const recs = records(w).filter(r => r.attempt === 1)
    expect(recs).toHaveLength(1)
    expect(recs[0]).toMatchObject({ verdict: 'consistent' })
  })

  test('an unknown id with no verify in flight still answers at once', { options: GM }, async ($, on) => {
    setup(on)
    expect(resultText(await call($, { task: 'T-77' }))).toContain('T-77: no attempt recorded')
  })
})
