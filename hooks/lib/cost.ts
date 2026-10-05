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
