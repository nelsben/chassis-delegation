import { test, expect, describe } from 'claude-code/testing'
import { world, turnInput, sessionStart, brainSpawn, ROOT, type RunAnswer } from './harness'

// MOD-117 (#185, #184): card ids restart in each repo, and the store is one per machine. Two repos that both have
// an OPS-4 each count their own attempts and each verdict reads the outside listing its own dispatch took.
const DISPATCH = 'mcp__chassis-delegation__dispatch'
const A = ROOT
const B = '/repo/second'
const NAME = 'OPS-4-the-fourth.md'
const card = (out: string) => ['---', 'id: OPS-4', 'title: The fourth', 'domain: ops', 'tier: standard', 'status: queued', `scope: [src/**, ${out}/**]`, 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'Both repos have one.', ''].join('\n')
const CONFIG = JSON.stringify({ domains: ['ops'], gateMap: { test: 'npm test' } })
const HEAD = 'abcdef1' + '2'.repeat(33)
const MB = 'b'.repeat(40)
const BRANCH = 'agent/ops/OPS-4'
const report = (out: string) => `[[report v=1 task=OPS-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=src/a.ts]]`
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

const run = (argv: string[]): RunAnswer | undefined => {
  if (argv[0] === 'npm') return { exitCode: 0, stdout: 'ok\n' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'fetch' || sub[0] === 'worktree') return { exitCode: 0, stdout: '' }
  if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length)}\n` }
  if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
  if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'A\tsrc/a.ts\n' : 'src/a.ts\n' }
  if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
  return undefined
}

const files = (): Record<string, string> => ({
  [`${A}/agents/tasks/${NAME}`]: card('/out/a'),
  [`${A}/.chassis-delegation.json`]: CONFIG,
  [`${B}/agents/tasks/${NAME}`]: card('/out/b'),
  [`${B}/.chassis-delegation.json`]: CONFIG,
  '/out/a/old.txt': 'a',
  '/out/b/old.txt': 'b',
})
const dirs = (): Record<string, string[]> => ({ [`${A}/agents/tasks`]: [NAME], [`${B}/agents/tasks`]: [NAME], [`${A}-OPS-4`]: [], [`${B}-OPS-4`]: [] })

describe('MOD-117: a card id reused in a second repo is that repo\'s own', () => {
  test('two roots, one store, one OPS-4 each: attempt 1/2 in both, and each verdict reads its own outside listing', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: files(), dirs: dirs(), run, trees: ['/out/a', '/out/b'], store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    // repo A dispatches its OPS-4; the worker is still out
    await $.session.start(sessionStart)
    await brainSpawn($, resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-4' } as never)))
    expect(w.notices.at(-1)).toContain('attempt 1/2')
    // a session in repo B dispatches B's OPS-4 against the same store
    w.root = B
    await $.session.start({ ...sessionStart, cwd: B } as never)
    await brainSpawn($, resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-4' } as never)), { tool_use_id: 'toolu_second' })
    expect(w.spawns).toHaveLength(2)
    expect(w.notices.at(-1)).toContain('attempt 1/2')
    // B's worker wrote under B's outside folder and hands back: judged against B's listing, its row posted
    w.files.set('/out/b/new.txt', 'b2')
    let before = w.appended.length
    await $.turn.complete(turnInput('agent-2', `Done.\n${report('/out/b')}`))
    const rowB = w.appended.slice(before).map(a => a.text).join('\n')
    expect(rowB).toContain('verdict=consistent task=OPS-4 attempt=1/2')
    expect(rowB).toContain('outside delta: 1 changed path under /out/b')
    expect(rowB).not.toContain('/out/a')
    // back in repo A, A's worker hands back: judged against the listing A's dispatch took, its own row posted
    w.root = A
    await $.session.start(sessionStart)
    w.files.set('/out/a/new.txt', 'a2')
    before = w.appended.length
    await $.turn.complete(turnInput('agent-1', `Done.\n${report('/out/a')}`))
    const rowA = w.appended.slice(before).map(a => a.text).join('\n')
    expect(rowA).toContain('verdict=consistent task=OPS-4 attempt=1/2')
    expect(rowA).toContain('outside delta: 1 changed path under /out/a')
    expect(rowA).not.toContain('/out/b')
    // each repo's records and listing sit under its own key; nothing is left under the bare id
    expect((w.store.get(`delegation.tasks.OPS-4@${A}`) as unknown[]).length).toBe(1)
    expect((w.store.get(`delegation.tasks.OPS-4@${B}`) as unknown[]).length).toBe(1)
    expect(w.store.has('delegation.tasks.OPS-4')).toBe(false)
    expect(w.store.has(`delegation.outside.OPS-4@${A}`)).toBe(true)
    expect(w.store.has(`delegation.outside.OPS-4@${B}`)).toBe(true)
  })

  test('a store that already holds attempts for OPS-4 from another root: this repo\'s first dispatch is attempt 1/2', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const other = { task: 'OPS-4', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: 1, verdictAt: 2, root: B, sessionId: 'sess-0', agentId: 'agent-b', toolUseId: 'toolu_b' }
    const w = world(on, { files: files(), dirs: dirs(), run, trees: ['/out/a', '/out/b'], store: { 'delegation.agentTypes': ['general-purpose', 'ops'], 'delegation.tasks.OPS-4': [other] } })
    await $.session.start(sessionStart)
    await brainSpawn($, resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-4' } as never)))
    expect(w.notices.at(-1)).toContain('attempt 1/2')
    expect(w.store.get(`delegation.tasks.OPS-4@${B}`)).toEqual([other])
  })
})
