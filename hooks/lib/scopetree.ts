// MOD-188: a card's scope against its parent issue's scope block. Pure, no I/O.
import { globMatches } from './verify-native'

/**
 * Whether the child glob sits inside the parent's scope: a parent glob equals it; or a parent glob ends in
 * `/**` and its prefix plus `/` is a prefix of the child (src/export/** holds src/export/a.ts and
 * src/export/sub/**, not src/exporter.ts); or the child names one path (no * ? [ {) and a parent glob matches it.
 */
export function contained(child: string, parents: readonly string[]): boolean {
  const literal = !/[*?[{]/.test(child)
  return parents.some(p => {
    if (p === child) return true
    if (p.endsWith('/**') && child.startsWith(`${p.slice(0, -3)}/`)) return true
    return literal && globMatches(child, p)
  })
}

/** The first scope glob that is not contained in the parent's globs, or undefined when all are. */
export function strayGlob(scope: readonly string[], parents: readonly string[]): string | undefined {
  return scope.find(g => !contained(g, parents))
}

/** A card folder entry as the sibling rule reads it. */
export type SiblingCard = { id: string; status?: string; parent: unknown; scope: readonly string[] }

/**
 * The open siblings of a new card under `parent`: same `parent:`, status not `merged`, and no accepted/merged
 * ledger row (`done`, the task ids with one; the card status lags, so the ledger decides).
 */
export function openSiblings(cards: readonly SiblingCard[], parent: number, done: ReadonlySet<string>): { id: string; scope: readonly string[] }[] {
  return cards.filter(c => Number(c.parent) === parent && c.status !== 'merged' && !done.has(c.id)).map(c => ({ id: c.id, scope: c.scope }))
}
