// MOD-74: the rows that say which model a worker runs on, and the `running:` section of /delegation status. Pure text.

export type StartKind = 'started' | 'resumed' | 'queue'

/** `MOD-1 started · sonnet (standard) · attempt 1/2` (a resume says `resumed`, a queued start `started from queue`). */
export function startedRow(i: { label: string; alias: string; tier: string; attempt: number; budget: number; kind: StartKind }): string {
  const verb = i.kind === 'resumed' ? 'resumed' : i.kind === 'queue' ? 'started from queue' : 'started'
  return `chassis-delegation: ${i.label} ${verb} · ${i.alias} (${i.tier}) · attempt ${i.attempt}/${i.budget}`
}

/** `MOD-1 handed back · sonnet · 12 min · $1.40 · verifying`; `$?` while the spend is not known. */
export function handedBackRow(i: { label: string; alias: string; minutes: number; usd?: number }): string {
  const usd = i.usd !== undefined && Number.isFinite(i.usd) ? `$${i.usd.toFixed(2)}` : '$?'
  return `chassis-delegation: ${i.label} handed back · ${i.alias} · ${i.minutes} min · ${usd} · verifying`
}

/** silent suppresses the started and handed-back rows; line and full post them. */
export const postsRows = (verbosity: string): boolean => verbosity !== 'silent'

export type RunningWorker = { label: string; alias: string; tier: string; state: 'running' | 'verifying' | 'queued'; minutes: number; usd?: number }

/** `T-1 · sonnet (standard) · running · 12 min · $1.40` */
export function runningLine(w: RunningWorker): string {
  const usd = w.usd !== undefined && Number.isFinite(w.usd) ? `$${w.usd.toFixed(2)}` : '$?'
  return `${w.label} · ${w.alias} (${w.tier}) · ${w.state} · ${w.minutes} min · ${usd}`
}

/** The first lines of /delegation status: one per live, verifying or queued worker, then `brain: <model>`; `running: none · brain: <model>` when none. */
export function runningSection(workers: readonly RunningWorker[], brain: string | undefined): string[] {
  const b = brain && brain !== '' ? brain : 'unknown'
  if (workers.length === 0) return [`running: none · brain: ${b}`]
  return ['running:', ...workers.map(runningLine), `brain: ${b}`]
}
