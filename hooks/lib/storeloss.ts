// MOD-94 (#157, #159): what keeps a worker counted and judged when the host refused its store record.
// The spawn hook appends a spawn row to the session root's ledger; a hand-back or the verdict tool that finds
// no store record (and nothing in the hook's own memory) rebuilds the attempt from the newest such row plus
// the brief it names. Pure: no `$`.

/** Where a verdict's attempt came from when its store record did not read back. */
export type Fallback = 'memory' | 'ledger'

/** One spawn row: `event: spawn` marks it (never `kind`, which a verdict row takes from its attempt record). */
export type SpawnRow = {
  event: 'spawn'
  task: string
  subtask: string
  attempt: number
  lineage: number
  budget: number
  tier: string
  alias: string
  purpose: string
  at: number
  agentId?: string
  toolUseId?: string
  briefPath?: string
  cwd?: string
  /** MOD-44: the other local repo the task is for. */
  repo?: string
  description?: string
  subagentType?: string
  resolvedModel?: string
  spend?: number
  resources?: string[]
  here?: string
  replay?: true
  base?: string
  sessionId?: string
}

/** The fields of a spawn record a spawn row is made from. */
export type SpawnFields = Omit<SpawnRow, 'event' | 'sessionId' | 'replay'> & { replay?: boolean }

/** The spawn row for a briefed spawn that just started (`sessionId` when known). */
export function spawnRow(s: SpawnFields, sessionId?: string): SpawnRow {
  return {
    event: 'spawn',
    task: s.task,
    subtask: s.subtask,
    attempt: s.attempt,
    lineage: s.lineage,
    budget: s.budget,
    tier: s.tier,
    alias: s.alias,
    purpose: s.purpose,
    at: s.at,
    ...(s.agentId ? { agentId: s.agentId } : {}),
    ...(s.toolUseId ? { toolUseId: s.toolUseId } : {}),
    ...(s.briefPath ? { briefPath: s.briefPath } : {}),
    ...(s.cwd ? { cwd: s.cwd } : {}),
    ...(s.repo ? { repo: s.repo } : {}),
    ...(s.description ? { description: s.description } : {}),
    ...(s.subagentType ? { subagentType: s.subagentType } : {}),
    ...(s.resolvedModel ? { resolvedModel: s.resolvedModel } : {}),
    ...(s.spend !== undefined ? { spend: s.spend } : {}),
    ...(s.resources && s.resources.length > 0 ? { resources: [...s.resources] } : {}),
    ...(s.here ? { here: s.here } : {}),
    ...(s.replay ? { replay: true as const, ...(s.base ? { base: s.base } : {}) } : {}),
    ...(sessionId ? { sessionId } : {}),
  }
}

/** Is a parsed ledger line a spawn row? */
export const isSpawnRow = (r: unknown): r is SpawnRow => {
  if (!r || typeof r !== 'object') return false
  const o = r as Record<string, unknown>
  return o.event === 'spawn' && typeof o.task === 'string' && typeof o.attempt === 'number'
}

type Parsed = { row: Record<string, unknown>; line: number }
function parsedLines(text: string): Parsed[] {
  const out: Parsed[] = []
  text.split('\n').forEach((line, i) => {
    if (line.trim() === '') return
    try {
      const row = JSON.parse(line) as unknown
      if (row && typeof row === 'object' && !Array.isArray(row)) out.push({ row: row as Record<string, unknown>, line: i })
    } catch {
      // a line that is not JSON is not a row
    }
  })
  return out
}

const sameAttempt = (a: Record<string, unknown>, b: SpawnRow): boolean =>
  a.task === b.task && (a.subtask ?? 'main') === b.subtask && a.attempt === b.attempt && Boolean(a.replay) === Boolean(b.replay)

/**
 * The verdict row the ledger holds for a spawn row's attempt, written after it (a reviewer's row is not the
 * worker's verdict); undefined while the attempt is open.
 */
export function verdictAfter(text: string, row: SpawnRow): { verdict: string; next?: string } | undefined {
  const lines = parsedLines(text)
  const at = lines.findIndex(p => isSpawnRow(p.row) && sameAttempt(p.row, row) && p.row.toolUseId === row.toolUseId && p.row.agentId === row.agentId)
  for (const p of lines.slice(at < 0 ? 0 : at + 1).reverse()) {
    if (typeof p.row.verdict !== 'string' || p.row.kind === 'review' || isSpawnRow(p.row) || !sameAttempt(p.row, row)) continue
    return { verdict: p.row.verdict, ...(typeof p.row.next === 'string' ? { next: p.row.next } : {}) }
  }
  return undefined
}

export type RowQuery = { agentId?: string; toolUseId?: string } | { task: string; subtask: string }

/**
 * The newest spawn row for an agent (its id, or the spawn's tool_use_id), or for a task and subtask. A task's
 * row is matched only by a query naming the task: a hand-back is matched by its agent alone.
 */
export function latestSpawnRow(text: string, q: RowQuery): SpawnRow | undefined {
  const rows = parsedLines(text).map(p => p.row).filter(isSpawnRow)
  for (const r of rows.reverse()) {
    if ('task' in q) {
      if (r.task === q.task && r.subtask === q.subtask && !r.replay) return r
    } else if ((q.agentId !== undefined && r.agentId === q.agentId) || (q.toolUseId !== undefined && r.toolUseId === q.toolUseId)) return r
  }
  return undefined
}

/** The spawn record's fields a spawn row gives back (the caller adds what a store record holds besides). */
export function fieldsOfRow(r: SpawnRow): SpawnFields & { key: string } {
  return {
    key: r.toolUseId ?? `ledger-${r.task}-${r.subtask}-${r.attempt}`,
    task: r.task,
    subtask: r.subtask,
    attempt: r.attempt,
    lineage: typeof r.lineage === 'number' ? r.lineage : r.attempt,
    budget: r.budget,
    tier: r.tier,
    alias: r.alias,
    purpose: r.purpose ?? 'build',
    at: r.at,
    ...(r.agentId ? { agentId: r.agentId } : {}),
    ...(r.toolUseId ? { toolUseId: r.toolUseId } : {}),
    ...(r.briefPath ? { briefPath: r.briefPath } : {}),
    ...(r.cwd ? { cwd: r.cwd } : {}),
    ...(r.repo ? { repo: r.repo } : {}),
    ...(r.description ? { description: r.description } : {}),
    ...(r.subagentType ? { subagentType: r.subagentType } : {}),
    ...(r.resolvedModel ? { resolvedModel: r.resolvedModel } : {}),
    ...(typeof r.spend === 'number' ? { spend: r.spend } : {}),
    ...(Array.isArray(r.resources) && r.resources.length > 0 ? { resources: [...r.resources] } : {}),
    ...(r.here ? { here: r.here } : {}),
    ...(r.replay ? { replay: true, ...(r.base ? { base: r.base } : {}) } : {}),
  }
}

/** What a verdict reached through the fallback says on its row's tail. */
export const fallbackTail = (from: Fallback): string => `(from ${from === 'ledger' ? 'the ledger' : 'memory'}: the store had no record)`

/** The debug line, once per verdict reached through the fallback. */
export const fallbackLog = (label: string, attempt: number, from: Fallback): string =>
  `${label} attempt ${attempt}: judged from ${from === 'ledger' ? 'the ledger spawn row and the brief' : "the hook's memory"}; the store had no record`

/** `text` with the tail on the end of its first line (a verdict row's own line; any lines under it stay as they are). */
export function withTail(text: string, tail: string): string {
  const nl = text.indexOf('\n')
  return nl < 0 ? `${text} ${tail}` : `${text.slice(0, nl)} ${tail}${text.slice(nl)}`
}

/** The verdict tool's answer for an attempt the ledger judged in an earlier process. */
export const ledgerJudgedLine = (plugin: string, label: string, attempt: number, verdict: string, next?: string): string =>
  `${plugin}: ${label} attempt ${attempt} ${verdict}${next ? ` · next=${next}` : ''} ${fallbackTail('ledger')}`
