// 5C/5E: the templates the mod ships, read from disk (Node only: an engine
// test cannot read files). The brief template is repo-neutral; the debrief
// template carries the same JSON schema as the harness /debrief skill.
import { test, expect, describe } from './kit.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8')

describe('MOD-230: the brief tells the worker to re-run a timeout failure once', () => {
  test('every mode that runs the gate carries the sentence', async () => {
    const { renderSections } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    for (const here of [true, false]) {
      const out = renderSections(t, here)
      expect(out.includes('If the gate fails with timeouts (ETIMEDOUT, a test timing out), run it once more on its own before handing back gate=fail, and say in the report that it was re-run.')).toBe(true)
    }
  })
})

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

  test('MOD-59: the rendered brief tells a state check to end its red file with an expected/got line', async () => {
    const { renderSections } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    for (const here of [true, false]) {
      const out = renderSections(t, here)
      expect(out.includes('not a test runner')).toBe(true)
      expect(out.includes('`expected: <the green condition>; got: <what the output shows>`')).toBe(true)
    }
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

describe('MOD-22: the brief template for research cards', () => {
  test('it names the output folder and the scratch folder (helper files never in the repo), and artefacts= and metrics= in the report', async () => {
    const t = read('hooks/templates/brief.md')
    for (const want of ['{{#outdir}}', '{{outdir}}', '{{#scratch}}', '{{scratch}}', 'never in the repo', 'artefacts=', 'metrics=', '{{reportExtra}}', '{{#none}}']) {
      expect(t.includes(want)).toBe(true)
    }
    const { renderBrief, parseCard } = await import('../../hooks/lib/dispatch.ts')
    const card = parseCard('---\nid: OPS-9\ntitle: Extract the model\ndomain: ops\nrepo: none\nscope: [/out/a/**]\nred_test: none\ngate: check\n---\nThe body.\n')
    const base = { card, worktree: '/w/main', branch: 'none', cardPath: '/w/cards/OPS-9.md' }
    const none = renderBrief(t, { ...base, mode: 'none', outdir: '/out/a', scratch: '/tmp/cd/OPS-9', reportExtra: ' artefacts=<paths> metrics="<k=v,k=v>"' })
    for (const want of ['repo=none', 'Output folder: /out/a', 'Scratch: /tmp/cd/OPS-9', 'never in the repo', 'branch=none pr=none sha=none', ' artefacts=<paths> metrics="<k=v,k=v>"]]']) {
      expect(none.includes(want)).toBe(true)
    }
    for (const gone of ['Work ONLY there', 'Install first', 'sha=HEAD', 'sha=<short sha>', 'Leave the worktree clean', '{{#', '{{/', '{{']) expect(none.includes(gone)).toBe(false)
    expect(none.split('\n').some(l => l.trim().startsWith('[[amend'))).toBe(false)
    expect(none.split('\n').filter(l => l.startsWith('[[report v=1 task=OPS-9'))).toHaveLength(1)
    // a plain worktree card renders none of it
    const plain = renderBrief(t, { ...base, branch: 'agent/ops/OPS-9' })
    for (const gone of ['Output folder', 'Scratch:', 'artefacts=', 'repo=none', '{{']) expect(plain.includes(gone)).toBe(false)
    // repo=here with an output folder keeps its own sections and gains the folders
    const here = renderBrief(t, { ...base, mode: 'here', outdir: '/out/a', scratch: '/tmp/cd/OPS-9', reportExtra: ' artefacts=<paths>' })
    for (const want of ['repo=here: no worktree', 'Output folder: /out/a', 'Scratch: /tmp/cd/OPS-9', 'sha=HEAD', ' artefacts=<paths>]]']) expect(here.includes(want)).toBe(true)
    expect(here.includes('repo=none')).toBe(false)
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

describe('MOD-28: what the mod loads is what it ships', () => {
  test('TEMPLATE_FILES names every file under hooks/templates/: a template added there is read at load or this fails', async () => {
    const { TEMPLATE_FILES } = await import('../../hooks/lib/dispatch.ts')
    const onDisk = readdirSync(fileURLToPath(new URL('../../hooks/templates', import.meta.url))).sort()
    expect([...TEMPLATE_FILES].sort()).toEqual(onDisk)
  })

  test('the shipped brief.md renders with no leftover marker in every mode, with and without a spend ceiling and the two folders', async () => {
    const { renderBriefChecked, parseCard } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    const card = parseCard('---\nid: OPS-9\ntitle: Extract the model\ndomain: ops\nrepo: none\nscope: [/out/a/**]\nred_test: none\ngate: check\n---\nThe body quotes {{#none}} and {{/repo}}.\n')
    const base = { card, worktree: '/w/main', branch: 'b', cardPath: '/w/cards/OPS-9.md' }
    for (const mode of ['worktree', 'here', 'none']) {
      for (const spend of [0, 6]) {
        for (const folders of [{}, { outdir: '/out/a', scratch: '/tmp/cd/OPS-9', reportExtra: ' artefacts=<paths>' }]) {
          const out = renderBriefChecked(t, { ...base, mode, spend, ...folders })
          expect(out.leftover).toBeUndefined()
        }
      }
    }
  })

  test('the shipped review.md uses only keys the reviewer spawn fills, and debrief.md carries no {{ marker at all', () => {
    const filled = ['id', 'subtask', 'attempt', 'budget', 'brief', 'worktree', 'branch', 'sha', 'base', 'report', 'handback']
    const keys = [...read('hooks/templates/review.md').matchAll(/\{\{(\w+)\}\}/g)].map(m => m[1])
    for (const k of keys) expect(filled.includes(k)).toBe(true)
    expect(read('hooks/templates/debrief.md').includes('{{')).toBe(false)
  })
})

describe('MOD-120 (#199 item 1): the brief shows the gate as the command it is judged by', () => {
  test('{worktree}, {outdir} and {files} are filled, with one line to write the file; no {files} no line', async () => {
    const { renderBrief, parseCard, gateLineText } = await import('../../hooks/lib/dispatch.ts')
    const t = read('hooks/templates/brief.md')
    const map = { test: 'node run.mjs {files}', pack: 'bash pack.sh {worktree} {outdir}', plain: 'claude plugin validate {worktree}' }
    const g = gateLineText(['test', 'pack', 'nomap'], map, { worktree: '/w/T-1', outdir: '/out/a', filesPath: '/s/T-1/files.txt', base: 'origin/main' })
    expect(g.gate).toBe('test (`node run.mjs /s/T-1/files.txt`), pack (`bash pack.sh /w/T-1 /out/a`), nomap')
    expect(g.note.startsWith(' ')).toBe(true)
    expect(g.note).toContain('git diff --name-only origin/main')
    expect(g.note).toContain('/s/T-1/files.txt')
    expect(g.note).toContain('one path a line')
    expect(gateLineText(['plain'], map, { worktree: '/w/T-1', filesPath: '/s/T-1/files.txt' })).toEqual({ gate: 'plain (`claude plugin validate /w/T-1`)', note: '' })
    const card = parseCard('---\nid: OPS-9\ntitle: T\ndomain: ops\nscope: [a/**]\nred_test: x\ngate: test\n---\nB\n')
    const base = { card: { ...card, gateText: g.gate }, worktree: '/w/T-1', branch: 'agent/ops/OPS-9', cardPath: '/c.md', gateNote: g.note }
    for (const mode of ['worktree', 'here', 'none']) {
      const out = renderBrief(t, { ...base, mode })
      expect(out.includes('node run.mjs /s/T-1/files.txt')).toBe(true)
      expect(out.includes('git diff --name-only origin/main')).toBe(true)
      expect(out.includes('{{')).toBe(false)
    }
    expect(renderBrief(t, { ...base, mode: 'worktree', gateNote: '' }).includes('git diff --name-only')).toBe(false)
  })
})
