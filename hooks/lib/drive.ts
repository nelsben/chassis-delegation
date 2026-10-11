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

/** A command that waits on something: an until or while loop, or a sleep. */
export const isPoll = (command: string): boolean => /(^|[\s;&|(])until\s/.test(command) || /(^|[\s;&|(])while\s[^]*\bsleep\b/.test(command) || /(^|[\s;&|(])sleep\s+\d/.test(command)

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

/** The first 60 characters of a command, whitespace squeezed: what "the same command" means. */
export const commandKey = (command: string): string => command.trim().replace(/\s+/g, ' ').slice(0, 60)

export type Watch = { commands: string[]; warned: boolean }
export const emptyWatch = (): Watch => ({ commands: [], warned: false })

/** True when `command` has already run in the watch (this turn). */
export const ranBefore = (w: Watch, command: string): boolean => w.commands.includes(commandKey(command))

/**
 * One Bash command of the brain's turn. The row speaks when the context is at or above the threshold and the
 * command is the third to share its first 60 characters, or polls; at most once a turn.
 */
export function driveStep(
  w: Watch,
  i: { command: string; context: number; threshold: number; model?: string; enabled: boolean },
): { state: Watch; row?: string } {
  const key = commandKey(i.command)
  const count = w.commands.filter(c => c === key).length + 1
  const state: Watch = { commands: [...w.commands, key], warned: w.warned }
  const poll = isPoll(i.command)
  if (!i.enabled || w.warned || i.context < i.threshold || !(count >= 3 || poll)) return { state }
  const price = priceFor(i.model)
  const cost = price ? ` (about $${usdOf({ in: 0, out: 0, cacheRead: i.context, cacheWrite: 0 }, price).toFixed(2)} a call at that context on ${i.model})` : ''
  const what = poll && count < 3 ? `polled with "${key}"` : `ran "${key}" ${count} times this turn`
  return {
    state: { ...state, warned: true },
    row: `chassis-delegation: the brain ${what} at ${tokText(i.context)} context${cost}. A standard card would drive this loop from a small context on a cheaper model; add resources for a one-client app so workers take turns.`,
  }
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
