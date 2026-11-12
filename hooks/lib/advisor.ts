// MOD-365: the advisor calls a worker made, read from its transcript. The turn usage the host hands the mod
// carries the worker model's tokens only; an advisor call is an `advisor_message` entry in the `iterations` of
// the assistant message's usage, at the advisor model's rate. Pure: no `$`.
import { priceFor, tokensOf, usdOf, round4 } from './cost'
import { transcriptPath } from './debriefcheck'

export type AdvisorUse = { calls: number; usd: number | null; in: number; out: number; models: string[] }

type Json = Record<string, unknown>
const obj = (v: unknown): Json | undefined => (v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Json) : undefined)
const num = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)

/** The advisor calls in a worker transcript, from rows stamped at or after sinceMs. */
export function advisorUse(jsonl: string, sinceMs?: number): AdvisorUse {
  const seen = new Set<string>()
  let calls = 0
  let usd: number | null = 0
  let inTok = 0
  let outTok = 0
  const models: string[] = []
  for (const line of jsonl.split('\n')) {
    if (line.trim() === '') continue
    let row: Json | undefined
    try {
      row = obj(JSON.parse(line))
    } catch {
      continue
    }
    if (!row || row.type !== 'assistant') continue
    const message = obj(row.message)
    const id = message?.id
    if (!message || typeof id !== 'string' || id === '' || seen.has(id)) continue
    if (sinceMs !== undefined) {
      const at = typeof row.timestamp === 'string' ? Date.parse(row.timestamp) : NaN
      if (!Number.isFinite(at) || at < sinceMs) continue
    }
    seen.add(id)
    const iterations = obj(message.usage)?.iterations
    if (!Array.isArray(iterations)) continue
    for (const raw of iterations) {
      const entry = obj(raw)
      if (!entry || entry.type !== 'advisor_message') continue
      calls += 1
      const model = typeof entry.model === 'string' && entry.model !== '' ? entry.model : 'unknown'
      const tokens = tokensOf({
        input_tokens: num(entry.input_tokens),
        output_tokens: num(entry.output_tokens),
        cache_read_input_tokens: num(entry.cache_read_input_tokens),
        cache_creation_input_tokens: num(entry.cache_creation_input_tokens),
      })
      inTok += tokens.in + tokens.cacheRead + tokens.cacheWrite
      outTok += tokens.out
      if (!models.includes(model)) models.push(model)
      const price = priceFor(model === 'unknown' ? undefined : model)
      usd = usd === null || !price ? null : usd + usdOf(tokens, price)
    }
  }
  return { calls, usd: usd === null ? null : round4(usd), in: inTok, out: outTok, models }
}

/** The worker transcript file of an agent of a session. */
export const workerTranscriptPath = (home: string, root: string, sessionId: string, agentId: string): string =>
  `${transcriptPath(home, root, sessionId).replace(/\.jsonl$/, '')}/subagents/agent-${agentId}.jsonl`

/** ` · advisor 2 calls $1.84`; '' when calls is 0. */
export const advisorPart = (u: Pick<AdvisorUse, 'calls' | 'usd'> | undefined): string =>
  !u || u.calls <= 0 ? '' : ` · advisor ${u.calls} call${u.calls === 1 ? '' : 's'} ${typeof u.usd === 'number' ? `$${u.usd.toFixed(2)}` : '$?'}`
