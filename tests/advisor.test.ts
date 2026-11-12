// MOD-365: a worker's advisor calls are read from its transcript at the verdict, their dollars added to the attempt.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, usage, ROOT, SCRATCH, HOME, type RunAnswer } from './harness'
import { workerTranscriptPath } from '../hooks/lib/advisor'

const MB = 'b'.repeat(40)
const fullSha = (sha: string) => sha.padEnd(40, '0')
const nativeRun = () => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
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
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}

describe('MOD-365: the advisor segment of a worker verdict', () => {
  const BRIEF = `${SCRATCH}/briefs/T-6.brief.md`
  const HEADER = '[[brief v=1 task=T-6 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier spend=20 budget=3-attempts report=chassis.report.v1]]'
  const REPORT = '[[report v=1 task=T-6 subtask=main branch=agent/frontend/T-6 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const OPTIONS = { verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}"}' } as never
  const TRANSCRIPT = workerTranscriptPath(HOME, ROOT, 'sess-1', 'agent-6')
  const advisorRow = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-11T04:32:21.704Z',
    message: { id: 'msg_01', model: 'claude-opus-5-5', content: [{ type: 'server_tool_use', id: 'srvtoolu_01', name: 'advisor', input: {} }], usage: { input_tokens: 12, output_tokens: 900, iterations: [{ type: 'message', input_tokens: 12, output_tokens: 300 }, { type: 'advisor_message', model: 'claude-fable-5-2', input_tokens: 88102, output_tokens: 7654, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }] } },
  })
  // the advisor: 88102 * 8 + 7654 * 40 per million = 0.704816 + 0.30616 = 1.0110 ; the worker: 500k in at $2 + 50k out at $10 = 1.50
  const ledgerRows = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  const rowOf = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].find(t => t.startsWith('chassis-delegation: verdict=')) ?? ''

  test('one advisor call: the row says so, the ledger row has advisor, and usd is the worker plus the advisor', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [TRANSCRIPT]: advisorRow + '\n' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', REPORT, usage('claude-sonnet-5-5', 500_000, 50_000)))
    const row = rowOf(w).split('\n')[0] ?? ''
    expect(row).toContain('usd=2.51')
    expect(row).toContain(' · advisor 1 call $1.01')
    const rec = ledgerRows(w).find(r => r.verdict === 'consistent')
    expect(rec).toMatchObject({ usd: 2.511, advisor: { calls: 1, usd: 1.011, in: 88102, out: 7654, models: ['claude-fable-5-2'] } })
  })

  test('no transcript file: the row and the ledger row are as before', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', REPORT, usage('claude-sonnet-5-5', 500_000, 50_000)))
    const row = rowOf(w).split('\n')[0] ?? ''
    expect(row).toContain('usd=1.50')
    expect(row).not.toContain('advisor')
    const rec = ledgerRows(w).find(r => r.verdict === 'consistent')
    expect(rec?.usd).toBe(1.5)
    expect(rec).not.toHaveProperty('advisor')
  })
})
