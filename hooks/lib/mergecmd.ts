// MOD-75: `/delegation merge <ID>` and the merge tool. The mod does the local half of
// the merge pipeline the brain typed by hand (rebase the worktree, commit the merged
// card, run the gates) and prints the remote half (push, PR, merge) as one block the
// brain runs verbatim; `--finish` cleans up once the PR has landed. Pure: no `$`.
//
// HARD RULE (part 5A, kept): the mod never pushes, never calls gh and never runs curl
// or sf. The local git writes this command needs are exact shapes in ./allow.ts, bound
// to the one task's worktree, branch and card, and on only while the command runs
// (`AllowConfig.merge`).

import { readVerdict } from './attempts'
import { doneWhenOf } from './card'
import { modelName } from './watch'
import { mergedSubject } from './allow'

export { mergedSubject }

export const MERGE_USAGE = 'usage: /delegation merge <ID> [--review <text> | --review-file <abs path>] | /delegation merge <ID> --finish [--discard]'

export type MergeArgs = { id: string; finish: boolean; discard?: boolean; review?: string; reviewFile?: string }

const TASK_ID = /^[A-Z][A-Z0-9]*-\d+[a-z]?$/

/** `merge <ID> [--finish] [--review <text…>] [--review-file <path>]` (the words after `merge`). */
export function parseMergeArgs(rest: string): MergeArgs | { error: string } {
  const words = rest.trim().split(/\s+/).filter(Boolean)
  const [id = '', ...more] = words
  if (id === '') return { error: MERGE_USAGE }
  if (!TASK_ID.test(id)) return { error: `refused task id ${id}` }
  let finish = false
  let discard = false
  let review: string | undefined
  let reviewFile: string | undefined
  for (let i = 0; i < more.length; i++) {
    const w = more[i] as string
    if (w === '--finish') finish = true
    else if (w === '--discard') discard = true
    else if (w === '--review-file') {
      reviewFile = more[i + 1]
      i++
      if (!reviewFile) return { error: MERGE_USAGE }
    } else if (w === '--review') {
      // the review text runs to the next option, or to the end
      const stop = more.findIndex((x, j) => j > i && (x === '--finish' || x === '--discard' || x === '--review-file'))
      const end = stop === -1 ? more.length : stop
      review = more.slice(i + 1, end).join(' ')
      if (review === '') return { error: MERGE_USAGE }
      i = end - 1
    } else return { error: `${MERGE_USAGE} (unknown option ${w})` }
  }
  if (discard && !finish) return { error: 'refused --discard without --finish' }
  if (finish && (review !== undefined || reviewFile !== undefined)) return { error: 'refused --finish with --review: the review goes in when the card is merged, before the push' }
  if (review !== undefined && reviewFile !== undefined) return { error: 'refused --review with --review-file: name one' }
  if (reviewFile !== undefined && !reviewFile.startsWith('/')) return { error: `refused --review-file ${reviewFile}: name an absolute path` }
  return { id, finish, ...(discard ? { discard } : {}), ...(review !== undefined ? { review } : {}), ...(reviewFile !== undefined ? { reviewFile } : {}) }
}

/** The merge tool's input, as the command's words. */
export function parseMergeTool(input: Record<string, unknown>): MergeArgs | { error: string } {
  const id = typeof input.task === 'string' ? input.task.trim() : ''
  if (id === '') return { error: 'the merge tool needs task=<ID>' }
  if (!TASK_ID.test(id)) return { error: `refused task id ${id}` }
  const finish = input.finish === true
  const discard = input.discard === true
  const review = typeof input.review === 'string' && input.review.trim() !== '' ? input.review.trim() : undefined
  const reviewFile = typeof input.reviewFile === 'string' && input.reviewFile.trim() !== '' ? input.reviewFile.trim() : undefined
  const words = [id, ...(finish ? ['--finish'] : []), ...(discard ? ['--discard'] : []), ...(reviewFile ? ['--review-file', reviewFile] : [])]
  const parsed = parseMergeArgs(words.join(' '))
  if ('error' in parsed) return parsed
  if (review !== undefined && (finish || reviewFile !== undefined)) return { error: finish ? 'refused --finish with --review: the review goes in when the card is merged, before the push' : 'refused --review with --review-file: name one' }
  return { ...parsed, ...(review !== undefined ? { review } : {}) }
}

export const MERGE_TOOL = {
  name: 'merge',
  description:
    'After a consistent verdict with next=accept: rebases the task worktree onto the base, commits the card as merged, runs the card gates there, and returns the push/PR block to run verbatim. With finish: true, after the PR has landed: removes the root card, pulls, removes the worktree and branch, records the merge, and returns the remote cleanup (and release) lines. Before removing anything it lists the untracked and git-ignored files in the worktree (outside a built-in skip list) and stops unless discard: true. Never pushes and never calls gh itself.',
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task id, e.g. MOD-75.' },
      finish: { type: 'boolean', description: 'true after the PR has merged: clean up and name the release steps.' },
      discard: { type: 'boolean', description: 'With finish: delete the untracked and git-ignored files in the worktree that finish would otherwise stop on (it lists them first).' },
      review: { type: 'string', description: 'Optional: text appended to the merged card as a ## Review section.' },
      reviewFile: { type: 'string', description: 'Optional: the absolute path of a file whose text is the ## Review section.' },
    },
    required: ['task'],
    additionalProperties: false,
  },
} as const

// ---- the verdict a merge needs ------------------------------------------------------------

export type VerdictRow = { verdict: string; next?: string; attempt?: number; sha?: string; kind?: string }

/**
 * The task's latest verdict row in the ledger text (main subtask). A reviewer's row that says
 * next=accept stands aside for the worker's row it reviewed; one that says anything else is the answer.
 */
export function latestVerdictRow(ledger: string, task: string): VerdictRow | undefined {
  const rows: VerdictRow[] = []
  for (const line of ledger.split('\n')) {
    if (line.trim() === '') continue
    let r: Record<string, unknown>
    try {
      r = JSON.parse(line) as Record<string, unknown>
    } catch {
      continue
    }
    if (!r || r.task !== task || typeof r.verdict !== 'string') continue
    if (r.subtask !== undefined && r.subtask !== 'main') continue
    rows.push({ verdict: r.verdict, ...(typeof r.next === 'string' ? { next: r.next } : {}), ...(typeof r.attempt === 'number' ? { attempt: r.attempt } : {}), ...(typeof r.sha === 'string' ? { sha: r.sha } : {}), ...(typeof r.kind === 'string' ? { kind: r.kind } : {}) })
  }
  for (let i = rows.length - 1; i >= 0; i--) {
    const r = rows[i] as VerdictRow
    if (r.kind === 'review' && isAccept(r.next)) continue
    return r
  }
  return undefined
}

const isAccept = (next: string | undefined): boolean => next !== undefined && /^accept\b/.test(next.trim())

/** The one-line refusal when the latest verdict is not consistent with next=accept; undefined when it is. */
export function verdictRefusal(id: string, row: VerdictRow | undefined): string | undefined {
  if (!row) return `${id}: no verdict recorded; merge needs consistent/accept`
  const verdict = readVerdict(row.verdict)
  if (verdict === 'consistent' && isAccept(row.next)) return undefined
  return `${id}: last verdict is ${verdict} · next=${row.next ?? '(none)'}; merge needs consistent/accept`
}

// ---- the worktree and the main checkout --------------------------------------------------

/** The worktree `git worktree list --porcelain` shows on `agent/<domain>/<ID>` (never a -replay branch). */
export function worktreeOf(porcelain: string, id: string): { path: string; branch: string } | undefined {
  const want = new RegExp(`^refs/heads/(agent/[A-Za-z0-9_-]+/${id.replace(/[-]/g, '\\-')})$`)
  for (const block of porcelain.split(/\n\s*\n/)) {
    let path: string | undefined
    let branch: string | undefined
    for (const line of block.split('\n')) {
      if (line.startsWith('worktree ')) path = line.slice('worktree '.length).trim()
      const m = line.startsWith('branch ') ? want.exec(line.slice('branch '.length).trim()) : null
      if (m) branch = m[1]
    }
    if (path && branch) return { path, branch }
  }
  return undefined
}

/** The paths `git status --porcelain` lists; `trackedOnly` leaves out untracked (`??`) ones. */
export function statusPaths(porcelain: string, trackedOnly = false): string[] {
  return porcelain
    .split('\n')
    .filter(l => l.trim() !== '')
    .filter(l => !(trackedOnly && l.startsWith('??')))
    .map(l => l.slice(3).trim())
}

// ---- MOD-142: what finish keeps for the brain to copy -----------------------------------------

/** Paths finish never counts as evidence: a folder entry (trailing slash) skips everything under it at any depth; a name skips that file at any depth; `.pyc` skips by suffix. */
export const FINISH_SKIP: readonly string[] = ['.delegation/', 'node_modules/', '.venv/', 'venv/', '__pycache__/', '.pytest_cache/', '.mypy_cache/', '.ruff_cache/', 'dist/', 'build/', 'coverage/', '.next/', '.turbo/', 'target/', '.cache/', '.DS_Store', '.pyc']

const skipped = (path: string): boolean => {
  const parts = path.split('/').filter(Boolean)
  const last = parts[parts.length - 1] ?? ''
  const isDir = path.endsWith('/')
  return FINISH_SKIP.some(e => {
    if (e.endsWith('/')) {
      const name = e.slice(0, -1)
      return parts.slice(0, isDir ? parts.length : parts.length - 1).includes(name)
    }
    return e.startsWith('.') && e !== '.DS_Store' ? last.endsWith(e) : last === e
  })
}

/** The `??` and `!!` paths of `git status --porcelain --ignored --untracked-files=all`, minus FINISH_SKIP. */
export function finishLeftovers(porcelain: string, only?: '??' | '!!'): string[] {
  const out: string[] = []
  for (const l of porcelain.split('\n')) {
    if (!(l.startsWith('?? ') || l.startsWith('!! '))) continue
    if (only && !l.startsWith(`${only} `)) continue
    let p = l.slice(3).trim()
    if (p.length >= 2 && p.startsWith('"') && p.endsWith('"')) p = p.slice(1, -1)
    if (p !== '' && !skipped(p)) out.push(p)
  }
  return out
}

/** Paths as listed: a top-level folder holding more than 3 of them becomes `<folder>/ (<k> files)`. */
export function collapseLeftovers(paths: readonly string[]): string[] {
  const count = new Map<string, number>()
  for (const p of paths) {
    const top = p.includes('/') ? p.slice(0, p.indexOf('/') + 1) : ''
    if (top) count.set(top, (count.get(top) ?? 0) + 1)
  }
  const out: string[] = []
  const done = new Set<string>()
  for (const p of paths) {
    const top = p.includes('/') ? p.slice(0, p.indexOf('/') + 1) : ''
    const k = top ? (count.get(top) ?? 0) : 0
    if (top && k > 3) {
      if (!done.has(top)) out.push(`${top} (${k} files)`)
      done.add(top)
    } else out.push(p)
  }
  return out
}

/** The stop answer: the count, the copy-first line, up to 20 listed entries and `… <m> more`. */
export function finishStopLines(id: string, worktree: string, paths: readonly string[]): string[] {
  const shown = collapseLeftovers(paths)
  return [
    `${id}: the worktree ${worktree} holds ${paths.length} untracked or ignored files the merge does not carry; copy what you need, then run /delegation merge ${id} --finish again, or add --discard to delete them:`,
    ...shown.slice(0, 20),
    ...(shown.length > 20 ? [`… ${shown.length - 20} more`] : []),
  ]
}

const listed = (paths: readonly string[]): string => (paths.length <= 3 ? paths.join(', ') : `${paths.slice(0, 3).join(', ')} and ${paths.length - 3} more`)

export const dirtyWorktreeLine = (id: string, worktree: string, paths: readonly string[]): string => `${id}: the worktree ${worktree} is not clean: ${listed(paths)}; commit or remove ${paths.length === 1 ? 'it' : 'them'} first`
export const mainBranchLine = (id: string, root: string, branch: string, want: string): string => `${id}: the main checkout ${root} is on ${branch || '(no branch)'}, not ${want}; switch it to ${want} first`
export const mainDirtyLine = (id: string, root: string, paths: readonly string[]): string => `${id}: the main checkout ${root} has tracked changes: ${listed(paths)}; commit or stash them first (untracked files are fine)`
export const noWorktreeLine = (id: string): string => `${id}: no worktree on agent/<domain>/${id}; nothing to merge`
export const conflictLine = (id: string, baseRef: string, files: readonly string[]): string => `${id}: rebase onto ${baseRef} conflicts in ${files.length > 0 ? files.join(', ') : '(git named no file)'}; resolve by hand`

/** The default branch the base names: `origin/main` → `main`. */
export const defaultBranchOf = (baseRef: string): string => {
  const b = baseRef.trim() || 'origin/main'
  return b.startsWith('origin/') ? b.slice('origin/'.length) : b
}

/**
 * MOD-118 (#186): the branch merge targets. `baseRef` is the repo config's value ('' = unset), `isBranch` says
 * whether origin has a branch of that name. A baseRef that names a branch (with or without `origin/`) is the
 * target; unset, a sha, or a tag keeps the default branch, and `note` says so for the set-but-not-a-branch cases.
 */
export function mergeTarget(baseRef: string, isBranch: boolean): { baseRef: string; def: string; note?: string } {
  const raw = baseRef.trim()
  if (!raw) return { baseRef: 'origin/main', def: 'main' }
  const name = defaultBranchOf(raw)
  if (isBranch) return { baseRef: `origin/${name}`, def: name }
  return { baseRef: 'origin/main', def: 'main', note: `baseRef ${raw} is not a branch; merging onto main` }
}

/** `owner/repo` from origin's url (GitHub ssh or https); undefined for anything else. */
export function ownerRepoOf(url: string): string | undefined {
  const u = url.trim()
  const m = /^(?:git@github\.com:|ssh:\/\/git@github\.com\/|https:\/\/github\.com\/)([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+?)(?:\.git)?\/?$/.exec(u)
  return m ? `${m[1]}/${m[2]}` : undefined
}

// ---- the merged card ---------------------------------------------------------------------

/** The card with `status: merged` in its front matter, and a `## Review` section appended when one is given. */
export function markMerged(card: string, review?: string): string {
  const lines = card.split('\n')
  if (lines[0]?.trim() === '---') {
    const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
    if (end > 0) {
      const at = lines.findIndex((l, i) => i > 0 && i < end && /^status\s*:/.test(l))
      if (at > 0) lines[at] = 'status: merged'
      else lines.splice(end, 0, 'status: merged')
    }
  }
  let out = lines.join('\n')
  if (review !== undefined && review.trim() !== '') out = `${out.replace(/\s*$/, '')}\n\n## Review\n\n${review.trim()}\n`
  return out
}

/** Does this card text read `status: merged` in its front matter? */
export function readsMerged(card: string): boolean {
  const lines = card.split('\n')
  if (lines[0]?.trim() !== '---') return false
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  return lines.slice(1, end > 0 ? end : undefined).some(l => /^status\s*:\s*merged\s*$/.test(l.trim()))
}


/** `Co-Authored-By: Claude <model name> <noreply@anthropic.com>` from the host's model id; undefined when the id cannot be named. */
export function coAuthorTrailer(modelId: string | undefined): string | undefined {
  if (!modelId) return undefined
  const name = modelName(modelId)
  if (name === modelId) return undefined
  return `Co-Authored-By: Claude ${name} <noreply@anthropic.com>`
}

/** The commit argv for the merged card. */
export function commitArgv(worktree: string, id: string, trailer: string | undefined): string[] {
  return ['git', '-C', worktree, 'commit', '-q', '-m', mergedSubject(id), ...(trailer ? ['-m', trailer] : [])]
}

/**
 * The root card and the merged card on origin, compared with the `status:` line aside and the merged
 * card's trailing `## Review` section allowed as extra: empty when they match, else the lines that differ.
 */
export function cardDiff(origin: string, root: string): string[] {
  const norm = (t: string, dropReview: boolean): string[] => {
    let lines = t.replace(/\r\n/g, '\n').split('\n').filter(l => !/^status\s*:/.test(l))
    if (dropReview) {
      const at = lines.findIndex(l => /^##\s+Review\s*$/.test(l.trim()))
      if (at >= 0) lines = lines.slice(0, at)
    }
    while (lines.length > 0 && (lines[lines.length - 1] as string).trim() === '') lines.pop()
    return lines
  }
  const rootHasReview = /^##\s+Review\s*$/m.test(root)
  const a = norm(origin, !rootHasReview)
  const b = norm(root, false)
  const out: string[] = []
  const n = Math.max(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] === b[i]) continue
    if (b[i] !== undefined) out.push(`- ${b[i]}`)
    if (a[i] !== undefined) out.push(`+ ${a[i]}`)
  }
  return out
}

/** MOD-86: the first-line clause when the card is git-ignored: the root card is the only copy, marked merged in place. */
export const cardKeptLocalClause = (rootCardPath: string): string => `card kept local (git-ignored): ${rootCardPath} marked merged`

/** MOD-86: --finish for an ignored card cannot find the head on origin: the line names the head. */
export const notLandedIgnoredLine = (id: string, branch: string, head: string, def: string): string => `${id}: ${branch} (head ${head.slice(0, 10)}) is not in origin/${def} yet; nothing was removed`

// ---- the version a merge releases --------------------------------------------------------

export const VERSION_FILE = 'hooks/lib/version.ts'

/** MOD_VERSION from hooks/lib/version.ts's text. */
export function versionOf(text: string | undefined): string | undefined {
  const m = /MOD_VERSION\s*=\s*['"]([0-9]+\.[0-9]+\.[0-9]+[A-Za-z0-9.-]*)['"]/.exec(text ?? '')
  return m ? m[1] : undefined
}

/** Did the diff `--name-only` list change the version file? */
export const touchesVersion = (names: string): boolean => names.split('\n').some(l => l.trim() === VERSION_FILE)

// ---- the PR body and the two blocks ------------------------------------------------------

export const GENERATED = '🤖 Generated with [Claude Code](https://claude.com/claude-code)'

export type GateResult = { id: string; label: string; ok: boolean }

/** Absolute paths out: each named folder becomes relative (or `.`), and any home folder left becomes `~`. */
export function scrubPaths(text: string, folders: readonly string[]): string {
  let out = text
  for (const f of [...folders].filter(Boolean).sort((x, y) => y.length - x.length)) {
    const d = f.replace(/\/+$/, '')
    out = out.split(`${d}/`).join('').split(d).join('.')
  }
  return out.replace(/\/(?:Users|home)\/[^/\s`'")]+/g, '~')
}

/** The Done-when statements as a checklist: list items become `- [x] …`, their continuation lines kept. */
export function doneChecklist(body: string): string[] {
  const lines = doneWhenOf(body)
  while (lines.length > 0 && (lines[0] as string).trim() === '') lines.shift()
  while (lines.length > 0 && (lines[lines.length - 1] as string).trim() === '') lines.pop()
  return lines.map(l => l.replace(/^(\s*)(?:[-*+]|\d+[.)])\s+(?!\[[ xX]\])/, '$1- [x] '))
}

/** pr.md: the Done-when checklist, the verdict line, the gate results, the trailing generated line. No absolute path survives. */
export function prBody(o: { body: string; verdictLine: string; gates: readonly GateResult[]; folders: readonly string[]; amends?: readonly string[]; issue?: number }): string {
  const done = doneChecklist(o.body)
  const text = [
    '## Done when',
    '',
    ...(done.length > 0 ? done : ['- [x] (the card has no Done when section)']),
    '',
    ...((o.amends ?? []).length > 0 ? ['## Amends', '', ...(o.amends ?? []).map(a => `- ${a}`), ''] : []),
    '## Verdict',
    '',
    o.verdictLine,
    '',
    '## Gates',
    '',
    ...(o.gates.length > 0 ? o.gates.map(g => `- ${g.id} (\`${g.label}\`): ${g.ok ? 'pass' : 'fail'}`) : ['- (the card names no gate)']),
    '',
    ...(o.issue !== undefined ? [`Refs #${o.issue}`, ''] : []),
    GENERATED,
    '',
  ].join('\n')
  return scrubPaths(text, o.folders)
}

/** MOD-189: a card's `issue:` or `parent:` value as an issue number: a whole number 1 or more, else undefined. */
export const issueRef = (v: unknown): number | undefined => {
  const t = typeof v === 'number' ? String(v) : typeof v === 'string' ? v.trim() : ''
  return /^[1-9]\d*$/.test(t) ? Number(t) : undefined
}

/** MOD-171: one amend block as the merge lists it: its ops and reason. */
export const amendSummary = (a: { ops: readonly string[]; reason: string }): string => `${a.ops.join(' ')} (${a.reason})`

/** MOD-171: the line merge prints for each amend the brief carried. */
export const amendMergeLine = (a: { ops: readonly string[]; reason: string }): string => `amend: ${amendSummary(a)} — check these paths in the diff`

/** A word for a shell line: as it is when plain, else single-quoted. */
export const shellWord = (s: string): string => (/^[A-Za-z0-9_./:@%+=,-]+$/.test(s) ? s : `'${s.split("'").join("'\\''")}'`)

/** The fenced block of lines for the brain to run verbatim, as the dispatch tool prints its spawn block. */
export const remoteBlock = (lead: string, lines: readonly string[]): string => [lead, '```sh', ...lines, '```'].join('\n')

export function pushLines(o: { worktree: string; branch: string; ownerRepo: string; defaultBranch: string; title: string; prFile: string; id: string }): string[] {
  return [
    `git -C ${o.worktree} push -u origin ${o.branch}`,
    `gh pr create --repo ${o.ownerRepo} --base ${o.defaultBranch} --head ${o.branch} --title ${shellWord(o.title)} --body-file ${o.prFile}`,
    `gh pr merge --repo ${o.ownerRepo} ${o.branch} --rebase`,
    `/delegation merge ${o.id} --finish`,
  ]
}

/** MOD-195: the sub-issues in `gh issue view --json subIssues` output (a nodes object or a plain array); undefined when unparsable. */
export function siblingsOf(stdout: string): { number: number; state: string }[] | undefined {
  let j: { subIssues?: unknown }
  try {
    j = JSON.parse(stdout) as { subIssues?: unknown }
  } catch {
    return undefined
  }
  const v = j?.subIssues
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { nodes?: unknown }).nodes) ? (v as { nodes: unknown[] }).nodes : undefined
  if (!list) return undefined
  const out: { number: number; state: string }[] = []
  for (const s of list) {
    const o = s as { number?: unknown; state?: unknown } | null
    if (o && typeof o.number === 'number') out.push({ number: o.number, state: typeof o.state === 'string' ? o.state : '' })
  }
  return out.length > 0 ? out : undefined
}

export function finishLines(o: { branch: string; version?: string; loadedClone?: string; issue?: number; parent?: number; ownerRepo?: string; pr?: number; sha?: string; /** MOD-195: the parent's sub-issues as read; absent = the hand-check comment. */ siblings?: readonly { number: number; state: string }[] }): string[] {
  const close =
    o.issue !== undefined && o.ownerRepo
      ? [`gh issue close ${o.issue} --repo ${o.ownerRepo} --comment ${shellWord(o.pr !== undefined ? `merged in #${o.pr}` : `merged at ${(o.sha ?? '').slice(0, 7)}`)}`]
      : []
  const open = (o.siblings ?? []).filter(x => x.number !== o.issue && x.state.toUpperCase() !== 'CLOSED').map(x => x.number).sort((a, b) => a - b)
  const parent =
    o.issue !== undefined && o.parent !== undefined && o.ownerRepo
      ? o.siblings === undefined
        ? [`# parent #${o.parent}: gh issue view ${o.parent} --repo ${o.ownerRepo} --json subIssuesSummary; close it by hand when every task is done`]
        : open.length === 0
          ? []
          : [`# parent #${o.parent}: ${open.length} of ${o.siblings.length} tasks still open (${open.map(n => `#${n}`).join(', ')})`]
      : []
  const parentClose =
    o.issue !== undefined && o.parent !== undefined && o.ownerRepo && o.siblings !== undefined && open.length === 0
      ? [`gh issue close ${o.parent} --repo ${o.ownerRepo} --comment ${shellWord(`all ${o.siblings.length} tasks done`)}`]
      : []
  return [
    ...close,
    ...parentClose,
    `git push origin --delete ${o.branch}`,
    ...(o.version ? [`git tag -a v${o.version} -m v${o.version}`, `git push origin v${o.version}`, ...(o.loadedClone ? [`git -C ${o.loadedClone} pull --ff-only`] : [])] : []),
    ...parent,
  ]
}

/** The last `n` lines of a command's output. */
export function lastLines(stdout: string, stderr: string, n = 20): string[] {
  const lines = `${stdout}\n${stderr}`.split('\n').map(l => l.replace(/\s+$/, ''))
  while (lines.length > 0 && lines[lines.length - 1] === '') lines.pop()
  return lines.filter((l, i) => !(l === '' && i === 0)).slice(-n)
}

/** The rebased twin of a commit on the default branch: same tree, same subject. `log` is `%H\t%T\t%s` lines. */
export function twinIn(log: string, tree: string, subject: string): string | undefined {
  for (const line of log.split('\n')) {
    const [sha, t, ...s] = line.split('\t')
    if (sha && t === tree && s.join('\t') === subject) return sha
  }
  return undefined
}

// ---- STATUS: what this session merged ----------------------------------------------------

export type MergedEntry = { task: string; sha: string; version?: string; at: number }

export function mergedLines(list: readonly MergedEntry[]): string[] {
  if (list.length === 0) return []
  return ['merged:', ...list.map(m => `- ${m.task} at ${m.sha.slice(0, 10)}${m.version ? ` (v${m.version})` : ''}`)]
}

/** Does a running/pending label (`MOD-1`, `MOD-1/sub`, `MOD-1 (repo)`) name a merged task? */
export const labelIsMerged = (label: string, merged: readonly MergedEntry[]): boolean => {
  const task = label.split(/[/\s]/)[0] ?? label
  return merged.some(m => m.task === task)
}
