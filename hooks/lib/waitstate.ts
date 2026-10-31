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
  if (extractReport(text) !== undefined || extractPause(text) !== undefined || detectRateLimit(text) !== undefined) return false
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

// MOD-226 (#270): a worker that must stop while its own background job runs prints a pause line, not a report.
/** Pauses a worker may take in one attempt before the next is charged as an attempt. */
export const PAUSE_CAP = 3

export type Pause = { task?: string; reason: string; block: string }

/**
 * The LAST line-anchored `[[pause v=1 task=<id> reason=<one line>]]` of a hand-back, else undefined. It is not read
 * when the hand-back holds a report line (a report wins), nor when its task= names another task than `task`.
 */
export function extractPause(text: string, task?: string): Pause | undefined {
  if (extractReport(text) !== undefined) return undefined
  const found = [...text.matchAll(/^[ \t]*(\[\[pause\b([^\n]*?)\]\])[ \t]*$/gm)]
  const m = found.at(-1)
  if (!m) return undefined
  const body = m[2] ?? ''
  const named = /\btask=(\S+)/.exec(body)?.[1]
  if (task !== undefined && named !== undefined && named !== task) return undefined
  const reason = (/\breason=(.*)$/.exec(body)?.[1] ?? '').trim()
  return { ...(named !== undefined ? { task: named } : {}), reason: reason === '' ? 'no reason given' : reason, block: m[1] as string }
}

/** A short stable fingerprint of a hand-back's text: one delivered twice is one pause. */
export function textKey(text: string): string {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return `${text.length}:${h.toString(36)}`
}

/** The row for a recorded pause (the long form; the wait state's text rides under it). */
export const pauseRow = (p: { task: string; attempt: number; budget: number; n: number; reason: string; waited: number }): string =>
  `chassis-delegation: verdict=paused task=${p.task} attempt=${p.attempt}/${p.budget} pause=${p.n}/${PAUSE_CAP - 1} next=resume — ${p.reason}\n${waitText(p.task, p.waited)}`

/** The row's line for a pause that reached the cap and is charged as an attempt. */
export const pauseCapLine = (n: number, attempt: number): string =>
  `pause cap: pause ${n} in attempt ${attempt} is charged as an attempt (a worker may pause ${PAUSE_CAP - 1} times per attempt); hand back a report, or stop`
