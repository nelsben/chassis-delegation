// MOD-244: a parsed card index keyed by card path, kept in step with one folder listing. Pure: the caller lists the folder
// (one $.fs.list, which carries each file's mtime and size, so no per-file stat is made) and supplies the read.
import { parseCard, type Card } from './dispatch'

/** One entry of a folder listing. */
export type ListedFile = { name: string; size: number; mtimeMs: number }
/** A card file as last read: the (mtime, size) it had and its parse (undefined when unreadable; an error parse is kept as the error). */
export type CardEntry = { mtimeMs: number; size: number; card: Card | { error: string } | undefined }
/** Card path to entry. */
export type CardIndex = Map<string, CardEntry>

/**
 * The index for `dir` after `listing`: a card whose mtime or size is the same as in `prev` keeps its parse with no read; a
 * changed or new card is read; a card in `prev` under `dir` that is no longer listed is dropped. Entries of other folders pass through.
 * `reads` counts the files read. Accepted: an edit of identical size within the host's mtime resolution is missed.
 */
export async function syncCardIndex(
  prev: CardIndex,
  dir: string,
  listing: readonly ListedFile[],
  read: (path: string) => Promise<string | undefined>,
): Promise<{ index: CardIndex; reads: number }> {
  const prefix = `${dir}/`
  const index: CardIndex = new Map()
  for (const [path, entry] of prev) if (!path.startsWith(prefix)) index.set(path, entry)
  let reads = 0
  for (const e of listing) {
    if (!e.name.endsWith('.md')) continue
    const path = `${prefix}${e.name}`
    const had = prev.get(path)
    if (had && had.mtimeMs === e.mtimeMs && had.size === e.size) {
      index.set(path, had)
      continue
    }
    reads += 1
    const text = await read(path)
    index.set(path, { mtimeMs: e.mtimeMs, size: e.size, card: text === undefined ? undefined : parseCard(text) })
  }
  return { index, reads }
}

/** The valid cards of `dir` in the index, in listing order: (file name, card). */
export function cardsOf(index: CardIndex, dir: string, listing: readonly ListedFile[]): { name: string; card: Card }[] {
  const out: { name: string; card: Card }[] = []
  for (const e of listing) {
    const c = index.get(`${dir}/${e.name}`)?.card
    if (c && !('error' in c)) out.push({ name: e.name, card: c })
  }
  return out
}
