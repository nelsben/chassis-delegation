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
/** One clock wait: well inside the hook's own 10-second budget. */
export const POLL_MS = 5000

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

export const stillVerifying = (label: string, seconds: number): string => `${label}: still verifying after ${seconds}s; call verdict again`
export const noSuchAttempt = (label: string): string => `${label}: no attempt recorded for this task in this session's records; check the task id`

/** What the brain is told, with wakes off, under a dispatch's spawn block. */
export const verdictRule = (task: string): string => `When this worker hands back, call the verdict tool with task=${task} in that turn, before ending it.`

/** The "Delegation state" posture line while a worker runs or awaits its verdict, wakes off. */
export const VERDICT_POSTURE =
  'Posture: when a background worker hands back, call the verdict tool with task=<id> in that turn, before ending it; it returns the verdict once the verifier has judged it. Nothing wakes you later.'

/** The dashboard's open-item wording for a worker awaiting its verdict: the tool when wakes are off, else the old words. */
export const verifyingTail = (task: string, verdictTool: boolean): string => (verdictTool ? `call the verdict tool with task=${task}` : 'the verdict lands on its own')
