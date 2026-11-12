// MOD-369: a hand-back on a failing gate lists its `tried:` rounds; the count reaches the row, the ledger and the verdict, and changes nothing else.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, ROOT, SCRATCH, type RunAnswer } from './harness'

const BRIEF = `${SCRATCH}/briefs/T-7.brief.md`
const HEADER = '[[brief v=1 task=T-7 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const MB = 'b'.repeat(40)
const full = (sha: string) => sha.padEnd(40, '0')
const run = () => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: '' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = full(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
const REPORT_FAIL = '[[report v=1 task=T-7 subtask=main branch=agent/frontend/T-7 pr=none sha=1234abcd gate=fail files=a/x.ts]]'
const REPORT_PASS = '[[report v=1 task=T-7 subtask=main branch=agent/frontend/T-7 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const OPTIONS = { verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}"}' } as never
const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
const recordOf = (w: { store: Map<string, unknown> }) => ((w.store.get(`delegation.tasks.T-7@${ROOT}`) ?? []) as Record<string, unknown>[])[0]!
const handBack = async (text: string, $: never, on: never) => {
  const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: run(), agentId: 'agent-7' })
  await ($ as any).agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
  await ($ as any).turn.complete(turnInput('agent-7', text))
  return w
}

describe('MOD-369: tried lines on a gate=fail hand-back reach the row, the ledger and the verdict', () => {
  test('two tried lines on gate=fail: tried 2 on the row and the ledger, the verdict line says so, the verdict and next are what a gate=fail hand-back gets today', { options: OPTIONS }, async ($, on) => {
    const w = await handBack(`tried: changed the sort -> still fails on the wrap\ntried: changed the wrap -> still fails on the tail\n${REPORT_FAIL}`, $ as never, on as never)
    expect(shown(w)).toContain('tried: 2 rounds before handing back')
    expect(shown(w)).toContain('verdict=unverified')
    expect(recordOf(w)).toMatchObject({ verdict: 'unverified', reportGate: 'fail', tried: 2 })
    expect(ledgerOf(w).at(-1)).toMatchObject({ verdict: 'unverified', tried: 2 })
    expect(String(ledgerOf(w).at(-1)?.next)).toContain('resume')
  })

  test('a passing hand-back with no tried line: no tried field on the row or the ledger, no tried line', { options: OPTIONS }, async ($, on) => {
    const w = await handBack(`Done.\n${REPORT_PASS}`, $ as never, on as never)
    expect(shown(w)).not.toContain('tried:')
    expect(recordOf(w)).not.toHaveProperty('tried')
    expect(ledgerOf(w).at(-1)).not.toHaveProperty('tried')
  })
})
