import { test, expect, describe } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, agentResult, sessionStart, commandInput, DEBRIEF_TEMPLATE, composeInput, brainSpawn, spawnCallOf, workerCall, stepInput, paneProps, STEPPED_PAST, ROOT, SCRATCH, NOW, HOME, type RunAnswer, type SpawnCall } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME, FIXTURE_HEADER as PLAIN_HEADER } from './fixtures/sample-card'
import { MOD_VERSION } from '../hooks/lib/version'
import { DEFAULT_DEBRIEF_COOLDOWN_HOURS } from '../hooks/lib/cleanstop'
import { MAP_CAPS, addBounded, setBounded } from '../hooks/lib/cut'
// GH-106: /dispatch writes the tier's ceiling (frontier: $15) into the header
const FIXTURE_HEADER = PLAIN_HEADER.replace(' budget=', ' spend=25 budget=')

// MOD-117: a local card's records sit under its repo's key
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task.includes('@') ? task : `${task}@${ROOT}`}`) ?? []) as Record<string, unknown>[]
const argvs = (w: { runs: { argv: string[] }[] }) => w.runs.map(r => r.argv)
// What reached the brain or Ben for a background verdict: the appended row, or
// (the kit cannot answer a plugin's own session.append) the transcript log line.
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const fullSha = (sha: string) => sha.padEnd(40, '0')
const MB = 'b'.repeat(40)
/** The first git read of a native verify (5A): the report's sha resolved. */
const isVerifyStart = (argv: readonly string[]) => argv[0] === 'git' && (argv[argv.length - 1] ?? '').endsWith('^{commit}')
/**
 * A worker repo answered from memory for the native verifier (5A): the branch and
 * the sha exist, HEAD is the sha last asked about, the tree is clean, the delta is
 * a/x.ts, and the gate (npx …) is red unless `gate` says otherwise.
 */
const nativeRun = (o: { gate?: number; delta?: string } = {}) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = fullSha(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: o.delta ?? 'A\ta/x.ts\n' }
    return undefined
  }
}

describe('GH-107 (MOD-12): a ready task the brain spawns, refused, keeps its place at the head of the queue unless retrying cannot cure it', () => {
  const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const report = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
  const rowsOf = (w: { appended: { type: string; text: string }[] }) => w.appended.filter(a => a.type === 'user').map(a => a.text)

  test('(a) one worker hands back: A is ready, B stays queued at position 2', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-8'), tool_use_id: 'toolu_C0000008' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(queueOf(w).map(q => q.task)).toEqual(['T-8', 'T-9'])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.spawns).toHaveLength(2)
    const rows = w.appended.map(a => a.text).join('\n')
    expect(rows).toContain('ready: T-8 — run its spawn block')
    expect(rows).not.toContain('ready: T-9')
    await $.agent.spawn(spawnInput({ prompt: brief('T-8'), tool_use_id: 'toolu_E0000008' }))
    expect(String(w.spawns[2]?.prompt)).toContain('task=T-8')
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
  })

  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const WT = `${ROOT}-T-4`
  const BRANCH = 'agent/frontend/T-4'
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const worker = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
    if (sub[0] === 'log') return { exitCode: 0, stdout: `${'3'.repeat(40)}\n${'4'.repeat(40)}\n` }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }

  test('(b) the brain spawns ready A and is refused for work present: A leaves the queue, and B is ready', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: worker, files: { [BRIEF]: HEADER + '\nbody' }, dirs: { [WT]: [] } })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
    const a = { prompt: PROMPT, description: 'task', subagentType: 'general-purpose', cwd: WT, task: 'T-4', subtask: 'main', at: 1000 }
    const b = { prompt: brief('T-9'), description: 'task', subagentType: 'general-purpose', task: 'T-9', subtask: 'main', at: 2000 }
    w.state.set('chassis-delegation.queue', [a, b])
    // T-4 already had an attempt: its worktree holds finished work
    w.store.set(`delegation.tasks.T-4@${ROOT}`, [{ attempt: 1, subtask: 'main', kind: 'spawn', tier: 'standard', alias: 'sonnet', verdict: 'no-report', source: 'brief', purpose: 'build', briefPath: BRIEF }])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.appended.map(x => x.text).join('\n')).toContain('ready: T-4 — run its spawn block')
    const refused = await $.agent.spawn(spawnInput({ prompt: PROMPT, tool_use_id: 'toolu_E0000004' }))
    expect(refused.deny).toContain('T-4 not spawned — work present at')
    expect(w.spawns).toHaveLength(2)
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
    const composed = await $.prompt.compose(composeInput(['Agent']))
    expect(composed.sections.find(x => x.id === 'chassis-delegation:state')?.text).toContain('- ready: T-9 — run its spawn block (/dispatch T-9 prints it again)')
  })
  test('(c) a transient refusal of the brain spawn keeps A at the head; each task is said ready once, however often slots free', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: worker, spawnDeny: e => (String(e.prompt).includes('T-4') ? 'the engine is busy' : undefined) })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const a = { prompt: brief('T-4'), description: 'task', subagentType: 'general-purpose', task: 'T-4', subtask: 'main', at: 1000 }
    const b = { prompt: brief('T-9'), description: 'task', subagentType: 'general-purpose', task: 'T-9', subtask: 'main', at: 2000 }
    w.state.set('chassis-delegation.queue', [a, b])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await $.turn.complete(turnInput('agent-2', report('T-2')))
    const rows = w.appended.map(x => x.text).join('\n')
    expect(rows.split('ready: T-4 — ')).toHaveLength(2)
    expect(rows.split('ready: T-9 — ')).toHaveLength(2)
    const refused = await $.agent.spawn(spawnInput({ prompt: brief('T-4'), tool_use_id: 'toolu_E0000004' }))
    expect(refused.deny).toBe('the engine is busy')
    expect(queueOf(w).map(q => q.task)).toEqual(['T-4', 'T-9'])
  })
})

describe('GH-105: a dispatch given --base <sha> writes base= into the brief, and the verifier diffs from it', () => {
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card stacked on an unpushed sibling.\n'
  const BASE = 'd'.repeat(40)
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const BRANCH = 'agent/frontend/T-4'
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const files = () => ({ [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD })
  const dirs = { [`${ROOT}/agents/tasks`]: [CARD_NAME] }
  // The worktree is cut from BASE, which itself changed b/y.ts. The branch adds a/x.ts on top of it.
  // Diffed from BASE the delta is a/x.ts; diffed from origin/main it would also hold the base's b/y.ts.
  const stacked = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'fetch' || sub[0] === 'worktree') return { exitCode: 0, stdout: '' }
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${sub[1] === BASE ? BASE : MB}\n` }
    if (sub[0] === 'diff') {
      const fromBase = sub.includes(BASE)
      const rows = fromBase ? ['A\ta/x.ts'] : ['A\ta/x.ts', 'A\tb/y.ts']
      return { exitCode: 0, stdout: (sub.includes('--name-status') ? rows : rows.map(r => r.split('\t')[1])).join('\n') + '\n' }
    }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }

  test('the header carries base=<sha>, and a hand-back on top of a base that changed a forbidden path is verified, the scope line naming the base', { options: { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: stacked, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput(`T-4 --base ${BASE} --scope a/**`))).text)
    const header = (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(` gate=prettier base=${BASE} spend=10 budget=3-attempts`)
    expect(out).toContain(`3. worktree ${ROOT}-T-4 on ${BRANCH} from ${BASE}`)
    await brainSpawn($, out)
    const REPORT = `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=a/x.ts]]`
    await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=1/3')
    expect(row).toContain(`claim scope: held — every changed path since ${BASE.slice(0, 7)} is within scope=[a/**], forbid=[b/**] untouched`)
    expect(row).toContain('claim files: held — files= matches the sha delta exactly')
  })

  test('a dispatch with no --base writes no base=; a later dispatch naming one sets it on the reused brief', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: stacked, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.command.run(commandInput('T-4 --scope a/**'))
    const header = (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''
    expect(header).not.toContain(' base=')
    const again = String((await $.command.run(commandInput(`T-4 --base ${BASE}`))).text)
    expect(again).toContain(`reused, base= set to ${BASE}`)
    expect((w.files.get(BRIEF) ?? '').split('\n')[0]).toContain(` base=${BASE} `)
  })
})

describe('MOD-2: a dispatch that names a base writes it into an existing brief', () => {
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nStacked.\n'
  const BASE = 'd'.repeat(40)
  const BASE2 = 'c'.repeat(40)
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const BRANCH = 'agent/frontend/T-4'
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const files = () => ({ [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD })
  const dirs = { [`${ROOT}/agents/tasks`]: [CARD_NAME] }
  const worktrees: string[][] = []
  const stacked = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'worktree') {
      worktrees.push(sub)
      return { exitCode: 0, stdout: '' }
    }
    if (sub[0] === 'fetch') return { exitCode: 0, stdout: '' }
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${sub[1] === BASE ? BASE : MB}\n` }
    if (sub[0] === 'diff') {
      const rows = sub.includes(BASE) ? ['A\ta/x.ts'] : ['A\ta/x.ts', 'A\tb/y.ts']
      return { exitCode: 0, stdout: (sub.includes('--name-status') ? rows : rows.map(r => r.split('\t')[1])).join('\n') + '\n' }
    }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }
  const header = (w: { files: Map<string, string> }) => (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''

  test('a dry run writes no base=; the dispatch with base=<sha> sets it and says so, then a second base replaces it', { options: { briefDir: `${SCRATCH}/briefs`, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: stacked, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.command.run(commandInput('T-4 --dry-run --scope a/**'))
    expect(header(w)).not.toContain(' base=')
    const before = w.files.get(BRIEF) ?? ''
    const out = String((await $.command.run(commandInput(`T-4 --base ${BASE}`))).text)
    expect(header(w)).toContain(` base=${BASE} `)
    expect(out).toContain(`reused, base= set to ${BASE}`)
    expect(out).not.toContain('the verifier diffs against')
    expect(out).toContain(`from ${BASE}`)
    expect((w.files.get(BRIEF) ?? '').split('\n').slice(1)).toEqual(before.split('\n').slice(1))
    const again = String((await $.command.run(commandInput(`T-4 --dry-run --base ${BASE2}`))).text)
    expect(again).toContain(`reused, base= replaced ${BASE} → ${BASE2}`)
    expect(header(w).split(' base=').length).toBe(2)
  })

  test('a dispatch with no base against a reused brief that carries base= cuts the worktree from it', { options: { briefDir: `${SCRATCH}/briefs`, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: stacked, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.command.run(commandInput(`T-4 --dry-run --base ${BASE} --scope a/**`))
    expect(header(w)).toContain(` base=${BASE} `)
    worktrees.length = 0
    const out = String((await $.command.run(commandInput('T-4'))).text)
    expect(out).toContain(`3. worktree ${ROOT}-T-4 on ${BRANCH} from ${BASE}`)
    expect(worktrees.at(-1)?.at(-1)).toBe(BASE)
  })

  test('a hand-back on a brief dry-run first holds scope once the dispatch wrote the base', { options: { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: stacked, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.command.run(commandInput('T-4 --dry-run --scope a/**'))
    await brainSpawn($, String((await $.command.run(commandInput(`T-4 --base ${BASE}`))).text))
    const REPORT = `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=a/x.ts]]`
    await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('verdict=consistent task=T-4')
    expect(row).toContain(`claim scope: held — every changed path since ${BASE.slice(0, 7)} is within scope=[a/**]`)
  })
})

describe('GH-106: a per-attempt spend ceiling', () => {
  const BRIEF = `${SCRATCH}/briefs/T-6.brief.md`
  const HEADER = '[[brief v=1 task=T-6 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier spend=2 budget=3-attempts report=chassis.report.v1]]'
  const REPORT = (sha: string) => `[[report v=1 task=T-6 subtask=main branch=agent/frontend/T-6 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const SONNET = 'claude-sonnet-5-5' // $2 in, $10 out per million
  const turnUsage = (inTok: number, outTok = 0) => usage(SONNET, inTok, outTok)
  type Body = Extract<Parameters<typeof test>[1], (...args: never[]) => unknown>
  const boot = async ($: Parameters<Body>[0], on: Parameters<Body>[1]) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    return w
  }
  const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => ({ text: a.text })), ...w.logs.map(text => ({ text }))].filter(r => r.text.startsWith('chassis-delegation: verdict='))
  const wrapUps = (w: { sent: { to: unknown; text: string }[] }) => w.sent.filter(m => m.text.includes('wrap up'))

  test('(a) a worker crossing its spend= gets one wrap-up message, once', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on)
    await $.turn.complete(turnInput('agent-6', 'working', turnUsage(600_000, 100_000))) // $2.20
    expect(wrapUps(w)).toHaveLength(1)
    expect(wrapUps(w)[0]?.to).toBe('agent-6')
    expect(wrapUps(w)[0]?.text).toBe('chassis-delegation: you have spent about $2.20 of a $2 ceiling; wrap up now and hand back with the report line')
    expect(records(w, 'T-6')[0]).toMatchObject({ verdict: 'pending', attempt: 1 }) // not a resume, not charged, not judged: the worker carries on
    await $.turn.complete(turnInput('agent-6', 'still working', turnUsage(100_000))) // $2.40
    expect(wrapUps(w)).toHaveLength(1)
    expect(records(w, 'T-6')[0]).toMatchObject({ attempt: 1, verdict: 'no-report' }) // its next turn is judged as ever
  })

  test('(b) twice the ceiling: the over-spend row, the attempt verdict over-spend, no escalation', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on)
    await $.turn.complete(turnInput('agent-6', 'working', turnUsage(600_000, 100_000)))
    await $.turn.complete(turnInput('agent-6', 'still working', turnUsage(1_000_000))) // $4.20
    expect(records(w, 'T-6')[0]).toMatchObject({ verdict: 'over-spend', usd: 4.2 })
    expect(delivered(w)).toContain('T-6 attempt 1/3 over-spend · $4.20 of $2 · next=check the worktree (work may be present: /dispatch T-6 --verify <sha>)')
    expect(w.aborted).toEqual([]) // the engine hands no turn id for a subagent
    expect(wrapUps(w)).toHaveLength(1)
    await $.turn.complete(turnInput('agent-6', 'more', turnUsage(1_000_000)))
    expect(delivered(w).split('over-spend ·').length - 1).toBe(1) // once
    expect(w.sent.filter(m => m.text.includes('resum'))).toHaveLength(0)
  })

  test('(b) a worker whose turn.start carried its agentId is aborted at twice the ceiling', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on)
    await $.turn.start({ text: '', turnId: 'turn-w6', agentId: 'agent-6' } as never)
    await $.turn.complete(turnInput('agent-6', 'working', turnUsage(2_200_000))) // $4.40 at once
    expect(w.aborted).toEqual(['turn-w6'])
    expect(records(w, 'T-6')[0]).toMatchObject({ verdict: 'over-spend' })
  })

  test('(c) the verdict row and the ledger carry the worker own cost, not the session delta', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await boot($, on)
    w.usd = 16 // other workers moved the session: $14.50 of growth
    await $.turn.complete(turnInput('agent-6', REPORT('1234abcd'), turnUsage(500_000, 50_000))) // $1.50
    expect(rows(w)[0]?.text.split('\n')[0]).toContain('usd=1.50')
    expect(rows(w)[0]?.text.split('\n')[0]).not.toContain('~')
    expect(records(w, 'T-6')[0]).toMatchObject({ usd: 1.5 })
  })

  test('without a usage the row falls back to the session delta, marked ~', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = await boot($, on)
    w.usd = 4.5
    await $.turn.complete(turnInput('agent-6', REPORT('1234abcd')))
    expect(rows(w)[0]?.text.split('\n')[0]).toContain('usd=~3.00')
  })

})

describe('GH-111: the card tool', () => {
  const TOOL = 'mcp__chassis-delegation__card'
  const cfgFile = JSON.stringify({ gateMap: { test: 'npm test' } })
  const given = {
    title: 'The rom reader returns the header size',
    why: 'The decompiler cannot tell how big a header is.',
    doneWhen: ['read_header(path) returns the size'],
    scope: ['game_decompiler/**', 'tests/**'],
    redTest: 'python3 -m unittest tests.test_rom',
  }
  const setup = (on: Parameters<typeof world>[0], files: Record<string, string> = {}) =>
    world(on, { files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile, ...files }, dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, store: { 'delegation.agentTypes': ['general-purpose'] } })

  test('writes the card, returns the dry-run header and the one-line summary, spawns nothing', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    expect(w.tools).toContain('card')
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    const path = `${ROOT}/agents/tasks/OPS-1-the-rom-reader-returns-the-header.md`
    expect(w.files.get(path)).toContain('id: OPS-1\n')
    expect(out).toContain(`wrote ${path}`)
    expect(out).toContain('OPS-1 · standard → sonnet · scope game_decompiler/**, tests/** · gate test · red: python3 -m unittest tests.test_rom · 2 attempts · $10 ceiling')
    expect(out).toContain('```\n[[brief v=1 task=OPS-1 subtask=main purpose=build tier=standard model=sonnet scope=game_decompiler/**,tests/** forbid= red_test="python3 -m unittest tests.test_rom" gate=test spend=10 budget=2-attempts report=chassis.report.v1]]\n```')
    expect(out.trimEnd().endsWith('Say go and Claude dispatches OPS-1.')).toBe(true)
    expect(w.files.has(`${SCRATCH}/briefs/OPS-1.brief.md`)).toBe(true)
    expect(w.spawns).toHaveLength(0)
    // a second task takes the next id, and the first card is never overwritten
    const again = resultText(await $.tool.call({ tool: TOOL, ...given, title: 'Another thing' } as never))
    expect(again).toContain(`wrote ${ROOT}/agents/tasks/OPS-2-another-thing.md`)
    expect(w.files.get(path)).toContain('id: OPS-1\n')
    expect(w.spawns).toHaveLength(0)
  })

  test('MOD-87: an id that owns a brief or a ledger row is taken, so a deleted card never gets its old brief back', async ($, on) => {
    const ledger = ['{"task":"OPS-4","verdict":"pass"}', 'not json at all', '{"verdict":"pass"}', ''].join('\n')
    const w = world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile, [`${ROOT}/.delegation/ledger.jsonl`]: ledger, [`${ROOT}/.delegation/briefs/OPS-3.brief.md`]: 'old brief' },
      dirs: { [`${ROOT}/agents/tasks`]: ['README.md', 'OPS-1-a.md', 'OPS-2-b.md'], [`${ROOT}/.delegation/briefs`]: ['OPS-3.brief.md'] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain(`wrote ${ROOT}/agents/tasks/OPS-5-the-rom-reader-returns-the-header.md`)
    expect(w.files.get(`${ROOT}/.delegation/briefs/OPS-3.brief.md`)).toBe('old brief')
  })

  test('MOD-94: a spawn row on the ledger still marks its id as taken', async ($, on) => {
    const ledger = JSON.stringify({ event: 'spawn', task: 'OPS-3', subtask: 'main', attempt: 1, lineage: 1, budget: 2, tier: 'standard', alias: 'sonnet', purpose: 'build', at: 1 }) + '\n'
    world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile, [`${ROOT}/.delegation/ledger.jsonl`]: ledger },
      dirs: { [`${ROOT}/agents/tasks`]: ['README.md', 'OPS-1-a.md', 'OPS-2-b.md'] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: TOOL, ...given } as never))).toContain(`wrote ${ROOT}/agents/tasks/OPS-4-the-rom-reader-returns-the-header.md`)
  })

  test('a refusal writes nothing and says what to change', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const before = w.files.size
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, scope: ['the decompiler'] } as never))
    expect(out).toContain('scope must be globs, e.g. game_decompiler/**, tests/test_rom.py')
    expect(resultText(await $.tool.call({ tool: TOOL, ...given, gate: 'nope' } as never))).toContain('gate nope is not in gateMap; the ids are test')
    expect(w.files.size).toBe(before)
    expect(w.spawns).toHaveLength(0)
  })

  test('MOD-29: the dry run prints a forbid that collides with a done-when path, and the card is still written', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, doneWhen: ['`artifacts/kit/index.html` exists'], forbid: ['artifacts/*.html'] } as never))
    expect(out).toContain('warning: forbid covers paths done-when names: artifacts/kit/index.html (artifacts/*.html)')
    const path = `${ROOT}/agents/tasks/OPS-1-the-rom-reader-returns-the-header.md`
    expect(out).toContain(`wrote ${path}`)
    expect(w.files.get(path)).toContain('forbid: [artifacts/*.html]\n')
    expect(w.spawns).toHaveLength(0)
  })

  test('with dispatch: true it dispatches the card it wrote: the spawn block, for the brain to make (MOD-12)', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, dispatch: true } as never))
    expect(out).toContain(`wrote ${ROOT}/agents/tasks/OPS-1-the-rom-reader-returns-the-header.md`)
    expect(out).toContain('4. spawn prepared:')
    expect(out).not.toContain('Say go and Claude dispatches')
    expect(w.spawns).toHaveLength(0)
    expect(spawnCallOf(out)).toMatchObject({ description: 'OPS-1 standard sonnet' })
    await brainSpawn($, out)
    expect(w.spawns).toHaveLength(1)
  })

  test('GH-114: the dry run asks the classifier once and prints it beside the card tier; dispatch does not ask; the config turns it off', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { classify: 'economy', files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile }, dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, store: { 'delegation.agentTypes': ['general-purpose'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain('card says standard · classifier says economy')
    expect(out.indexOf('card says standard')).toBeGreaterThan(out.indexOf('OPS-1 · standard'))
    expect(out.indexOf('card says standard')).toBeLessThan(out.indexOf('```'))
    expect(w.store.get(`delegation.classifier.OPS-1@${ROOT}`)).toEqual({ card: 'standard', classifier: 'economy' })
  })

  test('GH-114: the classifier agrees, is not asked on dispatch, and is off with classifierSecondOpinion false; the first attempt record carries it', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    let asked = 0
    const w = world(on, { skip: ['model.classify'], files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile }, dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, store: { 'delegation.agentTypes': ['general-purpose'] } })
    on('model.classify', () => {
      asked++
      return { value: 'standard' } as never
    })
    await $.session.start(sessionStart)
    expect(resultText(await $.tool.call({ tool: TOOL, ...given } as never))).toContain('card says standard · classifier agrees')
    expect(asked).toBe(1)
    await brainSpawn($, resultText(await $.tool.call({ tool: TOOL, ...given, title: 'Another thing', dispatch: true } as never)))
    expect(asked).toBe(1)
    expect(w.spawns).toHaveLength(1)
  })

  test('GH-114: classifierSecondOpinion false: no classifier call, no line', { options: { briefDir: `${SCRATCH}/briefs`, classifierSecondOpinion: false } }, async ($, on) => {
    const w = world(on, { classify: 'economy', files: { [`${ROOT}/.chassis-delegation.json`]: cfgFile }, dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, store: { 'delegation.agentTypes': ['general-purpose'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).not.toContain('classifier')
    expect(w.store.has('delegation.classifier.OPS-1')).toBe(false)
    expect(w.store.has(`delegation.classifier.OPS-1@${ROOT}`)).toBe(false)
  })

  test('GH-114: /delegation names what each alias resolves to and when it moved', async ($, on) => {
    world(on, { store: { 'delegation.alias.haiku': { id: 'claude-haiku-5-5', since: NOW - 1000, previous: { id: 'claude-haiku-4-5-20251001', until: NOW - 2000 } }, 'delegation.alias.sonnet': 'claude-sonnet-5-5' } })
    await $.session.start(sessionStart)
    const out = await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    expect(out.text).toContain('aliases: haiku → claude-haiku-5-5 (since ')
    expect(out.text).toContain('sonnet → claude-sonnet-5-5')
    expect(out.text).toContain('cards now run on Haiku 5.5; re-run the economy cases of tests/eval/classifier-cases.jsonl')
  })

  test('a baseRef alone does not mean repo=here: with origin/main the card is a worktree card', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' }, baseRef: 'develop' }) },
      dirs: { [`${ROOT}/agents/tasks`]: [] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    const card = w.files.get(`${ROOT}/agents/tasks/OPS-1-the-rom-reader-returns-the-header.md`) ?? ''
    expect(card).not.toContain('repo: here')
    expect(out).not.toContain(' repo=here')
  })

  test('repo=here: the card folder is in the brief ignore= and nothing about committing is said', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { test: 'npm test' }, baseRef: 'main' }) },
      dirs: { [`${ROOT}/agents/tasks`]: [] },
      // no remote: origin/main does not resolve, so the card tool works in the shared checkout
      run: argv => (argv.join(' ').endsWith('rev-parse --abbrev-ref HEAD') ? { exitCode: 0, stdout: 'main\n' } : argv.join(' ').endsWith('rev-parse --verify --quiet origin/main') ? { exitCode: 1, stdout: '' } : undefined),
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given } as never))
    expect(out).toContain('repo=here base=main ignore=.delegation/**,agents/tasks/** ')
    expect(out).not.toMatch(/commit/i)
    expect(w.spawns).toHaveLength(0)
  })
})

describe('GH-113: the brain spend and delegate-only', () => {
  const FABLE = 'claude-fable-5-1'
  const SONNET = 'claude-sonnet-5-5'
  const delegation = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never
  const mainTurn = (u: ReturnType<typeof usage>) => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer', usage: u }) as never
  const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
  const OPTS = { options: { delegateOnly: 'deny' } }

  test('a main-loop turn.complete on fable adds to the brain spend; /delegation splits brain from workers', async ($, on) => {
    world(on, { model: FABLE })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000))) // $1.875
    await $.turn.complete(mainTurn(usage(FABLE, 0, 0)))
    const out = await $.command.run(delegation)
    expect(out.text).toContain('brain: fable $1.88 over 2 turns · workers $0.00 (0 attempts) · brain share 100%')
  })

  test('MOD-48: after a turn with three identical Bash runs, /delegation shows 3 run-or-poll calls and the average context; at 300K the third raises one warn row', async ($, on) => {
    const w = world(on, { model: FABLE })
    w.context = { window: 1_000_000, percent: 30 }
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: './bench.sh --scene 3 --frames 600 --out /tmp/one.csv' } as never)
    await $.turn.complete(mainTurn(usage(FABLE, 0, 1_000, 900_000, 0)))
    const out = await $.command.run(delegation)
    expect(out.text).toContain('3 run-or-poll')
    expect(out.text).toContain('300K')
    expect(w.appended.filter(a => a.text.includes('bench.sh --scene 3'))).toHaveLength(1)
  })

  test('MOD-53: two brain turns ending above freshSessionTokens append the fresh-session row once', async ($, on) => {
    const w = world(on, { model: FABLE })
    w.context = { window: 1_000_000, percent: 51 }
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 0, 1_000, 510_000, 0)))
    await $.turn.complete(mainTurn(usage(FABLE, 0, 1_000, 520_000, 0)))
    const rows = w.appended.filter(a => a.text.includes('start a fresh session at the next phase boundary'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toContain('brain context 510K (freshSessionTokens 400K)')
  })

  test('MOD-53: below the threshold, or with freshSessionTokens 0, no row', { options: { freshSessionTokens: 0 } }, async ($, on) => {
    const w = world(on, { model: FABLE })
    w.context = { window: 1_000_000, percent: 90 }
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 0, 1_000, 900_000, 0)))
    expect(w.appended.filter(a => a.text.includes('fresh session'))).toHaveLength(0)
  })

  test('MOD-37: another session\'s attempt is not this one\'s workers; an ad hoc spawn is its own figure', async ($, on) => {
    const other = { task: 'T-77', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: 5, usd: 50, sessionId: 'sess-other', root: '/elsewhere' }
    const w = world(on, { model: FABLE, store: { 'delegation.tasks.T-77': [other] } })
    w.usd = 9
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000))) // $1.875
    await $.agent.spawn(spawnInput({ prompt: 'Look around and tell me what you find.' })) // agent-1, ad hoc
    await $.turn.complete(turnInput('agent-1', 'found', usage(SONNET, 1_000_000, 0))) // $2.00
    const text = (await $.command.run(delegation)).text
    expect(text).toContain('workers $0.00 (0 attempts)')
    expect(text).toContain('ad hoc $2.00 (1 agents)')
    expect(text).toContain('unattributed $5.13')
    expect(text).toContain('brain share 21%')
    expect(w.store.get('delegation.adhoc')).toMatchObject([{ sessionId: 'sess-1' }])
  })

  test('MOD-47: main-loop turns before and after a session-id change (or a mod reload) all count in the brain record', async ($, on) => {
    const opts = { model: FABLE, sessionId: 'sess-1' }
    const w = world(on, opts)
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000)))
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000)))
    // a resume: a new session id and a session state that starts empty
    opts.sessionId = 'sess-2'
    w.state.clear()
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000)))
    // a reload of the mod: the state view is gone, the session is the same
    w.state.clear()
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000)))
    const out = await $.command.run(delegation)
    expect(out.text).toContain('brain: fable $7.50 over 4 turns')
  })

  test('MOD-47: an ad hoc agent resumed once is counted once, however many times a turn.complete reaches the hook', async ($, on) => {
    const w = world(on, { model: FABLE })
    w.usd = 20
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 0, 0))) // the brain line shows once the brain has a turn
    await $.agent.spawn(spawnInput({ prompt: 'Look around and tell me what you find.' })) // agent-1, ad hoc
    const first = usage(SONNET, 1_000_000, 0) // $2.00
    await $.turn.complete(turnInput('agent-1', 'found', first, 'turn-a'))
    await $.turn.complete(turnInput('agent-1', 'found', first, 'turn-a')) // the same turn, delivered again
    await $.turn.complete(turnInput('agent-1', 'and more', usage(SONNET, 500_000, 0), 'turn-b')) // the resume (SendMessage): $1.00
    await $.turn.complete(turnInput('agent-1', 'and more', usage(SONNET, 500_000, 0), 'turn-b'))
    const text = (await $.command.run(delegation)).text
    expect(text).toContain('ad hoc $3.00 (1 agents)')
  })

  test('a worker turn.complete never counts as the brain', async ($, on) => {
    const w = world(on, { model: FABLE })
    await $.session.start(sessionStart)
    await $.turn.complete(turnInput('agent-9', 'working', usage(SONNET, 1_000_000, 0)))
    expect(w.state.get('chassis-delegation.brain')).toBeUndefined()
  })

  test('delegateOnly deny: the main loop cannot edit source, and the denial names the card tool', OPTS, async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Edit' }, passed)
    on('tool.call', { tool: 'Write' }, passed)
    await $.session.start(sessionStart)
    const r = await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/hooks/lib/a.ts`, old_string: 'a', new_string: 'b' } as never)
    expect(r.deny).toBe('chassis-delegation: delegateOnly is on: the brain does not edit source. Describe the task and call the card tool, or set delegateOnly off.')
    expect(r.deny).toContain('card tool')
    // under the card folder, docs/ and .delegation/ it runs
    const card = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/agents/tasks/T-1.md`, content: 'x' } as never)
    expect(card.deny).toBeUndefined()
    const doc = await $.tool.call({ tool: 'Write', file_path: `${ROOT}/docs/a.md`, content: 'x' } as never)
    expect(doc.deny).toBeUndefined()
    // every brain edit counts, allowed or not
    expect((w.state.get('chassis-delegation.brain') as { edits: number }).edits).toBe(3)
    const out = await $.command.run(delegation)
    expect(out.text).toContain('brain edits: 3')
  })

  test('delegateOnly deny: a Bash write into the root is denied, a read is not', OPTS, async ($, on) => {
    world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    expect((await $.tool.call({ tool: 'Bash', command: 'echo x > src/a.ts' } as never)).deny).toContain('delegateOnly is on')
    expect((await $.tool.call({ tool: 'Bash', command: "sed -i 's/a/b/' src/a.ts" } as never)).deny).toContain('delegateOnly is on')
    expect((await $.tool.call({ tool: 'Bash', command: 'cat src/a.ts | head' } as never)).deny).toBeUndefined()
  })

  test('MOD-8: delegateOnly deny: a variable pointing outside the root is no write in it; $PWD is', OPTS, async ($, on) => {
    world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    const outside = "M=/elsewhere/memory; cat >> $M/p.md <<'EOF'\nhi\nEOF"
    expect((await $.tool.call({ tool: 'Bash', command: outside } as never)).deny).toBeUndefined()
    const pwd = await $.tool.call({ tool: 'Bash', command: 'echo x > $PWD/hooks/x.ts' } as never)
    expect(pwd.deny).toContain('card tool')
  })

  test('MOD-9: delegateOnly deny: a cd out of the root, then a relative write, is no write in the root; a cd into it is', OPTS, async ($, on) => {
    world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    const out = `cd ${ROOT}-MOD-8 && rm -rf .claude-plugin/types && cp -R ${ROOT}/.claude-plugin/types .claude-plugin/ && echo x > hooks/x.ts`
    expect((await $.tool.call({ tool: 'Bash', command: out } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'cd /elsewhere/wt && echo x > a.md' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: `cd ${ROOT} && echo x > hooks/x.ts` } as never)).deny).toContain('card tool')
  })

  test('MOD-9: delegateOnly deny: git -C outside the root commits freely; in the root the staged paths are judged', OPTS, async ($, on) => {
    let staged = 'docs/cards/X.md\n'
    const w = world(on, { model: FABLE, run: argv => (argv.slice(0, 4).join(' ') === `git -C ${ROOT} diff` && argv.includes('--cached') ? { exitCode: 0, stdout: staged } : undefined) })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    expect((await $.tool.call({ tool: 'Bash', command: 'git -C /elsewhere/repo commit -m x' } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)).deny).toBeUndefined()
    expect(argvs(w).some(a => a.includes('--cached'))).toBe(true)
    staged = 'hooks/lib/brain.ts\n'
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)).deny).toContain('card tool')
  })

  test('a worker tool.call is untouched, and so is a sonnet brain', OPTS, async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Edit' }, passed)
    await $.session.start(sessionStart)
    const edit = { tool: 'Edit', file_path: `${ROOT}/hooks/lib/a.ts`, old_string: 'a', new_string: 'b' }
    expect((await $.tool.call({ ...edit, agentId: 'agent-3' } as never)).deny).toBeUndefined()
    expect(w.state.get('chassis-delegation.brain')).toBeUndefined()
    w.model = SONNET
    expect((await $.tool.call(edit as never)).deny).toBeUndefined()
  })

  test('delegateOnly off (the default): nothing is denied', async ($, on) => {
    world(on, { model: FABLE })
    on('tool.call', { tool: 'Edit' }, passed)
    await $.session.start(sessionStart)
    expect((await $.tool.call({ tool: 'Edit', file_path: `${ROOT}/hooks/lib/a.ts`, old_string: 'a', new_string: 'b' } as never)).deny).toBeUndefined()
  })

  test('delegateOnly warn: the edit runs and one row per turn says so', { options: { delegateOnly: 'warn' } }, async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Edit' }, passed)
    await $.session.start(sessionStart)
    const edit = { tool: 'Edit', file_path: `${ROOT}/hooks/lib/a.ts`, old_string: 'a', new_string: 'b' } as never
    expect((await $.tool.call(edit)).deny).toBeUndefined()
    expect((await $.tool.call(edit)).deny).toBeUndefined()
    const text = delivered(w)
    expect(text).toContain('chassis-delegation: the brain edited hooks/lib/a.ts itself; a card would have delegated it (delegateOnly=warn)')
    expect(text.split('the brain edited').length - 1).toBe(1)
    await $.turn.complete(mainTurn(usage(FABLE, 1, 1)))
    await $.tool.call(edit)
    expect(delivered(w).split('the brain edited').length - 1).toBe(2)
  })

  test('posture: a fable brain with delegateOnly on is told so at the top of the delegation state; off or a sonnet brain is not', OPTS, async ($, on) => {
    const w = world(on, { model: FABLE })
    await $.session.start(sessionStart)
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)
    expect(section?.text.split('\n').slice(0, 3)).toEqual([
      'Delegation state (chassis-delegation):',
      'You are the brain on a premium model. Build work goes to workers through the card tool; you read the repo to write cards, verify hand-backs, and read diffs.',
      'Do not edit source or run the test suite yourself.',
    ])
    expect((section?.text.split('\n').length ?? 99)).toBeLessThanOrEqual(40)
    w.model = SONNET
    const none = (await $.prompt.compose(composeInput(['Agent']))).sections.map(s => s.text).join('\n')
    expect(none).not.toContain('You are the brain on a premium model')
  })

  test('the dashboard text carries the split and a brain row in spend by model', async ($, on) => {
    world(on, { model: FABLE, panesUnplaced: 'no panes here' })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000)))
    const out = await $.command.run({ command: 'delegation', args: 'dashboard', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    expect(out.text).toContain('Spend split: brain $1.88 / workers $0.00')
    expect(out.text).toContain('brain · fable · $1.88 · 630k tok · 1 turn')
  })
})

describe('MOD-6: /delegation debrief', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const FOLDER = `${ROOT}/.delegation/debriefs`
  const DEBRIEF = `${FOLDER}/2026-10-10-mod-run.json`
  const FINDINGS = `${FOLDER}/2026-10-10-mod-run.findings.json`

  test('spawns the debrief agent at once and prints its id, the mode and the folder; a second call while it runs refuses naming it', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(w.spawns).toHaveLength(1)
    expect(w.spawns[0]).toMatchObject({ description: '🔵 debrief', model: 'sonnet' })
    expect(String(w.spawns[0]?.prompt)).toContain('mod_findings')
    expect(out).toContain('agent-1')
    expect(out).toContain('events')
    expect(out).toContain(`${FOLDER}/`)
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ agentId: 'agent-1', builtIn: true })
    const again = String((await $.command.run(delegation('debrief'))).text)
    expect(again).toContain('agent-1')
    expect(again.split('\n')).toHaveLength(1)
    expect(w.spawns).toHaveLength(1)
  })

  test('it runs while a worker is running, and says so in one line and in the prompt', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard]]\nDo it.' }))
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(w.spawns).toHaveLength(2)
    expect(out).toMatch(/1 worker running/)
    expect(String(w.spawns[1]?.prompt)).toMatch(/1 worker running/)
  })

  test('the hand-back: a went_wrong finding with a denylisted word leaves a .findings.json without the word and prints a [1] line', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const finding = { kind: 'went_wrong', surface: '/delegation accept', fault_class: 'bug', severity: 'P2', title: 'Globex row stayed owed', body: `see ${HOME}/globex-app`, evidence: ['Globex-1 refuted'] }
    const w = world(on, { listAgents: true, files: { [DEBRIEF]: JSON.stringify({ summary: 'x', mod_findings: [finding] }) } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    const written = w.files.get(FINDINGS) ?? ''
    expect(written).not.toBe('')
    expect(written.toLowerCase()).not.toContain('globex')
    expect(JSON.parse(written)).toMatchObject({ debrief: DEBRIEF, scrubbed: true, findings: [{ kind: 'went_wrong', severity: 'P2', title: '<redacted> row stayed owed' }] })
    const shown = [...w.appended.map(a => a.text), ...w.logs].join('\n')
    expect(shown).toContain('[1] went_wrong · P2 · /delegation accept · <redacted> row stayed owed')
    expect(shown).toContain(`drafts: ${FINDINGS}`)
    expect(shown.toLowerCase()).not.toContain('globex')
  })

  test('an empty mod_findings prints no findings', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: { [DEBRIEF]: '{"mod_findings":[]}' } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect([...w.appended.map(a => a.text), ...w.logs].join('\n')).toContain('no findings')
  })
})

describe('MOD-10: the debrief hand-back is validated against its window', () => {
  // MOD-130: a quarter-hour cooldown and a five-minute idle wait (the built-ins are DEFAULT_DEBRIEF_COOLDOWN_HOURS and 20 minutes) keep the simulated idling short; each advance fires every pending timer, so time costs real time
  const IDLE_MIN = 5
  const COOL = Math.min(0.25, DEFAULT_DEBRIEF_COOLDOWN_HOURS)
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const FOLDER = `${ROOT}/.delegation/debriefs`
  const DEBRIEF = `${FOLDER}/2026-10-10-mod-run.json`
  const FINDINGS = `${FOLDER}/2026-10-10-mod-run.findings.json`
  const CRUMBS = `${HOME}/.claude/harness/breadcrumbs/sess-1.jsonl`
  const crumbs = [
    ['2026-10-08T09:00:00Z', 'session_start'],
    ['2026-10-10T10:00:00Z', 'correction'],
    ['2026-10-10T10:05:00Z', 'permission_prompt'],
    ['2026-10-10T10:20:00Z', 'session_end'],
  ].map(([ts, kind]) => JSON.stringify({ ts, kind, detail: {} })).join('\n') + '\n'
  const PRIOR = { lastAt: 5, watermark: 1, lines: 1, sessionId: 'sess-1', mode: 'breadcrumbs' }
  const finding = { kind: 'went_wrong', surface: 'verifier', fault_class: 'bug', severity: 'P2', title: 'Verdict row went missing', body: 'It did.', evidence: ['e'] }
  const files = (debrief: object) => ({ [CRUMBS]: crumbs, [`${CRUMBS.replace(/\.jsonl$/, '.done')}`]: '1\n', [DEBRIEF]: JSON.stringify({ summary: 'x', mod_findings: [finding], ...debrief }) })
  const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')

  test('an out-of-window entry leaves the debrief record unchanged, writes no findings file and prints the stripped line', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const bad = { tool_denials: [{ text: 'Bash denied', at: '2026-10-08T09:00:00Z' }] }
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR }, files: files(bad) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(out).toContain('lines 2 to 4')
    expect(String(w.spawns[0]?.prompt)).toContain('2026-10-10T10:20:00Z')
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject(PRIOR)
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ failedChecks: { watermark: 1, count: 1 } })
    expect(w.files.has(FINDINGS)).toBe(false)
    expect(shown(w)).toContain('stripped 1 tool_denials entry outside the window')
    expect(shown(w)).toContain('record not moved')
    expect(JSON.parse(w.files.get(DEBRIEF) ?? '{}').tool_denials).toEqual([])
    expect(w.files.get(CRUMBS.replace(/\.jsonl$/, '.done'))).toBe('1\n')
  })

  test('MOD-91 (#156): a debrief whose check fails twice starts no third time, says the stopped row once, and leaves .check.txt and .orig.json beside the debrief', { options: { autoEval: false, debriefMode: 'transcript', debriefCooldownHours: COOL, debriefIdleMinutes: IDLE_MIN } }, async ($, on) => {
    const MIN = 60_000
    const HR = 60 * MIN
    const old = Array.from({ length: 10 }, () => JSON.stringify({ ts: '2026-10-08T09:00:00Z', kind: 'session_start', detail: {} }))
    const fresh = Array.from({ length: 30 }, (_, i) => JSON.stringify({ ts: `2026-10-10T10:${String(i % 60).padStart(2, '0')}:00Z`, kind: i % 2 ? 'correction' : 'permission_prompt', detail: {} }))
    const bad = JSON.stringify({ summary: 'x', mod_findings: [finding], tool_denials: [{ text: 'Bash denied', at: '2026-10-08T09:00:00Z' }] })
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': { ...PRIOR, lastAt: -30_000_000 } }, files: { [CRUMBS]: [...old, ...fresh].join('\n') + '\n', [CRUMBS.replace(/\.jsonl$/, '.done')]: '10\n', [DEBRIEF]: bad } })
    const mainT = { answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer' } as never
    const idle = async (hours: number) => {
      await w.clock.advance(hours * HR)
      await $.turn.complete(mainT)
      await w.clock.advance(IDLE_MIN * MIN)
    }
    await $.session.start(sessionStart)
    await idle(0)
    expect(w.spawns).toHaveLength(1)
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    // the failed attempt started a moment ago: the cooldown holds, though the last passed debrief is old
    await idle(0)
    expect(w.spawns).toHaveLength(1)
    await idle(COOL)
    expect(w.spawns).toHaveLength(2)
    w.files.set(DEBRIEF, bad)
    await $.turn.complete(turnInput('agent-2', `Wrote ${DEBRIEF}`))
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ watermark: 1, failedChecks: { watermark: 10, count: 2 } })
    await idle(COOL)
    await idle(COOL)
    expect(w.spawns).toHaveLength(2)
    const stopped = 'debrief stopped: the check failed twice on the window from line 10; run /delegation debrief to retry by hand'
    expect(w.appended.map(a => a.text).join('\n').split(stopped)).toHaveLength(2)
    const check = DEBRIEF.replace(/\.json$/, '.check.txt')
    const orig = DEBRIEF.replace(/\.json$/, '.orig.json')
    expect(w.files.get(check)).toContain('stripped 1 tool_denials entry outside the window')
    expect(w.files.get(orig)).toBe(bad)
    expect(shown(w)).toContain(check)
    expect(shown(w)).toContain(orig)
    // by hand still runs
    await $.command.run(delegation('debrief'))
    expect(w.spawns).toHaveLength(3)
  })

  test('a clean hand-back moves the record and writes the findings', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const ok = { tool_denials: [{ text: 'Bash denied', at: 3 }] }
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR }, files: files(ok) })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ watermark: 1, lines: 4, agentId: 'agent-1', path: DEBRIEF })
    expect((w.store.get('delegation.debrief.sess-1') as { lastAt: number }).lastAt).toBeGreaterThan(5)
    expect((w.store.get('delegation.debrief.sess-1') as { finishedAt?: number }).finishedAt).toBeDefined()
    expect(JSON.parse(w.files.get(FINDINGS) ?? '{}').findings).toHaveLength(1)
    expect(shown(w)).toContain('debrief check: clean')
  })

  // MOD-38: the breadcrumbs hold no correction (public #89), the transcript does
  const QUIET = ['2026-10-08T09:00:00Z', '2026-10-10T10:05:00Z', '2026-10-10T10:20:00Z'].map((ts, i) => JSON.stringify({ ts, kind: ['session_start', 'permission_prompt', 'session_end'][i], detail: {} })).join('\n') + '\n'
  const SAID = ['Do not touch the lockfile again', 'Use the other branch for this work', 'That summary is too long for me', 'Stop adding comments to every line']
  const userRows = SAID.map(text => ({ role: 'user', text }))
  const TRANSCRIPT = `${HOME}/.claude/projects/-repo-acme-app/sess-1.jsonl`
  const transcriptFile = SAID.map((text, i) => JSON.stringify({ type: 'user', message: { role: 'user', content: text }, timestamp: `2026-10-10T10:1${i}:00Z` })).join('\n') + '\n'
  const fourCorrections = (texts: string[]) => ({ corrections: texts.map((t, i) => ({ text: `"${t}"`, at: `2026-10-10T10:1${i}:30Z` })) })
  const quietFiles = (debrief: object) => ({ ...files(debrief), [CRUMBS]: QUIET })

  test('MOD-38: four corrections the transcript holds come back clean, move the record and send the watermark message', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR }, files: { ...quietFiles(fourCorrections(SAID)), [TRANSCRIPT]: transcriptFile } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(shown(w)).toContain('debrief check: clean (4 corrections evidenced by the transcript, none in the breadcrumbs)')
    expect((w.store.get('delegation.debrief.sess-1') as { finishedAt?: number }).finishedAt).toBeDefined()
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.text).toBe(MARK)
    expect(JSON.parse(w.files.get(DEBRIEF) ?? '{}').corrections.map((c: { source?: string }) => c.source)).toEqual(['transcript', 'transcript', 'transcript', 'transcript'])
  })

  test('MOD-38: with no transcript file, the engine\'s user rows match on the quote alone, marked untimed and said so', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, mainTranscript: userRows, store: { 'delegation.debrief.sess-1': PRIOR }, files: quietFiles(fourCorrections(SAID)) })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(shown(w)).toContain('4 corrections evidenced by the transcript, 4 untimed')
    expect(JSON.parse(w.files.get(DEBRIEF) ?? '{}').corrections[0].source).toBe('transcript-untimed')
    expect(w.sent).toHaveLength(1)
  })

  test('MOD-38: a correction the transcript does not hold is flagged as before and the record stands', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR }, files: { ...quietFiles(fourCorrections([...SAID.slice(0, 3), 'Something the user never typed'])), [TRANSCRIPT]: transcriptFile } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(shown(w)).toContain('flagged corrections')
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject(PRIOR)
    expect(w.sent).toHaveLength(0)
  })

  const SKILL = `${HOME}/.claude/commands/debrief.md`
  const MARK = 'debrief check: clean. Mark your watermark now, as your instructions say, and stop.'

  test('MOD-32: under the person\'s skill, a clean check sends the debrief agent the mark-your-watermark message, once', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: { ...files({ tool_denials: [{ text: 'Bash denied', at: 3 }] }), [SKILL]: '# debrief' } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.to).toBe('agent-1')
    expect(w.sent[0]?.text).toBe(MARK)
  })

  test('MOD-32: under the person\'s skill, a flagged check sends nothing and the printed result says the watermark was left', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const bad = { tool_denials: [{ text: 'Bash denied', at: '2026-10-08T09:00:00Z' }] }
    const w = world(on, { listAgents: true, files: { ...files(bad), [SKILL]: '# debrief' } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.sent).toHaveLength(0)
    expect(shown(w)).toContain('watermark was left as is')
  })

  test('MOD-32: the built-in template path sends the same message on a clean check', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: files({ tool_denials: [{ text: 'Bash denied', at: 3 }] }) })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.text).toBe(MARK)
  })

  test('a finding about the host goes to host_findings in the file and is counted in the printed result', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const host = { ...finding, surface: 'permission classifier', title: 'The classifier denied a read' }
    const w = world(on, { listAgents: true, files: files({ mod_findings: [finding, host] }) })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    const written = JSON.parse(w.files.get(FINDINGS) ?? '{}')
    expect(written.findings).toHaveLength(1)
    expect(written.host_findings).toHaveLength(1)
    expect(shown(w)).toContain('1 host_findings set aside')
  })
})

describe('MOD-26: a breadcrumbs debrief carries only the facts inside its window, and a window of session boundaries alone spawns nothing', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const CRUMBS = `${HOME}/.claude/harness/breadcrumbs/sess-1.jsonl`
  const DONE = CRUMBS.replace(/\.jsonl$/, '.done')
  const crumb = (ts: string, kind: string) => JSON.stringify({ ts, kind, detail: {} })
  const lines = (...rows: [string, string][]) => rows.map(([ts, kind]) => crumb(ts, kind)).join('\n') + '\n'
  const ms = (iso: string): number => Date.parse(iso)
  // what the mod saw hours before the window: a refute at 15:43, a denial at 16:27, a verdict at 18:01
  const EARLIER = {
    'delegation.friction.sess-1': {
      total: 2,
      events: [
        { kind: 'refuted', detail: 'OPS-4 attempt 1 refuted on scope', at: ms('2026-10-10T15:43:09Z') },
        { kind: 'denial', detail: 'Bash: rm -rf build', at: ms('2026-10-10T16:27:14Z') },
      ],
    },
    'delegation.recent.sess-1': [{ task: 'OPS-5', attempt: 1, verdict: 'consistent', line: 'chassis-delegation: OPS-5 attempt 1/2 consistent', at: ms('2026-10-10T18:01:07Z') }],
  }
  const PRIOR = { lastAt: ms('2026-10-10T09:30:00Z'), watermark: 0, lines: 1, sessionId: 'sess-1', mode: 'breadcrumbs', finishedAt: ms('2026-10-10T09:31:00Z') }
  // public issue #55: line 1 was debriefed (the .done mark), lines 2-3 are a session_end and a session_start nine seconds apart
  const BOUNDARY = lines(['2026-10-10T10:00:00Z', 'session_start'], ['2026-10-10T19:20:41Z', 'session_end'], ['2026-10-10T19:20:50Z', 'session_start'])
  const NO_AUTO = { options: { autoEval: false, autoDebrief: false } }
  const factLines = (prompt: unknown) => String(prompt).split('\n').filter(l => l.startsWith('- '))

  test('a window of only session_end and session_start lines spawns nothing and says so, and the record moves past it', NO_AUTO, async ($, on) => {
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR, ...EARLIER }, files: { [CRUMBS]: BOUNDARY, [DONE]: '1\n' } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(w.spawns).toHaveLength(0)
    expect(out).toBe('nothing to debrief in lines 2-3 (session boundaries only)')
    const rec = w.store.get('delegation.debrief.sess-1') as { lastAt: number; watermark: number; lines: number; skippedTo?: number; agentId?: string; finishedAt?: number; window?: unknown }
    expect(rec).toMatchObject({ mode: 'breadcrumbs', watermark: 1, lines: 3, skippedTo: 3 })
    expect(rec.lastAt).not.toBe(PRIOR.lastAt)
    expect(rec.finishedAt).toBeDefined()
    expect(rec.agentId).toBeUndefined()
    expect(rec.window).toBeUndefined()
    // the mod never writes the .done mark; the record is what moved
    expect(w.files.get(DONE)).toBe('1\n')
  })

  test('the next debrief starts after the skipped window: two more lines, and the window is lines 4 to 5', NO_AUTO, async ($, on) => {
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR, ...EARLIER }, files: { [CRUMBS]: BOUNDARY, [DONE]: '1\n' } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    w.files.set(CRUMBS, BOUNDARY + lines(['2026-10-10T19:30:00Z', 'correction'], ['2026-10-10T19:31:00Z', 'session_end']))
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(w.spawns).toHaveLength(1)
    expect(out).toContain('lines 4 to 5')
    const prompt = String(w.spawns[0]?.prompt)
    expect(prompt).toContain('covers breadcrumb lines 4 to 5 (watermark 3, end 5)')
    expect(factLines(prompt)).toEqual([])
  })

  test('a window holding one denial puts exactly that line, dated, in the prompt; the earlier refute, denial and verdict are not there', NO_AUTO, async ($, on) => {
    const stored = { ...EARLIER, 'delegation.friction.sess-1': { total: 3, events: [...EARLIER['delegation.friction.sess-1'].events, { kind: 'denial', detail: 'Bash: git push', at: ms('2026-10-10T19:20:45Z') }] } }
    const crumbs = lines(['2026-10-10T10:00:00Z', 'session_start'], ['2026-10-10T19:20:41Z', 'session_end'], ['2026-10-10T19:20:45Z', 'permission_denied'], ['2026-10-10T19:20:50Z', 'session_start'])
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR, ...stored }, files: { [CRUMBS]: crumbs, [DONE]: '1\n' } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(out).toContain('debrief started')
    expect(w.spawns).toHaveLength(1)
    const prompt = String(w.spawns[0]?.prompt)
    expect(factLines(prompt)).toEqual(['- denial 2026-10-10T19:20:45Z: Bash: git push'])
    for (const stale of ['15:43', '16:27', '18:01', 'OPS-4', 'OPS-5', 'rm -rf']) expect(prompt).not.toContain(stale)
    expect(prompt).toMatch(/cite (?:that|its) time as `at`/)
  })

  test('a boundary-only window with a verdict inside its span is not skipped: the verdict goes in, dated', NO_AUTO, async ($, on) => {
    // a session_end at 15:00 and a session_start at 19:20: the 18:01 verdict falls between them
    const crumbs = lines(['2026-10-10T10:00:00Z', 'session_start'], ['2026-10-10T15:00:00Z', 'session_end'], ['2026-10-10T19:20:50Z', 'session_start'])
    const w = world(on, { listAgents: true, store: { 'delegation.debrief.sess-1': PRIOR, ...EARLIER }, files: { [CRUMBS]: crumbs, [DONE]: '1\n' } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(out).not.toContain('nothing to debrief')
    expect(w.spawns).toHaveLength(1)
    // the refute at 15:43 and the denial at 16:27 fall in that span too; all three are dated
    expect(factLines(w.spawns[0]?.prompt)).toEqual([
      '- refuted 2026-10-10T15:43:09Z: OPS-4 attempt 1 refuted on scope',
      '- denial 2026-10-10T16:27:14Z: Bash: rm -rf build',
      '- verdict 2026-10-10T18:01:07Z: chassis-delegation: OPS-5 attempt 1/2 consistent',
    ])
  })

  test('without breadcrumbs the selection is today\'s, and each line is dated', NO_AUTO, async ($, on) => {
    const w = world(on, { listAgents: true, store: { ...EARLIER } })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    expect(factLines(w.spawns[0]?.prompt)).toEqual([
      '- refuted 2026-10-10T15:43:09Z: OPS-4 attempt 1 refuted on scope',
      '- denial 2026-10-10T16:27:14Z: Bash: rm -rf build',
      '- verdict 2026-10-10T18:01:07Z: chassis-delegation: OPS-5 attempt 1/2 consistent',
    ])
  })
})

describe('MOD-7: /delegation debrief post', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const FOLDER = `${ROOT}/.delegation/debriefs`
  const FINDINGS = `${FOLDER}/2026-10-10-mod-run.findings.json`
  const REPO_FILE = `${ROOT}/.chassis-delegation.json`
  const one = (over: Record<string, unknown>) => ({ kind: 'went_wrong', surface: '/delegation accept', fault_class: 'bug', severity: 'P2', title: 'Accepted row stayed owed', body: 'It came back.', evidence: ['e1'], ...over })
  const FILE = JSON.stringify({ debrief: 'x', modVersion: '0.6.0', scrubbed: true, findings: [one({}), one({ kind: 'went_well', surface: '/delegation debrief', title: 'Debrief wrote findings at once', fault_class: 'design', severity: 'P3' })] })
  const ISSUES = JSON.stringify([{ number: 4, title: 'Another thing', body: '**Surface:** /delegation dashboard' }])
  const isWrite = (argv: string[]) => argv[0] === 'gh' && argv[1] === 'issue' && (argv[2] === 'create' || argv[2] === 'comment')
  const ghRun = (argv: string[]) => {
    if (argv[0] === 'gh' && argv[2] === 'list') return { exitCode: 0, stdout: ISSUES }
    if (argv[0] === 'gh' && argv[2] === 'create') return { exitCode: 0, stdout: 'https://github.com/owner/mod/issues/31\n' }
    return { exitCode: 0, stdout: '' }
  }
  const files = { [FINDINGS]: FILE, [REPO_FILE]: '{"issueRepo":"owner/mod"}' }
  const dirs = { [FOLDER]: ['2026-10-10-mod-run.findings.json'] }

  test('post alone prints both findings in full with their status and runs no gh write', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post'))).text)
    expect(out).toContain('[1] new')
    expect(out).toContain('[2] new')
    expect(out).toContain('Accepted row stayed owed')
    expect(out).toContain('[went well] Debrief wrote findings at once')
    expect(out).toContain('**Surface:** /delegation accept · **Fault class:** bug · **Severity:** P2')
    expect(out).toContain(`posted by chassis-delegation ${MOD_VERSION} via /delegation debrief`)
    expect(w.runs.some(r => isWrite(r.argv))).toBe(false)
    expect(w.runs.some(r => r.argv.join(' ').includes('issue list'))).toBe(true)
  })

  test('post 1 runs exactly one gh issue create with that argv and records the number', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    const writes = w.runs.filter(r => isWrite(r.argv))
    expect(writes).toHaveLength(1)
    expect(writes[0]?.argv).toEqual(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'Accepted row stayed owed', '--body-file', `${FOLDER}/2026-10-10-mod-run.post-1.md`])
    expect(out).toContain('#31 https://github.com/owner/mod/issues/31')
    expect(w.files.get(`${FOLDER}/2026-10-10-mod-run.post-1.md`)).toContain('**Surface:** /delegation accept')
    expect(JSON.parse(w.files.get(FINDINGS) ?? '{}').findings[0]).toMatchObject({ issue: 31 })
    // a later post skips it
    await $.command.run(delegation('debrief post all'))
    expect(w.runs.filter(r => isWrite(r.argv)).map(r => r.argv[6])).toEqual(['Accepted row stayed owed', '[went well] Debrief wrote findings at once'])
  })

  test('a covered finding is skipped under all and commented when named', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const covered = JSON.stringify([{ number: 9, title: 'Accepted row stayed owed forever', body: '**Surface:** /delegation accept' }])
    const w = world(on, { files, dirs, run: argv => (argv[2] === 'list' ? { exitCode: 0, stdout: covered } : ghRun(argv)) })
    await $.session.start(sessionStart)
    const shown = String((await $.command.run(delegation('debrief post'))).text)
    expect(shown).toContain('[1] covered by #9')
    const all = String((await $.command.run(delegation('debrief post all'))).text)
    expect(all).toContain('#9')
    expect(w.runs.filter(r => isWrite(r.argv)).map(r => r.argv[2])).toEqual(['create'])
    await $.command.run(delegation('debrief post 1'))
    expect(w.runs.filter(r => isWrite(r.argv)).map(r => r.argv.slice(0, 5))).toContainEqual(['gh', 'issue', 'comment', '9', '--repo'])
  })

  test('MOD-10: post with two mod findings and one host finding lists two and says one set aside; it files only the two', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const host = one({ surface: 'permission classifier', title: 'The classifier denied a read' })
    const withHost = JSON.stringify({ findings: JSON.parse(FILE).findings, host_findings: [host] })
    const w = world(on, { files: { [FINDINGS]: withHost, [REPO_FILE]: '{"issueRepo":"owner/mod"}' }, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const shown = String((await $.command.run(delegation('debrief post'))).text)
    expect(shown).toContain('[2] new')
    expect(shown).not.toContain('[3]')
    expect(shown).not.toContain('The classifier denied a read')
    expect(shown).toContain('1 host_findings set aside')
    await $.command.run(delegation('debrief post all'))
    expect(w.runs.filter(r => isWrite(r.argv))).toHaveLength(2)
  })

  test('with issueRepo empty it says so and posts nothing', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { [FINDINGS]: FILE, [REPO_FILE]: '{"issueRepo":""}' }, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    expect(out).toContain('issueRepo')
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('a body with a redact-list word is scrubbed at post time; nothing leaves with it', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const dirty = JSON.stringify({ findings: [one({ body: 'Globex broke it' })] })
    const w = world(on, { files: { [FINDINGS]: dirty, [REPO_FILE]: '{"issueRepo":"owner/mod"}' }, dirs, run: ghRun })
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief post 1'))
    const body = w.files.get(`${FOLDER}/2026-10-10-mod-run.post-1.md`) ?? ''
    expect(body.toLowerCase()).not.toContain('globex')
    expect(body).toContain('<redacted> broke it')
  })

  const REDACT_WARNING = 'run /delegation config redact <words>, the product, customer, employer and repo names this session must never publish, then post again'
  const MANIFEST = JSON.stringify({ name: 'chassis-delegation', version: '0.7.0', repository: 'https://github.com/acme/mod' })
  /** Puts the mod's manifest where the loaded copy keeps it; the plugin folder is the one /delegation says it loaded from. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const withManifest = async ($: any, w: { files: Map<string, string> }, text: string = MANIFEST): Promise<void> => {
    const first = String((await $.command.run(delegation(''))).text)
    const root = /loaded from (\S+)/.exec(first)?.[1] ?? ''
    w.files.set(`${root}/.claude-plugin/plugin.json`, text)
  }

  test('MOD-18: with the redact list empty, post 1 runs no gh write and prints the set-redact line', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    expect(out).toContain(REDACT_WARNING)
    expect(w.runs.some(r => isWrite(r.argv))).toBe(false)
    expect(w.files.has(`${FOLDER}/2026-10-10-mod-run.post-1.md`)).toBe(false)
    expect(JSON.parse(w.files.get(FINDINGS) ?? '{}').findings[0].issue).toBeUndefined()
    // all is refused the same way
    expect(String((await $.command.run(delegation('debrief post all'))).text)).toContain(REDACT_WARNING)
    expect(w.runs.some(r => isWrite(r.argv))).toBe(false)
  })

  test('MOD-18: with the redact list set, post 1 files as before', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    expect(out).not.toContain(REDACT_WARNING)
    expect(w.runs.filter(r => isWrite(r.argv)).map(r => r.argv[2])).toEqual(['create'])
    expect(out).toContain('#31')
  })

  test('MOD-18: post alone with the redact list empty still shows the drafts, headed by the same warning', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post'))).text)
    expect(out.split('\n')[0]).toContain(REDACT_WARNING)
    expect(out).toContain('[1] new')
    expect(out).toContain('[2] new')
    expect(w.runs.some(r => isWrite(r.argv))).toBe(false)
  })

  test('MOD-18: post alone with the redact list set carries no warning', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    world(on, { files, dirs, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post'))).text)
    expect(out).not.toContain(REDACT_WARNING)
    expect(out).toContain('[1] new')
  })

  test('MOD-18: a repo file without issueRepo shows the mod\'s own tracker on /delegation, and one that names a repo shows only that', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { files: { [REPO_FILE]: '{"maxWorkers":2}' } })
    await $.session.start(sessionStart)
    await withManifest($, w)
    const out = String((await $.command.run(delegation(''))).text)
    expect(out).toContain("issues: acme/mod (the mod's own tracker)")
    w.files.set(REPO_FILE, '{"issueRepo":"owner/other"}')
    const named = String((await $.command.run(delegation(''))).text)
    expect(named).toContain('issues: owner/other')
    expect(named).not.toContain("own tracker")
    w.files.set(REPO_FILE, '{"issueRepo":""}')
    expect(String((await $.command.run(delegation(''))).text)).not.toContain('issues:')
  })

  test('MOD-18: with no issueRepo in the repo file the default repo is the one gh is asked about, and a post goes to it', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { [FINDINGS]: FILE, [REPO_FILE]: '{"maxWorkers":2}' }, dirs, run: ghRun })
    await $.session.start(sessionStart)
    await withManifest($, w)
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    expect(out).toContain('#31')
    const gh = w.runs.filter(r => r.argv[0] === 'gh').map(r => r.argv)
    expect(gh.map(a => a[a.indexOf('--repo') + 1])).toEqual(['acme/mod', 'acme/mod'])
    expect(gh.map(a => a[2])).toEqual(['list', 'create'])
  })

  test('MOD-18: a manifest that names no repository leaves posting off, as before', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const w = world(on, { files: { [FINDINGS]: FILE }, dirs, run: ghRun })
    await $.session.start(sessionStart)
    await withManifest($, w, JSON.stringify({ name: 'chassis-delegation', version: '0.7.0' }))
    const out = String((await $.command.run(delegation('debrief post 1'))).text)
    expect(out).toContain('issueRepo')
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  describe("MOD-18: the agent's own proposals under the findings", () => {
    const DEBRIEF = `${FOLDER}/2026-10-10-mod-run.json`
    const PROPOSALS = {
      proposed_harness_changes: [
        { target: 'CLAUDE.md', rationale: 'r1', proposed_diff_summary: 'Add a rule that a card names its gate.' },
        { target: 'memory/feedback.md', rationale: 'r2', proposed_diff_summary: 'Note that the verdict row is read first.' },
      ],
      harness_gaps: ['a rule would have stopped the rework'],
      stale_memory: ['the old gate note'],
    }
    const finding = one({})
    const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')

    test('the hand-back prints the proposals after the findings lines', { options: { autoEval: false } }, async ($, on) => {
      const w = world(on, { listAgents: true, files: { [DEBRIEF]: JSON.stringify({ summary: 'x', mod_findings: [finding], ...PROPOSALS }) } })
      await $.session.start(sessionStart)
      await $.command.run(delegation('debrief'))
      await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
      const text = shown(w)
      expect(text).toContain('proposals: 2 for you to review (never posted)')
      expect(text).toContain('CLAUDE.md · Add a rule that a card names its gate.')
      expect(text).toContain('memory/feedback.md · Note that the verdict row is read first.')
      expect(text).toContain('harness_gaps: 1 · stale_memory: 1')
      expect(text.indexOf('proposals: 2')).toBeGreaterThan(text.indexOf(`drafts: ${FINDINGS}`))
      // never posted: they are not in the findings file
      expect(w.files.get(FINDINGS) ?? '').not.toContain('Add a rule')
    })

    test('proposals still print when there are no mod findings', { options: { autoEval: false } }, async ($, on) => {
      const w = world(on, { listAgents: true, files: { [DEBRIEF]: JSON.stringify({ mod_findings: [], ...PROPOSALS }) } })
      await $.session.start(sessionStart)
      await $.command.run(delegation('debrief'))
      await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
      const text = shown(w)
      expect(text).toContain('no findings')
      expect(text.indexOf('proposals: 2')).toBeGreaterThan(text.indexOf('no findings'))
    })

    test('a debrief with none prints no proposals line', { options: { autoEval: false } }, async ($, on) => {
      const w = world(on, { listAgents: true, files: { [DEBRIEF]: JSON.stringify({ mod_findings: [finding], proposed_harness_changes: [], harness_gaps: [], stale_memory: [] }) } })
      await $.session.start(sessionStart)
      await $.command.run(delegation('debrief'))
      await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
      expect(shown(w)).not.toContain('proposals:')
    })

    test('/delegation debrief post shows the same block under the findings, from the debrief the findings file names', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
      const named = JSON.stringify({ debrief: DEBRIEF, modVersion: '0.7.0', scrubbed: true, findings: [finding] })
      const w = world(on, { files: { [FINDINGS]: named, [DEBRIEF]: JSON.stringify({ mod_findings: [finding], ...PROPOSALS }), [REPO_FILE]: '{"issueRepo":"owner/mod"}' }, dirs, run: ghRun })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(delegation('debrief post'))).text)
      expect(out).toContain('proposals: 2 for you to review (never posted)')
      expect(out).toContain('CLAUDE.md · Add a rule that a card names its gate.')
      expect(out.indexOf('proposals: 2')).toBeGreaterThan(out.indexOf('[1] new'))
      const filed = String((await $.command.run(delegation('debrief post 1'))).text)
      expect(filed).toContain('proposals: 2 for you to review (never posted)')
      expect(w.runs.filter(r => isWrite(r.argv))).toHaveLength(1)
      // and with none in the debrief, nothing
      w.files.set(DEBRIEF, JSON.stringify({ mod_findings: [finding] }))
      expect(String((await $.command.run(delegation('debrief post'))).text)).not.toContain('proposals:')
    })
  })

  describe('MOD-34: per-domain lessons', () => {
    const LDIR = `${ROOT}/agents/tasks`
    const O34 = { options: { briefDir: `${SCRATCH}/briefs` } }
    const lfiles = (): Record<string, string> => ({ [`${LDIR}/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD })
    const ldirs = { [LDIR]: [FIXTURE_CARD_NAME] }

    test('/delegation lesson mod <text> creates the file with a dated line and prints the count and cap', O34, async ($, on) => {
      const f = lfiles()
      f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ domains: ['mod', 'ops'] })
      const w = world(on, { files: f, dirs: ldirs })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(delegation("lesson mod 'never forbid tests/** on a bump'"))).text)
      const file = w.files.get(`${LDIR}/lessons/mod.md`) ?? ''
      expect(file).toMatch(/^- \d{4}-\d{2}-\d{2} never forbid tests\/\*\* on a bump\n$/)
      expect(out).toContain('1 line')
      expect(out).toContain('40')
      const shown = String((await $.command.run(delegation('lesson mod'))).text)
      expect(shown).toContain('never forbid tests/** on a bump')
    })

    test('a domain not in the list is refused naming the list', O34, async ($, on) => {
      const w = world(on, { files: lfiles(), dirs: ldirs })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(delegation('lesson nope some text'))).text)
      expect(out).toContain('nope')
      expect(out).toContain('ops')
      expect(w.files.has(`${LDIR}/lessons/nope.md`)).toBe(false)
    })

    test('the dispatch dry run carries the file into the brief and prints lessons: n lines', O34, async ($, on) => {
      const f = lfiles()
      f[`${LDIR}/lessons/backend.md`] = '- 2026-10-10 restate the live-page lesson\n'
      f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ briefTemplate: '/tpl/brief.md' })
      f['/tpl/brief.md'] = '{{id}}\n{{body}}\n{{#lessons}}\n\n{{lessons}}\n{{/lessons}}\n'
      const w = world(on, { files: f, dirs: ldirs })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
      expect(out).toContain(`lessons: 1 lines from ${LDIR}/lessons/backend.md`)
      expect(w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').toContain('## Lessons (backend)')
    })

    test('no file prints no lessons line', O34, async ($, on) => {
      world(on, { files: lfiles(), dirs: ldirs })
      await $.session.start(sessionStart)
      expect(String((await $.command.run(commandInput('BE-101 --dry-run'))).text)).not.toContain('lessons:')
    })
  })

  describe('MOD-33: /delegation debrief apply', () => {
    const DEBRIEF = `${FOLDER}/2026-10-10-mod-run.json`
    const SUMMARY = 'Add a rule that a card names its gate.'
    const DJSON = JSON.stringify({ mod_findings: [], proposed_harness_changes: [{ target: 'CLAUDE.md', rationale: 'r1', proposed_diff_summary: SUMMARY }, { target: 'memory/x.md', rationale: 'r2', proposed_diff_summary: 'Note that the verdict row is read first.' }] })
    const adirs = { [FOLDER]: ['2026-10-10-mod-run.json', '2026-10-10-mod-run.findings.json'] }
    const afiles = () => ({ [DEBRIEF]: DJSON, [FINDINGS]: JSON.stringify({ debrief: DEBRIEF, modVersion: '0.7.0', scrubbed: true, findings: [], host_findings: [] }) })
    const O = { options: { autoEval: false } }

    test('apply lists the latest debrief proposals numbered with a status', O, async ($, on) => {
      world(on, { files: afiles(), dirs: adirs })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(delegation('debrief apply'))).text)
      expect(out).toContain(`[1] CLAUDE.md \u00b7 ${SUMMARY} \u00b7 open`)
      expect(out).toContain('[2] memory/x.md')
    })

    test('apply with none prints no proposals in <debrief path>', O, async ($, on) => {
      world(on, { files: { [DEBRIEF]: JSON.stringify({ proposed_harness_changes: [] }) }, dirs: { [FOLDER]: ['2026-10-10-mod-run.json'] } })
      await $.session.start(sessionStart)
      expect(String((await $.command.run(delegation('debrief apply'))).text)).toBe(`no proposals in ${DEBRIEF}`)
    })

    test('apply 2 prints it in full with one instruction block; an unknown n prints one line', O, async ($, on) => {
      const w = world(on, { files: afiles(), dirs: adirs })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(delegation('debrief apply 2'))).text)
      expect(out).toContain('r2')
      expect(out).toContain('draft the edit to memory/x.md as a diff')
      expect(out).toContain('/delegation debrief apply 2 done')
      const bad = String((await $.command.run(delegation('debrief apply 9'))).text)
      expect(bad.split('\n')).toHaveLength(1)
      expect(w.files.get(FINDINGS) ?? '').not.toContain('proposals_status')
    })

    test('apply 2 done <note> writes proposals_status and the list shows it', O, async ($, on) => {
      const w = world(on, { files: afiles(), dirs: adirs })
      await $.session.start(sessionStart)
      await $.command.run(delegation('debrief apply 2 done fixed in memory'))
      const rec = JSON.parse(w.files.get(FINDINGS) ?? '{}').proposals_status
      expect(rec).toHaveLength(1)
      expect(rec[0]).toMatchObject({ n: 2, status: 'done', note: 'fixed in memory' })
      expect(typeof rec[0].at).toBe('string')
      const out = String((await $.command.run(delegation('debrief apply'))).text)
      expect(out).toContain('done: fixed in memory')
      await $.command.run(delegation('debrief apply 1 dismiss not worth it'))
      expect(String((await $.command.run(delegation('debrief apply'))).text)).toContain('dismissed: not worth it')
    })

    test('the next debrief prompt carries already done: / dismissed: for a settled summary', O, async ($, on) => {
      const w = world(on, { listAgents: true, files: afiles(), dirs: adirs })
      await $.session.start(sessionStart)
      await $.command.run(delegation('debrief apply 1 done'))
      await $.command.run(delegation('debrief apply 2 dismiss no'))
      await $.command.run(delegation('debrief'))
      const prompt = w.spawns[0]?.prompt ?? ''
      expect(prompt).toContain(`already done: ${SUMMARY}`)
      expect(prompt).toContain('dismissed: Note that the verdict row is read first.')
    })

    test('the state section carries the open-proposals line while one is open and not after', O, async ($, on) => {
      world(on, { files: afiles(), dirs: adirs })
      await $.session.start(sessionStart)
      const state = async () => (await $.prompt.compose(composeInput(['Agent']))).sections.find(s => s.id === 'chassis-delegation:state')?.text ?? ''
      expect(await state()).toContain('2 debrief proposals open \u2014 /delegation debrief apply')
      await $.command.run(delegation('debrief apply 1 done'))
      expect(await state()).toContain('1 debrief proposals open \u2014 /delegation debrief apply')
      await $.command.run(delegation('debrief apply 2 dismiss'))
      expect(await state()).not.toContain('debrief proposals open')
    })
  })
})

describe('MOD-12 (#22): the brain spawns, the mod shapes', () => {
  const TOOL = 'mcp__chassis-delegation__dispatch'
  const BRIEF = `${SCRATCH}/briefs/BE-101.brief.md`
  const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
  const STARTS = 'The worker starts when you make this Agent call'
  const files = (): Record<string, string> => ({ [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD })
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const BRIEFS = { briefDir: `${SCRATCH}/briefs` }
  const LLM = 'app/billing/Rate*.ts'
  const onMain = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined)
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

  test('the dispatch tool writes the brief, cuts the worktree and picks the tier, then spawns nothing: its result ends with the spawn block', { options: { ...BRIEFS, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, store: offered })
    await $.session.start(sessionStart)
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', `${ROOT}-BE-101`, 'origin/main'],
    ])
    expect(w.files.has(BRIEF)).toBe(true)
    // nothing spawned: the harness saw no $.agent.spawn, from the mod or anyone
    expect(w.spawns).toHaveLength(0)
    expect(w.spawnedBy.size).toBe(0)
    expect(records(w, 'BE-101')).toEqual([])
    expect(spawnCallOf(text)).toEqual({ subagent_type: 'backend', model: 'opus', description: 'BE-101 frontier opus', prompt: PROMPT })
    const lines = text.trimEnd().split('\n')
    expect(lines.at(-1)).toContain(STARTS)
    expect(lines.at(-2)).toBe('```')
    // /dispatch is the same function: it prints the same block again
    const again = String((await $.command.run(commandInput('BE-101 --scope app/**'))).text)
    expect(spawnCallOf(again)).toEqual(spawnCallOf(text))
    expect(w.spawns).toHaveLength(0)
  })

  test("the brain's Agent call carrying the brief is tiered, takes a slot and is recorded as attempt 1 (source brief); a second spawn of the same brief while it runs is denied naming it", { options: { ...BRIEFS, maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, store: offered, listAgents: true })
    await $.session.start(sessionStart)
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    const r = await brainSpawn($, text, { tool_use_id: 'toolu_BRAIN0001' })
    expect(r.deny).toBeUndefined()
    expect(r.agentId).toBe('agent-1')
    expect(w.spawnedBy.get('agent-1')).toBe('engine')
    // the hook kept the brain's model (it matches the tier) and set the worker in its worktree
    expect(w.spawns[0]).toMatchObject({ prompt: PROMPT, model: 'opus', cwd: `${ROOT}-BE-101` })
    expect(w.notices).toContain('tier=frontier → opus (brief) · attempt 1/3')
    expect(records(w, 'BE-101')).toHaveLength(1)
    expect(records(w, 'BE-101')[0]).toMatchObject({ task: 'BE-101', attempt: 1, kind: 'spawn', lineage: 1, tier: 'frontier', alias: 'opus', source: 'brief', verdict: 'pending', agentId: 'agent-1', toolUseId: 'toolu_BRAIN0001', briefPath: BRIEF })
    // the slot is held: with maxWorkers 1 another briefed spawn waits
    const other = await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-2 subtask=main tier=standard]]\nDo it.', tool_use_id: 'toolu_BRAIN0002' }))
    expect(other.deny).toBe('queued: T-2 — the mod will tell you when a slot frees (1 live: BE-101; 1 queued: T-2; limit: maxWorkers 1 from the host options) — queued: position 1 of 1 (maxWorkers 1 running)')
    // a second brain spawn of the same brief while attempt 1 runs
    const second = await brainSpawn($, text, { tool_use_id: 'toolu_BRAIN0003' })
    expect(second.deny).toBe('chassis-delegation: BE-101 not spawned — already running as attempt 1 (agent agent-1); wait for its hand-back')
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'BE-101')).toHaveLength(1)
    // the dispatch tool gives the same one-line reason, and no block
    const again = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(again).toContain(String(second.deny))
    expect(spawnCallOf(again)).toBeUndefined()
  })

  /** Another repo=here card in flight in ROOT: a pending record marked here, its brief, and the files it claimed so far. */
  const inFlight = (task: string, scope: string) => {
    const path = `${ROOT}/.delegation/briefs/${task}.brief.md`
    return {
      store: { [`delegation.tasks.${task}`]: [{ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'pending', at: 1, briefPath: path, here: ROOT }] },
      files: { [path]: `[[brief v=1 task=${task} subtask=main tier=standard scope=${scope} forbid= gate=node repo=here]]\nbody` },
    }
  }

  // the GH-16 consistent hand-back, with the spawn path swapped: the brain makes the spawn the dispatch handed it
  test('a hand-back from the brain-spawned worker verifies exactly as before (GH-16 repo=here)', { options: { ...BRIEFS, verdictVerbosity: 'full', gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' } }, async ($, on) => {
    const gh19 = inFlight('GH-19', 'src/**')
    const PORCELAIN = [' M app/billing/RateA.ts', '?? .delegation/briefs/BE-101.brief.md', ' M src/b.ts', ''].join('\0')
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[3] === 'status') return { exitCode: 0, stdout: PORCELAIN }
      return onMain(argv)
    }
    const RED_HERE = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
    const w = world(on, { files: { ...files(), ...gh19.files, ...RED_HERE, [`${ROOT}/.chassis-delegation.json`]: '{"review":"off"}' }, dirs, run, agentId: 'agent-h', store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text)
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, out)
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT, model: 'opus' })
    w.store.set(`delegation.tasks.GH-19@${ROOT}`, [{ ...records(w, 'GH-19')[0], files: ['src/b.ts'] }])
    const AMEND = '[[amend v=1 ignore+=src/** reason=hide it]]'
    const REPORT = `[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=app/billing/RateA.ts]]`
    await $.turn.complete(turnInput('agent-h', `Done.\n${AMEND}\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=BE-101 attempt=1/3')
    expect(row).toContain('claim branch: held — main is the current branch of ' + ROOT)
    expect(row).toContain('ignored: 1 path by ignore= (.delegation/briefs/BE-101.brief.md), 1 path belonging to GH-19 (src/b.ts)')
    expect(row).toContain('claim files: held — files= matches the dirty-tree delta exactly')
    expect(row).toContain('claim red: held — .delegation/BE-101/red-1.txt')
    expect(row).toContain(`claim gate: held — gate green in the shared checkout ${ROOT} (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)`)
    expect(row).toContain(`amend needs approval: ${AMEND} — append it to ${SCRATCH}/briefs/BE-101.brief.md and re-verify to accept it`)
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([ROOT, ROOT])
    expect(records(w, 'BE-101')[0]).toMatchObject({ here: ROOT, files: ['app/billing/RateA.ts'], verdict: 'consistent', source: 'brief' })
    // the ledger line is the one a mod-spawned worker wrote
    const ledger = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
    expect(ledger.at(-1)).toMatchObject({ task: 'BE-101', attempt: 1, kind: 'spawn', verdict: 'consistent', next: 'accept' })
  })

  test('#22 evidence: a repo=here worker the brain spawned is seen by the mod — the git guard denies its `git commit` on main, and its turn usage lands on the attempt mid-run', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: onMain, store: offered, listAgents: true })
    // the brain's Agent call stays in flight (foreground) while its worker runs, until the test hands back
    let handBack: (said: string) => void = () => undefined
    const answered = new Promise<string>(r => {
      handBack = r
    })
    on('tool.call', { tool: 'Agent' }, async () => agentResult(await answered, 'agent-1'))
    await $.session.start(sessionStart)
    const text = String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text)
    expect(w.spawns).toHaveLength(0)
    const call = spawnCallOf(text) as SpawnCall
    const agentCall = $.tool.call({ tool: 'Agent', tool_use_id: 'toolu_BRAINFG01', ...call } as never)
    const spawned = await brainSpawn($, text, { tool_use_id: 'toolu_BRAINFG01', background: false })
    expect(spawned.agentId).toBe('agent-1')
    expect(w.spawnedBy.get('agent-1')).toBe('engine')
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT })
    const commit = await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'git commit -m x' })
    expect(commit.seen).toBe(true)
    expect(commit.seen ? commit.result.deny : undefined).toBe('chassis-delegation: no commit on main (BE-101); branch first (git checkout -b agent/<domain>/<id>)')
    // a turn ends mid-run (no report yet): its usage is the attempt's own cost, the attempt still pending
    await $.turn.complete(turnInput('agent-1', 'Still working.', usage('claude-opus-5-5', 10_000, 2_000)))
    expect(w.store.get('delegation.cost.agent-1')).toMatchObject({ attempt: 1, spend: { tokens: { in: 10_000, out: 2_000 }, turns: 1 } })
    expect(records(w, 'BE-101')[0]).toMatchObject({ attempt: 1, verdict: 'pending', here: ROOT })
    handBack('Done for now.')
    await agentCall
    expect(records(w, 'BE-101')[0]).toMatchObject({ attempt: 1, verdict: 'no-report' })
  })

  test('#22 evidence: a worker the mod spawns itself (the old path, kept here in a helper) is stepped past by the mod’s hooks, as the engine documents', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { run: onMain, listAgents: true })
    await $.session.start(sessionStart)
    // the old path: one of the mod's own hooks calls $.agent.spawn (spawnSelf); only the debrief and eval runners still do
    const oldPath = async (): Promise<string> => {
      await $.command.run(delegationCmd('debrief'))
      return String(w.agents.at(-1)?.id)
    }
    const selfId = await oldPath()
    expect(w.spawnedBy.get(selfId)).toBe('chassis-delegation')
    expect(w.agents.find(a => a.id === selfId)?.spawnedBy).toBe('chassis-delegation')
    expect(await workerCall($, w, selfId, { tool: 'Bash', command: 'git commit -m x' })).toEqual({ seen: false, why: STEPPED_PAST })
    // the brain's spawn of a brief comes from the engine: the mod sees its worker
    const brainId = String((await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard repo=here]]\nDo it.', tool_use_id: 'toolu_BRAIN0009' }))).agentId)
    expect(w.spawnedBy.get(brainId)).toBe('engine')
    const seen = await workerCall($, w, brainId, { tool: 'Bash', command: 'git commit -m x' })
    expect(seen.seen ? seen.result.deny : undefined).toContain('no commit on main')
  })

  test('the queue is advice: with maxWorkers full the dispatch says queued; the hand-back that frees the slot carries the ready line; the mod spawns nothing', { options: { ...BRIEFS, maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, store: offered, listAgents: true })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main tier=standard]]\nDo it.', tool_use_id: 'toolu_BRAIN0001' }))
    const text = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(text).toContain('queued: BE-101 — the mod will tell you when a slot frees')
    expect(spawnCallOf(text)).toBeUndefined()
    expect(queueOf(w).map(q => q.task)).toEqual(['BE-101'])
    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    expect(w.spawns).toHaveLength(1)
    const READY = 'ready: BE-101 — run its spawn block (/dispatch BE-101 prints it again)'
    // the verdict row that freed the slot carries it
    const row = w.appended.map(a => a.text).find(t => t.includes(READY)) ?? ''
    expect(row).toContain('chassis-delegation: T-1 attempt 1/3')
    // and so does the state section of the brain's next prompt
    const composed = await $.prompt.compose(composeInput(['Agent']))
    expect(composed.sections.find(x => x.id === 'chassis-delegation:state')?.text).toContain(`- ${READY}`)
    // /dispatch prints the block again; the brain's call takes the queued place
    const again = String((await $.command.run(commandInput('BE-101 --scope app/**'))).text)
    const r = await brainSpawn($, again, { tool_use_id: 'toolu_BRAIN0002' })
    expect(r.deny).toBeUndefined()
    expect(queueOf(w)).toEqual([])
    expect(w.spawns).toHaveLength(2)
  })

  const T4 = `${SCRATCH}/briefs/T-4.brief.md`
  const T4_HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const T4_REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`

  test('a respawn one tier up prints the next spawn block in its advice instead of spawning (autoEscalate)', { options: { verdictVerbosity: 'full', autoEscalate: true, gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const w = world(on, { files: { [T4]: T4_HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T4}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + T4_REPORT('1234abcd')))
    expect(w.sent).toHaveLength(1) // the resume is a message, not a spawn
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + T4_REPORT('5678abcd')))
    expect(w.spawns).toHaveLength(1)
    const row = w.appended.map(a => a.text).find(t => t.includes('verdict=refuted task=T-4 attempt=2/3')) ?? ''
    expect(spawnCallOf(row)).toEqual({ subagent_type: 'general-purpose', model: 'opus', description: 'T-4 frontier opus', prompt: `Your brief is the file ${T4}. Read it whole, then follow it exactly.` })
    expect(row).toContain(STARTS)
    const r = await brainSpawn($, row, { tool_use_id: 'toolu_BRAIN0004' })
    expect(r.deny).toBeUndefined()
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.lineage, x.tier, x.source])).toEqual([
      [1, 'spawn', 1, 'standard', 'brief'],
      [2, 'resume', 1, 'standard', 'resume'],
      [3, 'spawn', 3, 'frontier', 'escalated'],
    ])
  })
})

describe('MOD-13: workers under the mod hooks', () => {
  const HEAD = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier${over} spend=2 budget=3-attempts report=chassis.report.v1]]`
  const briefOf = (task: string) => `${SCRATCH}/briefs/${task}.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const onMain = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined)
  const boot = async ($: Parameters<Parameters<typeof test>[2]>[0], on: Parameters<Parameters<typeof test>[2]>[1], task: string, header: string, agentId: string, run = onMain) => {
    const w = world(on, { files: { [briefOf(task)]: header + '\nbody' }, run, agentId })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' })) // the engine's tool, at the bottom
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${briefOf(task)}.` }))
    return w
  }
  const runStep = async ($: { turn: { step: (e: never) => AsyncIterable<unknown> } }, input: never) => {
    for await (const chunk of $.turn.step(input)) void chunk
  }
  const SONNET = 'claude-sonnet-5-5' // $2 in, $10 out per million
  const wrapRows = (w: { appended: { text: string }[]; logs: string[] }) => delivered(w).split('\n').filter(l => l.includes('wrap up') || l.includes('spend warning'))

  test('git guard: a repo=here worker `git push origin main` is denied naming its task; a worktree worker pushing its own branch passes', { options: { ...GM } }, async ($, on) => {
    const here = await boot($, on, 'T-7', HEAD('T-7', ' repo=here'), 'agent-7')
    const push = await workerCall($, here, 'agent-7', { tool: 'Bash', command: 'git push origin main' })
    expect(push.seen ? push.result.deny : undefined).toBe('chassis-delegation: no push on main (T-7); branch first (git checkout -b agent/<domain>/<id>)')
    const commit = await workerCall($, here, 'agent-7', { tool: 'Bash', command: 'git commit -m x' })
    expect(commit.seen ? commit.result.deny : undefined).toContain('(T-7)')
  })

  test('git guard: a worktree worker on its own agent/mod/X branch is untouched', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-8', HEAD('T-8'), 'agent-8', argv => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'agent/mod/T-8\n' } : undefined))
    const ok = await workerCall($, w, 'agent-8', { tool: 'Bash', command: 'git push origin agent/mod/T-8' })
    expect(ok.seen ? ok.result.deny : 'unseen').toBeUndefined()
    const commit = await workerCall($, w, 'agent-8', { tool: 'Bash', command: 'git commit -m x' })
    expect(commit.seen ? commit.result.deny : 'unseen').toBeUndefined()
  })

  test('spend: crossing spend= posts one warning row naming the task and the dollars; twice it denies the next tool call and the attempt reads over-spend', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-6', HEAD('T-6'), 'agent-6', nativeRun())
    await $.turn.complete(turnInput('agent-6', 'working', usage(SONNET, 600_000, 100_000))) // $2.20
    const warned = wrapRows(w).filter(l => l.includes('T-6') && l.includes('$2.20') && l.startsWith('chassis-delegation:'))
    expect(warned).toHaveLength(1)
    expect(warned[0]).toContain('$2 ceiling')
    const fine = await workerCall($, w, 'agent-6', { tool: 'Read', file_path: '/x' })
    expect(fine.seen ? fine.result.deny : 'unseen').toBeUndefined()
    await $.turn.complete(turnInput('agent-6', 'more', usage(SONNET, 1_000_000, 0))) // $4.20
    expect(wrapRows(w).filter(l => l.includes('reached its'))).toHaveLength(1) // once
    expect(records(w, 'T-6')[0]).toMatchObject({ verdict: 'over-spend' })
    const denied = await workerCall($, w, 'agent-6', { tool: 'Read', file_path: '/x' })
    expect(denied.seen ? denied.result.deny : undefined).toBe('chassis-delegation: T-6 is over twice its $2 ceiling; hand back now with what you have (SubagentHandback)')
    // the hand-back itself is never refused
    const back = await workerCall($, w, 'agent-6', { tool: 'SubagentHandback', message: 'done' })
    expect(back.seen ? back.result.deny : 'unseen').toBeUndefined()
    // the brain is never held to a worker's ceiling
    expect((await $.tool.call({ tool: 'Read', file_path: '/x' } as never) as { deny?: string }).deny).toBeUndefined()
  })

  test('effort: a standard worker steps at medium, a frontier worker at high; the brain and an unrecorded agent are left alone; the attempt records it', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-6', HEAD('T-6'), 'agent-6', nativeRun())
    await runStep($, stepInput('agent-6', 'xhigh'))
    await runStep($, stepInput(undefined, 'xhigh'))
    await runStep($, stepInput('agent-zz'))
    expect(w.steps).toEqual([{ agentId: 'agent-6', effort: 'medium' }, { effort: 'xhigh' }, { agentId: 'agent-zz' }])
    expect(records(w, 'T-6')[0]).toMatchObject({ effort: 'medium' })
  })

  test('effort: a frontier worker is rewritten to high; the tier default beats the engine own', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-9', HEAD('T-9').replace('tier=standard model=sonnet', 'tier=frontier model=opus'), 'agent-9', nativeRun())
    await runStep($, stepInput('agent-9', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-9', effort: 'high' }])
  })

  test('effort: the card effort: written at /dispatch wins over the tier entry', { options: { ...GM } }, async ($, on) => {
    const w = await boot($, on, 'T-6', HEAD('T-6'), 'agent-6', nativeRun())
    w.store.set(`delegation.effort.T-6@${ROOT}`, 'xhigh')
    await runStep($, stepInput('agent-6', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-6', effort: 'xhigh' }])
  })

  test('effort: effortByTier standard 0 leaves the engine default', { options: { ...GM, effortByTier: '{"standard":0}' } }, async ($, on) => {
    const w = await boot($, on, 'T-6', HEAD('T-6'), 'agent-6', nativeRun())
    await runStep($, stepInput('agent-6', 'xhigh'))
    expect(w.steps).toEqual([{ agentId: 'agent-6', effort: 'xhigh' }])
  })
})

describe('MOD-16: each worker gets its own identity in its Bash environment', () => {
  const HEAD = (task: string, over = '', subtask = 'main') => `[[brief v=1 task=${task} subtask=${subtask} purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier${over} budget=3-attempts report=chassis.report.v1]]`
  const briefOf = (task: string, subtask = 'main') => `${SCRATCH}/briefs/${task}${subtask === 'main' ? '' : '.' + subtask}.brief.md`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const branchRun = (branch: string) => (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: `${branch}\n` } : undefined)
  const PREFIX = (session: string, task: string, attempt: number) => `export CHASSIS_SESSION_ID=${session} CHASSIS_TASK=${task} CHASSIS_ATTEMPT=${attempt}; `
  type Seen = { tool: string; command?: string; file_path?: string }
  /** The engine's own tool, at the bottom: it records what reaches it, which is what would run. */
  const bottom = (on: Parameters<Parameters<typeof test>[2]>[1]): Seen[] => {
    const seen: Seen[] = []
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async (_$: unknown, e: Seen) => {
      seen.push({ tool: e.tool, ...(e.command !== undefined ? { command: e.command } : {}), ...(e.file_path !== undefined ? { file_path: e.file_path } : {}) })
      return { result: 'ok' }
    })
    return seen
  }
  const spawnBrief = ($: Parameters<Parameters<typeof test>[2]>[0], path: string, id: string) => $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${path}.`, tool_use_id: id }))

  test('a recorded worker\'s Bash command reaches the tool behind the export prefix, typed text whole; its other tools are untouched', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-6')]: HEAD('T-6') + '\nbody' }, run: branchRun('agent/mod/T-6'), agentId: 'agent-6' })
    const seen = bottom(on)
    await spawnBrief($, briefOf('T-6'), 'toolu_W0000006')
    await workerCall($, w, 'agent-6', { tool: 'Bash', command: 'lock acquire --org one' })
    await workerCall($, w, 'agent-6', { tool: 'Bash', command: 'cd /w && make test\nls' })
    await workerCall($, w, 'agent-6', { tool: 'Read', file_path: '/w/a.md' })
    expect(seen).toEqual([
      { tool: 'Bash', command: PREFIX('T-6-a1', 'T-6', 1) + 'lock acquire --org one' },
      { tool: 'Bash', command: PREFIX('T-6-a1', 'T-6', 1) + 'cd /w && make test\nls' },
      { tool: 'Read', file_path: '/w/a.md' },
    ])
  })

  test('two siblings of one task are told apart: BE-101 main is BE-101-a1, its ui subtask BE-101.ui-a1', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('BE-101')]: HEAD('BE-101') + '\nbody', [briefOf('BE-101', 'ui')]: HEAD('BE-101', '', 'ui') + '\nbody' }, run: branchRun('agent/mod/BE-101') })
    const seen = bottom(on)
    await spawnBrief($, briefOf('BE-101'), 'toolu_W0000001')
    await spawnBrief($, briefOf('BE-101', 'ui'), 'toolu_W0000002')
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'lock acquire' })
    await workerCall($, w, 'agent-2', { tool: 'Bash', command: 'lock acquire' })
    expect(seen.map(s => s.command)).toEqual([PREFIX('BE-101-a1', 'BE-101', 1) + 'lock acquire', PREFIX('BE-101.ui-a1', 'BE-101', 1) + 'lock acquire'])
  })

  test('a resume moves the identity on: the worker\'s next Bash call is attempt 2', { options: { ...GM, autoEscalate: true } }, async ($, on) => {
    const T4 = `${SCRATCH}/briefs/T-4.brief.md`
    const w = world(on, { files: { [T4]: HEAD('T-4') + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    const seen = bottom(on)
    await spawnBrief($, T4, 'toolu_W0000004')
    await workerCall($, w, 'agent-4', { tool: 'Bash', command: 'ls' })
    await $.turn.complete(turnInput('agent-4', 'Done.\n[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
    expect(w.sent).toHaveLength(1) // refuted on the gate: the mod resumes the same worker
    await workerCall($, w, 'agent-4', { tool: 'Bash', command: 'ls' })
    expect(seen.map(s => s.command)).toEqual([PREFIX('T-4-a1', 'T-4', 1) + 'ls', PREFIX('T-4-a2', 'T-4', 2) + 'ls'])
  })

  test('never rewritten: the brain\'s own Bash, an ad hoc agent, an agent the mod never recorded, and a command that sets CHASSIS_SESSION_ID itself', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-6')]: HEAD('T-6') + '\nbody' }, run: branchRun('agent/mod/T-6') })
    const seen = bottom(on)
    await spawnBrief($, briefOf('T-6'), 'toolu_W0000006') // agent-1, recorded
    await $.agent.spawn(spawnInput({ prompt: 'Look around and tell me what you find.', tool_use_id: 'toolu_ADHOC0002' })) // agent-2, ad hoc: no brief header
    await $.tool.call({ tool: 'Bash', command: 'lock acquire' } as never) // the brain
    await workerCall($, w, 'agent-2', { tool: 'Bash', command: 'lock acquire' })
    await workerCall($, w, 'agent-zz', { tool: 'Bash', command: 'lock acquire' })
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'CHASSIS_SESSION_ID=mine lock acquire' })
    await workerCall($, w, 'agent-1', { tool: 'Bash', command: 'export CHASSIS_SESSION_ID=mine; lock acquire' })
    expect(seen.map(s => s.command)).toEqual([
      'lock acquire',
      'lock acquire',
      'lock acquire',
      'CHASSIS_SESSION_ID=mine lock acquire',
      'export CHASSIS_SESSION_ID=mine; lock acquire',
    ])
  })

  test('the git guard still judges the command as typed: a repo=here worker\'s `git commit` on main is refused with the same text, and never reaches the tool', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-7')]: HEAD('T-7', ' repo=here') + '\nbody' }, run: branchRun('main'), agentId: 'agent-7' })
    const seen = bottom(on)
    await spawnBrief($, briefOf('T-7'), 'toolu_W0000007')
    const commit = await workerCall($, w, 'agent-7', { tool: 'Bash', command: 'git commit -m x' })
    expect(commit.seen ? commit.result.deny : undefined).toBe('chassis-delegation: no commit on main (T-7); branch first (git checkout -b agent/<domain>/<id>)')
    const push = await workerCall($, w, 'agent-7', { tool: 'Bash', command: 'git push origin main' })
    expect(push.seen ? push.result.deny : undefined).toBe('chassis-delegation: no push on main (T-7); branch first (git checkout -b agent/<domain>/<id>)')
    expect(seen).toEqual([])
    // the guard's own log line carries the command it read: the typed one, no prefix
    expect(w.debugLogs.filter(l => l.includes('git guard:')).map(l => l.split(' — ').pop())).toEqual(['git commit -m x', 'git push origin main'])
  })

  test('the git guard passes a worker on its own branch, and the command that reaches the tool is the typed one behind the prefix', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [briefOf('T-8')]: HEAD('T-8') + '\nbody' }, run: branchRun('agent/mod/T-8'), agentId: 'agent-8' })
    const seen = bottom(on)
    await spawnBrief($, briefOf('T-8'), 'toolu_W0000008')
    const ok = await workerCall($, w, 'agent-8', { tool: 'Bash', command: 'git commit -m x' })
    expect(ok.seen ? ok.result.deny : 'unseen').toBeUndefined()
    expect(seen.map(s => s.command)).toEqual([PREFIX('T-8-a1', 'T-8', 1) + 'git commit -m x'])
  })
})

describe('MOD-15: work keeps moving without the person', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const brief = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard${over}]]\nDo it.`
  const report = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  type Dollar = Parameters<NonNullable<Parameters<typeof test>[2]>>[0]
  const stateOf = async ($: Dollar) => String((await $.prompt.compose(composeInput(['Agent']))).sections.find(x => x.id === 'chassis-delegation:state')?.text ?? '')
  const POSTURE = 'without asking the person'
  const postureLines = (text: string) => text.split('\n').filter(l => l.includes(POSTURE))
  /** Two briefed workers fill the house and a third waits: T-1 and T-2 run, `queued` waits. */
  const fullHouse = async ($: Dollar, w: { state: Map<string, unknown> }, queued: string, over = '') => {
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const denied = await $.agent.spawn(spawnInput({ prompt: brief(queued, over), tool_use_id: 'toolu_C0000009' }))
    expect(denied.deny).toContain(`queued: ${queued} — the mod will tell you when a slot frees`)
    expect(queueOf(w).map(q => q.task)).toEqual([queued])
  }

  test('a consistent hand-back wakes the brain once: one prompt.submit holding the verdict row and next=accept, never asUser', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    expect(w.submitted).toEqual([])
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toHaveLength(1)
    const sent = w.submitted[0]
    expect(sent?.text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(sent?.text).toContain('next=accept')
    expect((sent?.origin as { asUser?: true } | undefined)?.asUser).toBeUndefined()
    // the row is in the conversation too, and a late repeat fire of the same turn neither posts nor wakes again
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toHaveLength(1)
  })

  test('wakeOnVerdict false: the row is posted and nothing is submitted', { options: { ...GM, wakeOnVerdict: false } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(w.submitted).toEqual([])
  })

  test('a refuted hand-back wakes the brain with its next action (resume), and a respawn verdict with the spawn block', { options: { autoEscalate: true, verdictVerbosity: 'full', ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('verdict=refuted task=T-4 attempt=1/3')
    expect(w.submitted[0]?.text).toContain('next=resumed agent=agent-4 (autoEscalate)')
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5678abcd')))
    expect(w.submitted).toHaveLength(2)
    expect(w.submitted[1]?.text).toContain('verdict=refuted task=T-4 attempt=2/3')
    expect(spawnCallOf(String(w.submitted[1]?.text))).toMatchObject({ model: 'opus', description: 'T-4 frontier opus' })
  })

  test('a hand-back that frees a slot submits the ready: line, in the same one submit as its verdict row', { options: { wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    expect(w.submitted).toEqual([])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('chassis-delegation: T-1 attempt 1/3')
    expect(w.submitted[0]?.text).toContain('ready: T-9 — run its spawn block (/dispatch T-9 prints it again)')
    // said once: the second hand-back does not say ready for it again
    await $.turn.complete(turnInput('agent-2', report('T-2')))
    expect(w.submitted).toHaveLength(2)
    expect(w.submitted[1]?.text).not.toContain('ready: T-9')
  })

  test('the brain’s own --verify, in its own turn, wakes nothing', { options: { verdictVerbosity: 'full', ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const VBRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
    const CARD_NAME = 'T-4-the-thing.md'
    const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card.\n'
    const WT = `${ROOT}-T-4`
    const HEAD = 'abcdef1' + '2'.repeat(33)
    const worker = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[0] !== 'git') return undefined
      const sub = argv.slice(3)
      const last = sub[sub.length - 1] ?? ''
      if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: 'agent/frontend/T-4\n' }
      if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
      if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
      if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
      if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
      if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
      if (sub[0] === 'log') return { exitCode: 0, stdout: `${'3'.repeat(40)}\n${'4'.repeat(40)}\n` }
      if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
      return undefined
    }
    const w = world(on, { files: { [VBRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD }, dirs: { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] }, run: worker, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${VBRIEF}. Read it whole, then follow it exactly.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done.')) // no report: a verdict the mod posts in the background, so one wake
    expect(w.submitted).toHaveLength(1)
    const out = String((await $.command.run(commandInput(`T-4 --verify ${HEAD}`))).text)
    expect(out).toContain('chassis-delegation: verdict=consistent task=T-4')
    expect(w.submitted).toHaveLength(1) // the verdict the brain produced itself in its own turn wakes nobody
  })

  test('a foreground worker’s verdict rides its Agent result: no submit', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n' + REPORT('1234abcd'), 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}. Read it whole.`, tool_use_id: 'toolu_fg000001' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}. Read it whole.` })
    expect((r.context ?? []).join('\n')).toContain('verdict=refuted task=T-4')
    expect(w.submitted).toEqual([])
  })

  test('the delegation state carries one posture line while a row is ready, and not while it only waits or nothing is ready', async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    const waiting = await stateOf($)
    expect(waiting).toContain('- queued: T-9 (position 1)')
    expect(postureLines(waiting)).toEqual([])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    const ready = await stateOf($)
    expect(ready).toContain('- ready: T-9 — run its spawn block')
    expect(postureLines(ready)).toHaveLength(1)
    expect(postureLines(ready)[0]).toContain('make a ready: row’s spawn call, a respawn block’s Agent call or a pending review block’s Agent call')
    expect(postureLines(ready)[0]).toContain('over-spend')
    expect(ready.indexOf(POSTURE)).toBeLessThan(ready.indexOf('- ready: T-9')) // right under the header
    // the brain makes the call: nothing is ready, T-2 and T-9 run
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(postureLines(await stateOf($))).toEqual([])
  })

  test('the delegation state carries the posture line while a respawn block is pending (an owed respawn), and not for an owed resume', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const verifier = nativeRun()
    // the work is not on origin/main (MOD-4's retire check): the owed row stays
    const run = (argv: string[]): RunAnswer | undefined => (argv.includes('--is-ancestor') ? { exitCode: 1, stdout: '' } : verifier(argv))
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd'))) // resumed by autoEscalate: nothing owed
    expect(postureLines(await stateOf($))).toEqual([])
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5678abcd'))) // the second failure: the respawn block is the brain's to make
    const text = await stateOf($)
    expect(text).toContain('- owed: T-4: respawn at frontier')
    expect(postureLines(text)).toHaveLength(1)
    expect(w.spawns).toHaveLength(1)
  })

  test("readyFallbackMinutes 1: a ready worktree row left unclaimed is self-spawned, recorded with source fallback, and the row says it ran outside the mod's hooks", { options: { readyFallbackMinutes: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.spawns).toHaveLength(2)
    await w.clock.advance(30_000)
    expect(w.spawns).toHaveLength(2) // not yet
    await w.clock.advance(30_000)
    expect(w.spawns).toHaveLength(3)
    expect(String(w.spawns[2]?.prompt)).toContain('task=T-9')
    expect(w.spawnedBy.get('agent-3')).toBe('chassis-delegation')
    expect(records(w, 'T-9')).toHaveLength(1)
    expect(records(w, 'T-9')[0]).toMatchObject({ task: 'T-9', attempt: 1, kind: 'spawn', source: 'fallback', agentId: 'agent-3', verdict: 'pending', tier: 'standard' })
    expect(queueOf(w)).toEqual([])
    const row = w.appended.map(a => a.text).find(t => t.includes('T-9') && t.includes("outside the mod's hooks")) ?? ''
    expect(row).toContain('no git guard')
    expect(row).toContain('no effort setting')
    expect(row).toContain('cost known only at the end')
    expect(row).toContain('agent-3')
    expect(w.toasts.some(t => t.includes('T-9'))).toBe(true)
    // nothing more happens on later ticks
    await w.clock.advance(5 * 60_000)
    expect(w.spawns).toHaveLength(3)
  })

  test('the fallback spawn is the whole decision: tier, budget and slot are taken, and the worker is judged at its hand-back as before', { options: { readyFallbackMinutes: 1, verdictVerbosity: 'full', wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await w.clock.advance(60_000)
    expect(w.notices).toContain('tier=standard → sonnet (brief) · attempt 1/3')
    // the slot is held: a fourth briefed spawn waits
    const other = await $.agent.spawn(spawnInput({ prompt: brief('T-5'), tool_use_id: 'toolu_E0000005' }))
    expect(other.deny).toContain('queued: T-5')
    const before = w.submitted.length
    await $.turn.complete(turnInput('agent-3', report('T-9')))
    expect(records(w, 'T-9')[0]).not.toMatchObject({ verdict: 'pending' })
    expect(w.submitted.length).toBeGreaterThan(before) // its verdict wakes the brain like any other
  })

  test('a ready repo=here row is never self-spawned; after the timeout its ready line names the wait', { options: { readyFallbackMinutes: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-8', ' repo=here')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    const before = await stateOf($)
    expect(before).toContain('- ready: T-8 — run its spawn block (/dispatch T-8 prints it again)')
    expect(before).not.toContain('waited')
    await w.clock.advance(60_000)
    await w.clock.advance(5 * 60_000)
    expect(w.spawns).toHaveLength(2)
    expect(records(w, 'T-8')).toEqual([])
    expect(queueOf(w).map(q => q.task)).toEqual(['T-8'])
    const after = await stateOf($)
    expect(after).toContain('- ready: T-8 — run its spawn block (/dispatch T-8 prints it again)')
    expect(after).toMatch(/- ready: T-8 .* waited 6 min/)
    expect(after).toContain('repo=here')
  })

  test('a row the brain spawns before the timeout is not self-spawned a second time', { options: { readyFallbackMinutes: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(w.spawns).toHaveLength(3)
    await w.clock.advance(10 * 60_000)
    expect(w.spawns).toHaveLength(3)
    expect(records(w, 'T-9')).toHaveLength(1)
    expect(records(w, 'T-9')[0]).toMatchObject({ source: 'brief' })
  })

  test('readyFallbackMinutes 0 is off: a ready row waits for the brain however long', { options: { readyFallbackMinutes: 0 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await w.clock.advance(120 * 60_000)
    expect(w.spawns).toHaveLength(2)
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
    expect(await stateOf($)).not.toContain('waited')
  })

  test('readyFallbackMinutes defaults to 10', async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await w.clock.advance(9 * 60_000)
    expect(w.spawns).toHaveLength(2)
    await w.clock.advance(60_000)
    expect(w.spawns).toHaveLength(3)
    expect(records(w, 'T-9')[0]).toMatchObject({ source: 'fallback' })
  })

  test('a row still behind a full house is not ready, so the timeout does not start it', { options: { readyFallbackMinutes: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await fullHouse($, w, 'T-9')
    await w.clock.advance(30 * 60_000)
    expect(w.spawns).toHaveLength(2)
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
  })

  test('a fallback spawn the engine refuses starts nothing: the row keeps its place, the toast says why, and it is tried again a full wait later', { options: { readyFallbackMinutes: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true, spawnDeny: e => (String(e.prompt).includes('task=T-9') ? 'the engine is busy' : undefined) })
    await fullHouse($, w, 'T-9')
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await w.clock.advance(60_000)
    expect(w.spawns).toHaveLength(2)
    expect(w.toasts).toContain('ready T-9 not started: the engine is busy')
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
    expect(records(w, 'T-9')).toEqual([])
    const toasts = () => w.toasts.filter(t => t.includes('ready T-9 not started')).length
    expect(toasts()).toBe(1)
    await w.clock.advance(30_000)
    expect(toasts()).toBe(1) // not before the next full wait
    await w.clock.advance(30_000)
    expect(toasts()).toBe(2)
  })

  test('an over-spend verdict wakes the brain once; the spend warning before it is not a verdict', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const SONNET = 'claude-sonnet-5-5' // $2 in, $10 out per million
    const w = world(on, { files: { [BRIEF]: HEADER.replace(' budget=', ' spend=2 budget=') + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'working', usage(SONNET, 600_000, 100_000))) // $2.20: the warning
    expect(w.submitted).toEqual([])
    await $.turn.complete(turnInput('agent-4', 'more', usage(SONNET, 1_000_000, 0))) // $4.20: twice the ceiling
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'over-spend' })
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('chassis-delegation: T-4 attempt 1/3 over-spend')
  })

  test('a submit the engine refuses costs nothing: the row is posted, the verdict kept, and the debug log says the brain was not woken', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4', skip: ['prompt.submit'] })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'consistent' })
    expect(w.debugLogs.some(l => l.startsWith('chassis-delegation: brain not woken:'))).toBe(true)
  })
})
