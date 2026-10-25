import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, ROOT, type RunAnswer } from './harness'

// MOD-150 (follow-up to #222): a refuted hand-back whose branch commits are already on the base (cherry-picked or merged)
// is not resumed; the row's next says the work is on the base.
const MB = 'b'.repeat(40)
const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const CARD_NAME = 'T-4-the-thing.md'
const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card.\n'
const WT = `${ROOT}-T-4`
const BRANCH = 'agent/frontend/T-4'
const HEAD = 'abcdef1' + '2'.repeat(33)
const SHORT = HEAD.slice(0, 7)
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
const CLAUSE = 'the work is already on origin/main (cherry-picked or merged); nothing to resume'
const REPORT = `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${SHORT} gate=pass files=a/x.ts]]`

/** The worker's worktree from memory; the gate is red. `onBase`: the patch-aware log lists nothing; `fail`: that log is refused. */
const worker = (o: { onBase?: boolean; fail?: boolean; own?: boolean; ff?: boolean } = {}) => (argv: string[]): RunAnswer | undefined => {
  if (argv[0] === 'npx') return { exitCode: 1, stdout: 'a/x.ts: not formatted\n' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
  if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
  if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: o.ff && last === 'origin/main' ? 0 : 1, stdout: '' }
  if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
  if (sub[0] === 'log' && sub.includes('--cherry-pick')) {
    if (o.fail) return { exitCode: 128, stdout: '' }
    return { exitCode: 0, stdout: o.onBase ? '' : `${'3'.repeat(40)}\n` }
  }
  if (sub[0] === 'log' && sub.some(a => a.startsWith('--since'))) return { exitCode: 0, stdout: o.own === false ? '' : `${HEAD}\n` }
  if (sub[0] === 'log') return { exitCode: 0, stdout: `${'3'.repeat(40)}\n` }
  if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
  return undefined
}
const files = () => ({ [BRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD })
const dirs = { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] }
const rowOf = (w: { logs: string[]; debugLogs: string[]; appended: { type: string; text: string }[] }) => {
  const debug = new Set(w.debugLogs)
  return [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: '))].filter(t => t.includes('verdict='))[0] ?? ''
}
const recs = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[]

const run = async ($: any, on: any, o: Parameters<typeof worker>[0]) => {
  const w = world(on, { files: files(), dirs, run: worker(o), agentId: 'agent-4' })
  await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
  await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
  return w
}

describe('MOD-150: a refuted verdict with the work already on the base', () => {
  test('(1) a commit cherry-picked onto origin/main: next=none with the clause, nothing resumed', { options: { autoEscalate: true, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await run($, on, { onBase: true })
    const row = rowOf(w)
    expect(row).toContain('verdict=refuted task=T-4 attempt=1/3')
    expect(row).toContain(`next=none — ${CLAUSE}`)
    expect(row).not.toContain('next=resume')
    expect(w.sent).toHaveLength(0)
    expect(w.spawns).toHaveLength(1)
    expect(recs(w).map(r => r.verdict)).toEqual(['refuted'])
  })

  test('(2) the commit not on the base: next=resume as today', { options: { autoEscalate: true, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await run($, on, { onBase: false })
    expect(rowOf(w)).not.toContain(CLAUSE)
    expect(w.sent).toHaveLength(1)
  })

  test('(2) the log refused or failing: fail-open, resume as today', { options: { autoEscalate: true, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await run($, on, { onBase: true, fail: true })
    expect(rowOf(w)).not.toContain(CLAUSE)
    expect(w.sent).toHaveLength(1)
  })

  test('(3) a merged (fast-forward) commit also gives the clause', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await run($, on, { onBase: true, ff: true })
    expect(rowOf(w)).toContain(`next=none — ${CLAUSE}`)
  })

  test('(3) a branch with no commit of its own (a no-work hand-back) is not on the base: resumed as today', { options: { autoEscalate: true, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await run($, on, { onBase: true, ff: true, own: false })
    expect(rowOf(w)).not.toContain(CLAUSE)
    expect(w.sent).toHaveLength(1)
  })
})
