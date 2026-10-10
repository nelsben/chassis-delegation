// Part 5D: the native git guard. A Bash command that would commit, merge,
// cherry-pick, rebase or push while the repo it runs in is on a guarded branch
// (main, master by default) is denied; so is a push that NAMES a guarded
// branch (`push origin main`, `HEAD:main`), from any branch. A push on a
// guarded branch is a push OF it only when its refspecs are empty, `--all`,
// `--mirror`, `HEAD`, or the branch itself; a tag, `--tags`, another branch
// or a delete of one passes. It replaces the
// chassis's pre-git-guard.sh. Pure: no `$`.
//
// It reads the command the way a shell does, not as text: quotes keep their
// words whole, heredoc bodies are skipped, and only the FIRST command word of
// each pipeline segment (after `VAR=x` assignments) can be `git`; so a file
// being written that merely contains "git commit" never trips it. It follows
// a command-position `cd <dir>` (scoped to its subshell) and git's own `-C`.
// A branch made in the same command (`checkout -b feat && commit`) is off the
// guard; a bare checkout re-arms it, and a checkout of a guarded branch is
// that branch. An accident tripwire, not adversary-proof: `bash -c "…"`,
// `eval` and the like are not looked into.

export const WRITE_VERBS = ['commit', 'merge', 'cherry-pick', 'rebase', 'push'] as const
export const DEFAULT_GUARD_BRANCHES = ['main', 'master'] as const

export type BranchState = { kind: 'unknown' } | { kind: 'off' } | { kind: 'on'; branch: string }
export type GitWrite = {
  verb: string
  /** The folder it runs in, from `cd` and `-C`, relative or absolute; '' is the command's own folder. */
  dir: string
  /** What the command itself did to the branch before this write. */
  state: BranchState
  /** A push refspec naming a guarded branch. */
  namesGuarded?: string
  /**
   * A push only: the source of each refspec (`HEAD`, a branch, a tag), with a
   * delete or `--tags` contributing none. Absent when the push is of the
   * current branch whatever they are (no refspecs, `--all`, `--mirror`).
   */
  pushSrcs?: string[]
}

export const parseGuardBranches = (s: string | undefined): string[] => {
  const list = (s ?? '').split(',').map(x => x.trim()).filter(Boolean)
  return list.length > 0 ? list : [...DEFAULT_GUARD_BRANCHES]
}

/** `dir` read against `cwd`: absolute wins, `.` and `..` folded. */
export function joinDir(cwd: string, dir: string): string {
  if (!dir) return cwd
  const raw = dir.startsWith('/') ? dir : `${cwd.replace(/\/+$/, '')}/${dir}`
  const out: string[] = []
  for (const part of raw.split('/')) {
    if (part === '' || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return `/${out.join('/')}`
}

const SEPS = ['&&', '||', ';;', ';', '|&', '|', '&', '(', ')', '\n', '$(', '`']

type Tok = { t: string; sep: boolean }

/**
 * Shell-like tokens: quotes and backslashes honoured, `;` `&&` `||` `|` `&`
 * `(` `)` `$(` and newlines as separator tokens, comments dropped, heredoc
 * bodies (`<<EOF` … `EOF`, `<<-` with leading tabs) skipped.
 */
function lex(text: string): Tok[] {
  const toks: Tok[] = []
  let word = ''
  let inWord = false
  const pendingDocs: { delim: string; dash: boolean }[] = []
  const flush = () => {
    if (inWord) toks.push({ t: word, sep: false })
    word = ''
    inWord = false
  }
  let i = 0
  const n = text.length
  while (i < n) {
    const c = text[i] as string
    if (c === '\\' && i + 1 < n) {
      if (text[i + 1] === '\n') i += 2
      else {
        word += text[i + 1]
        inWord = true
        i += 2
      }
      continue
    }
    if (c === "'") {
      const end = text.indexOf("'", i + 1)
      word += end < 0 ? text.slice(i + 1) : text.slice(i + 1, end)
      inWord = true
      i = end < 0 ? n : end + 1
      continue
    }
    if (c === '"') {
      let j = i + 1
      while (j < n && text[j] !== '"') {
        if (text[j] === '\\' && j + 1 < n) {
          word += text[j + 1]
          j += 2
        } else {
          word += text[j]
          j += 1
        }
      }
      inWord = true
      i = j + 1
      continue
    }
    if (c === '#' && !inWord) {
      while (i < n && text[i] !== '\n') i += 1
      continue
    }
    if (c === '<' && text.startsWith('<<', i) && !text.startsWith('<<<', i)) {
      flush()
      let j = i + 2
      const dash = text[j] === '-'
      if (dash) j += 1
      while (j < n && (text[j] === ' ' || text[j] === '\t')) j += 1
      let delim = ''
      while (j < n && !/[\s;&|()<>]/.test(text[j] as string)) {
        const d = text[j] as string
        if (d !== "'" && d !== '"' && d !== '\\') delim += d
        j += 1
      }
      if (delim) pendingDocs.push({ delim, dash })
      i = j
      continue
    }
    if (c === '\n') {
      flush()
      toks.push({ t: '\n', sep: true })
      i += 1
      // skip each pending heredoc body, in order, through its delimiter line
      while (pendingDocs.length > 0 && i <= n) {
        const doc = pendingDocs.shift() as { delim: string; dash: boolean }
        for (;;) {
          if (i >= n) break
          const end = text.indexOf('\n', i)
          const line = end < 0 ? text.slice(i) : text.slice(i, end)
          i = end < 0 ? n : end + 1
          if ((doc.dash ? line.replace(/^\t+/, '') : line) === doc.delim) break
        }
      }
      continue
    }
    if (c === ' ' || c === '\t' || c === '\r') {
      flush()
      i += 1
      continue
    }
    const sep = SEPS.find(s => s !== '\n' && text.startsWith(s, i))
    if (sep) {
      flush()
      toks.push({ t: sep, sep: true })
      i += sep.length
      continue
    }
    if (c === '>' || c === '<') {
      flush()
      i += text[i + 1] === c ? 2 : 1
      continue
    }
    word += c
    inWord = true
    i += 1
  }
  flush()
  return toks
}

/** The words and separators of a command, as the guard reads them. */
export const tokenize = (text: string): string[] => lex(text).map(t => t.t)

const OPT_ARG = new Set(['-C', '-c', '--git-dir', '--work-tree', '--namespace', '--exec-path', '--config-env', '--super-prefix', '--attr-source'])
const CREATE = new Set(['-b', '-B', '-c', '-C', '--create', '--force-create', '--orphan'])
const ABORTS = new Set(['--abort', '--quit', '--skip'])
const PUSH_OPT_ARG = new Set(['-o', '--push-option', '--repo', '--receive-pack', '--exec'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const PREFIXES = new Set(['command', 'time', 'nohup', 'env'])

const firstRef = (rest: readonly string[]): string | undefined => rest.find(t => !t.startsWith('-'))

const bare = (ref: string): string => ref.replace(/^\+/, '').replace(/^refs\/heads\//, '')

/** What a push's words say: the guarded branch it names as a destination, and the sources it pushes (undefined: the current branch, whatever they are). */
function pushInfo(rest: readonly string[], guarded: readonly string[]): { named?: string; srcs?: string[] } {
  const words: string[] = []
  let del = false
  let tags = false
  for (let i = 0; i < rest.length; i += 1) {
    const w = rest[i] as string
    if (PUSH_OPT_ARG.has(w)) {
      i += 1
      continue
    }
    if (w === '--all' || w === '--mirror') return { named: guarded[0] }
    if (w === '--delete' || w === '-d') del = true
    else if (w === '--tags') tags = true
    if (!w.startsWith('-')) words.push(w)
  }
  const specs = words.slice(1)
  let named: string | undefined
  const srcs: string[] = []
  for (const spec of specs) {
    const colon = spec.lastIndexOf(':')
    const dst = bare(colon >= 0 ? spec.slice(colon + 1) : spec)
    if (named === undefined && guarded.includes(dst)) named = dst
    const src = colon >= 0 ? spec.slice(0, colon) : del ? '' : spec
    if (src) srcs.push(bare(src))
  }
  const current = specs.length === 0 && !tags
  return { ...(named ? { named } : {}), ...(current ? {} : { srcs }) }
}

/** Every git write in a Bash command, in order, with its folder and what the command did to the branch first. */
export function gitWrites(command: string, guarded: readonly string[]): GitWrite[] {
  const toks = lex(command)
  const writes: GitWrite[] = []
  let state: BranchState = { kind: 'unknown' }
  let cwd = ''
  const stack: string[] = []
  let i = 0
  while (i < toks.length) {
    const tok = toks[i] as Tok
    if (tok.sep) {
      if (tok.t === '(' || tok.t === '$(') stack.push(cwd)
      else if (tok.t === ')' && stack.length > 0) cwd = stack.pop() as string
      i += 1
      continue
    }
    // one segment: the words up to the next separator
    let end = i
    while (end < toks.length && !(toks[end] as Tok).sep) end += 1
    const words = toks.slice(i, end).map(t => t.t)
    i = end
    let k = 0
    while (k < words.length && (ASSIGN.test(words[k] as string) || PREFIXES.has(words[k] as string))) k += 1
    const head = words[k]
    if (head === undefined) continue
    if (head === 'cd') {
      const target = words.slice(k + 1).find(w => !w.startsWith('-'))
      // kept relative until the hook reads it against the command's own folder (joinDir)
      if (target !== undefined) cwd = target.startsWith('/') || !cwd ? target : `${cwd}/${target}`
      continue
    }
    if (head !== 'git' && !head.endsWith('/git')) continue
    let j = k + 1
    let cdir = ''
    while (j < words.length) {
      const o = words[j] as string
      if (o === '-C' && j + 1 < words.length) {
        const next = words[j + 1] as string
        cdir = cdir && !next.startsWith('/') ? `${cdir}/${next}` : next
        j += 2
      } else if (OPT_ARG.has(o)) j += 2
      else if (o.startsWith('-')) j += 1
      else break
    }
    const sub = words[j]
    const rest = words.slice(j + 1)
    const dir = cdir ? (cwd && !cdir.startsWith('/') ? `${cwd}/${cdir}` : cdir) : cwd
    if (sub === 'checkout' || sub === 'switch') {
      if (rest.includes('--')) continue
      if (rest.some(f => CREATE.has(f))) {
        const ref = firstRef(rest)
        state = ref === undefined ? { kind: 'unknown' } : guarded.includes(ref) ? { kind: 'on', branch: ref } : { kind: 'off' }
      } else {
        const ref = firstRef(rest)
        state = ref !== undefined && guarded.includes(ref) ? { kind: 'on', branch: ref } : { kind: 'unknown' }
      }
      continue
    }
    if (sub === undefined || !(WRITE_VERBS as readonly string[]).includes(sub)) continue
    if (sub !== 'commit' && sub !== 'push' && rest.some(f => ABORTS.has(f))) continue
    const push = sub === 'push' ? pushInfo(rest, guarded) : {}
    writes.push({ verb: sub, dir, state, ...(push.named ? { namesGuarded: push.named } : {}), ...(push.srcs ? { pushSrcs: push.srcs } : {}) })
  }
  return writes
}

/**
 * The deny for one write, given the branch its folder is on now (undefined when
 * unknown). MOD-13: a worker's refusal names its task (`no push on main (T-7)`).
 */
export function guardDeny(w: GitWrite, currentBranch: string | undefined, guarded: readonly string[], task?: string): string | undefined {
  const deny = (branch: string) => `chassis-delegation: no ${w.verb} on ${branch}${task ? ` (${task})` : ''}; branch first (git checkout -b agent/<domain>/<id>)`
  if (w.namesGuarded) return deny(w.namesGuarded)
  if (w.pushSrcs) {
    // a push of other refs (a tag, another branch, a delete) is not a push of the current branch
    const here = w.state.kind === 'on' ? w.state.branch : currentBranch
    if (!w.pushSrcs.some(src => src === 'HEAD' || src === here)) return undefined
  }
  if (w.state.kind === 'off') return undefined
  if (w.state.kind === 'on') return deny(w.state.branch)
  return currentBranch !== undefined && guarded.includes(currentBranch) ? deny(currentBranch) : undefined
}
