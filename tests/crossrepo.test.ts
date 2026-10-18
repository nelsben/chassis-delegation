import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, brainSpawn, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-97 (#155, #163, #164): a card dispatched into another local repo is counted, resumed and verified as a local one is.
// Two repos, one store: A is the session's (ROOT), B is /other, and both know a task T-1.
const DISPATCH = 'mcp__chassis-delegation__dispatch'
const VERDICT = 'mcp__chassis-delegation__verdict'
const OTHER = '/other'
const WT = `${OTHER}-T-1`
const CARDS = `${ROOT}/.delegation/cards/other`
const CARD_NAME = 'T-1-the-first-version.md'
const CARD = ['---', 'id: T-1', 'title: The first version', 'domain: ops', 'tier: standard', 'status: queued', `repo: ${OTHER}`, 'scope: [src/**, tests/**]', 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A sibling repo.', ''].join('\n')
const BRIEFS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' }
const BRIEF = `${SCRATCH}/briefs/T-1.brief.md`
const HEAD = 'abcdef1' + '2'.repeat(33)
const HEAD2 = 'fedcba9' + '3'.repeat(33)
const A_SHA = 'c'.repeat(40)
const BRANCH = 'agent/ops/T-1'
const MB = 'b'.repeat(40)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
/** Every attempt record of T-1, whatever key it is under. */
const allOf = (w: { store: Map<string, unknown> }) => [...w.store.entries()].filter(([k]) => k === 'delegation.tasks.T-1' || k.startsWith('delegation.tasks.T-1@')).flatMap(([, v]) => v as Record<string, unknown>[])

/** A's own T-1: attempt 1 judged consistent at a sha of A, from an earlier session of this repo. */
const A_RECORD = { task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', sha: A_SHA, at: 1, verdictAt: 2, root: ROOT, sessionId: 'sess-0', agentId: 'agent-a', toolUseId: 'toolu_a' }

// B's repo answered from memory: a branch of /other, a delta of src/a.ts (plus `extra`), the gate green
const otherRun =
  (extra: string[] = [], tree = { head: HEAD }) =>
  (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npm') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'fetch' || sub[0] === 'worktree') return { exitCode: 0, stdout: '' }
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length)}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${tree.head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') {
      const paths = ['src/a.ts', ...extra]
      return { exitCode: 0, stdout: sub.includes('--name-status') ? paths.map(p => `A\t${p}\n`).join('') : paths.map(p => `${p}\n`).join('') }
    }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }

const files = (): Record<string, string> => ({ [`${OTHER}/package.json`]: '{"scripts":{"test":"node --test"}}', [`${CARDS}/${CARD_NAME}`]: CARD })
const dirs = (): Record<string, string[]> => ({ [OTHER]: ['package.json'], [`${OTHER}/.git`]: [], [`${ROOT}/agents/tasks`]: ['README.md'], [CARDS]: [CARD_NAME], [WT]: [] })
const report = (sha: string, more = '') => `[[report v=1 task=T-1 subtask=main branch=${BRANCH} pr=none sha=${sha} gate=pass red=none files=src/a.ts${more}]]`

describe('MOD-97: a card for another repo counts, resumes and verifies as a local one does', () => {
  test('#163: the same id in two repos counts one attempt each; the B dispatch is attempt 1/2 and its verdict names B\'s sha', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: files(), dirs: dirs(), run: otherRun(), agentId: 'agent-4', store: { 'delegation.agentTypes': ['general-purpose', 'ops'], 'delegation.tasks.T-1': [A_RECORD] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    await brainSpawn($, out)
    expect(w.spawns).toHaveLength(1)
    expect(w.notices.at(-1)).toContain('attempt 1/2')
    await $.turn.complete(turnInput('agent-4', `Done.\n${report(HEAD)}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    expect(row).toContain(HEAD.slice(0, 9))
    expect(row).not.toContain(A_SHA.slice(0, 9))
    // the verdict tool, asked by id, answers B's attempt
    const asked = resultText(await $.tool.call({ tool: VERDICT, task: 'T-1', waitSeconds: 0 } as never))
    expect(asked).toContain('verdict=consistent task=T-1 attempt=1/2')
    expect(asked).toContain(HEAD.slice(0, 9))
    // A's record stands as it was; B's is its own attempt 1, rooted in B, at B's sha
    const all = allOf(w)
    expect(all.filter(r => r.root === ROOT)).toEqual([A_RECORD])
    const b = all.filter(r => r.root === OTHER)
    expect(b.map(r => [r.attempt, r.verdict, r.sha])).toEqual([[1, 'consistent', HEAD]])
  })

  test('#155: a resumed cross-repo worker is verified against the brief its dispatch wrote: the second verdict is consistent with scope checked', { options: BRIEFS }, async ($, on) => {
    const tree = { head: HEAD }
    const w = world(on, { files: files(), dirs: dirs(), run: otherRun([], tree), skip: ['agent.spawn'], store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    // the engine answers every Agent call with the same worker: a resume of agent-4 is raised as a spawn of agent-4
    on('agent.spawn' as never, ((_$: unknown, e: Record<string, unknown>) => {
      w.spawns.push({ ...e })
      return { model: 'claude-sonnet-5-5', agentId: 'agent-4' }
    }) as never)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    await brainSpawn($, out)
    await $.turn.complete(turnInput('agent-4', `Done.\n${report(HEAD)}`))
    expect(delivered(w)).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    // the brain sends the worker back (the first pass missed a case); the engine resumes it
    await $.session.send({ to: 'agent-4', text: 'The first pass missed a case: handle an empty list too, then report again.', origin: { kind: 'model' } } as never)
    await $.agent.spawn(spawnInput({ tool_use_id: 'toolu_resume1', prompt: 'The first pass missed a case: handle an empty list too, then report again.', description: 'T-1 resume', subagentType: 'ops' }))
    const before = w.appended.length
    tree.head = HEAD2
    await $.turn.complete(turnInput('agent-4', `Fixed.\n${report(HEAD2)}`))
    const second = w.appended.slice(before).map(a => a.text).join('\n')
    expect(second).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=2/2')
    expect(second).not.toContain('no brief')
    expect(second).toContain('claim scope: held')
    // the gate re-ran in B's worktree
    expect(w.runs.filter(r => r.argv[0] === 'npm').map(r => r.cwd)).toEqual([WT, WT])
    expect(w.files.has(BRIEF)).toBe(true)
  })

  test('#155: a resumed worker of the session repo is verified against its brief too: attempt 2/2, scope checked, the budget the brief\'s', { options: BRIEFS }, async ($, on) => {
    const tree = { head: HEAD }
    const LOCAL = CARD.replace(`repo: ${OTHER}\n`, '')
    const localFiles = { [`${ROOT}/agents/tasks/${CARD_NAME}`]: LOCAL, [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ domains: ['ops'], gateMap: { test: 'npm test' } }) }
    const w = world(on, { files: localFiles, dirs: { [`${ROOT}/agents/tasks`]: [CARD_NAME], [`${ROOT}-T-1`]: [] }, run: otherRun([], tree), skip: ['agent.spawn'], store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    on('agent.spawn' as never, ((_$: unknown, e: Record<string, unknown>) => {
      w.spawns.push({ ...e })
      return { model: 'claude-sonnet-5-5', agentId: 'agent-4' }
    }) as never)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1' } as never))
    await brainSpawn($, out)
    await $.turn.complete(turnInput('agent-4', `Done.\n${report(HEAD)}`))
    expect(delivered(w)).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    await $.session.send({ to: 'agent-4', text: 'Handle an empty list too, then report again.', origin: { kind: 'model' } } as never)
    await $.agent.spawn(spawnInput({ tool_use_id: 'toolu_resume2', prompt: 'Handle an empty list too, then report again.', description: 'T-1 resume', subagentType: 'ops' }))
    const before = w.appended.length
    tree.head = HEAD2
    await $.turn.complete(turnInput('agent-4', `Fixed.\n${report(HEAD2)}`))
    const second = w.appended.slice(before).map(a => a.text).join('\n')
    expect(second).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=2/2')
    expect(second).not.toContain('no brief')
    expect(second).not.toContain('/3')
    expect(second).toContain('claim scope: held')
    expect(w.runs.filter(r => r.argv[0] === 'npm').map(r => r.cwd)).toEqual([`${ROOT}-T-1`, `${ROOT}-T-1`])
  })

  test('#164: in-scope work in B is consistent, though A left a listing of its own outside folder under the same id', { options: BRIEFS }, async ($, on) => {
    // A's T-1 named an absolute output folder it could not list; that listing is in the shared store under the bare id
    const stale = { at: 1, briefPath: BRIEF, roots: [{ root: '/s/a-out', error: 'EACCES: permission denied' }] }
    const w = world(on, { files: files(), dirs: dirs(), run: otherRun(), agentId: 'agent-4', store: { 'delegation.agentTypes': ['general-purpose', 'ops'], 'delegation.outside.T-1': stale } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    await brainSpawn($, out)
    await $.turn.complete(turnInput('agent-4', `Done.\n${report(HEAD)}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    expect(row).not.toContain('/s/a-out')
    expect(row).not.toContain('outside delta')
    expect(row).toContain('claim scope: held')
  })

  test('#164: a real out-of-scope file inside B is still refuted on scope', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: files(), dirs: dirs(), run: otherRun(['docs/notes.md']), agentId: 'agent-4', store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    await brainSpawn($, out)
    await $.turn.complete(turnInput('agent-4', `Done.\n${report(HEAD, ',docs/notes.md')}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=refuted task=T-1 attempt=1/2')
    expect(row).toContain('out-of-scope path: docs/notes.md')
  })
})
