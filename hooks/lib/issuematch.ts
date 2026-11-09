// MOD-287: a card with no `issue:` is matched against the planned tasks the mod filed. Pure: the parsers take text, the
// matcher takes data; register.ts reads the folders and the card board. No I/O, no gh.
import { scopeOverlap } from './brief'

export const ISSUE_MATCH_MODES = ['off', 'suggest', 'require'] as const
export type IssueMatchMode = (typeof ISSUE_MATCH_MODES)[number]

/** The option's value, lower-cased and trimmed; undefined when it is not one of the three. */
export function issueMatchOf(v: unknown): IssueMatchMode | undefined {
  const t = typeof v === 'string' ? v.trim().toLowerCase() : ''
  return (ISSUE_MATCH_MODES as readonly string[]).includes(t) ? (t as IssueMatchMode) : undefined
}

/** The item types a card can be matched to; a feature, epic or story is never a candidate. */
export const MATCH_TYPES = ['task', 'bug', 'spike'] as const

/** At most this many suggestions per card. */
export const MATCH_LIMIT = 3

/** MOD-339: the candidates read before the state check: up to this many, of which the open ones (at most MATCH_LIMIT) are suggested. */
export const MATCH_POOL = 6

/** A planned item the mod filed: its issue number, title, type, the repo paths it touches, and its parent's issue when known. */
export type Planned = { number: number; title: string; type: string; paths: string[]; parent?: number }

const ISSUE_LINE = /^issue: #(\d+) \S+$/
const PARENT_LINE = /^parent: #(\d+)$/
const TYPE_LINE = /^type: (\S+)$/
const CLOSED_LINE = /^closed: \S+$/

/** The landed file's scope block (the paths land wrote), or []. */
function scopeBlockOf(text: string): string[] {
  const m = /```scope\n([\s\S]*?)\n```/.exec(text)
  return m ? (m[1] as string).split('\n').map(p => p.trim()).filter(p => p !== '') : []
}

/**
 * A landed file as a planned item, or undefined: it must carry `type:` and `issue:` and no `closed:` line (a closed item is
 * done). The title is the file name's slug with its hyphens as spaces, since a landed file keeps no title line.
 */
export function plannedFromLanded(name: string, text: string): Planned | undefined {
  let type: string | undefined
  let number: number | undefined
  let parent: number | undefined
  let closed = false
  // land writes type, parent, issue (and closed) at the end, so the last match of each wins
  for (const line of text.split('\n').reverse()) {
    if (CLOSED_LINE.test(line)) closed = true
    const issue = ISSUE_LINE.exec(line)
    if (issue && number === undefined) number = Number(issue[1])
    const par = PARENT_LINE.exec(line)
    if (par && parent === undefined) parent = Number(par[1])
    const ty = TYPE_LINE.exec(line)
    if (ty && type === undefined) type = ty[1] as string
  }
  if (closed || type === undefined || number === undefined) return undefined
  const title = name.replace(/\.md$/, '').replace(/-\d+$/, '').replace(/-/g, ' ').trim()
  return { number, title, type, paths: scopeBlockOf(text), ...(parent !== undefined ? { parent } : {}) }
}

/**
 * The planned items of one plan file (the JSON tree_import reads): every item with an `issue`, its parent being the nearest
 * enclosing item that has one. Items that are not JSON objects, or that have no issue, are skipped.
 */
export function plannedFromPlan(json: unknown): Planned[] {
  const out: Planned[] = []
  const walk = (items: unknown, parent: number | undefined): void => {
    if (!Array.isArray(items)) return
    for (const raw of items) {
      if (typeof raw !== 'object' || raw === null) continue
      const o = raw as { type?: unknown; title?: unknown; paths?: unknown; issue?: unknown; close?: unknown; children?: unknown }
      const issue = typeof o.issue === 'number' && Number.isInteger(o.issue) && o.issue >= 1 ? o.issue : undefined
      // MOD-339: an item filed closed (a close line with some text) is done, so it is never a candidate; its children still are
      const closed = typeof o.close === 'string' && o.close.trim() !== ''
      if (issue !== undefined && !closed) {
        const paths = Array.isArray(o.paths) ? o.paths.filter((p): p is string => typeof p === 'string') : []
        out.push({ number: issue, title: typeof o.title === 'string' ? o.title : '', type: typeof o.type === 'string' ? o.type : '', paths, ...(parent !== undefined ? { parent } : {}) })
      }
      walk(o.children, issue ?? parent)
    }
  }
  walk((json as { items?: unknown } | null)?.items, undefined)
  return out
}

/**
 * Up to MATCH_LIMIT candidates whose paths overlap the card's scope, most overlapping first (then by issue number). A candidate
 * is out when it is not a task, bug or spike, has no paths, or its number is already named by a card or a ledger row.
 * MOD-339: `limit` is how many are returned (MATCH_LIMIT when not given).
 */
export function matchPlanned(scope: readonly string[], planned: readonly Planned[], named: ReadonlySet<number>, limit: number = MATCH_LIMIT): (Planned & { overlap: number })[] {
  const scored: (Planned & { overlap: number })[] = []
  for (const p of planned) {
    if (named.has(p.number) || !(MATCH_TYPES as readonly string[]).includes(p.type)) continue
    const overlap = p.paths.filter(path => scopeOverlap(scope, [path]) !== undefined).length
    if (overlap > 0) scored.push({ ...p, overlap })
  }
  scored.sort((a, b) => b.overlap - a.overlap || a.number - b.number)
  return scored.slice(0, limit)
}

/**
 * MOD-339: the candidates whose issue is not known to be closed, first `limit`; a number absent from `states` is kept.
 * A candidate is dropped only when `states` holds its number with a value that is `closed` in any letter case. Order is kept.
 */
export function openCandidates<T extends { number: number }>(cands: readonly T[], states: ReadonlyMap<number, string>, limit: number = MATCH_LIMIT): T[] {
  return cands.filter(c => states.get(c.number)?.toLowerCase() !== 'closed').slice(0, limit)
}

/** The head of a candidate's line: `planned task #<n> "<title>"`, with ` (under #<p>)` when its parent is known. */
export function plannedHead(p: Planned): string {
  return `planned task #${p.number} "${p.title}"${p.parent !== undefined ? ` (under #${p.parent})` : ''}`
}

/** The line the card tool and /dispatch's dry run print for one candidate; the parent clause only when one is known. */
export function suggestionLine(p: Planned): string {
  return `${plannedHead(p)} overlaps this scope; pass issue: ${p.number}${p.parent !== undefined ? `, parent: ${p.parent}` : ''}`
}

/** The tail of a refusal under issueMatch require: the candidate, and the way out. */
export function refusalLine(p: Planned): string {
  return `${plannedHead(p)} overlaps this scope; pass issue: ${p.number} (or set issueMatch suggest)`
}

/** The lines land writes after a landed body: type, the parent when one was given, then the issue line (closed is added later). */
export function landedTail(o: { type: string; parent?: number; number: number; url: string }): string {
  return `type: ${o.type}\n${o.parent !== undefined && o.parent > 0 ? `parent: #${o.parent}\n` : ''}issue: #${o.number} ${o.url}\n`
}
