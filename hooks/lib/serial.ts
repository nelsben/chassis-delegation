// MOD-92 (#168): the agent.spawn decision, one at a time and inside its budget.
// Three Agent calls in one message raise three agent.spawn hooks at once. Each
// decision reads the task's records, the slot count and the queue, then writes
// them back; run side by side they lost each other's writes and took the slots
// in whatever order their awaits finished. And the host gives each hook ten
// seconds of its OWN time (waits on `$` and `next` are free, a wait on another
// hook's promise is not), aborts `next.signal` past it and allows five seconds
// of linger: a decision that never looked at the signal ran on, twice in a row,
// and the host killed the hooks worker. This file holds the pure parts: the
// queue of turns, the stop (an abort or the budget) the decision's every step
// is raced against, and the one-line refusals. The host calls stay in
// register.ts, which passes the stop down the spawn path.

/** Runs one decision at a time, in the order they were asked for; a decision that throws does not stop the next. */
export type Turns = {
  run<T>(fn: () => Promise<T>): Promise<T>
  /** Decisions asked for and not yet finished (the one running included). */
  readonly waiting: number
}

export function turns(): Turns {
  let tail: Promise<unknown> = Promise.resolve()
  let waiting = 0
  return {
    run<T>(fn: () => Promise<T>): Promise<T> {
      waiting += 1
      const mine = tail.then(fn, fn)
      tail = mine.then(
        () => {
          waiting -= 1
        },
        () => {
          waiting -= 1
        },
      )
      return mine
    },
    get waiting() {
      return waiting
    },
  }
}

/** Why a decision was stopped: its hook's signal aborted, or its budget is nearly spent. */
export type StopWhy = 'abort' | 'budget'

/** Thrown into a stopped decision at its next step (or its pending one). */
export class Stopped extends Error {
  readonly why: StopWhy
  constructor(why: StopWhy) {
    super(`spawn decision stopped (${why})`)
    this.name = 'Stopped'
    this.why = why
  }
}

export const isStopped = (err: unknown): err is Stopped => err instanceof Stopped

/**
 * One decision's stop. Before `commit()` a stop ends the decision at once: `check()`
 * throws and every promise `race` holds rejects. `commit()` is the point of no return
 * (the subagent is about to start): it throws when already stopped, and after it a
 * stop only says so (`stopped`), so the start is recorded and the views are skipped.
 */
export type Stopper = {
  readonly stopped: StopWhy | undefined
  readonly committed: boolean
  /** Resolves when the decision is stopped, before or after commit: what work after the start races. */
  readonly settled: Promise<StopWhy>
  stop(why: StopWhy): void
  check(): void
  commit(): void
  race<T>(p: Promise<T>): Promise<T>
}

export function stopper(): Stopper {
  let why: StopWhy | undefined
  let committed = false
  let reject: (err: Stopped) => void = () => undefined
  let resolve: (why: StopWhy) => void = () => undefined
  const stoppedP = new Promise<never>((_, r) => {
    reject = r
  })
  stoppedP.catch(() => undefined)
  const settled = new Promise<StopWhy>(r => {
    resolve = r
  })
  return {
    settled,
    get stopped() {
      return why
    },
    get committed() {
      return committed
    },
    stop(w: StopWhy) {
      if (why !== undefined) return
      why = w
      if (!committed) reject(new Stopped(w))
      resolve(w)
    },
    check() {
      if (why !== undefined && !committed) throw new Stopped(why)
    },
    commit() {
      if (why !== undefined) throw new Stopped(why)
      committed = true
    },
    race<T>(p: Promise<T>): Promise<T> {
      if (committed) return p
      if (why !== undefined) {
        p.catch(() => undefined)
        return Promise.reject(new Stopped(why))
      }
      // a stop rejects stoppedP only before commit: a call raced before it and still under way after it is never taken back
      return Promise.race([p, stoppedP])
    },
  }
}

/** What a decision keeps in hand to return before its budget ends (the host's is 10 s, plus 5 s of linger). */
export const DECISION_RESERVE_MS = 2_500

/**
 * How long the decision may still wait before it must give up, from what its budget
 * has left; undefined when nothing meters it (Infinity, or no budget to read). At or
 * under 0 it gives up now.
 */
export function budgetDelay(remainingMs: number | undefined, reserveMs = DECISION_RESERVE_MS): number | undefined {
  if (remainingMs === undefined || !Number.isFinite(remainingMs)) return undefined
  return Math.max(0, Math.floor(remainingMs - reserveMs))
}

/** The refusal a spawn whose decision could not finish in budget gets: one line, and the Agent call works again. */
export const outOfTimeDeny = (id: string): string => `${id}: the spawn decision ran out of time; make the Agent call again`

/** The refusal (never seen by the brain: the call was abandoned above) a decision whose signal aborted returns. */
export const abortedDeny = (id: string): string => `${id}: the spawn was abandoned before its decision finished; nothing started`

/** What a spawn is called in those refusals: the header's task (and subtask), else the brief file's id, else `agent`. */
export function decisionId(task: string | undefined, subtask: string | undefined, briefPath: string | undefined): string {
  if (task) return subtask && subtask !== 'main' ? `${task}/${subtask}` : task
  const base = briefPath?.split('/').pop()
  const m = base ? /^(.+?)(?:\.replay)?\.brief\.md$/.exec(base) : null
  return m?.[1] ?? 'agent'
}
