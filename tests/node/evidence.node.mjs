// bin/evidence.mjs: ledgers in, one anonymized JSON summary out. Node only: it spawns the script.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const script = here('../../bin/evidence.mjs')
const A = here('../fixtures/evidence/ledger-a.jsonl')
const B = here('../fixtures/evidence/ledger-b.jsonl')
const C = here('../fixtures/evidence/ledger-c.jsonl')
const run = (...args) => spawnSync(process.execPath, ['--no-warnings', script, ...args], { encoding: 'utf8' })
const out = (...args) => {
  const r = run(...args)
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

describe('bin/evidence.mjs', () => {
  test('prints the documented shape for two ledgers', () => {
    const j = out(A, B)
    expect(j.window).toEqual({ first: '2026-10-01', last: '2026-10-02' })
    expect(j.skippedLines).toBe(1)
    expect(j.totals).toEqual({ tasks: 4, judged: 6, usd: 6, accepted: 1, merged: 1 })
    expect(Object.keys(j).sort()).toEqual(['attempts', 'days', 'firstAttempt', 'repos', 'scorecard', 'skippedLines', 'tiers', 'totals', 'verdicts', 'window'])
  })
  test('folds verdicts: last judged attempt per task, verified counts as consistent', () => {
    const j = out(A, B)
    expect(j.verdicts).toEqual({ consistent: 3, refuted: 1 })
    expect(j.attempts).toEqual({ '1': 2, '2': 2 })
  })
  test('last row by at wins for a repeated task/subtask/lineage/attempt', () => {
    const j = out(A)
    // ALP-2 attempt 1 was judged unverified, then verified (= consistent) later
    expect(j.verdicts).toEqual({ consistent: 2 })
    expect(j.totals.judged).toBe(3)
    expect(j.firstAttempt).toEqual({ consistent: 1, judged: 2 })
  })
  test('spawn, accept and merged rows are not attempts', () => {
    const j = out(A)
    expect(j.totals.judged).toBe(3)
    expect(j.totals.usd).toBe(4)
    expect(j.repos.A.judged).toBe(3)
    expect(j.totals.accepted).toBe(1)
    expect(j.totals.merged).toBe(1)
  })
  test('tiers, days and repos', () => {
    const j = out(A, B)
    expect(j.tiers.sonnet).toEqual({ n: 5, meanUsd: 1.15, medianMin: 8, p90Min: 20, consistent: 2 })
    expect(j.tiers.opus).toEqual({ n: 1, meanUsd: 0.5, medianMin: 10, p90Min: 10, consistent: 1 })
    expect(j.days['2026-10-01']).toEqual({ judged: 3, refuted: 1, usd: 4.23 })
    expect(j.days['2026-10-02']).toEqual({ judged: 3, refuted: 1, usd: 2 })
    expect(j.repos.B.tasks).toBe(2)
    expect(j.repos.B.verdicts).toEqual({ consistent: 1, refuted: 1 })
    expect(j.repos.B.judged).toBe(3)
    expect(j.repos.A.first).toBe('2026-10-01')
    expect(j.repos.B.first).toBe('2026-10-02')
  })
  test('the output holds no path, id, sha, session or free text from the ledgers', () => {
    const text = run(A, B).stdout
    const secrets = new Set()
    for (const f of [A, B]) {
      for (const line of readFileSync(f, 'utf8').split('\n')) {
        let r
        try { r = JSON.parse(line) } catch { continue }
        for (const k of ['task', 'sha', 'sessionId', 'agentId', 'toolUseId', 'briefPath', 'next', 'description', 'how', 'cwd', 'repo']) {
          if (typeof r[k] === 'string' && r[k].length > 0 && !['merged'].includes(r[k])) secrets.add(r[k])
        }
      }
    }
    expect(secrets.size > 10).toBe(true)
    for (const s of secrets) expect(text.includes(s)).toBe(false)
    expect(text.includes('/home/')).toBe(false)
  })
  test('a malformed line is skipped and counted', () => {
    expect(out(B).skippedLines).toBe(1)
    expect(out(A).skippedLines).toBe(0)
  })
  test('a missing file names its position, not its path, and exits 1', () => {
    const r = run(A, '/nonexistent/zebra.jsonl')
    expect(r.status).toBe(1)
    expect(r.stderr).toContain('argument 2')
    expect(r.stderr.includes('zebra')).toBe(false)
  })
  test('no arguments print a usage line to stderr and exit 2', () => {
    const r = run()
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('usage')
    expect(r.stdout).toBe('')
  })
  test('scorecard: the weeks and models of ledger-c', () => {
    const s = out(C).scorecard
    expect(Object.keys(s.weeks)).toEqual(['2026-W45', '2026-W46'])
    expect(s.weeks['2026-W45']).toEqual({ cards: 3, firstTry: 2, firstTryStrict: 1, rework: 1, usd: 4, choicesStated: 2, choicesMean: 1, linkedKnown: 2, linked: 1, fixCards: 0, escaped: 0, merged: 2, brainUsd: 5, brainShare: 0.56 })
    expect(s.weeks['2026-W46']).toEqual({ cards: 2, firstTry: 2, firstTryStrict: 2, rework: 0, usd: 2, choicesStated: 1, choicesMean: 4, linkedKnown: 2, linked: 2, fixCards: 2, escaped: 2, merged: 0, brainUsd: 1, brainShare: 0.33 })
    expect(Object.keys(s.models)).toEqual(['haiku', 'sonnet'])
    expect(s.models.sonnet).toEqual({ cards: 4, firstTry: 4, firstTryStrict: 3, rework: 0, usd: 5, choicesStated: 3, choicesMean: 2 })
    expect(s.models.haiku).toEqual({ cards: 1, firstTry: 0, firstTryStrict: 0, rework: 1, usd: 1, choicesStated: 0, choicesMean: null })
  })
  test('scorecard: a ledger without the new fields reads zero on them, and its cards add up', () => {
    const s = out(A, B).scorecard
    const weeks = Object.values(s.weeks)
    expect(weeks.length > 0).toBe(true)
    for (const w of weeks) {
      expect({ choicesStated: w.choicesStated, choicesMean: w.choicesMean, linkedKnown: w.linkedKnown, fixCards: w.fixCards, escaped: w.escaped, brainUsd: w.brainUsd, brainShare: w.brainShare })
        .toEqual({ choicesStated: 0, choicesMean: null, linkedKnown: 0, fixCards: 0, escaped: 0, brainUsd: null, brainShare: null })
    }
    // ALP-1, ALP-2, BET-7 and BET-8 each have a judged attempt 1
    expect(weeks.reduce((n, w) => n + w.cards, 0)).toBe(4)
  })
  test('--scorecard prints text, not JSON: a header, one line per week oldest first, then one per model', () => {
    const r = run('--scorecard', C)
    expect(r.status).toBe(0)
    let isJson = true
    try { JSON.parse(r.stdout) } catch { isJson = false }
    expect(isJson).toBe(false)
    const lines = r.stdout.split('\n')
    expect(lines.some(l => l.startsWith('2026-W45') && l.includes('2/3 67%'))).toBe(true)
    expect(lines.some(l => l.startsWith('2026-W46'))).toBe(true)
    expect(lines.findIndex(l => l.startsWith('2026-W45'))).toBeLessThan(lines.findIndex(l => l.startsWith('2026-W46')))
    expect(lines.some(l => l.trim().split(/\s+/)[0] === 'sonnet')).toBe(true)
    expect(lines.some(l => l.trim().split(/\s+/)[0] === 'haiku')).toBe(true)
    expect(r.stdout.includes('T-1')).toBe(false)
  })
  test('--scorecard over an empty ledger prints no judged attempts', () => {
    const r = run('--scorecard', '/dev/null')
    expect(r.status).toBe(0)
    expect(r.stdout).toBe('no judged attempts\n')
  })
  test('an unknown -- argument exits 2 with the usage line on stderr', () => {
    const r = run('--nope', C)
    expect(r.status).toBe(2)
    expect(r.stderr).toContain('usage: node bin/evidence.mjs [--scorecard] <ledger.jsonl> [<ledger.jsonl>...]')
    expect(r.stdout).toBe('')
  })
})
