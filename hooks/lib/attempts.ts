// Attempt records: what the mod keeps per task in `$.store` under
// `delegation.tasks.<task-id>` (an array, appended per attempt). The eval's
// data source. Pure: no `$`.
/**
 * The verdict word retired at MOD-19 (0.8.0). The one line that spells it is marked
 * for tests/node/consistent.node.mjs, which skips exactly that line. A record or row
 * written before the rename still holds it: it is read as `consistent` (once per
 * occurrence, logged by the caller) and never written. The ledger keeps it as written.
 */
export const RETIRED_VERDICT = 'verified' // legacy word: read-only normaliser
export const isRetiredVerdict = (v: unknown): boolean => v === RETIRED_VERDICT
/** A stored verdict word as the mod reads it now. */
export const readVerdict = <V extends string>(v: V): V | 'consistent' => (isRetiredVerdict(v) ? 'consistent' : v)
/** An attempt record as the mod reads it now. */
export const readRecord = (r: AttemptRecord): AttemptRecord => (isRetiredVerdict(r.verdict) ? { ...r, verdict: 'consistent' } : r)
/** A recent-verdict row's line as the mod reads it now: the retired word in either old shape becomes `consistent`. */
export const readLine = (line: string): string =>
  line
    .replace(new RegExp(`^(chassis-delegation: \\S+ attempt \\d+/\\d+ )${RETIRED_VERDICT}\\b`), '$1consistent')
    .replace(new RegExp(`^(chassis-delegation: verdict=)${RETIRED_VERDICT}\\b`), '$1consistent')
import type { Tier, TierSource } from './tier'

/**
 * `work-present` (GH-104): a respawn or an auto-resume found finished work in
 * the worker's worktree (commits ahead of the base, a clean tree) and did not
 * spawn; `/dispatch <id> --verify <sha>` judges it, and the record takes that
 * verdict.
 */
/**
 * `over-spend` (GH-106): the worker's own cost reached twice its brief's
 * `spend=` before it handed back; work may be present in its worktree. Not a
 * failing verdict: it never escalates the tier.
 */
/**
 * `consistent` (MOD-19, renamed; see readRecord): every machine-checkable claim
 * of the report matched git. A record written before the rename is read as consistent (see readRecord).
 */
export type AttemptVerdict = 'pending' | 'consistent' | 'unverified' | 'refuted' | 'no-report' | 'refused' | 'work-present' | 'over-spend' | 'reviewed'
/**
 * `verify` (GH-104): no worker ran; the attempt is the work found in the worktree, judged by `--verify`.
 * `review` (MOD-21): a read-only reviewer read a consistent hand-back against the diff. It carries the number of
 * the attempt it reviewed, is judged `reviewed`, and is not on the ladder: it is never counted against `budget=`
 * (see `attemptsFor`), never numbered among the worker's attempts, and never patched by `patchRecord`.
 */
export type AttemptKind = 'spawn' | 'resume' | 'verify' | 'review'

/** MOD-21: what a reviewer's `[[review]]` block counted. */
export type ReviewResult = { confirmed: number; refuted: number; unverifiable: number }

export type AttemptRecord = {
  task: string
  subtask: string
  /** 1-based, counted per task + subtask across spawns and resumes. */
  attempt: number
  kind: AttemptKind
  /** The attempt number of the spawn this attempt descends from (a resume keeps its spawn's). */
  lineage: number
  tier: Tier
  alias: string
  /** MOD-15: `fallback` when the mod started a ready worktree row itself after the brain left it unclaimed (readyFallbackMinutes). */
  source?: TierSource | 'fallback'
  resolvedModel?: string
  verdict: AttemptVerdict
  /** GH-115: a refuted attempt's first failed claim (branch, sha, scope, files, gate, red, pr). */
  firstFailed?: string
  /** The report's own `gate=` claim. */
  reportGate?: string
  /**
   * GH-104: the sha the attempt's report named (as written), or a
   * `work-present` / `verify` attempt's branch head. A judged one is not new
   * work: a respawn past it is not stopped by the look at the worktree.
   */
  sha?: string
  /** MOD-21: a `review` attempt's counts; absent when its hand-back carried no (well-formed) review block. */
  review?: ReviewResult
  /** The red evidence the report named (`red=`, as written) and read in the worker's tree (GH-20). */
  red?: string
  /** sha-256 of that file's bytes: a later attempt naming the same bytes is refuted on red. */
  redHash?: string
  /** MOD-1: that attempt's red claim held, so its file is the task's one proof of red. */
  redHeld?: true
  /** The worker's own cost from its turn usage (GH-106); else the session's cost growth between spawn (or resume) and verdict, marked by `usdApprox`. */
  usd?: number
  /** True when `usd` is the session delta, not the worker's own cost. */
  usdApprox?: true
  tokens?: number
  /** MOD-13: the effort the worker's steps were rewritten to (low … max); absent when the engine's default ran. */
  effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max'
  /** ms since the epoch at spawn (or resume). */
  at: number
  /** MOD-37: the id of the session whose brain made the spawn; absent on a record written before it. */
  sessionId?: string
  /** MOD-37: that session's root, so an old record can still be placed. */
  root?: string
  verdictAt?: number
  agentId?: string
  toolUseId?: string
  briefPath?: string
  purpose?: string
  /** A `/dispatch --replay` run of an already-merged card, from `base`. */
  replay?: true
  base?: string
  /** MOD-4: why this task's owed row is gone: its work reached the default branch (`merged`), or the brain closed it by hand (`accepted`). */
  retired?: 'merged' | 'accepted'
  /** MOD-4: `/delegation accept <id> [note]` — accepted by hand, with the note. */
  accepted?: { note?: string; at: number }
  /** MOD-4: when the retire check last ran (answered or not): it runs at most once per 15 minutes. */
  retireTriedAt?: number
  /** MOD-4: when a retire check last got an answer (not merged yet): the owed row has been looked at. */
  retireCheckedAt?: number
}

/** Which attempts count together: real runs, or the replays from one base commit. */
export type Lane = { replay?: boolean; base?: string }

const inLane = (r: AttemptRecord, lane?: Lane): boolean =>
  Boolean(r.replay) === Boolean(lane?.replay) && (!r.replay || (r.base ?? '') === (lane?.base ?? ''))

const FAILING: readonly AttemptVerdict[] = ['refuted', 'no-report']

/** The worker's attempts of a subtask, oldest first: the ladder. A reviewer's attempt (MOD-21) is not on it. */
export const attemptsFor = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): AttemptRecord[] =>
  records.filter(r => r.kind !== 'review' && r.subtask === subtask && inLane(r, lane)).sort((a, b) => a.attempt - b.attempt)

/** MOD-21: the reviewer attempts of a subtask (any attempt reviewed), oldest first. */
export const reviewsFor = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): AttemptRecord[] =>
  records.filter(r => r.kind === 'review' && r.subtask === subtask && inLane(r, lane))

/** MOD-51: the highest attempt of a subtask's lane numbered above `attempt`, whatever its verdict; undefined when none. */
export const supersededBy = (records: readonly AttemptRecord[], subtask: string, attempt: number, lane?: Lane): number | undefined => {
  const later = attemptsFor(records, subtask, lane).filter(r => r.attempt > attempt)
  return later.length === 0 ? undefined : Math.max(...later.map(r => r.attempt))
}

export const nextAttempt = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): number =>
  attemptsFor(records, subtask, lane).reduce((n, r) => Math.max(n, r.attempt), 0) + 1

export const lineageResumes = (records: readonly AttemptRecord[], subtask: string, lineage: number, lane?: Lane): number =>
  attemptsFor(records, subtask, lane).filter(r => r.lineage === lineage && r.kind === 'resume').length

export const recordFailed = (r: AttemptRecord): boolean => FAILING.includes(r.verdict) || r.reportGate === 'fail'

/**
 * GH-104: what earns a respawn the next tier: a refuted report, or a
 * `gate=fail` the verifier confirmed (the verdict held it: consistent). A
 * no-report is a reporting defect, not a capability one, and never escalates.
 */
export const escalatesOn = (verdict: string, reportGate?: string): boolean => verdict === 'refuted' || (verdict === 'consistent' && reportGate === 'fail')

/** GH-115: the claims whose failure says the worker was out of its depth; the rest say the brief's globs or the base were wrong. */
export const ESCALATING_CLAIMS: readonly string[] = ['sha', 'gate', 'red']

/** GH-115: the claim a refuted attempt is held at its tier for (scope, files, branch, pr), else undefined (a record without `firstFailed` escalates). */
export const heldClaim = (r: Pick<AttemptRecord, 'verdict' | 'firstFailed'>): string | undefined =>
  r.verdict === 'refuted' && r.firstFailed !== undefined && !ESCALATING_CLAIMS.includes(r.firstFailed) ? r.firstFailed : undefined

/**
 * The tier a respawn escalates from: the last attempt's, when that attempt was
 * refuted or confirmed gate=fail (GH-104), unless its first failed claim was
 * scope, files, branch or pr (GH-115).
 */
export function escalationSource(records: readonly AttemptRecord[], subtask: string, lane?: Lane): Tier | undefined {
  const last = attemptsFor(records, subtask, lane).at(-1)
  return last && escalatesOn(last.verdict, last.reportGate) && heldClaim(last) === undefined ? last.tier : undefined
}

/**
 * GH-104: the tier a respawn after a no-report is held at: that attempt's
 * own, never one up (and never below it, should the brief's tier be lower).
 * GH-115: a scope, files, branch or pr refute holds it the same way.
 */
export function holdSource(records: readonly AttemptRecord[], subtask: string, lane?: Lane): Tier | undefined {
  const last = attemptsFor(records, subtask, lane).at(-1)
  return last && (last.verdict === 'no-report' || heldClaim(last) !== undefined) ? last.tier : undefined
}

/** GH-104: the shas the verifier already judged for this task + subtask (pending and work-present attempts are not judged). */
export const judgedShas = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): string[] =>
  attemptsFor(records, subtask, lane).flatMap(r => (r.sha && r.verdict !== 'pending' && r.verdict !== 'work-present' ? [r.sha] : []))

/** The red hashes of the attempts before `attempt` (same subtask and lane): what a fresh red file must differ from. */
export const priorRedHashes = (records: readonly AttemptRecord[], subtask: string, attempt: number, lane?: Lane): { attempt: number; hash: string; held?: boolean }[] =>
  attemptsFor(records, subtask, lane).flatMap(r => (r.attempt < attempt && r.redHash ? [{ attempt: r.attempt, hash: r.redHash, ...(r.redHeld ? { held: true } : {}) }] : []))

/** MOD-1: do two spellings of a sha (7-40 hex) name the same commit? One may be a prefix of the other. */
const sameSha = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x))
}

/**
 * MOD-41: is a hand-back whose report names `sha` a new attempt? Yes when the last
 * attempt was judged (not pending) at a sha other than this one: the brain resumed
 * the worker after a verdict the mod had not advised a resume for. The same sha is
 * the MOD-1 re-judge and a record that named no sha is left alone.
 */
export function isResumeAfterJudged(records: readonly AttemptRecord[], subtask: string, sha: string, lane?: Lane): boolean {
  const last = attemptsFor(records, subtask, lane).at(-1)
  return last !== undefined && last.verdict !== 'pending' && last.sha !== undefined && !sameSha(last.sha, sha)
}

/**
 * MOD-1: which attempt `/dispatch <id> --verify <sha>` judges. The last attempt
 * when it is a work-present one (GH-104), or when it was already judged at this
 * very sha (`rejudge`: same attempt number, no new record, no budget spent);
 * else the next attempt number.
 */
export function verifyTarget(records: readonly AttemptRecord[], subtask: string, sha: string, lane?: Lane): { attempt: number; rejudge: boolean } {
  const last = attemptsFor(records, subtask, lane).at(-1)
  if (last?.verdict === 'work-present') return { attempt: last.attempt, rejudge: false }
  if (last && last.verdict !== 'pending' && last.sha !== undefined && sameSha(last.sha, sha)) return { attempt: last.attempt, rejudge: true }
  return { attempt: nextAttempt(records, subtask, lane), rejudge: false }
}

/** Replaces the worker's record with the same subtask + attempt by `patch` applied to it (a reviewer's record never matches). */
export function patchRecord(records: readonly AttemptRecord[], subtask: string, attempt: number, patch: Partial<AttemptRecord>, lane?: Lane): AttemptRecord[] {
  return records.map(r => (r.kind !== 'review' && r.subtask === subtask && r.attempt === attempt && inLane(r, lane) ? { ...r, ...patch } : r))
}

/** MOD-21: replaces the reviewer attempt the spawn `toolUseId` made by `patch` applied to it. */
export function patchReview(records: readonly AttemptRecord[], toolUseId: string, patch: Partial<AttemptRecord>): AttemptRecord[] {
  return records.map(r => (r.kind === 'review' && r.toolUseId === toolUseId ? { ...r, ...patch } : r))
}

/** The fields a replay attempt carries. */
export const laneFields = (lane?: Lane): Pick<AttemptRecord, 'replay' | 'base'> =>
  lane?.replay ? { replay: true, ...(lane.base ? { base: lane.base } : {}) } : {}

export const taskLabel = (task: string, subtask: string): string => (subtask === 'main' ? task : `${task}/${subtask}`)

/** MOD-4: a task's retire check runs at most this often. */
export const RETIRE_EVERY_MS = 15 * 60 * 1000

/** MOD-4: is the retire check due for this subtask: its last attempt is not retired and was not tried in the last 15 minutes. */
export function retireDue(records: readonly AttemptRecord[], subtask: string, now: number, lane?: Lane): boolean {
  const last = attemptsFor(records, subtask, lane).at(-1)
  if (!last || last.retired) return false
  return last.retireTriedAt === undefined || now - last.retireTriedAt >= RETIRE_EVERY_MS
}

/** MOD-4: does a card's frontmatter read `status: merged`? (A line in the body does not.) */
export function cardReadsMerged(text: string): boolean {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  return m !== null && /^status:\s*["']?merged["']?\s*$/m.test(m[1] as string)
}

/**
 * MOD-4: what one retire check leaves on the last attempt. `ancestor` is what
 * `git merge-base --is-ancestor <sha> origin/main` said (undefined: it could not
 * say), `card` the card's text on origin/main (undefined: not read). Merged on
 * either; with neither answered the row is left as it is (only the try is noted).
 */
export function retirePatch(probe: { ancestor?: boolean; card?: string }, now: number): Partial<AttemptRecord> {
  if (probe.ancestor === true || (probe.card !== undefined && cardReadsMerged(probe.card))) return { retired: 'merged', retireTriedAt: now, retireCheckedAt: now }
  if (probe.ancestor === undefined && probe.card === undefined) return { retireTriedAt: now }
  return { retireTriedAt: now, retireCheckedAt: now }
}

/**
 * MOD-35: the key one ledger row is written under. An accept row is one per task
 * attempt; a verdict row is one per (task, attempt, sha, verdict), so a hand-back
 * that arrives twice (as a tool result and as a notification, or from a second
 * copy of the mod) leaves one line. A row with neither a verdict nor a kind of
 * accept has no key and is always written.
 */
export function ledgerRowKey(row: Record<string, unknown>): string | undefined {
  const head = `${String(row.task ?? '')}|${String(row.subtask ?? 'main')}|${String(row.attempt ?? '')}`
  if (row.kind === 'accept') return `accept|${head}`
  if (typeof row.verdict !== 'string') return undefined
  // a reviewer's rows are told apart by the spawn they came from; a worker's by (task, attempt, sha, verdict)
  return `verdict|${head}|${String(row.sha ?? '')}|${row.verdict}${row.kind === 'review' ? `|${String(row.toolUseId ?? '')}` : ''}`
}

/** MOD-35: does this ledger text already hold a row under the same key as `row`? */
export function ledgerHas(text: string, row: Record<string, unknown>): boolean {
  const key = ledgerRowKey(row)
  if (key === undefined || text === '') return false
  for (const line of text.split('\n')) {
    if (line.trim() === '') continue
    try {
      const parsed = JSON.parse(line) as unknown
      if (parsed && typeof parsed === 'object' && ledgerRowKey(parsed as Record<string, unknown>) === key) return true
    } catch {
      // a line that is not JSON is not a row
    }
  }
  return false
}

/** MOD-35: the accept row (`how`: the branch reached the default branch, or the brain accepted it). */
export function acceptRow(rec: Pick<AttemptRecord, 'task' | 'subtask' | 'attempt' | 'sha'>, how: 'merged' | 'accepted', at: number): Record<string, unknown> {
  return { kind: 'accept', task: rec.task, subtask: rec.subtask, attempt: rec.attempt, ...(rec.sha ? { sha: rec.sha } : {}), at, how }
}
