// MOD-200: the status comments the mod writes on a card's GitHub issue. Pure text and paths; no I/O, no gh.

export type StatusKind = 'started' | 'verdict'

/** The body file of one status comment: `<root>/.delegation/status/<id>-attempt-<n>-<started|verdict>.md`. */
export const statusFile = (root: string, id: string, attempt: number, kind: StatusKind): string => `${root.replace(/\/+$/, '')}/.delegation/status/${id}-attempt-${attempt}-${kind}.md`

/** `attempt 1/2 started · standard sonnet · card MOD-200` */
export const startedComment = (o: { id: string; attempt: number; budget: number; tier: string; alias: string }): string => `attempt ${o.attempt}/${o.budget} started · ${o.tier} ${o.alias} · card ${o.id}`

/** The verdict row's text, as the comment body. */
export const verdictComment = (row: string): string => row.trim()

/** `superseded by #<n>: <reason>`; the reason is left out when empty. */
export const superseded = (newIssue: number, reason: string): string => {
  const r = reason.trim()
  return `superseded by #${newIssue}${r === '' ? '' : `: ${r}`}`
}

/** The one failure line a status comment adds to a result: `status: comment on #<n> failed: <stderr, 200 chars>`. */
export const statusFailure = (issue: number, stderr: string): string => `status: comment on #${issue} failed: ${stderr.trim().slice(0, 200)}`
