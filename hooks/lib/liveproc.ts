// MOD-317: the live processes whose command names a worktree, read from `ps -axo pid=,command=` at hand-back. Pure: no `$`.
// A note on the verdict row, not a claim: the verifier does not judge the processes.

/** The longest command text a live-process entry keeps. */
const COMMAND_CUT = 80

/** One line of `ps -axo pid=,command=` output per process; keeps those whose command names `worktree` (a trailing slash does not count). */
export function liveInWorktree(psOut: string, worktree: string): { pid: number; command: string }[] {
  const root = worktree.replace(/\/+$/, '')
  if (root === '') return []
  const named = new RegExp(`${root.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(?=$|[/\\s"'])`)
  const found: { pid: number; command: string }[] = []
  for (const line of psOut.split('\n')) {
    const m = /^\s*(\d+)\s+(.*)$/.exec(line)
    if (!m) continue
    const full = m[2] ?? ''
    if (!named.test(full)) continue
    found.push({ pid: Number(m[1]), command: full.slice(0, COMMAND_CUT) })
  }
  return found
}

/** The verdict's note for the live processes: undefined for none, else the first three named, with a count of the rest. */
export function liveProcessLine(found: readonly { pid: number; command: string }[]): string | undefined {
  if (found.length === 0) return undefined
  const n = found.length
  const head = found.slice(0, 3).map(f => `pid ${f.pid} ${f.command}`).join('; ')
  const more = n > 3 ? ` (+${n - 3} more)` : ''
  return `note: ${n} live ${n === 1 ? 'process' : 'processes'} name the worktree: ${head}${more}`
}
