// MOD-99 (#161): a briefed worker that is waiting (its turn ended with no hand-back) wakes the brain once per
// state, says what it waits on, and says it is stalled once past a ceiling. Pure: no `$`.
import { extractReport } from './brief'
import { detectRateLimit } from './verify'

/** Default `waitStallMin`: minutes a worker may wait before the mod says it is stalled; 0 is off. */
export const WAIT_STALL_DEFAULT_MIN = 20

const MIN_MS = 60 * 1000

/** What the mod remembers of one waiting worker. */
export type WaitState = { since: number; stalled?: true }

/** The resource a waiting worker's card names and the worker that holds it. */
export type WaitOn = { resource: string; holder: string }

const WAIT_NOW = /\b(?:waiting|(?:i['\u2019]?ll|i will|will|going to|still|now)\s+wait(?:ing)?)\s+(?:on|for)\s+(?:the\s+|a\s+|an\s+|my\s+|its\s+|another\s+)?(?:\w+\s+){0,3}?(?:background|job|task|process|render|build|lock|resource|agent|worker)/i

/**
 * A worker turn that ended with no report and whose last paragraph (at most its last 400 characters) says it is
 * waiting now on a job, task, process, render, build, lock, resource or another agent. A usage-limit text
 * (MOD-56) is never a wait; past tense or a bare "wait" elsewhere does not count.
 */
export function saysWaiting(text: string): boolean {
  if (extractReport(text) !== undefined || detectRateLimit(text) !== undefined) return false
  const paras = text.trim().split(/\n\s*\n/)
  const last = (paras[paras.length - 1] ?? '').slice(-400)
  return WAIT_NOW.test(last)
}

const minutes = (ms: number): number => Math.max(0, Math.round(ms / MIN_MS))

/** `T-4 waiting on blender-live held by T-1`, else `T-4 waiting on its own background job (3 min)`. */
export const waitText = (id: string, waited: number, on?: WaitOn): string =>
  on ? `${id} waiting on ${on.resource} held by ${on.holder}` : `${id} waiting on its own background job (${minutes(waited)} min)`

/** `T-4 stalled 20 min; resume or stop it`. */
export const stallText = (id: string, waited: number): string => `${id} stalled ${minutes(waited)} min; resume or stop it`

/**
 * One sighting of a worker waiting. The first starts the state and speaks; a repeat in the same state is held;
 * once the wait reaches `ceilingMin` (0 = off) the state speaks one more time, then holds again.
 */
export function waitStep(prev: WaitState | undefined, now: number, ceilingMin: number, id: string, on?: WaitOn): { state: WaitState; say?: string; held?: true } {
  if (!prev) return { state: { since: now }, say: waitText(id, 0, on) }
  const waited = now - prev.since
  if (ceilingMin > 0 && !prev.stalled && waited >= ceilingMin * MIN_MS) return { state: { ...prev, stalled: true }, say: stallText(id, waited) }
  return { state: prev, held: true }
}
