// bin/evidence.mjs --by-repo and --all <folder>. Node only: it spawns the script.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const script = here('../../bin/evidence.mjs')
const E = here('../fixtures/evidence/ledger-e.jsonl')
const run = (...args) => spawnSync(process.execPath, ['--no-warnings', script, ...args], { encoding: 'utf8' })

// a second repo: two cards run on one setup the first repo only partly used
const rowsB = [
  { task: 'X-1', subtask: 'main', lineage: 1, event: 'spawn', attempt: 1, alias: 'sonnet', at: 1794301200000, brain: { since: 700, usd: 1, turns: 2, compactions: 0, edits: 0, pairs: { 'fable-5.2/high': { usd: 1, turns: 2, steps: 4, ctx: 400000 } } } },
  { task: 'X-1', subtask: 'main', lineage: 1, attempt: 1, verdict: 'consistent', alias: 'sonnet', usd: 1, at: 1794303000000, brain: { since: 700, usd: 3, turns: 4, compactions: 0, edits: 0, pairs: { 'fable-5.2/high': { usd: 3, turns: 4, steps: 8, ctx: 900000 } } } },
  { task: 'X-2', subtask: 'main', lineage: 1, attempt: 1, verdict: 'refuted', alias: 'sonnet', usd: 1, at: 1794306000000, brain: { since: 700, usd: 4, turns: 5, compactions: 0, edits: 0, pairs: { 'fable-5.2/high': { usd: 4, turns: 5, steps: 10, ctx: 1100000 } } } },
].map(r => JSON.stringify(r)).join('\n') + '\n'

const tmp = mkdtempSync(join(tmpdir(), 'evrepo-'))
const ledgerB = join(tmp, 'zz-repo-b-ledger.jsonl')
writeFileSync(ledgerB, rowsB)
const folder = join(tmp, 'folder')
for (const [name, src] of [['alpha-secret', 'E'], ['omega-secret', 'B']]) {
  mkdirSync(join(folder, name, '.delegation'), { recursive: true })
  if (src === 'E') copyFileSync(E, join(folder, name, '.delegation', 'ledger.jsonl'))
  else writeFileSync(join(folder, name, '.delegation', 'ledger.jsonl'), rowsB)
}
mkdirSync(join(folder, 'empty-repo', '.delegation'), { recursive: true })

describe('bin/evidence.mjs --by-repo and --all', () => {
  test('--by-repo prints a brain by repo block with a row per repo and setup, no path', () => {
    const r = run('--scorecard', '--by-repo', E, ledgerB)
    expect(r.status).toBe(0)
    const lines = r.stdout.split('\n')
    const at = lines.indexOf('brain by repo')
    expect(at > 0).toBe(true)
    expect(lines[at - 1]).toBe('')
    const rows = lines.slice(at + 1).filter(l => l.trim())
    expect(rows[0].trim().startsWith('repo')).toBe(true)
    const a = rows.filter(l => l.startsWith('A '))
    const b = rows.filter(l => l.startsWith('B '))
    expect(a.length).toBe(2)
    expect(b.length).toBe(1)
    expect(a[0].includes('opus-5.5/medium') && a[0].includes('1/2 50%')).toBe(true)
    expect(b[0].includes('fable-5.2/high') && b[0].includes('1/2 50%')).toBe(true)
    expect(r.stdout.includes(tmp)).toBe(false)
    expect(r.stdout.includes('zz-repo-b')).toBe(false)
  })
  test('--scorecard alone prints no brain by repo line', () => {
    const r = run('--scorecard', E, ledgerB)
    expect(r.status).toBe(0)
    expect(r.stdout.includes('brain by repo')).toBe(false)
  })
  test('--by-repo without --scorecard is a usage error', () => {
    expect(run('--by-repo', E).status).toBe(2)
  })
  test('--scorecard --all reads every ledger one level down, in sorted order', () => {
    const r = run('--scorecard', '--by-repo', '--all', folder)
    expect(r.status).toBe(0)
    const [first, ...rest] = r.stdout.split('\n')
    expect(first).toBe('ledgers: 2')
    const files = run('--scorecard', '--by-repo', E, ledgerB)
    expect(rest.join('\n')).toBe(files.stdout)
    expect(r.stdout.includes('secret')).toBe(false)
  })
  test('--all with a ledger path as well is a usage error', () => {
    const r = run('--all', folder, E)
    expect(r.status).toBe(2)
    expect(r.stderr).toBe('usage: node bin/evidence.mjs [--scorecard [--by-repo]] (<ledger.jsonl>... | --all <folder>)\n')
  })
  test('--all over a folder with no ledgers exits 1', () => {
    const empty = join(tmp, 'nothing')
    mkdirSync(empty)
    const r = run('--all', empty)
    expect(r.status).toBe(1)
    expect(r.stderr).toBe('error: no ledgers under the folder given\n')
  })
})
