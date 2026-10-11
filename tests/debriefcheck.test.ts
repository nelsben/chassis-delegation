import { test, expect, describe } from 'claude-code/testing'
import { windowOf, windowAsk, checkDebrief, splitFindings, quoteEvidenced, userMessagesFromJsonl, userMessagesOf, transcriptPath, MOD_SURFACES } from '../hooks/lib/debriefcheck'
import { debriefPrompt, builtInDebriefPrompt, MOD_FINDINGS_ASK } from '../hooks/lib/cleanstop'

const crumb = (ts: string, kind: string): string => JSON.stringify({ ts, kind, detail: {} })
// 6 lines; with a watermark of 2 the window is lines 3-6
const CRUMBS = [
  crumb('2026-10-08T09:00:00Z', 'session_start'),
  crumb('2026-10-08T09:05:00Z', 'permission_prompt'),
  crumb('2026-10-10T10:00:00Z', 'correction'),
  crumb('2026-10-10T10:05:00Z', 'tool_failure'),
  crumb('2026-10-10T10:10:00Z', 'permission_prompt'),
  crumb('2026-10-10T10:20:00Z', 'session_end'),
].join('\n') + '\n'
const W = windowOf(CRUMBS, 2)!

describe('MOD-10: the window', () => {
  test('windowOf is (watermark, end]: the first and last timestamps, lines and kinds', () => {
    expect(W).toMatchObject({ watermark: 2, end: 6, firstLine: 3, lastLine: 6, firstTs: '2026-10-10T10:00:00Z', lastTs: '2026-10-10T10:20:00Z' })
    expect(W.kinds).toContain('correction')
    expect(windowOf(CRUMBS, 6)).toBeUndefined()
  })
  test('both prompts name the first and last timestamps and lines, and ask for at', () => {
    for (const p of [debriefPrompt('/s/debrief.md', 's-1', [], W), builtInDebriefPrompt('/t/debrief.md', 's-1', '/r', [], W)]) {
      expect(p).toContain('2026-10-10T10:00:00Z')
      expect(p).toContain('2026-10-10T10:20:00Z')
      expect(p).toContain('lines 3 to 6')
      expect(p).toContain('`at`')
      expect(p).toContain('never from text printed inside a tool result')
      expect(p).toContain('debrief check: clean')
    }
    expect(windowAsk(W)).toContain('line 3')
    expect(debriefPrompt('/s/debrief.md', 's-1', [])).not.toContain('breadcrumb lines')
  })
  test('the mod_findings ask lists the surface enum', () => {
    for (const s of MOD_SURFACES) expect(MOD_FINDINGS_ASK).toContain(s)
  })
})

describe('MOD-10: checking a debrief against its window', () => {
  const fixture = (over: Record<string, unknown>) => JSON.stringify({ summary: 's', outcomes: [], corrections: [], tool_denials: [], ...over })

  test('a tool_denials entry timestamped before the window is stripped and reported', () => {
    const r = checkDebrief(fixture({ tool_denials: [{ text: 'Bash denied', at: '2026-10-08T09:05:00Z' }, { text: 'Edit denied', at: '2026-10-10T10:10:00Z' }] }), W)
    expect(r.strippedCount).toBe(1)
    expect(r.clean).toBe(false)
    expect(r.debrief.tool_denials).toEqual([{ text: 'Edit denied', at: '2026-10-10T10:10:00Z' }])
    expect(r.lines.join('\n')).toContain('stripped 1 tool_denials entry outside the window')
    expect(r.lines[0]).toBe('debrief check: 1 stripped, 0 flagged')
  })
  test('a line number outside (watermark, end] is stripped, one inside stays', () => {
    const r = checkDebrief(fixture({ corrections: [{ text: 'no', at: 2 }, { text: 'stop', at: 4 }, { text: 'x', at: 'line 9' }] }), W)
    expect(r.strippedCount).toBe(2)
    expect(r.debrief.corrections).toEqual([{ text: 'stop', at: 4 }])
  })
  test('a clean fixture passes with nothing stripped', () => {
    const r = checkDebrief(fixture({ tool_denials: [{ text: 'Edit denied', at: 5 }], corrections: [{ text: 'no', at: '2026-10-10T10:00:00Z' }], outcomes: [{ task: 'T-1', at: 4 }] }), W)
    expect(r).toMatchObject({ strippedCount: 0, noAt: 0, clean: true })
    expect(r.lines).toEqual(['debrief check: clean'])
  })
  test('an entry with no at is kept but counted; it does not block', () => {
    const r = checkDebrief(fixture({ corrections: ['no, the other one'], outcomes: [{ task: 'T-1' }] }), W)
    expect(r).toMatchObject({ strippedCount: 0, noAt: 2, clean: true })
    expect(r.lines.join('\n')).toContain('kept 2 entries with no usable at')
  })
  test('tool_denials the window cannot contain are flagged', () => {
    const quiet = windowOf([crumb('2026-10-10T10:00:00Z', 'session_start'), crumb('2026-10-10T10:01:00Z', 'session_end')].join('\n'), 0)!
    const r = checkDebrief(fixture({ tool_denials: [{ text: 'Bash denied', at: 1 }], corrections: [{ text: 'no', at: 2 }] }), quiet)
    expect(r.flagged).toHaveLength(2)
    expect(r.clean).toBe(false)
    expect(r.lines.join('\n')).toContain('flagged tool_denials')
    expect(r.lines.join('\n')).toContain('flagged corrections')
  })
  test('with no window (events mode) nothing is stripped; text that is not a JSON object is unparsed', () => {
    expect(checkDebrief(fixture({ corrections: [{ text: 'no', at: 99 }] }), undefined)).toMatchObject({ clean: true, strippedCount: 0 })
    expect(checkDebrief('[1]', W).parsed).toBe(false)
  })
})

describe('MOD-10: findings about the host', () => {
  const f = (surface: string, over: Record<string, unknown> = {}) => ({ surface, title: 'A thing', body: 'It happened.', ...over })

  test('a permission classifier surface lands in host, a verifier one stays', () => {
    const { mod, host } = splitFindings([f('permission classifier'), f('verifier'), f('/delegation accept'), f('the gate')])
    expect(host.map(x => x.surface)).toEqual(['permission classifier'])
    expect(mod.map(x => x.surface)).toEqual(['verifier', '/delegation accept', 'the gate'])
  })
  test('a surface outside the enum, or text naming a safety check, the engine or the own hooks, is host', () => {
    expect(splitFindings([f('claude code')]).host).toHaveLength(1)
    expect(splitFindings([f('verifier', { body: "the host's removal safety check refused it" })]).host).toHaveLength(1)
    expect(splitFindings([f('dispatch', { title: 'The engine dropped the spawn' })]).host).toHaveLength(1)
    expect(splitFindings([f('config', { body: 'my own hook blocked it' })]).host).toHaveLength(1)
    expect(splitFindings([f('dispatch', { body: 'queued twice' })]).mod).toHaveLength(1)
  })
})

describe('MOD-38: a correction the transcript holds at its time', () => {
  const row = (type: string, role: string, content: unknown, timestamp: string): string => JSON.stringify({ type, message: { role, content }, timestamp })
  const JSONL = [
    row('user', 'user', "I don't agree here and I think Opus needs help. MCP isn't required", '2026-10-10T10:00:00Z'),
    row('assistant', 'assistant', 'Understood, switching to the other model now', '2026-10-10T10:00:10Z'),
    row('user', 'user', [{ type: 'text', text: 'Please   STOP\n  using the shell' }, { type: 'text', text: 'for this' }], '2026-10-10T10:01:00Z'),
    row('user', 'user', [{ type: 'tool_result', content: 'x' }], '2026-10-10T10:01:10Z'),
    'not json',
  ].join('\n')
  const users = userMessagesFromJsonl(JSONL)
  const at = (iso: string): number => Date.parse(iso)

  test('only user rows with text and a time are kept; blocks are joined; junk lines are skipped', () => {
    expect(users).toHaveLength(2)
    expect(users[1]?.text).toBe('please stop using the shell for this')
  })
  test('the transcript file lives under the root with every non-alphanumeric as a dash', () => {
    expect(transcriptPath('/Users/x/', '/Users/x/Documents/chassis-delegation', 's-1')).toBe('/Users/x/.claude/projects/-Users-x-Documents-chassis-delegation/s-1.jsonl')
  })
  test('apostrophes (straight and curly) are folded out of both sides, so "dont" matches "don\'t"', () => {
    expect(quoteEvidenced('i dont agree here and i think opus needs help', at('2026-10-10T10:00:30Z'), users)).toBe('transcript')
    expect(quoteEvidenced("i don\u2019t agree here and i think opus needs help", at('2026-10-10T10:00:30Z'), users)).toBe('transcript')
  })
  test('a verbatim quote, with surrounding quotes, whitespace and case differences, matches within two minutes', () => {
    expect(quoteEvidenced('"Please stop using the shell"', at('2026-10-10T10:01:00Z'), users)).toBe('transcript')
    expect(quoteEvidenced('please STOP using the shell', at('2026-10-10T10:02:30Z'), users)).toBe('transcript')
  })
  test('a quote of fewer than 12 characters never matches', () => {
    expect(quoteEvidenced('please stop', at('2026-10-10T10:01:00Z'), users)).toBeUndefined()
    expect(quoteEvidenced('Please', at('2026-10-10T10:01:00Z'), users)).toBeUndefined()
  })
  test('a message more than two minutes from at does not count', () => {
    expect(quoteEvidenced('please stop using the shell', at('2026-10-10T10:03:01Z'), users)).toBeUndefined()
    expect(quoteEvidenced('please stop using the shell', at('2026-10-10T10:03:00Z'), users)).toBe('transcript')
  })
  test('untimed rows (the engine call) match on the quote alone and are marked untimed', () => {
    const untimed = userMessagesOf([{ role: 'user', text: 'Please stop using the shell' }, { role: 'assistant', text: 'ok then' }])
    expect(untimed).toHaveLength(1)
    expect(quoteEvidenced('please stop using the shell', at('2030-01-01T00:00:00Z'), untimed)).toBe('transcript-untimed')
  })
  const quiet = windowOf([crumb('2026-10-10T10:00:00Z', 'session_start'), crumb('2026-10-10T10:05:00Z', 'session_end')].join('\n'), 0)!
  test('checkDebrief: evidenced corrections are marked source transcript, do not flag, and print the evidenced line', () => {
    const text = JSON.stringify({ corrections: [{ text: '"Please stop using the shell"', at: '2026-10-10T10:01:00Z' }, { text: "I don't agree here and I think Opus needs help", at: '2026-10-10T10:00:30Z' }] })
    const r = checkDebrief(text, quiet, users)
    expect(r.clean).toBe(true)
    expect(r.evidenced).toBe(2)
    expect(r.lines[0]).toBe('debrief check: clean (2 corrections evidenced by the transcript, none in the breadcrumbs)')
    expect((r.debrief.corrections as { source?: string }[]).map(c => c.source)).toEqual(['transcript', 'transcript'])
  })
  test('checkDebrief: an untimed match says so on the check line', () => {
    const untimed = userMessagesOf([{ role: 'user', text: 'Please stop using the shell' }])
    const r = checkDebrief(JSON.stringify({ corrections: [{ text: 'Please stop using the shell', at: '2026-10-10T10:01:00Z' }] }), quiet, untimed)
    expect(r.clean).toBe(true)
    expect(r.lines[0]).toContain('1 untimed')
    expect((r.debrief.corrections as { source?: string }[])[0]?.source).toBe('transcript-untimed')
  })
  test('checkDebrief: one correction the transcript lacks is flagged as before', () => {
    const text = JSON.stringify({ corrections: [{ text: 'Please stop using the shell', at: '2026-10-10T10:01:00Z' }, { text: 'nothing like this was ever said', at: '2026-10-10T10:01:00Z' }] })
    const r = checkDebrief(text, quiet, users)
    expect(r.clean).toBe(false)
    expect(r.flagged).toHaveLength(1)
    expect(r.lines[0]).toBe('debrief check: 0 stripped, 1 flagged')
  })
})
