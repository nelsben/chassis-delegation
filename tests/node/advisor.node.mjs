// MOD-365: a worker's advisor calls, read from its transcript. Pure.
import { test, expect, describe } from './kit.mjs'

const A = () => import('../../hooks/lib/advisor.ts')
const COST = () => import('../../hooks/lib/cost.ts')

const row = (id, ts, iters, block = { type: 'text', text: 'x' }, extra = {}) =>
  JSON.stringify({ type: 'assistant', ...(ts === undefined ? {} : { timestamp: ts }), message: { id, model: 'claude-opus-5-5', content: [block], usage: { input_tokens: 12, output_tokens: 900, cache_read_input_tokens: 80000, cache_creation_input_tokens: 4000, iterations: iters }, ...extra } })
const adv = (model, i, o, cr = 0, cc = 0) => ({ type: 'advisor_message', ...(model === undefined ? {} : { model }), input_tokens: i, output_tokens: o, cache_read_input_tokens: cr, cache_creation_input_tokens: cc })
const msg = { type: 'message', input_tokens: 12, output_tokens: 300 }
const T1 = '2026-11-11T04:32:21.704Z'
const T2 = '2026-11-11T05:00:00.000Z'

describe('MOD-365: advisorUse', () => {
  test('the real shape: four rows of one message id are one call', async () => {
    const { advisorUse } = await A()
    const { usdOf, priceFor } = await COST()
    const iters = [msg, adv('claude-fable-5-2', 88102, 7654), { type: 'message', input_tokens: 0, output_tokens: 600 }]
    const jsonl = [
      row('msg_01', T1, iters, { type: 'thinking', thinking: '' }),
      row('msg_01', T1, iters, { type: 'text', text: 'a' }),
      row('msg_01', T1, iters, { type: 'server_tool_use', id: 's', name: 'advisor', input: {} }),
      row('msg_01', T1, iters, { type: 'text', text: 'b' }),
    ].join('\n')
    const usd = Math.round(usdOf({ in: 88102, out: 7654, cacheRead: 0, cacheWrite: 0 }, priceFor('claude-fable-5-2')) * 1e4) / 1e4
    expect(advisorUse(jsonl)).toEqual({ calls: 1, usd, in: 88102, out: 7654, models: ['claude-fable-5-2'] })
  })
  test('two messages with one call each are summed', async () => {
    const { advisorUse } = await A()
    const { usdOf, priceFor } = await COST()
    const jsonl = [row('m1', T1, [adv('claude-fable-5-2', 1000, 100, 500, 50)]), row('m2', T2, [adv('claude-fable-5-2', 2000, 200)])].join('\n')
    const p = priceFor('claude-fable-5-2')
    const usd = Math.round((usdOf({ in: 1000, out: 100, cacheRead: 500, cacheWrite: 50 }, p) + usdOf({ in: 2000, out: 200, cacheRead: 0, cacheWrite: 0 }, p)) * 1e4) / 1e4
    expect(advisorUse(jsonl)).toEqual({ calls: 2, usd, in: 1000 + 500 + 50 + 2000, out: 300, models: ['claude-fable-5-2'] })
  })
  test('a message with only worker iterations is no call', async () => {
    const { advisorUse } = await A()
    expect(advisorUse(row('m1', T1, [msg, msg]))).toEqual({ calls: 0, usd: 0, in: 0, out: 0, models: [] })
  })
  test('sinceMs keeps the later message; a row with no timestamp is dropped when sinceMs is given, kept when not', async () => {
    const { advisorUse } = await A()
    const jsonl = [row('m1', T1, [adv('claude-fable-5-2', 100, 10)]), row('m2', T2, [adv('claude-fable-5-2', 200, 20)]), row('m3', undefined, [adv('claude-fable-5-2', 400, 40)])].join('\n')
    const between = Date.parse('2026-11-11T04:45:00.000Z')
    expect(advisorUse(jsonl, between).calls).toBe(1)
    expect(advisorUse(jsonl, between).in).toBe(200)
    expect(advisorUse(jsonl).calls).toBe(3)
    expect(advisorUse(jsonl).in).toBe(700)
  })
  test('a model the table does not price: usd null, the call still counted; an entry with no model is unknown', async () => {
    const { advisorUse } = await A()
    expect(advisorUse(row('m1', T1, [adv('claude-mystery-9', 100, 10)]))).toEqual({ calls: 1, usd: null, in: 100, out: 10, models: ['claude-mystery-9'] })
    expect(advisorUse(row('m1', T1, [adv(undefined, 100, 10)]))).toEqual({ calls: 1, usd: null, in: 100, out: 10, models: ['unknown'] })
  })
  test('blank lines, non-JSON, user rows and rows with no usage are skipped', async () => {
    const { advisorUse } = await A()
    const jsonl = ['', 'not json', '[1]', JSON.stringify({ type: 'user', message: { id: 'u1', usage: { iterations: [adv('claude-fable-5-2', 1, 1)] } } }), JSON.stringify({ type: 'assistant', timestamp: T1, message: { id: 'n1', content: [] } }), row('m1', T1, [adv('claude-fable-5-2', 100, 10)])].join('\n')
    expect(advisorUse(jsonl).calls).toBe(1)
  })
})

describe('MOD-365: workerTranscriptPath and advisorPart', () => {
  test('the path drops the dots and spaces of the root, the trailing slash of both', async () => {
    const { workerTranscriptPath } = await A()
    expect(workerTranscriptPath('/Users/me/', '/Users/me/My Docs/a.b/', 'sess-1', 'ag9')).toBe('/Users/me/.claude/projects/-Users-me-My-Docs-a-b/sess-1/subagents/agent-ag9.jsonl')
  })
  test('advisorPart', async () => {
    const { advisorPart } = await A()
    expect(advisorPart(undefined)).toBe('')
    expect(advisorPart({ calls: 0, usd: 0 })).toBe('')
    expect(advisorPart({ calls: 1, usd: 1.839 })).toBe(' · advisor 1 call $1.84')
    expect(advisorPart({ calls: 2, usd: 3 })).toBe(' · advisor 2 calls $3.00')
    expect(advisorPart({ calls: 2, usd: null })).toBe(' · advisor 2 calls $?')
  })
})

// MOD-366: the advisor rule a brief carries.
const draw = async (id) => {
  const { fnv1a32 } = await import('../../hooks/lib/explore.ts')
  return fnv1a32('advisor:' + id) % 2 === 0 ? 'once' : 'none'
}

describe('MOD-366: advisorRuleOf', () => {
  test('economy, standard, premium and an unknown tier with no field are none from the tier', async () => {
    const { advisorRuleOf } = await A()
    for (const tier of ['economy', 'standard', 'premium', 'wide']) expect(advisorRuleOf(tier, undefined, 'T-1')).toEqual({ rule: 'none', source: 'tier' })
  })
  test('a frontier card is split by its id, the same answer every time', async () => {
    const { advisorRuleOf } = await A()
    let once
    let none
    for (let i = 1; i <= 200 && (!once || !none); i++) {
      const id = `T-${i}`
      if ((await draw(id)) === 'once') once ??= id
      else none ??= id
    }
    expect(advisorRuleOf('frontier', undefined, once)).toEqual({ rule: 'once', source: 'split' })
    expect(advisorRuleOf('frontier', undefined, once)).toEqual({ rule: 'once', source: 'split' })
    expect(advisorRuleOf('frontier', undefined, none)).toEqual({ rule: 'none', source: 'split' })
    expect(advisorRuleOf('frontier', '', none)).toEqual({ rule: 'none', source: 'split' })
  })
  test('of T-1 to T-200 on a frontier card, 80 to 120 draw once', async () => {
    const { advisorRuleOf } = await A()
    let n = 0
    for (let i = 1; i <= 200; i++) if (advisorRuleOf('frontier', undefined, `T-${i}`).rule === 'once') n += 1
    expect(n >= 80 && n <= 120).toBe(true)
  })
  test('the card field wins when it is one of the two words', async () => {
    const { advisorRuleOf } = await A()
    expect(advisorRuleOf('economy', 'once', 'T-1')).toEqual({ rule: 'once', source: 'card' })
    expect(advisorRuleOf('frontier', 'none', 'T-1')).toEqual({ rule: 'none', source: 'card' })
    expect(advisorRuleOf('standard', ' Once ', 'T-1')).toEqual({ rule: 'once', source: 'card' })
  })
  test('an empty string, a number or another word falls to the tier', async () => {
    const { advisorRuleOf } = await A()
    expect(advisorRuleOf('standard', '', 'T-1')).toEqual({ rule: 'none', source: 'tier' })
    expect(advisorRuleOf('standard', 1, 'T-1')).toEqual({ rule: 'none', source: 'tier' })
    expect(advisorRuleOf('standard', 'twice', 'T-1')).toEqual({ rule: 'none', source: 'tier' })
  })
})

describe('MOD-366: the advisor lines', () => {
  test('the two rule lines, exactly', async () => {
    const { advisorRuleLine, ADVISOR_RULES } = await A()
    expect(ADVISOR_RULES).toEqual(['none', 'once'])
    expect(advisorRuleLine('none')).toBe('- Advisor: do not call the advisor tool, if you have one. The card is the plan: decide what it leaves open and list it as a choice, or hand back with the question.')
    expect(advisorRuleLine('once')).toBe('- Advisor: if you have an advisor tool you may call it once, after you have read the card and the files it names and before you change any file. Do not call it again, and not before you hand back: the verifier and the review check the work. If you called it, put one line in your hand-back: `advisor: changed <what you did differently>` or `advisor: no change`.')
  })
  test('the refusal, exactly', async () => {
    const { advisorFieldRefusal } = await A()
    expect(advisorFieldRefusal('twice')).toBe('refused: advisor: twice on the card; it takes none or once')
  })
  test('advisorAllowed and advisorOverLine', async () => {
    const { advisorAllowed, advisorOverLine } = await A()
    expect(advisorAllowed('none')).toBe(0)
    expect(advisorAllowed('once')).toBe(1)
    expect(advisorAllowed(undefined)).toBe(undefined)
    expect(advisorOverLine(1, 0)).toBe('advisor: 1 call, the brief allowed 0')
    expect(advisorOverLine(3, 1)).toBe('advisor: 3 calls, the brief allowed 1')
  })
})

describe('MOD-367: the brain advisor line and the cues', () => {
  const TOP = 'Advisor: do not call the advisor tool. You are on the top model; a call would consult your own model.'
  const OTHER = 'Advisor: call it only when the mod prints an advisor cue, when the person asks for it, or when the person has corrected the same thing twice; not for routine dispatch, verdict or merge steps. Each call re-reads the whole session. When you call it, say in your reply what it changed.'
  test('the two state lines, exactly', async () => {
    const { brainAdvisorLine } = await A()
    expect(brainAdvisorLine('fable')).toBe(TOP)
    expect(brainAdvisorLine('opus')).toBe(OTHER)
    expect(brainAdvisorLine('other')).toBe(OTHER)
  })
  test('the two cue lines, exactly, and empty for the top model', async () => {
    const { advisorCueLine } = await A()
    expect(advisorCueLine('refute2', 'other')).toBe("advisor cue: this card's second attempt was refuted. If your advisor is a model above yours, call it once before you choose the next step.")
    expect(advisorCueLine('review', 'opus')).toBe('advisor cue: the review refuted a claim. If your advisor is a model above yours, call it once before you resume the worker.')
    expect(advisorCueLine('refute2', 'fable')).toBe('')
    expect(advisorCueLine('review', 'fable')).toBe('')
  })
  test('advisorCueRow with and without a session id', async () => {
    const { advisorCueRow } = await A()
    const v = { cue: 'refute2', task: 'T-1', subtask: 'main', attempt: 2, at: 1700, brain: 'claude-opus-5-5' }
    expect(advisorCueRow(v)).toEqual({ kind: 'advisor-cue', cue: 'refute2', task: 'T-1', subtask: 'main', attempt: 2, at: 1700, brain: 'claude-opus-5-5' })
    expect('sessionId' in advisorCueRow(v)).toBe(false)
    expect(advisorCueRow({ ...v, cue: 'review', sessionId: 's-1' })).toEqual({ kind: 'advisor-cue', cue: 'review', task: 'T-1', subtask: 'main', attempt: 2, at: 1700, brain: 'claude-opus-5-5', sessionId: 's-1' })
  })
  test('the scorecard reader answers the same with and without an advisor-cue row', async () => {
    const { mkdtempSync, writeFileSync, readFileSync } = await import('node:fs')
    const { tmpdir } = await import('node:os')
    const { join } = await import('node:path')
    const { spawnSync } = await import('node:child_process')
    const { fileURLToPath } = await import('node:url')
    const here = rel => fileURLToPath(new URL(rel, import.meta.url))
    const base = readFileSync(here('../fixtures/evidence/ledger-a.jsonl'), 'utf8')
    const dir = mkdtempSync(join(tmpdir(), 'cue-test-'))
    const first = JSON.parse(base.split('\n').find(l => l.trim().startsWith('{')))
    const cue = JSON.stringify({ kind: 'advisor-cue', cue: 'refute2', task: first.task, subtask: 'main', attempt: 2, at: first.at ?? 1759300000000, brain: 'claude-opus-5-5', sessionId: 's-1' })
    writeFileSync(join(dir, 'with.jsonl'), base.replace(/\n*$/, '\n') + cue + '\n')
    writeFileSync(join(dir, 'without.jsonl'), base)
    const run = f => spawnSync(process.execPath, ['--no-warnings', here('../../bin/evidence.mjs'), f], { encoding: 'utf8' })
    const a = run(join(dir, 'with.jsonl'))
    const b = run(join(dir, 'without.jsonl'))
    expect(a.status).toBe(0)
    expect(JSON.parse(a.stdout)).toEqual(JSON.parse(b.stdout))
  })
})
