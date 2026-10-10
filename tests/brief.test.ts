import { test, expect, describe } from 'claude-code/testing'
import {
  parseHeader,
  findBriefPath,
  parseAmends,
  effectiveList,
  extractReport,
  parseReport,
  parseBudget,
  budgetWarning,
  extractAmendBlocks,
  appendAmends,
  amendNeedsApproval,
  scopeInsideForbid,
  inlineHeaderMissing,
  noBriefLine,
  lacksLine,
  scopeOverlap,
  setHeaderField,
} from '../hooks/lib/brief'

const FE205 =
  '[[brief v=1 task=FE-205 subtask=main purpose=build tier=frontier model=opus scope=a/*,b/** forbid=c/**,d.json red_test=cd app/x && npx vitest run src/y.test.tsx gate=prettier budget=2-attempts report=chassis.report.v1]]\n\n# FE-205 body'
const QUOTED =
  '[[brief v=1 task=MOD-001 subtask=main purpose=build tier=frontier model=opus scope=/mods/x/** forbid=/repo/** red_test="claude plugin test /mods/x gate=not-a-field" gate="claude plugin validate /mods/x" budget=3-attempts report=chassis.report.v1]]\nbody'

describe('header parse', () => {
  test('reads a header from prompt text, values with spaces run to the next field', () => {
    const h = parseHeader('Do this.\n' + FE205)
    expect(h?.task).toBe('FE-205')
    expect(h?.subtask).toBe('main')
    expect(h?.tier).toBe('frontier')
    expect(h?.model).toBe('opus')
    expect(h?.fields.red_test).toBe('cd app/x && npx vitest run src/y.test.tsx')
    expect(h?.gate).toBe('prettier')
    expect(h?.budget).toBe('2-attempts')
    expect(h?.fields.scope).toBe('a/*,b/**')
  })

  test('quoted values keep field-looking text inside the quotes', () => {
    const h = parseHeader(QUOTED)
    expect(h?.fields.red_test).toBe('claude plugin test /mods/x gate=not-a-field')
    expect(h?.gate).toBe('claude plugin validate /mods/x')
    expect(h?.budget).toBe('3-attempts')
  })

  test('no header → undefined; defaults for subtask and purpose', () => {
    expect(parseHeader('just a prompt')).toBeUndefined()
    const h = parseHeader('[[brief v=1 task=X-1 tier=economy]]')
    expect(h?.subtask).toBe('main')
    expect(h?.purpose).toBe('build')
  })

  test('finds a .brief.md path the prompt names', () => {
    const p = 'Your brief is the file /private/tmp/s/scratchpad/briefs/MOD-001.brief.md. Read it whole.'
    expect(findBriefPath(p)).toBe('/private/tmp/s/scratchpad/briefs/MOD-001.brief.md')
    expect(findBriefPath('see briefs/X.brief.md (relative)')).toBeUndefined()
    expect(findBriefPath('no file here')).toBeUndefined()
  })
})

describe('amend blocks', () => {
  const brief = FE205 + '\n\n[[amend v=1 scope+=e/** forbid-=d.json reason=the worker needed e]]\n[[amend v=1 scope-=a/* reason=narrowed]]\n'
  test('applied in file order to scope and forbid', () => {
    const { amends, malformed } = parseAmends(brief)
    expect(malformed).toBeUndefined()
    expect(amends).toHaveLength(2)
    expect(amends[0]?.reason).toBe('the worker needed e')
    expect(effectiveList('a/*,b/**', amends, 'scope')).toBe('b/**,e/**')
    expect(effectiveList('c/**,d.json', amends, 'forbid')).toBe('c/**')
  })
  test('prose quoting the grammar mid-line is not an amendment', () => {
    expect(parseAmends('write `[[amend v=1 scope+=x reason=y]]` like so').amends).toHaveLength(0)
  })
  test('an unknown token makes the whole set malformed (the verifier rule)', () => {
    const r = parseAmends('[[amend v=1 budget=3 reason=more]]')
    expect(r.malformed).toContain('budget=3')
    expect(r.amends).toHaveLength(0)
  })
  test('a block without reason= is malformed', () => {
    expect(parseAmends('[[amend v=1 scope+=x]]').malformed).toContain('reason')
  })
})

describe('report block', () => {
  test('the last report block wins', () => {
    const text =
      'Shape: [[report v=1 task=X …]] is the form.\n' +
      '[[report v=1 task=FE-205 subtask=main branch=agent/frontend/FE-205 pr=none sha=11111111 gate=fail files=a.ts]]\n' +
      'retried\n' +
      '[[report v=1 task=FE-205 subtask=main branch=agent/frontend/FE-205 pr=none sha=96014e3b gate=pass files=a.ts,b.ts]]\n'
    const block = extractReport(text)
    expect(block).toBe('[[report v=1 task=FE-205 subtask=main branch=agent/frontend/FE-205 pr=none sha=96014e3b gate=pass files=a.ts,b.ts]]')
    const r = parseReport(block ?? '')
    expect(r.sha).toBe('96014e3b')
    expect(r.gate).toBe('pass')
    expect(r.files).toBe('a.ts,b.ts')
  })
  test('a note with brackets runs to the closing brackets at the end of the line', () => {
    const block = extractReport('[[report v=1 task=A sha=abc1234 gate=pass note=used [x] and ]] inside]]\nafter')
    expect(block).toBe('[[report v=1 task=A sha=abc1234 gate=pass note=used [x] and ]] inside]]')
    expect(parseReport(block ?? '').note).toBe('used [x] and ]] inside')
  })
  test('no block → undefined (no-report)', () => {
    expect(extractReport('All done, tests pass.')).toBeUndefined()
  })
})

describe('budget', () => {
  test('n-attempts parses; anything else falls back', () => {
    expect(parseBudget('3-attempts', 2)).toBe(3)
    expect(parseBudget('frontier-60m', 2)).toBe(2)
    expect(parseBudget(undefined, 4)).toBe(4)
    expect(parseBudget('0-attempts', 2)).toBe(2)
  })
  test('GH-1 item 6: a budget off the grammar gets a warning line; absent or well formed gets none', () => {
    expect(budgetWarning('frontier-60m', 3)).toBe('warning: budget "frontier-60m" is not <n>-attempts; using the default 3')
    expect(budgetWarning(' 0-attempts ', 2)).toBe('warning: budget "0-attempts" is not <n>-attempts; using the default 2')
    expect(budgetWarning('3-attempts', 2)).toBeUndefined()
    expect(budgetWarning(undefined, 2)).toBeUndefined()
    expect(budgetWarning('  ', 2)).toBeUndefined()
  })
})

describe('amend blocks a hand-back carries', () => {
  const AMEND = '[[amend v=1 scope+=scripts/ci/owned-paths-selftest.sh reason=the selftest lives beside the script]]'
  const REPORT = '[[report v=1 task=OPS-230 subtask=main branch=agent/ops/OPS-230 pr=none sha=1234abcd gate=pass files=a]]'
  test('line-anchored blocks, in order, each read by the verifier grammar; prose that quotes one is not one', () => {
    const text = [
      'I needed one more file; the grammar is `[[amend v=1 scope+=x reason=y]]` mid-line, which is prose.',
      '  ' + AMEND,
      '[[amend v=1 forbid+=docs/**',
      '  reason=keep docs out]]',
      REPORT,
    ].join('\n')
    const found = extractAmendBlocks(text)
    expect(found.amends).toEqual([
      { block: AMEND, ops: ['scope+=scripts/ci/owned-paths-selftest.sh'], reason: 'the selftest lives beside the script' },
      { block: '[[amend v=1 forbid+=docs/** reason=keep docs out]]', ops: ['forbid+=docs/**'], reason: 'keep docs out' },
    ])
    expect(found.malformed).toEqual([])
  })
  test('a block repeated in the text is taken once; a malformed one is set aside with its reason', () => {
    const found = extractAmendBlocks([AMEND, 'again:', AMEND, '[[amend v=1 scope+=x]]', '[[amend v=2 scope+=y reason=z]]'].join('\n'))
    expect(found.amends.map(a => a.block)).toEqual([AMEND])
    expect(found.malformed).toEqual([
      { block: '[[amend v=1 scope+=x]]', why: "a block is missing a non-empty 'reason='" },
      { block: '[[amend v=2 scope+=y reason=z]]', why: "unknown amend version 'v=2'" },
    ])
    expect(extractAmendBlocks('no blocks here\n' + REPORT)).toEqual({ amends: [], malformed: [] })
  })
  test('only scope+= and forbid+= apply on their own; a block that removes anything needs approval', () => {
    const one = (block: string) => extractAmendBlocks(block).amends[0]!
    expect(amendNeedsApproval(one('[[amend v=1 scope+=a.sh reason=r]]'))).toBe(false)
    expect(amendNeedsApproval(one('[[amend v=1 forbid+=docs/** reason=r]]'))).toBe(false)
    expect(amendNeedsApproval(one('[[amend v=1 scope+=a.sh forbid+=b/** reason=r]]'))).toBe(false)
    expect(amendNeedsApproval(one('[[amend v=1 forbid-=b/** reason=r]]'))).toBe(true)
    expect(amendNeedsApproval(one('[[amend v=1 scope-=a/** reason=r]]'))).toBe(true)
    expect(amendNeedsApproval(one('[[amend v=1 scope+=a.sh forbid-=b/** reason=r]]'))).toBe(true)
  })
  test('scopeInsideForbid names the scope entries a forbid glob entirely covers (GH-17)', () => {
    expect(scopeInsideForbid(['shell/NOTES.md', 'a/x.ts'], ['shell/**'])).toEqual(['shell/NOTES.md'])
    expect(scopeInsideForbid(['shell/x/**', 'shell/y/*.ts'], ['shell/**'])).toEqual(['shell/x/**', 'shell/y/*.ts'])
    expect(scopeInsideForbid(['docs/a.md'], ['docs/'])).toEqual(['docs/a.md'])
    expect(scopeInsideForbid(['a/**'], ['a/**'])).toEqual(['a/**'])
    // conservative: partial overlap, a leading wildcard or a forbid that is narrower is not a warning
    expect(scopeInsideForbid(['shell*', '**/x.ts', '*'], ['shell/**'])).toEqual([])
    expect(scopeInsideForbid(['src/y*'], ['src/*x'])).toEqual([])
    expect(scopeInsideForbid(['src/**'], ['src/a/**'])).toEqual([])
    expect(scopeInsideForbid(['a/x.ts'], [])).toEqual([])
  })
  test('a scope+= inside a forbid needs approval once the effective forbid is given (GH-17)', () => {
    const one = (block: string) => extractAmendBlocks(block).amends[0]!
    const a = one('[[amend v=1 scope+=shell/NOTES.md reason=r]]')
    expect(amendNeedsApproval(a)).toBe(false)
    expect(amendNeedsApproval(a, ['shell/**'])).toBe(true)
    expect(amendNeedsApproval(a, ['other/**'])).toBe(false)
    expect(amendNeedsApproval(one('[[amend v=1 scope+=shell/NOTES.md forbid-=shell/** reason=r]]'), ['shell/**'])).toBe(true)
  })
  test('appendAmends: each block on its own line at the end, once; a block the brief already holds is skipped', () => {
    const brief = '[[brief v=1 task=OPS-230 scope=a/**]]\nbody'
    const first = appendAmends(brief, [AMEND])
    expect(first.text).toBe(brief + '\n' + AMEND + '\n')
    expect(first.added).toEqual([AMEND])
    const second = appendAmends(first.text, [AMEND])
    expect(second.text).toBe(first.text)
    expect(second.added).toEqual([])
    // a wrapped block already in the brief counts as present
    const wrapped = brief + '\n[[amend v=1 forbid+=docs/**\n  reason=keep docs out]]\n'
    expect(appendAmends(wrapped, ['[[amend v=1 forbid+=docs/** reason=keep docs out]]']).added).toEqual([])
  })
})

describe('GH-6: an inline header that stands as its own brief', () => {
  const missing = (header: string) => inlineHeaderMissing(parseHeader(header) ?? { raw: '', fields: {}, subtask: 'main', purpose: 'build' })

  test('task, a scope and a gate make it complete; scope_globs stands in for scope, repo=none for gate', () => {
    expect(missing(FE205)).toEqual([])
    expect(missing('[[brief v=1 task=X-1 scope_globs=/notes/** repo=none]]')).toEqual([])
    expect(missing('[[brief v=1 task=X-1 scope=a/** gate="claude plugin validate ."]]')).toEqual([])
  })

  test('each missing field is named, in order', () => {
    expect(missing('[[brief v=1 task=X-1 scope=a/**]]')).toEqual(['gate= (or repo=none)'])
    expect(missing('[[brief v=1 task=X-1 gate=node]]')).toEqual(['scope= (or scope_globs=)'])
    expect(missing('[[brief v=1 scope=a/** gate=node]]')).toEqual(['task='])
    // an empty value is no value; repo=<dir> is not repo=none
    expect(missing('[[brief v=1 task=X-1 scope= gate=node repo=/w/x]]')).toEqual(['scope= (or scope_globs=)'])
    expect(missing('[[brief v=1 task=X-1 scope=a/** repo=/w/x]]')).toEqual(['gate= (or repo=none)'])
    expect(missing('[[brief v=1 tier=standard]]')).toEqual(['task=', 'scope= (or scope_globs=)', 'gate= (or repo=none)'])
  })

  test('the unverified line keeps its words and says why', () => {
    expect(noBriefLine()).toBe('note: no brief file named in the prompt; verify skipped')
    expect(noBriefLine(lacksLine(['scope= (or scope_globs=)', 'gate= (or repo=none)']))).toBe(
      'note: no brief file named in the prompt; the inline header lacks scope= (or scope_globs=) and gate= (or repo=none); verify skipped',
    )
  })
})

describe('GH-16: repo=here header fields, ignore+= and scope overlap', () => {
  test('base= and ignore= are header fields; a value runs to the next one', () => {
    const h = parseHeader('[[brief v=1 task=GH-16 scope=src/** forbid= gate=node repo=here base=main ignore=.delegation/**,src/b.ts budget=3-attempts]]')
    expect(h?.repo).toBe('here')
    expect(h?.fields.base).toBe('main')
    expect(h?.fields.ignore).toBe('.delegation/**,src/b.ts')
    expect(h?.budget).toBe('3-attempts')
  })
  test('ignore+= is an amend operation; it hides paths from the check, so it always waits for approval', () => {
    const parsed = parseAmends('[[amend v=1 ignore+=traces/** reason=the run writes traces]]\n')
    expect(parsed).toEqual({ amends: [{ ops: ['ignore+=traces/**'], reason: 'the run writes traces' }] })
    expect(effectiveList('.delegation/**', parsed.amends, 'ignore')).toBe('.delegation/**,traces/**')
    expect(amendNeedsApproval({ ops: ['ignore+=traces/**'], reason: 'r' })).toBe(true)
    expect(amendNeedsApproval({ ops: ['scope+=a.ts'], reason: 'r' })).toBe(false)
    // ignore-= is not part of the grammar
    expect(parseAmends('[[amend v=1 ignore-=x reason=r]]').malformed).toContain("unrecognized token 'ignore-=x'")
  })
  test("two scopes overlap when one glob's literal prefix matches the other (scopeInsideForbid's rule, both ways)", () => {
    expect(scopeOverlap(['src/**'], ['src/lib/**'])).toEqual({ mine: 'src/**', theirs: 'src/lib/**' })
    expect(scopeOverlap(['docs/a.md', 'src/lib/x.ts'], ['src/**'])).toEqual({ mine: 'src/lib/x.ts', theirs: 'src/**' })
    expect(scopeOverlap(['README.md'], ['README.md'])).toEqual({ mine: 'README.md', theirs: 'README.md' })
    expect(scopeOverlap(['docs/'], ['docs/x.md'])).toEqual({ mine: 'docs/', theirs: 'docs/x.md' })
    expect(scopeOverlap(['src/**'], ['docs/**', 'README.md'])).toBeUndefined()
    expect(scopeOverlap(['src/a/**'], ['src/b/**'])).toBeUndefined()
    expect(scopeOverlap([], ['src/**'])).toBeUndefined()
  })
})

describe('MOD-2: setHeaderField sets or replaces one field in the brief header', () => {
  const NEW = 'e'.repeat(40)
  const OLD = 'd'.repeat(40)
  const BODY = '\n\n# body\n[[amend v=1 scope+=x reason=y]]\nbase=zzz in prose\n'
  const H = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** red_test="none" gate=prettier spend=10 budget=3-attempts report=chassis.report.v1]]'
  test('a header with no base= gains exactly one, the rest byte-identical', () => {
    const r = setHeaderField(H + BODY, 'base', NEW)
    expect(r.previous).toBeUndefined()
    expect(r.text).toBe(H.replace(' spend=10', ` base=${NEW} spend=10`) + BODY)
    expect(r.text.split('base=').length).toBe(3) // header + the prose line
    expect(parseHeader(r.text)?.fields.base).toBe(NEW)
  })
  test('a header with base=<old> has it replaced, the rest byte-identical, and names the old one', () => {
    const withOld = H.replace(' spend=10', ` base=${OLD} spend=10`) + BODY
    const r = setHeaderField(withOld, 'base', NEW)
    expect(r.previous).toBe(OLD)
    expect(r.text).toBe(withOld.replace(OLD, NEW))
  })
  test('text with no header comes back unchanged', () => {
    expect(setHeaderField('no header', 'base', NEW)).toEqual({ text: 'no header' })
  })
})
