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

/** MOD-329: a board card as the release reads it. */
export type ReleaseCard = { id: string; status?: string; parent?: number; scope: readonly string[]; blockedBy: readonly string[] }
export type ReleaseStep = { id: string; action: 'release' } | { id: string; action: 'still'; blockers: string[] }

const idNumber = (id: string): number => Number(/(\d+)\s*$/.exec(id)?.[1] ?? Number.MAX_SAFE_INTEGER)

/**
 * What landing `mergedId` does to the blocked cards waiting on it, in id order. A card with blockers left stays blocked by
 * them; one with none left is released unless its scope overlaps an open sibling under the same parent (including the
 * cards released earlier in this pass), which then blocks it.
 */
export function releasePlan(mergedId: string, cards: readonly ReleaseCard[], done: ReadonlySet<string>): ReleaseStep[] {
  const mergedIds = new Set(cards.filter(c => c.status === 'merged').map(c => c.id))
  const gone = (id: string): boolean => id === mergedId || done.has(id) || mergedIds.has(id)
  const waiting = cards
    .filter(c => c.status === 'blocked' && c.blockedBy.includes(mergedId))
    .sort((a, b) => idNumber(a.id) - idNumber(b.id) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
  const released: ReleaseCard[] = []
  const out: ReleaseStep[] = []
  for (const c of waiting) {
    const remaining = c.blockedBy.filter(b => !gone(b))
    if (remaining.length > 0) {
      out.push({ id: c.id, action: 'still', blockers: remaining })
      continue
    }
    const hits: string[] = []
    if (c.parent !== undefined) {
      const open = cards.filter(s => s.parent === c.parent && s.id !== c.id && !gone(s.id) && s.status !== 'blocked' && s.status !== 'merged')
      for (const s of [...open, ...released.filter(r => r.parent === c.parent)]) {
        if (!hits.includes(s.id) && scopeOverlap(c.scope, s.scope)) hits.push(s.id)
      }
    }
    if (hits.length > 0) {
      out.push({ id: c.id, action: 'still', blockers: hits })
    } else {
      out.push({ id: c.id, action: 'release' })
      released.push(c)
    }
  }
  return out
}

/**
 * The card text after a release step: with no `blockers` the frontmatter's `status: blocked` becomes `status: queued` and
 * its `blocked_by:` line goes; with blockers it stays blocked and `blocked_by` names them. Nothing else changes; a text
 * with no `status: blocked` line in its frontmatter comes back as it was.
 */
export function rewriteBlocked(cardText: string, blockers?: readonly string[]): string {
  const m = /^---\r?\n([\s\S]*?\r?\n)---/.exec(cardText)
  if (!m) return cardText
  const front = m[1] as string
  const lines = front.split('\n')
  if (!lines.some(l => /^status:\s*blocked\s*\r?$/.test(l))) return cardText
  const eol = front.includes('\r\n') ? '\r' : ''
  const out: string[] = []
  let wrote = false
  const withBlockers = blockers !== undefined && blockers.length > 0
  for (const l of lines) {
    if (/^blocked_by:/.test(l)) {
      if (withBlockers && !wrote) {
        out.push(`blocked_by: [${blockers.join(', ')}]${eol}`)
        wrote = true
      }
      continue
    }
    if (/^status:\s*blocked\s*\r?$/.test(l)) {
      out.push(withBlockers ? l : `status: queued${eol}`)
      if (withBlockers && !lines.some(x => /^blocked_by:/.test(x))) {
        out.push(`blocked_by: [${blockers.join(', ')}]${eol}`)
        wrote = true
      }
      continue
    }
    out.push(l)
  }
  const head = cardText.slice(0, cardText.indexOf(front))
  return head + out.join('\n') + cardText.slice(head.length + front.length)
}
