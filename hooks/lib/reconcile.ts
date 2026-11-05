// MOD-288: tree reconcile, the pure half. Matches the open sub-issues of one parent against the merged cards and returns
// three lists: done elsewhere, closed with open children, no match. No I/O, no gh; register.ts reads and closes.
import { scopeOverlap } from './brief'
import { fencedBlock } from './tree'

export const RECONCILE_USAGE = '/delegation tree reconcile <n>|all [--confirm]'

/** A merged card: its id, the PR it landed in, the issue it named, and the paths it touched (its scope, else the report's files). */
export type MergedCard = { id: string; pr?: number; issue?: number; parent?: number; scope: readonly string[] }
/** One sub-issue as the parent view (and, for an open one, its own view) gives it; `read: false` marks an open one not viewed this run. */
export type ReconSub = { number: number; title: string; state: string; body?: string; subIssues?: readonly { number: number; state: string }[]; read?: boolean }
export type Reconciled = {
  done: { number: number; title: string; card: string; pr?: number }[]
  closedOpen: { number: number; title: string; open: number[] }[]
  noMatch: { number: number; title: string; overlap?: string }[]
  notRead: number[]
}

/** MOD-303: the merged card an open sub-issue is done in: the card whose issue is the sub-issue, else a card whose parent is it while every child is CLOSED. Never a scope overlap. */
function doneIn(sub: ReconSub, merged: readonly MergedCard[]): MergedCard | undefined {
  const named = merged.find(m => m.issue === sub.number)
  if (named) return named
  if ((sub.subIssues ?? []).some(c => c.state.toUpperCase() !== 'CLOSED')) return undefined
  return merged.find(m => m.parent === sub.number)
}

/** MOD-303: the first merged card (in merged order) whose scope overlaps the sub-issue's scope block, shown on the no-match row. */
function overlapOf(sub: ReconSub, merged: readonly MergedCard[]): string | undefined {
  const scope = fencedBlock(sub.body ?? '', 'scope')
  if (scope.length === 0) return undefined
  return merged.find(m => scopeOverlap(scope, m.scope) !== undefined)?.id
}

/** `merged` newest first. An open sub-issue with an in-flight card is in no list. */
export function reconcileOf(o: { subs: readonly ReconSub[]; inFlight: ReadonlySet<number>; merged: readonly MergedCard[] }): Reconciled {
  const out: Reconciled = { done: [], closedOpen: [], noMatch: [], notRead: [] }
  for (const s of [...o.subs].sort((a, b) => a.number - b.number)) {
    if (s.state.toUpperCase() === 'CLOSED') {
      const open = (s.subIssues ?? []).filter(c => c.state.toUpperCase() === 'OPEN').map(c => c.number)
      if (open.length > 0) out.closedOpen.push({ number: s.number, title: s.title, open })
      continue
    }
    if (o.inFlight.has(s.number)) continue
    if (s.read === false) {
      out.notRead.push(s.number)
      continue
    }
    const m = doneIn(s, o.merged)
    if (m) out.done.push({ number: s.number, title: s.title, card: m.id, ...(m.pr !== undefined ? { pr: m.pr } : {}) })
    else {
      const overlap = overlapOf(s, o.merged)
      out.noMatch.push({ number: s.number, title: s.title, ...(overlap !== undefined ? { overlap } : {}) })
    }
  }
  return out
}

/** The comment a done-elsewhere close carries. */
export const doneComment = (card: string, pr?: number): string => `done in ${card}${pr !== undefined ? ` (#${pr})` : ''}`

/** The rows and the counts line of one report. */
function rowsOf(r: Reconciled, epic?: number): string[] {
  const rows = [
    ...r.done.map(d => `#${d.number} ${d.title} — ${doneComment(d.card, d.pr)}`),
    ...r.closedOpen.map(c => `#${c.number} ${c.title} — closed, ${c.open.length} children open (${c.open.map(n => `#${n}`).join(', ')})`),
    ...r.noMatch.map(n => `#${n.number} ${n.title} — no match${n.overlap !== undefined ? ` (scope overlaps ${n.overlap})` : ''}`),
    ...r.notRead.map(n => `#${n} — not read: ${epic !== undefined ? `run /delegation tree reconcile ${epic}` : 'run again'}`),
  ]
  const counts = `${r.done.length} done elsewhere · ${r.closedOpen.length} closed with open children · ${r.noMatch.length} no match`
  return [...rows, counts]
}

/** The done-elsewhere close lines, then the commented not-planned lines. */
const closeLinesOf = (r: Reconciled, repo: string): string[] => [
  ...r.done.map(d => `gh issue close ${d.number} --repo ${repo} --comment '${doneComment(d.card, d.pr)}'`),
  ...r.noMatch.map(n => `# gh issue close ${n.number} --repo ${repo} --comment 'not planned'`),
]

/** The dry run's text: one row per entry, then the close lines to run by hand. */
export function reconcileText(r: Reconciled, repo: string): string {
  const lines = closeLinesOf(r, repo)
  return [...rowsOf(r), ...(lines.length > 0 ? ['', ...lines] : [])].join('\n')
}

/** MOD-299: the open type:epic issues from `gh issue list --json number,title`, newest first (descending by number). */
export function epicsOf(json: unknown): { number: number; title: string }[] {
  if (!Array.isArray(json)) return []
  return json
    .filter((e): e is { number: number; title?: unknown } => !!e && typeof e === 'object' && Number.isInteger((e as { number?: unknown }).number) && (e as { number: number }).number >= 1)
    .map(e => ({ number: e.number, title: typeof e.title === 'string' ? e.title : '' }))
    .sort((a, b) => b.number - a.number)
}

/** MOD-299: one report for every epic: a heading and the existing lists per epic, then one block of every close line; a child past the per-epic cap names the single-epic command. */
export function reconcileAllText(parts: readonly { number: number; title: string; result: Reconciled }[], repo: string): string {
  const out: string[] = []
  for (const p of parts) {
    out.push(`## #${p.number} ${p.title}`)
    const r = p.result
    out.push(...(r.done.length + r.closedOpen.length + r.noMatch.length + r.notRead.length === 0 ? ['nothing to reconcile'] : rowsOf(r, p.number)))
  }
  // the close block: every done-elsewhere line, then every commented not-planned line
  const closes = parts.flatMap(p => closeLinesOf(p.result, repo))
  closes.sort((a, b) => Number(a.startsWith('#')) - Number(b.startsWith('#')))
  if (closes.length > 0) out.push('', ...closes)
  return out.join('\n')
}

/** `<n>|all [--confirm]` of the command. */
export function parseReconcileArgs(text: string): { issue: number; confirm: boolean } | { all: true; confirm: boolean } | { error: string } {
  let issue = 0
  let all = false
  let confirm = false
  for (const w of text.split(/\s+/).filter(x => x !== '')) {
    if (w === '--confirm') confirm = true
    else if (issue === 0 && !all && w === 'all') all = true
    else if (issue === 0 && !all && /^\d+$/.test(w) && Number(w) >= 1 && Number(w) <= 999999999) issue = Number(w)
    else return { error: `usage: ${RECONCILE_USAGE}` }
  }
  return all ? { all: true, confirm } : issue === 0 ? { error: `usage: ${RECONCILE_USAGE}` } : { issue, confirm }
}

/** The landed file that records `issue: #<n>` and has no `closed:` line yet, or undefined. */
export function landedFor(files: readonly { name: string; text: string }[], n: number): string | undefined {
  const issue = new RegExp(`^issue: #${n} \\S+$`, 'm')
  return files.find(f => issue.test(f.text) && !/^closed: \S+$/m.test(f.text))?.name
}
