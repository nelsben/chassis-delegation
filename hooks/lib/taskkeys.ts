// MOD-117 (#185, #184): the store is one per machine and card ids restart in each repo, so every per-task key
// carries the card's repo: `<id>@<repo>`, the form MOD-97 gave a card of another local repo, now for the session's
// own cards too. Pure: register.ts reads the store, calls the plan, and writes and deletes what it returns.

/** A repo path as a key part: no trailing slash ('/' stays '/'). */
export const trimRepo = (path: string): string => path.replace(/\/+$/, '') || '/'

/** A task id in its repo's key space: `<id>@<repo>`; the bare id only when there is no repo (a session with no root). */
export const scopedId = (task: string, repo: string): string => (repo ? `${task}@${trimRepo(repo)}` : task)

const P = 'delegation.'
/** The per-task families keyed by a card id (the part after the family is `<id>` bare, `<id>@<repo>` scoped). */
export const BY_TASK_FAMILIES = ['tasks', 'outside', 'effort', 'classifier', 'taskRepo', 'mergePrep'] as const
/** The per-attempt families keyed by an attempt key (`<label>[@<repo>][@replay…]:<lineage>:<attempt>`). */
export const BY_ATTEMPT_FAMILIES = ['posted', 'postedRow'] as const

/** A key part that already names a repo: repo paths are absolute, so `@/` marks one (a replay lane is `@replay…`). */
const isScoped = (rest: string): boolean => rest.includes('@/')

/** The repo a stored row says it came from: its `root`, else its `repo`; undefined when it names neither. */
export function rowRoot(row: unknown): string | undefined {
  if (!row || typeof row !== 'object' || Array.isArray(row)) return undefined
  const o = row as Record<string, unknown>
  for (const f of ['root', 'repo']) {
    const v = o[f]
    if (typeof v === 'string' && v.startsWith('/')) return trimRepo(v)
  }
  return undefined
}

/** An attempt key with the repo put in after its label: `T-1/api@replay-ab:1:2` → `T-1/api@<repo>@replay-ab:1:2`. */
export function scopedAttemptKey(rest: string, repo: string): string {
  const at = rest.search(/[@:]/)
  const cut = at < 0 ? rest.length : at
  return `${rest.slice(0, cut)}@${trimRepo(repo)}${rest.slice(cut)}`
}

export type MigrationPlan = {
  /** Keys to write, with their whole new value. */
  set: [key: string, value: unknown][]
  /** The bare keys to delete once the writes are done. */
  delete: string[]
}

const sameRow = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * What moves each bare per-task key to its repo's key. An attempt ledger (`delegation.tasks.<id>`) is split by row:
 * a row that names a root (or repo) goes to that repo's key, a row with none to the session root's; a row already
 * at the target is not written twice. Any other family's bare value goes to the key of the root (or repo) it names,
 * else the session root's, and a value already at that key wins. Every bare key of these families is deleted.
 * With no session root nothing moves: the bare key is that session's own key.
 */
export function migrationPlan(entries: readonly (readonly [string, unknown])[], sessionRoot: string): MigrationPlan {
  const root = sessionRoot ? trimRepo(sessionRoot) : ''
  if (!root) return { set: [], delete: [] }
  const values = new Map<string, unknown>(entries)
  const writes = new Map<string, unknown>()
  const current = (key: string): unknown => (writes.has(key) ? writes.get(key) : values.get(key))
  const del: string[] = []
  for (const [key, value] of entries) {
    if (!key.startsWith(P)) continue
    const dot = key.indexOf('.', P.length)
    if (dot < 0) continue
    const family = key.slice(P.length, dot)
    const rest = key.slice(dot + 1)
    if (rest === '' || isScoped(rest)) continue
    if (family === 'tasks') {
      const rows = Array.isArray(value) ? value : [value]
      const byRoot = new Map<string, unknown[]>()
      for (const r of rows) {
        const to = rowRoot(r) ?? root
        byRoot.set(to, [...(byRoot.get(to) ?? []), r])
      }
      for (const [to, moved] of byRoot) {
        const target = `${P}tasks.${scopedId(rest, to)}`
        const held = current(target)
        const there = Array.isArray(held) ? held : []
        writes.set(target, [...there, ...moved.filter(r => !there.some(t => sameRow(t, r)))])
      }
      del.push(key)
    } else if ((BY_TASK_FAMILIES as readonly string[]).includes(family)) {
      const target = `${P}${family}.${scopedId(rest, rowRoot(value) ?? root)}`
      if (current(target) === undefined) writes.set(target, value)
      del.push(key)
    } else if ((BY_ATTEMPT_FAMILIES as readonly string[]).includes(family)) {
      const target = `${P}${family}.${scopedAttemptKey(rest, root)}`
      if (current(target) === undefined) writes.set(target, value)
      del.push(key)
    }
  }
  return { set: [...writes.entries()], delete: del }
}

export const migratedLine = (n: number): string => `store: moved ${n} per-task key${n === 1 ? '' : 's'} to their repo's key (MOD-117)`
