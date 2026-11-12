// MOD-194: tree, the pure half. Reads the parsed `gh issue view` JSON of one issue and its sub-issues and says what is
// done, in flight and planned, matched to the open cards. No I/O.

import { tierMixLine, type Tier } from './tier'

export type TreeCard = { id: string; issue?: number; status?: string; tier?: Tier; /** MOD-329: the ids a blocked card waits on. */ blockedBy?: string[] }
export type TreeRow = { number: number; title: string; kind: 'done' | 'in flight' | 'planned' | 'blocked'; card?: string; /** MOD-329: the blockers of a blocked row. */ by?: string[] }
export type Tree = { header: string; scope: string[]; forbid: string[]; rows: TreeRow[]; counts: { done: number; inFlight: number; planned: number; blocked: number }; /** MOD-276: the tier mix of the cards on in flight rows; absent with fewer than two. */ mix?: string }

/** The lines of the first ```<name> fenced block, trimmed, blank lines dropped; [] when there is none. */
export function fencedBlock(body: string, name: string): string[] {
  const out: string[] = []
  let inside = false
  for (const raw of body.split('\n')) {
    const line = raw.trim()
    if (!inside) {
      if (line === '```' + name) inside = true
      continue
    }
    if (line.startsWith('```')) return out
    if (line !== '') out.push(line)
  }
  return inside ? out : []
}

type Sub = { number: number; title: string; state: string }

function subsOf(v: unknown): Sub[] {
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { nodes?: unknown }).nodes) ? (v as { nodes: unknown[] }).nodes : []
  const subs: Sub[] = []
  for (const s of list) {
    const o = s as { number?: unknown; title?: unknown; state?: unknown } | null
    if (o && typeof o.number === 'number') subs.push({ number: o.number, title: typeof o.title === 'string' ? o.title : '', state: typeof o.state === 'string' ? o.state : '' })
  }
  return subs.sort((a, b) => a.number - b.number)
}

/** The parsed gh JSON, the open cards and the done task ids, as a tree. */
export function treeOf(json: unknown, cards: readonly TreeCard[], done: ReadonlySet<string>): Tree {
  const j = (json ?? {}) as { number?: unknown; title?: unknown; state?: unknown; labels?: unknown; body?: unknown; subIssues?: unknown }
  const labels = Array.isArray(j.labels) ? j.labels.map(l => (l as { name?: unknown } | null)?.name).filter((n): n is string => typeof n === 'string') : []
  const type = labels.map(n => /^type:(.+)$/.exec(n)?.[1]).find(t => t !== undefined) ?? 'issue'
  const state = String(j.state ?? '').toUpperCase() === 'CLOSED' ? 'closed' : 'open'
  const body = typeof j.body === 'string' ? j.body : ''
  const rows: TreeRow[] = subsOf(j.subIssues).map(s => {
    const card = cards.find(c => c.issue === s.number)
    const isDone = s.state.toUpperCase() === 'CLOSED' || (card !== undefined && done.has(card.id))
    const isBlocked = !isDone && card?.status === 'blocked'
    return { number: s.number, title: s.title, kind: isDone ? 'done' : isBlocked ? 'blocked' : card ? 'in flight' : 'planned', ...(card ? { card: card.id } : {}), ...(isBlocked ? { by: card?.blockedBy ?? [] } : {}) }
  })
  const count = (k: TreeRow['kind']) => rows.filter(r => r.kind === k).length
  const mix = tierMixLine(rows.filter(r => r.kind === 'in flight').map(r => cards.find(c => c.id === r.card)?.tier ?? 'standard'))
  return { header: `#${String(j.number)} ${type}: ${String(j.title ?? '')} (${state})`, scope: fencedBlock(body, 'scope'), forbid: fencedBlock(body, 'forbid'), rows, counts: { done: count('done'), inFlight: count('in flight'), planned: count('planned'), blocked: count('blocked') }, ...(mix ? { mix } : {}) }
}

export function treeText(t: Tree): string {
  return [
    t.header,
    ...(t.scope.length > 0 ? [`scope: ${t.scope.join(', ')}`] : []),
    ...(t.forbid.length > 0 ? [`forbid: ${t.forbid.join(', ')}`] : []),
    ...t.rows.map(r => `${r.kind} #${r.number} ${r.title}${r.card ? ` ${r.card}` : ''}${r.kind === 'blocked' && r.by && r.by.length > 0 ? ` (by ${r.by.join(', ')})` : ''}`),
    `${t.counts.done} done · ${t.counts.inFlight} in flight · ${t.counts.planned} planned${t.counts.blocked > 0 ? ` · ${t.counts.blocked} blocked` : ''}`,
    ...(t.mix ? [t.mix] : []),
    ...(t.scope.length > 0 ? [`parentScope for a task card: ${JSON.stringify(t.scope)}`] : []),
  ].join('\n')
}

export const TREE_TOOL = {
  name: 'tree',
  description:
    "Reads one GitHub issue of this repo and its sub-issues (read-only) and prints what is planned, in flight and done, matched to cards, with the issue's scope and forbid blocks. Use it at the start of a session to pick up the plan, and before cutting a card under a parent to get parentScope. With reconcile: true it instead lists the open sub-issues that merged cards already did, the sub-issues closed by hand with open children, and the ones that match nothing, with the gh issue close lines; it closes nothing unless confirm: true, and confirm runs the closes: sub-issues a merged card already did, and open parents whose sub-issues are all closed; a sub-issue that cards name only as parent is closed only when only names it, only after the person says yes in their own words.",
  inputSchema: {
    type: 'object',
    properties: {
      issue: { type: 'integer', minimum: 1, description: 'The issue number, a whole number 1 or more.' },
      reconcile: { type: 'boolean', description: 'true: propose closes for sub-issues that merged cards already did (read-only unless confirm).' },
      all: { type: 'boolean', description: 'With reconcile: true instead of issue: runs the reconcile over every open type:epic issue of the repo, one report, one read cap.' },
      confirm: { type: 'boolean', description: 'With reconcile: true, only after the person says yes in their own words: runs the closes: sub-issues a merged card already did, and open parents whose sub-issues are all closed; a sub-issue that cards name only as parent is closed only when only names it.' },
      only: { type: 'array', items: { type: 'integer', minimum: 1 }, description: 'With reconcile: true and confirm: true: close only these issue numbers, each a proposal of the run. Needed to close a sub-issue that merged cards name only as parent.' },
    },
    anyOf: [{ required: ['issue'] }, { required: ['all'] }],
    additionalProperties: false,
  },
} as const
