import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, workerCall, brainSpawn, spawnCallOf, commandInput, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { budgetCount } from '../hooks/lib/attempts'
import { LATCH_LINE } from '../hooks/lib/identity'

// MOD-279: in auto mode a worker's Bash runs as typed (the host's classifier cannot review a rewritten command).
describe('MOD-279: auto mode - a worker Bash runs as typed', () => {
  const HEAD = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]`
  const briefOf = (task: string) => `${SCRATCH}/briefs/${task}.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const branchRun = (branch: string) => (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: `${branch}\n` } : undefined)
  const PREFIX = (task: string) => `export CHASSIS_SESSION_ID=${task}-a1 CHASSIS_TASK=${task} CHASSIS_ATTEMPT=1; `
  type Seen = { tool: string; command?: string }
  type Bottom = (e: Seen) => unknown
  const bottom = (on: Parameters<Parameters<typeof test>[2]>[1], answer?: Bottom): Seen[] => {
    const seen: Seen[] = []
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async (_$: unknown, e: Seen) => {
      seen.push({ tool: e.tool, ...(e.command !== undefined ? { command: e.command } : {}) })
      return (answer ? answer(e) : undefined) ?? { result: 'ok' }
    })
    return seen
  }
  type Dollar = Parameters<Parameters<typeof test>[2]>[0]
  const spawnBrief = ($: Dollar, task: string, id: string, mode?: string) =>
    $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${briefOf(task)}.`, tool_use_id: id, ...(mode ? { permissionMode: mode } : {}) }))

  test('a worker spawned in auto mode runs pwd and the command reaching the engine is exactly pwd', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    const seen = bottom(on)
    await spawnBrief($, 'T-1', 'toolu_A0000001', 'auto')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'pwd' })
    expect(seen.map(s => s.command)).toEqual(['pwd'])
  })

  test('default mode: the command is prefixed as before', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-2')]: HEAD('T-2') + '\nbody' }, run: branchRun('agent/mod/T-2'), agentId: 'agent-2' })
    const seen = bottom(on)
    await spawnBrief($, 'T-2', 'toolu_A0000002', 'default')
    await workerCall($, w, 'agent-2', { tool: 'Bash', command: 'pwd' })
    expect(seen.map(s => s.command)).toEqual([PREFIX('T-2') + 'pwd'])
  })

  const CHANGED = "a hook changed this call's input after auto mode reviewed it"

  test('latch: a rewritten call the host refuses as changed comes back with one trailing line, and that worker\'s later Bash runs as typed; another worker is still prefixed', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody', [briefOf('T-2')]: HEAD('T-2') + '\nbody' }, run: branchRun('agent/mod/T-1') })
    let refuse = true
    const seen = bottom(on, () => {
      if (!refuse) return undefined
      refuse = false
      return { result: CHANGED, isError: true }
    })
    await spawnBrief($, 'T-1', 'toolu_A0000001')
    await spawnBrief($, 'T-2', 'toolu_A0000002')
    const first = await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'pwd' })
    expect(first.seen ? String((first.result as { result?: unknown }).result) : '').toBe(`${CHANGED}\n${LATCH_LINE}`)
    const again = await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'pwd' })
    expect(again.seen ? String((again.result as { result?: unknown }).result) : '').toBe('ok')
    await workerCall($, w, 'agent-2', { tool: 'Bash', command: 'pwd' })
    expect(seen.map(s => s.command)).toEqual([PREFIX('T-1') + 'pwd', 'pwd', PREFIX('T-2') + 'pwd'])
  })

  test('latch: a deny from the host on a rewritten call latches too', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1') })
    let refuse = true
    const seen = bottom(on, () => {
      if (!refuse) return undefined
      refuse = false
      return { deny: 'blocked by auto mode' }
    })
    await spawnBrief($, 'T-1', 'toolu_A0000001')
    const first = await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'ls' })
    expect(first.seen ? first.result.deny : '').toBe(`blocked by auto mode\n${LATCH_LINE}`)
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'ls' })
    expect(seen.map(s => s.command)).toEqual([PREFIX('T-1') + 'ls', 'ls'])
  })

  test('auto mode: the git guard, gh guard, engine-turn and write-log hooks pass the command through unchanged', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    const seen = bottom(on)
    await spawnBrief($, 'T-1', 'toolu_A0000001', 'auto')
    const typed = ['git commit -m x', 'git status', 'gh pr view 1', 'claude plugin test /w', 'echo hi > a/x.ts', 'cd /w && make test\nls']
    for (const command of typed) await workerCall($, w, 'agent-1', { tool: 'Bash', command })
    expect(seen.map(s => s.command)).toEqual(typed)
  })

  test('the spawn notice of a worker started in auto mode ends with the auto-mode clause; default mode does not', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody', [briefOf('T-2')]: HEAD('T-2') + '\nbody' }, run: branchRun('agent/mod/T-1') })
    await spawnBrief($, 'T-1', 'toolu_A0000001', 'auto')
    await spawnBrief($, 'T-2', 'toolu_A0000002')
    expect(w.notices[0]?.endsWith(' · auto mode: Bash runs as typed (no CHASSIS_SESSION_ID)')).toBe(true)
    expect(w.notices[1]).not.toContain('auto mode')
  })

  test('blocked by environment: the host refused the Bash calls and the report has no usable sha: that verdict row, next=stop, budget intact, no resume', { options: { ...GM, autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    bottom(on, () => ({ result: CHANGED, isError: true }))
    await spawnBrief($, 'T-1', 'toolu_A0000001')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git status' })
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git status' })
    await $.turn.complete(turnInput('agent-1', 'I could not run git.\n[[report v=1 task=T-1 subtask=main branch=agent/mod/T-1 pr=none sha=unknown gate=fail files=a/x.ts]]'))
    const shown = [...w.appended.map(a => a.text), ...w.logs].join('\n')
    expect(shown).toContain(`blocked by environment: Bash refused by the host (${CHANGED.slice(0, 80)})`)
    expect(shown).toContain('next=stop')
    expect(shown).not.toContain('fabricat')
    expect(w.sent).toHaveLength(0)
    const recs = (w.store.get(`delegation.tasks.T-1@${ROOT}`) ?? []) as { verdict: string; blocked?: string }[]
    expect(recs).toHaveLength(1)
    expect(recs[0]?.blocked).toContain('blocked by environment')
    expect(recs[0]?.verdict).toBe('unverified')
    expect(budgetCount(recs as never, 'main')).toBe(0)
  })

  // MOD-281: only a refusal the host made (a deny, or an error saying the input was changed after review) counts, and only when every Bash call of the attempt was refused.
  test('MOD-281: an ordinary failed command (Permission denied (publickey)) is no host refusal: the attempt is judged and counts against the budget', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    let first = true
    bottom(on, () => {
      if (!first) return undefined
      first = false
      return { isError: true, result: 'git@github.com: Permission denied (publickey).' }
    })
    await spawnBrief($, 'T-1', 'toolu_A0000001', 'default')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git push' })
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git status' })
    await $.turn.complete(turnInput('agent-1', 'Done.\n[[report v=1 task=T-1 subtask=main branch=agent/mod/T-1 pr=none sha=unknown gate=fail files=a/x.ts]]'))
    expect([...w.appended.map(a => a.text), ...w.logs].join('\n')).not.toContain('blocked by environment')
    const recs = (w.store.get(`delegation.tasks.T-1@${ROOT}`) ?? []) as { blocked?: string }[]
    expect(recs[0]?.blocked).toBeUndefined()
    expect(budgetCount(recs as never, 'main')).toBe(1)
  })

  test('MOD-281: one call refused as changed followed by one that ran, report sha=none: not blocked, judged as before', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    let first = true
    bottom(on, () => {
      if (!first) return undefined
      first = false
      return { isError: true, result: CHANGED }
    })
    await spawnBrief($, 'T-1', 'toolu_A0000001')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'pwd' })
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'pwd' })
    await $.turn.complete(turnInput('agent-1', 'Done.\n[[report v=1 task=T-1 subtask=main branch=agent/mod/T-1 pr=none sha=none gate=fail files=a/x.ts]]'))
    expect([...w.appended.map(a => a.text), ...w.logs].join('\n')).not.toContain('blocked by environment')
    const recs = (w.store.get(`delegation.tasks.T-1@${ROOT}`) ?? []) as { blocked?: string }[]
    expect(recs[0]?.blocked).toBeUndefined()
  })

  test('not blocked: a usable sha, or no refusal, is judged as before', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-1')]: HEAD('T-1') + '\nbody' }, run: branchRun('agent/mod/T-1'), agentId: 'agent-1' })
    bottom(on)
    await spawnBrief($, 'T-1', 'toolu_A0000001')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git status' })
    await $.turn.complete(turnInput('agent-1', 'Done.\n[[report v=1 task=T-1 subtask=main branch=agent/mod/T-1 pr=none sha=unknown gate=pass files=a/x.ts]]'))
    expect([...w.appended.map(a => a.text), ...w.logs].join('\n')).not.toContain('blocked by environment')
  })
})

describe('MOD-279: an exploring attempt is visible before the spawn, and a resume keeps what it explored', () => {
  const TOOL = 'mcp__chassis-delegation__dispatch'
  const CARD = FIXTURE_CARD.replace('tier: frontier\ntier_reason: cross-cutting contract change\n', 'tier: standard\n')
  const files = (): Record<string, string> => ({ [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: CARD, [`${ROOT}/.chassis-delegation.json`]: '{"explore":0.2}' })
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const LINE = 'this attempt explores: haiku/medium (from sonnet/medium)'
  const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

  test('/dispatch (dry run and real) prints the line above the spawn block; the block itself is unchanged', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    world(on, { files: files(), dirs, store: offered })
    await $.session.start(sessionStart)
    const dry = String((await $.command.run(commandInput('BE-101 --scope app/** --dry-run'))).text)
    expect(dry).toContain(LINE)
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(text.split('\n').filter(l => l.includes(LINE))).toHaveLength(1)
    expect(text.indexOf(LINE)).toBeLessThan(text.indexOf('```'))
    expect(spawnCallOf(text)).toMatchObject({ model: 'sonnet' })
  })

  test('a resume of an attempt that explored keeps the explored alias and effort on its started row and its steps', { options: { briefDir: `${SCRATCH}/briefs`, autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, store: offered, listAgents: true })
    await $.session.start(sessionStart)
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    const r = await brainSpawn($, text, { tool_use_id: 'toolu_BRAIN0001' })
    expect(r.deny).toBeUndefined()
    const rows = () => w.appended.map(a => a.text).join('\n')
    expect(rows()).toContain('BE-101 started')
    expect(rows()).toMatch(/started .*haiku.* effort medium/)
    await $.turn.complete(turnInput('agent-1', 'I stopped.'))
    expect(w.sent).toHaveLength(1)
    expect(rows()).toMatch(/BE-101 resumed .*haiku.* effort medium/)
    const recs = (w.store.get(`delegation.tasks.BE-101@${ROOT}`) ?? []) as { kind: string; effort?: string }[]
    expect(recs.map(x => x.kind)).toEqual(['spawn', 'resume'])
    expect(recs[1]?.effort).toBe('medium')
  })
})
