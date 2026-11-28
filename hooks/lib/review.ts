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
import { extractReport, parseReport } from './brief'
import type { ReviewMode } from './repoconfig'
import { finalAlias, reviewerTier, type Alias, type Tier } from './tier'
import type { Advice } from './verify'

/** What a reviewer's `[[review v=1 task=<ID> confirmed=N refuted=N unverifiable=N]]` block counted. */
export type ReviewCounts = ReviewResult & { task: string; attempt?: number; sha?: string }
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
    // MOD-224: the optional attempt= and sha= name which hand-back the reviewer read
    const at = kv.get('attempt')
    const sha = kv.get('sha')
    found = {
      task: id,
      ...(at !== undefined && COUNT.test(at) && Number(at) >= 1 ? { attempt: Number(at) } : {}),
      ...(sha !== undefined && /^[0-9a-fA-F]{7,40}$/.test(sha) ? { sha } : {}),
      confirmed: Number(confirmed),
      refuted: Number(refuted),
      unverifiable: Number(unverifiable),
      // MOD-415: the optional fourth count; absent or not a whole number, the key is left off
      ...(kv.has('misreported') && COUNT.test(kv.get('misreported') as string) ? { misreported: Number(kv.get('misreported')) } : {}),
    }
  }
  return found
}

/** What a verdict waits on: the task, the attempt and the sha its review is due for. */
export type ReviewWait = { task: string; attempt: number; sha: string }
export type ReviewMatch = { kind: 'none' } | { kind: 'match'; counts: ReviewCounts } | { kind: 'refused'; line: string }

const sameShaWord = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x))
}

/**
 * MOD-224: does a hand-back carry the review a verdict waits on? Used when the reviewer's spawn record is gone (the
 * lead's context was compacted while it ran), so the block alone must say whose review it is. It matches on task +
 * attempt + sha, never on the task alone. No block for the task: none. A block that names another attempt or sha, or
 * none, is refused with the one line the next verdict shows.
 */
export function matchReview(text: string, wait: ReviewWait): ReviewMatch {
  const counts = parseReviewBlock(text, wait.task)
  if (!counts) return { kind: 'none' }
  const tail = 'spawn the reviewer again'
  if (counts.attempt === undefined || counts.sha === undefined) return { kind: 'refused', line: `review seen for ${wait.task} but it names no attempt or sha, waiting on attempt ${wait.attempt} sha ${wait.sha}; ${tail}` }
  if (counts.attempt !== wait.attempt) return { kind: 'refused', line: `review seen for ${wait.task} but it names attempt ${counts.attempt}, waiting on attempt ${wait.attempt}; ${tail}` }
  if (!sameShaWord(counts.sha, wait.sha)) return { kind: 'refused', line: `review seen for ${wait.task} but it names sha ${counts.sha}, waiting on ${wait.sha}; ${tail}` }
  return { kind: 'match', counts }
}

export type ReviewLabel = 'confirmed' | 'refuted' | 'misreported' | 'unverifiable'
/** One row of a reviewer's table: the label, the claim and what decides it as written, and the row as `<label>: <text>`. */
export type ReviewRow = { label: ReviewLabel; text: string; line: string }

/** A bullet or number, bold or code around the label, the label, then `:`, `|`, a dash, or ` - `. */
const ROW = /^\s*(?:[-*•]\s+|\d+[.)]\s+)?(?:\*\*|__|`)?(confirmed|refuted|misreported|unverifiable)(?:\*\*|__|`)?(?:\s*[:|—–]\s*|\s+-\s+)(?:\*\*|__|`)?\s*(\S.*?)\s*$/i
const ROW_CAP = 400

const cutTo = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

/** Every row in a hand-back, in order: a line that opens with one of the four labels. Prose that merely starts with the word is no row. */
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

/** MOD-415: the misreported rows, each as `misreported: <statement> — <what is true>`, in the order written. */
export const misreportedRows = (text: string): string[] => reviewRows(text).filter(r => r.label === 'misreported').map(r => r.line)

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
  const mis = counts.misreported !== undefined && counts.misreported > 0 ? `, ${counts.misreported} misreported` : ''
  return (counts.refuted === 0 ? `review: ${counts.confirmed} confirmed, ${counts.unverifiable} unverifiable` : `review: ${counts.confirmed} confirmed, ${counts.refuted} refuted, ${counts.unverifiable} unverifiable`) + mis
}

/** Is a reviewer due for a consistent verdict at this worker tier? `on-frontier` reviews frontier and premium cards only. */
export const reviewDue = (mode: ReviewMode, workerTier: Tier): boolean => mode === 'on' || (mode === 'on-frontier' && (workerTier === 'frontier' || workerTier === 'premium'))

/** The one line a reviewer's refused edit is told. */
export const reviewerDeny = (tool: string, label: string): string =>
  `chassis-delegation: a reviewer never edits (${label} review): ${tool} refused. Label each claim confirmed, refuted or unverifiable, naming the command or file:line that decides it, and hand back.`

// ---- the hand-back the reviewer is given (MOD-416) -----------------------------------------------

const REPORT_BLOCK = /\[\[report[\s\S]*?\]\]/g
const WORDS_OWN = 40

/** MOD-416: a text has words of its own when, with every report block removed and whitespace collapsed, at least 40 characters remain. */
export function handbackHasWords(text: string): boolean {
  return text.replace(REPORT_BLOCK, ' ').replace(/\s+/g, ' ').trim().length >= WORDS_OWN
}

/** Which hand-back the reviewer reads: the worker's own given text, its transcript's (same sha), or the report line alone. */
export type ReviewedHandback = { text: string; source: 'given' | 'transcript' | 'report-only' }

/**
 * MOD-416: the hand-back a reviewer is given. A given text with words of its own is read as it is. Else the newest
 * transcript hand-back that has words of its own and whose last report names this sha (HEAD or an empty sha names
 * none). Else the given text alone, which the prompt then says is only the report line.
 */
export function reviewHandback(given: string, transcript: readonly string[], sha: string): ReviewedHandback {
  if (handbackHasWords(given)) return { text: given, source: 'given' }
  const want = sha.trim()
  if (want !== '' && want.toUpperCase() !== 'HEAD') {
    for (let i = transcript.length - 1; i >= 0; i--) {
      const entry = transcript[i] as string
      if (!handbackHasWords(entry)) continue
      const block = extractReport(entry)
      if (block === undefined) continue
      const entrySha = parseReport(block).sha
      if (entrySha !== undefined && sameShaWord(entrySha, want)) return { text: entry, source: 'transcript' }
    }
  }
  return { text: given, source: 'report-only' }
}

/** MOD-416: the note a transcript hand-back is introduced with. */
export const HANDBACK_NOTE_TRANSCRIPT =
  "(The verifier judged this sha with no fresh hand-back. What follows is the worker's own hand-back for the same sha, read from its transcript.)"
/** MOD-416: the note a report-only review is introduced with. */
export const HANDBACK_NOTE_REPORT_ONLY =
  "(Only the report line is available: the worker's own words for this sha could not be read. Take each Done-when statement of the card as one claim and check it against the diff. Write no row about what the hand-back says or leaves out.)"

/**
 * MOD-416: the hand-back section of the prompt. A given text is the whole section, cut at the cap as it always was;
 * the other two sources are a note, an empty line, then the text cut at the cap (the note is not counted against it).
 */
export function handbackSection(result: ReviewedHandback, cap: number): string {
  // MOD-422: a cut copy says so, with both lengths
  const text = result.text.length > cap ? `${result.text.slice(0, cap - 1)}…\n(cut at ${cap} of ${result.text.length} characters)` : result.text
  if (result.source === 'given') return text
  const note = result.source === 'transcript' ? HANDBACK_NOTE_TRANSCRIPT : HANDBACK_NOTE_REPORT_ONLY
  return `${note}\n\n${text}`
}

/** MOD-422: what a reviewer may read: the tree and the brief, and the card's output folder (the brief's outdir=) when there is one. */
export const reviewReadable = (worktree: string, outdir?: string): string =>
  outdir && outdir.trim() ? `${worktree}, the brief and the card's output folder ${outdir.trim()}` : `${worktree} and the brief`

/** MOD-422: the rule that opens the output folder to the reviewer, read only; empty when the card has none. */
export const outdirRule = (outdir?: string): string =>
  outdir && outdir.trim()
    ? ` The card's output folder ${outdir.trim()} is yours to read and never to write: ls and cat it, and open its images with the Read tool. A claim about a render, a sheet or another file there is decided by opening the file it names; say which file you opened.`
    : ''

// ---- the marker: how the spawn hook knows a spawn is a reviewer ---------------------------------

/** Whose hand-back a reviewer reads: the task, the attempt, the worker's agent and the sha under review. */
export type ReviewMarker = { task: string; subtask: string; attempt: number; worker?: string; sha?: string; /** MOD-417: where the reviewer's copy of the hand-back came from, when not the worker's own turn. */ handback?: 'transcript' | 'report-only' }

const TASK_ID = /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/
const WORD = /^[A-Za-z0-9_.:-]{1,80}$/

/** The first line of a reviewer's prompt. The spawn hook reads it before it looks for a brief: the prompt names the brief by path, which would make it a worker's. */
export const reviewMarker = (m: ReviewMarker): string =>
  `[[review-of v=1 task=${m.task} subtask=${m.subtask} attempt=${m.attempt}${m.worker ? ` worker=${m.worker}` : ''}${m.sha ? ` sha=${m.sha}` : ''}${m.handback ? ` handback=${m.handback}` : ''}]]`

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
  const from = kv.get('handback')
  const handback = from === 'transcript' || from === 'report-only' ? from : undefined
  if (kv.get('v') !== '1' || !TASK_ID.test(task) || !TASK_ID.test(subtask) || !COUNT.test(attempt) || Number(attempt) < 1) return undefined
  if ((worker !== undefined && !WORD.test(worker)) || (sha !== undefined && !WORD.test(sha))) return undefined
  return { task, subtask, attempt: Number(attempt), ...(worker !== undefined ? { worker } : {}), ...(sha !== undefined ? { sha } : {}), ...(handback !== undefined ? { handback } : {}) }
}

/** MOD-417: the rows a review's ledger row keeps: the first 12 lines, each cut to 300 characters. */
export const ledgerLines = (lines: readonly string[]): string[] => lines.slice(0, 12).map(l => cutTo(l, 300))

// ---- the prompt and the spawn block --------------------------------------------------------------

/** The keys hooks/templates/review.md may use; the mod fills each. */
export type ReviewVars = {
  /** MOD-253: the `## Verifier's gate record` section (gateRecord). */
  gaterecord?: string
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
  /** MOD-422: reviewReadable: the tree, the brief and the output folder when the card has one. */
  readable?: string
  /** MOD-422: outdirRule: the output-folder sentence, or empty. */
  outdirrule?: string
}

/** The template with its `{{key}}`s filled in one pass: a key it lacks, and anything inside a value, stays as it is. */
export const renderReview = (template: string, vars: Readonly<Record<string, string>>): string =>
  template.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in vars ? (vars[key] as string) : whole))

/** MOD-253: the review brief's `## Verifier's gate record`: the verdict's gate claim lines and the gate output tail, so the reviewer need not re-run the suite. */
export function gateRecord(lines: readonly string[], tail: readonly string[]): string {
  const head = "## Verifier's gate record"
  const claims = lines.filter(l => l.startsWith('claim gate:'))
  if (claims.length === 0) return `${head}\n\n(no gate record: the verifier did not run a gate for this hand-back; run the suite yourself only if a finding depends on it)`
  const out = tail.length > 0 ? `\n\nGate output tail:\n${tail.join('\n')}` : '\n\n(no gate output was kept)'
  return `${head}\n\nThe mod ran the gate at the sha and recorded:\n${claims.join('\n')}${out}`
}

export type ReviewPlanInput = {
  /** hooks/templates/review.md. */
  template: string
  workerTier: Tier
  /** The reviewTier option. */
  override?: Tier
  tierMap: Readonly<Record<Tier, string>>
  /** MOD-269: the allowFable option. */
  allowFable?: boolean
  /** The task label, `T-4` or `T-4/ui`. */
  label: string
  marker: ReviewMarker
  vars: ReviewVars
}

/** The tier and alias a reviewer runs at (fable becomes opus, at the frontier tier, unless allowFable is on: MOD-269). */
export function reviewerPick(workerTier: Tier, override: Tier | undefined, tierMap: Readonly<Record<Tier, string>>, allowFable?: boolean): { tier: Tier; alias: Alias } {
  const tier = reviewerTier(workerTier, override)
  const { alias, fableRewritten } = finalAlias({ tier, source: 'review' }, tierMap[tier], { allowFable })
  return { tier: fableRewritten ? 'frontier' : tier, alias }
}

/** MOD-224: the closing line also names the hand-back read, so the mod can match the review without its spawn record (after a compaction). */
const reviewKeys = (m: ReviewMarker): string =>
  m.sha ? `\n\nIn that last line, write attempt=${m.attempt} sha=${m.sha} after the task, so the mod can match your review to this hand-back: [[review v=1 task=${m.task} attempt=${m.attempt} sha=${m.sha} confirmed=N refuted=N unverifiable=N misreported=N]]` : ''

/** What a reviewer's spawn block ends with: the brain makes the call; the reviewer edits nothing. */
export const REVIEW_STARTS =
  'The reviewer starts when you make this Agent call: pass the JSON above as its input, verbatim. It reads the hand-back against the diff and edits nothing; the mod reads its [[review]] block and says what comes next.'

export type ReviewPlan = { tier: Tier; alias: Alias; call: SpawnCall; block: string }

/** The reviewer's Agent call for one hand-back: the model one tier below the worker's, the description `<label> review <tier> <alias>`, the prompt the marker line then the filled template. */
export function reviewPlan(i: ReviewPlanInput): ReviewPlan {
  const { tier, alias } = reviewerPick(i.workerTier, i.override, i.tierMap, i.allowFable)
  const call: SpawnCall = {
    subagent_type: 'general-purpose',
    model: alias,
    description: `${i.label} review ${tier} ${alias}`,
    prompt: `${reviewMarker(i.marker)}\n${renderReview(i.template, i.vars)}${reviewKeys(i.marker)}`,
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
export function reviewResumeText(v: { label: string; attempt: number; budget: number; refuted: readonly string[]; said: string; misreported?: readonly string[] }): string {
  const rows = v.refuted.length > 0 ? [...v.refuted] : [cutTo(v.said.trim(), SAID_CAP)]
  return [
    `chassis-delegation: a reviewer read your hand-back for ${v.label} (attempt ${v.attempt}/${v.budget}) against the diff and refuted ${v.refuted.length > 0 ? `${v.refuted.length} claim${v.refuted.length === 1 ? '' : 's'}` : 'a claim'}:`,
    ...rows,
    ...(v.misreported && v.misreported.length > 0
      ? ['These statements in your hand-back were wrong though the work there is right; change nothing in the work for them and state them correctly in your next hand-back:', ...v.misreported]
      : []),
    'Fix what is wrong in the same worktree, or correct the report where the claim was only misworded, re-run the gate, commit, and end with a fresh [[report v=1 …]] line.',
  ].join('\n')
}

/** The long form of a review's row: `chassis-delegation: review task=T-4 attempt=1/3 confirmed=3 refuted=0 unverifiable=1 usd=~0.05 model=… next=accept`. */
export function reviewVerdictLine(v: { task: string; attempt: number; budget: number; counts: ReviewCounts | undefined; usd?: number; usdApprox?: boolean; model?: string; next: string }): string {
  return (
    `chassis-delegation: review task=${v.task} attempt=${v.attempt}/${v.budget}` +
    (v.counts ? ` confirmed=${v.counts.confirmed} refuted=${v.counts.refuted} unverifiable=${v.counts.unverifiable}${v.counts.misreported !== undefined && v.counts.misreported > 0 ? ` misreported=${v.counts.misreported}` : ''}` : '') +
    (v.usd !== undefined && Number.isFinite(v.usd) ? ` usd=${v.usdApprox ? '~' : ''}${v.usd.toFixed(2)}` : '') +
    (v.model ? ` model=${v.model}` : '') +
    ` next=${v.next}`
  )
}
