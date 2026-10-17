// Part 3A: a task with no git repo. A brief whose header says `repo=none`, or
// names a folder that is not a git work tree, has no branch, sha or diff for
// the native verifier (./verify-native.ts) to read. The mod checks three things only:
// every `files=` path of the report exists under the brief's first scope
// root; no such path lies outside the scope (or inside a forbid); and the
// gate exits 0. The gate resolves as for any brief (./gates.ts
// resolveGateRuns): the gate map's command for the header's `gate=` id, or the
// `gate=` itself when it is a bare command the allowlist takes (`claude plugin
// validate <absolute folder>`). Pure: no `$`, no imports.
//
// MOD-22, research cards: the second half of this file is what a card whose
// outputs live outside the repo adds, for repo=none and repo=here alike: the
// outdir, the roots to list, the before-and-after outside delta, the artefacts
// claim and the report's metrics. The listing and the stat themselves are the
// caller's (they are `$.fs` calls); everything decided here is pure.

/** `git -C <dir> rev-parse --is-inside-work-tree`: on the allowlist (rev-parse). */
export const workTreeArgv = (dir: string): string[] => ['git', '-C', dir, 'rev-parse', '--is-inside-work-tree']

/** A folder git does not know (exit ≠ 0), or the inside of a .git folder (`false`). */
export const isNotWorkTree = (r: { exitCode: number; stdout: string }): boolean => r.exitCode !== 0 || r.stdout.trim() === 'false'

const GLOB_CHARS = /[*?[{]/

/** The folder before a glob's first glob character; a path with none is its own root. */
export function globRoot(glob: string): string {
  const at = glob.search(GLOB_CHARS)
  if (at < 0) return glob.replace(/\/+$/, '') || '/'
  const head = glob.slice(0, at)
  return head.slice(0, head.lastIndexOf('/')) || '/'
}

/** `//` and `/./` folded; a `..` segment makes the path unusable (undefined). */
export function normalizePath(path: string): string | undefined {
  const parts = path.split('/')
  if (parts.includes('..')) return undefined
  const kept = parts.filter((p, i) => p !== '.' && (p !== '' || i === 0))
  const out = kept.join('/')
  return path.startsWith('/') ? out || '/' : out
}

/** A report path made absolute: relative ones are read against the scope root. */
export function resolveFile(file: string, root: string): string | undefined {
  return normalizePath(file.startsWith('/') ? file : `${root.replace(/\/+$/, '')}/${file}`)
}

const escapeRe = (s: string) => s.replace(/[.+^${}()|[\]\\]/g, '\\$&')

/** `**` spans folders (and `/**` matches the folder itself), `*` stays in one, `?` is one character, `{a,b}` either. */
export function globToRegExp(glob: string): RegExp {
  let re = ''
  for (let i = 0; i < glob.length; i++) {
    const c = glob[i] as string
    if (c === '*') {
      if (glob[i + 1] === '*') {
        const slashAfter = glob[i + 2] === '/'
        const slashBefore = i > 0 && glob[i - 1] === '/'
        if (slashBefore && re.endsWith('\\/') && i + 2 === glob.length) {
          // `dir/**`: the folder itself or anything below it
          re = re.slice(0, -2) + '(?:\\/.*)?'
        } else if (slashAfter) {
          re += '(?:.*\\/)?'
          i += 1
        } else re += '.*'
        i += 1
      } else re += '[^/]*'
    } else if (c === '?') re += '[^/]'
    else if (c === '{') {
      const close = glob.indexOf('}', i)
      if (close < 0) re += '\\{'
      else {
        re += `(?:${glob.slice(i + 1, close).split(',').map(escapeRe).join('|')})`
        i = close
      }
    } else if (c === '/') re += '\\/'
    else re += escapeRe(c)
  }
  return new RegExp(`^${re}$`)
}

export const matchGlob = (path: string, glob: string): boolean => globToRegExp(glob).test(path)

/** The report's `files=` list: comma-separated, `none` and blanks dropped. */
export const reportFiles = (files: string | undefined): string[] =>
  (files ?? '').split(',').map(f => f.trim()).filter(f => f !== '' && f !== 'none' && f !== '-')

/** A brief's comma list (`scope=`, `forbid=`): blanks and `none` dropped. */
export const globList = (value: string | undefined): string[] =>
  (value ?? '').split(',').map(g => g.trim()).filter(g => g !== '' && g !== 'none')

export type ScopeResult = { inScope: string[]; outOfScope: string[]; forbidden: string[] }

/**
 * Each report file, made absolute against the scope root: in scope when a
 * scope glob matches it and no forbid glob does. A path that cannot be made
 * absolute (a `..` segment) is out of scope as written.
 */
export function scopeCheck(input: { files: readonly string[]; root: string; scope: readonly string[]; forbid: readonly string[] }): ScopeResult {
  const out: ScopeResult = { inScope: [], outOfScope: [], forbidden: [] }
  const abs = (g: string) => (g.startsWith('/') ? g : `${input.root}/${g}`)
  for (const file of input.files) {
    const path = resolveFile(file, input.root)
    if (path === undefined) out.outOfScope.push(file)
    else if (input.forbid.some(g => matchGlob(path, abs(g)))) out.forbidden.push(path)
    else if (input.scope.some(g => matchGlob(path, abs(g)))) out.inScope.push(path)
    else out.outOfScope.push(path)
  }
  return out
}

export type GateOutcome = { label: string; exitCode?: number; error?: string }

// ---- MOD-22: research cards ----------------------------------------------------------

export const isAbsolute = (entry: string): boolean => entry.startsWith('/')

/** A leading `~` or `~/` is the home folder; `~user`, a `~` elsewhere and an empty home are left as written. */
export function expandTilde(entry: string, home: string): string {
  const h = home.replace(/\/+$/, '')
  if (h === '') return entry
  if (entry === '~') return h
  return entry.startsWith('~/') ? `${h}${entry.slice(1)}` : entry
}

/** The card's output folder: the one it names (`outdir:`), else the folder of its first absolute scope entry. */
export function outdirOf(scope: readonly string[], named?: string): string | undefined {
  const n = (named ?? '').trim()
  if (n !== '') return n.replace(/\/+$/, '') || '/'
  const first = scope.find(isAbsolute)
  return first === undefined ? undefined : globRoot(first)
}

/** A path is under `root` (or is it). */
const under = (path: string, root: string): boolean => path === root || path.startsWith(root === '/' ? '/' : `${root}/`)

/** The roots with any that lies inside another dropped, each once, in order. */
const outermost = (roots: readonly string[]): string[] => {
  const all = [...new Set(roots)]
  return all.filter(r => !all.some(o => o !== r && under(r, o)))
}

/** The folders to list: the root of every absolute scope and forbid entry, each once, a root inside another dropped. */
export function outsideRoots(scope: readonly string[], forbid: readonly string[]): string[] {
  return outermost([...scope, ...forbid].filter(isAbsolute).map(globRoot))
}

/** The scratch folder a brief names by default: the system temp dir, then chassis-delegation/<task>. */
export const defaultScratch = (tmp: string, task: string): string => `${tmp.replace(/\/+$/, '') || '/tmp'}/chassis-delegation/${task}`

/** One file under a listed root: its path relative to the root, its size and its modification time. */
export type OutsideEntry = { path: string; size: number; mtimeMs: number }
/** A root's listing, or why it could not be made. */
/**
 * A root's listing, or why it could not be made. MOD-85: a root too big to list is recorded at dispatch
 * as a watermark (`since`, the ms time before its walk began, and `files`, the count walked); at hand-back
 * its walk holds only what is newer than `since`: the files in `entries`, the folders in `dirs` (path ''
 * is the root itself).
 */
export type RootListing =
  | { root: string; entries: OutsideEntry[]; dirs?: { path: string; mtimeMs: number }[] }
  | { root: string; error: string }
  | { root: string; since: number; files: number }
/** The most entries the hand-back walk of a watermark root visits before the claim is left unchecked. */
export const OUTSIDE_WALK_CEILING = 1000000
export type ClaimResult = { status: 'held' | 'failed' | 'unchecked'; detail: string }

const absOf = (root: string, rel: string): string => (root === '/' ? `/${rel}` : `${root}/${rel}`)
const anyMatch = (path: string, globs: readonly string[], dir = false): boolean => globs.some(g => isAbsolute(g) && (matchGlob(path, g) || (dir && matchGlob(`${path === '/' ? '' : path}/x`, g))))

/**
 * The scope claim for what changed outside the repo: every root in either
 * listing, before against after. A path added, removed or changed (size or
 * time) must match an absolute scope entry and no absolute forbid entry;
 * the first that does not fails the claim, named, with the delta it came from.
 * A root that was not listed at one end leaves the claim unchecked unless a
 * failure was found elsewhere. Undefined when no root was listed at all.
 */
export function outsideClaim(input: { before: readonly RootListing[]; after: readonly RootListing[]; scope: readonly string[]; forbid: readonly string[] }): ClaimResult | undefined {
  const roots = [...new Set([...input.before.map(l => l.root), ...input.after.map(l => l.root)])]
  if (roots.length === 0) return undefined
  const changed: string[] = []
  const changedDirs = new Set<string>()
  let watched = false
  let unchecked: string | undefined
  for (const root of roots) {
    const b = input.before.find(l => l.root === root)
    const a = input.after.find(l => l.root === root)
    if (b === undefined) unchecked ??= `outside delta: no listing of ${root} was taken at dispatch`
    else if ('error' in b) unchecked ??= `outside delta: ${root} could not be listed at dispatch: ${b.error}`
    else if ('since' in b) {
      if (a === undefined) unchecked ??= `outside delta: ${root} was not listed at hand-back`
      else if ('error' in a) unchecked ??= `outside delta: ${root} could not be listed at hand-back: ${a.error}`
      else if ('since' in a) unchecked ??= `outside delta: ${root} was not walked at hand-back`
      else {
        watched = true
        for (const e of a.entries) if (e.mtimeMs > b.since) changed.push(absOf(root, e.path))
        for (const d of a.dirs ?? []) if (d.mtimeMs > b.since) changedDirs.add(d.path === '' ? root : absOf(root, d.path))
      }
    } else if (a === undefined) unchecked ??= `outside delta: ${root} was not listed at hand-back`
    else if ('error' in a) unchecked ??= `outside delta: ${root} could not be listed at hand-back: ${a.error}`
    else if ('since' in a) unchecked ??= `outside delta: ${root} was not listed at hand-back`
    else {
      const was = new Map(b.entries.map(e => [e.path, e]))
      const now = new Map(a.entries.map(e => [e.path, e]))
      for (const [path, e] of now) {
        const o = was.get(path)
        if (o === undefined || o.size !== e.size || o.mtimeMs !== e.mtimeMs) changed.push(absOf(root, path))
      }
      for (const path of was.keys()) if (!now.has(path)) changed.push(absOf(root, path))
    }
  }
  const files = [...new Set(changed)].filter(p => !changedDirs.has(p))
  const paths = [...new Set([...files, ...changedDirs])].sort()
  const bad = paths.flatMap(p => {
    const dir = changedDirs.has(p)
    return anyMatch(p, input.forbid, dir) ? [{ p, why: 'touches forbid path' }] : anyMatch(p, input.scope, dir) ? [] : [{ p, why: 'out-of-scope path' }]
  })
  const first = bad[0]
  if (first) return { status: 'failed', detail: `${first.why}: ${first.p} (outside delta${bad.length > 1 ? `, +${bad.length - 1} more` : ''})` }
  if (unchecked !== undefined) return { status: 'unchecked', detail: unchecked }
  const where = roots.join(', ')
  const by = watched ? ' (checked by modification time)' : ''
  return { status: 'held', detail: paths.length === 0 ? `outside delta: nothing changed under ${where}${by}` : `outside delta: ${plural(paths.length, 'changed path')} under ${where}, every one within scope and none in forbid${by}` }
}

/** What the verifier needs to compare the outside: the listings taken at dispatch, and a way to list a root now. */
export type OutsideInput = { before: readonly RootListing[]; list: (root: string, since?: number) => Promise<RootListing> }

/**
 * Lists the roots again (those listed at dispatch and those the scope and forbid name now) and judges
 * the outside delta. Undefined when nothing was recorded at dispatch (a brief that never went through
 * /dispatch): the outside is then no part of the scope claim.
 */
export async function outsideCheck(scope: readonly string[], forbid: readonly string[], outside: OutsideInput | undefined): Promise<ClaimResult | undefined> {
  if (outside === undefined) return undefined
  // a root an amendment added inside a folder listed at dispatch is covered by that listing
  const roots = outermost([...outside.before.map(l => l.root), ...outsideRoots(scope, forbid)])
  const after: RootListing[] = []
  for (const root of roots) {
    try {
      const mark = outside.before.find(l => l.root === root)
      after.push(await outside.list(root, mark !== undefined && 'since' in mark ? mark.since : undefined))
    } catch (err) {
      after.push({ root, error: String(err) })
    }
  }
  return outsideClaim({ before: outside.before, after, scope, forbid })
}

/** The report's `artefacts=` list: comma-separated paths, `none` and blanks dropped. */
export const reportArtefacts = reportFiles

/** The report's `metrics="k=v,k=v"` as a record; an item without `=`, a repeated key and `__proto__` are dropped. */
export function reportMetrics(metrics: string | undefined): Record<string, string> {
  const out: Record<string, string> = {}
  for (const item of (metrics ?? '').split(',')) {
    const at = item.indexOf('=')
    const key = at > 0 ? item.slice(0, at).trim() : ''
    if (key === '' || key === '__proto__' || key in out || Object.keys(out).length >= 50) continue
    out[key] = item.slice(at + 1).trim().slice(0, 200)
  }
  return out
}

/** `metrics: tris=1200, len_s=2.4`: the verdict detail line (recorded, never judged). */
export const metricsLine = (m: Readonly<Record<string, string>>): string => `metrics: ${Object.entries(m).map(([k, v]) => `${k}=${v}`).join(', ')}`

/** What a stat of one artefact found. */
export type ArtefactStat = { exists: boolean; size?: number; isDir?: boolean; error?: string }
/** One named artefact: its absolute path (undefined when it cannot be made) and what was found there. */
export type ArtefactResult = { name: string; path?: string; exists?: boolean; size?: number; isDir?: boolean; error?: string }

/**
 * The artefacts claim: each named path exists and is not empty (a folder: has an entry). Fails naming
 * the first that is missing or empty; unchecked when one could not be read and none failed; undefined
 * when the report names none.
 */
export function artefactsClaim(results: readonly ArtefactResult[]): ClaimResult | undefined {
  if (results.length === 0) return undefined
  const shown = (r: ArtefactResult): string => (r.path === undefined || r.path === r.name ? r.name : `${r.name} (${r.path})`)
  let unread: ArtefactResult | undefined
  for (const r of results) {
    if (r.path === undefined) return { status: 'failed', detail: `missing: ${r.name} (a '..' segment names no path)` }
    if (r.error !== undefined) {
      unread ??= r
      continue
    }
    if (!r.exists) return { status: 'failed', detail: `missing: ${shown(r)}` }
    if ((r.size ?? 0) === 0) return { status: 'failed', detail: `empty: ${shown(r)}` }
  }
  if (unread) return { status: 'unchecked', detail: `could not be read: ${unread.name} (${unread.error})` }
  const size = (r: ArtefactResult): string => (r.isDir ? `${r.size ?? 0} ${r.size === 1 ? 'entry' : 'entries'}` : plural(r.size ?? 0, 'byte'))
  return { status: 'held', detail: `${results.length} ${results.length === 1 ? 'artefact exists and is' : 'artefacts exist and are'} not empty: ${results.map(r => `${r.name} (${size(r)})`).join(', ')}` }
}

/** Stats each named artefact (a relative one against `base`) through the caller's `stat`, and judges them. */
export async function artefactsCheck(names: readonly string[], base: string, stat: (path: string) => Promise<ArtefactStat>): Promise<ClaimResult | undefined> {
  const results: ArtefactResult[] = []
  for (const name of names) {
    const path = resolveFile(name, base)
    if (path === undefined) {
      results.push({ name, exists: false })
      continue
    }
    try {
      results.push({ name, path, ...(await stat(path)) })
    } catch (err) {
      results.push({ name, path, exists: false, error: String(err) })
    }
  }
  return artefactsClaim(results)
}

export type NoRepoInput = {
  root: string
  /** The report's files, absolute, that are in scope. */
  files: readonly string[]
  missing: readonly string[]
  outOfScope: readonly string[]
  forbidden: readonly string[]
  gates: readonly GateOutcome[]
  notRerun: readonly string[]
  noGate: boolean
  /** MOD-22: the outside delta's claim, part of the scope claim. */
  outside?: ClaimResult
  /** MOD-22: the artefacts claim, after files. */
  artefacts?: ClaimResult
  /** MOD-22: the report's metrics, shown on a line of their own and never judged. */
  metrics?: Readonly<Record<string, string>>
}

export type NoRepoVerdict = { verdict: 'consistent' | 'refuted' | 'unverified'; why?: string; lines: string[] }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * The verdict and its claim lines, in the native verifier's shape
 * (`claim <name>: held|failed|unchecked — <detail>`). A failed claim refutes
 * (scope first, then missing files, then artefacts, then the gate); else an
 * unchecked one (a gate not re-run, none at all) leaves it unverified; else consistent.
 */
export function noRepoVerdict(v: NoRepoInput): NoRepoVerdict {
  const lines: string[] = []
  const failed: string[] = []
  const unchecked: string[] = []
  const filesScope: ClaimResult =
    v.outOfScope.length > 0 || v.forbidden.length > 0
      ? { status: 'failed', detail: v.outOfScope.length > 0 ? `out of scope: ${v.outOfScope.join(', ')}` : `forbidden: ${v.forbidden.join(', ')}` }
      : { status: 'held', detail: 'every file in scope' }
  const scopeParts = [filesScope, ...(v.outside ? [v.outside] : [])]
  const scopeFailed = scopeParts.filter(p => p.status === 'failed')
  if (scopeFailed.length > 0) {
    const why = scopeFailed.map(p => p.detail).join('; ')
    lines.push(`claim scope: failed — ${why}`)
    failed.push(why)
  } else if (v.outside?.status === 'unchecked') {
    lines.push(`claim scope: unchecked — ${v.outside.detail}`)
    unchecked.push(v.outside.detail)
  } else lines.push(`claim scope: held — ${scopeParts.map(p => p.detail).join('; ')}`)
  if (v.missing.length > 0) {
    const why = `missing: ${v.missing.join(', ')}`
    lines.push(`claim files: failed — ${why}`)
    failed.push(why)
  } else lines.push(`claim files: held — ${plural(v.files.length, 'file')} under ${v.root}`)
  if (v.artefacts) {
    lines.push(`claim artefacts: ${v.artefacts.status} — ${v.artefacts.detail}`)
    if (v.artefacts.status === 'failed') failed.push(v.artefacts.detail)
    else if (v.artefacts.status === 'unchecked') unchecked.push(v.artefacts.detail)
  }
  if (v.noGate) {
    lines.push('claim gate: unchecked — no gate= in the brief')
    unchecked.push('no gate= in the brief')
  }
  for (const g of v.gates) {
    if (g.error !== undefined) {
      const why = `gate ${g.label} did not run: ${g.error}`
      lines.push(`claim gate: unchecked — ${why}`)
      unchecked.push(why)
    } else if (g.exitCode === 0) lines.push(`claim gate: held — ${g.label} exited 0`)
    else {
      const why = `gate ${g.label} exited ${g.exitCode}`
      lines.push(`claim gate: failed — ${why}`)
      failed.push(why)
    }
  }
  for (const id of v.notRerun) {
    lines.push(`claim gate: unchecked — gate not re-run: ${id}`)
    unchecked.push(`gate not re-run: ${id}`)
  }
  if (v.metrics && Object.keys(v.metrics).length > 0) lines.push(metricsLine(v.metrics))
  if (failed.length > 0) return { verdict: 'refuted', why: failed[0] as string, lines }
  if (unchecked.length > 0) return { verdict: 'unverified', why: unchecked[0] as string, lines }
  return { verdict: 'consistent', lines }
}

/** `consistent (no repo)`, `refuted (no repo): <why>`, `unverified (no repo): <why>`. */
export const noRepoVerdictText = (v: { verdict: string; why?: string }): string =>
  `${v.verdict} (no repo)${v.why ? `: ${v.why}` : ''}`
