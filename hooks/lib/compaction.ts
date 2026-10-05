// Session health across compaction (SPEC part 2E): the delegation state as
// lines, the instructions a compaction is given, and the system prompt's
// "Delegation state" section. Pure: no `$`.

export type StateSnapshot = {
  /** Briefed workers `$.agent.list()` says are running. */
  running: { task: string; tier: string; agentId: string; at?: number }[]
  /** Workers that handed back and whose verdict is not in yet. */
  pending: { task: string; agentId?: string }[]
  /** This session's verdict lines, oldest first. */
  recent: { line: string; at: number }[]
  /** The scheduler queue, head first. */
  queued: { task: string; position: number }[]
  /** Advice the brain (or Ben) has not acted on: `<task>: <next>`. */
  owed: string[]
  debrief?: { at: number; agentId?: string; path?: string; finishedAt?: number }
  eval?: { tier: string; sha: string; pass?: number; total?: number; at: number; running?: boolean; agentId?: string }
  /** PRs the workers' reports named. */
  prs: string[]
}

/** One `delegation.recent.<session>` row: a verdict as the one line has it, and what it leaves owed. */
export type RecentVerdict = { task: string; attempt: number; verdict: string; line: string; at: number; owed?: string; pr?: string }

/** What is owed: each task's latest verdict that left advice undone, unless the task is running, pending or queued again. */
export function owedFrom(recent: readonly RecentVerdict[], busy: ReadonlySet<string>): string[] {
  const latest = new Map<string, RecentVerdict>()
  for (const r of recent) latest.set(r.task, r)
  return [...latest.values()].filter(r => r.owed !== undefined && !busy.has(r.task)).map(r => r.owed as string)
}

/** The PRs the reports named (`pr=` other than none), each once. */
export const prsFrom = (recent: readonly RecentVerdict[]): string[] =>
  [...new Set(recent.map(r => r.pr ?? '').filter(pr => pr !== '' && pr !== 'none'))]

export const emptySnapshot = (): StateSnapshot => ({ running: [], pending: [], recent: [], queued: [], owed: [], prs: [] })

export const isEmptyState = (s: StateSnapshot): boolean => s.running.length === 0 && s.pending.length === 0 && s.queued.length === 0 && s.owed.length === 0

export const SECTION_ID = 'chassis-delegation:state'
export const HEADER = 'Delegation state (chassis-delegation):'
export const MAX_LINES = 40
const RECENT = 5

export const KEEP_VERBATIM =
  'KEEP VERBATIM: (1) the delegation state below; (2) the release recipe pointer (session scratchpad FOLDnn scripts); (3) the brief and report contracts `[[brief v=1 …]]` / `[[report v=1 …]]`; (4) every card held for Ben and every item owed by Ben.'

/** `2026-10-03 14:00Z` */
export const stamp = (ms: number): string => `${new Date(ms).toISOString().slice(0, 16).replace('T', ' ')}Z`

/**
 * The state, one line per fact, `HEADER` first, at most 40 lines: running
 * workers, pending verdicts, queued spawns and what is owed come first (they
 * are what the brain acts on), then the last 5 verdicts, then the last debrief
 * and eval and the PRs reports named.
 */
export function renderState(s: StateSnapshot): string[] {
  const live = [
    ...s.running.map(r => `- running: ${r.task} ${r.tier} agent ${r.agentId}${r.at !== undefined ? ` since ${stamp(r.at)}` : ''}`),
    ...s.pending.map(p => `- pending verdict: ${p.task}${p.agentId ? ` agent ${p.agentId}` : ''}`),
    ...s.queued.map(q => `- queued: ${q.task} (position ${q.position})`),
    ...s.owed.map(o => `- owed: ${o}`),
  ]
  const history = [
    ...s.recent.slice(-RECENT).map(r => `- verdict: ${r.line}`),
    ...(s.debrief
      ? [`- last debrief: ${stamp(s.debrief.at)}${s.debrief.agentId ? ` agent ${s.debrief.agentId}` : ''} — ${s.debrief.path ?? (s.debrief.finishedAt ? 'finished' : 'running')}`]
      : []),
    ...(s.eval
      ? [
          s.eval.running
            ? `- eval running: ${s.eval.tier} at ${s.eval.sha.slice(0, 8)}${s.eval.agentId ? ` agent ${s.eval.agentId}` : ''}`
            : `- last eval: ${s.eval.tier} ${s.eval.pass ?? '?'}/${s.eval.total ?? '?'} at ${s.eval.sha.slice(0, 8)} (${stamp(s.eval.at)})`,
        ]
      : []),
    ...(s.prs.length > 0 ? [`- PRs named in reports: ${s.prs.join(', ')}`] : []),
  ]
  const room = MAX_LINES - 1
  // History keeps at least its verdicts when live lines would crowd it out.
  const keepHistory = Math.min(history.length, Math.max(RECENT, room - live.length))
  const keepLive = Math.min(live.length, room - keepHistory)
  const liveShown = live.length > keepLive ? [...live.slice(0, keepLive - 1), `- … ${live.length - keepLive + 1} more`] : live
  return [HEADER, ...liveShown, ...history.slice(0, keepHistory)]
}

export const appendInstructions = (existing: string | undefined, block: string): string => (existing ?? '') + '\n' + block

/** What a compaction is told to keep: KEEP VERBATIM, the release recipe pointer, the state. */
export function compactBlock(s: StateSnapshot, scratchpad?: string): string {
  const recipe = scratchpad ? [`Release recipe: the FOLDnn scripts in ${scratchpad}`] : []
  const state = isEmptyState(s) && s.recent.length === 0 && !s.debrief && !s.eval ? [`${HEADER} nothing running, nothing owed.`] : renderState(s)
  return [KEEP_VERBATIM, ...recipe, ...state].join('\n')
}

/** The system prompt's section: present only while something runs, waits or is owed. */
export function composeSection(s: StateSnapshot): { id: string; text: string; scope: 'session' } | undefined {
  if (isEmptyState(s)) return undefined
  return { id: SECTION_ID, text: renderState(s).join('\n'), scope: 'session' }
}
