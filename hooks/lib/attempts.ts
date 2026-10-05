// Attempt records: what the mod keeps per task in `$.store` under
// `delegation.tasks.<task-id>` (an array, appended per attempt). The eval's
// data source. Pure: no `$`.
import type { Tier, TierSource } from './tier'

export type AttemptVerdict = 'pending' | 'verified' | 'unverified' | 'refuted' | 'no-report' | 'refused'
export type AttemptKind = 'spawn' | 'resume'

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
  source?: TierSource
  resolvedModel?: string
  verdict: AttemptVerdict
  /** The report's own `gate=` claim. */
  reportGate?: string
  /** The red evidence the report named (`red=`, as written) and read in the worker's tree (GH-20). */
  red?: string
  /** sha-256 of that file's bytes: a later attempt naming the same bytes is refuted on red. */
  redHash?: string
  /** Approximate: the session's cost growth between spawn (or resume) and verdict. */
  usd?: number
  tokens?: number
  /** ms since the epoch at spawn (or resume). */
  at: number
  verdictAt?: number
  agentId?: string
  toolUseId?: string
  briefPath?: string
  purpose?: string
  /** A `/dispatch --replay` run of an already-merged card, from `base`. */
  replay?: true
  base?: string
}

/** Which attempts count together: real runs, or the replays from one base commit. */
export type Lane = { replay?: boolean; base?: string }

const inLane = (r: AttemptRecord, lane?: Lane): boolean =>
  Boolean(r.replay) === Boolean(lane?.replay) && (!r.replay || (r.base ?? '') === (lane?.base ?? ''))

const FAILING: readonly AttemptVerdict[] = ['refuted', 'no-report']

export const attemptsFor = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): AttemptRecord[] =>
  records.filter(r => r.subtask === subtask && inLane(r, lane)).sort((a, b) => a.attempt - b.attempt)

export const nextAttempt = (records: readonly AttemptRecord[], subtask: string, lane?: Lane): number =>
  attemptsFor(records, subtask, lane).reduce((n, r) => Math.max(n, r.attempt), 0) + 1

export const lineageResumes = (records: readonly AttemptRecord[], subtask: string, lineage: number, lane?: Lane): number =>
  attemptsFor(records, subtask, lane).filter(r => r.lineage === lineage && r.kind === 'resume').length

export const recordFailed = (r: AttemptRecord): boolean => FAILING.includes(r.verdict) || r.reportGate === 'fail'

/** The tier a respawn escalates from: the last attempt's, when that attempt failed. */
export function escalationSource(records: readonly AttemptRecord[], subtask: string, lane?: Lane): Tier | undefined {
  const last = attemptsFor(records, subtask, lane).at(-1)
  return last && last.verdict !== 'pending' && recordFailed(last) ? last.tier : undefined
}

/** The red hashes of the attempts before `attempt` (same subtask and lane): what a fresh red file must differ from. */
export const priorRedHashes = (records: readonly AttemptRecord[], subtask: string, attempt: number, lane?: Lane): { attempt: number; hash: string }[] =>
  attemptsFor(records, subtask, lane).flatMap(r => (r.attempt < attempt && r.redHash ? [{ attempt: r.attempt, hash: r.redHash }] : []))

/** Replaces the record with the same subtask + attempt by `patch` applied to it. */
export function patchRecord(records: readonly AttemptRecord[], subtask: string, attempt: number, patch: Partial<AttemptRecord>, lane?: Lane): AttemptRecord[] {
  return records.map(r => (r.subtask === subtask && r.attempt === attempt && inLane(r, lane) ? { ...r, ...patch } : r))
}

/** The fields a replay attempt carries. */
export const laneFields = (lane?: Lane): Pick<AttemptRecord, 'replay' | 'base'> =>
  lane?.replay ? { replay: true, ...(lane.base ? { base: lane.base } : {}) } : {}

export const taskLabel = (task: string, subtask: string): string => (subtask === 'main' ? task : `${task}/${subtask}`)
