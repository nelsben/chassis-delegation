// GH-2 (GH-2): where a worker's hand-back reaches the mod.
//
// A worker that ends its run with SubagentHandback leaves its report in that
// call's `message`, not in its turn's answer. Foreground, the Agent result
// carries it (`handbackReport.text`). Background, `turn.complete` carries the
// answer alone, and a `tool.call` hook for SubagentHandback (a tool the
// engine's tool list does not name) saw nothing in the live runs of GH-2.
// The call sits in the worker's own transcript, which
// `$.session.messages({ agentId })` reads. Pure: the caller reads the
// transcript and hands the rows in.

export const HANDBACK_TOOL = 'SubagentHandback'

/** One transcript row, as `$.session.messages({ agentId })` gives it: the fields read here. */
export type TranscriptRow = {
  role?: unknown
  text?: unknown
  toolUses?: unknown
  toolResults?: unknown
}

type ToolUse = { tool?: unknown; input?: unknown; isError?: unknown }

const isPrompt = (r: TranscriptRow) => r.role === 'user' && !(Array.isArray(r.toolResults) && r.toolResults.length > 0)

/**
 * The hand-back messages of the run the transcript ends on, in order: each
 * SubagentHandback call's `message` after the run's prompt (the last user row
 * that carries no tool results: the brief, or a resume). An earlier run's
 * hand-back is never read again, and a call that errored (refused, withheld)
 * delivered nothing, so it is left out.
 */
export function handbackMessages(rows: readonly TranscriptRow[]): string[] {
  let start = 0
  rows.forEach((r, i) => {
    if (isPrompt(r)) start = i + 1
  })
  const out: string[] = []
  for (const r of rows.slice(start)) {
    if (r.role !== 'assistant' || !Array.isArray(r.toolUses)) continue
    for (const use of r.toolUses as ToolUse[]) {
      if (use?.tool !== HANDBACK_TOOL || use.isError === true) continue
      const message = (use.input as { message?: unknown } | undefined)?.message
      if (typeof message === 'string' && message.trim() !== '') out.push(message)
    }
  }
  return out
}

/**
 * Everything a worker said at the end of its run, in the order it said it:
 * the turn's answer, then each hand-back (the SubagentHandback call ends the
 * run, so a delivered one is its last word). `extractReport` takes the last
 * `[[report]]` of it, so the last report wins across answer and hand-back. A
 * text met twice (one hand-back seen by two routes) is kept once.
 */
export function workerSaid(answer: string, handbacks: readonly string[]): string {
  const seen = new Set<string>()
  const parts: string[] = []
  for (const p of [answer, ...handbacks]) {
    if (!p || seen.has(p)) continue
    seen.add(p)
    parts.push(p)
  }
  return parts.join('\n')
}
