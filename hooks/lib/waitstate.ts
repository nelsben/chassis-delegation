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

// MOD-418 (#593): the wait phrase is built once, so the wait-on-a-noun test and the wait-for-it test cannot drift.
const WAIT_PHRASE = String.raw`\b(?:waiting|(?:i['\u2019]?ll|i will|will|going to|still|now)\s+wait(?:ing)?)\s+(?:on|for)\s+`
/** A wait on a noun the worker owns; a wait aimed at "you" or "your" (waiting for you to run it) is the lead's turn. */
const WAIT_NOUN = new RegExp(
  WAIT_PHRASE + String.raw`(?!you\b|your\b)(?:the\s+|a\s+|an\s+|my\s+|its\s+|another\s+)?(?:\w+\s+){0,3}?(?:background|job|task|process|render|build|lock|resource|agent|worker|monitor|suite|tests?\b|gate|notification)`,
  'i',
)
/** The worker says something of its own is running in the background now (present tense only). */
const RUNNING_NOW = /\b(?:is|are)\s+(?:(?:still|now|currently)\s+)?running(?:\s+again)?\s+in\s+the\s+background\b/i
/** A wait aimed at "it", "that", "this", "them" or "those"; it counts only with the word background beside it. */
const WAIT_IT = new RegExp(WAIT_PHRASE + String.raw`(?:it|that|this|them|those)\b`, 'i')
const BACKGROUND = /\bbackground\b/i

/**
 * A worker turn that ended with no report and whose last paragraph (at most its last 400 characters) says it is
 * waiting now. Three forms count, all ignoring case: a wait on a job, task, process, render, build, lock, resource,
 * agent, worker, monitor, suite, test, gate, notification or the background (not a wait on "you" or "your"); "is
 * (still, now, currently) running (again) in the background" in the present tense; and a wait on "it", "that", "this",
 * "them" or "those" when the paragraph also says background. A usage-limit text (MOD-56) is never a wait; past tense
 * or a bare "wait" elsewhere does not count.
 */
export function saysWaiting(text: string): boolean {
  if (extractReport(text) !== undefined || extractPause(text) !== undefined || detectRateLimit(text) !== undefined) return false
  const paras = text.trim().split(/\n\s*\n/)
  const last = (paras[paras.length - 1] ?? '').slice(-400)
  return WAIT_NOUN.test(last) || RUNNING_NOW.test(last) || (WAIT_IT.test(last) && BACKGROUND.test(last))
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

// MOD-422: a worker waiting on its own job is not charged an attempt.
/** A pause reason that names the worker's own job, the background, a lease, the GPU lock, a queue or the gate. */
const OWN_JOB = /\bbackground\b|\b(?:own|my)\s+(?:[\w-]+\s+){0,3}?(?:job|jobs|render|renders|build|bake|gate|tests?|suite|run)\b|\blease\b|\bgpu[_-]?lock\b|\bgate\b|\bqueued\b/i
export const ownJobWait = (reason: string): boolean => OWN_JOB.test(reason)
/** Own-job pauses allowed per attempt: a runaway guard, not a budget. The stall row (waitStallMin) still speaks. */
export const OWN_WAIT_CAP = 12
/** The pause cap for a reason: own-job waits get OWN_WAIT_CAP (or the repo's cap when higher), any other the repo's cap. */
export const pauseCapFor = (reason: string, cap: number = PAUSE_CAP): number => (ownJobWait(reason) ? Math.max(OWN_WAIT_CAP, cap) : cap)
/** The reason a hand-back with no report and no pause line gets when it says it is waiting (saysWaiting). */
export const SAID_WAIT_REASON = 'waiting on its own background job (said, no pause line)'

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
export const pauseRow = (p: { task: string; attempt: number; budget: number; n: number; reason: string; waited: number; cap?: number }): string =>
  `chassis-delegation: verdict=paused task=${p.task} attempt=${p.attempt}/${p.budget} pause=${p.n}/${(p.cap ?? PAUSE_CAP) - 1} next=resume — ${p.reason}\n${waitText(p.task, p.waited)}`

/** The row's line for a pause that reached the cap and is charged as an attempt. */
export const pauseCapLine = (n: number, attempt: number, cap: number = PAUSE_CAP): string =>
  `pause cap: pause ${n} in attempt ${attempt} is charged as an attempt (a worker may pause ${cap - 1} times per attempt); hand back a report, or stop`
