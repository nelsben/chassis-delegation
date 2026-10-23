// Test world for the hook tests: every `$` call the module makes is answered
// here from memory and recorded, so a test can read what the mod did.
import type { On } from 'claude-code'
import { mock, type MockClock } from 'claude-code/testing'

export const ROOT = '/repo/acme-app'
export const SCRATCH = '/s/scratchpad'
export const TMP = '/tmp/td'
export const HOME = '/home/u'
export const NOW = 1_000_000

export type Run = { argv: string[]; cwd?: string; env?: Record<string, string>; stdin?: string }
export type RunAnswer = { exitCode: number; stdout: string; stderr?: string }

export type World = {
  /** `$.store.keys()` calls (GH-112: the dashboard's records cache). */
  storeKeyReads: number
  store: Map<string, unknown>
  files: Map<string, string>
  /** MOD-28: every path `$.fs.read` was asked for, in order (a test reads which files the mod read, and how often). */
  reads: string[]
  /** MOD-22: the modification time `$.fs.stat` and `$.fs.list` answer for a file (default 0); a test moves it to make a file read as changed. */
  mtimes: Map<string, number>
  /** MOD-22: folders outside the repo the world lists as a tree: every file under one in `files` is in its listing. A test adds one to make a folder appear. */
  trees: Set<string>
  /** MOD-22: folders `$.fs.list` refuses (a permission error), though they exist. */
  unreadable: Set<string>
  runs: Run[]
  notices: string[]
  statuses: (string | undefined)[]
  toasts: string[]
  logs: string[]
  /** `$.ui.log` lines sent to the debug log (`{ to: 'debug' }`); `logs` holds every line. */
  debugLogs: string[]
  appended: { type: string; text: string; agentId?: string }[]
  sent: { to: unknown; text: string }[]
  spawns: Record<string, unknown>[]
  commands: string[]
  /** The session cost `session.usage` reports; a test moves it to give an attempt a cost. */
  usd: number
  /** MOD-48: the context `session.usage` reports. */
  context: { window: number; percent: number }
  /** `$.state` values, keyed `<plugin>.<key>`. */
  state: Map<string, unknown>
  /** What `$.agent.list()` answers; with `listAgents` each spawn adds itself as running. */
  agents: { id: string; type: string; description: string; status: string; spawnedBy?: string }[]
  /** Tools the mod registered (`$.tool.register`), by short name. */
  tools: string[]
  /** The `instructions` each `session.compact` reached the engine with. */
  compactions: (string | undefined)[]
  /** The mocked clock: `advance` fires the mod's `$.clock.after` timers. */
  clock: MockClock
  /** MOD-72: the ms of each $.clock.sleep the mod made. */
  clockSleeps: number[]
  /** Pane ids the mod opened (`$.ui.open`), in order. */
  opened: string[]
  /** Pane ids the mod closed (`$.ui.close`). */
  closed: string[]
  /** `$.ui.invalidate` calls (the band's elapsed-time tick). */
  invalidations: number
  /**
   * What `$.session.messages({ agentId })` answers per agent: its transcript
   * rows (SessionMessage); an id with none answers `{ deny }`, as the engine does
   * for a conversation it cannot read. A test may set or replace one mid-run.
   */
  transcripts: Map<string, unknown[]>
  /** MOD-38: what `$.session.messages({})` (the main conversation) answers; empty unless a test sets it. */
  mainTranscript: unknown[]
  /** The turn ids the mod ended with `$.turn.abort` (GH-106). */
  aborted: string[]
  /** What `$.session.model()` answers (GH-113); a test sets it to put a fable or opus brain in the seat. */
  model: string
  /**
   * MOD-12 (#22): who raised each spawn, by the agent id it started: `engine` for
   * the brain's own Agent call (the test's `$`), the plugin's name when a plugin
   * hook called `$.agent.spawn` (the kit's `next.origin`, read at the bottom).
   */
  spawnedBy: Map<string, string>
  /** MOD-13: the `turn.step` requests that reached the engine, with the effort they carried after the mod's hooks (the bottom of the chain). */
  steps: { agentId?: string; effort?: unknown }[]
  /**
   * MOD-15: the prompts the mod submitted with `$.prompt.submit` (a turn of the
   * brain's own once the session is idle), with the origin the engine would
   * stamp: `{ kind: 'plugin', name }`, and `asUser: true` when it asked to be
   * read as the person's own words.
   */
  submitted: { text: string; origin?: unknown }[]
  /** MOD-117: what `$.session.root()` and `$.session.cwd()` answer (default ROOT); a test moves it to run a second repo against the same store. */
  root: string
}

export type WorldOptions = {
  files?: Record<string, string>
  /** MOD-22: folders that exist and list as a tree of the `files` under them (World.trees). */
  trees?: string[]
  dirs?: Record<string, string[]>
  store?: Record<string, unknown>
  /** What a command answers; a promise holds it up (MOD-20: a gate that takes a while, so two verifiers can overlap). */
  run?: (argv: string[]) => RunAnswer | undefined | Promise<RunAnswer | undefined>
  classify?: string
  agentId?: string
  skip?: string[]
  sessionId?: string
  /** Spawns list themselves in `$.agent.list()` as running (a test flips `status`). */
  listAgents?: boolean
  /** A spawn the engine refuses: return a reason to answer `{ deny }` (GH-107: a transient refusal at the drain). */
  spawnDeny?: (e: Record<string, unknown>) => string | undefined
  /** `$.ui.open` answers `isPlaced: false` with this reason: a screen that places no panes. */
  panesUnplaced?: string
  /** Agents' transcripts for `$.session.messages({ agentId })` (World.transcripts). */
  transcripts?: Record<string, unknown[]>
  /** The main conversation's rows (World.mainTranscript). */
  mainTranscript?: unknown[]
  /** What `$.session.model()` answers (GH-113); default a sonnet brain. */
  model?: string
  /** MOD-21: reading hooks/templates/review.md fails (ENOENT), as it does when the mod is installed without it. */
  noReviewTemplate?: true
  /** MOD-28: reading hooks/templates/debrief.md fails (ENOENT) too. */
  noDebriefTemplate?: true
  /** MOD-28: and so does hooks/templates/brief.md. */
  noBriefTemplate?: true
  /** MOD-66: the text reading <plugin root>/.claude-plugin/plugin.json answers (the manifest's option defaults). */
  manifest?: string
}

const RESOLVED: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

const TEMPLATE = 'Work in {{worktree}} on {{branch}}; card {{cardPath}}.\n\n{{body}}'
/** MOD-21: the reviewer prompt the mod builds from hooks/templates/review.md (a stand-in: an engine test cannot read the file). */
export const REVIEW_TEMPLATE = [
  'Review {{id}} attempt {{attempt}}/{{budget}}: read the brief {{brief}}, the report and the diff at {{sha}} in {{worktree}} (base {{base}}).',
  'Report: {{report}}',
  'Hand-back:',
  '{{handback}}',
  'Edit nothing. End with [[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N]]',
].join('\n')

/** MOD-28: the debrief instructions the mod loads from hooks/templates/debrief.md (a stand-in, as the two above). */
export const DEBRIEF_TEMPLATE = '# Debrief (stand-in)\n\nWrite one JSON file under <root>/.delegation/debriefs/ with a mod_findings list.'

export function world(on: On, options: WorldOptions = {}): World {
  const w: World = {
    store: new Map(Object.entries(options.store ?? {})),
    files: new Map(Object.entries(options.files ?? {})),
    reads: [],
    mtimes: new Map(),
    trees: new Set(options.trees ?? []),
    unreadable: new Set(),
    runs: [],
    notices: [],
    statuses: [],
    toasts: [],
    logs: [],
    debugLogs: [],
    appended: [],
    sent: [],
    spawns: [],
    commands: [],
    usd: 1.5,
    context: { window: 200000, percent: 12 },
    state: new Map(),
    agents: [],
    tools: [],
    compactions: [],
    clock: undefined as unknown as MockClock,
    clockSleeps: [],
    opened: [],
    closed: [],
    invalidations: 0,
    storeKeyReads: 0,
    transcripts: new Map(Object.entries(options.transcripts ?? {})),
    mainTranscript: options.mainTranscript ?? [],
    aborted: [],
    model: options.model ?? 'claude-sonnet-5-5',
    spawnedBy: new Map(),
    steps: [],
    submitted: [],
    root: ROOT,
  }
  const dirs = new Map(Object.entries(options.dirs ?? {}))
  let spawnCount = 0
  const hook = (name: string, fn: (e: never) => unknown) => {
    if (options.skip?.includes(name)) return
    ;(on as unknown as (n: string, h: unknown) => void)(name, ($: unknown, e: never) => fn(e))
  }

  // MOD-72: every $.clock.sleep the mod makes is recorded (the host counts one against a hook's budget)
  const recording = ((n: string, h: (...a: unknown[]) => unknown) =>
    (on as unknown as (n: string, h: unknown) => void)(n, n === 'clock.sleep' ? (($: unknown, e: { ms?: number }) => (w.clockSleeps.push(e?.ms ?? 0), h($, e))) : h)) as unknown as typeof on
  w.clock = mock.clock(recording, { now: NOW })
  mock.env(on, { TMPDIR: TMP, HOME, PATH: '/usr/local/bin:/usr/bin' })
  hook('store.get', (e: { key: string }) => ({ value: w.store.get(e.key) }))
  hook('store.set', (e: { key: string; value: unknown }) => (w.store.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }))
  hook('store.delete', (e: { key: string }) => (w.store.delete(e.key), { value: undefined }))
  hook('store.keys', () => ((w.storeKeyReads += 1), { value: [...w.store.keys()] }))
  hook('session.root', () => ({ value: w.root }))
  hook('session.cwd', () => ({ value: w.root }))
  hook('session.model', () => ({ value: w.model }))
  hook('session.id', () => ({ value: options.sessionId ?? 'sess-1' }))
  hook('session.usage', () => ({ value: { startedAt: 0, context: w.context, rateLimits: [], cost: { usd: w.usd } } }))
  // MOD-22: a folder under a tree root exists when it is the root or a file lies under it
  const underTree = (path: string) => [...w.trees].some(t => path === t || path.startsWith(`${t}/`))
  const treeDir = (path: string) => underTree(path) && (w.trees.has(path) || [...w.files.keys()].some(k => k.startsWith(`${path}/`)))
  const bytesOf = (text: string) => new TextEncoder().encode(text).length
  hook('fs.exists', (e: { path: string }) => ({ value: w.files.has(e.path) || dirs.has(e.path) || treeDir(e.path) }))
  hook('fs.stat', (e: { path: string }) => {
    const text = w.files.get(e.path)
    if (text !== undefined) return { value: { kind: 'file', size: bytesOf(text), mtimeMs: w.mtimes.get(e.path) ?? 0, isLink: false } }
    if (dirs.has(e.path) || treeDir(e.path)) return { value: { kind: 'dir', size: 0, mtimeMs: 0, isLink: false } }
    // the engine rejects a missing path with ENOENT; a thrown hook would read as "no implementation", so the hook denies with the reason
    return { deny: `ENOENT: no such file or directory, stat '${e.path}'` }
  })
  hook('fs.read', (e: { path: string; as?: string }) => {
    w.reads.push(e.path)
    const text =
      w.files.get(e.path) ??
      (e.path.endsWith('/.claude-plugin/plugin.json') ? options.manifest : undefined) ??
      (e.path.endsWith('/templates/brief.md') && !options.noBriefTemplate
        ? TEMPLATE
        : e.path.endsWith('/templates/review.md') && !options.noReviewTemplate
          ? REVIEW_TEMPLATE
          : e.path.endsWith('/templates/debrief.md') && !options.noDebriefTemplate
            ? DEBRIEF_TEMPLATE
            : undefined)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    // `{ as: 'bytes' }` answers the file's UTF-8 bytes as `{ base64 }`, as the engine does
    if (e.as === 'bytes') return { value: { base64: btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join('')) } }
    return { value: text }
  })
  hook('fs.write', (e: { path: string; text: string }) => (w.files.set(e.path, e.text), { value: undefined }))
  hook('fs.list', (e: { path: string }) => {
    if (w.unreadable.has(e.path)) throw new Error(`EACCES: ${e.path}`)
    const listed = dirs.get(e.path)
    if (!listed && treeDir(e.path)) {
      // MOD-22: a tree folder lists the files directly under it and a dir entry for each folder below
      const below = [...w.files.keys()].filter(k => k.startsWith(`${e.path}/`)).map(k => k.slice(e.path.length + 1))
      const entries = new Map<string, { name: string; kind: string; size: number; mtimeMs: number; isLink: boolean }>()
      for (const rel of below) {
        const [head = '', ...rest] = rel.split('/')
        if (rest.length > 0) entries.set(head, { name: head, kind: 'dir', size: 0, mtimeMs: 0, isLink: false })
        else entries.set(head, { name: head, kind: 'file', size: bytesOf(w.files.get(`${e.path}/${head}`) ?? ''), mtimeMs: w.mtimes.get(`${e.path}/${head}`) ?? 0, isLink: false })
      }
      return { value: [...entries.values()] }
    }
    if (!listed) throw new Error(`ENOENT: ${e.path}`)
    // a file written under a listed folder shows up in it (GH-111: the card tool writes, then dispatches)
    const written = [...w.files.keys()].filter(k => k.startsWith(`${e.path}/`) && !k.slice(e.path.length + 1).includes('/')).map(k => k.slice(e.path.length + 1))
    const names = [...new Set([...listed, ...written])]
    return { value: names.map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })) }
  })
  hook('process.run', async (e: { argv: string[]; init?: { cwd?: string; env?: Record<string, string>; stdin?: string } }) => {
    w.runs.push({ argv: [...e.argv], cwd: e.init?.cwd, env: e.init?.env, stdin: e.init?.stdin })
    // MOD-35: an unanswered "is this sha on origin/main" reads as not merged (MOD-4's retire check, and the wake's skip rule); every other unanswered command exits 0
    const unmerged = e.argv[3] === 'merge-base' && e.argv[4] === '--is-ancestor' && e.argv[e.argv.length - 1] === 'origin/main'
    // MOD-72: a `sleep` process (the mod's budget-free wait) takes its seconds on the test clock unless the test answers it
    const sleeps = e.argv[0] === 'sleep' ? async () => (await w.clock.sleep(Number(e.argv[1]) * 1000), { exitCode: 0, stdout: '' }) : undefined
    const answer = (await options.run?.([...e.argv])) ?? (sleeps ? await sleeps() : { exitCode: unmerged ? 1 : 0, stdout: '' })
    return { value: { exitCode: answer.exitCode, stdout: answer.stdout, stderr: answer.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  hook('model.classify', () => ({ value: options.classify }))
  hook('agent.list', () => ({ value: w.agents.map(a => ({ ...a })) }))
  // the main conversation is empty here; an agent's is its transcript, else a deny
  hook('session.messages', (e: { agentId?: string }) => {
    if (e.agentId === undefined) return { value: JSON.parse(JSON.stringify(w.mainTranscript)) }
    const rows = w.transcripts.get(e.agentId)
    return { value: rows ? JSON.parse(JSON.stringify(rows)) : { deny: `no conversation for ${e.agentId}` } }
  })
  hook('ui.notice', (e: { text?: string }) => (e.text !== undefined && w.notices.push(e.text), { value: undefined }))
  hook('ui.status', (e: { text?: string }) => (w.statuses.push(e.text), { value: undefined }))
  hook('ui.toast', (e: { text: string }) => (w.toasts.push(e.text), { value: undefined }))
  hook('ui.open', (e: { id: string }) => (w.opened.push(e.id), { value: options.panesUnplaced ? { isPlaced: false, reason: options.panesUnplaced } : { isPlaced: true } }))
  hook('ui.close', (e: { id: string }) => (w.closed.push(e.id), { value: undefined }))
  hook('ui.invalidate', () => ((w.invalidations += 1), { value: undefined }))
  hook('ui.log', (e: { text: string; to?: string }) => (w.logs.push(e.text), e.to === 'debug' && w.debugLogs.push(e.text), { value: undefined }))
  let stateVersion = 0
  hook('state.get', (e: { plugin: string; key: string }) => ({ value: { value: w.state.get(`${e.plugin}.${e.key}`), version: stateVersion } }))
  hook('state.set', (e: { plugin: string; key: string; value: unknown }) => {
    w.state.set(`${e.plugin}.${e.key}`, JSON.parse(JSON.stringify(e.value ?? null)))
    stateVersion += 1
    return { value: { isSet: true, version: stateVersion } }
  })
  hook('tool.register', (e: { name: string }) => (w.tools.push(e.name), { value: { tool: `mcp__chassis-delegation__${e.name}` } }))
  hook('command.register', (e: { name: string }) => (w.commands.push(e.name), { value: { command: e.name } }))
  // The kit has nothing beneath a session.append hook and refuses one that
  // answers without next: record the row, then pass it on (the plugin's call
  // then rejects with "no implementation", which the mod catches and logs).
  ;(on as unknown as (n: string, h: unknown) => void)('session.append', ($: unknown, e: { message: { type: string; content: { text: string }[] }; agentId?: string }, next: (x: unknown) => unknown) => {
    w.appended.push({ type: e.message.type, text: e.message.content.map(b => b.text).join('\n'), agentId: e.agentId })
    return next(e)
  })
  // MOD-15: the bottom of prompt.submit records what the mod submitted
  hook('prompt.submit', (e: { text: string; origin?: unknown }) => (w.submitted.push({ text: e.text, origin: e.origin }), { text: e.text }))
  hook('session.send', (e: { to: unknown; text: string }) => (w.sent.push({ to: e.to, text: e.text }), { isDelivered: true }))
  if (!options.skip?.includes('agent.spawn')) {
    ;(on as unknown as (n: string, h: unknown) => void)('agent.spawn', ($: unknown, e: Record<string, unknown>, next: { origin?: { plugin?: string } }) => {
      const refused = options.spawnDeny?.(e)
      if (refused !== undefined) return { deny: refused }
      w.spawns.push({ ...e })
      spawnCount += 1
      const alias = String(e.model ?? '')
      const agentId = options.agentId && spawnCount === 1 ? options.agentId : `agent-${spawnCount}`
      const by = next.origin?.plugin ?? 'engine'
      w.spawnedBy.set(agentId, by)
      if (options.listAgents) w.agents.push({ id: agentId, type: String(e.subagentType ?? e.subagent_type ?? 'general-purpose'), description: String(e.description ?? ''), status: 'running', ...(by !== 'engine' ? { spawnedBy: by } : {}) })
      return { model: RESOLVED[alias] ?? alias, agentId }
    })
  }
  hook('session.start', (e: { cwd: string }) => ({ cwd: e.cwd }))
  hook('turn.start', (e: { turnId: string }) => ({ turnId: e.turnId }))
  hook('turn.abort', (e: { turnId: string }) => (w.aborted.push(e.turnId), { value: undefined }))
  // a subagent's turn ending ends its run: $.agent.list() then says completed
  hook('turn.complete', (e: { answer: string; agentId?: string }) => {
    const a = w.agents.find(x => x.id === e.agentId)
    if (a) a.status = 'completed'
    return { text: e.answer }
  })
  // MOD-13: the bottom of the step chain records what it was about to send
  if (!options.skip?.includes('turn.step')) {
    ;(on as unknown as (n: string, h: unknown) => void)('turn.step', async function* (_$: unknown, e: { turnId: string; index: number; agentId?: string; effort?: unknown }) {
      w.steps.push({ ...(e.agentId ? { agentId: e.agentId } : {}), ...(e.effort !== undefined ? { effort: e.effort } : {}) })
      return { turnId: e.turnId, index: e.index, answer: '', toolUses: [], stopReason: 'end_turn', usage: null }
    })
  }
  hook('session.compact', (e: { instructions?: string; messages: unknown[] }) => (w.compactions.push(e.instructions), { messages: e.messages }))
  hook('prompt.compose', () => ({ sections: [{ id: 'intro', text: 'You are Claude Code.', scope: 'shared' }] }))
  return w
}

export function spawnInput(over: Record<string, unknown>): never {
  return {
    tool_use_id: 'toolu_01ABCDEFGH',
    prompt: 'do it',
    description: 'task',
    subagentType: 'general-purpose',
    provider: { plugin: 'engine', tier: 'core' },
    parentModel: 'claude-fable-1',
    background: true,
    fork: false,
    ...over,
  } as never
}

/** A TurnUsage (3B): the four counts and the model that answered. */
export const usage = (model: string, input: number, output: number, cacheRead = 0, cacheWrite = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: cacheRead,
  cache_creation_input_tokens: cacheWrite,
})

export function turnInput(agentId: string, answer: string, turnUsage?: ReturnType<typeof usage>, turnId = 'turn-' + agentId): never {
  return { answer, durationMs: 10, isAborted: false, turnId, agentId, reason: 'answer', ...(turnUsage ? { usage: turnUsage } : {}) } as never
}

/** A `session.compact` of the main conversation, as `/compact` raises it. */
export const compactInput = (instructions?: string): never =>
  ({ trigger: 'manual', messages: [{ role: 'user', text: 'hi', toolUses: [] }], ...(instructions !== undefined ? { instructions } : {}) }) as never

/** A `prompt.compose` render offering `tools`. */
export const composeInput = (tools: string[]): never =>
  ({ model: 'claude-fable-1', promptModel: 'claude-fable-1', surfaces: ['terminal'], tools, outputStyle: null, traits: [] }) as never

/** The main loop's turn ending (no agentId). */
export function mainTurn(answer = 'ok', turnId = 'turn-main'): never {
  return { answer, durationMs: 10, isAborted: false, turnId, reason: 'answer' } as never
}

export function agentResult(text: string, agentId = 'agent-x'): never {
  return {
    result: {
      status: 'completed',
      agentId,
      content: [{ type: 'text', text }],
      totalToolUseCount: 3,
      totalDurationMs: 1000,
      totalTokens: 1234,
      usage: { input_tokens: 1, output_tokens: 1, cache_creation_input_tokens: null, cache_read_input_tokens: null, server_tool_use: null, service_tier: null, cache_creation: null },
      prompt: 'p',
      resolvedModel: 'claude-sonnet-5-5',
    },
  } as never
}

export const sessionStart = { cwd: ROOT, surface: null, isInteractive: false } as never
export const delegationCommand = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never

/** The band's props as a surface hands them (4A). */
export const bandProps = (bodyColumns = 100, maxRows = 12) => ({ hasSurvey: false, isWorking: false, maxRows, bodyColumns, scroll: { offset: 0, bodyRows: maxRows - 1 }, view: {} })
/** The pane's props as a surface hands them (4B). */
export const paneProps = (bodyColumns = 60) => ({ title: 'Delegation', isFocused: false, bodyColumns, placement: 'dock' as const, scroll: { offset: 0, bodyRows: 60 }, view: {} })
export const commandInput = (args: string) => ({ command: 'dispatch', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

/**
 * MOD-12: the spawn block a dispatch result (or a respawn verdict) ends with,
 * `spawn: Agent` and a fenced JSON object: the Agent tool's input, verbatim.
 */
export type SpawnCall = { subagent_type: string; model: string; description: string; prompt: string }
export function spawnCallOf(text: string): SpawnCall | undefined {
  const m = /spawn: Agent\n```json\n([\s\S]*?)\n```/.exec(text)
  if (!m) return undefined
  return JSON.parse(m[1] as string) as SpawnCall
}

/**
 * MOD-12: the brain making the Agent call a spawn block names, as the engine
 * raises it: `agent.spawn` from the test's `$` (origin engine), the call's
 * fields in the engine's spelling. `over` sets the tool_use_id, cwd, ….
 */
export function brainSpawn($: { agent: { spawn: (e: never) => Promise<{ agentId?: string; model?: string; deny?: string }> } }, text: string, over: Record<string, unknown> = {}) {
  const call = spawnCallOf(text)
  if (!call) throw new Error(`no spawn block in:\n${text}`)
  return $.agent.spawn(spawnInput({ prompt: call.prompt, description: call.description, subagentType: call.subagent_type, model: call.model, ...over }))
}

/** Why the engine keeps a plugin's own subagent from that plugin's hooks (the engine types, TurnStepInput.agentId). */
export const STEPPED_PAST = 'a subagent a hook spawned through $.agent.spawn steps past that hook, as its tool calls do; every other hook sees its steps'

/**
 * MOD-12 (#22): a worker's tool call as the engine routes it. The kit runs every
 * plugin hook for any call, so this keeps the engine's documented rule the kit
 * does not model: an agent the mod itself spawned (spawnedBy chassis-delegation)
 * is stepped past by the mod's hooks, and the call never reaches them.
 */
export async function workerCall(
  $: { tool: { call: (e: never) => Promise<unknown> } },
  w: World,
  agentId: string,
  input: Record<string, unknown>,
): Promise<{ seen: true; result: { deny?: string; text?: string } } | { seen: false; why: string }> {
  if (w.spawnedBy.get(agentId) === 'chassis-delegation') return { seen: false, why: STEPPED_PAST }
  return { seen: true, result: (await $.tool.call({ ...input, agentId } as never)) as { deny?: string; text?: string } }
}

/** MOD-13: a `turn.step` request, as the engine raises it before it is sent. */
export const stepInput = (agentId: string | undefined, effort?: 'low' | 'medium' | 'high' | 'xhigh' | 'max' | number): never =>
  ({ turnId: 'turn-s', index: 0, model: 'claude-sonnet-5-5', messageCount: 3, ...(effort !== undefined ? { effort } : {}), ...(agentId ? { agentId } : {}) }) as never
