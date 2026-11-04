// MOD-291: a rebase of a task's branch is not an attempt. After a judged attempt the brain rebases the branch onto
// the base (the merge tool does too); the head moves, its tree does not. This decides what a moved head means:
// the same commit, the same tree (a rebase), or new work. Pure: no `$`.

/** What a head that is not the judged sha is: unchanged (the same commit), rebased (another commit, the same tree), or new work. */
export type HeadMove = { kind: 'unchanged' } | { kind: 'rebased'; sha: string } | { kind: 'new-work'; sha: string; files: string[] }

/** Two spellings of one commit: one a prefix (7 hex at least) of the other. */
const sameCommit = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x))
}

/**
 * The judged attempt's sha and tree against the head's. `changed` is the paths between them (read only when the trees
 * differ, by the caller). A tree is `undefined` when git could not say: then a moved head is never a rebase.
 */
export function headMove(judged: { sha: string; tree?: string }, head: { sha: string; tree?: string }, changed: readonly string[] = []): HeadMove {
  if (sameCommit(judged.sha, head.sha)) return { kind: 'unchanged' }
  if (judged.tree !== undefined && head.tree !== undefined && judged.tree === head.tree) return { kind: 'rebased', sha: head.sha }
  return { kind: 'new-work', sha: head.sha, files: [...changed] }
}

/** The short form of a sha as the rows show it. */
export const shortSha = (sha: string): string => sha.slice(0, 7)

/** The verdict row with `rebased to <short sha>` before its `next=` (or at its end): the last verdict at the new sha. */
export function rebasedText(row: string, sha: string): string {
  const clause = `rebased to ${shortSha(sha)}`
  return row.includes(' · next=') ? row.replace(' · next=', ` · ${clause} · next=`) : `${row} · ${clause}`
}

/** `unverified work since <judged short sha>: <k> files (<first three paths>) · dispatch verify=<head short sha>`: no attempt is charged for it. */
export function unverifiedWorkLine(judgedSha: string, headSha: string, files: readonly string[]): string {
  const count = `${files.length} ${files.length === 1 ? 'file' : 'files'}`
  return `unverified work since ${shortSha(judgedSha)}: ${count} (${files.slice(0, 3).join(', ')}) · dispatch verify=${shortSha(headSha)}`
}
