// The clean-stop detector (SPEC part 2C): when the session has gone quiet with
// friction worth writing down, a background agent runs the /debrief skill.
// Pure: no `$`.

import { redact, type RedactRules } from './redact'
import { MOD_SURFACES, windowAsk, splitFindings, type DebriefWindow } from './debriefcheck'

const H = 60 * 60 * 1000

export const DEFAULT_DEBRIEF_IDLE_MINUTES = 20
export const DEFAULT_DEBRIEF_MIN_NEW_LINES = 25
export const DEFAULT_DEBRIEF_COOLDOWN_HOURS = 6
export const DEFAULT_DEBRIEF_AGENT = 'general-purpose'

/** Lines as `wc -l` counts them (newlines), the count the debrief skill writes into `.done`. */
export const countLines = (text: string): number => {
  let n = 0
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) n += 1
  return n
}

/** The `.done` watermark: the line count the last debrief covered; absent, empty (a legacy touch) or junk is 0. */
export function parseWatermark(text: string | undefined): number {
  const m = /^\s*(\d+)\s*$/.exec(text ?? '')
  return m ? Number(m[1]) : 0
}

const harness = (home: string): string => `${home.replace(/\/+$/, '')}/.claude/harness/breadcrumbs`
export const breadcrumbPath = (home: string, sessionId: string): string => `${harness(home)}/${sessionId}.jsonl`
export const watermarkPath = (home: string, sessionId: string): string => `${harness(home)}/${sessionId}.done`
export const debriefSkillPath = (home: string): string => `${home.replace(/\/+$/, '')}/.claude/commands/debrief.md`

export type CleanStopInput = {
  /** A main-loop turn is running. */
  inTurn: boolean
  /** Agents this mod spawned (or saw spawned) that `$.agent.list()` says are running. */
  running: number
  /** Attempts handed back whose verdict is not in yet. */
  pending: number
  /** Spawns waiting in the scheduler queue (2F). */
  queued: number
  /** Lines in the session's breadcrumb file. */
  lines: number
  /** The `.done` watermark (0 when absent). */
  watermark: number
  minNewLines: number
  now: number
  /** When the last background debrief of this session started. */
  lastAt?: number
  cooldownMs: number
  /** The watermark the last background debrief started at. */
  lastWatermark?: number
  /** MOD-91: when the latest debrief started, whatever its check said (lastAt is the last that passed). */
  lastAttemptAt?: number
  /** MOD-91: the checks that failed from one start watermark. */
  failedChecks?: { watermark: number; count: number }
}

/** MOD-91: how many failed checks on one window stop the automatic start. */
export const DEBRIEF_FAILED_CHECKS_MAX = 2

const plural = (n: number, one: string, many: string): string => `${n} ${n === 1 ? one : many}`

/**
 * A clean stop: no turn, no worker running, no verdict pending, nothing
 * queued, at least `minNewLines` breadcrumb lines past the watermark, the last
 * debrief older than the cooldown, and never twice for the same watermark.
 */
export function cleanStop(i: CleanStopInput): { ok: true } | { ok: false; why: string } {
  if (i.inTurn) return { ok: false, why: 'a turn is running' }
  if (i.running > 0) return { ok: false, why: `${plural(i.running, 'worker', 'workers')} running` }
  if (i.pending > 0) return { ok: false, why: `${plural(i.pending, 'verdict', 'verdicts')} pending` }
  if (i.queued > 0) return { ok: false, why: `${plural(i.queued, 'spawn', 'spawns')} queued` }
  const fresh = i.lines - i.watermark
  if (fresh < i.minNewLines) return { ok: false, why: `only ${Math.max(0, fresh)} new breadcrumb lines (need ${i.minNewLines})` }
  if (i.lastWatermark !== undefined && i.lastWatermark === i.watermark) return { ok: false, why: `already debriefed at watermark ${i.watermark}` }
  if (i.failedChecks && i.failedChecks.watermark === i.watermark && i.failedChecks.count >= DEBRIEF_FAILED_CHECKS_MAX) {
    return { ok: false, why: `debrief stopped: the check failed twice on the window from line ${i.watermark}; run /delegation debrief to retry by hand` }
  }
  // MOD-91: the cooldown counts from the latest start, a failed check included
  const started = i.lastAt === undefined && i.lastAttemptAt === undefined ? undefined : Math.max(i.lastAt ?? -Infinity, i.lastAttemptAt ?? -Infinity)
  if (started !== undefined && i.now - started < i.cooldownMs) {
    return { ok: false, why: `last debrief ${((i.now - started) / H).toFixed(1)}h ago (cooldown ${i.cooldownMs / H}h)` }
  }
  return { ok: true }
}

/** MOD-6: the one more top-level key both prompts ask the debrief JSON to carry, about the mod itself. */
export const MOD_FINDINGS_ASK =
  `Also add one more top-level key to the JSON you write, mod_findings: an array of { kind: went_well | went_wrong, surface (one of: ${MOD_SURFACES.join(', ')}; a finding about the host's permission classifier or safety checks, the engine or the person's own hooks is set aside, never posted), fault_class: bug | design | docs | cost | performance, severity: P1 | P2 | P3, title, body, evidence: [strings] } about chassis-delegation itself, not the project, grounded in the facts above (verdict lines, refutes, by-hand accepts, denials, corrections); [] when there is nothing to say. Name no product, repo, customer, person or path in it.`

/** MOD-26: said under the facts, so the time on a fact line is the `at` of the entry the agent takes from it. */
/** MOD-32: a refute later re-judged consistent at the same sha is the verifier's or the gate's fault, not a win. */
export const FALSE_REFUTE_ASK = 'A verdict fact that says a refute was then re-judged consistent at the same sha is a false refute: file it as a went_wrong for the verifier or the gate, never a went_well.'

/** MOD-32: said when a clean check lets the debrief agent mark its watermark; the mod sends it, the way autoEscalate resumes a worker. */
export const MARK_WATERMARK_MESSAGE = 'debrief check: clean. Mark your watermark now, as your instructions say, and stop.'

export const FACTS_AT_ASK = 'A fact line that starts with a kind and an ISO time (`denial <ISO time>: …`) happened at that time: cite that time as `at` for the corrections, tool_denials or outcomes entry you take from it.'

/** The skill-wrapping prompt: the person's own skill file, unedited, plus the mod_findings ask and the facts it rests on. */
export const debriefPrompt = (skillPath: string, sessionId: string, facts: readonly string[] = [], window?: DebriefWindow): string =>
  [
    `Run the /debrief skill exactly as written in ${skillPath}. Session id ${sessionId}. Write only what the skill allows.`,
    ...(facts.length > 0 ? ['What chassis-delegation saw since the last debrief:', ...facts.map(f => `- ${f}`), FACTS_AT_ASK, FALSE_REFUTE_ASK] : []),
    ...(window ? [windowAsk(window)] : []),
    MOD_FINDINGS_ASK,
  ].join('\n')

/** The debrief file the agent's answer names: `…/harness/debriefs/<date>-<slug>.json` or `<root>/.delegation/debriefs/…`. */
export function debriefPathOf(answer: string): string | undefined {
  const m = /(?:~|\/)[^\s`'"()<>]*\/(?:harness|\.delegation)\/debriefs\/[^\s`'"()<>]+\.json/.exec(answer)
  return m ? m[0] : undefined
}

// ---- part 5E: the debrief without the harness ------------------------------------

/** Friction events past the last debrief a debrief needs, when no breadcrumb file exists. */
export const DEFAULT_DEBRIEF_MIN_EVENTS = 5
export const FRICTION_CAP = 100

/**
 * The instructions the debrief agent follows: the person's own
 * `~/.claude/commands/debrief.md` when it exists, else the mod's built-in
 * `hooks/templates/debrief.md` (the same JSON schema; it writes under `<root>/.delegation/`).
 */
export const debriefSource = (home: string, pluginRoot: string, skillExists: boolean): { path: string; builtIn: boolean } =>
  skillExists ? { path: debriefSkillPath(home), builtIn: false } : { path: `${pluginRoot.replace(/\/+$/, '')}/hooks/templates/debrief.md`, builtIn: true }

/**
 * The built-in debrief's prompt. MOD-28: `template` is the text of hooks/templates/debrief.md as the mod loaded it;
 * with it the instructions travel inline, so the agent never reads the folder (which a pull may have moved on).
 * Without it the prompt names the file, as before.
 */
export const builtInDebriefPrompt = (templatePath: string, sessionId: string, root: string, facts: readonly string[], window?: DebriefWindow, template?: string): string =>
  [
    ...(template !== undefined
      ? [`Run the debrief exactly as written below, the built-in template as the mod loaded it (${templatePath}); do not read that file.`, '----- debrief template -----', template.trimEnd(), '----- end of debrief template -----']
      : [`Run the debrief exactly as written in ${templatePath}.`]),
    `Session id ${sessionId}. Repo root ${root}.`,
    facts.length > 0 ? 'What chassis-delegation saw since the last debrief:' : 'chassis-delegation saw no friction events beyond the verdicts below.',
    ...facts.map(f => `- ${f}`),
    ...(facts.length > 0 ? [FACTS_AT_ASK, FALSE_REFUTE_ASK] : []),
    ...(window ? [windowAsk(window)] : []),
    MOD_FINDINGS_ASK,
    'Write only what it allows.',
  ].join('\n')

/** One thing that went wrong in the session, as the mod saw it. */
export type FrictionEvent = { kind: 'correction' | 'denial' | 'refuted'; detail: string; at: number }

const CORRECTION_WORDS = ['no', 'stop', "don't", 'dont', 'actually']

/** MOD-39: first-person disagreement or an explicit verdict, anywhere in the message. */
const DISAGREE = /\bi\s+(?:(?:don'?t|do\s+not)\s+agree|disagree)\b|\bthat'?s\s+not\s+right\b|\byou'?re\s+wrong\b/

/** MOD-39: a challenge question (it ends in ?), the shouldn't/isn't/wasn't/aren't forms. */
const CHALLENGE_Q = /\b(?:shouldn'?t\s+(?:it|this|that|we|you|there)|isn'?t\s+it\s+supposed|wasn'?t\s+it\s+supposed|aren'?t\s+(?:we|you)\s+supposed)\b/

/** MOD-39: a message that ends in `bug?`. */
const ENDS_BUG = /\bbug\?\s*$/

/** MOD-39: a false-report verdict: reported on something false, seems or looks wrong, off or silly. */
const FALSE_REPORT = /\breported\s+on\s+something\s+false\b|\b(?:seems|looks)\s+(?:wrong|off|silly)\b/

/**
 * A prompt that corrects: its first word is no, stop, don't or actually, in any case (the
 * first-word markers, unchanged); or, MOD-39, it carries first-person disagreement or an explicit
 * verdict anywhere, a challenge question, a message ending in `bug?`, or a false-report verdict.
 */
export function isCorrection(text: string): boolean {
  const first = (text.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[\u2019]/g, "'").replace(/[.,!?:;]+$/, '')
  if (CORRECTION_WORDS.includes(first)) return true
  const t = text.toLowerCase().replace(/[\u2019]/g, "'").trim()
  if (DISAGREE.test(t) || FALSE_REPORT.test(t) || ENDS_BUG.test(t)) return true
  return t.endsWith('?') && CHALLENGE_Q.test(t)
}

export const addFriction = (list: readonly FrictionEvent[], ev: FrictionEvent, cap = FRICTION_CAP): FrictionEvent[] => [...list, ev].slice(-cap)

const KIND_TEXT: Record<FrictionEvent['kind'], string> = { correction: 'correction', denial: 'denial', refuted: 'refuted' }

/**
 * MOD-26: `2026-10-10T16:27:14Z`, the ISO time of a fact. Whole seconds print without milliseconds; a
 * time that has them keeps them, so the agent cites a time the window check reads back exactly.
 */
export const isoTime = (ms: number): string => {
  if (!Number.isFinite(ms)) return 'unknown-time'
  const iso = new Date(ms).toISOString()
  return iso.endsWith('.000Z') ? `${iso.slice(0, -5)}Z` : iso
}

const factLine = (label: string, ms: number, text: string): string => `${label} ${isoTime(ms)}: ${text}`

/** The facts line by line, as the built-in debrief's prompt carries them: `denial 2026-10-10T16:27:14Z: Bash: git push`. */
export const frictionFacts = (events: readonly FrictionEvent[]): string[] => events.map(e => factLine(KIND_TEXT[e.kind], e.at, e.detail.replace(/\s+/g, ' ').slice(0, 200)))

/**
 * A verdict row the mod kept, with the time it was posted. MOD-32: `task`, `attempt`, `verdict`, `sha` and
 * `rejudge` (the row came from `--verify` at the attempt's own sha) let a refute and its re-judge be told as one.
 */
export type VerdictFact = { line: string; at: number; task?: string; attempt?: number; verdict?: string; sha?: string; rejudge?: boolean; firstAt?: number }

const sameCommit = (a: string, b: string): boolean => {
  const x = a.trim().toLowerCase()
  const y = b.trim().toLowerCase()
  return x.length >= 7 && y.length >= 7 && (x.startsWith(y) || y.startsWith(x))
}

/**
 * MOD-32: a refute that a later `--verify` re-judged in place (same task, same attempt, same sha) and found
 * not refuted is one row, not two: `MOD-17 attempt 1/2 refuted on gate, then re-judged consistent at the same
 * sha (a false refute)`, at the re-judge's time (`firstAt` keeps the refute's). A refute that stood, or one
 * resumed at another sha, is left as the rows were.
 */
export function mergeRejudged(verdicts: readonly VerdictFact[]): VerdictFact[] {
  const out: VerdictFact[] = []
  for (const v of verdicts) {
    const j = v.rejudge === true && v.verdict !== undefined && v.verdict !== 'refuted' && v.sha !== undefined ? out.findLastIndex(r => r.verdict === 'refuted' && r.task === v.task && r.attempt === v.attempt && r.sha !== undefined && sameCommit(r.sha, v.sha as string)) : -1
    const prior = j >= 0 ? (out[j] as VerdictFact) : undefined
    if (!prior) {
      out.push(v)
      continue
    }
    const head = /^(?:chassis-delegation: )?(\S+ attempt \d+\/\d+) (refuted(?: on [\w-]+)?)/.exec(prior.line)
    const said = head ? `${head[1]} ${head[2]}` : `${v.task ?? 'task'} attempt ${v.attempt ?? '?'} refuted`
    out.splice(j, 1)
    out.push({ line: `${said}, then re-judged ${v.verdict} at the same sha (a false refute)`, at: v.at, firstAt: prior.at, task: v.task as string, attempt: v.attempt as number, verdict: v.verdict as string })
  }
  return out
}

/** The verdict rows as fact lines: `verdict 2026-10-10T18:01:07Z: chassis-delegation: OPS-5 attempt 1/2 consistent …`. */
export const verdictFacts = (verdicts: readonly VerdictFact[]): string[] => mergeRejudged(verdicts).map(v => factLine('verdict', v.at, v.line))

/**
 * MOD-26: the facts a breadcrumbs debrief's prompt carries: the friction events and verdicts whose time lies
 * between the window's first and last breadcrumb timestamps, inclusive, each dated. A window with no
 * timestamps (or none that parse) has no span, so it carries none. Nothing is chosen by a count of lines
 * or by the previous debrief's time: the window is the only filter.
 */
export function windowFacts(events: readonly FrictionEvent[], verdicts: readonly VerdictFact[], window: DebriefWindow): string[] {
  const from = Date.parse(window.firstTs)
  const to = Date.parse(window.lastTs)
  if (Number.isNaN(from) || Number.isNaN(to)) return []
  const inside = (at: number): boolean => at >= from && at <= to
  return [...frictionFacts(events.filter(e => inside(e.at))), ...verdictFacts(mergeRejudged(verdicts).filter(v => inside(v.at) || (v.firstAt !== undefined && inside(v.firstAt))))]
}

/** The breadcrumb kinds that mark where a session starts, ends or compacts, not what happened in it. */
export const BOUNDARY_KINDS: readonly string[] = ['session_start', 'session_end', 'compaction', 'compact', 'pre_compact', 'post_compact']

/** MOD-26: every breadcrumb line of the window is a session boundary or a compaction (and the window has a kind to say so). */
export const boundaryOnly = (window: DebriefWindow): boolean => window.kinds.length > 0 && window.kinds.every(k => BOUNDARY_KINDS.includes(k))

/** MOD-26: what `/delegation debrief` says, and the auto path logs, when a boundary-only window holds no fact. */
export const nothingToDebrief = (window: DebriefWindow): string => `nothing to debrief in lines ${window.firstLine}-${window.lastLine} (session boundaries only)`

export const debriefToast = (answer: string): string => {
  const path = debriefPathOf(answer)
  return path ? `debrief written: ${path}` : 'debrief finished'
}

// ---- MOD-6: the findings about the mod itself --------------------------------------

export type ModFinding = {
  kind: 'went_well' | 'went_wrong'
  surface: string
  fault_class: 'bug' | 'design' | 'docs' | 'cost' | 'performance'
  severity: 'P1' | 'P2' | 'P3'
  title: string
  body: string
  evidence: string[]
  /** MOD-137: where the finding came from, e.g. `review note note.md`; absent for a transcript debrief. */
  source?: string
}

const KINDS = ['went_well', 'went_wrong'] as const
const FAULTS = ['bug', 'design', 'docs', 'cost', 'performance'] as const
const SEVERITIES = ['P1', 'P2', 'P3'] as const
const pick = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (list.includes(v as T) ? (v as T) : fallback)
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/**
 * The mod_findings of a debrief file's text, every string scrubbed with `redact`.
 * undefined: the text is not a JSON object. An entry with no title is dropped; an
 * unknown kind, class or severity falls to went_wrong, design, P3.
 */
export function scrubbedFindings(json: string, rules: RedactRules): ModFinding[] | undefined {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return undefined
  const list = (parsed as Record<string, unknown>).mod_findings
  if (!Array.isArray(list)) return []
  const out: ModFinding[] = []
  for (const raw of list) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const title = redact(text(r.title), rules)
    if (title === '') continue
    out.push({
      kind: pick(KINDS, r.kind, 'went_wrong'),
      surface: redact(text(r.surface), rules),
      fault_class: pick(FAULTS, r.fault_class, 'design'),
      severity: pick(SEVERITIES, r.severity, 'P3'),
      title,
      body: redact(typeof r.body === 'string' ? r.body.trim() : '', rules),
      evidence: (Array.isArray(r.evidence) ? r.evidence : []).filter((e): e is string => typeof e === 'string').map(e => redact(e.trim(), rules)),
      ...(typeof r.source === 'string' && r.source.trim() !== '' ? { source: redact(r.source.trim(), rules) } : {}),
    })
  }
  return out
}

/** `…/2026-10-03-mod-build.json` → `…/2026-10-03-mod-build.findings.json`, beside it. */
export const findingsPathOf = (debriefPath: string): string => debriefPath.replace(/\.json$/, '') + '.findings.json'

/** The file the mod writes: what a poster reads. */
export const findingsFile = (debrief: string, modVersion: string, findings: readonly ModFinding[], hostFindings: readonly ModFinding[] = []) => ({ debrief, modVersion, scrubbed: true as const, findings, host_findings: hostFindings })

/** One line per finding, then where the drafts are; nothing to say prints `no findings`. */
export function findingsLines(findings: readonly ModFinding[], draftsPath: string, hostCount = 0): string[] {
  const aside = hostCount > 0 ? [`${hostCount} host_findings set aside (never posted)`] : []
  if (findings.length === 0) return ['no findings', ...aside]
  return [...findings.map((f, i) => `[${i + 1}] ${f.kind} · ${f.severity} · ${f.surface || '(no surface)'} · ${f.title}`), ...aside, `drafts: ${draftsPath}`]
}

/** MOD-10: the scrubbed findings split into the mod's and the host's. */
export const splitModFindings = (findings: readonly ModFinding[]): { mod: ModFinding[]; host: ModFinding[] } => splitFindings(findings)

// ---- MOD-18: the agent's own proposals --------------------------------------------

/** A proposal line is cut to this many characters. */
export const PROPOSAL_LINE_CAP = 160

const oneLine = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')
const cut = (s: string, cap: number): string => (s.length <= cap ? s : `${s.slice(0, cap - 1).trimEnd()}\u2026`)

/**
 * What the debrief JSON hands the person about the agent's own process, shown and never posted:
 * `proposals: n for you to review (never posted)`, one `target · summary` line per
 * proposed_harness_changes entry, then a count of harness_gaps and stale_memory. Nothing to
 * show (or text that is not a JSON object) is no lines.
 */
export function proposalsLines(json: string): string[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const d = parsed as Record<string, unknown>
  const lines: string[] = []
  for (const raw of Array.isArray(d.proposed_harness_changes) ? d.proposed_harness_changes : []) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const target = oneLine(r.target)
    const summary = oneLine(r.proposed_diff_summary) || oneLine(r.rationale)
    if (target === '' && summary === '') continue
    lines.push(cut(`${target || '(no target)'} \u00b7 ${summary || '(no summary)'}`, PROPOSAL_LINE_CAP))
  }
  const count = (v: unknown): number => (Array.isArray(v) ? v.filter(e => oneLine(e) !== '').length : 0)
  const gaps = count(d.harness_gaps)
  const stale = count(d.stale_memory)
  const counts = [...(gaps > 0 ? [`harness_gaps: ${gaps}`] : []), ...(stale > 0 ? [`stale_memory: ${stale}`] : [])]
  if (lines.length === 0 && counts.length === 0) return []
  return [`proposals: ${lines.length} for you to review (never posted)`, ...lines, ...(counts.length > 0 ? [counts.join(' \u00b7 ')] : [])]
}

// ---- MOD-33: /delegation debrief apply ----------------------------------------------

/** One proposed_harness_changes entry, numbered from 1 in the order the debrief lists the usable ones. */
export type Proposal = { n: number; target: string; rationale: string; summary: string; diff: string }

/** What the person decided about proposal `n`, kept in the .findings.json as `proposals_status`. */
export type ProposalStatus = { n: number; status: 'done' | 'dismissed'; note: string; at: string }

/** The usable proposals of a debrief JSON (the same entries proposalsLines counts); [] for anything that is not one. */
export function parseProposals(json: string): Proposal[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(json)
  } catch {
    return []
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return []
  const list = (parsed as Record<string, unknown>).proposed_harness_changes
  const out: Proposal[] = []
  for (const raw of Array.isArray(list) ? list : []) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    const target = oneLine(r.target)
    const summary = oneLine(r.proposed_diff_summary) || oneLine(r.rationale)
    if (target === '' && summary === '') continue
    const diff = typeof r.proposed_diff === 'string' ? r.proposed_diff.trim() : ''
    out.push({ n: out.length + 1, target: target || '(no target)', rationale: oneLine(r.rationale), summary: summary || '(no summary)', diff })
  }
  return out
}

/** The status records out of a findings file's `proposals_status`; anything malformed is dropped. */
export function parseStatuses(v: unknown): ProposalStatus[] {
  const out: ProposalStatus[] = []
  for (const raw of Array.isArray(v) ? v : []) {
    if (raw === null || typeof raw !== 'object') continue
    const r = raw as Record<string, unknown>
    if (typeof r.n !== 'number' || (r.status !== 'done' && r.status !== 'dismissed')) continue
    out.push({ n: r.n, status: r.status, note: typeof r.note === 'string' ? r.note : '', at: typeof r.at === 'string' ? r.at : '' })
  }
  return out
}

/** The list's status text: open, done: <note> (<date>) or dismissed: <reason> (<date>). */
const statusText = (st: ProposalStatus | undefined): string => {
  if (st === undefined) return 'open'
  return `${st.status}${st.note ? `: ${st.note}` : ''}${st.at ? ` (${st.at.slice(0, 10)})` : ''}`
}

/** One numbered line per proposal: `[n] target · summary (one line) · status`. */
export function proposalListLines(proposals: readonly Proposal[], statuses: readonly ProposalStatus[]): string[] {
  return proposals.map(p => `[${p.n}] ${p.target} · ${cut(p.summary, PROPOSAL_LINE_CAP)} · ${statusText(statuses.filter(s => s.n === p.n).at(-1))}`)
}

/** How many proposals have no done or dismissed record. */
export const openProposals = (proposals: readonly Proposal[], statuses: readonly ProposalStatus[]): number => proposals.filter(p => !statuses.some(s => s.n === p.n)).length

/** The proposal in full: target, rationale, proposed diff. */
export const proposalDetail = (p: Proposal): string[] => [`[${p.n}] ${p.target}`, `rationale: ${p.rationale || '(none)'}`, `proposed diff: ${p.diff || p.summary}`]

const EDIT_TARGET = /(^|\/)CLAUDE\.md$|(^|\/)memory\/|(^|\/)commands\/[^/]+\.md$|(^|\/)agents\/[^/]+\.md$/i
const CODE_TARGET = /^agents\/tasks\/|(^|\/)\.chassis-delegation\.json$|^(hooks|bin|tests)\/|\.(ts|tsx|mjs|js|json|sh)$/i

/** The one instruction block for the brain, by target; the mod itself writes nothing but its own record. */
export function proposalInstruction(p: Proposal): string {
  const t = p.target
  const surface = (MOD_SURFACES as readonly string[]).includes(t.replace(/^\/?(delegation )?/, '').toLowerCase())
  if (CODE_TARGET.test(t) || surface) return `write a card with the card tool from this proposal, show the dry run, dispatch on go, then mark it done naming the card id (/delegation debrief apply ${p.n} done <card id>)`
  if (EDIT_TARGET.test(t)) return `draft the edit to ${t} as a diff, show it to the person, apply it only on their yes, then run /delegation debrief apply ${p.n} done <one line>`
  return `show it to the person and ask what they want done; then /delegation debrief apply ${p.n} done <one line>, or /delegation debrief apply ${p.n} dismiss <reason>`
}

/** `already done: <summary>` / `dismissed: <summary>` for the settled proposals, so the next debrief does not propose them again. */
export const settledLines = (proposals: readonly Proposal[], statuses: readonly ProposalStatus[]): string[] =>
  proposals.flatMap(p => {
    const st = statuses.filter(s => s.n === p.n).at(-1)
    return st === undefined ? [] : [`${st.status === 'done' ? 'already done' : 'dismissed'}: ${p.summary}`]
  })

/** Said under the settled lines. */
export const SETTLED_ASK = 'Do not propose again a change listed as `already done:` or `dismissed:` above.'
