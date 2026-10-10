// Part 2 hook tests: the dispatch tool, quiet verdicts, the clean-stop debrief,
// the eval trigger, compaction + the system prompt section, the scheduler.
// Every spawn here lands in the harness; nothing real runs.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, mainTurn, agentResult, sessionStart, commandInput, compactInput, composeInput, ROOT, SCRATCH, HOME, NOW, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'

const TOOL = 'mcp__chassis-delegation__dispatch'
const MIN = 60_000
const H = 60 * MIN
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task}`) ?? []) as Record<string, unknown>[]
const argvs = (w: { runs: { argv: string[] }[] }) => w.runs.map(r => r.argv)
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const userRows = (w: { appended: { type: string; text: string }[] }) => w.appended.filter(a => a.type === 'user').map(a => a.text)
// The rows that reached the conversation: the appended user rows live; in the kit (which
// cannot answer a plugin's own session.append) the transcript log line the mod falls back to.
const rowsOf = (w: { appended: { type: string; text: string }[]; logs: string[]; debugLogs: string[] }) => {
  const appended = userRows(w)
  if (appended.length > 0) return appended
  const debug = new Set(w.debugLogs)
  return w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: ') && !l.startsWith('chassis-delegation: refused argv'))
}
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const typeOf = (s: Record<string, unknown> | undefined) => s?.subagentType ?? s?.subagent_type

const cardFiles = () => ({ [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD })
const cardDirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
// nothing to answer: the tier comes from the built-in map (5B), no script runs
const whichOpus = (_argv: string[]): RunAnswer | undefined => undefined
// the subagent types the session offers: a backend card runs on the backend type
const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
const BRIEFS = { options: { briefDir: `${SCRATCH}/briefs` } }

describe('2A: the dispatch tool', () => {
  test('dispatch is registered as a tool at session.start, beside the command', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles(), dirs: cardDirs, run: whichOpus })
    await $.session.start(sessionStart)
    expect(w.tools).toEqual(['dispatch', 'card', 'init', 'setup'])
    expect(w.commands).toContain('dispatch')
  })

  test('a tool call with the BE-101 card produces the same text as the command (one function, two doors)', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles(), dirs: cardDirs, run: whichOpus })
    await $.session.start(sessionStart)
    const cmd = await $.command.run(commandInput('BE-101 --dry-run --scope app/billing/Rate*.ts'))
    expect(cmd.text).toContain(`2. brief ${SCRATCH}/briefs/BE-101.brief.md written`)
    w.files.delete(`${SCRATCH}/briefs/BE-101.brief.md`)
    const viaTool = await $.tool.call({ tool: TOOL, task: 'BE-101', dryRun: true, scope: 'app/billing/Rate*.ts' } as never)
    expect(resultText(viaTool)).toBe(cmd.text)
  })

  test('the full run through the tool: worktree, spawn with model omitted, the spawn hook picks the tier and records the attempt', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles(), dirs: cardDirs, run: whichOpus, agentId: 'agent-318', store: offered })
    await $.session.start(sessionStart)
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', `${ROOT}-BE-101`, 'origin/main'],
    ])
    expect(w.spawns[0]).toMatchObject({ cwd: `${ROOT}-BE-101`, model: 'opus' })
    expect(typeOf(w.spawns[0])).toBe('backend')
    expect(text).toContain('4. spawned backend agent')
    // the spawn hook recorded the attempt under the agent id the engine gave it
    expect(records(w, 'BE-101')[0]).toMatchObject({ attempt: 1, kind: 'spawn', tier: 'frontier', alias: 'opus', agentId: 'agent-318' })
    expect(text).toContain('tier=frontier → opus')
    expect(argvs(w).every(a => a[0] === 'git')).toBe(true) // no chassis script (5A)
  })

  test('a refused input answers with the refusal and runs nothing', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles(), dirs: cardDirs, run: whichOpus })
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', replay: true } as never))).toContain('refused --replay without --base <sha>')
    expect(resultText(await $.tool.call({ tool: TOOL, task: 'rm -rf /' } as never))).toBe('refused task id rm -rf /')
    expect(w.runs).toHaveLength(0)
    expect(w.spawns).toHaveLength(0)
  })
})

describe('2B: quiet verdicts', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  // 5A: a worker repo answered from memory (the sha, the branch, a clean tree at the sha,
  // the delta a/x.ts) and a red gate from the repo's gate map
  const FULL = '1234abcd'.padEnd(40, '0')
  const MB = 'b'.repeat(40)
  const verifierRun = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 1, stdout: 'a/x.ts: not formatted\n' }
    const last = argv[argv.length - 1] ?? ''
    if (argv[3] === 'rev-parse' && (last.endsWith('^{commit}') || last === 'HEAD' || last.startsWith('refs/'))) return { exitCode: 0, stdout: `${FULL}\n` }
    if (argv[3] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (argv[3] === 'merge-base' && argv[4] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (argv[3] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const RED = 'claim gate: failed — gate=pass claimed but the gate is RED at 1234abcd (exit 1)'
  const ROW = 'chassis-delegation: T-4 attempt 1/3 refuted on gate (gate=pass claimed but the gate is RED at 1234abcd (exit 1)) · sonnet · ~$0.00 · next=resume agent=agent-4'
  const FULL_FIRST = 'chassis-delegation: verdict=refuted task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=resume agent=agent-4 — SendMessage it the verifier lines below'

  test('line, the default: a background verdict is one row; the claim lines go to the debug log and $.state', { options: GM }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(rowsOf(w)).toEqual([ROW])
    expect(w.debugLogs.some(l => l.startsWith(FULL_FIRST) && l.includes(`\n${RED}`))).toBe(true)
    const last = w.state.get('chassis-delegation.lastVerdict') as { text?: string; verdict?: string }
    expect(last.verdict).toBe('refuted')
    expect(last.text?.split('\n')[0]).toBe(FULL_FIRST)
    expect(last.text).toContain(RED)
  })

  test('line: a foreground verdict adds exactly one context line', { options: GM }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n' + REPORT, 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_fg000001' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}.` })
    const ours = (r.context ?? []).filter(c => c.startsWith('chassis-delegation:'))
    expect(ours).toEqual([ROW])
    expect(w.sent).toHaveLength(0)
  })

  test('full: the multi-line row as part 1 wrote it', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT))
    const row = rowsOf(w)[0] ?? ''
    expect(rowsOf(w)).toHaveLength(1)
    expect(row.split('\n')[0]).toBe(FULL_FIRST)
    expect(row).toContain(`\n${RED}\n  | a/x.ts: not formatted`)
  })

  test('silent: no row, a toast only; the store still records the verdict', { options: { verdictVerbosity: 'silent', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT))
    expect(rowsOf(w)).toEqual([])
    expect(w.toasts).toContain(ROW)
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'refuted' })
  })

  test('silent: a foreground verdict leaves the Agent result as it was', { options: { verdictVerbosity: 'silent', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n' + REPORT, 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_fg000001' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}.` })
    expect((r.context ?? []).some(c => c.startsWith('chassis-delegation:'))).toBe(false)
    expect(w.toasts).toContain(ROW)
  })
})

describe('2F: the worker scheduler', () => {
  const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`

  test('the third briefed spawn is queued, not started; an ad hoc one never is; a worker finishing starts the head', async ($, on) => {
    const w = world(on, { listAgents: true })
    const a = await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    const b = await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const c = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003', description: 'T-3 work', subagentType: 'backend', cwd: '/w3' }))
    expect([a.agentId, b.agentId]).toEqual(['agent-1', 'agent-2'])
    expect(c.deny).toBe('queued by chassis-delegation: T-3 starts when a worker slot frees (2 live: T-1, T-2; 1 queued: T-3)')
    expect(w.spawns).toHaveLength(2)
    const queue = w.state.get('chassis-delegation.queue') as Record<string, unknown>[]
    expect(queue).toHaveLength(1)
    expect(queue[0]).toMatchObject({ task: 'T-3', prompt: brief('T-3'), description: 'T-3 work', subagentType: 'backend', cwd: '/w3' })
    // a queued spawn records no attempt (and nothing runs: the store is the ledger)
    expect(w.runs).toEqual([])
    expect(records(w, 'T-1')).toHaveLength(1)
    expect(records(w, 'T-3')).toEqual([])

    const d = await $.agent.spawn(spawnInput({ prompt: 'Find where the brief is rendered.', model: 'haiku', tool_use_id: 'toolu_D0000004' }))
    expect(d.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)

    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    expect(w.spawns).toHaveLength(4)
    expect(w.spawns[3]).toMatchObject({ prompt: brief('T-3'), cwd: '/w3', model: 'sonnet' })
    expect(typeOf(w.spawns[3])).toBe('backend')
    expect(w.toasts).toContain('started queued T-3 (waited 0 min)')
    expect(w.state.get('chassis-delegation.queue')).toEqual([])
    expect(records(w, 'T-3')[0]).toMatchObject({ attempt: 1, kind: 'spawn', verdict: 'pending', alias: 'sonnet' })
  })

  test('a slot stays full while its worker runs: a finished ad hoc agent starts nothing', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    await $.agent.spawn(spawnInput({ prompt: 'look around', model: 'haiku', tool_use_id: 'toolu_D0000004' }))
    await $.turn.complete(turnInput('agent-3', 'It is in a.ts.'))
    expect(w.spawns).toHaveLength(3)
    expect((w.state.get('chassis-delegation.queue') as unknown[]).length).toBe(1)
  })

  test('maxWorkers 1: the second briefed spawn waits', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    const second = await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    expect(second.deny).toBe('queued by chassis-delegation: T-2 starts when a worker slot frees (1 live: T-1; 1 queued: T-2)')
    expect(w.spawns).toHaveLength(1)
  })

  test('/dispatch and the tool report queued (position n) when the slots are full', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles(), dirs: cardDirs, run: whichOpus, listAgents: true, store: offered })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const viaCommand = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(viaCommand.text).toContain('4. queued (position 1) — queued by chassis-delegation: BE-101 starts when a worker slot frees (2 live: T-1, T-2; 1 queued: BE-101)')
    expect(viaCommand.text).toContain(`brief ${SCRATCH}/briefs/BE-101.brief.md · worktree ${ROOT}-BE-101 · branch agent/backend/BE-101 · queued (position 1)`)
    const viaTool = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(viaTool).toMatch(/4\. already queued since \d\d:\d\d \(position 1\)/)
    const queue = w.state.get('chassis-delegation.queue') as Record<string, unknown>[]
    expect(queue.map(q => q.task)).toEqual(['BE-101'])
    expect(queue[0]).toMatchObject({ cwd: `${ROOT}-BE-101`, subagentType: 'backend' })
    expect(w.spawns).toHaveLength(2)
  })
})

describe('2C: the clean-stop debrief', () => {
  const crumbs = (n: number) => Array.from({ length: n }, (_, i) => `{"ts":${i},"kind":"correction","detail":"x"}`).join('\n') + '\n'
  const BC = `${HOME}/.claude/harness/breadcrumbs/sess-1.jsonl`
  const DONE = `${HOME}/.claude/harness/breadcrumbs/sess-1.done`
  const SKILL = `${HOME}/.claude/commands/debrief.md`
  const NO_EVAL = { options: { autoEval: false } }

  test('20 idle minutes at a clean stop: a sonnet agent runs the debrief skill; its path is toasted; never twice', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n', [SKILL]: '# debrief' }, listAgents: true })
    await $.turn.start({ text: 'hi', turnId: 't1' })
    await $.turn.complete(mainTurn())
    await w.clock.advance(19 * MIN)
    expect(w.spawns).toHaveLength(0)
    await w.clock.advance(1 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.spawns[0]).toMatchObject({
      description: 'debrief',
      model: 'sonnet',
    })
    expect(String(w.spawns[0]?.prompt).split('\n')[0]).toBe(`Run the /debrief skill exactly as written in ${SKILL}. Session id sess-1. Write only what the skill allows.`)
    expect(String(w.spawns[0]?.prompt)).toContain('mod_findings')
    expect(typeOf(w.spawns[0])).toBe('general-purpose')
    expect(w.toasts).toContain('debrief running in the background')
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ lastAt: NOW + 20 * MIN, agentId: 'agent-1', watermark: 10, lines: 40 })
    // the spawn took the same tier decision as any spawn (caller model → sonnet)
    expect(((w.store.get('delegation.adhoc') ?? []) as Record<string, unknown>[]).at(-1)).toMatchObject({ kind: 'spawn', tier: 'standard', alias: 'sonnet', source: 'caller', agentId: 'agent-1' })

    await $.turn.complete(turnInput('agent-1', `Wrote ${HOME}/.claude/harness/debriefs/2026-10-03-mod-build.json; 2 gaps.`))
    expect(w.toasts).toContain(`debrief written: ${HOME}/.claude/harness/debriefs/2026-10-03-mod-build.json`)
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ path: `${HOME}/.claude/harness/debriefs/2026-10-03-mod-build.json` })

    await $.turn.complete(mainTurn())
    await w.clock.advance(25 * MIN)
    expect(w.spawns).toHaveLength(1) // cooldown
  })

  test('a main turn starting cancels the idle timer: never during a turn', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40) } })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.start({ text: 'next', turnId: 't2' })
    await w.clock.advance(30 * MIN)
    expect(w.spawns).toHaveLength(0)
  })

  test('a running worker holds it back', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40) }, listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard]]\nDo it.' }))
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.store.has('delegation.debrief.sess-1')).toBe(false)
  })

  test('fewer than 25 new breadcrumb lines: nothing', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(34), [DONE]: '10' } })
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
  })

  test('a debrief already ran at this watermark: not again, even past the cooldown', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(60), [DONE]: '10' }, store: { 'delegation.debrief.sess-1': { lastAt: NOW - 7 * H, watermark: 10, lines: 40 } } })
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
  })

  test('5E: no ~/.claude/commands/debrief.md: the built-in template runs, told the repo root', NO_EVAL, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
    const prompt = String(w.spawns[0]?.prompt)
    expect(prompt).toMatch(/^Run the debrief exactly as written in .*\/templates\/debrief\.md\.\n/)
    expect(prompt).toContain(`Session id sess-1. Repo root ${ROOT}.`)
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ builtIn: true, mode: 'breadcrumbs' })
    await $.turn.complete(turnInput('agent-1', `Wrote ${ROOT}/.delegation/debriefs/2026-10-03-mod-build.json`))
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ path: `${ROOT}/.delegation/debriefs/2026-10-03-mod-build.json` })
  })

  test('5E: no breadcrumb file: five corrections the mod saw are the friction signal', NO_EVAL, async ($, on) => {
    const w = world(on, { listAgents: true })
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    for (const text of ['no, the other file', 'stop', "don't push", 'actually use pnpm']) await $.prompt.submit({ text } as never)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0) // four: under debriefMinEvents (5)
    await $.turn.start({ text: 'x', turnId: 't3' })
    await $.prompt.submit({ text: 'No — revert that' } as never)
    await $.prompt.submit({ text: 'Notes are fine' } as never) // "Notes" is not "no"
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
    const prompt = String(w.spawns[0]?.prompt)
    expect(prompt).toContain('- correction: actually use pnpm')
    expect(prompt).toContain('- correction: No — revert that')
    expect(prompt).not.toContain('Notes are fine')
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ mode: 'events', lines: 5, watermark: 0 })
  })

  test('autoDebrief off: nothing', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40) } })
    await $.turn.complete(mainTurn())
    await w.clock.advance(60 * MIN)
    expect(w.spawns).toHaveLength(0)
  })
})

describe('2D: the eval trigger', () => {
  const A = 'a'.repeat(40)
  const B = 'b'.repeat(40)
  // 5E: autoEval is off unless asked for, and runs only with an evalCommand
  const EVAL = { autoDebrief: false, autoEval: true, evalCommand: 'npm run eval -- --ci' }
  const NO_DEBRIEF = { options: EVAL }
  const revParse = (sha: () => string) => (argv: string[]) => (argv[3] === 'rev-parse' ? { exitCode: 0, stdout: `${sha()}\n` } : undefined)

  test('origin/main moved and 10 idle minutes: one eval runner; never twice for a sha; its block is recorded and toasted', NO_DEBRIEF, async ($, on) => {
    let sha = A
    const w = world(on, { run: revParse(() => sha), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.spawns[0]).toMatchObject({ description: 'eval T1', model: 'sonnet' })
    const prompt = String(w.spawns[0]?.prompt)
    expect(prompt).toContain(`Run \`npm run eval -- --ci\` once in ${ROOT}`)
    expect(prompt).toContain(`[[eval v=1 tier=T1 sha=${A} total=N pass=N fail=N result=<path or none>]]`)
    expect(argvs(w)).toContainEqual(['git', '-C', ROOT, 'rev-parse', 'origin/main'])
    expect(w.store.get('delegation.eval.lastSha')).toBe(A)

    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(1)

    await $.turn.complete(turnInput('agent-1', `[[eval v=1 tier=T1 sha=${A} total=63 pass=61 fail=2 result=none]]\nfailing: EvalA.verbLed\nfailing: EvalB.noDiagnoses`))
    expect(w.toasts).toContain('T1 61/63 — see transcript')
    const evals = w.store.get('delegation.evals') as Record<string, unknown>[]
    expect(evals.at(-1)).toMatchObject({ tier: 'T1', sha: A, total: 63, pass: 61, fail: 2, result: 'none', failing: ['failing: EvalA.verbLed', 'failing: EvalB.noDiagnoses'] })
    expect(delivered(w)).toContain('chassis-delegation: eval T1 61/63 at aaaaaaaa — failing: EvalA.verbLed; EvalB.noDiagnoses')

    sha = B
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(2)
    expect(String(w.spawns[1]?.prompt)).toContain(`sha=${B}`)
    // the mod itself never ran the eval, sf, npm or anything but git
    expect(argvs(w).every(a => a[0] === 'git')).toBe(true)
  })

  test('a passing T1 toasts the count and appends nothing', NO_DEBRIEF, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.complete(turnInput('agent-1', `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`))
    expect(w.toasts).toContain('T1 63/63')
    expect(rowsOf(w).some(r => r.includes('eval T1'))).toBe(false)
  })

  test('a two-space-indented hand-back: the counts land on the store row and the toast reads T1 63/63', NO_DEBRIEF, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    const indented = ['Ran T1 once.', `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`].map(l => '  ' + l).join('\n')
    await $.turn.complete(turnInput('agent-1', indented))
    expect(w.toasts).toContain('T1 63/63')
    expect((w.store.get('delegation.evals') as Record<string, unknown>[]).at(-1)).toMatchObject({ tier: 'T1', sha: A, total: 63, pass: 63, fail: 0, result: 'none', failing: [] })
    expect(w.store.get('delegation.eval.inflight')).toBeNull()
    expect(rowsOf(w).some(r => r.includes('eval T1'))).toBe(false)
  })

  test('the block only in the runner\'s SubagentHandback message (indented, wrapped) is read; the turn answer alone holds none', NO_DEBRIEF, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    on('tool.call', { tool: 'SubagentHandback' as never }, () => ({ result: 'handed back' }) as never)
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    const message = ['Ran T1 once.', `[[eval v=1 tier=T1 sha=${A}`, `total=63 pass=63 fail=0 result=none]]`].map(l => '  ' + l).join('\n')
    await $.tool.call({ tool: 'SubagentHandback', message, agentId: 'agent-1' } as never)
    await $.turn.complete(turnInput('agent-1', ''))
    expect(w.toasts).toContain('T1 63/63')
    expect(w.toasts.some(t => t.includes('no [[eval]] block'))).toBe(false)
    expect((w.store.get('delegation.evals') as Record<string, unknown>[]).at(-1)).toMatchObject({ total: 63, pass: 63, fail: 0, result: 'none' })
    expect(rowsOf(w).some(r => r.includes('eval T1'))).toBe(false)
  })

  test('GH-2: no tool.call for the hand-back (live): the runner\'s block is read from its transcript', NO_DEBRIEF, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    const message = ['Ran T1 once.', `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`].join('\n')
    w.transcripts.set('agent-1', [
      { role: 'user', text: String(w.spawns[0]?.prompt), toolUses: [] },
      { role: 'assistant', text: '', toolUses: [{ tool_use_id: 'toolu_hb01', tool: 'SubagentHandback', input: { message } }] },
    ])
    await $.turn.complete(turnInput('agent-1', ''))
    expect(w.toasts).toContain('T1 63/63')
    expect((w.store.get('delegation.evals') as Record<string, unknown>[]).at(-1)).toMatchObject({ total: 63, pass: 63, fail: 0, result: 'none' })
  })

  test('a running worker holds the eval back', NO_DEBRIEF, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard]]\nDo it.' }))
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.store.has('delegation.eval.lastSha')).toBe(false)
  })

  test('T2 behind evalLive: after a clean T1, inside the cost ceiling, once a session', { options: { ...EVAL, evalLive: true, evalLiveCommand: './scripts/eval-live.sh' } }, async ($, on) => {
    let sha = A
    const w = world(on, { run: revParse(() => sha), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.complete(turnInput('agent-1', `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`))
    expect(w.spawns).toHaveLength(2)
    expect(w.spawns[1]).toMatchObject({ description: 'eval T2', model: 'sonnet' })
    expect(String(w.spawns[1]?.prompt)).toContain('Run `./scripts/eval-live.sh` once in')
    expect(String(w.spawns[1]?.prompt)).toContain('at most $1.00')
    await $.turn.complete(turnInput('agent-2', `[[eval v=1 tier=T2 sha=${A} total=12 pass=12 fail=0 result=/tmp/t2.json]]`))
    expect(w.toasts).toContain('T2 12/12')

    sha = B
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.complete(turnInput('agent-3', `[[eval v=1 tier=T1 sha=${B} total=63 pass=63 fail=0 result=none]]`))
    expect(w.spawns).toHaveLength(3) // T1 for B, no second T2 this session
  })

  test('T2 is held back when the session would pass its cost cap', { options: { ...EVAL, evalLive: true, evalLiveCommand: './scripts/eval-live.sh', sessionUsdCap: 2 } }, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.complete(turnInput('agent-1', `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`))
    expect(w.spawns).toHaveLength(1) // $1.50 + $1.00 > $2.00
  })

  test('5E: the defaults run no eval at all (autoEval off, no evalCommand)', { options: { autoDebrief: false } }, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(30 * MIN)
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toHaveLength(0)
  })

  test('5E: autoEval on with no evalCommand: still nothing', { options: { autoDebrief: false, autoEval: true } }, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(30 * MIN)
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toHaveLength(0)
  })

  test('5B: the repo file turns the eval on with its own command', { options: { autoDebrief: false } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/.chassis-delegation.json`]: '{"autoEval":true,"evalCommand":"make eval"}' }, run: revParse(() => A), listAgents: true })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(String(w.spawns[0]?.prompt)).toContain(`Run \`make eval\` once in ${ROOT}`)
  })

  test('autoEval off: no rev-parse, no runner', { options: { autoDebrief: false, autoEval: false, evalCommand: 'npm run eval' } }, async ($, on) => {
    const w = world(on, { run: revParse(() => A), listAgents: true })
    await $.turn.complete(mainTurn())
    await w.clock.advance(30 * MIN)
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toHaveLength(0)
  })
})

describe('2E: compaction and the system prompt', () => {
  const OFF = { options: { autoDebrief: false, autoEval: false } }

  test('session.compact keeps the given instructions and adds KEEP VERBATIM with the live delegation state', OFF, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=frontier]]\nDo it.' }))
    await $.session.compact(compactInput('keep the plan'))
    const got = w.compactions.at(-1) ?? ''
    expect(got.startsWith('keep the plan\nKEEP VERBATIM: (1) the delegation state below;')).toBe(true)
    expect(got).toContain('- running: T-1 frontier agent agent-1 since ')
    expect(got).toContain('[[brief v=1 …]]')
  })

  test('with nothing delegated the block still keeps the contracts and says the state is empty', OFF, async ($, on) => {
    const w = world(on)
    await $.session.compact(compactInput())
    const got = w.compactions.at(-1) ?? ''
    expect(got.startsWith('\nKEEP VERBATIM:')).toBe(true)
    expect(got).toContain('Delegation state (chassis-delegation): nothing running, nothing owed.')
  })

  test('prompt.compose: a session-scoped Delegation state section only while something runs or is owed, never in a subagent prompt', OFF, async ($, on) => {
    world(on, { listAgents: true })
    const before = await $.prompt.compose(composeInput(['Agent', 'Read']))
    expect(before.sections.map(s => s.id)).toEqual(['intro'])
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=frontier]]\nDo it.' }))
    const during = await $.prompt.compose(composeInput(['Agent', 'Read']))
    expect(during.sections.map(s => s.id)).toEqual(['intro', 'chassis-delegation:state'])
    const section = during.sections.at(-1)
    expect(section?.scope).toBe('session')
    expect(section?.text).toContain('- running: T-1 frontier agent agent-1')
    expect((section?.text ?? '').split('\n').length).toBeLessThanOrEqual(40)
    const sub = await $.prompt.compose(composeInput(['Read', 'Bash']))
    expect(sub.sections.map(s => s.id)).toEqual(['intro'])
  })

  test('the section carries what is owed after a failed verdict', OFF, async ($, on) => {
    world(on, { listAgents: false })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard]]\nDo it.' }))
    await $.turn.complete(turnInput('agent-1', 'I could not finish.'))
    const out = await $.prompt.compose(composeInput(['Agent']))
    const text = out.sections.at(-1)?.text ?? ''
    expect(text).toContain('- owed: T-1: resume agent=agent-1')
    expect(text).toContain('- verdict: chassis-delegation: T-1 attempt 1/3 no-report')
  })
})
