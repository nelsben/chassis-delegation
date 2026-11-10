// MOD-361: a repo's own card status words, mapped onto the mod's queued, merged or parked; a card's status is read by its first word.
// Pure: no I/O. The card file is never rewritten; the read word is what the listings and the dispatch check compare.

/** The seven status words the mod writes and compares. */
export const MOD_STATUS_WORDS = ['queued', 'claimed', 'blocked', 'merged', 'landed', 'parked', 'template'] as const

/** What a repo's own status word may map onto. */
export const STATUS_TARGETS = ['queued', 'merged', 'parked'] as const

export type StatusMap = Readonly<Record<string, string>>

const WORD = /^[a-z][a-z0-9_-]*/
const WORD_ONLY = /^[a-z][a-z0-9_-]*$/

/** The first word of a status, trimmed and lower-cased; undefined when it has none. */
export function firstWord(raw: string): string | undefined {
  const m = WORD.exec(raw.trim().toLowerCase())
  return m ? m[0] : undefined
}

const isPlainObject = (v: unknown): v is Record<string, unknown> => v !== null && typeof v === 'object' && !Array.isArray(v)

/** A repo's `statusMap` option: its own words mapped onto a target. A bad entry is dropped with one error; the good ones stay. */
export function statusMapOf(v: unknown, errors: string[], where: string): Record<string, string> | undefined {
  if (!isPlainObject(v)) {
    errors.push(`statusMap${where}: not an object (ignored)`)
    return undefined
  }
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(v)) {
    if (key.startsWith('_')) continue
    const word = key.trim().toLowerCase()
    const target = typeof value === 'string' ? value.trim().toLowerCase() : undefined
    const ok = WORD_ONLY.test(word) && !(MOD_STATUS_WORDS as readonly string[]).includes(word) && target !== undefined && (STATUS_TARGETS as readonly string[]).includes(target)
    if (ok) out[word] = target
    else errors.push(`statusMap.${key}${where}: needs a word of the repo's own mapped onto queued, merged or parked (ignored)`)
  }
  return out
}

/**
 * The word a card's status reads as. First match wins: a first word the map sets reads as its target; a first word the mod
 * writes reads as itself (so `Merged` and `merged (PR 27)` read as merged, with or without a map); otherwise the raw value stays.
 */
export function statusRead(raw: string | undefined, map: StatusMap): string | undefined {
  if (raw === undefined) return undefined
  const word = firstWord(raw)
  if (word === undefined) return raw
  if (Object.prototype.hasOwnProperty.call(map, word)) return map[word]
  if ((MOD_STATUS_WORDS as readonly string[]).includes(word)) return word
  return raw
}

/**
 * The Work view's note for the statuses it lists, as read: a status the mod does not know reads as queued, and the note says how
 * many cards carry such a word and which. Undefined when none does.
 */
export function unknownStatusNote(statuses: readonly (string | undefined)[]): string | undefined {
  const counts = new Map<string, number>()
  let cards = 0
  for (const s of statuses) {
    if (typeof s !== 'string' || s === '' || (MOD_STATUS_WORDS as readonly string[]).includes(s)) continue
    cards++
    const w = firstWord(s) ?? '(other)'
    counts.set(w, (counts.get(w) ?? 0) + 1)
  }
  if (cards === 0) return undefined
  const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const shown = ranked.slice(0, 4).map(([w, n]) => `${w} ${n}`)
  const more = ranked.length > 4 ? `, +${ranked.length - 4} more` : ''
  const list = `${shown.join(', ')}${more}`
  const file = 'statusMap in .chassis-delegation.json'
  if (cards === 1) return `1 card carries a status word the mod does not know (${list}): it reads as queued; map it onto queued, merged or parked with ${file}`
  return `${cards} cards carry a status word the mod does not know (${list}): they read as queued; map each onto queued, merged or parked with ${file}`
}
