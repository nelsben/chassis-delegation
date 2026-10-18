// MOD-95 (#154): when a brief already exists for a task, is it the brief this dispatch would write? Pure: no `$`.
//
// Three points decide it, and only these: the header's repo= (absent, here, none or an absolute path), the worktree
// the brief names, and the card path it names. All three agree: the brief is reused as it is (an amended scope or a
// hand edit stays). Any differs: it is rewritten, or, with an attempt of the task open, dispatch refuses.

import { parseHeader } from './brief'

/** What a brief says of the repo, the worktree and the card; a point the brief does not name is undefined (not compared). */
export type BriefNames = { repo: string; worktree?: string; card?: string }

/** The same three points, as this dispatch would write them (`repo` is '' for a worktree brief of the session's own repo). */
export type BriefWants = { repo: string; worktree: string; card: string }

export type BriefDrift = { points: string[]; was: string[] }

/**
 * The repo, worktree and card path a brief names. The worktree and the card come from the body, in the shipped
 * template's lines (`Card: <path> (read-only…`, `Worktree|Checkout|Working folder: <path>, branch …`) or the
 * one-line form (`Work in <path> on <branch>; card <path>.`).
 */
export function briefNames(text: string): BriefNames {
  const header = parseHeader(text)
  const body = header ? text.slice(text.indexOf(header.raw) + header.raw.length) : text
  const card = /^Card: (\S.*?) \(read-only/m.exec(body)?.[1] ?? /^Work in \S+ on \S+; card (\S.*?)\.$/m.exec(body)?.[1]
  const worktree =
    /^(?:Worktree|Checkout): (\S+?),? branch /m.exec(body)?.[1] ?? /^Working folder: (\S+) \(repo=none/m.exec(body)?.[1] ?? /^Work in (\S+) on \S+; card /m.exec(body)?.[1]
  return { repo: header?.repo ?? '', ...(worktree !== undefined ? { worktree } : {}), ...(card !== undefined ? { card } : {}) }
}

/** Where `have` and `want` differ on the three points: which, and what the brief had. Empty: the brief is the one to reuse. */
export function briefDrift(have: BriefNames, want: BriefWants): BriefDrift {
  const points: string[] = []
  const was: string[] = []
  if (have.repo !== want.repo) {
    points.push('repo')
    was.push(`repo ${have.repo || 'absent'}`)
  }
  if (have.worktree !== undefined && have.worktree !== want.worktree) {
    points.push('worktree')
    was.push(`worktree ${have.worktree}`)
  }
  if (have.card !== undefined && have.card !== want.card) {
    points.push('card')
    was.push(`card ${have.card}`)
  }
  return { points, was }
}

/** `2. brief <path> was written for <what it named>; rewritten for this card (<the points that differed>)` */
export const briefRewrittenLine = (path: string, d: BriefDrift): string => `2. brief ${path} was written for ${d.was.join(', ')}; rewritten for this card (${d.points.join(', ')})`

/** The one-line refusal when the brief differs and an attempt of the task is running or awaiting its verdict. */
export const briefStaleRefusal = (id: string, path: string, d: BriefDrift, attempt: number): string =>
  `/dispatch ${id}: refused — brief ${path} was written for ${d.was.join(', ')}, which differs from this dispatch (${d.points.join(', ')}), and attempt ${attempt} of ${id} is running or awaiting its verdict; nothing was written (let it finish, or remove the brief once it is judged)`
