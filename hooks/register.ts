// chassis-delegation — brain-seat delegation for Claude Code: part 1 (SPEC v1 +
// amendment 1), part 2 (the dispatch tool, quiet verdicts, the clean-stop
// debrief, the eval trigger, compaction state, the scheduler) and part 5
// (standalone: native verification, a built-in tier map, a per-repo config
// file, `/delegation init`, portable briefs, a native git guard, a built-in
// debrief). The hooks stay thin: every decision is a pure function in ./lib,
// and every host command passes ./lib/allow.ts first. Nothing here calls the
// chassis scripts: the mod works in a repo that has only agents/tasks/ cards.
import type { AgentSpawnResult, EngineInterface, PluginOptions, Register, TurnUsage } from 'claude-code'

import type { BandItem, DelegationVerdict, DelegationWorker, QueuedSpawn } from './types'
import { blocksFor, openItemLines } from './lib/dashboard'
import { bandTree } from './lib/band'
import { bashWrites, brainEdit, brainFamily, brainLine, brainSummary, brainTurn, delegateDecision, DELEGATE_DENY, PREMIUM_POSTURE, toolPath, warnRow, WRITE_TOOLS, type BrainRecord, type BrainFamily } from './lib/brain'
import { paneTree, type PaneTable } from './lib/pane'
import { attempts as attemptsOf, dashboardText, isActive, liveView, pickScheme, sampleEvery, sessionRecords, spendSeries, workersUsd as workersUsdOf, type LiveView, type SpendPoint } from './lib/live'
import { metricsFromRecords } from './lib/metrics'
import { checkArgv, refusedLine, type AllowConfig } from './lib/allow'
import {
  attemptsFor,
  escalationSource,
  holdSource,
  judgedShas,
  laneFields,
  lineageResumes,
  nextAttempt,
  patchRecord,
  priorRedHashes,
  verifyTarget,
  taskLabel,
  type AttemptRecord,
  type Lane,
} from './lib/attempts'
import {
  amendNeedsApproval,
  amendScopeInsideForbid,
  amendInsideForbidLine,
  forbidCovering,
  scopeInsideForbidWarning,
  scopeInsideForbid,
  appendAmends,
  budgetWarning,
  effectiveList,
  parseAmends,
  type Amend,
  extractAmendBlocks,
  extractReport,
  findBriefPath,
  inlineHeaderMissing,
  lacksLine,
  noBriefLine,
  parseBudget,
  parseHeader,
  setHeaderField,
  parseReport,
  scopeOverlap,
  spendOf,
  type BriefHeader,
} from './lib/brief'
import { addTurn, ceilingState, liveWorker, overSpendLine, round4, spendCeiling, warnText, OVER_SPEND_NEXT, type Spend } from './lib/cost'
import {
  addFriction,
  breadcrumbPath,
  builtInDebriefPrompt,
  cleanStop,
  countLines,
  debriefPathOf,
  debriefPrompt,
  debriefSkillPath,
  debriefSource,
  debriefToast,
  DEFAULT_DEBRIEF_AGENT,
  DEFAULT_DEBRIEF_COOLDOWN_HOURS,
  DEFAULT_DEBRIEF_IDLE_MINUTES,
  DEFAULT_DEBRIEF_MIN_EVENTS,
  DEFAULT_DEBRIEF_MIN_NEW_LINES,
  frictionFacts,
  isCorrection,
  parseWatermark,
  watermarkPath,
  type FrictionEvent,
} from './lib/cleanstop'
import { appendInstructions, compactBlock, composeSection, emptySnapshot, isEmptyState, owedFrom, prsFrom, renderState, SECTION_ID, type RecentVerdict, type StateSnapshot } from './lib/compaction'
import {
  agentTypeFor,
  branchName,
  briefDirFor,
  briefFileName,
  budgetAttempts,
  cardMatches,
  cardNamesFromLsTree,
  checkDomain,
  checkStatus,
  currentBranchArgv,
  defaultBriefDir,
  DISPATCH_TOOL,
  fetchArgv,
  headShaArgv,
  hereIgnore,
  inlineBriefFileName,
  inlineBriefText,
  installStep,
  lsTreeArgv,
  cardDirPath,
  overlapRefusal,
  overlapWarning,
  parseCard,
  parseDispatchArgs,
  parseDispatchTool,
  renderBrief,
  renderHeader,
  scopeLooksProse,
  PROSE_SCOPE_STOP,
  scratchpadFor,
  showCardArgv,
  spawnDescription,
  spawnPrompt,
  worktreeAddArgv,
  worktreePath,
  type Card,
  type DispatchArgs,
} from './lib/dispatch'
import {
  DEFAULT_EVAL_IDLE_MINUTES,
  DEFAULT_EVAL_LIVE_MAX_USD,
  DEFAULT_SESSION_USD_CAP,
  evalFailureRow,
  evalRunnerPrompt,
  evalToast,
  extractEvalBlock,
  failingLines,
  liveEligible,
  parseEvalBlock,
  parseSha,
  revParseArgv,
  shouldEval,
  type EvalTier,
} from './lib/evaltrigger'
import { gateTemplatesOf, resolveGateRuns } from './lib/gates'
import { gitWrites, guardDeny, joinDir, parseGuardBranches } from './lib/gitguard'
import { handbackMessages, workerSaid } from './lib/handback'
import { INIT_FILES, PLUGIN_MANIFEST, initPlan, initText } from './lib/init'
import { CARD_TOOL, cardFromFields, cardSummary, sayGo } from './lib/card'
import { PATH_TOOLS, ROOT_MARKERS, SHADOWS, allRequiredHold, configLines, detectGate, foundOf, proposedSpend, handoverText, BRAIN_HANDOVER, scaffoldConfig, setupChecks, setupText, wouldSet, type SetupProbe } from './lib/setup'
import { globList, globRoot, isNotWorkTree, noRepoVerdict, reportFiles, scopeCheck, workTreeArgv } from './lib/norepo'
import { deliveryFor, parseVerbosity, quietLine, shortNext, type Rendered, type Verbosity } from './lib/quiet'
import { ignoreWithCards, isGitRef, mergeConfig, parseRepoConfig, REPO_CONFIG_FILE, settingsLayer, type RepoConfig } from './lib/repoconfig'
import { alreadyQueuedDeny, alreadyQueuedPart, drainRefusalRow, enqueue, hasSlot, isFinalDeny, isQueuedDeny, promptKey, queuedDeny, queuedIndex, queuedText, startingOthers, waitedMinutes } from './lib/scheduler'
import {
  CLASSIFIER_LABELS,
  classifierText,
  fableRequested,
  finalAlias,
  tierOf,
  tierWarning,
  needsClassifier,
  noticeText,
  pickTier,
  tierPickLine,
  type Alias,
  type Tier,
  type TierPick,
} from './lib/tier'
import {
  advise,
  firstFailedClaim,
  amendApprovalLine,
  amendedLine,
  amendMalformedLine,
  amendPendingLine,
  branchDelta,
  budgetDenyMessage,
  contextBlock,
  filesPathFor,
  isFailing,
  isProveResume,
  isWorkPresentDeny,
  newestRed,
  probeWork,
  resumeText,
  scratchFor,
  syntheticReport,
  verdictLine,
  verifyAdvice,
  workPresentDeny,
  workPresentLine,
  type Advice,
  type Verdict,
  type WorkPresent,
} from './lib/verify'
import { briefContract, briefWantsRed, verifyCardless, verifyNative, type RedEvidence } from './lib/verify-native'
import { aliasLines, driftMessage, newAgentTypes, nextSighting, parseSighting, parseCandidateIds, shouldClearStatus, statusText } from './lib/watch'
import { MOD_VERSION } from './lib/version'
import { behindLine, changelogSlice, classifyRoot, migrateConfig, updateLine, upToDateLine } from './lib/update'

type Host = EngineInterface

const PLUGIN = 'chassis-delegation'
const WORKERS = { plugin: 'chassis-delegation', key: 'workers' } as const
const STATUS = { plugin: 'chassis-delegation', key: 'status' } as const
const LAST_VERDICT = { plugin: 'chassis-delegation', key: 'lastVerdict' } as const
const QUEUE = { plugin: 'chassis-delegation', key: 'queue' } as const
const SPEND = { plugin: 'chassis-delegation', key: 'spend' } as const
const BRAIN = { plugin: 'chassis-delegation', key: 'brain' } as const
/** MOD-3: the last `git fetch` for the status line's behind count, at most one per ten minutes (in the store: the manifest names no new state key). */
const UPDATE_CHECK = 'delegation.updateCheck'
const UPDATE_CHECK_MS = 10 * 60 * 1000
/** GH-112: the pane `/delegation dashboard` and the band's `[ details ]` open. */
const DASH_PANE = 'delegation-dash'

const K = {
  tasks: (task: string) => `delegation.tasks.${task}`,
  adhoc: 'delegation.adhoc',
  spawn: (key: string) => `delegation.spawn.${key}`,
  agent: (agentId: string) => `delegation.agent.${agentId}`,
  name: (name: string) => `delegation.agentName.${name}`,
  alias: (alias: string) => `delegation.alias.${alias}`,
  /** GH-114: the classifier's tier for a card, from its dry run. */
  classifier: (task: string) => `delegation.classifier.${task}`,
  agentTypes: 'delegation.agentTypes',
  answered: 'delegation.models.answered',
  replay: (briefPath: string) => `delegation.replay.${briefPath}`,
  /** A worker's own spend this attempt, from its turn usage (GH-106). */
  cost: (agentId: string) => `delegation.cost.${agentId}`,
  /** Set once an attempt's verdict row is posted to the conversation. */
  posted: (attemptKey: string) => `delegation.posted.${attemptKey}`,
  /** This session's verdict lines, for the compaction block and the system prompt section (2E). */
  recent: (sessionId: string) => `delegation.recent.${sessionId}`,
  /** The background debrief of a session (2C). */
  debrief: (sessionId: string) => `delegation.debrief.${sessionId}`,
  /** The friction the mod saw in a session (5E): corrections, denials, refutes. */
  friction: (sessionId: string) => `delegation.friction.${sessionId}`,
  /** origin/main when the last T1 eval runner started (2D): never twice per sha. */
  lastSha: 'delegation.eval.lastSha',
  /** The eval runner that is out. */
  evalInflight: 'delegation.eval.inflight',
  /** The T2 run of a session: once a session. */
  live: (sessionId: string) => `delegation.eval.live.${sessionId}`,
  /** Every eval block the runners reported. */
  evals: 'delegation.evals',
}

const PROBE_EVERY_MS = 24 * 60 * 60 * 1000
const STATUS_EVERY_MS = 60 * 1000
const PROMPT_CAP = 20000
const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS
const RECENT_CAP = 50
/** An eval runner out longer than this is taken as gone (a T1 run takes minutes). */
const EVAL_STALE_MS = 3 * HOUR_MS
const EVALS_CAP = 100
const GATE_TIMEOUT_MS = 9 * 60 * 1000
/** The advice kinds that leave something for the brain (or the person) to do. */
const OWED_KINDS = ['resume', 'respawn', 'verify', 'exhausted', 'check', 'fix-brief']
const LEDGER_FILE = '.delegation/ledger.jsonl'

/** `delegation.debrief.<session>`: the background debrief (2C, 5E). */
type DebriefRecord = { lastAt: number; watermark: number; lines: number; sessionId: string; mode?: 'breadcrumbs' | 'events'; builtIn?: boolean; agentId?: string; finishedAt?: number; path?: string; denied?: string }
/** `delegation.friction.<session>`: every friction event's count, and the last 100. */
type FrictionRecord = { total: number; events: FrictionEvent[] }
/** `delegation.eval.inflight`: the eval runner that is out (2D). */
type EvalInflight = { agentId?: string; tier: EvalTier; sha: string; at: number; sessionId: string }
/** One `delegation.evals` row. */
type EvalEntry = { tier: EvalTier; sha: string; total?: number; pass?: number; fail?: number; result?: string; failing: string[]; at: number; agentId: string; sessionId: string }

/**
 * GH-16: what a repo=here attempt record carries besides the attempt: `here`,
 * the checkout it shares (the session root), and `files`, the files= its
 * hand-back claimed (written before the verify, so a sibling's verify sees them).
 */
type HereFields = { here?: string; files?: string[] }
/**
 * GH-1: `requestedAlias: 'fable'` when fable was asked for and opus spawned
 * (item 8); `adhoc: true` on the attempt a cardless hand-back recorded under
 * its report's task= (item 2).
 */
type IssueOneFields = { requestedAlias?: Alias; adhoc?: true }
/** GH-114: what the classifier said of the card at the dry run, on the card's first attempt record. */
type ClassifierFields = { classifierTier?: Tier }
type HereRecord = AttemptRecord & HereFields & IssueOneFields & ClassifierFields
/** GH-16: another repo=here card in flight in the same checkout: a record without a verdict. */
type InFlight = { label: string; scope: string[]; files: string[] }

/** What the mod keeps per spawned worker under `delegation.spawn.<key>` (key = the spawn's tool_use_id). */
type SpawnRecord = {
  key: string
  task: string
  subtask: string
  adhoc: boolean
  /** The worker's current attempt (a resume moves it on). */
  attempt: number
  lineage: number
  tier: Tier
  alias: string
  budget: number
  purpose: string
  briefPath?: string
  /** Why a spawn with no brief file has none (GH-6): what its inline header lacks, or why its brief could not be written. */
  noBrief?: string
  prompt: string
  description: string
  subagentType: string
  cwd?: string
  agentId?: string
  /** The model id the alias resolved to at spawn; a resume keeps it. */
  resolvedModel?: string
  usdAtStart?: number
  /** GH-106: the brief's `spend=` ceiling in dollars (absent: none). */
  spend?: number
  verdictAttempt?: number
  verdictBlock?: string
  lastFailed?: boolean
  /** A `/dispatch --replay` run, from `base`. */
  replay?: boolean
  base?: string
  /** ms since the epoch at spawn. */
  at?: number
  /** The one-line row of the last verdict (2B). */
  verdictLine?: string
  /** GH-16: a repo=here worker: the checkout it shares (the session root). */
  here?: string
}

const laneOf = (s: { replay?: boolean; base?: string }): Lane | undefined =>
  s.replay ? { replay: true, ...(s.base ? { base: s.base } : {}) } : undefined

/** `<task>:<lineage>:<attempt>` (the subtask and a replay lane folded into the task) — one verdict per key. */
const attemptKey = (s: SpawnRecord): string =>
  `${taskLabel(s.task, s.subtask)}${s.replay ? `@replay${s.base ? `-${s.base}` : ''}` : ''}:${s.lineage}:${s.attempt}`

type Config = {
  autoEscalate: boolean
  applyAmends: boolean
  defaultBudget: number
  probeModels: boolean
  candidateIds: string[]
  briefDir: string
  verbosity: Verbosity
  autoDebrief: boolean
  debriefIdleMs: number
  debriefMinNewLines: number
  debriefMinEvents: number
  debriefCooldownMs: number
  debriefAgent: string
  /** On only with an evalCommand configured (5E). */
  autoEval: boolean
  evalLive: boolean
  evalLiveMaxUsd: number
  sessionUsdCap: number
  evalIdleMs: number
  evalAgent: string
  ledgerFile: boolean
  gitGuard: boolean
  /** GH-112: the band above the prompt. */
  dashboardBand: boolean
  /** GH-114: the card tool's dry run asks the classifier beside the card's tier. */
  classifierSecondOpinion: boolean
  guardBranches: string[]
  // defaults < .chassis-delegation.json < settings (5B)
  gateMap: Record<string, string>
  gateTemplates: string[][]
  agentTypes: Record<string, string>
  tierMap: Record<Tier, Alias>
  evalCommand: string
  evalLiveCommand: string
  briefTemplate: string
  briefExtra: string
  maxWorkers: number
  domains: string[]
  worktreeRoot: string
  /** GH-12: the card folder, relative to the root. */
  cardDir: string
  /** GH-16: the delta's base when a brief names none ('' = origin/main → main → origin/master → master). */
  baseRef: string
  /** GH-16: globs always subtracted from a repo=here delta. */
  ignore: string[]
  /** GH-106: dollars one attempt may spend, per tier; 0 = no ceiling. */
  spendByTier: Record<'economy' | 'standard' | 'frontier', number>
  /** GH-113: what an opus or fable brain may do itself. */
  delegateOnly: 'off' | 'warn' | 'deny'
}

function readConfig(o: PluginOptions, repo: RepoConfig): { cfg: Config; errors: string[] } {
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '')
  const budget = typeof o.defaultBudget === 'number' && o.defaultBudget >= 1 ? Math.floor(o.defaultBudget) : 3
  const num = (k: string, fallback: number): number => {
    const v = o[k]
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  }
  const settings = settingsLayer(o)
  const eff = mergeConfig(repo, settings.config)
  return {
    errors: settings.errors,
    cfg: {
      autoEscalate: o.autoEscalate === true,
      applyAmends: o.applyAmends !== false,
      defaultBudget: budget,
      probeModels: o.probeModels === true,
      candidateIds: parseCandidateIds(str('candidateIds')),
      briefDir: str('briefDir'),
      verbosity: parseVerbosity(o.verdictVerbosity),
      autoDebrief: o.autoDebrief !== false,
      debriefIdleMs: num('debriefIdleMinutes', DEFAULT_DEBRIEF_IDLE_MINUTES) * MIN_MS,
      debriefMinNewLines: Math.floor(num('debriefMinNewLines', DEFAULT_DEBRIEF_MIN_NEW_LINES)),
      debriefMinEvents: Math.max(1, Math.floor(num('debriefMinEvents', DEFAULT_DEBRIEF_MIN_EVENTS))),
      debriefCooldownMs: num('debriefCooldownHours', DEFAULT_DEBRIEF_COOLDOWN_HOURS) * HOUR_MS,
      debriefAgent: str('debriefAgent') || DEFAULT_DEBRIEF_AGENT,
      autoEval: eff.autoEval && eff.evalCommand.trim() !== '',
      evalLive: o.evalLive === true,
      evalLiveMaxUsd: num('evalLiveMaxUsd', DEFAULT_EVAL_LIVE_MAX_USD),
      sessionUsdCap: num('sessionUsdCap', DEFAULT_SESSION_USD_CAP),
      evalIdleMs: num('evalIdleMinutes', DEFAULT_EVAL_IDLE_MINUTES) * MIN_MS,
      evalAgent: str('evalAgent') || DEFAULT_DEBRIEF_AGENT,
      ledgerFile: o.ledgerFile !== false,
      gitGuard: o.gitGuard !== false,
      dashboardBand: o.dashboardBand !== false,
      classifierSecondOpinion: o.classifierSecondOpinion !== false,
      guardBranches: parseGuardBranches(str('guardBranches')),
      gateMap: eff.gateMap,
      gateTemplates: gateTemplatesOf(eff.gateMap),
      agentTypes: eff.agentTypes,
      tierMap: eff.tierMap,
      evalCommand: eff.evalCommand,
      evalLiveCommand: eff.evalLiveCommand,
      briefTemplate: eff.briefTemplate,
      briefExtra: eff.briefExtra,
      maxWorkers: eff.maxWorkers,
      domains: eff.domains,
      worktreeRoot: eff.worktreeRoot,
      cardDir: eff.cardDir,
      baseRef: eff.baseRef,
      ignore: eff.ignore,
      spendByTier: eff.spendByTier,
      delegateOnly: eff.delegateOnly,
    },
  }
}

// Module memory: a reload starts it over; the store and $.state stay.
let options: PluginOptions = {}
let repoLayer: RepoConfig = {}
/** The repo file's text as last read: undefined = not read yet, null = no file. */
let repoText: string | null | undefined
let cfg: Config = readConfig({}, {}).cfg
const waiting = new Set<string>() // Agent tool calls still awaiting their result
const handbacks = new Map<string, string>() // agentId → a SubagentHandback message a tool.call hook saw (the transcript is the live source: GH-2)
const finalizing = new Map<string, Promise<Rendered>>() // attempt key → its verify, so a second fire waits on the first
const posted = new Set<string>() // attempt keys whose verdict row went to the conversation
const offered = new Set<string>()
let seedingTypes = false
let delegated = false
/** GH-106: the turn id a subagent's `turn.start` carried (the engine gives none today), by agentId. */
const turnOf = new Map<string, string>()
let lastUsd: number | undefined
let lastCostChangeAt = 0
let statusTimer: { cancel: () => void } | undefined
let sampleTimer: { cancel: () => void } | undefined
/** GH-112: `git worktree list --porcelain`, kept for 15 s so a redraw does not run git. */
let worktreeCache: { at: number; text: string } | undefined
/** GH-112: every task's attempt records, kept 15 s so a redraw does not read the whole store; the mod's own record writes clear it at once. */
let recordsCache: { at: number; records: AttemptRecord[] } | undefined
const RECORDS_TTL_MS = 15_000
let probeTimer: { cancel: () => void } | undefined
let spawnSeq = 0
// Part 2: the main loop's turn state, the idle timers, the scheduler's slots.
// A (re)load does not know whether a main turn is running, so it assumes one is
// until the next main-loop turn.complete: nothing runs in the background before.
let inTurn = true
let idleTimer: { cancel: () => void } | undefined
let evalTimer: { cancel: () => void } | undefined
let debriefBusy = false
let evalBusy = false
let slotSeq = 0
const starting = new Map<number, string>() // slot token → the task label of a spawn holding a slot before $.agent.list shows it
const drainReserved = new Map<string, number>() // promptKey → the slot token the drain reserved for that spawn
/** GH-107: the last refusal posted for a queued task that keeps its place; the same refusal is not posted again on every drain. */
const drainRefusalSeen = new Map<string, string>()
// promptKey → what to record once the spawn hook sees the agent id of a debrief or eval runner the mod started
const runnerStarted = new Map<string, (agentId: string) => Promise<void>>()
const selfDecided = new Set<string>() // promptKeys of spawns spawnSelf has decided: the hook passes them through
const selfIds = new Map<string, string>() // promptKey → the agent id the hook saw for a spawnSelf spawn
let lockTail: Promise<unknown> = Promise.resolve()
let ledgerTail: Promise<unknown> = Promise.resolve()
let frictionTail: Promise<unknown> = Promise.resolve()

/** MOD-3: the folder this copy of the mod loaded from; the one dir `git merge --ff-only origin/main` may run in. */
let loadedRoot = ''
const allowCfg = (): AllowConfig => ({ gateTemplates: cfg.gateTemplates, domains: cfg.domains, ...(cfg.worktreeRoot ? { worktreeRoot: cfg.worktreeRoot } : {}), ...(loadedRoot ? { pluginRoot: loadedRoot } : {}) })

// ---- small host helpers (fail-open) ---------------------------------------
function debug($: Host, text: string) {
  try {
    $.ui.log(`${PLUGIN}: ${text}`, { to: 'debug' })
  } catch {
    // nothing to do
  }
}
async function storeGet<T>($: Host, key: string): Promise<T | undefined> {
  try {
    return (await $.store.get(key)) as T | undefined
  } catch {
    return undefined
  }
}
async function storeSet($: Host, key: string, value: unknown): Promise<void> {
  // a task's attempt records changed: the dashboard's copy is stale (GH-112)
  if (key.startsWith(K.tasks(''))) recordsCache = undefined
  try {
    await $.store.set(key, value)
  } catch (err) {
    debug($, `store.set ${key} failed: ${String(err)}`)
  }
}
async function exists($: Host, path: string): Promise<boolean> {
  try {
    return await $.fs.exists(path)
  } catch {
    return false
  }
}
async function now($: Host): Promise<number> {
  try {
    return await $.clock.now()
  } catch {
    return Date.now()
  }
}
async function sessionUsd($: Host): Promise<number | undefined> {
  try {
    return (await $.session.usage()).cost?.usd
  } catch {
    return undefined
  }
}

type RunOut = { ok: true; exitCode: number; stdout: string; stderr: string } | { ok: false; why: string }

/** The ONLY way the mod runs a host command: a refused argv never reaches `$.process.run`. */
async function run($: Host, argv: string[], init?: { cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number }): Promise<RunOut> {
  loadedRoot = $.plugin.root
  const check = checkArgv(argv, allowCfg())
  if (!check.ok) {
    try {
      $.ui.log(refusedLine(argv, check.reason))
    } catch {
      // the refusal stands either way
    }
    return { ok: false, why: `refused: ${check.reason}` }
  }
  try {
    const r = await $.process.run(argv, init)
    return { ok: true, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (err) {
    return { ok: false, why: String(err) }
  }
}

// ---- part 5B: the repo file ---------------------------------------------------
/** Reads `<root>/.chassis-delegation.json` (when it changed) and remakes the config: defaults < repo file < settings. */
async function loadRepoConfig($: Host): Promise<void> {
  let root: string
  try {
    root = await $.session.root()
  } catch {
    return
  }
  const text = (await readText($, `${root}/${REPO_CONFIG_FILE}`)) ?? null
  if (text === repoText) return
  repoText = text
  const parsed = text === null ? { config: {}, errors: [] } : parseRepoConfig(text)
  repoLayer = parsed.config
  const next = readConfig(options, repoLayer)
  cfg = next.cfg
  const errors = [...parsed.errors, ...next.errors]
  for (const err of errors) debug($, `${REPO_CONFIG_FILE}: ${err}`)
  if (errors.length > 0) $.ui.toast(`${PLUGIN}: ${REPO_CONFIG_FILE}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more in the debug log)` : ''}`)
}

// ---- $.state for the band/pane (part 4 reads it) ---------------------------
async function setWorkers($: Host, fn: (list: DelegationWorker[]) => DelegationWorker[]) {
  try {
    const { value } = await $.state.get(WORKERS)
    await $.state.set(WORKERS, fn(value ?? []).slice(-50))
  } catch {
    // state is a view; the store is the record
  }
  redraw($)
}
async function setLastVerdict($: Host, v: DelegationVerdict) {
  try {
    await $.state.set(LAST_VERDICT, v)
  } catch {
    // as above
  }
  redraw($)
}

// ---- GH-112: the live dashboard (the band above the prompt and the pane) -----------
function redraw($: Host) {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // a view only
  }
}

async function allRecords($: Host): Promise<AttemptRecord[]> {
  // the store is shared with every session on the machine, so a write elsewhere shows within RECORDS_TTL_MS
  const t = await now($)
  if (recordsCache && t - recordsCache.at < RECORDS_TTL_MS) return recordsCache.records
  let keys: string[]
  try {
    keys = await $.store.keys()
  } catch {
    return []
  }
  const out: AttemptRecord[] = []
  for (const key of keys) {
    if (!key.startsWith(K.tasks(''))) continue
    const list = await storeGet<AttemptRecord[]>($, key)
    if (Array.isArray(list)) out.push(...list)
  }
  recordsCache = { at: t, records: out }
  return out
}

async function readSpend($: Host): Promise<SpendPoint[]> {
  try {
    const { value } = await $.state.get(SPEND)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}

// ---- GH-113: the brain's own spend and edits ------------------------------------------
async function readBrain($: Host): Promise<BrainRecord | undefined> {
  try {
    const { value } = await $.state.get(BRAIN)
    return value && typeof value === 'object' ? (value as BrainRecord) : undefined
  } catch {
    return undefined
  }
}

async function updateBrain($: Host, fn: (r: BrainRecord | undefined) => BrainRecord) {
  try {
    await $.state.set(BRAIN, fn(await readBrain($)))
  } catch (err) {
    debug($, `brain record not kept: ${String(err)}`)
  }
  redraw($)
}

/** The family of the model in the brain's seat: `$.session.model()`, else the one a prompt render names. */
async function brainSeat($: Host, fallback?: string): Promise<BrainFamily> {
  try {
    return brainFamily(await $.session.model())
  } catch {
    return brainFamily(fallback)
  }
}

/** The brain's split against the workers' this session: its record, the session's worker attempts, the session dollars. */
async function brainView($: Host): Promise<{ summary: ReturnType<typeof brainSummary>; hasBrain: boolean; hasEdits: boolean }> {
  let since = 0
  let usd: number | undefined
  try {
    const u = await $.session.usage()
    since = u.startedAt ?? 0
    usd = u.cost?.usd
  } catch {
    // unknown: the split is brain + workers
  }
  const records = sessionRecords(await allRecords($), since)
  const rec = await readBrain($)
  return { summary: brainSummary(rec, workersUsdOf(records), attemptsOf(records), usd !== undefined && usd > 0 ? usd : undefined), hasBrain: (rec?.turns ?? 0) > 0, hasEdits: (rec?.edits ?? 0) > 0 }
}

/** One warn row per main-loop turn. */
let brainWarnedThisTurn = false

/** GH-113 delegateOnly: the brain's own writes are counted, and (opus, fable) warned or denied. Undefined = go on. */
async function brainGuard($: Host, e: { tool: unknown; agentId?: string }): Promise<{ deny: string } | undefined> {
  const tool = String(e.tool)
  if (e.agentId || !(WRITE_TOOLS.includes(tool) || tool === 'Bash')) return undefined
  try {
    const input = e as unknown as Record<string, unknown>
    const root = await $.session.root()
    const bash = tool === 'Bash' ? bashWrites(typeof input.command === 'string' ? input.command : '', root) : undefined
    const paths = bash ? bash.paths : toolPath(input)
    if (paths.length === 0 && !bash?.commit) return undefined
    await loadRepoConfig($)
    const family = cfg.delegateOnly === 'off' ? 'other' : await brainSeat($)
    const d = delegateDecision({ mode: cfg.delegateOnly, brainFamily: family, tool, paths, root, cardDir: cfg.cardDir, ...(bash?.commit ? { commit: true } : {}) })
    if (d.edit) await updateBrain($, brainEdit)
    if (d.action === 'deny') return { deny: DELEGATE_DENY }
    if (d.action === 'warn' && d.path !== undefined && !brainWarnedThisTurn) {
      brainWarnedThisTurn = true
      await appendRow($, warnRow(d.path))
    }
  } catch (err) {
    debug($, `delegateOnly not checked: ${String(err)}`)
  }
  return undefined
}

/** `git worktree list --porcelain`, from the cache while it is under 15 s old. */
async function worktreeList($: Host, root: string, t: number): Promise<string> {
  if (worktreeCache && t - worktreeCache.at < 15_000) return worktreeCache.text
  const out = await run($, ['git', '-C', root, 'worktree', 'list', '--porcelain'])
  const text = out.ok && out.exitCode === 0 ? out.stdout : ''
  worktreeCache = { at: t, text }
  return text
}

/** Everything the band and the pane draw: the session's facts gathered, the model made by live.ts. */
async function liveModel($: Host): Promise<{ view: LiveView; since: number; records: AttemptRecord[]; running: { label: string; alias: string; tier: string; at: number }[] }> {
  const t = await now($)
  const live = await liveState($)
  const queue = await readQueue($)
  let since = 0
  let usd = 0
  try {
    const u = await $.session.usage()
    since = u.startedAt ?? 0
    usd = u.cost?.usd ?? 0
  } catch {
    // unknown: the series and the records still draw
  }
  let root = ''
  try {
    root = await $.session.root()
  } catch {
    // no repo: no worktree rows
  }
  const records = await allRecords($)
  const brain = await readBrain($)
  const liveAt: Record<string, number> = {}
  for (const w of live.workers) liveAt[w.label] = w.spawn.at ?? t
  const view = liveView({
    root,
    ...(cfg.worktreeRoot ? { worktreeRoot: cfg.worktreeRoot } : {}),
    porcelain: root ? await worktreeList($, root, t) : '',
    records,
    queue,
    liveAt,
    now: t,
    budget: cfg.defaultBudget,
    since,
    usd,
    series: await readSpend($),
    owed: live.pending.length,
    ...(brain ? { brain } : {}),
  })
  return { view, since, records, running: live.workers.map(w => ({ label: w.label, alias: w.spawn.alias, tier: w.spawn.tier, at: w.spawn.at ?? t })) }
}

/** One sample of the session's dollars; the next waits 15 s while a worker is live or queued, else 60 s. */
async function sampleSpend($: Host): Promise<void> {
  let active = false
  try {
    const t = await now($)
    const live = await liveState($)
    active = live.workers.length + live.pending.length + live.queued > 0
    const usd = await sessionUsd($)
    if (usd !== undefined) await $.state.set(SPEND, spendSeries(await readSpend($), { t, usd }))
    redraw($)
  } catch (err) {
    debug($, `spend not sampled: ${String(err)}`)
  }
  scheduleSample($, sampleEvery(active))
}
function scheduleSample($: Host, ms: number) {
  sampleTimer?.cancel()
  try {
    sampleTimer = $.clock.after(ms, () => void sampleSpend($))
  } catch {
    sampleTimer = undefined
  }
}

// ---- status line ------------------------------------------------------------
async function refreshStatus($: Host) {
  if (!delegated) return
  let running = 0
  try {
    running = (await $.agent.list()).filter(a => a.status === 'running').length
  } catch {
    running = 0
  }
  let pct: number | undefined
  let usd: number | undefined
  try {
    const u = await $.session.usage()
    pct = u.context.percent
    usd = u.cost?.usd
  } catch {
    // leave them unknown
  }
  const t = await now($)
  if (usd !== lastUsd) {
    lastUsd = usd
    lastCostChangeAt = t
  }
  if (shouldClearStatus({ running, now: t, lastCostChangeAt })) {
    $.ui.status(undefined)
    statusTimer?.cancel()
    statusTimer = undefined
    delegated = false
    try {
      await $.state.set(STATUS, '')
    } catch {
      // view only
    }
    return
  }
  const liveNow = (await liveState($)).workers
  const text = statusText({ running, usd, pct }) + (liveNow.length > 0 ? ` · (${liveNow.length} live: ${(await liveLabels($, liveNow)).join(', ')})` : '')
  $.ui.status(text)
  try {
    await $.state.set(STATUS, text)
  } catch {
    // view only
  }
  if (!statusTimer) {
    try {
      statusTimer = $.clock.every(STATUS_EVERY_MS, () => {
        void refreshStatus($)
        // a worker killed without a turn.complete frees its slot here
        void drainQueue($)
      })
    } catch {
      statusTimer = undefined
    }
  }
}

// ---- part 2: live state ($.agent.list × the store) ------------------------------
async function agentList($: Host): Promise<{ id: string; status: string; description: string }[]> {
  try {
    return (await $.agent.list()).map(a => ({ id: a.id, status: a.status, description: a.description }))
  } catch {
    return []
  }
}
async function sessionIdOf($: Host): Promise<string> {
  try {
    return await $.session.id()
  } catch {
    return ''
  }
}
async function readText($: Host, path: string): Promise<string | undefined> {
  try {
    return await $.fs.read(path)
  } catch {
    return undefined
  }
}
async function readQueue($: Host): Promise<QueuedSpawn[]> {
  try {
    const { value } = await $.state.get(QUEUE)
    return Array.isArray(value) ? value : []
  } catch {
    return []
  }
}
async function writeQueue($: Host, queue: QueuedSpawn[]): Promise<void> {
  try {
    await $.state.set(QUEUE, queue)
  } catch (err) {
    debug($, `queue not written: ${String(err)}`)
  }
}

type Live = {
  /** Agents the mod's spawn hook recorded that $.agent.list says are running (ad hoc ones included). */
  running: number
  /** Briefed workers running with their verdict still out: what holds a scheduler slot. */
  workers: { label: string; agentId: string; spawn: SpawnRecord }[]
  /** Briefed workers that handed back and whose verdict is not in, and verifies in flight. */
  pending: { task: string; agentId?: string }[]
  queued: number
}

const isOpen = (s: SpawnRecord): boolean => s.verdictAttempt !== s.attempt

/** The session's delegation as it stands; `exclude` is an agent whose turn just ended. */
async function liveState($: Host, exclude?: string): Promise<Live> {
  const out: Live = { running: 0, workers: [], pending: [], queued: 0 }
  for (const a of await agentList($)) {
    if (a.id === exclude) continue
    const spawn = await spawnByAgent($, a.id)
    if (!spawn) continue
    const label = taskLabel(spawn.task, spawn.subtask)
    if (a.status === 'running') {
      out.running += 1
      if (!spawn.adhoc && isOpen(spawn)) out.workers.push({ label, agentId: a.id, spawn })
    } else if (a.status === 'completed' && !spawn.adhoc && isOpen(spawn)) out.pending.push({ task: label, agentId: a.id })
  }
  for (const key of finalizing.keys()) {
    const label = key.split(':')[0] ?? key
    if (!out.pending.some(p => p.task === label)) out.pending.push({ task: label })
  }
  out.queued = (await readQueue($)).length
  return out
}

// ---- part 2F: the scheduler --------------------------------------------------------
/** One at a time: the slot count and the queue are read and written under this lock. */
function withLock<T>(fn: () => Promise<T>): Promise<T> {
  const chained = lockTail.then(fn, fn)
  lockTail = chained.then(
    () => undefined,
    () => undefined,
  )
  return chained
}

/** A slot for a briefed spawn (a token, released when the spawn hook ends), or the spawn queued. */
async function claimSlot($: Host, item: QueuedSpawn, label: string): Promise<{ token: number } | { deny: string }> {
  return withLock(async () => {
    const live = await liveState($)
    // the token the dispatch path already holds for this very task is not another worker (GH-5)
    const others = startingOthers(starting.values(), label)
    const holders = [...(await liveLabels($, live.workers)), ...others]
    const queue = await readQueue($)
    const held = queuedIndex(queue, item.task, item.subtask ?? 'main')
    if (hasSlot(live.workers.length, others.length, cfg.maxWorkers)) {
      // a spawn of a task that is queued takes the queued place (GH-101)
      if (held >= 0) await writeQueue($, queue.filter((_, i) => i !== held))
      slotSeq += 1
      starting.set(slotSeq, label)
      return { token: slotSeq }
    }
    const entered = enqueue(queue, item)
    if (entered.existing) return { deny: alreadyQueuedDeny(label, entered.existing.at, entered.existing.position) }
    await writeQueue($, entered.queue)
    debug($, `queued ${label}: ${holders.length} workers hold the ${cfg.maxWorkers} slots`)
    return { deny: queuedDeny(label, holders, entered.queue.map(q => taskLabel(q.task, q.subtask ?? 'main'))) }
  })
}

/** Starts the head of the queue while a slot is free; `exclude` is the worker whose turn just ended. */
async function drainQueue($: Host, exclude?: string): Promise<void> {
  for (;;) {
    const picked = await withLock(async () => {
      const queue = await readQueue($)
      const head = queue[0]
      if (!head) return undefined
      const live = await liveState($, exclude)
      if (!hasSlot(live.workers.length, starting.size, cfg.maxWorkers)) return undefined
      slotSeq += 1
      const token = slotSeq
      starting.set(token, taskLabel(head.task, head.subtask ?? 'main'))
      drainReserved.set(promptKey(head), token)
      return { head, token }
    })
    if (!picked) return
    const { head, token } = picked
    let res: { agentId?: string; deny?: string }
    try {
      // model omitted: the spawn hook picks it from the brief, as for any spawn
      res = await spawnSelf($, { prompt: head.prompt, description: head.description, subagentType: head.subagentType, ...(head.cwd ? { cwd: head.cwd } : {}) })
    } catch (err) {
      res = { deny: String(err) }
    }
    // the spawn hook took the reservation and released the slot; if it never ran, release it here
    if (drainReserved.get(promptKey(head)) === token) drainReserved.delete(promptKey(head))
    starting.delete(token)
    const label = taskLabel(head.task, head.subtask ?? 'main')
    if (res.deny !== undefined) {
      const deny = res.deny
      // work present is final too: the work needs --verify, and a respawn would be refused on every drain (the status timer runs one a minute)
      const dropped = isFinalDeny(deny) || isWorkPresentDeny(deny)
      $.ui.toast(`queued ${label} not started: ${deny}`)
      if (dropped) {
        drainRefusalSeen.delete(label)
        await appendRow($, drainRefusalRow(label, deny, true))
        await withLock(async () => writeQueue($, (await readQueue($)).filter(q => !(q.task === head.task && (q.subtask ?? 'main') === (head.subtask ?? 'main')))))
        // the row behind it may start
        continue
      }
      // GH-107: the head keeps its place (position 1); the brain reads a row, not a toast, but the same refusal only once
      if (drainRefusalSeen.get(label) !== deny) {
        drainRefusalSeen.set(label, deny)
        await appendRow($, drainRefusalRow(label, deny, false))
      }
      return
    }
    drainRefusalSeen.delete(label)
    // the head leaves the queue only now that its spawn has succeeded
    await withLock(async () => writeQueue($, (await readQueue($)).filter(q => !(q.task === head.task && (q.subtask ?? 'main') === (head.subtask ?? 'main')))))
    $.ui.toast(`started queued ${label} (waited ${waitedMinutes(head.at, await now($))} min)`)
  }
}

// ---- part 2B: where a verdict goes -------------------------------------------------
function logDebug($: Host, text: string) {
  try {
    $.ui.log(text, { to: 'debug' })
  } catch {
    // nothing to do
  }
}

/** Appends a user-role row the brain reads; refused, the row goes to the transcript log and a toast. */
async function appendRow($: Host, row: string) {
  try {
    await $.session.append({ message: { type: 'user', content: [{ type: 'text', text: row }] } })
  } catch (err) {
    // The model does not read a log line: the toast tells the person to look.
    debug($, `row not appended: ${String(err)}`)
    $.ui.log(row)
    $.ui.toast(row.split('\n')[0] ?? row)
  }
}

/** This session's verdict lines (2E reads them). */
async function noteRecent($: Host, entry: RecentVerdict) {
  const sid = await sessionIdOf($)
  if (!sid) return
  const list = (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []
  await storeSet($, K.recent(sid), [...list, entry].slice(-RECENT_CAP))
}

// ---- GH-106: what each worker spends ----------------------------------------------------
/** A worker's own spend this attempt: the sum of its turns' usage; reset when the attempt moves on (a resume). */
type CostRecord = { attempt: number; spend: Spend; warned?: true; stopped?: true }

async function workerCost($: Host, agentId: string, attempt: number): Promise<Spend | undefined> {
  const rec = await storeGet<CostRecord>($, K.cost(agentId))
  return rec && rec.attempt === attempt ? rec.spend : undefined
}

/** `BE-310 $3.10` for each live worker: its own running cost, the label alone while none is measured. */
async function liveLabels($: Host, workers: readonly { label: string; agentId: string; spawn: SpawnRecord }[]): Promise<string[]> {
  const out: string[] = []
  for (const w of workers) out.push(liveWorker(w.label, (await workerCost($, w.agentId, w.spawn.attempt))?.usd))
  return out
}

/**
 * A worker's turn ended: add its usage to the attempt's own cost, then hold it
 * to its brief's ceiling: one wrap-up message when the cost first reaches
 * `spend=`, and at twice it the over-spend verdict (and the turn ended, if the
 * engine gave us its id). A turn that hands back a report is left to the verifier.
 * True when the wrap-up message went out: the worker carries on, so this turn's end is not judged.
 */
async function trackSpend($: Host, spawn: SpawnRecord, e: { agentId: string; usage?: TurnUsage; answer: string }): Promise<boolean> {
  if (!e.usage) return false
  const prior = await storeGet<CostRecord>($, K.cost(e.agentId))
  const rec: CostRecord = prior && prior.attempt === spawn.attempt ? prior : { attempt: spawn.attempt, spend: undefined as unknown as Spend }
  const spend = addTurn(rec.spend, { ...e.usage, model: e.usage.model || spawn.resolvedModel })
  const next: CostRecord = { ...rec, spend }
  await storeSet($, K.cost(e.agentId), next)
  const ceiling = spawn.spend
  if (spawn.adhoc || ceiling === undefined || ceiling <= 0 || spend.usd === null) return false
  if (spawn.verdictAttempt === spawn.attempt || extractReport(e.answer) !== undefined) return false
  const state = ceilingState(spend.usd, ceiling)
  if (state === 'stop' && !next.stopped) {
    await storeSet($, K.cost(e.agentId), { ...next, stopped: true })
    await overSpend($, spawn, spend.usd, ceiling)
    return false
  } else if (state === 'warn' && !next.warned) {
    await storeSet($, K.cost(e.agentId), { ...next, warned: true })
    try {
      const sent = await $.session.send({ to: { agentId: e.agentId }, text: warnText(spend.usd, ceiling) })
      if (!sent.isDelivered) debug($, `${taskLabel(spawn.task, spawn.subtask)}: spend warning not delivered: ${sent.reason}`)
      return sent.isDelivered
    } catch (err) {
      debug($, `${taskLabel(spawn.task, spawn.subtask)}: spend warning not sent: ${String(err)}`)
    }
  }
  return false
}

/** Twice the ceiling: the attempt's verdict is over-spend; the row says where to look; no escalation (never a failing verdict). */
async function overSpend($: Host, spawnIn: SpawnRecord, usd: number, ceiling: number): Promise<void> {
  const t = await now($)
  const label = taskLabel(spawnIn.task, spawnIn.subtask)
  const own = round4(usd)
  let judged: AttemptRecord | undefined
  if (!spawnIn.adhoc) {
    const lane = laneOf(spawnIn)
    const records = patchRecord(await loadAttempts($, spawnIn.task), spawnIn.subtask, spawnIn.attempt, { verdict: 'over-spend', usd: own, verdictAt: t }, lane)
    await storeSet($, K.tasks(spawnIn.task), records)
    judged = attemptsFor(records, spawnIn.subtask, lane).find(r => r.attempt === spawnIn.attempt)
  }
  const row = overSpendLine({ label, task: spawnIn.task, attempt: spawnIn.attempt, budget: spawnIn.budget, usd: own, spend: ceiling })
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawnIn.key))) ?? spawnIn
  await storeSet($, K.spawn(spawnIn.key), { ...latest, verdictAttempt: spawnIn.attempt, lastFailed: false, verdictBlock: row, verdictLine: row })
  await setWorkers($, list => list.map(w => (w.task === spawnIn.task && w.subtask === spawnIn.subtask && w.attempt === spawnIn.attempt ? { ...w, verdict: 'over-spend' } : w)))
  const next = OVER_SPEND_NEXT(spawnIn.task)
  await setLastVerdict($, { task: label, attempt: spawnIn.attempt, verdict: 'over-spend', next, at: t, text: row })
  await noteRecent($, { task: label, attempt: spawnIn.attempt, verdict: 'over-spend', line: row, at: t, owed: `${label}: ${next}` })
  await appendLedger($, { ...(judged ?? { task: spawnIn.task, subtask: spawnIn.subtask, attempt: spawnIn.attempt }), verdict: 'over-spend', usd: own, next, sessionId: await sessionIdOf($) })
  await appendRow($, row)
  // the worker's running turn, when the engine gave us its id (a subagent's turn.start carries none today)
  const turnId = spawnIn.agentId ? turnOf.get(spawnIn.agentId) : undefined
  if (turnId) {
    try {
      await $.turn.abort({ turnId })
    } catch (err) {
      debug($, `${label}: turn ${turnId} not aborted: ${String(err)}`)
    }
  }
}

// ---- part 5E: friction the mod can see -------------------------------------------------
/** One correction, denial or refute, counted for the debrief's friction signal. */
function noteFriction($: Host, ev: FrictionEvent): Promise<unknown> {
  frictionTail = frictionTail.then(
    async () => {
      const sid = await sessionIdOf($)
      if (!sid) return
      const rec = (await storeGet<FrictionRecord>($, K.friction(sid))) ?? { total: 0, events: [] }
      await storeSet($, K.friction(sid), { total: rec.total + 1, events: addFriction(rec.events, ev) })
    },
    () => undefined,
  )
  return frictionTail
}

// ---- part 5A: the ledger file -------------------------------------------------------------
/** One JSON line per judged attempt in `<root>/.delegation/ledger.jsonl` (append-only; `ledgerFile` off skips it). */
function appendLedger($: Host, row: Record<string, unknown>): Promise<unknown> {
  if (!cfg.ledgerFile) return Promise.resolve()
  ledgerTail = ledgerTail.then(
    async () => {
      const path = `${await $.session.root()}/${LEDGER_FILE}`
      const prev = (await readText($, path)) ?? ''
      await $.fs.write(path, `${prev}${prev === '' || prev.endsWith('\n') ? '' : '\n'}${JSON.stringify(row)}\n`)
    },
    () => undefined,
  )
  return ledgerTail.catch(err => debug($, `ledger line not written: ${String(err)}`))
}

// ---- part 2E: the delegation state -------------------------------------------------
async function snapshot($: Host): Promise<StateSnapshot> {
  const s = emptySnapshot()
  const sid = await sessionIdOf($)
  const live = await liveState($)
  s.running = live.workers.map(w => ({ task: w.label, tier: w.spawn.tier, agentId: w.agentId, ...(w.spawn.at !== undefined ? { at: w.spawn.at } : {}) }))
  s.pending = live.pending
  s.queued = (await readQueue($)).map((q, i) => ({ task: taskLabel(q.task, q.subtask ?? 'main'), position: i + 1 }))
  if (!sid) return s
  const recent = (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []
  s.recent = recent.map(r => ({ line: r.line, at: r.at }))
  const busy = new Set([...s.running.map(r => r.task), ...s.pending.map(p => p.task), ...s.queued.map(q => q.task)])
  s.owed = owedFrom(recent, busy)
  s.prs = prsFrom(recent)
  const debrief = await storeGet<DebriefRecord>($, K.debrief(sid))
  if (debrief?.lastAt !== undefined) {
    s.debrief = { at: debrief.lastAt, ...(debrief.agentId ? { agentId: debrief.agentId } : {}), ...(debrief.path ? { path: debrief.path } : {}), ...(debrief.finishedAt !== undefined ? { finishedAt: debrief.finishedAt } : {}) }
  }
  const inflight = await storeGet<EvalInflight>($, K.evalInflight)
  const last = ((await storeGet<EvalEntry[]>($, K.evals)) ?? []).filter(e => e.sessionId === sid).at(-1)
  if (inflight && inflight.sessionId === sid) s.eval = { tier: inflight.tier, sha: inflight.sha, at: inflight.at, running: true, ...(inflight.agentId ? { agentId: inflight.agentId } : {}) }
  else if (last) s.eval = { tier: last.tier, sha: last.sha, at: last.at, ...(last.pass !== undefined ? { pass: last.pass } : {}), ...(last.total !== undefined ? { total: last.total } : {}) }
  return s
}

async function recipeDir($: Host): Promise<string | undefined> {
  const sid = await sessionIdOf($)
  if (!sid) return undefined
  const pad = scratchpadFor(await $.session.root(), sid)
  return (await exists($, pad)) ? pad : undefined
}

// ---- part 2C/2D: idle timers --------------------------------------------------------
function cancelIdle() {
  idleTimer?.cancel()
  evalTimer?.cancel()
  idleTimer = undefined
  evalTimer = undefined
}

/** (Re)starts the idle timers: the debrief after debriefIdleMinutes, the eval after evalIdleMinutes. */
function armIdle($: Host) {
  cancelIdle()
  try {
    if (cfg.autoDebrief) idleTimer = $.clock.after(cfg.debriefIdleMs, () => void maybeDebrief($))
    if (cfg.autoEval) evalTimer = $.clock.after(cfg.evalIdleMs, () => void maybeEval($))
  } catch (err) {
    debug($, `idle timers not armed: ${String(err)}`)
  }
}

/**
 * 2C + 5E: at a clean stop, a background agent writes the debrief. The
 * friction signal is the harness breadcrumb file when it exists (lines past its
 * `.done` watermark), else the events the mod saw (corrections, denials,
 * refutes) since the last debrief. The instructions are the person's
 * `~/.claude/commands/debrief.md` when it exists, else hooks/templates/debrief.md.
 */
async function maybeDebrief($: Host) {
  if (debriefBusy || inTurn || !cfg.autoDebrief) return
  debriefBusy = true
  try {
    const sid = await sessionIdOf($)
    let home: string | undefined
    try {
      home = await $.env.get('HOME')
    } catch {
      home = undefined
    }
    if (!sid || !home) return debug($, 'no debrief: the session id or HOME is unknown')
    const live = await liveState($)
    const prev = await storeGet<DebriefRecord>($, K.debrief(sid))
    const crumbs = await readText($, breadcrumbPath(home, sid))
    const friction = (await storeGet<FrictionRecord>($, K.friction(sid))) ?? { total: 0, events: [] }
    const mode: 'breadcrumbs' | 'events' = crumbs !== undefined ? 'breadcrumbs' : 'events'
    const lines = mode === 'breadcrumbs' ? countLines(crumbs ?? '') : friction.total
    const watermark = mode === 'breadcrumbs' ? parseWatermark(await readText($, watermarkPath(home, sid))) : prev?.mode === 'events' ? prev.lines : 0
    const t = await now($)
    const verdict = cleanStop({
      inTurn,
      running: live.running,
      pending: live.pending.length,
      queued: live.queued,
      lines,
      watermark,
      minNewLines: mode === 'breadcrumbs' ? cfg.debriefMinNewLines : cfg.debriefMinEvents,
      now: t,
      cooldownMs: cfg.debriefCooldownMs,
      ...(prev ? { lastAt: prev.lastAt, ...(mode === 'breadcrumbs' && prev.mode !== 'events' ? { lastWatermark: prev.watermark } : {}) } : {}),
    })
    if (!verdict.ok) return debug($, `no debrief: ${verdict.why}${mode === 'events' ? ' (friction events)' : ''}`)
    if (inTurn) return
    const source = debriefSource(home, $.plugin.root, await exists($, debriefSkillPath(home)))
    // claimed before the spawn: never twice for this watermark, whatever the spawn does
    const record: DebriefRecord = { lastAt: t, watermark, lines, sessionId: sid, mode, builtIn: source.builtIn }
    await storeSet($, K.debrief(sid), record)
    let prompt: string
    if (source.builtIn) {
      const recent = ((await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []).filter(r => prev === undefined || r.at > prev.lastAt)
      const fresh = friction.events.slice(-Math.max(0, Math.min(friction.events.length, lines - watermark)))
      prompt = builtInDebriefPrompt(source.path, sid, await $.session.root(), [...frictionFacts(fresh), ...recent.map(r => `verdict: ${r.line}`)])
    } else prompt = debriefPrompt(source.path, sid)
    const recordAgent = async (agentId: string) => storeSet($, K.debrief(sid), { ...record, agentId })
    runnerStarted.set(promptKey({ prompt }), recordAgent)
    let res: { agentId?: string; deny?: string }
    try {
      res = await spawnSelf($, { subagentType: cfg.debriefAgent, model: 'sonnet', description: 'debrief', prompt })
    } catch (err) {
      res = { deny: String(err) }
    }
    runnerStarted.delete(promptKey({ prompt }))
    if (res.deny !== undefined) {
      await storeSet($, K.debrief(sid), { ...record, denied: res.deny })
      return debug($, `debrief not started: ${res.deny}`)
    }
    if (res.agentId) await recordAgent(res.agentId)
    $.ui.toast('debrief running in the background')
  } finally {
    debriefBusy = false
  }
}

/** The eval runner of this session still out (its agent not listed as finished). */
async function evalOut($: Host, sid: string): Promise<EvalInflight | undefined> {
  const inflight = await storeGet<EvalInflight>($, K.evalInflight)
  if (!inflight || inflight.sessionId !== sid) return undefined
  if ((await now($)) - inflight.at > EVAL_STALE_MS) return undefined
  const listed = (await agentList($)).find(a => a.id === inflight.agentId)
  return listed && listed.status !== 'running' ? undefined : inflight
}

/** 2D: origin/main moved and the session is idle → one eval runner per sha (only with an evalCommand, 5E). */
async function maybeEval($: Host) {
  if (evalBusy || inTurn || !cfg.autoEval) return
  evalBusy = true
  try {
    const sid = await sessionIdOf($)
    const live = await liveState($)
    const inFlight = (await evalOut($, sid)) !== undefined
    const base = { autoEval: cfg.autoEval, inTurn, running: live.running, pending: live.pending.length, queued: live.queued, inFlight }
    // the cheap checks first: a busy session never runs git
    const busy = shouldEval({ ...base, sha: 'idle', lastSha: undefined })
    if (!busy.ok) return debug($, `no eval: ${busy.why}`)
    const root = await $.session.root()
    const r = await run($, revParseArgv(root), { cwd: root, timeoutMs: 20000 })
    const sha = r.ok && r.exitCode === 0 ? parseSha(r.stdout) : undefined
    const lastSha = await storeGet<string>($, K.lastSha)
    const verdict = shouldEval({ ...base, ...(sha ? { sha } : {}), ...(lastSha ? { lastSha } : {}) })
    if (!verdict.ok || !sha) return debug($, `no eval: ${verdict.ok ? 'origin/main unknown' : verdict.why}`)
    if (inTurn) return
    await storeSet($, K.lastSha, sha) // never twice per sha, whatever the runner does
    await startEvalRunner($, 'T1', sha, root, sid)
  } finally {
    evalBusy = false
  }
}

async function startEvalRunner($: Host, tier: EvalTier, sha: string, root: string, sid: string) {
  const command = tier === 'T1' ? cfg.evalCommand : cfg.evalLiveCommand
  if (!command.trim()) return debug($, `eval ${tier}: no command configured`)
  const prompt = evalRunnerPrompt({ tier, command, root, sha, ...(tier === 'T2' ? { maxUsd: cfg.evalLiveMaxUsd } : {}) })
  const t = await now($)
  const inflight: EvalInflight = { tier, sha, at: t, sessionId: sid }
  // in flight from before the spawn, so a second trigger cannot slip in while it starts
  await storeSet($, K.evalInflight, inflight)
  const recordAgent = async (agentId: string) => storeSet($, K.evalInflight, { ...inflight, agentId })
  runnerStarted.set(promptKey({ prompt, cwd: root }), recordAgent)
  let res: { agentId?: string; deny?: string }
  try {
    res = await spawnSelf($, { subagentType: cfg.evalAgent, model: 'sonnet', description: `eval ${tier}`, prompt, cwd: root })
  } catch (err) {
    res = { deny: String(err) }
  }
  runnerStarted.delete(promptKey({ prompt, cwd: root }))
  if (res.deny !== undefined) {
    await storeSet($, K.evalInflight, null)
    return debug($, `eval ${tier} runner not started: ${res.deny}`)
  }
  if (res.agentId) await recordAgent(res.agentId)
  if (tier === 'T2') await storeSet($, K.live(sid), { sha, at: t })
  debug($, `eval ${tier} runner started at ${sha.slice(0, 8)}`)
}

/**
 * GH-2: the SubagentHandback messages of the run a subagent's transcript ends
 * on, read where the engine keeps them (`$.session.messages({ agentId })`);
 * none when the session cannot read that conversation.
 */
async function transcriptHandbacks($: Host, agentId: string): Promise<string[]> {
  try {
    const rows = await $.session.messages({ agentId })
    if (Array.isArray(rows)) return handbackMessages(rows)
    debug($, `no transcript for ${agentId}: ${rows.deny}`)
  } catch (err) {
    debug($, `no transcript for ${agentId}: ${String(err)}`)
  }
  return []
}

/**
 * What a subagent said at the end of its run (GH-2): its turn's answer, then its
 * hand-back, from a tool.call hook if one saw it and from its transcript. The
 * last `[[report]]` across them is the one judged.
 */
async function workerText($: Host, agentId: string, answer: string): Promise<string> {
  const seen = handbacks.get(agentId)
  return workerSaid(answer, [...(seen ? [seen] : []), ...(await transcriptHandbacks($, agentId))])
}

/**
 * A debrief agent or an eval runner handed back. `said` reads its last turn's
 * answer plus its SubagentHandback message (when it called one): a runner that
 * ends with SubagentHandback leaves its block in the message, not in the turn's
 * answer, so both are read (workerText; the worker path does the same). It is
 * read only once the agent is known to be one of the two.
 */
async function onRunnerComplete($: Host, agentId: string, said: () => Promise<string>) {
  const sid = await sessionIdOf($)
  if (!sid) return
  const t = await now($)
  const debrief = await storeGet<DebriefRecord>($, K.debrief(sid))
  if (debrief?.agentId === agentId && debrief.finishedAt === undefined) {
    const answer = await said()
    handbacks.delete(agentId)
    const path = debriefPathOf(answer)
    await storeSet($, K.debrief(sid), { ...debrief, finishedAt: t, ...(path ? { path } : {}) })
    $.ui.toast(debriefToast(answer))
    return
  }
  const inflight = await storeGet<EvalInflight>($, K.evalInflight)
  if (!inflight || inflight.agentId !== agentId) return
  const answer = await said()
  handbacks.delete(agentId)
  const block = extractEvalBlock(answer)
  const parsed = block ? parseEvalBlock(block) : undefined
  const failing = failingLines(answer)
  const entry: EvalEntry = {
    tier: inflight.tier,
    sha: inflight.sha,
    ...(parsed ? { total: parsed.total, pass: parsed.pass, fail: parsed.fail, result: parsed.result } : {}),
    failing,
    at: t,
    agentId,
    sessionId: sid,
  }
  await storeSet($, K.evals, [...((await storeGet<EvalEntry[]>($, K.evals)) ?? []), entry].slice(-EVALS_CAP))
  await storeSet($, K.evalInflight, null)
  $.ui.toast(evalToast(inflight.tier, parsed))
  if (!parsed || parsed.fail > 0 || parsed.pass < parsed.total) await appendRow($, evalFailureRow(inflight.tier, parsed, failing, inflight.sha))
  if (inflight.tier !== 'T1' || !parsed) return
  const live = liveEligible({
    evalLive: cfg.evalLive && cfg.evalLiveCommand.trim() !== '',
    usd: await sessionUsd($),
    maxUsd: cfg.evalLiveMaxUsd,
    cap: cfg.sessionUsdCap,
    liveRanThisSession: (await storeGet<unknown>($, K.live(sid))) != null,
    t1Fail: parsed.fail,
  })
  if (!live.ok) return debug($, `no T2: ${live.why}`)
  await startEvalRunner($, 'T2', inflight.sha, await $.session.root(), sid)
}

// ---- tier → alias: the built-in map, per repo through tierMap (5B) -----------------
/** The alias a tier pick spawns on: the caller's own family when the caller decided, else `tierMap`. */
const aliasFor = (pick: TierPick) => finalAlias(pick, cfg.tierMap[pick.tier])

async function replayBase($: Host, briefPath: string): Promise<{ base?: string }> {
  const base = await storeGet<string>($, K.replay(briefPath))
  return typeof base === 'string' && base ? { base } : {}
}

async function loadAttempts($: Host, task: string): Promise<AttemptRecord[]> {
  return (await storeGet<AttemptRecord[]>($, K.tasks(task))) ?? []
}

/**
 * GH-16: the other repo=here cards in flight in `root`, from the store: a
 * task + subtask whose records (marked `here: root`) hold one without a
 * verdict. Each with its scope (its brief, amendments applied) and the
 * files= it has claimed so far. `except` (a task label) is left out.
 */
async function inFlightHere($: Host, root: string, except: string): Promise<InFlight[]> {
  let keys: string[]
  try {
    keys = await $.store.keys()
  } catch {
    return []
  }
  const out: InFlight[] = []
  for (const key of keys) {
    if (!key.startsWith(K.tasks(''))) continue
    const records = await storeGet<HereRecord[]>($, key)
    if (!Array.isArray(records)) continue
    for (const subtask of new Set(records.map(r => r.subtask))) {
      const mine = records.filter(r => r.subtask === subtask && r.here === root && !r.replay)
      const open = mine.findLast(r => r.verdict === 'pending')
      if (!open) continue
      const label = taskLabel(open.task, subtask)
      if (label === except) continue
      const briefPath = open.briefPath ?? mine.findLast(r => r.briefPath !== undefined)?.briefPath
      const text = briefPath ? await readText($, briefPath) : undefined
      const contract = text !== undefined ? briefContract(text) : undefined
      out.push({ label, scope: contract !== undefined && contract.ok ? contract.scope : [], files: [...new Set(mine.flatMap(r => r.files ?? []))] })
    }
  }
  return out
}

// ---- agent types + model probes ---------------------------------------------
async function noteAgentTypes($: Host, names: readonly string[]) {
  if (names.length === 0) return
  const known = await storeGet<string[]>($, K.agentTypes)
  if (known === undefined) seedingTypes = true
  const diff = newAgentTypes(known, names)
  if (diff.next.length === (known ?? []).length) return
  await storeSet($, K.agentTypes, diff.next)
  if (!seedingTypes) for (const name of diff.added) $.ui.toast(`new agent type: ${name}`)
}

async function probe($: Host) {
  const answered = (await storeGet<string[]>($, K.answered)) ?? []
  for (const id of cfg.candidateIds) {
    if (answered.includes(id)) continue
    try {
      await $.model.classify('ok', ['ok', 'no'], { model: id })
      answered.push(id)
      $.ui.toast(`${id} answers now`)
    } catch {
      // not yet
    }
  }
  await storeSet($, K.answered, answered)
}

// ---- verify + verdict (5A: native) ---------------------------------------------------
type Verified = { verdict: Verdict; lines: string[]; noRepo?: boolean; red?: string; redHash?: string; redHeld?: true }

/** sha-256 of `bytes`, hex, by the environment's crypto.subtle; undefined when it cannot be taken. */
async function sha256Hex(bytes: Uint8Array): Promise<string | undefined> {
  try {
    const digest = await crypto.subtle.digest('SHA-256', bytes)
    return Array.from(new Uint8Array(digest), b => b.toString(16).padStart(2, '0')).join('')
  } catch {
    return undefined
  }
}

/** The red evidence at `path` (GH-20), read through `$.fs` as bytes: its size, its text, its sha-256. */
async function readRed($: Host, path: string): Promise<RedEvidence> {
  let base64: string
  try {
    base64 = (await $.fs.read(path, { as: 'bytes' })).base64
  } catch (err) {
    return (await exists($, path)) ? { exists: true, error: String(err) } : { exists: false }
  }
  const bin = atob(base64)
  const bytes = Uint8Array.from(bin, c => c.charCodeAt(0))
  const hash = await sha256Hex(bytes)
  return { exists: true, bytes: bytes.length, text: new TextDecoder().decode(bytes), ...(hash !== undefined ? { hash } : {}) }
}

/** The worker's own worktree: the header's repo=, else the spawn's cwd, else the sibling worktree, else the root. */
async function workerRepo($: Host, spawn: Pick<SpawnRecord, 'cwd' | 'task' | 'replay'>, headerRepo: string | undefined, root: string): Promise<string> {
  if (headerRepo) return headerRepo
  if (spawn.cwd && (await exists($, spawn.cwd))) return spawn.cwd
  const sibling = worktreePath(root, spawn.task, spawn.replay, cfg.worktreeRoot)
  return (await exists($, sibling)) ? sibling : root
}

// ---- GH-104: look before you respawn ------------------------------------------------------
/** What the look at a worker's worktree needs of the task: who, where it ran, a replay's base, repo=here. */
type LookFor = { task: string; subtask: string; cwd?: string; replay?: boolean; base?: string; here?: string }

/**
 * GH-104: before a respawn or an auto-resume of a briefed task, the worker's
 * own worktree is read with allowlisted git reads. Work is present when HEAD
 * is not a sha the verifier already judged, the tree is clean, and HEAD has
 * commits ahead of the base (a replay's, the brief's base=, baseRef, else the
 * origin/main chain). Skipped for repo=here and repo=none, and for a worker
 * with no worktree of its own (its tree would be the session root).
 */
async function workInWorktree($: Host, s: LookFor, header: BriefHeader | undefined, records: readonly AttemptRecord[], lane: Lane | undefined): Promise<WorkPresent | undefined> {
  if (s.here || header?.repo === 'here' || header?.repo === 'none') return undefined
  let root: string
  try {
    root = (await $.session.root()).replace(/\/+$/, '')
  } catch {
    return undefined
  }
  const repo = (await workerRepo($, s, header?.repo, root)).replace(/\/+$/, '')
  if (repo === root) return undefined
  const briefBase = (header?.fields.base ?? '').trim()
  const base = s.base || (briefBase && isGitRef(briefBase) ? briefBase : '') || cfg.baseRef || undefined
  const label = taskLabel(s.task, s.subtask)
  const seen = await probeWork({ repo, ...(base ? { base } : {}), judged: judgedShas(records, s.subtask, lane) }, (argv, init) => run($, [...argv], init))
  if (!seen.present) {
    debug($, `${label}: no work present in ${repo} (${seen.why})`)
    return undefined
  }
  debug($, `${label}: ${workPresentLine(seen)} (${seen.ahead} commit${seen.ahead === 1 ? '' : 's'} ahead)`)
  return { sha: seen.sha, branch: seen.branch, ahead: seen.ahead }
}

/**
 * GH-104: the attempt that did not spawn, recorded as `work-present` (kind
 * `verify`, the branch head as its sha) for `/dispatch <id> --verify` to
 * judge. A work-present attempt already last in line moves to the new head
 * instead of doubling. Returns its attempt number.
 */
async function recordWorkPresent(
  $: Host,
  s: { task: string; subtask: string; tier: Tier; alias: string; purpose: string; briefPath?: string; agentId?: string },
  w: WorkPresent,
  lane: Lane | undefined,
): Promise<number> {
  const all = await loadAttempts($, s.task)
  const ladder = all.filter(r => (r as HereRecord).adhoc !== true)
  const last = attemptsFor(ladder, s.subtask, lane).at(-1)
  if (last?.verdict === 'work-present') {
    if (last.sha !== w.sha) await storeSet($, K.tasks(s.task), all.map(r => (r === last ? { ...r, sha: w.sha } : r)))
    return last.attempt
  }
  const attempt = nextAttempt(ladder, s.subtask, lane)
  const agentId = s.agentId ?? last?.agentId
  const briefPath = s.briefPath ?? last?.briefPath
  const rec: HereRecord = {
    task: s.task,
    subtask: s.subtask,
    attempt,
    kind: 'verify',
    lineage: last?.lineage ?? attempt,
    tier: last?.tier ?? s.tier,
    alias: last?.alias ?? s.alias,
    verdict: 'work-present',
    sha: w.sha,
    at: await now($),
    ...(agentId ? { agentId } : {}),
    ...(briefPath ? { briefPath } : {}),
    purpose: s.purpose,
    ...laneFields(lane),
  }
  await storeSet($, K.tasks(s.task), [...all, rec])
  return attempt
}

async function runVerify($: Host, spawn: SpawnRecord, block: string, text: string): Promise<Verified> {
  await loadRepoConfig($)
  const root = await $.session.root()
  const briefPath = spawn.briefPath as string
  let briefText = ''
  try {
    briefText = await $.fs.read(briefPath)
  } catch {
    return { verdict: 'unverified', lines: [`note: the brief ${briefPath} could not be read; verify skipped`] }
  }
  const amendLines = await applyHandbackAmends($, briefPath, briefText, text)
  // the verifier reads the brief as it now stands: header + amend blocks
  briefText = (await readText($, briefPath)) ?? briefText
  const header = parseHeader(briefText)
  const report = parseReport(block)
  const filesPath = filesPathFor(scratchFor(briefPath), spawn.task)
  const allowed = (argv: readonly string[]) => checkArgv(argv, allowCfg()).ok
  if (header?.repo === 'none') return verifyNoRepo($, briefText, report, filesPath, amendLines, root)
  // GH-16: repo=here verifies the session's own checkout, shared with the brain and other workers
  const here = header?.repo === 'here'
  const repo = here ? root : await workerRepo($, spawn, header?.repo, root)
  const probed = await run($, workTreeArgv(repo), { cwd: root, timeoutMs: 15000 })
  if (!probed.ok || isNotWorkTree(probed)) return verifyNoRepo($, briefText, report, filesPath, amendLines, root)
  // GH-20: a red file must differ from every earlier attempt's of this task + subtask
  const priorRed = priorRedHashes(await loadAttempts($, spawn.task), spawn.subtask, spawn.attempt, laneOf(spawn))
  const others = here ? (await inFlightHere($, root, taskLabel(spawn.task, spawn.subtask))).map(c => ({ card: c.label, files: c.files })) : []
  const r = await verifyNative(
    {
      repo,
      report,
      briefText,
      gateMap: cfg.gateMap,
      allowed,
      filesPath,
      gateTimeoutMs: GATE_TIMEOUT_MS,
      priorRed,
      ...(spawn.replay && spawn.base ? { base: spawn.base } : {}),
      ...(cfg.baseRef ? { baseRef: cfg.baseRef } : {}),
      ...(here ? { here: true, ignore: ignoreWithCards(cfg.ignore, cfg.cardDir), others } : {}),
    },
    { exec: (argv, init) => run($, [...argv], init), write: (path, t) => $.fs.write(path, t), readRed: path => readRed($, path) },
  )
  return { verdict: r.verdict, lines: [...amendLines, ...r.lines], ...(r.red ? { red: r.red.path, ...(r.red.hash !== undefined ? { redHash: r.red.hash } : {}), ...(r.red.held ? { redHeld: true as const } : {}) } : {}) }
}

/**
 * Part 3A: a brief with `repo=none` (or a repo that is not a git work tree).
 * No branch, sha or diff to read: every `files=` path must exist under the
 * first scope root and lie in scope; the gate (map id, or a bare allowlisted
 * command such as `claude plugin validate <folder>`) must exit 0.
 */
async function verifyNoRepo($: Host, briefText: string, report: ReturnType<typeof parseReport>, filesPath: string, amendLines: string[], root: string): Promise<Verified> {
  const contract = briefContract(briefText)
  if (!contract.ok) return { verdict: 'refused', lines: [...amendLines, contract.line], noRepo: true }
  // GH-103: a prose scope= gives no root to check files under; the work stands, unverified
  if (contract.scopeProse) return { verdict: 'unverified', lines: [...amendLines, ...contract.lines, 'claim scope: unchecked — scope= reads as prose; add scope_globs= to the brief to check it'], noRepo: true }
  const first = contract.scope[0]
  const scopeRoot = first ? (first.startsWith('/') ? globRoot(first) : `${root}/${globRoot(first)}`.replace(/\/+$/, '')) : root
  const sc = scopeCheck({ files: reportFiles(report.files), root: scopeRoot, scope: globList(contract.scope.join(',')), forbid: globList(contract.forbid.join(',')) })
  const present: string[] = []
  const missing: string[] = []
  for (const p of sc.inScope) (await exists($, p)) ? present.push(p) : missing.push(p)
  const gates = resolveGateRuns(contract.gate, cfg.gateMap, argv => checkArgv(argv, allowCfg()).ok, filesPath, scopeRoot)
  const outcomes: { label: string; exitCode?: number; error?: string }[] = []
  for (const g of gates.runs) {
    const r = await run($, g.argv, { cwd: scopeRoot, timeoutMs: GATE_TIMEOUT_MS })
    outcomes.push(r.ok ? { label: g.label, exitCode: r.exitCode } : { label: g.label, error: r.why })
    if (r.ok && r.exitCode !== 0) break
  }
  const v = noRepoVerdict({
    root: scopeRoot,
    files: present,
    missing,
    outOfScope: sc.outOfScope,
    forbidden: sc.forbidden,
    gates: outcomes,
    notRerun: gates.notRerun.map(n => n.id),
    noGate: gates.none === true,
  })
  return { verdict: v.verdict, lines: [...amendLines, ...contract.lines, ...v.lines], noRepo: true }
}

/**
 * The amend protocol: a worker's `[[amend v=1 …]]` blocks are appended to its
 * brief (append-only, in order, a block already there skipped) before the
 * verifier reads it, which then applies and discloses them. Only blocks of
 * `scope+=` / `forbid+=` go in on the worker's word; one carrying `scope-=` or
 * `forbid-=` is listed for approval and verify runs without it. Returns the
 * row's lines: `amended: …` per block appended, `amend needs approval: …` per
 * block held back, or with applyAmends off every new block and how to accept
 * it. The brief header is never rewritten.
 */
async function applyHandbackAmends($: Host, briefPath: string, briefText: string, text: string): Promise<string[]> {
  const found = extractAmendBlocks(text)
  const lines = found.malformed.map(amendMalformedLine)
  if (found.amends.length === 0) return lines
  // `fresh`: the blocks the brief does not hold yet, in hand-back order.
  const fresh = found.amends.filter(a => appendAmends(briefText, [a.block]).added.length > 0)
  if (fresh.length === 0) return lines
  if (!cfg.applyAmends) return [...lines, ...fresh.map(a => amendPendingLine(a, briefPath))]
  // the effective forbid: the brief as it stands, so a forbid-= it already holds lifts the guard
  const hdr = parseHeader(briefText)
  const forbidNow = effectiveList(hdr?.fields.forbid ?? hdr?.fields.forbid_globs ?? '', parseAmends(briefText).amends, 'forbid')
  // a block's own forbid-= counts: it is held for that anyway, with its own line
  const forbidOf = (a: Amend) => effectiveList(forbidNow, [a], 'forbid').split(',').filter(Boolean)
  const needs = (a: Amend) => amendNeedsApproval(a, forbidOf(a))
  const held = fresh.filter(needs)
  const apply = fresh.filter(a => !needs(a))
  const heldLines = held.flatMap(a => {
    const inside = amendScopeInsideForbid(a, forbidOf(a))
    const removes = a.ops.some(op => /^(scope|forbid)-=/.test(op))
    return [...(removes || inside.length === 0 ? [amendApprovalLine(a, briefPath)] : []), ...inside.map(amendInsideForbidLine)]
  })
  if (apply.length === 0) return [...lines, ...heldLines]
  try {
    await $.fs.write(briefPath, appendAmends(briefText, apply.map(a => a.block)).text)
  } catch (err) {
    return [...lines, `note: amend not appended to ${briefPath}: ${String(err)}; verified against the brief as it was`, ...heldLines]
  }
  return [...lines, ...apply.map(amendedLine), ...heldLines]
}

type Measured = { tokens?: number; model?: string }

/**
 * GH-1 item 2: an ad hoc spawn with no header and no brief file (or an
 * Agent result the spawn hook never saw). Its `[[report]]`, when it hands one
 * back, is verified cardlessly.
 */
const isCardless = (s: SpawnRecord): boolean => s.adhoc && s.briefPath === undefined && s.noBrief === undefined

/** A report's task= as a store key segment, else undefined (the attempt then goes under the spawn's adhoc-<key>). */
const reportTaskOf = (task: string | undefined): string | undefined => {
  const t = (task ?? '').trim()
  return /^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/.test(t) ? t : undefined
}

/**
 * GH-1 item 2: the git claims of a cardless report, checked in the spawn's
 * cwd (else the session root); scope, gate and red are unchecked (no brief).
 */
async function runCardless($: Host, spawn: SpawnRecord, report: ReturnType<typeof parseReport>): Promise<Verified> {
  await loadRepoConfig($)
  const root = await $.session.root()
  const repo = spawn.cwd && (await exists($, spawn.cwd)) ? spawn.cwd : root
  const probed = await run($, workTreeArgv(repo), { cwd: root, timeoutMs: 15000 })
  if (!probed.ok || isNotWorkTree(probed)) return { verdict: 'unverified', lines: [`note: ${repo} is not a git work tree and there is no brief; nothing to verify the report against`] }
  const r = await verifyCardless({ repo, report, ...(cfg.baseRef ? { baseRef: cfg.baseRef } : {}) }, { exec: (argv, init) => run($, [...argv], init) })
  return { verdict: r.verdict, lines: r.lines }
}

/**
 * Verifies one attempt once and returns the lines the brain reads. Two fires
 * for the same attempt (turn.complete twice, or turn.complete beside the Agent
 * result) share one verify: the second waits on the first and gets its block.
 */
async function finalize($: Host, spawnIn: SpawnRecord, text: string, measured: Measured = {}): Promise<Rendered> {
  const key = attemptKey(spawnIn)
  const running = finalizing.get(key)
  if (running) return running
  const job = finalizeOnce($, spawnIn, text, measured)
  finalizing.set(key, job)
  try {
    return await job
  } finally {
    finalizing.delete(key)
  }
}

const renderedOf = (s: SpawnRecord): Rendered => ({ full: s.verdictBlock as string, line: s.verdictLine ?? (s.verdictBlock as string).split('\n')[0] ?? '' })

/** Verifies, records, acts on the advice (autoEscalate), and returns the row in both forms (2B). */
async function finalizeOnce($: Host, spawnIn: SpawnRecord, text: string, measured: Measured): Promise<Rendered> {
  if (spawnIn.verdictAttempt === spawnIn.attempt && spawnIn.verdictBlock) return renderedOf(spawnIn)
  // A caller may hold a record read before an earlier fire stored its verdict.
  const stored = await storeGet<SpawnRecord>($, K.spawn(spawnIn.key))
  if (stored && stored.attempt === spawnIn.attempt && stored.verdictAttempt === spawnIn.attempt && stored.verdictBlock) return renderedOf(stored)
  let spawn = spawnIn
  const tokens = measured.tokens
  const block = extractReport(text)
  const report = block ? parseReport(block) : undefined
  let verdict: Verdict
  let lines: string[] = []
  let noRepo = false
  let red: Pick<AttemptRecord, 'red' | 'redHash' | 'redHeld'> = {}
  // GH-16: a repo=here worker's claimed files go on its record before the verify, so a sibling verifying now subtracts them
  if (report && spawn.here && !spawn.adhoc) {
    const claimed: Partial<AttemptRecord> & HereFields = { files: reportFiles(report.files) }
    await storeSet($, K.tasks(spawn.task), patchRecord(await loadAttempts($, spawn.task), spawn.subtask, spawn.attempt, claimed, laneOf(spawn)))
  }
  const cardless = report !== undefined && isCardless(spawn)
  if (!block) verdict = 'no-report'
  else if (cardless) {
    const v = await runCardless($, spawn, report)
    verdict = v.verdict
    lines = v.lines
  } else if (spawn.adhoc || !spawn.briefPath) {
    verdict = 'unverified'
    lines = [spawn.adhoc && spawn.noBrief === undefined ? 'note: no brief header; verify skipped' : noBriefLine(spawn.noBrief)]
  } else {
    const v = await runVerify($, spawn, block, text)
    verdict = v.verdict
    lines = v.lines
    noRepo = v.noRepo === true
    red = { ...(v.red !== undefined ? { red: v.red } : {}), ...(v.redHash !== undefined ? { redHash: v.redHash } : {}), redHeld: v.redHeld }
  }

  const t = await now($)
  // GH-106: the worker's own cost from its turn usage; else the session's growth, marked ~ (other workers inflate it)
  const own = spawn.agentId ? await workerCost($, spawn.agentId, spawn.attempt) : undefined
  const usdNow = own && own.usd !== null ? undefined : await sessionUsd($)
  const usdApprox = !(own && own.usd !== null) && usdNow !== undefined && spawn.usdAtStart !== undefined
  const usd = own && own.usd !== null ? round4(own.usd) : usdNow !== undefined && spawn.usdAtStart !== undefined ? round4(usdNow - spawn.usdAtStart) : undefined
  const label = taskLabel(spawn.task, spawn.subtask)
  let model = measured.model ?? spawn.resolvedModel
  let advice: Advice
  let judged: AttemptRecord | undefined
  // what the row, the recent list and the ledger name: a cardless attempt goes under its report's task=
  let shownLabel = spawn.adhoc ? spawn.task : label
  let shownAttempt = spawn.attempt
  if (spawn.adhoc && cardless) {
    // GH-1 item 2: recorded under the report's task= (else adhoc-<key>); no ladder, no budget
    const task = reportTaskOf(report?.task) ?? spawn.task
    const subtask = reportTaskOf(report?.subtask) ?? 'main'
    const before = await loadAttempts($, task)
    const attempt = nextAttempt(before, subtask)
    const rec: HereRecord = {
      task,
      subtask,
      attempt,
      kind: 'spawn',
      lineage: attempt,
      tier: spawn.tier,
      alias: spawn.alias,
      verdict,
      ...(report?.gate ? { reportGate: report.gate } : {}),
      verdictAt: t,
      ...(usd !== undefined ? { usd } : {}),
      ...(usd !== undefined && usdApprox ? { usdApprox: true as const } : {}),
      ...(tokens !== undefined ? { tokens } : {}),
      ...(model !== undefined ? { resolvedModel: model } : {}),
      at: spawn.at ?? t,
      ...(spawn.agentId ? { agentId: spawn.agentId } : {}),
      toolUseId: spawn.key,
      purpose: spawn.purpose,
      adhoc: true,
    }
    await storeSet($, K.tasks(task), [...before, rec])
    judged = rec
    shownLabel = taskLabel(task, subtask)
    shownAttempt = attempt
    advice = advise({ verdict, reportGate: report?.gate, task: shownLabel, attempts: 1, budget: spawn.budget, lineageResumes: 0, tier: spawn.tier, adhoc: true, cardless: true, lines })
  } else if (spawn.adhoc) {
    advice = advise({ verdict, task: label, attempts: 1, budget: spawn.budget, lineageResumes: 0, tier: spawn.tier, adhoc: true })
  } else {
    const lane = laneOf(spawn)
    const before = await loadAttempts($, spawn.task)
    // A resume's own record has no model: it runs on its lineage's spawn.
    if (model === undefined) {
      model = attemptsFor(before, spawn.subtask, lane)
        .filter(r => r.attempt === spawn.attempt || r.attempt === spawn.lineage)
        .map(r => r.resolvedModel)
        .find(m => m !== undefined)
    }
    const records = patchRecord(
      before,
      spawn.subtask,
      spawn.attempt,
      {
        verdict,
        reportGate: report?.gate,
        // GH-104: the sha the report named, so a later look at the worktree knows it is judged
        ...(report?.sha ? { sha: report.sha.trim() } : {}),
        // GH-115: the first failed claim, so a scope or files refute holds the tier on a respawn
        ...(verdict === 'refuted' && firstFailedClaim(lines) ? { firstFailed: firstFailedClaim(lines)?.name } : {}),
        verdictAt: t,
        ...(usd !== undefined ? { usd } : {}),
      ...(usd !== undefined && usdApprox ? { usdApprox: true as const } : {}),
        ...(tokens !== undefined ? { tokens } : {}),
        ...(model !== undefined ? { resolvedModel: model } : {}),
        ...red,
      },
      lane,
    )
    await storeSet($, K.tasks(spawn.task), records)
    judged = attemptsFor(records, spawn.subtask, lane).find(r => r.attempt === spawn.attempt)
    advice = advise({
      verdict,
      reportGate: report?.gate,
      task: label,
      attempts: attemptsFor(records, spawn.subtask, lane).length,
      budget: spawn.budget,
      lineageResumes: lineageResumes(records, spawn.subtask, spawn.lineage, lane),
      tier: spawn.tier,
      agentId: spawn.agentId,
      briefPath: spawn.briefPath,
      adhoc: false,
      lines,
    })
  }
  // GH-104: a resume or a respawn looks at the worker's worktree first: finished work there is verified, not redone
  let work: WorkPresent | undefined
  if (!spawn.adhoc && spawn.briefPath && (advice.kind === 'resume' || advice.kind === 'respawn')) {
    const lane = laneOf(spawn)
    const briefText = await readText($, spawn.briefPath)
    work = await workInWorktree($, spawn, briefText !== undefined ? parseHeader(briefText) : undefined, await loadAttempts($, spawn.task), lane)
    if (work) {
      await recordWorkPresent($, spawn, work, lane)
      advice = verifyAdvice(work)
    }
  }
  // a prove resume (GH-1 item 5) counts against the budget as a failing verdict's resume does
  const prove = advice.kind === 'resume' && isProveResume(verdict, report?.gate)
  spawn = { ...spawn, verdictAttempt: spawn.attempt, lastFailed: isFailing(verdict, report?.gate) || prove }
  await storeSet($, K.spawn(spawn.key), spawn)

  let next = advice.next
  let performed = false
  if (cfg.autoEscalate && advice.kind === 'resume' && spawn.agentId) {
    let sent: { isDelivered: boolean; reason?: string }
    try {
      sent = await $.session.send({
        to: { agentId: spawn.agentId },
        text: resumeText({ verdict, task: label, attempt: spawn.attempt, budget: spawn.budget, lines, prove }),
      })
    } catch (err) {
      sent = { isDelivered: false, reason: String(err) }
    }
    performed = sent.isDelivered
    next = sent.isDelivered ? `resumed agent=${spawn.agentId} (autoEscalate)` : `${advice.next} (autoEscalate could not deliver: ${sent.reason})`
  } else if (cfg.autoEscalate && advice.kind === 'respawn') {
    let res: { agentId?: string; deny?: string }
    try {
      res = await spawnSelf($, {
        prompt: spawn.prompt,
        description: spawn.description,
        subagentType: spawn.subagentType,
        ...(spawn.cwd ? { cwd: spawn.cwd } : {}),
      })
    } catch (err) {
      res = { deny: String(err) }
    }
    if (res.deny === undefined) {
      performed = true
      next = `respawned at ${advice.tier}${res.agentId ? ` as ${res.agentId}` : ''} (autoEscalate)`
    } else if (isQueuedDeny(res.deny)) {
      performed = true
      next = `respawn at ${advice.tier} queued — it starts when a worker slot frees (autoEscalate)`
    } else next = `${advice.next} (autoEscalate spawn refused: ${res.deny})`
  }

  const shownVerdict = noRepo ? `${verdict} (no repo)` : verdict
  // GH-104: work present rides under the verdict line in both forms
  const workLine = work ? workPresentLine(work) : undefined
  const full = contextBlock(verdictLine({ verdict: shownVerdict as Verdict, task: shownLabel, attempt: shownAttempt, budget: spawn.budget, usd, usdApprox, model, next }), workLine ? [workLine, ...lines] : lines)
  const quiet = quietLine({ task: shownLabel, attempt: shownAttempt, budget: spawn.budget, verdict, ...(noRepo ? { noRepo } : {}), ...(report?.gate ? { reportGate: report.gate } : {}), alias: spawn.alias, ...(usd !== undefined ? { usd, usdApprox } : {}), next, lines })
  const line = workLine ? `${quiet}\n${workLine}` : quiet
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn
  await storeSet($, K.spawn(spawn.key), { ...latest, verdictAttempt: spawn.attempt, lastFailed: spawn.lastFailed, verdictBlock: full, verdictLine: line })
  await setWorkers($, list => list.map(w => (w.task === spawn.task && w.subtask === spawn.subtask && w.attempt === spawn.attempt ? { ...w, verdict } : w)))
  await setLastVerdict($, { task: shownLabel, attempt: shownAttempt, verdict, next, at: t, text: full })
  // a cardless hand-back is posted, kept and ledgered like any other (GH-1 item 2)
  if (!spawn.adhoc || cardless) {
    const owed = OWED_KINDS.includes(advice.kind) && !performed ? `${shownLabel}: ${shortNext(next)}` : undefined
    await noteRecent($, { task: shownLabel, attempt: shownAttempt, verdict, line: quiet, at: t, ...(owed ? { owed } : {}), ...(report?.pr ? { pr: report.pr } : {}) })
    if (verdict === 'refuted') void noteFriction($, { kind: 'refuted', detail: line, at: t })
    await appendLedger($, { ...(judged ?? { task: spawn.task, subtask: spawn.subtask, attempt: spawn.attempt }), verdict, noRepo: noRepo || undefined, next: shortNext(next), sessionId: await sessionIdOf($) })
  }
  return { full, line }
}

/** Hands a verdict to the brain per verdictVerbosity: the row it returns, plus the log and toast (2B). */
function sideEffects($: Host, r: Rendered, adhoc: boolean): string | undefined {
  const d = deliveryFor(cfg.verbosity, r)
  if (d.log) logDebug($, d.log)
  // silent means silent: an ad hoc spawn's verdict is not toasted
  if (d.toast && !adhoc) $.ui.toast(d.toast)
  return d.row
}

/**
 * True once per attempt: the first caller claims `<task>:<lineage>:<attempt>`
 * (synchronously, so two fires racing cannot both claim it) and the store
 * remembers it across a reload. A repeat is skipped and logged to debug.
 */
async function claimPost($: Host, spawn: SpawnRecord): Promise<boolean> {
  const key = attemptKey(spawn)
  if (posted.has(key)) {
    debug($, `verdict row for ${key} already posted; repeat skipped`)
    return false
  }
  posted.add(key)
  if ((await storeGet<boolean>($, K.posted(key))) === true) {
    debug($, `verdict row for ${key} already posted (store); repeat skipped`)
    return false
  }
  await storeSet($, K.posted(key), true)
  return true
}

async function spawnByAgent($: Host, agentId: string | undefined): Promise<SpawnRecord | undefined> {
  if (!agentId) return undefined
  const key = await storeGet<string>($, K.agent(agentId))
  return key ? storeGet<SpawnRecord>($, K.spawn(key)) : undefined
}

// ---- part 5D: the git guard ---------------------------------------------------------------
/** The folder a Bash call runs in: the worker's own (its spawn's cwd), else the session's. */
async function bashCwd($: Host, agentId: string | undefined): Promise<string> {
  const spawn = await spawnByAgent($, agentId)
  if (spawn?.cwd) return spawn.cwd
  try {
    return await $.session.cwd()
  } catch {
    return $.session.root()
  }
}

/** The branch `dir` is on, or undefined (not a repo, detached, git missing). */
async function branchOf($: Host, dir: string): Promise<string | undefined> {
  const r = await run($, ['git', '-C', dir, 'rev-parse', '--abbrev-ref', 'HEAD'], { timeoutMs: 10000 })
  if (!r.ok || r.exitCode !== 0) return undefined
  const b = r.stdout.trim()
  return b && b !== 'HEAD' ? b : undefined
}

// ---- /dispatch <TASK-ID> [--dry-run] [--base <sha>] -------------------------------
/** The cards for `id` in the working tree. */
async function cardsInTree($: Host, tasksDir: string, id: string): Promise<{ name: string; card: Card }[] | string> {
  let names: string[]
  try {
    names = (await $.fs.list(tasksDir)).map(entry => entry.name)
  } catch {
    return `/dispatch ${id}: no card folder at ${tasksDir} (run /delegation init to scaffold one)`
  }
  const found: { name: string; card: Card }[] = []
  for (const name of cardMatches(names, id)) {
    try {
      const card = parseCard(await $.fs.read(`${tasksDir}/${name}`))
      if (!('error' in card) && card.id === id) found.push({ name, card })
    } catch {
      // unreadable: not a match
    }
  }
  return found
}

/** The cards for `id` at the base commit (replay): `git ls-tree`, then `git show` per match, both read-only. */
async function cardsAtBase($: Host, root: string, id: string, base: string): Promise<{ name: string; card: Card }[] | string> {
  const listed = await run($, lsTreeArgv(root, base), { cwd: root, timeoutMs: 20000 })
  if (!listed.ok || listed.exitCode !== 0) {
    return `/dispatch ${id}: could not list agents/tasks/ at ${base}: ${listed.ok ? listed.stderr.trim() || `exit ${listed.exitCode}` : listed.why}`
  }
  const found: { name: string; card: Card }[] = []
  for (const name of cardMatches(cardNamesFromLsTree(listed.stdout), id)) {
    const shown = await run($, showCardArgv(root, base, name), { cwd: root, timeoutMs: 20000 })
    if (!shown.ok || shown.exitCode !== 0) continue
    const card = parseCard(shown.stdout)
    if (!('error' in card) && card.id === id) found.push({ name, card })
  }
  return found
}

/** Writes the brief to `<root>/.delegation/briefs/` (or briefDir); the session scratchpad only when the root is not writable. */
async function writeBrief($: Host, root: string, fileName: string, text: string): Promise<{ path: string } | { error: string }> {
  const primary = `${briefDirFor(root, cfg.briefDir)}/${fileName}`
  try {
    await $.fs.write(primary, text)
    return { path: primary }
  } catch (err) {
    if (cfg.briefDir) return { error: `the brief could not be written to ${primary}: ${String(err)}` }
    const sid = await sessionIdOf($)
    if (sid && (await exists($, scratchpadFor(root, sid)))) {
      const fallback = `${defaultBriefDir(root, sid)}/${fileName}`
      try {
        await $.fs.write(fallback, text)
        return { path: fallback }
      } catch (err2) {
        return { error: `the brief could not be written to ${primary} (${String(err)}) nor ${fallback} (${String(err2)})` }
      }
    }
    return { error: `the brief could not be written to ${primary}: ${String(err)}; set briefDir in /config (${PLUGIN})` }
  }
}

/** The brief already written as `fileName`: in briefDir (or `<root>/.delegation/briefs/`), else in the session scratchpad fallback. */
async function existingBrief($: Host, root: string, fileName: string): Promise<string | undefined> {
  const primary = `${briefDirFor(root, cfg.briefDir)}/${fileName}`
  if (await exists($, primary)) return primary
  if (cfg.briefDir) return undefined
  const sid = await sessionIdOf($)
  const fallback = sid ? `${defaultBriefDir(root, sid)}/${fileName}` : undefined
  return fallback && (await exists($, fallback)) ? fallback : undefined
}

/**
 * GH-6: a spawn whose prompt names no brief file but carries a complete
 * header gets one, `<task>.<subtask>.brief.md` in the brief folder: the
 * header, then the rest of the prompt. A file already there (an earlier
 * attempt's, amend blocks and all) is reused, never overwritten. Else `why`
 * says what kept the header from becoming a brief, for the unverified line.
 */
async function inlineBrief($: Host, prompt: string, header: BriefHeader): Promise<{ path: string } | { why: string }> {
  const missing = inlineHeaderMissing(header)
  if (missing.length > 0) return { why: lacksLine(missing) }
  const fileName = inlineBriefFileName(header.task as string, header.subtask)
  if (!fileName) return { why: `the inline header's task=${header.task} subtask=${header.subtask} cannot name a brief file` }
  let root: string
  try {
    root = await $.session.root()
  } catch (err) {
    return { why: `the inline brief was not written: ${String(err)}` }
  }
  const reuse = await existingBrief($, root, fileName)
  if (reuse) return { path: reuse }
  const written = await writeBrief($, root, fileName, inlineBriefText(prompt, header.raw))
  return 'error' in written ? { why: written.error.replace(/^the brief /, "the inline header's brief ") } : written
}

/**
 * The ONE dispatch function behind both doors (2A): `/dispatch` parses its
 * flags into DispatchArgs, the model's `dispatch` tool parses its input into
 * the same, and both land here.
 *
 * GH-16: `--here` (or a card's `repo: here`) dispatches into the session's own
 * checkout: the brief says `repo=here` (with `base=` when baseRef or a sha
 * `--base` names one, and `ignore=` = the config's globs plus the files other
 * in-flight cards claimed), nothing is fetched, no worktree is added, and the
 * worker spawns in the root. A scope that overlaps an in-flight repo=here
 * card's is refused unless `--force-overlap`.
 */
async function runDispatch($: Host, parsed: DispatchArgs): Promise<string> {
  // a slot that freed with no hand-back is found here, before this dispatch counts (GH-101)
  await drainQueue($)
  const text = await dispatchOnce($, parsed)
  if (!text.includes('\n4. spawned ')) await drainQueue($)
  return text
}

async function dispatchOnce($: Host, parsed: DispatchArgs): Promise<string> {
  if (parsed.error !== undefined) return parsed.error
  if (parsed.verify !== undefined) return runVerifyDispatch($, parsed.id, parsed.verify)
  await loadRepoConfig($)
  const { id, dryRun, scope, forbid } = parsed
  let base = parsed.base
  const replay = parsed.replay === true
  const out: string[] = []
  const root = await $.session.root()
  const tasksDir = cardDirPath(root, cfg.cardDir)
  // replay reads the default folder: the allowlist's git shapes name agents/tasks/
  const found = replay ? await cardsAtBase($, root, id, base) : await cardsInTree($, tasksDir, id)
  if (typeof found === 'string') return found
  const where = replay ? `${cardDirPath(root)} at ${base}` : tasksDir
  if (found.length !== 1) {
    return found.length === 0
      ? `/dispatch ${id}: no card under ${where} (looked for ${id}-*.md with id: ${id})`
      : `/dispatch ${id}: ${found.length} cards claim ${id} (${found.map(f => f.name).join(', ')}); fix the board first`
  }
  const { name, card } = found[0] as { name: string; card: Card }
  const refusal = checkStatus(card) ?? checkDomain(card, cfg.domains)
  if (refusal) return `/dispatch ${id}: ${refusal}${replay ? ` (read at ${base})` : ''}`

  // An existing brief is reused, never overwritten, and it decides the mode.
  const fileName = briefFileName(id, replay)
  const reuse = await existingBrief($, root, fileName)
  const reusedText = reuse ? await readText($, reuse) : undefined
  const reusedHeader = reusedText !== undefined ? parseHeader(reusedText) : undefined
  const wantHere = !replay && (parsed.here === true || card.repo === 'here')
  const here = !replay && (reusedHeader ? reusedHeader.repo === 'here' : wantHere)
  // MOD-2: no base named, a reused worktree brief that carries one: the cut point is that base, the verifier's base too
  const reusedBase = (reusedHeader?.fields.base ?? '').trim()
  if (!replay && !here && base === 'origin/main' && reusedBase && isGitRef(reusedBase)) base = reusedBase

  const worktree = here ? root : worktreePath(root, id, replay, cfg.worktreeRoot)
  let branch = branchName(card.domain, id, replay)
  if (here) {
    const current = await run($, currentBranchArgv(root), { cwd: root, timeoutMs: 10000 })
    branch = current.ok && current.exitCode === 0 && current.stdout.trim() ? current.stdout.trim() : '<current branch>'
  }
  // A replay's worktree is checked out at the base, where the card is still queued.
  const cardPath = replay ? `${worktree}/agents/tasks/${name}` : `${tasksDir}/${name}`
  out.push(
    replay
      ? `1. card ${base}:agents/tasks/${name} (status ${card.status} at ${base}, domain ${card.domain}) — replay of ${id} at ${base}`
      : `1. card ${cardPath} (status ${card.status}, domain ${card.domain})`,
  )
  if (replay && card.repo === 'here') out.push('   note: the card says repo: here; a replay works in its own worktree at the base')

  // GH-16: the other repo=here cards in flight in this checkout; a scope overlapping theirs is refused
  const inflight = here ? await inFlightHere($, root, id) : []
  if (here) {
    const reusedContract = reusedText !== undefined ? briefContract(reusedText) : undefined
    const mine = reusedContract !== undefined && reusedContract.ok ? reusedContract.scope : [...(scope ?? card.scope)]
    const overlaps = inflight.flatMap(c => {
      const pair = scopeOverlap(mine, c.scope)
      return pair ? [{ card: c.label, ...pair }] : []
    })
    if (overlaps.length > 0 && parsed.forceOverlap !== true) return [...out, ...overlaps.map(o => overlapRefusal(id, o.mine, o.card, o.theirs))].join('\n')
    for (const o of overlaps) out.push(`   ${overlapWarning(id, o.mine, o.card, o.theirs)}`)
  }

  const tier: Tier = tierOf(card.tier) ?? 'standard'
  const alias = finalAlias({ tier, source: 'brief' }, cfg.tierMap[tier]).alias
  const budget = budgetAttempts(card.budget, cfg.defaultBudget)
  // GH-106: the card's spend: wins, else the tier's default; 0 is no ceiling
  const spend = spendCeiling(card.spend, tier, cfg.spendByTier)
  let header: string
  if (here && !reuse) {
    // base=: a sha --base, else baseRef (HEAD pinned to the sha it is at now), else none (the verifier's chain)
    let hereBase: string | undefined = base !== 'origin/main' ? base : cfg.baseRef || undefined
    if (hereBase === 'HEAD') {
      const head = await run($, headShaArgv(root), { cwd: root, timeoutMs: 10000 })
      const sha = head.ok && head.exitCode === 0 ? head.stdout.trim() : ''
      if (/^[0-9a-f]{7,40}$/.test(sha)) hereBase = sha
      else out.push('   note: baseRef HEAD could not be pinned (git rev-parse HEAD failed); the brief says base=HEAD')
    }
    const ignore = hereIgnore(ignoreWithCards(cfg.ignore, cfg.cardDir), inflight.flatMap(c => c.files))
    header = renderHeader({ card, tier, alias, budget, ...(spend > 0 ? { spend } : {}), ...(scope ? { scope } : {}), ...(forbid ? { forbid } : {}), repo: 'here', ...(hereBase ? { base: hereBase } : {}), ignore })
  } else {
    // GH-105: a base that is not the default is written, so the verifier diffs from the commit the worktree was cut from
    header = renderHeader({ card, tier, alias, budget, ...(spend > 0 ? { spend } : {}), ...(scope ? { scope } : {}), ...(forbid ? { forbid } : {}), ...(base !== 'origin/main' ? { base } : {}) })
  }
  let briefPath: string
  let shown = header
  if (reuse) {
    briefPath = reuse
    shown = reusedHeader?.raw ?? header
    // MOD-2: a dispatch that names a base writes it into the reused brief's header; the rest of the file is untouched
    let baseNote = ''
    if (!here && !replay && reusedText !== undefined && parsed.base !== 'origin/main' && reusedHeader && reusedBase !== parsed.base) {
      const set = setHeaderField(reusedText, 'base', parsed.base)
      await $.fs.write(briefPath, set.text)
      shown = parseHeader(set.text)?.raw ?? shown
      baseNote = set.previous !== undefined ? `, base= replaced ${set.previous} → ${parsed.base}` : `, base= set to ${parsed.base}`
    }
    out.push(`2. brief ${briefPath} exists — reused${baseNote || ', not overwritten'}${scope || forbid ? ' (--scope/--forbid not applied to it)' : ''}`)
    if (here !== wantHere && !replay) out.push(`   note: the reused brief is ${here ? 'repo=here' : 'a worktree brief'}, so it decides the mode (remove it to re-render)`)
  } else {
    let template: string
    try {
      template = await $.fs.read(cfg.briefTemplate || `${$.plugin.root}/hooks/templates/brief.md`)
    } catch (err) {
      return [...out, `/dispatch ${id}: the brief template could not be read: ${String(err)}`].join('\n')
    }
    let rootNames: string[] = []
    try {
      rootNames = (await $.fs.list(root)).map(e => e.name)
    } catch {
      rootNames = []
    }
    const body = renderBrief(template, { card, worktree, branch, cardPath, install: installStep(rootNames), extra: cfg.briefExtra, here, spend })
    const written = await writeBrief($, root, fileName, `${header}\n\n${body}`)
    if ('error' in written) return [...out, `/dispatch ${id}: ${written.error}`].join('\n')
    briefPath = written.path
    out.push(`2. brief ${briefPath} written (tier=${tier}, model=${alias}, budget=${budget}-attempts${here ? ', repo=here' : ''})`)
  }
  // GH-1 item 6: the budget the spawn will use, off the grammar, falls back to the default; say so once
  const budgetWarn = budgetWarning(reuse ? reusedHeader?.budget : card.budget, cfg.defaultBudget)
  if (budgetWarn) out.push(`   ${budgetWarn}`)
  // GH-108: a card tier the mod does not know runs at standard, and says so once
  const tierWarn = tierWarning(reuse ? reusedHeader?.tier : card.tier)
  if (tierWarn) out.push(`   ${tierWarn}`)
  if (!scope && scopeLooksProse(card.scope)) {
    out.push('   note: the card scope reads as prose; the verifier leaves a prose scope unchecked unless the brief gains scope_globs= — pass scope globs')
  }
  const shownHeader = parseHeader(shown)
  const shownForbid = (shownHeader?.fields.forbid ?? '').split(',').filter(Boolean)
  for (const entry of scopeInsideForbid((shownHeader?.fields.scope ?? '').split(',').filter(Boolean), shownForbid)) {
    out.push(`   ${scopeInsideForbidWarning(entry, forbidCovering(entry, shownForbid) as string)}`)
  }
  if (here) {
    const f: Record<string, string> = shownHeader?.fields ?? {}
    out.push(`   repo=here: base=${f.base || 'the chain (origin/main, main, origin/master, master)'} · ignore=${f.ignore || '(none)'}`)
  }
  if (dryRun) return [...out, '', shown].join('\n')

  // GH-103: a prose scope with no globs is caught here, before the worktree and the spawn
  const shownScope = (shownHeader?.fields.scope ?? '').split(',').filter(Boolean)
  if (!scope && !shownHeader?.fields.scope_globs && scopeLooksProse(shownScope)) {
    return [...out, '', shown, '', `scope: ${shownScope.join(', ')}`, '', PROSE_SCOPE_STOP].join('\n')
  }

  if (here) out.push(`3. no worktree (repo=here): the worker shares ${root}`)
  else if (await exists($, worktree)) out.push(`3. worktree ${worktree} exists — reused`)
  else {
    const fetched = await run($, fetchArgv(root), { cwd: root, timeoutMs: 120000 })
    const fetchWhy = fetched.ok ? fetched.stderr.trim() || `exit ${fetched.exitCode}` : fetched.why
    if (!fetched.ok || fetched.exitCode !== 0) {
      // a sha base needs no fetch; origin/main does
      if (base === 'origin/main') return [...out, `3. git fetch failed: ${fetchWhy} (the repo needs an origin remote with a main branch, or pass a sha base, or dispatch with --here)`].join('\n')
      out.push(`   note: git fetch failed (${fetchWhy}); continuing from ${base}`)
    }
    const added = await run($, worktreeAddArgv(root, card.domain, id, base, replay, cfg.worktreeRoot), { cwd: root, timeoutMs: 120000 })
    if (!added.ok || added.exitCode !== 0) {
      return [...out, `3. git worktree add failed: ${added.ok ? added.stderr.trim() : added.why}`].join('\n')
    }
    out.push(`3. worktree ${worktree} on ${branch} from ${base}`)
  }

  const subagentType = agentTypeFor(card.domain, cfg.agentTypes, (await storeGet<string[]>($, K.agentTypes)) ?? [])
  // the spawn hook reads the base back to mark the attempt rows replay: true, base
  if (replay) await storeSet($, K.replay(briefPath), base)
  let res: { model?: string; agentId?: string; deny?: string }
  const prompt = spawnPrompt(briefPath)
  // repo=here: `worktree` is the root itself
  const place = here ? `repo=here in ${root}` : `worktree ${worktree}`
  try {
    res = await spawnSelf($, { prompt, description: spawnDescription(id, card.title), subagentType, cwd: worktree })
  } catch (err) {
    res = { deny: String(err) }
  }
  const already = res.deny !== undefined ? alreadyQueuedPart(res.deny) : undefined
  if (already) return [...out, `4. ${already}`, `brief ${briefPath} · ${place} · branch ${branch} · ${already}`].join('\n')
  if (res.deny !== undefined && isQueuedDeny(res.deny)) {
    // the scheduler (2F) holds it until a worker slot frees
    const queue = await readQueue($)
    const at = queue.map(q => promptKey(q)).lastIndexOf(promptKey({ prompt, cwd: worktree }))
    const queued = queuedText(at >= 0 ? at + 1 : queue.length)
    out.push(`4. ${queued} — ${res.deny}`)
    out.push(`brief ${briefPath} · ${place} · branch ${branch} · ${queued}`)
    return out.join('\n')
  }
  if (res.deny !== undefined) return [...out, `4. spawn refused: ${res.deny}`].join('\n')
  const decided = await spawnByAgent($, res.agentId)
  // GH-104: the line says what the spawn spends: the model and the attempt of the budget
  out.push(`4. spawned ${subagentType} agent ${res.agentId ?? '(id pending)'} on ${res.model ?? '(model pending)'}${decided ? ` · attempt ${decided.attempt}/${decided.budget}` : ''}`)
  out.push(`brief ${briefPath} · ${place} · branch ${branch} · agent ${res.agentId ?? '(id pending)'} · tier=${decided?.tier ?? tier} → ${decided?.alias ?? alias}`)
  return out.join('\n')
}

/**
 * GH-104: `/dispatch <ID> --verify <sha>` (the tool's `verify`): no spawn. The
 * native verifier runs on the task's own tree (its worktree, or the root for
 * repo=here) at the sha, against the task's existing brief, with a synthetic
 * report naming the delta (merge-base(base, sha)..sha), gate=pass and the
 * newest red file when the brief asks for one. The verdict lands on the
 * work-present attempt when that is the last one, else on a new `verify`
 * attempt, and the advice follows as for any hand-back.
 */
async function runVerifyDispatch($: Host, id: string, sha: string): Promise<string> {
  await loadRepoConfig($)
  const head = `/dispatch ${id} --verify ${sha}`
  const root = await $.session.root()
  const tasksDir = cardDirPath(root, cfg.cardDir)
  const found = await cardsInTree($, tasksDir, id)
  if (typeof found === 'string') return found
  if (found.length !== 1) {
    return found.length === 0
      ? `${head}: no card under ${tasksDir} (looked for ${id}-*.md with id: ${id})`
      : `${head}: ${found.length} cards claim ${id} (${found.map(f => f.name).join(', ')}); fix the board first`
  }
  const { card } = found[0] as { name: string; card: Card }
  const refusal = checkDomain(card, cfg.domains)
  if (refusal) return `${head}: ${refusal}`
  const briefPath = await existingBrief($, root, briefFileName(id))
  if (!briefPath) return `${head}: no brief for ${id} under ${briefDirFor(root, cfg.briefDir)} (dispatch it first; --verify judges a dispatched task's work)`
  const briefText = (await readText($, briefPath)) ?? ''
  const header = parseHeader(briefText)
  if (header?.repo === 'none') return `${head}: the brief ${briefPath} says repo=none; there is no branch to verify`
  const here = header?.repo === 'here'
  const subtask = header?.subtask ?? 'main'
  const label = taskLabel(id, subtask)
  const repo = here ? root : header?.repo || worktreePath(root, id, false, cfg.worktreeRoot)
  if (!here && !(await exists($, repo))) return `${head}: no worktree at ${repo}`
  let branch = branchName(card.domain, id)
  if (here) {
    const current = await run($, currentBranchArgv(root), { cwd: root, timeoutMs: 10000 })
    branch = current.ok && current.exitCode === 0 && current.stdout.trim() ? current.stdout.trim() : branch
  }
  const all = await loadAttempts($, id)
  const ladder = all.filter(r => (r as HereRecord).adhoc !== true)
  const last = attemptsFor(ladder, subtask).at(-1)
  // a worker still running owns the tree; a pending attempt whose agent is gone is not waited on
  const running = last?.verdict === 'pending' && last.agentId !== undefined && (await agentList($)).some(a => a.id === last.agentId && a.status === 'running')
  if (running) return `${head}: attempt ${last?.attempt} of ${label} is still running (agent ${last?.agentId}); --verify judges finished work`

  // the synthetic report: the delta the verifier will take, and the newest red file when the brief asks for one
  const contract = briefContract(briefText)
  const base = (contract.ok ? contract.base : undefined) || cfg.baseRef || undefined
  const delta = await branchDelta({ repo, sha, ...(base ? { base } : {}) }, (argv, init) => run($, [...argv], init))
  if ('why' in delta) return `${head}: ${delta.why}`
  // MOD-1: --verify at the last attempt's own sha re-judges that attempt instead of opening another
  const target = verifyTarget(ladder, subtask, sha)
  let red: string | undefined
  if (target.rejudge && last?.red) red = last.red
  else if (contract.ok && briefWantsRed(contract.redTest)) {
    try {
      const name = newestRed((await $.fs.list(`${repo}/.delegation/${id}`)).map(e => e.name))
      red = name ? `.delegation/${id}/${name}` : undefined
    } catch {
      red = undefined
    }
  }
  const report = syntheticReport({ task: id, subtask, branch, sha, files: delta.files, ...(red ? { red } : {}) })

  // the attempt it judges: the work-present one when it is last, else a new verify attempt
  const t = await now($)
  const briefTier: Tier = tierOf(header?.tier) ?? 'standard'
  const attempt = target.attempt
  if (!target.rejudge && last?.verdict !== 'work-present') {
    const rec: HereRecord = {
      task: id,
      subtask,
      attempt,
      kind: 'verify',
      lineage: last?.lineage ?? attempt,
      tier: last?.tier ?? briefTier,
      alias: last?.alias ?? cfg.tierMap[briefTier],
      verdict: 'pending',
      sha,
      at: t,
      ...(last?.agentId ? { agentId: last.agentId } : {}),
      briefPath,
      purpose: header?.purpose ?? 'build',
      ...(here ? { here: root } : {}),
    }
    await storeSet($, K.tasks(id), [...all, rec])
  }
  const rec = attemptsFor(await loadAttempts($, id), subtask).find(r => r.attempt === attempt && (r as HereRecord).adhoc !== true)
  const spawn: SpawnRecord = {
    key: `verify-${id}-${subtask}-${attempt}${target.rejudge ? `-rejudge-${t}` : ''}`,
    task: id,
    subtask,
    adhoc: false,
    attempt,
    lineage: rec?.lineage ?? attempt,
    tier: rec?.tier ?? briefTier,
    alias: rec?.alias ?? cfg.tierMap[briefTier],
    budget: parseBudget(header?.budget, cfg.defaultBudget),
    purpose: header?.purpose ?? 'build',
    briefPath,
    prompt: spawnPrompt(briefPath),
    description: spawnDescription(id, card.title),
    subagentType: agentTypeFor(card.domain, cfg.agentTypes, (await storeGet<string[]>($, K.agentTypes)) ?? []),
    cwd: repo,
    ...(rec?.agentId ? { agentId: rec.agentId } : {}),
    at: t,
    ...(here ? { here: root } : {}),
  }
  const rendered = await finalize($, spawn, report)
  const rejudged = target.rejudge ? [`re-judging attempt ${attempt}/${spawn.budget} at ${sha}`] : []
  return [...rejudged, `${head}: no spawn — the verifier ran on ${here ? `the shared checkout ${root}` : `worktree ${repo}`} at ${sha.slice(0, 7)} (base ${delta.base})`, `synthetic report: ${report}`, rendered.full].join('\n')
}

// ---- part 5B: /delegation init and the init tool ----------------------------------------
async function runInit($: Host): Promise<string> {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const existing: Record<string, string | undefined> = {}
  const unreadable = new Set<string>()
  // the plugin manifest decides the card folder; the plan only reads it
  for (const rel of [...INIT_FILES, PLUGIN_MANIFEST]) {
    const path = `${root}/${rel}`
    if (!(await exists($, path))) continue
    const text = await readText($, path)
    if (text === undefined) unreadable.add(path)
    existing[path] = text ?? ''
  }
  // a file that exists but cannot be read is left alone, whatever it is
  const plan = initPlan(root, existing).map(s => (unreadable.has(s.path) ? { ...s, action: 'skip' as const } : s))
  const failed: Record<string, string> = {}
  for (const step of plan) {
    if (step.action === 'skip') continue
    try {
      await $.fs.write(step.path, step.text)
    } catch (err) {
      failed[step.path] = String(err)
    }
  }
  repoText = undefined
  await loadRepoConfig($)
  return initText(root, plan, failed, true)
}

// ---- GH-109: /delegation setup and the setup tool ----------------------------------------
/** Gather the probe with allowlisted git reads and `$.fs`/`$.env` only. */
async function gatherSetup($: Host, root: string): Promise<SetupProbe> {
  const git = async (...args: string[]): Promise<string | undefined> => {
    const r = await run($, ['git', '-C', root, ...args])
    return r.ok && r.exitCode === 0 ? r.stdout.trim() : undefined
  }
  const inRepo = (await git('rev-parse', '--is-inside-work-tree')) === 'true'
  const toplevel = inRepo ? await git('rev-parse', '--show-toplevel') : undefined
  const branch = inRepo ? await git('rev-parse', '--abbrev-ref', 'HEAD') : undefined
  const hasCommit = inRepo && (await git('rev-parse', '--verify', '--quiet', 'HEAD')) !== undefined
  const hasOriginMain = inRepo && (await git('rev-parse', '--verify', '--quiet', 'origin/main')) !== undefined
  const dirty = inRepo && ((await git('status', '--porcelain')) ?? '') !== ''
  const markers: string[] = []
  for (const m of ROOT_MARKERS) if (await exists($, `${root}/${m}`)) markers.push(m)
  const packageJson = markers.includes('package.json') ? await readText($, `${root}/package.json`) : undefined
  let pyTests = false
  try {
    pyTests = (await $.fs.list(`${root}/tests`)).some(e => /^test_.*\.py$/.test(e.name))
  } catch {
    pyTests = false
  }
  let path = ''
  let home = ''
  try {
    path = (await $.env.get('PATH')) ?? ''
    home = (await $.env.get('HOME')) ?? ''
  } catch {
    // an unreadable environment finds nothing on PATH, and the check says so
  }
  const dirs = path.split(':').filter(d => d !== '')
  const onPath: string[] = []
  for (const tool of PATH_TOOLS) {
    for (const d of dirs) {
      if (await exists($, `${d.replace(/\/+$/, '')}/${tool}`)) {
        onPath.push(tool)
        break
      }
    }
  }
  const shadows: string[] = []
  if (home) for (const s of SHADOWS) if (await exists($, `${home.replace(/\/+$/, '')}/${s}`)) shadows.push(s)
  const childRepos: string[] = []
  try {
    for (const e of await $.fs.list(root)) if (e.name !== '.git' && (await exists($, `${root}/${e.name}/.git`))) childRepos.push(e.name)
  } catch {
    // no listing, no nested repos named
  }
  const gitignore = await readText($, `${root}/.gitignore`)
  return {
    root,
    home,
    inRepo,
    ...(toplevel ? { toplevel } : {}),
    ...(branch ? { branch } : {}),
    hasCommit,
    hasOriginMain,
    dirty,
    markers,
    ...(packageJson !== undefined ? { packageJson } : {}),
    pyTests,
    onPath,
    shadows,
    childRepos,
    ...(gitignore !== undefined ? { gitignore } : {}),
    autoDebrief: cfg.autoDebrief,
  }
}

async function runSetup($: Host, viaTool = false): Promise<string> {
  const root = (await $.session.root()).replace(/\/+$/, '')
  await loadRepoConfig($)
  const facts = await gatherSetup($, root)
  const lines = setupChecks(facts)
  const head = setupText(root, lines)
  if (!allRequiredHold(lines)) return head
  // phase 2: the init plan (never overwriting), the config from what was found, the first card
  const configPath = `${root}/${REPO_CONFIG_FILE}`
  const hadConfig = await exists($, configPath)
  const existing: Record<string, string | undefined> = {}
  const unreadable = new Set<string>()
  for (const rel of [...INIT_FILES, PLUGIN_MANIFEST]) {
    const path = `${root}/${rel}`
    if (!(await exists($, path))) continue
    const text = await readText($, path)
    if (text === undefined) unreadable.add(path)
    existing[path] = text ?? ''
  }
  const found = { ...foundOf(facts), spendByTier: proposedSpend(foundOf(facts).gate) }
  const plan = initPlan(root, existing, { sample: false }).map(s => {
    if (unreadable.has(s.path)) return { ...s, action: 'skip' as const }
    if (s.path === configPath && s.action === 'write') return { ...s, text: scaffoldConfig(s.text, found) }
    return s
  })
  const failed: Record<string, string> = {}
  for (const step of plan) {
    if (step.action === 'skip') continue
    try {
      await $.fs.write(step.path, step.text)
    } catch (err) {
      failed[step.path] = String(err)
    }
  }
  repoText = undefined
  await loadRepoConfig($)
  const wroteConfig = plan.some(s => s.path === configPath && s.action === 'write' && !failed[s.path])
  return [
    head,
    '',
    initText(root, plan, failed, false, false),
    ...(wroteConfig ? configLines(found) : []),
    ...(hadConfig ? [wouldSet(found)] : []),
    '',
    handoverText(detectGate(facts)),
    ...(viaTool ? [BRAIN_HANDOVER] : []),
  ].join('\n')
}

// ---- GH-111: the card tool -------------------------------------------------------------
/**
 * Writes the card the brain described, then runs the dry run for it (the code
 * `/dispatch <ID> --dry-run` runs) and answers the card's path, a one-line
 * summary, the brief header and "say go"; with `dispatch: true`, dispatches.
 * A refusal writes nothing.
 */
async function runCard($: Host, input: Record<string, unknown>): Promise<string> {
  if (input.dispatch !== undefined && typeof input.dispatch !== 'boolean') return 'card: dispatch must be true or false'
  await loadRepoConfig($)
  const root = await $.session.root()
  const dir = cardDirPath(root, cfg.cardDir)
  let names: string[] = []
  try {
    names = (await $.fs.list(dir)).map(e => e.name)
  } catch {
    names = []
  }
  // repo=here when the repo has no origin/main (worktree mode cuts from it); a baseRef alone says nothing about the mode
  const originMain = await run($, ['git', '-C', root, 'rev-parse', '--verify', '--quiet', 'origin/main'])
  const here = !(originMain.ok && originMain.exitCode === 0)
  const made = cardFromFields(input, { domains: cfg.domains, gateIds: Object.keys(cfg.gateMap), names, spendByTier: cfg.spendByTier, here })
  if ('error' in made) return `card refused: ${made.error}`
  const path = `${dir}/${made.file}`
  if (names.includes(made.file) || (await exists($, path))) return `card refused: ${path} exists; cards are never overwritten`
  try {
    await $.fs.write(path, made.text)
  } catch (err) {
    return `card not written: ${path}: ${String(err)}`
  }
  const wrote = `wrote ${path}`
  if (input.dispatch === true) return [wrote, await runDispatch($, { id: made.id, dryRun: false, base: 'origin/main', ...(here ? { here: true as const } : {}) })].join('\n')
  const dry = await runDispatch($, { id: made.id, dryRun: true, base: 'origin/main', ...(here ? { here: true as const } : {}) })
  const lines = dry.split('\n')
  const header = lines.at(-1) ?? ''
  if (!header.startsWith('[[brief ')) return [wrote, dry].join('\n')
  const alias = finalAlias({ tier: made.tier, source: 'brief' }, cfg.tierMap[made.tier]).alias
  const notes = lines.filter(l => /^\s+(note|warning):/.test(l)).map(l => l.trim())
  // GH-114: one classifier call per card written, on the dry run only
  let second: string | undefined
  if (cfg.classifierSecondOpinion) {
    try {
      const said = await $.model.classify(classifierText(made.text), CLASSIFIER_LABELS)
      if ((CLASSIFIER_LABELS as readonly string[]).includes(said ?? '')) {
        await storeSet($, K.classifier(made.id), { card: made.tier, classifier: said })
        second = said === made.tier ? `card says ${made.tier} · classifier agrees` : `card says ${made.tier} · classifier says ${said}`
      }
    } catch (err) {
      debug($, `classifier second opinion failed: ${String(err)}`)
    }
  }
  return [wrote, cardSummary(made, alias), ...(second ? [second] : []), '', '```', header, '```', ...(notes.length > 0 ? ['', ...notes] : []), '', sayGo(made.id)].join('\n')
}

/** `/delegation` with no argument: the delegation state and where the config came from. */
async function statusReport($: Host): Promise<string> {
  await loadRepoConfig($)
  const s = await snapshot($)
  const state = isEmptyState(s) && s.recent.length === 0 ? ['Delegation state (chassis-delegation): nothing running, queued or owed.'] : renderState(s)
  const root = await $.session.root()
  const split = await brainView($)
  return [
    ...state,
    '',
    ...(split.hasBrain ? [brainLine(split.summary)] : []),
    ...(split.hasEdits ? [`brain edits: ${split.summary.edits}`] : []),
    `mod: chassis-delegation ${MOD_VERSION} loaded from ${$.plugin.root}`,
    ...(await updateStatusLines($)),
    `config: ${repoText == null ? `no ${REPO_CONFIG_FILE} in ${root} (built-in defaults + /config)` : `${root}/${REPO_CONFIG_FILE} + /config`}`,
    ...(repoText == null ? ['not set up here: run /delegation setup'] : []),
    `gate map: ${Object.keys(cfg.gateMap).length > 0 ? Object.entries(cfg.gateMap).map(([k, v]) => `${k} → ${v}`).join('; ') : '(empty: gates are reported "not re-run")'}`,
    `tiers: ${(['economy', 'standard', 'frontier'] as const).map(t => `${t}→${cfg.tierMap[t]}`).join(', ')} · max workers ${cfg.maxWorkers} · git guard ${cfg.gitGuard ? `on (${cfg.guardBranches.join(', ')})` : 'off'} · eval ${cfg.autoEval ? 'on' : 'off'}`,
    ...aliasLines(Object.fromEntries((await Promise.all(['haiku', 'sonnet', 'opus'].map(async a => [a, await storeGet<unknown>($, K.alias(a))] as const))).filter(([, v]) => v !== undefined)), await now($)),
    `base: ${cfg.baseRef || 'origin/main → main → origin/master → master'} · repo=here ignore: ${ignoreWithCards(cfg.ignore, cfg.cardDir).join(', ') || '(none)'}`,
  ].join('\n')
}

// ---- MOD-3: /delegation update ---------------------------------------------------------
type GitOut = { ok: true; out: string } | { ok: false; why: string }
/** `git -C <dir> …` through the allowlist: stdout on exit 0, else git's own reason. */
async function gitIn($: Host, dir: string, args: string[]): Promise<GitOut> {
  const r = await run($, ['git', '-C', dir, ...args])
  if (!r.ok) return { ok: false, why: r.why }
  if (r.exitCode !== 0) return { ok: false, why: (r.stderr.trim() || r.stdout.trim() || `git ${args[0]} exited ${r.exitCode}`).split('\n').slice(0, 4).join('\n') }
  return { ok: true, out: r.stdout }
}
const commitCount = (out: string): number => out.split('\n').filter(l => /^[0-9a-f]{7,40}$/.test(l.trim())).length

/** The status line's `update:` text: the loaded clone's commits behind origin/main, fetched at most once per ten minutes; '' when current or not a clone. */
async function updateStatusLines($: Host): Promise<string[]> {
  try {
    const root = $.plugin.root
    if (!(await exists($, `${root}/.git`))) return []
    const t = await now($)
    let check = (await storeGet<{ at: number; behind: number; failed?: boolean }>($, UPDATE_CHECK)) as { at: number; behind: number; failed?: boolean } | undefined
    if (!check || t - check.at >= UPDATE_CHECK_MS || check.at > t) {
      const fetched = await gitIn($, root, ['fetch', '-q', 'origin', 'main'])
      if (!fetched.ok) check = { at: t, behind: 0, failed: true }
      else {
        const log = await gitIn($, root, ['log', '--format=%H', 'HEAD..origin/main'])
        check = { at: t, behind: log.ok ? commitCount(log.out) : 0, ...(log.ok ? {} : { failed: true }) }
      }
      await storeSet($, UPDATE_CHECK, check)
    }
    if (check.failed) return ['update: could not check origin/main']
    const line = behindLine(check.behind)
    return line ? [line] : []
  } catch (err) {
    debug($, `update check failed: ${String(err)}`)
    return []
  }
}

/** `/delegation update`: bring the loaded copy of the mod to origin/main, migrate this repo's config, say what is left. */
async function runUpdate($: Host): Promise<string> {
  const root = $.plugin.root
  loadedRoot = root
  const live = await liveState($)
  const busy = [...live.workers.map(w => w.label), ...live.pending.map(p => p.task)]
  if (busy.length > 0) return `update refused: ${busy.join(', ')} ${busy.length === 1 ? 'is' : 'are'} still running. Update between turns, with no worker running.`
  let home = ''
  try {
    home = (await $.env.get('HOME')) ?? ''
  } catch {
    home = ''
  }
  const isClone = await exists($, `${root}/.git`)
  const cls = classifyRoot(root, home, isClone)
  if (cls.kind === 'folder') return cls.reloadStory
  const fail = (why: string) => `update refused, nothing changed: ${why}`
  const dirty = await gitIn($, root, ['status', '--porcelain'])
  if (!dirty.ok) return fail(dirty.why)
  if (dirty.out.trim() !== '') return fail(`${root} has uncommitted changes:\n${dirty.out.trim().split('\n').slice(0, 8).join('\n')}`)
  const fetched = await gitIn($, root, ['fetch', 'origin', 'main'])
  if (!fetched.ok) return fail(fetched.why)
  const oldHead = await gitIn($, root, ['rev-parse', 'HEAD'])
  const oldSha = oldHead.ok ? oldHead.out.trim().slice(0, 7) : '?'
  const versionAt = async (): Promise<string> => {
    try {
      const v = (JSON.parse((await readText($, `${root}/.claude-plugin/plugin.json`)) ?? '{}') as { version?: unknown }).version
      return typeof v === 'string' ? v : MOD_VERSION
    } catch {
      return MOD_VERSION
    }
  }
  const oldVersion = await versionAt()
  const behind = await gitIn($, root, ['log', '--format=%H', 'HEAD..origin/main'])
  if (!behind.ok) return fail(behind.why)
  const commits = commitCount(behind.out)
  const out: string[] = []
  if (commits === 0) out.push(upToDateLine(oldVersion, oldSha))
  else {
    const merged = await gitIn($, root, ['merge', '--ff-only', 'origin/main'])
    if (!merged.ok) return fail(merged.why)
    const newHead = await gitIn($, root, ['rev-parse', 'HEAD'])
    const newVersion = await versionAt()
    out.push(updateLine(oldVersion, oldSha, newVersion, newHead.ok ? newHead.out.trim().slice(0, 7) : '?', commits))
    const slice = changelogSlice((await readText($, `${root}/CHANGELOG.md`)) ?? '', oldVersion, newVersion, await readText($, `${root}/README.md`))
    if (slice.text !== '') out.push('', slice.text)
  }
  await storeSet($, UPDATE_CHECK, { at: await now($), behind: 0 })
  // the repo's config: the keys the new defaults name and the file lacks
  let repoRoot = ''
  try {
    repoRoot = await $.session.root()
  } catch {
    repoRoot = ''
  }
  const cfgPath = `${repoRoot}/${REPO_CONFIG_FILE}`
  const cfgText = repoRoot ? await readText($, cfgPath) : undefined
  out.push('')
  if (cfgText === undefined) out.push(`config: no ${REPO_CONFIG_FILE} in ${repoRoot || 'this session'}: run /delegation setup`)
  else {
    const m = migrateConfig(cfgText)
    if (m.error) out.push(`config: ${cfgPath} left as it is (${m.error})`)
    else if (m.added.length === 0) out.push(`config: ${cfgPath} already names every key`)
    else {
      try {
        await $.fs.write(cfgPath, m.text)
        out.push(`config: added ${m.added.join(', ')} to ${cfgPath}`)
      } catch (err) {
        out.push(`config: could not write ${cfgPath} (${String(err).slice(0, 100)})`)
      }
    }
  }
  out.push(commits === 0 ? `reload: nothing changed, nothing to reload.` : cls.reloadStory)
  return out.join('\n')
}

// ---- the spawn decision: tier, budget, slot, record, drift ------------------------------
/** What the spawn decision reads of an `agent.spawn` input (the hook's own, or one the mod builds). */
type SpawnEvent = { tool_use_id: string; prompt: string; description: string; subagentType: string; model?: string; cwd?: string; name?: string }

/**
 * The agent.spawn hook's whole decision, as one function: the hook calls it
 * with the engine's `next`, and the mod's own spawns (/dispatch, the tool, the
 * scheduler's drain, a respawn, the debrief and eval runners) call it through
 * `spawnSelf` with `$.agent.spawn`, so every spawn the mod makes takes the same
 * tier, budget, slot and record steps whether or not the engine routes it back
 * through this plugin's own hook (it does not from a timer callback).
 * `start(alias)` starts the subagent on the alias the decision picked.
 */
async function decideSpawn($: Host, e: SpawnEvent, start: (alias: string) => Promise<AgentSpawnResult>): Promise<AgentSpawnResult> {
  // A spawn the scheduler's drain started holds the slot the drain reserved (2F).
  const pk = promptKey({ prompt: e.prompt, ...(e.cwd ? { cwd: e.cwd } : {}) })
  const reserved = drainReserved.get(pk)
  if (reserved !== undefined) drainReserved.delete(pk)
  let token: number | undefined = reserved
  try {
    const t = await now($)
    spawnSeq += 1
    const key = e.tool_use_id || `plugin-${t}-${spawnSeq}`
    const named = findBriefPath(e.prompt)
    let briefText: string | undefined
    if (named) {
      try {
        briefText = await $.fs.read(named)
      } catch {
        briefText = undefined
      }
    }
    const header = parseHeader(e.prompt) ?? (briefText !== undefined ? parseHeader(briefText) : undefined)
    const adhoc = !header?.task
    const subagentType = e.subagentType || 'general-purpose'
    const task = header?.task ?? `adhoc-${key.slice(-8)}`
    const subtask = header?.subtask ?? 'main'
    // GH-3: the brief file is where the budget is amended, so it wins over the prompt's copy.
    const fileBudget = briefText !== undefined ? parseHeader(briefText)?.budget : undefined
    const budget = parseBudget(fileBudget ?? header?.budget, cfg.defaultBudget)
    // GH-106: the same for the spend ceiling
    const spend = spendOf((briefText !== undefined ? parseHeader(briefText) : undefined) ?? header)
    // GH-1 item 6: a budget off the grammar falls back, and says so
    const budgetWarn = budgetWarning(fileBudget ?? header?.budget, cfg.defaultBudget)
    if (budgetWarn) debug($, `${taskLabel(task, subtask)}: ${budgetWarn}`)
    const tierWarn = tierWarning(header?.tier)
    if (tierWarn) debug($, `${taskLabel(task, subtask)}: ${tierWarn}`)
    // A /dispatch --replay brief is named <id>.replay.brief.md; its base commit is in the store.
    const replay = !adhoc && named !== undefined && named.endsWith('.replay.brief.md')
    const lane: Lane | undefined = replay && named ? { replay: true, ...(await replayBase($, named)) } : undefined
    // a cardless attempt (GH-1 item 2) sits in the task's history for the record, never for the ladder: no brief was given
    const records = adhoc ? [] : (await loadAttempts($, task)).filter(r => (r as HereRecord).adhoc !== true)
    const prior = attemptsFor(records, subtask, lane).length
    if (!adhoc && prior >= budget) return { deny: budgetDenyMessage(taskLabel(task, subtask), prior, named) }

    // GH-104: a respawn (an earlier attempt exists) looks at the worker's worktree first; finished work there is verified, not redone
    if (!adhoc && prior > 0) {
      const fileHeader = briefText !== undefined ? parseHeader(briefText) : undefined
      const look: LookFor = { task, subtask, ...(e.cwd ? { cwd: e.cwd } : {}), ...(lane ? { replay: true, ...(lane.base ? { base: lane.base } : {}) } : {}) }
      const work = await workInWorktree($, look, fileHeader ?? header, records, lane)
      if (work) {
        const last = attemptsFor(records, subtask, lane).at(-1)
        await recordWorkPresent($, { task, subtask, tier: last?.tier ?? 'standard', alias: last?.alias ?? cfg.tierMap.standard, purpose: header?.purpose ?? 'build', ...(named ? { briefPath: named } : {}) }, work, lane)
        const deny = workPresentDeny(taskLabel(task, subtask), task, work)
        debug($, deny)
        return { deny }
      }
    }

    // 2F: a briefed spawn takes a worker slot or waits in the queue; an ad hoc one never waits.
    if (!adhoc && token === undefined) {
      const slot = await claimSlot(
        $,
        {
          prompt: e.prompt,
          description: e.description,
          subagentType,
          ...(e.model ? { model: e.model } : {}),
          ...(e.cwd ? { cwd: e.cwd } : {}),
          task,
          subtask,
          at: t,
        },
        taskLabel(task, subtask),
      )
      if ('deny' in slot) return { deny: slot.deny }
      token = slot.token
    }

    // GH-6: no brief file named, a header inline: the header is the brief.
    const inline = named === undefined && header !== undefined ? await inlineBrief($, e.prompt, header) : undefined
    const briefPath = named ?? (inline && 'path' in inline ? inline.path : undefined)
    const noBrief = inline && 'why' in inline ? inline.why : undefined
    if (inline && 'path' in inline) debug($, `${taskLabel(task, subtask)}: inline header → brief ${inline.path}`)

    let classified: string | undefined
    // GH-1 item 8: a header (with or without tier=) or a caller-model hint decides; no classify call
    const classify = needsClassifier({ hadHeader: header !== undefined, headerTier: header?.tier, callerModel: e.model })
    if (classify) {
      try {
        classified = await $.model.classify(classifierText(e.prompt), CLASSIFIER_LABELS)
      } catch (err) {
        debug($, `classifier failed: ${String(err)}`)
      }
    }
    const pick = pickTier({
      hadHeader: header !== undefined,
      headerTier: header?.tier,
      callerModel: e.model,
      classified,
      // GH-104: one tier up only after a refuted attempt (or a confirmed gate=fail); a no-report holds the tier
      escalateFrom: adhoc ? undefined : escalationSource(records, subtask, lane),
      holdAt: adhoc ? undefined : holdSource(records, subtask, lane),
    })
    const { alias, fableRewritten } = aliasFor(pick)
    const tier: Tier = fableRewritten ? 'frontier' : pick.tier
    // GH-1 item 8: fable asked for (tier map, caller, or the brief's model=) and opus spawned is said out loud
    const fableAsked = fableRequested(alias, fableRewritten, header?.model)
    const attempt = adhoc ? 1 : nextAttempt(records, subtask, lane)
    // GH-104: a briefed spawn's notice says which attempt it is spending
    const notice = noticeText(pick, alias, fableAsked, adhoc ? undefined : { attempt, budget })
    try {
      $.ui.notice(e.tool_use_id, notice)
    } catch {
      // a plugin's own spawn has no dialog to carry it
    }
    debug($, tierPickLine(taskLabel(task, subtask), tier, pick, e.model, classify))
    if (fableAsked) debug($, `${taskLabel(task, subtask)}: ${notice}`)

    const purpose = header?.purpose ?? 'build'
    // GH-16: a repo=here worker shares the session root; its records say so (in-flight reads them)
    let here: string | undefined
    if (!adhoc && header?.repo === 'here') {
      try {
        here = await $.session.root()
      } catch {
        here = undefined
      }
    }
    const usdAtStart = await sessionUsd($)
    const res = await start(alias)
    if (res.deny !== undefined) return res
    // a debrief agent or an eval runner the mod started: its record learns the agent id here
    const started = runnerStarted.get(pk)
    if (started && res.agentId) {
      runnerStarted.delete(pk)
      await started(res.agentId)
    }

    const classifierTier = !adhoc && attempt === 1 ? (await storeGet<{ classifier?: Tier }>($, K.classifier(task)))?.classifier : undefined
    const rec: HereRecord = {
      task,
      subtask,
      attempt,
      kind: 'spawn',
      lineage: attempt,
      tier,
      alias,
      source: pick.source,
      resolvedModel: res.model,
      verdict: 'pending',
      at: t,
      ...(res.agentId ? { agentId: res.agentId } : {}),
      toolUseId: e.tool_use_id,
      ...(briefPath ? { briefPath } : {}),
      purpose,
      ...laneFields(lane),
      ...(here ? { here } : {}),
      ...(fableAsked ? { requestedAlias: 'fable' as const } : {}),
      ...(classifierTier ? { classifierTier } : {}),
    }
    if (adhoc) await storeSet($, K.adhoc, [...((await storeGet<AttemptRecord[]>($, K.adhoc)) ?? []), rec].slice(-200))
    else await storeSet($, K.tasks(task), [...records, rec])
    const spawn: SpawnRecord = {
      key,
      task,
      subtask,
      adhoc,
      attempt,
      lineage: attempt,
      tier,
      alias,
      budget,
      purpose,
      ...(briefPath ? { briefPath } : {}),
      ...(noBrief !== undefined ? { noBrief } : {}),
      prompt: e.prompt.slice(0, PROMPT_CAP),
      description: e.description,
      subagentType,
      ...(e.cwd ? { cwd: e.cwd } : {}),
      ...(res.agentId ? { agentId: res.agentId } : {}),
      ...(res.model ? { resolvedModel: res.model } : {}),
      ...(usdAtStart !== undefined ? { usdAtStart } : {}),
      ...(spend !== undefined && !adhoc ? { spend } : {}),
      ...(lane ? { replay: true, ...(lane.base ? { base: lane.base } : {}) } : {}),
      at: t,
      ...(here ? { here } : {}),
    }
    await storeSet($, K.spawn(key), spawn)
    if (res.agentId) await storeSet($, K.agent(res.agentId), key)
    if (res.agentId && e.name) await storeSet($, K.name(e.name), res.agentId)

    // alias drift: the resolved id behind the alias moved
    const resolved = res.model
    if (resolved && resolved !== alias) {
      const prevRaw = await storeGet<unknown>($, K.alias(alias))
      const prev = parseSighting(prevRaw)?.id
      const drift = driftMessage(alias, prev, resolved)
      if (drift) {
        $.ui.toast(drift)
        try {
          await $.session.append({ message: { type: 'system', content: [{ type: 'text', text: `${PLUGIN}: ${drift}` }] } })
        } catch (err) {
          debug($, `drift notice not appended: ${String(err)}`)
          $.ui.log(`${PLUGIN}: ${drift}`)
        }
      }
      await storeSet($, K.alias(alias), nextSighting(prevRaw, resolved, t))
    }

    await setWorkers($, list => [...list, { task, subtask, attempt, kind: 'spawn', tier, alias, ...(res.agentId ? { agentId: res.agentId } : {}), verdict: 'pending', at: t }])
    delegated = true
    await refreshStatus($)
    return res
  } finally {
    // the slot is held by the record (and $.agent.list) from here on
    if (token !== undefined) starting.delete(token)
  }
}

/**
 * A spawn the mod makes itself: decided by `decideSpawn`, started with
 * `$.agent.spawn`. Should the engine route it back through this plugin's
 * spawn hook, the hook passes it through untouched (it is decided already) and
 * reports the agent id it saw; else the id comes from the call's result, else
 * from `$.agent.list()` (the one new agent with this description).
 */
async function spawnSelf($: Host, input: { prompt: string; description: string; subagentType: string; model?: string; cwd?: string }): Promise<AgentSpawnResult> {
  const pk = promptKey(input)
  const before = new Set((await agentList($)).map(a => a.id))
  selfDecided.add(pk)
  try {
    return await decideSpawn($, { tool_use_id: '', ...input }, async alias => {
      const r = await $.agent.spawn({ prompt: input.prompt, description: input.description, subagentType: input.subagentType, model: alias, ...(input.cwd ? { cwd: input.cwd } : {}) })
      if (r.deny !== undefined) return r
      const agentId = r.agentId ?? selfIds.get(pk) ?? (await agentList($)).find(a => !before.has(a.id) && a.description === input.description)?.id
      return agentId ? { ...r, agentId } : r
    })
  } catch (err) {
    return { deny: String(err) }
  } finally {
    selfDecided.delete(pk)
    selfIds.delete(pk)
  }
}

/** The input schema of the `init` tool: none. */
const SETUP_TOOL = {
  name: 'setup',
  description:
    'Checks the repo for chassis-delegation and returns what to fix; run the fixes, then call it again. When every required check holds it scaffolds the config and returns the first card to write.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

const INIT_TOOL = {
  name: 'init',
  description:
    'Scaffold chassis-delegation in this repo: a card folder (agents/tasks/, or docs/cards/ in a plugin repo) with its README and a sample card, .chassis-delegation.json with its defaults, and .delegation/ in .gitignore. Never overwrites a file; says what it wrote.',
  inputSchema: { type: 'object', properties: {}, additionalProperties: false },
} as const

export const register: Register = (on, opts) => {
  options = opts
  repoText = undefined
  repoLayer = {}
  cfg = readConfig(options, repoLayer).cfg
  // A (re)load starts the per-process memory over; the store keeps what must last.
  finalizing.clear()
  posted.clear()

  // ---- agent.spawn: tier, budget, record, drift --------------------------------------
  on('agent.spawn', async ($, e, next) => {
    if (e.fork) return next(e)
    const pk = promptKey({ prompt: e.prompt, ...(e.cwd ? { cwd: e.cwd } : {}) })
    if (selfDecided.has(pk)) {
      // the mod's own spawn, decided already by spawnSelf: pass it on, and say which agent started
      const res = await next(e)
      if (res.agentId) selfIds.set(pk, res.agentId)
      return res
    }
    return decideSpawn($, { ...e, subagentType: e.subagentType || (e as unknown as { subagent_type?: string }).subagent_type || 'general-purpose' }, alias => next({ ...e, model: alias }))
  })

  // ---- every tool call: the worker's SubagentHandback text; denials as friction (5E) ---
  on('tool.call', async ($, e, next) => {
    const refused = await brainGuard($, e)
    if (refused) {
      void noteFriction($, { kind: 'denial', detail: `${String(e.tool)}: ${refused.deny.slice(0, 160)}`, at: await now($) })
      return refused
    }
    if (e.agentId && String(e.tool) === 'SubagentHandback') {
      const message = (e as unknown as { message?: unknown }).message
      if (typeof message === 'string') handbacks.set(e.agentId, message)
    }
    const out = await next(e)
    const why = out.deny ?? (out.isError === true && typeof out.text === 'string' && /\b(denied|permission)\b/i.test(out.text) ? out.text : undefined)
    if (why !== undefined) void noteFriction($, { kind: 'denial', detail: `${String(e.tool)}: ${why.slice(0, 160)}`, at: await now($) })
    return out
  })

  // ---- 5D: the git guard on Bash -----------------------------------------------------
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!cfg.gitGuard) return next(e)
    const command = typeof e.command === 'string' ? e.command : ''
    const writes = gitWrites(command, cfg.guardBranches)
    if (writes.length === 0) return next(e)
    const base = await bashCwd($, e.agentId)
    const branches = new Map<string, string | undefined>()
    for (const w of writes) {
      let current: string | undefined
      if (!w.namesGuarded && w.state.kind === 'unknown') {
        const dir = joinDir(base, w.dir)
        if (!branches.has(dir)) branches.set(dir, await branchOf($, dir))
        current = branches.get(dir)
      }
      const deny = guardDeny(w, current, cfg.guardBranches)
      if (deny) {
        debug($, `git guard: ${deny} — ${command.slice(0, 160)}`)
        return { deny }
      }
    }
    return next(e)
  })

  // ---- tool.call on Agent: capture the report, verify, hand the verdict back ------
  on('tool.call', { tool: 'Agent' }, async ($, e, next) => {
    if (e.subagent_type === 'fork') return next(e)
    waiting.add(e.tool_use_id)
    let ran
    try {
      ran = await next(e)
    } finally {
      waiting.delete(e.tool_use_id)
    }
    if (ran.deny !== undefined) return ran
    const result = ran.result as Record<string, unknown> | undefined
    const status = typeof result?.status === 'string' ? result.status : undefined
    const agentId = typeof result?.agentId === 'string' ? result.agentId : undefined
    const spawn = (await storeGet<SpawnRecord>($, K.spawn(e.tool_use_id))) ?? (await spawnByAgent($, agentId))
    if (status === 'async_launched' || status === 'remote_launched') {
      if (!spawn || spawn.adhoc) return ran
      const line = `${PLUGIN}: verify deferred — runs when ${agentId ?? 'the worker'} hands back (background)`
      return { ...ran, context: [...(ran.context ?? []), line] }
    }
    const content = Array.isArray(result?.content) ? (result.content as { text?: unknown }[]) : []
    const handback = (result?.handbackReport as { text?: unknown } | undefined)?.text
    const text = [
      ran.text,
      ...content.map(c => (typeof c.text === 'string' ? c.text : '')),
      typeof handback === 'string' ? handback : '',
      agentId ? handbacks.get(agentId) ?? '' : '',
    ]
      .filter(Boolean)
      .join('\n')
    if (agentId) handbacks.delete(agentId)
    const tokens = typeof result?.totalTokens === 'number' ? result.totalTokens : undefined
    const model = typeof result?.resolvedModel === 'string' ? result.resolvedModel : undefined
    const base: SpawnRecord = spawn ?? {
      key: e.tool_use_id,
      task: `adhoc-${e.tool_use_id.slice(-8)}`,
      subtask: 'main',
      adhoc: true,
      attempt: 1,
      lineage: 1,
      tier: 'standard',
      alias: cfg.tierMap.standard,
      budget: cfg.defaultBudget,
      purpose: 'build',
      prompt: '',
      description: e.description,
      subagentType: e.subagent_type ?? 'general-purpose',
    }
    const rendered = await finalize($, base, text, { tokens, model })
    // a cardless report is judged like any other (GH-1 item 2); an ad hoc no-report stays quiet
    const row = sideEffects($, rendered, base.adhoc && !(isCardless(base) && extractReport(text) !== undefined))
    await refreshStatus($)
    await drainQueue($, agentId)
    return row === undefined ? ran : { ...ran, context: [...(ran.context ?? []), row] }
  })

  // ---- turn.complete: a background worker's hand-back; status refresh -------------
  on('turn.complete', async ($, e, next) => {
    const out = await next(e)
    if (e.agentId) {
      const agentId = e.agentId
      // GH-106: this worker's own cost, and its ceiling
      const costed = await spawnByAgent($, agentId)
      const warned = costed ? await trackSpend($, costed, { agentId, ...(e.usage ? { usage: e.usage } : {}), answer: e.answer }) : false
      turnOf.delete(agentId)
      // the answer plus the hand-back (GH-2), read once and only for an agent the mod judges
      let said: Promise<string> | undefined
      const saidOnce = () => (said ??= workerText($, agentId, e.answer))
      const spawn = await spawnByAgent($, agentId)
      // a worker just told to wrap up is going on: this turn's end is not its hand-back
      if (warned) debug($, `${taskLabel(spawn?.task ?? '', spawn?.subtask ?? 'main')}: wrap-up sent; its next turn is the hand-back`)
      // An ad hoc background agent is judged into the brain's conversation only
      // when it has no header and no brief and hands back a report (GH-1
      // item 2: cardless); a foreground one gets its line from the tool.call hook.
      if (!warned && spawn && spawn.verdictAttempt !== spawn.attempt && (!spawn.adhoc || isCardless(spawn))) {
        const text = await saidOnce()
        const foreground = waiting.has(spawn.key)
        // A foreground worker's verdict lands in its Agent result's context; one
        // without a report there is left for the tool.call hook to judge.
        const hasReport = extractReport(text) !== undefined
        if (spawn.adhoc ? hasReport : !foreground || hasReport) {
          const tokens = e.usage ? e.usage.input_tokens + e.usage.output_tokens : undefined
          const rendered = await finalize($, spawn, text, { tokens })
          handbacks.delete(e.agentId)
          if (!foreground && (await claimPost($, spawn))) {
            const row = sideEffects($, rendered, false)
            if (row !== undefined) await appendRow($, row)
          }
        }
      }
      // a debrief agent or an eval runner the mod started (2C, 2D)
      await onRunnerComplete($, agentId, saidOnce)
      // a worker's slot may be free now (2F)
      await drainQueue($, agentId)
      // idle counts from the last turn of either loop
      if (!inTurn) armIdle($)
    } else {
      inTurn = false
      brainWarnedThisTurn = false
      // GH-113: the brain's own turn, priced apart from the workers'
      if (e.usage) {
        const u = e.usage
        await updateBrain($, r => brainTurn(r, u))
      }
      armIdle($)
    }
    await refreshStatus($)
    return out
  })

  // ---- turn.start: the main loop is busy; nothing runs in the background meanwhile ---
  on('turn.start', async ($, e, next) => {
    // GH-106: a subagent's turn id, when the engine says whose it is (it carries none today)
    const owner = (e as { agentId?: string }).agentId
    if (owner) {
      turnOf.set(owner, e.turnId)
      return next(e)
    }
    inTurn = true
    cancelIdle()
    return next(e)
  })

  // ---- prompt.submit: a correction counts as friction (5E) ------------------------------
  on('prompt.submit', async ($, e, next) => {
    if (isCorrection(e.text)) void noteFriction($, { kind: 'correction', detail: e.text.slice(0, 200), at: await now($) })
    return next(e)
  })

  // ---- session.send: a message to a failed worker is its resume -------------------
  on('session.send', async ($, e, next) => {
    const ours = e.origin.kind === 'plugin' && e.origin.name === PLUGIN
    if (e.agentId !== undefined || !(e.origin.kind === 'model' || ours)) return next(e)
    const to = e.to as unknown
    const address = typeof to === 'string' ? to : (to as { agentId?: string } | undefined)?.agentId
    if (!address) return next(e)
    const agentId = (await storeGet<string>($, K.agent(address))) ? address : await storeGet<string>($, K.name(address))
    const spawn = await spawnByAgent($, agentId)
    if (!agentId || !spawn || spawn.adhoc || spawn.verdictAttempt !== spawn.attempt || !spawn.lastFailed) return next(e)
    const lane = laneOf(spawn)
    const records = await loadAttempts($, spawn.task)
    const attempts = attemptsFor(records, spawn.subtask, lane).length
    // GH-3: re-read the budget from the brief file named in the record; the record is not rewritten.
    let budget = spawn.budget
    if (spawn.briefPath) {
      try {
        budget = parseBudget(parseHeader(await $.fs.read(spawn.briefPath))?.budget, spawn.budget)
      } catch {
        budget = spawn.budget
      }
    }
    if (attempts >= budget) return { isDelivered: false, reason: budgetDenyMessage(taskLabel(spawn.task, spawn.subtask), attempts, spawn.briefPath) }
    const out = await next(e)
    if (!out.isDelivered) return out
    const t = await now($)
    const attempt = nextAttempt(records, spawn.subtask, lane)
    const rec: HereRecord = {
      task: spawn.task,
      subtask: spawn.subtask,
      attempt,
      kind: 'resume',
      lineage: spawn.lineage,
      tier: spawn.tier,
      alias: spawn.alias,
      source: 'resume',
      verdict: 'pending',
      at: t,
      agentId,
      ...(spawn.briefPath ? { briefPath: spawn.briefPath } : {}),
      purpose: spawn.purpose,
      ...laneFields(lane),
      ...(spawn.here ? { here: spawn.here } : {}),
    }
    await storeSet($, K.tasks(spawn.task), [...records, rec])
    const usdAtStart = await sessionUsd($)
    await storeSet($, K.spawn(spawn.key), { ...spawn, attempt, lastFailed: false, ...(usdAtStart !== undefined ? { usdAtStart } : {}) })
    await setWorkers($, list => [...list, { task: spawn.task, subtask: spawn.subtask, attempt, kind: 'resume', tier: spawn.tier, alias: spawn.alias, agentId, verdict: 'pending', at: t }])
    return out
  })

  // ---- session.start: the commands and tools, the repo file, agent types, probes -------
  on('session.start', async ($, e, next) => {
    try {
      await $.command.register({
        name: 'dispatch',
        description: 'Brief, worktree and spawn a worker for a task card',
        argumentHint: '<TASK-ID> [--dry-run] [--base <sha>] [--replay] [--scope <globs>] [--forbid <globs>] [--here] [--force-overlap] | <TASK-ID> --verify <sha>',
      })
    } catch (err) {
      debug($, `/dispatch not registered: ${String(err)}`)
    }
    try {
      await $.command.register({ name: 'delegation', description: 'Delegation state; "setup" checks this repo and scaffolds it; "init" is the bare scaffold', argumentHint: '[setup|init|update|dashboard]' })
    } catch (err) {
      debug($, `/delegation not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: DISPATCH_TOOL.name, description: DISPATCH_TOOL.description, inputSchema: DISPATCH_TOOL.inputSchema })
    } catch (err) {
      debug($, `the dispatch tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: CARD_TOOL.name, description: CARD_TOOL.description, inputSchema: CARD_TOOL.inputSchema })
    } catch (err) {
      debug($, `the card tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: INIT_TOOL.name, description: INIT_TOOL.description, inputSchema: INIT_TOOL.inputSchema })
    } catch (err) {
      debug($, `the init tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: SETUP_TOOL.name, description: SETUP_TOOL.description, inputSchema: SETUP_TOOL.inputSchema })
    } catch (err) {
      debug($, `the setup tool was not registered: ${String(err)}`)
    }
    await loadRepoConfig($)
    void sampleSpend($)
    try {
      await noteAgentTypes($, (await $.agent.list()).map(a => a.type))
    } catch {
      // nothing listed yet
    }
    if (cfg.probeModels && cfg.candidateIds.length > 0) {
      probeTimer?.cancel()
      void probe($)
      try {
        probeTimer = $.clock.every(PROBE_EVERY_MS, () => void probe($))
      } catch {
        probeTimer = undefined
      }
    }
    return next(e)
  })

  on('agent.offer', async ($, e, next) => {
    const out = await next(e)
    if (!offered.has(e.agent)) {
      offered.add(e.agent)
      await noteAgentTypes($, [e.agent])
    }
    return out
  })

  on('session.measure', async ($, e, next) => {
    await refreshStatus($)
    return next(e)
  })

  // ---- /dispatch and the dispatch tool: two doors, one function (2A) --------------
  on('command.run', { command: 'dispatch' }, async ($, e) => ({ text: await runDispatch($, parseDispatchArgs(e.args)) }))
  // The literal is DISPATCH_TOOL_NAME, written out so the validator reads it; `as never` because the
  // declared tool-name union (built-ins + the MCP servers connected at the last load) does not hold a plugin's own tool.
  on('tool.call', { tool: 'mcp__chassis-delegation__dispatch' as never }, async ($, e) => ({ result: await runDispatch($, parseDispatchTool(e as unknown as Record<string, unknown>)) }))

  // ---- /delegation [init] and the init tool: one function (5B) ----------------------
  on('command.run', { command: 'delegation' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'init') return { text: await runInit($) }
    if (arg === 'setup') return { text: await runSetup($) }
    if (arg === 'update') return { text: await runUpdate($) }
    if (arg === 'dashboard') {
      let placed = false
      let why = ''
      try {
        const opened = await $.ui.open({ id: DASH_PANE, title: 'Delegation', focus: true })
        placed = opened.isPlaced
        if (!opened.isPlaced) why = opened.reason
      } catch (err) {
        why = String(err)
      }
      if (placed) return { text: 'Delegation dashboard opened in a pane.' }
      // a screen that places no mod panes (the VS Code extension): close the waiting pane and answer in text
      try {
        await $.ui.close({ id: DASH_PANE })
      } catch {
        // it never opened
      }
      const { view } = await liveModel($)
      return { text: [`This screen does not show a mod's panes (${why}), so here is the dashboard as text. In Claude Code in a terminal, /delegation dashboard opens it as a live pane.`, '', dashboardText(view)].join('\n') }
    }
    if (arg === '' || arg === 'status') return { text: await statusReport($) }
    return { text: 'usage: /delegation [setup|init|update|dashboard]' }
  })
  on('tool.call', { tool: 'mcp__chassis-delegation__card' as never }, async ($, e) => ({ result: await runCard($, e as unknown as Record<string, unknown>) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__init' as never }, async $ => ({ result: await runInit($) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__setup' as never }, async $ => ({ result: await runSetup($, true) }))

  // ---- GH-112: the band above the prompt and the dashboard pane ------------------------
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (!cfg.dashboardBand || e.props.hasSurvey) return next(e)
    try {
      const { view } = await liveModel($)
      if (!isActive(view)) return next(e)
      const p = { surface: e.surface, t: $.ui.resolve(e) } as PaneTable
      return bandTree(p, view, pickScheme(e), e.props.bodyColumns, () => void $.ui.open({ id: DASH_PANE, title: 'Delegation', focus: true })) as never
    } catch (err) {
      debug($, `band not drawn: ${String(err)}`)
      return next(e)
    }
  })
  on('ui.render', { component: 'Pane', requestId: DASH_PANE }, async ($, e, next) => {
    try {
      const { view, since, records, running } = await liveModel($)
      const mine = sessionRecords(records, since)
      const items: BandItem[] = [
        ...running.map((r): BandItem => ({ kind: 'running', task: r.label, tier: r.tier, alias: r.alias, at: r.at, phase: 'building' })),
        ...(await readQueue($)).map((q, i): BandItem => ({ kind: 'queued', task: taskLabel(q.task, q.subtask ?? 'main'), position: i + 1 })),
      ]
      const p = { surface: e.surface, t: $.ui.resolve(e) } as PaneTable
      const blocks = blocksFor({ current: metricsFromRecords(mine, since), history: [metricsFromRecords(mine, since)] })
      return paneTree(p, { blocks, open: openItemLines(items, view.now), columns: e.props.bodyColumns, live: view, scheme: pickScheme(e) }, () => void $.ui.close({ id: DASH_PANE })) as never
    } catch (err) {
      debug($, `pane not drawn: ${String(err)}`)
      return next(e)
    }
  })

  // ---- session.compact: keep the loop position (2E) ----------------------------------
  on('session.compact', async ($, e, next) => {
    if (e.agentId !== undefined) return next(e)
    let block: string
    try {
      block = compactBlock(await snapshot($), await recipeDir($))
    } catch (err) {
      debug($, `compaction block not built: ${String(err)}`)
      return next(e)
    }
    return next({ ...e, instructions: appendInstructions(e.instructions, block) })
  })

  // ---- prompt.compose: the live "Delegation state" section (2E) ---------------------
  on('prompt.compose', async ($, e, next) => {
    const out = await next(e)
    // PromptComposeInput names no agent loop: a prompt offering the Agent tool is the brain's.
    if (!(e.tools ?? []).includes('Agent')) return out
    let section: ReturnType<typeof composeSection>
    try {
      const posture = cfg.delegateOnly !== 'off' && (await brainSeat($, e.model)) === 'fable' ? PREMIUM_POSTURE : []
      section = composeSection(await snapshot($), posture)
    } catch (err) {
      debug($, `delegation state section not built: ${String(err)}`)
      return out
    }
    const rest = out.sections.filter(x => x.id !== SECTION_ID)
    return section ? { ...out, sections: [...rest, section] } : rest.length === out.sections.length ? out : { ...out, sections: rest }
  })
}
