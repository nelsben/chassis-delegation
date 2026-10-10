// files.txt's place, the verdict and the escalation advice, and the lines the
// mod hands back. The verifier itself is ./verify-native.ts (part 5A); the gate
// map's rules are ./gates.ts. GH-104: the look at a worker's worktree before a
// respawn or an auto-resume, and the synthetic report `--verify` judges. Pure:
// no `$` (git runs through an injected `exec`).
import { escalatesOn, ESCALATING_CLAIMS } from './attempts'
import { parseClaimLine, type ClaimLine } from './quiet'
import { nextTier, type Tier } from './tier'
import { BASE_REFS, type ExecOut } from './verify-native'

export type Verdict = 'verified' | 'unverified' | 'refuted' | 'no-report' | 'refused'

/** `<scratch>`: the folder holding the `briefs/` folder the brief sits in, else the brief's own folder. */
export function scratchFor(briefPath: string): string {
  const dir = briefPath.slice(0, briefPath.lastIndexOf('/')) || '/'
  return dir.endsWith('/briefs') ? dir.slice(0, -'/briefs'.length) || '/' : dir
}

export const filesPathFor = (scratch: string, task: string): string => `${scratch}/${task}/files.txt`

export const isFailing = (verdict: Verdict, reportGate?: string): boolean =>
  verdict === 'refuted' || verdict === 'no-report' || reportGate === 'fail'

export type AdviceKind = 'accept' | 'check' | 'fix-brief' | 'resume' | 'respawn' | 'verify' | 'exhausted' | 'none'
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
  /** GH-115: the refuted attempt's first failed claim; read from `lines` when omitted. */
  firstFailed?: string
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

/** GH-115: a refuted verdict's first failed claim, as the verifier's lines name it. */
export const firstFailedClaim = (lines: readonly string[]): ClaimLine | undefined =>
  lines.map(parseClaimLine).find((c): c is ClaimLine => c?.status === 'failed')

/** The first path of a scope claim's `out-of-scope path: <path>` detail. */
const outOfScopePath = (c: ClaimLine): string | undefined => /out-of-scope path: (\S+)/.exec(c.detail)?.[1]

export const budgetDenyMessage = (label: string, attempts: number, briefPath?: string): string =>
  `budget exhausted for ${label} (${attempts} attempts); raise budget= in ${briefPath ?? "the task's brief"} to continue (the ladder resumes from attempt ${attempts}, the brief is re-read)`

/**
 * Resume-first escalation (SPEC amendment 1 B): the first failing verdict of
 * a spawn lineage resumes the same worker; the next one respawns with the
 * same brief, one tier up after a refuted report or a confirmed gate=fail, at
 * the SAME tier after a no-report (GH-104: a reporting defect, not a
 * capability one); a task at its budget stops. An unverified verdict with
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
  // GH-115: a scope or files refute says the brief's globs are wrong, not that the worker was out of its depth
  const failed = input.verdict === 'refuted' ? firstFailedClaim(input.lines ?? []) : undefined
  const failedName = input.verdict === 'refuted' ? (input.firstFailed ?? failed?.name) : undefined
  const held = failedName !== undefined && !ESCALATING_CLAIMS.includes(failedName) ? failedName : undefined
  if (input.lineageResumes === 0 && input.agentId) {
    if (held === 'scope') {
      const path = failed && failed.name === 'scope' ? outOfScopePath(failed) : undefined
      return { kind: 'resume', next: `resume agent=${input.agentId} — amend: [[amend v=1 scope+=${path ?? '<path>'} reason=…]] (the path is outside scope; a scope refute never escalates)` }
    }
    if (held === 'files') return { kind: 'resume', next: `resume agent=${input.agentId} — list the paths named above in files= (or revert the extras)` }
    return { kind: 'resume', next: `resume agent=${input.agentId} — SendMessage it the verifier lines below` }
  }
  const tier = escalatesOn(input.verdict, input.reportGate) && held === undefined ? nextTier(input.tier) : input.tier
  const brief = input.briefPath ? `same brief ${input.briefPath}` : 'same prompt'
  const heldNote = held !== undefined && (held === 'scope' || held === 'files') ? ` (held: a ${held} refute)` : ''
  return { kind: 'respawn', tier, next: `respawn at ${tier} — ${brief}, make the spawn block below (it names the model)${heldNote}` }
}

// ---- GH-104: look before you respawn ---------------------------------------------

/** Finished work in a worker's worktree: its branch head, the branch, and the commits it is ahead of the base. */
export type WorkPresent = { sha: string; branch: string; ahead: number }
export type WorkProbe = ({ present: true } & WorkPresent) | { present: false; why: string }
export type GitExec = (argv: readonly string[], init?: { cwd?: string; timeoutMs?: number }) => Promise<ExecOut>

const GIT_READ_MS = 15 * 1000
const HEX_SHA = /^[0-9a-f]{7,64}$/i

/** Two spellings of one commit: one a prefix (7 hex at least) of the other. */
export function sameCommit(a: string, b: string): boolean {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  if (!HEX_SHA.test(x) || !HEX_SHA.test(y)) return false
  return x.length <= y.length ? y.startsWith(x) : x.startsWith(y)
}

/** `work present at <short sha> on <branch>: verify it (next=verify sha=<sha>)`: the line the row and the refusal carry. */
export const workPresentLine = (w: Pick<WorkPresent, 'sha' | 'branch'>): string => `work present at ${w.sha.slice(0, 7)} on ${w.branch}: verify it (next=verify sha=${w.sha})`

/** The advice when work is present: judge it, spawn nothing. */
export const verifyAdvice = (w: Pick<WorkPresent, 'sha'>): Advice => ({ kind: 'verify', next: `verify sha=${w.sha}` })

/** A respawn refused because work is present (the spawn hook's deny). */
export const workPresentDeny = (label: string, task: string, w: Pick<WorkPresent, 'sha' | 'branch'>): string =>
  `chassis-delegation: ${label} not spawned — ${workPresentLine(w)}; /dispatch ${task} --verify ${w.sha} runs the verifier on it (no spawn)`

/** True for that deny (the scheduler's drain posts it as a row). */
export const isWorkPresentDeny = (deny: string): boolean => / not spawned — work present at [0-9a-f]+ on /.test(deny)

/** The delta's base: `preferred` (a replay's base, the brief's base=, the config's baseRef), else the first of BASE_REFS that resolves. */
async function resolveBase(out: (...args: string[]) => Promise<string | undefined>, preferred?: string): Promise<string | undefined> {
  if (preferred && preferred.trim()) return preferred.trim()
  for (const ref of BASE_REFS) if ((await out('rev-parse', '--verify', '--quiet', ref)) !== undefined) return ref
  return undefined
}

const gitIn = (repo: string, exec: GitExec) => async (...args: string[]): Promise<string | undefined> => {
  const r = await exec(['git', '-C', repo, ...args], { cwd: repo, timeoutMs: GIT_READ_MS })
  return r.ok && r.exitCode === 0 ? r.stdout : undefined
}
const firstLineOf = (s: string | undefined): string => (s ?? '').split('\n')[0]?.trim() ?? ''

/**
 * GH-104: before a respawn or an auto-resume, the worker's worktree is read
 * with allowlisted git reads only (rev-parse, status, log). Work is present
 * when HEAD is not a sha the verifier already judged (`judged`), the tree is
 * clean, and HEAD has commits ahead of the base.
 */
export async function probeWork(input: { repo: string; base?: string; judged?: readonly string[] }, exec: GitExec): Promise<WorkProbe> {
  const out = gitIn(input.repo, exec)
  const head = firstLineOf(await out('rev-parse', 'HEAD'))
  if (!HEX_SHA.test(head)) return { present: false, why: `could not read HEAD in ${input.repo}` }
  if ((input.judged ?? []).some(j => sameCommit(j, head))) return { present: false, why: `HEAD ${head.slice(0, 7)} is a sha already judged` }
  const status = await out('status', '--porcelain')
  if (status === undefined) return { present: false, why: `git status failed in ${input.repo}` }
  const dirty = status.split('\n').filter(l => l.trim() !== '').length
  if (dirty > 0) return { present: false, why: `${dirty} uncommitted path${dirty === 1 ? '' : 's'} in the worktree` }
  const base = await resolveBase(out, input.base)
  if (!base) return { present: false, why: 'no base to count commits from' }
  const log = await out('log', '--format=%H', `${base}..HEAD`)
  if (log === undefined) return { present: false, why: `git log ${base}..HEAD failed in ${input.repo}` }
  const ahead = log.split('\n').filter(l => l.trim() !== '').length
  if (ahead === 0) return { present: false, why: `no commits ahead of ${base}` }
  const ref = firstLineOf(await out('rev-parse', '--abbrev-ref', 'HEAD'))
  return { present: true, sha: head, branch: ref && ref !== 'HEAD' ? ref : '(detached HEAD)', ahead }
}

/**
 * GH-104, `--verify`: the paths changed between merge-base(base, sha) and the
 * sha, as the verifier takes the delta (the same base chain).
 */
export async function branchDelta(input: { repo: string; sha: string; base?: string }, exec: GitExec): Promise<{ files: string[]; base: string } | { why: string }> {
  const out = gitIn(input.repo, exec)
  if ((await out('rev-parse', '--verify', '--quiet', `${input.sha}^{commit}`)) === undefined) return { why: `sha ${input.sha} does not resolve in ${input.repo}` }
  const base = await resolveBase(out, input.base)
  if (!base) return { why: `no base to take the delta from in ${input.repo}` }
  let mb = firstLineOf(await out('merge-base', base, input.sha))
  if (!mb && (await out('rev-parse', '--verify', '--quiet', base)) !== undefined) mb = base
  if (!mb) return { why: `no merge-base of ${base} and ${input.sha} in ${input.repo}` }
  const diff = await out('diff', '--no-renames', '--name-only', mb, input.sha)
  if (diff === undefined) return { why: `git diff ${mb.slice(0, 9)} ${input.sha} failed in ${input.repo}` }
  return { files: diff.split('\n').map(l => l.trim()).filter(Boolean), base }
}

/** The newest red file among a folder's names (`red-<n>.txt`, the highest n), or undefined. */
export function newestRed(names: readonly string[]): string | undefined {
  let best: { n: number; name: string } | undefined
  for (const name of names) {
    const m = /^red-(\d+)\.txt$/.exec(name)
    if (m && (!best || Number(m[1]) > best.n)) best = { n: Number(m[1]), name }
  }
  return best?.name
}

/**
 * GH-104: the report `--verify` hands the verifier for work no report came
 * with: the branch head, its delta as files=, gate=pass (the verifier re-runs
 * the gate, so a red one refutes), and the newest red file when there is one.
 */
export function syntheticReport(r: { task: string; subtask: string; branch: string; sha: string; files: readonly string[]; red?: string }): string {
  return (
    `[[report v=1 task=${r.task} subtask=${r.subtask} branch=${r.branch} pr=none sha=${r.sha} gate=pass` +
    `${r.red ? ` red=${r.red}` : ''} files=${r.files.length > 0 ? r.files.join(',') : 'none'}]]`
  )
}

/**
 * The verdict row's first line. `usd` (the attempt's cost, 2 decimals) and the
 * resolved `model` show when known; `next=` stays last because it runs to the
 * end of the line.
 */
export const verdictLine = (v: { verdict: Verdict; task: string; attempt: number; budget: number; next: string; usd?: number; usdApprox?: boolean; model?: string }): string =>
  `chassis-delegation: verdict=${v.verdict} task=${v.task} attempt=${v.attempt}/${v.budget}` +
  (v.usd !== undefined && Number.isFinite(v.usd) ? ` usd=${v.usdApprox ? '~' : ''}${v.usd.toFixed(2)}` : '') +
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
