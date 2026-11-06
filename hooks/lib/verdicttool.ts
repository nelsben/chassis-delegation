// MOD-64: the verdict tool. With wakes off (the default) the brain keeps the
// waiting inside the hand-back turn: it calls this tool, which returns the
// verdict row once the verifier has judged the task's latest attempt. Pure: no `$`.

/** The model-callable tool: `$.tool.register`'s spec. */
export const VERDICT_TOOL = {
  name: 'verdict',
  description:
    "Wait for a worker's verdict. When a background worker hands back, call this with its task id in that turn, before ending it: the verifier is still running, and this returns the verdict row (and any ready: line) as soon as it lands. If the verdict is already in it returns at once. If it is still verifying after waitSeconds it says so: call it again.",
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task id, e.g. BE-101' },
      subtask: { type: 'string', description: 'The subtask (default main)' },
      waitSeconds: { type: 'number', description: `How long to wait for the verdict, in seconds (default 600, at most 900)` },
    },
    required: ['task'],
    additionalProperties: false,
  },
} as const

/** The name the model calls it by: `mcp__<plugin>__<name>`. */
export const VERDICT_TOOL_NAME = 'mcp__chassis-delegation__verdict'

export const DEFAULT_WAIT_SECONDS = 600
export const MAX_WAIT_SECONDS = 900
/** One wait step, a `sleep` process (MOD-72): a `$.clock.sleep` would count against the hook's 10-second budget (HookBudget.ms); a process wait does not. */
export const POLL_MS = 5000

/**
 * MOD-246: the step of a wait that has run `elapsedMs` so far: 5 s for the first 30 s, 15 s until 2 minutes, then 30 s.
 * A wait ends within one step of the thing it waits for, and spawns about a quarter of the `sleep` processes of a fixed 5 s step.
 */
export function pollStep(elapsedMs: number): number {
  if (elapsedMs < 30_000) return POLL_MS
  if (elapsedMs < 120_000) return 15_000
  return 30_000
}

export type VerdictInput = { task: string; subtask: string; waitSeconds: number } | { error: string }

/** The tool's input: a task id, an optional subtask, a wait of 1 to 900 seconds (default 600). */
export function parseVerdictTool(input: Record<string, unknown>): VerdictInput {
  const task = input.task
  if (typeof task !== 'string' || task.trim() === '') return { error: 'verdict: task is required (a task id such as BE-101)' }
  if (input.subtask !== undefined && typeof input.subtask !== 'string') return { error: 'verdict: subtask must be a string' }
  if (input.waitSeconds !== undefined && (typeof input.waitSeconds !== 'number' || !Number.isFinite(input.waitSeconds))) return { error: 'verdict: waitSeconds must be a number' }
  const subtask = typeof input.subtask === 'string' && input.subtask.trim() !== '' ? input.subtask.trim() : 'main'
  const wait = typeof input.waitSeconds === 'number' ? Math.floor(input.waitSeconds) : DEFAULT_WAIT_SECONDS
  return { task: task.trim(), subtask, waitSeconds: Math.min(MAX_WAIT_SECONDS, Math.max(0, wait)) }
}

/**
 * The still-verifying line. MOD-301: `seconds` is the time actually waited, not the time asked for; `progress` is where the gate is
 * (MOD-229); `reason` ends the line in parentheses when the wait could not run (`wait unavailable: sleep did not run`).
 */
export const stillVerifying = (label: string, seconds: number, reason?: string, progress?: string): string =>
  `${label}: still verifying after ${seconds}s; call verdict again${progress ? ` · ${progress}` : ''}${reason ? ` (${reason})` : ''}`
/** MOD-301: why a wait ended at once: the `sleep` process could not run. */
export const SLEEP_UNAVAILABLE = 'wait unavailable: sleep did not run'
/** MOD-301: the line for an attempt that is pending with nothing verifying it; `sha` is the worktree head, else `none`. */
export const noVerifierRunning = (label: string, attempt: number, sha?: string): string =>
  `${label}: attempt ${attempt} pending, no verifier running; dispatch verify=${sha !== undefined && sha !== '' ? sha : 'none'}`
export const noSuchAttempt = (label: string): string => `${label}: no attempt recorded for this task in this session's records; check the task id`

/** What the brain is told, with wakes off, under a dispatch's spawn block. */
export const verdictRule = (task: string): string => `When this worker hands back, call the verdict tool with task=${task} in that turn, before ending it.`

/** The "Delegation state" posture line while a worker runs or awaits its verdict, wakes off. */
export const VERDICT_POSTURE =
  'Posture: when a background worker hands back, call the verdict tool with task=<id> in that turn, before ending it; it returns the verdict once the verifier has judged it. Nothing wakes you later.'

/** The dashboard's open-item wording for a worker awaiting its verdict: the tool when wakes are off, else the old words. */
export const verifyingTail = (task: string, verdictTool: boolean): string => (verdictTool ? `call the verdict tool with task=${task}` : 'the verdict lands on its own')

/** How long after a verdict a missing posted row is still the brief race between the claim and the store write in one hook. */
export const ROW_RACE_MS = 30_000

/** True while a claimed attempt's row may still be about to be stored; an older or undated verdict was posted before the row was kept. */
export const rowRaceOpen = (verdictAt: number | undefined, now: number): boolean => verdictAt !== undefined && now - verdictAt < ROW_RACE_MS

// ---- MOD-292 (#392): the branch before the ledger ---------------------------------------------------------
export type MergedVerdict = { kind: 'merged'; line: string; attempt: number; sha: string } | { kind: 'rows' }

/**
 * Decides the verdict tool's line from what git said (`ancestor`: the task's branch head, or an attempt sha, is on
 * origin/<default branch>) and the task's attempt rows. Merged: `<task>: merged at <sha7>`, whatever the rows say; no
 * next=resume, no agent, no spend. `sha`: the branch head when known, else the last row that names one.
 */
export function mergedVerdict(ancestor: boolean, rows: readonly { task: string; subtask: string; attempt: number; sha?: string }[], sha?: string): MergedVerdict {
  const last = rows.at(-1)
  if (!ancestor || !last) return { kind: 'rows' }
  const named = sha ?? [...rows].reverse().find(r => r.sha !== undefined && r.sha !== '')?.sha
  if (!named) return { kind: 'rows' }
  return { kind: 'merged', line: `${last.subtask === 'main' ? last.task : `${last.task}/${last.subtask}`}: merged at ${named.slice(0, 7)}`, attempt: last.attempt, sha: named }
}

/** A hand-back with a report after a pause-cap charge is judged on the same attempt: the cap changes the count, not the outcome. */
export const reopensAfterPauseCap = (pauseCharged: boolean | undefined, hasReport: boolean): boolean => pauseCharged === true && hasReport

// ---- MOD-297 (#336): a throw inside the tool comes back as text --------------------------------------------
/**
 * The line the verdict tool returns when its handler throws: the error's first line, and the band row's verdict and
 * next= when the row is already on the ledger. Never empty, so the brain's only read in the turn is not lost.
 */
export function verdictFailLine(task: string, error: string, row?: { verdict: string; next?: string }): string {
  const first = error.split('\n')[0]?.trim() || 'unknown error'
  const judged = row ? `; verdict ${row.verdict}${row.next !== undefined ? ` next=${row.next}` : ''}` : ''
  return `${task}: verdict failed: ${first}${judged}; the band line holds the row, or call verdict again`
}

/**
 * MOD-316: does `sha` count as landed work? Never when it is the dispatch base (`baseSha`): a head equal to the base is an
 * unbuilt worktree, and it is trivially an ancestor of origin/<default>. A short sha is compared as a prefix. No base
 * recorded: the old rule stands (true).
 */
export function landedSha(sha: string, baseSha: string | undefined): boolean {
  if (baseSha === undefined || baseSha === '' || sha === '') return true
  const a = sha.toLowerCase()
  const b = baseSha.toLowerCase()
  return !(a.startsWith(b) || b.startsWith(a))
}

/**
 * MOD-324: did a commit (committer time in seconds) predate the attempt's spawn (ms)? Such a commit can never be that
 * attempt's work. Committer time has second resolution, so a commit in the spawn's own second is not judged older (false):
 * it may have come after the spawn. A non-finite input is false.
 */
export function predatesSpawn(commitSecs: number, atMs: number): boolean {
  if (!Number.isFinite(commitSecs) || !Number.isFinite(atMs)) return false
  return (commitSecs + 1) * 1000 <= atMs
}
