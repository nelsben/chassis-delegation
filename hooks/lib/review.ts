// MOD-21: the optional reviewer stage (public issue #1, second half). `consistent`
// says a hand-back's report matches git; nothing in that read the diff. With the
// `review` option on, a consistent verdict is followed by one fresh agent that
// reads the brief, the report and the diff at the sha and labels each factual
// claim of the hand-back confirmed, refuted or unverifiable, naming the command or
// file:line that decides it. It edits nothing: the mod's tool.call hook refuses its
// writes. The brain makes its Agent call (the spawn block); at its hand-back the mod
// reads the closing `[[review]]` block: refuted rows go back to the worker as a
// resume, anything else (including no block at all) is next=accept. Pure: no `$`.
import type { ReviewResult } from './attempts'
import type { SpawnCall } from './dispatch'
import type { ReviewMode } from './repoconfig'
import { finalAlias, reviewerTier, type Alias, type Tier } from './tier'
import type { Advice } from './verify'

/** What a reviewer's `[[review v=1 task=<ID> confirmed=N refuted=N unverifiable=N]]` block counted. */
export type ReviewCounts = ReviewResult & { task: string }
/** The counts a row is written from: a parsed block's, or a stored attempt's (which names no task). */
export type ReviewTally = ReviewResult & { task?: string }

const COUNT = /^\d+$/
const BLOCK = /\[\[review\s+([^\]\n]*)\]\]/g

/**
 * The last well-formed `[[review v=1 task=… confirmed=N refuted=N unverifiable=N]]`
 * block in a hand-back. A block with a word for a count, a missing key, another
 * version, or (with `task` given) another task's id is not one; no block gives
 * undefined. The template's own line (`confirmed=N …`) is therefore never one.
 */
export function parseReviewBlock(text: string, task?: string): ReviewCounts | undefined {
  let found: ReviewCounts | undefined
  for (const m of text.matchAll(BLOCK)) {
    const kv = new Map<string, string>()
    for (const word of (m[1] as string).split(/\s+/).filter(Boolean)) {
      const eq = word.indexOf('=')
      if (eq > 0 && !kv.has(word.slice(0, eq))) kv.set(word.slice(0, eq), word.slice(eq + 1))
    }
    const id = kv.get('task') ?? ''
    const [confirmed, refuted, unverifiable] = ['confirmed', 'refuted', 'unverifiable'].map(k => kv.get(k) ?? '')
    if (kv.get('v') !== '1' || id === '' || (task !== undefined && id !== task)) continue
    if (![confirmed, refuted, unverifiable].every(n => COUNT.test(n as string))) continue
    found = { task: id, confirmed: Number(confirmed), refuted: Number(refuted), unverifiable: Number(unverifiable) }
  }
  return found
}

export type ReviewLabel = 'confirmed' | 'refuted' | 'unverifiable'
/** One row of a reviewer's table: the label, the claim and what decides it as written, and the row as `<label>: <text>`. */
export type ReviewRow = { label: ReviewLabel; text: string; line: string }

/** A bullet or number, bold or code around the label, the label, then `:`, `|`, a dash, or ` - `. */
const ROW = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*|__|`)?(confirmed|refuted|unverifiable)(?:\*\*|__|`)?(?:\s*[:|—–]\s*|\s+-\s+)(?:\*\*|__|`)?\s*(\S.*?)\s*$/i
const ROW_CAP = 400

const cutTo = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

/** Every row in a hand-back, in order: a line that opens with one of the three labels. Prose that merely starts with the word is no row. */
export function reviewRows(text: string): ReviewRow[] {
  const rows: ReviewRow[] = []
  for (const raw of text.split(/\r?\n/)) {
    const m = ROW.exec(raw)
    if (!m) continue
    const label = (m[1] as string).toLowerCase() as ReviewLabel
    const body = cutTo(m[2] as string, ROW_CAP)
    rows.push({ label, text: body, line: `${label}: ${body}` })
  }
  return rows
}

/** The refuted rows, each as `refuted: <claim> — <what decides it>`, in the order the reviewer wrote them. */
export const refutedRows = (text: string): string[] => reviewRows(text).filter(r => r.label === 'refuted').map(r => r.line)

/**
 * The refuted rows a verdict row shows under it: the rows as written, or, when the block says something was
 * refuted and no row could be read, one line carrying the reviewer's own words (cut).
 */
export function shownRefuted(counts: ReviewCounts | undefined, rows: readonly string[], said: string): string[] {
  if (!counts || counts.refuted === 0 || rows.length > 0) return [...rows]
  return [`refuted: (no row could be read; the reviewer wrote) ${cutTo(said.replace(/\s+/g, ' ').trim(), 500)}`]
}

/** `review: 3 confirmed, 1 unverifiable` when nothing was refuted; all three counts when something was; `review: no review block` when there is no (well-formed) block. */
export function reviewClause(counts: ReviewTally | undefined): string {
  if (!counts) return 'review: no review block'
  return counts.refuted === 0 ? `review: ${counts.confirmed} confirmed, ${counts.unverifiable} unverifiable` : `review: ${counts.confirmed} confirmed, ${counts.refuted} refuted, ${counts.unverifiable} unverifiable`
}

/** Is a reviewer due for a consistent verdict at this worker tier? `on-frontier` reviews frontier and premium cards only. */
export const reviewDue = (mode: ReviewMode, workerTier: Tier): boolean => mode === 'on' || (mode === 'on-frontier' && (workerTier === 'frontier' || workerTier === 'premium'))

/** The one line a reviewer's refused edit is told. */
export const reviewerDeny = (tool: string, label: string): string =>
  `chassis-delegation: a reviewer never edits (${label} review): ${tool} refused. Label each claim confirmed, refuted or unverifiable, naming the command or file:line that decides it, and hand back.`

// ---- the marker: how the spawn hook knows a spawn is a reviewer ---------------------------------

/** Whose hand-back a reviewer reads: the task, the attempt, the worker's agent and the sha under review. */
export type ReviewMarker = { task: string; subtask: string; attempt: number; worker?: string; sha?: string }

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const WORD = /^[A-Za-z0-9_.:-]{1,80}$/

/** The first line of a reviewer's prompt. The spawn hook reads it before it looks for a brief: the prompt names the brief by path, which would make it a worker's. */
export const reviewMarker = (m: ReviewMarker): string =>
  `[[review-of v=1 task=${m.task} subtask=${m.subtask} attempt=${m.attempt}${m.worker ? ` worker=${m.worker}` : ''}${m.sha ? ` sha=${m.sha}` : ''}]]`

/** The marker a prompt opens with, else undefined: only the prompt's first line counts, so a worker's brief that quotes one is not hijacked. */
export function parseReviewMarker(prompt: string): ReviewMarker | undefined {
  const m = /^\s*\[\[review-of\s+([^\]\n]*)\]\]/.exec(prompt)
  if (!m) return undefined
  const kv = new Map<string, string>()
  for (const word of (m[1] as string).split(/\s+/).filter(Boolean)) {
    const eq = word.indexOf('=')
    if (eq > 0 && !kv.has(word.slice(0, eq))) kv.set(word.slice(0, eq), word.slice(eq + 1))
  }
  const task = kv.get('task') ?? ''
  const subtask = kv.get('subtask') ?? 'main'
  const attempt = kv.get('attempt') ?? ''
  const worker = kv.get('worker')
  const sha = kv.get('sha')
  if (kv.get('v') !== '1' || !TASK_ID.test(task) || !TASK_ID.test(subtask) || !COUNT.test(attempt) || Number(attempt) < 1) return undefined
  if ((worker !== undefined && !WORD.test(worker)) || (sha !== undefined && !WORD.test(sha))) return undefined
  return { task, subtask, attempt: Number(attempt), ...(worker !== undefined ? { worker } : {}), ...(sha !== undefined ? { sha } : {}) }
}

// ---- the prompt and the spawn block --------------------------------------------------------------

/** The keys hooks/templates/review.md may use; the mod fills each. */
export type ReviewVars = {
  id: string
  subtask: string
  attempt: string
  budget: string
  /** The brief's path. */
  brief: string
  /** The tree the worker handed back in. */
  worktree: string
  branch: string
  sha: string
  /** Where the diff starts: the brief's base=, baseRef, else the chain. */
  base: string
  /** The `[[report …]]` block as the worker wrote it. */
  report: string
  /** What the worker said at the end of its run, cut. */
  handback: string
}

/** The template with its `{{key}}`s filled in one pass: a key it lacks, and anything inside a value, stays as it is. */
export const renderReview = (template: string, vars: Readonly<Record<string, string>>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in vars ? (vars[key] as string) : whole))

export type ReviewPlanInput = {
  /** hooks/templates/review.md. */
  template: string
  workerTier: Tier
  /** The reviewTier option. */
  override?: Tier
  tierMap: Readonly<Record<Tier, string>>
  /** The task label, `T-4` or `T-4/ui`. */
  label: string
  marker: ReviewMarker
  vars: ReviewVars
}

/** The tier and alias a reviewer runs at (fable is never spawned: it becomes opus, at the frontier tier). */
export function reviewerPick(workerTier: Tier, override: Tier | undefined, tierMap: Readonly<Record<Tier, string>>): { tier: Tier; alias: Alias } {
  const tier = reviewerTier(workerTier, override)
  const { alias, fableRewritten } = finalAlias({ tier, source: 'review' }, tierMap[tier])
  return { tier: fableRewritten ? 'frontier' : tier, alias }
}

/** What a reviewer's spawn block ends with: the brain makes the call; the reviewer edits nothing. */
export const REVIEW_STARTS =
  'The reviewer starts when you make this Agent call: pass the JSON above as its input, verbatim. It reads the hand-back against the diff and edits nothing; the mod reads its [[review]] block and says what comes next.'

export type ReviewPlan = { tier: Tier; alias: Alias; call: SpawnCall; block: string }

/** The reviewer's Agent call for one hand-back: the model one tier below the worker's, the description `<label> review <tier> <alias>`, the prompt the marker line then the filled template. */
export function reviewPlan(i: ReviewPlanInput): ReviewPlan {
  const { tier, alias } = reviewerPick(i.workerTier, i.override, i.tierMap)
  const call: SpawnCall = {
    subagent_type: 'general-purpose',
    model: alias,
    description: `${i.label} review ${tier} ${alias}`,
    prompt: `${reviewMarker(i.marker)}\n${renderReview(i.template, i.vars)}`,
  }
  return { tier, alias, call, block: ['spawn: Agent', '```json', JSON.stringify(call, null, 2), '```', REVIEW_STARTS].join('\n') }
}

// ---- what the review hand-back advises ------------------------------------------------------------

export type ReviewAdviceInput = {
  counts: ReviewCounts | undefined
  /** The refuted rows, as `refuted: …` lines. */
  refuted: readonly string[]
  /** The worker to resume, when it is known. */
  agentId?: string
  /** The worker's attempts so far (reviews are not among them) and its budget. */
  attempts: number
  budget: number
  label: string
}

/**
 * Nothing refuted, or no usable block: accept (the review never blocks on its own
 * failure). Something refuted: resume the worker while the budget lasts, else
 * check by hand: a resume the budget would refuse is not advised.
 */
export function reviewAdvice(i: ReviewAdviceInput): Advice {
  if (!i.counts || i.counts.refuted === 0) return { kind: 'accept', next: 'accept' }
  const n = `${i.counts.refuted} claim${i.counts.refuted === 1 ? '' : 's'}`
  if (i.agentId && i.attempts < i.budget) return { kind: 'resume', next: `resume agent=${i.agentId} — SendMessage it the refuted rows below` }
  return {
    kind: 'check',
    next: i.agentId ? `check by hand — the reviewer refuted ${n} and the budget is spent (raise budget= to resume the worker)` : `check by hand — the reviewer refuted ${n} and the worker is not there to resume`,
  }
}

const SAID_CAP = 1500

/** What a resume sends the worker: the refuted rows quoted; the reviewer's own words, cut, when no row could be read. */
export function reviewResumeText(v: { label: string; attempt: number; budget: number; refuted: readonly string[]; said: string }): string {
  const rows = v.refuted.length > 0 ? [...v.refuted] : [cutTo(v.said.trim(), SAID_CAP)]
  return [
    `chassis-delegation: a reviewer read your hand-back for ${v.label} (attempt ${v.attempt}/${v.budget}) against the diff and refuted ${v.refuted.length > 0 ? `${v.refuted.length} claim${v.refuted.length === 1 ? '' : 's'}` : 'a claim'}:`,
    ...rows,
    'Fix what is wrong in the same worktree, or correct the report where the claim was only misworded, re-run the gate, commit, and end with a fresh [[report v=1 …]] line.',
  ].join('\n')
}

/** The long form of a review's row: `chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 usd=~0.05 model=… next=accept`. */
export function reviewVerdictLine(v: { task: string; attempt: number; budget: number; counts: ReviewCounts | undefined; usd?: number; usdApprox?: boolean; model?: string; next: string }): string {
  return (
    `chassis-delegation: review task=${v.task} attempt=${v.attempt}/${v.budget}` +
    (v.counts ? ` confirmed=${v.counts.confirmed} refuted=${v.counts.refuted} unverifiable=${v.counts.unverifiable}` : '') +
    (v.usd !== undefined && Number.isFinite(v.usd) ? ` usd=${v.usdApprox ? '~' : ''}${v.usd.toFixed(2)}` : '') +
    (v.model ? ` model=${v.model}` : '') +
    ` next=${v.next}`
  )
}
