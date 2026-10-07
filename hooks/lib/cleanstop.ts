// The clean-stop detector (SPEC part 2C): when the session has gone quiet with
// friction worth writing down, a background agent runs the /debrief skill.
// Pure: no `$`.

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
}

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
  if (i.lastAt !== undefined && i.now - i.lastAt < i.cooldownMs) {
    return { ok: false, why: `last debrief ${((i.now - i.lastAt) / H).toFixed(1)}h ago (cooldown ${i.cooldownMs / H}h)` }
  }
  return { ok: true }
}

export const debriefPrompt = (skillPath: string, sessionId: string): string =>
  `Run the /debrief skill exactly as written in ${skillPath}. Session id ${sessionId}. Write only what the skill allows.`

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

export const builtInDebriefPrompt = (templatePath: string, sessionId: string, root: string, facts: readonly string[]): string =>
  [
    `Run the debrief exactly as written in ${templatePath}.`,
    `Session id ${sessionId}. Repo root ${root}.`,
    facts.length > 0 ? 'What chassis-delegation saw since the last debrief:' : 'chassis-delegation saw no friction events beyond the verdicts below.',
    ...facts.map(f => `- ${f}`),
    'Write only what it allows.',
  ].join('\n')

/** One thing that went wrong in the session, as the mod saw it. */
export type FrictionEvent = { kind: 'correction' | 'denial' | 'refuted'; detail: string; at: number }

const CORRECTION_WORDS = ['no', 'stop', "don't", 'dont', 'actually']

/** A prompt that corrects: its first word is no, stop, don't or actually, in any case. */
export function isCorrection(text: string): boolean {
  const first = (text.trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[\u2019]/g, "'").replace(/[.,!?:;]+$/, '')
  return CORRECTION_WORDS.includes(first)
}

export const addFriction = (list: readonly FrictionEvent[], ev: FrictionEvent, cap = FRICTION_CAP): FrictionEvent[] => [...list, ev].slice(-cap)

const KIND_TEXT: Record<FrictionEvent['kind'], string> = { correction: 'correction', denial: 'tool denied', refuted: 'refuted' }

/** The facts line by line, as the built-in debrief's prompt carries them. */
export const frictionFacts = (events: readonly FrictionEvent[]): string[] => events.map(e => `${KIND_TEXT[e.kind]}: ${e.detail.replace(/\s+/g, ' ').slice(0, 200)}`)

export const debriefToast = (answer: string): string => {
  const path = debriefPathOf(answer)
  return path ? `debrief written: ${path}` : 'debrief finished'
}
