// GH-2 (GH-2): a hand-back read from the worker's own transcript. Pure.
import { test, expect, describe } from 'claude-code/testing'
import { handbackMessages, workerSaid } from '../hooks/lib/handback'
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
