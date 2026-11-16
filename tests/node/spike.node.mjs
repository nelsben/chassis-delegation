// MOD-372 (#512): the built-in findings gate for a spike's findings file.
// Pure: spikeQuestions, sourceAllowed, findingsCheck and splitFindingsGate
// take text and return values; no git, no host calls. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { spikeQuestions, sourceAllowed, findingsCheck, splitFindingsGate } from '../../hooks/lib/spike.ts'

const PATH = 'findings/spike.md'
const VERDICTS = ['adopt', 'defer', 'reject']
const SOURCES = ['docs.example.com']
const Q2 = [{ n: 1, text: 'Does X hold? (verdict)', verdict: true }, { n: 2, text: 'Where is Y?', verdict: false }]
const CLEAN = [
  '# Findings',
  '',
  '## Q1',
  'X holds, see src/a.ts:12 and https://docs.example.com/page.',
  'Verdict: adopt',
  '',
  '## Q2',
  'Unanswered: the docs were silent on Y.',
  '',
  '## Decisions this implies',
  '- adopt X',
  '',
].join('\n')

/** A findings text with the given Q1 and Q2 bodies, the decisions section kept. */
function findings(q1, q2 = ['Unanswered: none found.'], decisions = ['- adopt X']) {
  return ['# Findings', '', '## Q1', ...q1, '', '## Q2', ...q2, '', '## Decisions this implies', ...decisions, ''].join('\n')
}

function check(text, extra = {}) {
  return findingsCheck({ text, path: PATH, questions: Q2, sources: SOURCES, verdicts: VERDICTS, ...extra })
}

describe('spikeQuestions', () => {
  test('reads the numbered questions under ## Questions of a card body', () => {
    const body = ['# Card', '', '## Why', 'x', '', '## Questions', '', '1. Does X hold? (verdict)', '2. Where is Y?', '', 'prose line', '   - a sub bullet', '', '## Done when', '- x'].join('\n')
    expect(spikeQuestions(body)).toEqual({ questions: Q2 })
  })

  test('a whole brief counts only the Questions under ## The card', () => {
    const brief = ['[[brief v=1 task=MOD-1]]', '', '## Questions', '1. not the card one', '', '## The card', '', '## Questions', '1. Does X hold? (verdict)', '2. Where is Y?', '', '## Lessons', '- x'].join('\n')
    expect(spikeQuestions(brief)).toEqual({ questions: Q2 })
  })

  test('the verdict flag is case-insensitive and the text keeps its words', () => {
    const r = spikeQuestions('## Questions\n1. Is it safe? (Verdict)\n')
    expect(r).toEqual({ questions: [{ n: 1, text: 'Is it safe? (Verdict)', verdict: true }] })
  })

  test('misnumbered questions are an error that lists the numbers found', () => {
    expect(spikeQuestions('## Questions\n1. a\n3. b\n')).toEqual({ error: 'the Questions are numbered 1, 3, not 1 to 2' })
  })

  test('no ## Questions heading, or one with no numbered line, is an error', () => {
    expect(spikeQuestions('## The card\n\n## Why\nx\n')).toEqual({ error: 'the card has no ## Questions list' })
    expect(spikeQuestions('## Questions\n\njust prose\n')).toEqual({ error: 'the card has no ## Questions list' })
  })
})

describe('sourceAllowed', () => {
  test('a host allows itself and its subdomains, with or without www.', () => {
    expect(sourceAllowed('https://docs.example.com/a', ['example.com'])).toBe(true)
    expect(sourceAllowed('https://example.com', ['example.com'])).toBe(true)
    expect(sourceAllowed('https://www.example.com/x', ['example.com'])).toBe(true)
    expect(sourceAllowed('https://notexample.com/x', ['example.com'])).toBe(false)
  })

  test('a source with a path allows that path and paths under it, not a path that only shares its prefix', () => {
    expect(sourceAllowed('https://github.com/anthropics/x', ['github.com/anthropics'])).toBe(true)
    expect(sourceAllowed('https://github.com/anthropics', ['github.com/anthropics'])).toBe(true)
    expect(sourceAllowed('https://github.com/anthropics-x', ['github.com/anthropics'])).toBe(false)
    expect(sourceAllowed('https://github.com/other', ['github.com/anthropics'])).toBe(false)
  })

  test('a source written with a scheme, www. or trailing slash matches the same host', () => {
    expect(sourceAllowed('https://example.com/a', ['https://www.example.com/'])).toBe(true)
  })

  test('empty sources allow everything; a non-URL is refused when sources are set', () => {
    expect(sourceAllowed('https://anywhere.test/x', [])).toBe(true)
    expect(sourceAllowed('not a url', ['example.com'])).toBe(false)
    expect(sourceAllowed('not a url', [])).toBe(true)
  })
})

describe('findingsCheck', () => {
  test('a clean file passes and its summary counts questions, answers, citations and flags', () => {
    const r = check(CLEAN)
    expect(r.ok).toBe(true)
    expect(r.problems).toEqual([])
    expect(r.summary).toBe('findings/spike.md: 2 questions, 1 answered, 1 unanswered, 2 citations, 0 flags')
  })

  test('the summary uses singular words when a count is 1', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:3'], ['Unanswered: no.'])
    const r = check(text)
    expect(r.summary).toBe('findings/spike.md: 2 questions, 1 answered, 1 unanswered, 1 citation, 0 flags')
    const one = '# F\n\n## Q1\nVerdict: adopt\nsrc/a.ts:3\n\n## Decisions this implies\n- adopt\n'
    const s = findingsCheck({ text: one, path: PATH, questions: [{ n: 1, text: 'Q', verdict: true }], sources: [], verdicts: [] })
    expect(s.summary).toBe('findings/spike.md: 1 question, 1 answered, 0 unanswered, 1 citation, 0 flags')
  })

  test('undefined text is the one problem: not found', () => {
    const r = check(undefined)
    expect(r.ok).toBe(false)
    expect(r.problems).toEqual(['findings file findings/spike.md not found'])
  })

  test('blank text is the one problem: empty', () => {
    expect(check('  \n\t\n').problems).toEqual(['findings file findings/spike.md is empty'])
  })

  test('a card question with no section, and a section for a non-question', () => {
    const r = check(findings(['Verdict: adopt', 'src/a.ts:1'], undefined).replace('## Q2\nUnanswered: none found.\n', '## Q9\nUnanswered: x\n'))
    expect(r.problems).toContain('Q2 has no section')
    expect(r.problems).toContain('Q9 is not a card question')
  })

  test('a second section for the same question', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1'], ['Unanswered: no.']) + '\n## Q1\nUnanswered: again.\n'
    expect(check(text).problems).toContain('Q1 has two sections')
  })

  test('an answered question with no citation', () => {
    const r = check(findings(['Verdict: adopt', 'no proof here'], ['Unanswered: no.']))
    expect(r.problems).toEqual(['Q1 cites nothing (a URL or path:line) and is not marked Unanswered:'])
  })

  test('a verdict question with no Verdict line, and a verdict word outside the list', () => {
    expect(check(findings(['see src/a.ts:4'], ['Unanswered: no.'])).problems).toEqual(['Q1 asks for a verdict and has none'])
    expect(check(findings(['see src/a.ts:4', 'Verdict: maybe'], ['Unanswered: no.'])).problems).toEqual(["Q1 verdict 'maybe' is not one of adopt, defer, reject"])
  })

  test('a verdict is read through list markers and markup, and trailing punctuation is dropped', () => {
    const text = findings(['- **Verdict:** Adopt.', 'src/a.ts:4'], ['Unanswered: no.'])
    expect(check(text).ok).toBe(true)
  })

  test('an Unanswered question needs no citation and no verdict', () => {
    const text = findings(['Unanswered: the source is gone.'], ['_Unanswered: nothing._'])
    expect(check(text).problems).toEqual([])
  })

  test('a URL outside the allowed sources, listed at most five times then counted', () => {
    const urls = ['a', 'b', 'c', 'd', 'e', 'f', 'g'].map(s => `https://other${s}.test/x`)
    const text = findings(['Verdict: adopt', 'src/a.ts:1', ...urls, 'https://docs.example.com/ok'], ['Unanswered: no.'])
    const r = check(text)
    expect(r.problems).toHaveLength(6)
    expect(r.problems[0]).toBe('https://othera.test/x is not under an allowed source (docs.example.com)')
    expect(r.problems[5]).toBe('+2 more URLs outside the allowed sources')
  })

  test('a single URL outside the allowed sources is one problem line', () => {
    const r = check(findings(['Verdict: adopt', 'see https://evil.example.org/x.'], ['Unanswered: no.']))
    expect(r.problems).toEqual(['https://evil.example.org/x is not under an allowed source (docs.example.com)'])
  })

  test('a malformed ⚠ flag is one problem line with its line number', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1', '⚠ Unverified: fine'], ['Unanswered: no.', '⚠ Conflict:   '])
    const lines = text.split('\n')
    const r = check(text)
    expect(r.problems).toEqual([`line ${lines.indexOf('⚠ Conflict:   ') + 1}: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text> (found "⚠ Conflict:")`])
  })

  test('a ⚠ with no Unverified or Conflict label is a malformed flag too', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1 ⚠ Guess: maybe'], ['Unanswered: no.'])
    expect(check(text).problems).toEqual([`line ${text.split('\n').indexOf('src/a.ts:1 ⚠ Guess: maybe') + 1}: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text> (found "⚠ Guess: maybe")`])
  })

  // MOD-386 (#536)
  test('a bare ⚠ Unverified. problem line quotes what it found', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1', '⚠ Unverified.'], ['Unanswered: no.'])
    expect(check(text).problems).toEqual([`line ${text.split('\n').indexOf('⚠ Unverified.') + 1}: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text> (found "⚠ Unverified.")`])
  })

  test('a lone ⚠ shows (found "⚠"), and a long part is cut to 30 characters', () => {
    const lone = findings(['Verdict: adopt', 'src/a.ts:1 ⚠'], ['Unanswered: no.'])
    expect(check(lone).problems[0].endsWith('(found "⚠")')).toBe(true)
    const long = findings(['Verdict: adopt', 'src/a.ts:1 ⚠ ' + 'x'.repeat(50)], ['Unanswered: no.'])
    expect(check(long).problems[0].endsWith(`(found "⚠ ${'x'.repeat(30)}")`)).toBe(true)
  })

  test('a ⚠ only inside backticks is neither a problem nor a flag', () => {
    const r = check(findings(['Verdict: adopt', 'src/a.ts:1', 'flagged `⚠ Unverified` below'], ['Unanswered: no.']))
    expect(r.ok).toBe(true)
    expect(r.summary.endsWith('0 flags')).toBe(true)
  })

  test('a good flag beside a backticked mention counts one flag and no problem', () => {
    const r = check(findings(['Verdict: adopt', 'src/a.ts:1', '⚠ Unverified: timing, see `⚠ Unverified` rule'], ['Unanswered: no.']))
    expect(r.ok).toBe(true)
    expect(r.summary.endsWith('1 flag')).toBe(true)
  })

  test('a well-formed flag passes and is counted in the summary', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1', '⚠ Unverified: the timing claim'], ['Unanswered: no.'])
    const r = check(text)
    expect(r.ok).toBe(true)
    expect(r.summary).toBe('findings/spike.md: 2 questions, 1 answered, 1 unanswered, 1 citation, 1 flag')
  })

  test('no decisions section, and a decisions section with no item', () => {
    const noSection = ['# Findings', '## Q1', 'Verdict: adopt', 'src/a.ts:1', '## Q2', 'Unanswered: no.', ''].join('\n')
    expect(check(noSection).problems).toEqual(['no ## Decisions this implies section'])
    expect(check(findings(['Verdict: adopt', 'src/a.ts:1'], undefined, ['nothing listed'])).problems).toEqual(['## Decisions this implies has no item (write - none when it implies none)'])
    expect(check(findings(['Verdict: adopt', 'src/a.ts:1'], undefined, ['- none'])).ok).toBe(true)
  })

  test('the decisions heading is matched case-insensitively', () => {
    const text = findings(['Verdict: adopt', 'src/a.ts:1'], ['Unanswered: no.'], ['- adopt']).replace('## Decisions this implies', '## decisions THIS implies')
    expect(check(text).ok).toBe(true)
  })

  test('the sources check is skipped when no sources are set', () => {
    const text = findings(['Verdict: adopt', 'see https://anywhere.test/x'], ['Unanswered: no.'])
    expect(check(text, { sources: [] }).ok).toBe(true)
  })

  test('a path citation needs the path:line form at the start of a token; a URL is never a path citation', () => {
    const r = check(findings(['Verdict: adopt', 'see https://docs.example.com/a.md:4'], ['Unanswered: no.']))
    expect(r.summary).toBe('findings/spike.md: 2 questions, 1 answered, 1 unanswered, 1 citation, 0 flags')
  })
})

describe('splitFindingsGate', () => {
  test('without findings= the gate ids are unchanged and not built in', () => {
    expect(splitFindingsGate('validate,node', undefined)).toEqual({ builtin: false, rest: 'validate,node' })
    expect(splitFindingsGate('findings', '')).toEqual({ builtin: false, rest: 'findings' })
  })

  test('findings alone is built in with nothing else to run', () => {
    expect(splitFindingsGate('findings', 'findings/spike.md')).toEqual({ builtin: true, rest: undefined })
  })

  test('findings with another id keeps that id; ids are trimmed and empties dropped', () => {
    expect(splitFindingsGate(' findings, node ,,', 'findings/spike.md')).toEqual({ builtin: true, rest: 'node' })
  })

  test('a gate without the findings id is never built in, even with findings=', () => {
    expect(splitFindingsGate('node', 'findings/spike.md')).toEqual({ builtin: false, rest: 'node' })
  })
})
