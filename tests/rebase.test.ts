import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, ROOT, SCRATCH, type RunAnswer } from './harness'
import { VERDICT_TOOL_NAME } from '../hooks/lib/verdicttool'

// MOD-291: a rebase of a judged task's branch is not an attempt: the verdict tool reports the last verdict at the new sha
// (`rebased to <sha>`), and a head with new commits on another tree is `unverified work`, charged to nobody.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const JUDGED = '1234abcd' + '0'.repeat(32)
const MOVED = 'abc1234' + '1'.repeat(33)
const TREE = 'aaaa1111'.repeat(5)
const OTHER = 'ffff0000'.repeat(5)
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const call = ($: any, input: Record<string, unknown>) => $.tool.call({ tool: VERDICT_TOOL_NAME, ...input } as never)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

/** The worker's git answered from `state`: HEAD moves, its tree and the judged sha's tree say whether it is a rebase. */
const state = { head: JUDGED, headTree: TREE, judgedTree: TREE, changed: ['a/x.ts', 'b/y.ts'] }
const git = async (argv: string[]): Promise<RunAnswer | undefined> => {
  if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
  if (argv[0] === 'npx') return { exitCode: 0, stdout: '' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'rev-parse' && last === 'HEAD') return { exitCode: 0, stdout: `${state.head}\n` }
  if (sub[0] === 'rev-parse' && last.endsWith('^{tree}')) return { exitCode: 0, stdout: `${last === 'HEAD^{tree}' || last.startsWith(state.head.slice(0, 7)) ? state.headTree : state.judgedTree}\n` }
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length).padEnd(40, '0')}\n` }
  if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${sub.includes('origin/main') ? 'b'.repeat(40) : state.head}\n` }
  if (sub[0] === 'diff' && sub.includes('--name-only')) return { exitCode: 0, stdout: state.changed.map(f => `${f}\n`).join('') }
  if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
  if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: sub.includes('origin/main') ? 1 : 0, stdout: '' }
  if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${'b'.repeat(40)}\n` }
  return undefined
}
const setup = (on: any) => {
  state.head = JUDGED
  state.headTree = TREE
  state.judgedTree = TREE
  state.changed = ['a/x.ts', 'b/y.ts']
  // the worker's worktree is the sibling checkout (an existing folder): its git is what `git` above answers
  return world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}-T-4`]: '' }, run: git, agentId: 'agent-4' })
}

describe('MOD-291: a moved head after a consistent verdict', () => {
  test('a rebase (same tree, new sha): the verdict says rebased, and the attempt count does not move', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    const before = w.appended.length
    state.head = MOVED
    const text = resultText(await call($, { task: 'T-4' }))
    expect(text).toContain('T-4 attempt 1/3 consistent')
    expect(text).toContain('rebased to abc1234')
    expect(text).not.toContain('work present')
    expect(text).not.toContain('attempt 2/3')
    expect(w.appended.length).toBe(before)
  })

  test('new commits on another tree: unverified work is named, dispatch verify= names the head, and no attempt is charged', { options: { ...GM } }, async ($, on) => {
    const w = setup(on)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    state.head = MOVED
    state.headTree = OTHER
    const text = resultText(await call($, { task: 'T-4' }))
    expect(text).toContain('unverified work since 1234abc: 2 files (a/x.ts, b/y.ts) · dispatch verify=abc1234')
    expect(text).not.toContain('rebased to')
    expect(text).not.toContain('attempt 2/3')
    expect(w.spawns.length).toBe(1)
  })
})
