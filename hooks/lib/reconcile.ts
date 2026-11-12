// MOD-288: tree reconcile, the pure half. Matches the open sub-issues of one parent against the merged cards and returns
// four lists: done elsewhere, open with every sub-issue closed (MOD-362), closed with open children, no match. No I/O, no gh; register.ts reads and closes.
import { scopeOverlap } from './brief'
import { fencedBlock } from './tree'

export const RECONCILE_USAGE = '/delegation tree reconcile <n>|all [--confirm [--only <n,n,…>]]'

/** A merged card: its id, the PR it landed in, the issue it named, and the paths it touched (its scope, else the report's files). */
export type MergedCard = { id: string; pr?: number; issue?: number; parent?: number; scope: readonly string[] }
/** One sub-issue as the parent view (and, for an open one, its own view) gives it; `read: false` marks an open one not viewed this run. */
export type ReconSub = { number: number; title: string; state: string; body?: string; subIssues?: readonly { number: number; state: string }[]; read?: boolean; partial?: boolean /* MOD-362: its sub-issue list was cut short */ }
export type Reconciled = {
  done: { number: number; title: string; card: string; pr?: number }[]
  childrenDone: { number: number; title: string; total: number }[] // MOD-362
  cardsDone: { number: number; title: string; cards: { id: string; pr?: number }[] }[] // MOD-364: merged cards name it as parent, none open under it
  openCards: { number: number; title: string; cards: string[] }[] // MOD-364: open cards name it as parent
  closedOpen: { number: number; title: string; open: number[] }[]
  noMatch: { number: number; title: string; overlap?: string }[]
  notRead: number[]
  root?: { number: number; title: string; total: number; after: number[] } // MOD-362
}

/** MOD-362: the comment a close of a parent whose sub-issues are all closed carries (the words a finish writes on an ancestor). */
export const childrenComment = (total: number): string => `all ${total} sub-issues done`

/** MOD-340: a card as the folder read gives it. */
export type CardLite = { id: string; status?: string; issue?: number; parent?: number; scope: readonly string[] }

/** MOD-340: the merged cards reconcile matches against: ledger merged rows newest first, then cards whose status is merged that no row named. */
export function mergedCards(rows: readonly Record<string, unknown>[], cards: readonly CardLite[]): MergedCard[] {
  const byId = new Map(cards.map(c => [c.id, c]))
  const out: MergedCard[] = []
  const seen = new Set<string>()
  const refs = (c: CardLite | undefined) => ({ ...(c?.issue !== undefined ? { issue: c.issue } : {}), ...(c?.parent !== undefined ? { parent: c.parent } : {}) })
  for (const row of rows.filter(r => r.kind === 'merged' && typeof r.task === 'string').reverse()) {
    const id = row.task as string
    if (seen.has(id)) continue
    seen.add(id)
    const card = byId.get(id)
    const files = rows.filter(r => r.task === id && Array.isArray(r.files)).flatMap(r => (r.files as unknown[]).filter((f): f is string => typeof f === 'string'))
    const scope = card && card.scope.length > 0 ? card.scope : files
    if (scope.length === 0) continue
    out.push({ id, scope, ...(typeof row.pr === 'number' ? { pr: row.pr } : {}), ...refs(card) })
  }
  for (const card of cards) {
    if (card.status !== 'merged' || seen.has(card.id) || card.scope.length === 0) continue
    seen.add(card.id)
    out.push({ id: card.id, scope: card.scope, ...refs(card) })
  }
  return out
}

/** MOD-303: the first merged card (in merged order) whose scope overlaps the sub-issue's scope block, shown on the no-match row. */
function overlapOf(sub: ReconSub, merged: readonly MergedCard[]): string | undefined {
  const scope = fencedBlock(sub.body ?? '', 'scope')
  if (scope.length === 0) return undefined
  return merged.find(m => scopeOverlap(scope, m.scope) !== undefined)?.id
}

/**
 * `merged` newest first. An open sub-issue with an in-flight card is in no list. MOD-362: `openParents` maps an issue an unmerged card
 * names as its parent to the ids of those cards (work with no issue of its own yet); `root` is the named parent, listed once nothing
 * under it is left open. MOD-364, in order, the first that holds wins: in flight (no list); under an open card (openCards, not viewed);
 * not read; a merged card whose issue it is (done); every sub-issue CLOSED and not partial (childrenDone); a merged card naming it as
 * parent, no sub-issue open and not partial (cardsDone); else no match.
 */
export function reconcileOf(o: {
  subs: readonly ReconSub[]
  inFlight: ReadonlySet<number>
  merged: readonly MergedCard[]
  openParents?: ReadonlyMap<number, readonly string[]>
  root?: { number: number; title: string; state: string; partial?: boolean }
}): Reconciled {
  const out: Reconciled = { done: [], childrenDone: [], cardsDone: [], openCards: [], closedOpen: [], noMatch: [], notRead: [] }
  const openParents = o.openParents ?? new Map<number, readonly string[]>()
  for (const s of [...o.subs].sort((a, b) => a.number - b.number)) {
    if (s.state.toUpperCase() === 'CLOSED') {
      const open = (s.subIssues ?? []).filter(c => c.state.toUpperCase() === 'OPEN').map(c => c.number)
      if (open.length > 0) out.closedOpen.push({ number: s.number, title: s.title, open })
      continue
    }
    if (o.inFlight.has(s.number)) continue
    const under = openParents.get(s.number)
    if (under !== undefined) {
      out.openCards.push({ number: s.number, title: s.title, cards: [...under] })
      continue
    }
    if (s.read === false) {
      out.notRead.push(s.number)
      continue
    }
    const named = o.merged.find(m => m.issue === s.number)
    if (named) {
      out.done.push({ number: s.number, title: s.title, card: named.id, ...(named.pr !== undefined ? { pr: named.pr } : {}) })
      continue
    }
    const kids = s.subIssues ?? []
    const allClosed = kids.every(c => c.state.toUpperCase() === 'CLOSED')
    if (kids.length > 0 && allClosed && s.partial !== true) {
      out.childrenDone.push({ number: s.number, title: s.title, total: kids.length }) // MOD-362
      continue
    }
    const cards = o.merged.filter(m => m.parent === s.number)
    if (cards.length > 0 && allClosed && s.partial !== true) {
      out.cardsDone.push({ number: s.number, title: s.title, cards: cards.map(m => ({ id: m.id, ...(m.pr !== undefined ? { pr: m.pr } : {}) })) })
      continue
    }
    const overlap = overlapOf(s, o.merged)
    out.noMatch.push({ number: s.number, title: s.title, ...(overlap !== undefined ? { overlap } : {}) })
  }
  const r = o.root
  if (r && r.partial !== true && r.state.toUpperCase() !== 'CLOSED' && o.subs.length > 0 && !o.inFlight.has(r.number) && !openParents.has(r.number) && out.closedOpen.length === 0) {
    const listed = new Set([...out.done, ...out.childrenDone].map(x => x.number)) // MOD-364: cardsDone and openCards stay open and unlisted, so they block the root
    if (o.subs.every(s => s.state.toUpperCase() === 'CLOSED' || listed.has(s.number))) {
      out.root = { number: r.number, title: r.title, total: o.subs.length, after: [...listed].sort((a, b) => a - b) }
    }
  }
  return out
}

/** The comment a done-elsewhere close carries. */
export const doneComment = (card: string, pr?: number): string => `done in ${card}${pr !== undefined ? ` (#${pr})` : ''}`

/** MOD-364: the comment a close of a sub-issue that merged cards name as parent carries: one card as doneComment, more as their first five ids. */
export const cardsComment = (cards: readonly { id: string; pr?: number }[]): string => {
  if (cards.length === 1) return doneComment(cards[0]!.id, cards[0]!.pr)
  return `done in ${cards.slice(0, 5).map(c => c.id).join(', ')}${cards.length > 5 ? `, +${cards.length - 5} more` : ''}`
}

/** MOD-364: the ids on a row: the first three, then how many more. */
const idsOf = (ids: readonly string[]): string => `${ids.slice(0, 3).join(', ')}${ids.length > 3 ? `, +${ids.length - 3} more` : ''}`

/** The rows and the counts line of one report (MOD-364: cardsDone and openCards rows after childrenDone; their counts segments after the rest). */
function rowsOf(r: Reconciled, epic?: number): string[] {
  const rows = [
    ...r.done.map(d => `#${d.number} ${d.title} — ${doneComment(d.card, d.pr)}`),
    ...r.childrenDone.map(c => `#${c.number} ${c.title} — open, all ${c.total} sub-issues closed`),
    ...r.cardsDone.map(c => `#${c.number} ${c.title} — ${c.cards.length === 1 ? '1 merged card' : `${c.cards.length} merged cards`} under it, none open (${idsOf(c.cards.map(x => x.id))}): check its done-when, then close it by number`),
    ...r.openCards.map(c => `#${c.number} ${c.title} — ${c.cards.length === 1 ? '1 card under it still open' : `${c.cards.length} cards under it still open`} (${idsOf(c.cards)})`),
    ...r.closedOpen.map(c => `#${c.number} ${c.title} — closed, ${c.open.length} children open (${c.open.map(n => `#${n}`).join(', ')})`),
    ...r.noMatch.map(n => `#${n.number} ${n.title} — no match${n.overlap !== undefined ? ` (scope overlaps ${n.overlap})` : ''}`),
    ...r.notRead.map(n => `#${n} — not read: ${epic !== undefined ? `run /delegation tree reconcile ${epic}` : 'run again'}`),
    ...(r.root ? [`#${r.root.number} ${r.root.title} — open, all ${r.root.total} sub-issues closed${r.root.after.length > 0 ? ' once the closes above run' : ''}`] : []),
  ]
  const counts = `${r.done.length} done elsewhere · ${r.childrenDone.length + (r.root ? 1 : 0)} open with every sub-issue closed · ${r.closedOpen.length} closed with open children · ${r.noMatch.length} no match`
    + (r.cardsDone.length > 0 ? ` · ${r.cardsDone.length} with merged cards under it` : '')
    + (r.openCards.length > 0 ? ` · ${r.openCards.length} with open cards under it` : '')
  return [...rows, counts]
}

/** The done-elsewhere close lines, the live lines for open parents (MOD-362: sub-issues, then the root), the commented lines for cardsDone (MOD-364), then the commented not-planned lines. */
const closeLinesOf = (r: Reconciled, repo: string): string[] => [
  ...r.done.map(d => `gh issue close ${d.number} --repo ${repo} --comment '${doneComment(d.card, d.pr)}'`),
  ...r.childrenDone.map(c => `gh issue close ${c.number} --repo ${repo} --comment '${childrenComment(c.total)}'`),
  ...(r.root ? [`gh issue close ${r.root.number} --repo ${repo} --comment '${childrenComment(r.root.total)}'`] : []),
  ...r.cardsDone.map(c => `# gh issue close ${c.number} --repo ${repo} --comment '${cardsComment(c.cards)}'`),
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
    out.push(...(r.done.length + r.childrenDone.length + r.cardsDone.length + r.openCards.length + r.closedOpen.length + r.noMatch.length + r.notRead.length === 0 && !r.root ? ['nothing to reconcile'] : rowsOf(r, p.number)))
  }
  // the close block: every done-elsewhere line, then every commented not-planned line
  const closes = parts.flatMap(p => closeLinesOf(p.result, repo))
  closes.sort((a, b) => Number(a.startsWith('#')) - Number(b.startsWith('#')))
  if (closes.length > 0) out.push('', ...closes)
  return out.join('\n')
}

/** `<n>|all [--confirm [--only <n,n,…>]]` of the command. MOD-364: `only` is the numbers a confirm run closes; it needs confirm. */
export type ReconcileArgs = { issue: number; confirm: boolean; only?: number[] } | { all: true; confirm: boolean; only?: number[] } | { error: string }
export function parseReconcileArgs(text: string): ReconcileArgs {
  const usage = { error: `usage: ${RECONCILE_USAGE}` }
  const words = text.split(/\s+/).filter(x => x !== '')
  let issue = 0
  let all = false
  let confirm = false
  let only: number[] | undefined
  for (let i = 0; i < words.length; i++) {
    const w = words[i]!
    if (w === '--confirm') confirm = true
    else if (w === '--only') {
      // MOD-364: a list of numbers 1 to 999999999, duplicates dropped, the order given kept
      const list = words[i + 1]
      if (only !== undefined || list === undefined || !/^\d+(,\d+)*$/.test(list)) return usage
      const nums = list.split(',').map(Number)
      if (nums.some(n => n < 1 || n > 999999999)) return usage
      only = [...new Set(nums)]
      i++
    } else if (issue === 0 && !all && w === 'all') all = true
    else if (issue === 0 && !all && /^\d+$/.test(w) && Number(w) >= 1 && Number(w) <= 999999999) issue = Number(w)
    else return usage
  }
  if (only !== undefined && !confirm) return usage
  const extra = only !== undefined ? { only } : {}
  return all ? { all: true, confirm, ...extra } : issue === 0 ? usage : { issue, confirm, ...extra }
}

/** The landed file that records `issue: #<n>` and has no `closed:` line yet, or undefined. */
export function landedFor(files: readonly { name: string; text: string }[], n: number): string | undefined {
  const issue = new RegExp(`^issue: #${n} \\S+$`, 'm')
  return files.find(f => issue.test(f.text) && !/^closed: \S+$/m.test(f.text))?.name
}
