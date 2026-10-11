// chassis-delegation — brain-seat delegation for Claude Code: part 1 (SPEC v1 +
// amendment 1), part 2 (the dispatch tool, quiet verdicts, the clean-stop
// debrief, the eval trigger, compaction state, the scheduler) and part 5
// (standalone: native verification, a built-in tier map, a per-repo config
// file, `/delegation init`, portable briefs, a native git guard, a built-in
// debrief). The hooks stay thin: every decision is a pure function in ./lib,
// and every host command passes ./lib/allow.ts first. Nothing here calls the
// chassis scripts: the mod works in a repo that has only agents/tasks/ cards.
// MOD-12 (#22): the brain makes every worker's spawn with its own Agent tool;
// the mod prepares it (brief, worktree, tier, the spawn block) and shapes it in
// its agent.spawn hook, so every other hook here sees the worker too.
import type { AgentSpawnResult, EngineInterface, PluginOptions, Register, TurnUsage } from 'claude-code'

import type { BandItem, DelegationVerdict, DelegationWorker, QueuedSpawn } from './types'
import { blocksFor, openItemLines } from './lib/dashboard'
import { bandTree } from './lib/band'
import { bashCommits, bashWrites, brainEdit, brainFamily, brainLine, brainSummary, brainTurn, delegateDecision, DELEGATE_DENY, isRestricted, PREMIUM_POSTURE, toolPath, warnRow, WRITE_TOOLS, type BrainRecord, type BrainFamily } from './lib/brain'
import { paneTree, type PaneTable } from './lib/pane'
import { attempts as attemptsOf, dashboardText, isActive, liveView, pickScheme, sampleEvery, sessionRecords, spendSeries, workersUsd as workersUsdOf, type LiveView, type SpendPoint } from './lib/live'
import { metricsFromRecords } from './lib/metrics'
import { checkArgv, isSha, refusedLine, type AllowConfig } from './lib/allow'
import {
  attemptsFor,
  escalationSource,
  holdSource,
  judgedShas,
  laneFields,
  lineageResumes,
  nextAttempt,
  patchRecord,
  patchReview,
  priorRedHashes,
  acceptRow,
  ledgerHas,
  retireDue,
  retirePatch,
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
  resourcesOf,
  scopeOverlap,
  spendOf,
  type BriefHeader,
} from './lib/brief'
import { addTurn, ceilingState, liveWorker, overSpendDeny, overSpendLine, round4, spendCeiling, spendWarnRow, warnText, OVER_SPEND_NEXT, type Spend } from './lib/cost'
import {
  addFriction,
  breadcrumbPath,
  builtInDebriefPrompt,
  splitModFindings,
  cleanStop,
  countLines,
  debriefPathOf,
  debriefPrompt,
  debriefSkillPath,
  debriefSource,
  MARK_WATERMARK_MESSAGE,
  debriefToast,
  findingsFile,
  findingsLines,
  findingsPathOf,
  proposalsLines,
  openProposals,
  parseProposals,
  parseStatuses,
  proposalDetail,
  proposalInstruction,
  proposalListLines,
  settledLines,
  SETTLED_ASK,
  isoTime,
  type ProposalStatus,
  scrubbedFindings,
  DEFAULT_DEBRIEF_AGENT,
  DEFAULT_DEBRIEF_COOLDOWN_HOURS,
  DEFAULT_DEBRIEF_IDLE_MINUTES,
  DEFAULT_DEBRIEF_MIN_EVENTS,
  DEFAULT_DEBRIEF_MIN_NEW_LINES,
  boundaryOnly,
  frictionFacts,
  isCorrection,
  nothingToDebrief,
  parseWatermark,
  verdictFacts,
  watermarkPath,
  windowFacts,
  type FrictionEvent,
} from './lib/cleanstop'
import { checkDebrief, windowOf, userMessagesOf, type DebriefWindow, type UserMessage } from './lib/debriefcheck'
import { appendInstructions, compactBlock, composeSection, emptySnapshot, isEmptyState, owedRowsFrom, prsFrom, renderState, SECTION_ID, splitOwed, type RecentVerdict, type StateSnapshot } from './lib/compaction'
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
  renderBriefChecked,
  LESSONS_CAP,
  lessonLineCount,
  lessonsCapWarning,
  lessonsPath,
  renderHeader,
  scopeLooksProse,
  PROSE_SCOPE_STOP,
  scratchpadFor,
  showCardArgv,
  spawnBlock,
  spawnCall,
  spawnDescription,
  spawnPrompt,
  TEMPLATE_FILES,
  templatePath,
  unrenderedRefusal,
  worktreeAddArgv,
  worktreePath,
  type BriefMode,
  type Card,
  type DispatchArgs,
  type SpawnCall,
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
import { engineLockDecision, gateTemplatesOf, isEngineGate, readEngineLock, resolveGateRuns, waitedLine, type EngineLock } from './lib/gates'
import { currentLine } from './lib/legacy'
import { gitWrites, guardDeny, joinDir, mergeTargets, parseGuardBranches, taskOfBranch } from './lib/gitguard'
import { handbackMessages, workerSaid } from './lib/handback'
import { withIdentity } from './lib/identity'
import { INIT_FILES, PLUGIN_MANIFEST, initPlan, initText } from './lib/init'
import { CARD_TOOL, cardsFromFields, cardSummary, doneWhenOf, forbidCollisions, sayGo, type NewCard } from './lib/card'
import { PATH_TOOLS, ROOT_MARKERS, SHADOWS, allRequiredHold, configLines, detectGate, foundOf, proposedSpend, handoverText, BRAIN_HANDOVER, scaffoldConfig, setupChecks, setupText, wouldSet, type SetupProbe } from './lib/setup'
import { artefactsCheck, defaultScratch, expandTilde, globList, globRoot, isAbsolute, isNotWorkTree, noRepoVerdict, outdirOf, outsideCheck, outsideRoots, reportArtefacts, reportFiles, reportMetrics, scopeCheck, workTreeArgv, type ArtefactStat, type OutsideInput, type RootListing } from './lib/norepo'
import { deliveryFor, parseVerbosity, quietLine, reviewLine, shortNext, type Rendered, type Verbosity } from './lib/quiet'
import { DEFAULT_CARD_DIR, ignoreWithCards, isGitRef, mergeConfig, parseRepoConfig, REPO_CONFIG_FILE, resolveIssueRepo, settingsLayer, type RepoConfig, type ReviewMode } from './lib/repoconfig'
import {
  parseReviewBlock,
  parseReviewMarker,
  refutedRows,
  reviewAdvice,
  reviewClause,
  reviewDue,
  reviewerDeny,
  reviewerPick,
  reviewPlan,
  reviewResumeText,
  reviewVerdictLine,
  shownRefuted,
  type ReviewMarker,
} from './lib/review'
import { alreadyQueuedDeny, enqueue, fallbackDelay, fallbackDue, fallbackKind, fallbackRow, hasSlot, isFinalDeny, isQueuedDeny, parseReadyFallbackMinutes, planQueue, promptKey, queuedDeny, queuedIndex, queuedText, readyCount, readyLine, readyWaitLine, resourceBlock, resourceDeny, runningDeny, startingOthers, waitedMinutes, waitsText, type FallbackKind, type ResourceWait, type Wanting } from './lib/scheduler'
import {
  aliasOf,
  CLASSIFIER_LABELS,
  classifierText,
  effortFor,
  effortText,
  fableRequested,
  finalAlias,
  tierOf,
  tierWarning,
  needsClassifier,
  noticeText,
  pickTier,
  tierPickLine,
  type Alias,
  type Effort,
  type EffortSetting,
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
import { askLine, AUTO_POST_CAP, capLine, coveredBy, issueNumberOf, parsePostArg, parsePostMode, postModeLine, REDACT_EMPTY, renderPost, survivingWord, type IssueRow, type PostFinding, type PostMode } from './lib/findings'
import { gitConfigValue, parseRedactList, type RedactRules } from './lib/redact'
import { behindLine, changelogSlice, classifyRoot, codeSkewLine, folderVersion, inDevMods, migrateConfig, updateLine, upToDateLine } from './lib/update'

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
  /** MOD-12: where /dispatch prepared a brief's worker (its worktree, or the root for repo=here); the brain's Agent call names no folder. */
  handoff: (briefPath: string) => `delegation.handoff.${briefPath}`,
  agentTypes: 'delegation.agentTypes',
  answered: 'delegation.models.answered',
  replay: (briefPath: string) => `delegation.replay.${briefPath}`,
  /** A worker's own spend this attempt, from its turn usage (GH-106). */
  cost: (agentId: string) => `delegation.cost.${agentId}`,
  /** MOD-13: the card's own `effort:`, written at /dispatch; it wins over effortByTier. */
  effort: (task: string) => `delegation.effort.${task}`,
  /** Set once an attempt's verdict row is posted to the conversation. */
  posted: (attemptKey: string) => `delegation.posted.${attemptKey}`,
  /** This session's verdict lines, for the compaction block and the system prompt section (2E). */
  recent: (sessionId: string) => `delegation.recent.${sessionId}`,
  /** The background debrief of a session (2C). */
  debrief: (sessionId: string) => `delegation.debrief.${sessionId}`,
  /** MOD-31: the post-findings question a debrief left waiting for the person (count, repo). */
  postAsk: (sessionId: string) => `delegation.postAsk.${sessionId}`,
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
  /** MOD-20: whose engine-suite gate (`claude plugin test`) is running; verifiers take turns on it. */
  engineGate: 'delegation.engineGate',
  /** MOD-22: the listing of a research card's absolute scope and forbid roots, taken at /dispatch. */
  outside: (task: string) => `delegation.outside.${task}`,
}

const PROBE_EVERY_MS = 24 * 60 * 60 * 1000
const STATUS_EVERY_MS = 60 * 1000
const PROMPT_CAP = 20000
const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS
const RECENT_CAP = 50
/** An eval runner out longer than this is taken as gone (a T1 run takes minutes). */
const EVAL_STALE_MS = 3 * HOUR_MS
/** MOD-6: a debrief whose agent never handed back is not holding the one slot past this. */
const DEBRIEF_STALE_MS = HOUR_MS
const EVALS_CAP = 100
const GATE_TIMEOUT_MS = 9 * 60 * 1000
/** The advice kinds that leave something for the brain (or the person) to do. */
const OWED_KINDS = ['resume', 'respawn', 'verify', 'exhausted', 'check', 'fix-brief', 'review']
const LEDGER_FILE = '.delegation/ledger.jsonl'

/**
 * `delegation.debrief.<session>`: the background debrief (2C, 5E). MOD-26: `skippedTo` is the breadcrumb line a
 * boundary-only window ended at when the mod spawned nothing for it; the next window starts there (the mod never
 * writes the `.done` mark, so the record is what moves).
 */
type DebriefRecord = { lastAt: number; watermark: number; lines: number; sessionId: string; mode?: 'breadcrumbs' | 'events'; builtIn?: boolean; agentId?: string; finishedAt?: number; path?: string; denied?: string; window?: DebriefWindow; prior?: DebriefRecord | null; skippedTo?: number }
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
type HereFields = { here?: string; files?: string[]; /** MOD-22: the report's metrics=, recorded and never judged. */ metrics?: Record<string, string> }
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
type InFlight = { label: string; scope: string[]; files: string[]; /** MOD-23: the resources its brief names. */ resources: string[] }

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
  /** MOD-23: the exclusive resources the brief's `resources=` names; the worker holds them while it runs. */
  resources?: string[]
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
  /**
   * MOD-21: set on a reviewer's record. `attempt` is the attempt it reviews; `worker` is that worker's agent id
   * (the resume goes to it), `sha` the commit under review. A reviewer is on no ladder, holds no slot, and edits nothing.
   */
  review?: { worker?: string; sha?: string }
}

const laneOf = (s: { replay?: boolean; base?: string }): Lane | undefined =>
  s.replay ? { replay: true, ...(s.base ? { base: s.base } : {}) } : undefined

/** `<task>:<lineage>:<attempt>` (the subtask and a replay lane folded into the task) — one verdict per key. */
const attemptKey = (s: SpawnRecord): string =>
  `${taskLabel(s.task, s.subtask)}${s.replay ? `@replay${s.base ? `-${s.base}` : ''}` : ''}:${s.review ? `review-${s.key}` : s.lineage}:${s.attempt}`

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
  /** MOD-6: the person's words the scrub replaces; /config only, never the (public) repo file. */
  redact: string[]
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
  /** MOD-13: the effort a worker steps at, per tier; 0 or empty leaves the engine's default. */
  effortByTier: Record<'economy' | 'standard' | 'frontier', EffortSetting>
  /** GH-113: what an opus or fable brain may do itself. */
  delegateOnly: 'off' | 'warn' | 'deny'
  /** MOD-7: owner/name /delegation debrief post files issues in; '' = posting is off. */
  issueRepo: string
  /** MOD-18: issueRepo is the mod's own repository, from the manifest (the repo file left it unset). */
  issueRepoOwn: boolean
  /** MOD-15: a verdict row is followed by a `$.prompt.submit`, a turn of the brain's own. */
  wakeOnVerdict: boolean
  /** MOD-31: ask | auto | off; /config only, never the (public, shared) repo file. */
  postFindings: PostMode
  /** MOD-15: how long a ready worktree row waits for the brain before the mod starts it itself; 0 = never. */
  readyFallbackMs: number
  /** MOD-21: a read-only reviewer after a consistent verdict: off, on, or on-frontier (frontier and premium cards only). */
  review: ReviewMode
  /** MOD-21: the reviewer's tier; '' = one below the worker's. */
  reviewTier: Tier | ''
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
  const issues = resolveIssueRepo(eff, modManifest ?? undefined)
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
      redact: parseRedactList(str('redact')),
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
      effortByTier: eff.effortByTier,
      delegateOnly: eff.delegateOnly,
      issueRepo: issues.repo,
      issueRepoOwn: issues.own,
      wakeOnVerdict: o.wakeOnVerdict !== false,
      postFindings: parsePostMode(o.postFindings),
      readyFallbackMs: parseReadyFallbackMinutes(o.readyFallbackMinutes) * MIN_MS,
      review: eff.review,
      reviewTier: eff.reviewTier,
    },
  }
}

// Module memory: a reload starts it over; the store and $.state stay.
let options: PluginOptions = {}
let repoLayer: RepoConfig = {}
/** The repo file's text as last read: undefined = not read yet, null = no file. */
let repoText: string | null | undefined
/** MOD-18: the loaded copy's manifest as last read, which names the mod's own repository: undefined = not read yet, null = unreadable. */
let modManifest: string | null | undefined
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
/** MOD-23: slot token → the resources that spawn names, held from the claim until $.agent.list shows the worker. */
const startingResources = new Map<number, string[]>()
/** MOD-12: the queued tasks the mod has said `ready:` for and that are still ready; each is said once. */
const announced = new Set<string>()
/** MOD-15: label → ms the queued row became ready (the fallback's clock); a row leaves with the queue or when it is no longer ready. */
const readySince = new Map<string, number>()
/** MOD-15: ready rows the fallback has looked at past their timeout and will not start (repo=here, repo=none, an unreadable brief). */
const fallbackSkipped = new Set<string>()
let fallbackTimer: { cancel: () => void } | undefined
let fallbackBusy = false
// promptKey → what to record once the spawn hook sees the agent id of a debrief or eval runner the mod started
const runnerStarted = new Map<string, (agentId: string) => Promise<void>>()
const selfDecided = new Set<string>() // promptKeys of spawns spawnSelf has decided: the hook passes them through
const selfIds = new Map<string, string>() // promptKey → the agent id the hook saw for a spawnSelf spawn
let lockTail: Promise<unknown> = Promise.resolve()
let ledgerTail: Promise<unknown> = Promise.resolve()
let frictionTail: Promise<unknown> = Promise.resolve()

/**
 * MOD-28: the mod's own templates (hooks/templates/*), read once and kept with the code that renders them. A pull
 * under a running session moves the folder, never this copy, so old code can never meet a new template. A reload starts it over.
 */
type LoadedTemplates = { root: string; text: Map<string, string>; failed: Map<string, string> }
let templatesLoad: Promise<LoadedTemplates> | undefined

/** MOD-3: the folder this copy of the mod loaded from; the one dir `git merge --ff-only origin/main` may run in. */
let loadedRoot = ''
let sessionRoot = ''
const allowCfg = (): AllowConfig => ({ gateTemplates: cfg.gateTemplates, domains: cfg.domains, cardDir: cfg.cardDir, ...(cfg.issueRepo ? { issueRepo: cfg.issueRepo } : {}), ...(sessionRoot ? { root: sessionRoot } : {}), ...(cfg.worktreeRoot ? { worktreeRoot: cfg.worktreeRoot } : {}), ...(loadedRoot ? { pluginRoot: loadedRoot } : {}) })

// ---- small host helpers (fail-open) ---------------------------------------
function debug($: Host, text: string) {
  try {
    $.ui.log(`${PLUGIN}: ${text}`, { to: 'debug' })
  } catch {
    // nothing to do
  }
}
/**
 * MOD-28: the mod's templates, read the first time anything asks and never again until a reload. `register` is handed no `$`,
 * so session.start asks first (the load); a session that reloads the mod mid-way asks at first use. A file that fails to
 * load is named once, here, and by the feature that needs it when used.
 */
function loadedTemplates($: Host): Promise<LoadedTemplates> {
  templatesLoad ??= readTemplates($)
  return templatesLoad
}
async function readTemplates($: Host): Promise<LoadedTemplates> {
  const root = $.plugin.root
  const text = new Map<string, string>()
  const failed = new Map<string, string>()
  for (const name of TEMPLATE_FILES) {
    try {
      text.set(name, await $.fs.read(templatePath(root, name)))
    } catch (err) {
      failed.set(name, String(err))
    }
  }
  if (failed.size > 0) {
    const names = [...failed.keys()].join(', ')
    debug($, `could not load ${names} from ${root}/hooks/templates: ${[...failed.values()].join('; ')}`)
    try {
      await $.ui.toast(`${PLUGIN}: could not load ${names} from ${root}/hooks/templates; the feature that needs ${failed.size === 1 ? 'it' : 'each'} will say so when used`)
    } catch {
      // the debug line stands
    }
  }
  return { root, text, failed }
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
  try {
    sessionRoot = (await $.session.root()).replace(/\/+$/, '')
  } catch {
    // no root: no issue form passes
  }
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
  // MOD-18: the manifest is read beside the repo file, so a moved issueRepo default (after an update) is seen
  let manifest: string | null = null
  try {
    manifest = (await readText($, `${$.plugin.root}/${PLUGIN_MANIFEST}`)) ?? null
  } catch {
    manifest = null
  }
  if (text === repoText && manifest === modManifest) return
  repoText = text
  modManifest = manifest
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
    // MOD-21: a reviewer's attempt is no worker attempt: the dashboard counts the workers
    if (Array.isArray(list)) out.push(...list.filter(r => r.kind !== 'review'))
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
  const who = await ownerFields($)
  const records = sessionRecords(await allRecords($), since, who)
  const rec = await readBrain($)
  const adhoc = await adhocSpend($, since, who)
  return { summary: brainSummary(rec, workersUsdOf(records), attemptsOf(records), usd !== undefined && usd > 0 ? usd : undefined, adhoc), hasBrain: (rec?.turns ?? 0) > 0, hasEdits: (rec?.edits ?? 0) > 0 }
}

/** MOD-37: what this session's ad hoc spawns (no brief header) cost, from their delegation.cost.<agentId> records. */
async function adhocSpend($: Host, since: number, who: { sessionId?: string; root?: string }): Promise<{ usd: number; agents: number }> {
  let usd = 0
  let agents = 0
  try {
    const list = sessionRecords((await storeGet<AttemptRecord[]>($, K.adhoc)) ?? [], since, who)
    for (const r of list) {
      if (!r.agentId) continue
      const cost = await storeGet<CostRecord>($, K.cost(r.agentId))
      if (!cost) continue
      agents += 1
      usd += cost.spend?.usd ?? 0
    }
  } catch (err) {
    debug($, `ad hoc spend not read: ${String(err)}`)
  }
  return { usd: Math.round(usd * 10000) / 10000, agents }
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
    const home = (await $.env.get('HOME')) || undefined
    const command = typeof input.command === 'string' ? input.command : ''
    const bash = tool === 'Bash' ? bashWrites(command, root, home) : undefined
    const paths = bash ? [...bash.paths] : toolPath(input)
    if (paths.length === 0 && !bash?.commit) return undefined
    await loadRepoConfig($)
    const family = cfg.delegateOnly === 'off' ? 'other' : await brainSeat($)
    if (bash?.commit && cfg.delegateOnly !== 'off' && isRestricted(family)) {
      // MOD-9: a commit is judged by the paths it takes, read with the allowed read-only forms
      const top = root.replace(/\/+$/, '')
      for (const c of bashCommits(command, root, home)) {
        const reads = [['diff', '--cached', '--name-only'], ...(c.all ? [['diff', '--name-only']] : [])]
        for (const r of reads) {
          const got = await run($, ['git', '-C', c.dir, ...r])
          if (got.ok && got.exitCode === 0) for (const name of got.stdout.split('\n')) if (name.trim() !== '') paths.push(`${top}/${name.trim()}`)
        }
        paths.push(...c.pathspecs)
      }
    }
    if (paths.length === 0) return undefined
    const d = delegateDecision({ mode: cfg.delegateOnly, brainFamily: family, tool, paths, root, cardDir: cfg.cardDir })
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

/**
 * MOD-21: a reviewer never edits. While a reviewer runs, its Edit, Write, MultiEdit and NotebookEdit calls are
 * refused, and so is any Bash command the delegateOnly lexer counts as a write (a redirection, tee, sed -i, a cp or
 * mv destination, a git commit), read against the folder it works in and against the session root. One line says why.
 * Undefined = go on.
 */
async function reviewerGuard($: Host, e: { tool: unknown; agentId?: string }): Promise<{ deny: string } | undefined> {
  const tool = String(e.tool)
  if (!e.agentId || !(WRITE_TOOLS.includes(tool) || tool === 'Bash')) return undefined
  const spawn = await spawnByAgent($, e.agentId)
  if (!spawn?.review) return undefined
  const deny = reviewerDeny(tool, taskLabel(spawn.task, spawn.subtask))
  if (WRITE_TOOLS.includes(tool)) return { deny }
  try {
    const command = typeof (e as unknown as Record<string, unknown>).command === 'string' ? ((e as unknown as Record<string, unknown>).command as string) : ''
    const root = await $.session.root()
    const home = (await $.env.get('HOME')) || undefined
    for (const dir of new Set([spawn.cwd ?? root, root])) {
      const writes = bashWrites(command, dir, home)
      if (writes.paths.length > 0 || writes.commit) return { deny }
    }
  } catch (err) {
    debug($, `reviewer's Bash not checked: ${String(err)}`)
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
async function liveModel($: Host): Promise<{ view: LiveView; since: number; records: AttemptRecord[]; running: { label: string; alias: string; tier: string; at: number }[]; waits: ReadonlyMap<string, ResourceWait> }> {
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
  const who = await ownerFields($)
  const adhoc = brain ? await adhocSpend($, since, who) : undefined
  const liveAt: Record<string, number> = {}
  for (const w of live.workers) liveAt[w.label] = w.spawn.at ?? t
  // MOD-23: the resource a worker holds, and what a queued row waits for, ride the worktree rows
  const holds: Record<string, string[]> = {}
  for (const w of live.workers) if ((w.spawn.resources ?? []).length > 0) holds[w.label] = w.spawn.resources as string[]
  const waits = (await planOfQueue($, live, queue)).waits
  const view = liveView({
    root,
    ...(cfg.worktreeRoot ? { worktreeRoot: cfg.worktreeRoot } : {}),
    porcelain: root ? await worktreeList($, root, t) : '',
    records,
    queue,
    liveAt,
    holds,
    waits: Object.fromEntries(waits),
    now: t,
    budget: cfg.defaultBudget,
    since,
    ...(who.sessionId ? { sessionId: who.sessionId } : {}),
    ...(adhoc ? { adhoc } : {}),
    usd,
    series: await readSpend($),
    owed: live.pending.length,
    ...(brain ? { brain } : {}),
  })
  return { view, since, records, running: live.workers.map(w => ({ label: w.label, alias: w.spawn.alias, tier: w.spawn.tier, at: w.spawn.at ?? t })), waits }
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
      // a worker killed without a turn.complete frees its slot: the next prompt's state section says ready (MOD-12)
      statusTimer = $.clock.every(STATUS_EVERY_MS, () => void refreshStatus($))
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
/** MOD-37: who made an attempt: the session whose brain spawned it and that session's root. */
async function ownerFields($: Host): Promise<{ sessionId?: string; root?: string }> {
  const sessionId = await sessionIdOf($)
  let root = ''
  try {
    root = await $.session.root()
  } catch {
    // no repo
  }
  return { ...(sessionId ? { sessionId } : {}), ...(root ? { root } : {}) }
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
      // MOD-21: a running reviewer holds no worker slot; its task's verdict is pending until it hands back
      if (spawn.review) {
        if (isOpen(spawn)) out.pending.push({ task: label, agentId: a.id })
      } else if (!spawn.adhoc && isOpen(spawn)) out.workers.push({ label, agentId: a.id, spawn })
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

/**
 * A slot for a briefed spawn (a token, released when the spawn hook ends), or
 * the spawn queued. `claim` false (a dispatch preparing the spawn block) only
 * looks: a free slot is not taken, a full one queues the task all the same.
 * A spawn of the same task still starting is refused (MOD-12: never twice).
 */
async function claimSlot($: Host, item: QueuedSpawn, label: string, claim = true, wants: readonly string[] = []): Promise<{ token?: number } | { deny: string }> {
  return withLock(async () => {
    if ([...starting.values()].includes(label)) return { deny: runningDeny(label) }
    const live = await liveState($)
    const others = startingOthers(starting.values(), label)
    const holders = [...(await liveLabels($, live.workers)), ...others]
    const queue = await readQueue($)
    // MOD-23: a resource a running attempt (or a spawn starting) holds queues the task whether or not a slot is free
    const blocked = resourceBlock(wants, heldResources(live.workers), label)
    if (!blocked && hasSlot(live.workers.length, others.length, cfg.maxWorkers)) {
      if (!claim) return {}
      slotSeq += 1
      starting.set(slotSeq, label)
      startingResources.set(slotSeq, [...wants])
      return { token: slotSeq }
    }
    const entered = enqueue(queue, item)
    if (entered.existing) {
      const kept = entered.existing
      return { deny: blocked ? resourceDeny(label, blocked.resource, blocked.holder, kept) : alreadyQueuedDeny(label, kept.at, kept.position) }
    }
    await writeQueue($, entered.queue)
    if (blocked) {
      debug($, `queued ${label}: ${blocked.holder} holds resource ${blocked.resource}`)
      return { deny: resourceDeny(label, blocked.resource, blocked.holder) }
    }
    debug($, `queued ${label}: ${holders.length} workers hold the ${cfg.maxWorkers} slots`)
    return { deny: queuedDeny(label, holders, entered.queue.map(q => taskLabel(q.task, q.subtask ?? 'main'))) }
  })
}

/** A task's queued row leaves the queue: its spawn started (GH-101: it takes the queued place), or was refused for good. */
async function dropQueued($: Host, task: string, subtask: string): Promise<QueuedSpawn | undefined> {
  return withLock(async () => {
    const queue = await readQueue($)
    const at = queuedIndex(queue, task, subtask)
    if (at < 0) return undefined
    await writeQueue($, queue.filter((_, i) => i !== at))
    // MOD-15: it is no longer waiting, ready or otherwise
    readySince.delete(taskLabel(task, subtask))
    fallbackSkipped.delete(taskLabel(task, subtask))
    return queue[at]
  })
}

/** MOD-15: the queued rows a free slot now waits for, head first; `exclude` is the worker whose turn just ended. */
async function readyQueued($: Host, exclude?: string): Promise<QueuedSpawn[]> {
  const queue = await readQueue($)
  if (queue.length === 0) return []
  const plan = await planOfQueue($, await liveState($, exclude), queue)
  const ready = new Set(plan.ready)
  return queue.filter(q => ready.has(queuedLabel(q)))
}

const queuedLabel = (q: QueuedSpawn): string => taskLabel(q.task, q.subtask ?? 'main')

/** MOD-23: the resources the running workers and the spawns still starting hold (a spawn's own label is skipped by the check). */
function heldResources(workers: readonly { label: string; spawn: SpawnRecord }[]): Wanting[] {
  return [
    ...workers.map(w => ({ label: w.label, resources: w.spawn.resources ?? [] })),
    ...[...starting.entries()].map(([token, label]) => ({ label, resources: startingResources.get(token) ?? [] })),
  ]
}

/** MOD-23: the resources a queued row names, read once per row: its brief file's header, else the header in its prompt. Unreadable is none. */
const queuedResourceCache = new Map<string, string[]>()
async function queuedResources($: Host, q: QueuedSpawn): Promise<string[]> {
  const key = `${queuedLabel(q)}@${q.at}`
  const known = queuedResourceCache.get(key)
  if (known) return known
  const path = findBriefPath(q.prompt)
  const text = path ? await readText($, path) : undefined
  const names = resourcesOf((text !== undefined ? parseHeader(text) : undefined) ?? parseHeader(q.prompt))
  queuedResourceCache.set(key, names)
  return names
}

/**
 * MOD-23: which queued rows are ready (head first, as many as the slots free, none whose resource a running attempt
 * or a row ahead of it holds) and which wait for a resource, and for whom.
 */
async function planOfQueue($: Host, live: Live, queue: readonly QueuedSpawn[]): Promise<{ ready: string[]; waits: Map<string, ResourceWait> }> {
  const names = new Set(queue.map(q => `${queuedLabel(q)}@${q.at}`))
  for (const key of [...queuedResourceCache.keys()]) if (!names.has(key)) queuedResourceCache.delete(key)
  const wants: Wanting[] = []
  for (const q of queue) wants.push({ label: queuedLabel(q), resources: await queuedResources($, q) })
  return planQueue(wants, heldResources(live.workers), readyCount(live.workers.length, starting.size, cfg.maxWorkers))
}

/**
 * MOD-12: the queue is advice. The queued rows a free slot now waits for
 * (head first, as many as the slots free), each named once while it stays
 * ready: `ready: <id> — run its spawn block`. `exclude` is the worker whose
 * turn just ended. The brain makes the spawn; MOD-15: a worktree row it leaves
 * unclaimed past readyFallbackMinutes is started by the fallback (selfSpawnReady).
 */
async function readyRows($: Host, exclude?: string): Promise<string[]> {
  const ready = (await readyQueued($, exclude)).map(q => ({ label: queuedLabel(q), task: q.task }))
  const stillReady = new Set(ready.map(r => r.label))
  for (const label of [...announced]) if (!stillReady.has(label)) announced.delete(label)
  await noteReady($, ready.map(r => r.label), true)
  const fresh = ready.filter(r => !announced.has(r.label))
  for (const r of fresh) announced.add(r.label)
  return fresh.map(r => readyLine(r.label, r.task))
}

/**
 * MOD-15: the clock of the fallback. A row seen ready for the first time is
 * stamped now; `prune` (the hand-back and the timer, which know the whole
 * ready set) drops the stamps of rows no longer ready. A new stamp arms the timer.
 */
async function noteReady($: Host, labels: readonly string[], prune: boolean): Promise<void> {
  if (prune) {
    for (const label of [...readySince.keys()]) if (!labels.includes(label)) readySince.delete(label)
    for (const label of [...fallbackSkipped]) if (!labels.includes(label)) fallbackSkipped.delete(label)
  }
  const t = await now($)
  let fresh = false
  for (const label of labels) {
    if (!readySince.has(label)) {
      readySince.set(label, t)
      fresh = true
    }
  }
  if (fresh) await armFallback($)
}

/** (Re)arms the one timer of the fallback at the soonest ready row still to be looked at. */
async function armFallback($: Host): Promise<void> {
  fallbackTimer?.cancel()
  fallbackTimer = undefined
  if (cfg.readyFallbackMs <= 0) return
  const waiting = [...readySince.entries()].filter(([label]) => !fallbackSkipped.has(label)).map(([, since]) => since)
  if (waiting.length === 0) return
  const t = await now($)
  try {
    fallbackTimer = $.clock.after(fallbackDelay(Math.min(...waiting), t, cfg.readyFallbackMs / MIN_MS), () => void fallbackCheck($))
  } catch (err) {
    debug($, `ready fallback not armed: ${String(err)}`)
  }
}

/** MOD-15: what kind of brief a queued row names: the header in its prompt, else the brief file's. */
async function queuedKind($: Host, q: QueuedSpawn): Promise<FallbackKind> {
  const inline = parseHeader(q.prompt)
  if (inline) return fallbackKind(inline)
  const path = findBriefPath(q.prompt)
  const text = path ? await readText($, path) : undefined
  return fallbackKind(text !== undefined ? parseHeader(text) : undefined)
}

/**
 * MOD-15: the timer's check. A ready row the brain left unclaimed for
 * readyFallbackMinutes is started through spawnSelf when its brief is a worktree
 * brief, as every queued row was before MOD-12; any other row is left for the
 * brain, and its ready line says how long it has waited. A row that is no longer
 * ready, or that the brain spawned meanwhile, is not touched.
 */
async function fallbackCheck($: Host): Promise<void> {
  fallbackTimer = undefined
  if (cfg.readyFallbackMs <= 0 || fallbackBusy) return
  fallbackBusy = true
  try {
    for (let guard = 0; guard < 20; guard++) {
      const ready = await readyQueued($)
      await noteReady($, ready.map(queuedLabel), true)
      const t = await now($)
      const due = ready.find(q => !fallbackSkipped.has(queuedLabel(q)) && fallbackDue(readySince.get(queuedLabel(q)) ?? t, t, cfg.readyFallbackMs / MIN_MS))
      if (!due) break
      const label = queuedLabel(due)
      const kind = await queuedKind($, due)
      if (kind !== 'worktree') {
        fallbackSkipped.add(label)
        debug($, `ready ${label} waited past readyFallbackMinutes; it is a ${kind === 'unknown' ? 'brief the mod could not read' : `repo=${kind} brief`}, so the mod does not start it`)
        continue
      }
      const started = await selfSpawnReady($, due, waitedMinutes(readySince.get(label) ?? t, t))
      // refused for now (the engine busy): another full wait before it is tried again
      if (!started && (await readQueue($)).some(q => queuedLabel(q) === label)) readySince.set(label, t)
    }
  } catch (err) {
    debug($, `ready fallback failed: ${String(err)}`)
  } finally {
    fallbackBusy = false
    await armFallback($)
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

/**
 * MOD-15: a turn of the brain's own. Once a verdict row (and any ready line or
 * respawn block with it) is in the conversation, the same text is submitted as
 * the plugin's message, never as the person's words: the model reads it as "The
 * chassis-delegation plugin sent a message" and acts, once the session is idle
 * (typed over, the engine queues it until the person's prompt is done). The
 * brain's own `--verify` and a foreground Agent result never come here.
 */
async function wakeBrain($: Host, text: string): Promise<void> {
  if (!cfg.wakeOnVerdict || text === '') return
  try {
    await $.prompt.submit({ text })
  } catch (err) {
    debug($, `brain not woken: ${String(err)}`)
  }
}

/** This session's verdict lines (2E reads them). */
/** MOD-32: a recent row also keeps the sha it was judged at and whether it was a re-judge in place, so the debrief can tell a false refute. */
type RecentRow = RecentVerdict & { sha?: string; rejudge?: boolean }

async function noteRecent($: Host, entry: RecentRow) {
  const sid = await sessionIdOf($)
  if (!sid) return
  const list = (await storeGet<RecentRow[]>($, K.recent(sid))) ?? []
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
    await appendRow($, spendWarnRow(taskLabel(spawn.task, spawn.subtask), spend.usd, ceiling))
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

/** MOD-13: the refusal for a worker that spent twice its ceiling this attempt (its next tool call), else undefined. */
async function overSpendRefusal($: Host, agentId: string): Promise<string | undefined> {
  const rec = await storeGet<CostRecord>($, K.cost(agentId))
  if (!rec?.stopped) return undefined
  const spawn = await spawnByAgent($, agentId)
  if (!spawn || spawn.adhoc || spawn.spend === undefined || rec.attempt !== spawn.attempt) return undefined
  return overSpendDeny(taskLabel(spawn.task, spawn.subtask), spawn.spend)
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
  await wakeBrain($, row)
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

// ---- MOD-13: the effort a worker steps at ----------------------------------------------
const stepEfforts = new Map<string, Effort | null>() // agentId → the effort its steps are rewritten to (null: the engine's), until its turn ends

/** The effort for a worker's next step: the card's `effort:`, else the tier's entry; recorded on the attempt the first time. */
async function stepEffort($: Host, agentId: string): Promise<Effort | undefined> {
  const hit = stepEfforts.get(agentId)
  if (hit !== undefined) return hit ?? undefined
  const spawn = await spawnByAgent($, agentId)
  // MOD-21: a reviewer steps at the engine's default; the card's effort belongs to its worker
  if (!spawn || spawn.adhoc || spawn.review) return undefined
  const effort = effortFor(spawn.tier, await storeGet<string>($, K.effort(spawn.task)), cfg.effortByTier)
  stepEfforts.set(agentId, effort ?? null)
  if (effort) {
    const lane = laneOf(spawn)
    const records = await loadAttempts($, spawn.task)
    await storeSet($, K.tasks(spawn.task), patchRecord(records, spawn.subtask, spawn.attempt, { effort }, lane))
  }
  return effort
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
      // MOD-35: one row per key (an accept per task attempt; a verdict per task, attempt, sha, verdict): a second arrival of the same hand-back writes nothing
      if (ledgerHas(prev, row)) {
        debug($, `ledger row for ${String(row.task)} attempt ${String(row.attempt)} already written; repeat skipped`)
        return
      }
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
  // MOD-12: the rows a free slot waits for read `ready:`; the brain makes their spawn. MOD-23: not a row whose resource is held
  const queue = await readQueue($)
  const plan = await planOfQueue($, live, queue)
  // MOD-15: the clock of the fallback starts here too, for a slot that freed with no hand-back
  await noteReady($, plan.ready, false)
  const clock = await now($)
  s.queued = []
  for (const [i, q] of queue.entries()) {
    const label = queuedLabel(q)
    let line: string | undefined
    const waiting = plan.waits.get(label)
    if (plan.ready.includes(label)) {
      line = readyLine(label, q.task)
      // MOD-15: a row the fallback will never start says how long it has waited, once it is past the timeout
      const since = readySince.get(label)
      if (since !== undefined && fallbackDue(since, clock, cfg.readyFallbackMs / MIN_MS)) {
        const kind = await queuedKind($, q)
        if (kind !== 'worktree') line = readyWaitLine(label, q.task, waitedMinutes(since, clock), kind)
      }
    }
    s.queued.push({ task: label, position: i + 1, ...(line !== undefined ? { ready: line } : {}), ...(waiting ? { waits: waitsText(waiting) } : {}) })
  }
  if (!sid) return s
  const recent = (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []
  s.recent = recent.map(r => ({ line: currentLine(r.line), at: r.at }))
  const busy = new Set([...s.running.map(r => r.task), ...s.pending.map(p => p.task), ...s.queued.map(q => q.task)])
  const t = await now($)
  const rows: { task: string; text: string; at: number; checked?: boolean }[] = []
  const retired = new Set<string>()
  for (const r of owedRowsFrom(recent, busy)) {
    const st = await retireCheck($, r.task, t)
    if (st.retired) retired.add(r.task)
    else rows.push({ task: r.task, text: r.owed as string, at: r.at, ...(st.checked ? { checked: true } : {}) })
  }
  const split = splitOwed(rows, t)
  s.owed = split.live
  s.owedOlder = split.older
  s.prs = prsFrom(recent)
  const ask = await storeGet<{ count: number; repo: string }>($, K.postAsk(sid))
  if (ask && ask.count > 0) s.postAsk = ask
  const debrief = await storeGet<DebriefRecord>($, K.debrief(sid))
  if (debrief?.lastAt !== undefined) {
    s.debrief = { at: debrief.lastAt, ...(debrief.agentId ? { agentId: debrief.agentId } : {}), ...(debrief.path ? { path: debrief.path } : {}), ...(debrief.finishedAt !== undefined ? { finishedAt: debrief.finishedAt } : {}) }
  }
  // MOD-33: the latest debrief's proposals with no record yet
  const latest = await latestProposals($)
  if (latest) {
    const open = openProposals(latest.proposals, latest.statuses)
    if (open > 0) s.proposalsOpen = open
  }
  const inflight = await storeGet<EvalInflight>($, K.evalInflight)
  const last = ((await storeGet<EvalEntry[]>($, K.evals)) ?? []).filter(e => e.sessionId === sid).at(-1)
  if (inflight && inflight.sessionId === sid) s.eval = { tier: inflight.tier, sha: inflight.sha, at: inflight.at, running: true, ...(inflight.agentId ? { agentId: inflight.agentId } : {}) }
  else if (last) s.eval = { tier: last.tier, sha: last.sha, at: last.at, ...(last.pass !== undefined ? { pass: last.pass } : {}), ...(last.total !== undefined ? { total: last.total } : {}) }
  return s
}

// ---- MOD-4: an owed row retires when its work is on the default branch, or by hand ---------
const splitLabel = (label: string): { task: string; subtask: string } => {
  const [task = label, subtask = 'main'] = label.split('/')
  return { task, subtask }
}

/** What two read-only git calls say of a task's last attempt: is its sha on origin/main, does its card there read merged. undefined: could not say. */
async function retireProbe($: Host, task: string, sha: string | undefined): Promise<{ ancestor?: boolean; card?: string }> {
  const root = await $.session.root()
  const out: { ancestor?: boolean; card?: string } = {}
  if (sha !== undefined && isSha(sha)) {
    const r = await run($, ['git', '-C', root, 'merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: root, timeoutMs: 10000 })
    if (r.ok && r.exitCode === 0) return { ancestor: true }
    if (r.ok && r.exitCode === 1) out.ancestor = false
  }
  const dir = (cfg.cardDir || DEFAULT_CARD_DIR).replace(/^\/+|\/+$/g, '')
  const listed = await run($, ['git', '-C', root, 'ls-tree', '--name-only', 'origin/main', `${dir}/`], { cwd: root, timeoutMs: 10000 })
  if (!listed.ok || listed.exitCode !== 0) return out
  const name = cardMatches(cardNamesFromLsTree(listed.stdout), task)[0]
  if (name === undefined) return out
  const shown = await run($, ['git', '-C', root, 'show', `origin/main:${dir}/${name}`], { cwd: root, timeoutMs: 10000 })
  if (shown.ok && shown.exitCode === 0) out.card = shown.stdout
  return out
}

/**
 * Does this owed task's row retire? Its last attempt carries `retired` once it
 * has, from the merge or from `/delegation accept`. Otherwise, at most once per
 * 15 minutes, the sha is looked for in origin/main and the card there for
 * `status: merged`; a check that gets no answer leaves the row as it is.
 */
async function retireCheck($: Host, label: string, t: number): Promise<{ retired: boolean; checked: boolean }> {
  const { task, subtask } = splitLabel(label)
  try {
    const records = await loadAttempts($, task)
    const last = attemptsFor(records, subtask).at(-1)
    if (!last) return { retired: false, checked: false }
    if (last.retired) return { retired: true, checked: true }
    if (!retireDue(records, subtask, t)) return { retired: false, checked: last.retireCheckedAt !== undefined }
    const patch = retirePatch(await retireProbe($, task, last.sha), t)
    await storeSet($, K.tasks(task), patchRecord(await loadAttempts($, task), subtask, last.attempt, patch))
    if (patch.retired === 'merged') await appendLedger($, acceptRow(last, 'merged', t))
    return { retired: patch.retired !== undefined, checked: patch.retireCheckedAt !== undefined || last.retireCheckedAt !== undefined }
  } catch (err) {
    debug($, `${label}: retire check failed: ${String(err)}`)
    return { retired: false, checked: false }
  }
}

/** `/delegation accept <id> [note]`: records it on the task's last attempt and retires its owed row. One line. */
async function acceptTask($: Host, rest: string): Promise<string> {
  const [id = '', ...words] = rest.split(/\s+/).filter(Boolean)
  if (id === '') return 'usage: /delegation accept <id> [note]'
  const { task, subtask } = splitLabel(id)
  const records = await loadAttempts($, task)
  const last = attemptsFor(records, subtask).at(-1)
  if (!last) return `/delegation accept: no attempts recorded for ${id}; nothing changed`
  const note = words.join(' ')
  const at = await now($)
  await storeSet($, K.tasks(task), patchRecord(records, subtask, last.attempt, { retired: 'accepted', accepted: { ...(note ? { note } : {}), at } }))
  await appendLedger($, { ...acceptRow(last, 'accepted', at), sessionId: await sessionIdOf($) })
  return `accepted ${id} by hand (attempt ${last.attempt})${note ? `: ${note}` : ''}; its owed row is retired`
}

/**
 * MOD-35: is this hand-back's task already on the default branch (or accepted)? MOD-4's retire check answers: the
 * attempt's sha an ancestor of origin/main, the card there reading merged, or an accept already recorded. Only a
 * consistent verdict of a real worker is asked about; a refuted, over-spend or reviewed one is always woken for.
 */
async function alreadyMerged($: Host, spawn: SpawnRecord): Promise<boolean> {
  if (spawn.adhoc || spawn.review || spawn.replay) return false
  try {
    const rec = attemptsFor(await loadAttempts($, spawn.task), spawn.subtask).find(r => r.attempt === spawn.attempt)
    if (rec?.verdict !== 'consistent') return false
    return (await retireCheck($, taskLabel(spawn.task, spawn.subtask), await now($))).retired
  } catch (err) {
    debug($, `${taskLabel(spawn.task, spawn.subtask)}: merged check failed: ${String(err)}`)
    return false
  }
}

/** MOD-35: the brain ran `gh pr merge` / `git merge` naming a task's branch or PR: its last attempt retires as merged, with an accept row. */
async function noteMergeCommand($: Host, command: string): Promise<void> {
  const targets = mergeTargets(command)
  const tasks = new Set<string>()
  for (const b of targets.branches) {
    const id = taskOfBranch(b)
    if (id) tasks.add(id)
  }
  if (targets.current) {
    const id = taskOfBranch((await branchOf($, await bashCwd($, undefined))) ?? '')
    if (id) tasks.add(id)
  }
  if (targets.prs.length > 0) {
    const sid = await sessionIdOf($)
    const recent = sid ? ((await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []) : []
    for (const r of recent) {
      if (r.pr && targets.prs.some(n => new RegExp(`(^|[/#])${n}$`).test(r.pr as string))) tasks.add(splitLabel(r.task).task)
    }
  }
  const t = await now($)
  for (const id of tasks) {
    try {
      const records = await loadAttempts($, id)
      const last = attemptsFor(records, 'main').at(-1) ?? records.filter(r => r.kind !== 'review' && !r.replay).sort((a, b) => a.attempt - b.attempt).at(-1)
      if (!last) continue
      if (!last.retired) await storeSet($, K.tasks(id), patchRecord(records, last.subtask, last.attempt, { retired: 'merged', retireTriedAt: t, retireCheckedAt: t }))
      await appendLedger($, { ...acceptRow(last, 'merged', t), sessionId: await sessionIdOf($) })
    } catch (err) {
      debug($, `${id}: merge not recorded: ${String(err)}`)
    }
  }
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
    const basis = await debriefBasis($)
    if (!basis) return debug($, 'no debrief: the session id or HOME is unknown')
    const { sid, prev, mode, lines, watermark, live } = basis
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
    const res = await startDebrief($, basis, t, [])
    if (res.skipped !== undefined) return debug($, `no debrief: ${res.skipped}`)
    if (res.deny !== undefined) return debug($, `debrief not started: ${res.deny}`)
    $.ui.toast('debrief running in the background')
  } finally {
    debriefBusy = false
  }
}

type DebriefBasis = { sid: string; home: string; prev: DebriefRecord | undefined; mode: 'breadcrumbs' | 'events'; lines: number; watermark: number; friction: FrictionRecord; live: Live; window?: DebriefWindow }

/** What both doors read before a debrief: the friction signal (breadcrumb lines past the watermark, else the events the mod saw) and the live state. */
async function debriefBasis($: Host): Promise<DebriefBasis | undefined> {
  const sid = await sessionIdOf($)
  let home: string | undefined
  try {
    home = await $.env.get('HOME')
  } catch {
    home = undefined
  }
  if (!sid || !home) return undefined
  const live = await liveState($)
  const prev = await storeGet<DebriefRecord>($, K.debrief(sid))
  const crumbs = await readText($, breadcrumbPath(home, sid))
  const friction = (await storeGet<FrictionRecord>($, K.friction(sid))) ?? { total: 0, events: [] }
  const mode: 'breadcrumbs' | 'events' = crumbs !== undefined ? 'breadcrumbs' : 'events'
  const lines = mode === 'breadcrumbs' ? countLines(crumbs ?? '') : friction.total
  // MOD-26: a window skipped as session boundaries only is behind us too, whatever the .done mark says
  const watermark = mode === 'breadcrumbs' ? Math.max(parseWatermark(await readText($, watermarkPath(home, sid))), prev?.skippedTo ?? 0) : prev?.mode === 'events' ? prev.lines : 0
  const window = mode === 'breadcrumbs' ? windowOf(crumbs ?? '', watermark) : undefined
  return { sid, home, prev, mode, lines, watermark, friction, live, ...(window ? { window } : {}) }
}

/** The folder the debrief file lands in: the built-in writes under the repo, the person's skill under ~/.claude/harness. */
const debriefFolder = (builtIn: boolean, root: string, home: string): string => (builtIn ? `${root.replace(/\/+$/, '')}/.delegation/debriefs` : `${home.replace(/\/+$/, '')}/.claude/harness/debriefs`)

/**
 * The record claimed, the prompt built (the skill's or the built-in's, each asking for mod_findings), the agent spawned. `notes` are extra fact lines.
 * MOD-26: a breadcrumbs prompt carries the friction events and verdicts whose time lies inside its window, each dated; a window of session
 * boundaries alone with no such fact spawns nothing (`skipped` says why) and moves the record past it.
 */
async function startDebrief($: Host, basis: DebriefBasis, t: number, notes: string[]): Promise<{ agentId?: string; deny?: string; skipped?: string; builtIn: boolean }> {
  const { sid, home, prev, mode, lines, watermark, friction, window } = basis
  const source = debriefSource(home, $.plugin.root, await exists($, debriefSkillPath(home)))
  const recent = (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []
  // breadcrumbs: the window alone chooses the facts (none without one); events: the events past the last debrief and the verdicts since it
  const fresh = friction.events.slice(-Math.max(0, Math.min(friction.events.length, lines - watermark)))
  const facts = mode === 'breadcrumbs' ? (window ? windowFacts(friction.events, recent, window) : []) : [...frictionFacts(fresh), ...verdictFacts(recent.filter(r => prev === undefined || r.at > prev.lastAt))]
  if (mode === 'breadcrumbs' && window && boundaryOnly(window) && facts.length === 0) {
    const skip: DebriefRecord = { lastAt: t, watermark, lines, sessionId: sid, mode, builtIn: source.builtIn, finishedAt: t, skippedTo: window.end }
    await storeSet($, K.debrief(sid), skip)
    return { skipped: nothingToDebrief(window), builtIn: source.builtIn }
  }
  // MOD-28: the built-in instructions are the copy loaded with this code and travel in the prompt; with none, nothing is claimed or started
  let builtInText: string | undefined
  if (source.builtIn) {
    const loaded = await loadedTemplates($)
    builtInText = loaded.text.get('debrief.md')
    if (builtInText === undefined) return { deny: `the built-in debrief template could not be read: ${loaded.failed.get('debrief.md') ?? 'not loaded'} (it failed to load when the mod started)`, builtIn: true }
  }
  // claimed before the spawn: never twice for this watermark, whatever the spawn does
  // MOD-10: the previous record is kept inside the claim; a debrief that fails its check puts it back
  const prior = prev ? ((({ prior: _p, window: _w, ...rest }) => rest)(prev) as DebriefRecord) : null
  const record: DebriefRecord = { lastAt: t, watermark, lines, sessionId: sid, mode, builtIn: source.builtIn, ...(window ? { window } : {}), prior }
  await storeSet($, K.debrief(sid), record)
  // MOD-33: proposals the person already settled are named, so the agent does not propose them again
  const settled = await settledNotes($)
  const promptFacts = [...notes, ...settled, ...facts]
  const prompt = source.builtIn ? builtInDebriefPrompt(source.path, sid, await $.session.root(), promptFacts, window, builtInText) : debriefPrompt(source.path, sid, promptFacts, window)
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
    return { deny: res.deny, builtIn: source.builtIn }
  }
  if (res.agentId) await recordAgent(res.agentId)
  return { ...(res.agentId ? { agentId: res.agentId } : {}), builtIn: source.builtIn }
}

/**
 * MOD-6, `/delegation debrief`: the same background debrief maybeDebrief starts, now. It skips the idle,
 * cooldown and minimum-friction tests, keeps one at a time, and runs while a worker runs (saying so).
 */
async function runDebrief($: Host): Promise<string> {
  if (debriefBusy) return 'a debrief is already starting; try again in a moment'
  debriefBusy = true
  try {
    const basis = await debriefBasis($)
    if (!basis) return 'debrief not started: the session id or HOME is unknown'
    const t = await now($)
    const prev = basis.prev
    if (prev?.agentId !== undefined && prev.finishedAt === undefined && prev.denied === undefined && t - prev.lastAt < DEBRIEF_STALE_MS) {
      return `a debrief is already running: agent ${prev.agentId}`
    }
    const workers = basis.live.workers.length
    const note = workers > 0 ? `${workers} ${workers === 1 ? 'worker' : 'workers'} running; their attempts are not finished` : ''
    const res = await startDebrief($, basis, t, note ? [`note: ${note}`] : [])
    if (res.skipped !== undefined) return res.skipped
    if (res.deny !== undefined) return `debrief not started: ${res.deny}`
    const root = await $.session.root()
    return `debrief started: agent ${res.agentId ?? '(id not yet known)'} · mode ${basis.mode}${basis.window ? ` · lines ${basis.window.firstLine} to ${basis.window.lastLine}` : ''} · writes to ${debriefFolder(res.builtIn, root, basis.home)}/${note ? ` · ${note}` : ''}`
  } finally {
    debriefBusy = false
  }
}

/**
 * MOD-7, `/delegation debrief post [all|1,3]`: with no argument, the latest .findings.json as it
 * would be posted (nothing is sent); with one, the named findings whose status is new become issues
 * in cfg.issueRepo, one each, a covered one only when named (then as a comment).
 */
async function runDebriefPost($: Host, argText: string): Promise<string> {
  const text = await postCore($, argText, {}, { newCount: 0 })
  // MOD-31: a post was asked for, so the question a debrief left is answered
  if (argText.trim() !== '') {
    const sid = await sessionIdOf($)
    if (sid) await storeSet($, K.postAsk(sid), null)
  }
  return text
}

/**
 * MOD-31: the one path that posts. `path` names the findings file (default: the latest); `auto` is the
 * post-right-after-the-scrub form (all, at most AUTO_POST_CAP created, no proposals repeated);
 * `countOnly` (with an empty argument) only fills `info.newCount`: the findings that are new.
 */
async function postCore($: Host, argText: string, opts: { path?: string; auto?: boolean; countOnly?: boolean }, info: { newCount: number }): Promise<string> {
  await loadRepoConfig($)
  const repo = cfg.issueRepo
  if (repo === '') return 'debrief post: issueRepo is empty, so posting is off (the repo file says "", or the mod\'s manifest names no repository). Set issueRepo (owner/name) in .chassis-delegation.json to turn it on; nothing was posted.'
  const arg = argText.trim()
  // MOD-18: nothing is filed while the person's own redact list is empty; the read-only form still shows the drafts, with the warning on top
  if (arg !== '' && cfg.redact.length === 0) return `debrief post refused, nothing posted: ${REDACT_EMPTY}`
  const root = (await $.session.root()).replace(/\/+$/, '')
  let folder = `${root}/.delegation/debriefs`
  let names: string[] = []
  try {
    names = (await $.fs.list(folder)).map(e => e.name).filter(n => n.endsWith('.findings.json')).sort()
  } catch {
    names = []
  }
  let name = names[names.length - 1]
  if (opts.path !== undefined) {
    folder = opts.path.replace(/\/[^/]*$/, '')
    name = opts.path.slice(folder.length + 1)
  }
  if (name === undefined) return `debrief post: no .findings.json under ${folder}/. Run /delegation debrief first.`
  const path = `${folder}/${name}`
  const text = await readText($, path)
  let parsed: Record<string, unknown> = {}
  try {
    const j: unknown = text === undefined ? undefined : JSON.parse(text)
    if (j !== null && typeof j === 'object' && !Array.isArray(j)) parsed = j as Record<string, unknown>
  } catch {
    // reported below
  }
  const rawList = (Array.isArray(parsed.findings) ? parsed.findings : []).filter((r): r is Record<string, unknown> => r !== null && typeof r === 'object' && typeof (r as Record<string, unknown>).title === 'string' && ((r as Record<string, unknown>).title as string).trim() !== '')
  // MOD-10: the findings about the host are never listed or filed; the count is all post says of them
  const setAside = Array.isArray(parsed.host_findings) ? parsed.host_findings.length : 0
  const asideLine = setAside > 0 ? `${setAside} host_findings set aside (never posted)` : ''
  // MOD-18: the agent's own proposals, from the debrief this findings file was cut from; shown, never posted
  const proposals = await proposalsOf($, parsed.debrief)
  const underFindings = proposals.length > 0 && !opts.auto && !opts.countOnly ? ['', ...proposals] : []
  if (rawList.length === 0) return [`debrief post: ${path} holds no findings`, ...(asideLine ? [asideLine] : []), ...underFindings].join('\n')
  const rules = await redactRules($)
  // scrubbed again, now: what the file says is not trusted to be clean
  const scrubbed = scrubbedFindings(JSON.stringify({ mod_findings: rawList }), rules) ?? []
  const findings: PostFinding[] = scrubbed.map((f, i) => {
    const raw = rawList[i] ?? {}
    return { ...f, ...(typeof raw.issue === 'number' ? { issue: raw.issue } : {}), ...(typeof raw.commentedOn === 'number' ? { commentedOn: raw.commentedOn } : {}) }
  })
  let issues: IssueRow[] = []
  let trackerWhy = ''
  const listed = await run($, ['gh', 'issue', 'list', '--repo', repo, '--state', 'all', '--limit', '200', '--json', 'number,title,body'])
  if (!listed.ok || listed.exitCode !== 0) trackerWhy = listed.ok ? `gh exited ${listed.exitCode}: ${listed.stderr.trim().slice(0, 200)}` : listed.why
  else {
    try {
      const j: unknown = JSON.parse(listed.stdout)
      if (!Array.isArray(j)) throw new Error('not a list')
      issues = j.filter((r): r is IssueRow => r !== null && typeof r === 'object' && typeof r.number === 'number').map(r => ({ number: r.number, title: String(r.title ?? ''), body: String(r.body ?? '') }))
    } catch (err) {
      trackerWhy = `could not read the issue list: ${String(err).slice(0, 100)}`
    }
  }
  const statusOf = (f: PostFinding): string => (f.issue !== undefined ? `posted as #${f.issue}` : trackerWhy !== '' ? `unchecked (${trackerWhy})` : (() => { const k = coveredBy(f, issues); return k === undefined ? 'new' : `covered by #${k}` })())
  info.newCount = findings.filter(f => f.issue === undefined && (trackerWhy !== '' || coveredBy(f, issues) === undefined)).length
  if (opts.countOnly) return ''
  if (arg === '') {
    const out = [...(cfg.redact.length === 0 ? [`warning: ${REDACT_EMPTY}`] : []), `debrief post: ${path} -> ${repo}${cfg.issueRepoOwn ? " (the mod's own tracker)" : ''} (nothing is posted by this form; /delegation debrief post all|1,3 posts)`, ...(asideLine ? [asideLine] : [])]
    findings.forEach((f, i) => {
      const { title, body } = renderPost(f, MOD_VERSION)
      out.push('', `[${i + 1}] ${statusOf(f)}`, `title: ${title}`, '', body.trimEnd(), '------')
    })
    return [...out, ...underFindings].join('\n')
  }
  const want = parsePostArg(arg, findings.length)
  if ('error' in want) return `debrief post: ${want.error}`
  if (trackerWhy !== '') return `debrief post: could not check ${repo} for a finding already covered (${trackerWhy}); nothing posted`
  const out: string[] = []
  const post: Record<string, unknown>[] = rawList.map(r => ({ ...r }))
  const base = name.replace(/\.findings\.json$/, '')
  let created = 0
  let held = 0
  for (const n of want.nums) {
    const f = findings[n - 1] as PostFinding
    if (f.issue !== undefined) {
      out.push(`[${n}] skipped: already posted as #${f.issue}`)
      continue
    }
    const k = coveredBy(f, issues)
    if (k !== undefined && want.all) {
      out.push(`[${n}] skipped: covered by #${k} (name it, /delegation debrief post ${n}, to add it as a comment)`)
      continue
    }
    // MOD-31: auto stops at the cap; the rest stay drafts
    if (opts.auto && k === undefined && created >= AUTO_POST_CAP) {
      held++
      continue
    }
    const { title, body } = renderPost(f, MOD_VERSION)
    const left = survivingWord(`${title}\n${body}`, cfg.redact)
    if (left !== undefined) {
      out.push(`[${n}] refused: "${left}" from the redact list survives in "${f.title}"; nothing posted for it`)
      continue
    }
    const file = `${folder}/${base}.post-${n}.md`
    await $.fs.write(file, body)
    if (k !== undefined) {
      const r = await run($, ['gh', 'issue', 'comment', String(k), '--repo', repo, '--body-file', file])
      if (!r.ok || r.exitCode !== 0) {
        out.push(`[${n}] not commented on #${k}: ${r.ok ? r.stderr.trim().slice(0, 200) || `gh exited ${r.exitCode}` : r.why}`)
        continue
      }
      ;(post[n - 1] as Record<string, unknown>).commentedOn = k
      out.push(`[${n}] commented on #${k} ${r.stdout.trim()}`.trimEnd())
      continue
    }
    const r = await run($, ['gh', 'issue', 'create', '--repo', repo, '--title', title, '--body-file', file])
    if (!r.ok || r.exitCode !== 0) {
      out.push(`[${n}] not posted: ${r.ok ? r.stderr.trim().slice(0, 200) || `gh exited ${r.exitCode}` : r.why}`)
      continue
    }
    created++
    const num = issueNumberOf(r.stdout)
    if (num !== undefined) (post[n - 1] as Record<string, unknown>).issue = num
    out.push(num !== undefined ? `#${num} ${r.stdout.trim().split('\n').pop()}` : `[${n}] posted: ${r.stdout.trim()} (no issue number found to record)`)
  }
  if (held > 0) out.push(capLine(held))
  if (asideLine && !opts.auto) out.push(asideLine)
  try {
    await $.fs.write(path, JSON.stringify({ ...parsed, findings: post }, null, 2) + '\n')
  } catch (err) {
    out.push(`could not record the issue numbers in ${path}: ${String(err).slice(0, 100)}`)
  }
  return [...out, ...underFindings].join('\n')
}

// ---- MOD-34: /delegation lesson ------------------------------------------------------
/**
 * `/delegation lesson <domain> [text]`: with text, append `- <YYYY-MM-DD> <text>` to the domain's lessons file beside the
 * cards (creating it) and say how many lines it holds against the cap; with the domain alone, print the file.
 */
async function runLesson($: Host, rest: string): Promise<string> {
  await loadRepoConfig($)
  const m = /^\s*(\S+)(?:\s+([\s\S]*))?$/.exec(rest)
  if (m === null) return `usage: /delegation lesson <domain> [text] (domains: ${cfg.domains.join(', ')})`
  const domain = m[1] as string
  if (!cfg.domains.includes(domain)) return `lesson: ${domain} is not one of the repo's domains: ${cfg.domains.join(', ')}`
  const path = lessonsPath(await $.session.root(), cfg.cardDir, domain)
  let text = (m[2] ?? '').trim()
  const q = /^(['"])([\s\S]*)\1$/.exec(text)
  if (q !== null) text = (q[2] as string).trim()
  const prev = await readText($, path)
  if (text === '') {
    return prev === undefined || lessonLineCount(prev) === 0 ? `no ${domain} lessons yet (${path}); /delegation lesson ${domain} <text> adds one` : `${path} (${lessonLineCount(prev)} lines, cap ${LESSONS_CAP}):\n${prev.replace(/\n+$/, '')}`
  }
  const date = new Date(await now($)).toISOString().slice(0, 10)
  const body = `${prev ?? ''}${prev === undefined || prev === '' || prev.endsWith('\n') ? '' : '\n'}- ${date} ${text.replace(/\s*\n\s*/g, ' ')}\n`
  try {
    await $.fs.write(path, body)
  } catch (err) {
    return `lesson: could not write ${path}: ${String(err).slice(0, 100)}`
  }
  const n = lessonLineCount(body)
  return `lesson added to ${path}: ${n} ${n === 1 ? 'line' : 'lines'}, cap ${LESSONS_CAP} lines${n > LESSONS_CAP ? ` (over the cap: the brief carries the first ${LESSONS_CAP}; prune the file)` : ''}`
}

// ---- MOD-33: /delegation debrief apply -----------------------------------------------

type LatestProposals = { debrief: string; findings: string; proposals: ReturnType<typeof parseProposals>; statuses: ProposalStatus[]; doc: Record<string, unknown> | undefined }

/** The debrief files in the repo folder and the proposals of one: its findings file (beside it) holds the statuses. */
async function proposalsAt($: Host, debrief: string): Promise<LatestProposals | undefined> {
  const text = await readText($, debrief)
  if (text === undefined) return undefined
  const findings = findingsPathOf(debrief)
  let doc: Record<string, unknown> | undefined
  try {
    const j: unknown = JSON.parse((await readText($, findings)) ?? 'null')
    if (j !== null && typeof j === 'object' && !Array.isArray(j)) doc = j as Record<string, unknown>
  } catch {
    doc = undefined
  }
  return { debrief, findings, proposals: parseProposals(text), statuses: parseStatuses(doc?.proposals_status), doc }
}

/** The latest debrief's proposals: the one this session's record names, else the newest in <root>/.delegation/debriefs. */
async function latestProposals($: Host): Promise<LatestProposals | undefined> {
  const sid = await sessionIdOf($)
  const rec = sid ? await storeGet<DebriefRecord>($, K.debrief(sid)) : undefined
  if (rec?.path) {
    const home = (await homeOf($)).replace(/\/+$/, '')
    const got = await proposalsAt($, rec.path.startsWith('~/') ? `${home}${rec.path.slice(1)}` : rec.path)
    if (got) return got
  }
  const folder = `${(await $.session.root()).replace(/\/+$/, '')}/.delegation/debriefs`
  let stems: string[] = []
  try {
    stems = (await $.fs.list(folder)).map(e => e.name).filter(n => n.endsWith('.json')).map(n => n.replace(/\.findings\.json$/, '').replace(/\.json$/, '')).filter(n => !/\.post-\d+/.test(n))
  } catch {
    stems = []
  }
  const stem = [...new Set(stems)].sort().at(-1)
  return stem === undefined ? undefined : proposalsAt($, `${folder}/${stem}.json`)
}

/** `already done: …` / `dismissed: …` lines from the last few debriefs in the repo folder, each summary once. */
async function settledNotes($: Host): Promise<string[]> {
  const folder = `${(await $.session.root()).replace(/\/+$/, '')}/.delegation/debriefs`
  let stems: string[] = []
  try {
    stems = (await $.fs.list(folder)).map(e => e.name).filter(n => n.endsWith('.findings.json')).map(n => n.replace(/\.findings\.json$/, '')).sort().slice(-10)
  } catch {
    return []
  }
  const lines = new Set<string>()
  for (const stem of stems) {
    const got = await proposalsAt($, `${folder}/${stem}.json`)
    if (got) for (const l of settledLines(got.proposals, got.statuses)) lines.add(l)
  }
  return lines.size === 0 ? [] : [...lines, SETTLED_ASK]
}

/**
 * MOD-33, `/delegation debrief apply [n [done|dismiss [note]]]`: list the latest debrief's proposals,
 * print one in full with the instruction for the brain, or record that the person settled it. The mod
 * writes nothing but its own record (proposals_status in the .findings.json); the brain makes the edit, with the person's yes.
 */
async function runDebriefApply($: Host, argText: string): Promise<string> {
  const latest = await latestProposals($)
  if (latest === undefined) return 'debrief apply: no debrief found under .delegation/debriefs/. Run /delegation debrief first.'
  const { proposals, statuses } = latest
  const m = /^\s*(\S*)\s*(\S*)\s*([\s\S]*)$/.exec(argText)
  const [, nText = '', verb = '', rest = ''] = m ?? []
  if (nText === '') {
    if (proposals.length === 0) return `no proposals in ${latest.debrief}`
    return [`debrief proposals in ${latest.debrief} (${openProposals(proposals, statuses)} open):`, ...proposalListLines(proposals, statuses), '/delegation debrief apply <n> shows one; apply <n> done [note] or apply <n> dismiss [reason] records it'].join('\n')
  }
  const n = /^\d+$/.test(nText) ? Number(nText) : 0
  const p = proposals.find(x => x.n === n)
  if (p === undefined) return `debrief apply: there is no proposal [${nText}] in ${latest.debrief} (${proposals.length === 0 ? 'it has none' : `1 to ${proposals.length}`})`
  if (verb === '') return [...proposalDetail(p), '', `For the brain: ${proposalInstruction(p)}`].join('\n')
  if (verb !== 'done' && verb !== 'dismiss') return `debrief apply: after the number say done [note] or dismiss [reason] (got ${JSON.stringify(verb)})`
  const status: ProposalStatus = { n, status: verb === 'done' ? 'done' : 'dismissed', note: rest.trim(), at: isoTime(await now($)) }
  const next = [...statuses.filter(x => x.n !== n), status].sort((a, b) => a.n - b.n)
  const doc = latest.doc ?? { debrief: latest.debrief, modVersion: MOD_VERSION, scrubbed: true, findings: [], host_findings: [] }
  try {
    await $.fs.write(latest.findings, JSON.stringify({ ...doc, proposals_status: next }, null, 2) + '\n')
  } catch (err) {
    return `debrief apply: could not record it in ${latest.findings}: ${String(err).slice(0, 100)}`
  }
  return `proposal [${n}] marked ${status.status}${status.note ? `: ${status.note}` : ''} (${latest.findings})`
}

/** MOD-18: the agent's own proposals out of the debrief file a findings file names (a leading ~/ is the home folder); [] when there is none to read. */
async function proposalsOf($: Host, debriefPath: unknown): Promise<string[]> {
  if (typeof debriefPath !== 'string' || debriefPath.trim() === '') return []
  const home = (await homeOf($)).replace(/\/+$/, '')
  const path = debriefPath.startsWith('~/') ? `${home}${debriefPath.slice(1)}` : debriefPath
  const text = await readText($, path)
  return text === undefined ? [] : proposalsLines(text)
}

/** The scrub rules of this session: the repo folder and origin, the git user (read from the git config files, which the allowlist need not run), the /config list. */
async function homeOf($: Host): Promise<string> {
  try {
    return (await $.env.get('HOME')) ?? ''
  } catch {
    return ''
  }
}

async function redactRules($: Host): Promise<RedactRules> {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const home = (await homeOf($)).replace(/\/+$/, '')
  const repoCfg = (await readText($, `${root}/.git/config`)) ?? ''
  const userCfgs = home ? [await readText($, `${home}/.gitconfig`), await readText($, `${home}/.config/git/config`)] : []
  const user = (key: string) => [repoCfg, ...userCfgs].map(t => (t ? gitConfigValue(t, 'user', key) : undefined)).find(v => v !== undefined)
  const origin = gitConfigValue(repoCfg, 'remote "origin"', 'url')
  const userName = user('name')
  const userEmail = user('email')
  return {
    repo: root.split('/').pop() ?? '',
    ...(origin ? { origin } : {}),
    ...(userName ? { userName } : {}),
    ...(userEmail ? { userEmail } : {}),
    words: cfg.redact,
  }
}

/** MOD-38: the user messages of the main conversation, read through the engine's session messages call (never by path); [] when it cannot be read. */
async function sessionUsers($: Host): Promise<UserMessage[]> {
  try {
    const rows = await $.session.messages({})
    if (Array.isArray(rows)) return userMessagesOf(rows)
    debug($, `no session transcript for the debrief check: ${rows.deny}`)
  } catch (err) {
    debug($, `no session transcript for the debrief check: ${String(err)}`)
  }
  return []
}

/**
 * MOD-6 + MOD-10: the debrief agent handed back. Read its JSON and check it against its window
 * (out-of-window entries stripped, kinds the window lacks flagged), set the host's findings aside,
 * scrub every string of mod_findings, write <same folder>/<same name>.findings.json and print one
 * line per finding. Returns moved: false when the check stripped or flagged something (the record must not move); MOD-32: clean: true only when the check ran and printed clean.
 */
async function writeFindings($: Host, debriefPath: string, window: DebriefWindow | undefined): Promise<{ moved: boolean; clean: boolean }> {
  try {
    const home = await homeOf($)
    const path = debriefPath.startsWith('~/') ? `${home.replace(/\/+$/, '')}${debriefPath.slice(1)}` : debriefPath
    const text = await readText($, path)
    if (text === undefined) {
      await appendRow($, `findings: could not read ${path}; no findings file written; the .done watermark was left as is`)
      return { moved: true, clean: false }
    }
    const check = checkDebrief(text, window, await sessionUsers($))
    if (!check.parsed) {
      await appendRow($, `findings: ${path} is not a JSON object; no findings file written; the .done watermark was left as is`)
      return { moved: true, clean: false }
    }
    await appendRow($, check.lines.join('\n'))
    let body = text
    if (check.strippedCount > 0 || check.evidenced > 0) {
      body = JSON.stringify(check.debrief, null, 2) + '\n'
      await $.fs.write(path, body)
    }
    if (!check.clean) {
      await appendRow($, 'debrief record not moved: the previous record stands, so the next debrief covers this window again; the .done watermark was left as is (not to be marked)')
      return { moved: false, clean: false }
    }
    const findings = scrubbedFindings(body, await redactRules($))
    if (findings === undefined) return { moved: true, clean: true }
    const { mod, host } = splitModFindings(findings)
    // MOD-18: after the findings lines, the agent's own proposals; they stay in the debrief file and are never posted
    const proposals = proposalsLines(body)
    if (findings.length === 0) {
      await appendRow($, findingsLines(findings, '').join('\n'))
      if (proposals.length > 0) await appendRow($, proposals.join('\n'))
      return { moved: true, clean: true }
    }
    const out = findingsPathOf(path)
    await $.fs.write(out, JSON.stringify(findingsFile(path, MOD_VERSION, mod, host), null, 2) + '\n')
    await appendRow($, findingsLines(mod, out, host.length).join('\n'))
    if (proposals.length > 0) await appendRow($, proposals.join('\n'))
    await afterFindings($, out, mod.length)
  } catch (err) {
    debug($, `findings not written: ${String(err)}`)
    return { moved: true, clean: false }
  }
  return { moved: true, clean: true }
}

/**
 * MOD-31: the debrief's mod findings are written; per postFindings, ask the person (the default), post
 * them all (auto, after the same scrub, survive check and dedupe as `debrief post all`), or say nothing (off).
 * The host's findings and the agent's proposals are never part of it.
 */
async function afterFindings($: Host, findingsPath: string, modCount: number): Promise<void> {
  const sid = await sessionIdOf($)
  if (sid) await storeSet($, K.postAsk(sid), null)
  await loadRepoConfig($)
  if (cfg.postFindings === 'off' || modCount === 0 || cfg.issueRepo === '') return
  if (cfg.postFindings === 'auto') {
    if (cfg.redact.length > 0) {
      await appendRow($, await postCore($, 'all', { path: findingsPath, auto: true }, { newCount: 0 }))
      return
    }
    await appendRow($, `auto does not post: ${REDACT_EMPTY}`)
  }
  const info = { newCount: 0 }
  await postCore($, '', { path: findingsPath, countOnly: true }, info)
  if (info.newCount === 0) return
  const question = askLine(info.newCount, cfg.issueRepo)
  if (sid) await storeSet($, K.postAsk(sid), { count: info.newCount, repo: cfg.issueRepo })
  await appendRow($, question)
  await wakeBrain($, question)
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
    const written = path ? await writeFindings($, path, debrief.window) : { moved: true, clean: false }
    const moved = written.moved
    if (moved) {
      const { prior: _prior, window: _window, ...rest } = debrief
      await storeSet($, K.debrief(sid), { ...rest, finishedAt: t, ...(path ? { path } : {}) })
    } else await storeSet($, K.debrief(sid), debrief.prior ?? null)
    $.ui.toast(moved ? debriefToast(answer) : 'debrief check failed: the debrief record was not moved')
    // MOD-32: the check prints after the agent handed back, so it is told, as autoEscalate resumes a worker, to mark its watermark
    if (written.clean) {
      try {
        const sent = await $.session.send({ to: { agentId }, text: MARK_WATERMARK_MESSAGE })
        if (!sent.isDelivered) debug($, `watermark message not delivered to ${agentId}: ${sent.reason}`)
      } catch (err) {
        debug($, `watermark message not delivered to ${agentId}: ${String(err)}`)
      }
    }
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
      out.push({
        label,
        scope: contract !== undefined && contract.ok ? contract.scope : [],
        files: [...new Set(mine.flatMap(r => r.files ?? []))],
        resources: text !== undefined ? resourcesOf(parseHeader(text)) : [],
      })
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
type VerifyResult = { verdict: Verdict; lines: string[]; noRepo?: boolean; red?: string; redHash?: string; redHeld?: true; metrics?: Record<string, string> }

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
    ...(await ownerFields($)),
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

/** MOD-20: the lock's read-check-write, one verifier at a time inside this process (the store has no compare-and-set). */
let engineGuard: Promise<unknown> = Promise.resolve()
const alone = <T>(fn: () => Promise<T>): Promise<T> => {
  const next = engineGuard.then(fn, fn)
  engineGuard = next.catch(() => undefined)
  return next
}
let engineSeq = 0

/**
 * MOD-20: waits for this session's turn at the engine suite. Two engine gates at once blow the
 * engine's per-test timeout, so a verifier takes `delegation.engineGate` before its
 * `claude plugin test` and clears it after; another verifier's live lock is waited for, a poll at a
 * time. The lock expires after the gate's own timeout, so a crashed holder never wedges the rest. A
 * store that cannot be read or written runs the gate without a turn rather than not at all.
 */
async function takeEngineTurn($: Host, label: string): Promise<{ line?: string; release: () => Promise<void> }> {
  const started = await now($)
  const token = `${label}#${started}#${(engineSeq += 1)}`
  let holder: string | undefined
  try {
    for (;;) {
      const t = await now($)
      const d = await alone(async () => {
        const decision = engineLockDecision(readEngineLock(await $.store.get(K.engineGate)), t, token)
        if (decision.take) await $.store.set(K.engineGate, { holder: label, token, since: t, until: t + GATE_TIMEOUT_MS } satisfies EngineLock)
        return decision
      })
      if (d.take) break
      holder = d.holder
      await $.clock.sleep(d.waitMs)
    }
  } catch (err) {
    debug($, `${label}: engine gate turn not taken (${String(err)}); the gate runs without it`)
    return { release: async () => undefined }
  }
  const release = async () => {
    try {
      if (readEngineLock(await $.store.get(K.engineGate))?.token === token) await $.store.delete(K.engineGate)
    } catch (err) {
      debug($, `${label}: engine gate turn not released (${String(err)}); it expires on its own`)
    }
  }
  return holder === undefined ? { release } : { line: waitedLine((await now($)) - started, holder), release }
}

// ---- MOD-22: research cards, the folders outside the repo ----------------------------------
/** A root with more files than this is not listed (the claim is left unchecked): the listing lives in the store. */
const OUTSIDE_MAX_ENTRIES = 10000

const isEnoent = (err: unknown): boolean => /ENOENT/.test(String(err))

/**
 * One root as a before-and-after listing: every file under it as (relative path, size, mtime), folders
 * walked and links not followed. A root that is not there yet lists as empty; a root that is a file is
 * itself the one entry (path ''); a root that cannot be read, or holds too many files, says why.
 */
async function listRoot($: Host, root: string): Promise<RootListing> {
  let kind: string
  let st: { size: number; mtimeMs: number }
  try {
    const got = await $.fs.stat(root)
    kind = got.kind
    st = got
  } catch (err) {
    return isEnoent(err) ? { root, entries: [] } : { root, error: String(err).slice(0, 160) }
  }
  if (kind === 'file') return { root, entries: [{ path: '', size: st.size, mtimeMs: st.mtimeMs }] }
  if (kind !== 'dir') return { root, error: `${root} is neither a folder nor a file` }
  const entries: { path: string; size: number; mtimeMs: number }[] = []
  const walk = async (dir: string, rel: string): Promise<string | undefined> => {
    let listed: { name: string; kind: string; size: number; mtimeMs: number; isLink: boolean }[]
    try {
      listed = await $.fs.list(dir)
    } catch (err) {
      return String(err).slice(0, 160)
    }
    for (const e of listed) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`
      if (e.kind === 'dir' && !e.isLink) {
        const why = await walk(`${dir}/${e.name}`, path)
        if (why !== undefined) return why
      } else {
        entries.push({ path, size: e.size, mtimeMs: e.mtimeMs })
        if (entries.length > OUTSIDE_MAX_ENTRIES) return `more than ${OUTSIDE_MAX_ENTRIES} files`
      }
    }
    return undefined
  }
  const why = await walk(root, '')
  return why === undefined ? { root, entries } : { root, error: why }
}

/** What is at an artefact path: missing, or its size (a folder: its entry count). */
async function statArtefact($: Host, path: string): Promise<ArtefactStat> {
  try {
    const st = await $.fs.stat(path)
    if (st.kind === 'dir') return { exists: true, size: (await $.fs.list(path)).length, isDir: true }
    return { exists: true, size: st.size }
  } catch (err) {
    return isEnoent(err) ? { exists: false } : { exists: false, error: String(err).slice(0, 160) }
  }
}

/** The listings /dispatch took of a task's absolute roots, with a way to list them again; undefined when none were taken. */
async function outsideFor($: Host, task: string | undefined): Promise<OutsideInput | undefined> {
  if (!task) return undefined
  const saved = await storeGet<{ roots?: RootListing[] }>($, K.outside(task))
  return Array.isArray(saved?.roots) ? { before: saved.roots, list: root => listRoot($, root) } : undefined
}

/** The system temp dir (TMPDIR), or '' when the environment has none. */
async function tmpDirOf($: Host): Promise<string> {
  try {
    return (await $.env.get('TMPDIR')) ?? ''
  } catch {
    return ''
  }
}

/**
 * At /dispatch: lists every absolute scope and forbid root of the brief and stores the listings for the
 * verifier to compare. A brief that was reused keeps the listing it has, so the delta stays cumulative
 * across attempts. Returns what to say about it, or undefined when the brief names no outside root.
 */
async function recordOutside($: Host, task: string, briefPath: string, reused: boolean): Promise<string | undefined> {
  const text = await readText($, briefPath)
  const contract = text !== undefined ? briefContract(text) : undefined
  if (!contract || !contract.ok) return undefined
  const roots = outsideRoots(contract.scope.filter(isAbsolute), contract.forbid.filter(isAbsolute))
  if (roots.length === 0) return undefined
  if (reused && (await storeGet<unknown>($, K.outside(task))) !== undefined) return `outside: the listing of ${roots.join(', ')} taken at the first dispatch stands`
  const listed: RootListing[] = []
  for (const root of roots) listed.push(await listRoot($, root))
  await storeSet($, K.outside(task), { at: await now($), briefPath, roots: listed })
  const files = listed.reduce((n, l) => n + ('entries' in l ? l.entries.length : 0), 0)
  const bad = listed.filter((l): l is { root: string; error: string } => 'error' in l)
  return `outside: listed ${roots.join(', ')} before the run (${files} file${files === 1 ? '' : 's'})${bad.length > 0 ? `; ${bad.map(b => `${b.root} could not be listed: ${b.error}`).join('; ')}, so scope will be unchecked there` : ''}`
}

async function runVerify($: Host, spawn: SpawnRecord, block: string, text: string): Promise<VerifyResult> {
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
  if (header?.repo === 'none') return verifyNoRepo($, briefText, report, filesPath, amendLines, root, spawn.task)
  // GH-16: repo=here verifies the session's own checkout, shared with the brain and other workers
  const here = header?.repo === 'here'
  const repo = here ? root : await workerRepo($, spawn, header?.repo, root)
  const probed = await run($, workTreeArgv(repo), { cwd: root, timeoutMs: 15000 })
  if (!probed.ok || isNotWorkTree(probed)) return verifyNoRepo($, briefText, report, filesPath, amendLines, root, spawn.task)
  // GH-20: a red file must differ from every earlier attempt's of this task + subtask
  const priorRed = priorRedHashes(await loadAttempts($, spawn.task), spawn.subtask, spawn.attempt, laneOf(spawn))
  const others = here ? (await inFlightHere($, root, taskLabel(spawn.task, spawn.subtask))).map(c => ({ card: c.label, files: c.files })) : []
  const outside = await outsideFor($, spawn.task)
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
      ...(outside ? { outside } : {}),
    },
    { exec: (argv, init) => run($, [...argv], init), write: (path, t) => $.fs.write(path, t), readRed: path => readRed($, path), turn: () => takeEngineTurn($, taskLabel(spawn.task, spawn.subtask)), stat: path => statArtefact($, path) },
  )
  return { verdict: r.verdict, lines: [...amendLines, ...r.lines], ...(r.metrics ? { metrics: r.metrics } : {}), ...(r.red ? { red: r.red.path, ...(r.red.hash !== undefined ? { redHash: r.red.hash } : {}), ...(r.red.held ? { redHeld: true as const } : {}) } : {}) }
}

/**
 * Part 3A: a brief with `repo=none` (or a repo that is not a git work tree).
 * No branch, sha or diff to read: every `files=` path must exist under the
 * first scope root and lie in scope; the gate (map id, or a bare allowlisted
 * command such as `claude plugin validate <folder>`) must exit 0.
 */
async function verifyNoRepo($: Host, briefText: string, report: ReturnType<typeof parseReport>, filesPath: string, amendLines: string[], root: string, task?: string): Promise<VerifyResult> {
  const contract = briefContract(briefText)
  if (!contract.ok) return { verdict: 'refused', lines: [...amendLines, contract.line], noRepo: true }
  // GH-103: a prose scope= gives no root to check files under; the work stands, unverified
  if (contract.scopeProse) return { verdict: 'unverified', lines: [...amendLines, ...contract.lines, 'claim scope: unchecked — scope= reads as prose; add scope_globs= to the brief to check it'], noRepo: true }
  const first = contract.scope[0]
  const scopeRoot = first ? (first.startsWith('/') ? globRoot(first) : `${root}/${globRoot(first)}`.replace(/\/+$/, '')) : root
  const sc = scopeCheck({ files: reportFiles(report.files), root: scopeRoot, scope: globList(contract.scope.join(',')), forbid: globList(contract.forbid.join(',')) })
  const present: string[] = []
  const missingFiles: string[] = []
  for (const p of sc.inScope) (await exists($, p)) ? present.push(p) : missingFiles.push(p)
  // MOD-22: the outside delta (the same claim a repo=here brief gets), the artefacts and the metrics
  const absScope = contract.scope.filter(isAbsolute)
  const absForbid = contract.forbid.filter(isAbsolute)
  const watched = outsideRoots(absScope, absForbid)
  const baseline = await outsideFor($, task)
  const outside = await outsideCheck(absScope, absForbid, baseline)
  const artefacts = await artefactsCheck(reportArtefacts(report.artefacts), contract.outdir ?? scopeRoot, path => statArtefact($, path))
  const metrics = reportMetrics(report.metrics)
  const gates = resolveGateRuns(contract.gate, cfg.gateMap, argv => checkArgv(argv, allowCfg()).ok, filesPath, scopeRoot, contract.outdir)
  const outcomes: { label: string; exitCode?: number; error?: string }[] = []
  const waits: string[] = []
  for (const g of gates.runs) {
    // MOD-20: an engine gate takes its turn here too
    const turn = isEngineGate(g.argv) ? await takeEngineTurn($, taskLabel(report.task ?? 'no-repo', report.subtask ?? 'main')) : undefined
    if (turn?.line) waits.push(turn.line)
    let r: RunOut
    try {
      r = await run($, g.argv, { cwd: scopeRoot, timeoutMs: GATE_TIMEOUT_MS })
    } finally {
      await turn?.release()
    }
    outcomes.push(r.ok ? { label: g.label, exitCode: r.exitCode } : { label: g.label, error: r.why })
    if (r.ok && r.exitCode !== 0) break
  }
  const v = noRepoVerdict({
    root: scopeRoot,
    files: present,
    missing: missingFiles,
    outOfScope: sc.outOfScope,
    forbidden: sc.forbidden,
    gates: outcomes,
    notRerun: gates.notRerun.map(n => (n.why.includes('{outdir}') ? `${n.id} (${n.why})` : n.id)),
    noGate: gates.none === true,
    ...(outside ? { outside } : {}),
    ...(artefacts ? { artefacts } : {}),
    metrics,
  })
  const note = watched.length > 0 && baseline === undefined ? [`note: outside delta not checked: no listing of ${watched.join(', ')} was taken at dispatch`] : []
  return { verdict: v.verdict, lines: [...amendLines, ...contract.lines, ...waits, ...v.lines, ...note], noRepo: true, ...(Object.keys(metrics).length > 0 ? { metrics } : {}) }
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
    return [...lines, `note: amend not appended to ${briefPath}: ${String(err)}; checked against the brief as it was`, ...heldLines]
  }
  return [...lines, ...apply.map(amendedLine), ...heldLines]
}

type Measured = { tokens?: number; model?: string }

/**
 * GH-1 item 2: an ad hoc spawn with no header and no brief file (or an
 * Agent result the spawn hook never saw). Its `[[report]]`, when it hands one
 * back, is checked cardlessly.
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
async function runCardless($: Host, spawn: SpawnRecord, report: ReturnType<typeof parseReport>): Promise<VerifyResult> {
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
  // MOD-21: a reviewer's hand-back is read for its [[review]] block, not checked as a worker's report
  if (spawnIn.review) return finalizeReview($, spawnIn, text, measured)
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
  let metrics: Record<string, string> | undefined
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
    metrics = v.metrics
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
      ...(await ownerFields($)),
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
        // MOD-22: the report's metrics=, recorded on the attempt and never judged
        ...(metrics ? { metrics } : {}),
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
      // MOD-21: a consistent verdict is followed by a reviewer when the option says so; a repo=none brief and a replay have no diff to read
      review: reviewDue(cfg.review, spawn.tier) && !noRepo && !spawn.replay,
    })
  }
  // GH-104: a resume or a respawn looks at the worker's worktree first: finished work there is judged, not redone
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
  // MOD-21: the reviewer's spawn block rides under the row as a respawn's does; a review that cannot be set up is next=accept, with the reason
  let reviewBlock: string | undefined
  if (advice.kind === 'review') {
    const built = await prepareReview($, spawn, { block: block ?? '', sha: report?.sha?.trim() ?? '', branch: report?.branch?.trim() ?? '', text })
    if ('block' in built) reviewBlock = built.block
    else {
      advice = { kind: 'accept', next: 'accept' }
      lines = [...lines, `note: review not run — ${built.why}`]
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
  }
  // MOD-12: a respawn is advice, autoEscalate or not: the verdict carries the next spawn block and the brain makes it
  let respawn: string | undefined
  if (advice.kind === 'respawn' && !spawn.adhoc && spawn.briefPath) {
    // the worktree was looked at above (no work present): not again
    const prepared = await prepareSpawn($, { briefPath: spawn.briefPath, subagentType: spawn.subagentType, ...(spawn.cwd ? { cwd: spawn.cwd } : {}), looked: true })
    respawn = 'deny' in prepared ? (isQueuedDeny(prepared.deny) ? `respawn ${prepared.deny}` : `respawn not prepared: ${prepared.deny}`) : spawnBlock(prepared.call)
  }

  const shownVerdict = noRepo ? `${verdict} (no repo)` : verdict
  // GH-104: work present rides under the verdict line in both forms
  const workLine = work ? workPresentLine(work) : undefined
  const verdictRows = contextBlock(verdictLine({ verdict: shownVerdict as Verdict, task: shownLabel, attempt: shownAttempt, budget: spawn.budget, usd, usdApprox, model, next }), workLine ? [workLine, ...lines] : lines)
  const spawnText = respawn ?? reviewBlock
  const full = spawnText ? `${verdictRows}\n${spawnText}` : verdictRows
  const quiet = quietLine({ task: shownLabel, attempt: shownAttempt, budget: spawn.budget, verdict, ...(noRepo ? { noRepo } : {}), ...(report?.gate ? { reportGate: report.gate } : {}), alias: spawn.alias, ...(usd !== undefined ? { usd, usdApprox } : {}), next, lines })
  const line = [quiet, ...(workLine ? [workLine] : []), ...(spawnText ? [spawnText] : [])].join('\n')
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn
  await storeSet($, K.spawn(spawn.key), { ...latest, verdictAttempt: spawn.attempt, lastFailed: spawn.lastFailed, verdictBlock: full, verdictLine: line })
  await setWorkers($, list => list.map(w => (w.task === spawn.task && w.subtask === spawn.subtask && w.attempt === spawn.attempt ? { ...w, verdict } : w)))
  await setLastVerdict($, { task: shownLabel, attempt: shownAttempt, verdict, next, at: t, text: full })
  // a cardless hand-back is posted, kept and ledgered like any other (GH-1 item 2)
  if (!spawn.adhoc || cardless) {
    const owed = OWED_KINDS.includes(advice.kind) && !performed ? `${shownLabel}: ${shortNext(next)}` : undefined
    await noteRecent($, { task: shownLabel, attempt: shownAttempt, verdict, line: quiet, at: t, ...(owed ? { owed } : {}), ...(report?.pr ? { pr: report.pr } : {}), ...(report?.sha ? { sha: report.sha } : {}), ...(spawn.key.includes('-rejudge-') ? { rejudge: true } : {}) })
    if (verdict === 'refuted') void noteFriction($, { kind: 'refuted', detail: line, at: t })
    await appendLedger($, { ...(judged ?? { task: spawn.task, subtask: spawn.subtask, attempt: spawn.attempt }), verdict, noRepo: noRepo || undefined, next: shortNext(next), sessionId: await sessionIdOf($) })
  }
  return { full, line }
}

/**
 * MOD-21: a reviewer's hand-back. The `[[review]]` block is read (the last well-formed one): nothing refuted, or no
 * usable block, is next=accept (the review never blocks on its own failure); refuted rows are quoted as the resume the
 * worker is owed. The reviewer's attempt keeps the counts; so do the row and the ledger line. The worker's own record
 * and budget are untouched here: a resume that follows is the worker's next attempt, and the brain or autoEscalate sends it.
 */
async function finalizeReview($: Host, spawn: SpawnRecord, text: string, measured: Measured): Promise<Rendered> {
  if (spawn.verdictAttempt === spawn.attempt && spawn.verdictBlock) return renderedOf(spawn)
  const stored = await storeGet<SpawnRecord>($, K.spawn(spawn.key))
  if (stored && stored.verdictAttempt === stored.attempt && stored.verdictBlock) return renderedOf(stored)
  const label = taskLabel(spawn.task, spawn.subtask)
  const lane = laneOf(spawn)
  const t = await now($)
  const own = spawn.agentId ? await workerCost($, spawn.agentId, spawn.attempt) : undefined
  const usdNow = own && own.usd !== null ? undefined : await sessionUsd($)
  const usdApprox = !(own && own.usd !== null) && usdNow !== undefined && spawn.usdAtStart !== undefined
  const usd = own && own.usd !== null ? round4(own.usd) : usdNow !== undefined && spawn.usdAtStart !== undefined ? round4(usdNow - spawn.usdAtStart) : undefined
  const model = measured.model ?? spawn.resolvedModel

  const counts = parseReviewBlock(text, spawn.task)
  const rows = counts && counts.refuted > 0 ? refutedRows(text) : []
  const shown = shownRefuted(counts, rows, text)
  const before = await loadAttempts($, spawn.task)
  const worker = spawn.review?.worker ? await spawnByAgent($, spawn.review.worker) : undefined
  const advice = reviewAdvice({ counts, refuted: rows, ...(worker?.agentId ? { agentId: worker.agentId } : {}), attempts: attemptsFor(before, spawn.subtask, lane).length, budget: spawn.budget, label })

  const records = patchReview(before, spawn.key, {
    verdict: 'reviewed',
    verdictAt: t,
    ...(counts ? { review: { confirmed: counts.confirmed, refuted: counts.refuted, unverifiable: counts.unverifiable } } : {}),
    ...(usd !== undefined ? { usd } : {}),
    ...(usd !== undefined && usdApprox ? { usdApprox: true as const } : {}),
    ...(measured.tokens !== undefined ? { tokens: measured.tokens } : {}),
    ...(model !== undefined ? { resolvedModel: model } : {}),
  })
  await storeSet($, K.tasks(spawn.task), records)
  const judged = records.find(r => r.kind === 'review' && r.toolUseId === spawn.key)

  let next = advice.next
  let performed = false
  if (advice.kind === 'resume' && worker) {
    // the worker's next message is its resume: a message after a failing verdict is the one the session.send hook records
    await storeSet($, K.spawn(worker.key), { ...worker, lastFailed: true })
    if (cfg.autoEscalate && worker.agentId) {
      let sent: { isDelivered: boolean; reason?: string }
      try {
        sent = await $.session.send({ to: { agentId: worker.agentId }, text: reviewResumeText({ label, attempt: spawn.attempt, budget: spawn.budget, refuted: rows, said: text }) })
      } catch (err) {
        sent = { isDelivered: false, reason: String(err) }
      }
      performed = sent.isDelivered
      next = sent.isDelivered ? `resumed agent=${worker.agentId} (autoEscalate)` : `${advice.next} (autoEscalate could not deliver: ${sent.reason})`
    }
  }

  const long = [reviewVerdictLine({ task: label, attempt: spawn.attempt, budget: spawn.budget, counts, usd, usdApprox, model, next }), reviewClause(counts), ...shown].join('\n')
  const quiet = reviewLine({ task: label, attempt: spawn.attempt, budget: spawn.budget, alias: spawn.alias, ...(usd !== undefined ? { usd, usdApprox } : {}), counts, next })
  const line = [quiet, ...shown].join('\n')
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn
  await storeSet($, K.spawn(spawn.key), { ...latest, verdictAttempt: spawn.attempt, lastFailed: false, verdictBlock: long, verdictLine: line })
  await setLastVerdict($, { task: label, attempt: spawn.attempt, verdict: 'reviewed', next, at: t, text: long })
  const owed = OWED_KINDS.includes(advice.kind) && !performed ? `${label}: ${shortNext(next)}` : undefined
  await noteRecent($, { task: label, attempt: spawn.attempt, verdict: 'reviewed', line: quiet, at: t, ...(owed ? { owed } : {}) })
  if (counts && counts.refuted > 0) void noteFriction($, { kind: 'refuted', detail: quiet, at: t })
  await appendLedger($, { ...(judged ?? { task: spawn.task, subtask: spawn.subtask, attempt: spawn.attempt, kind: 'review' }), verdict: 'reviewed', next: shortNext(next), sessionId: await sessionIdOf($) })
  return { full: long, line }
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
 *
 * MOD-22: a card that says `repo: none` dispatches with no worktree, no fetch
 * and no git: the brief says `repo=none` and the worker runs in the root.
 * Scope and forbid may hold absolute paths and globs (a leading `~` is the home
 * folder); the first absolute scope entry is the outdir unless the card names
 * `outdir:`; the header gains `outdir=` and `scratch=`; and every absolute scope
 * and forbid root is listed (`recordOutside`) for the verifier's outside delta.
 *
 * MOD-12 (#22): no door spawns. The result ends with the spawn block, the
 * Agent call the brain makes; the spawn hook then shapes and records it, and
 * the engine shows the mod that worker's tool calls and turns.
 */
async function runDispatch($: Host, parsed: DispatchArgs): Promise<string> {
  // MOD-12: nothing drains here; the slot check reads the live workers, and a queued task is the brain's to spawn
  return dispatchOnce($, parsed)
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

  // MOD-34: the domain's lessons file beside the cards, carried into a brief written now; the line is printed whether or not a brief is written
  const lessonsAt = lessonsPath(root, cfg.cardDir, card.domain)
  const lessonsText = await readText($, lessonsAt)
  const lessons = lessonsText !== undefined && lessonLineCount(lessonsText) > 0 ? { text: lessonsText, path: lessonsAt } : undefined

  // An existing brief is reused, never overwritten, and it decides the mode.
  const fileName = briefFileName(id, replay)
  const reuse = await existingBrief($, root, fileName)
  const reusedText = reuse ? await readText($, reuse) : undefined
  const reusedHeader = reusedText !== undefined ? parseHeader(reusedText) : undefined
  const wantHere = !replay && (parsed.here === true || card.repo === 'here')
  // MOD-22: `repo: none` is the third mode (no worktree, no git); --here beats it, and a reused brief decides
  const wantNone = !replay && !wantHere && card.repo === 'none'
  const here = !replay && (reusedHeader ? reusedHeader.repo === 'here' : wantHere)
  const none = !replay && (reusedHeader ? reusedHeader.repo === 'none' : wantNone)
  const mode: BriefMode = here ? 'here' : none ? 'none' : 'worktree'
  // MOD-2: no base named, a reused worktree brief that carries one: the cut point is that base, the verifier's base too
  const reusedBase = (reusedHeader?.fields.base ?? '').trim()
  if (!replay && !here && base === 'origin/main' && reusedBase && isGitRef(reusedBase)) base = reusedBase

  const worktree = here || none ? root : worktreePath(root, id, replay, cfg.worktreeRoot)
  let branch = none ? 'none' : branchName(card.domain, id, replay)
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
  if (replay && (card.repo === 'here' || card.repo === 'none')) out.push(`   note: the card says repo: ${card.repo}; a replay works in its own worktree at the base`)

  // GH-16: the other repo=here cards in flight in this checkout; a scope overlapping theirs is refused.
  // MOD-24: a shared resource is not overlap: both cards do not touch the same paths, and the queue sequences them (the
  // second waits for the resource and is ready when the first hands back), so a dispatch that shares only one goes on.
  const inflight = here ? await inFlightHere($, root, id) : []
  if (here) {
    const reusedContract = reusedText !== undefined ? briefContract(reusedText) : undefined
    const mine = reusedContract !== undefined && reusedContract.ok ? reusedContract.scope : [...(scope ?? card.scope)]
    const overlaps = inflight.flatMap(c => {
      const pair = scopeOverlap(mine, c.scope)
      return pair ? [{ card: c.label, ...pair }] : []
    })
    if (overlaps.length > 0 && parsed.forceOverlap !== true) {
      return [...out, ...overlaps.map(o => overlapRefusal(id, o.mine, o.card, o.theirs))].join('\n')
    }
    for (const o of overlaps) out.push(`   ${overlapWarning(id, o.mine, o.card, o.theirs)}`)
  }

  const tier: Tier = tierOf(card.tier) ?? 'standard'
  const alias = finalAlias({ tier, source: 'brief' }, cfg.tierMap[tier]).alias
  const budget = budgetAttempts(card.budget, cfg.defaultBudget)
  // GH-106: the card's spend: wins, else the tier's default; 0 is no ceiling
  const spend = spendCeiling(card.spend, tier, cfg.spendByTier)
  // MOD-22: scope and forbid may hold absolute paths and globs, a leading ~ the home folder; the first absolute scope entry is the outdir
  const home = await homeOf($)
  const expandAll = (list: readonly string[]): string[] => list.map(e => expandTilde(e, home))
  const headScope = expandAll(scope ?? card.scope)
  const headForbid = expandAll(forbid ?? card.forbid)
  const outdir = outdirOf(headScope, card.outdir ? expandTilde(card.outdir, home) : undefined)
  // scratch= is written for a card that has an output folder, names a scratch folder, or shares or has no repo (a worktree card's header stays as it was)
  const scratch = outdir !== undefined || here || none || card.scratch ? (card.scratch ? expandTilde(card.scratch, home) : defaultScratch(await tmpDirOf($), id)) : undefined
  const folders = { ...(outdir ? { outdir } : {}), ...(scratch ? { scratch } : {}) }
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
    header = renderHeader({ card, tier, alias, budget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, repo: 'here', ...(hereBase ? { base: hereBase } : {}), ignore, ...folders })
  } else if (none && !reuse) {
    header = renderHeader({ card, tier, alias, budget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, repo: 'none', ...folders })
  } else {
    // GH-105: a base that is not the default is written, so the verifier diffs from the commit the worktree was cut from
    header = renderHeader({ card, tier, alias, budget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, ...(base !== 'origin/main' ? { base } : {}), ...folders })
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
    if ((here !== wantHere || none !== wantNone) && !replay) out.push(`   note: the reused brief is ${here ? 'repo=here' : none ? 'repo=none' : 'a worktree brief'}, so it decides the mode (remove it to re-render)`)
  } else {
    // MOD-28: the mod's own template is the copy read at load; a template the repo names (briefTemplate) is the repo's file, read now
    let template: string
    let templateAt: string
    if (cfg.briefTemplate) {
      templateAt = cfg.briefTemplate
      try {
        template = await $.fs.read(cfg.briefTemplate)
      } catch (err) {
        return [...out, `/dispatch ${id}: the brief template could not be read: ${String(err)}`].join('\n')
      }
    } else {
      const loaded = await loadedTemplates($)
      templateAt = templatePath(loaded.root, 'brief.md')
      const text = loaded.text.get('brief.md')
      if (text === undefined) return [...out, `/dispatch ${id}: the brief template could not be read: ${loaded.failed.get('brief.md') ?? 'not loaded'} (it failed to load when the mod started: ${templateAt})`].join('\n')
      template = text
    }
    let rootNames: string[] = []
    try {
      rootNames = (await $.fs.list(root)).map(e => e.name)
    } catch {
      rootNames = []
    }
    // MOD-22: the report line gains artefacts= and metrics= for a card that has an output folder
    const reportExtra = outdir ? ' artefacts=<comma list of the files you delivered, relative to the output folder or absolute> metrics="<k=v,k=v>"' : ''
    const rendered = renderBriefChecked(template, { card, ...(lessons !== undefined ? { lessons } : {}), worktree, branch, cardPath, install: installStep(rootNames), extra: cfg.briefExtra, mode, spend, ...(outdir ? { outdir } : {}), ...(scratch ? { scratch } : {}), reportExtra })
    // MOD-28: a brief with a marker left in it never reaches a worker; nothing is written, no worktree is made
    if (rendered.leftover !== undefined) return [...out, unrenderedRefusal(id, rendered.leftover, templateAt)].join('\n')
    const written = await writeBrief($, root, fileName, `${header}\n\n${rendered.text}`)
    if ('error' in written) return [...out, `/dispatch ${id}: ${written.error}`].join('\n')
    briefPath = written.path
    out.push(`2. brief ${briefPath} written (tier=${tier}, model=${alias}, budget=${budget}-attempts${here ? ', repo=here' : none ? ', repo=none' : ''})`)
  }
  if (lessons !== undefined) {
    const n = lessonLineCount(lessons.text)
    out.push(`   note: lessons: ${n} lines from ${lessons.path}`)
    if (n > LESSONS_CAP) out.push(`   ${lessonsCapWarning(card.domain, n, lessons.path)}`)
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
  // MOD-29: a forbid glob that can match a scope entry or a path the done-when names is said once per collision (nothing is refused)
  for (const line of forbidCollisions((shownHeader?.fields.scope ?? '').split(',').filter(Boolean), shownForbid, doneWhenOf(card.body))) {
    out.push(`   ${line}`)
  }
  if (here) {
    const f: Record<string, string> = shownHeader?.fields ?? {}
    out.push(`   repo=here: base=${f.base || 'the chain (origin/main, main, origin/master, master)'} · ignore=${f.ignore || '(none)'}`)
  }
  if (shownHeader?.fields.outdir) out.push(`   research card: outdir=${shownHeader.fields.outdir} · scratch=${shownHeader.fields.scratch || '(none)'}`)
  const heldNames = resourcesOf(shownHeader)
  if (heldNames.length > 0) out.push(`   resources: ${heldNames.join(', ')} (held while the worker runs; another card naming one waits in the queue)`)
  if (dryRun) return [...out, '', shown].join('\n')
  // MOD-13: the card's own effort: (it wins over effortByTier for this task's workers); cleared when the card has none
  await storeSet($, K.effort(id), typeof card.fields.effort === 'string' ? card.fields.effort.trim() : '')

  // GH-103: a prose scope with no globs is caught here, before the worktree and the spawn
  const shownScope = (shownHeader?.fields.scope ?? '').split(',').filter(Boolean)
  if (!scope && !shownHeader?.fields.scope_globs && scopeLooksProse(shownScope)) {
    return [...out, '', shown, '', `scope: ${shownScope.join(', ')}`, '', PROSE_SCOPE_STOP].join('\n')
  }

  // MOD-22: the absolute scope and forbid roots are listed now; the verifier lists them again at hand-back
  const listedOutside = await recordOutside($, id, briefPath, reuse !== undefined)
  if (listedOutside) out.push(`   ${listedOutside}`)

  if (here) out.push(`3. no worktree (repo=here): the worker shares ${root}`)
  else if (none) out.push(`3. no worktree (repo=none): the worker runs in ${root} and writes outside the repo`)
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
  // MOD-12: the brain's Agent call names no folder; the spawn hook sets the worker here (repo=here: `worktree` is the root itself)
  await storeSet($, K.handoff(briefPath), { cwd: worktree, at: await now($) })
  const place = here ? `repo=here in ${root}` : none ? `repo=none in ${root}` : `worktree ${worktree}`
  // MOD-12 (#22): no spawn here. The checks the spawn hook makes, then the call for the brain to make.
  const prepared = await prepareSpawn($, { briefPath, subagentType, cwd: worktree })
  if ('deny' in prepared) {
    if (!isQueuedDeny(prepared.deny)) return [...out, `4. spawn refused: ${prepared.deny}`].join('\n')
    // the scheduler (2F) holds it; the mod says ready when a slot frees, and the brain makes the spawn
    const at = queuedIndex(await readQueue($), id, 'main')
    out.push(`4. ${prepared.deny}`)
    out.push(`brief ${briefPath} · ${place} · branch ${branch} · ${queuedText(at >= 0 ? at + 1 : 1)}`)
    return out.join('\n')
  }
  // GH-104: the line says what the spawn spends: the model and the attempt of the budget
  out.push(`4. spawn prepared: ${subagentType} on ${prepared.alias} · tier=${prepared.tier} (${prepared.source}) · attempt ${prepared.attempt}/${prepared.budget} — nothing runs until the Agent call below is made`)
  out.push(`brief ${briefPath} · ${place} · branch ${branch} · tier=${prepared.tier} → ${prepared.alias}`)
  out.push('', spawnBlock(prepared.call))
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
      ...(await ownerFields($)),
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
 *
 * MOD-23: with `lanes` it writes one card per lane (sequential ids, the shared
 * fields, each lane its own scope), all or none; the dry run prints every lane's
 * summary and header, and `dispatch: true` dispatches each lane in order (the
 * lanes that hold one resource then run one at a time, the queue seeing to it).
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
  const made = cardsFromFields(input, { domains: cfg.domains, gateIds: Object.keys(cfg.gateMap), names, spendByTier: cfg.spendByTier, here })
  if ('error' in made) return `card refused: ${made.error}`
  // all or none: every lane's file is checked before the first is written
  for (const c of made) {
    const path = `${dir}/${c.file}`
    if (names.includes(c.file) || (await exists($, path))) return `card refused: ${path} exists; cards are never overwritten`
  }
  const wrote: string[] = []
  for (const c of made) {
    const path = `${dir}/${c.file}`
    try {
      await $.fs.write(path, c.text)
    } catch (err) {
      return [...wrote, `card not written: ${path}: ${String(err)}`].join('\n')
    }
    wrote.push(`wrote ${path}`)
  }
  // MOD-22: dispatch reads the mode from the card (`repo:`); here is passed only when the card says repo: here
  const dispatchArgs = (c: NewCard, dryRun: boolean): DispatchArgs => ({ id: c.id, dryRun, base: 'origin/main', ...(c.repo === 'here' ? { here: true as const } : {}) })
  if (input.dispatch === true) {
    if (made.length === 1) return [...wrote, await runDispatch($, dispatchArgs(made[0] as NewCard, false))].join('\n')
    const results: string[] = []
    for (const c of made) results.push(`--- ${c.id} ---`, await runDispatch($, dispatchArgs(c, false)))
    return [...wrote, ...results].join('\n')
  }
  const shown: string[] = []
  const shownIds: string[] = []
  for (const c of made) {
    const dry = await runDispatch($, dispatchArgs(c, true))
    const lines = dry.split('\n')
    const header = lines.at(-1) ?? ''
    if (!header.startsWith('[[brief ')) {
      // the dry run stopped before a header (a refusal): say so for this card, and carry on to the others
      shown.push(dry)
      continue
    }
    const alias = finalAlias({ tier: c.tier, source: 'brief' }, cfg.tierMap[c.tier]).alias
    const notes = lines.filter(l => /^\s+(note|warning):/.test(l)).map(l => l.trim())
    // GH-114: one classifier call per card written, on the dry run only
    let second: string | undefined
    if (cfg.classifierSecondOpinion) {
      try {
        const said = await $.model.classify(classifierText(c.text), CLASSIFIER_LABELS)
        if ((CLASSIFIER_LABELS as readonly string[]).includes(said ?? '')) {
          await storeSet($, K.classifier(c.id), { card: c.tier, classifier: said })
          second = said === c.tier ? `card says ${c.tier} · classifier agrees` : `card says ${c.tier} · classifier says ${said}`
        }
      } catch (err) {
        debug($, `classifier second opinion failed: ${String(err)}`)
      }
    }
    shown.push([cardSummary(c, alias), ...(second ? [second] : []), '', '```', header, '```', ...(notes.length > 0 ? ['', ...notes] : [])].join('\n'))
    shownIds.push(c.id)
  }
  // a dry run that showed no header for the only card is its own answer, as it was before lanes
  if (shownIds.length === 0) return [...wrote, ...shown].join('\n')
  return [...wrote, ...shown.flatMap((block, i) => (i === 0 ? [block] : ['', block])), '', sayGo(shownIds)].join('\n')
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
    ...(await codeSkewLines($)),
    ...(await updateStatusLines($)),
    ...(cfg.issueRepo ? [`issues: ${cfg.issueRepo}${cfg.issueRepoOwn ? " (the mod's own tracker)" : ''}`, postModeLine(cfg.postFindings, cfg.issueRepo)] : []),
    `config: ${repoText == null ? `no ${REPO_CONFIG_FILE} in ${root} (built-in defaults + /config)` : `${root}/${REPO_CONFIG_FILE} + /config`}`,
    ...(repoText == null ? ['not set up here: run /delegation setup'] : []),
    `gate map: ${Object.keys(cfg.gateMap).length > 0 ? Object.entries(cfg.gateMap).map(([k, v]) => `${k} → ${v}`).join('; ') : '(empty: gates are reported "not re-run")'}`,
    `tiers: ${(['economy', 'standard', 'frontier'] as const).map(t => `${t}→${cfg.tierMap[t]}`).join(', ')} · max workers ${cfg.maxWorkers} · git guard ${cfg.gitGuard ? `on (${cfg.guardBranches.join(', ')})` : 'off'} · eval ${cfg.autoEval ? 'on' : 'off'}`,
    effortText(cfg.effortByTier),
    ...(cfg.review !== 'off' ? [`review: ${cfg.review} · ${cfg.reviewTier ? `reviewer at ${cfg.reviewTier}` : "reviewer one tier below the worker's"}`] : []),
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

/** MOD-28: `code: running <old>, folder holds <new> …` when hooks/lib/version.ts on disk (read, not imported) names another version than the one running; none otherwise. */
async function codeSkewLines($: Host): Promise<string[]> {
  try {
    const root = $.plugin.root
    const line = codeSkewLine(MOD_VERSION, folderVersion(await readText($, `${root}/hooks/lib/version.ts`)), inDevMods(root, await homeOf($)))
    return line ? [line] : []
  } catch (err) {
    debug($, `code version check failed: ${String(err)}`)
    return []
  }
}

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
  // MOD-28: the folder now names a version other than the code this session runs (a merge moved it, or an earlier pull did)
  const skew = await codeSkewLines($)
  out.push(...skew)
  out.push(commits === 0 && skew.length === 0 ? `reload: nothing changed, nothing to reload.` : cls.reloadStory)
  return out.join('\n')
}

// ---- the spawn decision: tier, budget, slot, record, drift ------------------------------
/** What the spawn decision reads of an `agent.spawn` input (the hook's own, or one the mod builds). */
type SpawnEvent = { tool_use_id: string; prompt: string; description: string; subagentType: string; model?: string; cwd?: string; name?: string; /** MOD-15: the mod's own fallback spawn of a ready row: its record says so. */ fallback?: true }

/**
 * What a spawn's prompt says of its task, read once: the brief named (or the
 * inline header), the task, its budget and ceiling, the ladder so far, and the
 * folder its worker runs in (MOD-12: the brain's Agent call names none, so a
 * briefed spawn runs where /dispatch prepared it).
 */
type SpawnPlan = {
  key: string
  t: number
  named?: string
  briefText?: string
  header?: BriefHeader
  adhoc: boolean
  subagentType: string
  task: string
  subtask: string
  label: string
  budget: number
  /** The budget= as written (the brief file's, else the prompt's), for the warning. */
  budgetRaw?: string
  spend?: number
  /** MOD-23: the resources the brief names (the file's header wins over the prompt's). */
  resources: string[]
  lane?: Lane
  /** The task's attempts, less the cardless ones (GH-1 item 2: on the record, never on the ladder). */
  records: AttemptRecord[]
  prior: number
  cwd?: string
}

async function planSpawn($: Host, e: SpawnEvent): Promise<SpawnPlan> {
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
  const task = header?.task ?? `adhoc-${key.slice(-8)}`
  const subtask = header?.subtask ?? 'main'
  // GH-3: the brief file is where the budget is amended, so it wins over the prompt's copy.
  const fileHeader = briefText !== undefined ? parseHeader(briefText) : undefined
  const budgetRaw = fileHeader?.budget ?? header?.budget
  // A /dispatch --replay brief is named <id>.replay.brief.md; its base commit is in the store.
  const replay = !adhoc && named !== undefined && named.endsWith('.replay.brief.md')
  const lane: Lane | undefined = replay && named ? { replay: true, ...(await replayBase($, named)) } : undefined
  const records = adhoc ? [] : (await loadAttempts($, task)).filter(r => (r as HereRecord).adhoc !== true)
  // MOD-12: no folder on the call, a brief /dispatch prepared: its worktree (the root for repo=here)
  const cwd = e.cwd ?? (!adhoc && named ? (await storeGet<{ cwd?: string }>($, K.handoff(named)))?.cwd : undefined)
  return {
    key,
    t,
    ...(named ? { named } : {}),
    ...(briefText !== undefined ? { briefText } : {}),
    ...(header ? { header } : {}),
    adhoc,
    subagentType: e.subagentType || 'general-purpose',
    task,
    subtask,
    label: taskLabel(task, subtask),
    budget: parseBudget(budgetRaw, cfg.defaultBudget),
    ...(budgetRaw !== undefined ? { budgetRaw } : {}),
    // GH-106: the spend ceiling, read the same way
    ...(spendOf(fileHeader ?? header) !== undefined ? { spend: spendOf(fileHeader ?? header) } : {}),
    resources: resourcesOf(fileHeader ?? header),
    ...(lane ? { lane } : {}),
    records,
    prior: attemptsFor(records, subtask, lane).length,
    ...(cwd ? { cwd } : {}),
  }
}

/** The tier a plan spawns at, and its alias: the header's tier, one up after a refute, held after a no-report (GH-104). */
function pickFor(p: SpawnPlan, callerModel: string | undefined, classified?: string): { pick: TierPick; tier: Tier; alias: Alias; fableRewritten: boolean } {
  const pick = pickTier({
    hadHeader: p.header !== undefined,
    headerTier: p.header?.tier,
    callerModel,
    classified,
    escalateFrom: p.adhoc ? undefined : escalationSource(p.records, p.subtask, p.lane),
    holdAt: p.adhoc ? undefined : holdSource(p.records, p.subtask, p.lane),
  })
  const { alias, fableRewritten } = aliasFor(pick)
  return { pick, tier: fableRewritten ? 'frontier' : pick.tier, alias, fableRewritten }
}

/** MOD-12: the plan's last attempt when its worker still runs ($.agent.list): a second spawn of the brief is refused. */
async function runningAttempt($: Host, p: SpawnPlan): Promise<{ attempt: number; agentId: string } | undefined> {
  const last = attemptsFor(p.records, p.subtask, p.lane).at(-1)
  if (!last || last.verdict !== 'pending' || !last.agentId) return undefined
  const agentId = last.agentId
  return (await agentList($)).some(a => a.id === agentId && a.status === 'running') ? { attempt: last.attempt, agentId } : undefined
}

/**
 * The refusals a briefed spawn meets before it starts, in order, the same for
 * the spawn hook and for a dispatch preparing the spawn block (MOD-12: the
 * same one-line reasons at both doors): already running, budget spent, work
 * present in the worktree (GH-104), then the slot (2F), claimed by the hook,
 * only looked at by a dispatch. A refusal retrying cannot cure takes the task
 * out of the queue.
 */
async function gateSpawn($: Host, p: SpawnPlan, item: Omit<QueuedSpawn, 'task' | 'subtask' | 'at'>, claim: boolean, looked = false): Promise<{ token?: number } | { deny: string }> {
  if (p.adhoc) return {}
  const running = await runningAttempt($, p)
  if (running) return { deny: runningDeny(p.label, running) }
  if (p.prior >= p.budget) {
    const deny = budgetDenyMessage(p.label, p.prior, p.named)
    if (isFinalDeny(deny)) await dropQueued($, p.task, p.subtask)
    return { deny }
  }
  // GH-104: a respawn (an earlier attempt exists) looks at the worker's worktree first; finished work there is judged, not redone
  if (p.prior > 0 && !looked) {
    const fileHeader = p.briefText !== undefined ? parseHeader(p.briefText) : undefined
    const look: LookFor = { task: p.task, subtask: p.subtask, ...(p.cwd ? { cwd: p.cwd } : {}), ...(p.lane ? { replay: true, ...(p.lane.base ? { base: p.lane.base } : {}) } : {}) }
    const work = await workInWorktree($, look, fileHeader ?? p.header, p.records, p.lane)
    if (work) {
      const last = attemptsFor(p.records, p.subtask, p.lane).at(-1)
      await recordWorkPresent($, { task: p.task, subtask: p.subtask, tier: last?.tier ?? 'standard', alias: last?.alias ?? cfg.tierMap.standard, purpose: p.header?.purpose ?? 'build', ...(p.named ? { briefPath: p.named } : {}) }, work, p.lane)
      const deny = workPresentDeny(p.label, p.task, work)
      debug($, deny)
      await dropQueued($, p.task, p.subtask)
      return { deny }
    }
  }
  // 2F: a briefed spawn takes a worker slot or waits in the queue; an ad hoc one never waits.
  return claimSlot($, { ...item, ...(p.cwd ? { cwd: p.cwd } : {}), task: p.task, subtask: p.subtask, at: p.t }, p.label, claim, p.resources)
}

/**
 * The agent.spawn hook's whole decision, as one function. MOD-12 (#22): every
 * worker is the brain's own Agent call, so the engine raises this hook for it
 * and every other hook of the mod then sees the worker (the git guard, the
 * spend, the hand-back); a dispatch only prepares the call. The mod's own
 * runners (the debrief, the eval runner) still start through `spawnSelf`,
 * which calls this with `$.agent.spawn`: they need none of the hooks.
 * `start(alias, cwd)` starts the subagent on the alias the decision picked.
 */
async function decideSpawn($: Host, e: SpawnEvent, start: (alias: string, cwd?: string) => Promise<AgentSpawnResult>): Promise<AgentSpawnResult> {
  let token: number | undefined
  try {
    const p = await planSpawn($, e)
    const { t, key, named, header, adhoc, task, subtask, label, budget, spend, lane, records } = p
    // GH-1 item 6: a budget off the grammar falls back, and says so
    const budgetWarn = budgetWarning(p.budgetRaw, cfg.defaultBudget)
    if (budgetWarn) debug($, `${label}: ${budgetWarn}`)
    const tierWarn = tierWarning(header?.tier)
    if (tierWarn) debug($, `${label}: ${tierWarn}`)

    const gate = await gateSpawn($, p, { prompt: e.prompt, description: e.description, subagentType: p.subagentType, ...(e.model ? { model: e.model } : {}) }, true)
    if ('deny' in gate) return { deny: gate.deny }
    token = gate.token

    // GH-6: no brief file named, a header inline: the header is the brief.
    const inline = named === undefined && header !== undefined ? await inlineBrief($, e.prompt, header) : undefined
    const briefPath = named ?? (inline && 'path' in inline ? inline.path : undefined)
    const noBrief = inline && 'why' in inline ? inline.why : undefined
    if (inline && 'path' in inline) debug($, `${label}: inline header → brief ${inline.path}`)

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
    const { pick, tier, alias, fableRewritten } = pickFor(p, e.model, classified)
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
    debug($, tierPickLine(label, tier, pick, e.model, classify))
    if (fableAsked) debug($, `${label}: ${notice}`)
    // MOD-12: the brain's model is kept when it matches the tier; else the brief's tier decides, and the log says so
    if (!adhoc && e.model && aliasOf(e.model) !== alias) debug($, `${label}: the call asked for ${e.model}; tier=${tier} spawns ${alias}`)

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
    const res = await start(alias, p.cwd)
    if (res.deny !== undefined) return res
    // a debrief agent or an eval runner the mod started: its record learns the agent id here
    const pk = promptKey({ prompt: e.prompt, ...(e.cwd ? { cwd: e.cwd } : {}) })
    const started = runnerStarted.get(pk)
    if (started && res.agentId) {
      runnerStarted.delete(pk)
      await started(res.agentId)
    }
    // GH-101: a spawn of a queued task takes its queued place, now that it started
    if (!adhoc) {
      const held = await dropQueued($, task, subtask)
      if (held) $.ui.toast(`started queued ${label} (waited ${waitedMinutes(held.at, t)} min)`)
    }

    const classifierTier = !adhoc && attempt === 1 ? (await storeGet<{ classifier?: Tier }>($, K.classifier(task)))?.classifier : undefined
    const rec: HereRecord = {
      ...(await ownerFields($)),
      task,
      subtask,
      attempt,
      kind: 'spawn',
      lineage: attempt,
      tier,
      alias,
      source: e.fallback ? 'fallback' : pick.source,
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
      subagentType: p.subagentType,
      ...(p.cwd ? { cwd: p.cwd } : {}),
      ...(res.agentId ? { agentId: res.agentId } : {}),
      ...(res.model ? { resolvedModel: res.model } : {}),
      ...(usdAtStart !== undefined ? { usdAtStart } : {}),
      ...(spend !== undefined && !adhoc ? { spend } : {}),
      ...(p.resources.length > 0 && !adhoc ? { resources: p.resources } : {}),
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
    if (token !== undefined) {
      starting.delete(token)
      startingResources.delete(token)
    }
  }
}

/**
 * MOD-21: the agent.spawn hook's decision for a reviewer (a prompt that opens with its marker). Its tier is one below
 * the worker's, or reviewTier; it runs where the worker ran. It is recorded as an attempt of kind `review`, which is on
 * no ladder: no budget, no slot, no queue, no escalation. The brain's model hint gives way to the tier, as a worker's does.
 */
async function decideReview($: Host, e: SpawnEvent, marker: ReviewMarker, start: (alias: string, cwd?: string) => Promise<AgentSpawnResult>): Promise<AgentSpawnResult> {
  await loadRepoConfig($)
  const t = await now($)
  spawnSeq += 1
  const key = e.tool_use_id || `plugin-${t}-${spawnSeq}`
  const label = taskLabel(marker.task, marker.subtask)
  const worker = await spawnByAgent($, marker.worker)
  const lane = worker ? laneOf(worker) : undefined
  const before = await loadAttempts($, marker.task)
  const reviewed = attemptsFor(before, marker.subtask, lane).find(r => r.attempt === marker.attempt)
  const { tier, alias } = reviewerPick(worker?.tier ?? reviewed?.tier ?? 'standard', cfg.reviewTier || undefined, cfg.tierMap)
  try {
    $.ui.notice(e.tool_use_id, noticeText({ tier, source: 'review' }, alias, false))
  } catch {
    // no dialog to carry it
  }
  debug($, tierPickLine(`${label} review of attempt ${marker.attempt}`, tier, { tier, source: 'review' }, undefined, false))
  if (e.model && aliasOf(e.model) !== alias) debug($, `${label}: the review call asked for ${e.model}; tier=${tier} spawns ${alias}`)
  const cwd = e.cwd ?? worker?.cwd
  const usdAtStart = await sessionUsd($)
  const res = await start(alias, cwd)
  if (res.deny !== undefined) return res
  const briefPath = worker?.briefPath ?? reviewed?.briefPath
  const rec: AttemptRecord = {
    ...(await ownerFields($)),
    task: marker.task,
    subtask: marker.subtask,
    attempt: marker.attempt,
    kind: 'review',
    lineage: worker?.lineage ?? reviewed?.lineage ?? marker.attempt,
    tier,
    alias,
    source: 'review',
    ...(res.model ? { resolvedModel: res.model } : {}),
    verdict: 'pending',
    at: t,
    ...(res.agentId ? { agentId: res.agentId } : {}),
    toolUseId: key,
    ...(briefPath ? { briefPath } : {}),
    purpose: 'review',
    ...laneFields(lane),
  }
  await storeSet($, K.tasks(marker.task), [...(await loadAttempts($, marker.task)), rec])
  const spawn: SpawnRecord = {
    key,
    task: marker.task,
    subtask: marker.subtask,
    adhoc: false,
    attempt: marker.attempt,
    lineage: rec.lineage,
    tier,
    alias,
    budget: worker?.budget ?? cfg.defaultBudget,
    purpose: 'review',
    ...(briefPath ? { briefPath } : {}),
    prompt: e.prompt.slice(0, PROMPT_CAP),
    description: e.description,
    subagentType: e.subagentType,
    ...(cwd ? { cwd } : {}),
    ...(res.agentId ? { agentId: res.agentId } : {}),
    ...(res.model ? { resolvedModel: res.model } : {}),
    ...(usdAtStart !== undefined ? { usdAtStart } : {}),
    ...(lane ? { replay: true, ...(lane.base ? { base: lane.base } : {}) } : {}),
    at: t,
    review: { ...(marker.worker ? { worker: marker.worker } : {}), ...(marker.sha ? { sha: marker.sha } : {}) },
  }
  await storeSet($, K.spawn(key), spawn)
  if (res.agentId) await storeSet($, K.agent(res.agentId), key)
  if (res.agentId && e.name) await storeSet($, K.name(e.name), res.agentId)
  delegated = true
  await refreshStatus($)
  return res
}

/** What a hand-back may be quoted at in a reviewer's prompt. */
const HANDBACK_CAP = 6000

/**
 * MOD-21: the reviewer's spawn block for a consistent hand-back: hooks/templates/review.md filled in with the brief,
 * the tree, the sha, the base, the report and what the worker said, the model one tier below the worker's. A template
 * that cannot be read gives the reason instead (the verdict is then next=accept: a review never blocks on its own failure).
 */
async function prepareReview($: Host, spawn: SpawnRecord, input: { block: string; sha: string; branch: string; text: string }): Promise<{ block: string } | { why: string }> {
  // MOD-28: the review template as loaded with this code, never a fresh read of the folder
  const loaded = await loadedTemplates($)
  const template = loaded.text.get('review.md')
  if (template === undefined) return { why: `the review template could not be read: ${loaded.failed.get('review.md') ?? 'not loaded'} (it failed to load when the mod started)` }
  const root = (await $.session.root()).replace(/\/+$/, '')
  const briefText = spawn.briefPath ? await readText($, spawn.briefPath) : undefined
  const header = briefText !== undefined ? parseHeader(briefText) : undefined
  const briefBase = (header?.fields.base ?? '').trim()
  const base = (briefBase && isGitRef(briefBase) ? briefBase : '') || cfg.baseRef || 'origin/main'
  const worktree = spawn.here ? root : await workerRepo($, spawn, header?.repo, root)
  const label = taskLabel(spawn.task, spawn.subtask)
  const plan = reviewPlan({
    template,
    workerTier: spawn.tier,
    ...(cfg.reviewTier ? { override: cfg.reviewTier } : {}),
    tierMap: cfg.tierMap,
    label,
    marker: { task: spawn.task, subtask: spawn.subtask, attempt: spawn.attempt, ...(spawn.agentId ? { worker: spawn.agentId } : {}), ...(input.sha ? { sha: input.sha } : {}) },
    vars: {
      id: spawn.task,
      subtask: spawn.subtask,
      attempt: String(spawn.attempt),
      budget: String(spawn.budget),
      brief: spawn.briefPath ?? '(none)',
      worktree,
      branch: input.branch || '(the report names none)',
      sha: input.sha || 'HEAD',
      base,
      report: input.block,
      handback: input.text.length > HANDBACK_CAP ? `${input.text.slice(0, HANDBACK_CAP - 1)}…` : input.text,
    },
  })
  return { block: plan.block }
}

/**
 * MOD-12: the spawn block for a task's brief, as the spawn hook would decide
 * it now (tier, escalation, budget and slot): the Agent call the brain makes.
 * A refusal (running, budget, work present, queued) comes back as its line.
 */
async function prepareSpawn($: Host, o: { briefPath: string; subagentType: string; cwd?: string; looked?: boolean }): Promise<{ call: SpawnCall; tier: Tier; alias: Alias; source: string; attempt: number; budget: number } | { deny: string }> {
  const prompt = spawnPrompt(o.briefPath)
  const p = await planSpawn($, { tool_use_id: '', prompt, description: '', subagentType: o.subagentType, ...(o.cwd ? { cwd: o.cwd } : {}) })
  const { pick, tier, alias } = pickFor(p, undefined)
  const call = spawnCall({ label: p.label, tier, alias, subagentType: p.subagentType, briefPath: o.briefPath })
  const gate = await gateSpawn($, p, { prompt, description: call.description, subagentType: p.subagentType, model: alias }, false, o.looked === true)
  if ('deny' in gate) return gate
  return { call, tier, alias, source: pick.source, attempt: nextAttempt(p.records, p.subtask, p.lane), budget: p.budget }
}

/**
 * A spawn the mod makes itself: decided by `decideSpawn`, started with
 * `$.agent.spawn`. MOD-12 (#22): only the debrief and eval runners start this
 * way; the engine steps the mod's own hooks past an agent it spawns, so a
 * worker never does. MOD-15: but for the fallback (selfSpawnReady), which
 * starts a ready worktree row the brain left unclaimed, knowing what that
 * costs: no git guard, no effort setting, cost only at the end. Should the
 * engine route it back through this plugin's spawn hook, the hook passes it
 * through untouched (it is decided already) and reports the agent id it saw;
 * else the id comes from the call's result, else from `$.agent.list()` (the
 * one new agent with this description).
 */
async function spawnSelf($: Host, input: { prompt: string; description: string; subagentType: string; model?: string; cwd?: string; fallback?: true }): Promise<AgentSpawnResult> {
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

/**
 * MOD-15: the fallback. A ready worktree row the brain left unclaimed for
 * readyFallbackMinutes is started the way every queued row was before MOD-12:
 * `spawnSelf` with the row's own prompt and folder, the same tier, budget, slot
 * and record as the brain's spawn, recorded with source `fallback`. The worker
 * runs outside the mod's hooks, and the row posted says so. Refused (the engine
 * busy, a budget spent, work present), nothing starts; a refusal retrying cannot
 * cure took the row off the queue (gateSpawn), and the brain is told. True when started.
 */
async function selfSpawnReady($: Host, head: QueuedSpawn, waited: number): Promise<boolean> {
  const label = queuedLabel(head)
  let res: AgentSpawnResult
  try {
    res = await spawnSelf($, { prompt: head.prompt, description: head.description, subagentType: head.subagentType, ...(head.cwd ? { cwd: head.cwd } : {}), fallback: true })
  } catch (err) {
    res = { deny: String(err) }
  }
  if (res.deny !== undefined) {
    $.ui.toast(`ready ${label} not started: ${res.deny}`)
    debug($, `ready ${label}: the fallback spawn was refused: ${res.deny}`)
    // dropped from the queue (retrying cannot cure it): the brain reads a row, not a toast
    if (!(await readQueue($)).some(q => queuedLabel(q) === label)) await appendRow($, `chassis-delegation: ready ${label} not started by the fallback and taken off the queue: ${res.deny}`)
    return false
  }
  const spawn = await spawnByAgent($, res.agentId)
  await appendRow($, fallbackRow({ label, waited, attempt: spawn?.attempt ?? 1, budget: spawn?.budget ?? cfg.defaultBudget, ...(res.agentId ? { agentId: res.agentId } : {}), ...(spawn?.alias ? { alias: spawn.alias } : {}) }))
  return true
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
  modManifest = undefined
  repoLayer = {}
  cfg = readConfig(options, repoLayer).cfg
  // A (re)load starts the per-process memory over; the store keeps what must last.
  templatesLoad = undefined
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
    const asked = { ...e, subagentType: e.subagentType || (e as unknown as { subagent_type?: string }).subagent_type || 'general-purpose' }
    // MOD-21: a reviewer's prompt opens with its marker. Read before the brief the prompt names: that is not a worker.
    const marker = parseReviewMarker(e.prompt)
    if (marker) return decideReview($, asked, marker, (alias, cwd) => next({ ...e, model: alias, ...(cwd && cwd !== e.cwd ? { cwd } : {}) }))
    // MOD-12: the brain's Agent call names no folder; a briefed worker runs where /dispatch prepared it
    return decideSpawn($, asked, (alias, cwd) => next({ ...e, model: alias, ...(cwd && cwd !== e.cwd ? { cwd } : {}) }))
  })

  // ---- every tool call: the worker's SubagentHandback text; denials as friction (5E) ---
  on('tool.call', async ($, e, next) => {
    const refused = await brainGuard($, e)
    if (refused) {
      void noteFriction($, { kind: 'denial', detail: `${String(e.tool)}: ${refused.deny.slice(0, 160)}`, at: await now($) })
      return refused
    }
    // MOD-21: a reviewer never edits
    const unwritable = await reviewerGuard($, e)
    if (unwritable) {
      void noteFriction($, { kind: 'denial', detail: `${String(e.tool)}: ${unwritable.deny.slice(0, 160)}`, at: await now($) })
      return unwritable
    }
    // MOD-13: a worker past twice its ceiling is refused every call but its hand-back
    if (e.agentId && String(e.tool) !== 'SubagentHandback') {
      const over = await overSpendRefusal($, e.agentId)
      if (over) {
        void noteFriction($, { kind: 'denial', detail: `${String(e.tool)}: ${over.slice(0, 160)}`, at: await now($) })
        return { deny: over }
      }
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

  // ---- MOD-35: the brain merges a task: the ledger gets its accept row ---------------
  // Registered ahead of the git guard so it sees what the guard let through.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = typeof e.command === 'string' ? e.command : ''
    const out = await next(e)
    if (e.agentId || out.deny !== undefined || out.isError === true || !/\bmerge\b/.test(command)) return out
    await noteMergeCommand($, command)
    return out
  })

  // ---- 5D: the git guard on Bash -----------------------------------------------------
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!cfg.gitGuard) return next(e)
    const command = typeof e.command === 'string' ? e.command : ''
    const writes = gitWrites(command, cfg.guardBranches)
    if (writes.length === 0) return next(e)
    // MOD-13: a worker the mod recorded is held to the same rule; its refusal names its task
    const worker = await spawnByAgent($, e.agentId)
    const who = worker && !worker.adhoc ? taskLabel(worker.task, worker.subtask) : undefined
    const base = await bashCwd($, e.agentId)
    const branches = new Map<string, string | undefined>()
    for (const w of writes) {
      let current: string | undefined
      if (!w.namesGuarded && w.state.kind === 'unknown') {
        const dir = joinDir(base, w.dir)
        if (!branches.has(dir)) branches.set(dir, await branchOf($, dir))
        current = branches.get(dir)
      }
      const deny = guardDeny(w, current, cfg.guardBranches, who)
      if (deny) {
        debug($, `git guard: ${deny} — ${command.slice(0, 160)}`)
        return { deny }
      }
    }
    return next(e)
  })

  // ---- MOD-16: a recorded worker's Bash runs with its own identity ----------------
  // Registered after the git guard on purpose: hooks nest in registration order, so the
  // guard (and delegateOnly and the spend check above) judge the command as the worker
  // typed it, and this is the last link before the engine's tool. The brain (no agentId),
  // an ad hoc agent and an agent the mod never recorded are passed on as they are.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    const command = typeof e.command === 'string' ? e.command : ''
    if (!e.agentId || command === '') return next(e)
    const worker = await spawnByAgent($, e.agentId)
    // MOD-21: a reviewer is no attempt of its task: it keeps the inherited environment
    if (!worker || worker.adhoc || worker.review) return next(e)
    const run = withIdentity(command, worker)
    return next(run === command ? e : { ...e, command: run })
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
      const line = `${PLUGIN}: ${spawn.review ? 'review' : 'verify'} deferred — runs when ${agentId ?? (spawn.review ? 'the reviewer' : 'the worker')} hands back (background)`
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
    // MOD-12: a worker's slot may be free now: the verdict row carries `ready:` for the queued task the brain spawns next
    const ready = await readyRows($, agentId)
    const carried = row === undefined ? ready : [[row, ...ready].join('\n')]
    return carried.length === 0 ? ran : { ...ran, context: [...(ran.context ?? []), ...carried] }
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
      stepEfforts.delete(agentId)
      // the answer plus the hand-back (GH-2), read once and only for an agent the mod judges
      let said: Promise<string> | undefined
      const saidOnce = () => (said ??= workerText($, agentId, e.answer))
      const spawn = await spawnByAgent($, agentId)
      // a worker just told to wrap up is going on: this turn's end is not its hand-back
      if (warned) debug($, `${taskLabel(spawn?.task ?? '', spawn?.subtask ?? 'main')}: wrap-up sent; its next turn is the hand-back`)
      // An ad hoc background agent is judged into the brain's conversation only
      // when it has no header and no brief and hands back a report (GH-1
      // item 2: cardless); a foreground one gets its line from the tool.call hook.
      let row: string | undefined
      // a foreground worker's Agent result carries its verdict and any ready line (the tool.call hook)
      const foreground = spawn !== undefined && waiting.has(spawn.key)
      if (!warned && spawn && spawn.verdictAttempt !== spawn.attempt && (!spawn.adhoc || isCardless(spawn))) {
        const text = await saidOnce()
        // A foreground worker's verdict lands in its Agent result's context; one
        // without a report there is left for the tool.call hook to judge.
        const hasReport = extractReport(text) !== undefined
        if (spawn.adhoc ? hasReport : !foreground || hasReport) {
          const tokens = e.usage ? e.usage.input_tokens + e.usage.output_tokens : undefined
          const rendered = await finalize($, spawn, text, { tokens })
          handbacks.delete(e.agentId)
          if (!foreground && (await claimPost($, spawn))) row = sideEffects($, rendered, false)
        }
      }
      // a debrief agent or an eval runner the mod started (2C, 2D)
      await onRunnerComplete($, agentId, saidOnce)
      // MOD-12: a worker's slot may be free now (2F): the row says which queued task is ready; the brain spawns it
      const ready = foreground ? [] : await readyRows($, agentId)
      if (row !== undefined || ready.length > 0) {
        const text = [...(row !== undefined ? [row] : []), ...ready].join('\n')
        await appendRow($, text)
        // MOD-15: the verdict wakes the brain as a turn of its own (a foreground worker's rides its Agent result: no row here)
        // MOD-35: not for a task already on the default branch: its next=accept is stale; a `ready:` line still wakes
        if (row !== undefined && spawn && (await alreadyMerged($, spawn))) {
          debug($, `wake skipped: ${taskLabel(spawn.task, spawn.subtask)} already merged`)
          await wakeBrain($, ready.join('\n'))
        } else await wakeBrain($, text)
      }
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

  // ---- turn.step: a worker steps at the effort its tier (or its card) names (MOD-13) ----
  on('turn.step', async function* ($, e, next) {
    const effort = e.agentId ? await stepEffort($, e.agentId) : undefined
    return yield* next(effort !== undefined ? { ...e, effort } : e)
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
    // MOD-15: the mod's own wake-up is not the person's correction
    const ours = e.origin?.kind === 'plugin' && e.origin.name === PLUGIN
    if (!ours && isCorrection(e.text)) void noteFriction($, { kind: 'correction', detail: e.text.slice(0, 200), at: await now($) })
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
      ...(await ownerFields($)),
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
      await $.command.register({ name: 'delegation', description: 'Delegation state; "setup" checks this repo and scaffolds it; "init" is the bare scaffold', argumentHint: '[setup|init|update|dashboard|accept <id> [note]]' })
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
    // MOD-28: the load. The templates are read here, once, with the code that renders them.
    await loadedTemplates($)
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
    if (arg === 'debrief') return { text: await runDebrief($) }
    if (arg === 'debrief apply' || arg.startsWith('debrief apply ')) return { text: await runDebriefApply($, arg.slice('debrief apply'.length)) }
    if (arg === 'debrief post' || arg.startsWith('debrief post ')) return { text: await runDebriefPost($, arg.slice('debrief post'.length)) }
    if (arg === 'lesson' || arg.startsWith('lesson ')) return { text: await runLesson($, arg.slice('lesson'.length)) }
    if (arg === 'accept' || arg.startsWith('accept ')) return { text: await acceptTask($, arg.slice(6)) }
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
    return { text: 'usage: /delegation [setup|init|update|debrief|dashboard|lesson <domain> [text]|accept <id> [note]]' }
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
      const { view, since, records, running, waits } = await liveModel($)
      const mine = sessionRecords(records, since, await ownerFields($))
      const items: BandItem[] = [
        ...running.map((r): BandItem => ({ kind: 'running', task: r.label, tier: r.tier, alias: r.alias, at: r.at, phase: 'building' })),
        ...(await readQueue($)).map((q, i): BandItem => {
          const task = taskLabel(q.task, q.subtask ?? 'main')
          // MOD-24: a row waiting for a resource carries it, and who holds it; a row waiting for a slot carries nothing
          const wait = waits.get(task)
          return { kind: 'queued', task, position: i + 1, ...(wait ? { waits: wait } : {}) }
        }),
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
