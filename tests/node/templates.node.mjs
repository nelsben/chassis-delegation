// 5C/5E: the templates the mod ships, read from disk (Node only: an engine
// test cannot read files). The brief template is repo-neutral; the debrief
// template carries the same JSON schema as the harness /debrief skill.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8')

describe('5C: hooks/templates/brief.md is repo-neutral', () => {
  test('no product-specific line survives', () => {
    const t = read('hooks/templates/brief.md')
    for (const gone of ['npm ci`', 'keychain', 'vite build', 'chassis protocol', 'post statuses']) {
      expect(t.includes(gone)).toBe(false)
    }
  })
  test('it says: the worktree only, the install step, red first, the gate, commit and hold, never push, the report and amend lines', () => {
    const t = read('hooks/templates/brief.md')
    for (const want of ['{{worktree}}', '{{branch}}', '{{install}}', '{{extra}}', '{{redTest}}', '{{gate}}', '{{body}}', 'never push', '[[report v=1 task={{id}}', '[[amend v=1 scope+=']) {
      expect(t.includes(want)).toBe(true)
    }
    // MOD-12: the worker is told how it started and that the mod sees it
    expect(t.includes("You were started by the brain's own Agent call")).toBe(true)
    // no line STARTS with an amend block: the verifier would read it as an amendment of every brief
    expect(t.split('\n').some(l => l.trim().startsWith('[[amend'))).toBe(false)
  })
  test('MOD-16: it tells the worker its identity, and that the mod already sets it in every Bash call', async () => {
    const { renderSections } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    const lines = t.split('\n').filter(l => l.includes('CHASSIS_SESSION_ID'))
    expect(lines).toHaveLength(1)
    for (const want of ['{{id}}-a<attempt>', 'CHASSIS_TASK', 'CHASSIS_ATTEMPT', 'already exports', 'every Bash call', 'do not set them yourself']) expect(lines[0].includes(want)).toBe(true)
    // both modes carry it, and it is not an amend or report line
    for (const here of [true, false]) {
      const out = renderSections(t, here)
      expect(out.split('\n').filter(l => l.includes('CHASSIS_SESSION_ID'))).toHaveLength(1)
      expect(out.split('\n').some(l => l.includes('CHASSIS_SESSION_ID') && (l.trim().startsWith('[[amend') || l.trim().startsWith('[[report')))).toBe(false)
    }
  })

  test('GH-20: it says to save the red output before any source change, a NEW file per attempt, and to name it red= in the report', () => {
    const t = read('hooks/templates/brief.md')
    for (const want of ['before you change any source', '.delegation/{{id}}/red-<attempt>.txt', 'make the folder', 'gitignored', 'the verifier reads the tree, not git', 'NEW file', 'red=<path>']) {
      expect(t.includes(want)).toBe(true)
    }
    const reportLine = t.split('\n').find(l => l.startsWith('[[report v=1 task={{id}}')) ?? ''
    expect(reportLine.includes(' red=')).toBe(true)
  })

  test('GH-16: a repo=here section says the checkout is shared, touch only your scope, commit only if the card says, report sha=HEAD', async () => {
    const { renderSections } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    const here = renderSections(t, true)
    for (const want of ['repo=here: no worktree', 'You share this checkout with the brain and maybe other workers', 'touch only your scope', 'Do not commit unless the card says so', 'never push', 'branch={{branch}} pr=none sha=HEAD', 'else the short sha you committed']) {
      expect(here.includes(want)).toBe(true)
    }
    for (const gone of ['Work ONLY there', 'Leave the worktree clean', 'sha=<short sha>', '{{#', '{{/']) expect(here.includes(gone)).toBe(false)
    const worktree = renderSections(t, false)
    for (const gone of ['repo=here', 'sha=HEAD', '{{#', '{{/']) expect(worktree.includes(gone)).toBe(false)
    expect(worktree.includes('Work ONLY there')).toBe(true)
    expect(here.split('\n').some(l => l.trim().startsWith('[[amend'))).toBe(false)
  })
})

describe('5E: hooks/templates/debrief.md, the built-in debrief', () => {
  test('the harness schema, and where it writes', () => {
    const t = read('hooks/templates/debrief.md')
    for (const key of ['"session_id"', '"date"', '"summary"', '"outcomes"', '"corrections"', '"tool_denials"', '"stale_memory"', '"proposed_harness_changes"', '"harness_wins"', '"harness_gaps"']) {
      expect(t.includes(key)).toBe(true)
    }
    expect(t.includes('.delegation/debriefs/YYYY-MM-DD-<slug>.json')).toBe(true)
    expect(t.includes('.delegation/ledger.md')).toBe(true)
  })
  test('MOD-6: it documents mod_findings with one example of each kind', () => {
    const t = read('hooks/templates/debrief.md')
    expect(t.includes('"mod_findings"')).toBe(true)
    expect(t.includes('"kind": "went_well"')).toBe(true)
    expect(t.includes('"kind": "went_wrong"')).toBe(true)
  })
})

describe('MOD-21: hooks/templates/review.md, the reviewer prompt', () => {
  // the keys register.ts fills (hooks/lib/review.ts, ReviewVars)
  const KEYS = ['id', 'subtask', 'attempt', 'budget', 'brief', 'worktree', 'branch', 'sha', 'base', 'report', 'handback']

  test('it fills only keys the mod knows, and uses the ones a reviewer cannot do without', () => {
    const t = read('hooks/templates/review.md')
    const used = [...new Set([...t.matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1]))]
    for (const key of used) expect(KEYS.includes(key)).toBe(true)
    for (const key of ['id', 'brief', 'worktree', 'sha', 'report', 'handback']) expect(used.includes(key)).toBe(true)
  })

  test('it says: read the brief, the report and the diff at the sha; one row per claim; the three labels; the deciding command or file:line; edit nothing', () => {
    const t = read('hooks/templates/review.md')
    for (const want of ['the brief', 'the report', 'the diff', 'one row per', 'confirmed', 'refuted', 'unverifiable', 'file:line', 'Edit nothing', 'never fix']) expect(t.includes(want)).toBe(true)
  })

  test('it ends with the review block the mod parses, and no line of it starts as a brief, report or amend block', () => {
    const t = read('hooks/templates/review.md').trimEnd()
    expect(t.split('\n').at(-1)).toBe('[[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N]]')
    for (const line of t.split('\n')) {
      expect(line.trim().startsWith('[[brief')).toBe(false)
      expect(line.trim().startsWith('[[report')).toBe(false)
      expect(line.trim().startsWith('[[amend')).toBe(false)
    }
  })

  test('the row format it asks for is the one the mod reads: a label, a colon, the claim, the evidence', async () => {
    const { reviewRows } = await import('../../hooks/lib/review.ts')
    const t = read('hooks/templates/review.md')
    const example = t.split('\n').filter(l => /^(confirmed|refuted|unverifiable): /.test(l))
    expect(example.map(l => l.split(':')[0])).toEqual(['confirmed', 'refuted', 'unverifiable'])
    expect(reviewRows(example.join('\n')).map(r => r.label)).toEqual(['confirmed', 'refuted', 'unverifiable'])
  })
})
