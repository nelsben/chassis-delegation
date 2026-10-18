// MOD-89 (#157, #159): what the mod deletes from its own store, so a `$.store.set` is never refused at the
// host's cap (4 MiB of JSON text in all). Pure: register.ts reads the store, calls the plan, and deletes the keys
// it returns through `$.store.delete`, never the store file.

export const MIB = 1024 * 1024
/** The host's cap: `$.store.set` rejects once the store's JSON text passes it. */
export const STORE_CAP_BYTES = 4 * MIB
/** A closed task's records are kept this long after their newest timestamp. */
export const RETAIN_MS = 7 * 24 * 60 * 60 * 1000
/** Over this, closed records younger than RETAIN_MS go too, oldest first ... */
export const PRESSURE_BYTES = 3.5 * MIB
/** ... until the store is under this. */
export const TARGET_BYTES = 3 * MIB

export type StoreEntry = readonly [key: string, value: unknown]
export type RetentionInput = {
  entries: readonly StoreEntry[]
  /** The open tasks: running workers, pending verdicts, queued spawns; a task id or a label (`T-1`, `T-1/api`, `T-1@replay-…`). */
  open: Iterable<string>
  now: number
}
export type RetentionPlan = {
  /** The keys to delete, oldest first. */
  delete: string[]
  /** The store's compact JSON text before and after, in UTF-8 bytes. */
  before: number
  after: number
}

/** UTF-8 byte length of a string (no TextEncoder: the plugin runtime need not have one). */
export function utf8Bytes(s: string): number {
  let n = 0
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i)
    if (c < 0x80) n += 1
    else if (c < 0x800) n += 2
    else if (c >= 0xd800 && c <= 0xdbff && i + 1 < s.length && (s.charCodeAt(i + 1) & 0xfc00) === 0xdc00) {
      n += 4
      i++
    } else n += 3
  }
  return n
}

/** One key's share of the store's text: `"key":value` (the comma between keys is counted by storeBytes). */
export function entryBytes(key: string, value: unknown): number {
  return utf8Bytes(JSON.stringify(key)) + 1 + utf8Bytes(JSON.stringify(value) ?? 'null')
}

/** The store as the host measures it: the compact JSON text of the whole object, in UTF-8 bytes. */
export function storeBytes(entries: readonly StoreEntry[]): number {
  return 2 + Math.max(0, entries.length - 1) + entries.reduce((n, [k, v]) => n + entryBytes(k, v), 0)
}

const P = 'delegation.'
/** Per-task families keyed by the task id (MOD-97: `<ID>@<repo>` for a task of another repo). */
const BY_TASK = ['classifier', 'effort', 'outside', 'taskRepo', 'mergePrep'].map(f => `${P}${f}.`)
/** Per-attempt families keyed by the attempt key (`<label>[@replay…]:<lineage>:<attempt>`). */
const BY_ATTEMPT = ['posted', 'postedRow'].map(f => `${P}${f}.`)
/** Per-brief families keyed by the brief path (`…/<ID>.brief.md`, `…/<ID>.replay.brief.md`). */
const BY_BRIEF = ['handoff', 'replay'].map(f => `${P}${f}.`)
const TASKS = `${P}tasks.`
const SPAWN = `${P}spawn.`
const AGENT = `${P}agent.`
const NAME = `${P}agentName.`
const COST = `${P}cost.`

/** The task id of a task label or key: `T-1/api`, `T-1@replay-ab12`, `T-1:1:2`, `T-1@/other` are all T-1. */
export const taskOfLabel = (label: string): string => label.split(/[/@:]/)[0] ?? label

const taskOfBrief = (path: string): string | undefined => /([^/\\]+?)(?:\.replay)?\.brief\.md$/.exec(path)?.[1]

const TS_FIELDS = ['at', 'verdictAt', 'retireTriedAt', 'retireCheckedAt', 'finishedAt', 'lastAt']
/** The newest timestamp a value carries (an array: over its items); undefined when none. */
function ownTs(v: unknown): number | undefined {
  if (Array.isArray(v)) return newest(v.map(ownTs))
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  const accepted = o.accepted && typeof o.accepted === 'object' ? (o.accepted as Record<string, unknown>).at : undefined
  return newest([...TS_FIELDS.map(f => o[f]), accepted].map(x => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)))
}
function newest(xs: readonly (number | undefined)[]): number | undefined {
  let best: number | undefined
  for (const x of xs) if (x !== undefined && (best === undefined || x > best)) best = x
  return best
}

type Meta = { key: string; task?: string; ts?: number; bytes: number }

/** Each key's task and newest timestamp: its own, else (and at least) that of the record it hangs off. */
function metas(entries: readonly StoreEntry[]): Meta[] {
  const values = new Map(entries)
  const str = (k: string): string | undefined => {
    const v = values.get(k)
    return typeof v === 'string' ? v : undefined
  }
  // a task's newest timestamp, and the newest attempt by its spawn's tool_use_id or agent id
  const taskTs = new Map<string, number>()
  const attemptTs = new Map<string, number>()
  for (const [k, v] of entries) {
    if (!k.startsWith(TASKS) || !Array.isArray(v)) continue
    const t = ownTs(v)
    // MOD-97: a task's records for another repo (`<ID>@<repo>`) are that task's too
    const task = taskOfLabel(k.slice(TASKS.length))
    if (t !== undefined) taskTs.set(task, Math.max(taskTs.get(task) ?? t, t))
    for (const r of v) {
      const rt = ownTs(r)
      if (rt === undefined || !r || typeof r !== 'object') continue
      for (const id of [(r as Record<string, unknown>).toolUseId, (r as Record<string, unknown>).agentId]) {
        if (typeof id === 'string') attemptTs.set(id, Math.max(attemptTs.get(id) ?? rt, rt))
      }
    }
  }
  const spawnMeta = (spawnKey: string | undefined): { task?: string; ts?: number } => {
    if (spawnKey === undefined) return {}
    const v = values.get(SPAWN + spawnKey)
    if (!v || typeof v !== 'object') return {}
    const s = v as Record<string, unknown>
    const task = typeof s.task === 'string' ? s.task : undefined
    const agentId = typeof s.agentId === 'string' ? s.agentId : undefined
    return { ...(task ? { task } : {}), ts: newest([ownTs(s), attemptTs.get(spawnKey), agentId ? attemptTs.get(agentId) : undefined]) }
  }
  const withTask = (task: string | undefined, own: number | undefined): { task?: string; ts?: number } =>
    ({ ...(task ? { task } : {}), ts: newest([own, task ? taskTs.get(task) : undefined]) })

  return entries.map(([key, value]) => {
    const bytes = entryBytes(key, value)
    let m: { task?: string; ts?: number } = {}
    if (key.startsWith(TASKS)) m = { task: taskOfLabel(key.slice(TASKS.length)), ts: ownTs(value) }
    else if (key.startsWith(SPAWN)) m = spawnMeta(key.slice(SPAWN.length))
    else if (key.startsWith(AGENT)) m = spawnMeta(typeof value === 'string' ? value : undefined)
    else if (key.startsWith(NAME)) m = spawnMeta(typeof value === 'string' ? str(AGENT + value) : undefined)
    else if (key.startsWith(COST)) m = spawnMeta(str(AGENT + key.slice(COST.length)))
    else if (BY_ATTEMPT.some(p => key.startsWith(p))) m = withTask(taskOfLabel(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else if (BY_TASK.some(p => key.startsWith(p))) m = withTask(taskOfLabel(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else if (BY_BRIEF.some(p => key.startsWith(p))) m = withTask(taskOfBrief(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else return { key, bytes } // session-level and global keys: never the plan's
    return { key, bytes, ...(m.task ? { task: m.task } : {}), ...(m.ts !== undefined ? { ts: m.ts } : {}) }
  })
}

/** The tasks the plan never touches: the open ones given, and (a worker of another session) any with a pending attempt younger than RETAIN_MS. */
function openTasks(entries: readonly StoreEntry[], open: Iterable<string>, now: number): Set<string> {
  const out = new Set([...open].map(taskOfLabel))
  for (const [k, v] of entries) {
    if (!k.startsWith(TASKS) || !Array.isArray(v)) continue
    const pending = v.some(r => r && typeof r === 'object' && (r as Record<string, unknown>).verdict === 'pending' && now - (ownTs(r) ?? -Infinity) <= RETAIN_MS)
    if (pending) out.add(taskOfLabel(k.slice(TASKS.length)))
  }
  return out
}

const byAge = (a: Meta, b: Meta): number => (a.ts as number) - (b.ts as number) || (a.task ?? '').localeCompare(b.task ?? '') || a.key.localeCompare(b.key)

/**
 * The keys to delete, oldest first. A per-task record goes once its newest timestamp is more than RETAIN_MS old
 * and its task is not open; over PRESSURE_BYTES, closed records younger than that go too, oldest first, until the
 * store is under TARGET_BYTES. An open task's records, a record with no timestamp, and every session-level or
 * global key are never in it.
 */
export function retentionPlan(input: RetentionInput): RetentionPlan {
  const { entries, now } = input
  const before = storeBytes(entries)
  const open = openTasks(entries, input.open, now)
  const closed = metas(entries).filter(m => m.ts !== undefined && !(m.task !== undefined && open.has(m.task)))
  const old = closed.filter(m => now - (m.ts as number) > RETAIN_MS)
  const gone = new Set(old.map(m => m.key))
  let count = entries.length
  let size = before
  const drop = (m: Meta) => {
    gone.add(m.key)
    size -= m.bytes + (count > 1 ? 1 : 0)
    count -= 1
  }
  for (const m of old) {
    size -= m.bytes + (count > 1 ? 1 : 0)
    count -= 1
  }
  if (before > PRESSURE_BYTES) {
    // a task's records that share a timestamp go together, so a spawn is not left without its agent pointer
    const young = closed.filter(m => !gone.has(m.key) && m.task !== undefined).sort(byAge)
    for (let i = 0; i < young.length && size >= TARGET_BYTES; ) {
      const head = young[i] as Meta
      for (; i < young.length && young[i]!.task === head.task && young[i]!.ts === head.ts; i++) drop(young[i] as Meta)
    }
  }
  const order = closed.filter(m => gone.has(m.key)).sort(byAge)
  return { delete: order.map(m => m.key), before, after: size }
}

/** x.xx, rounded down so a store under the cap never reads as 4.00. */
export const mib = (bytes: number): string => (Math.floor((bytes / MIB) * 100) / 100).toFixed(2)
export const prunedLine = (n: number, before: number, after: number): string => `store: pruned ${n} records (${mib(before)} MiB to ${mib(after)} MiB of 4 MiB)`
export const storeLine = (bytes: number): string => `store: ${mib(bytes)} MiB of 4 MiB`
export const refusedWritesLine = (n: number, key: string): string => `store: ${n} writes refused this session (last ${key})`
export const refusedRow = (key: string, reason: string): string => `store write failed: ${key} (${reason}); new workers may have no verdict until the store is pruned`
