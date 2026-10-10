// GH-113: the brain's own spend, kept apart from the workers', and the
// delegate-only decision table. Every main-loop `turn.complete` with a usage
// adds to one record (tokens, dollars by model, turns, the brain's own source
// edits); the dashboard and /delegation read it. Pure: no `$`.
import { addTurn, priceFor, round4, tokensOf, usdOf, type Tokens, type UsageLike } from './cost'

export type BrainModel = { usd: number; tokens: number; turns: number }
export type BrainRecord = {
  tokens: Tokens
  /** Dollars of the priced turns. */
  usd: number
  /** True once a turn ran on a model the price table lacks (its tokens count, its dollars cannot). */
  unpriced: boolean
  turns: number
  /** The brain's own writes (Edit, Write, MultiEdit, NotebookEdit, a Bash write into the root), allowed or not. */
  edits: number
  byModel: Record<string, BrainModel>
}

export const emptyBrain = (): BrainRecord => ({ tokens: { in: 0, out: 0, cacheRead: 0, cacheWrite: 0 }, usd: 0, unpriced: false, turns: 0, edits: 0, byModel: {} })

/** The record with one more main-loop turn. */
export function brainTurn(acc: BrainRecord | undefined, u: UsageLike): BrainRecord {
  const prev = acc ?? emptyBrain()
  const t = tokensOf(u)
  const price = priceFor(u.model)
  const usd = price ? usdOf(t, price) : 0
  const model = u.model || 'unknown'
  const was = prev.byModel[model] ?? { usd: 0, tokens: 0, turns: 0 }
  const sum = addTurn({ tokens: prev.tokens, usd: 0, turns: prev.turns, models: [] }, u)
  return {
    tokens: sum.tokens,
    usd: round4(prev.usd + usd),
    unpriced: prev.unpriced || price === undefined,
    turns: prev.turns + 1,
    edits: prev.edits,
    byModel: { ...prev.byModel, [model]: { usd: round4(was.usd + usd), tokens: was.tokens + t.in + t.out + t.cacheRead + t.cacheWrite, turns: was.turns + 1 } },
  }
}

/** The record with one more brain edit. */
export const brainEdit = (acc: BrainRecord | undefined): BrainRecord => ({ ...(acc ?? emptyBrain()), edits: (acc?.edits ?? 0) + 1 })

export type BrainFamily = 'fable' | 'opus' | 'sonnet' | 'haiku' | 'other'

/** The family of a model alias or id. */
export function brainFamily(model: string | undefined): BrainFamily {
  const m = (model ?? '').toLowerCase()
  for (const f of ['fable', 'opus', 'sonnet', 'haiku'] as const) if (m.includes(f)) return f
  return 'other'
}

export type Split = { total: number; brain: number; workers: number; share: number }

/** The three numbers and the brain's share of the total; the total is brain + workers where the session's is unknown. */
export function brainSplit(sessionUsd: number | undefined, brainUsd: number, workersUsd: number): Split {
  const total = sessionUsd !== undefined && Number.isFinite(sessionUsd) ? sessionUsd : brainUsd + workersUsd
  return { total: round4(total), brain: round4(brainUsd), workers: round4(workersUsd), share: total > 0 ? Math.min(1, brainUsd / total) : 0 }
}

export type BrainSummary = Split & {
  /** The family of the model that spent most. */
  family: BrainFamily
  /** That model's id. */
  model?: string
  tokens: number
  turns: number
  edits: number
  attempts: number
  unpriced: boolean
}

/** What the lines and the dashboard show of a record, beside the workers' dollars and attempts. */
export function brainSummary(rec: BrainRecord | undefined, workersUsd: number, attempts: number, sessionUsd?: number): BrainSummary {
  const r = rec ?? emptyBrain()
  const top = Object.entries(r.byModel).sort((a, b) => b[1].usd - a[1].usd || b[1].tokens - a[1].tokens)[0]
  const tokens = r.tokens.in + r.tokens.out + r.tokens.cacheRead + r.tokens.cacheWrite
  return {
    ...brainSplit(sessionUsd, r.usd, workersUsd),
    family: brainFamily(top?.[0]),
    ...(top ? { model: top[0] } : {}),
    tokens,
    turns: r.turns,
    edits: r.edits,
    attempts,
    unpriced: r.unpriced,
  }
}

const money = (n: number): string => `$${n.toFixed(2)}`

/** `brain: fable $2.25 over 2 turns · workers $0.75 (3 attempts) · brain share 75%` */
export const brainLine = (s: BrainSummary): string =>
  `brain: ${s.family} ${money(s.brain)} over ${s.turns} turns · workers ${money(s.workers)} (${s.attempts} attempts) · brain share ${Math.round(s.share * 100)}%`

/** The KPI tile's value: `brain $2.25 / workers $0.75`. */
export const brainTileText = (s: Pick<BrainSummary, 'brain' | 'workers'>): string => `brain ${money(s.brain)} / workers ${money(s.workers)}`

// ---- delegate-only -------------------------------------------------------------------

export type DelegateMode = 'off' | 'warn' | 'deny'
export const DELEGATE_MODES: readonly DelegateMode[] = ['off', 'warn', 'deny']

export const DELEGATE_DENY = 'chassis-delegation: delegateOnly is on: the brain does not edit source. Describe the task and call the card tool, or set delegateOnly off.'

export const warnRow = (path: string): string => `chassis-delegation: the brain edited ${path} itself; a card would have delegated it (delegateOnly=warn)`

/** The two lines a premium brain gets at the top of the delegation state. */
export const PREMIUM_POSTURE: readonly string[] = [
  'You are the brain on a premium model. Build work goes to workers through the card tool; you read the repo to write cards, verify hand-backs, and read diffs.',
  'Do not edit source or run the test suite yourself.',
]

export const WRITE_TOOLS: readonly string[] = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']

/** Families delegateOnly restricts: the frontier and the premium. A Sonnet or Haiku brain is never restricted. */
export const isRestricted = (f: BrainFamily): boolean => f === 'opus' || f === 'fable'

const trimDir = (s: string) => s.replace(/^\/+|\/+$/g, '')

/** The path relative to the root, or undefined when it is outside it. */
export function relativeTo(root: string, path: string): string | undefined {
  const r = root.replace(/\/+$/, '')
  const parts: string[] = []
  const abs = path.startsWith('/') ? path : `${r}/${path}`
  for (const p of abs.split('/')) {
    if (p === '' || p === '.') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  const full = `/${parts.join('/')}`
  return full.startsWith(`${r}/`) ? full.slice(r.length + 1) : undefined
}

/** The card folder, `.delegation/`, the repo file, CHANGELOG.md and a docs/ folder: what the brain may write. */
export function isAllowedPath(rel: string, cardDir: string): boolean {
  const card = trimDir(cardDir)
  if (card !== '' && (rel === card || rel.startsWith(`${card}/`))) return true
  if (rel.startsWith('.delegation/')) return true
  if (rel === '.chassis-delegation.json' || rel === 'CHANGELOG.md') return true
  return rel.startsWith('docs/') || rel.includes('/docs/')
}

export type DelegateInput = {
  mode: DelegateMode
  brainFamily: BrainFamily
  tool: string
  /** The paths the call writes (absolute, or relative to the root). */
  paths: readonly string[]
  root: string
  cardDir: string
  /** A Bash command that commits (MOD-9: the flag alone never denies; the paths the commit takes are in `paths`). */
  commit?: boolean
}
export type DelegateDecision = { action: 'allow' | 'warn' | 'deny'; edit: boolean; path?: string }

/**
 * The table. Not a write by the brain: allow, no edit. A write: an edit (it counts)
 * whether or not it is allowed; allowed when the mode is off, the brain is not
 * opus or fable, or every path in the root is on the allowlist; else warn or deny.
 */
export function delegateDecision(i: DelegateInput): DelegateDecision {
  const isWrite = WRITE_TOOLS.includes(i.tool) || (i.tool === 'Bash' && i.paths.length > 0)
  if (!isWrite) return { action: 'allow', edit: false }
  const rels = i.paths.map(p => relativeTo(i.root, p)).filter((r): r is string => r !== undefined)
  if (rels.length === 0) return { action: 'allow', edit: false } // wholly outside the repo
  const offending = rels.find(r => !isAllowedPath(r, i.cardDir))
  if (offending === undefined || i.mode === 'off' || !isRestricted(i.brainFamily)) return { action: 'allow', edit: true }
  return { action: i.mode, edit: true, path: offending }
}

/** The path an Edit-family call writes. */
export function toolPath(input: Record<string, unknown>): string[] {
  const p = typeof input.file_path === 'string' ? input.file_path : typeof input.notebook_path === 'string' ? input.notebook_path : undefined
  return p ? [p] : []
}

// ---- what a Bash command writes ------------------------------------------------------

const SEPS = ['&&', '||', ';;', ';', '|&', '|', '&', '(', ')', '$(', '`']
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const SKIP_TARGET = /^\/dev\/(null|stdout|stderr|tty)$/

type Tok = { k: 'word' | 'sep' | 'out' | 'dup' | 'in'; t: string }

/**
 * Shell-like tokens: quotes and backslashes honoured; separators; an unquoted
 * `>` / `>>` / `&>` as an `out` token (`>&` a `dup`, `<` an `in`) with its fd
 * prefix dropped; comments and heredoc bodies skipped.
 */
function lex(text: string): Tok[] {
  const toks: Tok[] = []
  let word = ''
  let inWord = false
  const docs: { delim: string; dash: boolean }[] = []
  const flush = () => {
    if (inWord) toks.push({ k: 'word', t: word })
    word = ''
    inWord = false
  }
  const n = text.length
  let i = 0
  while (i < n) {
    const c = text[i] as string
    if (c === '\\' && i + 1 < n) {
      if (text[i + 1] !== '\n') {
        word += text[i + 1]
        inWord = true
      }
      i += 2
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
        if (text[j] === '\\' && j + 1 < n) j += 1
        word += text[j]
        j += 1
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
      if (delim) docs.push({ delim, dash })
      i = j
      continue
    }
    if (c === '\n') {
      flush()
      toks.push({ k: 'sep', t: '\n' })
      i += 1
      while (docs.length > 0 && i <= n) {
        const doc = docs.shift() as { delim: string; dash: boolean }
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
    if (c === '&' && text[i + 1] === '>') {
      flush()
      toks.push({ k: 'out', t: '>' })
      i += text[i + 2] === '>' ? 3 : 2
      continue
    }
    if (c === '>' || c === '<') {
      // an fd number glued in front (2>) is part of the operator
      if (inWord && /^\d+$/.test(word)) {
        word = ''
        inWord = false
      } else flush()
      const doubled = text[i + 1] === c
      i += doubled ? 2 : 1
      if (c === '>' && text[i] === '&') {
        toks.push({ k: 'dup', t: '>&' })
        i += 1
      } else {
        if (c === '>' && text[i] === '|') i += 1
        toks.push({ k: c === '>' ? 'out' : 'in', t: c })
      }
      continue
    }
    const sep = SEPS.find(x => text.startsWith(x, i))
    if (sep) {
      flush()
      toks.push({ k: 'sep', t: sep })
      i += sep.length
      continue
    }
    word += c
    inWord = true
    i += 1
  }
  flush()
  return toks
}

/** A `git commit` that runs in the session's repo (MOD-9): where, and what it was told to commit. */
export type CommitCall = { dir: string; all: boolean; amend: boolean; pathspecs: string[] }

const RESERVED = new Set(['{', 'then', 'do', 'else', 'elif', 'if', 'while', 'until', '!', 'time'])
const CD_OPT = /^(-[LPe@]+|--)$/
/** A sed -i backup suffix given as its own word: empty, or dotted (`.bak`). */
const BSD_SUFFIX = /^(\.[A-Za-z0-9._~-]*)?$/
const COMMIT_VALUE_SHORT = 'mFCctS'
const COMMIT_VALUE_LONG = new Set(['--message', '--file', '--author', '--date', '--reuse-message', '--reedit-message', '--fixup', '--squash', '--cleanup', '--template'])

/** `/a/./b/../c` as `/a/c`. */
function normAbs(path: string): string {
  const parts: string[] = []
  for (const p of path.split('/')) {
    if (p === '' || p === '.') continue
    if (p === '..') parts.pop()
    else parts.push(p)
  }
  return `/${parts.join('/')}`
}

/**
 * Reads a command the way a shell reads words (quotes whole, heredoc bodies skipped)
 * and follows the working directory through it: the files it writes under the root
 * (a `>` / `>>` redirection, `tee`, `sed -i`, `cp` / `mv` destination) and the
 * `git commit`s it runs. An accident tripwire, not adversary-proof.
 *
 * A target is resolved first (MOD-8): `~`, `$HOME` (the `home` argument), `$PWD`
 * (the working directory in force) and a `$NAME` assigned a literal earlier in the
 * command. MOD-9: a relative target resolves against the folder a `cd` / `pushd`
 * left (the root to begin with); a `cd` inside `( )` or `$( )` is undone at the
 * closing parenthesis; a `cd` in a pipeline or run in the background does not
 * move the later segments; a `cd` whose folder cannot be resolved makes every later
 * relative target unknown. A target that stays unresolved is unknown and not counted.
 */
function scan(command: string, root: string, home?: string): { paths: string[]; commits: CommitCall[] } {
  const toks = lex(command)
  type Seg = { toks: Tok[]; before: string; after: string }
  const segments: Seg[] = [{ toks: [], before: '', after: '' }]
  for (const t of toks) {
    if (t.k === 'sep') {
      ;(segments.at(-1) as Seg).after = t.t
      segments.push({ toks: [], before: t.t, after: '' })
    } else (segments.at(-1) as Seg).toks.push(t)
  }
  const out: string[] = []
  const commits: CommitCall[] = []
  const prefix = root.replace(/\/+$/, '')
  const homeDir = home ? home.replace(/\/+$/, '') : undefined
  const vars = new Map<string, string>()
  let cwd: string | undefined = normAbs(prefix)
  const stack: (string | undefined)[] = []
  let ticks = false
  const resolve = (p: string): string | undefined => {
    let t = p
    if (t === '~' || t.startsWith('~/')) {
      if (!homeDir) return undefined
      t = homeDir + t.slice(1)
    }
    t = t.replace(/\$(?:\{([A-Za-z_][A-Za-z0-9_]*)\}|([A-Za-z_][A-Za-z0-9_]*))/g, (m, a, b) => {
      const name = (a ?? b) as string
      if (name === 'HOME') return homeDir ?? m
      if (name === 'PWD') return cwd ?? m
      return vars.get(name) ?? m
    })
    return /[$`]/.test(t) ? undefined : t
  }
  /** An absolute, normalised folder or file for a word, against `base`; undefined when unknown. */
  const absOf = (raw: string, base: string | undefined): string | undefined => {
    const p = resolve(raw)
    if (p === undefined || p.startsWith('~')) return undefined
    if (p.startsWith('/')) return normAbs(p)
    return base === undefined ? undefined : normAbs(`${base}/${p}`)
  }
  const add = (raw: string | undefined, base: string | undefined) => {
    if (!raw || SKIP_TARGET.test(raw)) return
    const p = absOf(raw, base)
    if (p === undefined || SKIP_TARGET.test(p)) return
    const rel = relativeTo(root, p)
    if (rel !== undefined && !out.includes(`${prefix}/${rel}`)) out.push(`${prefix}/${rel}`)
  }
  for (const seg of segments) {
    // redirections anywhere in the segment, then the command's own words
    const words: string[] = []
    const redirs: (string | undefined)[] = []
    for (let i = 0; i < seg.toks.length; i++) {
      const tk = seg.toks[i] as Tok
      if (tk.k === 'word') words.push(tk.t)
      else {
        const target = seg.toks[i + 1]?.k === 'word' ? (seg.toks[i + 1] as Tok).t : undefined
        if (tk.k === 'out') redirs.push(target)
        if (target !== undefined) i += 1
      }
    }
    const opensSubst = seg.after === '$(' || seg.after === '`'
    let k = 0
    while (k < words.length && (ASSIGN.test(words[k] as string) || RESERVED.has(words[k] as string))) k++
    const assigns = words.slice(0, k).filter(a => ASSIGN.test(a))
    assigns.forEach((a, n) => {
      const eq = a.indexOf('=')
      const val = opensSubst && k === words.length && n === assigns.length - 1 ? undefined : resolve(a.slice(eq + 1))
      if (val === undefined) vars.delete(a.slice(0, eq))
      else vars.set(a.slice(0, eq), val)
    })
    for (const r of redirs) add(r, cwd)
    const cmd = (words[k] ?? '').replace(/^.*\//, '')
    const args = words.slice(k + 1)
    const plain = args.filter(a => !a.startsWith('-'))
    if (cmd === 'cd' || cmd === 'pushd' || cmd === 'popd') {
      const subshell = seg.before === '|' || seg.before === '|&' || seg.after === '|' || seg.after === '|&' || seg.after === '&'
      if (!subshell) {
        const rest = args.filter(a => !CD_OPT.test(a))
        if (cmd === 'popd' || opensSubst || rest[0] === '-') cwd = undefined
        else if (rest.length === 0) cwd = homeDir ? normAbs(homeDir) : undefined
        else cwd = absOf(rest[0] as string, cwd)
      }
    } else if (cmd === 'git') {
      // the subcommand is the first word that is no option (nor the value of -C / -c); each -C moves this command's folder only
      let dir = cwd
      let j = 0
      while (j < args.length && (args[j] as string).startsWith('-')) {
        if (args[j] === '-C') dir = absOf(args[j + 1] ?? '', dir)
        j += args[j] === '-C' || args[j] === '-c' ? 2 : 1
      }
      if (args[j] === 'commit' && dir !== undefined && (dir === normAbs(prefix) || relativeTo(root, dir) !== undefined)) {
        const call: CommitCall = { dir, all: false, amend: false, pathspecs: [] }
        let past = false
        for (let m = j + 1; m < args.length; m++) {
          const a = args[m] as string
          if (past || !a.startsWith('-')) {
            const p = absOf(a, dir)
            if (p !== undefined) call.pathspecs.push(p)
          } else if (a === '--') past = true
          else if (a === '--all') call.all = true
          else if (a === '--amend') call.amend = true
          else if (COMMIT_VALUE_LONG.has(a)) m += 1
          else if (!a.startsWith('--') && a.length > 1) {
            for (let c = 1; c < a.length; c++) {
              const ch = a[c] as string
              if (ch === 'a') call.all = true
              else if (COMMIT_VALUE_SHORT.includes(ch)) {
                if (c === a.length - 1) m += 1
                break
              }
            }
          }
        }
        commits.push(call)
      }
    } else if (cmd === 'tee') {
      for (const p of plain) add(p, cwd)
    } else if (cmd === 'sed' || cmd === 'gsed') {
      const inPlace = args.some(a => a.startsWith('--in-place') || /^-[A-Za-z]*i/.test(a))
      if (inPlace) {
        // BSD: `-i ''` / `-i .bak` take the next word as the backup suffix
        const suffixAt = args.findIndex((a, n) => /^-[A-Za-z]*i$/.test(a) && n + 1 < args.length && BSD_SUFFIX.test(args[n + 1] as string))
        const rest = args.filter((_, n) => suffixAt < 0 || n !== suffixAt + 1)
        const restPlain = rest.filter(a => !a.startsWith('-'))
        const scripted = rest.some(a => a === '-e' || a === '-f' || a.startsWith('--expression') || a.startsWith('--file'))
        const eArg = rest.reduce<string[]>((acc, a, j) => (a === '-e' || a === '-f' ? [...acc, rest[j + 1] as string] : acc), [])
        const files = restPlain.filter(a => !eArg.includes(a))
        for (const p of scripted ? files : files.slice(1)) add(p, cwd)
      }
    } else if (cmd === 'cp' || cmd === 'mv' || cmd === 'install') {
      const t = args.findIndex(a => a === '-t' || a === '--target-directory')
      if (t >= 0) add(args[t + 1], cwd)
      else add(plain.at(-1), cwd)
    }
    if (seg.after === '(' || seg.after === '$(') stack.push(cwd)
    else if (seg.after === '`') {
      if (ticks) cwd = stack.pop()
      else stack.push(cwd)
      ticks = !ticks
    } else if (seg.after === ')' && stack.length > 0) cwd = stack.pop()
  }
  return { paths: out, commits }
}

/** The files a Bash command writes under the root, and whether it runs `git commit` in the root's repo. */
export function bashWrites(command: string, root: string, home?: string): { paths: string[]; commit: boolean } {
  const r = scan(command, root, home)
  return { paths: r.paths, commit: r.commits.length > 0 }
}

/** MOD-9: the `git commit`s a command runs in the root's repo (the cwd in force after any cd, or the `-C` folder); one in a repo outside the root, or in an unknown folder, is not listed. */
export const bashCommits = (command: string, root: string, home?: string): CommitCall[] => scan(command, root, home).commits
