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

export const queuedDeny = (task: string, running: readonly string[]): string =>
  `${QUEUED_PREFIX}${task} starts when a worker slot frees (${running.length} running: ${running.join(', ')})`

export const isQueuedDeny = (deny: string): boolean => deny.startsWith(QUEUED_PREFIX)

export const queuedText = (position: number): string => `queued (position ${position})`

/** Appends at the tail; the position is 1-based. */
export function enqueue(queue: readonly QueuedSpawn[], item: QueuedSpawn): { queue: QueuedSpawn[]; position: number } {
  const next = [...queue, item]
  return { queue: next, position: next.length }
}

export function dequeue(queue: readonly QueuedSpawn[]): { head?: QueuedSpawn; rest: QueuedSpawn[] } {
  const [head, ...rest] = queue
  return head ? { head, rest } : { rest: [] }
}

/** What a spawn is known by between the scheduler and the spawn hook: its prompt and folder. */
export const promptKey = (s: { prompt: string; cwd?: string }): string => `${s.cwd ?? ''}\u0000${s.prompt}`
