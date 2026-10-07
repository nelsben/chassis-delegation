// Part 5A: native verification. Replaces chassis/bin/dispatch-verify.sh with
// read-only git in the worker's OWN worktree, keeping that script's claims,
// their wording and its verdict rule:
//
//   verified   — every claim checked and held (the only verdict that means "done")
//   unverified — a claim could not be checked — NOT a pass
//   refuted    — a claim was contradicted (a fabricated sha, an out-of-scope
//                diff, gate=pass over a red gate)
//   refused    — the brief itself is unusable (no scope= at all, a bad base=);
//                nothing runs, and it is never charged to the worker
//
// The claims, in order: branch, sha, scope, files, gate, red, pr. The gate
// re-runs in the worker's worktree (never a fresh checkout, so no per-verdict
// install) once HEAD is the reported sha and the tree is clean. `red` (GH-20)
// reads the file the report's red= names in that tree, through the
// injected `readRed`. Every command goes through the injected `exec`, which in
// the mod is the allowlisted `run()`.
//
// GH-16, `repo=here`: the worker shared the session's own checkout, so there is
// no worktree and maybe no commit. The branch is the checkout's current one;
// sha=HEAD (or none) takes the delta from `git status` (staged, unstaged,
// untracked; a rename as its new path), a real sha from merge-base(base, sha);
// the brief's ignore= globs and the files other in-flight cards claimed are
// subtracted, each disclosed on an `ignored:` line; and the gate runs on the
// tree as it stands (the clean-tree rule does not apply).
//
// GH-1 item 2, cardless: an ad hoc spawn (no header, no brief file) that
// hands back a report. The git claims are checked without a brief (branch,
// sha, files= against the delta, pr); scope, gate and red have nothing to be
// checked against and are unchecked, so a cardless verdict is refuted or
// unverified, never verified. No files.txt is written and no gate runs.
// Pure apart from `io`: no `$`.
import { effectiveList, parseAmends, parseHeader, type Report } from './brief'
import { resolveGateRuns, type GateResolution } from './gates'
import { isGitRef } from './repoconfig'

export type ExecOut = { ok: true; exitCode: number; stdout: string; stderr: string } | { ok: false; why: string }
export type NativeIo = {
  exec: (argv: readonly string[], init?: { cwd?: string; timeoutMs?: number }) => Promise<ExecOut>
  /** Writes files.txt (the changed paths, one a line) before the gate runs: a gate may read it as {files}. */
  write: (path: string, text: string) => Promise<void>
  /** Reads the red evidence at an absolute path inside the worker's tree (GH-20); absent, a named file is unchecked. */
  readRed?: (path: string) => Promise<RedEvidence>
}

export type NativeInput = {
  /** The worker's worktree. */
  repo: string
  report: Report
  /** The whole brief file: its header and any amend blocks appended to it. */
  briefText: string
  gateMap: Readonly<Record<string, string>>
  /** The allowlist, for a brief `gate=` written as a bare command. */
  allowed?: (argv: readonly string[]) => boolean
  filesPath: string
  /** A replay's base commit: the delta is taken from it instead of origin/main. */
  base?: string
  /** GH-16: the config's baseRef, the base when the brief names no base= ('' = the BASE_REFS chain). */
  baseRef?: string
  /** GH-16: repo=here, `repo` is the shared checkout (the session root), not a worktree. */
  here?: boolean
  /** GH-16, repo=here: the config's ignore globs, subtracted with the brief's ignore=. */
  ignore?: readonly string[]
  /** GH-16, repo=here: the files= other in-flight cards claimed, subtracted from the delta. */
  others?: readonly { card: string; files: readonly string[] }[]
  gateTimeoutMs?: number
  /** The red hashes of this task + subtask's earlier attempts (AttemptRecord.redHash). */
  priorRed?: readonly RedPrior[]
  /** GH-1 item 2: no brief at all; `briefText` is ignored (see verifyCardless). */
  cardless?: boolean
}

/** The reason a cardless verify gives for the claims only a brief can check. */
export const NO_BRIEF_REASON = 'no brief: no scope=/gate=/red_test= to check against'


export type NativeVerdict = 'verified' | 'unverified' | 'refuted' | 'refused'
export type NativeResult = {
  verdict: NativeVerdict
  lines: string[]
  /** The red file read for this attempt: its red= path as written, and its hash, for the attempt record. */
  red?: { path: string; hash?: string }
}

/** What the mod read at a report's red= path (register.ts, through `$.fs`). */
export type RedEvidence = {
  exists: boolean
  /** The file's size in bytes. */
  bytes?: number
  text?: string
  /** sha-256 of the bytes, hex; absent when it could not be taken. */
  hash?: string
  /** Why a file that exists could not be read. */
  error?: string
}

/** An earlier attempt's red hash, same task and subtask. */
export type RedPrior = { attempt: number; hash: string }

export type RedClaimInput = RedEvidence & {
  /** The brief's red_test=, as written. */
  redTest?: string
  /** The report's red=, as written. */
  path?: string
  /** The worker's tree: a relative red= lies under it, an absolute one must. */
  repo: string
  priorHashes?: readonly RedPrior[]
}

export type RedClaim = { status: 'held' | 'failed' | 'unchecked'; detail: string }

/** Where the branch delta starts, first that resolves: the remote default branch, then the local one. */
export const BASE_REFS = ['origin/main', 'main', 'origin/master', 'master'] as const

export const GATE_OUTPUT_LINES = 8
const DEFAULT_GATE_TIMEOUT_MS = 9 * 60 * 1000
const GIT_TIMEOUT_MS = 30 * 1000

const csv = (v: string | undefined): string[] => (v ?? '').split(',').map(s => s.trim()).filter(s => s !== '')

const escapeRe = (s: string) => s.replace(/[.+^${}()|\\]/g, '\\$&')

/**
 * The chassis verifier's matcher (bash `case`): `*` matches anything, `/`
 * included, so `**` is `*`; `?` one character; `[…]` a class; a glob ending in
 * `/` means everything under that folder.
 */
export function globMatches(path: string, glob: string): boolean {
  const g = glob.endsWith('/') ? `${glob}*` : glob
  let re = ''
  for (let i = 0; i < g.length; i += 1) {
    const c = g[i] as string
    if (c === '*') re += '.*'
    else if (c === '?') re += '.'
    else if (c === '[') {
      const close = g.indexOf(']', i + 2)
      if (close < 0) re += '\\['
      else {
        const body = g.slice(i + 1, close).replace(/^!/, '^').replace(/\\/g, '\\\\')
        re += `[${body}]`
        i = close
      }
    } else re += escapeRe(c)
  }
  return new RegExp(`^${re}$`, 's').test(path)
}

export const pathMatchesAny = (path: string, globs: readonly string[]): boolean => globs.some(g => g !== '' && globMatches(path, g))

export type BriefContract =
  | { ok: true; scope: string[]; scopeProse?: true; forbid: string[]; ignore: string[]; base?: string; gate?: string; redTest?: string; lines: string[]; amendBad?: true; amendWhy?: string; amendments: number }
  | { ok: false; line: string }

/** True when a scope= reads as prose: two or more words and no entry shaped like a path or glob. */
function scopeIsProse(raw: string): boolean {
  const words = raw.split(/\s+/).filter(Boolean).length
  const pathlike = raw.split(',').map(e => e.trim()).filter(e => e !== '' && !/\s/.test(e) && /[/.*]/.test(e)).length
  return words >= 2 && pathlike === 0
}

/**
 * The brief's effective contract: scope (or scope_globs=) and forbid (or
 * forbid_globs=) ± its amend blocks in file order, each disclosed; or the
 * refusal line when the brief cannot be used.
 */
export function briefContract(briefText: string): BriefContract {
  const header = parseHeader(briefText)
  if (!header) return { ok: false, line: 'refuse: BRIEF-UNPARSEABLE — no closing ]] found in the brief header; cannot determine scope=/forbid= — refusing rather than silently refuting every path.' }
  const f = header.fields
  if (f.scope === undefined) {
    return { ok: false, line: 'refuse: BRIEF-UNPARSEABLE — the brief header carries no scope= field; cannot determine scope=/forbid= — refusing rather than silently refuting every path.' }
  }
  const globs = csv(f.scope_globs)
  // GH-103: a prose scope degrades the scope claim to unchecked; the rest of the brief still verifies
  const scopeProse = globs.length === 0 && f.scope !== '' && scopeIsProse(f.scope)
  const scope = globs.length > 0 ? globs : scopeProse ? [] : csv(f.scope)
  const forbidGlobs = csv(f.forbid_globs)
  const forbid = forbidGlobs.length > 0 ? forbidGlobs : csv(f.forbid)
  const ignore = csv(f.ignore)
  const base = (f.base ?? '').trim()
  if (base !== '' && !isGitRef(base)) {
    return { ok: false, line: `refuse: BRIEF-BAD-BASE — base= ("${base.slice(0, 60)}") is not a git ref; name a branch, HEAD or a sha.` }
  }
  const gate = header.gate
  const redTest = f.red_test !== undefined ? { redTest: f.red_test } : {}
  const amends = parseAmends(briefText)
  if (amends.malformed !== undefined) {
    return {
      ok: true,
      scope,
      ...(scopeProse ? { scopeProse: true as const } : {}),
      forbid,
      ignore,
      ...(base ? { base } : {}),
      ...(gate ? { gate } : {}),
      ...redTest,
      amendments: 0,
      amendBad: true,
      amendWhy: amends.malformed,
      lines: [`amendment: REFUSED — AMEND-MALFORMED: ${amends.malformed}. No amendment is applied; the brief header stands and the scope claim is left UNCHECKED (a malformed amendment is never a silent pass).`],
    }
  }
  return {
    ok: true,
    scope: csv(effectiveList(scope.join(','), amends.amends, 'scope')),
    ...(scopeProse ? { scopeProse: true as const } : {}),
    forbid: csv(effectiveList(forbid.join(','), amends.amends, 'forbid')),
    ignore: csv(effectiveList(ignore.join(','), amends.amends, 'ignore')),
    ...(base ? { base } : {}),
    ...(gate ? { gate } : {}),
    ...redTest,
    amendments: amends.amends.length,
    lines: amends.amends.map((a, i) => `amendment: #${i + 1} ${a.ops.join(' ')} — reason: ${a.reason}`),
  }
}

/** The files claim: the report's files= against the sha's delta, as sets; a difference names each path.
 *  An entry ending in `/` stands for every delta path under that folder; a folder with none under it is an invented path.
 *  `what` names the delta in the held line (repo=here with sha=HEAD: the dirty-tree delta). */
export function filesClaim(claimed: readonly string[], actual: readonly string[], what = 'the sha delta', renamedFrom: readonly string[] = []): string {
  const have = new Set(actual)
  const want = new Set<string>()
  let expanded = 0
  let collapsed = 0
  for (const c of claimed) {
    // GH-102: the old path of a detected rename is not in the delta; a worker that lists it too is not refuted
    if (renamedFrom.includes(c) && !have.has(c)) { collapsed++; continue }
    if (!c.endsWith('/')) { want.add(c); continue }
    const under = actual.filter(p => p.startsWith(c))
    if (under.length === 0) { want.add(c); continue }
    expanded++
    for (const p of under) want.add(p)
  }
  const omits = [...have].filter(p => !want.has(p)).sort()
  const invents = [...want].filter(p => !have.has(p)).sort()
  if (omits.length === 0 && invents.length === 0) {
    const notes = [
      ...(expanded ? [`${expanded} folder ${expanded === 1 ? 'entry' : 'entries'} expanded`] : []),
      ...(collapsed ? [`${collapsed} rename${collapsed === 1 ? '' : 's'} collapsed`] : []),
    ]
    const note = notes.length ? ` (${notes.join(', ')})` : ''
    return `claim files: held — files= matches ${what} exactly${note}`
  }
  const named = [...(omits.length ? [`omits ${omits.join(', ')}`] : []), ...(invents.length ? [`invents ${invents.join(', ')}`] : [])].join('; ')
  return `claim files: failed — files= does not match the actual delta (omits or invents a path): ${named}`
}

/**
 * GH-102: the paths `git diff --name-status -M` names, each once, in its order. A
 * rename (`R<score>\told\tnew`) is its new path; its old path is returned apart.
 */
export function nameStatusDelta(stdout: string): { paths: string[]; renamedFrom: string[] } {
  const paths: string[] = []
  const renamedFrom: string[] = []
  for (const line of stdout.split('\n')) {
    const cols = line.replace(/\r$/, '').split('\t')
    if (cols.length < 2 || cols[0] === '') continue
    const renamed = /^[RC]/.test(cols[0] as string) && cols.length >= 3
    const path = (renamed ? cols[2] : cols[1]) as string
    if (renamed) renamedFrom.push(cols[1] as string)
    if (path.trim() !== '' && !paths.includes(path)) paths.push(path)
  }
  return { paths, renamedFrom }
}

/** GH-16: `git status` for a repo=here delta: staged, unstaged and every untracked file, NUL-separated. */
export const STATUS_ARGS = ['status', '--porcelain=v1', '--untracked-files=all', '-z'] as const

/**
 * The paths `git status --porcelain=v1 -z` names, in its order, each once. A
 * rename or copy is its new path (with -z the entry is `XY new`, then the old
 * path as an entry of its own, which is skipped).
 */
export function porcelainPaths(stdout: string): string[] {
  const parts = stdout.split('\0')
  const out: string[] = []
  for (let i = 0; i < parts.length; i += 1) {
    const entry = parts[i] as string
    if (entry.length < 4) continue
    const xy = entry.slice(0, 2)
    const path = entry.slice(3)
    if (/[RC]/.test(xy)) i += 1
    if (path !== '' && !out.includes(path)) out.push(path)
  }
  return out
}

export type Subtracted = { kept: string[]; ignored: string[]; byCard: { card: string; paths: string[] }[] }

/** A path a card's files= names: the path itself, or a folder entry (`dir/`) above it. */
const claims = (files: readonly string[], path: string): boolean => files.some(f => f === path || (f.endsWith('/') && path.startsWith(f)))

/**
 * GH-16: a repo=here delta less the ignore globs, then less the files other
 * in-flight cards claimed (a path goes to the first card that names it).
 */
export function subtractDelta(delta: readonly string[], ignore: readonly string[], others: readonly { card: string; files: readonly string[] }[]): Subtracted {
  const out: Subtracted = { kept: [], ignored: [], byCard: others.map(o => ({ card: o.card, paths: [] })) }
  for (const path of delta) {
    if (pathMatchesAny(path, ignore)) {
      out.ignored.push(path)
      continue
    }
    const at = others.findIndex(o => claims(o.files, path))
    if (at >= 0) out.byCard[at]?.paths.push(path)
    else out.kept.push(path)
  }
  return out
}

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`
const IGNORED_SHOWN = 5

/** `ignored: <n> paths by ignore= (…), <m> paths belonging to <CARD> (…), …`: every subtraction, the paths named (5 a group at most). */
export function ignoredLine(s: Subtracted): string {
  const named = (paths: readonly string[]) =>
    paths.length === 0 ? '' : ` (${paths.slice(0, IGNORED_SHOWN).join(', ')}${paths.length > IGNORED_SHOWN ? `, +${paths.length - IGNORED_SHOWN} more` : ''})`
  const parts = [
    `${plural(s.ignored.length, 'path')} by ignore=${named(s.ignored)}`,
    ...s.byCard.filter(c => c.paths.length > 0).map(c => `${plural(c.paths.length, 'path')} belonging to ${c.card}${named(c.paths)}`),
  ]
  return `ignored: ${parts.join(', ')}`
}

/** pr= → the PR number; undefined for none; null for anything that names no PR. */
export function prNumber(v: string | undefined): string | undefined | null {
  const s = (v ?? '').trim()
  if (s === '' || /^none$/i.test(s)) return undefined
  if (/^\d+$/.test(s)) return s
  const m = /\/pull\/(\d+)(?:[/?#].*)?$/.exec(s)
  return m ? (m[1] as string) : null
}

const SHA_LIKE = /^[0-9a-fA-F]{4,40}$/
const BRANCH_LIKE = /^[A-Za-z0-9._/-]+$/

/** True when the brief asks for red evidence: a red_test= neither empty nor `none` (`none (docs only)` is none). */
export const briefWantsRed = (redTest: string | undefined): boolean => {
  const s = (redTest ?? '').trim()
  return s !== '' && !/^none(?![\w./-])/i.test(s)
}

/** red= names nothing: absent, empty or `none`. */
const redUnnamed = (path: string | undefined): boolean => {
  const s = (path ?? '').trim()
  return s === '' || /^none$/i.test(s)
}

/**
 * Where a red= path lands: inside the worker's tree (`abs`), or outside it. A
 * relative path lies under the tree; an absolute one must lie in it; a `..`
 * segment is outside either way.
 */
export function redTarget(path: string, repo: string): { abs: string } | { outside: true } {
  const p = path.trim()
  const root = repo.replace(/\/+$/, '')
  if (p.split('/').includes('..')) return { outside: true }
  if (p.startsWith('/')) return p.startsWith(`${root}/`) ? { abs: p } : { outside: true }
  return { abs: `${root}/${p.replace(/^(\.\/)+/, '')}` }
}

/**
 * A red file's failure markers, any one suffices, case-insensitive: fail
 * (failed, failing), error (AssertionError), not ok, ✗, exit code 1-9,
 * exit 1, expected (Expected).
 */
export const RED_MARKER = /fail|error|not ok|\u2717|exit code [1-9]|exit 1|expected/i

/** The first failure line a held red claim quotes is cut to this many characters. */
export const RED_LINE_CAP = 100

/**
 * The red claim (GH-20): the file the report's red= names holds the red
 * test's failing output, in the worker's tree, fresh for this attempt. No
 * claim when the brief has no red test; no red= is unchecked (never refuted).
 */
export function redClaim(i: RedClaimInput): RedClaim | undefined {
  if (!briefWantsRed(i.redTest)) return undefined
  if (redUnnamed(i.path)) return { status: 'unchecked', detail: "no red= evidence named; the brief asks for the red test's failing output" }
  const path = (i.path ?? '').trim()
  if ('outside' in redTarget(path, i.repo)) return { status: 'failed', detail: `red=${path} lies outside the worker's tree ${i.repo}` }
  if (!i.exists) return { status: 'failed', detail: `red=${path} does not exist in the worker's tree` }
  if (i.error !== undefined || i.text === undefined) return { status: 'unchecked', detail: `red=${path} could not be read: ${i.error ?? 'no text came back'}` }
  const bytes = i.bytes ?? i.text.length
  if (bytes === 0 || i.text.trim() === '') return { status: 'failed', detail: `red=${path} is empty` }
  const line = i.text.split(/\r?\n/).find(l => RED_MARKER.test(l))
  if (line === undefined) return { status: 'unchecked', detail: `no failure marker found in red=${path} (${bytes} bytes)` }
  const priors = i.priorHashes ?? []
  if (i.hash !== undefined) {
    const same = priors.filter(p => p.hash === i.hash).sort((a, b) => a.attempt - b.attempt)[0]
    if (same) return { status: 'failed', detail: `red evidence is attempt ${same.attempt}'s file again (red=${path} is byte-identical to it)` }
  } else if (priors.length > 0) {
    return { status: 'unchecked', detail: `red=${path} could not be hashed, so whether it is this attempt's own is unknown` }
  }
  return { status: 'held', detail: `${path}, ${bytes} bytes, first failure line: ${line.trim().slice(0, RED_LINE_CAP)}` }
}

/** The last lines a gate printed (stdout then stderr), for under a failed gate claim. */
function outputTail(stdout: string, stderr: string): string[] {
  const all = `${stdout}\n${stderr}`.split('\n').map(l => l.trimEnd()).filter(l => l.trim() !== '')
  const tail = all.slice(-GATE_OUTPUT_LINES)
  return tail.length > 0 ? tail.map(l => `  | ${l.trim()}`) : ['  gate output not available']
}

/**
 * GH-1 item 2: a report with no brief behind it, verified for what git
 * can say alone (branch, sha, files, pr) in `repo`, the spawn's cwd or the
 * session root. Scope, gate and red are unchecked with NO_BRIEF_REASON.
 */
export function verifyCardless(input: { repo: string; report: Report; baseRef?: string }, io: Pick<NativeIo, 'exec'>): Promise<NativeResult> {
  return verifyNative(
    { repo: input.repo, report: input.report, briefText: '', gateMap: {}, filesPath: '', cardless: true, ...(input.baseRef ? { baseRef: input.baseRef } : {}) },
    { exec: io.exec, write: async () => undefined },
  )
}

const CARDLESS_CONTRACT: BriefContract = { ok: true, scope: [], forbid: [], ignore: [], lines: [], amendments: 0 }

export async function verifyNative(input: NativeInput, io: NativeIo): Promise<NativeResult> {
  const cardless = input.cardless === true
  const contract = cardless ? CARDLESS_CONTRACT : briefContract(input.briefText)
  if (!contract.ok) return { verdict: 'refused', lines: [contract.line] }
  const { repo, report } = input
  const here = input.here === true
  const lines = [...contract.lines]
  let anyFailed = false
  let anyUnchecked = false
  const claim = (name: string, status: 'held' | 'failed' | 'unchecked', detail: string) => {
    lines.push(`claim ${name}: ${status} — ${detail}`)
    if (status === 'failed') anyFailed = true
    if (status === 'unchecked') anyUnchecked = true
  }
  const git = (...args: string[]) => io.exec(['git', '-C', repo, ...args], { cwd: repo, timeoutMs: GIT_TIMEOUT_MS })
  const out = async (...args: string[]): Promise<string | undefined> => {
    const r = await git(...args)
    return r.ok && r.exitCode === 0 ? r.stdout : undefined
  }
  const firstLine = (s: string | undefined) => (s ?? '').split('\n')[0]?.trim() ?? ''

  const sha = (report.sha ?? '').trim()
  const branch = (report.branch ?? '').trim()
  // repo=here: sha=HEAD (or none) means "not committed: read the working tree"
  const treeSha = here && /^(?:HEAD|none)$/i.test(sha)
  const full = SHA_LIKE.test(sha) ? firstLine(await out('rev-parse', '--verify', '--quiet', `${sha}^{commit}`)) : ''
  let branchRef = ''
  if (!here && BRANCH_LIKE.test(branch) && !branch.startsWith('-') && !branch.includes('..')) {
    for (const ref of [`refs/heads/${branch}`, `refs/remotes/origin/${branch}`]) {
      if ((await out('rev-parse', '--verify', '--quiet', ref)) !== undefined) {
        branchRef = ref
        break
      }
    }
  }

  // 1. the branch exists (repo=here: it is the checkout's current branch)
  if (here) {
    const current = firstLine(await out('rev-parse', '--abbrev-ref', 'HEAD'))
    if (!current) claim('branch', 'unchecked', `could not read the current branch of ${repo}`)
    else if (branch === current) claim('branch', 'held', `${branch} is the current branch of ${repo}`)
    else claim('branch', 'unchecked', `report branch=${branch || '(none)'} but ${repo} is on ${current}`)
  } else if (branchRef) claim('branch', 'held', branchRef)
  else claim('branch', 'unchecked', `branch '${branch}' not found locally and remote unreachable/unknown`)

  // 2. the sha exists and is on the branch (a sha that does not exist is the fabrication case)
  if (treeSha) claim('sha', 'held', `sha=${sha}: the delta is the working tree (git status: staged, unstaged and untracked)`)
  else if (!full) claim('sha', 'failed', `sha '${sha}' does not exist in ${repo} (fabrication)`)
  else if (here) claim('sha', 'held', `${full.slice(0, 9)} resolves in ${repo}`)
  else if (branchRef) {
    const r = await git('merge-base', '--is-ancestor', full, branchRef)
    if (r.ok && r.exitCode === 0) claim('sha', 'held', `${full.slice(0, 9)} reachable on ${branch}`)
    else claim('sha', 'failed', `sha ${sha} exists but is NOT reachable on ${branch}`)
  } else claim('sha', 'unchecked', `sha exists but branch '${branch}' unresolved — cannot check reachability`)

  // the delta: the working tree (repo=here, sha=HEAD), else merge-base(sha, base) .. sha, where
  // base = a replay's base, else the brief's base=, else the config's baseRef, else the first of BASE_REFS
  let delta: string[] | undefined
  let renamedFrom: string[] = []
  let noDelta = 'could not establish the branch delta (sha/base missing)'
  // GH-105: the base the delta was taken from, named on the scope line (a sha as its short form)
  let sinceBase = ''
  if (treeSha) {
    const status = await out(...STATUS_ARGS)
    if (status !== undefined) delta = porcelainPaths(status)
    else noDelta = `could not read git status in ${repo}`
  } else if (full) {
    let base = input.base || contract.base || input.baseRef?.trim() || undefined
    if (!base) {
      for (const ref of BASE_REFS) {
        if ((await out('rev-parse', '--verify', '--quiet', ref)) !== undefined) {
          base = ref
          break
        }
      }
    }
    let mb = base ? firstLine(await out('merge-base', base, full)) : ''
    if (!mb && base && (await out('rev-parse', '--verify', '--quiet', base)) !== undefined) mb = base
    if (mb) {
      if (base) sinceBase = /^[0-9a-f]{40}$/i.test(base) ? base.slice(0, 7) : base
      const diff = await out('diff', '--name-status', '-M', mb, full)
      if (diff !== undefined) {
        const d = nameStatusDelta(diff)
        delta = d.paths
        renamedFrom = d.renamedFrom
      }
    }
  }
  // repo=here: the checkout is shared, so the brief's ignore= (± ignore+=), the config's ignore
  // and the files other in-flight cards claimed come off the delta, each disclosed
  if (here && delta) {
    const ignore = [...new Set([...contract.ignore, ...(input.ignore ?? [])])]
    const sub = subtractDelta(delta, ignore, input.others ?? [])
    delta = sub.kept
    lines.push(ignoredLine(sub))
  }
  const notes: string[] = []
  if (delta && !cardless) {
    try {
      await io.write(input.filesPath, delta.length > 0 ? `${delta.join('\n')}\n` : '')
    } catch (err) {
      notes.push(`note: files.txt not written: ${String(err)}`)
    }
  }

  // 3. the diff stays inside scope, forbid untouched
  if (cardless) claim('scope', 'unchecked', NO_BRIEF_REASON)
  else if (contract.scopeProse) claim('scope', 'unchecked', 'scope= reads as prose; add scope_globs= to the brief to check it')
  else if (contract.amendBad) {
    claim('scope', 'unchecked', `AMEND-MALFORMED: ${contract.amendWhy} — the EFFECTIVE scope is unknowable, so the diff is neither cleared nor refuted; fix the amend block and re-verify`)
  } else if (!delta) claim('scope', 'unchecked', noDelta)
  else {
    let bad: string | undefined
    for (const p of delta) {
      if (pathMatchesAny(p, contract.forbid)) bad = `touches forbid path: ${p}`
      else if (!pathMatchesAny(p, contract.scope)) bad = `out-of-scope path: ${p}`
      if (bad) break
    }
    if (bad) claim('scope', 'failed', bad)
    else {
      const amended = contract.amendments > 0 ? ` (effective scope: the brief header ± ${contract.amendments} disclosed amendment(s) above)` : ''
      claim('scope', 'held', `every changed path${sinceBase ? ` since ${sinceBase}` : ''} is within scope=[${contract.scope.join(',')}], forbid=[${contract.forbid.join(',')}] untouched${amended}`)
    }
  }

  // 4. files= is the delta, exactly
  if (!delta) claim('files', 'unchecked', treeSha ? `no delta to compare against (${noDelta})` : 'no delta to compare against (sha/base missing)')
  else {
    const line = filesClaim(csv(report.files).filter(f => f !== 'none'), delta, treeSha ? 'the dirty-tree delta' : 'the sha delta', renamedFrom)
    lines.push(line)
    if (line.startsWith('claim files: failed')) anyFailed = true
  }

  // 5. the gate, re-run in the worker's own worktree at the sha (an honest gate=fail is never punished);
  //    repo=here: in the shared checkout as it stands, uncommitted changes and all
  const gates: GateResolution = cardless ? { runs: [], notRerun: [] } : resolveGateRuns(contract.gate, input.gateMap, input.allowed ?? (() => false), input.filesPath, input.repo)
  if (cardless) claim('gate', 'unchecked', NO_BRIEF_REASON)
  else if (gates.none) claim('gate', 'unchecked', 'no gate command available (the brief has no gate=)')
  for (const n of gates.notRerun) claim('gate', 'unchecked', `gate not re-run: ${n.id} (${n.why})`)
  if (gates.runs.length > 0) {
    let treeWhy: string | undefined
    if (!full && !treeSha) treeWhy = 'sha missing — cannot re-run the gate'
    else if (!here) {
      const head = firstLine(await out('rev-parse', 'HEAD'))
      const status = await out('status', '--porcelain')
      const dirty = (status ?? '').split('\n').filter(l => l.trim() !== '').length
      if (!head) treeWhy = `tree not at sha: could not read HEAD in ${repo}; the gate was not re-run`
      else if (head !== full) treeWhy = `tree not at sha: HEAD is ${head.slice(0, 10)}, not ${full.slice(0, 10)}; the gate was not re-run`
      else if (status === undefined) treeWhy = `tree not at sha: git status failed in ${repo}; the gate was not re-run`
      else if (dirty > 0) treeWhy = `tree not at sha: ${dirty} uncommitted path${dirty === 1 ? '' : 's'} in the worktree; the gate was not re-run`
    }
    if (treeWhy) claim('gate', 'unchecked', treeWhy)
    else {
      let code = 0
      let tail: string[] = []
      let stopped: string | undefined
      for (const run of gates.runs) {
        const r = await io.exec(run.argv, { cwd: repo, timeoutMs: input.gateTimeoutMs ?? DEFAULT_GATE_TIMEOUT_MS })
        if (!r.ok) {
          stopped = `gate ${run.label} did not run: ${r.why}`
          break
        }
        if (r.exitCode === 126 || r.exitCode === 127) {
          stopped = `UNVERIFIABLE — environment not established: gate '${run.label}' exited ${r.exitCode} in the ${here ? 'shared checkout' : 'worker worktree'} (126/127 = command not found or not executable — this can also mean the gate command itself does not exist); neither held nor refuted, investigate`
          break
        }
        if (r.exitCode !== 0) {
          code = r.exitCode
          tail = outputTail(r.stdout, r.stderr)
          break
        }
      }
      const said = (report.gate ?? '').trim()
      const at = here ? `in the shared checkout ${repo}` : `at ${sha}`
      const hereNote = here ? '; repo=here: the dirty tree is allowed, the clean-tree rule does not apply' : ''
      if (stopped) claim('gate', 'unchecked', stopped)
      else if (said === 'pass') {
        if (code === 0) claim('gate', 'held', `gate green ${at} (gate=pass confirmed${hereNote})`)
        else {
          claim('gate', 'failed', `gate=pass claimed but the gate is RED ${at} (exit ${code}${hereNote})`)
          lines.push(...tail)
        }
      } else if (said === 'fail') {
        if (code !== 0) claim('gate', 'held', `gate=fail confirmed (gate red ${at}${hereNote}) — an honest terminal state`)
        else claim('gate', 'unchecked', 'gate=fail claimed but the gate is green — not a refutation, recorded')
      } else claim('gate', 'unchecked', `report gate='${said}' is not pass|fail`)
    }
  }

  // 6. the red evidence (GH-20): when the brief has a red test, red= names its failing output in this tree
  let red: NativeResult['red']
  if (cardless) claim('red', 'unchecked', NO_BRIEF_REASON)
  else if (briefWantsRed(contract.redTest)) {
    const named = (report.red ?? '').trim()
    let ev: RedEvidence = { exists: false }
    const target = redUnnamed(named) ? undefined : redTarget(named, repo)
    if (target && 'abs' in target) {
      if (!io.readRed) ev = { exists: true, error: 'the verifier has no file reader' }
      else {
        try {
          ev = await io.readRed(target.abs)
        } catch (err) {
          ev = { exists: true, error: String(err) }
        }
      }
      if (ev.exists && ev.text !== undefined) red = { path: named, ...(ev.hash !== undefined ? { hash: ev.hash } : {}) }
    }
    const c = redClaim({ ...ev, redTest: contract.redTest, path: named, repo, priorHashes: input.priorRed ?? [] })
    if (c) claim('red', c.status, c.detail)
  }

  // 7. the PR, when one is claimed, exists
  const pr = prNumber(report.pr)
  if (pr === undefined) claim('pr', 'held', 'no PR claimed')
  else if (pr === null) claim('pr', 'unchecked', `pr '${report.pr}' is not a PR number or a pull URL`)
  else {
    const r = await io.exec(['gh', 'pr', 'view', pr, '--json', 'state'], { cwd: repo, timeoutMs: GIT_TIMEOUT_MS })
    let state: string | undefined
    if (r.ok && r.exitCode === 0) {
      try {
        const parsed = JSON.parse(r.stdout) as { state?: unknown }
        state = typeof parsed.state === 'string' ? parsed.state : undefined
      } catch {
        state = undefined
      }
    }
    if (state) claim('pr', 'held', `PR #${pr} exists (${state})`)
    else claim('pr', 'unchecked', `gh could not resolve ${pr} (offline / auth / not found)`)
  }

  const verdict: NativeVerdict = anyFailed ? 'refuted' : anyUnchecked ? 'unverified' : 'verified'
  return { verdict, lines: [...lines, ...notes], ...(red ? { red } : {}) }
}
