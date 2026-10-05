// files.txt's place, the verdict and the escalation advice, and the lines the
// mod hands back. The verifier itself is ./verify-native.ts (part 5A); the gate
// map's rules are ./gates.ts. Pure: no `$`.
import { parseClaimLine, type ClaimLine } from './quiet'
import { nextTier, type Tier } from './tier'

export type Verdict = 'verified' | 'unverified' | 'refuted' | 'no-report' | 'refused'

/** `<scratch>`: the folder holding the `briefs/` folder the brief sits in, else the brief's own folder. */
export function scratchFor(briefPath: string): string {
  const dir = briefPath.slice(0, briefPath.lastIndexOf('/')) || '/'
  return dir.endsWith('/briefs') ? dir.slice(0, -'/briefs'.length) || '/' : dir
}

export const filesPathFor = (scratch: string, task: string): string => `${scratch}/${task}/files.txt`

export const isFailing = (verdict: Verdict, reportGate?: string): boolean =>
  verdict === 'refuted' || verdict === 'no-report' || reportGate === 'fail'

export type AdviceKind = 'accept' | 'check' | 'fix-brief' | 'resume' | 'respawn' | 'exhausted' | 'none'
export type Advice = { kind: AdviceKind; next: string; tier?: Tier }

export type AdviseInput = {
  verdict: Verdict
  reportGate?: string
  task: string
  attempts: number
  budget: number
  /** Resumes already made in the failing attempt's spawn lineage. */
  lineageResumes: number
  tier: Tier
  agentId?: string
  briefPath?: string
  adhoc: boolean
  /** GH-1 item 2: an ad hoc spawn (no header, no brief) whose report was verified cardlessly. */
  cardless?: boolean
  /** The verifier's lines: an unverified verdict's resume names its unchecked claims (GH-1 item 5). */
  lines?: readonly string[]
}

/** An unchecked claim's reason is cut to this many characters in `next=`. */
export const PROVE_REASON_CAP = 160

const cutTo = (text: string, max: number): string => (text.length <= max ? text : `${text.slice(0, max - 1)}…`)

/** The verifier's `claim <name>: unchecked — <reason>` lines, as written. */
export const uncheckedClaimLines = (lines: readonly string[]): string[] => lines.filter(l => parseClaimLine(l)?.status === 'unchecked')

/** `gate (<reason>), red (<reason>)`: each unchecked claim's name and reason, the reason cut to 160 characters. */
export function proveList(lines: readonly string[]): string {
  return lines
    .map(parseClaimLine)
    .filter((c): c is ClaimLine => c?.status === 'unchecked')
    .map(c => `${c.name} (${cutTo(c.detail, PROVE_REASON_CAP)})`)
    .join(', ')
}

export const budgetDenyMessage = (label: string, attempts: number, briefPath?: string): string =>
  `budget exhausted for ${label} (${attempts} attempts); raise budget= in ${briefPath ?? "the task's brief"} to continue (the ladder resumes from attempt ${attempts}, the brief is re-read)`

/**
 * Resume-first escalation (SPEC amendment 1 B): the first failing verdict of
 * a spawn lineage resumes the same worker; the next one respawns one tier up
 * with the same brief; a task at its budget stops. An unverified verdict with
 * unchecked claims, an agent and budget left resumes the worker to prove them
 * (GH-1 item 5); a cardless hand-back is never resumed or respawned.
 */
export function advise(input: AdviseInput): Advice {
  // a cardless hand-back has no brief to resume or respawn against (GH-1 item 2)
  if (input.adhoc && input.cardless) return input.verdict === 'verified' && input.reportGate !== 'fail' ? { kind: 'accept', next: 'accept' } : { kind: 'check', next: 'check the diff' }
  if (input.adhoc) return { kind: 'none', next: 'none — ad hoc spawn, no brief' }
  if (input.verdict === 'verified' && input.reportGate !== 'fail') return { kind: 'accept', next: 'accept' }
  if (input.verdict === 'refused') return { kind: 'fix-brief', next: 'fix the brief — the verifier refused it (not charged to the worker)' }
  if (!isFailing(input.verdict, input.reportGate)) {
    // GH-1 item 5: unverified is actionable — resume the worker with the claims it has to prove
    const prove = proveList(input.lines ?? [])
    if (prove !== '' && input.agentId && input.attempts < input.budget) return { kind: 'resume', next: `resume agent=${input.agentId} — prove: ${prove}` }
    return { kind: 'check', next: 'check by hand — unverified is not a pass' }
  }
  if (input.attempts >= input.budget) return { kind: 'exhausted', next: `stop — ${budgetDenyMessage(input.task, input.attempts)}` }
  if (input.lineageResumes === 0 && input.agentId) {
    return { kind: 'resume', next: `resume agent=${input.agentId} — SendMessage it the verifier lines below` }
  }
  const tier = nextTier(input.tier)
  const brief = input.briefPath ? `same brief ${input.briefPath}` : 'same prompt'
  return { kind: 'respawn', tier, next: `respawn at ${tier} — ${brief}, model omitted so the mod picks` }
}

/**
 * The verdict row's first line. `usd` (the attempt's cost, 2 decimals) and the
 * resolved `model` show when known; `next=` stays last because it runs to the
 * end of the line.
 */
export const verdictLine = (v: { verdict: Verdict; task: string; attempt: number; budget: number; next: string; usd?: number; model?: string }): string =>
  `chassis-delegation: verdict=${v.verdict} task=${v.task} attempt=${v.attempt}/${v.budget}` +
  (v.usd !== undefined && Number.isFinite(v.usd) ? ` usd=${v.usd.toFixed(2)}` : '') +
  (v.model ? ` model=${v.model}` : '') +
  ` next=${v.next}`

/** One line per amend the mod appended to the brief before verifying. */
export const amendedLine = (a: { ops: readonly string[]; reason: string }): string => `amended: ${a.ops.join(' ')} (reason ${a.reason})`

/** applyAmends off: the block, verbatim, and how to accept it. */
export const amendPendingLine = (a: { block: string }, briefPath: string): string =>
  `amend not applied (applyAmends off): ${a.block} — append it to ${briefPath} and re-verify to accept it`

/** A block that removes scope or a forbid: never appended on the worker's word. */
export const amendApprovalLine = (a: { block: string }, briefPath: string): string =>
  `amend needs approval: ${a.block} — append it to ${briefPath} and re-verify to accept it`

/** A hand-back block the verifier grammar refuses: never appended. */
export const amendMalformedLine = (m: { block: string; why: string }): string => `amend not applied (malformed: ${m.why}): ${m.block}`

/** The verdict line, then the verifier's lines, 40 lines at most. */
export function contextBlock(line: string, lines: readonly string[], cap = 40): string {
  if (lines.length + 1 <= cap) return [line, ...lines].join('\n')
  const keep = lines.slice(0, cap - 2)
  return [line, ...keep, `… ${lines.length - keep.length} more verifier lines cut`].join('\n')
}

/** True for the resume of an unverified hand-back that failed nothing (GH-1 item 5): it is asked to prove, not to fix. */
export const isProveResume = (verdict: Verdict, reportGate?: string): boolean => verdict === 'unverified' && !isFailing(verdict, reportGate)

/**
 * What a resume sends the worker. A prove resume (GH-1 item 5) carries
 * only the unchecked claim lines and asks the worker to prove them.
 */
export function resumeText(v: { verdict: Verdict; task: string; attempt: number; budget: number; lines: readonly string[]; prove?: boolean }): string {
  if (v.prove) {
    return [
      `chassis-delegation: your hand-back for ${v.task} (attempt ${v.attempt}/${v.budget}) came back unverified. These claims could not be checked:`,
      ...uncheckedClaimLines(v.lines),
      'Prove each one in the same worktree (commit what is uncommitted, name the evidence the claim needs), re-run the gate, and end with a fresh [[report v=1 …]] line.',
    ].join('\n')
  }
  return [
    `chassis-delegation: your hand-back for ${v.task} (attempt ${v.attempt}/${v.budget}) came back ${v.verdict}. The verifier said:`,
    ...v.lines,
    'Fix what failed in the same worktree, re-run the gate, commit, and end with a fresh [[report v=1 …]] line.',
  ].join('\n')
}
