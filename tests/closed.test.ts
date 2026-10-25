import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-136: a task already merged is closed. A late hand-back for it is recorded as closed, with no verify and no owed row.
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const BRANCH = 'agent/frontend/T-4'
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const WT = `${ROOT}-T-4`
const MB = 'b'.repeat(40)
const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
const fullSha = (sha: string) => sha.padEnd(40, '0')
const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const records = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[]
const posted = (w: { logs: string[]; debugLogs: string[]; appended: { type: string; text: string }[] }) => {
  const debug = new Set(w.debugLogs)
  return [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: '))].filter(t => !/^chassis-delegation: \S+ (started|resumed|started from queue|handed back) · /.test(t))
}

/** The worker's repo answered from memory; `gate` is the exit of the gate, `refs` the exit of a branch lookup (0 present, 1 absent). */
const repo = (o: { gate: () => number; refs?: () => number }) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate(), stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.startsWith('refs/')) {
      const code = (o.refs ?? (() => 0))()
      return { exitCode: code, stdout: code === 0 ? `${head}\n` : '' }
    }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = fullSha(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] === '--is-ancestor') return { exitCode: last === 'origin/main' ? 1 : 0, stdout: '' }
    if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
const files = () => ({ [BRIEF]: HEADER + '\nbody' })
const gateRuns = (w: { runs: { argv: string[] }[] }) => w.runs.filter(r => r.argv[0] === 'npx').length

describe('MOD-136: a task already merged is closed', () => {
  test('(1) attempt 1 accepted and retired as merged: a hand-back for attempt 2 gets the closed row, no gate run, no owed row', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs: { [WT]: [] }, run: repo({ gate: () => 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
    expect(records(w)[0]).toMatchObject({ attempt: 1, verdict: 'consistent' })
    w.store.set(`delegation.tasks.T-4@${ROOT}`, records(w).map(r => ({ ...r, retired: 'merged' })))
    const gates = gateRuns(w)
    const before = posted(w).length
    await $.turn.complete(turnInput('agent-4', 'Late fix.\n' + REPORT('2222222')))
    expect(gateRuns(w)).toBe(gates)
    expect(posted(w).slice(before)).toEqual(['chassis-delegation: T-4: hand-back after the task closed (merged); not verified, nothing owed'])
    expect(records(w).filter(r => r.attempt === 2 && r.verdict !== 'pending')).toEqual([])
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
  })

  test('(2) a hand-back whose worktree folder is gone and whose branch is missing gets the branch gone row', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), run: repo({ gate: () => 0, refs: () => 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
    expect(gateRuns(w)).toBe(0)
    expect(posted(w)).toEqual(['chassis-delegation: T-4: hand-back after the task closed (branch gone); not verified, nothing owed'])
    // the one attempt this hand-back opened is kept, marked unverified: no verdict, no budget spent
    expect(records(w).map(r => r.verdict)).toEqual(['unverified'])
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
  })

  test('(2b) a worktree folder that is gone with the branch still present is verified as before', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), run: repo({ gate: () => 0, refs: () => 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
    expect(posted(w).join('\n')).not.toContain('hand-back after the task closed')
    expect(records(w)[0]).toMatchObject({ attempt: 1, verdict: 'consistent' })
  })

  test('(3) an owed row written before the task retired is absent from the /delegation summary afterwards', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs: { [WT]: [] }, run: repo({ gate: () => 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
    await $.session.start(sessionStart)
    const recentKey = [...w.store.keys()].find(k => k.startsWith('delegation.recent')) as string
    expect(recentKey).toBeDefined()
    w.store.set(recentKey, [...((w.store.get(recentKey) ?? []) as object[]), { task: 'T-4', attempt: 1, verdict: 'work-present', line: 'x', at: Date.now(), owed: 'T-4: verify sha=abc' }])
    expect(String((await $.command.run(delegationCmd(''))).text)).toContain('owed: T-4: verify sha=abc')
    w.store.set(`delegation.tasks.T-4@${ROOT}`, records(w).map(r => ({ ...r, retired: 'merged' })))
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
    // the row itself is cleared, not only hidden
    const rows = (w.store.get(recentKey) ?? []) as { owed?: string }[]
    expect(rows.some(r => r.owed !== undefined && r.owed.startsWith('T-4'))).toBe(false)
  })

  test('(4) the normal path is unchanged: a refuted attempt resumed at a new sha is judged as attempt 2', { options: { ...GM } }, async ($, on) => {
    const gate = { v: 1 }
    const w = world(on, { files: files(), dirs: { [WT]: [] }, run: repo({ gate: () => gate.v }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111')))
    expect(records(w)[0]).toMatchObject({ attempt: 1, verdict: 'refuted' })
    gate.v = 0
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222')))
    expect(records(w).map(r => [r.attempt, r.verdict])).toEqual([[1, 'refuted'], [2, 'consistent']])
    expect(posted(w).join('\n')).not.toContain('hand-back after the task closed')
    expect(gateRuns(w)).toBeGreaterThanOrEqual(2)
  })
})
