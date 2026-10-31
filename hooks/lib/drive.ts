// MOD-48: what the brain's own driving costs it. Each main-loop tool call is
// counted by what it did with the brain's context (run or poll, read, edit,
// spawn), the brain's average context per call is kept, and a command it keeps
// re-running or polling at a large context is named once a turn as worker work.
// Pure: no `$`.
import { priceFor, usdOf } from './cost'

export type DriveKind = 'run' | 'read' | 'edit' | 'spawn'
export type DriveRecord = {
  run: number
  read: number
  edit: number
  spawn: number
  /** Input + cache-read tokens of the turns that made calls. */
  ctxTokens: number
  /** The calls those turns made. */
  ctxCalls: number
}

export const emptyDrive = (): DriveRecord => ({ run: 0, read: 0, edit: 0, spawn: 0, ctxTokens: 0, ctxCalls: 0 })

/** Default context, in tokens, from which the warn row speaks. */
export const DRIVE_THRESHOLD_TOKENS = 200_000

const EDIT_TOOLS = ['Edit', 'Write', 'MultiEdit', 'NotebookEdit']
const SPAWN_TOOLS = ['Agent', 'Task', 'SendMessage']
const READ_COMMANDS = ['grep', 'egrep', 'fgrep', 'rg', 'sed', 'cat', 'ls', 'head', 'tail', 'find', 'wc', 'awk', 'cut', 'sort', 'jq', 'diff', 'stat', 'file', 'tree', 'less', 'cd', 'pwd', 'echo', 'test', 'which', 'tr', 'uniq', 'column']
const SKIP_COMMANDS = ['git', 'gh']

const SHELL_C = /(?:^|[\s;&|(\/])(?:ba|z|da|k)?sh\s+(?:-\w+\s+)*-\w*c\s*$/

/**
 * MOD-225 (#305): the command with its prose cut out. Heredoc bodies (`<<WORD`, `<<'WORD'`, `<<-WORD`, up to the
 * closing word) are removed and single- or double-quoted strings are emptied; the quote marks stay. A quoted body
 * that follows `bash|sh|zsh -c` is kept, since it is a shell run. Pure, one pass, no regex over the whole text.
 */
export function cutText(command: string): string {
  let out = ''
  const pending: { word: string; dash: boolean }[] = []
  let i = 0
  const n = command.length
  while (i < n) {
    const c = command[i]
    if (c === '\\') {
      out += command.slice(i, i + 2)
      i += 2
    } else if (c === '<' && command.startsWith('<<', i) && command[i + 2] !== '<' && command[i + 2] !== '(' && command[i - 1] !== '<') {
      const m = /^<<(-?)\s*(?:'([^']*)'|"([^"]*)"|\\?([A-Za-z_][A-Za-z0-9_]*))/.exec(command.slice(i))
      if (m) {
        pending.push({ word: m[2] ?? m[3] ?? m[4] ?? '', dash: m[1] === '-' })
        out += `<<${m[1]}`
        i += m[0].length
      } else {
        out += '<<'
        i += 2
      }
    } else if (c === '\n' && pending.length > 0) {
      out += '\n'
      i++
      for (const h of pending) {
        for (;;) {
          if (i >= n) break
          let end = command.indexOf('\n', i)
          if (end < 0) end = n
          const line = command.slice(i, end)
          i = Math.min(end + 1, n)
          if ((h.dash ? line.replace(/^\t+/, '') : line) === h.word) break
        }
      }
      pending.length = 0
    } else if (c === "'" || c === '"') {
      let j = i + 1
      while (j < n && command[j] !== c) j += c === '"' && command[j] === '\\' ? 2 : 1
      const close = Math.min(j, n - 1)
      if (SHELL_C.test(out)) out += command.slice(i, close + 1).replace(/^["']/, '$& ')
      else out += c + (j < n ? c : '')
      i = close + 1
    } else {
      out += c
      i++
    }
  }
  return out
}

/** A command that waits on something: an until or while loop, or a sleep. Heredoc bodies and quoted text are not looked at. */
export const isPoll = (command: string): boolean => {
  const c = cutText(command)
  return /(^|[\s;&|(])until\s/.test(c) || /(^|[\s;&|(])while\s[^]*\bsleep\b/.test(c) || /(^|[\s;&|(])sleep\s+\d/.test(c)
}

const firstWord = (command: string): string => {
  const words = command.trim().split(/\s+/)
  const i = words.findIndex(w => !/^[A-Za-z_][A-Za-z0-9_]*=/.test(w))
  return (i >= 0 ? words[i] : '').replace(/^.*\//, '')
}

/**
 * The kind of a main-loop call, or undefined when it is none of the four.
 * `writes`: a Bash command that writes into the root; `repeat`: the command already ran this turn.
 */
export function callKind(tool: string, input: { command?: unknown; run_in_background?: unknown }, writes = false, repeat = false): DriveKind | undefined {
  if (EDIT_TOOLS.includes(tool)) return 'edit'
  if (SPAWN_TOOLS.includes(tool)) return 'spawn'
  if (tool === 'Read') return 'read'
  if (tool !== 'Bash') return undefined
  const command = typeof input.command === 'string' ? input.command : ''
  if (input.run_in_background === true || isPoll(command) || repeat) return 'run'
  if (writes) return 'edit'
  const w = firstWord(command)
  if (SKIP_COMMANDS.includes(w)) return undefined
  if (READ_COMMANDS.includes(w)) return 'read'
  return 'run'
}

/** MOD-239: `a` plus `b`, field by field; none when both are none. */
export const addDrive = (a: DriveRecord | undefined, b: DriveRecord | undefined): DriveRecord | undefined => {
  if (!a || !b) return a ?? b
  return { run: a.run + b.run, read: a.read + b.read, edit: a.edit + b.edit, spawn: a.spawn + b.spawn, ctxTokens: a.ctxTokens + b.ctxTokens, ctxCalls: a.ctxCalls + b.ctxCalls }
}

export const driveCall = (r: DriveRecord | undefined, kind: DriveKind): DriveRecord => {
  const prev = r ?? emptyDrive()
  return { ...prev, [kind]: prev[kind] + 1 }
}

/** A finished main-loop turn that made `calls` calls: its input + cache-read tokens. */
export const driveTurn = (r: DriveRecord | undefined, contextTokens: number, calls: number): DriveRecord => {
  const prev = r ?? emptyDrive()
  return calls > 0 ? { ...prev, ctxTokens: prev.ctxTokens + contextTokens, ctxCalls: prev.ctxCalls + calls } : prev
}

const tokText = (n: number): string => (n >= 1_000_000 ? `${(n / 1_000_000).toFixed(1)}M` : n >= 1000 ? `${Math.round(n / 1000)}K` : String(n))

/** `brain calls: 3 run-or-poll · 1 read · average context 100K per call`; none when nothing was counted. */
export function driveLines(r: DriveRecord | undefined): string[] {
  if (!r) return []
  const parts: string[] = []
  if (r.run > 0) parts.push(`${r.run} run-or-poll`)
  if (r.read > 0) parts.push(`${r.read} read`)
  if (r.edit > 0) parts.push(`${r.edit} edit`)
  if (r.spawn > 0) parts.push(`${r.spawn} spawn`)
  if (parts.length === 0) return []
  if (r.ctxCalls > 0) parts.push(`average context ${tokText(Math.round(r.ctxTokens / r.ctxCalls))} per call`)
  return [`brain calls: ${parts.join(' · ')}`]
}

// ---- the warn row ---------------------------------------------------------------------

/** A key longer than this is cut and hashed, so the store stays small. */
const KEY_MAX = 120

const hashOf = (text: string): string => {
  let h = 5381
  for (let i = 0; i < text.length; i++) h = ((h * 33) ^ text.charCodeAt(i)) >>> 0
  return h.toString(36)
}

const ASSIGNMENT = /^[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|\S*)\s*(?:;|&&)?\s*/
const CD = /^cd\s+(?:"[^"]*"|'[^']*'|\S+)\s*&&\s*/

/**
 * MOD-119 (#187): what "the same command" means. Leading NAME=value assignments (each optionally followed by `;` or
 * `&&`) and a leading `cd <dir> &&` are dropped, whitespace is squeezed, and the whole remainder is the key (hashed
 * when long). A command that is nothing but an assignment keeps its own text.
 */
export function commandKey(command: string): string {
  const whole = cutText(command).trim().replace(/\s+/g, ' ')
  let rest = whole
  for (;;) {
    const next = rest.replace(ASSIGNMENT, '').replace(CD, '')
    if (next === rest) break
    rest = next
  }
  const key = rest === '' ? whole : rest
  return key.length > KEY_MAX ? `${key.slice(0, 80)}~${hashOf(key)}` : key
}

/** `runs`: per key, the runs that count toward the row and the hash of the last known output. */
export type Watch = { commands: string[]; warned: boolean; runs?: Record<string, { count: number; out?: string; len?: number }> }
export const emptyWatch = (): Watch => ({ commands: [], warned: false, runs: {} })

/** True when `command` has already run in the watch (this turn). */
export const ranBefore = (w: Watch, command: string): boolean => w.commands.includes(commandKey(command))

/**
 * MOD-119: the output of a Bash call that has finished. A repeat whose output differs from the last same-key call is
 * a command making progress, so it starts the count again; an unchanged output keeps counting.
 */
export function driveOutput(w: Watch, command: string, output: string): Watch {
  const key = commandKey(command)
  const runs = { ...(w.runs ?? {}) }
  const prev = runs[key] ?? { count: w.commands.filter(c => c === key).length }
  const len = output.length
  const out = outputHash(output)
  const changed = prev.out !== undefined && (prev.len !== len || prev.out !== out)
  runs[key] = { count: changed ? 1 : prev.count, out, len }
  return { ...w, runs }
}

/** MOD-239: the most a hash reads of one end of a long output. */
const SAMPLE = 8192

/** The hash of an output: all of it when short, else its first and last 8 KB and its length (a changed length is told apart by the length). */
const outputHash = (text: string): string => (text.length <= 2 * SAMPLE ? hashOf(text) : hashOf(`${text.slice(0, SAMPLE)}\u0000${text.length}\u0000${text.slice(-SAMPLE)}`))

/** MOD-239: true when the next run of `command` could raise the row: its third run of the same key, or a poll. */
export function driveSpeaks(w: Watch, command: string): boolean {
  const key = commandKey(command)
  const prev = w.runs?.[key]
  const count = (prev ? prev.count : w.commands.filter(c => c === key).length) + 1
  return count >= 3 || isPoll(command)
}

/** MOD-99 (#165): the move the polling row names: card the resource it uses, wait with the verdict tool, else the guide section. */
export function nudgeMove(command: string, resources: readonly string[] = [], waitingOnWorker = false): string {
  const lower = command.toLowerCase()
  const named = resources.find(r => r !== '' && lower.includes(r.toLowerCase()))
  if (named !== undefined) return `Move: card it with resources: [${named}] so one worker drives it.`
  if (waitingOnWorker) return 'Move: wait with the verdict tool (it returns when the worker hands back) instead of polling.'
  return 'A standard card would drive this loop from a small context on a cheaper model; add resources for a one-client app so workers take turns (see docs/guide.md#one-client-resources).'
}

/**
 * One Bash command of the brain's turn. The row speaks when the context is at or above the threshold and the
 * command is the third run of the same command (see commandKey) whose output did not change, or polls; at most once a turn.
 */
export function driveStep(
  w: Watch,
  i: { command: string; context: number; threshold: number; model?: string; enabled: boolean; resources?: readonly string[]; waitingOnWorker?: boolean },
): { state: Watch; row?: string } {
  const key = commandKey(i.command)
  const prev = w.runs?.[key]
  const count = (prev ? prev.count : w.commands.filter(c => c === key).length) + 1
  const state: Watch = { commands: [...w.commands, key], warned: w.warned, runs: { ...(w.runs ?? {}), [key]: { count, ...(prev?.out !== undefined ? { out: prev.out, len: prev.len } : {}) } } }
  const poll = isPoll(i.command)
  if (!i.enabled || w.warned || i.context < i.threshold || !(count >= 3 || poll)) return { state }
  const price = priceFor(i.model)
  const cost = price ? ` (about $${usdOf({ in: 0, out: 0, cacheRead: i.context, cacheWrite: 0 }, price).toFixed(2)} a call at that context on ${i.model})` : ''
  const what = poll && count < 3 ? `polled with "${key}"` : `ran "${key}" ${count} times this turn`
  return { state: { ...state, warned: true }, row: `chassis-delegation: the brain ${what} at ${tokText(i.context)} context${cost}. ${nudgeMove(i.command, i.resources, i.waitingOnWorker)}` }
}

// ---- the fresh-session row (MOD-53) ---------------------------------------------------

/** Default context, in tokens, from which the brain is told to start a fresh session. */
export const FRESH_SESSION_TOKENS = 400_000

const kText = (n: number): string => `${Math.round(n / 1000)}K`

/** At or above `threshold` the row that says a fresh session is cheaper; none below it, or when `threshold` is 0 (off). */
export function freshSessionRow(context: number, threshold: number): string | undefined {
  if (!(threshold > 0) || context < threshold) return undefined
  return `chassis-delegation: brain context ${kText(context)} (freshSessionTokens ${kText(threshold)}): start a fresh session at the next phase boundary; cards, the ledger and lessons carry over`
}
