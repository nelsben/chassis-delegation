// Part 3B: what a worker cost, from the usage each of its turns reported.
// Every `turn.complete` that carries the worker's agentId adds its TurnUsage;
// the dollars come from a built-in price table keyed by model id prefix.
// Pure: no `$`.

export type Tokens = { in: number; out: number; cacheRead: number; cacheWrite: number }
/** Dollars per million tokens. */
export type Price = { in: number; out: number }

/** Cache reads cost 10% of the input price; cache writes 125%. */
export const CACHE_READ = 0.1
export const CACHE_WRITE = 1.25

const TABLE: readonly [string, Price][] = [
  ['opus-5-5', { in: 4, out: 20 }],
  ['opus-5', { in: 5, out: 25 }],
  ['sonnet-5-5', { in: 2, out: 10 }],
  ['sonnet-5', { in: 3, out: 15 }],
  // Haiku 5.5 bills $0.50 / $2.50 for a request whose prompt passes 100K tokens. Usage
  // arrives summed per turn (a worker's whole run), so that tier cannot be applied:
  // for a long Haiku 5.5 run this figure is a floor.
  ['haiku-5-5', { in: 0.1, out: 0.5 }],
  ['haiku-4-5', { in: 1, out: 5 }],
]

/** The table, longest prefix first, so `opus-5-5` is tried before `opus-5`. */
export const PRICES: readonly [string, Price][] = [...TABLE].sort((a, b) => b[0].length - a[0].length)

/**
 * The price of a model id: the part from `claude-` on (a provider's
 * `us.anthropic.` prefix dropped) starts with a table prefix followed by the
 * end, `-`, `[`, `@` or `:`. Unknown: undefined.
 */
export function priceFor(model: string | undefined): Price | undefined {
  if (!model) return undefined
  const lower = model.toLowerCase()
  const at = lower.indexOf('claude-')
  const id = at >= 0 ? lower.slice(at + 'claude-'.length) : lower
  for (const [prefix, price] of PRICES) {
    if (id === prefix || (id.startsWith(prefix) && /^[-[@:]/.test(id.slice(prefix.length)))) return price
  }
  return undefined
}

/** The four counts of a TurnUsage (ModelUsage), as the store keeps them. */
export type UsageLike = { input_tokens: number; output_tokens: number; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; model?: string }

export const tokensOf = (u: UsageLike): Tokens => ({
  in: u.input_tokens || 0,
  out: u.output_tokens || 0,
  cacheRead: u.cache_read_input_tokens || 0,
  cacheWrite: u.cache_creation_input_tokens || 0,
})

export const usdOf = (t: Tokens, p: Price): number =>
  (t.in * p.in + t.out * p.out + t.cacheRead * p.in * CACHE_READ + t.cacheWrite * p.in * CACHE_WRITE) / 1e6

/**
 * What an attempt has cost so far: the tokens summed over its turns, and the
 * dollars, `null` once any turn ran on a model the table does not price
 * (tokens only, shown `usd=?`).
 */
export type Spend = { tokens: Tokens; usd: number | null; turns: number; models: string[] }

export function addTurn(acc: Spend | undefined, u: UsageLike): Spend {
  const t = tokensOf(u)
  const price = priceFor(u.model)
  const prev: Spend = acc ?? { tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, usd: 0, turns: 0, models: [] }
  return {
    tokens: {
      in: prev.tokens.in + t.in,
      out: prev.tokens.out + t.out,
      cacheRead: prev.tokens.cacheRead + t.cacheRead,
      cacheWrite: prev.tokens.cacheWrite + t.cacheWrite,
    },
    usd: prev.usd === null || price === undefined ? null : prev.usd + usdOf(t, price),
    turns: prev.turns + 1,
    models: u.model && !prev.models.includes(u.model) ? [...prev.models, u.model] : prev.models,
  }
}

/** Four decimals, as the store keeps dollars. */
export const round4 = (n: number): number => Math.round(n * 10000) / 10000

/** `$1.75`; `$?` for tokens on an unpriced model; `$–` while nothing is measured. */
export function usdText(s: { usd: number | null } | undefined): string {
  if (!s) return '$–'
  return s.usd === null ? '$?' : `$${s.usd.toFixed(2)}`
}

export const totalTokens = (t: Tokens): number => t.in + t.out + t.cacheRead + t.cacheWrite

// ---- GH-106: the per-attempt spend ceiling ---------------------------------------

/** Config `spendByTier` default: dollars one attempt may spend, per tier; 0 = no ceiling. */
export const DEFAULT_SPEND_BY_TIER: Readonly<Record<'economy' | 'standard' | 'frontier', number>> = { economy: 2, standard: 6, frontier: 15 }

/** The ceiling a tier gets when the card names none: the tier's entry, premium and unknown tiers the frontier's. */
export const spendForTier = (tier: string, table: Readonly<Record<string, number>>): number =>
  table[tier] ?? table.frontier ?? DEFAULT_SPEND_BY_TIER.frontier

/** Dollars as the ceiling lines write them: `$2`, `$6.50`. */
export const dollars = (n: number): string => `$${Number.isInteger(n) ? n : n.toFixed(2)}`

/** Where a worker stands against its ceiling: under, at (warn once), or over twice it (stop). */
export type CeilingState = 'under' | 'warn' | 'stop'
export const ceilingState = (usd: number, spend: number): CeilingState => (usd >= 2 * spend ? 'stop' : usd >= spend ? 'warn' : 'under')

/** The one message a worker gets when it first crosses its ceiling. */
export const warnText = (usd: number, spend: number): string =>
  `chassis-delegation: you have spent about $${usd.toFixed(2)} of a ${dollars(spend)} ceiling; wrap up now and hand back with the report line`

/** `next=` of the over-spend row. */
export const OVER_SPEND_NEXT = (task: string): string => `check the worktree (work may be present: /dispatch ${task} --verify <sha>)`

/** The over-spend row: `chassis-delegation: T-1 attempt 1/3 over-spend · $4.20 of $2 · next=…`. */
export const overSpendLine = (v: { label: string; task: string; attempt: number; budget: number; usd: number; spend: number }): string =>
  `chassis-delegation: ${v.label} attempt ${v.attempt}/${v.budget} over-spend · $${v.usd.toFixed(2)} of ${dollars(v.spend)} · next=${OVER_SPEND_NEXT(v.task)}`

/** `T-6 $3.10` — a live worker with its running cost (the label alone while nothing is measured). */
export const liveWorker = (label: string, usd: number | null | undefined): string => (usd === undefined || usd === null ? label : `${label} $${usd.toFixed(2)}`)

/** The ceiling /dispatch writes: the card's `spend:` when it is a number (0 = none), else the tier's. */
export function spendCeiling(card: string | undefined, tier: string, table: Readonly<Record<string, number>>): number {
  const v = card?.trim().replace(/^\$/, '')
  if (v !== undefined && /^\d+(\.\d+)?$/.test(v)) return Number(v)
  return spendForTier(tier, table)
}
