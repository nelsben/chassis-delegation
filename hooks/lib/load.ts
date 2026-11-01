// MOD-230 (#323): a busy machine is named as such. Pure: no `$`.
// The 1-minute load average and the core count are read from the text of two commands (macOS:
// `sysctl -n vm.loadavg hw.ncpu`) or a file and a command (Linux: /proc/loadavg and `nproc`).
// A machine is loaded when the 1-minute load is at least LOAD_FACTOR times the cores. Every
// function here fails open: text that does not parse reads as "not loaded", never as an error.
import { isEngineGate, resolveGateRuns } from './gates'
import { parseHeader } from './brief'

/** Loaded at this many times the core count (1-minute load). */
export const LOAD_FACTOR = 2

/** The exact argvs the load read may run (allow.ts holds the same two). */
export const SYSCTL_LOAD_ARGV = ['sysctl', '-n', 'vm.loadavg', 'hw.ncpu'] as const
export const NPROC_ARGV = ['nproc'] as const
export const PROC_LOADAVG = '/proc/loadavg'

export type LoadReading = { load: number; cores: number }

const num = (s: string | undefined): number | undefined => {
  if (s === undefined || !/^\d+(\.\d+)?$/.test(s)) return undefined
  const n = Number(s)
  return Number.isFinite(n) ? n : undefined
}
const cores = (s: string | undefined): number | undefined => {
  const n = num((s ?? '').trim())
  return n !== undefined && Number.isInteger(n) && n >= 1 ? n : undefined
}

/** macOS: `{ 1.23 4.56 7.89 }` on one line, then the core count on the next. */
export function parseSysctlLoad(text: string): LoadReading | undefined {
  if (typeof text !== 'string') return undefined
  const lines = text.split('\n').map(l => l.trim()).filter(l => l !== '')
  const m = /^\{\s*(\d+(?:\.\d+)?)\s+\d+(?:\.\d+)?\s+\d+(?:\.\d+)?\s*\}$/.exec(lines[0] ?? '')
  const load = num(m?.[1])
  const n = cores(lines[1])
  return load !== undefined && n !== undefined && lines.length === 2 ? { load, cores: n } : undefined
}

/** Linux: /proc/loadavg (`0.52 0.58 0.59 1/467 12345`) and the `nproc` output. */
export function parseProcLoad(loadavg: string, nproc: string): LoadReading | undefined {
  if (typeof loadavg !== 'string' || typeof nproc !== 'string') return undefined
  const load = num(loadavg.trim().split(/\s+/)[0])
  const n = cores(nproc)
  return load !== undefined && n !== undefined ? { load, cores: n } : undefined
}

export const isLoaded = (r: LoadReading | undefined): r is LoadReading => r !== undefined && r.load >= LOAD_FACTOR * r.cores

/** The words a red or timed-out gate gains on a loaded machine; the verdict itself does not change. */
export const loadedWords = (r: LoadReading, id?: string): string =>
  `machine loaded (load ${r.load} on ${r.cores} cores): may be load, not the change; re-run with /dispatch ${id ?? '<ID>'} --verify <sha> once it drops`

/** True when a brief's gate resolves to a command that runs the engine suite (the one the engine-gate lock serializes). */
export function briefHasEngineGate(briefText: string, gateMap: Readonly<Record<string, string>>): boolean {
  const gate = parseHeader(briefText)?.gate
  return resolveGateRuns(gate, gateMap, () => true, '/f', '/w', '/o').runs.some(r => isEngineGate(r.argv))
}

/** `<k> lanes share the engine gate; it runs one at a time: expect verdict waits` for 3 or more, else none. */
export const engineLanesLine = (k: number): string | undefined => (k >= 3 ? `${k} lanes share the engine gate; it runs one at a time: expect verdict waits` : undefined)

/** MOD-252: the slots a loaded machine allows when loadThrottle is on: half, rounded down, never below 1. */
export const throttledSlots = (slots: number): number => Math.max(1, Math.floor(slots / 2))

/** MOD-252: the line a claim held by the load carries; the load is shown rounded to one decimal. */
export const heldLoadLine = (r: LoadReading): string => `held: machine loaded (${Math.round(r.load * 10) / 10}/${r.cores})`
