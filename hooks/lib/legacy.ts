// MOD-19: the legacy reader. The verdict word `verified` is gone from everything
// the mod writes: it is `consistent` now (public issue #1). A report whose every
// machine-checkable claim holds is consistent with git; nothing in that read the
// diff, so the word no longer sounds like a review.
//
// DEPRECATED, read until 0.9.0: a stored attempt record, a recent-verdict row, a
// metrics object or a ledger row from 0.7.x and earlier still says `verified`,
// and the mod reads it exactly as it reads `consistent` (escalation, owed rows,
// accept, the spend and success counts, the dashboard). The mod never writes the
// old word. This is the one file that names it; tests/node/consistent.node.mjs
// fails on the word anywhere else in hooks/ or bin/. At 0.9.0 delete this file
// and every import of it. Pure: no `$`.

/** The retired verdict word. Read, never written. */
export type LegacyVerified = 'verified'
export const LEGACY_VERDICT: LegacyVerified = 'verified'

/** True for a stored verdict that means every claim held: `consistent`, or (until 0.9.0) the retired word. */
export const isConsistent = (verdict: string | undefined): boolean => verdict === 'consistent' || verdict === LEGACY_VERDICT

/** A stored verdict word as the mod now says it: the retired word reads `consistent`, every other word is as it was. */
export const currentVerdict = <V extends string>(verdict: V): Exclude<V, LegacyVerified> | 'consistent' => (verdict === LEGACY_VERDICT ? 'consistent' : verdict) as Exclude<V, LegacyVerified> | 'consistent'

/**
 * A verdict row stored before the rename (`chassis-delegation: T-4 attempt 1/3
 * verified · …`, or the long `verdict=verified` line), shown as the mod says it
 * now. A line in neither shape is returned as it was.
 */
export const currentLine = (line: string): string =>
  line.replace(/^(chassis-delegation: \S+ attempt \d+\/\d+ )verified\b/, '$1consistent').replace(/^(chassis-delegation: verdict=)verified\b/, '$1consistent')

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const count = (v: unknown): number => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const BY_KEY = 'verifiedBy'

/**
 * A metrics object (`delegation.metrics.<session>`) stored before the rename:
 * its `verdicts.verified` count moves into `verdicts.consistent`, and its
 * `verifiedBy` per-tier counts into `consistentBy`. The retired keys are gone
 * from the result; an object already in the new shape is returned as it was.
 */
export function foldLegacyMetrics(stored: unknown): unknown {
  if (!isRecord(stored)) return stored
  const out: Record<string, unknown> = { ...stored }
  const verdicts = out.verdicts
  if (isRecord(verdicts) && LEGACY_VERDICT in verdicts) {
    const { [LEGACY_VERDICT]: old, ...rest } = verdicts
    out.verdicts = { ...rest, consistent: count(rest.consistent) + count(old) }
  }
  const by = out[BY_KEY]
  if (by !== undefined) {
    delete out[BY_KEY]
    if (isRecord(by)) {
      const now: Record<string, unknown> = isRecord(out.consistentBy) ? out.consistentBy : {}
      const merged: Record<string, number> = {}
      for (const k of new Set([...Object.keys(by), ...Object.keys(now)])) merged[k] = count(now[k]) + count(by[k])
      out.consistentBy = merged
    }
  }
  return out
}
