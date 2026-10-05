// The eval trigger (SPEC part 2D): when origin/main has moved and the session
// is idle, an ordinary subagent runs the eval harness once and reports an
// `[[eval v=1 …]]` block. The mod itself never runs `sf` (the allowlist is
// unchanged); it reads origin/main with `git -C <root> rev-parse origin/main`.
// Pure: no `$`.

/** Part 5E: none built in. A repo names its eval in .chassis-delegation.json (evalCommand), or the person in /config. */
export const DEFAULT_EVAL_COMMAND = ''
export const DEFAULT_EVAL_LIVE_COMMAND = ''
export const DEFAULT_EVAL_IDLE_MINUTES = 10
export const DEFAULT_EVAL_LIVE_MAX_USD = 1
export const DEFAULT_SESSION_USD_CAP = 50

export type EvalTier = 'T1' | 'T2'

export const revParseArgv = (root: string): string[] => ['git', '-C', root, 'rev-parse', 'origin/main']

/** The 40-hex sha on rev-parse's first line; anything else (an error, nothing) is none. */
export function parseSha(stdout: string): string | undefined {
  const first = (stdout.split('\n')[0] ?? '').trim()
  return /^[0-9a-f]{40}$/.test(first) ? first : undefined
}

export type EvalTriggerInput = {
  autoEval: boolean
  inTurn: boolean
  /** Agents the mod knows of that `$.agent.list()` says are running. */
  running: number
  pending: number
  queued: number
  /** origin/main now. */
  sha?: string
  /** origin/main when the last eval runner was started. */
  lastSha?: string
  /** An eval runner of this session is still out. */
  inFlight: boolean
}

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/** Run once per sha, only while the session is idle: no turn, no worker, nothing pending or queued. */
export function shouldEval(i: EvalTriggerInput): { ok: true } | { ok: false; why: string } {
  if (!i.autoEval) return { ok: false, why: 'autoEval off' }
  if (i.inTurn) return { ok: false, why: 'a turn is running' }
  if (i.running > 0) return { ok: false, why: `${plural(i.running, 'worker', 'workers')} running` }
  if (i.pending > 0) return { ok: false, why: `${plural(i.pending, 'verdict', 'verdicts')} pending` }
  if (i.queued > 0) return { ok: false, why: `${plural(i.queued, 'spawn', 'spawns')} queued` }
  if (i.inFlight) return { ok: false, why: 'an eval runner is already running' }
  if (!i.sha) return { ok: false, why: 'origin/main unknown' }
  if (i.sha === i.lastSha) return { ok: false, why: `origin/main unchanged at ${i.sha.slice(0, 8)}` }
  return { ok: true }
}

export type LiveInput = {
  evalLive: boolean
  /** The session's cost now, when known. */
  usd: number | undefined
  maxUsd: number
  cap: number
  liveRanThisSession: boolean
  /** The T1 run's fail count this T2 would follow. */
  t1Fail: number
}

/**
 * T2 (live, spends money) only behind `evalLive`, once a session, after a T1
 * with no failure, and only while the session's cost plus the T2 ceiling stays
 * within `sessionUsdCap`.
 */
export function liveEligible(i: LiveInput): { ok: true } | { ok: false; why: string } {
  if (!i.evalLive) return { ok: false, why: 'evalLive off' }
  if (i.liveRanThisSession) return { ok: false, why: 'T2 already ran this session' }
  if (i.t1Fail > 0) return { ok: false, why: `T1 failed ${i.t1Fail}` }
  if (i.usd === undefined) return { ok: false, why: 'session cost unknown' }
  if (i.usd + i.maxUsd > i.cap) return { ok: false, why: `session $${i.usd.toFixed(2)} + $${i.maxUsd.toFixed(2)} would pass the $${i.cap.toFixed(2)} cap` }
  return { ok: true }
}

/** What the eval runner subagent is told: the command once, the report contract, the hard nevers. */
export function evalRunnerPrompt(v: { tier: EvalTier; command: string; root: string; sha: string; maxUsd?: number }): string {
  return [
    `Run \`${v.command}\` once in ${v.root} (origin/main is ${v.sha}).`,
    ...(v.maxUsd !== undefined ? [`This is the live tier: it may spend at most $${v.maxUsd.toFixed(2)}. If the run would spend more, do not start it; report fail=0 total=0 and say why.`] : []),
    'Then end your answer with exactly this line, filled in from the run:',
    `[[eval v=1 tier=${v.tier} sha=${v.sha} total=N pass=N fail=N result=<path or none>]]`,
    'and below it, one line per failing test, `failing: <the failing test names>`.',
    'Never retry, never deploy, never change files.',
  ].join('\n')
}

/**
 * The LAST `[[eval v=1 …]]` block of a hand-back, wherever it sits on its line.
 * A SubagentHandback reaches the mod indented (two spaces a line) and may wrap
 * a long block, so leading whitespace, a wrap inside the block, and spaces
 * inside the brackets are all read; the raw match keeps its index so the
 * failing lines after it can be found.
 */
function lastEvalMatch(text: string): { raw: string; index: number } | undefined {
  let last: RegExpExecArray | undefined
  for (const m of text.matchAll(/\[\[\s*eval\s+v=1\b[^\]]*\]\]/g)) last = m as RegExpExecArray
  return last ? { raw: last[0], index: last.index ?? 0 } : undefined
}

/** The LAST `[[eval v=1 …]]` block, on one line: `[[eval v=1 tier=… result=…]]`. */
export function extractEvalBlock(text: string): string | undefined {
  const m = lastEvalMatch(text)
  if (!m) return undefined
  const body = m.raw.replace(/^\[\[\s*eval\s+/, '').replace(/\s*\]\]$/, '').replace(/\s+/g, ' ').trim()
  return `[[eval ${body}]]`
}

export type EvalResult = { tier: string; sha: string; total: number; pass: number; fail: number; result: string }

export function parseEvalBlock(block: string): EvalResult {
  const field = (k: string): string => new RegExp(`\\b${k}=(\\S+?)(?=\\s|\\]\\]$)`).exec(block)?.[1] ?? ''
  const num = (k: string): number => {
    const n = Number(field(k))
    return Number.isFinite(n) ? n : 0
  }
  return { tier: field('tier'), sha: field('sha'), total: num('total'), pass: num('pass'), fail: num('fail'), result: field('result') || 'none' }
}

/** The lines after the last block: the failing names the runner listed (20 at most). */
export function failingLines(answer: string): string[] {
  const m = lastEvalMatch(answer)
  if (!m) return []
  const after = answer.slice(m.index + m.raw.length)
  return after
    .split('\n')
    .map(l => l.trim())
    .filter(Boolean)
    .slice(0, 20)
}

export function evalToast(tier: EvalTier, r: EvalResult | undefined): string {
  if (!r) return `${tier} eval: no [[eval]] block — see transcript`
  return r.fail > 0 || r.pass < r.total ? `${tier} ${r.pass}/${r.total} — see transcript` : `${tier} ${r.pass}/${r.total}`
}

/** The row the brain reads when an eval failed: the count and the failing names. */
export function evalFailureRow(tier: EvalTier, r: EvalResult | undefined, failing: readonly string[], sha: string): string {
  const names = failing.map(l => l.replace(/^failing:\s*/, '')).join('; ')
  const count = r ? `${r.pass}/${r.total}` : 'no [[eval]] block'
  return `chassis-delegation: eval ${tier} ${count} at ${sha.slice(0, 8)}${names ? ` — failing: ${names}` : ''}`
}
