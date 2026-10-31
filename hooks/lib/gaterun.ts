// MOD-229 (#323): the verifier's gate as a spawned child under the mod's own ceiling. A
// `$.process.run` call is capped at 10 minutes by the host; `$.process.spawn` is not, so a gate is
// spawned (register.ts spawnGate) and ended at gateTimeoutMinutes (1 to 120, default 30). Here: the
// output kept of it (4 MiB a stream, as run keeps), the words of a gate stopped at the ceiling, the
// gate id a run belongs to, and the "verifying (gate <id> running <m> min)" row. Pure: no `$`.
import { gateCommandTemplates } from './gates'

/** The most one stream of a gate's output keeps, as `$.process.run` does: 4 MiB, counted in UTF-8 bytes. */
export const GATE_OUTPUT_MAX_BYTES = 4 * 1024 * 1024

const MIN_MS = 60_000

const charBytes = (cp: number): number => (cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4)

/** `text` cut to at most `max` UTF-8 bytes, never inside a character, and the bytes it kept. */
export function cutToBytes(text: string, max: number): { text: string; bytes: number } {
  let bytes = 0
  let end = 0
  for (const ch of text) {
    const b = charBytes(ch.codePointAt(0) as number)
    if (bytes + b > max) return { text: text.slice(0, end), bytes }
    bytes += b
    end += ch.length
  }
  return { text, bytes }
}

export type GateStream = 'stdout' | 'stderr'
export type GateOutput = {
  add: (stream: GateStream, text: string) => void
  stdout: () => string
  stderr: () => string
  /** True once a stream passed its cap and the rest of it was read and dropped. */
  truncated: (stream: GateStream) => boolean
}

/** Collects a spawned gate's pieces per stream, the first `max` bytes of each; the rest is read and dropped. */
export function gateOutput(max = GATE_OUTPUT_MAX_BYTES): GateOutput {
  const parts: Record<GateStream, string[]> = { stdout: [], stderr: [] }
  const used: Record<GateStream, number> = { stdout: 0, stderr: 0 }
  const cut: Record<GateStream, boolean> = { stdout: false, stderr: false }
  return {
    add(stream, text) {
      if (text === '' || cut[stream]) return
      const kept = cutToBytes(text, max - used[stream])
      if (kept.text !== '') parts[stream].push(kept.text)
      used[stream] += kept.bytes
      if (kept.text.length < text.length) cut[stream] = true
    },
    stdout: () => parts.stdout.join(''),
    stderr: () => parts.stderr.join(''),
    truncated: stream => cut[stream],
  }
}

/** A spawned child's end as run's exit code: a signal (code null) reads as 1, as `$.process.run` reads it. */
export const spawnExitCode = (r: { code: number | null }): number => r.code ?? 1

/** The ceiling in ms. */
export const ceilingMs = (minutes: number): number => minutes * MIN_MS

/**
 * Why a gate stopped at the ceiling: the words `gate ran past gateTimeoutMinutes (<n> min)`, then the runner's
 * `timed out after <ms> ms`, so the advice reads it as a gate stopped at the verifier's limit (MOD-96: time it by hand).
 */
export const pastCeiling = (minutes: number): string => `gate ran past gateTimeoutMinutes (${minutes} min); timed out after ${ceilingMs(minutes)} ms`

/** The gate id of the brief's `gate=` whose gateMap command made the run labelled `label`; the label when none did (a bare command). */
export function gateIdOf(gate: string | undefined, map: Readonly<Record<string, string>>, label: string): string {
  for (const id of (gate ?? '').split(',').map(s => s.trim()).filter(Boolean)) {
    const cmd = map[id]
    if (cmd === undefined) continue
    const t = gateCommandTemplates(cmd)
    if ('templates' in t && t.templates.some(words => words.join(' ') === label)) return id
  }
  return label
}

/** Where a verifier's gate is: waiting for the engine-gate lock, or running. `since` is when that phase began. */
export type GateProgress = { phase: 'lock'; since: number } | { phase: 'gate'; id: string; since: number }

/** Whole minutes from `since` to `now`, never below 0. */
export const minutesSince = (since: number, now: number): number => Math.max(0, Math.floor((now - since) / MIN_MS))

/** `verifying (gate test running 3 min)`, or `verifying (waiting for the engine gate 2 min)`: the lock wait is shown apart. */
export function gateProgressText(p: GateProgress, now: number): string {
  const m = minutesSince(p.since, now)
  return p.phase === 'lock' ? `verifying (waiting for the engine gate ${m} min)` : `verifying (gate ${p.id} running ${m} min)`
}
