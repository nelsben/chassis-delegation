// MOD-70, MOD-73: the table of every manifest userConfig field: its group, a one-line
// plain-English summary (at most 90 characters), how its value reads (render), its scope
// (repo: the repo file may carry it; user: personal), the manifest default, its choices.
// Two node tests hold it complete both ways against the manifest.

/** The groups of `/delegation config`, in the order they print; fields the table lacks print last under {@link OTHER_GROUP}. */
export const CONFIG_GROUPS = ['Workers and models', 'Checking the work', 'Where things go', 'Debriefs', 'Evals', 'Guards and nudges for the brain', 'Display'] as const
export type ConfigGroup = (typeof CONFIG_GROUPS)[number]
export const OTHER_GROUP = 'Other'

/** Where a value came from, lowest first: the built-in, the repo file, the user options file, a /config row, a locked /config row. */
export type Source = 'default' | 'repo' | 'yours' | 'host' | 'locked'

/** How a value reads: on/off, a count, `20 min`, `6 h`, `$10`, `200K`, a map, the gate ids, a list, text, a choice, an agent type, a tier. */
export type Render = 'bool' | 'count' | 'minutes' | 'hours' | 'dollars' | 'tokens' | 'map' | 'dollarMap' | 'effortMap' | 'countMap' | 'gates' | 'list' | 'text' | 'choice' | 'agent' | 'tier'

export type TableEntry = { group: ConfigGroup; summary: string; render: Render; scope: 'repo' | 'user'; def: string | number | boolean; choices?: readonly string[] }

const ROWS_: readonly (readonly [string, ConfigGroup, string, Render, 'repo' | 'user', string | number | boolean, (readonly string[])?])[] = [
  ['tierMap', 'Workers and models', 'Which model each level of worker runs on, from economy to premium', 'map', 'repo', ''],
  ['spendByTier', 'Workers and models', 'The most dollars one worker attempt may spend, for each level', 'dollarMap', 'repo', ''],
  ['effortByTier', 'Workers and models', 'How hard a worker thinks at each level, from low to max', 'effortMap', 'repo', ''],
  ['defaultBudget', 'Workers and models', 'How many tries a task gets when its instructions do not say', 'count', 'user', 3],
  ['maxWorkers', 'Workers and models', 'How many workers may run at the same time; more wait in line', 'count', 'repo', 0],
  ['maxWorkersByTier', 'Workers and models', 'A lower limit on workers at once for each level, such as frontier 2', 'countMap', 'repo', ''],
  ['agentTypes', 'Workers and models', 'Which kind of helper agent handles each kind of task', 'map', 'repo', ''],
  ['domains', 'Workers and models', 'The kinds of task you can hand to a worker', 'list', 'repo', ''],
  ['autoEscalate', 'Workers and models', 'After a failed try, send the worker back in once without asking you', 'bool', 'user', false],
  ['probeModels', 'Workers and models', 'Once a day, check whether new models you listed are available', 'bool', 'user', false],
  ['candidateIds', 'Workers and models', 'The model ids to check for, separated by commas', 'list', 'user', ''],
  ['gateMap', 'Checking the work', 'The commands that re-run the checks a task names, so results can be trusted', 'gates', 'repo', ''],
  ['mergeCheckMap', 'Checking the work', 'A command run before a task is merged, for each check name a task lists', 'map', 'repo', ''],
  ['gateTimeoutMinutes', 'Checking the work', 'Minutes the checker and a merge let one check command run before they stop it', 'minutes', 'repo', 9],
  ['applyAmends', 'Checking the work', 'Accept a worker\'s request to add files it may or may not touch; removals ask you', 'bool', 'user', true],
  ['scopeAmends', 'Checking the work', 'When a worker\'s scope widening applies: apply, new-files, ask or within-parent', 'choice', 'repo', 'apply', ['apply', 'new-files', 'ask', 'within-parent']],
  ['review', 'Checking the work', 'Have a second, read-only agent check what a worker says it did', 'choice', 'repo', 'on-frontier', ['off', 'on', 'on-frontier']],
  ['reviewTier', 'Checking the work', 'How capable the second checker is; empty means one level below the worker', 'tier', 'repo', ''],
  ['verdictVerbosity', 'Checking the work', 'How much detail shows when a worker\'s result is judged', 'choice', 'user', 'line', ['line', 'full', 'silent']],
  ['ledgerFile', 'Checking the work', 'Keep a log of every spawn and judged attempt inside the repo', 'bool', 'user', true],
  ['baseRef', 'Checking the work', 'The branch or commit that a worker\'s changes are compared against', 'text', 'repo', ''],
  ['project', 'Debriefs', 'The GitHub board that issues filed by land are added to, as owner/number', 'text', 'repo', ''],
  ['ignore', 'Checking the work', 'Files and folders left out when checking a worker that shares your checkout', 'list', 'repo', ''],
  ['briefDir', 'Where things go', 'The folder where worker instructions are saved', 'text', 'user', ''],
  ['briefTemplate', 'Where things go', 'A file to use as the layout for worker instructions', 'text', 'repo', ''],
  ['briefExtra', 'Where things go', 'Extra lines added to every worker\'s instructions, such as a test command', 'text', 'repo', ''],
  ['briefLocal', 'Where things go', 'A private, untracked file of rules copied into every worker\'s instructions', 'text', 'repo', ''],
  ['worktreeRoot', 'Where things go', 'The folder where each worker\'s separate copy of the repo is made', 'text', 'repo', ''],
  ['cardDir', 'Where things go', 'The folder, inside the repo, that holds your task cards', 'text', 'repo', ''],
  ['autoDebrief', 'Debriefs', 'When you stop for a while, write a short write-up of what went wrong or right', 'bool', 'user', true],
  ['debriefMode', 'Debriefs', 'At a quiet stop: ask for your review note (notes) or run a helper (transcript)', 'choice', 'user', 'notes', ['notes', 'transcript']],
  ['debriefIdleMinutes', 'Debriefs', 'Minutes of quiet before the mod checks whether a write-up is due', 'minutes', 'user', 20],
  ['debriefMinNewLines', 'Debriefs', 'How much new session activity must pile up before a write-up is worth it', 'count', 'user', 25],
  ['debriefMinEvents', 'Debriefs', 'How many corrections, refusals or failures must pile up before a write-up', 'count', 'user', 5],
  ['debriefCooldownHours', 'Debriefs', 'The least number of hours between two automatic write-ups', 'hours', 'user', 6],
  ['debriefAgent', 'Debriefs', 'The kind of helper agent that writes the write-up', 'agent', 'user', 'general-purpose'],
  ['redact', 'Debriefs', 'Words, such as company or product names, hidden in anything posted publicly', 'list', 'user', ''],
  ['postFindings', 'Debriefs', 'Post debrief findings to the issue tracker: ask first, auto, or off', 'choice', 'user', 'ask', ['ask', 'auto', 'off']],
  ['autoEval', 'Evals', 'When new work lands on main and you are idle, run your test command once', 'bool', 'repo', false],
  ['evalIdleMinutes', 'Evals', 'Minutes of quiet before the mod looks for new work on main', 'minutes', 'user', 10],
  ['evalCommand', 'Evals', 'The command a helper agent runs to test new work on main', 'text', 'repo', ''],
  ['evalLive', 'Evals', 'After a clean first check, also run the costlier real-world test once a session', 'bool', 'user', false],
  ['evalLiveCommand', 'Evals', 'The command a helper agent runs for the real-world test', 'text', 'repo', ''],
  ['evalLiveMaxUsd', 'Evals', 'The most dollars one real-world test run may spend', 'dollars', 'user', 1],
  ['sessionUsdCap', 'Evals', 'No real-world test starts if it would push the session past this many dollars', 'dollars', 'user', 50],
  ['evalAgent', 'Evals', 'The kind of helper agent that runs the tests', 'agent', 'user', 'general-purpose'],
  ['gitGuard', 'Guards and nudges for the brain', 'Block commits and pushes on protected branches, so you branch first', 'bool', 'user', true],
  ['guardBranches', 'Guards and nudges for the brain', 'The protected branches, separated by commas', 'list', 'user', 'main,master'],
  ['delegateOnly', 'Guards and nudges for the brain', 'Stop the main assistant doing a worker\'s job: off, warn, or deny', 'choice', 'repo', 'warn', ['off', 'warn', 'deny']],
  ['driveWarn', 'Guards and nudges for the brain', 'Warn when the main assistant repeats or polls the same thing in a big session', 'bool', 'user', true],
  ['driveWarnTokens', 'Guards and nudges for the brain', 'How big the session must be, in tokens, before that warning shows', 'tokens', 'user', 200000],
  ['effortNudge', 'Guards and nudges for the brain', 'Say on a row when a worker hands back cards to judge, and when that is over', 'map', 'repo', ''],
  ['freshSessionTokens', 'Guards and nudges for the brain', 'Suggest a fresh session once this many tokens are in use; 0 turns it off', 'tokens', 'user', 400000],
  ['wakeOnVerdict', 'Guards and nudges for the brain', 'Start a new turn on its own when a worker\'s result has been judged', 'bool', 'user', false],
  ['landNudge', 'Guards and nudges for the brain', 'Remind the main assistant to file work you describe, and to finish a feature', 'bool', 'user', true],
  ['readyFallbackMinutes', 'Guards and nudges for the brain', 'Minutes before a waiting task is started for you if you have not started it', 'minutes', 'user', 10],
  ['waitStallMin', 'Guards and nudges for the brain', 'Minutes a worker may wait before the mod says it is stalled; 0 turns it off', 'minutes', 'user', 20],
  ['classifierSecondOpinion', 'Guards and nudges for the brain', 'In a dry run, also ask a classifier how hard a task is and show both answers', 'bool', 'user', true],
  ['dashboardBand', 'Display', 'Show a status strip above the prompt while workers are busy or waiting', 'bool', 'user', false],
  ['ration', 'Display', 'Which usage window the band\'s meter reads: seven_day, five_hour, or off', 'choice', 'user', 'seven_day', ['seven_day', 'five_hour', 'off']],
  ['rationDaily', 'Display', 'A fixed daily share of that window, in points; 0 paces the days left to the reset', 'count', 'user', 0],
  ['modelGlyphs', 'Display', 'A glyph per model on every row: alias=glyph pairs, off, or empty for the built-in set', 'text', 'user', ''],
]

/** The fields in table order. */
export const TABLE_FIELDS: readonly string[] = ROWS_.map(r => r[0])

/** Field to its entry. */
export const CONFIG_TABLE: Readonly<Record<string, TableEntry>> = Object.fromEntries(
  ROWS_.map(([f, group, summary, render, scope, def, choices]) => [f, { group, summary, render, scope, def, ...(choices ? { choices } : {}) }]),
)

/** A group's word for `/delegation config <group>`: its first word, lowercase. */
export const groupWord = (g: string): string => (g.split(' ')[0] ?? g).toLowerCase()
export const GROUP_WORDS: readonly string[] = CONFIG_GROUPS.map(groupWord)

/** Words the command reads as its own, never as a field name. */
export const RESERVED: readonly string[] = ['all', 'repo', 'default', ...GROUP_WORDS]
