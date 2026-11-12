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
