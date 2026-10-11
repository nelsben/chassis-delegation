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
