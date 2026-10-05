// Quiet verdicts (SPEC part 2B): the one-line verdict row, and where each
// verbosity sends the row. Pure: no `$`.
//
//   line (default)  one line in the conversation; the full text to the debug
//                   log and $.state lastVerdict
//   full            part 1's multi-line row (the verdict line + claim lines)
//   silent          no row at all; a toast; the brain reads the store

export type Verbosity = 'line' | 'full' | 'silent'
export const VERBOSITIES: readonly Verbosity[] = ['line', 'full', 'silent']

export const parseVerbosity = (v: unknown): Verbosity => (VERBOSITIES as readonly unknown[]).includes(v) ? (v as Verbosity) : 'line'

export type ClaimStatus = 'held' | 'failed' | 'unchecked'
export type ClaimLine = { name: string; status: ClaimStatus; detail: string }

/** `claim <name>: <held|failed|unchecked> — <detail>`, as the verifier (./verify-native.ts) prints each claim. */
export function parseClaimLine(line: string): ClaimLine | undefined {
  const m = /^claim ([A-Za-z0-9_-]+): (held|failed|unchecked) — (.*)$/.exec(line)
  return m ? { name: m[1] as string, status: m[2] as ClaimStatus, detail: m[3] as string } : undefined
}

const REASON_CAP = 100

function cut(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`
}

/** `(<detail>)` cut so the whole `on <name> (…)` stays within the cap. */
function onClaim(c: ClaimLine): string {
  const head = `on ${c.name} (`
  return `${head}${cut(c.detail, REASON_CAP - head.length - 1)})`
}

/**
 * Why a verdict is what it is, in one clause: refuted names the first failed
 * claim, unverified the first unchecked one (else the first note), refused the
 * first error or note. A pass and a no-report name none.
 */
export function verdictReason(verdict: string, lines: readonly string[]): string | undefined {
  const claims = lines.map(parseClaimLine).filter((c): c is ClaimLine => c !== undefined)
  const firstOther = lines.find(l => /^(note|error|warning): /.test(l))
  if (verdict === 'refuted') {
    const failed = claims.find(c => c.status === 'failed')
    return failed ? onClaim(failed) : firstOther ? `(${cut(firstOther, REASON_CAP - 2)})` : undefined
  }
  if (verdict === 'unverified') {
    const unchecked = claims.find(c => c.status === 'unchecked')
    return unchecked ? onClaim(unchecked) : firstOther ? `(${cut(firstOther, REASON_CAP - 2)})` : undefined
  }
  if (verdict === 'refused') return firstOther ? `(${cut(firstOther, REASON_CAP - 2)})` : undefined
  return undefined
}

/** The ops of an `[[amend v=1 <ops> reason=…]]` block quoted in a line. */
function amendOps(line: string): string | undefined {
  const m = /\[\[amend v=1 (.*?) reason=/.exec(line)
  return m ? (m[1] as string).trim() : undefined
}

const CLAUSE_CAP = 80

/**
 * The row's amend lines folded into one clause per kind: the amends the mod
 * appended, those that wait for approval, those not applied (applyAmends off
 * or malformed).
 */
export function amendClauses(lines: readonly string[]): string[] {
  const applied: string[] = []
  const approval: string[] = []
  const notApplied: string[] = []
  for (const line of lines) {
    if (line.startsWith('amended: ')) {
      const body = line.slice('amended: '.length)
      const at = body.indexOf(' (reason ')
      applied.push(at >= 0 ? body.slice(0, at) : body)
    } else if (line.startsWith('amend needs approval: ')) approval.push(amendOps(line) ?? 'a block')
    else if (line.startsWith('amend not applied')) notApplied.push(amendOps(line) ?? 'a block')
  }
  const out: string[] = []
  if (applied.length > 0) out.push(cut(`amended ${applied.join(', ')}`, CLAUSE_CAP))
  if (approval.length > 0) out.push(cut(`amend needs approval: ${approval.join(', ')}`, CLAUSE_CAP))
  if (notApplied.length > 0) out.push(cut(`amend not applied: ${notApplied.join(', ')}`, CLAUSE_CAP))
  return out
}

const RESUME_TAIL = ' — SendMessage it the verifier lines below'

/** The advice as the one line carries it: a resume names the agent alone (the failure is on the line). */
export const shortNext = (next: string): string => (next.endsWith(RESUME_TAIL) ? next.slice(0, -RESUME_TAIL.length) : next)

export type QuietInput = {
  task: string
  attempt: number
  budget: number
  verdict: string
  /** A repo=none (or not-a-repo) verdict: said as `<verdict> (no repo)`. */
  noRepo?: boolean
  reportGate?: string
  alias?: string
  usd?: number
  next: string
  lines: readonly string[]
}

/**
 * `chassis-delegation: OPS-232 attempt 2/3 verified · sonnet · $2.26 · next=accept`,
 * or `… refuted on scope (out-of-scope path: x) · sonnet · next=resume agent=<id>`.
 * Amends ride in one clause each; `next=` stays last.
 */
export function quietLine(v: QuietInput): string {
  const reason = verdictReason(v.verdict, v.lines)
  const gateNote = v.verdict === 'verified' && v.reportGate === 'fail' ? ' (report gate=fail)' : ''
  const label = v.noRepo ? ' (no repo)' : ''
  const parts = [`chassis-delegation: ${v.task} attempt ${v.attempt}/${v.budget} ${v.verdict}${label}${gateNote}${reason ? ` ${reason}` : ''}`]
  if (v.alias) parts.push(v.alias)
  if (v.usd !== undefined && Number.isFinite(v.usd)) parts.push(`$${v.usd.toFixed(2)}`)
  parts.push(...amendClauses(v.lines))
  parts.push(`next=${shortNext(v.next)}`)
  return parts.join(' · ')
}

export type Rendered = { full: string; line: string }
export type Delivery = { row?: string; toast?: string; log?: string }

/** Where a verdict goes: the row the conversation gets (if any), a toast, the debug log. */
export function deliveryFor(verbosity: Verbosity, r: Rendered): Delivery {
  if (verbosity === 'full') return { row: r.full }
  if (verbosity === 'silent') return { toast: r.line, log: r.full }
  return { row: r.line, log: r.full }
}
