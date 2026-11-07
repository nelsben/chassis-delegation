// MOD-328 (#462): a card that waits on others is written blocked (status: blocked, blocked_by), with no brief or
// worktree until its blockers merge. Pure: no `$`; card.ts and dispatch.ts import this, never the other way.
import { scopeOverlap } from './brief'

/** A card on the board as the blockedBy rule reads it. */
export type BoardCard = { id: string; status?: string; issue?: number }

/**
 * The cards a new card waits on: the explicit ids first, then every open sibling whose scope overlaps the
 * card's, each once. `overlapping` holds the overlapping sibling ids (their scope is not added to the forbid).
 */
export function blockersOf(
  scope: readonly string[],
  siblings: readonly { id: string; scope: readonly string[] }[],
  explicit: readonly string[],
): { blockers: string[]; overlapping: Set<string> } {
  const overlapping = new Set<string>()
  for (const sib of siblings) if (scopeOverlap(scope, sib.scope)) overlapping.add(sib.id)
  return { blockers: [...new Set([...explicit, ...overlapping])], overlapping }
}

/** What dispatch and the card tool say of a card that waits on `blockers`. */
export const blockedLine = (id: string, blockers: readonly string[]): string =>
  `${id} is blocked by ${blockers.join(', ')}; merge --finish of its last blocker releases it (or set status: queued to dispatch it now)`

/**
 * The `blockedBy` input as card ids. An entry is a task id (`MOD-12`) or an issue number (`12`, `#12`, 12); an issue
 * resolves to the one board card whose `issue:` it is. An id already merged (the ledger's `done` set, or status merged)
 * is dropped with a note. Returns the first refusal otherwise.
 */
export function resolveBlockedBy(
  raw: unknown,
  board: readonly BoardCard[],
  done: ReadonlySet<string>,
): { ids: string[]; notes: string[] } | { error: string } {
  if (raw === undefined) return { ids: [], notes: [] }
  if (!Array.isArray(raw) || raw.some(x => typeof x !== 'string' && typeof x !== 'number')) {
    return { error: 'blockedBy must be a list of task ids or issue numbers, e.g. ["MOD-12", "#13"]' }
  }
  const ids: string[] = []
  const notes: string[] = []
  for (const entry of raw as (string | number)[]) {
    const e = String(entry).trim()
    const num = /^#?(\d+)$/.exec(e)
    let id: string
    if (num) {
      const n = Number(num[1])
      const hits = board.filter(c => c.issue === n).map(c => c.id)
      if (hits.length === 0) return { error: `blockedBy #${n}: no card on the board names issue ${n}` }
      if (hits.length > 1) return { error: `blockedBy #${n}: ${hits.length} cards name issue ${n} (${hits.join(', ')})` }
      id = hits[0] as string
    } else {
      const hit = board.find(c => c.id === e)
      if (!hit) return { error: `blockedBy ${e}: no card ${e} on the board` }
      id = hit.id
    }
    const card = board.find(c => c.id === id)
    if (done.has(id) || card?.status === 'merged') {
      if (!notes.includes(`note: blockedBy ${id} already merged; not a blocker`)) notes.push(`note: blockedBy ${id} already merged; not a blocker`)
      continue
    }
    if (!ids.includes(id)) ids.push(id)
  }
  return { ids, notes }
}
