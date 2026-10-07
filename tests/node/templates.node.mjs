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
    // no line STARTS with an amend block: the verifier would read it as an amendment of every brief
    expect(t.split('\n').some(l => l.trim().startsWith('[[amend'))).toBe(false)
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
})
