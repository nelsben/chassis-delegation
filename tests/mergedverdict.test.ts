import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-292 (#392): the verdict tool reads the branch before the ledger; a hand-back after a pause-cap charge is judged.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=cafe123 gate=pass files=a/x.ts]]'
const PAUSE = '[[pause v=1 task=T-4 reason=bench running in the background, back when it ends]]'
const OPTS = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const resultText = (r: { result?: unknown; text?: string }): string => (typeof r.result === 'string' ? r.result : r.text ?? '')
const MB = 'b'.repeat(40)
const HEAD = 'cafe123'.padEnd(40, '0')
const WT = `${ROOT}-T-4`

const merged = { on: false }
const repo = (argv: string[]): RunAnswer | undefined => {
  if (argv[0] === 'npx') return { exitCode: 0, stdout: '' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'worktree') return { exitCode: 0, stdout: `worktree ${WT}\nHEAD ${HEAD}\nbranch refs/heads/agent/frontend/T-4\n\n` }
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length).padEnd(40, '0')}\n` }
  if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : '1234abcd'.padEnd(40, '0')}\n` }
  if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${HEAD}\n` }
  if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' && !merged.on ? 1 : 0, stdout: '' }
  if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
  return undefined
}

describe('MOD-292: the verdict tool reads the branch before the ledger', () => {
  const setup = (on: never) => world(on, { files: { [BRIEF]: HEADER + '\nbody' }, dirs: { [WT]: [] }, run: repo, agentId: 'agent-4' })

  test('a pause-cap no-report row whose head is on main reads merged, with an accept row and no resume', { options: OPTS }, async ($, on) => {
    merged.on = false
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    for (let i = 1; i <= 3; i++) await $.turn.complete(turnInput('agent-4', `Still running (${i}).\n` + PAUSE, undefined, `turn-p${i}`))
    const before = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__verdict', task: 'T-4', waitSeconds: 0 } as never))
    expect(before).toContain('no-report')
    merged.on = true
    const after = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__verdict', task: 'T-4', waitSeconds: 0 } as never))
    expect(after).toContain('T-4: merged at cafe123')
    expect(after).not.toContain('resume')
    expect(after).not.toContain('agent-4')
    const ledger = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
    expect(ledger.filter(r => r.kind === 'accept' && r.how === 'merged')).toHaveLength(1)
  })

  test('a hand-back with a report after a pause-cap charge is judged on that attempt, not left no-report', { options: OPTS }, async ($, on) => {
    merged.on = false
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    for (let i = 1; i <= 3; i++) await $.turn.complete(turnInput('agent-4', `Still running (${i}).\n` + PAUSE, undefined, `turn-p${i}`))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT, undefined, 'turn-final'))
    const verdicts = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>).filter(r => typeof r.verdict === 'string' && r.attempt === 1)
    expect(verdicts.map(r => r.verdict)).toEqual(['no-report', 'consistent'])
  })
})
