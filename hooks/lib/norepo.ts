// Part 3A: a task with no git repo. A brief whose header says `repo=none`, or
// names a folder that is not a git work tree, has no branch, sha or diff for
// the native verifier (./verify-native.ts) to read. The mod checks three things only:
// every `files=` path of the report exists under the brief's first scope
// root; no such path lies outside the scope (or inside a forbid); and the
// gate exits 0. The gate resolves as for any brief (./gates.ts
// resolveGateRuns): the gate map's command for the header's `gate=` id, or the
// `gate=` itself when it is a bare command the allowlist takes (`claude plugin
// validate <absolute folder>`). Pure: no `$`, no imports.

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
}

export type NoRepoVerdict = { verdict: 'verified' | 'refuted' | 'unverified'; why?: string; lines: string[] }

const plural = (n: number, one: string) => `${n} ${one}${n === 1 ? '' : 's'}`

/**
 * The verdict and its claim lines, in the native verifier's shape
 * (`claim <name>: held|failed|unchecked — <detail>`). A failed claim refutes
 * (scope first, then missing files, then the gate); else an unchecked one
 * (a gate not re-run, none at all) leaves it unverified; else verified.
 */
export function noRepoVerdict(v: NoRepoInput): NoRepoVerdict {
  const lines: string[] = []
  const failed: string[] = []
  const unchecked: string[] = []
  if (v.outOfScope.length > 0 || v.forbidden.length > 0) {
    const why = v.outOfScope.length > 0 ? `out of scope: ${v.outOfScope.join(', ')}` : `forbidden: ${v.forbidden.join(', ')}`
    lines.push(`claim scope: failed — ${why}`)
    failed.push(why)
  } else lines.push('claim scope: held — every file in scope')
  if (v.missing.length > 0) {
    const why = `missing: ${v.missing.join(', ')}`
    lines.push(`claim files: failed — ${why}`)
    failed.push(why)
  } else lines.push(`claim files: held — ${plural(v.files.length, 'file')} under ${v.root}`)
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
  if (failed.length > 0) return { verdict: 'refuted', why: failed[0] as string, lines }
  if (unchecked.length > 0) return { verdict: 'unverified', why: unchecked[0] as string, lines }
  return { verdict: 'verified', lines }
}

/** `verified (no repo)`, `refuted (no repo): <why>`, `unverified (no repo): <why>`. */
export const noRepoVerdictText = (v: { verdict: string; why?: string }): string =>
  `${v.verdict} (no repo)${v.why ? `: ${v.why}` : ''}`
