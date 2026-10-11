// Part 3B: what a worker cost, from the usage each of its turns reported.
// Every `turn.complete` that carries the worker's agentId adds its TurnUsage;
// the dollars come from a built-in price table keyed by model id prefix.
// Pure: no `$`.

export type Tokens = {
  in: number
  out: number
  cacheRead: number
  /** All cache writes, whatever their TTL. */
  cacheWrite: number
  /** MOD-47: the part of `cacheWrite` written with the 1-hour TTL (priced 2x); absent where no turn reported the split. */
  cacheWrite1h?: number
}
/** Dollars per million tokens; `cacheRead` is the cache-read price where it is not the default 0.1x input. */
export type Price = { in: number; out: number; cacheRead?: number }

/**
 * MOD-47: prices are API list prices, checked 2026-10-06 against the claude-api skill's
 * pricing table (Opus 5.5 $4/$20, cache reads $0.20; Sonnet 5.5 $2/$10, cache reads $0.20;
 * Fable 5.1 and Mythos 5.1 $10/$50, cache reads $0.25; Haiku 5.5 $0.10/$0.50 up to 100K-token
 * prompts). A model with no `cacheRead` of its own reads the cache at 0.1x input.
 * Cache writes: 1.25x input for the 5-minute TTL, 2x for the 1-hour TTL (Claude Code writes 1-hour entries).
 */
export const CACHE_READ = 0.1
export const CACHE_WRITE = 1.25
export const CACHE_WRITE_1H = 2

const TABLE: readonly [string, Price][] = [
  ['fable-5-1', { in: 10, out: 50, cacheRead: 0.25 }],
  ['mythos-5-1', { in: 10, out: 50, cacheRead: 0.25 }],
  ['fable-5', { in: 10, out: 50 }],
  ['opus-5-5', { in: 4, out: 20, cacheRead: 0.2 }],
  ['opus-5', { in: 5, out: 25 }],
  ['sonnet-5-5', { in: 2, out: 10, cacheRead: 0.2 }],
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
export type UsageLike = {
  input_tokens: number
  output_tokens: number
  cache_read_input_tokens?: number | null
  cache_creation_input_tokens?: number | null
  /** MOD-47: the API's split of the cache writes by TTL, where the usage carries it. */
  cache_creation?: { ephemeral_1h_input_tokens?: number | null; ephemeral_5m_input_tokens?: number | null } | null
  model?: string
}

export const tokensOf = (u: UsageLike): Tokens => {
  const h = u.cache_creation?.ephemeral_1h_input_tokens
  const cacheWrite = u.cache_creation_input_tokens || (u.cache_creation ? (h || 0) + (u.cache_creation.ephemeral_5m_input_tokens || 0) : 0)
  return {
    in: u.input_tokens || 0,
    out: u.output_tokens || 0,
    cacheRead: u.cache_read_input_tokens || 0,
    cacheWrite,
    ...(typeof h === 'number' && h > 0 ? { cacheWrite1h: Math.min(h, cacheWrite) } : {}),
  }
}

/** Dollars for the tokens at a price: cache reads at the model's own rate, 1-hour writes at 2x input, the rest of the writes at 1.25x. */
export const usdOf = (t: Tokens, p: Price): number => {
  const w1h = Math.min(t.cacheWrite1h ?? 0, t.cacheWrite)
  return (t.in * p.in + t.out * p.out + t.cacheRead * (p.cacheRead ?? p.in * CACHE_READ) + (t.cacheWrite - w1h) * p.in * CACHE_WRITE + w1h * p.in * CACHE_WRITE_1H) / 1e6
}

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
  const w1h = (prev.tokens.cacheWrite1h ?? 0) + (t.cacheWrite1h ?? 0)
  return {
    tokens: {
      in: prev.tokens.in + t.in,
      out: prev.tokens.out + t.out,
      cacheRead: prev.tokens.cacheRead + t.cacheRead,
      cacheWrite: prev.tokens.cacheWrite + t.cacheWrite,
      ...(w1h > 0 ? { cacheWrite1h: w1h } : {}),
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

/**
 * MOD-47: which turn a usage belongs to. The same turn delivered to the hook twice carries the
 * same turn id and the same counts; a worker's cost is the sum of its distinct turns.
 */
export const turnKey = (turnId: string | undefined, u: UsageLike): string | undefined => {
  if (!turnId) return undefined
  const t = tokensOf(u)
  return `${turnId}:${t.in}/${t.out}/${t.cacheRead}/${t.cacheWrite}/${t.cacheWrite1h ?? 0}`
}

export const totalTokens = (t: Tokens): number => t.in + t.out + t.cacheRead + t.cacheWrite

// ---- GH-106: the per-attempt spend ceiling ---------------------------------------

/** Config `spendByTier` default: dollars one attempt may spend, per tier; 0 = no ceiling. */
export const DEFAULT_SPEND_BY_TIER: Readonly<Record<'economy' | 'standard' | 'frontier', number>> = { economy: 3, standard: 10, frontier: 25 }

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

/** The one row posted when a worker first reaches its ceiling (MOD-13): it names the task and the dollars. */
export const spendWarnRow = (label: string, usd: number, spend: number): string =>
  `chassis-delegation: ${label} spend $${usd.toFixed(2)} reached its ${dollars(spend)} ceiling; the worker was told to wrap up and hand back`

/** The refusal a worker gets for each tool call once it has spent twice its ceiling (MOD-13); the hand-back itself is never refused. */
export const overSpendDeny = (label: string, spend: number): string =>
  `chassis-delegation: ${label} is over twice its ${dollars(spend)} ceiling; hand back now with what you have (SubagentHandback)`

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
