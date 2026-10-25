import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, ROOT, type RunAnswer } from './harness'

// MOD-135 (#222): the verifier finds a brief the mod did not write into the prompt: a relative path the spawn prompt
// names, or the brief at <root>/.delegation/briefs/<task>.brief.md that a hand-back's report task= points at.
const NO_BRIEF = 'no brief: no scope=/gate=/red_test= to check against'
const MB = 'b'.repeat(40)
const fullSha = (sha: string) => sha.padEnd(40, '0')
const nativeRun = (o: { gate?: number; delta?: string } = {}) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = fullSha(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: o.delta ?? 'A\ta/x.ts\n' }
    return undefined
  }
}
const header = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]`
const report = (task: string, files = 'a/x.ts') => `[[report v=1 task=${task} subtask=main branch=agent/frontend/${task} pr=none sha=1234abcd gate=pass files=${files}]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}', verdictVerbosity: 'full' }
const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
  [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task}@${ROOT}`) ?? []) as Record<string, unknown>[]
const T1 = `${ROOT}/.delegation/briefs/T-1.brief.md`
const T2 = `${ROOT}/.delegation/briefs/T-2.brief.md`
const prompt = (p: string) => `Your brief is ${p}. Read it whole, then follow it exactly.`

describe('MOD-135: the brief a relative path in the prompt names', () => {
  test('a relative brief path in the spawn prompt is verified against that brief (consistent)', { options: GM }, async ($, on) => {
    const w = world(on, { files: { [T1]: header('T-1') + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-1' })
    await $.agent.spawn(spawnInput({ prompt: prompt('.delegation/briefs/T-1.brief.md') }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + report('T-1')))
    const row = rows(w)[0] ?? ''
    expect(row).toContain('verdict=consistent task=T-1 attempt=1/3')
    expect(row).not.toContain(NO_BRIEF)
    expect(records(w, 'T-1')[0]).toMatchObject({ verdict: 'consistent', briefPath: T1 })
  })

  test('a file out of the named brief scope is refuted on scope', { options: GM }, async ($, on) => {
    const w = world(on, { files: { [T1]: header('T-1') + '\nbody' }, run: nativeRun({ gate: 0, delta: 'A\tc/y.ts\n' }), agentId: 'agent-1' })
    await $.agent.spawn(spawnInput({ prompt: prompt('./.delegation/briefs/T-1.brief.md') }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + report('T-1', 'c/y.ts')))
    const row = rows(w)[0] ?? ''
    expect(row).toContain('verdict=refuted task=T-1')
    expect(row).toContain('claim scope: failed')
  })

  test('a spawn naming no brief, handing back task=T-2 with its brief in the root, is verified against it', { options: GM }, async ($, on) => {
    const w = world(on, { files: { [T2]: header('T-2') + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-2', classify: 'standard' })
    await $.agent.spawn(spawnInput({ prompt: 'Fix the date test.' }))
    await $.turn.complete(turnInput('agent-2', 'Done.\n' + report('T-2')))
    const row = rows(w)[0] ?? ''
    expect(row).toContain('verdict=consistent task=T-2 attempt=1/3')
    expect(row).not.toContain(NO_BRIEF)
    expect(records(w, 'T-2')[0]).toMatchObject({ verdict: 'consistent', briefPath: T2 })
  })

  test('with no brief file the verdict keeps the no-brief reason', { options: GM }, async ($, on) => {
    const w = world(on, { run: nativeRun({ gate: 0 }), agentId: 'agent-2', classify: 'standard' })
    await $.agent.spawn(spawnInput({ prompt: 'Fix the date test.' }))
    await $.turn.complete(turnInput('agent-2', 'Done.\n' + report('T-2')))
    expect(rows(w)[0]).toContain(`claim scope: unchecked — ${NO_BRIEF}`)
  })

  test('a named relative brief that is missing still records the no-brief note', { options: GM }, async ($, on) => {
    const w = world(on, { run: nativeRun({ gate: 0 }), agentId: 'agent-1' })
    await $.agent.spawn(spawnInput({ prompt: prompt('.delegation/briefs/T-1.brief.md') }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + report('T-9')))
    expect(rows(w)[0] ?? '').not.toContain('verdict=consistent')
  })

  test('a ../ relative path is not read', { options: GM }, async ($, on) => {
    const w = world(on, { files: { '/repo/T-1.brief.md': header('T-1') + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-1', classify: 'standard' })
    await $.agent.spawn(spawnInput({ prompt: prompt('../T-1.brief.md') }))
    await $.turn.complete(turnInput('agent-1', 'Done.\n' + report('T-1')))
    expect(records(w, 'T-1')[0]?.briefPath).toBeUndefined()
    expect(rows(w)[0] ?? '').not.toContain('verdict=consistent')
  })
})
