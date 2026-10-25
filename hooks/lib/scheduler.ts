// The worker scheduler (SPEC part 2F): at most `maxWorkers` briefed workers
// run at once; a briefed spawn past that is queued in $.state. MOD-12 (#22):
// the queue is advice, not a launcher. When a worker's slot frees the mod says
// `ready: <id>` and the brain makes the spawn. MOD-15: only a worktree row the
// brain leaves unclaimed past readyFallbackMinutes is started by the mod itself.
// Ad hoc spawns (no brief) are never queued. Pure: no `$`.
import type { QueuedSpawn } from '../types'
import { TIERS, type Tier } from './tier'

export const DEFAULT_MAX_WORKERS = 2
export const QUEUED_PREFIX = 'queued: '
/** MOD-12: what a queued task waits for; the mod says `ready:` when it comes. */
export const SLOT_FREES = 'the mod will tell you when a slot frees'
/** MOD-131 (#219): the same wait when only the spawn's own tier is full: `the mod will tell you when a frontier slot frees`. */
export const slotFrees = (tier?: Tier): string => (tier ? `the mod will tell you when a ${tier} slot frees` : SLOT_FREES)
const TIER_SLOT_FREES = new RegExp(`^queued: .* — the mod will tell you when a (?:${TIERS.join('|')}) slot frees`)
/** MOD-23: what a queued task waits for when a running attempt holds a resource it names. */
const RESOURCE_WAIT = ' — waiting for resource '

export const parseMaxWorkers = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 1 ? Math.floor(v) : DEFAULT_MAX_WORKERS)

/** MOD-131 (#219): a count of briefed workers, or a cap on them, by tier; a tier the map lacks has none. */
export type TierCounts = Partial<Record<Tier, number>>

/** The workers of each tier among `tiers` (the ones running plus those starting). */
export const countTiers = (tiers: Iterable<Tier>): TierCounts => {
  const out: TierCounts = {}
  for (const t of tiers) out[t] = (out[t] ?? 0) + 1
  return out
}

/** MOD-131: is the tier's own cap reached? A tier the map lacks (or no tier) has none. */
export const tierFull = (tier: Tier | undefined, caps: TierCounts | undefined, held: TierCounts | undefined): boolean => {
  const cap = tier ? caps?.[tier] : undefined
  return tier !== undefined && cap !== undefined && (held?.[tier] ?? 0) >= cap
}

/**
 * A slot is free while the workers running plus those still starting stay under the cap. MOD-131 (#219): given the
 * spawn's tier, the caps by tier and the workers held (running plus starting) by tier, the tier's own cap must
 * leave room too; a tier the caps lack takes the total alone.
 */
export const hasSlot = (running: number, starting: number, max: number, tier?: Tier, caps?: TierCounts, held?: TierCounts): boolean =>
  running + starting < max && !tierFull(tier, caps, held)

/** MOD-131: the free slots of each capped tier (never below 0). */
export const tierFree = (caps: TierCounts | undefined, held: TierCounts | undefined): TierCounts =>
  Object.fromEntries(Object.entries(caps ?? {}).map(([t, cap]) => [t, Math.max(0, (cap ?? 0) - (held?.[t as Tier] ?? 0))])) as TierCounts

/** MOD-131: `6` when the map is empty, `6 (economy 5, standard 5, frontier 2)` when it is set (ladder order, only the tiers it has). */
export const maxWorkersText = (max: number, byTier: TierCounts | undefined): string => {
  const parts = TIERS.filter(t => byTier?.[t] !== undefined).map(t => `${t} ${byTier?.[t]}`)
  return parts.length === 0 ? String(max) : `${max} (${parts.join(', ')})`
}

/** MOD-145 (#234): the place a config layer names, as a person reads it. */
const SOURCE_PLACE: Record<string, string> = { default: 'the default', repo: 'the repo file', yours: 'your options file', host: 'the host options', locked: 'the host options (locked)' }
export const sourcePlace = (source: string): string => SOURCE_PLACE[source] ?? source

/** MOD-145 (#234): `maxWorkers 3 from your options file`: a limit, its value and the layer it came from. */
export const limitSourceText = (field: string, value: unknown, source: string): string => `${field} ${String(value)} from ${sourcePlace(source)}`

/**
 * MOD-145 (#234): the /delegation `max workers` text with where it came from:
 * `3 (from your options file; standard 2 from the repo file)`. A tier is named only when its source differs from the total's.
 */
export const maxWorkersSourcedText = (max: number, byTier: TierCounts | undefined, sources: Record<string, string> | undefined): string => {
  const total = sources?.maxWorkers
  if (total === undefined) return maxWorkersText(max, byTier)
  const tierSource = sources?.maxWorkersByTier
  const named = TIERS.filter(t => byTier?.[t] !== undefined)
  if (tierSource === undefined || tierSource === total || named.length === 0) return `${maxWorkersText(max, byTier)} (from ${sourcePlace(total)})`
  return `${max} (from ${sourcePlace(total)}; ${named.map(t => limitSourceText(t, byTier?.[t], tierSource)).join('; ')})`
}

/** The labels of spawns starting for someone else: a spawn's own starting token (same label) is never counted against it. */
export const startingOthers = (starting: Iterable<string>, label: string): string[] => [...starting].filter(l => l !== label)

/**
 * The refusal for a briefed spawn that waits, the line the dispatch result
 * and the spawn hook both give (MOD-12): the agents live and the rows queued,
 * named apart.
 */
export const queuedDeny = (task: string, live: readonly string[], queued: readonly string[], tier?: Tier, limit?: string): string =>
  `${QUEUED_PREFIX}${task} — ${slotFrees(tier)} (${live.length} live: ${live.join(', ')}; ${queued.length} queued: ${queued.join(', ')}${limit ? `; limit: ${limit}` : ''})`

/** HH:MM of a queue row's time, as the clock on the wall reads it. */
export const clockText = (at: number): string => {
  const d = new Date(at)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

export const alreadyQueuedText = (at: number, position: number): string => `already queued since ${clockText(at)} (position ${position})`

export const alreadyQueuedDeny = (task: string, at: number, position: number, tier?: Tier, limit?: string): string => `${QUEUED_PREFIX}${task} — ${slotFrees(tier)}; ${alreadyQueuedText(at, position)}${limit ? `; limit: ${limit}` : ''}`

/** The "already queued since …" part of a deny, if it is that kind. */
export const alreadyQueuedPart = (deny: string): string | undefined => (isQueuedDeny(deny) ? /already queued since \d\d:\d\d \(position \d+\)(?=$|; limit: )/.exec(deny)?.[0] : undefined)

/** Whole minutes a queued row waited. */
export const waitedMinutes = (since: number, now: number): number => Math.max(0, Math.round((now - since) / 60000))

/** The queue index of a task and subtask, or -1. */
export const queuedIndex = (queue: readonly QueuedSpawn[], task: string, subtask: string): number => queue.findIndex(q => q.task === task && (q.subtask ?? 'main') === subtask)

export const isQueuedDeny = (deny: string): boolean => deny.startsWith(QUEUED_PREFIX) && (deny.includes(` — ${SLOT_FREES}`) || TIER_SLOT_FREES.test(deny) || deny.includes(RESOURCE_WAIT))

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

/**
 * MOD-12: a second spawn of a brief whose attempt still runs (or is starting)
 * is refused, by the spawn hook and the dispatch result alike, naming it.
 */
export const runningDeny = (label: string, running?: { attempt: number; agentId: string }): string =>
  running
    ? `chassis-delegation: ${label} not spawned — already running as attempt ${running.attempt} (agent ${running.agentId}); wait for its hand-back`
    : `chassis-delegation: ${label} not spawned — already starting (another spawn of its brief holds the slot); wait for its hand-back`

/** MOD-12: how many queued rows a free slot waits for: the cap less the workers running and starting. */
export const readyCount = (running: number, starting: number, max: number): number => Math.max(0, max - running - starting)

/** MOD-12: the advice when a slot frees for a queued task: the brain makes its spawn. */
export const readyLine = (label: string, task: string): string => `ready: ${label} — run its spawn block (/dispatch ${task} prints it again)`

/** MOD-56: a freed slot after a worker stopped on a usage limit: the queued task is held, not announced ready. */
export const heldLine = (label: string, at: string, resetsAt?: string): string =>
  `held: ${label} queued; the last worker stopped on a usage limit at ${at}${resetsAt ? `, resets ${resetsAt}` : ''}; dispatch it when the limit resets`

// ---- MOD-15: a ready row the brain leaves unclaimed ------------------------------------

/** MOD-15: minutes a ready row waits for the brain before the mod starts a worktree worker itself; 0 turns the fallback off. */
export const DEFAULT_READY_FALLBACK_MINUTES = 10

/** `readyFallbackMinutes`: a number of minutes, 0 meaning off; anything else is the default. */
export const parseReadyFallbackMinutes = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : DEFAULT_READY_FALLBACK_MINUTES)

/** Has a row that became ready at `since` waited `minutes` (0: never due)? */
export const fallbackDue = (since: number, now: number, minutes: number): boolean => minutes > 0 && now - since >= minutes * 60000

/** Milliseconds until a row that became ready at `since` is due (never below one second, so a timer never spins). */
export const fallbackDelay = (since: number, now: number, minutes: number): number => Math.max(1000, since + minutes * 60000 - now)

/**
 * What kind of brief a queued row names, as its header says: a worktree brief
 * (the default) may be started by the fallback; `repo=here` shares the person's
 * checkout and `repo=none` has no worktree, so those wait for the brain; a
 * header that could not be read is not guessed at.
 */
export type FallbackKind = 'worktree' | 'here' | 'none' | 'unknown'
export const fallbackKind = (header: { repo?: string } | undefined): FallbackKind =>
  header === undefined ? 'unknown' : header.repo === 'here' ? 'here' : header.repo === 'none' ? 'none' : 'worktree'

const NEVER_STARTS: Readonly<Record<Exclude<FallbackKind, 'worktree'>, string>> = {
  here: 'a repo=here worker shares your checkout, so the mod never starts it',
  none: 'a repo=none worker has no worktree, so the mod never starts it',
  unknown: 'its brief could not be read, so the mod never starts it',
}

/** The ready line of a row the fallback will never start, once it has waited past the timeout: it says how long. */
export const readyWaitLine = (label: string, task: string, waited: number, kind: Exclude<FallbackKind, 'worktree'>): string =>
  `${readyLine(label, task)} — waited ${waited} min; ${NEVER_STARTS[kind]}`

/**
 * The row posted when the fallback started a ready worktree row itself: it
 * ran outside the mod's hooks, and the brain should know what that costs.
 */
export const fallbackRow = (v: { label: string; waited: number; attempt: number; budget: number; agentId?: string; alias?: string }): string =>
  `chassis-delegation: ${v.label} was ready for ${v.waited} min and the brain had not spawned it; the mod started it itself (attempt ${v.attempt}/${v.budget}${v.alias ? `, ${v.alias}` : ''}${v.agentId ? `, agent ${v.agentId}` : ''}). ` +
  "It runs outside the mod's hooks: no git guard, no effort setting, cost known only at the end."

// ---- MOD-23: exclusive resources -----------------------------------------------------------------

/** A task label and the resources its brief names (`resources=`): a running attempt holds them, a queued one wants them. */
export type Wanting = { label: string; resources: readonly string[]; /** MOD-131: the tier of a queued row (its brief header's `tier=`). */ tier?: Tier }
/** The resource a card waits for, and the label of the attempt (or the queued card ahead of it) that holds it. */
export type ResourceWait = { resource: string; holder: string }

/**
 * The first resource `wants` names that an attempt other than `label` holds, with that holder; undefined when
 * none is held. A card is never held up by itself, and a card with no resources is never held up.
 */
export function resourceBlock(wants: readonly string[], holders: readonly Wanting[], label: string): ResourceWait | undefined {
  for (const resource of wants) {
    const holder = holders.find(h => h.label !== label && h.resources.includes(resource))
    if (holder) return { resource, holder: holder.label }
  }
  return undefined
}

/** `waiting for resource blender-live (held by T-1)`: what a state row says it waits for. */
export const waitsText = (w: ResourceWait): string => `waiting for resource ${w.resource} (held by ${w.holder})`

/**
 * The refusal for a briefed spawn whose resource a running attempt holds: the dispatch result and the spawn hook
 * both give it, as they give the slot refusal. A task already in the queue keeps its place and says since when.
 */
export const resourceDeny = (task: string, resource: string, holder: string, existing?: { at: number; position: number }): string =>
  `${QUEUED_PREFIX}${task}${RESOURCE_WAIT}${resource} (held by ${holder})${existing ? `; ${alreadyQueuedText(existing.at, existing.position)}` : ''}`

/**
 * Which queued rows the mod calls ready (head first, at most `free`) and which wait for a resource. A row waits when
 * an attempt in `held` holds a resource it names, or when a row ahead of it in the queue names it (the queue is
 * first come, first served per resource). A row that waits for a resource takes no slot, so a row behind it with no
 * resources, or others, is ready in its place. MOD-131 (#219): `tierLeft` is the free slots of each capped tier; a row
 * is ready when a total slot and a slot of its tier are both free, consuming both, and a row whose tier is full is
 * skipped without a slot (named in `tierHeld` when the total had room), so a row of another tier behind it is ready.
 */
export function planQueue(queue: readonly Wanting[], held: readonly Wanting[], free: number, tierLeft: TierCounts = {}): { ready: string[]; waits: Map<string, ResourceWait>; tierHeld?: Map<string, Tier> } {
  const ready: string[] = []
  const waits = new Map<string, ResourceWait>()
  const tierHeld = new Map<string, Tier>()
  const left: TierCounts = { ...tierLeft }
  for (const [i, row] of queue.entries()) {
    const block = resourceBlock(row.resources, [...held, ...queue.slice(0, i)], row.label)
    if (block) waits.set(row.label, block)
    else if (ready.length < free) {
      // MOD-131 (#219): a row whose tier is full is skipped without taking a slot; a row of another tier behind it may be ready
      const cap = row.tier ? left[row.tier] : undefined
      if (row.tier && cap !== undefined) {
        if (cap <= 0) {
          tierHeld.set(row.label, row.tier)
          continue
        }
        left[row.tier] = cap - 1
      }
      ready.push(row.label)
    }
  }
  return tierHeld.size > 0 ? { ready, waits, tierHeld } : { ready, waits }
}
