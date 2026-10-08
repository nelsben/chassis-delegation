// chassis-delegation's $.state contract: the values the delegation band and
// pane (SPEC parts 3-4) read. The store (`delegation.tasks.<task-id>`) is the
// durable record; these are the session's live view of it. `band` and
// `dashboard` are what the two drawings read (4A, 4B): written by the hooks
// on every change, never while drawing.

/** One worker attempt as the band lists it. */
export type DelegationWorker = {
  task: string
  subtask: string
  attempt: number
  kind: 'spawn' | 'resume'
  tier: string
  alias: string
  agentId?: string
  /** `pending` until its report is judged, then the verdict. */
  verdict: string
  /** ms since the epoch at spawn or resume. */
  at: number
}

/** The latest verdict the mod handed back. */
export type DelegationVerdict = {
  task: string
  attempt: number
  verdict: string
  next: string
  at: number
  /** The full verdict text (the verdict line and the verifier's claim lines), whatever the verbosity. */
  text?: string
}

/** A briefed spawn the scheduler (part 2F) holds until a worker slot frees. */
export type QueuedSpawn = {
  prompt: string
  description: string
  subagentType: string
  /** The caller's model, kept for the record; the start omits it so the spawn hook picks. */
  model?: string
  cwd?: string
  task: string
  subtask?: string
  /** ms since the epoch when it was queued. */
  at: number
}

/** One line of the band above the prompt (4A); the pane's "Open items" lists the same. */
export type BandItem =
  | {
      kind: 'running'
      task: string
      tier: string
      alias: string
      /** ms since the epoch at spawn or resume: the band draws the time since. */
      at: number
      /** Dollars the attempt's finished turns cost (3B); null on an unpriced model; absent before its first turn ends. */
      usd?: number | null
      /** `building` (or the brief's purpose) while it runs, `verifying` once it handed back. */
      phase: string
      agentId?: string
    }
  | { kind: 'decision'; task: string; text: string; next: string }
  | { kind: 'queued'; task: string; position: number }
  | { kind: 'eval-failed'; tier: string; pass?: number; total?: number; at: number; sha: string }
  | { kind: 'runner'; what: string; at: number }

/** One of the pane's six blocks (4B). */
export type DashboardBlock = {
  key: string
  heading: string
  /** This session's number line. */
  number: string
  /** Extra lines under the number (Owed work: when and what each run gave). */
  detail: string[]
  /** One value per session, oldest first, the last 14 sessions; null where nothing was measured. */
  series: (number | null)[]
  /** What the sparkline shows, for a reader that cannot see it. */
  alt: string
}

/** What the pane draws besides the open items (which it reads from `band`). */
export type DashboardModel = { blocks: DashboardBlock[]; sessions: number }

declare module 'claude-code' {
  interface PluginState {
    'chassis-delegation': {
      workers: DelegationWorker[]
      status: string
      lastVerdict: DelegationVerdict | null
      queue: QueuedSpawn[]
      band: BandItem[]
      dashboard: DashboardModel | null
      /** GH-112: cumulative session dollars sampled every 15 s while a worker is live or queued, every 60 s otherwise; the last 240 points. */
      spend: { t: number; usd: number }[]
    }
  }
}
