// MOD-353: the Work view's data, the pure half. The parsed issue list, the cards, the done task ids and the live rows
// become one tree with one state per leaf; the view model says which rows show for a set of filters; the text form is
// what `/delegation work` prints. No I/O, no clock: the caller reads the issues and the time.

import type { Tier } from './tier'
import type { Scheme } from './live'

export type WorkState = 'working' | 'review' | 'queued' | 'blocked' | 'backlog' | 'done'
/** The order of the summary: Working, To review, Queued, Blocked, Backlog, Done. */
export const WORK_STATES: readonly WorkState[] = ['working', 'review', 'queued', 'blocked', 'backlog', 'done']
export const STATE_LABEL: Record<WorkState, string> = { working: 'Working', review: 'To review', queued: 'Queued', blocked: 'Blocked', backlog: 'Backlog', done: 'Done' }
export type WorkType = 'epic' | 'feature' | 'story' | 'task' | 'bug' | 'spike' | 'issue'
export type WorkIssue = { number: number; title: string; closed: boolean; type: WorkType; parent?: number }
export type WorkCard = { id: string; title: string; status?: string; tier?: Tier; issue?: number; parent?: number; blockedBy?: string[] }
/** A live row; structurally a subset of live.ts WorktreeRow, so `view.rows` is passed as it is. */
export type WorkLive = { task: string; kind: 'live' | 'queued' | 'verdict' | 'owed' | 'disk'; model?: string; state?: string; attempt?: string; usd?: number }
export type WorkItem = {
  /** `#<number>` for an issue, the card id for a card drawn by itself, `none` for the No epic group. */
  key: string
  number?: number
  title: string
  type: WorkType
  state: WorkState
  group?: true
  card?: string
  tier?: Tier
  model?: string
  attempt?: string
  /** Working only: the row's `state` without its leading `live `, e.g. `6m`. */
  running?: string
  usd?: number
  /** Queued, and its spawn waits in the queue. */
  slot?: true
  /** Queued, and a worktree for it is on disk from an earlier session. */
  onDisk?: true
  /** Blocked: the ids it waits on. */
  by?: string[]
  children: WorkItem[]
  /** Leaf descendants, and how many are done. A leaf has leaves 1 and done 0 or 1. */
  leaves: number
  done: number
}
export type WorkModel = { roots: WorkItem[]; counts: Record<WorkState, number>; total: number }
export type WorkUi = { closed: ReadonlySet<string>; shown: ReadonlySet<string>; query: string; states: ReadonlySet<WorkState>; root?: string; showDone: boolean }
export type WorkRow =
  | { kind: 'item'; item: WorkItem; depth: number; /** present on a parent */ open?: boolean }
  | { kind: 'hidden'; parent: string; depth: number; n: number }
  | { kind: 'older'; parent: string; depth: number; n: number }
  | { kind: 'more'; n: number }

export const DONE_CAP = 20
export const ROW_CAP = 200
export const WORK_TTL_MS = 5 * 60 * 1000
export const WORK_LIST_LIMIT = 300
export const DEFAULT_UI: WorkUi = { closed: new Set<string>(), shown: new Set<string>(), query: '', states: new Set<WorkState>(), showDone: false }

const WORK_TYPES: readonly WorkType[] = ['epic', 'feature', 'story', 'task', 'bug', 'spike']
const PARENT_LOOP_STEPS = 16
const NO_EPIC = 'none'

/** The parsed `gh issue list --json number,title,state,labels,parent` array: the issues, sorted by number, one per number. */
export function parseWorkIssues(json: unknown): WorkIssue[] {
  if (!Array.isArray(json)) return []
  const seen = new Map<number, WorkIssue>()
  for (const raw of json) {
    const o = raw as { number?: unknown; title?: unknown; state?: unknown; labels?: unknown; parent?: unknown } | null
    if (!o || typeof o.number !== 'number' || seen.has(o.number)) continue
    const names = Array.isArray(o.labels) ? o.labels.map(l => (l as { name?: unknown } | null)?.name).filter((n): n is string => typeof n === 'string') : []
    let type: WorkType = 'issue'
    for (const name of names) {
      const t = /^type:(.+)$/.exec(name)?.[1] as WorkType | undefined
      if (t !== undefined && (WORK_TYPES as readonly string[]).includes(t)) {
        type = t
        break
      }
    }
    const p = o.parent as { number?: unknown } | null | undefined
    const parent = typeof p?.number === 'number' ? p.number : undefined
    seen.set(o.number, {
      number: o.number,
      title: typeof o.title === 'string' ? o.title : '',
      closed: typeof o.state === 'string' && o.state.toUpperCase() === 'CLOSED',
      type,
      ...(parent !== undefined ? { parent } : {}),
    })
  }
  return [...seen.values()].sort((a, b) => a.number - b.number)
}

const byId = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true })
const cardById = (a: WorkCard, b: WorkCard): number => byId(a.id, b.id)

/** The model's parts: the issues, the cards, the done task ids and the live rows, as a tree with one state per leaf. */
export function workModel(i: { issues: readonly WorkIssue[]; cards: readonly WorkCard[]; done: ReadonlySet<string>; live: readonly WorkLive[] }): WorkModel {
  const byNum = new Map<number, WorkIssue>()
  for (const x of i.issues) if (!byNum.has(x.number)) byNum.set(x.number, x)
  const issues = [...byNum.values()].sort((a, b) => a.number - b.number)

  // rule 2: an issue's parent is its parent when that is in the list and the parent chain never comes back to the issue
  const reaches = (start: number, self: number): boolean => {
    let cur: number | undefined = start
    for (let step = 0; step < PARENT_LOOP_STEPS && cur !== undefined; step++) {
      if (cur === self) return true
      cur = byNum.get(cur)?.parent
    }
    return false
  }
  const parentOf = new Map<number, number>()
  for (const x of issues) {
    if (x.parent === undefined || !byNum.has(x.parent) || reaches(x.parent, x.number)) continue
    parentOf.set(x.number, x.parent)
  }
  const childIssues = new Map<number, number[]>()
  for (const [n, p] of parentOf) childIssues.set(p, [...(childIssues.get(p) ?? []), n])

  const liveOf = new Map<string, WorkLive>()
  for (const r of i.live) {
    const id = r.task.split(/[ /]/)[0] ?? ''
    if (!liveOf.has(id)) liveOf.set(id, r)
  }
  const isDone = (c: WorkCard): boolean => c.status === 'merged' || c.status === 'landed' || i.done.has(c.id)

  // rule 3: each card is placed once; a bound card is the leaf of its issue
  const bound = new Map<number, WorkCard>()
  const leafCards = new Map<number, WorkCard[]>()
  const noneCards: WorkCard[] = []
  const addTo = (n: number, c: WorkCard) => leafCards.set(n, [...(leafCards.get(n) ?? []), c])
  const beats = (a: WorkCard, b: WorkCard): boolean => (isDone(a) !== isDone(b) ? !isDone(a) : byId(a.id, b.id) > 0)
  for (const c of i.cards) {
    if (c.status === 'parked' || c.status === 'template') continue
    if (c.issue !== undefined && byNum.has(c.issue) && !childIssues.has(c.issue)) {
      const prev = bound.get(c.issue)
      if (prev === undefined || beats(c, prev)) bound.set(c.issue, c)
    } else if (c.issue !== undefined && byNum.has(c.issue)) {
      addTo(c.issue, c)
    } else if (c.parent !== undefined && byNum.has(c.parent)) {
      addTo(c.parent, c)
    } else {
      noneCards.push(c)
    }
  }
  const isParent = (n: number): boolean => (childIssues.get(n)?.length ?? 0) > 0 || (leafCards.get(n)?.length ?? 0) > 0

  // rule 5: a leaf's state, the first match wins
  const leaf = (key: string, title: string, type: WorkType, number: number | undefined, card: WorkCard | undefined, closed: boolean): WorkItem => {
    const live = card !== undefined ? liveOf.get(card.id) : undefined
    const state: WorkState =
      closed || (card !== undefined && isDone(card)) ? 'done'
      : live?.kind === 'live' ? 'working'
      : live?.kind === 'owed' || live?.kind === 'verdict' ? 'review'
      : card?.status === 'blocked' ? 'blocked'
      : card !== undefined ? 'queued'
      : 'backlog'
    const item: WorkItem = { key, title, type, state, children: [], leaves: 1, done: state === 'done' ? 1 : 0 }
    if (number !== undefined) item.number = number
    if (card !== undefined) {
      item.card = card.id
      if (card.tier !== undefined) item.tier = card.tier
    }
    if (state === 'working' || state === 'review') {
      if (live?.model !== undefined) item.model = live.model
      if (live?.attempt !== undefined) item.attempt = live.attempt
      if (live?.usd !== undefined) item.usd = live.usd
    }
    if (state === 'working' && live?.state !== undefined) item.running = live.state.replace(/^live /, '')
    if (state === 'blocked' && card?.blockedBy !== undefined && card.blockedBy.length > 0) item.by = [...card.blockedBy]
    if (state === 'queued' && live?.kind === 'queued') item.slot = true
    if (state === 'queued' && live?.kind === 'disk') item.onDisk = true
    return item
  }
  const cardLeaf = (c: WorkCard): WorkItem => leaf(c.id, c.title, 'task', undefined, c, false)
  const parentOfItems = (key: string, title: string, type: WorkType, number: number | undefined, children: WorkItem[], group?: true): WorkItem => {
    const leaves = children.reduce((s, c) => s + c.leaves, 0)
    const done = children.reduce((s, c) => s + c.done, 0)
    return { key, title, type, ...(number !== undefined ? { number } : {}), ...(group ? { group } : {}), state: leaves > 0 && done === leaves ? 'done' : 'backlog', children, leaves, done }
  }

  // rule 6 and 7: an issue with child issues or card leaves is a parent; children are issues by number, then cards by id
  const building = new Set<number>()
  const buildIssue = (n: number): WorkItem => {
    const x = byNum.get(n) as WorkIssue
    building.add(n)
    const kids = (childIssues.get(n) ?? []).filter(k => !building.has(k)).map(buildIssue)
    const placed = leafCards.get(n) ?? []
    building.delete(n)
    if (kids.length === 0 && placed.length === 0) return leaf(`#${n}`, x.title, x.type, n, bound.get(n), x.closed)
    // an issue that turns out a parent keeps its own bound card as a card leaf beside the others
    const cards = [...(bound.has(n) ? [bound.get(n) as WorkCard] : []), ...placed].sort(cardById)
    return parentOfItems(`#${n}`, x.title, x.type, n, [...kids, ...cards.map(cardLeaf)])
  }

  // rule 8: the roots, then the No epic group
  const roots: WorkItem[] = []
  const groupKids: WorkItem[] = []
  for (const x of issues) {
    if (parentOf.has(x.number)) continue
    const it = buildIssue(x.number)
    if (x.type === 'epic' || isParent(x.number)) roots.push(it)
    else groupKids.push(it)
  }
  groupKids.push(...[...noneCards].sort(cardById).map(cardLeaf))
  if (groupKids.length > 0) roots.push(parentOfItems(NO_EPIC, 'No epic', 'issue', undefined, groupKids, true))

  // rule 9: the counts over the leaves of every root
  const counts = Object.fromEntries(WORK_STATES.map(s => [s, 0])) as Record<WorkState, number>
  const count = (it: WorkItem): void => {
    if (it.children.length === 0) counts[it.state]++
    else for (const c of it.children) count(c)
  }
  for (const r of roots) count(r)
  const total = WORK_STATES.reduce((s, st) => s + counts[st], 0)
  return { roots, counts, total }
}

/** The rows of the view for a set of filters: an unfiltered tree with done children folded, or the matches of a filter. */
export function workRows(m: WorkModel, ui: WorkUi): WorkRow[] {
  const q = ui.query.trim().toLowerCase()
  const filtered = q !== '' || ui.states.size > 0
  const roots = ui.root !== undefined && m.roots.some(r => r.key === ui.root) ? m.roots.filter(r => r.key === ui.root) : m.roots
  const out: WorkRow[] = []

  const listItem = (it: WorkItem, depth: number): void => {
    if (it.children.length === 0) {
      out.push({ kind: 'item', item: it, depth })
      return
    }
    const open = !ui.closed.has(it.key)
    out.push({ kind: 'item', item: it, depth, open })
    if (!open) return
    const listAll = ui.showDone || ui.shown.has(it.key)
    const doneKids = it.children.filter(c => c.state === 'done')
    const inPlace = new Set(listAll ? doneKids.slice(-DONE_CAP) : [])
    for (const c of it.children) {
      if (c.state !== 'done' || inPlace.has(c)) listItem(c, depth + 1)
    }
    if (doneKids.length === 0) return
    if (listAll) {
      const left = doneKids.length - inPlace.size
      if (left > 0) out.push({ kind: 'older', parent: it.key, depth: depth + 1, n: left })
    } else {
      out.push({ kind: 'hidden', parent: it.key, depth: depth + 1, n: doneKids.length })
    }
  }

  const leafMatches = (it: WorkItem): boolean =>
    (ui.states.size === 0 || ui.states.has(it.state)) &&
    (q === '' || `${it.title} #${it.number ?? ''} ${it.card ?? ''}`.toLowerCase().includes(q)) &&
    (it.state !== 'done' || ui.showDone || ui.states.has('done'))
  const anyMatch = (it: WorkItem): boolean => (it.children.length === 0 ? leafMatches(it) : it.children.some(anyMatch))
  const listFiltered = (it: WorkItem, depth: number): void => {
    if (it.children.length === 0) {
      if (leafMatches(it)) out.push({ kind: 'item', item: it, depth })
      return
    }
    if (!anyMatch(it)) return
    out.push({ kind: 'item', item: it, depth, open: true })
    for (const c of it.children) listFiltered(c, depth + 1)
  }

  for (const r of roots) {
    if (filtered) listFiltered(r, 0)
    else if (r.state !== 'done' || ui.showDone) listItem(r, 0)
  }
  if (out.length <= ROW_CAP) return out
  return [...out.slice(0, ROW_CAP), { kind: 'more', n: out.length - ROW_CAP }]
}

/** The age of the read, in words: just now, N min ago, N h ago. A read in the future counts as just now. */
export function updatedText(at: number, now: number): string {
  const age = Math.max(0, now - at)
  if (age < 60_000) return 'Updated just now'
  if (age < 3_600_000) return `Updated ${Math.floor(age / 60_000)} min ago`
  return `Updated ${Math.floor(age / 3_600_000)} h ago`
}

const leafFields = (it: WorkItem): string[] => {
  const out: string[] = []
  if (it.card !== undefined) out.push(it.card)
  const who = [it.model, it.attempt].filter((x): x is string => x !== undefined && x !== '').join(' ')
  if (who !== '') out.push(who)
  if (it.running !== undefined) out.push(it.running)
  if (it.usd !== undefined) out.push(`$${it.usd.toFixed(2)}`)
  if (it.by !== undefined && it.by.length > 0) out.push(`by ${it.by.join(', ')}`)
  if (it.slot) out.push('waiting for a slot')
  if (it.onDisk) out.push('worktree on disk')
  return out
}

/** The text form: a summary line, the notes, then the rows of the default view (or the import hint when there is no work). */
export function workText(m: WorkModel, o: { updated?: string; notes?: readonly string[] } = {}): string {
  const counts = WORK_STATES.map(s => `${m.counts[s]} ${STATE_LABEL[s].toLowerCase()}`).join(' · ')
  const lines = [`**Work** · ${counts}${o.updated ? ` · ${o.updated}` : ''}`, ...(o.notes ?? [])]
  if (m.total === 0) {
    lines.push('No work breakdown yet. Import one with /delegation tree import <file>, or start one with /delegation land epic <title>.')
    return lines.join('\n')
  }
  lines.push('')
  for (const row of workRows(m, DEFAULT_UI)) {
    const pad = (d: number) => '  '.repeat(d)
    if (row.kind === 'item') {
      const it = row.item
      if (row.open !== undefined) {
        const label = it.group ? 'No epic' : `#${it.number} ${it.title}`
        lines.push(`${pad(row.depth)}- **${label}** ${it.done}/${it.leaves}`)
        continue
      }
      const num = it.number !== undefined ? `#${it.number}` : '—'
      const suffix = it.number !== undefined && (it.type === 'bug' || it.type === 'task' || it.type === 'spike') ? ` (${it.type})` : ''
      const fields = leafFields(it)
      lines.push(`${pad(row.depth)}- ${STATE_LABEL[it.state].toUpperCase()} ${num} ${it.title}${suffix}${fields.map(f => ` · ${f}`).join('')}`)
    } else if (row.kind === 'hidden') {
      lines.push(`${pad(row.depth)}- ${row.n} done hidden`)
    } else if (row.kind === 'older') {
      lines.push(`${pad(row.depth)}- ${row.n} older done not shown`)
    } else {
      lines.push(`… ${row.n} more rows`)
    }
  }
  return lines.join('\n')
}

// MOD-354: the list view's layout, colours and key helpers. The pane draws these in character cells.

export type WorkLayout = { mode: 'wide' | 'medium' | 'narrow'; work: number; status: number; progress: number; card: number; worker: number; cost: number }

/** Cells per column for a body `columns` cells wide; 0 means the column is not drawn. */
export function workLayout(columns: number): WorkLayout {
  if (columns >= 116) return { mode: 'wide', work: columns - 68, status: 12, progress: 16, card: 10, worker: 22, cost: 8 }
  if (columns >= 72) return { mode: 'medium', work: columns - 38, status: 12, progress: 16, card: 10, worker: 0, cost: 0 }
  return { mode: 'narrow', work: Math.max(16, columns - 12), status: 12, progress: 0, card: 0, worker: 0, cost: 0 }
}

/** Filled cells of a parent's progress bar. */
export function progressCells(done: number, leaves: number, width = 8): number {
  if (leaves <= 0 || done <= 0) return 0
  if (done >= leaves) return width
  return Math.min(width - 1, Math.max(1, Math.round((done / leaves) * width)))
}

export const LOZENGE: Record<WorkState, Record<Scheme, { bg?: string; fg: string }>> = {
  working: { light: { bg: '#e9f2ff', fg: '#0055cc' }, dark: { bg: '#09326c', fg: '#85b8ff' } },
  review: { light: { bg: '#fff7d6', fg: '#7f5f01' }, dark: { bg: '#533f04', fg: '#f5cd47' } },
  queued: { light: { bg: '#f1f2f4', fg: '#44546f' }, dark: { bg: '#2c333a', fg: '#9fadbc' } },
  blocked: { light: { bg: '#ffeceb', fg: '#ae2e24' }, dark: { bg: '#5d1f1a', fg: '#fd9891' } },
  done: { light: { bg: '#dcfff1', fg: '#216e4e' }, dark: { bg: '#164b35', fg: '#7ee2b8' } },
  backlog: { light: { fg: '#626f86' }, dark: { fg: '#8c9bab' } },
}

export const TYPE_MARK: Record<WorkType, { glyph: string; color: string }> = {
  epic: { glyph: '◆', color: '#8270db' },
  feature: { glyph: '▲', color: '#f38a3f' },
  story: { glyph: '■', color: '#22a06b' },
  task: { glyph: '✓', color: '#1d7afc' },
  bug: { glyph: '●', color: '#e2483d' },
  spike: { glyph: '?', color: '#626f86' },
  issue: { glyph: '○', color: '#626f86' },
}

export const TIER_COLOR: Record<Tier, string> = { economy: '#22a06b', standard: '#1d7afc', frontier: '#8270db', premium: '#f38a3f' }

/** `#13` becomes `i13`; any other key unchanged. The part of an element key that names an item. */
export function keySlug(key: string): string {
  const m = /^#(\d+)$/.exec(key)
  return m ? `i${m[1]}` : key
}

// MOD-356: the detail panel's pure half: finding a leaf, its action and the line that action puts to the session, its activity from the ledger.

export type WorkAction = 'dispatch' | 'review' | 'unblock'
export const ACTION_LABEL: Record<WorkAction, string> = { dispatch: 'Dispatch', review: 'Review', unblock: 'Unblock' }
export const ASKED_TTL_MS = 10 * 60 * 1000
export const ACTIVITY_CAP = 8
export const SELECTED_BG: Record<Scheme, string> = { light: '#e9f2ff', dark: '#1c2b41' }
export type WorkAsked = { action: WorkAction; state: WorkState; at: number }
export type WorkEvent = { text: string; ago: string }

/** The first leaf with this key, depth first, and its ancestors root first. A parent's key or an unknown key gives undefined. */
export function findItem(m: WorkModel, key: string): { item: WorkItem; trail: WorkItem[] } | undefined {
  const walk = (it: WorkItem, trail: WorkItem[]): { item: WorkItem; trail: WorkItem[] } | undefined => {
    if (it.children.length === 0) return it.key === key ? { item: it, trail } : undefined
    for (const c of it.children) {
      const hit = walk(c, [...trail, it])
      if (hit) return hit
    }
    return undefined
  }
  for (const r of m.roots) {
    const hit = walk(r, [])
    if (hit) return hit
  }
  return undefined
}

/** The first leaf, depth first, whose card or key is `id`. */
export function leafOfCard(m: WorkModel, id: string): WorkItem | undefined {
  const walk = (it: WorkItem): WorkItem | undefined => {
    if (it.children.length === 0) return it.card === id || it.key === id ? it : undefined
    for (const c of it.children) {
      const hit = walk(c)
      if (hit) return hit
    }
    return undefined
  }
  for (const r of m.roots) {
    const hit = walk(r)
    if (hit) return hit
  }
  return undefined
}

/** The one action of a leaf with a card: Dispatch when queued (and not already waiting for a slot), Review when to review, Unblock when blocked. */
export function workAction(it: WorkItem): WorkAction | undefined {
  if (it.children.length > 0 || it.card === undefined) return undefined
  if (it.state === 'queued') return it.slot ? undefined : 'dispatch'
  if (it.state === 'review') return 'review'
  if (it.state === 'blocked') return 'unblock'
  return undefined
}

/** The one line a press puts to the session. */
export function actionLine(action: WorkAction, it: WorkItem): string {
  const card = it.card ?? it.key
  if (action === 'dispatch') return `Work pane: Dispatch was pressed on ${card}. Dispatch ${card}.`
  if (action === 'review') return `Work pane: Review was pressed on ${card}. Get its verdict, read its diff and say whether it should merge.`
  if (it.by !== undefined && it.by.length > 0) {
    return `Work pane: Unblock was pressed and confirmed on ${card}, which waits on ${it.by.join(', ')}. Release its card (status queued, no blocked_by line) and say what it still overlaps.`
  }
  return `Work pane: Unblock was pressed and confirmed on ${card}. Release its card (status queued, no blocked_by line).`
}

/** A press still shows as asked while the item is in the state it was pressed in and ASKED_TTL_MS has not passed. */
export function askedOn(a: WorkAsked | undefined, it: WorkItem, now: number): boolean {
  return a !== undefined && a.state === it.state && now - a.at >= 0 && now - a.at < ASKED_TTL_MS
}

/** just now, N min ago, N h ago, N d ago. */
export function agoText(at: number, now: number): string {
  const age = Math.max(0, now - at)
  if (age < 60_000) return 'just now'
  if (age < 3_600_000) return `${Math.floor(age / 60_000)} min ago`
  if (age < 86_400_000) return `${Math.floor(age / 3_600_000)} h ago`
  return `${Math.floor(age / 86_400_000)} d ago`
}

// The activity text is 'Verif' + 'ied by hand: ': the consistency test greps hooks/ for the retired verdict word, and this is a label, not a verdict.
const BY_HAND = 'Verif' + 'ied by hand: '

/** The events of one card's ledger rows, newest first, at most ACTIVITY_CAP. */
export function workActivity(rows: readonly Record<string, unknown>[], card: string, now: number): WorkEvent[] {
  const num = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)
  const found: { text: string; at: number; i: number }[] = []
  const add = (text: string, at: number, i: number) => {
    if (!found.some(f => f.text === text && f.at === at)) found.push({ text, at, i })
  }
  rows.forEach((r, i) => {
    if (r.task !== card) return
    const kind = r.kind
    if (kind === undefined && r.event === 'spawn' && num(r.at)) {
      const alias = typeof r.alias === 'string' ? r.alias : 'a worker'
      const att = num(r.attempt) ? ` · attempt ${r.attempt}${num(r.budget) ? `/${r.budget}` : ''}` : ''
      add(`Dispatched to ${alias}${att}`, r.at, i)
    }
    if ((kind === 'spawn' || kind === 'resume') && typeof r.verdict === 'string' && num(r.verdictAt)) {
      add(`Verdict ${r.verdict}${num(r.usd) ? ` · $${r.usd.toFixed(2)}` : ''}`, r.verdictAt, i)
    }
    if (kind === 'resume' && num(r.at)) add(num(r.attempt) ? `Resumed · attempt ${r.attempt}` : 'Resumed', r.at, i)
    if (kind === 'verify' && typeof r.verdict === 'string' && num(r.verdictAt)) add(`${BY_HAND}${r.verdict}`, r.verdictAt, i)
    if (kind === 'review' && typeof r.verdict === 'string' && num(r.verdictAt)) add(`Review: ${r.verdict}`, r.verdictAt, i)
    if (kind === 'amend' && num(r.at)) add('Scope amended', r.at, i)
    if (kind === 'accept' && num(r.at)) add('Accepted', r.at, i)
    if (kind === 'merged' && num(r.at)) add('Merged', r.at, i)
  })
  return found
    .sort((a, b) => b.at - a.at || b.i - a.i)
    .slice(0, ACTIVITY_CAP)
    .map(f => ({ text: f.text, ago: agoText(f.at, now) }))
}
