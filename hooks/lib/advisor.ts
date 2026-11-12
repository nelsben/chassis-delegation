// MOD-365: the advisor calls a worker made, read from its transcript. The turn usage the host hands the mod
// carries the worker model's tokens only; an advisor call is an `advisor_message` entry in the `iterations` of
// the assistant message's usage, at the advisor model's rate. Pure: no `$`.
import { priceFor, tokensOf, usdOf, round4 } from './cost'
import { transcriptPath } from './debriefcheck'
import { fnv1a32 } from './explore'

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

// ---- MOD-366: the advisor rule a brief carries ----------------------------------------------------------------------
export type AdvisorRule = 'none' | 'once'
export const ADVISOR_RULES: readonly AdvisorRule[] = ['none', 'once']

/** MOD-366: the card's own word when it is one of the two; else a frontier card is split in half by its task id, and every other tier is none. */
export function advisorRuleOf(tier: string, cardField: unknown, task: string): { rule: AdvisorRule; source: 'card' | 'tier' | 'split' } {
  if (typeof cardField === 'string') {
    const word = cardField.trim().toLowerCase()
    if (word === 'none' || word === 'once') return { rule: word, source: 'card' }
  }
  if (tier === 'frontier') return { rule: fnv1a32('advisor:' + task) % 2 === 0 ? 'once' : 'none', source: 'split' }
  return { rule: 'none', source: 'tier' }
}

/** MOD-366: the one Rules line of a brief. */
export const advisorRuleLine = (rule: AdvisorRule): string =>
  rule === 'once'
    ? '- Advisor: if you have an advisor tool you may call it once, after you have read the card and the files it names and before you change any file. Do not call it again, and not before you hand back: the verifier and the review check the work. If you called it, put one line in your hand-back: `advisor: changed <what you did differently>` or `advisor: no change`.'
    : '- Advisor: do not call the advisor tool, if you have one. The card is the plan: decide what it leaves open and list it as a choice, or hand back with the question.'

/** MOD-366: the refusal for a card `advisor:` that is neither word. */
export const advisorFieldRefusal = (value: string): string => `refused: advisor: ${value} on the card; it takes none or once`

/** MOD-366: the calls a rule allows; undefined for no rule (a brief written before the rule). */
export const advisorAllowed = (rule: AdvisorRule | undefined): number | undefined => (rule === 'none' ? 0 : rule === 'once' ? 1 : undefined)

/** MOD-366: the verdict line for calls over the rule. */
export const advisorOverLine = (calls: number, allowed: number): string => `advisor: ${calls} call${calls === 1 ? '' : 's'}, the brief allowed ${allowed}`

/** MOD-366: the rule a brief's text carries, by its exact line; undefined for a brief written before the rule. */
export function advisorRuleInBrief(text: string): AdvisorRule | undefined {
  const lines = text.split('\n')
  for (const rule of ADVISOR_RULES) if (lines.includes(advisorRuleLine(rule))) return rule
  return undefined
}

// ---- MOD-367: the brain's advisor line and the cues ------------------------------------------------------------------
export type AdvisorCue = 'refute2' | 'review'

/** MOD-367: the one advisor line of the delegation state, by the brain's model family. */
export const brainAdvisorLine = (family: string): string =>
  family === 'fable'
    ? 'Advisor: do not call the advisor tool. You are on the top model; a call would consult your own model.'
    : 'Advisor: call it only when the mod prints an advisor cue, when the person asks for it, or when the person has corrected the same thing twice; not for routine dispatch, verdict or merge steps. Each call re-reads the whole session. When you call it, say in your reply what it changed.'

/** MOD-367: the cue line added to what the brain reads, or '' when the brain is on the top model. */
export const advisorCueLine = (cue: AdvisorCue, family: string): string =>
  family === 'fable'
    ? ''
    : cue === 'refute2'
      ? "advisor cue: this card's second attempt was refuted. If your advisor is a model above yours, call it once before you choose the next step."
      : 'advisor cue: the review refuted a claim. If your advisor is a model above yours, call it once before you resume the worker.'

/** MOD-367: the ledger row of one cue raised. It has no verdict, so no reader counts it as a judged attempt. */
export const advisorCueRow = (v: { cue: AdvisorCue; task: string; subtask: string; attempt: number; at: number; brain: string; sessionId?: string }): Record<string, unknown> => ({
  kind: 'advisor-cue',
  cue: v.cue,
  task: v.task,
  subtask: v.subtask,
  attempt: v.attempt,
  at: v.at,
  brain: v.brain,
  ...(v.sessionId ? { sessionId: v.sessionId } : {}),
})
