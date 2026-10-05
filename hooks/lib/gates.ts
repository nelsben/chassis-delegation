// Gate commands: what a gate map may name, how a brief's `gate=` resolves to
// the argv the verifier runs, and how the allowlist recognises those argv.
// Pure: no `$`, no imports.
//
// A gate map (`gateMap`: id → command) is config the person writes (the repo
// file or /config). A command is run by argv, never through a shell: it is
// split on whitespace, every word must be free of shell syntax, `{files}`
// (the files.txt path) and `{worktree}` (the absolute path of the tree the gate
// runs in) are the two placeholders, and several commands may be chained with
// ` && ` (run in order, the first non-zero exit is the result). The allowlist
// accepts an argv only when it is EXACTLY one of those commands with `{files}`
// and `{worktree}` filled by absolute paths.

/** First words a gate command may never start with: deploys, network, privilege, deletion, git and gh. */
export const GATE_DENY = [
  'sf', 'sfdx', 'curl', 'wget', 'ssh', 'scp', 'sftp', 'rsync', 'nc', 'ncat', 'telnet', 'ftp',
  'sudo', 'su', 'doas', 'rm', 'rmdir', 'mv', 'dd', 'chmod', 'chown', 'kill', 'pkill', 'killall',
  'eval', 'exec', 'source', 'git', 'gh', 'open', 'osascript', 'launchctl', 'crontab', 'security', 'env',
] as const

const SHELLS = ['bash', 'sh', 'zsh', 'dash', 'ksh', 'fish']
const PUBLISHERS = ['npm', 'pnpm', 'yarn', 'bun', 'npx', 'cargo', 'poetry', 'twine', 'gem']
const PUBLISH_VERBS = ['publish', 'unpublish', 'login', 'logout', 'adduser', 'owner', 'token', 'deprecate', 'dist-tag', 'access', 'upload', 'yank']
const WORD = /^[A-Za-z0-9_./@%+=:,-]+$/
const FILES = '{files}'
const TREE = '{worktree}'
/** An absolute path with no `..` and nothing a shell or a flag parser would read. */
const ABS_PATH = /^\/[A-Za-z0-9._@%+=:,/-]*$/

export type GateCheck = { ok: true } | { ok: false; reason: string }
export type GateRun = { label: string; argv: string[] }

export const splitCommand = (cmd: string): string[] => cmd.trim().split(/\s+/).filter(Boolean)

const base = (word: string): string => word.slice(word.lastIndexOf('/') + 1)

/** One command of a gate map, as words: the shape rules above. */
export function checkGateWords(words: readonly string[]): GateCheck {
  if (words.length === 0) return { ok: false, reason: 'an empty command' }
  for (const w of words) {
    const bare = w.split(FILES).join('').split(TREE).join('')
    if (w.split(FILES).length > 2) return { ok: false, reason: `${w} holds {files} twice` }
    if (w.split(TREE).length > 2) return { ok: false, reason: `${w} holds {worktree} twice` }
    if (bare !== '' && !WORD.test(bare)) return { ok: false, reason: `${w} holds shell syntax` }
  }
  const first = base(words[0] as string)
  if ((GATE_DENY as readonly string[]).includes(first)) return { ok: false, reason: `a gate may not run ${first}` }
  if (SHELLS.includes(first) && (words[1] ?? '-').startsWith('-')) return { ok: false, reason: `${first} must run a script file, not a flag` }
  if (PUBLISHERS.includes(first) && words.slice(1).some(w => PUBLISH_VERBS.includes(w))) return { ok: false, reason: `a gate may not ${first} publish or log in` }
  return { ok: true }
}

/** A gate-map command (one or more joined by ` && `) → its argv templates, or why it is refused. */
export function gateCommandTemplates(cmd: string): { templates: string[][] } | { reason: string } {
  const parts = cmd.split(' && ').map(splitCommand)
  for (const words of parts) {
    const check = checkGateWords(words)
    if (!check.ok) return { reason: check.reason }
  }
  return { templates: parts }
}

/** Every valid template of a gate map (the allowlist accepts these, `{files}` filled). */
export function gateTemplatesOf(map: Readonly<Record<string, string>>): string[][] {
  const out: string[][] = []
  for (const cmd of Object.values(map)) {
    const t = gateCommandTemplates(cmd)
    if ('templates' in t) for (const words of t.templates) if (!out.some(o => o.join(' ') === words.join(' '))) out.push(words)
  }
  return out
}

const isAbs = (path: string): boolean => ABS_PATH.test(path) && !path.split('/').includes('..')
const escapeRe = (t: string): string => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** True when `argv` is the template with `{files}` and `{worktree}` filled by absolute paths (no `..`). */
export function matchesTemplate(argv: readonly string[], template: readonly (string)[]): boolean {
  if (argv.length !== template.length) return false
  return template.every((t, i) => {
    const a = argv[i] as string
    if (!t.includes(FILES) && !t.includes(TREE)) return a === t
    const pieces = t.split(/(\{files\}|\{worktree\})/)
    const re = new RegExp(`^${pieces.map(p => (p === FILES || p === TREE ? '(.+)' : escapeRe(p))).join('')}$`)
    const m = re.exec(a)
    return m !== null && m.slice(1).every(isAbs)
  })
}

export const matchesAnyTemplate = (argv: readonly string[], templates: readonly (readonly string[])[]): boolean =>
  templates.some(t => matchesTemplate(argv, t))

/** Fill `{files}` (and `{worktree}`, when given) in a command's words. */
export const fillPlaceholders = (words: readonly string[], filesPath: string, worktree?: string): string[] =>
  words.map(w => (worktree === undefined ? w : w.split(TREE).join(worktree)).split(FILES).join(filesPath))
export const fillFiles = fillPlaceholders

export type GateResolution = {
  runs: GateRun[]
  /** Gate ids with no usable command: never run raw. */
  notRerun: { id: string; why: string }[]
  /** The brief names no gate at all. */
  none?: true
}

/**
 * What a brief's `gate=` runs: the whole value as a bare command when the
 * allowlist takes it (`claude plugin validate <folder>`, or a gate-map command
 * written out); else each comma id the gate map has (its command, `{files}`
 * and `{worktree}` filled, chained parts in order); an id the map lacks, or whose command is
 * refused, is named and never run.
 */
export function resolveGateRuns(gate: string | undefined, map: Readonly<Record<string, string>>, allowed: (argv: readonly string[]) => boolean, filesPath: string, worktree?: string): GateResolution {
  if (!gate || !gate.trim()) return { runs: [], notRerun: [], none: true }
  const whole = splitCommand(gate)
  if (whole.length > 1 && !gate.includes(',') && allowed(whole)) return { runs: [{ label: whole.join(' '), argv: whole }], notRerun: [] }
  const runs: GateRun[] = []
  const notRerun: { id: string; why: string }[] = []
  for (const id of gate.split(',').map(s => s.trim()).filter(Boolean)) {
    const cmd = map[id]
    if (cmd === undefined) {
      notRerun.push({ id, why: 'not in gateMap' })
      continue
    }
    const t = gateCommandTemplates(cmd)
    if ('reason' in t) {
      notRerun.push({ id, why: `gateMap command refused: ${t.reason}` })
      continue
    }
    for (const words of t.templates) {
      const argv = fillPlaceholders(words, filesPath, worktree)
      if (!runs.some(r => r.argv.join(' ') === argv.join(' '))) runs.push({ label: words.join(' '), argv })
    }
  }
  return { runs, notRerun }
}
