// MOD-413: every stamped ledger row carries the brain's calls by kind (seven kinds), and the scorecard prints a brain calls/card block. Pure, plus the scorecard script over a fixture ledger.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const DRIVE = () => import('../../hooks/lib/drive.ts')
const BRAIN = () => import('../../hooks/lib/brain.ts')
const script = here('../../bin/evidence.mjs')
const F = here('../fixtures/evidence/ledger-f.jsonl')
const LEDGERS = ['a', 'b', 'c', 'd', 'e'].map(x => here(`../fixtures/evidence/ledger-${x}.jsonl`))
const run = (...args) => spawnSync(process.execPath, ['--no-warnings', script, ...args], { encoding: 'utf8' })
const out = (...args) => {
  const r = run(...args)
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}
const turn = { model: 'claude-fable-5-1', input_tokens: 100_000, output_tokens: 10_000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 }

describe('MOD-413: stampKind', () => {
  test('a Read is read; git status and gh pr view 1 are vcs; an Edit is edit', async () => {
    const { stampKind } = await DRIVE()
    expect(stampKind('Read', { file_path: '/a' }, false, false)).toBe('read')
    expect(stampKind('Bash', { command: 'git status' }, false, false)).toBe('vcs')
    expect(stampKind('Bash', { command: 'gh pr view 1' }, false, false)).toBe('vcs')
    expect(stampKind('Edit', { file_path: '/a' }, false, false)).toBe('edit')
  })
  test('a repeated git status (repeat true) is run, the same as callKind says', async () => {
    const { stampKind } = await DRIVE()
    expect(stampKind('Bash', { command: 'git status' }, false, true)).toBe('run')
  })
  test('a Bash git command that writes into the root stays edit', async () => {
    const { stampKind } = await DRIVE()
    expect(stampKind('Bash', { command: 'git commit -m x' }, true, false)).toBe('edit')
  })
  test('a mod tool is mod; ToolSearch and another tool are other', async () => {
    const { stampKind } = await DRIVE()
    expect(stampKind('mcp__chassis-delegation__dispatch', {}, false, false)).toBe('mod')
    expect(stampKind('ToolSearch', {}, false, false)).toBe('other')
    expect(stampKind('mcp__other__thing', {}, false, false)).toBe('other')
  })
  test('a Bash command callKind counts keeps its old kind: node and pnpm are run, not other', async () => {
    const { stampKind } = await DRIVE()
    expect(stampKind('Bash', { command: 'node --version' }, false, false)).toBe('run')
    expect(stampKind('Bash', { command: 'pnpm list' }, false, false)).toBe('run')
  })
})

describe('MOD-413: the counting helpers', () => {
  test('driveCall of mod on no record: mod 1 and the four old counts 0', async () => {
    const { driveCall } = await DRIVE()
    const r = driveCall(undefined, 'mod')
    expect(r.mod).toBe(1)
    expect([r.run, r.read, r.edit, r.spawn]).toEqual([0, 0, 0, 0])
  })
  test('addDrive: a vcs 2 record and one without has vcs 2 and no mod or other key', async () => {
    const { addDrive, emptyDrive } = await DRIVE()
    const r = addDrive({ ...emptyDrive(), vcs: 2 }, emptyDrive())
    expect(r?.vcs).toBe(2)
    expect('mod' in (r ?? {})).toBe(false)
    expect('other' in (r ?? {})).toBe(false)
  })
  test('driveLines of a record with only mod counted is empty', async () => {
    const { driveLines, emptyDrive } = await DRIVE()
    expect(driveLines({ ...emptyDrive(), mod: 2 })).toEqual([])
  })
  test('a record with no mod, vcs or other field reads as before: the old line is unchanged', async () => {
    const { driveLines, emptyDrive } = await DRIVE()
    expect(driveLines({ ...emptyDrive(), run: 3, ctxTokens: 300000, ctxCalls: 3 })).toEqual(['brain calls: 3 run-or-poll · average context 100K per call'])
  })
})

describe('MOD-413: brainStamp with a drive record', () => {
  test('a drive record with read 3 and mod 2 gives the seven calls keys', async () => {
    const { brainStamp, brainTurn } = await BRAIN()
    const { emptyDrive } = await DRIVE()
    const rec = brainTurn(undefined, turn)
    expect(brainStamp(rec, 5, { ...emptyDrive(), read: 3, mod: 2 })?.calls).toEqual({ run: 0, read: 3, edit: 0, spawn: 0, mod: 2, vcs: 0, other: 0 })
  })
  test('with no third argument the stamp has no calls key', async () => {
    const { brainStamp, brainTurn } = await BRAIN()
    const rec = brainTurn(undefined, turn)
    expect('calls' in (brainStamp(rec, 5) ?? {})).toBe(false)
  })
})

describe('MOD-413: the scorecard over ledger-f', () => {
  // Setup opus-5.5/medium: cards F-1 and F-2 (session since 700). F-1's first stamp counts from zero:
  //   run 2, read 4, edit 1, spawn 0, mod 3, vcs 2, other 1. Its merged stamp is the difference:
  //   run 3-2 = 1, read 5-4 = 1, edit 0, spawn 1-0 = 1, mod 4-3 = 1, vcs 3-2 = 1, other 0.
  //   F-1 total: run 3, read 5, edit 1, spawn 1, mod 4, vcs 3, other 1.
  // F-2 is the difference from F-1's merged stamp (the last row with calls): run 5-3 = 2, read 6-5 = 1,
  //   edit 2-1 = 1, spawn 1-1 = 0, mod 5-4 = 1, vcs 4-3 = 1, other 2-1 = 1.
  // Sums over the two cards: run 5, read 6, edit 2, spawn 1, mod 5, vcs 4, other 2; all 25.
  // callCards 2: run 2.5, read 3, edit 1, spawn 0.5, mod 2.5, vcs 2, other 1, all 12.5.
  // Setup fable-5.2/high: card F-3 has pairs only (no calls): callCards 0, callsPerCard null.
  test('brains: callCards and callsPerCard per setup, one decimal; null with no calls', () => {
    const b = out(F).scorecard.brains
    expect(b['opus-5.5/medium'].cards).toBe(2)
    expect(b['opus-5.5/medium'].callCards).toBe(2)
    expect(b['opus-5.5/medium'].callsPerCard).toEqual({ run: 2.5, read: 3, edit: 1, spawn: 0.5, mod: 2.5, vcs: 2, other: 1, all: 12.5 })
    expect(b['fable-5.2/high'].callCards).toBe(0)
    expect(b['fable-5.2/high'].callsPerCard).toBe(null)
  })
  test('--scorecard over ledger-f has one brain calls/card row, for the setup with calls', () => {
    const r = run('--scorecard', F)
    expect(r.status).toBe(0)
    const lines = r.stdout.split('\n')
    const i = lines.findIndex(l => l.startsWith('brain calls/card'))
    expect(i).toBeGreaterThan(-1)
    expect(lines[i]).toContain('git/gh')
    const rows = []
    for (let j = i + 1; j < lines.length && lines[j] !== ''; j++) rows.push(lines[j])
    expect(rows).toHaveLength(1)
    expect(rows[0]).toContain('opus-5.5/medium')
    expect(rows[0]).toContain('12.5')
  })
})

describe('MOD-413: ledgers without calls', () => {
  test('--scorecard over ledgers a to e prints no brain calls block', () => {
    for (const f of LEDGERS) {
      const r = run('--scorecard', f)
      expect(r.status).toBe(0)
      expect(r.stdout.includes('brain calls/card')).toBe(false)
    }
  })
  test('the JSON brains of ledger-e gain callCards 0 and callsPerCard null', () => {
    const b = out(LEDGERS[4]).scorecard.brains
    for (const e of Object.values(b)) {
      expect(e.callCards).toBe(0)
      expect(e.callsPerCard).toBe(null)
    }
  })
})
