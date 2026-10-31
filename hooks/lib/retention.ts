// MOD-89 (#157, #159): what the mod deletes from its own store, so a `$.store.set` is never refused at the
// host's cap (4 MiB of JSON text in all). Pure: register.ts reads the store, calls the plan, and deletes the keys
// it returns through `$.store.delete`, never the store file.

export const MIB = 1024 * 1024
/** The host's cap: `$.store.set` rejects once the store's JSON text passes it. */
export const STORE_CAP_BYTES = 4 * MIB
/** A closed task's records are kept this long after their newest timestamp. */
export const RETAIN_MS = 7 * 24 * 60 * 60 * 1000
/** MOD-128: a rationing day record (`delegation.ration.<kind>.<day>`) is kept this long after its lastAt, and never belongs to a task. */
export const RATION_RETAIN_MS = 14 * 24 * 60 * 60 * 1000
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
  /** MOD-233: the live session's keys; the plan never deletes them, whatever their age. */
  keep?: readonly string[]
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
/** MOD-217: a worker's write log, keyed by its agent id like its cost. */
const WRITES = `${P}writes.`
const RATION = `${P}ration.`
/** MOD-233: session-level families keyed by the session id; aged out after RATION_RETAIN_MS by their newest timestamp. brain, postAsk and freshSession are not among them. */
const SESSION = ['recent', 'debrief', 'merged', 'notes', 'friction'].map(f => `${P}${f}.`)
const retainFor = (key: string): number => (key.startsWith(RATION) || SESSION.some(p => key.startsWith(p)) ? RATION_RETAIN_MS : RETAIN_MS)

/** The task id of a task label or key: `T-1/api`, `T-1@replay-ab12`, `T-1:1:2`, `T-1@/other` are all T-1. */
export const taskOfLabel = (label: string): string => label.split(/[/@:]/)[0] ?? label

const taskOfBrief = (path: string): string | undefined => /([^/\\]+?)(?:\.replay)?\.brief\.md$/.exec(path)?.[1]

const TS_FIELDS = ['at', 'verdictAt', 'retireTriedAt', 'retireCheckedAt', 'finishedAt', 'lastAt']
/** The newest timestamp a value carries (an array: over its items); undefined when none. */
function ownTs(v: unknown): number | undefined {
  if (Array.isArray(v)) return newest(v.map(ownTs))
  if (!v || typeof v !== 'object') return undefined
  const o = v as Record<string, unknown>
  // MOD-233: a friction record keeps its timestamps in events[].at
  const events = Array.isArray(o.events) ? ownTs(o.events) : undefined
  const accepted = o.accepted && typeof o.accepted === 'object' ? (o.accepted as Record<string, unknown>).at : undefined
  return newest([...TS_FIELDS.map(f => o[f]), accepted].map(x => (typeof x === 'number' && Number.isFinite(x) ? x : undefined)).concat(events))
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
    else if (key.startsWith(WRITES)) m = spawnMeta(str(AGENT + key.slice(WRITES.length)))
    else if (BY_ATTEMPT.some(p => key.startsWith(p))) m = withTask(taskOfLabel(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else if (BY_TASK.some(p => key.startsWith(p))) m = withTask(taskOfLabel(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else if (BY_BRIEF.some(p => key.startsWith(p))) m = withTask(taskOfBrief(key.slice(key.indexOf('.', P.length) + 1)), ownTs(value))
    else if (key.startsWith(RATION) || SESSION.some(p => key.startsWith(p))) return { key, bytes, ...(ownTs(value) !== undefined ? { ts: ownTs(value) as number } : {}) }
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
 * store is under TARGET_BYTES. An open task's records, a record with no timestamp, the `keep` keys and the global
 * keys (adhoc, evals, alias, updateCheck, brain, postAsk) are never in it. MOD-233: a session-level key (recent,
 * debrief, merged, notes, friction) goes RATION_RETAIN_MS after its newest timestamp, pressure or not.
 */
export function retentionPlan(input: RetentionInput): RetentionPlan {
  const { entries, now } = input
  const before = storeBytes(entries)
  const open = openTasks(entries, input.open, now)
  const keep = new Set(input.keep ?? [])
  const closed = metas(entries).filter(m => m.ts !== undefined && !keep.has(m.key) && !(m.task !== undefined && open.has(m.task)))
  const old = closed.filter(m => now - (m.ts as number) > retainFor(m.key))
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

/** MOD-233: a posted verdict older than this keeps one summary line, not its text. */
export const VERDICT_TEXT_MS = 24 * 60 * 60 * 1000

export type SlimPlan = {
  /** The spawn records to rewrite: key and new value (verdictBlock and verdictLine gone, verdictSummary set). */
  rewrite: { key: string; value: Record<string, unknown> }[]
  /** The postedRow keys whose value is no longer kept. */
  drop: string[]
}

/**
 * MOD-233: a spawn whose verdict was posted (`posted(attemptKey)` true) and judged more than VERDICT_TEXT_MS ago
 * keeps `verdictSummary`, the first line of its block, in place of the block, the line and the postedRow value.
 * Idempotent: a record with no verdictBlock is not listed. `attemptKeyOf` is the spawn's attempt key.
 */
export function slimSpawns(entries: readonly StoreEntry[], now: number, attemptKeyOf: (spawn: Record<string, unknown>) => string): SlimPlan {
  const values = new Map(entries)
  const judged = new Map<string, number>()
  for (const [k, v] of entries) {
    if (!k.startsWith(TASKS) || !Array.isArray(v)) continue
    for (const r of v) {
      const t = ownTs(r)
      if (t === undefined || !r || typeof r !== 'object') continue
      for (const id of [(r as Record<string, unknown>).toolUseId, (r as Record<string, unknown>).agentId]) if (typeof id === 'string') judged.set(id, Math.max(judged.get(id) ?? t, t))
    }
  }
  const out: SlimPlan = { rewrite: [], drop: [] }
  for (const [k, v] of entries) {
    if (!k.startsWith(SPAWN) || !v || typeof v !== 'object') continue
    const s = v as Record<string, unknown>
    if (typeof s.verdictBlock !== 'string' || s.verdictBlock === '') continue
    const key = typeof s.key === 'string' ? s.key : k.slice(SPAWN.length)
    const at = newest([judged.get(key), typeof s.agentId === 'string' ? judged.get(s.agentId) : undefined, typeof s.at === 'number' ? s.at : undefined])
    if (at === undefined || now - at <= VERDICT_TEXT_MS) continue
    const ak = attemptKeyOf(s)
    if (values.get(`${P}posted.${ak}`) !== true) continue
    const { verdictBlock, verdictLine: _line, ...rest } = s
    out.rewrite.push({ key: k, value: { ...rest, verdictSummary: verdictBlock.split('\n')[0] ?? '' } })
    if (values.has(`${P}postedRow.${ak}`)) out.drop.push(`${P}postedRow.${ak}`)
  }
  return out
}

/** MOD-243: the full scan runs at least this often, whatever the estimate says. */
export const FULL_SCAN_MS = 24 * 60 * 60 * 1000
/** MOD-243: `delegation.prune`, written after each full prune: when it ran and the store's bytes after it. */
export type PruneRecord = { at: number; bytes: number }
export const isPruneRecord = (v: unknown): v is PruneRecord =>
  !!v && typeof v === 'object' && typeof (v as PruneRecord).at === 'number' && Number.isFinite((v as PruneRecord).at) && typeof (v as PruneRecord).bytes === 'number' && Number.isFinite((v as PruneRecord).bytes)

/**
 * MOD-243: whether the full scan is worth it. Yes when a write was refused, when there is no prune record or no
 * estimate, when the estimate is over PRESSURE_BYTES, or when the last scan is 24 h old (or in the future).
 */
export function scanDue(input: { last: PruneRecord | undefined; estimate: number | undefined; now: number; refused: boolean }): boolean {
  if (input.refused || !input.last || input.estimate === undefined) return true
  if (input.estimate > PRESSURE_BYTES) return true
  const age = input.now - input.last.at
  return age < 0 || age >= FULL_SCAN_MS
}

/** MOD-243: the running estimate of the store's bytes: a base (the last full scan's) and what this process wrote or deleted since. */
export class SizeEstimate {
  private base: number | undefined
  private delta = 0
  private readonly sizes = new Map<string, number>()
  /** The base is the store's bytes at a full scan (or the last prune record's); the delta and the known sizes restart. */
  reset(base: number | undefined): void {
    this.base = base
    this.delta = 0
    this.sizes.clear()
  }
  /** Sets the base only when none is known (the prune record read); writes already counted stay. */
  seed(base: number | undefined): void {
    if (this.base === undefined) this.base = base
  }
  get known(): boolean {
    return this.base !== undefined
  }
  /** A write of `value` at `key`: its bytes replace what this process knew of it (a key it never saw adds its comma too). */
  set(key: string, value: unknown): void {
    const was = this.sizes.get(key)
    const now = entryBytes(key, value)
    this.delta += was === undefined ? now + 1 : now - was
    this.sizes.set(key, now)
  }
  /** A delete subtracts what this process knew of the key (nothing, for one it never saw: the estimate stays high). */
  delete(key: string): void {
    const was = this.sizes.get(key)
    if (was === undefined) return
    this.delta -= was + 1
    this.sizes.delete(key)
  }
  get bytes(): number | undefined {
    return this.base === undefined ? undefined : Math.max(2, this.base + this.delta)
  }
}
