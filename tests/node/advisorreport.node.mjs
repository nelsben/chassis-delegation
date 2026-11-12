// bin/advisor.mjs: session transcripts and ledgers in, one anonymized JSON summary of advisor use out. Node only: it spawns the script.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const script = here('../../bin/advisor.mjs')
const PROJECTS = here('../fixtures/advisor/projects')
const LEDGER = here('../fixtures/advisor/ledger.jsonl')
const run = (...args) => spawnSync(process.execPath, ['--no-warnings', script, ...args], { encoding: 'utf8' })
const out = (...args) => {
  const r = run(...args)
  if (r.status !== 0) throw new Error(`exit ${r.status}: ${r.stderr}`)
  return JSON.parse(r.stdout)
}

const msgRow = (id, ts, model, iters, block = { type: 'text', text: 'x' }) =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model, usage: { input_tokens: 4, output_tokens: 10, iterations: iters }, content: [block] } })
const call = (model, i, o, cr = 0, cc = 0) => ({ type: 'advisor_message', model, input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cc })
const plain = { type: 'message', input_tokens: 2, output_tokens: 100 }
// a scratch projects folder: files is { 'proj/sess.jsonl': [lines] }
const tree = files => {
  const root = mkdtempSync(join(tmpdir(), 'advisor-test-'))
  for (const [rel, lines] of Object.entries(files)) {
    const p = join(root, rel)
    mkdirSync(join(p, '..'), { recursive: true })
    writeFileSync(p, lines.join('\n') + '\n')
  }
  return root
}

const STAT = '2026-11-11T02:14:07Z'

describe('bin/advisor.mjs', () => {
  test('the fixture folder prints the whole documented JSON', () => {
    expect(out(PROJECTS)).toEqual({
      window: { first: '2026-11-10', last: '2026-11-11' },
      files: 2, sessions: 1, skippedLines: 0, unpriced: 1, uncounted: 0,
      totals: { calls: 5, usd: 0.88, in: 91430, out: 5510, self: 1 },
      sides: { main: { calls: 4, usd: 0.63 }, subagent: { calls: 1, usd: 0.25 } },
      callers: { haiku: { calls: 1, usd: 0 }, opus: { calls: 3, usd: 0.63 }, sonnet: { calls: 1, usd: 0.25 } },
      advisors: { fable: { calls: 3, usd: 0.8 }, opus: { calls: 1, usd: 0.07 }, other: { calls: 1, usd: 0 } },
      days: { '2026-11-10': { calls: 2, usd: 0.12 }, '2026-11-11': { calls: 3, usd: 0.76 } },
      projects: { A: { calls: 5, usd: 0.88 } },
    })
  })
  test('the output keys are sorted', () => {
    const j = out(PROJECTS, '--ledger', LEDGER)
    expect(Object.keys(j)).toEqual(Object.keys(j).slice().sort())
  })
  test('a message written as three rows is one call; two advisor entries in one message are two calls', () => {
    const j = out(PROJECTS)
    expect(j.days['2026-11-11'].calls).toBe(3) // msg_01 (three rows), msg_03, the subagent call
    expect(j.days['2026-11-10'].calls).toBe(2) // msg_02 holds two entries
  })
  test('a broken line holding the marker counts as skipped; one without it does not', () => {
    const root = tree({
      'p/s.jsonl': [
        msgRow('m1', STAT, 'claude-opus-5-5', [plain, call('claude-fable-5-2', 100, 10)]),
        '{"advisor_message": broken',
        '{ broken but without the word',
      ],
    })
    const j = out(root)
    expect(j.skippedLines).toBe(1)
    expect(j.totals.calls).toBe(1)
  })
  test('a message with an advisor_tool_result block and no advisor_message entry is uncounted', () => {
    const root = tree({
      'p/s.jsonl': [
        msgRow('m1', STAT, 'claude-opus-5-5', [plain, call('claude-fable-5-2', 100, 10)], { type: 'advisor_tool_result', content: {} }),
        msgRow('m2', STAT, 'claude-opus-5-5', [plain], { type: 'advisor_tool_result', content: {} }),
        msgRow('m2', STAT, 'claude-opus-5-5', [plain], { type: 'advisor_tool_result', content: {} }),
      ],
    })
    const j = out(root)
    expect(j.uncounted).toBe(1)
    expect(j.totals.calls).toBe(1)
  })
  test('--since drops the earlier day', () => {
    const j = out('--since', '2026-11-11', PROJECTS)
    expect(j.window).toEqual({ first: '2026-11-11', last: '2026-11-11' })
    expect(j.totals.calls).toBe(3)
    expect(Object.keys(j.days)).toEqual(['2026-11-11'])
    expect(j.totals.self).toBe(0)
  })
  test('an unpriced advisor model is counted, not priced', () => {
    const j = out(PROJECTS)
    expect(j.unpriced).toBe(1)
    expect(j.advisors.other).toEqual({ calls: 1, usd: 0 })
  })
  test('a self call is an opus caller with an opus advisor', () => {
    expect(out(PROJECTS).totals.self).toBe(1)
  })
  test('projects are lettered in the sorted order of the folders, and sessions are distinct ids', () => {
    const l = msgRow('m1', STAT, 'claude-opus-5-5', [plain, call('claude-fable-5-2', 1000000, 0)])
    const root = tree({
      'zz/s1.jsonl': [l],
      'aa/s2.jsonl': [l, msgRow('m2', STAT, 'claude-opus-5-5', [plain, call('claude-fable-5-2', 1000000, 0)])],
      'aa/s2/subagents/agent-x.jsonl': [l],
    })
    const j = out(root)
    expect(j.sessions).toBe(2)
    expect(j.files).toBe(3)
    expect(j.projects).toEqual({ A: { calls: 3, usd: 24 }, B: { calls: 1, usd: 8 } })
    expect(j.sides).toEqual({ main: { calls: 3, usd: 24 }, subagent: { calls: 1, usd: 8 } })
  })
  test('ledgers give carded, rules (a hand-set rule left out) and cues, compared whole', () => {
    const j = out(PROJECTS, '--ledger', LEDGER)
    expect(j.carded).toEqual({ calls: 4, usd: 2 })
    expect(j.rules).toEqual({
      frontier: {
        none: { attempts: 1, consistent: 0, usd: 6, calls: 0, over: 0, changed: 0, noChange: 0 },
        once: { attempts: 2, consistent: 2, usd: 9, calls: 3, over: 1, changed: 1, noChange: 1 },
      },
      standard: { none: { attempts: 1, consistent: 1, usd: 1, calls: 0, over: 0, changed: 0, noChange: 0 } },
    })
    // T-1 followed inside 15 minutes (and merged); T-4's window holds only that call, already taken; T-2 not followed (merged); T-3's session file was not read
    expect(j.cues).toEqual({
      refute2: { raised: 3, followed: 1, mergedFollowed: 1, mergedNot: 1 },
      stuck: { raised: 1, followed: 0, mergedFollowed: 0, mergedNot: 0 },
    })
  })
  test('carded, rules and cues are absent without a ledger', () => {
    const j = out(PROJECTS)
    expect(Object.keys(j).includes('carded') || Object.keys(j).includes('rules') || Object.keys(j).includes('cues')).toBe(false)
  })
  test('--since leaves out ledger rows before it', () => {
    const j = out('--since', '2026-11-11', PROJECTS, '--ledger', LEDGER)
    expect(j.carded).toEqual({ calls: 1, usd: 0.25 })
    expect(j.rules.frontier).toBe(undefined)
  })
  test('a ledger line that is not JSON adds to skippedLines', () => {
    const root = tree({ 'p/s.jsonl': [msgRow('m1', STAT, 'claude-opus-5-5', [plain, call('claude-fable-5-2', 100, 10)])] })
    const l = join(root, 'bad-ledger.jsonl')
    writeFileSync(l, 'not json\n{"kind":"advisor-cue","cue":"x","task":"T","at":1}\n')
    const j = out(join(root, 'p'), '--ledger', l)
    expect(j.skippedLines).toBe(1)
    expect(j.cues.x.raised).toBe(1)
  })
  test('no call at all gives a null window', () => {
    const root = tree({ 'p/s.jsonl': [JSON.stringify({ type: 'user', message: { content: 'hi' } })] })
    const j = out(root)
    expect(j.window).toBe(null)
    expect(j.totals.calls).toBe(0)
    expect(j.files).toBe(1)
  })
  test('the script prices the three advisor models as hooks/lib/cost.ts does', async () => {
    const { priceFor } = await import('../../hooks/lib/cost.ts')
    // one million tokens of each kind on each model: dollars are in + out + cache read, and cache creation priced as input
    const rows = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5'].map((m, i) =>
      msgRow(`m${i}`, STAT, 'claude-sonnet-5-5', [plain, call(m, 1e6, 1e6, 1e6, 1e6)]))
    const j = out(tree({ 'p/s.jsonl': rows }))
    const want = ['claude-fable-5-2', 'claude-fable-5-1', 'claude-opus-5-5'].reduce((s, m) => {
      const p = priceFor(m)
      return s + p.in * 2 + p.out + p.cacheRead
    }, 0)
    expect(j.totals.usd).toBe(Math.round(want * 100) / 100)
  })
  test('the output holds none of the fixture folder names, session ids or task ids', () => {
    const r = run(PROJECTS, '--ledger', LEDGER)
    for (const s of ['zeta', 'zeta-project', 'sess-aaaa', 'sess-unread', 'agent-ag1', 'ag1', 'T-1', 'jsonl', '/']) expect(r.stdout.includes(s)).toBe(false)
    const t = run('--text', PROJECTS, '--ledger', LEDGER)
    for (const s of ['zeta', 'sess-aaaa', 'sess-unread', 'agent-ag1', 'T-1', 'jsonl']) expect(t.stdout.includes(s)).toBe(false)
  })
  test('--text prints a totals line then a line per key of sides, callers, days, rules and cues', () => {
    const r = run('--text', PROJECTS, '--ledger', LEDGER)
    expect(r.status).toBe(0)
    const lines = r.stdout.trim().split('\n')
    expect(lines[0]).toContain('calls 5')
    expect(lines.length).toBe(1 + 2 + 3 + 2 + 3 + 2)
    expect(lines.some(l => l.startsWith('rules frontier once'))).toBe(true)
    expect(lines.some(l => l.startsWith('cues refute2'))).toBe(true)
  })
  test('no argument, an unknown flag and a bad date exit 2 with the usage line', () => {
    for (const args of [[], ['--nope', PROJECTS], ['--since', '11/11/2026', PROJECTS], ['--since'], ['--ledger']]) {
      const r = run(...args)
      expect(r.status).toBe(2)
      expect(r.stderr).toContain('usage: node bin/advisor.mjs')
      expect(r.stdout).toBe('')
    }
  })
  test('it reads only what it is given and writes nothing', () => {
    const before = readFileSync(LEDGER, 'utf8')
    out(PROJECTS, '--ledger', LEDGER)
    expect(readFileSync(LEDGER, 'utf8')).toBe(before)
  })
})
