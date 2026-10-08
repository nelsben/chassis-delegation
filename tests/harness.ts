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
  store: Map<string, unknown>
  files: Map<string, string>
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
  /** `$.state` values, keyed `<plugin>.<key>`. */
  state: Map<string, unknown>
  /** What `$.agent.list()` answers; with `listAgents` each spawn adds itself as running. */
  agents: { id: string; type: string; description: string; status: string }[]
  /** Tools the mod registered (`$.tool.register`), by short name. */
  tools: string[]
  /** The `instructions` each `session.compact` reached the engine with. */
  compactions: (string | undefined)[]
  /** The mocked clock: `advance` fires the mod's `$.clock.after` timers. */
  clock: MockClock
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
  /** The turn ids the mod ended with `$.turn.abort` (GH-106). */
  aborted: string[]
}

export type WorldOptions = {
  files?: Record<string, string>
  dirs?: Record<string, string[]>
  store?: Record<string, unknown>
  run?: (argv: string[]) => RunAnswer | undefined
  classify?: string
  agentId?: string
  skip?: string[]
  sessionId?: string
  /** Spawns list themselves in `$.agent.list()` as running (a test flips `status`). */
  listAgents?: boolean
  /** A spawn the engine refuses: return a reason to answer `{ deny }` (GH-107: a transient refusal at the drain). */
  spawnDeny?: (e: Record<string, unknown>) => string | undefined
  /** Agents' transcripts for `$.session.messages({ agentId })` (World.transcripts). */
  transcripts?: Record<string, unknown[]>
}

const RESOLVED: Record<string, string> = {
  haiku: 'claude-haiku-4-5',
  sonnet: 'claude-sonnet-5-5',
  opus: 'claude-opus-5-5',
}

const TEMPLATE = 'Work in {{worktree}} on {{branch}}; card {{cardPath}}.\n\n{{body}}'

export function world(on: On, options: WorldOptions = {}): World {
  const w: World = {
    store: new Map(Object.entries(options.store ?? {})),
    files: new Map(Object.entries(options.files ?? {})),
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
    state: new Map(),
    agents: [],
    tools: [],
    compactions: [],
    clock: undefined as unknown as MockClock,
    opened: [],
    closed: [],
    invalidations: 0,
    transcripts: new Map(Object.entries(options.transcripts ?? {})),
    aborted: [],
  }
  const dirs = new Map(Object.entries(options.dirs ?? {}))
  let spawnCount = 0
  const hook = (name: string, fn: (e: never) => unknown) => {
    if (options.skip?.includes(name)) return
    ;(on as unknown as (n: string, h: unknown) => void)(name, ($: unknown, e: never) => fn(e))
  }

  w.clock = mock.clock(on, { now: NOW })
  mock.env(on, { TMPDIR: TMP, HOME, PATH: '/usr/local/bin:/usr/bin' })
  hook('store.get', (e: { key: string }) => ({ value: w.store.get(e.key) }))
  hook('store.set', (e: { key: string; value: unknown }) => (w.store.set(e.key, JSON.parse(JSON.stringify(e.value))), { value: undefined }))
  hook('store.delete', (e: { key: string }) => (w.store.delete(e.key), { value: undefined }))
  hook('store.keys', () => ({ value: [...w.store.keys()] }))
  hook('session.root', () => ({ value: ROOT }))
  hook('session.cwd', () => ({ value: ROOT }))
  hook('session.id', () => ({ value: options.sessionId ?? 'sess-1' }))
  hook('session.usage', () => ({ value: { startedAt: 0, context: { window: 200000, percent: 12 }, rateLimits: [], cost: { usd: w.usd } } }))
  hook('fs.exists', (e: { path: string }) => ({ value: w.files.has(e.path) || dirs.has(e.path) }))
  hook('fs.read', (e: { path: string; as?: string }) => {
    const text = w.files.get(e.path) ?? (e.path.endsWith('/templates/brief.md') ? TEMPLATE : undefined)
    if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
    // `{ as: 'bytes' }` answers the file's UTF-8 bytes as `{ base64 }`, as the engine does
    if (e.as === 'bytes') return { value: { base64: btoa(Array.from(new TextEncoder().encode(text), b => String.fromCharCode(b)).join('')) } }
    return { value: text }
  })
  hook('fs.write', (e: { path: string; text: string }) => (w.files.set(e.path, e.text), { value: undefined }))
  hook('fs.list', (e: { path: string }) => {
    const listed = dirs.get(e.path)
    if (!listed) throw new Error(`ENOENT: ${e.path}`)
    // a file written under a listed folder shows up in it (GH-111: the card tool writes, then dispatches)
    const written = [...w.files.keys()].filter(k => k.startsWith(`${e.path}/`) && !k.slice(e.path.length + 1).includes('/')).map(k => k.slice(e.path.length + 1))
    const names = [...new Set([...listed, ...written])]
    return { value: names.map(name => ({ name, kind: 'file', size: 0, mtimeMs: 0, isLink: false })) }
  })
  hook('process.run', (e: { argv: string[]; init?: { cwd?: string; env?: Record<string, string>; stdin?: string } }) => {
    w.runs.push({ argv: [...e.argv], cwd: e.init?.cwd, env: e.init?.env, stdin: e.init?.stdin })
    const answer = options.run?.([...e.argv]) ?? { exitCode: 0, stdout: '' }
    return { value: { exitCode: answer.exitCode, stdout: answer.stdout, stderr: answer.stderr ?? '', isStdoutTruncated: false, isStderrTruncated: false } }
  })
  hook('model.classify', () => ({ value: options.classify }))
  hook('agent.list', () => ({ value: w.agents.map(a => ({ ...a })) }))
  // the main conversation is empty here; an agent's is its transcript, else a deny
  hook('session.messages', (e: { agentId?: string }) => {
    if (e.agentId === undefined) return { value: [] }
    const rows = w.transcripts.get(e.agentId)
    return { value: rows ? JSON.parse(JSON.stringify(rows)) : { deny: `no conversation for ${e.agentId}` } }
  })
  hook('ui.notice', (e: { text?: string }) => (e.text !== undefined && w.notices.push(e.text), { value: undefined }))
  hook('ui.status', (e: { text?: string }) => (w.statuses.push(e.text), { value: undefined }))
  hook('ui.toast', (e: { text: string }) => (w.toasts.push(e.text), { value: undefined }))
  hook('ui.open', (e: { id: string }) => (w.opened.push(e.id), { value: { isPlaced: true } }))
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
  hook('session.send', (e: { to: unknown; text: string }) => (w.sent.push({ to: e.to, text: e.text }), { isDelivered: true }))
  hook('agent.spawn', (e: Record<string, unknown>) => {
    const refused = options.spawnDeny?.(e)
    if (refused !== undefined) return { deny: refused }
    w.spawns.push({ ...e })
    spawnCount += 1
    const alias = String(e.model ?? '')
    const agentId = options.agentId && spawnCount === 1 ? options.agentId : `agent-${spawnCount}`
    if (options.listAgents) w.agents.push({ id: agentId, type: String(e.subagentType ?? e.subagent_type ?? 'general-purpose'), description: String(e.description ?? ''), status: 'running' })
    return { model: RESOLVED[alias] ?? alias, agentId }
  })
  hook('session.start', (e: { cwd: string }) => ({ cwd: e.cwd }))
  hook('turn.start', (e: { turnId: string }) => ({ turnId: e.turnId }))
  hook('turn.abort', (e: { turnId: string }) => (w.aborted.push(e.turnId), undefined))
  // a subagent's turn ending ends its run: $.agent.list() then says completed
  hook('turn.complete', (e: { answer: string; agentId?: string }) => {
    const a = w.agents.find(x => x.id === e.agentId)
    if (a) a.status = 'completed'
    return { text: e.answer }
  })
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
