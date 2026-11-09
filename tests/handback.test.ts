// GH-2 (GH-2): a hand-back read from the worker's own transcript. Pure.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { handbackMessages, workerSaid } from '../hooks/lib/handback'
import { world, spawnInput, turnInput, ROOT, SCRATCH, type RunAnswer } from './harness'
import { extractReport } from '../hooks/lib/brief'

const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/x/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const prompt = (text: string) => ({ role: 'user', text, toolUses: [] })
const results = () => ({ role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_1', text: 'ok', isError: false }] })
const said = (text: string, ...uses: unknown[]) => ({ role: 'assistant', text, toolUses: uses })
const handback = (message: unknown, extra: Record<string, unknown> = {}) => ({ tool_use_id: 'toolu_hb', tool: 'SubagentHandback', input: { message }, ...extra })

describe('GH-2: handbackMessages', () => {
  test('reads the SubagentHandback message of the run the transcript ends on; other tools are not hand-backs', () => {
    const rows = [prompt('brief'), said('Reading.', { tool: 'Read', input: { file_path: '/b' } }), results(), said('Handed back.', handback('Done.\n' + REPORT('1234abcd')))]
    expect(handbackMessages(rows)).toEqual(['Done.\n' + REPORT('1234abcd')])
  })

  test('a resume opens a new run: the hand-back of the run before is not read again', () => {
    const before = [prompt('brief'), said('', handback(REPORT('1234abcd')))]
    expect(handbackMessages([...before, prompt('fix the gate'), said('Still on it.')])).toEqual([])
    expect(handbackMessages([...before, prompt('fix the gate'), said('', handback(REPORT('5678abcd')))])).toEqual([REPORT('5678abcd')])
  })

  test('tool results do not open a run; an errored call (refused, withheld), an empty or non-string message is left out', () => {
    const rows = [
      prompt('brief'),
      said('', handback(REPORT('1111aaaa'), { isError: true, text: 'withheld' })),
      results(),
      said('', handback(42), handback('  ')),
      results(),
      said('', handback(REPORT('2222bbbb'))),
    ]
    expect(handbackMessages(rows)).toEqual([REPORT('2222bbbb')])
  })

  test('no rows, or rows with no tool uses: none', () => {
    expect(handbackMessages([])).toEqual([])
    expect(handbackMessages([prompt('brief'), { role: 'assistant', text: 'hi' }])).toEqual([])
  })
})

describe('GH-2: workerSaid', () => {
  test('the answer, then each hand-back; the last report wins', () => {
    const text = workerSaid('First try: ' + REPORT('1234abcd'), ['Fixed.\n' + REPORT('5678abcd')])
    expect(text).toBe('First try: ' + REPORT('1234abcd') + '\nFixed.\n' + REPORT('5678abcd'))
    expect(extractReport(text)).toBe(REPORT('5678abcd'))
  })

  test('a short answer and a hand-back carrying the report: the report is found', () => {
    expect(extractReport(workerSaid('Handed back.', [REPORT('1234abcd')]))).toBe(REPORT('1234abcd'))
  })

  test('one hand-back seen twice (a tool.call hook and the transcript) is kept once; empty parts drop', () => {
    expect(workerSaid('', [REPORT('1234abcd'), REPORT('1234abcd')])).toBe(REPORT('1234abcd'))
    expect(workerSaid('ok', [])).toBe('ok')
  })
})

describe('MOD-338: choice lines in a briefed hand-back are counted on the record, the ledger row and the verdict', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
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
  const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const OPTIONS = { verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}"}' } as never
  const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
  const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  const recordOf = (w: { store: Map<string, unknown> }) => ((w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[])[0]!
  const handBack = async (text: string, $: never, on: never) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: run(), agentId: 'agent-4' })
    await ($ as any).agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await ($ as any).turn.complete(turnInput('agent-4', text))
    return w
  }

  test('two choice lines: the verdict line, the record count and the ledger lines; the verdict is the same', { options: OPTIONS }, async ($, on) => {
    const w = await handBack(`choice: helper name -> rollUp\nchoice: bar width -> 8 cells\n${REPORT}`, $ as never, on as never)
    expect(shown(w)).toContain('choices: 2 the card left open')
    expect(shown(w)).toContain('verdict=consistent')
    expect(recordOf(w)).toMatchObject({ verdict: 'consistent', choices: 2 })
    expect(recordOf(w)).not.toHaveProperty('choiceLines')
    expect(ledgerOf(w).at(-1)).toMatchObject({ verdict: 'consistent', choices: 2, choiceLines: ['helper name -> rollUp', 'bar width -> 8 cells'] })
  })

  test('choice: none: choices 0, no lines in the ledger', { options: OPTIONS }, async ($, on) => {
    const w = await handBack(`choice: none\n${REPORT}`, $ as never, on as never)
    expect(shown(w)).toContain('choices: none stated')
    expect(shown(w)).toContain('verdict=consistent')
    expect(recordOf(w)).toMatchObject({ choices: 0 })
    expect(ledgerOf(w).at(-1)).toMatchObject({ verdict: 'consistent', choices: 0 })
    expect(ledgerOf(w).at(-1)).not.toHaveProperty('choiceLines')
  })

  test('neither: no choices key and no choices line', { options: OPTIONS }, async ($, on) => {
    const w = await handBack(`Done.\n${REPORT}`, $ as never, on as never)
    expect(shown(w)).not.toContain('choices:')
    expect(shown(w)).toContain('verdict=consistent')
    expect(recordOf(w)).not.toHaveProperty('choices')
    expect(ledgerOf(w).at(-1)).not.toHaveProperty('choices')
  })
})
