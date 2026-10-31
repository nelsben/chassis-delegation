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
import { callKind, driveCall, driveLines, driveOutput, driveStep, driveTurn, emptyWatch, ranBefore, freshSessionRow, DRIVE_THRESHOLD_TOKENS, FRESH_SESSION_TOKENS, type DriveRecord, type Watch } from './lib/drive'
import { extractPause, pauseCapLine, pauseRow, PAUSE_CAP, saysWaiting, textKey, waitStep, waitText, WAIT_STALL_DEFAULT_MIN, type Pause, type WaitState } from './lib/waitstate'
import { bandTree, nudgeBandTree, rationBandTree } from './lib/band'
import { describesWork, nudgeLine, parentNudge } from './lib/landnudge'
import { bashCommits, bashWrites, emptyBrain, brainEdit, brainFamily, brainLine, brainSummary, brainTurn, delegateDecision, DELEGATE_DENY, isRestricted, PREMIUM_POSTURE, toolPath, warnRow, WRITE_TOOLS, type BrainRecord, type BrainFamily } from './lib/brain'
import { paneTree, type PaneTable, type PaneView } from './lib/pane'
import { attempts as attemptsOf, dashboardText, isActive, liveView, pickScheme, sampleEvery, sessionRecords, spendSeries, workersUsd as workersUsdOf, type LiveView, type SpendPoint } from './lib/live'
import { metricsFromRecords } from './lib/metrics'
import { checkArgv, isSha, LOCK_REASON, refusedLine, type AllowConfig, type MergeCtx } from './lib/allow'
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
  cardReadsMerged,
  verifyTarget,
  taskLabel,
  type AttemptRecord,
  type Lane,
  isResumeAfterJudged,
  readLine,
  readRecord,
  readVerdict,
  isRetiredVerdict,
  supersededBy,
} from './lib/attempts'
import { briefDrift, briefNames, briefRewrittenLine, briefStaleRefusal, type BriefDrift } from './lib/crossbrief'
import {
  amendNeedsApproval,
  amendScopePaths,
  scopeAmendHeld,
  parentScopeOf,
  type ScopeAmends,
  amendScopeInsideForbid,
  amendInsideForbidLine,
  scopeForbidClashes,
  scopeForbidClashLine,
  appendAmends,
  budgetWarning,
  effectiveList,
  parseAmends,
  type Amend,
  extractAmendBlocks,
  extractReport,
  findBriefPath,
  resolveBriefPath,
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
import { addTurn, turnKey, ceilingState, liveWorker, overSpendDeny, overSpendLine, round4, spendCeiling, spendWarnRow, warnText, OVER_SPEND_NEXT, type Spend } from './lib/cost'
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
import { resolveFindings, notFoundLine, expandHome } from './lib/debriefdir'
import { noteFindings, noteFindingsName, notesPromptRow } from './lib/notes'
import { checkDebrief, windowOf, userMessagesOf, userMessagesFromJsonl, transcriptPath, type DebriefWindow, type UserMessage } from './lib/debriefcheck'
import { appendInstructions, compactBlock, composeSection, emptySnapshot, isEmptyState, owedRowsFrom, prsFrom, renderState, SECTION_ID, splitOwed, type RecentVerdict, type StateSnapshot } from './lib/compaction'
import {
  agentTypeFor,
  branchName,
  briefDirFor,
  gateLineText,
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
  scopeSizeWarning,
  tierHint,
  hedgeHints,
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
  liveBriefRefusal,
  rewriteReasonsOf,
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
import { EMPTY_GATE_KEY, engineLockDecision, gateCommandTemplates, gateForDelta, gateTemplatesOf, isEngineGate, readEngineLock, resolveGateRuns, waitedLine, type EngineLock } from './lib/gates'
import { ghWrites } from './lib/ghguard'
import { gitWrites, guardDeny, joinDir, mergeTargets, parseGuardBranches, taskOfBranch } from './lib/gitguard'
import { handbackMessages, workerSaid } from './lib/handback'
import { withIdentity } from './lib/identity'
import { INIT_FILES, PLUGIN_MANIFEST, PLUGIN_CARD_DIR, cardsLocalLine, initPlan, initText } from './lib/init'
import { openSiblings, type SiblingCard } from './lib/scopetree'
import { TREE_TOOL, treeOf, treeText, type TreeCard } from './lib/tree'
import { TREE_IMPORT_TOOL, countsLine, parseTreeImportArgs, parseTreeImportTool, parseTreePlan, planFileOf, setIssueAt, treeBatch, treeCounts, treeLines, type TreeNode } from './lib/landtree'
import { doneBeforeFiling, withClosedLine, doneTasks, freeName, issueLineOf, issueUrlOf, planKey, planLineOf, subIssuesOf, withoutIssueLine, LAND_PLAN_TOOL, LAND_TOOL, parsePlan, type PlanItem, landedBody, openCards, parentHint, parseLandArgs, parseLandTool, parseProject, type LandArgs, type LandCard } from './lib/land'
import { CARD_TOOL, cardsFromFields, slugOf, cardSummary, doneStatementCount, doneWhenOf, forbidCollisions, forbidFix, redTestWarnings, sayGo, type NewCard } from './lib/card'
import { PATH_TOOLS, ROOT_MARKERS, SHADOWS, allRequiredHold, configLines, detectGate, foundOf, proposedSpend, handoverText, BRAIN_HANDOVER, scaffoldConfig, setupChecks, setupText, wouldSet, type SetupProbe } from './lib/setup'
import { artefactsCheck, defaultScratch, normalizePath, expandTilde, globList, globRoot, isAbsolute, isNotWorkTree, isOutsideFile, noRepoVerdict, outdirOf, outsideCheck, outsideFilePath, OUTSIDE_WALK_CEILING, outsideRoots, reportArtefacts, reportFiles, reportMetrics, scopeCheck, workTreeArgv, type ArtefactStat, type OutsideInput, type RootListing } from './lib/norepo'
import { ceilingMs, gateIdOf, gateOutput, gateProgressText, pastCeiling, spawnExitCode, type GateProgress } from './lib/gaterun'
import { noSuchAttempt, parseVerdictTool, POLL_MS, rowRaceOpen, stillVerifying, VERDICT_TOOL, verdictRule } from './lib/verdicttool'
import { glyphIssues, modelGlyph, parseGlyphs, withGlyph, type GlyphMap } from './lib/glyph'
import { prunedLine, refusedRow, refusedWritesLine, retentionPlan, slimSpawns, storeBytes, storeLine, type StoreEntry } from './lib/retention'
import { migratedLine, migrationPlan, scopedId, trimRepo } from './lib/taskkeys'
import { fallbackLog, fallbackTail, fieldsOfRow, latestSpawnRow, ledgerJudgedLine, parseLedger, spawnRow, verdictAfter, withTail, type Fallback, type LedgerRow, type RowQuery } from './lib/storeloss'
import { handedBackRow, postsRows, runningSection, startedRow, type RunningWorker, type StartKind } from './lib/rows'
import { cardsHandedBack, nudgeDown, nudgeText, nudgeUp, type EffortNudge } from './lib/nudge'
import { deliveryFor, parseVerbosity, quietLine, reviewLine, shortNext, type Rendered, type Verbosity } from './lib/quiet'
import { DEFAULT_CARD_DIR, fillMergeCheck, ignoreWithCards, isGitRef, mergeCheckRefusal, mergeChecksFor, mergeConfig, parseRepoConfig, REPO_CONFIG_FILE, resolveIssueRepo, type Effective, type RepoConfig, type ReviewMode } from './lib/repoconfig'
import { isRepoPath, normRepoPath, NOT_A_CHECKOUT, repoFolderName, repoPathCheck, sessionCardsFor, withRepoName } from './lib/paths'
import {
  matchReview,
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
import { alreadyQueuedDeny, countTiers, limitSourceText, maxWorkersSourcedText, enqueue, fallbackDelay, fallbackDue, fallbackKind, fallbackRow, hasSlot, isFinalDeny, isQueuedDeny, parseReadyFallbackMinutes, planQueue, promptKey, heldLine, queuedDeny, queuedIndex, queuedText, readyCount, readyLine, readyWaitLine, resourceBlock, resourceDeny, runningDeny, startingOthers, tierFree, tierFull, waitedMinutes, waitsText, type FallbackKind, type ResourceWait, type TierCounts, type Wanting } from './lib/scheduler'
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
  amendHeldLine,
  amendedLine,
  amendMalformedLine,
  amendPendingLine,
  branchDelta,
  budgetDenyMessage,
  contextBlock,
  detectRateLimit,
  filesPathFor,
  isFailing,
  isProveResume,
  newestRed,
  probeWork,
  branchOnBase,
  onBaseClause,
  rateLimitedVerdict,
  resumeText,
  scratchFor,
  syntheticReport,
  verdictLine,
  gateReusedIn,
  verifyAdvice,
  workPresentDeny,
  workPresentLine,
  type Advice,
  type Verdict,
  type WorkPresent,
} from './lib/verify'
import { briefHasEngineGate, engineLanesLine, isLoaded, loadedWords, NPROC_ARGV, parseProcLoad, parseSysctlLoad, PROC_LOADAVG, SYSCTL_LOAD_ARGV, type LoadReading } from './lib/load'
import { BASE_REFS, briefContract, briefWantsRed, isMalformedReport, verifyCardless, verifyNative, type RedEvidence } from './lib/verify-native'
import { aliasLines, driftMessage, newAgentTypes, nextSighting, parseSighting, parseCandidateIds } from './lib/watch'
import { allowance, bar, cellDay, dayIndex, dayKey, dayRecord, daySegments, inWindow, pace, parseRecord, rationKey, rationReport, rationText, resetsIn, segments, surplus, type DayRecord, type Window as RationWindow } from './lib/ration'
import { MOD_VERSION } from './lib/version'
import { startedComment, statusFailure, statusFile, superseded, verdictComment } from './lib/status'
import {
  cardDiff,
  cardKeptLocalClause,
  notLandedIgnoredLine,
  coAuthorTrailer,
  commitArgv,
  conflictLine,
  defaultBranchOf,
  dirtyWorktreeLine,
  finishLines,
  closesOf,
  type CloseResult,
  siblingsOf,
  labelIsMerged,
  lastLines,
  latestVerdictRow,
  reviewAcceptedAttempt,
  mainBranchLine,
  mergeTarget,
  mainDirtyLine,
  markMerged,
  MERGE_TOOL,
  mergedLines,
  amendMergeLine,
  amendSummary,
  noWorktreeLine,
  ownerRepoOf,
  parseMergeArgs,
  finishLeftovers,
  finishStopLines,
  parseMergeTool,
  prBody,
  issueRef,
  issueNote,
  pushLines,
  readsMerged,
  remoteBlock,
  shellWord,
  statusPaths,
  touchesVersion,
  twinIn,
  VERSION_FILE,
  versionOf,
  verdictRefusal,
  worktreeOf,
  type GateResult,
  type MergeArgs,
  type MergedEntry,
  type VerdictRow,
} from './lib/mergecmd'
import { configPlan, fieldAnswer, manifestFields, rowsByField, viewFields, type CfgRow, type CfgView, type Source } from './lib/configcmd'
import { CONFIG_TABLE } from './lib/configtable'
import { parseUserOptions, repoFileWith, repoProjectOf, resolveOptions, userFileWith, userOptionsPath, type Resolved } from './lib/configeff'
import { askLine, AUTO_POST_CAP, capLine, coveredBy, issueNumberOf, parsePostArg, parsePostMode, postModeLine, REDACT_EMPTY, renderPost, survivingWord, type IssueRow, type PostFinding, type PostMode } from './lib/findings'
import { dropLocalQuotes, gitConfigValue, parseRedactList, redact, type RedactRules } from './lib/redact'
import { allowOf, missingBlocks, missingBlockRefusal, noLocalRefusal, renderLocal, trackedRefusal, unreadableRefusal } from './lib/brieflocal'
import { cardsOf, syncCardIndex, type CardIndex } from './lib/cardcache'
import { abortedDeny, budgetDelay, decisionId, isStopped, outOfTimeDeny, stopper, turns, type Stopper } from './lib/serial'
import { behindLine, changelogSlice, classifyRoot, codeSkewLine, folderVersion, inDevMods, migrateConfig, updateLine, upToDateLine } from './lib/update'

type Host = EngineInterface

const PLUGIN = 'chassis-delegation'
const WORKERS = { plugin: 'chassis-delegation', key: 'workers' } as const
const LAST_VERDICT = { plugin: 'chassis-delegation', key: 'lastVerdict' } as const
const QUEUE = { plugin: 'chassis-delegation', key: 'queue' } as const
const SPEND = { plugin: 'chassis-delegation', key: 'spend' } as const
const BRAIN = { plugin: 'chassis-delegation', key: 'brain' } as const
/** MOD-3: the last `git fetch` for the status line's behind count, at most one per ten minutes (in the store: the manifest names no new state key). */
const UPDATE_CHECK = 'delegation.updateCheck'
const UPDATE_CHECK_MS = 10 * 60 * 1000
/** GH-112: the pane `/delegation dashboard` and the band's `[ details ]` open. */
const DASH_PANE = 'delegation-dash'

/**
 * MOD-117 (#185, #184): every key below that takes a card id takes the card's repo too, `<id>@<repo>` (MOD-97's form for
 * a card of another local repo, now for the session's own cards as well): card ids restart in each repo and the store
 * is one per machine. The bare id is a session with no root. `taskRepo` and `mergePrep` are the session root's.
 */
const K = {
  /** A task's attempt records in its card's repo. */
  tasks: (task: string, repo = '') => `delegation.tasks.${scopedId(task, repo)}`,
  adhoc: 'delegation.adhoc',
  /** MOD-47: the brain's record for the conversation that started at `since`. */
  brain: (since: number) => `delegation.brain.${since}`,
  spawn: (key: string) => `delegation.spawn.${key}`,
  /** MOD-224: the last review block seen for a task that did not match the review its verdict waits on. */
  reviewSeen: (task: string) => `delegation.reviewSeen.${task}`,
  agent: (agentId: string) => `delegation.agent.${agentId}`,
  name: (name: string) => `delegation.agentName.${name}`,
  alias: (alias: string) => `delegation.alias.${alias}`,
  /** GH-114: the classifier's tier for a card, from its dry run. */
  classifier: (task: string, repo = '') => `delegation.classifier.${scopedId(task, repo)}`,
  /** MOD-12: where /dispatch prepared a brief's worker (its worktree, or the root for repo=here); the brain's Agent call names no folder. */
  handoff: (briefPath: string) => `delegation.handoff.${briefPath}`,
  agentTypes: 'delegation.agentTypes',
  answered: 'delegation.models.answered',
  replay: (briefPath: string) => `delegation.replay.${briefPath}`,
  /** A worker's own spend this attempt, from its turn usage (GH-106). */
  cost: (agentId: string) => `delegation.cost.${agentId}`,
  /** MOD-217: the paths a worker's own tool calls wrote (absolute, capped), read at its verdict to charge scope only for what it wrote. */
  writes: (agentId: string) => `delegation.writes.${agentId}`,
  /** MOD-13: the card's own `effort:`, written at /dispatch; it wins over effortByTier. */
  effort: (task: string, repo = '') => `delegation.effort.${scopedId(task, repo)}`,
  /** Set once an attempt's verdict row is posted to the conversation. */
  posted: (attemptKey: string) => `delegation.posted.${attemptKey}`,
  /** MOD-64: the text appended for an attempt's verdict (the row and any ready: lines), which the verdict tool returns. */
  postedRow: (attemptKey: string) => `delegation.postedRow.${attemptKey}`,
  /** This session's verdict lines, for the compaction block and the system prompt section (2E). */
  recent: (sessionId: string) => `delegation.recent.${sessionId}`,
  /** MOD-53: set once the fresh-session row is posted in a session. */
  freshSession: (sessionId: string) => `delegation.freshSession.${sessionId}`,
  /** MOD-137: when the last review-note prompt row was added or a note ingested, and the ingested findings file. */
  notes: (sessionId: string) => `delegation.notes.${sessionId}`,
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
  outside: (task: string, repo = '') => `delegation.outside.${scopedId(task, repo)}`,
  /** MOD-44: the other local repo a task is for (its absolute path), so the id alone finds its card, brief and tree; MOD-117: in the session root's key space. */
  taskRepo: (task: string, root = '') => `delegation.taskRepo.${scopedId(task, root)}`,
  /** MOD-75: the tasks `/delegation merge --finish` merged in a session (task, sha, version), for the `merged:` lines. */
  merged: (sessionId: string) => `delegation.merged.${sessionId}`,
  /** MOD-75: what `/delegation merge <ID>` prepared (the head it pushed, the version it bumps), read again by --finish. */
  mergePrep: (task: string, root = '') => `delegation.mergePrep.${scopedId(task, root)}`,
}

const PROBE_EVERY_MS = 24 * 60 * 60 * 1000
const MIN_MS = 60 * 1000
const HOUR_MS = 60 * MIN_MS
const RECENT_CAP = 50
/** MOD-233: merged.<sid> keeps its newest entries, like recent. */
const MERGED_CAP = 50
/** An eval runner out longer than this is taken as gone (a T1 run takes minutes). */
const EVAL_STALE_MS = 3 * HOUR_MS
/** MOD-6: a debrief whose agent never handed back is not holding the one slot past this. */
const DEBRIEF_STALE_MS = HOUR_MS
const EVALS_CAP = 100
/** The longest timeoutMs the host takes for one process run (10 minutes). */
const HOST_MAX_TIMEOUT_MS = 600_000
/**
 * MOD-155 (#246), MOD-229 (#323): how long one gate command may run, read at the time of the run (repo option
 * gateTimeoutMinutes, 1 to 120, default 30). The mod's own ceiling: a gate is spawned (spawnGate), so the host's
 * 10-minute cap on one `$.process.run` does not apply; the engine-gate lock's `until` is the same ceiling.
 */
const gateTimeoutMs = (): number => ceilingMs(cfg.gateTimeoutMinutes)
/** MOD-143: the longest a card's merge check may run. */
const MERGE_CHECK_TIMEOUT_MS = 10 * 60 * 1000
/** The advice kinds that leave something for the brain (or the person) to do. */
const OWED_KINDS = ['resume', 'respawn', 'verify', 'exhausted', 'check', 'fix-brief', 'review']
const LEDGER_FILE = '.delegation/ledger.jsonl'

/**
 * `delegation.debrief.<session>`: the background debrief (2C, 5E). MOD-26: `skippedTo` is the breadcrumb line a
 * boundary-only window ended at when the mod spawned nothing for it; the next window starts there (the mod never
 * writes the `.done` mark, so the record is what moves).
 */
type DebriefRecord = { lastAt: number; watermark: number; lines: number; sessionId: string; mode?: 'breadcrumbs' | 'events'; builtIn?: boolean; agentId?: string; finishedAt?: number; path?: string; denied?: string; window?: DebriefWindow; prior?: DebriefRecord | null; skippedTo?: number; /** MOD-91 */ lastAttemptAt?: number; failedChecks?: { watermark: number; count: number } }
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
  /** MOD-211: the report line judged malformed (no sha=) at this attempt; a different one resent is judged on the same attempt, uncharged. */
  malformed?: string
  /** MOD-226: pauses taken in the current attempt (a resume resets it). */
  pauses?: number
  /** MOD-226: fingerprint of the hand-back judged a pause; a different hand-back reopens the same attempt. */
  pausedAs?: string
  // MOD-89: no `prompt`: nothing read it back, and at about 1.4 KB a record it was most of the store (#157).
  // A record written before keeps it; the brief path, the key (the tool_use_id) and the description are what is read.
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
  /** MOD-233: the first line of a posted verdict's block, kept once the block, the line and the postedRow value are dropped (24 h after the verdict). */
  verdictSummary?: string
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
  /** MOD-44: the other local repo this worker's task is for (its absolute path); absent for a task of the session's own repo. */
  repo?: string
  /**
   * MOD-21: set on a reviewer's record. `attempt` is the attempt it reviews; `worker` is that worker's agent id
   * (the resume goes to it), `sha` the commit under review. A reviewer is on no ladder, holds no slot, and edits nothing.
   */
  review?: { worker?: string; sha?: string }
  /** MOD-94: set (never stored) on a record a hand-back or the verdict tool rebuilt because the store had none. */
  fallback?: Fallback
}

const laneOf = (s: { replay?: boolean; base?: string }): Lane | undefined =>
  s.replay ? { replay: true, ...(s.base ? { base: s.base } : {}) } : undefined

/**
 * `<task>:<lineage>:<attempt>` (the subtask, a replay lane and (MOD-97) another repo folded into the task) — one verdict per key.
 * MOD-117: the card's repo is always folded in: another repo's (`s.repo`), else the session root given.
 */
const attemptKeyIn = (s: SpawnRecord, root: string): string =>
  `${scopedId(taskLabel(s.task, s.subtask), s.repo || root)}${s.replay ? `@replay${s.base ? `-${s.base}` : ''}` : ''}:${s.review ? `review-${s.key}` : s.lineage}:${s.attempt}`
/** MOD-117: an attempt's key, in its card's repo. */
const attemptKey = async ($: Host, s: SpawnRecord): Promise<string> => attemptKeyIn(s, await sessionRootOf($))

type Config = {
  autoEscalate: boolean
  applyAmends: boolean
  scopeAmends: ScopeAmends
  /** MOD-192: the GitHub Project land adds issues to, `<owner>/<number>` or ''. */
  project: string
  defaultBudget: number
  probeModels: boolean
  candidateIds: string[]
  briefDir: string
  verbosity: Verbosity
  autoDebrief: boolean
  /** MOD-137 */
  debriefMode: 'notes' | 'transcript'
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
  /** GH-112: the band above the prompt. MOD-128: off unless the option is true. */
  dashboardBand: boolean
  /** MOD-128: the rate-limit window the footer meter reads, or off. */
  ration: 'seven_day' | 'five_hour' | 'off'
  /** MOD-128: a fixed daily allowance in window points; 0 = pace to the reset. */
  rationDaily: number
  /** MOD-78: the glyph per model on every row: a map, or 'off'; `glyphsText` is the option as written. */
  glyphs: GlyphMap | 'off'
  glyphsText: string
  /** GH-114: the card tool's dry run asks the classifier beside the card's tier. */
  classifierSecondOpinion: boolean
  guardBranches: string[]
  // defaults < .chassis-delegation.json < settings (5B)
  gateMap: Record<string, string>
  /** MOD-98: gateMap entries the gate checker refused, id → why. */
  refusedGates: Record<string, string>
  /** MOD-143: gate id → the command merge runs before it rebases. */
  mergeCheckMap: Record<string, string>
  gateTemplates: string[][]
  agentTypes: Record<string, string>
  tierMap: Record<Tier, Alias>
  evalCommand: string
  evalLiveCommand: string
  briefTemplate: string
  briefExtra: string
  /** MOD-124 (#188): the gitignored rules file copied into every brief. */
  briefLocal: string
  maxWorkers: number
  /** MOD-155 (#246): whole minutes one gate command may run. */
  gateTimeoutMinutes: number
  /** MOD-131 (#219): the lower ceiling of each capped tier under maxWorkers. */
  maxWorkersByTier: Partial<Record<Tier, number>>
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
  /** MOD-114: the brain's effort nudge: the cards glob ('' = off) and the up and down words. */
  effortNudge: EffortNudge
  /** GH-113: what an opus or fable brain may do itself. */
  delegateOnly: 'off' | 'warn' | 'deny'
  /** MOD-7: owner/name /delegation debrief post files issues in; '' = posting is off. */
  issueRepo: string
  /** MOD-18: issueRepo is the mod's own repository, from the manifest (the repo file left it unset). */
  issueRepoOwn: boolean
  /** MOD-15: a verdict row is followed by a `$.prompt.submit`, a turn of the brain's own. MOD-64: off unless the option is true. */
  wakeOnVerdict: boolean
  /** MOD-201: the two one-line leads in the band, for the brain; off records and draws neither. */
  landNudge: boolean
  /** MOD-205: on files at once; off shows the issue and files only on confirm: true. */
  landAuto: boolean
  /** MOD-215: the most creates one tree import makes in a run, 1 to 100. */
  treeImportBatch: number
  /** MOD-31: ask | auto | off; /config only, never the (public, shared) repo file. */
  postFindings: PostMode
  /** MOD-15: how long a ready worktree row waits for the brain before the mod starts it itself; 0 = never. */
  readyFallbackMs: number
  /** MOD-99: minutes a waiting worker may wait before the mod says it is stalled; 0 = off. */
  waitStallMs: number
  /** MOD-48: the warn row for a command the brain keeps re-running or polling at a large context. */
  driveWarn: boolean
  /** MOD-48: the context, in tokens, from which that row speaks. */
  driveWarnTokens: number
  /** MOD-53: the brain context, in tokens, from which it is told once to start a fresh session; 0 = off. */
  freshSessionTokens: number
  /** MOD-21: a read-only reviewer after a consistent verdict: off, on, or on-frontier (frontier and premium cards only). */
  review: ReviewMode
  /** MOD-21: the reviewer's tier; '' = one below the worker's. */
  reviewTier: Tier | ''
}

/**
 * MOD-73: the config the mod runs with, out of four layers: the built-in defaults < the repo
 * file < yours (the user options file) < the host's (`host`: the activation options, a listed
 * /config row's value over them). `resolved` is the same values with the source of each: what
 * `/delegation config` shows, so it never disagrees with what the mod does.
 */
function readConfig(host: Readonly<Record<string, unknown>>, repo: RepoConfig, user: Readonly<Record<string, unknown>> = {}, locked: ReadonlySet<string> = new Set()): { cfg: Config; errors: string[]; resolved: Resolved } {
  const resolved = resolveOptions(host, user, repo, locked)
  const o = { ...host, ...resolved.opts } as PluginOptions
  const str = (k: string) => (typeof o[k] === 'string' ? (o[k] as string) : '')
  const budget = typeof o.defaultBudget === 'number' && o.defaultBudget >= 1 ? Math.floor(o.defaultBudget) : 3
  const num = (k: string, fallback: number): number => {
    const v = o[k]
    return typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : fallback
  }
  const eff = resolved.eff
  const issues = resolveIssueRepo(eff, modManifest ?? undefined)
  return {
    errors: resolved.errors,
    resolved,
    cfg: {
      autoEscalate: o.autoEscalate === true,
      applyAmends: o.applyAmends !== false,
      scopeAmends: eff.scopeAmends,
      project: eff.project,
      defaultBudget: budget,
      probeModels: o.probeModels === true,
      candidateIds: parseCandidateIds(str('candidateIds')),
      briefDir: str('briefDir'),
      verbosity: parseVerbosity(o.verdictVerbosity),
      autoDebrief: o.autoDebrief !== false,
      debriefMode: o.debriefMode === 'transcript' ? 'transcript' : 'notes',
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
      dashboardBand: o.dashboardBand === true,
      ration: o.ration === 'off' || o.ration === 'five_hour' ? o.ration : 'seven_day',
      rationDaily: Math.min(100, num('rationDaily', 0)),
      glyphs: parseGlyphs(str('modelGlyphs')),
      glyphsText: str('modelGlyphs'),
      classifierSecondOpinion: o.classifierSecondOpinion !== false,
      guardBranches: parseGuardBranches(str('guardBranches')),
      gateMap: eff.gateMap,
      refusedGates: eff.refusedGates,
      mergeCheckMap: eff.mergeCheckMap,
      gateTemplates: gateTemplatesOf(eff.gateMap),
      agentTypes: eff.agentTypes,
      tierMap: eff.tierMap,
      evalCommand: eff.evalCommand,
      evalLiveCommand: eff.evalLiveCommand,
      briefTemplate: eff.briefTemplate,
      briefExtra: eff.briefExtra,
      briefLocal: eff.briefLocal,
      maxWorkers: eff.maxWorkers,
      gateTimeoutMinutes: eff.gateTimeoutMinutes,
      maxWorkersByTier: eff.maxWorkersByTier,
      domains: eff.domains,
      worktreeRoot: eff.worktreeRoot,
      cardDir: eff.cardDir,
      baseRef: eff.baseRef,
      ignore: eff.ignore,
      spendByTier: eff.spendByTier,
      effortByTier: eff.effortByTier,
      effortNudge: eff.effortNudge,
      delegateOnly: eff.delegateOnly,
      issueRepo: issues.repo,
      issueRepoOwn: issues.own,
      wakeOnVerdict: o.wakeOnVerdict === true,
      landNudge: o.landNudge !== false,
      landAuto: o.landAuto === true || o.landAuto === 'on',
      treeImportBatch: treeBatch(o.treeImportBatch),
      postFindings: parsePostMode(o.postFindings),
      readyFallbackMs: parseReadyFallbackMinutes(o.readyFallbackMinutes) * MIN_MS,
      waitStallMs: num('waitStallMin', WAIT_STALL_DEFAULT_MIN) * MIN_MS,
      driveWarn: o.driveWarn !== false,
      driveWarnTokens: num('driveWarnTokens', DRIVE_THRESHOLD_TOKENS),
      freshSessionTokens: num('freshSessionTokens', FRESH_SESSION_TOKENS),
      review: eff.review,
      reviewTier: eff.reviewTier,
    },
  }
}

// Module memory: a reload starts it over; the store and $.state stay.
let options: PluginOptions = {}
let repoLayer: RepoConfig = {}
/** MOD-73: the user options file's text as last read (undefined = not read yet, null = none) and its values. */
let userText: string | null | undefined
let userOpts: Record<string, unknown> = {}
/** MOD-73: the fields a locked /config row holds, as the last listing of the rows said. */
let lockedFields: ReadonlySet<string> = new Set()
/** MOD-73: every field's value and source, as the config was last made. */
let resolvedNow: Resolved | undefined
/** The repo file's text as last read: undefined = not read yet, null = no file. */
let repoText: string | null | undefined
/** MOD-18: the loaded copy's manifest as last read, which names the mod's own repository: undefined = not read yet, null = unreadable. */
let modManifest: string | null | undefined
let cfg: Config = readConfig({}, {}).cfg
/** MOD-78: the glyph for an alias or model id ('' with modelGlyphs off). */
const glyphOf = (alias: string | undefined): string => (cfg.glyphs === 'off' || !alias ? '' : modelGlyph(alias, cfg.glyphs))
/** MOD-78: a description with the model's glyph in front, once; untouched with modelGlyphs off. */
const glyphDescription = (description: string, alias: string | undefined): string => (cfg.glyphs === 'off' ? description : withGlyph(description, glyphOf(alias), cfg.glyphs))
const glyphLogged = new Set<string>()
/** MOD-78: a malformed modelGlyphs entry is named in the debug log, once. */
function noteGlyphIssues($: Host): void {
  for (const line of glyphIssues(cfg.glyphsText)) {
    if (glyphLogged.has(line)) continue
    glyphLogged.add(line)
    debug($, line)
  }
}
const waiting = new Set<string>() // Agent tool calls still awaiting their result
const resumeCalls = new Map<string, string>() // MOD-97 (#155): an ad hoc Agent call that resumed a briefed worker -> that worker's spawn key
const handbacks = new Map<string, string>() // agentId → a SubagentHandback message a tool.call hook saw (the transcript is the live source: GH-2)
const verifying = new Map<string, SpawnRecord>() // MOD-74: the spawn behind each attempt key in `finalizing`, for the status section
const finalizing = new Map<string, Promise<Rendered>>() // attempt key → its verify, so a second fire waits on the first
const posted = new Set<string>() // attempt keys whose verdict row went to the conversation
/**
 * MOD-94 (#159, #157): the briefed workers this process saw start, by agent id, each as its spawn record was last
 * written (every `delegation.spawn.*` write lands here too, refused or not). A running one whose verdict is still
 * out is a live worker whether or not the store kept its record; it leaves the live set when its verdict lands.
 * The store stays the source for a worker started in an earlier process.
 */
const remembered = new Map<string, SpawnRecord>()
const REMEMBER_CAP = 500
const offered = new Set<string>()
let seedingTypes = false
/** GH-106: the turn id a subagent's `turn.start` carried (the engine gives none today), by agentId. */
const turnOf = new Map<string, string>()
/** MOD-81: the newest session dollars any read of $.session.usage() gave the mod, with when: the band shows this. */
let latestUsage: { usd: number; at: number } | undefined
async function noteUsd($: Host, usd: number | undefined, at?: number): Promise<void> {
  if (usd === undefined) return
  latestUsage = { usd, at: at ?? (await now($)) }
}
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
/** MOD-42: a main-loop turn is known to be open (turn.start seen, its turn.complete not yet): a verdict's wake is held for its end. */
let turnOpen = false
/** MOD-42: wakes held while the brain's turn is open; a consistent verdict's carries its spawn, re-checked for merged just before delivery. */
/** MOD-62: `read` is set once a main-loop model step began after the entry was held: that step carried its row. */
let heldWakes: { text: string; ready: string; spawn?: SpawnRecord; seq: number; read?: boolean }[] = []
/** MOD-57: a counter ordering held wakes against delivered messages (the clock can tie); the last delivered message per agent id. */
let wakeSeq = 0
let messaged = new Map<string, { seq: number; at: number }>()
let idleTimer: { cancel: () => void } | undefined
let evalTimer: { cancel: () => void } | undefined
let debriefBusy = false
let evalBusy = false
let slotSeq = 0
const starting = new Map<number, string>() // slot token → the task label of a spawn holding a slot before $.agent.list shows it
/** MOD-23: slot token → the resources that spawn names, held from the claim until $.agent.list shows the worker. */
const startingResources = new Map<number, string[]>()
/** MOD-131 (#219): slot token → the tier of that spawn, held from the claim until $.agent.list shows the worker. */
const startingTiers = new Map<number, Tier>()
/** MOD-12: the queued tasks the mod has said `ready:` for and that are still ready; each is said once. */
const announced = new Set<string>()
/** MOD-56: the last worker of this session stopped on a usage limit (at, as ms; resetsAt as the hand-back wrote it); cleared by the brain's next spawn. */
let rateHeld: { at: number; resetsAt?: string } | undefined
/** MOD-15: label → ms the queued row became ready (the fallback's clock); a row leaves with the queue or when it is no longer ready. */
const readySince = new Map<string, number>()
/** MOD-15: ready rows the fallback has looked at past their timeout and will not start (repo=here, repo=none, an unreadable brief). */
const fallbackSkipped = new Set<string>()
let fallbackTimer: { cancel: () => void } | undefined
/** MOD-99: a briefed worker that is waiting without a hand-back, by agent id, and the timer that calls it stalled. */
const waitStates = new Map<string, WaitState>()
const waitTimers = new Map<string, { cancel: () => void }>()
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
/**
 * MOD-192: owner/name of the session root's origin, read from .git/config; '' when origin is not GitHub or not read yet.
 * MOD-204: set by land, land_plan, tree, status comments and merge finish, and it persists for the session. The allowlist passes the
 * gh close and comment shapes for it; what keeps a worker from those shapes is the worker gh guard, not the allowlist.
 */
let landRepo = ''
/** MOD-44: the tasks that work in another local repo, by id: the checkout, its own domains and the gate commands its tasks may run. Filled when a task is dispatched or judged. */
const taskRepos = new Map<string, { path: string; domains: string[]; gateTemplates: string[][] }>()
/** MOD-75: the task `/delegation merge` is working on, set only while that command runs (cleared in its finally); the allowlist's merge shapes pass for it alone. */
let mergeCtx: MergeCtx | undefined
/** MOD-143: the filled argv of the merge check running now (it passed the gate checker); the allowlist accepts exactly it, only while merge runs it. */
let mergeCheckArgvs: string[][] = []
const allowCfg = (): AllowConfig => ({ gateTemplates: [...(taskRepos.size > 0 ? [...cfg.gateTemplates, ...[...taskRepos.values()].flatMap(r => r.gateTemplates)] : cfg.gateTemplates), ...mergeCheckArgvs], ...(taskRepos.size > 0 ? { taskRepos: Object.fromEntries([...taskRepos.entries()].map(([id, r]) => [id, { path: r.path, domains: r.domains }])) } : {}), domains: cfg.domains, cardDir: cfg.cardDir, ...(cfg.issueRepo ? { issueRepo: cfg.issueRepo } : {}), ...(landRepo ? { landRepo } : {}), ...(effectiveProject() ? { project: effectiveProject() } : {}), ...(sessionRoot ? { root: sessionRoot } : {}), ...(cfg.worktreeRoot ? { worktreeRoot: cfg.worktreeRoot } : {}), ...(loadedRoot ? { pluginRoot: loadedRoot } : {}), ...(mergeCtx ? { merge: mergeCtx } : {}) })

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
/** MOD-240: spawnByAgent's per-agent results (kept 5 s), and the generation any spawn or agent-pointer write moves on, which also retires liveState's notes. */
const SPAWN_CACHE_MS = 5000
const spawnCache = new Map<string, { at: number; rec: SpawnRecord | undefined }>()
let spawnGen = 0
/** MOD-240: agentId → the generation at which liveState read the agent's spawn as closed (or found none). */
const liveNotes = new Map<string, { gen: number; kind: 'closed' | 'none' }>()
function agentKeyChanged(key: string): void {
  if (!key.startsWith(K.spawn('')) && !key.startsWith(K.agent(''))) return
  spawnCache.clear()
  spawnGen += 1
}
async function storeSet($: Host, key: string, value: unknown): Promise<void> {
  // a task's attempt records changed: the dashboard's copy is stale (GH-112)
  if (key.startsWith(K.tasks(''))) recordsCache = undefined
  // MOD-94: a remembered worker's record follows every write of it, whether or not the store takes the write
  if (key.startsWith(K.spawn(''))) rememberWrite(value)
  agentKeyChanged(key)
  try {
    await $.store.set(key, value)
  } catch (err) {
    debug($, `store.set ${key} failed: ${String(err)}`)
    await storeRefused($, key, err)
  }
}

/**
 * MOD-89 (#157): a refused set is said out loud. The first in a session is a toast and a row (a spawn record lost
 * this way leaves its worker with no verdict); later ones are only counted, for `/delegation`.
 */
let refusedWrites: { count: number; last: string } = { count: 0, last: '' }
async function storeRefused($: Host, key: string, err: unknown): Promise<void> {
  refusedWrites = { count: refusedWrites.count + 1, last: key }
  if (refusedWrites.count > 1) return
  const reason = (err instanceof Error ? err.message : String(err)).split('\n')[0] ?? ''
  const row = refusedRow(key, reason)
  try {
    $.ui.toast(`${PLUGIN}: ${row}`)
  } catch {
    // the row stands
  }
  await appendRow($, row)
}

/** Every key and value in the store, as `$.store` reads them (a key that fails to read is left out). */
async function storeEntries($: Host): Promise<StoreEntry[]> {
  const keys = await $.store.keys()
  const out: StoreEntry[] = []
  for (let i = 0; i < keys.length; i += 100) {
    const read = await Promise.all(keys.slice(i, i + 100).map(async k => [k, await $.store.get(k)] as const).map(p => p.catch(() => undefined)))
    for (const r of read) if (r && r[1] !== undefined) out.push(r)
  }
  return out
}

/**
 * MOD-89 (#157, #159): the retention plan (hooks/lib/retention.ts), run at session.start and after each verdict,
 * through `$.store.delete` only. The open tasks (a running worker, a pending verdict, a queued spawn) are never
 * touched. One debug line when anything went, and at session.start one row.
 */
let pruning: Promise<void> | undefined
function pruneStore($: Host, at: 'start' | 'verdict'): Promise<void> {
  if (pruning) return pruning
  pruning = pruneOnce($, at).finally(() => {
    pruning = undefined
  })
  return pruning
}
async function pruneOnce($: Host, at: 'start' | 'verdict'): Promise<void> {
  try {
    const entries = await storeEntries($)
    const live = await liveState($)
    const open = [...live.workers.flatMap(w => [w.label, w.spawn.task]), ...live.pending.map(p => p.task), ...(await readQueue($)).map(q => q.task), ...finalizing.keys()]
    const t = await now($)
    const sid = await sessionIdOf($)
    const keep = sid ? ['recent', 'debrief', 'friction', 'merged', 'notes'].map(f => `delegation.${f}.${sid}`) : []
    const plan = retentionPlan({ entries, open, now: t, keep })
    let n = 0
    const outsideFiles = new Map(entries.filter(([k]) => k.startsWith('delegation.outside.')).map(([k, v]) => [k, (v as { file?: unknown } | null)?.file] as const))
    for (const key of plan.delete) {
      try {
        // MOD-186: a research card's listing file goes with its record
        if (outsideFiles.has(key)) await dropOutsideFile($, outsideFiles.get(key))
        await $.store.delete(key)
        agentKeyChanged(key)
        n += 1
        if (key.startsWith(K.tasks(''))) recordsCache = undefined
      } catch (err) {
        debug($, `store.delete ${key} failed: ${String(err)}`)
      }
    }
    // MOD-233: a posted verdict a day old keeps one summary line, not its text (idempotent; same scan)
    const root = await sessionRootOf($)
    const gone = new Set(plan.delete)
    const slim = slimSpawns(entries.filter(([k]) => !gone.has(k)), t, s => attemptKeyIn(s as unknown as SpawnRecord, root))
    for (const w of slim.rewrite) {
      try {
        const cur = await storeGet<SpawnRecord>($, w.key)
        if (cur?.verdictBlock !== undefined && cur.verdictBlock === (entries.find(([k]) => k === w.key)?.[1] as SpawnRecord | undefined)?.verdictBlock) await storeSet($, w.key, w.value)
      } catch (err) {
        debug($, `spawn ${w.key} not slimmed: ${String(err)}`)
      }
    }
    for (const key of slim.drop) {
      try {
        await $.store.delete(key)
      } catch (err) {
        debug($, `store.delete ${key} failed: ${String(err)}`)
      }
    }
    if (n === 0) return
    const line = prunedLine(n, plan.before, plan.after)
    debug($, line)
    if (at === 'start') await appendRow($, line)
  } catch (err) {
    debug($, `store prune skipped: ${String(err)}`)
  }
}

/** `/delegation`: the store's size, and the refused writes of this session when there were any. */
async function storeStatusLines($: Host): Promise<string[]> {
  let size: string[] = []
  try {
    size = [storeLine(storeBytes(await storeEntries($)))]
  } catch (err) {
    debug($, `store size not read: ${String(err)}`)
  }
  return [...size, ...(refusedWrites.count > 0 ? [refusedWritesLine(refusedWrites.count, refusedWrites.last)] : [])]
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
    const usd = (await $.session.usage()).cost?.usd
    await noteUsd($, usd)
    return usd
  } catch {
    return undefined
  }
}

type RunOut = { ok: true; exitCode: number; stdout: string; stderr: string } | { ok: false; why: string }

/** The allowlist before any host command (run and spawnGate): the refusal, or undefined when the argv may run. */
async function refusal($: Host, argv: string[]): Promise<RunOut | undefined> {
  loadedRoot = $.plugin.root
  try {
    sessionRoot = (await $.session.root()).replace(/\/+$/, '')
  } catch {
    // no root: no issue form passes
  }
  const check = checkArgv(argv, allowCfg())
  if (check.ok) return undefined
  try {
    $.ui.log(refusedLine(argv, check.reason))
  } catch {
    // the refusal stands either way
  }
  return { ok: false, why: `refused: ${check.reason}` }
}

/** The ONLY way the mod runs a host command: a refused argv never reaches `$.process.run` (nor `$.process.spawn`, spawnGate). */
async function run($: Host, argv: string[], init?: { cwd?: string; env?: Record<string, string>; stdin?: string; timeoutMs?: number }): Promise<RunOut> {
  const refused = await refusal($, argv)
  if (refused) return refused
  try {
    // MOD-155: the host refuses a timeoutMs over 600000, so a longer gate limit runs at the host's ceiling
    const r = await $.process.run(argv, init?.timeoutMs !== undefined && init.timeoutMs > HOST_MAX_TIMEOUT_MS ? { ...init, timeoutMs: HOST_MAX_TIMEOUT_MS } : init)
    return { ok: true, exitCode: r.exitCode, stdout: r.stdout, stderr: r.stderr }
  } catch (err) {
    return { ok: false, why: String(err) }
  }
}

/** MOD-229: where each verifier's gate is (waiting for the engine-gate lock, or running), by task label, for the row and the verdict tool. */
const gateProgress = new Map<string, GateProgress>()

/**
 * MOD-229 (#323): a gate command as a spawned child, so the host's 10-minute cap on one `$.process.run` never
 * applies; the mod's own ceiling, gateTimeoutMinutes, ends it. The same allowlist as run and the same shape back,
 * stdout and stderr kept to 4 MiB each. At the ceiling the stream is closed, which kills the child, and the run reads
 * as not run: `gate ran past gateTimeoutMinutes (<n> min)`. Each pull of the stream is a `$` call, so the hook's
 * budget is not spent while the gate runs; the ceiling is a `$.clock.after` timer, not a clock wait. Commands other
 * than gates keep run.
 */
async function spawnGate($: Host, argv: string[], init: { cwd?: string; progress?: { key: string; id: string } } = {}): Promise<RunOut> {
  const refused = await refusal($, argv)
  if (refused) return refused
  const minutes = cfg.gateTimeoutMinutes
  const key = init.progress?.key
  let timer: { cancel: () => void } | undefined
  try {
    if (init.progress) gateProgress.set(init.progress.key, { phase: 'gate', id: init.progress.id, since: await now($) })
    const stream = $.process.spawn({ argv, ...(init.cwd !== undefined ? { cwd: init.cwd } : {}) })
    let fire = (): void => undefined
    const ceiling = new Promise<'ceiling'>(resolve => {
      fire = () => resolve('ceiling')
    })
    timer = $.clock.after(ceilingMs(minutes), () => fire())
    const out = gateOutput()
    for (;;) {
      const pull = stream.next()
      pull.catch(() => undefined)
      const got = await Promise.race([pull, ceiling])
      if (got === 'ceiling') {
        try {
          void stream.return(undefined as never).catch(() => undefined)
        } catch {
          // the child ends with the module at the latest
        }
        return { ok: false, why: pastCeiling(minutes) }
      }
      if (got.done) return { ok: true, exitCode: spawnExitCode(got.value), stdout: out.stdout(), stderr: out.stderr() }
      out.add(got.value.stream, got.value.text)
    }
  } catch (err) {
    return { ok: false, why: String(err) }
  } finally {
    timer?.cancel()
    if (key !== undefined) gateProgress.delete(key)
  }
}

// ---- part 5B: the repo file ---------------------------------------------------
/** MOD-73: HOME, where the user options file lives; '' when the environment does not say. */
async function homeDir($: Host): Promise<string> {
  try {
    return (await $.env.get('HOME')) ?? ''
  } catch {
    return ''
  }
}

/**
 * Reads `<root>/.chassis-delegation.json` and the user options file (when either changed) and
 * remakes the config: defaults < repo file < yours < the host's settings. `force` remakes it
 * though nothing changed (a /config row was just set).
 */
/** MOD-218: the repo file's `project` as the land add reads it: `owner/number`, `'none'`, or undefined when absent or not a value. */
let repoProject: string | undefined
/** The project land adds to: the repo file's value when it has one (`none` adds nothing), else the option. */
function effectiveProject(): { owner: string; number: number } | undefined {
  return repoProject === 'none' ? undefined : parseProject(repoProject ?? cfg.project)
}

/** MOD-241: the stat signature of the config files the last loadRepoConfig read; undefined when none is held. */
let repoSig: string | undefined
/** Each path's `mtime:size` (or `missing` on ENOENT; '' path is skipped) joined; undefined when any stat fails otherwise. */
async function configSignature($: Host, paths: string[]): Promise<string | undefined> {
  const parts: string[] = [paths[0] ?? '']
  for (const path of paths) {
    if (path === '') {
      parts.push('-')
      continue
    }
    try {
      const st = await $.fs.stat(path)
      parts.push(`${st.mtimeMs}:${st.size}`)
    } catch (err) {
      if (!isEnoent(err)) return undefined
      parts.push('missing')
    }
  }
  return parts.join('|')
}

async function loadRepoConfig($: Host, force = false): Promise<void> {
  let root: string
  try {
    root = await $.session.root()
  } catch {
    return
  }
  const home = await homeDir($)
  // MOD-241: the three files' stats (mtime and size, or 'missing') are compared with the last load's; all unchanged
  // returns with no fs.read. Accepted: an edit of identical size within the host's mtime resolution is missed.
  // Any stat error other than ENOENT leaves no signature, so the files are read, as before.
  const sig = await configSignature($, [`${root}/${REPO_CONFIG_FILE}`, home ? userOptionsPath(home) : '', `${$.plugin.root}/${PLUGIN_MANIFEST}`])
  if (!force && sig !== undefined && sig === repoSig) return
  repoSig = undefined
  const text = (await readText($, `${root}/${REPO_CONFIG_FILE}`)) ?? null
  const uText = home ? ((await readText($, userOptionsPath(home))) ?? null) : null
  // MOD-18: the manifest is read beside the repo file, so a moved issueRepo default (after an update) is seen
  let manifest: string | null = null
  try {
    manifest = (await readText($, `${$.plugin.root}/${PLUGIN_MANIFEST}`)) ?? null
  } catch {
    manifest = null
  }
  if (!force && text === repoText && manifest === modManifest && uText === userText) {
    repoSig = sig
    return
  }
  repoSig = sig
  const repoChanged = text !== repoText || manifest !== modManifest
  const userChanged = uText !== userText
  repoText = text
  modManifest = manifest
  // MOD-218: the repo file's own `project` (an owner/number or none) is read here and wins over the user-level option
  const repoProj = text === null ? { value: undefined, text: null } : repoProjectOf(text)
  repoProject = repoProj.value
  const parsed = text === null ? { config: {}, errors: [] } : parseRepoConfig(repoProj.text ?? text)
  repoLayer = parsed.config
  if (userChanged) {
    userText = uText
    const u = parseUserOptions(uText ?? undefined)
    userOpts = u.options
    // MOD-73: a malformed user file is said once (per change of its text), and ignored
    const where = userOptionsPath(home)
    for (const err of u.errors) debug($, `${where}: ${err}`)
    if (u.errors.length > 0) $.ui.toast(`${PLUGIN}: ${where}: ${u.errors[0]}${u.errors.length > 1 ? ` (+${u.errors.length - 1} more in the debug log)` : ''}`)
  }
  const next = readConfig(options, repoLayer, userOpts, lockedFields)
  cfg = next.cfg
  resolvedNow = next.resolved
  if (!repoChanged && !userChanged) return
  const errors = [...(repoChanged ? parsed.errors : []), ...next.errors]
  for (const err of errors) debug($, `${REPO_CONFIG_FILE}: ${err}`)
  if (errors.length > 0) $.ui.toast(`${PLUGIN}: ${REPO_CONFIG_FILE}: ${errors[0]}${errors.length > 1 ? ` (+${errors.length - 1} more in the debug log)` : ''}`)
}

// ---- MOD-44: a task for another local repo ---------------------------------------------------------
/** What the mod needs of another local repo for the tasks that name it: its config (when it has one), else its detected gate. */
type Target = {
  path: string
  name: string
  /** It has its own .chassis-delegation.json. */
  hasConfig: boolean
  /** Its gate map: the config's, else `{ test: <detected command> }`; empty when it has neither. */
  gateMap: Record<string, string>
  /** MOD-98: its config's gateMap entries the gate checker refused, id → why. */
  refusedGates: Record<string, string>
  /** The gate map came from detection (no config, or a config with no gateMap). */
  detected: boolean
  domains: string[]
  cardDir: string
  spendByTier: Effective['spendByTier']
  baseRef: string
  /** MOD-95: its own config's briefExtra (empty with no config), never the session's. */
  briefExtra: string
  /** MOD-124: its own config's briefLocal. */
  briefLocal: string
}

/** `repo` as a checkout of another local repo: its normalised path, or why it is refused. */
async function resolveRepo($: Host, value: string, root: string): Promise<{ path: string } | { error: string }> {
  const checked = repoPathCheck(value, await homeOf($), root)
  if ('error' in checked) return checked
  return (await exists($, `${checked.path}/.git`)) ? checked : { error: NOT_A_CHECKOUT }
}

/** setup's detectGate on another folder: the test command it already has (package.json scripts.test, pytest, cargo, go), or undefined. */
async function detectGateIn($: Host, dir: string): Promise<string | undefined> {
  const markers: string[] = []
  for (const m of ROOT_MARKERS) if (await exists($, `${dir}/${m}`)) markers.push(m)
  const packageJson = markers.includes('package.json') ? await readText($, `${dir}/package.json`) : undefined
  let pyTests = false
  try {
    pyTests = (await $.fs.list(`${dir}/tests`)).some(e => /^test_.*\.py$/.test(e.name))
  } catch {
    pyTests = false
  }
  const onPath: string[] = []
  if (markers.includes('pyproject.toml') || pyTests) {
    let path = ''
    try {
      path = (await $.env.get('PATH')) ?? ''
    } catch {
      path = ''
    }
    for (const d of path.split(':').filter(x => x !== '')) {
      if (await exists($, `${d.replace(/\/+$/, '')}/pytest`)) {
        onPath.push('pytest')
        break
      }
    }
  }
  return detectGate({ markers, ...(packageJson !== undefined ? { packageJson } : {}), pyTests, onPath } as unknown as SetupProbe)?.command
}

/** The checkout at `path` (already resolved): its config read fresh, its gate detected when the config names none. */
async function loadTarget($: Host, path: string): Promise<Target> {
  const text = await readText($, `${path}/${REPO_CONFIG_FILE}`)
  const parsed = text === undefined ? { config: {} as RepoConfig, errors: [] as string[] } : parseRepoConfig(text)
  for (const err of parsed.errors) debug($, `${path}/${REPO_CONFIG_FILE}: ${err}`)
  const eff = mergeConfig(parsed.config, {})
  let gateMap = eff.gateMap
  let detected = false
  if (Object.keys(gateMap).length === 0) {
    const found = await detectGateIn($, path)
    if (found) {
      gateMap = { test: found }
      detected = true
    }
  }
  return { path, name: repoFolderName(path), hasConfig: text !== undefined, gateMap, refusedGates: eff.refusedGates, detected, domains: eff.domains, cardDir: eff.cardDir, spendByTier: eff.spendByTier, baseRef: eff.baseRef, briefExtra: eff.briefExtra, briefLocal: eff.briefLocal }
}

/** Where a target's cards are: its own cardDir when it has a config, else the session's .delegation/cards/<its folder name>/. */
const targetCardsDir = (root: string, t: Target): string => (t.hasConfig ? cardDirPath(t.path, t.cardDir) : sessionCardsFor(root, t.path))

/** The gate a card names in a target's own terms: each id as its command, a one-off command as itself. */
const gateCommands = (t: Target, ids: readonly string[]): string => ids.map(g => t.gateMap[g] ?? g).join(', ')

/** `repo: <path> (config: its own | none, gate: <cmd>)`: what the dry run prints. */
const repoLine = (t: Target, ids: readonly string[]): string => `repo: ${t.path} (config: ${t.hasConfig ? 'its own' : 'none'}, gate: ${gateCommands(t, ids) || '(none)'})`

/** The commands a card's one-off gate entries name: those that are not ids in the target's gate map and pass the gate rules. */
const oneOffGates = (t: Target, ids: readonly string[]): string[][] =>
  ids.filter(g => t.gateMap[g] === undefined && /\s/.test(g)).flatMap(g => {
    const parsed = gateCommandTemplates(g)
    return 'templates' in parsed ? parsed.templates : []
  })

/** Lets the allowlist see this task's repo: `git -C <path> worktree add` for the task, and the repo's gate commands. */
function registerTaskRepo(task: string, t: Target, gateIds: readonly string[]): void {
  const templates = [...gateTemplatesOf(t.gateMap), ...oneOffGates(t, gateIds)]
  taskRepos.set(task, { path: t.path, domains: t.domains, gateTemplates: templates })
}

/**
 * MOD-44: the other repo a brief names (`repo=<abs path>`), loaded and registered with the allowlist; undefined for a
 * brief of the session's own repo (or `repo=here|none`). A brief written before MOD-44 may hold `repo=<worktree dir>`:
 * that is read as a checkout too, harmlessly (it only lets that task name that folder).
 */
async function adoptRepo($: Host, task: string, header: BriefHeader | undefined): Promise<Target | undefined> {
  const value = header?.repo
  if (!value || !value.startsWith('/')) return undefined
  let root = ''
  try {
    root = (await $.session.root()).replace(/\/+$/, '')
  } catch {
    return undefined
  }
  const path = value.replace(/\/+$/, '')
  if (path === root) return undefined
  const t = await loadTarget($, path)
  registerTaskRepo(task, t, (header?.gate ?? '').split(',').map(g => g.trim()).filter(Boolean))
  return t
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

// ---- MOD-201: the land nudge ---------------------------------------------------------
/** A person's prompt that described work, waiting for the turn's end: first 80 characters and the time. */
let landPending: { text: string; at: number } | undefined
/** The nudge lines the band shows: the prompt one, and the parent one a merge finish set. */
let landLine: string | undefined
let parentLine: string | undefined

/** A land, land_plan, card, dispatch, verdict or merge call was seen: the turn is driving work, so the prompt nudge clears (MOD-210). The parent line is cleared by all but verdict and merge (a merge finish sets it after). */
function landSeen($: Host, tool: 'land' | 'land_plan' | 'card' | 'dispatch' | 'verdict' | 'merge') {
  const had = landLine !== undefined || parentLine !== undefined
  landPending = undefined
  landLine = undefined
  if (tool !== 'verdict' && tool !== 'merge') parentLine = undefined
  if (had) redraw($)
}

// ---- GH-112: the live dashboard (the band above the prompt and the pane) -----------
function redraw($: Host) {
  try {
    $.ui.invalidate('ui.render')
  } catch {
    // a view only
  }
}

// ---- MOD-128: the rationing meter ----------------------------------------------------
type HostLimit = { kind: string; percentUsed: number; resetsAt?: number }
/** The latest window readings the host pushed, resetsAt in ms (the host sends epoch seconds). */
let rateNow: RationWindow[] = []
/** The readings the store last took, as a signature: a measure that changes nothing writes nothing. */
let rateSig = ''
/** The first measure of a session also reads $.session.usage(), so the footer does not wait for a whole-point move. */
let rateFirstDone = false
/** The meter's model, kept 5 s so a redraw does not read the store; a fold clears it. */
let rationCache: { at: number; key: string; model: RationModel | undefined } | undefined

const windowsOf = (rl: readonly HostLimit[] | undefined): RationWindow[] =>
  (rl ?? []).flatMap(r =>
    r && typeof r.kind === 'string' && Number.isFinite(r.percentUsed) && typeof r.resetsAt === 'number' && Number.isFinite(r.resetsAt)
      ? [{ kind: r.kind, percentUsed: r.percentUsed, resetsAt: Math.round(r.resetsAt * 1000) }]
      : [],
  )

/** session.measure: fold each reported window into today's record, keep the readings, redraw the band. */
async function foldRation($: Host, reported: readonly HostLimit[] | undefined): Promise<void> {
  const windows = windowsOf(reported)
  if (!rateFirstDone) {
    rateFirstDone = true
    try {
      for (const w of windowsOf((await $.session.usage()).rateLimits as readonly HostLimit[] | undefined)) if (!windows.some(x => x.kind === w.kind)) windows.push(w)
    } catch {
      // the event's readings stand alone
    }
  }
  if (windows.length === 0) return
  const sig = JSON.stringify(windows.map(w => [w.kind, w.percentUsed, w.resetsAt]))
  if (sig === rateSig) return
  rateSig = sig
  rateNow = [...rateNow.filter(x => !windows.some(w => w.kind === x.kind)), ...windows]
  rationCache = undefined
  const t = await now($)
  for (const w of windows) {
    const key = rationKey(w.kind, t)
    const prev = parseRecord(await storeGet($, key))
    const next = dayRecord(prev, w, t)
    if (JSON.stringify(next) !== JSON.stringify(prev)) await storeSet($, key, next)
  }
  redraw($)
}

type RationModel = {
  window: RationWindow
  record: DayRecord
  allow: number
  extra: number
  pace: string
  now: number
  idx: number
  /** The records of the window's days in cell order (a seven-day window only); today's is the model's own. */
  days: (DayRecord | undefined)[]
  shares: (r: DayRecord | undefined) => number
}

/** The chosen window's meter now, or undefined: ration off, no reading, or a reading whose window has reset. */
async function rationModel($: Host): Promise<RationModel | undefined> {
  if (cfg.ration === 'off') return undefined
  const window = rateNow.find(w => w.kind === cfg.ration)
  const t = await now($)
  if (!window || window.resetsAt <= t) return undefined
  const key = `${cfg.ration}|${cfg.rationDaily}|${window.percentUsed}|${window.resetsAt}`
  if (rationCache && rationCache.key === key && t - rationCache.at < 5000) return rationCache.model
  const segs = segments(window.kind)
  const idx = dayIndex(t, window.resetsAt, segs)
  const prev = parseRecord(await storeGet($, rationKey(window.kind, t)))
  const record = dayRecord(prev, window, t)
  const days: (DayRecord | undefined)[] = []
  if (segs === 7) {
    for (let cell = 1; cell < idx; cell++) {
      const r = parseRecord(await storeGet($, `delegation.ration.${window.kind}.${cellDay(t, idx, cell)}`))
      days.push(inWindow(r, window.resetsAt) ? r : undefined)
    }
  }
  const option = { rationDaily: cfg.rationDaily }
  const extra = surplus(days.filter((r): r is DayRecord => r !== undefined), cfg.rationDaily)
  const allow = allowance(record, option) + extra
  const model: RationModel = {
    window,
    record,
    allow,
    extra,
    pace: pace(record, allow, t),
    now: t,
    idx,
    days: [...days, record],
    shares: r => (cfg.rationDaily > 0 ? cfg.rationDaily : r ? allowance(r, option) : allow),
  }
  rationCache = { at: t, key, model }
  return model
}

const rationLabel = (m: RationModel): string => rationText(m.window, m.record, m.allow, m.pace, m.now, m.extra)

/** `/delegation ration`: the bar line with the reset, today's line, and the window's days so far. */
async function rationReportText($: Host): Promise<string> {
  if (cfg.ration === 'off') return 'ration: off (turn it on with /delegation config ration seven_day)'
  const m = await rationModel($)
  if (!m) return `ration: no reading yet for the ${cfg.ration} window (the host sends it after a turn)`
  return rationReport(m.window, m.record, m.allow, m.pace, m.now, m.days, m.extra)
}

/** The `/delegation` summary's one `ration:` line; none without a reading. */
async function rationSummary($: Host): Promise<string[]> {
  try {
    const m = await rationModel($)
    return m ? [`ration: ${rationLabel(m)}`] : []
  } catch {
    return []
  }
}

/** The Spend tile's windows: the chosen one when the host reported it, else every one reported. */
const rateLimitsShown = (): { kind: string; percentUsed: number }[] => {
  const chosen = rateNow.filter(w => w.kind === cfg.ration)
  return (chosen.length > 0 ? chosen : rateNow).map(w => ({ kind: w.kind, percentUsed: Math.round(w.percentUsed) }))
}

/** What the pane draws under the Spend tile: the day cells (a seven-day window), the bar, and `59% left · resets 2d 4h`. */
async function rationPane($: Host): Promise<PaneView['ration']> {
  const m = await rationModel($)
  if (!m) return undefined
  const segs = segments(m.window.kind)
  const cells = segs === 7 ? daySegments(Array.from({ length: segs }, (_, i) => m.days[i]), m.idx, m.shares) : undefined
  return {
    ...(cells ? { cells } : {}),
    text: `${Math.max(0, 100 - Math.round(m.window.percentUsed))}% left · resets ${resetsIn(m.window.resetsAt - m.now)}`,
    tail: rationLabel(m).replace(/^.*? · (today )/, '$1'),
    bar: bar(m.window.percentUsed, segs),
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
    if (Array.isArray(list)) out.push(...readRetired($, key, list).filter(r => r.kind !== 'review'))
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
/**
 * MOD-47: the brain record is kept in the store, under the conversation's start time
 * (`$.session.usage().startedAt`: a resume keeps it, `/clear` starts it over), not in
 * `$.state`. `$.state` is held for one session: a resume gets a new session id and an
 * empty state, and a session that loads a new copy of the mod starts empty too, so a
 * record kept there lost every turn before the change. `$.state` stays as the view.
 */
async function brainKey($: Host): Promise<string> {
  let since = 0
  try {
    since = (await $.session.usage()).startedAt ?? 0
  } catch {
    // unknown: one record for the unknown start
  }
  return K.brain(since)
}

async function readBrain($: Host): Promise<BrainRecord | undefined> {
  const kept = await storeGet<BrainRecord>($, await brainKey($))
  if (kept && typeof kept === 'object') return kept
  try {
    const { value } = await $.state.get(BRAIN)
    return value && typeof value === 'object' ? (value as BrainRecord) : undefined
  } catch {
    return undefined
  }
}

async function updateBrain($: Host, fn: (r: BrainRecord | undefined) => BrainRecord) {
  try {
    const next = fn(await readBrain($))
    await storeSet($, await brainKey($), next)
    await $.state.set(BRAIN, next)
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
    const list = sessionRecords(readRetired($, K.adhoc, (await storeGet<AttemptRecord[]>($, K.adhoc)) ?? []), since, who)
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

// ---- MOD-48: what the brain's driving costs it ------------------------------------------
/** The drive counts ride in the brain record (the manifest declares no state key of their own). */
type WithDrive = BrainRecord & { drive?: DriveRecord }
/** The Bash commands of the brain's open turn, and whether the drive warn row has spoken. */
let driveWatch: Watch = emptyWatch()
/** The calls the brain's open turn has made. */
let driveTurnCalls = 0

const readDrive = async ($: Host): Promise<DriveRecord | undefined> => ((await readBrain($)) as WithDrive | undefined)?.drive

/** A brain-record update that keeps the drive counts a brainTurn would drop. */
const keepDrive = (fn: (r: BrainRecord | undefined) => BrainRecord) => (r: BrainRecord | undefined): BrainRecord => ({ ...fn(r), ...((r as WithDrive | undefined)?.drive ? { drive: (r as WithDrive).drive } : {}) }) as BrainRecord

async function updateDrive($: Host, fn: (r: DriveRecord | undefined) => DriveRecord) {
  await updateBrain($, r => ({ ...(r ?? emptyBrain()), drive: fn((r as WithDrive | undefined)?.drive) }) as BrainRecord)
}

/** The brain's context now, in tokens: the window times the percent `session.usage` reports. */
async function brainContextTokens($: Host): Promise<number> {
  try {
    const c = (await $.session.usage()).context
    return c ? Math.round((c.window * c.percent) / 100) : 0
  } catch {
    return 0
  }
}

/** MOD-48: a main-loop call is counted by kind; a Bash command the brain keeps re-running or polling at a large context raises one row a turn. */
async function driveGuard($: Host, e: { tool: unknown; agentId?: string }): Promise<void> {
  const tool = String(e.tool)
  if (e.agentId) return
  try {
    const input = e as unknown as Record<string, unknown>
    const command = tool === 'Bash' && typeof input.command === 'string' ? input.command : ''
    const writes = command !== '' && bashWrites(command, await $.session.root(), (await $.env.get('HOME')) || undefined).paths.length > 0
    const kind = callKind(tool, input, writes, command !== '' && ranBefore(driveWatch, command))
    if (kind === undefined) return
    driveTurnCalls += 1
    await updateDrive($, r => driveCall(r, kind))
    if (command === '') return
    await loadRepoConfig($)
    const model = (await $.session.model().catch(() => undefined)) || undefined
    // MOD-99 (#165): the resources a running card declares, and whether a worker is running for the brain to wait on
    const running = cfg.driveWarn ? (await liveState($)).workers : []
    const resources = [...new Set(running.flatMap(w => w.spawn.resources ?? []))]
    const step = driveStep(driveWatch, { command, context: cfg.driveWarn ? await brainContextTokens($) : 0, threshold: cfg.driveWarnTokens, model, enabled: cfg.driveWarn, resources, waitingOnWorker: running.length > 0 })
    driveWatch = step.state
    if (step.row) await appendRow($, step.row)
  } catch (err) {
    debug($, `drive call not counted: ${String(err)}`)
  }
}

/** MOD-53: when the brain's own turn ends at or above freshSessionTokens, one row a session says a fresh session is cheaper. */
async function freshSessionGuard($: Host): Promise<void> {
  try {
    await loadRepoConfig($)
    if (!(cfg.freshSessionTokens > 0)) return
    const row = freshSessionRow(await brainContextTokens($), cfg.freshSessionTokens)
    if (!row) return
    const key = K.freshSession(await $.session.id())
    if (await storeGet<boolean>($, key)) return
    await storeSet($, key, true)
    await appendRow($, row)
  } catch (err) {
    debug($, `fresh-session check skipped: ${String(err)}`)
  }
}

/** MOD-217: the most paths one worker's write log holds. */
const WRITE_LOG_CAP = 2000

/**
 * MOD-217: a recorded worker's Edit, Write, MultiEdit and NotebookEdit file_path, and the paths bashWrites finds in
 * a Bash command, resolved against the worker's cwd, are added to its write log (capped). A reviewer, an ad hoc
 * agent and an unrecorded agent log nothing. Never throws: a call that cannot be logged is debug.
 */
async function noteWrites($: Host, e: { tool: unknown; agentId?: string }): Promise<void> {
  const tool = String(e.tool)
  if (!e.agentId || !(WRITE_TOOLS.includes(tool) || tool === 'Bash')) return
  try {
    const spawn = await spawnByAgent($, e.agentId)
    if (!spawn || spawn.adhoc || spawn.review) return
    const input = e as unknown as Record<string, unknown>
    const cwd = await bashCwd($, e.agentId)
    const home = (await $.env.get('HOME')) || undefined
    const raw = tool === 'Bash' ? bashWrites(typeof input.command === 'string' ? input.command : '', cwd, home).paths : toolPath(input)
    const paths = raw.flatMap(p => {
      const abs = isAbsolute(p) ? p : `${cwd.replace(/\/+$/, '')}/${p}`
      const n = normalizePath(abs)
      return n === undefined ? [] : [n]
    })
    if (paths.length === 0) return
    const key = K.writes(e.agentId)
    const had = (await storeGet<string[]>($, key)) ?? []
    const log = [...new Set([...had, ...paths])].slice(0, WRITE_LOG_CAP)
    if (log.length > had.length) await storeSet($, key, log)
  } catch (err) {
    debug($, `write log not kept: ${String(err)}`)
  }
}

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
/** MOD-229: an owed row's state while its verifier's gate runs: `verifying (gate test running 3 min)`. */
function withGateProgress<R extends { task: string; kind: string; state: string }>(row: R, t: number): R {
  if (row.kind !== 'owed') return row
  for (const [label, p] of gateProgress) if (row.task === label || row.task.startsWith(`${label} `)) return { ...row, state: gateProgressText(p, t) }
  return row
}

async function liveModel($: Host): Promise<{ view: LiveView; since: number; records: AttemptRecord[]; running: { label: string; alias: string; tier: string; at: number; repo?: string }[]; waits: ReadonlyMap<string, ResourceWait>; tierHeld: ReadonlyMap<string, Tier> }> {
  const t = await now($)
  const live = await liveState($)
  const queue = await readQueue($)
  let since = 0
  let usd = 0
  let ctx: number | undefined
  try {
    const u = await $.session.usage()
    since = u.startedAt ?? 0
    ctx = u.context.percent
    await noteUsd($, u.cost?.usd, t)
  } catch {
    // unknown: the series and the records still draw
  }
  usd = latestUsage?.usd ?? 0
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
  const queuePlan = await planOfQueue($, live, queue)
  const waits = queuePlan.waits
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
    labels: await liveLabels($, live.workers),
    ...(ctx !== undefined ? { ctx } : {}),
    ...(brain ? { brain } : {}),
  })
  // MOD-229: a row whose verdict is owed while its gate runs (or waits for the engine gate) says so, with the minutes
  if (gateProgress.size > 0) view.rows = view.rows.map(r => withGateProgress(r, t))
  return { view, since, records, running: live.workers.map(w => ({ label: w.label, alias: w.spawn.alias, tier: w.spawn.tier, at: w.spawn.at ?? t, ...(w.spawn.repo ? { repo: w.spawn.repo } : {}) })), waits, tierHeld: queuePlan.tierHeld ?? new Map() }
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

// ---- usage ------------------------------------------------------------------
/** The session's dollars, noted for the band and the dashboard. MOD-128: the host status line is retired; nothing is pinned. */
async function noteUsage($: Host) {
  try {
    const u = await $.session.usage()
    await noteUsd($, u.cost?.usd, await now($))
  } catch {
    // leave them unknown
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
async function ownerFields($: Host, repo?: string): Promise<{ sessionId?: string; root?: string }> {
  const sessionId = await sessionIdOf($)
  let root = ''
  try {
    root = await $.session.root()
  } catch {
    // no repo
  }
  // MOD-44: a task for another local repo records that repo as its root
  if (repo) root = repo
  return { ...(sessionId ? { sessionId } : {}), ...(root ? { root } : {}) }
}
/** The session root, '' when there is none. */
async function sessionRootOf($: Host): Promise<string> {
  try {
    return await $.session.root()
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
  pending: { task: string; agentId?: string; repo?: string }[]
  queued: number
}

const isOpen = (s: SpawnRecord): boolean => s.verdictAttempt !== s.attempt

/** The session's delegation as it stands; `exclude` is an agent whose turn just ended. */
async function liveState($: Host, exclude?: string): Promise<Live> {
  const out: Live = { running: 0, workers: [], pending: [], queued: 0 }
  for (const a of await agentList($)) {
    if (a.id === exclude) continue
    // MOD-240: a spawn read as closed (or absent) and no spawn or agent write since: nothing to read unless the agent is running
    const note = liveNotes.get(a.id)
    if (note && note.gen === spawnGen && (note.kind === 'none' || a.status !== 'running')) continue
    const gen = spawnGen
    const spawn = await spawnByAgent($, a.id)
    if (!spawn) {
      liveNotes.set(a.id, { gen, kind: 'none' })
      continue
    }
    if (!isOpen(spawn)) liveNotes.set(a.id, { gen, kind: 'closed' })
    else liveNotes.delete(a.id)
    const label = taskLabel(spawn.task, spawn.subtask)
    if (a.status === 'running') {
      out.running += 1
      // MOD-21: a running reviewer holds no worker slot; its task's verdict is pending until it hands back
      if (spawn.review) {
        if (isOpen(spawn)) out.pending.push({ task: label, agentId: a.id })
      } else if (!spawn.adhoc && isOpen(spawn)) out.workers.push({ label, agentId: a.id, spawn })
    } else if (a.status === 'completed' && !spawn.adhoc && isOpen(spawn)) out.pending.push({ task: label, agentId: a.id, ...(spawn.repo ? { repo: spawn.repo } : {}) })
  }
  for (const key of finalizing.keys()) {
    // MOD-117: the key names the card's repo (`<label>@<repo>…`); the pending row is the label's
    const label = (key.split(':')[0] ?? key).replace(/@\/[^@]*/, '')
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
async function claimSlot($: Host, item: QueuedSpawn, label: string, claim = true, wants: readonly string[] = [], tier: Tier = 'standard', s?: Stopper): Promise<{ token?: number } | { deny: string }> {
  // MOD-92: a stopped spawn decision leaves the lock at its next step (or its pending one), holding no slot
  const step = <T>(p: Promise<T>): Promise<T> => (s ? s.race(p) : p)
  return withLock(async () => {
    s?.check()
    if ([...starting.values()].includes(label)) return { deny: runningDeny(label) }
    const live = await step(liveState($))
    const others = startingOthers(starting.values(), label)
    const holders = [...(await step(liveLabels($, live.workers))), ...others]
    const queue = await step(readQueue($))
    s?.check()
    // MOD-23: a resource a running attempt (or a spawn starting) holds queues the task whether or not a slot is free
    const blocked = resourceBlock(wants, heldResources(live.workers), label)
    // MOD-131 (#219): the workers of each tier running or starting (a spawn's own token is not counted against it)
    const heldByTier = countTiers([...live.workers.map(w => w.spawn.tier), ...[...starting.entries()].filter(([, l]) => l !== label).flatMap(([token]) => startingTiers.get(token) ?? [])])
    const totalFree = hasSlot(live.workers.length, others.length, cfg.maxWorkers)
    // the tier's own cap is what holds it only when the total has room
    const tierHolds = totalFree && tierFull(tier, cfg.maxWorkersByTier, heldByTier)
    if (!blocked && totalFree && !tierHolds) {
      if (!claim) return {}
      slotSeq += 1
      starting.set(slotSeq, label)
      startingResources.set(slotSeq, [...wants])
      startingTiers.set(slotSeq, tier)
      return { token: slotSeq }
    }
    const slotTier = tierHolds ? tier : undefined
    // MOD-145 (#234): the limit that is full, and the layer of the config it came from
    const limit = slotTier ? limitSourceText(`maxWorkersByTier.${slotTier}`, cfg.maxWorkersByTier[slotTier], resolvedNow?.sources.maxWorkersByTier ?? 'default') : limitSourceText('maxWorkers', cfg.maxWorkers, resolvedNow?.sources.maxWorkers ?? 'default')
    const entered = enqueue(queue, item)
    // MOD-44: a task for another local repo shows that repo's folder name beside it
    const shown = withRepoName(label, item.repo, sessionRoot)
    // MOD-219/MOD-222: where a lane stands in the queue, and which cap (a tier's, or the total maxWorkers) holds it
    const capHeld = (position: number, of: number) => ({ position, of, cap: slotTier ? cfg.maxWorkersByTier[slotTier] ?? 0 : cfg.maxWorkers })
    if (entered.existing) {
      const kept = entered.existing
      return { deny: blocked ? resourceDeny(shown, blocked.resource, blocked.holder, kept) : alreadyQueuedDeny(shown, kept.at, kept.position, slotTier, limit, capHeld(kept.position, queue.length)) }
    }
    await writeQueue($, entered.queue)
    if (blocked) {
      debug($, `queued ${label}: ${blocked.holder} holds resource ${blocked.resource}`)
      return { deny: resourceDeny(shown, blocked.resource, blocked.holder) }
    }
    debug($, slotTier ? `queued ${label}: ${heldByTier[slotTier] ?? 0} workers hold the ${cfg.maxWorkersByTier[slotTier]} ${slotTier} slots` : `queued ${label}: ${holders.length} workers hold the ${cfg.maxWorkers} slots`)
    return { deny: queuedDeny(shown, holders, entered.queue.map(q => withRepoName(taskLabel(q.task, q.subtask ?? 'main'), q.repo, sessionRoot)), slotTier, limit, capHeld(queuedIndex(entered.queue, item.task, item.subtask ?? 'main') + 1, entered.queue.length)) }
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
const queuedResourceCache = new Map<string, { resources: string[]; tier: Tier }>()
async function queuedHeader($: Host, q: QueuedSpawn): Promise<{ resources: string[]; tier: Tier }> {
  const key = `${queuedLabel(q)}@${q.at}`
  const known = queuedResourceCache.get(key)
  if (known) return known
  const path = findBriefPath(q.prompt)
  const text = path ? await readText($, path) : undefined
  const header = (text !== undefined ? parseHeader(text) : undefined) ?? parseHeader(q.prompt)
  // MOD-131 (#219): the row's tier is its brief header's tier=, standard when unreadable
  const read = { resources: resourcesOf(header), tier: tierOf(header?.tier) ?? 'standard' }
  queuedResourceCache.set(key, read)
  return read
}

/**
 * MOD-23: which queued rows are ready (head first, as many as the slots free, none whose resource a running attempt
 * or a row ahead of it holds) and which wait for a resource, and for whom.
 */
async function planOfQueue($: Host, live: Live, queue: readonly QueuedSpawn[]): Promise<{ ready: string[]; waits: Map<string, ResourceWait>; tierHeld?: Map<string, Tier> }> {
  const names = new Set(queue.map(q => `${queuedLabel(q)}@${q.at}`))
  for (const key of [...queuedResourceCache.keys()]) if (!names.has(key)) queuedResourceCache.delete(key)
  const wants: Wanting[] = []
  for (const q of queue) {
    const h = await queuedHeader($, q)
    wants.push({ label: queuedLabel(q), resources: h.resources, tier: h.tier })
  }
  // MOD-131 (#219): the free slots of each capped tier, from the workers running and the spawns still starting
  const held: TierCounts = countTiers([...live.workers.map(w => w.spawn.tier), ...[...starting.keys()].flatMap(token => startingTiers.get(token) ?? [])])
  return planQueue(wants, heldResources(live.workers), readyCount(live.workers.length, starting.size, cfg.maxWorkers), tierFree(cfg.maxWorkersByTier, held))
}

const hhmm = (ms: number): string => {
  const d = new Date(ms)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
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
  // MOD-56: while the last worker stopped on a usage limit, a queued task is held, not announced ready (nothing is marked announced)
  if (rateHeld) {
    const at = hhmm(rateHeld.at)
    return ready.map(r => heldLine(r.label, at, rateHeld?.resetsAt))
  }
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
      if (rateHeld) break // MOD-56: the mod does not start a task into a usage limit
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

/** MOD-99: the worker is no longer waiting (it resumed or handed back): the next wait speaks again. */
function clearWait(agentId: string | undefined): void {
  if (!agentId) return
  waitStates.delete(agentId)
  waitTimers.get(agentId)?.cancel()
  waitTimers.delete(agentId)
}

/** MOD-99: the resource a waiting worker's card names and another live worker holds, if any. */
async function waitHeldBy($: Host, spawn: SpawnRecord, label: string): Promise<{ resource: string; holder: string } | undefined> {
  const wants = spawn.resources ?? []
  if (wants.length === 0) return undefined
  try {
    const live = await liveState($, spawn.agentId)
    return resourceBlock(wants, heldResources(live.workers), label)
  } catch {
    return undefined
  }
}

/**
 * MOD-99 (#161): one sighting of a briefed worker waiting without a hand-back. The first starts the state and wakes
 * the brain with what it waits on; every repeat in that state is held (debug log only); past waitStallMin it says
 * once that the worker is stalled. A timer calls the stall even when the worker goes silent.
 */
async function noteWait($: Host, spawn: SpawnRecord, agentId: string): Promise<void> {
  const label = taskLabel(spawn.task, spawn.subtask)
  const t = await now($)
  const prev = waitStates.get(agentId)
  const step = waitStep(prev, t, cfg.waitStallMs / MIN_MS, label, prev ? undefined : await waitHeldBy($, spawn, label))
  waitStates.set(agentId, step.state)
  if (step.say === undefined) {
    debug($, `${label} still waiting: wake held`)
    return
  }
  const row = `${PLUGIN}: ${step.say}`
  await appendRow($, row)
  await wakeBrain($, row)
  if (!prev && cfg.waitStallMs > 0) {
    try {
      waitTimers.set(agentId, $.clock.after(cfg.waitStallMs, () => void stallCheck($, spawn, agentId)))
    } catch (err) {
      debug($, `${label}: stall timer not armed: ${String(err)}`)
    }
  }
}

/** MOD-99: the timer's look at a waiting worker: still waiting and past the ceiling, it is called stalled once. */
async function stallCheck($: Host, spawn: SpawnRecord, agentId: string): Promise<void> {
  waitTimers.delete(agentId)
  if (!waitStates.has(agentId)) return
  try {
    await noteWait($, spawn, agentId)
  } catch (err) {
    debug($, `stall check failed: ${String(err)}`)
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
async function wakeBrain($: Host, text: string, spawn?: SpawnRecord, ready = ''): Promise<void> {
  if (!cfg.wakeOnVerdict || (text === '' && ready === '')) return
  // MOD-42: while the brain's turn is open the engine would deliver this only after it, so hold it for the turn's end
  // MOD-51: the held entry keeps the verdict row and its ready lines apart, so a dropped verdict leaves the ready lines
  if (turnOpen) {
    heldWakes.push({ text, ready, seq: ++wakeSeq, ...(spawn ? { spawn } : {}) })
    return
  }
  await submitWake($, [text, ready].filter(Boolean).join('\n'))
}

async function submitWake($: Host, text: string): Promise<void> {
  try {
    await $.prompt.submit({ text })
  } catch (err) {
    debug($, `brain not woken: ${String(err)}`)
  }
}

/**
 * MOD-42: the brain's turn ended: submit the held wakes as one message. MOD-57: a verdict wake is also dropped when the brain messaged its worker after the wake was held. MOD-51: a held verdict (any kind) is dropped when
 * its task has a later attempt, or is merged or accepted by now; its `ready:` lines are still delivered.
 */
async function flushWakes($: Host): Promise<void> {
  const held = heldWakes
  heldWakes = []
  const sent = messaged
  messaged = new Map()
  const keep: string[] = []
  for (const h of held) {
    const spawn = h.spawn
    if (h.read) {
      // MOD-62: a later main-loop step of this turn carried the row (and its ready lines): the brain has read it
      debug($, `wake skipped: ${spawn ? taskLabel(spawn.task, spawn.subtask) : 'row'} read in the turn`)
      continue
    }
    let drop = false
    if (spawn && h.text !== '') {
      const label = taskLabel(spawn.task, spawn.subtask)
      const later = spawn.adhoc || spawn.review ? undefined : supersededBy(await loadAttempts($, spawn), spawn.subtask, spawn.attempt, laneOf(spawn))
      if (later !== undefined) {
        debug($, `wake skipped: ${label} attempt ${spawn.attempt} superseded by attempt ${later}`)
        drop = true
      } else if (await alreadyMerged($, spawn, true, true)) {
        debug($, `wake skipped: ${label} merged before delivery`)
        drop = true
      } else if (spawn.agentId && (sent.get(spawn.agentId)?.seq ?? 0) > h.seq) {
        // MOD-57: the brain resumed this worker after the wake was held; its next hand-back is the verdict that matters
        debug($, `wake skipped: ${label} attempt ${spawn.attempt}: the brain already messaged its worker`)
        drop = true
      }
    }
    if (!drop && h.text !== '') keep.push(h.text)
    if (h.ready !== '') keep.push(h.ready)
  }
  if (keep.length > 0) await submitWake($, keep.join('\n'))
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
type CostRecord = { attempt: number; spend: Spend; warned?: true; stopped?: true; /** MOD-47: the turns already added (turn id and counts), so one turn delivered twice counts once. */ seen?: string[] }

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
async function trackSpend($: Host, spawn: SpawnRecord, e: { agentId: string; usage?: TurnUsage; answer: string; turnId?: string }): Promise<boolean> {
  if (!e.usage) return false
  const prior = await storeGet<CostRecord>($, K.cost(e.agentId))
  const rec: CostRecord = prior && prior.attempt === spawn.attempt ? prior : { attempt: spawn.attempt, spend: undefined as unknown as Spend }
  // MOD-47: a turn the record already holds (same turn id, same counts) is not added again
  const key = turnKey(e.turnId, e.usage)
  if (key !== undefined && rec.seen?.includes(key)) return false
  const spend = addTurn(rec.spend, { ...e.usage, model: e.usage.model || spawn.resolvedModel })
  const next: CostRecord = { ...rec, spend, ...(key !== undefined ? { seen: [...(rec.seen ?? []), key].slice(-200) } : {}) }
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
    const records = patchRecord(await loadAttempts($, spawnIn), spawnIn.subtask, spawnIn.attempt, { verdict: 'over-spend', usd: own, verdictAt: t }, lane)
    await saveAttempts($, spawnIn, records)
    judged = attemptsFor(records, spawnIn.subtask, lane).find(r => r.attempt === spawnIn.attempt)
  }
  const row = overSpendLine({ label, task: spawnIn.task, attempt: spawnIn.attempt, budget: spawnIn.budget, usd: own, spend: ceiling })
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawnIn.key))) ?? spawnIn
  await storeSet($, K.spawn(spawnIn.key), { ...latest, verdictAttempt: spawnIn.attempt, lastFailed: false, verdictBlock: row })
  await setWorkers($, list => list.map(w => (w.task === spawnIn.task && w.subtask === spawnIn.subtask && w.attempt === spawnIn.attempt ? { ...w, verdict: 'over-spend' } : w)))
  const next = OVER_SPEND_NEXT(spawnIn.task)
  await setLastVerdict($, { task: label, attempt: spawnIn.attempt, verdict: 'over-spend', next, at: t, text: row })
  await noteRecent($, { task: label, attempt: spawnIn.attempt, verdict: 'over-spend', line: row, at: t, owed: `${label}: ${next}` })
  await appendLedger($, { ...(judged ?? { task: spawnIn.task, subtask: spawnIn.subtask, attempt: spawnIn.attempt }), verdict: 'over-spend', usd: own, next, sessionId: await sessionIdOf($) })
  await appendRow($, row)
  await wakeBrain($, row, spawnIn)
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
  const effort = effortFor(spawn.tier, await storeGet<string>($, K.effort(spawn.task, await cardRepo($, spawn.repo))), cfg.effortByTier)
  stepEfforts.set(agentId, effort ?? null)
  if (effort) {
    const lane = laneOf(spawn)
    const records = await loadAttempts($, spawn)
    await saveAttempts($, spawn, patchRecord(records, spawn.subtask, spawn.attempt, { effort }, lane))
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
      const root = (await $.session.root()).replace(/\/+$/, '')
      const path = `${root}/${LEDGER_FILE}`
      const cur = await ledgerAt($, root)
      // MOD-35: one row per key (an accept per task attempt; a verdict per task, attempt, sha, verdict): a second arrival of the same hand-back writes nothing
      if (ledgerHas(cur.rows, row)) {
        debug($, `ledger row for ${String(row.task)} attempt ${String(row.attempt)} already written; repeat skipped`)
        return
      }
      const added = `${cur.text === '' || cur.text.endsWith('\n') ? '' : '\n'}${JSON.stringify(row)}\n`
      const text = `${cur.text}${added}`
      await $.fs.write(path, text)
      // MOD-247: the file is the size it had plus what was appended: the new row joins the cached rows and the key moves on; any other size (another writer got in) drops the cache
      const after = await ledgerStat($, path)
      if (after && after.size === cur.size + new TextEncoder().encode(added).length) {
        cur.rows.push(JSON.parse(JSON.stringify(row)) as LedgerRow)
        ledgerCache = { path, mtimeMs: after.mtimeMs, size: after.size, text, rows: cur.rows }
      } else ledgerCache = undefined
    },
    () => undefined,
  )
  return ledgerTail.catch(err => debug($, `ledger line not written: ${String(err)}`))
}

/** MOD-247: the ledger as last read: its (mtimeMs, size) from the folder listing, its text and its parsed rows. The rows are shared: a reader does not change them. */
type LedgerState = { path: string; mtimeMs: number; size: number; text: string; rows: LedgerRow[] }
let ledgerCache: LedgerState | undefined
const NO_LEDGER = { text: '', rows: [] as LedgerRow[] }

/** The (mtimeMs, size) of the ledger file from one listing of its folder (the stat when the folder cannot be listed); undefined when there is no file. */
async function ledgerStat($: Host, path: string): Promise<{ mtimeMs: number; size: number } | undefined> {
  try {
    const e = (await $.fs.list(path.slice(0, path.lastIndexOf('/')))).find(x => x.name === 'ledger.jsonl')
    return e ? { mtimeMs: e.mtimeMs, size: e.size } : undefined
  } catch {
    // an unlistable folder: ask for the file itself
  }
  try {
    const st = await $.fs.stat(path)
    return st.kind === 'file' ? { mtimeMs: st.mtimeMs, size: st.size } : undefined
  } catch {
    return undefined
  }
}

/** MOD-247: the ledger of the repo at `root`, parsed once per change of the file's (mtimeMs, size): an unchanged pair returns the cached rows with no read, another writer's row changes the size and is read next time. */
async function ledgerAt($: Host, root: string): Promise<{ text: string; rows: LedgerRow[]; size: number }> {
  const path = `${root.replace(/\/+$/, '')}/${LEDGER_FILE}`
  const key = await ledgerStat($, path)
  if (!key) {
    ledgerCache = undefined
    return { ...NO_LEDGER, rows: [], size: 0 }
  }
  const c = ledgerCache
  if (c && c.path === path && c.mtimeMs === key.mtimeMs && c.size === key.size) return c
  const text = (await readText($, path)) ?? ''
  ledgerCache = { path, mtimeMs: key.mtimeMs, size: key.size, text, rows: parseLedger(text) }
  return ledgerCache
}

// ---- part 2E: the delegation state -------------------------------------------------
async function snapshot($: Host): Promise<StateSnapshot> {
  const s = emptySnapshot()
  const sid = await sessionIdOf($)
  const live = await liveState($)
  // MOD-44: a task for another local repo shows that repo's folder name beside it
  const here0 = await sessionRootOf($)
  const tag = (label: string, repo: string | undefined): string => withRepoName(label, repo, here0)
  s.running = live.workers.map(w => ({ task: tag(w.label, w.spawn.repo), tier: w.spawn.tier, agentId: w.agentId, ...(w.spawn.at !== undefined ? { at: w.spawn.at } : {}) }))
  s.pending = live.pending.map(p => ({ task: tag(p.task, p.repo), ...(p.agentId ? { agentId: p.agentId } : {}) }))
  // MOD-12: the rows a free slot waits for read `ready:`; the brain makes their spawn. MOD-23: not a row whose resource is held
  const queue = await readQueue($)
  const plan = await planOfQueue($, live, queue)
  // MOD-15: the clock of the fallback starts here too, for a slot that freed with no hand-back
  await noteReady($, plan.ready, false)
  const clock = await now($)
  s.queued = []
  for (const [i, q] of queue.entries()) {
    const label = queuedLabel(q)
    const shown = tag(label, q.repo)
    let line: string | undefined
    const waiting = plan.waits.get(label)
    if (plan.ready.includes(label) && rateHeld) {
      line = heldLine(shown, hhmm(rateHeld.at), rateHeld.resetsAt)
    } else if (plan.ready.includes(label)) {
      line = readyLine(shown, q.task)
      // MOD-15: a row the fallback will never start says how long it has waited, once it is past the timeout
      const since = readySince.get(label)
      if (since !== undefined && fallbackDue(since, clock, cfg.readyFallbackMs / MIN_MS)) {
        const kind = await queuedKind($, q)
        if (kind !== 'worktree') line = readyWaitLine(shown, q.task, waitedMinutes(since, clock), kind)
      }
    }
    s.queued.push({ task: shown, position: i + 1, ...(line !== undefined ? { ready: line } : {}), ...(waiting ? { waits: waitsText(waiting) } : {}) })
  }
  if (!sid) return s
  const recent = readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? [])
  s.recent = recent.map(r => ({ line: r.line, at: r.at }))
  const busy = new Set([...live.workers.map(w => w.label), ...live.pending.map(p => p.task), ...queue.map(q => queuedLabel(q))])
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
  if (debrief?.lastAt !== undefined && debrief.lastAt > 0) {
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

/**
 * What read-only git calls say of a task's last attempt: is its sha on origin/main, is its patch already on the session's
 * current branch (MOD-101, #158: work lands on a long-lived branch by cherry-pick, so its sha never reaches origin/main),
 * does its card read merged or landed (on origin/main, else in the working tree). undefined: could not say.
 */
async function retireProbe($: Host, task: string, sha: string | undefined, repo?: string, cardOnly = false): Promise<{ ancestor?: boolean; picked?: boolean; card?: string }> {
  const sessionHome = await $.session.root()
  // MOD-44: a task for another local repo is looked for in that repo's origin/main; its card is not read (it sits under a folder the allowlist does not name)
  const other = repo !== undefined && repo.replace(/\/+$/, '') !== sessionHome.replace(/\/+$/, '')
  const root = other ? (repo as string).replace(/\/+$/, '') : sessionHome
  const out: { ancestor?: boolean; picked?: boolean; card?: string } = {}
  if (!cardOnly && sha !== undefined && isSha(sha)) {
    const r = await run($, ['git', '-C', root, 'merge-base', '--is-ancestor', sha, 'origin/main'], { cwd: root, timeoutMs: 10000 })
    if (r.ok && r.exitCode === 0) return { ancestor: true }
    if (r.ok && r.exitCode === 1) out.ancestor = false
    // MOD-101: git cherry's answer, spelled as a log the allowlist knows: `=` marks a commit of the sha's side with a patch-equal commit on HEAD, `>` one without.
    // Landed means at least one `=` and no `>`; an empty list proves nothing (and, for a consistent verdict only, as the ancestry check is)
    // the session's own branch only: a task for another local repo is looked for in that repo's origin/main alone (MOD-97)
    const c = other ? undefined : await run($, ['git', '-C', root, 'log', '--cherry-mark', '--right-only', '--no-merges', '--format=%m%H', `HEAD...${sha}`], { cwd: root, timeoutMs: 10000 })
    if (c?.ok && c.exitCode === 0) {
      const marks = c.stdout.split('\n').map(l => l.trim()[0]).filter(Boolean)
      if (marks.includes('=') && !marks.includes('>')) return { ...out, picked: true }
      if (marks.length > 0) out.picked = false
    }
  }
  if (other) return out
  const dir = (cfg.cardDir || DEFAULT_CARD_DIR).replace(/^\/+|\/+$/g, '')
  const listed = await run($, ['git', '-C', root, 'ls-tree', '--name-only', 'origin/main', `${dir}/`], { cwd: root, timeoutMs: 10000 })
  if (listed.ok && listed.exitCode === 0) {
    const name = cardMatches(cardNamesFromLsTree(listed.stdout), task)[0]
    if (name !== undefined) {
      const shown = await run($, ['git', '-C', root, 'show', `origin/main:${dir}/${name}`], { cwd: root, timeoutMs: 10000 })
      if (shown.ok && shown.exitCode === 0) out.card = shown.stdout
    }
  }
  if (out.card !== undefined && cardReadsMerged(out.card)) return out
  // MOD-101: the working tree's card, for a branch that carries the card commit itself
  try {
    const tree = `${root}/${dir}`
    const wname = cardMatches((await $.fs.list(tree)).map(e => e.name), task).sort()[0]
    if (wname !== undefined) {
      const text = await $.fs.read(`${tree}/${wname}`)
      if (cardReadsMerged(text)) out.card = text
      else if (out.card === undefined) out.card = text
    }
  } catch {
    // no working-tree card: the origin/main answer stands
  }
  return out
}

/**
 * Does this owed task's row retire? Its last attempt carries `retired` once it
 * has, from the merge or from `/delegation accept`. Otherwise, at most once per
 * 15 minutes, the sha is looked for in origin/main and the card there for
 * `status: merged`; a check that gets no answer leaves the row as it is.
 */
async function retireCheck($: Host, label: string, t: number, force = false, cardOnly = false, repo?: string): Promise<{ retired: boolean; checked: boolean }> {
  const { task, subtask } = splitLabel(label)
  // MOD-97: a hand-back names its repo; an owed row is its id alone
  const ref: TaskRef = repo !== undefined ? { task, repo } : task
  try {
    const records = await loadAttempts($, ref)
    const last = attemptsFor(records, subtask).at(-1)
    if (!last) return { retired: false, checked: false }
    if (last.retired) {
      await clearOwed($, label)
      return { retired: true, checked: true }
    }
    if (!force && !retireDue(records, subtask, t)) return { retired: false, checked: last.retireCheckedAt !== undefined }
    const patch = retirePatch(await retireProbe($, task, last.sha, last.root, cardOnly), t)
    // a card-only check (a non-consistent verdict) records nothing unless the card reads merged: it must not hold off the sha check of the 15-minute retire sweep
    if (cardOnly && patch.retired === undefined) return { retired: false, checked: last.retireCheckedAt !== undefined }
    await saveAttempts($, ref, patchRecord(await loadAttemptsRaw($, ref), subtask, last.attempt, patch))
    if (patch.retired === 'merged') await appendLedger($, acceptRow(last, 'merged', t))
    if (patch.retired !== undefined) await clearOwed($, label)
    return { retired: patch.retired !== undefined, checked: patch.retireCheckedAt !== undefined || last.retireCheckedAt !== undefined }
  } catch (err) {
    debug($, `${label}: retire check failed: ${String(err)}`)
    return { retired: false, checked: false }
  }
}

/** MOD-101: a token shaped like an existing task id (PREFIX-N, with an optional /subtask). */
const ACCEPT_ID = /^[A-Z][A-Z0-9]*-\d+[a-z]?(\/[A-Za-z0-9_-]+)?$/

/** One id of `/delegation accept`: records it on the task's last attempt and retires its owed row. One line; changed says whether a row was retired. */
async function acceptOne($: Host, id: string, note: string): Promise<{ line: string; changed: boolean }> {
  const { task, subtask } = splitLabel(id)
  const records = await loadAttempts($, task)
  const last = attemptsFor(records, subtask).at(-1)
  if (!last) return { line: `/delegation accept: no attempts recorded for ${id}; nothing changed`, changed: false }
  if (last.retired) return { line: `/delegation accept: ${id} already retired (${last.retired}); nothing changed`, changed: false }
  const at = await now($)
  await saveAttempts($, task, patchRecord(await loadAttemptsRaw($, task), subtask, last.attempt, { retired: 'accepted', accepted: { ...(note ? { note } : {}), at } }))
  await appendLedger($, { ...acceptRow(last, 'accepted', at), sessionId: await sessionIdOf($) })
  return { line: `accepted ${id} by hand (attempt ${last.attempt})${note ? `: ${note}` : ''}; its owed row is retired`, changed: true }
}

/**
 * `/delegation accept <id> [<id>…] [note]` or `accept --owed [note]` (MOD-101, #158). Leading tokens shaped like a task id are ids,
 * the rest is the note; with no id-shaped first token the first word is the id, as before. One line per id; an unknown or
 * already-retired id says so and the others still retire. `--owed` retires every owed row of the session and says how many.
 */
async function acceptTask($: Host, rest: string): Promise<string> {
  const words = rest.split(/\s+/).filter(Boolean)
  if (words.length === 0) return 'usage: /delegation accept <id> [<id>…] [note] | --owed [note]'
  if (words[0] === '--owed') {
    const note = words.slice(1).join(' ')
    const sid = await sessionIdOf($)
    const recent = sid ? readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []) : []
    const live = await liveState($)
    const busy = new Set([...live.workers.map(w => w.label), ...live.pending.map(p => p.task)])
    const done: string[] = []
    for (const r of owedRowsFrom(recent, busy)) if ((await acceptOne($, r.task, note)).changed) done.push(r.task)
    return `/delegation accept --owed: retired ${done.length} owed row${done.length === 1 ? '' : 's'}${done.length ? ` (${done.join(', ')})` : ''}${note ? `: ${note}` : ''}`
  }
  let n = 0
  while (n < words.length && ACCEPT_ID.test(words[n] as string)) n++
  const ids = n === 0 ? [words[0] as string] : words.slice(0, n)
  const note = words.slice(ids.length).join(' ')
  const lines: string[] = []
  for (const id of [...new Set(ids)]) lines.push((await acceptOne($, id, note)).line)
  return lines.join('\n')
}

/**
 * MOD-35: is this hand-back's task already on the default branch (or accepted)? MOD-4's retire check answers: the
 * attempt's sha an ancestor of origin/main, the card there reading merged, or an accept already recorded. A verdict of any kind (`anyVerdict`)
 * is asked about, on arrival (MOD-60) and at delivery (MOD-51). For a consistent verdict the sha ancestry counts; for any other
 * (a refuted or no-work hand-back can report a base sha already on origin/main) only a retire already recorded or a card on
 * origin/main reading merged does, and the check never retires the task from ancestry.
 */
async function alreadyMerged($: Host, spawn: SpawnRecord, force = false, anyVerdict = false): Promise<boolean> {
  if (spawn.adhoc || spawn.review || spawn.replay) return false
  try {
    const rec = attemptsFor(await loadAttempts($, spawn), spawn.subtask).find(r => r.attempt === spawn.attempt)
    if (!anyVerdict && rec?.verdict !== 'consistent') return false
    return (await retireCheck($, taskLabel(spawn.task, spawn.subtask), await now($), force, rec?.verdict !== 'consistent', spawn.repo ?? '')).retired
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
    const recent = sid ? readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []) : []
    for (const r of recent) {
      if (r.pr && targets.prs.some(n => new RegExp(`(^|[/#])${n}$`).test(r.pr as string))) tasks.add(splitLabel(r.task).task)
    }
  }
  const t = await now($)
  for (const id of tasks) {
    try {
      const records = await loadAttempts($, id)
      const raw = await loadAttemptsRaw($, id)
      const last = attemptsFor(records, 'main').at(-1) ?? records.filter(r => r.kind !== 'review' && !r.replay).sort((a, b) => a.attempt - b.attempt).at(-1)
      if (!last) continue
      if (!last.retired) await saveAttempts($, id, patchRecord(raw, last.subtask, last.attempt, { retired: 'merged', retireTriedAt: t, retireCheckedAt: t }))
      await clearOwed($, taskLabel(last.task, last.subtask))
      await appendLedger($, { ...acceptRow(last, 'merged', t), sessionId: await sessionIdOf($) })
    } catch (err) {
      debug($, `${id}: merge not recorded: ${String(err)}`)
    }
  }
}

// ---- MOD-75: /delegation merge <ID> and the merge tool ----------------------------------------
/** What a merge prepared: the head the push block names, and the version it releases when version.ts moved. */
type MergePrep = { head: string; version?: string; at: number }

const okOut = (r: RunOut): string | undefined => (r.ok && r.exitCode === 0 ? r.stdout : undefined)
const whyOf = (r: RunOut): string => (r.ok ? (r.stderr.trim() || r.stdout.trim() || `exit ${r.exitCode}`).split('\n').slice(0, 4).join(' / ') : r.why)

/** The one task card in a folder (`<ID>-*.md`), by name. */
async function cardNameIn($: Host, dir: string, id: string): Promise<string | undefined> {
  try {
    return cardMatches((await $.fs.list(dir)).map(e => e.name), id).sort()[0]
  } catch {
    return undefined
  }
}

/** MOD-124: the briefLocal path as an absolute one: relative to the repo root unless it starts with /. */
const localAbs = (root: string, path: string): string => (path.startsWith('/') ? path : `${root.replace(/\/+$/, '')}/${path}`)

/** MOD-124: the allow ids the verdict row carries, from the brief header; none with no brief. */
async function allowIdsOf($: Host, spawn: { briefPath?: string }): Promise<string[]> {
  if (!spawn.briefPath) return []
  const text = await readText($, spawn.briefPath)
  return text === undefined ? [] : allowOf(parseHeader(text))
}

/** MOD-124: the text of every brief that carries a local section, as written and as scrubbed, for the debrief to avoid quoting. */
async function localBriefTexts($: Host, rules: RedactRules): Promise<string[]> {
  const out: string[] = []
  try {
    const dir = briefDirFor((await $.session.root()).replace(/\/+$/, ''), cfg.briefDir)
    for (const e of await $.fs.list(dir)) {
      if (!e.name.endsWith('.brief.md')) continue
      const t = await readText($, `${dir}/${e.name}`)
      if (t !== undefined && (t.includes('## Local rules (not for debrief)') || t.includes('## Exception for this card:'))) out.push(t, redact(t, rules))
    }
  } catch {
    // no brief folder: nothing local to keep out
  }
  return out
}

/** MOD-86: is this repo-relative path git-ignored in `dir`? `git -C <dir> check-ignore -q -- <path>`: exit 0 = ignored, 1 = not; anything else reads as not. */
async function isIgnored($: Host, dir: string, rel: string): Promise<boolean> {
  const r = await run($, ['git', '-C', dir, 'check-ignore', '-q', '--', rel], { cwd: dir, timeoutMs: 15000 })
  return r.ok && r.exitCode === 0
}

/** `/delegation merge <ID> [--finish]` and the merge tool: one function, two doors. */
async function runMerge($: Host, parsed: MergeArgs | { error: string }): Promise<string> {
  if ('error' in parsed) return parsed.error
  try {
    return await mergeCommand($, parsed)
  } finally {
    mergeCtx = undefined
    mergeCheckArgvs = []
  }
}

async function mergeCommand($: Host, parsed: MergeArgs): Promise<string> {
  await loadRepoConfig($)
  const root = (await $.session.root()).replace(/\/+$/, '')
  const id = parsed.id
  // MOD-118 (#186): a baseRef naming an origin branch is the target; a sha, a tag or nothing keeps the default branch
  const want = (cfg.baseRef ?? '').trim()
  const wantName = defaultBranchOf(want)
  const probe = want && !isSha(wantName) ? await run($, ['git', '-C', root, 'rev-parse', '--verify', '--quiet', `refs/remotes/origin/${wantName}`], { cwd: root, timeoutMs: 15000 }) : undefined
  const { baseRef, def, note: targetNote } = mergeTarget(want, !!probe && probe.ok && probe.exitCode === 0)
  const cardDir = (cfg.cardDir || DEFAULT_CARD_DIR).replace(/^\/+|\/+$/g, '')
  if (!parsed.finish) {
    // PREPARE 1: the latest verdict must be consistent with next=accept (the ledger; the task record when the ledger has no row)
    const ledger = cfg.ledgerFile ? (await ledgerAt($, root)).text : ''
    let row: VerdictRow | undefined = latestVerdictRow(ledger, id)
    if (!row) {
      const last = attemptsFor(await loadAttempts($, { task: id }), 'main').at(-1)
      if (last && last.verdict !== 'pending') row = { verdict: last.verdict, ...(last.verdict === 'consistent' ? { next: 'accept' } : {}), attempt: last.attempt, ...(last.sha ? { sha: last.sha } : {}) }
    }
    const refused = verdictRefusal(id, row)
    if (refused) return refused
    const prepared = await mergePrepare($, parsed, { root, id, baseRef, def, cardDir, row: row as VerdictRow })
    return targetNote ? `${id}: ${targetNote}\n${prepared}` : prepared
  }
  return mergeFinish($, { root, id, def, cardDir, discard: parsed.discard === true })
}

/** The task's worktree on its branch, from `git worktree list` in the session root. */
async function mergeWorktree($: Host, root: string, id: string): Promise<{ path: string; branch: string } | undefined> {
  const listed = okOut(await run($, ['git', '-C', root, 'worktree', 'list', '--porcelain'], { cwd: root, timeoutMs: 15000 }))
  return listed === undefined ? undefined : worktreeOf(listed, id)
}

async function mergePrepare($: Host, parsed: MergeArgs, o: { root: string; id: string; baseRef: string; def: string; cardDir: string; row: VerdictRow }): Promise<string> {
  const { root, id, baseRef, def, cardDir, row } = o
  // PREPARE 2: the worktree exists on its branch, with a clean tree
  const wt = await mergeWorktree($, root, id)
  if (!wt) return noWorktreeLine(id)
  const wtStatus = okOut(await run($, ['git', '-C', wt.path, 'status', '--porcelain'], { cwd: wt.path, timeoutMs: 15000 }))
  if (wtStatus === undefined) return `${id}: git status failed in the worktree ${wt.path}`
  const dirty = statusPaths(wtStatus)
  if (dirty.length > 0) return dirtyWorktreeLine(id, wt.path, dirty)
  // PREPARE 3: the main checkout is on the default branch with no tracked changes (untracked files, the root card among them, are fine)
  const onBranch = (okOut(await run($, ['git', '-C', root, 'rev-parse', '--abbrev-ref', 'HEAD'], { cwd: root, timeoutMs: 15000 })) ?? '').trim()
  if (onBranch !== def) return mainBranchLine(id, root, onBranch, def)
  const mainStatus = okOut(await run($, ['git', '-C', root, 'status', '--porcelain'], { cwd: root, timeoutMs: 15000 }))
  if (mainStatus === undefined) return `${id}: git status failed in the main checkout ${root}`
  const tracked = statusPaths(mainStatus, true)
  if (tracked.length > 0) return mainDirtyLine(id, root, tracked)
  // the card: the root card (or the worktree's, when the root one is gone)
  const name = (await cardNameIn($, `${root}/${cardDir}`, id)) ?? (await cardNameIn($, `${wt.path}/${cardDir}`, id))
  if (!name) return `${id}: no card ${cardDir}/${id}-*.md in ${root}; nothing to merge`
  const cardRel = `${cardDir}/${name}`
  mergeCtx = { root, worktree: wt.path, branch: wt.branch, baseRef, cardRel, id }
  const ignored = await isIgnored($, root, cardRel)
  const origin = okOut(await run($, ['git', '-C', root, 'remote', 'get-url', 'origin'], { cwd: root, timeoutMs: 15000 }))
  const ownerRepo = ownerRepoOf(origin ?? '')
  if (!ownerRepo) return `${id}: origin is not a GitHub remote (${(origin ?? '').trim() || 'no url'}); the PR block needs owner/repo`
  const rootCard = await readText($, `${root}/${cardRel}`)
  const wtCardPath = `${wt.path}/${cardRel}`
  const wtCard = await readText($, wtCardPath)
  const cardText = rootCard ?? wtCard
  if (cardText === undefined) return `${id}: ${cardRel} could not be read`
  const card = parseCard(cardText)
  if ('error' in card) return `${id}: ${cardRel}: ${card.error}`
  let review: string | undefined = parsed.review
  if (parsed.reviewFile) {
    review = await readText($, parsed.reviewFile)
    if (review === undefined) return `${id}: --review-file ${parsed.reviewFile} could not be read`
  }
  // MOD-143: the card's merge checks, in the worktree at its head, before anything is rebased or committed
  const checks = mergeChecksFor(card.fields.merge_check as string | undefined, card.gate, cfg.mergeCheckMap)
  const passed: string[] = []
  if (checks.length > 0) {
    const sha = (okOut(await run($, ['git', '-C', wt.path, 'rev-parse', 'HEAD'], { cwd: wt.path, timeoutMs: 15000 })) ?? '').trim()
    for (const cmd of checks) {
      const why = mergeCheckRefusal(cmd)
      if (why !== undefined) return `${id}: merge check refused: ${cmd}: ${why}; nothing was rebased or committed`
      const argv = fillMergeCheck(cmd, { card: id, sha, worktree: wt.path })
      // the command passed the gate checker above: the allowlist takes exactly this argv, for this run only
      mergeCheckArgvs = [argv]
      let r: RunOut
      try {
        r = await run($, argv, { cwd: wt.path, timeoutMs: MERGE_CHECK_TIMEOUT_MS })
      } finally {
        mergeCheckArgvs = []
      }
      if (!r.ok || r.exitCode !== 0) {
        const tail = r.ok ? lastLines(r.stdout, r.stderr, 15) : [r.why]
        return [`${id}: merge check failed: ${cmd} ${r.ok ? `exited ${r.exitCode}` : 'did not run'}; nothing was rebased or committed`, ...tail].join('\n')
      }
      passed.push(cmd)
    }
  }
  // the rebase onto the base, in the worktree, by argv
  const fetched = await run($, ['git', '-C', wt.path, 'fetch', 'origin'], { cwd: wt.path, timeoutMs: 120000 })
  if (!fetched.ok || fetched.exitCode !== 0) return `${id}: git fetch origin failed in the worktree: ${whyOf(fetched)}`
  const rebased = await run($, ['git', '-C', wt.path, 'rebase', baseRef], { cwd: wt.path, timeoutMs: 120000 })
  if (!rebased.ok) return `${id}: git rebase ${baseRef} did not run: ${rebased.why}`
  if (rebased.exitCode !== 0) {
    const unmerged = okOut(await run($, ['git', '-C', wt.path, 'diff', '--name-only', '--diff-filter=U'], { cwd: wt.path, timeoutMs: 15000 })) ?? ''
    await run($, ['git', '-C', wt.path, 'rebase', '--abort'], { cwd: wt.path, timeoutMs: 60000 })
    return conflictLine(id, baseRef, unmerged.split('\n').map(l => l.trim()).filter(Boolean))
  }
  // the merged card, committed once; a git-ignored card is marked merged in the root checkout and committed nowhere (MOD-86)
  let committed = false
  if (ignored) {
    if (!(rootCard !== undefined && readsMerged(rootCard))) await $.fs.write(`${root}/${cardRel}`, markMerged(rootCard ?? (wtCard as string), review))
  } else if (!(wtCard !== undefined && readsMerged(wtCard))) {
    await $.fs.write(wtCardPath, markMerged(rootCard ?? (wtCard as string), review))
    const added = await run($, ['git', '-C', wt.path, 'add', '--', cardRel], { cwd: wt.path, timeoutMs: 15000 })
    if (!added.ok || added.exitCode !== 0) return `${id}: git add ${cardRel} failed in the worktree: ${whyOf(added)}`
    let modelId: string | undefined
    try {
      modelId = await $.session.model()
    } catch {
      modelId = undefined
    }
    const made = await run($, commitArgv(wt.path, id, coAuthorTrailer(modelId)), { cwd: wt.path, timeoutMs: 30000 })
    if (!made.ok || made.exitCode !== 0) return `${id}: the merged-card commit failed in the worktree: ${whyOf(made)}`
    committed = true
  }
  const head = (okOut(await run($, ['git', '-C', wt.path, 'rev-parse', 'HEAD'], { cwd: wt.path, timeoutMs: 15000 })) ?? '').trim()
  const short = head.slice(0, 10) || '(unknown)'
  // what the branch changes against the base: the {files} list, and whether the version moved
  const names = okOut(await run($, ['git', '-C', wt.path, 'diff', '--name-only', `${baseRef}...HEAD`], { cwd: wt.path, timeoutMs: 15000 })) ?? ''
  const version = touchesVersion(names) ? versionOf(await readText($, `${wt.path}/${VERSION_FILE}`)) : undefined
  await storeSet($, K.mergePrep(id, await cardRepo($)), { head, ...(version ? { version } : {}), at: await now($) } satisfies MergePrep)
  // GATES: the card's gates, by the verifier's runner, in the worktree at the new head
  const outDir = `${root}/.delegation/${id}`
  const filesPath = `${outDir}/merge-files.txt`
  try {
    await $.fs.write(filesPath, names.trim() === '' ? '' : `${names.trim()}\n`)
  } catch (err) {
    debug($, `${id}: ${filesPath} not written: ${String(err)}`)
  }
  const allowed = (argv: readonly string[]) => checkArgv(argv, allowCfg()).ok
  const log: string[] = []
  const results: GateResult[] = []
  const writeLog = async () => {
    try {
      await $.fs.write(`${outDir}/merge-gates.txt`, `${log.join('\n')}\n`)
    } catch (err) {
      debug($, `${id}: merge-gates.txt not written: ${String(err)}`)
    }
  }
  // MOD-122: a branch that changes no file runs gateMap._empty instead of the card's gates
  const emptyGate = gateForDelta(card.gate.join(','), cfg.gateMap, names.trim() === '' ? [] : names.trim().split('\n'))
  if (emptyGate.line) log.push(emptyGate.line)
  for (const gid of emptyGate.line && emptyGate.gate ? [emptyGate.gate] : card.gate) {
    const res = resolveGateRuns(gid, cfg.gateMap, allowed, filesPath, wt.path)
    const skipped = res.notRerun[0]
    if (skipped) {
      log.push(`## ${gid}: not run (${skipped.why})`)
      await writeLog()
      return `${id}: gate ${gid} not run at ${short} (${skipped.why}); not pushed`
    }
    for (const g of res.runs) {
      const turn = isEngineGate(g.argv) ? await takeEngineTurn($, `${id} merge`) : undefined
      let r: RunOut
      try {
        // MOD-229: spawned under the mod's own ceiling, as the verifier's gates are
        r = await spawnGate($, g.argv, { cwd: wt.path })
      } finally {
        await turn?.release()
      }
      log.push(`## ${gid}: ${g.argv.join(' ')}`, ...(r.ok ? [r.stdout, r.stderr, `exit ${r.exitCode}`] : [`did not run: ${r.why}`]))
      if (!r.ok || r.exitCode !== 0) {
        await writeLog()
        const tail = r.ok ? lastLines(r.stdout, r.stderr, 20) : [r.why]
        return [`${id}: gate ${gid} failed at ${short}; not pushed`, ...tail].join('\n')
      }
    }
    results.push({ id: gid, label: res.runs.map(g => g.label).join(' && ') || gid, ok: true })
  }
  await writeLog()
  // THE REMOTE BLOCK: pr.md, then the lines the brain runs verbatim
  const prFile = `${outDir}/pr.md`
  // MOD-171: the amends the task's brief carried, listed for the lead (the brief is the one dispatch wrote for this task)
  const briefFile = await existingBrief($, root, `${id}.brief.md`)
  const briefText = briefFile ? await readText($, briefFile) : undefined
  const amends = briefText ? parseAmends(briefText).amends : []
  let home = ''
  try {
    home = await homeDir($)
  } catch {
    home = ''
  }
  const prRepo = ownerRepoOf(gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url') ?? '') || undefined
  const verdictLine = `${id} attempt ${row.attempt ?? '?'}: consistent${row.sha ? ` at ${row.sha}` : ''} · next=accept`
  await $.fs.write(prFile, prBody({ body: card.body, verdictLine, gates: results, folders: [wt.path, root, $.plugin.root, home], amends: amends.map(amendSummary), ...(issueRef(card.fields.issue, prRepo) !== undefined ? { issue: issueRef(card.fields.issue, prRepo) as number } : {}) }))
  const title = card.title || `${id} merged`
  const lines = pushLines({ worktree: wt.path, branch: wt.branch, ownerRepo, defaultBranch: def, title, prFile, id })
  return [
    ...amends.map(amendMergeLine),
    `${id}: rebased onto ${baseRef}; ${ignored ? cardKeptLocalClause(`${root}/${cardRel}`) : committed ? `card committed as merged (${cardRel})` : 'the worktree already carries the merged card; nothing committed again'}; gates green at ${short}${results.length > 0 ? ` (${results.map(r => r.id).join(', ')})` : ' (the card names no gate)'}${passed.map(c => `; merge check passed (${c})`).join('')}`,
    `pr body: ${prFile} · gate output: ${outDir}/merge-gates.txt${version ? ` · releases v${version}` : ''}`,
    remoteBlock('remote: run these lines verbatim, in order (the mod never pushes nor calls gh):', lines),
  ].join('\n')
}

async function mergeFinish($: Host, o: { root: string; id: string; def: string; cardDir: string; discard: boolean }): Promise<string> {
  const { root, id, def, cardDir, discard } = o
  const wt = await mergeWorktree($, root, id)
  if (!wt) return noWorktreeLine(id)
  const name = await cardNameIn($, `${root}/${cardDir}`, id)
  const cardRel = name ? `${cardDir}/${name}` : undefined
  mergeCtx = { root, worktree: wt.path, branch: wt.branch, baseRef: `origin/${def}`, id, ...(cardRel ? { cardRel } : {}) }
  const ignored = cardRel !== undefined && (await isIgnored($, root, cardRel))
  // MOD-189: the card's issue and parent, read before the root card goes
  const finishCardText = cardRel ? ((await readText($, `${root}/${cardRel}`)) ?? (await readText($, `${wt.path}/${cardRel}`))) : undefined
  const finishCard = finishCardText ? parseCard(finishCardText) : undefined
  const originRepo = ownerRepoOf(gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url') ?? '') || undefined
  const cardIssue = finishCard && !('error' in finishCard) ? issueRef(finishCard.fields.issue, originRepo) : undefined
  const cardParent = finishCard && !('error' in finishCard) ? issueRef(finishCard.fields.parent, originRepo) : undefined
  const fetched = await run($, ['git', '-C', root, 'fetch', 'origin'], { cwd: root, timeoutMs: 120000 })
  if (!fetched.ok || fetched.exitCode !== 0) return `${id}: git fetch origin failed in the main checkout: ${whyOf(fetched)}`
  const head = (okOut(await run($, ['git', '-C', wt.path, 'rev-parse', 'HEAD'], { cwd: wt.path, timeoutMs: 15000 })) ?? '').trim()
  if (!isSha(head)) return `${id}: could not read the worktree's head in ${wt.path}`
  // the head itself on origin/<default>, or its rebased twin (same tree, same subject)
  let sha: string | undefined
  const anc = await run($, ['git', '-C', root, 'merge-base', '--is-ancestor', head, `origin/${def}`], { cwd: root, timeoutMs: 15000 })
  if (anc.ok && anc.exitCode === 0) sha = head
  else {
    const mine = (okOut(await run($, ['git', '-C', wt.path, 'log', '-1', '--format=%T%x09%s', 'HEAD'], { cwd: wt.path, timeoutMs: 15000 })) ?? '').trim()
    const [tree = '', ...subject] = mine.split('\t')
    const theirs = okOut(await run($, ['git', '-C', root, 'log', '--format=%H%x09%T%x09%s', '-n', '200', `origin/${def}`], { cwd: root, timeoutMs: 15000 })) ?? ''
    if (tree !== '') sha = twinIn(theirs, tree, subject.join('\t'))
  }
  if (!sha) return ignored ? notLandedIgnoredLine(id, wt.branch, head, def) : `${id}: ${wt.branch} is not in origin/${def} yet`
  const short = sha.slice(0, 10)
  // MOD-142 (#231): untracked and git-ignored files in the worktree are not on origin; list them before anything is cleaned up
  const notes: string[] = []
  let leftovers: string[] = []
  const wtState = await run($, ['git', '-C', wt.path, 'status', '--porcelain', '--ignored', '--untracked-files=all'], { cwd: wt.path, timeoutMs: 30000 })
  if (!wtState.ok || wtState.exitCode !== 0) notes.push(`note: could not list untracked or ignored files in ${wt.path}: ${whyOf(wtState)}`)
  else leftovers = finishLeftovers(wtState.stdout)
  if (leftovers.length > 0 && !discard) return finishStopLines(id, wt.path, leftovers).join('\n')
  // the root card goes only when the merged card on origin says the same (status aside; a Review section may be extra); a git-ignored card is the only copy and stays (MOD-86)
  if (cardRel && !ignored) {
    const merged = okOut(await run($, ['git', '-C', root, 'show', `${sha}:${cardRel}`], { cwd: root, timeoutMs: 15000 }))
    if (merged === undefined) return `${id}: ${cardRel} is not in origin/${def} at ${short}; the root card is left and nothing else was done`
    const rootCard = (await readText($, `${root}/${cardRel}`)) ?? ''
    const diff = cardDiff(merged, rootCard)
    if (diff.length > 0) return [`${id}: the merged card on origin/${def} differs from ${cardRel} (status aside); the root card is left and nothing else was done:`, ...diff.slice(0, 20), ...(diff.length > 20 ? [`… ${diff.length - 20} more`] : [])].join('\n')
    const cleaned = await run($, ['git', '-C', root, 'clean', '-q', '-f', '--', cardRel], { cwd: root, timeoutMs: 15000 })
    if (!cleaned.ok || cleaned.exitCode !== 0) return `${id}: the root card ${cardRel} was not removed: ${whyOf(cleaned)}`
  }
  // the version this merge releases: what the prepare saw, else the branch against origin
  const prep = await storeGet<MergePrep>($, K.mergePrep(id, await cardRepo($)))
  let version = prep && prep.head === head ? prep.version : undefined
  if (!prep || prep.head !== head) {
    const names = okOut(await run($, ['git', '-C', wt.path, 'diff', '--name-only', `origin/${def}...HEAD`], { cwd: wt.path, timeoutMs: 15000 })) ?? ''
    version = touchesVersion(names) ? versionOf(await readText($, `${wt.path}/${VERSION_FILE}`)) : undefined
  }
  const pulled = await run($, ['git', '-C', root, 'pull', '--ff-only'], { cwd: root, timeoutMs: 120000 })
  if (!pulled.ok || pulled.exitCode !== 0) return `${id}: git pull --ff-only failed in the main checkout: ${whyOf(pulled)}; the worktree and branch are left`
  // MOD-152: a lock a crashed or killed verify left must not stop the finish; its failure (not locked) is ignored
  await unlockWorktree($, root, wt.path)
  const removed = await run($, ['git', '-C', root, 'worktree', 'remove', wt.path], { cwd: root, timeoutMs: 60000 })
  const removedOk = removed.ok && removed.exitCode === 0
  if (!removedOk) {
    // MOD-142: git removes ignored files but not untracked ones; stop here so a second finish completes the job (branch kept, no merged row)
    const untracked = wtState.ok && wtState.exitCode === 0 ? finishLeftovers(wtState.stdout, '??').length : 0
    if (untracked > 0) return [...notes, `${id}: on origin/${def} at ${short}; root card and pull done, but the worktree and branch are kept`, `note: the worktree ${wt.path} was not removed: it still holds ${untracked} untracked files (git removes ignored files but not untracked ones); delete them, then run /delegation merge ${id} --finish again`].join('\n')
    notes.push(`note: the worktree ${wt.path} was not removed: ${whyOf(removed)}`)
  } else if (leftovers.length > 0) notes.push(`note: discarded ${leftovers.length} untracked or ignored files from ${wt.path}`)
  const dropped = await run($, ['git', '-C', root, 'branch', '-D', wt.branch], { cwd: root, timeoutMs: 15000 })
  if (!dropped.ok || dropped.exitCode !== 0) notes.push(`note: the branch ${wt.branch} was not deleted: ${whyOf(dropped)}`)
  // the record, the ledger row, this session's merged list
  const t = await now($)
  const sid = await sessionIdOf($)
  const recent = sid ? readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []) : []
  const prRef = [...recent].reverse().find(r => splitLabel(r.task).task === id && r.pr)?.pr
  const pr = prRef ? /(\d+)\s*$/.exec(prRef)?.[1] : undefined
  try {
    // MOD-97: the merge is of the session repo's worktree, so of that repo's attempt
    const records = await loadAttempts($, { task: id })
    const last = attemptsFor(records, 'main').at(-1)
    if (last) await saveAttempts($, { task: id }, patchRecord(await loadAttemptsRaw($, { task: id }), 'main', last.attempt, { retired: 'merged', retireTriedAt: t, retireCheckedAt: t, mergedSha: sha } as Partial<AttemptRecord>))
  } catch (err) {
    debug($, `${id}: merge not recorded on the task: ${String(err)}`)
  }
  await appendLedger($, { kind: 'merged', task: id, sha, ...(pr ? { pr: Number(pr) } : {}), at: t, ...(sid ? { sessionId: sid } : {}) })
  await clearOwed($, id)
  if (sid) {
    const list = ((await storeGet<MergedEntry[]>($, K.merged(sid))) ?? []).filter(m => m.task !== id)
    await storeSet($, K.merged(sid), [...list, { task: id, sha, ...(version ? { version } : {}), at: t }].slice(-MERGED_CAP))
  }
  try {
    await $.store.delete(K.mergePrep(id, await cardRepo($)))
  } catch {
    // it expires with nothing reading it
  }
  // the loaded clone pulls too, when it is a git checkout other than this one
  const loaded = $.plugin.root.replace(/\/+$/, '')
  const loadedClone = version && loaded !== root && (await exists($, `${loaded}/.git`)) ? loaded : undefined
  const closeRepo = cardIssue !== undefined ? ownerRepoOf(okOut(await run($, ['git', '-C', root, 'remote', 'get-url', 'origin'], { cwd: root, timeoutMs: 15000 })) ?? '') : undefined
  // MOD-195: the parent's sub-issues, read with the MOD-194 shape (MOD-197: the merge allowlist passes that one view once landRepo is the origin's)
  let siblings: { number: number; state: string }[] | undefined
  // MOD-200: the close and comment shapes are bound to this repo while the merge runs
  if (cardIssue !== undefined && closeRepo) landRepo = closeRepo
  if (cardIssue !== undefined && cardParent !== undefined && closeRepo) {
    const v = await run($, ['gh', 'issue', 'view', String(cardParent), '--repo', closeRepo, '--json', 'number,title,state,labels,body,subIssues'], { cwd: root, timeoutMs: 60000 })
    if (v.ok && v.exitCode === 0) siblings = siblingsOf(v.stdout)
  }
  // MOD-201: a finish that leaves the parent with open tasks sets the lead; one that closes it sets none
  if (cfg.landNudge && cardIssue !== undefined && cardParent !== undefined) {
    const left = parentNudge(cardParent, cardIssue, siblings)
    parentLine = left ? nudgeLine('parent', left) : undefined
    redraw($)
  }
  // MOD-200: the mod runs the task close itself, and the parent close when every other sibling is closed
  const closed: { task?: CloseResult; parent?: CloseResult } = {}
  const closedLines: string[] = []
  const plan = closesOf({ ...(cardIssue !== undefined ? { issue: cardIssue } : {}), ...(cardParent !== undefined ? { parent: cardParent } : {}), ...(closeRepo ? { ownerRepo: closeRepo } : {}), sha, ...(pr ? { pr: Number(pr) } : {}), ...(siblings ? { siblings } : {}) })
  const closeOne = async (c: { issue: number; comment: string }): Promise<CloseResult> => {
    const r = await run($, ['gh', 'issue', 'close', String(c.issue), '--repo', closeRepo as string, '--comment', c.comment], { cwd: root, timeoutMs: 60000 })
    if (r.ok && r.exitCode === 0) {
      closedLines.push(`closed #${c.issue}`)
      return { ok: true }
    }
    return { ok: false, why: (r.ok ? r.stderr || r.stdout : r.why).trim().replace(/\s+/g, ' ').slice(0, 200) || 'no output' }
  }
  if (plan.task && closeRepo) {
    closed.task = await closeOne(plan.task)
    if (closed.task.ok && plan.parent) closed.parent = await closeOne(plan.parent)
  }
  return [
    `${id}: on origin/${def} at ${short}${sha === head ? '' : ' (the rebased twin of the worktree head)'}; ${ignored ? 'root card kept (git-ignored), ' : cardRel ? 'root card removed, ' : ''}main pulled, worktree and branch removed`,
    ...notes,
    ...closedLines,
    remoteBlock('remote: run these lines verbatim (the mod never pushes):', finishLines({
      branch: wt.branch,
      ...(version ? { version } : {}),
      ...(loadedClone ? { loadedClone } : {}),
      ...(cardIssue !== undefined && closeRepo ? { issue: cardIssue, ownerRepo: closeRepo, sha, ...(cardParent !== undefined ? { parent: cardParent } : {}), ...(siblings ? { siblings } : {}), ...(pr ? { pr: Number(pr) } : {}), closed } : {}),
    })),
    `${id} merged at ${sha}`,
    ...(version ? [`release v${version}: run the block above, then reload the window`] : []),
  ].join('\n')
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
const debriefStopSaid = new Set<string>()
async function maybeDebrief($: Host) {
  if (debriefBusy || inTurn || !cfg.autoDebrief) return
  debriefBusy = true
  try {
    if (cfg.debriefMode === 'notes') return await notesPrompt($)
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
      ...(prev ? { lastAt: prev.lastAt, ...(prev.lastAttemptAt !== undefined ? { lastAttemptAt: prev.lastAttemptAt } : {}), ...(prev.failedChecks ? { failedChecks: prev.failedChecks } : {}), ...(mode === 'breadcrumbs' && prev.mode !== 'events' ? { lastWatermark: prev.watermark } : {}) } : {}),
    })
    if (!verdict.ok) {
      // MOD-91: the two-failure stop is said once a session, as a row; the other reasons stay in the debug log
      if (verdict.why.startsWith('debrief stopped:') && !debriefStopSaid.has(sid)) {
        debriefStopSaid.add(sid)
        await appendRow($, verdict.why)
      }
      return debug($, `no debrief: ${verdict.why}${mode === 'events' ? ' (friction events)' : ''}`)
    }
    if (inTurn) return
    const res = await startDebrief($, basis, t, [])
    if (res.skipped !== undefined) return debug($, `no debrief: ${res.skipped}`)
    if (res.deny !== undefined) return debug($, `debrief not started: ${res.deny}`)
    $.ui.toast('debrief running in the background')
  } finally {
    debriefBusy = false
  }
}

/** MOD-137: what the notes-mode debrief remembers: when the last prompt row was added or a note ingested, and the findings file that ingest wrote. */
type NotesRecord = { at: number; path?: string }

/**
 * MOD-137: notes mode. The same clean stop as the transcript debrief (idle, no worker, nothing pending or queued, past the cooldown),
 * but no agent runs: once per round (the verdicts since the last row or ingest) one row asks for the review note.
 */
async function notesPrompt($: Host) {
  const sid = await sessionIdOf($)
  if (!sid) return debug($, 'no debrief: the session id is unknown')
  const live = await liveState($)
  const prev = await storeGet<DebriefRecord>($, K.debrief(sid))
  const rec = await storeGet<NotesRecord>($, K.notes(sid))
  const t = await now($)
  const lastAt = Math.max(prev?.lastAt ?? -Infinity, rec?.at ?? -Infinity)
  const verdict = cleanStop({ inTurn, running: live.running, pending: live.pending.length, queued: live.queued, lines: 0, watermark: 0, minNewLines: 0, now: t, cooldownMs: cfg.debriefCooldownMs, ...(Number.isFinite(lastAt) ? { lastAt } : {}) })
  if (!verdict.ok) return debug($, `no debrief note prompt: ${verdict.why}`)
  const since = rec?.at ?? -Infinity
  const round = readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? []).filter(r => r.at > since)
  if (round.length === 0) return debug($, 'no debrief note prompt: no verdicts since the last row or ingest')
  if (inTurn) return
  await storeSet($, K.notes(sid), { ...(rec ?? {}), at: t })
  await appendRow($, notesPromptRow(round.length))
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
  const recent = readRecent($, (await storeGet<RecentVerdict[]>($, K.recent(sid))) ?? [])
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
  const record: DebriefRecord = { lastAt: t, lastAttemptAt: t, watermark, lines, sessionId: sid, mode, builtIn: source.builtIn, ...(window ? { window } : {}), prior }
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
 * MOD-137, `/delegation debrief ingest <note.md>`: the "For the mod owner" bullets of the lead's review note become findings, scrubbed
 * and cut of local-rule quotes as a debrief's are, in <root>/.delegation/debriefs; `debrief post` then lists them. Nothing is posted.
 */
async function runDebriefIngest($: Host, argText: string): Promise<string> {
  const arg = argText.trim().replace(/^(['"])([\s\S]*)\1$/, '$2').trim()
  if (arg === '') return 'debrief ingest: name the note, /delegation debrief ingest <note.md> (a path under the session root, or absolute)'
  if (!/\.md$/i.test(arg)) return `debrief ingest: ${arg} is not a .md file; nothing written`
  const root = (await $.session.root()).replace(/\/+$/, '')
  const path = arg.startsWith('/') ? arg : arg.startsWith('~/') ? expandHome(arg, await homeOf($)) : `${root}/${arg.replace(/^\.\//, '')}`
  const base = path.slice(path.lastIndexOf('/') + 1)
  const text = await readText($, path)
  if (text === undefined) return `debrief ingest: could not read ${path}; nothing written`
  const raw = noteFindings(text, `review note ${base}`)
  if (raw.length === 0) return `debrief ingest: ${base} has no "For the mod owner" section; nothing written`
  const rules = await redactRules($)
  const scrubbed = scrubbedFindings(JSON.stringify({ mod_findings: raw }), rules) ?? []
  const findings = dropLocalQuotes(scrubbed, await localBriefTexts($, rules))
  const date = new Date(await now($)).toISOString().slice(0, 10)
  const out = `${root}/.delegation/debriefs/${noteFindingsName(date, path)}`
  const { mod, host } = splitModFindings(findings)
  try {
    await $.fs.write(out, JSON.stringify(findingsFile(path, MOD_VERSION, mod, host), null, 2) + '\n')
  } catch (err) {
    return `debrief ingest: could not write ${out}: ${String(err)}`
  }
  const t = await now($)
  const sid = await sessionIdOf($)
  if (sid) await storeSet($, K.notes(sid), { at: t, path: out })
  return [...findingsLines(mod, out, host.length), mod.length > 0 ? 'post with /delegation debrief post all|1,3' : ''].filter(l => l !== '').join('\n')
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
  let path: string
  if (opts.path !== undefined) path = opts.path
  else {
    const found = await findFindings($, root)
    if ('looked' in found) return notFoundLine('post', found.looked)
    path = found.path
  }
  // the body files for gh stay where the allowlist lets them be read (<root>/.delegation/debriefs), unless the auto path names its own folder
  const folder = opts.path !== undefined ? path.replace(/\/[^/]*$/, '') : `${root}/.delegation/debriefs`
  const name = path.slice(path.lastIndexOf('/') + 1)
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

/** MOD-80: the names in a folder ending `ext`, sorted; [] when it cannot be listed. */
async function namesIn($: Host, folder: string, ext: string): Promise<string[]> {
  try {
    return (await $.fs.list(folder)).map(e => e.name).filter(n => n.endsWith(ext)).sort()
  } catch {
    return []
  }
}

/** MOD-80: the debrief file a name in the harness folder belongs to is this session's: its `session_id` is the session id. The folder is shared by every repo on the machine. */
async function harnessMine($: Host, folder: string, names: readonly string[], sid: string, home: string): Promise<string[]> {
  if (sid === '') return []
  const mine: string[] = []
  for (const n of names.slice(-10)) {
    let debrief = `${folder}/${n.replace(/\.findings\.json$/, '.json')}`
    if (n.endsWith('.findings.json')) {
      try {
        const j: unknown = JSON.parse((await readText($, `${folder}/${n}`)) ?? 'null')
        const named = j !== null && typeof j === 'object' ? (j as Record<string, unknown>).debrief : undefined
        if (typeof named === 'string' && named.trim() !== '') debrief = expandHome(named, home)
      } catch {
        // the sibling debrief file is used
      }
    }
    try {
      const d: unknown = JSON.parse((await readText($, debrief)) ?? 'null')
      if (d !== null && typeof d === 'object' && (d as Record<string, unknown>).session_id === sid) mine.push(n)
    } catch {
      // not readable: not this session's
    }
  }
  return mine
}

/** MOD-80: this session's record path, expanded, when its debrief file exists. */
async function recordDebrief($: Host, sid: string, home: string): Promise<string | undefined> {
  const rec = sid ? await storeGet<DebriefRecord>($, K.debrief(sid)) : undefined
  if (!rec?.path) return undefined
  const p = expandHome(rec.path, home)
  return (await readText($, p)) === undefined ? undefined : p
}

/** MOD-80: the findings file the by-hand doors read (see resolveFindings): the record's, the repo folder's newest, this session's newest in the harness folder. */
async function findFindings($: Host, root: string): Promise<{ path: string } | { looked: string[] }> {
  const home = (await homeOf($)).replace(/\/+$/, '')
  const sid = await sessionIdOf($)
  const repoFolder = `${root}/.delegation/debriefs`
  const harnessFolder = `${home}/.claude/harness/debriefs`
  const recd = await recordDebrief($, sid, home)
  let recordFindings: string | undefined
  // MOD-137: a note ingested after the session's last debrief is the latest findings
  const ing = sid ? await storeGet<NotesRecord>($, K.notes(sid)) : undefined
  const lastDebrief = sid ? (await storeGet<DebriefRecord>($, K.debrief(sid)))?.lastAt : undefined
  if (ing?.path !== undefined && (lastDebrief === undefined || ing.at >= lastDebrief) && (await readText($, ing.path)) !== undefined) return { path: ing.path }
  if (recd !== undefined) {
    const f = findingsPathOf(recd)
    if ((await readText($, f)) !== undefined) recordFindings = f
  }
  const repoNames = await namesIn($, repoFolder, '.findings.json')
  const harnessNames = repoNames.length > 0 || recordFindings !== undefined ? [] : await namesIn($, harnessFolder, '.findings.json')
  return resolveFindings({ repoFolder, harnessFolder, recordFindings, repoNames, harnessMine: await harnessMine($, harnessFolder, harnessNames, sid, home) })
}

/** The latest debrief's proposals: the one this session's record names, else the newest in <root>/.delegation/debriefs, else this session's newest in the harness folder (MOD-80). */
async function latestProposals($: Host): Promise<LatestProposals | undefined> {
  const r = await findDebrief($)
  return 'path' in r ? proposalsAt($, r.path) : undefined
}

/** MOD-80: the debrief file `debrief apply` reads, or the folders looked in. A debrief with no findings file counts. */
async function findDebrief($: Host): Promise<{ path: string } | { looked: string[] }> {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const home = (await homeOf($)).replace(/\/+$/, '')
  const sid = await sessionIdOf($)
  const repoFolder = `${root}/.delegation/debriefs`
  const harnessFolder = `${home}/.claude/harness/debriefs`
  const rec = await recordDebrief($, sid, home)
  if (rec !== undefined) return { path: rec }
  const stemsOf = (names: string[]): string[] => [...new Set(names.map(n => n.replace(/\.findings\.json$/, '').replace(/\.json$/, '')).filter(n => !/\.post-\d+/.test(n)))].sort()
  const repo = stemsOf(await namesIn($, repoFolder, '.json')).at(-1)
  if (repo !== undefined) return { path: `${repoFolder}/${repo}.json` }
  const hNames = (await namesIn($, harnessFolder, '.json')).filter(n => !n.endsWith('.findings.json') && !/\.post-\d+/.test(n))
  const mine = await harnessMine($, harnessFolder, hNames, sid, home)
  const h = stemsOf(mine).at(-1)
  return h === undefined ? { looked: [repoFolder, harnessFolder] } : { path: `${harnessFolder}/${h}.json` }
}

/** `already done: …` / `dismissed: …` lines from the last few debriefs in the repo folder and this session's in the harness folder, each summary once. */
async function settledNotes($: Host): Promise<string[]> {
  const root = (await $.session.root()).replace(/\/+$/, '')
  const home = (await homeOf($)).replace(/\/+$/, '')
  const sid = await sessionIdOf($)
  const repoFolder = `${root}/.delegation/debriefs`
  const harnessFolder = `${home}/.claude/harness/debriefs`
  const stemOf = (n: string): string => n.replace(/\.findings\.json$/, '')
  const repo = (await namesIn($, repoFolder, '.findings.json')).slice(-10).map(n => `${repoFolder}/${stemOf(n)}.json`)
  const harness = (await harnessMine($, harnessFolder, await namesIn($, harnessFolder, '.findings.json'), sid, home)).map(n => `${harnessFolder}/${stemOf(n)}.json`)
  const lines = new Set<string>()
  for (const debrief of [...repo, ...harness]) {
    const got = await proposalsAt($, debrief)
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
  if (latest === undefined) {
    const f = await findDebrief($)
    const home = (await homeOf($)).replace(/\/+$/, '')
    return notFoundLine('apply', 'looked' in f ? f.looked : [`${(await $.session.root()).replace(/\/+$/, '')}/.delegation/debriefs`, `${home}/.claude/harness/debriefs`])
  }
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

/**
 * MOD-190/MOD-192, `/delegation land <type> <title> [--parent n] [--paths a,b] [--note text] [--dry-run]` and the land tool: writes a
 * redacted issue body under <root>/.delegation/landed/, then (unless dry-run) files it with gh issue create, adds it to the
 * configured project and writes `issue: #n url` to the end of the file. It spawns nothing, writes no card and no brief.
 */
async function runLand($: Host, text: string): Promise<string> {
  return landWith($, parseLandArgs(text))
}

/** MOD-244: the parsed cards of every folder listed so far, keyed by path; a listing's (mtime, size) decides what is read again. */
let cardIndex: CardIndex = new Map()
/** The valid cards of `dir` ((file name, card), in listing order) from one $.fs.list and the reads of the cards that changed. Throws when the folder cannot be listed. */
async function indexedCards($: Host, dir: string): Promise<{ name: string; card: Card }[]> {
  const listing = (await $.fs.list(dir)).map(e => ({ name: e.name, size: e.size, mtimeMs: e.mtimeMs }))
  const synced = await syncCardIndex(cardIndex, dir, listing, p => readText($, p))
  cardIndex = synced.index
  return cardsOf(cardIndex, dir, listing)
}

async function landWith($: Host, a: LandArgs | { error: string }): Promise<string> {
  if ('error' in a) return a.error
  await loadRepoConfig($)
  const root = (await $.session.root()).replace(/\/+$/, '')
  const cardDir = cardDirPath(root, cfg.cardDir)
  const found: LandCard[] = []
  try {
    for (const { card: c } of await indexedCards($, cardDir)) found.push({ id: c.id, title: c.title, status: c.status, parent: c.fields.parent, scope: c.scope })
  } catch {
    // no card folder: no open cards
  }
  const open = openCards(found, doneTasks((await ledgerAt($, root)).rows))
  // git is not on the allow list outside a merge, so the default branch comes from baseRef and origin from .git/config
  const wantName = defaultBranchOf((cfg.baseRef ?? '').trim())
  const def = wantName !== '' && !isSha(wantName) ? wantName : 'main'
  const rules = await redactRules($, true)
  // MOD-204: the title is redacted with the body's rules before the slug, the dry-run line and gh
  const title = redact(a.title, rules)
  // MOD-214: the evidence goes through the same rules before the preview line and the close comment
  const closedEv = a.closed !== undefined ? redact(a.closed, rules) : undefined
  const closedLine = closedEv !== undefined ? [`(filed closed: ${closedEv})`] : []
  const body = redact(landedBody({ ...(a.note !== undefined ? { note: a.note } : {}), ...(a.supersedes !== undefined ? { supersedes: a.supersedes } : {}), paths: a.paths, cards: open.map(c => ({ id: c.id, title: c.title, scope: c.scope })), defaultBranch: def }), rules)
  const folder = `${root}/.delegation/landed`
  let taken = new Set<string>()
  try {
    taken = new Set((await $.fs.list(folder)).map(e => e.name))
  } catch {
    // the folder is not there yet
  }
  const slug = slugOf(title)
  const origin = gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url')
  const ownerRepo = ownerRepoOf(origin ?? '')
  landRepo = ownerRepo ?? ''
  sessionRoot = root
  // MOD-207: the newest <slug>[-n].md whose body is this body (an issue: line aside) is this landing's file; a copy with no issue: line is reused, one with an issue: line is a resume
  let name = ''
  let alreadyFiled: { number: number; url: string; closed?: boolean } | undefined
  let mayBeFiled: { number: number; url: string } | undefined
  const filing = cfg.landAuto || a.confirm === true
  if (!a.dryRun && ownerRepo) {
    let same: { name: string; text: string } | undefined
    for (let n = 1; ; n++) {
      const cand = n === 1 ? `${slug}.md` : `${slug}-${n}.md`
      if (!taken.has(cand) && !(await exists($, `${folder}/${cand}`))) break
      const text = await readText($, `${folder}/${cand}`)
      if (text !== undefined && withoutIssueLine(text) === body) same = { name: cand, text }
    }
    if (same) {
      const prior = issueLineOf(same.text)
      if (!prior) name = same.name
      else if (!filing) {
        name = same.name
        mayBeFiled = prior
      } else {
        const view = await viewIssue($, root, ownerRepo, prior.number)
        // MOD-214: a landing that is to be filed closed also reuses its issue once it is closed
        if (view?.state === 'OPEN' || (closedEv !== undefined && view?.state === 'CLOSED')) {
          name = same.name
          alreadyFiled = { ...prior, closed: view.state === 'CLOSED' }
        }
      }
    }
  }
  if (name === '') {
    name = freeName(slug, taken)
    while (await exists($, `${folder}/${name}`)) {
      taken.add(name)
      name = freeName(slug, taken)
    }
  }
  const file = `${folder}/${name}`
  if (!alreadyFiled && !mayBeFiled) {
    try {
      await $.fs.write(file, body)
    } catch (err) {
      return `land: ${file} not written: ${String(err)}`
    }
  }
  if (alreadyFiled) {
    // MOD-214: a retry closes the reused issue when it is still open and the call says closed; a closed one is left as is
    const again = closedEv !== undefined && !alreadyFiled.closed ? [await closeFiled($, root, ownerRepo as string, alreadyFiled.number, closedEv, file)] : []
    return [file, `already filed #${alreadyFiled.number} ${alreadyFiled.url}`, ...again].join('\n')
  }
  const hint = a.parent === undefined ? parentHint(a.paths, open, ownerRepo || undefined) : undefined
  const ghLine = ownerRepo
    ? `gh issue create --repo ${ownerRepo} --title ${shellWord(title)} --label type:${a.type}${a.parent !== undefined ? ` --parent ${a.parent}` : ''} --body-file ${file}`
    : `origin is not a GitHub remote (${(origin ?? '').trim() || 'no url'}); no gh line to print`
  const hintLine = hint ? [`parent hint: #${hint.parent} (from ${hint.card})`] : []
  // MOD-200: the old issue is closed with a comment; the mod never edits it
  const supersedeNote = (a.note ?? title).replace(/\s+/g, ' ').trim()
  const closeArgv = (newNumber: string): string[] | undefined => (a.supersedes !== undefined && ownerRepo ? ['gh', 'issue', 'close', String(a.supersedes), '--repo', ownerRepo, '--comment', superseded(Number(newNumber), supersedeNote)] : undefined)
  const supersedeLine = a.supersedes !== undefined && ownerRepo ? [`gh issue close ${a.supersedes} --repo ${ownerRepo} --comment ${shellWord(`superseded by #<new>: ${supersedeNote}`)}`] : []
  if (a.dryRun || !ownerRepo) return [file, ghLine, ...closedLine, ...supersedeLine, ...hintLine, 'nothing was filed or dispatched'].join('\n')
  // MOD-205: landAuto off shows the issue and files only when asked again with confirm
  if (!cfg.landAuto && a.confirm !== true) return [file, `title: ${title}`, `type: ${a.type}`, `parent: ${a.parent ?? 'none'}`, ghLine, ...closedLine, ...supersedeLine, ...hintLine, ...(mayBeFiled ? [`may already be filed #${mayBeFiled.number} ${mayBeFiled.url} (checked on confirm)`] : []), 'nothing filed: landAuto is off; call land again with confirm: true once the person says yes'].join('\n')
  const r = await fileOne($, { root, ownerRepo, file, body, title, type: a.type, ...(a.parent !== undefined ? { parent: a.parent } : {}) })
  if ('failed' in r) return [file, `gh issue create failed; the line it tried: ${ghLine}`, `gh said: ${r.failed === '' ? '(nothing on stderr)' : r.failed}`, ...hintLine].join('\n')
  const projectLines = await addToProject($, root, r.issue.url, a.noProject === true)
  const closing = closeArgv(String(r.issue.number))
  let supersedeLines: string[] = []
  if (closing && a.supersedes !== undefined) {
    const c = await run($, closing, { cwd: root, timeoutMs: 60000 })
    supersedeLines =
      c.ok && c.exitCode === 0
        ? [`closed #${a.supersedes} as superseded by #${r.issue.number}`]
        : [`gh issue close failed; the line it tried: ${closing.slice(0, 6).join(' ')} --comment ${shellWord(closing[7] as string)}`, `gh said: ${(c.ok ? c.stderr || c.stdout : c.why).trim().slice(0, 400) || '(nothing on stderr)'}`]
  }
  const doneLines = closedEv !== undefined ? [await closeFiled($, root, ownerRepo, r.issue.number, closedEv, file)] : []
  return [file, `filed #${r.issue.number} ${r.issue.url}`, ...projectLines, ...doneLines, ...supersedeLines, ...hintLine].join('\n')
}

/** MOD-194: the tree tool and /delegation tree <n>: one gh issue view, printed as done / in flight / planned. Read-only; writes no file. */
async function treeWith($: Host, issue: unknown): Promise<string> {
  const n = typeof issue === 'number' ? issue : typeof issue === 'string' && /^\d+$/.test(issue.trim()) ? Number(issue) : NaN
  if (!Number.isInteger(n) || n < 1 || n > 999999999) return 'tree: the issue must be a whole number, 1 or more (/delegation tree <n>)'
  await loadRepoConfig($)
  const root = (await $.session.root()).replace(/\/+$/, '')
  const origin = gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url')
  const ownerRepo = ownerRepoOf(origin ?? '')
  landRepo = ownerRepo ?? ''
  sessionRoot = root
  if (!ownerRepo) return `tree: origin is not a GitHub remote (${(origin ?? '').trim() || 'no url'})`
  const cardDir = cardDirPath(root, cfg.cardDir)
  const cards: TreeCard[] = []
  try {
    for (const { card: c } of await indexedCards($, cardDir)) {
      const ref = issueRef(c.fields.issue, ownerRepo)
      cards.push({ id: c.id, status: c.status, ...(ref !== undefined ? { issue: ref } : {}) })
    }
  } catch {
    // no card folder: no cards
  }
  const done = doneTasks((await ledgerAt($, root)).rows)
  const r = await run($, ['gh', 'issue', 'view', String(n), '--repo', ownerRepo, '--json', 'number,title,state,labels,body,subIssues'], { cwd: root, timeoutMs: 60000 })
  if (!r.ok) return `tree: gh did not run: ${r.why.trim().slice(0, 400)}`
  if (r.exitCode !== 0) return `tree: gh issue view failed: ${(r.stderr || r.stdout).trim().slice(0, 400) || '(nothing on stderr)'}`
  let json: unknown
  try {
    json = JSON.parse(r.stdout)
  } catch {
    return 'tree: gh printed something that is not JSON'
  }
  return treeText(treeOf(json, cards.filter(c => c.status !== 'merged' && c.status !== 'parked'), done))
}

/** MOD-193: files one landed body with gh issue create, writes `issue: #n url` back, and adds it to the configured project. Shared by land and land_plan. */
async function fileOne($: Host, o: { root: string; ownerRepo: string; file: string; body: string; title: string; type: string; parent?: number }): Promise<{ failed: string } | { issue: { url: string; number: number } }> {
  const created = await run($, ['gh', 'issue', 'create', '--repo', o.ownerRepo, '--title', o.title, '--label', `type:${o.type}`, ...(o.parent !== undefined ? ['--parent', String(o.parent)] : []), '--body-file', o.file], { cwd: o.root, timeoutMs: 60000 })
  const issue = created.ok && created.exitCode === 0 ? issueUrlOf(created.stdout, o.ownerRepo) : undefined
  if (!issue) return { failed: (created.ok ? created.stderr || created.stdout : created.why).trim().slice(0, 400) }
  try {
    await $.fs.write(o.file, `${o.body.replace(/\n*$/, '\n')}issue: #${issue.number} ${issue.url}\n`)
  } catch (err) {
    debug($, `land: issue number not written back to ${o.file}: ${String(err)}`)
  }
  return { issue }
}

/** MOD-207: the one allowlisted `gh issue view` read: the issue's state and its sub-issues; undefined when it cannot be read. */
async function viewIssue($: Host, root: string, ownerRepo: string, n: number): Promise<{ state: string; subs: { number: number; state: string }[] } | undefined> {
  const r = await run($, ['gh', 'issue', 'view', String(n), '--repo', ownerRepo, '--json', 'number,title,state,labels,body,subIssues'], { cwd: root, timeoutMs: 60000 })
  if (!r.ok || r.exitCode !== 0) return undefined
  try {
    const json = JSON.parse(r.stdout) as { state?: unknown } | null
    return { state: typeof json?.state === 'string' ? json.state.toUpperCase() : '', subs: subIssuesOf(json) }
  } catch {
    return undefined
  }
}

/** MOD-204: true when `gh issue view` reads the issue and says it is OPEN; unreadable or closed is false. */
async function issueIsOpen($: Host, root: string, ownerRepo: string, n: number): Promise<boolean> {
  return (await viewIssue($, root, ownerRepo, n))?.state === 'OPEN'
}

/**
 * MOD-214: closes a filed issue with `done before filing: <evidence>` (the evidence already redacted) through the allowlisted
 * `gh issue close` shape, and adds `closed: <ISO time>` to its landed file. The one result line; a failed close is not retried.
 */
async function closeFiled($: Host, root: string, ownerRepo: string, n: number, evidence: string, file: string): Promise<string> {
  const c = await run($, ['gh', 'issue', 'close', String(n), '--repo', ownerRepo, '--comment', doneBeforeFiling(evidence)], { cwd: root, timeoutMs: 60000 })
  if (!c.ok || c.exitCode !== 0) return `close #${n} failed: ${(c.ok ? c.stderr || c.stdout : c.why).trim().slice(0, 400) || '(nothing on stderr)'}`
  try {
    if (file !== '') await $.fs.write(file, withClosedLine((await readText($, file)) ?? '', new Date(await now($)).toISOString()))
  } catch (err) {
    debug($, `land: closed line not written to ${file}: ${String(err)}`)
  }
  return `closed #${n}`
}

/** MOD-193: adds an issue to the configured project; the one line it reports, or none when no project is set. */
async function addToProject($: Host, root: string, url: string, skip = false): Promise<string[]> {
  const project = skip ? undefined : effectiveProject()
  if (!project) return []
  const added = await run($, ['gh', 'project', 'item-add', String(project.number), '--owner', project.owner, '--url', url], { cwd: root, timeoutMs: 60000 })
  return added.ok && added.exitCode === 0 ? [`added to project ${project.owner}/${project.number}`] : [`not added to project ${project.owner}/${project.number}: ${(added.ok ? added.stderr || added.stdout : added.why).trim().slice(0, 400)}`]
}

/**
 * MOD-193: the land_plan tool. Parses and checks the whole plan first (nothing is written when it errors), writes every body,
 * and files the tree only with confirm: true: the feature, then each task under it, stopping at the first create that fails.
 */
async function planWith($: Host, parsedIn: ReturnType<typeof parsePlan>): Promise<string> {
  if ('error' in parsedIn) return parsedIn.error
  await loadRepoConfig($)
  const rules = await redactRules($, true)
  // MOD-204: every title is redacted with the body's rules before the slug, the printed lines and gh
  const parsed = { ...parsedIn, feature: { ...parsedIn.feature, title: redact(parsedIn.feature.title, rules), ...(parsedIn.feature.close !== undefined ? { close: redact(parsedIn.feature.close, rules) } : {}) }, tasks: parsedIn.tasks.map(t => ({ ...t, title: redact(t.title, rules), ...(t.close !== undefined ? { close: redact(t.close, rules) } : {}) })) }
  const root = (await $.session.root()).replace(/\/+$/, '')
  const cardDir = cardDirPath(root, cfg.cardDir)
  const found: LandCard[] = []
  try {
    for (const { card: c } of await indexedCards($, cardDir)) found.push({ id: c.id, title: c.title, status: c.status, parent: c.fields.parent, scope: c.scope })
  } catch {
    // no card folder: no open cards
  }
  const open = openCards(found, doneTasks((await ledgerAt($, root)).rows))
  const wantName = defaultBranchOf((cfg.baseRef ?? '').trim())
  const def = wantName !== '' && !isSha(wantName) ? wantName : 'main'
  const folder = `${root}/.delegation/landed`
  const taken = new Set<string>()
  try {
    for (const e of await $.fs.list(folder)) taken.add(e.name)
  } catch {
    // the folder is not there yet
  }
  const origin = gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url')
  const ownerRepo = ownerRepoOf(origin ?? '')
  const used = new Set<string>()
  // MOD-207: every landed file of this plan ends with the plan key; a feature's prior file is reused only under the same key
  const key = planKey(parsed.feature.title, parsed.feature.paths, parsed.parent)
  const items: { item: PlanItem; isFeature: boolean; file: string; body: string; filed?: { number: number; url: string; closed?: boolean }; mayReuse?: { number: number; url: string }; write: boolean }[] = []
  // the sub-issues of this run's feature, read once; undefined while the feature is new or not yet read
  let featureSubs: { number: number; state: string }[] | undefined
  for (const [i, item] of [parsed.feature, ...parsed.tasks].entries()) {
    const body = `${redact(landedBody({ ...(item.note !== undefined ? { note: item.note } : {}), paths: item.paths, noScope: true, cards: open.map(c => ({ id: c.id, title: c.title, scope: c.scope })), defaultBranch: def }), rules)}plan: ${key}\n`
    const slug = slugOf(item.title)
    let name = ''
    let filedAs: { number: number; url: string; closed?: boolean } | undefined
    let mayReuse: { number: number; url: string } | undefined
    // the newest of the slug file and its -<n> copies that ends in an issue: line may be this run's item already filed
    let newest = ''
    for (let n = 1; ; n++) {
      const cand = n === 1 ? `${slug}.md` : `${slug}-${n}.md`
      if (used.has(cand)) continue
      if (!taken.has(cand) && !(await exists($, `${folder}/${cand}`))) break
      newest = cand
    }
    if (newest !== '' && ownerRepo) {
      const text = await readText($, `${folder}/${newest}`)
      const prior = text === undefined ? undefined : issueLineOf(text)
      if (prior && text !== undefined) {
        if (i === 0) {
          // a feature is reused only under the same plan key and while its issue is OPEN
          if (planLineOf(text) === key) {
            if (!parsed.confirm) {
              name = newest
              mayReuse = prior
            } else {
              const view = await viewIssue($, root, ownerRepo, prior.number)
              // MOD-214: an item to be filed closed is also reused once it is closed
              if (view?.state === 'OPEN' || (item.close !== undefined && view?.state === 'CLOSED')) {
                name = newest
                filedAs = { ...prior, closed: view.state === 'CLOSED' }
                featureSubs = view.subs
              }
            }
          }
        } else if (!parsed.confirm) {
          name = newest
          mayReuse = prior
        } else if (featureSubs) {
          // a task is reused only when it is a sub-issue of this run's feature and OPEN
          const sub = featureSubs.find(x => x.number === prior.number)
          const state = sub ? (sub.state !== '' ? sub.state.toUpperCase() : (await viewIssue($, root, ownerRepo, prior.number))?.state) : undefined
          if (sub && (state === 'OPEN' || (item.close !== undefined && state === 'CLOSED'))) {
            name = newest
            filedAs = { ...prior, closed: state === 'CLOSED' }
          }
        }
      }
    }
    // otherwise the same slug file is reused when it has no issue: line and its content is unchanged
    for (let n = 1; name === ''; n++) {
      const cand = n === 1 ? `${slug}.md` : `${slug}-${n}.md`
      if (used.has(cand)) continue
      if (!taken.has(cand) && !(await exists($, `${folder}/${cand}`))) {
        name = cand
        break
      }
      const text = await readText($, `${folder}/${cand}`)
      if (text === body) {
        name = cand
        break
      }
    }
    used.add(name)
    items.push({ item, isFeature: i === 0, file: `${folder}/${name}`, body, write: !filedAs && !mayReuse, ...(filedAs ? { filed: filedAs } : {}), ...(mayReuse ? { mayReuse } : {}) })
  }
  for (const it of items) {
    if (!it.write) continue
    try {
      await $.fs.write(it.file, it.body)
    } catch (err) {
      return `land_plan: ${it.file} not written: ${String(err)}`
    }
  }
  landRepo = ownerRepo ?? ''
  sessionRoot = root
  const reuseNote = (it: (typeof items)[number]) => (it.mayReuse ? ` may reuse #${it.mayReuse.number} (checked on confirm)` : '')
  const scopeOf = (paths: readonly string[]) => (paths.length > 0 ? paths.join(', ') : 'scope: none')
  const closedNote = (item: PlanItem) => (item.close !== undefined ? ` (filed closed: ${item.close})` : '')
  const tree = [`feature: ${parsed.feature.title} [${scopeOf(parsed.feature.paths)}]${parsed.parent !== undefined ? ` under #${parsed.parent}` : ''}${reuseNote(items[0] as (typeof items)[number])}${closedNote(parsed.feature)}`, ...parsed.tasks.map((t, k) => `  task: ${t.title} [${scopeOf(t.paths)}]${reuseNote(items[k + 1] as (typeof items)[number])}${closedNote(t)}`)]
  const written = ['files written:', ...items.filter(it => it.write).map(it => `  ${it.file}`)]
  if (!parsed.confirm || !ownerRepo) {
    const why = ownerRepo ? [] : [`origin is not a GitHub remote (${(origin ?? '').trim() || 'no url'}); nothing can be filed`]
    return [...tree, ...written, ...why, 'nothing filed: call land_plan again with confirm: true once the person says yes'].join('\n')
  }
  const filed: string[] = []
  const issues: { number: number; url: string; title: string }[] = []
  // MOD-214: the issue number of each item and whether it was already closed when reused
  const numbers: { number: number; closed: boolean }[] = []
  let featureNumber = 0
  // MOD-198: every issue filed so far, this call's and an earlier call's, goes to the project; the lines say how that went
  const projectLines = async (): Promise<string[]> => {
    const lines: string[] = []
    for (const i of issues) for (const l of await addToProject($, root, i.url, parsed.noProject === true)) lines.push(l.startsWith('added') ? l : `${i.title}: ${l}`)
    const failures = lines.filter(l => !l.startsWith('added'))
    return [...(lines.length > 0 && failures.length === 0 ? [lines[0] as string] : []), ...failures]
  }
  for (const [i, it] of items.entries()) {
    if (it.filed) {
      if (it.isFeature) featureNumber = it.filed.number
      filed.push(`already filed #${it.filed.number} ${it.filed.url} ${it.item.title}`)
      issues.push({ ...it.filed, title: it.item.title })
      numbers.push({ number: it.filed.number, closed: it.filed.closed === true })
      continue
    }
    const r = await fileOne($, { root, ownerRepo, file: it.file, body: it.body, title: it.item.title, type: it.item.type, ...(it.isFeature ? (parsed.parent !== undefined ? { parent: parsed.parent } : {}) : { parent: featureNumber }) })
    if ('failed' in r) {
      return [...filed, ...items.slice(i).map(x => `not filed: ${x.item.title}`), `gh said: ${r.failed === '' ? '(nothing on stderr)' : r.failed}`, ...(await projectLines())].join('\n')
    }
    if (it.isFeature) featureNumber = r.issue.number
    filed.push(`filed #${r.issue.number} ${r.issue.url} ${it.item.title}`)
    issues.push({ ...r.issue, title: it.item.title })
    numbers.push({ number: r.issue.number, closed: false })
  }
  // MOD-214: children are closed first; the top item is closed only when every task in the plan is closed
  const closeLines: string[] = []
  const closeNow = async (k: number): Promise<boolean> => {
    const it = items[k] as (typeof items)[number]
    const num = numbers[k] as { number: number; closed: boolean }
    if (it.item.close === undefined) return false
    if (num.closed) return true
    const line = await closeFiled($, root, ownerRepo, num.number, it.item.close, it.file)
    if (!line.startsWith('closed')) closeLines.push(line)
    return line.startsWith('closed')
  }
  let openChildren = 0
  for (let k = 1; k < items.length; k++) if (!(await closeNow(k))) openChildren++
  if (parsed.feature.close !== undefined) {
    if (openChildren > 0) closeLines.push(`#${featureNumber} left open: ${openChildren} open children`)
    else await closeNow(0)
  }
  return [...tree, ...written, ...filed, ...(await projectLines()), ...closeLines, `tree: #${featureNumber} with ${parsed.tasks.length} tasks`].join('\n')
}

/**
 * MOD-215: `/delegation tree import <file> [--dry-run]` and the tree_import tool. The plan file (JSON under .delegation/plans/) is
 * checked whole first; without confirm it prints the tree and counts and runs no gh. With confirm it files parents before children
 * with the land shapes, writes each issue number back into the file after its create (the file is the manifest a re-run reads
 * first), stops after treeImportBatch creates, and paces creates at least 1 s apart.
 */
async function treeImportWith($: Host, a: ReturnType<typeof parseTreeImportArgs>): Promise<string> {
  if ('error' in a) return a.error
  await loadRepoConfig($)
  const root = (await $.session.root()).replace(/\/+$/, '')
  const path = planFileOf(root, a.file)
  if (!path) return `tree import: the plan file must be a .json file under .delegation/plans/ (${a.file})`
  const src = await readText($, path)
  if (src === undefined) return `tree import: ${path} could not be read`
  const parsedPlan = parseTreePlan(src)
  if ('errors' in parsedPlan) return [`tree import: ${a.file} not filed; ${parsedPlan.errors.length} error${parsedPlan.errors.length === 1 ? '' : 's'}:`, ...parsedPlan.errors.map(e => `  ${e}`)].join('\n')
  const rules = await redactRules($, true)
  const redactNode = (n: TreeNode): TreeNode => ({ ...n, title: redact(n.title, rules), ...(n.close !== undefined ? { close: redact(n.close, rules) } : {}), children: n.children.map(redactNode) })
  const plan = { ...parsedPlan.plan, items: parsedPlan.plan.items.map(redactNode) }
  const origin = gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url')
  const ownerRepo = ownerRepoOf(origin ?? '')
  landRepo = ownerRepo ?? ''
  sessionRoot = root
  const total = treeCounts(plan)
  const preview = [`plan: ${a.file}${plan.parent !== undefined ? ` under #${plan.parent}` : ''}`, ...treeLines(plan), countsLine(total)]
  if (a.dryRun || !a.confirm) return [...preview, a.dryRun ? 'nothing filed: dry run' : 'nothing filed: call tree_import again with confirm: true once the person says yes'].join('\n')
  if (!ownerRepo) return [...preview, `origin is not a GitHub remote (${(origin ?? '').trim() || 'no url'}); nothing can be filed`].join('\n')
  let raw: unknown
  try {
    raw = JSON.parse(src)
  } catch {
    return `tree import: ${path} is not valid JSON`
  }
  const key = planKey((path.split('/').pop() ?? 'plan').replace(/\.json$/, ''), [], plan.parent)
  const folder = `${root}/.delegation/landed`
  const taken = new Set<string>()
  try {
    for (const e of await $.fs.list(folder)) taken.add(e.name)
  } catch {
    // the folder is not there yet
  }
  const def = ((): string => {
    const want = defaultBranchOf((cfg.baseRef ?? '').trim())
    return want !== '' && !isSha(want) ? want : 'main'
  })()
  const batch = cfg.treeImportBatch
  const totalNew = total.fresh
  const lines: string[] = []
  const issues: { number: number; url: string; title: string }[] = []
  let created = 0
  let reused = 0
  let stop: string | undefined
  const visit = async (n: TreeNode, parentNum: number): Promise<{ closed: boolean } | undefined> => {
    let num = 0
    let wasClosed = false
    let isReused = false
    let file = ''
    if (n.issue !== undefined) {
      const view = await viewIssue($, root, ownerRepo, n.issue)
      if (!view) {
        stop = `tree import: could not read #${n.issue} (${n.at}); remove its "issue" from the file if it is gone`
        return undefined
      }
      // an OPEN issue, or a CLOSED one (with or without close: MOD-221), is already filed
      if (view.state === 'OPEN' || view.state === 'CLOSED') {
        num = n.issue
        wasClosed = view.state === 'CLOSED'
        isReused = true
        reused++
        lines.push(`already filed #${num}${wasClosed ? ' (closed)' : ''} ${n.title}`)
      }
    }
    if (!isReused) {
      if (created >= batch) {
        stop = 'batch'
        return undefined
      }
      if (created > 0) await pauseOffBudget($, 1000)
      const name = freeName(slugOf(n.title), taken)
      taken.add(name)
      file = `${folder}/${name}`
      const body = `${redact(landedBody({ ...(n.note !== undefined ? { note: n.note } : {}), paths: n.paths, noScope: true, cards: [], defaultBranch: def }), rules)}plan: ${key}\n`
      try {
        await $.fs.write(file, body)
      } catch (err) {
        stop = `tree import: ${file} not written: ${String(err)}`
        return undefined
      }
      const r = await fileOne($, { root, ownerRepo, file, body, title: n.title, type: n.type, ...(parentNum > 0 ? { parent: parentNum } : {}) })
      if ('failed' in r) {
        lines.push(`not filed: ${n.title}`, `gh said: ${r.failed === '' ? '(nothing on stderr)' : r.failed}`)
        stop = 'failed'
        return undefined
      }
      created++
      num = r.issue.number
      lines.push(`filed #${num} ${r.issue.url} ${n.title}`)
      issues.push({ ...r.issue, title: n.title })
      setIssueAt(raw, n.idx, num)
      try {
        await $.fs.write(path, `${JSON.stringify(raw, null, 2)}\n`)
      } catch (err) {
        stop = `tree import: #${num} filed but ${path} not updated: ${String(err)}; add "issue": ${num} to ${n.at} before running again`
        return undefined
      }
    }
    let childrenClosed = true
    for (const c of n.children) {
      const r = await visit(c, num)
      if (!r) return undefined
      if (!r.closed) childrenClosed = false
    }
    let closed = wasClosed
    if (n.close !== undefined) {
      if (wasClosed) closed = true
      else if (childrenClosed) {
        const line = await closeFiled($, root, ownerRepo, num, n.close, file)
        closed = line.startsWith('closed')
        if (!closed) lines.push(line)
      } else lines.push(`#${num} left open: not every child is closed`)
    }
    return { closed }
  }
  for (const top of plan.items) if (!(await visit(top, plan.parent ?? 0))) break
  const projectLines: string[] = []
  for (const i of issues) for (const l of await addToProject($, root, i.url)) projectLines.push(l.startsWith('added') ? l : `${i.title}: ${l}`)
  const failures = projectLines.filter(l => !l.startsWith('added'))
  const project = [...(projectLines.length > 0 && failures.length === 0 ? [projectLines[0] as string] : []), ...failures]
  if (stop === 'batch') return [...preview, ...lines, ...project, `filed ${created} of ${totalNew}; run again to continue`].join('\n')
  if (stop !== undefined) return [...preview, ...lines, ...project, ...(stop === 'failed' ? [] : [stop])].join('\n')
  return [...preview, ...lines, ...project, `tree import: done; filed ${created}, already filed ${reused}`].join('\n')
}

async function redactRules($: Host, forIssue = false): Promise<RedactRules> {
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
    // MOD-218: land files to the origin repo itself, whose name is already public there
    ...(forIssue && ownerRepoOf(origin ?? '') ? { sameRepo: true } : {}),
    ...(userName ? { userName } : {}),
    ...(userEmail ? { userEmail } : {}),
    words: cfg.redact,
  }
}

/**
 * MOD-38: the user messages of this session, with their times, from the transcript file
 * (<home>/.claude/projects/<root as folder>/<session id>.jsonl, read with the mod's own fs read);
 * when that cannot be read, the user rows of the engine's session messages call, which carry no times.
 */
async function sessionUsers($: Host): Promise<UserMessage[]> {
  try {
    const sid = await sessionIdOf($)
    const home = await homeOf($)
    if (sid !== '' && home !== '') {
      const text = await readText($, transcriptPath(home, await $.session.root(), sid))
      if (text !== undefined) return userMessagesFromJsonl(text)
    }
  } catch (err) {
    debug($, `no transcript file for the debrief check: ${String(err)}`)
  }
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
    // MOD-91: the file as the agent wrote it is kept before the check rewrites it; a check that is not clean keeps its lines beside the debrief
    const stem = path.replace(/\.json$/, '')
    const kept: string[] = []
    const rewrites = check.strippedCount > 0 || check.evidenced > 0
    if (rewrites) {
      try {
        await $.fs.write(`${stem}.orig.json`, text)
        kept.push(`${stem}.orig.json`)
      } catch (err) {
        debug($, `debrief original not kept: ${String(err)}`)
      }
    }
    if (rewrites) {
      body = JSON.stringify(check.debrief, null, 2) + '\n'
      await $.fs.write(path, body)
    }
    if (!check.clean) {
      try {
        await $.fs.write(`${stem}.check.txt`, check.lines.join('\n') + '\n')
        kept.unshift(`${stem}.check.txt`)
      } catch (err) {
        debug($, `debrief check lines not kept: ${String(err)}`)
      }
      if (kept.length > 0) await appendRow($, `debrief check kept: ${kept.join(' · ')}`)
      await appendRow($, 'debrief record not moved: the previous record stands, so the next debrief covers this window again; the .done watermark was left as is (not to be marked)')
      return { moved: false, clean: false }
    }
    const debriefRules = await redactRules($)
    // MOD-124: a finding that quotes a brief's local rules or exception text is dropped whole
    const scrubbed = scrubbedFindings(body, debriefRules)
    const findings = scrubbed === undefined ? undefined : dropLocalQuotes(scrubbed, await localBriefTexts($, debriefRules))
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
    } else {
      // MOD-91: the prior record keeps its watermark and lastAt (coverage) but notes this attempt, and counts the failure on this start watermark
      const base: DebriefRecord = debrief.prior ?? { lastAt: 0, watermark: -1, lines: 0, sessionId: sid }
      const before = base.failedChecks
      const count = before && before.watermark === debrief.watermark ? before.count + 1 : 1
      await storeSet($, K.debrief(sid), { ...base, lastAttemptAt: debrief.lastAttemptAt ?? debrief.lastAt, failedChecks: { watermark: debrief.watermark, count } })
    }
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

/**
 * MOD-97 (#163): whose records a read or write means. An object names the task and the other local repo it is for
 * (absent, or the session root: the session's own); an id alone, from a door that takes only an id (the verdict
 * tool, accept, merge, the owed rows), is the repo /dispatch remembered for it (MOD-44), else the session's.
 */
type TaskRef = string | { task: string; repo?: string | undefined }

/** MOD-117: the session root as a key part ('' with no root). */
async function rootKey($: Host): Promise<string> {
  const root = await sessionRootOf($)
  return root ? trimRepo(root) : ''
}
/** MOD-117: the repo a card's per-task keys are in: the other local repo it is for, else the session root ('' with none). The bare keys are moved first. */
async function cardRepo($: Host, repo?: string): Promise<string> {
  await migrateTaskKeys($)
  return repo ? trimRepo(repo) : rootKey($)
}

/**
 * The task id of a ref, the other repo it is for ('' for the session's own repo), and `keyRepo`, the repo its
 * keys are in (MOD-117: the session root for its own cards). The bare keys are moved first (once per root).
 */
async function refOf($: Host, ref: TaskRef): Promise<{ task: string; repo: string; root: string; keyRepo: string }> {
  await migrateTaskKeys($)
  const task = typeof ref === 'string' ? ref : ref.task
  const root = await rootKey($)
  const named = typeof ref === 'string' ? await storeGet<string>($, K.taskRepo(ref, root)) : ref.repo
  const repo = typeof named === 'string' && named !== '' ? trimRepo(named) : ''
  const other = repo === root ? '' : repo
  return { task, repo: other, root, keyRepo: other || root }
}

/** The task's records as stored: a write patches these, so a record written before the rename keeps its word. MOD-117: under its card's repo's key. */
async function loadAttemptsRaw($: Host, ref: TaskRef): Promise<AttemptRecord[]> {
  const { task, keyRepo } = await refOf($, ref)
  const own = await storeGet<AttemptRecord[]>($, K.tasks(task, keyRepo))
  return Array.isArray(own) ? own : []
}

async function loadAttempts($: Host, ref: TaskRef): Promise<AttemptRecord[]> {
  const { task, keyRepo } = await refOf($, ref)
  return readRetired($, K.tasks(task, keyRepo), await loadAttemptsRaw($, ref))
}

/** MOD-97, MOD-117: writes a task's records under its card's repo's key. */
async function saveAttempts($: Host, ref: TaskRef, records: readonly AttemptRecord[]): Promise<void> {
  const { task, keyRepo } = await refOf($, ref)
  await storeSet($, K.tasks(task, keyRepo), records)
}

/**
 * MOD-117 (#185, #184): moves every bare per-task key to its repo's key (hooks/lib/taskkeys.ts): an attempt ledger's
 * rows to the root (or repo) each names, else the session root's; anything else to the session root's. Run at
 * session.start, and before the first per-task read of a root this process has not migrated (a reload mid-session).
 * Idempotent: a store with no bare key moves nothing. One debug line says how many keys moved.
 */
let migrated: { root: string; done: Promise<void> } | undefined
function migrateTaskKeys($: Host, again = false): Promise<void> {
  return (async () => {
    const root = await rootKey($)
    if (!root) return
    if (!again && migrated?.root === root) return migrated.done
    const done = migrateOnce($, root)
    migrated = { root, done }
    return done
  })()
}
async function migrateOnce($: Host, root: string): Promise<void> {
  try {
    const plan = migrationPlan(await storeEntries($), root)
    if (plan.delete.length === 0) return
    for (const [key, value] of plan.set) {
      try {
        await $.store.set(key, value)
      } catch (err) {
        // a bare key is never deleted before its rows are written elsewhere: the next session start tries again
        debug($, `per-task keys not moved: store.set ${key} failed: ${String(err)}`)
        await storeRefused($, key, err)
        return
      }
    }
    let n = 0
    for (const key of plan.delete) {
      try {
        await $.store.delete(key)
        agentKeyChanged(key)
        n += 1
      } catch (err) {
        debug($, `store.delete ${key} failed: ${String(err)}`)
      }
    }
    recordsCache = undefined
    debug($, migratedLine(n))
  } catch (err) {
    debug($, `per-task keys not moved: ${String(err)}`)
  }
}

/** MOD-19 (0.8.0): a stored record that still holds the retired verdict word reads as consistent; each one is logged at debug. */
function readRetired($: Host, key: string, records: readonly AttemptRecord[]): AttemptRecord[] {
  return records.map(r => {
    if (!isRetiredVerdict(r.verdict)) return r
    debug($, `${key} attempt ${r.attempt}: a record written before the rename reads as consistent`)
    return readRecord(r)
  })
}

/** MOD-19 (0.8.0): a recent-verdict row written before the rename reads as consistent; each one is logged at debug. */
function readRecent($: Host, rows: readonly RecentVerdict[]): RecentVerdict[] {
  return rows.map(r => {
    const line = readLine(r.line)
    if (line === r.line && !isRetiredVerdict(r.verdict)) return r
    debug($, `${r.task} attempt ${r.attempt}: a row written before the rename reads as consistent`)
    return { ...r, line, verdict: readVerdict(r.verdict) }
  })
}

/** MOD-95: the number of an attempt of `task` that is running or awaiting its verdict (a non-replay record still pending), else undefined. */
async function openAttemptOf($: Host, ref: TaskRef): Promise<number | undefined> {
  const records = await loadAttemptsRaw($, ref)
  return records.findLast(r => r.verdict === 'pending' && r.replay !== true)?.attempt
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
  // MOD-44: repo=<checkout> names the repo the task is for; its worktree is the sibling <repo>-<id> (an older repo=<dir> is the tree itself)
  if (headerRepo && headerRepo.startsWith('/')) {
    const sibling = worktreePath(headerRepo.replace(/\/+$/, ''), spawn.task, spawn.replay)
    return (await exists($, sibling)) ? sibling : headerRepo
  }
  if (headerRepo) return headerRepo
  if (spawn.cwd && (await exists($, spawn.cwd))) return spawn.cwd
  const sibling = worktreePath(root, spawn.task, spawn.replay, cfg.worktreeRoot)
  return (await exists($, sibling)) ? sibling : root
}

// ---- GH-104: look before you respawn ------------------------------------------------------
/** What the look at a worker's worktree needs of the task: who, where it ran, a replay's base, repo=here. */
type LookFor = { task: string; subtask: string; cwd?: string; replay?: boolean; base?: string; here?: string }

/** The worker's own worktree and the base its commits count from; undefined when it has none (its tree would be the session root). */
async function workerTree($: Host, s: LookFor, header: BriefHeader | undefined, root: string): Promise<{ repo: string; base: string | undefined } | undefined> {
  const other = await adoptRepo($, s.task, header)
  const repo = (await workerRepo($, s, header?.repo, root)).replace(/\/+$/, '')
  if (repo === root) return undefined
  const briefBase = (header?.fields.base ?? '').trim()
  return { repo, base: s.base || (briefBase && isGitRef(briefBase) ? briefBase : '') || (other ? other.baseRef : cfg.baseRef) || undefined }
}

/**
 * MOD-150: a failing verdict's worker whose commits are all on the base already (cherry-picked by patch, or merged) is not
 * resumed: the row's next says so. Read-only, through run(); anything it cannot read leaves the advice as it was.
 */
async function workOnBase($: Host, s: SpawnRecord, header: BriefHeader | undefined, sha: string): Promise<string | undefined> {
  if (s.here || header?.repo === 'here' || header?.repo === 'none') return undefined
  let root: string
  try {
    root = (await $.session.root()).replace(/\/+$/, '')
  } catch {
    return undefined
  }
  const tree = await workerTree($, s, header, root)
  if (!tree) return undefined
  const found = await branchOnBase({ repo: tree.repo, sha, ...(tree.base ? { base: tree.base } : {}), ...(s.at !== undefined ? { sinceMs: s.at } : {}) }, (argv, init) => run($, [...argv], init))
  return found ? onBaseClause(found.base) : undefined
}

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
  const tree = await workerTree($, s, header, root)
  if (!tree) return undefined
  const { repo, base } = tree
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
  s: { task: string; subtask: string; tier: Tier; alias: string; purpose: string; briefPath?: string; agentId?: string; repo?: string },
  w: WorkPresent,
  lane: Lane | undefined,
): Promise<number> {
  const all = await loadAttempts($, s)
  const ladder = all.filter(r => (r as HereRecord).adhoc !== true)
  const last = attemptsFor(ladder, s.subtask, lane).at(-1)
  if (last?.verdict === 'work-present') {
    if (last.sha !== w.sha) await saveAttempts($, s, all.map(r => (r === last ? { ...r, sha: w.sha } : r)))
    return last.attempt
  }
  const attempt = nextAttempt(ladder, s.subtask, lane)
  const agentId = s.agentId ?? last?.agentId
  const briefPath = s.briefPath ?? last?.briefPath
  const rec: HereRecord = {
    ...(await ownerFields($, s.repo)),
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
  await saveAttempts($, s, [...all, rec])
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
async function takeEngineTurn($: Host, label: string, progressKey?: string): Promise<{ line?: string; release: () => Promise<void> }> {
  const started = await now($)
  const token = `${label}#${started}#${(engineSeq += 1)}`
  let holder: string | undefined
  try {
    for (;;) {
      const t = await now($)
      const d = await alone(async () => {
        const decision = engineLockDecision(readEngineLock(await $.store.get(K.engineGate)), t, token)
        if (decision.take) await $.store.set(K.engineGate, { holder: label, token, since: t, until: t + gateTimeoutMs() } satisfies EngineLock)
        return decision
      })
      if (d.take) break
      // MOD-229: the lock wait is shown apart from the gate's own time, and the ceiling starts only once the gate does
      if (holder === undefined && progressKey !== undefined) gateProgress.set(progressKey, { phase: 'lock', since: started })
      holder = d.holder
      // MOD-72: a process wait, so a long lock wait does not spend the hook's budget (HookBudget); a clock wait of 1 s at most when it cannot start
      if (!(await pauseOffBudget($, d.waitMs))) await $.clock.sleep(Math.min(d.waitMs, 1000))
    }
  } catch (err) {
    debug($, `${label}: engine gate turn not taken (${String(err)}); the gate runs without it`)
    return { release: async () => undefined }
  } finally {
    if (progressKey !== undefined && gateProgress.get(progressKey)?.phase === 'lock') gateProgress.delete(progressKey)
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
/** A root with more files than this is not listed in the store (MOD-85: it gets a watermark, a time, instead). */
const OUTSIDE_MAX_ENTRIES = 10000

const isEnoent = (err: unknown): boolean => /ENOENT/.test(String(err))

/**
 * One root as a before-and-after listing: every file under it as (relative path, size, mtime), folders
 * walked and links not followed. A root that is not there yet lists as empty; a root that is a file is
 * itself the one entry (path ''); a root that cannot be read says why. MOD-85: a root past
 * OUTSIDE_MAX_ENTRIES files is recorded as a watermark ({ root, since, files }) and its files are not stored.
 * With `since` (the hand-back walk of a watermark root) the walk has no 10000 cap but a ceiling of
 * OUTSIDE_WALK_CEILING entries, and keeps only the files and folders modified after `since`.
 */
async function listRoot($: Host, root: string, since?: number): Promise<RootListing> {
  const started = await now($)
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
  const dirs: { path: string; mtimeMs: number }[] = []
  let seen = 0
  let files = 0
  if (since !== undefined && st.mtimeMs > since) dirs.push({ path: '', mtimeMs: st.mtimeMs })
  const walk = async (dir: string, rel: string): Promise<string | undefined> => {
    let listed: { name: string; kind: string; size: number; mtimeMs: number; isLink: boolean }[]
    try {
      listed = await $.fs.list(dir)
    } catch (err) {
      return String(err).slice(0, 160)
    }
    for (const e of listed) {
      const path = rel === '' ? e.name : `${rel}/${e.name}`
      if (++seen > OUTSIDE_WALK_CEILING) return `more than ${OUTSIDE_WALK_CEILING} entries`
      if (e.kind === 'dir' && !e.isLink) {
        if (since !== undefined && e.mtimeMs > since) dirs.push({ path, mtimeMs: e.mtimeMs })
        const why = await walk(`${dir}/${e.name}`, path)
        if (why !== undefined) return why
      } else if (since !== undefined) {
        if (e.mtimeMs > since) entries.push({ path, size: e.size, mtimeMs: e.mtimeMs })
      } else if (entries.length <= OUTSIDE_MAX_ENTRIES) entries.push({ path, size: e.size, mtimeMs: e.mtimeMs })
      else files += 1
    }
    return undefined
  }
  const why = await walk(root, '')
  if (why !== undefined) return { root, error: why }
  if (since !== undefined) return { root, entries, dirs }
  return entries.length > OUTSIDE_MAX_ENTRIES ? { root, since: started, files: entries.length + files } : { root, entries }
}

/** MOD-233: the listing kept inline in the store (when its file could not be written) holds at most this many entries per root. */
const OUTSIDE_INLINE_MAX = 200
const capListing = (l: RootListing): RootListing => ('entries' in l && l.entries.length > OUTSIDE_INLINE_MAX ? { ...l, entries: l.entries.slice(0, OUTSIDE_INLINE_MAX), truncated: true } : l)

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

/**
 * The listings /dispatch took of a task's absolute roots, with a way to list them again; undefined when none were taken.
 * MOD-186: the listing is read from the file the store record names; a record that still carries `roots` inline
 * (an older version) is read as before. A file that is gone or unreadable leaves every watched root with a listing
 * error, so the scope claim is unchecked and names the file.
 */
async function outsideFor($: Host, task: string | undefined, repo?: string, watched: readonly string[] = []): Promise<OutsideInput | undefined> {
  if (!task) return undefined
  // MOD-97 (#164): the listing is the card's repo's: another repo's task of the same id never lends it one
  // MOD-117 (#185): and a same-id card of another repo the session started in never lends one either
  const saved = await storeGet<{ roots?: RootListing[]; file?: string }>($, K.outside(task, await cardRepo($, repo)))
  const list = (root: string, since?: number) => listRoot($, root, since)
  if (Array.isArray(saved?.roots)) return { before: saved.roots, list }
  if (typeof saved?.file !== 'string') return undefined
  const file = saved.file
  const unread = (why: string): OutsideInput => ({ before: (watched.length > 0 ? watched : [file]).map(root => ({ root, error: `the listing file ${file} ${why}` })), list })
  const text = await readText($, file)
  if (text === undefined) return unread('is missing or unreadable')
  try {
    const parsed = JSON.parse(text) as unknown
    return Array.isArray(parsed) ? { before: parsed as RootListing[], list } : unread('does not hold a listing')
  } catch {
    return unread('does not hold a listing')
  }
}

/**
 * MOD-186: drops a listing file the mod wrote. `$.fs` has no delete, so the file is emptied (a few bytes stay on disk);
 * only a file directly under the session's `.delegation/outside/` folder is touched. A failure is a debug line, never a stop.
 */
async function dropOutsideFile($: Host, file: unknown): Promise<void> {
  if (typeof file !== 'string') return
  try {
    const root = await sessionRootOf($)
    if (!isOutsideFile(root, file) || !(await exists($, file))) return
    await $.fs.write(file, '')
  } catch (err) {
    debug($, `outside listing file ${file} not removed: ${String(err)}`)
  }
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
async function recordOutside($: Host, task: string, briefPath: string, reused: boolean, repo?: string): Promise<string | undefined> {
  const text = await readText($, briefPath)
  const contract = text !== undefined ? briefContract(text) : undefined
  if (!contract || !contract.ok) return undefined
  const roots = outsideRoots(contract.scope.filter(isAbsolute), contract.forbid.filter(isAbsolute))
  const key = K.outside(task, await cardRepo($, repo))
  // MOD-97 (#164): a brief that names no outside root leaves no listing behind for its verifier to read
  if (roots.length === 0) {
    const had = await storeGet<{ file?: string }>($, key)
    if (had != null) {
      await dropOutsideFile($, had.file)
      try {
        await $.store.delete(key)
      } catch (err) {
        debug($, `store.delete ${key} failed: ${String(err)}`)
      }
    }
    return undefined
  }
  if (reused && (await storeGet<unknown>($, key)) != null) return `outside: the listing of ${roots.join(', ')} taken at the first dispatch stands`
  const listed: RootListing[] = []
  for (const root of roots) listed.push(await listRoot($, root))
  const files = listed.reduce((n, l) => n + ('entries' in l ? l.entries.length : 0), 0)
  // MOD-186: the listing is a file under the session's .delegation/outside/, so the store holds a pointer only
  const sessionDir = await sessionRootOf($)
  const file = sessionDir !== '' ? outsideFilePath(sessionDir, key.slice(K.outside('').length)) : undefined
  let wrote = false
  if (file !== undefined) {
    try {
      await $.fs.write(file, JSON.stringify(listed))
      wrote = true
    } catch (err) {
      debug($, `outside listing file ${file} not written, the listing stays in the store: ${String(err)}`)
    }
  }
  await storeSet($, key, wrote && file !== undefined ? { at: await now($), briefPath, file, files } : { at: await now($), briefPath, roots: listed.map(capListing) })
  const bad = listed.filter((l): l is { root: string; error: string } => 'error' in l)
  const marks = listed.filter((l): l is { root: string; since: number; files: number } => 'since' in l)
  return `outside: listed ${roots.join(', ')} before the run (${files} file${files === 1 ? '' : 's'})${bad.length > 0 ? `; ${bad.map(b => `${b.root} could not be listed: ${b.error}`).join('; ')}, so scope will be unchecked there` : ''}${marks.map(m => `; ${m.root} holds more than ${OUTSIDE_MAX_ENTRIES} files, so changes there will be found by modification time`).join('')}`
}

/** MOD-152: lock the worker's worktree for the verify; true only when this call's lock took. A failure is debug, never a stop. */
async function lockWorktree($: Host, repo: string, worktree: string): Promise<boolean> {
  const r = await run($, ['git', '-C', repo, 'worktree', 'lock', '--reason', LOCK_REASON, worktree], { cwd: repo, timeoutMs: 15000 })
  if (r.ok && r.exitCode === 0) return true
  debug($, `worktree lock ${worktree} not taken: ${r.ok ? `exit ${r.exitCode} ${r.stderr.trim()}` : r.why}`)
  return false
}

/** MOD-152: free a worktree; a failure is debug only (a lock left behind is freed by `git worktree unlock <path>`). */
async function unlockWorktree($: Host, repo: string, worktree: string): Promise<void> {
  const r = await run($, ['git', '-C', repo, 'worktree', 'unlock', worktree], { cwd: repo, timeoutMs: 15000 })
  if (!r.ok || r.exitCode !== 0) debug($, `worktree unlock ${worktree} failed: ${r.ok ? `exit ${r.exitCode} ${r.stderr.trim()}` : r.why}`)
}

/**
 * MOD-230 (#323): the machine's 1-minute load and core count. macOS runs `sysctl -n vm.loadavg hw.ncpu`; Linux (where
 * that fails) reads /proc/loadavg and runs `nproc` (both argvs are exact entries of the allowlist). Fails open: any error, refusal or
 * unparsable text is nothing.
 */
async function readMachineLoad($: Host): Promise<LoadReading | undefined> {
  try {
    const r = await run($, [...SYSCTL_LOAD_ARGV], { timeoutMs: 5000 })
    if (r.ok && r.exitCode === 0) {
      const mac = parseSysctlLoad(r.stdout)
      if (mac) return mac
    }
    // not macOS (or sysctl cannot say): Linux
    let proc: string
    try {
      proc = await $.fs.read(PROC_LOADAVG)
    } catch {
      return undefined
    }
    const n = await run($, [...NPROC_ARGV], { timeoutMs: 5000 })
    return n.ok && n.exitCode === 0 ? parseProcLoad(proc, n.stdout) : undefined
  } catch {
    return undefined
  }
}

/** MOD-230: the loaded-machine words when the machine is loaded now, else nothing. */
async function loadedWordsNow($: Host, id: string): Promise<string | undefined> {
  const reading = await readMachineLoad($)
  return isLoaded(reading) ? loadedWords(reading, id) : undefined
}

/**
 * MOD-230 (#323): `<k> lanes share the engine gate; ...` when 3 or more briefed lanes (the live workers, the queued
 * rows and this one) have an engine gate. The gate is read off each lane's brief; a brief that cannot be read is no lane.
 */
async function engineLanesNote($: Host, id: string, ownBrief: string, ownGateMap: Readonly<Record<string, string>>): Promise<string | undefined> {
  try {
    const lanes = new Set<string>()
    const root = await $.session.root()
    const consider = async (label: string, path: string | undefined, map: Readonly<Record<string, string>>) => {
      const text = path ? await readText($, path) : undefined
      if (text !== undefined && briefHasEngineGate(text, map)) lanes.add(label)
    }
    await consider(id, ownBrief, ownGateMap)
    for (const w of (await liveState($)).workers) await consider(w.label, w.spawn.briefPath, cfg.gateMap)
    for (const q of await readQueue($)) {
      const label = taskLabel(q.task, q.subtask ?? 'main')
      if (lanes.has(label)) continue
      await consider(label, await existingBrief($, root, briefFileName(q.task)), cfg.gateMap)
    }
    return engineLanesLine(lanes.size)
  } catch {
    return undefined
  }
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
  const amendLines = await applyHandbackAmends($, briefPath, briefText, text, spawn, parseReport(block).sha)
  // the verifier reads the brief as it now stands: header + amend blocks
  briefText = (await readText($, briefPath)) ?? briefText
  const header = parseHeader(briefText)
  // MOD-44: a task for another local repo is judged in that repo's worktree, against its origin/main, with its gate map
  const other = await adoptRepo($, spawn.task, header)
  const gateMap = other && Object.keys(other.gateMap).length > 0 ? other.gateMap : cfg.gateMap
  const baseRef = other ? other.baseRef : cfg.baseRef
  const report = parseReport(block)
  const filesPath = filesPathFor(scratchFor(briefPath), spawn.task)
  const allowed = (argv: readonly string[]) => checkArgv(argv, allowCfg()).ok
  // MOD-217: the paths this worker wrote, so scope is charged only for them
  const writes = spawn.agentId ? await storeGet<string[]>($, K.writes(spawn.agentId)) : undefined
  if (header?.repo === 'none') return verifyNoRepo($, briefText, report, filesPath, amendLines, root, spawn.task, other?.path, writes)
  // GH-16: repo=here verifies the session's own checkout, shared with the brain and other workers
  const here = header?.repo === 'here'
  const repo = here ? root : await workerRepo($, spawn, header?.repo, root)
  const probed = await run($, workTreeArgv(repo), { cwd: root, timeoutMs: 15000 })
  if (!probed.ok || isNotWorkTree(probed)) return verifyNoRepo($, briefText, report, filesPath, amendLines, root, spawn.task, other?.path, writes)
  // GH-20: a red file must differ from every earlier attempt's of this task + subtask
  const priorRed = priorRedHashes(await loadAttempts($, spawn), spawn.subtask, spawn.attempt, laneOf(spawn))
  const others = here ? (await inFlightHere($, root, taskLabel(spawn.task, spawn.subtask))).map(c => ({ card: c.label, files: c.files })) : []
  const outside = await outsideFor($, spawn.task, other?.path)
  // MOD-152 (#246): a worktree is locked while the verifier judges it, so a plain `worktree remove --force` refuses it
  const taskRepo = (other?.path ?? root).replace(/\/+$/, '')
  const lockPath = repo.replace(/\/+$/, '')
  const locked = !here && lockPath !== taskRepo ? await lockWorktree($, taskRepo, lockPath) : false
  let r: Awaited<ReturnType<typeof verifyNative>>
  try {
    r = await verifyNative(
      {
        repo,
        report,
        briefText,
        gateMap,
        allowed,
        filesPath,
        gateTimeoutMs: gateTimeoutMs(),
        outDir: `${root}/.delegation/${spawn.task}`,
        attempt: spawn.attempt,
        priorRed,
        ...(spawn.replay && spawn.base ? { base: spawn.base } : {}),
        ...(baseRef ? { baseRef } : {}),
        ...(here ? { here: true, ignore: ignoreWithCards(cfg.ignore, cfg.cardDir), others } : {}),
        ...(outside ? { outside } : {}),
        ...(writes ? { writes } : {}),
      },
      {
        exec: (argv, init) => run($, [...argv], init),
        // MOD-229: gates (and the red test's re-run) are spawned under the mod's own ceiling
        gate: (argv, init) => spawnGate($, [...argv], { cwd: init.cwd, progress: { key: taskLabel(spawn.task, spawn.subtask), id: init.id } }),
        write: (path, t) => $.fs.write(path, t),
        readRed: path => readRed($, path),
        turn: () => takeEngineTurn($, taskLabel(spawn.task, spawn.subtask), taskLabel(spawn.task, spawn.subtask)),
        stat: path => statArtefact($, path),
        load: () => loadedWordsNow($, spawn.task),
      },
    )
  } finally {
    if (locked) await unlockWorktree($, taskRepo, lockPath)
  }
  return { verdict: r.verdict, lines: [...amendLines, ...r.lines], ...(r.metrics ? { metrics: r.metrics } : {}), ...(r.red ? { red: r.red.path, ...(r.red.hash !== undefined ? { redHash: r.red.hash } : {}), ...(r.red.held ? { redHeld: true as const } : {}) } : {}) }
}

/**
 * Part 3A: a brief with `repo=none` (or a repo that is not a git work tree).
 * No branch, sha or diff to read: every `files=` path must exist under the
 * first scope root and lie in scope; the gate (map id, or a bare allowlisted
 * command such as `claude plugin validate <folder>`) must exit 0.
 */
async function verifyNoRepo($: Host, briefText: string, report: ReturnType<typeof parseReport>, filesPath: string, amendLines: string[], root: string, task?: string, repo?: string, writes?: readonly string[]): Promise<VerifyResult> {
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
  const baseline = await outsideFor($, task, repo, watched)
  // MOD-185: the mod's .delegation/ and the cards folder in the session checkout are written during a run, never by the worker
  const outside = await outsideCheck(absScope, absForbid, baseline && writes ? { ...baseline, writes } : baseline, [`${root.replace(/\/+$/, '')}/.delegation`, cardDirPath(root, cfg.cardDir)])
  const artefacts = await artefactsCheck(reportArtefacts(report.artefacts), contract.outdir ?? scopeRoot, path => statArtefact($, path))
  const metrics = reportMetrics(report.metrics)
  // MOD-163: a card with no worktree has one sensible {worktree}: the checkout the worker ran in (the task's other repo per MOD-44)
  const gateRoot = repo ?? root
  const gates = resolveGateRuns(contract.gate, cfg.gateMap, argv => checkArgv(argv, allowCfg()).ok, filesPath, gateRoot, contract.outdir)
  const outcomes: { label: string; exitCode?: number; error?: string }[] = []
  const waits: string[] = []
  for (const g of gates.runs) {
    // MOD-20: an engine gate takes its turn here too
    const label = taskLabel(report.task ?? 'no-repo', report.subtask ?? 'main')
    const turn = isEngineGate(g.argv) ? await takeEngineTurn($, label, label) : undefined
    if (turn?.line) waits.push(turn.line)
    let r: RunOut
    try {
      r = await spawnGate($, g.argv, { cwd: gateRoot, progress: { key: label, id: gateIdOf(contract.gate, cfg.gateMap, g.label) } })
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
  const ranIds = (contract.gate ?? '').split(',').map(g => g.trim()).filter(g => g && !gates.notRerun.some(n => n.id === g))
  const ranNote = gates.runs.length > 0 && ranIds.length > 0 ? [`gate ${ranIds.join(', ')} ran in the checkout (repo=none)`] : []
  // MOD-217: changed paths the worker did not write are listed, never judged
  const foreignLine = outside?.foreign && outside.foreign.length > 0 ? [`changed during the run, not by this worker: ${outside.foreign.join(', ')}`] : []
  const note = watched.length > 0 && baseline === undefined ? [`note: outside delta not checked: no listing of ${watched.join(', ')} was taken at dispatch`] : []
  return { verdict: v.verdict, lines: [...amendLines, ...contract.lines, ...waits, ...v.lines, ...foreignLine, ...ranNote, ...note], noRepo: true, ...(Object.keys(metrics).length > 0 ? { metrics } : {}) }
}

/**
 * MOD-170: for each path, whether it exists at the brief's base ('exists'), not ('new'), or git could not
 * say ('error'; a hold). Read-only git in the worker's tree: `rev-parse --verify --quiet <base>:<path>`,
 * the base being merge-base(base, the reported sha) so a moving base does not count a later file.
 */
async function pathsAtBase($: Host, spawn: SpawnRecord, briefText: string, sha: string | undefined, paths: readonly string[]): Promise<Map<string, 'new' | 'exists' | 'error'>> {
  const out = new Map<string, 'new' | 'exists' | 'error'>()
  const fail = () => {
    for (const p of paths) out.set(p, 'error')
    return out
  }
  if (paths.length === 0) return out
  try {
    const header = parseHeader(briefText)
    if (header?.repo === 'none') return fail()
    const root = await $.session.root()
    const other = await adoptRepo($, spawn.task, header)
    const repo = header?.repo === 'here' ? root : await workerRepo($, spawn, header?.repo, root)
    const git = async (...args: string[]) => {
      const r = await run($, ['git', '-C', repo, ...args], { cwd: root, timeoutMs: 15000 })
      return r.ok ? r : undefined
    }
    const briefBase = (header?.fields.base ?? '').trim()
    let base = (spawn.replay && spawn.base ? spawn.base : '') || (briefBase && isGitRef(briefBase) ? briefBase : '') || (other ? other.baseRef : cfg.baseRef) || ''
    if (!base) {
      for (const ref of BASE_REFS) {
        const r = await git('rev-parse', '--verify', '--quiet', ref)
        if (r && r.exitCode === 0) {
          base = ref
          break
        }
      }
    }
    if (!base) return fail()
    let at = base
    if (sha) {
      const mb = await git('merge-base', base, sha)
      const first = mb && mb.exitCode === 0 ? (mb.stdout.split('\n')[0] ?? '').trim() : ''
      if (first) at = first
    }
    for (const p of paths) {
      const r = await git('rev-parse', '--verify', '--quiet', `${at}:${p}`)
      out.set(p, !r ? 'error' : r.exitCode === 0 ? 'exists' : r.exitCode === 1 ? 'new' : 'error')
    }
    return out
  } catch {
    return fail()
  }
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
async function applyHandbackAmends($: Host, briefPath: string, briefText: string, text: string, spawn: SpawnRecord, sha: string | undefined): Promise<string[]> {
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
  // MOD-170: scopeAmends decides the rest; a block held by it is listed with how to accept it, and not appended
  const rest = fresh.filter(a => !needs(a))
  const mode = cfg.scopeAmends
  const scopeNow = effectiveList(hdr?.fields.scope ?? hdr?.fields.scope_globs ?? '', parseAmends(briefText).amends, 'scope').split(',').filter(Boolean)
  const baseState = mode === 'new-files' ? await pathsAtBase($, spawn, briefText, sha, [...new Set(rest.flatMap(amendScopePaths))]) : new Map<string, 'new' | 'exists' | 'error'>()
  const byMode = rest.filter(a => scopeAmendHeld(a, mode, scopeNow, baseState, parentScopeOf(briefText)))
  const apply = rest.filter(a => !byMode.includes(a))
  const heldLines = [
    ...held.flatMap(a => {
      const inside = amendScopeInsideForbid(a, forbidOf(a))
      const removes = a.ops.some(op => /^(scope|forbid)-=/.test(op))
      return [...(removes || inside.length === 0 ? [amendApprovalLine(a, briefPath)] : []), ...inside.map(amendInsideForbidLine)]
    }),
    ...byMode.map(a => amendHeldLine(a, mode, briefPath, sha ?? '<sha>')),
  ]
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
 * MOD-135 (#222): a spawn with no brief (ad hoc with no brief path, or a named brief it could not read) whose report
 * names a task= that is a store key looks for `<root>/.delegation/briefs/<task>.brief.md` (the subtask file name when
 * subtask= is not main). Found, and its header names that task, the spawn becomes that task's next attempt, judged
 * against the brief as a dispatched one is. Nothing found leaves the spawn to the cardless path.
 */
async function briefForReport($: Host, spawn: SpawnRecord, report: ReturnType<typeof parseReport>): Promise<SpawnRecord | undefined> {
  if (!spawn.adhoc || (spawn.briefPath !== undefined && spawn.noBrief === undefined)) return undefined
  // MOD-211: a report naming no task takes the task of the brief header its spawn named (the brief file the prompt points at)
  const hinted = spawn.briefPath !== undefined ? parseHeader((await readText($, spawn.briefPath)) ?? '') : undefined
  const task = reportTaskOf(report.task) ?? reportTaskOf(hinted?.task)
  if (task === undefined) return undefined
  const subtask = reportTaskOf(report.subtask) ?? reportTaskOf(hinted?.subtask) ?? 'main'
  const name = subtask === 'main' ? `${task}.brief.md` : inlineBriefFileName(task, subtask)
  if (name === undefined) return undefined
  const root = (await $.session.root()).replace(/\/+$/, '')
  const briefPath = `${root}/.delegation/briefs/${name}`
  const text = await readText($, briefPath)
  const header = text !== undefined ? parseHeader(text) : undefined
  if (!header || header.task !== task) return undefined
  const repo = header.repo?.startsWith('/') ? header.repo : undefined
  const before = (await loadAttempts($, { task, repo })).filter(r => (r as HereRecord).adhoc !== true)
  const attempt = nextAttempt(before, subtask)
  const spend = spendOf(header)
  const { noBrief: _noBrief, ...rest } = spawn
  return {
    ...rest,
    task,
    subtask,
    adhoc: false,
    attempt,
    lineage: attempt,
    briefPath,
    purpose: header.purpose,
    budget: parseBudget(header.budget, cfg.defaultBudget),
    ...(spend !== undefined ? { spend } : {}),
    resources: resourcesOf(header),
    ...(repo ? { repo } : {}),
  }
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
  const key = await attemptKey($, spawnIn)
  const running = finalizing.get(key)
  if (running) return running
  const job = finalizeOnce($, spawnIn, text, measured)
  finalizing.set(key, job)
  verifying.set(key, spawnIn)
  try {
    return await job
  } finally {
    finalizing.delete(key)
    verifying.delete(key)
    // MOD-89: after each verdict the store is pruned, off the verdict's own path
    void pruneStore($, 'verdict')
  }
}

const withTailIf = (text: string, tail: string | undefined): string => (tail ? withTail(text, tail) : text)

/** MOD-94: the attempt record a spawn record stands for, as the spawn hook (or a resume) would have written it. */
async function attemptOfSpawn($: Host, spawn: SpawnRecord): Promise<AttemptRecord> {
  const rec: HereRecord = {
    ...(await ownerFields($, spawn.repo)),
    task: spawn.task,
    subtask: spawn.subtask,
    attempt: spawn.attempt,
    kind: spawn.attempt === spawn.lineage ? 'spawn' : 'resume',
    lineage: spawn.lineage,
    tier: spawn.tier,
    alias: spawn.alias,
    ...(spawn.resolvedModel ? { resolvedModel: spawn.resolvedModel } : {}),
    verdict: 'pending',
    at: spawn.at ?? (await now($)),
    ...(spawn.agentId ? { agentId: spawn.agentId } : {}),
    toolUseId: spawn.key,
    ...(spawn.briefPath ? { briefPath: spawn.briefPath } : {}),
    purpose: spawn.purpose,
    ...laneFields(laneOf(spawn)),
    ...(spawn.here ? { here: spawn.here } : {}),
  }
  return rec
}

const renderedOf = (s: SpawnRecord): Rendered => {
  const full = s.verdictBlock ?? s.verdictSummary ?? ''
  return { full, line: s.verdictLine ?? full.split('\n')[0] ?? '' }
}
/** MOD-233: a spawn holds a verdict: its block, or (once posted and a day old) its one-line summary. */
const hasVerdictText = (s: SpawnRecord): boolean => !!(s.verdictBlock || s.verdictSummary)

// ---- MOD-136 (#222): a task already merged is closed ---------------------------------------------
/** Drops a task's owed row from this session's recent list (its work is merged, accepted or closed), leaving the verdict line. */
async function clearOwed($: Host, label: string): Promise<void> {
  try {
    const sid = await sessionIdOf($)
    if (!sid) return
    const list = (await storeGet<RecentRow[]>($, K.recent(sid))) ?? []
    if (!list.some(r => r.task === label && r.owed !== undefined)) return
    await storeSet($, K.recent(sid), list.map(r => (r.task === label && r.owed !== undefined ? (({ owed: _owed, ...rest }) => rest)(r) : r)))
  } catch (err) {
    debug($, `${label}: owed row not cleared: ${String(err)}`)
  }
}

/** Is the branch (any domain's, or the one the report names) absent both locally and as origin's tracking ref? An unanswered read is not absent. */
async function branchIsGone($: Host, spawn: SpawnRecord, reportBranch: string | undefined): Promise<boolean> {
  const named = (reportBranch ?? '').trim()
  const own = new RegExp(`^agent/[^/\\s]+/${spawn.task.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`)
  const branches = own.test(named) ? [named] : cfg.domains.map(d => branchName(d, spawn.task))
  if (branches.length === 0) return false
  const root = (spawn.repo ?? (await $.session.root())).replace(/\/+$/, '')
  for (const b of branches) {
    for (const ref of [`refs/heads/${b}`, `refs/remotes/origin/${b}`]) {
      const r = await run($, ['git', '-C', root, 'rev-parse', '--verify', '--quiet', ref], { cwd: root, timeoutMs: 10000 })
      if (!r.ok || r.exitCode !== 1) return false
    }
  }
  return true
}

/**
 * MOD-136: why a hand-back arrives for a task that is done, else undefined. `merged`: an earlier attempt of the task is
 * retired, or the card on origin/main reads merged (only asked once an earlier attempt exists, so a first hand-back is
 * never closed by the card). `branch gone`: the worktree folder this worker ran in no longer exists and neither does
 * the branch. Not for an ad hoc, review or replay spawn. The attempt being judged is not an earlier attempt.
 */
async function closedReason($: Host, spawn: SpawnRecord, report: ReturnType<typeof parseReport> | undefined): Promise<'merged' | 'branch gone' | undefined> {
  if (spawn.adhoc || spawn.review || spawn.replay) return undefined
  try {
    const lane = laneOf(spawn)
    const prior = attemptsFor(await loadAttempts($, spawn), spawn.subtask, lane).filter(r => r.attempt < spawn.attempt && r.kind !== 'review' && r.verdict !== 'pending')
    const last = prior.at(-1)
    if (last?.retired) return 'merged'
    if (last) {
      const probe = await retireProbe($, spawn.task, undefined, last.root, true)
      if (probe.card !== undefined && cardReadsMerged(probe.card)) {
        const t = await now($)
        await saveAttempts($, spawn, patchRecord(await loadAttemptsRaw($, spawn), spawn.subtask, last.attempt, { retired: 'merged', retireTriedAt: t, retireCheckedAt: t }, lane))
        return 'merged'
      }
    }
    if (spawn.cwd && !(await exists($, spawn.cwd)) && (await branchIsGone($, spawn, report?.branch))) return 'branch gone'
  } catch (err) {
    debug($, `${taskLabel(spawn.task, spawn.subtask)}: closed check failed: ${String(err)}`)
  }
  return undefined
}

/** MOD-136: the hand-back of a closed task: one row, no verify, no owed row, and the attempt it opened is not counted. */
async function closeHandback($: Host, spawn: SpawnRecord, why: 'merged' | 'branch gone'): Promise<Rendered> {
  const label = taskLabel(spawn.task, spawn.subtask)
  // the row's wording is the card's own; the old-word scan allows the one spelling on a line marked as below
  const line = `chassis-delegation: ${label}: hand-back after the task closed (${why}); not verified, nothing owed` // legacy word: read-only normaliser
  const lane = laneOf(spawn)
  const t = await now($)
  const held = await loadAttempts($, spawn)
  const here = attemptsFor(held, spawn.subtask, lane).find(r => r.attempt === spawn.attempt)
  if (here && here.verdict === 'pending') {
    const others = held.filter(r => r !== here)
    // a lone pending attempt stays, marked unverified; any other is removed, so it counts against no budget
    if (attemptsFor(others, spawn.subtask, lane).length > 0) await saveAttempts($, spawn, others)
    else await saveAttempts($, spawn, patchRecord(held, spawn.subtask, spawn.attempt, { verdict: 'unverified', verdictAt: t }, lane))
  }
  await clearOwed($, label)
  const next: SpawnRecord = { ...((await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn), verdictAttempt: spawn.attempt, lastFailed: false, verdictBlock: line }
  await storeSet($, K.spawn(spawn.key), next)
  await setWorkers($, list => list.map(w => (w.task === spawn.task && w.subtask === spawn.subtask && w.attempt === spawn.attempt ? { ...w, verdict: 'unverified' } : w)))
  await noteRecent($, { task: label, attempt: spawn.attempt, verdict: 'unverified', line, at: t })
  debug($, `${label}: attempt ${spawn.attempt} hand-back after the task closed (${why}); no verify run`)
  return { full: line, line }
}

/**
 * MOD-226 (#270): the hand-back of a worker that stopped while its own background job runs and printed a pause line.
 * The attempt stays open (its record stays pending, nothing is charged); the row says next=resume with the reason and
 * names the wait (MOD-99). The next hand-back that differs from this one reopens the same attempt (resumedIfNew).
 */
async function pausedHandback($: Host, spawn: SpawnRecord, pause: Pause, n: number, text: string): Promise<Rendered> {
  const label = taskLabel(spawn.task, spawn.subtask)
  const t = await now($)
  const since = spawn.agentId ? waitStates.get(spawn.agentId)?.since : undefined
  const full = pauseRow({ task: label, attempt: spawn.attempt, budget: spawn.budget, n, reason: pause.reason, waited: since !== undefined ? t - since : 0 })
  const quiet = `chassis-delegation: ${label} attempt ${spawn.attempt}/${spawn.budget} paused (${n}/${PAUSE_CAP - 1}) · ${waitText(label, since !== undefined ? t - since : 0)} · next=resume — ${pause.reason}`
  await storeSet($, K.spawn(spawn.key), { ...((await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn), verdictAttempt: spawn.attempt, lastFailed: false, verdictBlock: full, verdictLine: quiet, pauses: n, pausedAs: textKey(text) })
  await setLastVerdict($, { task: label, attempt: spawn.attempt, verdict: 'paused', next: 'resume', at: t, text: full })
  await noteRecent($, { task: label, attempt: spawn.attempt, verdict: 'paused', line: quiet, at: t })
  await appendLedger($, { kind: 'pause', task: spawn.task, subtask: spawn.subtask, attempt: spawn.attempt, pause: n, reason: pause.reason, at: t, sessionId: await sessionIdOf($) })
  debug($, `${label}: attempt ${spawn.attempt} paused (${n}/${PAUSE_CAP - 1}): ${pause.reason}`)
  return { full, line: quiet }
}

/** Verifies, records, acts on the advice (autoEscalate), and returns the row in both forms (2B). */
async function finalizeOnce($: Host, given: SpawnRecord, text: string, measured: Measured): Promise<Rendered> {
  // MOD-94: a record rebuilt from memory or the ledger is judged as any other; its verdict says where it came from
  const from = given.fallback
  const { fallback: _fallback, ...spawnIn } = given
  // MOD-21: a reviewer's hand-back is read for its [[review]] block, not checked as a worker's report
  if (spawnIn.review) return finalizeReview($, spawnIn, text, measured)
  // MOD-211: a malformed verdict is cached for the same report line only; a resent line is judged again on the same attempt
  const block = extractReport(text)
  const resent = (s: SpawnRecord): boolean => s.malformed !== undefined && s.malformed !== block
  if (spawnIn.verdictAttempt === spawnIn.attempt && hasVerdictText(spawnIn) && !resent(spawnIn)) return renderedOf(spawnIn)
  // A caller may hold a record read before an earlier fire stored its verdict.
  const stored = await storeGet<SpawnRecord>($, K.spawn(spawnIn.key))
  if (stored && stored.attempt === spawnIn.attempt && stored.verdictAttempt === spawnIn.attempt && hasVerdictText(stored) && !resent(stored)) return renderedOf(stored)
  const { malformed: _malformed, ...spawnClean } = spawnIn
  let spawn: SpawnRecord = spawnClean
  const tokens = measured.tokens
  const report = block ? parseReport(block) : undefined
  // MOD-56: a worker's hand-back with no report that names a usage limit
  const rateLimit = !spawn.adhoc ? detectRateLimit(text) : undefined
  if (rateLimit) rateHeld = { at: await now($), ...(rateLimit.resetsAt ? { resetsAt: rateLimit.resetsAt } : {}) }
  let verdict: Verdict
  let lines: string[] = []
  let noRepo = false
  let metrics: Record<string, string> | undefined
  let red: Pick<AttemptRecord, 'red' | 'redHash' | 'redHeld'> = {}
  // GH-16: a repo=here worker's claimed files go on its record before the verify, so a sibling verifying now subtracts them
  if (report && spawn.here && !spawn.adhoc) {
    const claimed: Partial<AttemptRecord> & HereFields = { files: reportFiles(report.files) }
    await saveAttempts($, spawn, patchRecord(await loadAttempts($, spawn), spawn.subtask, spawn.attempt, claimed, laneOf(spawn)))
  }
  // MOD-135: a spawn with no brief whose report names a task with a brief in the root is judged against that brief
  let adopted = false
  if (report && !spawn.review) {
    const found = await briefForReport($, spawn, report)
    if (found) {
      spawn = found
      adopted = true
      const vkey = await attemptKey($, given)
      if (verifying.has(vkey)) verifying.set(vkey, spawn)
      // MOD-148: the adopted attempt is on record (pending) and in the process memory before the verify, so the verdict tool waits for it
      const held = await loadAttempts($, spawn)
      if (!attemptsFor(held, spawn.subtask, laneOf(spawn)).some(r => r.attempt === spawn.attempt)) await saveAttempts($, spawn, [...held, await attemptOfSpawn($, spawn)])
      remember(spawn)
    }
  }
  // MOD-136 (#222): a task already merged, or one whose worktree and branch are gone, is closed: no verify, no budget, no owed row
  if (!spawn.adhoc && !spawn.review) {
    const why = await closedReason($, spawn, report)
    if (why) return closeHandback($, spawn, why)
  }
  // MOD-226 (#270): a pause line and no report line is a pause: no attempt opened or charged; the third in one attempt is charged
  const pause = !block && !spawn.adhoc && !spawn.review ? extractPause(text, spawn.task) : undefined
  let pauseCharge: string | undefined
  if (pause) {
    const n = (spawn.pauses ?? 0) + 1
    if (n < PAUSE_CAP) return pausedHandback($, spawn, pause, n, text)
    pauseCharge = pauseCapLine(n, spawn.attempt)
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
  if (pauseCharge) lines = [...lines, pauseCharge]

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
    // MOD-97: a cardless hand-back is the session repo's
    const before = await loadAttempts($, { task })
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
    await saveAttempts($, { task }, [...before, rec])
    judged = rec
    shownLabel = taskLabel(task, subtask)
    shownAttempt = attempt
    advice = advise({ verdict, reportGate: report?.gate, task: shownLabel, attempts: 1, budget: spawn.budget, lineageResumes: 0, tier: spawn.tier, adhoc: true, cardless: true, lines })
  } else if (spawn.adhoc) {
    advice = advise({ verdict, task: label, attempts: 1, budget: spawn.budget, lineageResumes: 0, tier: spawn.tier, adhoc: true })
  } else {
    const lane = laneOf(spawn)
    const held = await loadAttempts($, spawn)
    // MOD-94: an attempt whose record the store refused is judged on the record it would have had
    const before = (from || adopted) && !attemptsFor(held, spawn.subtask, lane).some(r => r.attempt === spawn.attempt) ? [...held, await attemptOfSpawn($, spawn)] : held
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
        ...(rateLimit ? { stop: 'rate_limited' as const, ...(rateLimit.resetsAt ? { resetsAt: rateLimit.resetsAt } : {}) } : {}),
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
    await saveAttempts($, spawn, records)
    judged = attemptsFor(records, spawn.subtask, lane).find(r => r.attempt === spawn.attempt)
    advice = advise({
      verdict,
      reportGate: report?.gate,
      ...(report?.sha ? { sha: report.sha } : {}),
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
  // MOD-211 (#271): a report line with no sha= is a line to resend, not a failed attempt: nothing is charged and nothing is resumed or escalated
  const malformed = !spawn.adhoc && block !== undefined && verdict === 'refuted' && isMalformedReport(lines)
  if (malformed) advice = { kind: 'check', next: `resend the report line with the fields named below (not a failed attempt: attempt ${spawn.attempt} stays open)` }
  // MOD-150: a refuted or unverified hand-back whose commits are all on the base already is not resumed or escalated
  if (!spawn.adhoc && spawn.briefPath && report?.sha && (advice.kind === 'resume' || advice.kind === 'respawn') && (verdict === 'refuted' || verdict === 'unverified')) {
    const briefText = await readText($, spawn.briefPath)
    const clause = await workOnBase($, spawn, briefText !== undefined ? parseHeader(briefText) : undefined, report.sha)
    if (clause) advice = { kind: 'none', next: `none — ${clause}` }
  }
  // GH-104: a resume or a respawn looks at the worker's worktree first: finished work there is judged, not redone
  let work: WorkPresent | undefined
  if (!spawn.adhoc && spawn.briefPath && (advice.kind === 'resume' || advice.kind === 'respawn')) {
    const lane = laneOf(spawn)
    const briefText = await readText($, spawn.briefPath)
    work = await workInWorktree($, spawn, briefText !== undefined ? parseHeader(briefText) : undefined, await loadAttempts($, spawn), lane)
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
  spawn = { ...spawn, verdictAttempt: spawn.attempt, lastFailed: isFailing(verdict, report?.gate) || prove, ...(malformed && block !== undefined ? { malformed: block } : {}) }
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

  const shownVerdict = rateLimit ? rateLimitedVerdict(rateLimit) : noRepo ? `${verdict} (no repo)` : verdict
  // MOD-114: this attempt's hand-back is judged now; the accept of another task, with no cards hand-back waiting, says the judgment work is over
  const wasNudged = nudgedUp.delete(await attemptKey($, spawn))
  const down = !wasNudged && !spawn.adhoc && advice.kind === 'accept' ? nudgeDownNow() : undefined
  const downClause = down ? ` · ${down}` : ''
  // GH-104: work present rides under the verdict line in both forms
  const workLine = work ? workPresentLine(work) : undefined
  // MOD-124: the exceptions the brief allowed ride on the row
  const allow = spawn.adhoc ? [] : await allowIdsOf($, spawn)
  const verdictRows = contextBlock(verdictLine({ verdict: shownVerdict as Verdict, task: shownLabel, attempt: shownAttempt, budget: spawn.budget, usd, usdApprox, model, next, allow, gateReused: gateReusedIn(lines) }) + downClause, workLine ? [workLine, ...lines] : lines)
  const spawnText = respawn ?? reviewBlock
  // MOD-94: a verdict reached without the store's record says so on its row, and once in the debug log
  const tail = from ? fallbackTail(from) : undefined
  if (from) debug($, fallbackLog(shownLabel, shownAttempt, from))
  const full = withTailIf(spawnText ? `${verdictRows}\n${spawnText}` : verdictRows, tail)
  const quiet = quietLine({ task: shownLabel, attempt: shownAttempt, budget: spawn.budget, verdict: rateLimit ? shownVerdict : verdict, ...(noRepo ? { noRepo } : {}), ...(report?.gate ? { reportGate: report.gate } : {}), alias: spawn.alias, glyph: glyphOf(spawn.alias), ...(usd !== undefined ? { usd, usdApprox } : {}), next, lines, allow }) + (pauseCharge ? ` · ${pauseCharge}` : '') + downClause
  const line = withTailIf([quiet, ...(workLine ? [workLine] : []), ...(spawnText ? [spawnText] : [])].join('\n'), tail)
  const latest = (await storeGet<SpawnRecord>($, K.spawn(spawn.key))) ?? spawn
  const { malformed: _old, pausedAs: _pausedAs, ...latestClean } = latest
  await storeSet($, K.spawn(spawn.key), { ...latestClean, verdictAttempt: spawn.attempt, lastFailed: spawn.lastFailed, verdictBlock: full, verdictLine: line, ...(malformed && block !== undefined ? { malformed: block } : {}) })
  await setWorkers($, list => list.map(w => (w.task === spawn.task && w.subtask === spawn.subtask && w.attempt === spawn.attempt ? { ...w, verdict } : w)))
  await setLastVerdict($, { task: shownLabel, attempt: shownAttempt, verdict, next, at: t, text: full })
  // a cardless hand-back is posted, kept and ledgered like any other (GH-1 item 2)
  if (!spawn.adhoc || cardless) {
    // MOD-154 (#246): a cardless ad hoc `check the diff` has no sha, patch or card for the retire sweep: the row names the way out
    const hint = spawn.adhoc && cardless && advice.kind === 'check' && next === 'check the diff' ? ` (ad hoc: clears with /delegation accept ${shownLabel})` : ''
    const owed = OWED_KINDS.includes(advice.kind) && !performed ? `${shownLabel}: ${shortNext(next)}${hint}` : undefined
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
  if (spawn.verdictAttempt === spawn.attempt && hasVerdictText(spawn)) return renderedOf(spawn)
  const stored = await storeGet<SpawnRecord>($, K.spawn(spawn.key))
  if (stored && stored.verdictAttempt === stored.attempt && hasVerdictText(stored)) return renderedOf(stored)
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
  const before = await loadAttempts($, spawn)
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
  await saveAttempts($, spawn, records)
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
  const quiet = reviewLine({ task: label, attempt: spawn.attempt, budget: spawn.budget, alias: spawn.alias, glyph: glyphOf(spawn.alias), ...(usd !== undefined ? { usd, usdApprox } : {}), counts, next })
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

/**
 * MOD-224: a reviewer's hand-back whose spawn record is gone (the lead's context was compacted while it ran, so no
 * spawn record joins the hand-back to its review). The block's own task + attempt + sha are matched against the
 * attempt the task's verdict waits on (consistent, review due): a match is finalized as that attempt's review; a
 * block that names another attempt or sha is not recorded, and the next verdict says so in one line. Never on the
 * task alone. Returns the review's row when one was recorded.
 */
async function orphanReview($: Host, agentId: string | undefined, key: string, text: string): Promise<string | undefined> {
  if (!text.includes('[[review')) return undefined
  const seen = parseReviewBlock(text)
  if (!seen) return undefined
  const task = seen.task
  const { repo } = await refOf($, task)
  const latest = attemptsFor(await loadAttempts($, { task, repo }), 'main').at(-1)
  if (!latest || latest.verdict !== 'consistent' || !latest.sha) return undefined
  if (reviewAcceptedAttempt(await ledgerText($), task) === latest.attempt) return undefined
  const m = matchReview(text, { task, attempt: latest.attempt, sha: latest.sha })
  if (m.kind === 'none') return undefined
  if (m.kind === 'refused') {
    await storeSet($, K.reviewSeen(task), m.line)
    return undefined
  }
  await storeSet($, K.reviewSeen(task), '')
  const worker = (await spawnByAgent($, latest.agentId)) ?? (latest.toolUseId ? await storeGet<SpawnRecord>($, K.spawn(latest.toolUseId)) : undefined)
  const spawn: SpawnRecord = {
    key: `review-${agentId ?? key}`,
    task,
    subtask: 'main',
    adhoc: false,
    attempt: latest.attempt,
    lineage: latest.lineage,
    tier: latest.tier,
    alias: latest.alias,
    budget: worker?.budget ?? cfg.defaultBudget,
    purpose: 'review',
    description: `${task} review (spawn record lost)`,
    subagentType: 'general-purpose',
    ...(agentId ? { agentId } : {}),
    ...(latest.briefPath ? { briefPath: latest.briefPath } : {}),
    ...(repo ? { repo } : {}),
    at: await now($),
    review: { ...(latest.agentId ? { worker: latest.agentId } : {}), sha: latest.sha },
  }
  await storeSet($, K.spawn(spawn.key), spawn)
  const rendered = await finalizeReview($, spawn, text, {})
  return rendered.line
}

/** MOD-224: the line a verdict that still waits on a review adds when a review was seen and not taken. */
async function reviewSeenLine($: Host, task: string, text: string): Promise<string[]> {
  if (!/next=review\b/.test(text)) return []
  const line = await storeGet<string>($, K.reviewSeen(task))
  return line ? [line] : []
}

/**
 * MOD-64: the verdict tool. The task's latest attempt, from the attempt record and the spawn record (the mod's own
 * records, never a shell): judged and its row posted, still verifying, or none. Waits in 5 second `sleep` processes (MOD-72), not clock sleeps.
 */
type VerdictNow = { kind: 'none' } | { kind: 'wait' } | { kind: 'judged'; text: string }

/** MOD-231: the verdict tool's answer for an attempt whose review said next=accept. */
const reviewedAcceptLine = (label: string, attempt: number): string => `${PLUGIN}: ${label} attempt ${attempt} consistent · next=accept (reviewed)`

async function verdictNow($: Host, task: string, subtask: string): Promise<VerdictNow> {
  const label = taskLabel(task, subtask)
  // MOD-97: the id alone is the repo its dispatch remembered (else the session's); the attempt and the worker are that repo's
  const { repo } = await refOf($, task)
  const latest = attemptsFor(await loadAttempts($, { task, repo }), subtask).at(-1)
  // MOD-94 (#157): an attempt the store has no record of: this process's memory of its start, else the ledger
  const mem = rememberedFor(task, subtask, repo)
  if (mem && (!latest || mem.attempt > latest.attempt)) return mem.verdictAttempt === mem.attempt && hasVerdictText(mem) ? postedOf($, mem, undefined) : { kind: 'wait' }
  if (!latest) {
    // MOD-148: a hand-back whose verify is in flight in this process whose spawn names the task is an attempt, however late its record lands
    for (const v of verifying.values()) if (v.task === task && v.subtask === subtask) return { kind: 'wait' }
    return verdictFromLedger($, task, subtask)
  }
  if (latest.verdict === 'pending') return { kind: 'wait' }
  // MOD-231: a review of this attempt that said next=accept is the answer: the verdict stands as next=accept, with no new review block
  if (latest.verdict === 'consistent' && reviewAcceptedAttempt(await ledgerText($), task) === latest.attempt) return { kind: 'judged', text: reviewedAcceptLine(label, latest.attempt) }
  const spawn = (await spawnByAgent($, latest.agentId)) ?? (latest.toolUseId ? await storeGet<SpawnRecord>($, K.spawn(latest.toolUseId)) : undefined)
  if (!spawn || spawn.attempt !== latest.attempt || spawn.task !== task || spawn.subtask !== subtask) return { kind: 'judged', text: `${PLUGIN}: ${label} attempt ${latest.attempt} ${latest.verdict}` }
  // the verdict is patched into the attempt record before its row is stored
  if (spawn.verdictAttempt !== spawn.attempt || !hasVerdictText(spawn)) return { kind: 'wait' }
  return postedOf($, spawn, latest.verdictAt)
}

/** A judged attempt's row as the verdict tool returns it: the row posted, else the rendered verdict. */
async function postedOf($: Host, spawn: SpawnRecord, verdictAt: number | undefined): Promise<VerdictNow> {
  const key = await attemptKey($, spawn)
  const sent = await storeGet<string>($, K.postedRow(key))
  if (sent !== undefined && sent !== '') return { kind: 'judged', text: sent }
  // claimed and not yet appended: the row is about to be stored (a row posted before postedRow was kept is never waited on)
  if (sent === undefined && rowRaceOpen(verdictAt, await now($)) && (await storeGet<boolean>($, K.posted(key))) === true) return { kind: 'wait' }
  const rendered = renderedOf(spawn)
  return { kind: 'judged', text: deliveryFor(cfg.verbosity, rendered).row ?? rendered.line }
}

/**
 * MOD-94 (#157): the verdict tool for a task neither the store nor this process holds: the newest ledger spawn
 * row for it. Judged there already: that verdict. Its worker still running: wait. Else the verifier runs now,
 * from the row and the brief it names, and its row is the answer. No row: none.
 */
async function verdictFromLedger($: Host, task: string, subtask: string): Promise<VerdictNow> {
  const { text, rows } = await ledgerOf($)
  const row = latestSpawnRow(rows, { task, subtask })
  if (!row) return { kind: 'none' }
  const done = verdictAfter(rows, row)
  if (done && readVerdict(done.verdict) === 'consistent' && reviewAcceptedAttempt(text, task) === row.attempt) return { kind: 'judged', text: reviewedAcceptLine(taskLabel(task, subtask), row.attempt) }
  if (done) return { kind: 'judged', text: ledgerJudgedLine(PLUGIN, taskLabel(task, subtask), row.attempt, done.verdict, done.next) }
  if (row.agentId && (await agentList($)).some(a => a.id === row.agentId && a.status === 'running')) return { kind: 'wait' }
  const spawn = await ledgerSpawn($, { task, subtask }, rows)
  if (!spawn) return { kind: 'none' }
  const rendered = await finalize($, spawn, spawn.agentId ? await workerText($, spawn.agentId, '') : '', {})
  const shown = deliveryFor(cfg.verbosity, rendered).row ?? rendered.line
  // the tool's answer is the row: a later hand-back of the same attempt posts no second one
  if (await claimPost($, spawn)) await storeSet($, K.postedRow(await attemptKey($, spawn)), shown)
  await noteUsage($)
  return { kind: 'judged', text: shown }
}

/**
 * MOD-72: a wait that does not spend the hook's budget. The host counts a `$.clock.sleep` against the hook's own
 * 10-second budget (HookBudget.ms), so a verdict wait of minutes in clock sleeps is dropped after two steps; any other
 * `$` call stops the budget clock, `$.process.run` included, so the wait is a `sleep` process. Returns false when the
 * process cannot start or exits non-zero; the caller then gives up waiting rather than spin (never a clock wait over 1 s).
 */
async function pauseOffBudget($: Host, ms: number): Promise<boolean> {
  const r = await run($, ['sleep', String(Math.ceil(ms / 1000))], { timeoutMs: ms + 5000 })
  return r.ok && r.exitCode === 0
}

/** MOD-229: the still-verifying reply, with where the gate is when one runs or waits: `· verifying (gate test running 3 min)`. */
async function stillVerifyingNow($: Host, label: string, seconds: number): Promise<string> {
  const p = gateProgress.get(label)
  return p ? `${stillVerifying(label, seconds)} · ${gateProgressText(p, await now($))}` : stillVerifying(label, seconds)
}

async function runVerdict($: Host, input: Record<string, unknown>): Promise<string> {
  const parsed = parseVerdictTool(input)
  if ('error' in parsed) return parsed.error
  const label = taskLabel(parsed.task, parsed.subtask)
  const limit = parsed.waitSeconds * 1000
  let waited = 0
  for (;;) {
    const found = await verdictNow($, parsed.task, parsed.subtask)
    if (found.kind === 'none') return noSuchAttempt(label)
    if (found.kind === 'judged') {
      const lines = [...drainStatus(parsed.task), ...(await commentVerdict($, parsed.task, parsed.subtask, found.text)), ...(await reviewSeenLine($, parsed.task, found.text))]
      return lines.length > 0 ? `${found.text}\n${lines.join('\n')}` : found.text
    }
    if (waited >= limit) return stillVerifyingNow($, label, parsed.waitSeconds)
    const step = Math.min(POLL_MS, limit - waited)
    if (!(await pauseOffBudget($, step))) return stillVerifyingNow($, label, parsed.waitSeconds)
    waited += step
  }
}

// ---- MOD-114: the brain's effort nudge ------------------------------------------------
// The mod never touches the brain's effort (the user's /model setting). A hand-back whose
// report names a cards artefact ends its row `lead: judgment next, raise to high`; the key
// stays here until that attempt's verdict. Once no such hand-back waits, the first accept
// row of another task, or the next started row, ends `lead: back to medium`, once.
const nudgedUp = new Set<string>() // attempt keys whose hand-back nudged up, until their verdict
let nudgeOpen = false // an up nudge was posted and no down has followed

/** The down clause when the judgment work is over, else undefined; posting it closes the nudge. */
function nudgeDownNow(): string | undefined {
  if (!nudgeOpen || nudgedUp.size > 0 || cfg.effortNudge.cards.trim() === '') return undefined
  nudgeOpen = false
  return nudgeDown(cfg.effortNudge)
}

// ---- MOD-200: status comments on the card's GitHub issue ---------------------------------------
/** Failure lines of comments made in hooks that return no text (the spawn hook), shown by the task's next dispatch or verdict result. */
const pendingStatus = new Map<string, string[]>()
const drainStatus = (task: string): string[] => {
  const lines = pendingStatus.get(task) ?? []
  pendingStatus.delete(task)
  return lines
}
const commentedVerdicts = new Set<string>()

/**
 * One comment on the issue the card names (`issue:` a whole number), when the session root's origin is a GitHub owner/name:
 * the body is redacted, written under .delegation/status/, then `gh issue comment` runs once. Silent without an issue or a
 * GitHub origin; a failed comment is one line (never retried).
 */
async function commentOnCardIssue($: Host, o: { task: string; fileId: string; attempt: number; kind: 'started' | 'verdict'; text: string }): Promise<string[]> {
  await loadRepoConfig($)
  const root = (await $.session.root()).replace(/\/+$/, '')
  const cardDir = cardDirPath(root, cfg.cardDir)
  const name = await cardNameIn($, cardDir, o.task)
  if (!name) return []
  const text = await readText($, `${cardDir}/${name}`)
  const card = text === undefined ? undefined : parseCard(text)
  const ownerRepo = ownerRepoOf(gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url') ?? '')
  if (!ownerRepo) return []
  const issue = card && !('error' in card) ? issueRef(card.fields.issue, ownerRepo) : undefined
  if (issue === undefined) return []
  const file = statusFile(root, o.fileId, o.attempt, o.kind)
  // MOD-204: a file that already ends in a posted: line was commented on before (a reload loses the in-memory set)
  const before = await readText($, file)
  if (before !== undefined && /^posted: \S+$/.test(before.trimEnd().split('\n').pop() ?? '')) return []
  try {
    await $.fs.write(file, `${redact(o.text, await redactRules($)).replace(/\n*$/, '')}\n`)
  } catch (err) {
    return [statusFailure(issue, `body not written: ${String(err)}`)]
  }
  landRepo = ownerRepo
  sessionRoot = root
  const r = await run($, ['gh', 'issue', 'comment', String(issue), '--repo', ownerRepo, '--body-file', file], { cwd: root, timeoutMs: 30000 })
  if (!(r.ok && r.exitCode === 0)) return [statusFailure(issue, r.ok ? r.stderr || r.stdout : r.why)]
  try {
    await $.fs.write(file, `${redact(o.text, await redactRules($)).replace(/\n*$/, '')}\nposted: ${new Date(await now($)).toISOString()}\n`)
  } catch (err) {
    debug($, `status: posted line not written to ${file}: ${String(err)}`)
  }
  return []
}

/** MOD-200: the verdict row, commented on the card's issue once per attempt; the failure line, if any. */
async function commentVerdict($: Host, task: string, subtask: string, row: string): Promise<string[]> {
  try {
    const { repo } = await refOf($, task)
    const attempt = attemptsFor(await loadAttempts($, { task, repo }), subtask).at(-1)?.attempt
    if (attempt === undefined) return []
    const key = `${task}/${subtask}/${attempt}`
    if (commentedVerdicts.has(key)) return []
    commentedVerdicts.add(key)
    return await commentOnCardIssue($, { task, fileId: taskLabel(task, subtask).replace(/\//g, '-'), attempt, kind: 'verdict', text: verdictComment(row) })
  } catch (err) {
    debug($, `status: verdict comment skipped: ${String(err)}`)
    return []
  }
}

/** MOD-74: the row for a briefed worker that has started (or resumed); verdictVerbosity=silent posts none. MOD-114: with its effort and, when due, the down nudge. */
async function postStarted($: Host, i: { label: string; task: string; repo?: string | undefined; alias: string; tier: Tier; attempt: number; budget: number; kind: StartKind }) {
  // MOD-200: a started or respawned (not resumed) attempt is said on the card's issue, whatever the row verbosity
  if (i.kind !== 'resumed') {
    try {
      const lines = await commentOnCardIssue($, { task: i.task, fileId: i.label.replace(/\//g, '-'), attempt: i.attempt, kind: 'started', text: startedComment({ id: i.task, attempt: i.attempt, budget: i.budget, tier: i.tier, alias: i.alias }) })
      if (lines.length > 0) pendingStatus.set(i.task, [...(pendingStatus.get(i.task) ?? []), ...lines])
    } catch (err) {
      debug($, `status: started comment skipped: ${String(err)}`)
    }
  }
  if (!postsRows(cfg.verbosity)) return
  const effort = effortFor(i.tier, await storeGet<string>($, K.effort(i.task, await cardRepo($, i.repo))), cfg.effortByTier)
  // a resume of a nudged task is not the end of its judgment: no down nudge on it
  const nudge = i.kind === 'resumed' ? undefined : nudgeDownNow()
  await appendRow($, startedRow({ ...i, glyph: glyphOf(i.alias), ...(effort ? { effort } : {}), ...(nudge ? { nudge } : {}) }))
}

/** MOD-74: a worker's spend this attempt as the verdict row computes it (its own turns, else the session's growth), undefined while unknown. */
async function attemptUsd($: Host, spawn: SpawnRecord): Promise<number | undefined> {
  const own = spawn.agentId ? await workerCost($, spawn.agentId, spawn.attempt) : undefined
  if (own && own.usd !== null) return round4(own.usd)
  const now0 = await sessionUsd($)
  return now0 !== undefined && spawn.usdAtStart !== undefined ? round4(now0 - spawn.usdAtStart) : undefined
}

const handedBackPosted = new Set<string>()
/** MOD-74: one row when a briefed worker hands back, before its verification starts; silent posts none. MOD-114: `text` is the hand-back, read for a cards artefact. */
async function postHandedBack($: Host, spawn: SpawnRecord, text = '') {
  if (spawn.adhoc || spawn.review || !postsRows(cfg.verbosity)) return
  const key = await attemptKey($, spawn)
  if (handedBackPosted.has(key)) return
  handedBackPosted.add(key)
  const t = await now($)
  const usd = await attemptUsd($, spawn)
  const block = extractReport(text)
  const up = cardsHandedBack(reportArtefacts(block ? parseReport(block).artefacts : undefined), cfg.effortNudge.cards)
  if (up) {
    nudgedUp.add(key)
    nudgeOpen = true
  }
  await appendRow($, handedBackRow({ label: taskLabel(spawn.task, spawn.subtask), alias: spawn.alias, glyph: glyphOf(spawn.alias), minutes: waitedMinutes(spawn.at ?? t, t), ...(usd !== undefined ? { usd } : {}), ...(up ? { nudge: nudgeUp(cfg.effortNudge) } : {}) }))
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
  const key = await attemptKey($, spawn)
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

/**
 * MOD-41: a briefed worker whose last attempt was judged hands back at a new sha: that is its next attempt (a resume),
 * recorded and opened for a verdict against the same brief. Else the spawn as it is.
 */
async function resumedIfNew($: Host, spawn: SpawnRecord, agentId: string, text: string): Promise<SpawnRecord> {
  if (spawn.adhoc || spawn.review || spawn.verdictAttempt !== spawn.attempt) return spawn
  const block = extractReport(text)
  // MOD-211: a different report line after a malformed one reopens the same attempt (no new attempt, nothing charged)
  if (spawn.malformed !== undefined) {
    if (block === undefined || block === spawn.malformed) return spawn
    const { malformed: _m, verdictAttempt: _va, verdictBlock: _vb, verdictLine: _vl, verdictSummary: _vs, ...open } = spawn
    const key = await attemptKey($, spawn)
    posted.delete(key)
    await storeSet($, K.posted(key), false)
    await storeSet($, K.postedRow(key), '')
    await storeSet($, K.spawn(spawn.key), { ...open, lastFailed: false })
    return { ...open, lastFailed: false }
  }
  // MOD-226: a hand-back that differs from the one judged a pause reopens the same attempt (no new attempt, nothing charged)
  if (spawn.pausedAs !== undefined) {
    if (textKey(text) === spawn.pausedAs) return spawn
    const { pausedAs: _p, verdictAttempt: _va, verdictBlock: _vb, verdictLine: _vl, verdictSummary: _vs, ...open } = spawn
    const key = await attemptKey($, spawn)
    posted.delete(key)
    await storeSet($, K.posted(key), false)
    await storeSet($, K.postedRow(key), '')
    await storeSet($, K.spawn(spawn.key), { ...open, lastFailed: false })
    return { ...open, lastFailed: false }
  }
  const sha = block ? parseReport(block)?.sha : undefined
  if (!sha) return spawn
  const records = await loadAttempts($, spawn)
  return isResumeAfterJudged(records, spawn.subtask, sha, laneOf(spawn)) ? recordResume($, spawn, records, agentId) : spawn
}

/** Records the next attempt of a task as a resume of `spawn`'s worker (kind resume, same lineage) and opens it for a verdict. */
async function recordResume($: Host, spawn: SpawnRecord, records: readonly AttemptRecord[], agentId: string): Promise<SpawnRecord> {
  const lane = laneOf(spawn)
  const t = await now($)
  const attempt = nextAttempt(records, spawn.subtask, lane)
  const rec: HereRecord = {
    ...(await ownerFields($, spawn.repo)),
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
  await saveAttempts($, spawn, [...records, rec])
  const usdAtStart = await sessionUsd($)
  const { pauses: _pauses, ...fresh } = spawn
  const next: SpawnRecord = { ...fresh, attempt, lastFailed: false, ...(usdAtStart !== undefined ? { usdAtStart } : {}) }
  await storeSet($, K.spawn(spawn.key), next)
  await setWorkers($, list => [...list, { task: spawn.task, subtask: spawn.subtask, attempt, kind: 'resume', tier: spawn.tier, alias: spawn.alias, agentId, verdict: 'pending', at: t }])
  if (!spawn.adhoc && !spawn.review) await postStarted($, { label: taskLabel(spawn.task, spawn.subtask), task: spawn.task, repo: spawn.repo, alias: spawn.alias, tier: spawn.tier, attempt, budget: spawn.budget, kind: 'resumed' })
  return next
}

/**
 * MOD-176: the guard and budget check both resume hooks (session.send, and tool.call on SendMessage) share.
 * `address` is an agent id or a name. Undefined when the message is not to a briefed spawn whose last attempt was judged failed;
 * else the spawn, its attempt records, the agent id, and a `deny` text when the attempts used already reach the budget.
 */
async function resumeTarget($: Host, address: string): Promise<{ spawn: SpawnRecord; records: readonly AttemptRecord[]; agentId: string; deny?: string } | undefined> {
  const agentId = (await storeGet<string>($, K.agent(address))) ? address : await storeGet<string>($, K.name(address))
  const spawn = await spawnByAgent($, agentId)
  // MOD-211: a malformed report line is resent on the same attempt: that message is no resume and spends no attempt
  if (!agentId || !spawn || spawn.adhoc || spawn.verdictAttempt !== spawn.attempt || !spawn.lastFailed || spawn.malformed !== undefined) return undefined
  const lane = laneOf(spawn)
  const records = await loadAttempts($, spawn)
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
  return { spawn, records, agentId, ...(attempts >= budget ? { deny: budgetDenyMessage(taskLabel(spawn.task, spawn.subtask), attempts, spawn.briefPath) } : {}) }
}

/** The spawn record the store holds for an agent (its pointer, then the record). */
async function storedSpawnByAgent($: Host, agentId: string | undefined): Promise<SpawnRecord | undefined> {
  if (!agentId) return undefined
  const key = await storeGet<string>($, K.agent(agentId))
  return key ? storeGet<SpawnRecord>($, K.spawn(key)) : undefined
}

/** An agent's spawn record: the store's, else (MOD-94) the one this process remembers from its start. */
async function spawnByAgent($: Host, agentId: string | undefined): Promise<SpawnRecord | undefined> {
  if (!agentId) return undefined
  // MOD-240: a briefed worker this process saw is answered from memory (every write of its record lands there); else the store's, kept 5 s per agent (a miss too)
  const mem = remembered.get(agentId)
  if (mem) return mem
  const t = await now($)
  const hit = spawnCache.get(agentId)
  if (hit && t - hit.at >= 0 && t - hit.at < SPAWN_CACHE_MS) return hit.rec
  const rec = await storedSpawnByAgent($, agentId)
  spawnCache.set(agentId, { at: t, rec })
  return rec
}

/** MOD-94: a briefed worker this process saw start (or rebuilt from the ledger) is remembered, as written. */
function remember(spawn: SpawnRecord): void {
  if (!spawn.agentId || spawn.adhoc || spawn.review) return
  const { fallback: _fallback, ...rec } = spawn
  remembered.delete(spawn.agentId)
  remembered.set(spawn.agentId, rec)
  spawnGen += 1 // MOD-240: liveState's notes read before this record was remembered are stale
  // the oldest go first; a judged record is all that is ever old enough to reach the cap
  while (remembered.size > REMEMBER_CAP) remembered.delete(remembered.keys().next().value as string)
}

/** MOD-94: a write of a remembered worker's spawn record (a verdict, a resume) updates the memory too. */
function rememberWrite(value: unknown): void {
  const rec = value as SpawnRecord | undefined
  if (!rec || typeof rec !== 'object' || typeof rec.agentId !== 'string' || !remembered.has(rec.agentId)) return
  remember(rec)
}

/** MOD-94: the newest worker of a task this process remembers; MOD-97: of the repo given ('' the session's), when one is. */
function rememberedFor(task: string, subtask: string, repo?: string): SpawnRecord | undefined {
  let best: SpawnRecord | undefined
  for (const r of remembered.values()) {
    if (repo !== undefined && (r.repo ? trimRepo(r.repo) : '') !== repo) continue
    if (r.task === task && r.subtask === subtask && !r.replay && (best === undefined || r.attempt >= best.attempt)) best = r
  }
  return best
}

/**
 * MOD-94 (#157): the spawn record a hand-back is judged by. The store's (by the spawn's tool_use_id, then the
 * agent); else the record this process remembers; else the newest ledger spawn row for the agent (or the
 * spawn) plus the brief it names, when no verdict row has judged that attempt yet. The last two are marked,
 * so the verdict says where it came from.
 */
async function handbackSpawn($: Host, agentId: string | undefined, toolUseId?: string): Promise<SpawnRecord | undefined> {
  const byCall = toolUseId ? await storeGet<SpawnRecord>($, K.spawn(toolUseId)) : undefined
  const byAgent = byCall === undefined || isCardless(byCall) ? await storedSpawnByAgent($, agentId) : undefined
  // MOD-97 (#155): an ad hoc call that resumed a briefed worker hands back as that worker, judged against its brief
  if (byCall && byAgent && !byAgent.adhoc && !byAgent.review) return byAgent
  const stored = byCall ?? byAgent
  if (stored) return stored
  const mem = agentId ? remembered.get(agentId) : undefined
  if (mem) return { ...mem, fallback: 'memory' }
  if (!agentId && !toolUseId) return undefined
  return ledgerSpawn($, { ...(agentId ? { agentId } : {}), ...(toolUseId ? { toolUseId } : {}) })
}

/** MOD-94: the session ledger's text, '' when it is off or unread. */
async function ledgerText($: Host): Promise<string> {
  return (await ledgerOf($)).text
}

/** MOD-247: the session ledger, parsed once per change of the file (empty when it is off or unread). */
async function ledgerOf($: Host): Promise<{ text: string; rows: LedgerRow[] }> {
  if (!cfg.ledgerFile) return NO_LEDGER
  const root = await sessionRootOf($)
  return root ? ledgerAt($, root) : NO_LEDGER
}

/** MOD-94: the open attempt the newest matching ledger spawn row names, rebuilt as a spawn record (and remembered); undefined once judged. */
async function ledgerSpawn($: Host, q: RowQuery, rows?: readonly LedgerRow[]): Promise<SpawnRecord | undefined> {
  const ledger = rows ?? (await ledgerOf($)).rows
  if (ledger.length === 0) return undefined
  const row = latestSpawnRow(ledger, q)
  if (!row || verdictAfter(ledger, row)) return undefined
  const f = fieldsOfRow(row)
  const spawn: SpawnRecord = {
    ...f,
    tier: f.tier as Tier,
    adhoc: false,
    description: f.description ?? taskLabel(f.task, f.subtask),
    subagentType: f.subagentType ?? 'general-purpose',
  }
  remember(spawn)
  return { ...spawn, fallback: 'ledger' }
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

/**
 * MOD-44: which repo a task is for, and where its card is. `repoArg` (the dispatch's repo) wins, then (MOD-144) a card in
 * the session's own card folder, then the repo the card tool remembered for this id; else the session's own card folder, and (the id found nowhere there) the session's
 * `.delegation/cards/<folder>/` boards, whose card may say `repo: <path>`. A card that says a path other than the one
 * given is refused. Returns the target (none for the session's own repo), the folder the card was looked for in, and
 * the cards found there; a string is the refusal.
 */
async function locateTask($: Host, id: string, repoArg: string | undefined, root: string, replay: boolean): Promise<{ target?: Target; tasksDir: string; found: { name: string; card: Card }[] | string; staleRepo?: string } | string> {
  let target: Target | undefined
  // MOD-144 (#234): the session's own card folder is read before the repo the store remembers for the id
  let ownFound: { name: string; card: Card }[] | undefined
  let staleRepo: string | undefined
  if (repoArg !== undefined) {
    const r = await resolveRepo($, repoArg, root)
    if ('error' in r) return `/dispatch ${id}: refused repo ${repoArg}: ${r.error}`
    target = await loadTarget($, r.path)
  } else if (!replay) {
    const saved = await storeGet<string>($, K.taskRepo(id, await cardRepo($)))
    if (saved) {
      const r = await resolveRepo($, saved, root)
      if ('path' in r) {
        const own = await cardsInTree($, cardDirPath(root, cfg.cardDir), id)
        if (Array.isArray(own) && own.length > 0) {
          ownFound = own
          staleRepo = r.path
        } else target = await loadTarget($, r.path)
      }
    }
  }
  let tasksDir = target ? targetCardsDir(root, target) : cardDirPath(root, cfg.cardDir)
  let found = replay ? [] : ownFound ?? (await cardsInTree($, tasksDir, id))
  // the id alone, a card on one of the session's boards for another repo
  if (!target && !replay && Array.isArray(found) && found.length === 0) {
    let boards: string[] = []
    try {
      boards = (await $.fs.list(`${root.replace(/\/+$/, '')}/.delegation/cards`)).map(e => e.name)
    } catch {
      boards = []
    }
    for (const board of boards) {
      const dir = `${root.replace(/\/+$/, '')}/.delegation/cards/${board}`
      const here = await cardsInTree($, dir, id)
      if (Array.isArray(here) && here.length > 0) {
        tasksDir = dir
        found = here
        break
      }
    }
  }
  if (!replay && Array.isArray(found) && found.length === 1) {
    const said = (found[0] as { card: Card }).card.repo
    if (said !== undefined && isRepoPath(said)) {
      const r = await resolveRepo($, said, root)
      if ('error' in r) return `/dispatch ${id}: refused the card's repo ${said}: ${r.error}`
      if (target && target.path !== r.path) return `/dispatch ${id}: the card says repo: ${said} but the dispatch names ${target.path}`
      target ??= await loadTarget($, r.path)
    } else if (target && said !== undefined && said !== 'worktree') {
      return `/dispatch ${id}: the card says repo: ${said}, which is not a task for ${target.path}`
    }
  }
  return { ...(target ? { target } : {}), tasksDir, found, ...(staleRepo !== undefined && !target ? { staleRepo } : {}) }
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
    return { error: `the brief could not be written to ${primary}: ${String(err)}; run /delegation config briefDir <folder> (${PLUGIN})` }
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
  const out = await dispatchOnce($, parsed)
  // MOD-200: a started comment that failed in the spawn hook is said by the task's next dispatch result
  const status = parsed.error === undefined && parsed.verify === undefined ? drainStatus(parsed.id) : []
  return status.length > 0 ? `${out}\n${status.join('\n')}` : out
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
  // MOD-44: the repo this task is for (repo set to a path), else the session's own
  const located = await locateTask($, id, parsed.repo, root, replay)
  if (typeof located === 'string') return located
  const { target, tasksDir } = located
  // replay reads the default folder: the allowlist's git shapes name agents/tasks/
  const found = replay ? await cardsAtBase($, root, id, base) : located.found
  if (typeof found === 'string') return found
  const where = replay ? `${cardDirPath(root)} at ${base}` : tasksDir
  if (found.length !== 1) {
    return found.length === 0
      ? `/dispatch ${id}: no card under ${where} (looked for ${id}-*.md with id: ${id})`
      : `/dispatch ${id}: ${found.length} cards claim ${id} (${found.map(f => f.name).join(', ')}); fix the board first`
  }
  const { name, card } = found[0] as { name: string; card: Card }
  const refusal = checkStatus(card) ?? checkDomain(card, target ? target.domains : cfg.domains)
  if (refusal) return `/dispatch ${id}: ${refusal}${replay ? ` (read at ${base})` : ''}`
  // the repo the work is cut from and judged in: the target's, else the session's
  const repoRoot = target ? target.path : root
  // MOD-95: an existing brief is the one to reuse only when it names this dispatch's repo, worktree and card; else it is
  // rewritten, or (an attempt of the task open) dispatch refuses before it writes anything
  const fileName = briefFileName(id, replay)
  const existing = await existingBrief($, root, fileName)
  const existingText = existing ? await readText($, existing) : undefined
  let stale: BriefDrift | undefined
  if (existing && existingText !== undefined && !replay) {
    const freshHere = parsed.here === true || card.repo === 'here'
    const freshNone = !freshHere && card.repo === 'none'
    const drift = briefDrift(briefNames(existingText), {
      repo: freshHere ? 'here' : freshNone ? 'none' : target ? target.path : '',
      worktree: freshHere || freshNone ? root : worktreePath(repoRoot, id, false, target ? undefined : cfg.worktreeRoot),
      card: `${tasksDir}/${name}`,
    })
    if (drift.points.length > 0) {
      const open = await openAttemptOf($, { task: id, repo: target?.path })
      if (open !== undefined) return briefStaleRefusal(id, existing, drift, open)
      stale = drift
    }
  }
  if (target) {
    await storeSet($, K.taskRepo(id, await cardRepo($)), target.path)
    registerTaskRepo(id, target, card.gate)
  }

  // MOD-34: the domain's lessons file beside the cards, carried into a brief written now; the line is printed whether or not a brief is written
  // MOD-44: another repo's lessons sit beside its own cards, so only a repo with a config has any
  const lessonsAt = lessonsPath(target ? target.path : root, target ? target.cardDir : cfg.cardDir, card.domain)
  const lessonsText = target && !target.hasConfig ? undefined : await readText($, lessonsAt)
  const lessons = lessonsText !== undefined && lessonLineCount(lessonsText) > 0 ? { text: lessonsText, path: lessonsAt } : undefined

  // An existing brief is reused, never overwritten, and it decides the mode.
  const reuse = stale ? undefined : existing
  const reusedText = stale ? undefined : existingText
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

  const worktree = here || none ? root : worktreePath(repoRoot, id, replay, target ? undefined : cfg.worktreeRoot)
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
  if (located.staleRepo !== undefined) out.push(`   note: ${id} was once a task for ${located.staleRepo}; this dispatch is for the card in ${tasksDir} (pass repo=${located.staleRepo} for the other)`)
  if (target) {
    out.push(`   ${repoLine(target, card.gate)}`)
    for (const g of card.gate) if (target.gateMap[g] === undefined && !/\s/.test(g)) out.push(`   warning: gate ${g} is not in ${target.name}'s gate map (${Object.keys(target.gateMap).filter(k => k !== EMPTY_GATE_KEY).join(', ') || 'empty'}); the verifier will not re-run it`)
  }

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
  const spend = spendCeiling(card.spend, tier, target ? target.spendByTier : cfg.spendByTier)
  // MOD-22: scope and forbid may hold absolute paths and globs, a leading ~ the home folder; the first absolute scope entry is the outdir
  const home = await homeOf($)
  const expandAll = (list: readonly string[]): string[] => list.map(e => expandTilde(e, home))
  const headScope = expandAll(scope ?? card.scope)
  const headForbid = expandAll(forbid ?? card.forbid)
  // MOD-227 (#304): a scope entry under a forbid can never be touched. A clash with the card's own forbid (its file or
  // --forbid) refuses before any brief is written; a forbid a sibling card's scope put there wins as before and is warned
  // about below, naming the sibling.
  const siblingScopes = new Map<string, string>()
  if (forbid === undefined && card.fields.parent !== undefined && !replay && scopeForbidClashes(headScope, headForbid).length > 0) {
    try {
      for (const { card: sib } of await indexedCards($, tasksDir)) {
        if (sib.id === id || String(sib.fields.parent) !== String(card.fields.parent)) continue
        for (const g of sib.scope) if (!siblingScopes.has(g)) siblingScopes.set(g, sib.id)
      }
    } catch {
      // an unreadable folder names no sibling; the clash is then the card's own
    }
  }
  const forbidOrigin = (f: string): string => (siblingScopes.has(f) ? `sibling card ${siblingScopes.get(f)}` : '')
  const ownClash = replay ? undefined : scopeForbidClashes(headScope, headForbid, forbidOrigin).find(c => c.origin === '')
  if (ownClash !== undefined) return `/dispatch ${id}: refused, no brief written: ${scopeForbidClashLine(ownClash.entry, ownClash.forbid)}`
  const outdir = outdirOf(headScope, card.outdir ? expandTilde(card.outdir, home) : undefined)
  // scratch= is written for a card that has an output folder, names a scratch folder, or shares or has no repo (a worktree card's header stays as it was)
  const scratch = outdir !== undefined || here || none || card.scratch ? (card.scratch ? expandTilde(card.scratch, home) : defaultScratch(await tmpDirOf($), id)) : undefined
  const folders = { ...(outdir ? { outdir } : {}), ...(scratch ? { scratch } : {}) }
  // MOD-141: an existing worktree or repo=none brief made for this task from its card is re-rendered when the card or the flags would change it
  const candidate = reuse !== undefined && reusedText !== undefined && !replay && !here && reusedHeader?.task === id
  // the budget= a person raised by hand in the brief is kept (the stop line says the brief is re-read); MOD-172: a budget raised on the card is taken, the higher of the two
  const oldBudget = candidate ? parseBudget(reusedHeader?.budget, budget) : budget
  const headBudget = Math.max(budget, oldBudget)
  const headerFor = (b: string): string => {
    if (here && !reuse) {
      // base=: a sha --base, else baseRef (HEAD pinned to the sha it is at now), else none (the verifier's chain)
      return renderHeader({ card, tier, alias, budget: headBudget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, repo: 'here', ...(hereBase ? { base: hereBase } : {}), ignore: hereIgnoreList, ...folders })
    }
    if (none && (!reuse || candidate)) {
      return renderHeader({ card, tier, alias, budget: headBudget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, repo: 'none', ...folders })
    }
    // GH-105: a base that is not the default is written, so the verifier diffs from the commit the worktree was cut from
    return renderHeader({ card, tier, alias, budget: headBudget, ...(spend > 0 ? { spend } : {}), scope: headScope, forbid: headForbid, ...(target ? { repo: target.path } : {}), ...(b !== 'origin/main' ? { base: b } : {}), ...folders })
  }
  let hereBase: string | undefined
  let hereIgnoreList: string[] = []
  if (here && !reuse) {
    hereBase = base !== 'origin/main' ? base : cfg.baseRef || undefined
    if (hereBase === 'HEAD') {
      const head = await run($, headShaArgv(root), { cwd: root, timeoutMs: 10000 })
      const sha = head.ok && head.exitCode === 0 ? head.stdout.trim() : ''
      if (/^[0-9a-f]{7,40}$/.test(sha)) hereBase = sha
      else out.push('   note: baseRef HEAD could not be pinned (git rev-parse HEAD failed); the brief says base=HEAD')
    }
    hereIgnoreList = hereIgnore(ignoreWithCards(cfg.ignore, cfg.cardDir), inflight.flatMap(c => c.files))
  }
  const header = headerFor(base)
  const renderBrief = async (b: string): Promise<{ text: string } | { stop: string }> => {
    // MOD-28: the mod's own template is the copy read at load; a template the repo names (briefTemplate) is the repo's file, read now
    let template: string
    let templateAt: string
    if (cfg.briefTemplate) {
      templateAt = cfg.briefTemplate
      try {
        template = await $.fs.read(cfg.briefTemplate)
      } catch (err) {
        return { stop: [...out, `/dispatch ${id}: the brief template could not be read: ${String(err)}`].join('\n') }
      }
    } else {
      const loaded = await loadedTemplates($)
      templateAt = templatePath(loaded.root, 'brief.md')
      const text = loaded.text.get('brief.md')
      if (text === undefined) return { stop: [...out, `/dispatch ${id}: the brief template could not be read: ${loaded.failed.get('brief.md') ?? 'not loaded'} (it failed to load when the mod started: ${templateAt})`].join('\n') }
      template = text
    }
    let rootNames: string[] = []
    try {
      rootNames = (await $.fs.list(repoRoot)).map(e => e.name)
    } catch {
      rootNames = []
    }
    // MOD-22: the report line gains artefacts= and metrics= for a card that has an output folder
    const reportExtra = outdir ? ' artefacts=<comma list of the files you delivered, relative to the output folder or absolute> metrics="<k=v,k=v>"' : ''
    // MOD-44: a worker in another repo is told the gate as that repo's command, not a bare id
    // MOD-120 (#199): and every brief shows the command as it will run: {worktree}, {outdir} and {files} filled, with the line to write the listing
    const gateFilesAt = scratch ? `${scratch.replace(/\/+$/, '')}/files.txt` : filesPathFor(scratchFor(`${briefDirFor(root, cfg.briefDir)}/${fileName}`), id)
    const gateLine = gateLineText(card.gate, target ? target.gateMap : cfg.gateMap, { worktree, ...(outdir ? { outdir } : {}), filesPath: gateFilesAt, base: b !== 'origin/main' ? b : (target ? target.baseRef : cfg.baseRef) || 'origin/main' })
    const briefCard: Card = { ...card, gateText: gateLine.gate }
    // MOD-124 (#188): the gitignored rules file, copied under its own heading; the card's allow: blocks after it
    const localPath = (target ? target.briefLocal : cfg.briefLocal).trim()
    let localText: string | undefined
    if (localPath === '' && card.allow.length > 0) return { stop: [...out, noLocalRefusal(id, card.allow)].join('\n') }
    if (localPath !== '' && (await exists($, localAbs(repoRoot, localPath)))) {
      const at = localAbs(repoRoot, localPath)
      const tracked = await run($, ['git', '-C', repoRoot, 'ls-files', '--error-unmatch', '--', at], { cwd: repoRoot, timeoutMs: 15000 })
      if (tracked.ok && tracked.exitCode === 0) return { stop: [...out, trackedRefusal(id, localPath)].join('\n') }
      try {
        localText = await $.fs.read(at)
      } catch (err) {
        return { stop: [...out, unreadableRefusal(id, localPath, String(err))].join('\n') }
      }
    }
    if (card.allow.length > 0) {
      const missing = missingBlocks(localText ?? '', card.allow)[0]
      if (missing !== undefined) return { stop: [...out, missingBlockRefusal(id, missing, localPath)].join('\n') }
    }
    const briefExtraText = renderLocal(target ? target.briefExtra : cfg.briefExtra, localText, card.allow)
    const rendered = renderBriefChecked(template, { card: briefCard, gateNote: gateLine.note, ...(lessons !== undefined ? { lessons } : {}), worktree, branch, cardPath, install: installStep(rootNames), extra: briefExtraText, mode, spend, ...(outdir ? { outdir } : {}), ...(scratch ? { scratch } : {}), reportExtra })
    // MOD-28: a brief with a marker left in it never reaches a worker; nothing is written, no worktree is made
    if (rendered.leftover !== undefined) return { stop: [...out, unrenderedRefusal(id, rendered.leftover, templateAt)].join('\n') }
    return { text: `${headerFor(b)}\n\n${rendered.text}` }
  }
  let briefPath = ''
  let shown = header
  // MOD-141: the brief the current card and flags would render, compared with the file; amend blocks a worker appended ride along
  let rewritten = false
  let rewriteText: string | undefined
  let rewriteReasons = ''
  if (candidate && reuse !== undefined && reusedText !== undefined) {
    const renderBase = reusedBase && isGitRef(reusedBase) ? reusedBase : 'origin/main'
    const held = extractAmendBlocks(reusedText)
    const blocks = [...held.amends.map(a => a.block), ...held.malformed.map(m => m.block)]
    const first = await renderBrief(renderBase)
    if ('stop' in first) return first.stop
    if (appendAmends(first.text, blocks).text !== reusedText) {
      const open = await openAttemptOf($, { task: id, repo: target?.path })
      if (open !== undefined) return liveBriefRefusal(id, reuse)
      const final = renderBase === base ? first : await renderBrief(base)
      if ('stop' in final) return final.stop
      rewriteText = appendAmends(final.text, blocks).text
      rewriteReasons = rewriteReasonsOf(reusedText, rewriteText, scope !== undefined, forbid !== undefined)
      if (headBudget !== oldBudget) rewriteReasons += `, budget ${oldBudget}→${headBudget} attempts`
      rewritten = true
    }
  }
  const reused = reuse !== undefined && !rewritten
  if (reused && reuse) {
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
    out.push(`2. brief ${briefPath} exists — reused${baseNote || ', not overwritten'}${!candidate && (scope || forbid) ? ' (--scope/--forbid not applied to it)' : ''}`)
    if ((here !== wantHere || none !== wantNone) && !replay) out.push(`   note: the reused brief is ${here ? 'repo=here' : none ? 'repo=none' : 'a worktree brief'}, so it decides the mode (remove it to re-render)`)
  } else if (rewritten && rewriteText !== undefined && reuse) {
    await $.fs.write(reuse, rewriteText)
    briefPath = reuse
    shown = parseHeader(rewriteText)?.raw ?? header
    out.push(`2. brief ${briefPath} rewritten: ${rewriteReasons}`)
  } else {
    const built = await renderBrief(base)
    if ('stop' in built) return built.stop
    const written = await writeBrief($, root, fileName, built.text)
    if ('error' in written) return [...out, `/dispatch ${id}: ${written.error}`].join('\n')
    briefPath = written.path
    out.push(stale ? briefRewrittenLine(briefPath, stale) : `2. brief ${briefPath} written (tier=${tier}, model=${alias}, budget=${budget}-attempts${here ? ', repo=here' : none ? ', repo=none' : ''})`)
  }
  // MOD-143: the merge check merge will run, said after the gate (the card's own, else the map's for its gate ids)
  for (const cmd of target ? mergeChecksFor(card.fields.merge_check as string | undefined, [], {}) : mergeChecksFor(card.fields.merge_check as string | undefined, card.gate, cfg.mergeCheckMap)) out.push(`   merge check: ${cmd}`)
  if (lessons !== undefined) {
    const n = lessonLineCount(lessons.text)
    out.push(`   note: lessons: ${n} lines from ${lessons.path}`)
    if (n > LESSONS_CAP) out.push(`   ${lessonsCapWarning(card.domain, n, lessons.path)}`)
  }
  // GH-1 item 6: the budget the spawn will use, off the grammar, falls back to the default; say so once
  const budgetWarn = budgetWarning(reused ? reusedHeader?.budget : card.budget, cfg.defaultBudget)
  if (budgetWarn) out.push(`   ${budgetWarn}`)
  // GH-108: a card tier the mod does not know runs at standard, and says so once
  const tierWarn = tierWarning(reused ? reusedHeader?.tier : card.tier)
  if (tierWarn) out.push(`   ${tierWarn}`)
  // MOD-216: an issue: or parent: that is set but not read is said once, not ignored
  const dispatchRepo = ownerRepoOf(gitConfigValue((await readText($, `${root}/.git/config`)) ?? '', 'remote "origin"', 'url') ?? '') || undefined
  for (const key of ['issue', 'parent'] as const) {
    const note = issueNote(key, card.fields[key], dispatchRepo)
    if (note) out.push(`   ${note}`)
  }
  if (!scope && scopeLooksProse(card.scope)) {
    out.push('   note: the card scope reads as prose; the verifier leaves a prose scope unchecked unless the brief gains scope_globs= — pass scope globs')
  }
  const shownHeader = parseHeader(shown)
  const shownForbid = (shownHeader?.fields.forbid ?? '').split(',').filter(Boolean)
  // MOD-227: a forbid from elsewhere (the parent issue, a sibling card) wins as before; the line names where it came from
  for (const c of scopeForbidClashes((shownHeader?.fields.scope ?? '').split(',').filter(Boolean), shownForbid, forbidOrigin)) {
    out.push(`   warning: ${scopeForbidClashLine(c.entry, c.forbid, c.origin)}`)
  }
  // MOD-29: a forbid glob that can match a scope entry or a path the done-when names is said once per collision (nothing is refused)
  for (const line of forbidCollisions((shownHeader?.fields.scope ?? '').split(',').filter(Boolean), shownForbid, doneWhenOf(card.body))) {
    out.push(`   ${line}`)
  }
  // MOD-141: and the forbid to pass back as --forbid when a glob covers a path the done-when names
  const fixLine = forbidFix(shownForbid, doneWhenOf(card.body))
  if (fixLine !== undefined) out.push(`   ${fixLine}`)
  // MOD-55: a path the red_test names that the scope leaves out, or a forbid covers, is said once (nothing is added to the scope)
  for (const line of redTestWarnings(card.redTest, (shownHeader?.fields.scope ?? '').split(',').filter(Boolean), shownForbid)) out.push(`   ${line}`)
  // MOD-54: a wide scope warns, and a small standard card is told economy would do (nothing is refused or changed)
  const sizeScope = (shownHeader?.fields.scope ?? '').split(',').filter(Boolean)
  const sizeWarn = scopeSizeWarning(sizeScope)
  if (sizeWarn) out.push(`   ${sizeWarn}`)
  const economyHint = tierHint({ tier, scope: sizeScope, doneCount: doneStatementCount(doneWhenOf(card.body)), redTest: card.redTest })
  if (economyHint) out.push(`   ${economyHint}`)
  // MOD-140: a Done when line that hedges hands the worker a decision; said once per line, at most three (nothing is refused)
  for (const line of hedgeHints(doneWhenOf(card.body))) out.push(`   ${line}`)
  if (here) {
    const f: Record<string, string> = shownHeader?.fields ?? {}
    out.push(`   repo=here: base=${f.base || 'the chain (origin/main, main, origin/master, master)'} · ignore=${f.ignore || '(none)'}`)
  }
  if (shownHeader?.fields.outdir) {
    // MOD-163: a repo=none gate's {worktree} is the checkout the worker runs in; said before the spawn
    const gateIds = (shownHeader.fields.gate ?? '').split(',').map(g => g.trim()).filter(Boolean)
    const gateNote = none && gateIds.length > 0 ? ` · gate ${gateIds.join(', ')} runs in ${repoRoot}` : ''
    out.push(`   research card: outdir=${shownHeader.fields.outdir} · scratch=${shownHeader.fields.scratch || '(none)'}${gateNote}`)
  }
  const heldNames = resourcesOf(shownHeader)
  if (heldNames.length > 0) out.push(`   resources: ${heldNames.join(', ')} (held while the worker runs; another card naming one waits in the queue)`)
  if (dryRun) return [...out, '', shown].join('\n')
  // MOD-13: the card's own effort: (it wins over effortByTier for this task's workers); cleared when the card has none
  await storeSet($, K.effort(id, await cardRepo($, target?.path)), typeof card.fields.effort === 'string' ? card.fields.effort.trim() : '')

  // GH-103: a prose scope with no globs is caught here, before the worktree and the spawn
  const shownScope = (shownHeader?.fields.scope ?? '').split(',').filter(Boolean)
  if (!scope && !shownHeader?.fields.scope_globs && scopeLooksProse(shownScope)) {
    return [...out, '', shown, '', `scope: ${shownScope.join(', ')}`, '', PROSE_SCOPE_STOP].join('\n')
  }

  // MOD-22: the absolute scope and forbid roots are listed now; the verifier lists them again at hand-back
  const listedOutside = await recordOutside($, id, briefPath, reused, target?.path)
  if (listedOutside) out.push(`   ${listedOutside}`)

  if (here) out.push(`3. no worktree (repo=here): the worker shares ${root}`)
  else if (none) out.push(`3. no worktree (repo=none): the worker runs in ${root} and writes outside the repo`)
  else if (await exists($, worktree)) out.push(`3. worktree ${worktree} exists — reused`)
  else {
    const fetched = await run($, fetchArgv(repoRoot), { cwd: repoRoot, timeoutMs: 120000 })
    const fetchWhy = fetched.ok ? fetched.stderr.trim() || `exit ${fetched.exitCode}` : fetched.why
    if (!fetched.ok || fetched.exitCode !== 0) {
      // a sha base needs no fetch; origin/main does
      if (base === 'origin/main') return [...out, `3. git fetch failed: ${fetchWhy} (the repo needs an origin remote with a main branch, or pass a sha base, or dispatch with --here)`].join('\n')
      out.push(`   note: git fetch failed (${fetchWhy}); continuing from ${base}`)
    }
    const added = await run($, worktreeAddArgv(repoRoot, card.domain, id, base, replay, target ? undefined : cfg.worktreeRoot), { cwd: repoRoot, timeoutMs: 120000 })
    if (!added.ok || added.exitCode !== 0) {
      return [...out, `3. git worktree add failed: ${added.ok ? added.stderr.trim() : added.why}`].join('\n')
    }
    out.push(`3. worktree ${worktree} on ${branch} from ${base}`)
    // MOD-144: the session's own card was dispatched: the remembered other repo is stale for this id
    if (located.staleRepo !== undefined && !target && !replay) {
      try {
        await $.store.delete(K.taskRepo(id, await cardRepo($)))
      } catch (err) {
        debug($, `store.delete taskRepo ${id} failed: ${String(err)}`)
      }
    }
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
    const queuedShare = await engineLanesNote($, id, briefPath, target ? target.gateMap : cfg.gateMap)
    if (queuedShare) out.push(queuedShare)
    return out.join('\n')
  }
  // GH-104: the line says what the spawn spends: the model and the attempt of the budget
  out.push(`4. spawn prepared: ${subagentType} on ${prepared.alias} · tier=${prepared.tier} (${prepared.source}) · attempt ${prepared.attempt}/${prepared.budget} — nothing runs until the Agent call below is made`)
  out.push(`brief ${briefPath} · ${place} · branch ${branch} · tier=${prepared.tier} → ${prepared.alias}`)
  out.push('', spawnBlock(prepared.call))
  const startedShare = await engineLanesNote($, id, briefPath, target ? target.gateMap : cfg.gateMap)
  if (startedShare) out.push(startedShare)
  // MOD-64: with wakes off nothing starts the brain's turn at the verdict, so it waits for it in the hand-back turn
  if (!cfg.wakeOnVerdict) out.push(verdictRule(id))
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
  // MOD-44: a task for another local repo: its card, its domains, its worktree
  const located = await locateTask($, id, undefined, root, false)
  if (typeof located === 'string') return located
  const { tasksDir, found } = located
  if (typeof found === 'string') return found
  if (found.length !== 1) {
    return found.length === 0
      ? `${head}: no card under ${tasksDir} (looked for ${id}-*.md with id: ${id})`
      : `${head}: ${found.length} cards claim ${id} (${found.map(f => f.name).join(', ')}); fix the board first`
  }
  const { card } = found[0] as { name: string; card: Card }
  const refusal = checkDomain(card, located.target ? located.target.domains : cfg.domains)
  if (refusal) return `${head}: ${refusal}`
  const briefPath = await existingBrief($, root, briefFileName(id))
  if (!briefPath) return `${head}: no brief for ${id} under ${briefDirFor(root, cfg.briefDir)} (dispatch it first; --verify judges a dispatched task's work)`
  const briefText = (await readText($, briefPath)) ?? ''
  const header = parseHeader(briefText)
  if (header?.repo === 'none') return `${head}: the brief ${briefPath} says repo=none; there is no branch to verify`
  const here = header?.repo === 'here'
  const subtask = header?.subtask ?? 'main'
  const label = taskLabel(id, subtask)
  const other = located.target ?? (await adoptRepo($, id, header))
  if (other) registerTaskRepo(id, other, (header?.gate ?? '').split(',').map(g => g.trim()).filter(Boolean))
  const repo = here ? root : other ? await workerRepo($, { task: id }, other.path, root) : header?.repo || worktreePath(root, id, false, cfg.worktreeRoot)
  if (!here && !(await exists($, repo))) return `${head}: no worktree at ${repo}`
  let branch = branchName(card.domain, id)
  if (here) {
    const current = await run($, currentBranchArgv(root), { cwd: root, timeoutMs: 10000 })
    branch = current.ok && current.exitCode === 0 && current.stdout.trim() ? current.stdout.trim() : branch
  }
  // MOD-97: that repo's attempts
  const ref: TaskRef = { task: id, repo: other?.path }
  const all = await loadAttempts($, ref)
  const ladder = all.filter(r => (r as HereRecord).adhoc !== true)
  const last = attemptsFor(ladder, subtask).at(-1)
  // a worker still running owns the tree; a pending attempt whose agent is gone is not waited on
  const running = last?.verdict === 'pending' && last.agentId !== undefined && (await agentList($)).some(a => a.id === last.agentId && a.status === 'running')
  if (running) return `${head}: attempt ${last?.attempt} of ${label} is still running (agent ${last?.agentId}); --verify judges finished work`

  // the synthetic report: the delta the verifier will take, and the newest red file when the brief asks for one
  const contract = briefContract(briefText)
  const base = (contract.ok ? contract.base : undefined) || (other ? other.baseRef : cfg.baseRef) || undefined
  const delta = await branchDelta({ repo, sha, ...(base ? { base } : {}) }, (argv, init) => run($, [...argv], init))
  if ('why' in delta) return `${head}: ${delta.why}`
  // MOD-1: --verify at the last attempt's own sha re-judges that attempt instead of opening another
  const target = verifyTarget(ladder, subtask, sha)
  let red: string | undefined
  let redNote: string | undefined
  if (target.rejudge && last?.red) {
    red = last.red
    // a re-judge looks again: a newer red file in the folder is the evidence it reads
    if (contract.ok && briefWantsRed(contract.redTest)) {
      try {
        const entries = await $.fs.list(`${repo}/.delegation/${id}`)
        const name = newestRed(entries.map(e => e.name))
        const recorded = /(?:^|\/)red-(\d+)\.txt$/.exec(last.red)
        let newer = false
        if (name && recorded) newer = Number(/^red-(\d+)\.txt$/.exec(name)?.[1]) > Number(recorded[1])
        else if (name) {
          const mtime = (n: string) => entries.find(e => e.name === n)?.mtimeMs
          const at = (await $.fs.stat(`${repo}/${last.red}`)).mtimeMs
          const theirs = mtime(name)
          newer = typeof at === 'number' && typeof theirs === 'number' && theirs > at
        }
        if (name && newer && `.delegation/${id}/${name}` !== last.red) {
          red = `.delegation/${id}/${name}`
          redNote = `red: ${red} (newer than the attempt's ${last.red})`
        }
      } catch {
        // an unreadable folder or file keeps the recorded red
      }
    }
  } else if (contract.ok && briefWantsRed(contract.redTest)) {
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
      ...(await ownerFields($, other?.path)),
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
    await saveAttempts($, ref, [...all, rec])
  }
  const rec = attemptsFor(await loadAttempts($, ref), subtask).find(r => r.attempt === attempt && (r as HereRecord).adhoc !== true)
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
    ...(other ? { repo: other.path } : {}),
  }
  const rendered = await finalize($, spawn, report)
  const rejudged = target.rejudge ? [`re-judging attempt ${attempt}/${spawn.budget} at ${sha}`] : []
  return [...rejudged, ...(redNote ? [redNote] : []), `${head}: no spawn — the verifier ran on ${here ? `the shared checkout ${root}` : `worktree ${repo}`} at ${sha.slice(0, 7)} (base ${delta.base})`, `synthetic report: ${report}`, rendered.full].join('\n')
}

// ---- part 5B: /delegation init and the init tool ----------------------------------------
/**
 * MOD-45: init and setup take an optional `path`: the absolute path of a git checkout (`~` expanded). Without one (or with the
 * session's own root) the session root, unchanged; with one, that repo; else the one-line refusal.
 */
async function targetRoot($: Host, who: 'init' | 'setup', pathIn: string | undefined): Promise<{ root: string; other: boolean } | { refused: string }> {
  const sessionRoot = (await $.session.root()).replace(/\/+$/, '')
  const given = pathIn?.trim()
  if (given === undefined || given === '') return { root: sessionRoot, other: false }
  const home = await homeOf($)
  const v = normRepoPath(given, home)
  if (given.startsWith('/') || given === '~' || given.startsWith('~/')) if (v === sessionRoot) return { root: sessionRoot, other: false }
  const r = await resolveRepo($, given, sessionRoot)
  if ('error' in r) return { refused: `${who} refused: path ${given} ${r.error}` }
  return { root: r.path, other: true }
}

/** MOD-86: the card folder init and setup work with: the config's cardDir when it names one, else docs/cards in a plugin repo, else the default; the line when git ignores it. */
async function cardsLocalNote($: Host, root: string, existing: Readonly<Record<string, string | undefined>>): Promise<string[]> {
  let dir = existing[`${root}/${PLUGIN_MANIFEST}`] !== undefined ? PLUGIN_CARD_DIR : DEFAULT_CARD_DIR
  try {
    const named = (JSON.parse(existing[`${root}/${REPO_CONFIG_FILE}`] ?? '{}') as { cardDir?: unknown }).cardDir
    if (typeof named === 'string' && named.trim() !== '') dir = named.replace(/^\/+|\/+$/g, '')
  } catch {
    // an unreadable config names no folder
  }
  return (await isIgnored($, root, dir)) ? [cardsLocalLine(dir)] : []
}

async function runInit($: Host, pathIn?: string): Promise<string> {
  const target = await targetRoot($, 'init', pathIn)
  if ('refused' in target) return target.refused
  const root = target.root
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
  if (!target.other) {
    repoText = undefined
    repoSig = undefined
    await loadRepoConfig($)
  }
  return [initText(root, plan, failed, !target.other), ...(await cardsLocalNote($, root, existing))].join('\n')
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

async function runSetup($: Host, viaTool = false, pathIn?: string): Promise<string> {
  const target = await targetRoot($, 'setup', pathIn)
  if ('refused' in target) return target.refused
  const root = target.root
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
  if (!target.other) {
    repoText = undefined
    repoSig = undefined
    await loadRepoConfig($)
  }
  const wroteConfig = plan.some(s => s.path === configPath && s.action === 'write' && !failed[s.path])
  return [
    head,
    '',
    initText(root, plan, failed, false, false),
    ...(wroteConfig ? configLines(found) : []),
    ...(hadConfig ? [wouldSet(found)] : []),
    ...(await cardsLocalNote($, root, existing)),
    '',
    handoverText(detectGate(facts)),
    ...(viaTool ? [BRAIN_HANDOVER] : []),
    ...(target.other ? [`Next: call the card tool with repo set to ${root}, so the first card goes into that repo.`] : []),
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
  // MOD-44: repo set to a path delegates into that checkout: its card folder, its gate map, domains and spend
  let target: Target | undefined
  const repoIn = typeof input.repo === 'string' ? input.repo.trim() : undefined
  if (repoIn !== undefined && isRepoPath(repoIn)) {
    const r = await resolveRepo($, repoIn, root)
    if ('error' in r) return `card refused: repo ${repoIn} ${r.error}`
    target = await loadTarget($, r.path)
  }
  const dir = target ? targetCardsDir(root, target) : cardDirPath(root, cfg.cardDir)
  const listNames = async (folder: string): Promise<string[]> => {
    try {
      return (await $.fs.list(folder)).map(e => e.name)
    } catch {
      return []
    }
  }
  // an id is free in the session's own board too: the ledger, the briefs and the store are keyed by the id alone
  const cardNames = target ? [...new Set([...(await listNames(dir)), ...(await listNames(cardDirPath(root, cfg.cardDir)))])] : await listNames(dir)
  // MOD-87: an id that owns a brief or a ledger row is taken too, or a deleted card's old brief, tier and attempts come back
  const briefNames = [...(await listNames(briefDirFor(root, cfg.briefDir)))]
  if (!cfg.briefDir) {
    const sid = await sessionIdOf($)
    if (sid) briefNames.push(...(await listNames(defaultBriefDir(root, sid))))
  }
  const ledgerNames: string[] = []
  for (const r of (await ledgerAt($, root)).rows) if (typeof r.task === 'string' && r.task) ledgerNames.push(`${r.task}.ledger`)
  const names = [...cardNames, ...briefNames, ...ledgerNames]
  // repo=here when the repo has no origin/main (worktree mode cuts from it); a baseRef alone says nothing about the mode
  const originMain = target ? undefined : await run($, ['git', '-C', root, 'rev-parse', '--verify', '--quiet', 'origin/main'])
  const here = target ? false : !(originMain?.ok && originMain.exitCode === 0)
  // MOD-188: the open cards under the same parent; the ledger decides "done" (the card status lags)
  let siblings: { id: string; scope: readonly string[] }[] = []
  const parentIn = Number(input.parent)
  if (input.parent !== undefined && Number.isInteger(parentIn) && parentIn >= 1) {
    const done = doneTasks((await ledgerAt($, root)).rows)
    const found: SiblingCard[] = []
    // MOD-244: through the index; the session's own board is read too when the target's folder differs, as cardNames above does
    const folders = target ? [...new Set([dir, cardDirPath(root, cfg.cardDir)])] : [dir]
    for (const folder of folders) {
      let indexed: { name: string; card: Card }[] = []
      try {
        indexed = await indexedCards($, folder)
      } catch {
        // an unlistable folder holds no sibling
      }
      for (const { card: sib } of indexed) found.push({ id: sib.id, status: sib.status, parent: sib.fields.parent, scope: sib.scope })
    }
    siblings = openSiblings(found, parentIn, done)
  }
  const made = cardsFromFields(input, {
    siblings,
    domains: target ? target.domains : cfg.domains,
    gateIds: Object.keys(target ? target.gateMap : cfg.gateMap).filter(k => k !== EMPTY_GATE_KEY),
    refusedGates: target ? target.refusedGates : cfg.refusedGates,
    names,
    spendByTier: target ? target.spendByTier : cfg.spendByTier,
    here,
    ...(target ? { repoPath: target.path } : {}),
  })
  if ('error' in made) return `card refused: ${made.error}`
  // all or none: every lane's file is checked before the first is written
  for (const c of made) {
    const path = `${dir}/${c.file}`
    if (cardNames.includes(c.file) || (await exists($, path))) return `card refused: ${path} exists; cards are never overwritten`
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
    // MOD-44: the id alone finds a card for another repo
    if (target) await storeSet($, K.taskRepo(c.id, await cardRepo($)), target.path)
  }
  // MOD-22: dispatch reads the mode from the card (`repo:`); here is passed only when the card says repo: here
  const dispatchArgs = (c: NewCard, dryRun: boolean): DispatchArgs => ({ id: c.id, dryRun, base: 'origin/main', ...(c.repo === 'here' ? { here: true as const } : {}), ...(target ? { repo: target.path } : {}) })
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
    const notes = lines.filter(l => /^\s+(note|warning|hint|repo|merge check):/.test(l)).map(l => l.trim())
    // GH-114: one classifier call per card written, on the dry run only
    let second: string | undefined
    if (cfg.classifierSecondOpinion) {
      try {
        const said = await $.model.classify(classifierText(c.text), CLASSIFIER_LABELS)
        if ((CLASSIFIER_LABELS as readonly string[]).includes(said ?? '')) {
          await storeSet($, K.classifier(c.id, await cardRepo($, target?.path)), { card: c.tier, classifier: said })
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

/** MOD-74: every live, verifying and queued briefed worker with its alias, tier, time and spend. */
async function runningWorkers($: Host): Promise<RunningWorker[]> {
  const t = await now($)
  const out: RunningWorker[] = []
  const seen = new Set<string>()
  const add = async (spawn: SpawnRecord, state: 'running' | 'verifying') => {
    const label = taskLabel(spawn.task, spawn.subtask)
    if (seen.has(label) || spawn.adhoc || spawn.review) return
    seen.add(label)
    const usd = await attemptUsd($, spawn)
    out.push({ label, alias: spawn.alias, tier: spawn.tier, state, minutes: waitedMinutes(spawn.at ?? t, t), ...(usd !== undefined ? { usd } : {}) })
  }
  const live = await liveState($)
  for (const w of live.workers) await add(w.spawn, 'running')
  for (const p of live.pending) {
    const spawn = await spawnByAgent($, p.agentId)
    if (spawn) await add(spawn, 'verifying')
  }
  for (const spawn of verifying.values()) await add(spawn, 'verifying')
  for (const q of await readQueue($)) {
    const label = queuedLabel(q)
    if (seen.has(label)) continue
    seen.add(label)
    const tier = tierOf(parseHeader(q.prompt)?.tier) ?? 'standard'
    out.push({ label, alias: cfg.tierMap[tier], tier, state: 'queued', minutes: waitedMinutes(q.at, t), usd: 0 })
  }
  return out.map(w => ({ ...w, glyph: glyphOf(w.alias) }))
}

/** `/delegation` with no argument: the delegation state and where the config came from. */
async function statusReport($: Host): Promise<string> {
  await loadRepoConfig($)
  const brainModel = await $.session.model().catch(() => undefined)
  const running = runningSection(await runningWorkers($), brainModel ? aliasOf(brainModel) ?? brainModel : undefined, brainModel ? glyphOf(brainModel) : undefined)
  const s = await snapshot($)
  // MOD-75: a task merged this session is listed under merged:, and no longer as running or pending
  const sid = await sessionIdOf($)
  const merged = sid ? ((await storeGet<MergedEntry[]>($, K.merged(sid))) ?? []) : []
  s.running = s.running.filter(r => !labelIsMerged(r.task, merged))
  s.pending = s.pending.filter(p => !labelIsMerged(p.task, merged))
  const state = [...(isEmptyState(s) && s.recent.length === 0 ? ['Delegation state (chassis-delegation): nothing running, queued or owed.'] : renderState(s)), ...mergedLines(merged)]
  const root = await $.session.root()
  const split = await brainView($)
  return [
    ...running,
    ...state,
    '',
    ...(split.hasBrain ? [brainLine(split.summary)] : []),
    ...(split.hasEdits ? [`brain edits: ${split.summary.edits}`] : []),
    ...(await rationSummary($)),
    ...driveLines(await readDrive($)),
    `mod: chassis-delegation ${MOD_VERSION} loaded from ${$.plugin.root}`,
    ...(await storeStatusLines($)),
    ...(await codeSkewLines($)),
    ...(await updateStatusLines($)),
    ...(cfg.issueRepo ? [`issues: ${cfg.issueRepo}${cfg.issueRepoOwn ? " (the mod's own tracker)" : ''}`, postModeLine(cfg.postFindings, cfg.issueRepo)] : []),
    `config: ${repoText == null ? `no ${REPO_CONFIG_FILE} in ${root} (built-in defaults + the mod's options: /delegation config)` : `${root}/${REPO_CONFIG_FILE} + the mod's options (/delegation config)`}`,
    ...(repoText == null ? ['not set up here: run /delegation setup'] : []),
    `gate map: ${Object.keys(cfg.gateMap).length > 0 ? Object.entries(cfg.gateMap).map(([k, v]) => `${k} → ${v}`).join('; ') : '(empty: gates are reported "not re-run")'}`,
    `tiers: ${(['economy', 'standard', 'frontier'] as const).map(t => `${t}→${cfg.tierMap[t]}`).join(', ')} · max workers ${maxWorkersSourcedText(cfg.maxWorkers, cfg.maxWorkersByTier, resolvedNow?.sources)} · git guard ${cfg.gitGuard ? `on (${cfg.guardBranches.join(', ')})` : 'off'} · eval ${cfg.autoEval ? 'on' : 'off'}`,
    effortText(cfg.effortByTier),
    nudgeText(cfg.effortNudge),
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

/** MOD-66, MOD-73: the rows `$.config.list()` gives this mod's fields, and the view of every field: its value and source, as the mod runs with it. */
async function configView($: Host): Promise<CfgView> {
  await loadRepoConfig($)
  let rows: CfgRow[]
  try {
    rows = (await $.config.list()) as unknown as CfgRow[]
  } catch (err) {
    debug($, `config.list failed: ${String(err)}`)
    rows = []
  }
  if (!Array.isArray(rows)) rows = []
  const plugin = ($.plugin as { name?: string }).name ?? PLUGIN
  const specs = manifestFields(await readText($, `${$.plugin.root}/.claude-plugin/plugin.json`))
  const fields = viewFields(specs)
  const mine = rowsByField(rows, plugin, fields)
  const locked = new Set(Object.entries(mine).filter(([, r]) => r.isLocked).map(([f]) => f))
  const lockChanged = locked.size !== lockedFields.size || [...locked].some(f => !lockedFields.has(f))
  lockedFields = locked
  // a listed row's value over the activation options: the host's layer as the menu shows it now
  const host = { ...(options as Record<string, unknown>), ...Object.fromEntries(Object.entries(mine).map(([f, r]) => [f, r.value])) }
  const r = readConfig(host, repoLayer, userOpts, locked)
  if (lockChanged) {
    const again = readConfig(options, repoLayer, userOpts, locked)
    cfg = again.cfg
    resolvedNow = again.resolved
  }
  const values: Record<string, unknown> = { ...r.resolved.values }
  const sources: Record<string, Source> = { ...r.resolved.sources }
  // MOD-223: the repo file's own project (owner/number or none) is what land adds to, so it is the value in effect
  if (repoProject !== undefined) {
    values.project = repoProject
    sources.project = 'repo'
  }
  // a manifest field the table lacks: the host's value, else its manifest default
  for (const f of fields.filter(x => !CONFIG_TABLE[x])) {
    const def = specs[f]?.default
    const v = f in host ? host[f] : def
    values[f] = v
    sources[f] = locked.has(f) ? 'locked' : JSON.stringify(v) !== JSON.stringify(def) ? 'host' : 'default'
  }
  return { plugin, fields, values, sources, rows: mine, specs, derived: { issueRepo: r.cfg.issueRepo, cardDir: r.cfg.cardDir }, refusedGates: r.cfg.refusedGates }
}

/** A /config row the host has not got (it lists none for a folder-loaded mod): the set goes to the user options file instead. */
const NO_ROW = /\bno (?:\/config )?row\b|no implementation|rejects? a key/i

/** MOD-73: writes (or, with `value` undefined, removes) one field of the user options file; an error's text when it could not. */
async function writeUserOption($: Host, field: string, value: unknown): Promise<string | undefined> {
  const home = await homeDir($)
  if (!home) return 'HOME is not set, so there is no user options file'
  const path = userOptionsPath(home)
  try {
    await $.fs.write(path, userFileWith((await readText($, path)) ?? undefined, field, value))
    return undefined
  } catch (err) {
    return `${path} could not be written: ${err instanceof Error ? err.message : String(err)}`
  }
}

/** The field's line as the mod now runs with it. */
async function lineNow($: Host, field: string): Promise<string> {
  const view = await configView($)
  return fieldAnswer(field, view.values[field], view.sources[field] ?? 'default')
}

/** MOD-66, MOD-73: `/delegation config [all | <group> | <field> [<value> | default] | repo <field> <value>]`. */
async function runConfig($: Host, rest: string): Promise<string> {
  const view = await configView($)
  const plan = configPlan(view, rest)
  if ('text' in plan) return plan.text
  if ('repo' in plan) {
    const { field, value } = plan.repo
    let root: string
    try {
      root = await $.session.root()
    } catch (err) {
      return `${field} was not set: no repo root (${String(err)})`
    }
    const path = `${root}/${REPO_CONFIG_FILE}`
    const next = repoFileWith((await readText($, path)) ?? undefined, field, value)
    if (next === undefined) return `${field} was not set: ${path} is not a JSON object; fix it first`
    try {
      await $.fs.write(path, next)
    } catch (err) {
      return `${field} was not set: ${path} could not be written: ${err instanceof Error ? err.message : String(err)}`
    }
    await loadRepoConfig($, true)
    const now = await configView($)
    const src = now.sources[field] ?? 'default'
    const head = value === undefined ? `${field} removed from ${REPO_CONFIG_FILE}` : fieldAnswer(field, value, 'repo')
    return src === 'repo' || (value === undefined && src === 'default') ? (value === undefined ? `${head}; ${fieldAnswer(field, now.values[field], src)}` : head) : `${head}; ${fieldAnswer(field, now.values[field], src)} wins over it`
  }
  if ('unset' in plan) {
    const { field, key, def } = plan.unset
    const failed = await writeUserOption($, field, undefined)
    if (failed) return `${field} was not reset: ${failed}`
    if (key !== undefined) {
      try {
        const out = await $.config.set({ key, value: def as never })
        if (out.deny !== undefined && !NO_ROW.test(out.deny)) return `${field} was not reset in /config: ${out.deny}`
      } catch (err) {
        if (!NO_ROW.test(String(err))) return `${field} was not reset in /config: ${err instanceof Error ? err.message : String(err)}`
      }
    }
    await loadRepoConfig($, true)
    return lineNow($, field)
  }
  const { field, value, host, key } = plan.set
  if (key !== undefined) {
    let deny: string | undefined
    try {
      const out = await $.config.set({ key, value: host })
      deny = out.deny
      if (deny === undefined) return fieldAnswer(field, out.value ?? value, 'host')
    } catch (err) {
      deny = err instanceof Error ? err.message : String(err)
    }
    if (!NO_ROW.test(deny)) return `${field} was not set: ${deny}`
  }
  if (!CONFIG_TABLE[field]) return `${field} was not set: the host lists no /config row for it`
  const failed = await writeUserOption($, field, value)
  if (failed) return `${field} was not set: ${failed}`
  await loadRepoConfig($, true)
  return lineNow($, field)
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
    const slice = changelogSlice((await readText($, `${root}/CHANGELOG.md`)) ?? '', oldVersion, newVersion, await readText($, `${root}/docs/upgrading.md`))
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
  /** MOD-97: the other local repo the brief names (an absolute repo=), whose key space the records are from. */
  repo?: string
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

/** The brief file's header, as planSpawn read it (undefined: no brief file, or the prompt carries the header). */
const briefText0 = (p: SpawnPlan): BriefHeader | undefined => (p.briefText !== undefined ? parseHeader(p.briefText) : undefined)

async function planSpawn($: Host, e: SpawnEvent): Promise<SpawnPlan> {
  const t = await now($)
  spawnSeq += 1
  const key = e.tool_use_id || `plugin-${t}-${spawnSeq}`
  // MOD-135: a relative path is read from the spawn's folder, else the session root; one that climbs out is not read
  const written = findBriefPath(e.prompt)
  const named = written !== undefined ? resolveBriefPath(written, e.cwd, await $.session.root()) : undefined
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
  // MOD-97 (#163): the ladder of the repo the brief names (another local repo keys its own)
  const named0 = (fileHeader ?? header)?.repo
  const repo = !adhoc && named0 !== undefined && named0.startsWith('/') ? named0 : undefined
  const records = adhoc ? [] : (await loadAttempts($, { task, repo })).filter(r => (r as HereRecord).adhoc !== true)
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
    ...(repo ? { repo } : {}),
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
async function gateSpawn($: Host, p: SpawnPlan, item: Omit<QueuedSpawn, 'task' | 'subtask' | 'at'>, claim: boolean, looked = false, s?: Stopper): Promise<{ token?: number } | { deny: string }> {
  if (p.adhoc) return {}
  const step = <T>(q: Promise<T>): Promise<T> => (s ? s.race(q) : q)
  const running = await step(runningAttempt($, p))
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
    const work = await step(workInWorktree($, look, fileHeader ?? p.header, p.records, p.lane))
    s?.check()
    if (work) {
      const last = attemptsFor(p.records, p.subtask, p.lane).at(-1)
      await recordWorkPresent($, { task: p.task, subtask: p.subtask, tier: last?.tier ?? 'standard', alias: last?.alias ?? cfg.tierMap.standard, purpose: p.header?.purpose ?? 'build', ...(p.named ? { briefPath: p.named } : {}), ...((fileHeader ?? p.header)?.repo?.startsWith('/') ? { repo: (fileHeader ?? p.header)?.repo } : {}) }, work, p.lane)
      const deny = workPresentDeny(p.label, p.task, work)
      debug($, deny)
      await dropQueued($, p.task, p.subtask)
      return { deny }
    }
  }
  // 2F: a briefed spawn takes a worker slot or waits in the queue; an ad hoc one never waits.
  const repo = (p.briefText !== undefined ? parseHeader(p.briefText)?.repo : undefined) ?? p.header?.repo
  return claimSlot($, { ...item, ...(p.cwd ? { cwd: p.cwd } : {}), ...(repo?.startsWith('/') ? { repo } : {}), task: p.task, subtask: p.subtask, at: p.t }, p.label, claim, p.resources, pickFor(p, item.model).tier, s)
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
async function decideSpawn($: Host, e: SpawnEvent, start: (alias: string, cwd?: string) => Promise<AgentSpawnResult>, s?: Stopper): Promise<AgentSpawnResult> {
  let token: number | undefined
  // MOD-92: before the start, every await is a step a stop (an abort, the budget) ends at once
  const step = <T>(q: Promise<T>): Promise<T> => (s ? s.race(q) : q)
  try {
    // MOD-73: a value changed in the repo file or the user options file applies from this spawn
    await step(loadRepoConfig($))
    noteGlyphIssues($)
    const p = await step(planSpawn($, e))
    const { t, key, named, header, adhoc, task, subtask, label, budget, spend, lane, records } = p
    // GH-1 item 6: a budget off the grammar falls back, and says so
    const budgetWarn = budgetWarning(p.budgetRaw, cfg.defaultBudget)
    if (budgetWarn) debug($, `${label}: ${budgetWarn}`)
    const tierWarn = tierWarning(header?.tier)
    if (tierWarn) debug($, `${label}: ${tierWarn}`)

    const gate = await step(gateSpawn($, p, { prompt: e.prompt, description: e.description, subagentType: p.subagentType, ...(e.model ? { model: e.model } : {}) }, true, false, s))
    if ('deny' in gate) return { deny: gate.deny }
    token = gate.token
    s?.check()

    // GH-6: no brief file named, a header inline: the header is the brief.
    const inline = named === undefined && header !== undefined ? await step(inlineBrief($, e.prompt, header)) : undefined
    const briefPath = named ?? (inline && 'path' in inline ? inline.path : undefined)
    const noBrief = inline && 'why' in inline ? inline.why : undefined
    if (inline && 'path' in inline) debug($, `${label}: inline header → brief ${inline.path}`)

    let classified: string | undefined
    // GH-1 item 8: a header (with or without tier=) or a caller-model hint decides; no classify call
    const classify = needsClassifier({ hadHeader: header !== undefined, headerTier: header?.tier, callerModel: e.model })
    if (classify) {
      try {
        classified = await step($.model.classify(classifierText(e.prompt), CLASSIFIER_LABELS))
      } catch (err) {
        if (isStopped(err)) throw err
        debug($, `classifier failed: ${String(err)}`)
      }
    }
    s?.check()
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
        here = await step($.session.root())
      } catch (err) {
        if (isStopped(err)) throw err
        here = undefined
      }
    }
    // MOD-44: the other local repo this task is for (its path), when the brief names one
    const fileHeader = briefText0(p)
    const other = !adhoc ? await step(adoptRepo($, task, fileHeader ?? header)) : undefined
    const usdAtStart = await step(sessionUsd($))
    let fromQueue = false
    // MOD-92: the point of no return. Stopped before it (an abort, the budget), nothing has started and nothing is written.
    s?.commit()
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
      if (held) {
        fromQueue = true
        $.ui.toast(`${label} started after ${waitedMinutes(held.at, t)} min in queue`)
      }
    }

    const classifierTier = !adhoc && attempt === 1 ? (await storeGet<{ classifier?: Tier }>($, K.classifier(task, await cardRepo($, other?.path ?? p.repo))))?.classifier : undefined
    const rec: HereRecord = {
      ...(await ownerFields($, other?.path)),
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
    rateHeld = undefined // MOD-56: the brain dispatched again
    if (adhoc) await storeSet($, K.adhoc, [...((await storeGet<AttemptRecord[]>($, K.adhoc)) ?? []), rec].slice(-200))
    else await saveAttempts($, { task, repo: other?.path ?? p.repo }, [...records, rec])
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
      ...(other ? { repo: other.path } : {}),
    }
    // MOD-94 (#159): the worker counts from this process's memory too, should the store refuse its record
    if (!adhoc) remember(spawn)
    await storeSet($, K.spawn(key), spawn)
    // MOD-97 (#155): a briefed worker the engine starts again as an ad hoc spawn (a resume) stays that worker: its pointer, and so its brief, stand
    const resumed = adhoc && res.agentId ? await storedSpawnByAgent($, res.agentId) : undefined
    const keepsBrief = resumed !== undefined && !resumed.adhoc && !resumed.review
    if (keepsBrief) {
      resumeCalls.set(key, resumed.key)
      debug($, `${taskLabel(resumed.task, resumed.subtask)}: ${res.agentId} started again with no brief; its hand-back is judged against ${resumed.briefPath ?? 'its brief'}`)
    } else if (res.agentId) await storeSet($, K.agent(res.agentId), key)
    if (res.agentId && e.name) await storeSet($, K.name(e.name), res.agentId)
    // MOD-94 (#157): and its spawn row in the ledger is what verifies it after a reload, record or no record
    if (!adhoc) await appendLedger($, spawnRow({ ...spawn, toolUseId: key, at: t }, await sessionIdOf($)))
    // MOD-92: the start is recorded. Stopped since, the views wait for their next refresh: the hook returns now.
    if (s?.stopped) {
      debug($, `${label}: started; its views skipped (the hook was ${s.stopped === 'abort' ? 'abandoned' : 'near its budget'})`)
      return res
    }

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
    // MOD-74: a briefed worker's model is said where the person looks, once it has started
    if (!adhoc) await postStarted($, { label, task, repo: other?.path, alias, tier, attempt, budget, kind: fromQueue ? 'queue' : 'started' })
    // MOD-92: the usage read need not decide the spawn: the hook makes it once the next decision may run
    if (!s) await noteUsage($)
    return res
  } finally {
    // the slot is held by the record (and $.agent.list) from here on
    if (token !== undefined) {
      starting.delete(token)
      startingResources.delete(token)
      startingTiers.delete(token)
    }
  }
}

/** MOD-92 (#168): the agent.spawn decisions, one at a time in the order the hooks were raised (the mod's own spawns too). */
const spawnTurns = turns()

/**
 * MOD-92 (#168): a spawn decision as the hook runs it. It waits its turn behind the decisions
 * raised before it, so each sees the records, slots, queue and attempt numbers the earlier ones
 * wrote. Its signal aborting stops it at once (the hook returns; the decision's next step, or
 * the one in flight, throws, and nothing has started or been written). Its budget is watched
 * on the host clock: with DECISION_RESERVE_MS left and the subagent not yet started, it is
 * refused with one line rather than overrunning. The clock re-reads the budget when it fires,
 * since waits on `$` and `next` cost the hook nothing. `after` (the status line's walk) runs
 * once the decision has let the next one go, and a stop cuts it short.
 */
async function decideInBudget($: Host, signal: AbortSignal | undefined, remaining: () => number | undefined, id: string, decide: (s: Stopper) => Promise<AgentSpawnResult>, after: () => Promise<void>): Promise<AgentSpawnResult> {
  const s = stopper()
  if (signal?.aborted) return { deny: abortedDeny(id) }
  const onAbort = () => s.stop('abort')
  signal?.addEventListener('abort', onAbort, { once: true })
  let timer: { cancel: () => void } | undefined
  const watch = () => {
    timer = undefined
    if (s.stopped) return
    const wait = budgetDelay(remaining())
    if (wait === undefined) return
    if (wait <= 0) return s.stop('budget')
    try {
      timer = $.clock.after(wait, watch)
    } catch {
      timer = undefined
    }
  }
  watch()
  try {
    const res = await s.race(
      spawnTurns.run(async () => {
        s.check()
        return decide(s)
      }),
    )
    // outside the turn, so the next decision is not held by it; a stop (the signal, the budget) cuts it short
    if (res.deny === undefined && !s.stopped) await Promise.race([after().catch(err => debug($, `after the spawn: ${String(err)}`)), s.settled])
    return res
  } catch (err) {
    if (!isStopped(err)) throw err
    const deny = err.why === 'budget' ? outOfTimeDeny(id) : abortedDeny(id)
    debug($, deny)
    return { deny }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    timer?.cancel()
  }
}

/**
 * MOD-21: the agent.spawn hook's decision for a reviewer (a prompt that opens with its marker). Its tier is one below
 * the worker's, or reviewTier; it runs where the worker ran. It is recorded as an attempt of kind `review`, which is on
 * no ladder: no budget, no slot, no queue, no escalation. The brain's model hint gives way to the tier, as a worker's does.
 */
async function decideReview($: Host, e: SpawnEvent, marker: ReviewMarker, start: (alias: string, cwd?: string) => Promise<AgentSpawnResult>, s?: Stopper): Promise<AgentSpawnResult> {
  const step = <T>(q: Promise<T>): Promise<T> => (s ? s.race(q) : q)
  await step(loadRepoConfig($))
  const t = await step(now($))
  spawnSeq += 1
  const key = e.tool_use_id || `plugin-${t}-${spawnSeq}`
  const label = taskLabel(marker.task, marker.subtask)
  const worker = await step(spawnByAgent($, marker.worker))
  const lane = worker ? laneOf(worker) : undefined
  const before = await step(loadAttempts($, worker ?? marker.task))
  s?.check()
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
  const usdAtStart = await step(sessionUsd($))
  s?.commit()
  const res = await start(alias, cwd)
  if (res.deny !== undefined) return res
  const briefPath = worker?.briefPath ?? reviewed?.briefPath
  const rec: AttemptRecord = {
    ...(await ownerFields($, worker?.repo)),
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
  const reviewRef: TaskRef = worker ?? marker.task
  await saveAttempts($, reviewRef, [...(await loadAttempts($, reviewRef)), rec])
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
  if (!s) await noteUsage($)
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
    // MOD-92: one decision at a time, the brain's spawns and the mod's own alike (the hook passes this one's start through, untaken)
    return await spawnTurns.run(() =>
      decideSpawn($, { tool_use_id: '', ...input }, async alias => {
        const description = glyphDescription(input.description, alias)
        const r = await $.agent.spawn({ prompt: input.prompt, description, subagentType: input.subagentType, model: alias, ...(input.cwd ? { cwd: input.cwd } : {}) })
        if (r.deny !== undefined) return r
        const agentId = r.agentId ?? selfIds.get(pk) ?? (await agentList($)).find(a => !before.has(a.id) && a.description === description)?.id
        return agentId ? { ...r, agentId } : r
      }),
    )
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

/** MOD-45: the `path` a setup or init tool call carries; a non-string is kept as text so it is refused, not ignored. */
const pathOfCall = (e: unknown): string | undefined => {
  const v = (e as { path?: unknown }).path
  return v === undefined ? undefined : typeof v === 'string' ? v : String(v)
}

const PATH_PROP = { type: 'string', description: 'Optional: the absolute path of another local git checkout (the folder holding .git; ~ expanded) to check and scaffold instead of this session\'s repo; writes nothing here.' } as const

/** The input schema of the `init` and `setup` tools: an optional path. */
const SETUP_TOOL = {
  name: 'setup',
  description:
    'Checks the repo for chassis-delegation and returns what to fix; run the fixes, then call it again. When every required check holds it scaffolds the config and returns the first card to write.',
  inputSchema: { type: 'object', properties: { path: PATH_PROP }, additionalProperties: false },
} as const

const INIT_TOOL = {
  name: 'init',
  description:
    'Scaffold chassis-delegation in this repo: a card folder (agents/tasks/, or docs/cards/ in a plugin repo) with its README and a sample card, .chassis-delegation.json with its defaults, and .delegation/ in .gitignore. Never overwrites a file; says what it wrote.',
  inputSchema: { type: 'object', properties: { path: PATH_PROP }, additionalProperties: false },
} as const

export const register: Register = (on, opts) => {
  options = opts
  repoText = undefined
  repoSig = undefined
  modManifest = undefined
  repoLayer = {}
  userText = undefined
  userOpts = {}
  lockedFields = new Set()
  const first = readConfig(options, repoLayer)
  cfg = first.cfg
  resolvedNow = first.resolved
  // A (re)load starts the per-process memory over; the store keeps what must last.
  templatesLoad = undefined
  finalizing.clear()
  remembered.clear()
  spawnCache.clear()
  liveNotes.clear()
  spawnGen += 1
  posted.clear()
  commentedVerdicts.clear()

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
    // MOD-12: the brain's Agent call names no folder; a briefed worker runs where /dispatch prepared it
    const start = (alias: string, cwd?: string) => next({ ...e, model: alias, description: glyphDescription(e.description, alias), ...(cwd && cwd !== e.cwd ? { cwd } : {}) })
    const header = marker ? undefined : parseHeader(e.prompt)
    const id = marker ? taskLabel(marker.task, marker.subtask) : decisionId(header?.task, header?.subtask, findBriefPath(e.prompt))
    // MOD-92 (#168): one decision at a time, stopped by the signal, refused before the budget runs out
    const remaining = (): number | undefined => {
      try {
        return next.budget?.remainingMs
      } catch {
        return undefined
      }
    }
    return decideInBudget($, next.signal, remaining, id, s => (marker ? decideReview($, asked, marker, start, s) : decideSpawn($, asked, start, s)), () => noteUsage($))
  })

  // ---- every tool call: the worker's SubagentHandback text; denials as friction (5E) ---
  on('tool.call', async ($, e, next) => {
    await driveGuard($, e)
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
    // MOD-217: what a recorded worker writes is logged against its spawn
    if (e.agentId && out.deny === undefined) await noteWrites($, e)
    // MOD-119: a Bash call's output tells a command that repeats from one that makes progress
    if (!e.agentId && String(e.tool) === 'Bash' && out.deny === undefined && typeof e.command === 'string') {
      const r = out.result as { stdout?: unknown; stderr?: unknown } | undefined
      if (r && typeof r.stdout === 'string') driveWatch = driveOutput(driveWatch, e.command, `${r.stdout}\n${typeof r.stderr === 'string' ? r.stderr : ''}`)
    }
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

  // ---- MOD-197: the gh guard on Bash ---------------------------------------------------
  // On with the git guard. A recorded worker or reviewer may read GitHub with gh, never write
  // to it; the brain (no agentId) and ad hoc agents pass untouched.
  on('tool.call', { tool: 'Bash' }, async ($, e, next) => {
    if (!cfg.gitGuard || !e.agentId) return next(e)
    const command = typeof e.command === 'string' ? e.command : ''
    const writes = ghWrites(command)
    if (writes.length === 0) return next(e)
    const worker = await spawnByAgent($, e.agentId)
    if (!worker || worker.adhoc) return next(e)
    const deny = `gh guard: ${taskLabel(worker.task, worker.subtask)} may not run ${writes.join(', ')}; gh writes are the brain's (land, merge finish)`
    debug($, `${deny} — ${command.slice(0, 160)}`)
    return { deny }
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
      resumeCalls.delete(e.tool_use_id)
    }
    if (ran.deny !== undefined) return ran
    const result = ran.result as Record<string, unknown> | undefined
    const status = typeof result?.status === 'string' ? result.status : undefined
    const agentId = typeof result?.agentId === 'string' ? result.agentId : undefined
    // MOD-94: the store's record, else this process's memory, else the ledger spawn row
    let spawn = await handbackSpawn($, agentId, e.tool_use_id)
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
    // MOD-224: a reviewer whose spawn record is gone is matched by its block's task + attempt + sha
    if (!spawn || spawn.adhoc) {
      const taken = await orphanReview($, agentId, e.tool_use_id, text)
      if (taken !== undefined) return { ...ran, context: [...(ran.context ?? []), taken] }
    }
    // MOD-41, MOD-97 (#155): a judged worker the brain resumed in the foreground hands back its next attempt, against its brief
    if (spawn && agentId && !spawn.adhoc && !spawn.review && spawn.verdictAttempt === spawn.attempt) spawn = await resumedIfNew($, spawn, agentId, text)
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
      description: e.description,
      subagentType: e.subagent_type ?? 'general-purpose',
    }
    if (spawn && isOpen(spawn)) await postHandedBack($, spawn, text)
    const rendered = await finalize($, base, text, { tokens, model })
    // a cardless report is judged like any other (GH-1 item 2); an ad hoc no-report stays quiet
    const row = sideEffects($, rendered, base.adhoc && !(isCardless(base) && extractReport(text) !== undefined))
    await noteUsage($)
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
      const warned = costed ? await trackSpend($, costed, { agentId, ...(e.usage ? { usage: e.usage } : {}), answer: e.answer, turnId: e.turnId }) : false
      turnOf.delete(agentId)
      stepEfforts.delete(agentId)
      // the answer plus the hand-back (GH-2), read once and only for an agent the mod judges
      let said: Promise<string> | undefined
      const saidOnce = () => (said ??= workerText($, agentId, e.answer))
      // MOD-94 (#157): a hand-back whose spawn record the store refused is judged from memory, else the ledger
      let spawn = await handbackSpawn($, agentId)
      // MOD-224: a reviewer whose spawn record is gone is matched by its block's task + attempt + sha
      if ((!spawn || spawn.adhoc) && !warned) await orphanReview($, agentId, e.turnId ?? agentId, await saidOnce())
      // MOD-41: the brain resumed a worker whose last attempt was judged and not advised a resume: a hand-back at a new sha is the next attempt
      if (!warned && spawn && !spawn.adhoc && !spawn.review && spawn.verdictAttempt === spawn.attempt) spawn = await resumedIfNew($, spawn, agentId, await saidOnce())
      // a worker just told to wrap up is going on: this turn's end is not its hand-back
      if (warned) debug($, `${taskLabel(spawn?.task ?? '', spawn?.subtask ?? 'main')}: wrap-up sent; its next turn is the hand-back`)
      // An ad hoc background agent is judged into the brain's conversation only
      // when it has no header and no brief and hands back a report (GH-1
      // item 2: cardless); a foreground one gets its line from the tool.call hook.
      let row: string | undefined
      let claimed = false
      // a foreground worker's Agent result carries its verdict and any ready line (the tool.call hook)
      const foreground = spawn !== undefined && [...waiting].some(id => id === spawn?.key || resumeCalls.get(id) === spawn?.key)
      // MOD-99 (#161): a briefed background worker that ends a turn saying it waits, with no report, is waiting, not handing back
      let waitedOnly = false
      if (!warned && spawn && !spawn.adhoc && !spawn.review && !foreground && spawn.verdictAttempt !== spawn.attempt && saysWaiting(await saidOnce())) {
        waitedOnly = true
        await noteWait($, spawn, agentId)
      }
      if (!waitedOnly && !warned && spawn && spawn.verdictAttempt !== spawn.attempt && (!spawn.adhoc || isCardless(spawn))) {
        const text = await saidOnce()
        // A foreground worker's verdict lands in its Agent result's context; one
        // without a report there is left for the tool.call hook to judge.
        const hasReport = extractReport(text) !== undefined
        if (spawn.adhoc ? hasReport : !foreground || hasReport) {
          const tokens = e.usage ? e.usage.input_tokens + e.usage.output_tokens : undefined
          await postHandedBack($, spawn, text)
          clearWait(agentId)
          const rendered = await finalize($, spawn, text, { tokens })
          handbacks.delete(e.agentId)
          if (!foreground && (await claimPost($, spawn))) {
            claimed = true
            row = sideEffects($, rendered, false)
          }
        }
      }
      // a debrief agent or an eval runner the mod started (2C, 2D)
      await onRunnerComplete($, agentId, saidOnce)
      // MOD-12: a worker's slot may be free now (2F): the row says which queued task is ready; the brain spawns it
      const ready = foreground ? [] : await readyRows($, agentId)
      // MOD-64: what is appended is what the verdict tool returns; an empty text (silent) is still recorded, so the tool does not wait on it
      if (claimed && spawn) await storeSet($, K.postedRow(await attemptKey($, spawn)), [...(row !== undefined ? [row] : []), ...ready].join('\n'))
      if (row !== undefined || ready.length > 0) {
        const text = [...(row !== undefined ? [row] : []), ...ready].join('\n')
        await appendRow($, text)
        // MOD-15: the verdict wakes the brain as a turn of its own (a foreground worker's rides its Agent result: no row here)
        // MOD-35: not for a task already on the default branch: its next=accept is stale; a `ready:` line still wakes
        if (row !== undefined && spawn && (await alreadyMerged($, spawn, false, true))) {
          debug($, `wake skipped: ${taskLabel(spawn.task, spawn.subtask)} already merged`)
          await wakeBrain($, '', undefined, ready.join('\n'))
        } else if (row !== undefined) await wakeBrain($, row, spawn, ready.join('\n'))
        else await wakeBrain($, '', undefined, ready.join('\n'))
      }
      // idle counts from the last turn of either loop
      if (!inTurn) armIdle($)
    } else {
      inTurn = false
      turnOpen = false
      brainWarnedThisTurn = false
      // MOD-48: the turn's calls take its input + cache-read tokens; the next turn starts a new watch
      if (e.usage && driveTurnCalls > 0) {
        const calls = driveTurnCalls
        const t = e.usage.input_tokens + (e.usage.cache_read_input_tokens || 0)
        await updateDrive($, r => driveTurn(r, t, calls))
      }
      driveTurnCalls = 0
      driveWatch = emptyWatch()
      // MOD-201: a flagged prompt and no land, land_plan or card call since: the lead goes up
      if (landPending && cfg.landNudge) {
        landPending = undefined
        landLine = nudgeLine('prompt', cfg.landAuto)
        redraw($)
      }
      await freshSessionGuard($)
      // GH-113: the brain's own turn, priced apart from the workers'
      if (e.usage) {
        const u = e.usage
        await updateBrain($, keepDrive(r => brainTurn(r, u)))
      }
      armIdle($)
      await flushWakes($)
    }
    await noteUsage($)
    return out
  })

  // ---- turn.step: a worker steps at the effort its tier (or its card) names (MOD-13) ----
  on('turn.step', async function* ($, e, next) {
    // MOD-62: a main-loop step (no agentId) carries every row appended before it; a subagent's step never counts
    if (!e.agentId && turnOpen) for (const h of heldWakes) h.read = true
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
    turnOpen = true
    cancelIdle()
    return next(e)
  })

  // ---- prompt.submit: a correction counts as friction (5E) ------------------------------
  on('prompt.submit', async ($, e, next) => {
    // MOD-15: the mod's own wake-up is not the person's correction
    const ours = e.origin?.kind === 'plugin' && e.origin.name === PLUGIN
    if (!ours && isCorrection(e.text)) void noteFriction($, { kind: 'correction', detail: e.text.slice(0, 200), at: await now($) })
    // MOD-201: the person's next prompt clears a shown line; one that describes work is remembered until the turn ends
    if (!ours) {
      const had = landLine !== undefined
      landLine = undefined
      landPending = cfg.landNudge && describesWork(e.text) ? { text: e.text.slice(0, 80), at: await now($) } : undefined
      if (had) redraw($)
    }
    return next(e)
  })

  // ---- session.send: a message to a failed worker is its resume -------------------
  on('session.send', async ($, e, next) => {
    const ours = e.origin.kind === 'plugin' && e.origin.name === PLUGIN
    if (e.agentId !== undefined || !(e.origin.kind === 'model' || ours)) return next(e)
    const to = e.to as unknown
    const address = typeof to === 'string' ? to : (to as { agentId?: string } | undefined)?.agentId
    if (!address) return next(e)
    const target = await resumeTarget($, address)
    const agentId = target?.agentId ?? (await storeGet<string>($, K.agent(address)) ? address : await storeGet<string>($, K.name(address)))
    // MOD-57: every delivered message to an agent is noted (id and time), whether or not it records a new attempt
    const nx = async (x: typeof e) => {
      const out = await next(x)
      if (out.isDelivered) {
        messaged.set(agentId ?? address, { seq: ++wakeSeq, at: await now($) })
        clearWait(agentId ?? address) // MOD-99: a resumed worker's next wait speaks again
      }
      return out
    }
    if (!target) return nx(e)
    if (target.deny !== undefined) return { isDelivered: false, reason: target.deny }
    const out = await nx(e)
    if (!out.isDelivered) return out
    await recordResume($, target.spawn, target.records, target.agentId)
    return out
  })

  // ---- tool.call on SendMessage: a resume the host did not announce as session.send (MOD-176) ----
  on('tool.call', { tool: 'SendMessage' }, async ($, e, next) => {
    const to = (e as unknown as { to?: unknown }).to
    if (typeof to !== 'string' || !to) return next(e)
    const target = await resumeTarget($, to)
    if (!target) return next(e)
    if (target.deny !== undefined) return { deny: target.deny }
    const ran = await next(e)
    if (ran.deny !== undefined || ran.isError === true) return ran
    // session.send records the resume when the host fires it; only a send it did not record is recorded here, so a resume counts once
    const after = await spawnByAgent($, target.agentId)
    if (after && after.attempt === target.spawn.attempt) await recordResume($, target.spawn, target.records, target.agentId)
    return ran
  })

  // ---- session.start: the commands and tools, the repo file, agent types, probes -------
  on('session.start', async ($, e, next) => {
    // MOD-128: the host status line is retired; this clears a line an earlier version pinned
    try {
      $.ui.status(undefined)
    } catch {
      // a view only
    }
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
      await $.command.register({ name: 'delegation', description: 'Delegation state; "setup" checks this repo and scaffolds it; "init" is the bare scaffold', argumentHint: '[setup [path]|init [path]|update|dashboard|land <type> <title> [--dry-run]|tree <n>|config [<field> [<value>]]|accept <id> [note]|merge <id> [--finish [--discard]]]' })
    } catch (err) {
      debug($, `/delegation not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: DISPATCH_TOOL.name, description: DISPATCH_TOOL.description, inputSchema: DISPATCH_TOOL.inputSchema })
    } catch (err) {
      debug($, `the dispatch tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: VERDICT_TOOL.name, description: VERDICT_TOOL.description, inputSchema: VERDICT_TOOL.inputSchema })
    } catch (err) {
      debug($, `the verdict tool was not registered: ${String(err)}`)
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
    try {
      await $.tool.register({ name: MERGE_TOOL.name, description: MERGE_TOOL.description, inputSchema: MERGE_TOOL.inputSchema })
    } catch (err) {
      debug($, `the merge tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: LAND_TOOL.name, description: LAND_TOOL.description, inputSchema: LAND_TOOL.inputSchema })
    } catch (err) {
      debug($, `the land tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: LAND_PLAN_TOOL.name, description: LAND_PLAN_TOOL.description, inputSchema: LAND_PLAN_TOOL.inputSchema })
    } catch (err) {
      debug($, `the land_plan tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: TREE_IMPORT_TOOL.name, description: TREE_IMPORT_TOOL.description, inputSchema: TREE_IMPORT_TOOL.inputSchema })
    } catch (err) {
      debug($, `the tree_import tool was not registered: ${String(err)}`)
    }
    try {
      await $.tool.register({ name: TREE_TOOL.name, description: TREE_TOOL.description, inputSchema: TREE_TOOL.inputSchema })
    } catch (err) {
      debug($, `the tree tool was not registered: ${String(err)}`)
    }
    // MOD-28: the load. The templates are read here, once, with the code that renders them.
    await loadedTemplates($)
    // MOD-89: a new session counts its own refused writes, and starts with the store pruned
    refusedWrites = { count: 0, last: '' }
    // MOD-117: the bare per-task keys move to their repo's key before the prune walks them
    await migrateTaskKeys($, true)
    await pruneStore($, 'start')
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
    try {
      await foldRation($, (e as unknown as { rateLimits?: readonly HostLimit[] }).rateLimits)
    } catch (err) {
      debug($, `ration not folded: ${String(err)}`)
    }
    await noteUsage($)
    return next(e)
  })

  // ---- /dispatch and the dispatch tool: two doors, one function (2A) --------------
  on('command.run', { command: 'dispatch' }, async ($, e) => ({ text: await runDispatch($, parseDispatchArgs(e.args)) }))
  // The literal is DISPATCH_TOOL_NAME, written out so the validator reads it; `as never` because the
  // declared tool-name union (built-ins + the MCP servers connected at the last load) does not hold a plugin's own tool.
  on('tool.call', { tool: 'mcp__chassis-delegation__dispatch' as never }, async ($, e) => (landSeen($, 'dispatch'), { result: await runDispatch($, parseDispatchTool(e as unknown as Record<string, unknown>)) }))

  // ---- /delegation [init] and the init tool: one function (5B) ----------------------
  on('command.run', { command: 'delegation' }, async ($, e) => {
    const arg = e.args.trim()
    if (arg === 'init' || arg.startsWith('init ')) return { text: await runInit($, arg.slice(4)) }
    if (arg === 'setup' || arg.startsWith('setup ')) return { text: await runSetup($, false, arg.slice(5)) }
    if (arg === 'update') return { text: await runUpdate($) }
    if (arg === 'debrief') return { text: await runDebrief($) }
    if (arg === 'debrief ingest' || arg.startsWith('debrief ingest ')) return { text: await runDebriefIngest($, arg.slice('debrief ingest'.length)) }
    if (arg === 'debrief apply' || arg.startsWith('debrief apply ')) return { text: await runDebriefApply($, arg.slice('debrief apply'.length)) }
    if (arg === 'debrief post' || arg.startsWith('debrief post ')) return { text: await runDebriefPost($, arg.slice('debrief post'.length)) }
    if (arg === 'lesson' || arg.startsWith('lesson ')) return { text: await runLesson($, arg.slice('lesson'.length)) }
    if (arg === 'config' || arg.startsWith('config ')) return { text: await runConfig($, arg.slice('config'.length)) }
    if (arg === 'land' || arg.startsWith('land ')) return { text: await runLand($, arg.slice('land'.length)) }
    if (arg === 'tree import' || arg.startsWith('tree import ')) return { text: await treeImportWith($, parseTreeImportArgs(arg.slice('tree import'.length))) }
    if (arg === 'tree' || arg.startsWith('tree ')) return { text: await treeWith($, arg.slice('tree'.length).trim()) }
    if (arg === 'ration') return { text: await rationReportText($) }
    if (arg === 'accept' || arg.startsWith('accept ')) return { text: await acceptTask($, arg.slice(6)) }
    if (arg === 'merge' || arg.startsWith('merge ')) return { text: await runMerge($, parseMergeArgs(arg.slice('merge'.length))) }
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
      return { text: [`This screen does not show a mod's panes (${why}), so here is the dashboard as text. In Claude Code in a terminal, /delegation dashboard opens it as a live pane.`, '', dashboardText(view), ...driveLines(await readDrive($))].join('\n') }
    }
    if (arg === '' || arg === 'status') return { text: await statusReport($) }
    return { text: 'usage: /delegation [setup|init|update|debrief|dashboard|ration|land <type> <title>|tree <n>|tree import <file>|lesson <domain> [text]|config [<field> [<value>]]|accept <id> [note]|merge <id> [--finish]]' }
  })
  on('tool.call', { tool: 'mcp__chassis-delegation__card' as never }, async ($, e) => (landSeen($, 'card'), { result: await runCard($, e as unknown as Record<string, unknown>) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__verdict' as never }, async ($, e) => (landSeen($, 'verdict'), { result: await runVerdict($, e as unknown as Record<string, unknown>) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__init' as never }, async ($, e) => ({ result: await runInit($, pathOfCall(e)) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__setup' as never }, async ($, e) => ({ result: await runSetup($, true, pathOfCall(e)) }))
  // MOD-75: the merge tool, the command's second door
  on('tool.call', { tool: 'mcp__chassis-delegation__land' as never }, async ($, e) => (landSeen($, 'land'), { result: await landWith($, parseLandTool(e as unknown as Record<string, unknown>)) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__land_plan' as never }, async ($, e) => (landSeen($, 'land_plan'), { result: await planWith($, parsePlan(e)) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__tree_import' as never }, async ($, e) => (landSeen($, 'land_plan'), { result: await treeImportWith($, parseTreeImportTool(e as unknown as Record<string, unknown>)) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__tree' as never }, async ($, e) => ({ result: await treeWith($, (e as unknown as Record<string, unknown>).issue) }))
  on('tool.call', { tool: 'mcp__chassis-delegation__merge' as never }, async ($, e) => (landSeen($, 'merge'), { result: await runMerge($, parseMergeTool(e as unknown as Record<string, unknown>)) }))

  // ---- GH-112: the band above the prompt and the dashboard pane ------------------------
  // MOD-133: the ration bar lives here (the footer row is not drawn on every client); dashboardBand adds the worker line.
  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)
    try {
      const ration = await rationPane($)
      const view = cfg.dashboardBand ? (await liveModel($)).view : undefined
      const live = view && isActive(view) ? view : undefined
      const nudge = cfg.landNudge ? (landLine ?? parentLine) : undefined
      if (!ration && !live && !nudge) return next(e)
      const p = { surface: e.surface, t: $.ui.resolve(e) } as PaneTable
      const scheme = pickScheme(e)
      const details = () => void $.ui.open({ id: DASH_PANE, title: 'Delegation', focus: true })
      if (live) return bandTree(p, live, scheme, e.props.bodyColumns, details, ration, nudge) as never
      if (ration) return rationBandTree(p, ration, scheme, details, nudge) as never
      return nudgeBandTree(p, nudge!, scheme) as never
    } catch (err) {
      debug($, `band not drawn: ${String(err)}`)
      return next(e)
    }
  })
  on('ui.render', { component: 'Pane', requestId: DASH_PANE }, async ($, e, next) => {
    try {
      const { view, since, records, running, waits, tierHeld } = await liveModel($)
      const mine = sessionRecords(records, since, await ownerFields($))
      const here0 = await sessionRootOf($)
      const items: BandItem[] = [
        ...running.map((r): BandItem => ({ kind: 'running', task: withRepoName(r.label, r.repo, here0), tier: r.tier, alias: r.alias, at: r.at, phase: 'building' })),
        ...(await readQueue($)).map((q, i): BandItem => {
          const task = taskLabel(q.task, q.subtask ?? 'main')
          // MOD-24: a row waiting for a resource carries it, and who holds it; a row waiting for a slot carries nothing
          const wait = waits.get(task)
          // MOD-131 (#219): a row held by its own tier's cap, with the total having room, names the tier
          const slotTier = tierHeld.get(task)
          return { kind: 'queued', task: withRepoName(task, q.repo, here0), position: i + 1, ...(wait ? { waits: wait } : {}), ...(slotTier && !wait ? { slotTier } : {}) }
        }),
      ]
      const p = { surface: e.surface, t: $.ui.resolve(e) } as PaneTable
      const blocks = blocksFor({ current: metricsFromRecords(mine, since), history: [metricsFromRecords(mine, since)], rateLimits: rateLimitsShown(), driveLines: driveLines(await readDrive($)) })
      const ration = await rationPane($)
      return paneTree(p, { blocks, open: openItemLines(items, view.now, !cfg.wakeOnVerdict, glyphOf), columns: e.props.bodyColumns, live: view, scheme: pickScheme(e), ...(ration ? { ration } : {}) }, () => void $.ui.close({ id: DASH_PANE })) as never
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
      section = composeSection(await snapshot($), posture, !cfg.wakeOnVerdict)
    } catch (err) {
      debug($, `delegation state section not built: ${String(err)}`)
      return out
    }
    const rest = out.sections.filter(x => x.id !== SECTION_ID)
    return section ? { ...out, sections: [...rest, section] } : rest.length === out.sections.length ? out : { ...out, sections: rest }
  })
}
