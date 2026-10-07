// The worker scheduler (SPEC part 2F): at most `maxWorkers` briefed workers
// run at once; a briefed spawn past that is queued in $.state and started when
// a worker's slot frees. Ad hoc spawns (no brief) are never queued. Pure: no `$`.
import type { QueuedSpawn } from '../types'

export const DEFAULT_MAX_WORKERS = 2
export const QUEUED_PREFIX = 'queued by chassis-delegation: '

export const parseMaxWorkers = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_MAX_WORKERS)

/** A slot is free while the workers running plus those still starting stay under the cap. */
export const hasSlot = (running: number, starting: number, max: number): boolean => running + starting < max

/** The labels of spawns starting for someone else: a spawn's own starting token (same label) is never counted against it. */
export const startingOthers = (starting: Iterable<string>, label: string): string[] => [...starting].filter(l => l !== label)

/** The refusal for a briefed spawn that waits: the agents live and the rows queued, named apart. */
export const queuedDeny = (task: string, live: readonly string[], queued: readonly string[]): string =>
  `${QUEUED_PREFIX}${task} starts when a worker slot frees (${live.length} live: ${live.join(', ')}; ${queued.length} queued: ${queued.join(', ')})`

/** HH:MM of a queue row's time, as the clock on the wall reads it. */
export const clockText = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const alreadyQueuedText = (at: number, position: number): string => `already queued since ${clockText(at)} (position ${position})`

export const alreadyQueuedDeny = (task: string, at: number, position: number): string => `${QUEUED_PREFIX}${task} ${alreadyQueuedText(at, position)}`

/** The "already queued since …" part of a deny, if it is that kind. */
export const alreadyQueuedPart = (deny: string): string | undefined => (isQueuedDeny(deny) ? /already queued since \d\d:\d\d \(position \d+\)$/.exec(deny)?.[0] : undefined)

/** Whole minutes a queued row waited. */
export const waitedMinutes = (since: number, now: number): number => Math.max(0, Math.round((now - since) / 60000))

/** The queue index of a task and subtask, or -1. */
export const queuedIndex = (queue: readonly QueuedSpawn[], task: string, subtask: string): number => queue.findIndex(q => q.task === task && (q.subtask ?? 'main') === subtask)

export const isQueuedDeny = (deny: string): boolean => deny.startsWith(QUEUED_PREFIX)

export const queuedText = (position: number): string => `queued (position ${position})`

/**
 * Appends at the tail; the position is 1-based. A task and subtask already in
 * the queue is never entered twice: the queue comes back as it was, with the
 * row that holds the place.
 */
export function enqueue(queue: readonly QueuedSpawn[], item: QueuedSpawn): { queue: QueuedSpawn[]; position: number; existing?: { at: number; position: number } } {
  const at = queuedIndex(queue, item.task, item.subtask ?? 'main')
  const held = at >= 0 ? queue[at] : undefined
  if (held) return { queue: [...queue], position: at + 1, existing: { at: held.at, position: at + 1 } }
  const next = [...queue, item]
  return { queue: next, position: next.length }
}

export function dequeue(queue: readonly QueuedSpawn[]): { head?: QueuedSpawn; rest: QueuedSpawn[] } {
  const [head, ...rest] = queue
  return head ? { head, rest } : { rest: [] }
}

/** What a spawn is known by between the scheduler and the spawn hook: its prompt and folder. */
export const promptKey = (s: { prompt: string; cwd?: string }): string => `${s.cwd ?? ''}\u0000${s.prompt}`

/** GH-107: a refusal retrying cannot cure (the budget is spent, the brief cannot be read): the row leaves the queue. */
export const isFinalDeny = (deny: string): boolean => /^budget exhausted\b/.test(deny) || /\bbrief\b.*(cannot be read|could not be read|unreadable|not readable|ENOENT)/i.test(deny)

/** GH-107: the session row for a drained spawn that was refused; the brain reads rows, not toasts. */
export const drainRefusalRow = (task: string, reason: string, dropped: boolean): string =>
  `chassis-delegation: queued ${task} not started: ${reason}; ${dropped ? 'it is removed from the queue (retrying cannot succeed)' : 'it keeps its place (position 1)'}`
