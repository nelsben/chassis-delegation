import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, brainSpawn, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-152 (#246): the worker's worktree is locked while the verifier judges it, so a plain
// `git worktree remove --force` cannot pull the directory away from the gate.
const DISPATCH = 'mcp__chassis-delegation__dispatch'
const WT = `${ROOT}-T-1`
const REASON = 'chassis-delegation: verifier running; land after the verdict'
const CARD_NAME = 'T-1-the-first-version.md'
const card = (repo = '') => ['---', 'id: T-1', 'title: The first version', 'domain: ops', 'tier: standard', 'status: queued', ...(repo ? [`repo: ${repo}`] : []), 'scope: [src/**, tests/**]', 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A thing.', ''].join('\n')
const BRIEFS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' }
const HEAD = 'abcdef1' + '2'.repeat(33)
const BRANCH = 'agent/ops/T-1'
const MB = 'b'.repeat(40)
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const report = `[[report v=1 task=T-1 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=src/a.ts]]`

const answers =
  (over: (argv: string[]) => RunAnswer | undefined = () => undefined) =>
  (argv: string[]): RunAnswer | undefined => {
    const o = over(argv)
    if (o) return o
    if (argv[0] === 'npm') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length)}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'A\tsrc/a.ts\n' : 'src/a.ts\n' }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }

const setup = (repo: string, over?: (argv: string[]) => RunAnswer | undefined) => ({
  files: { [`${ROOT}/agents/tasks/${CARD_NAME}`]: card(repo), [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ domains: ['ops'], gateMap: { test: 'npm test' } }) },
  dirs: { [`${ROOT}/agents/tasks`]: [CARD_NAME], [WT]: [] },
  run: answers(over),
  agentId: 'agent-4',
  store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
})

const verifyRuns = async ($: never, on: never, repo: string, over?: (argv: string[]) => RunAnswer | undefined) => {
  const w = world(on, setup(repo, over) as never)
  await ($ as any).session.start(sessionStart)
  const out = resultText(await ($ as any).tool.call({ tool: DISPATCH, task: 'T-1' } as never))
  await brainSpawn($ as any, out)
  await ($ as any).turn.complete(turnInput('agent-4', `Done.\n${report}`))
  return { w, argvs: w.runs.map(r => r.argv.join(' ')) }
}

const LOCK = `git -C ${ROOT} worktree lock --reason ${REASON} ${WT}`
const UNLOCK = `git -C ${ROOT} worktree unlock ${WT}`
const lockRuns = (argvs: string[]) => argvs.filter(a => / worktree (lock|unlock) /.test(a))

describe('MOD-152: the worktree is locked while the verifier runs', () => {
  test('a worktree hand-back: lock before the gate argv, unlock after it; the verdict still comes', { options: BRIEFS }, async ($, on) => {
    const { w, argvs } = await verifyRuns($ as never, on as never, '')
    expect(delivered(w)).toContain('verdict=consistent task=T-1')
    const lock = argvs.indexOf(LOCK)
    const gate = argvs.indexOf('npm test')
    const unlock = argvs.indexOf(UNLOCK)
    expect(lock).toBeGreaterThanOrEqual(0)
    expect(gate).toBeGreaterThan(lock)
    expect(unlock).toBeGreaterThan(gate)
    expect(lockRuns(argvs)).toEqual([LOCK, UNLOCK])
  })

  test('the gate failing to run still unlocks', { options: BRIEFS }, async ($, on) => {
    const { argvs } = await verifyRuns($ as never, on as never, '', argv => {
      if (argv[0] === 'npm') throw new Error('gate lost its directory')
      return undefined
    })
    expect(argvs).toContain('npm test')
    expect(lockRuns(argvs)).toEqual([LOCK, UNLOCK])
  })

  test('a lock that exits non-zero still gives the verdict and runs no unlock', { options: BRIEFS }, async ($, on) => {
    const { w, argvs } = await verifyRuns($ as never, on as never, '', argv => (argv.includes('lock') ? { exitCode: 128, stdout: '', stderr: 'already locked' } : undefined))
    expect(delivered(w)).toContain('verdict=consistent task=T-1')
    expect(lockRuns(argvs)).toEqual([LOCK])
  })

  test('repo=here runs no lock', { options: BRIEFS }, async ($, on) => {
    const { argvs } = await verifyRuns($ as never, on as never, 'here')
    expect(lockRuns(argvs)).toEqual([])
  })

  test('repo=none runs no lock', { options: BRIEFS }, async ($, on) => {
    const { argvs } = await verifyRuns($ as never, on as never, 'none')
    expect(lockRuns(argvs)).toEqual([])
  })
})
