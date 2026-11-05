// MOD-16: what a worker is called in its Bash environment. Workers inherit the
// brain's session id, so a lock keyed on role + session id (a vendored
// lock script) cannot tell two sibling workers apart. The mod's tool.call hook
// runs every recorded worker's Bash command behind `export CHASSIS_SESSION_ID=…`,
// which this module builds. Pure: no `$`.

/** The part of an attempt record the identity is made of. */
export type IdentityRecord = { task: string; subtask: string; attempt: number }

export type WorkerIdentity = {
  /** `CHASSIS_SESSION_ID` (`<task>-a<attempt>`, `<task>.<subtask>-a<attempt>` for a subtask other than main), `CHASSIS_TASK`, `CHASSIS_ATTEMPT`. */
  env: { CHASSIS_SESSION_ID: string; CHASSIS_TASK: string; CHASSIS_ATTEMPT: string }
  /** `export NAME=value …; `, values shell-quoted: put it in front of a command and the command runs with `env` set. */
  prefix: string
}

/** Characters a POSIX shell reads as a plain word: left bare. Anything else is single-quoted. */
const PLAIN = /^[A-Za-z0-9_@%+:,./-]+$/

/** A value as one shell word. */
export const shellQuote = (value: string): string => (PLAIN.test(value) ? value : `'${value.replace(/'/g, `'\\''`)}'`)

/** The identity of one attempt of one worker: the env map and the prefix that sets it. */
export function workerIdentity(rec: IdentityRecord): WorkerIdentity {
  const sub = rec.subtask && rec.subtask !== 'main' ? `.${rec.subtask}` : ''
  const env = {
    CHASSIS_SESSION_ID: `${rec.task}${sub}-a${rec.attempt}`,
    CHASSIS_TASK: rec.task,
    CHASSIS_ATTEMPT: String(rec.attempt),
  }
  const words = Object.entries(env).map(([name, value]) => `${name}=${shellQuote(value)}`)
  return { env, prefix: `export ${words.join(' ')}; ` }
}

/**
 * Does the command assign `CHASSIS_SESSION_ID` itself (`X=… cmd`, `export X=…`,
 * `env X=… cmd`)? Read off the text: a mention inside quotes counts too, which
 * errs toward leaving the command as typed. Reading the variable does not count.
 */
export const setsSessionId = (command: string): boolean => /(?:^|[^A-Za-z0-9_$])CHASSIS_SESSION_ID=/.test(command)

/** The command to run for a worker: behind its identity prefix, unless it is empty or sets `CHASSIS_SESSION_ID` itself. */
export const withIdentity = (command: string, rec: IdentityRecord): string =>
  command.trim() === '' || setsSessionId(command) ? command : workerIdentity(rec).prefix + command

// ---- MOD-279: auto mode ------------------------------------------------------------------------
// In auto mode the host reviews each tool call and refuses one a hook changed after the review ("a hook changed this
// call's input after auto mode reviewed it"). The identity prefix is such a change, so a worker spawned in auto mode
// runs its Bash as typed, and a worker whose rewritten call is refused anyway is latched to run as typed from then on.

/** The permission mode (the parent's, which a subagent inherits) in which the host reviews each call. */
export const isAutoMode = (permissionMode: string | undefined): boolean => permissionMode === 'auto'

/** MOD-321: the mode a call runs in: the live one (read off the classic hook events) when it is a non-empty string, else the spawn row's. */
export const effectiveMode = (live: string | undefined, spawn: string | undefined): string | undefined => (typeof live === 'string' && live !== '' ? live : spawn)

/** The end of the spawn notice of a worker started in auto mode. */
export const AUTO_NOTICE = ' · auto mode: Bash runs as typed (no CHASSIS_SESSION_ID)'

/** The one trailing line on the result of a call the host refused after the mod rewrote it. */
export const LATCH_LINE = "(chassis-delegation: auto mode cannot review a rewritten command; this worker's Bash now runs as typed, without CHASSIS_SESSION_ID — run it again)"

/** Does the text say a hook changed the call's input after the host reviewed it? */
export const saysInputChanged = (text: unknown): boolean => typeof text === 'string' && /changed this call's input/.test(text)

/** MOD-321: does a classic failure event's `error` say the host refused the call as changed after review? */
export const isHostRefusalError = (error: unknown): boolean => typeof error === 'string' && saysInputChanged(error)

/** The words of a tool result: core's `text`, else a string `result`. */
export const resultWords = (out: { text?: unknown; result?: unknown }): string | undefined => (typeof out.text === 'string' ? out.text : typeof out.result === 'string' ? out.result : undefined)

/** What a tool result says when the host refused the call: its deny text, else the words of an error that says the input was changed after review (an ordinary failed command is no host refusal). */
export function hostRefusalText(out: { deny?: unknown; isError?: unknown; text?: unknown; result?: unknown }): string | undefined {
  if (typeof out.deny === 'string') return out.deny
  const words = resultWords(out)
  if (out.isError === true && words !== undefined && saysInputChanged(words)) return words
  return undefined
}

/** A hand-back's sha the verifier can use: not missing, `unknown` or `none`. */
export const usableSha = (sha: string | undefined): boolean => sha !== undefined && !['', 'unknown', 'none'].includes(sha.trim().toLowerCase())

/** `blocked by environment: Bash refused by the host (<first 80 chars of the refusal>)`. */
export const blockedByEnvironment = (refusal: string): string => `blocked by environment: Bash refused by the host (${refusal.replace(/\s+/g, ' ').trim().slice(0, 80)})`

// MOD-322: a refusal the tool.call chain never returned through bumps n and not attempted, so every counted refusal is n at or above attempted.
export const allRefused = (n: number, attempted: number): boolean => n >= 1 && n >= attempted
