// MOD-73: every option, measured. One engine case per manifest userConfig field:
// the field is set through `/delegation config <field> <value>` with no /config rows
// for the mod (the host lists none, as in the VS Code extension), so the value lands
// in the user options file; the case then asserts a change in what the mod does.
// Every field showed an effect, so no case is skipped. tests/node/configtable.node.mjs
// holds that this file names every field of the manifest, one case each.
import { test, expect, describe } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { world, spawnInput, turnInput, mainTurn, sessionStart, commandInput, spawnCallOf, stepInput, bandProps, usage, ROOT, SCRATCH, HOME, NOW, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'

type Tester = Parameters<TestBody>[0]
type W = ReturnType<typeof world>
const MIN = 60_000
const H = 60 * MIN
const REPO_FILE = `${ROOT}/.chassis-delegation.json`

const cfg = (args: string) => ({ command: 'delegation', args: `config ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const say = async ($: Tester, args: string) => String((await $.command.run(cfg(args))).text)
/** Set one option the way a person does, and check it landed in the user options file (the host lists no rows). */
const set = async ($: Tester, field: string, value: string) => {
  const out = await say($, `${field} ${value}`)
  expect(out.startsWith(`${field} = `)).toBe(true)
  expect(out.endsWith('(yours)')).toBe(true)
}
const status = async ($: Tester) => String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
const brief = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard${over}]]\nDo it.`
// MOD-117: a local card's records sit under its repo's key
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task.includes('@') ? task : `${task}@${ROOT}`}`) ?? []) as Record<string, unknown>[]
const argvs = (w: { runs: { argv: string[] }[] }) => w.runs.map(r => r.argv)
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const rowsOf = (w: { appended: { type: string; text: string }[]; logs: string[]; debugLogs: string[] }) => {
  const appended = w.appended.filter(a => a.type === 'user').map(a => a.text)
  if (appended.length > 0) return appended
  const debug = new Set(w.debugLogs)
  return w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: ') && !l.startsWith('chassis-delegation: refused argv'))
}
const typeOf = (s: Record<string, unknown> | undefined) => s?.subagentType ?? s?.subagent_type
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')

// ---- a worker hand-back, judged natively (as hooks.test.ts does it) --------------------
const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GATES = JSON.stringify({ gateMap: { prettier: 'npx prettier --check {files}' } })
const MB = 'b'.repeat(40)
/** The worker repo from memory: the sha and branch exist, the tree is clean, the delta is a/x.ts, the gate red unless `gate` says 0. */
const nativeRun = (o: { gate?: number } = {}) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = last.slice(0, -'^{commit}'.length).padEnd(40, '0')
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}
/** The world for a hand-back: the brief, the repo's gate map (unless `gates` is false), the native verifier. */
const handBackWorld = (on: unknown, o: { gate?: number; gates?: boolean; files?: Record<string, string> } = {}) =>
  world(on as never, { files: { [BRIEF]: HEADER + '\nbody', ...(o.gates === false ? {} : { [REPO_FILE]: GATES }), ...(o.files ?? {}) }, run: nativeRun({ gate: o.gate ?? 1 }), agentId: 'agent-4' })
const handBack = async ($: Tester, text = REPORT('1234abcd')) => {
  await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
  await $.turn.complete(turnInput('agent-4', 'Done.\n' + text))
}

// ---- /dispatch of the sample card ------------------------------------------------------
const cardAt = (dir = 'agents/tasks', card = FIXTURE_CARD) => ({ files: { [`${ROOT}/${dir}/${FIXTURE_CARD_NAME}`]: card }, dirs: { [`${ROOT}/${dir}`]: [FIXTURE_CARD_NAME] } })
const dispatchWorld = (on: unknown, o: { dir?: string; card?: string; files?: Record<string, string>; run?: (argv: string[]) => RunAnswer | undefined } = {}) => {
  const c = cardAt(o.dir, o.card)
  return world(on as never, { files: { ...c.files, ...(o.files ?? {}) }, dirs: c.dirs, run: o.run ?? (() => undefined), store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
}
const dispatch = async ($: Tester, args: string) => String((await $.command.run(commandInput(args))).text)
const DEFAULT_BRIEF = `${ROOT}/.delegation/briefs/BE-101.brief.md`

// ---- the idle timers -------------------------------------------------------------------
const BC = `${HOME}/.claude/harness/breadcrumbs/sess-1.jsonl`
const DONE = `${HOME}/.claude/harness/breadcrumbs/sess-1.done`
const crumbs = (n: number) => Array.from({ length: n }, (_, i) => `{"ts":${i},"kind":"correction","detail":"x"}`).join('\n') + '\n'
const A = 'a'.repeat(40)
const revParse = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' ? { exitCode: 0, stdout: `${A}\n` } : undefined)
const evalWorld = (on: unknown) => world(on as never, { run: revParse, listAgents: true })
const evalOn = async ($: Tester, command = 'npm run eval') => {
  await set($, 'evalCommand', command)
  await set($, 'autoEval', 'on')
}
const cleanT1 = `[[eval v=1 tier=T1 sha=${A} total=63 pass=63 fail=0 result=none]]`

// ---- the brain -------------------------------------------------------------------------
const FABLE = 'claude-fable-5-1'
const brainTurn = (u: ReturnType<typeof usage>) => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer', usage: u }) as never
const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
const branchIs = (branch: string) => (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: `${branch}\n` } : undefined)

describe('MOD-73: each option, set with /delegation config, changes what the mod does', () => {
  // ---- Workers and models ----
  test('tierMap: standard=opus runs a standard worker on opus (the built-in map says sonnet)', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    await set($, 'tierMap', 'standard=opus')
    await $.agent.spawn(spawnInput({ prompt: brief('T-8') }))
    expect(w.spawns[0]?.model).toBe('opus')
  })

  test('spendByTier: frontier=9 writes spend=9 into a frontier brief', async ($, on) => {
    const w = dispatchWorld(on)
    await $.session.start(sessionStart)
    await set($, 'spendByTier', 'frontier=9')
    await dispatch($, 'BE-101 --dry-run')
    expect((w.files.get(DEFAULT_BRIEF) ?? '').split('\n')[0]).toContain(' spend=9 budget=')
  })

  test('effortByTier: standard=max sets a standard worker\'s effort to max', async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, agentId: 'agent-4' })
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async () => ({ result: 'ok' }))
    await $.session.start(sessionStart)
    await set($, 'effortByTier', 'standard=max')
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    for await (const chunk of $.turn.step(stepInput('agent-4', 'low'))) void chunk
    expect(w.steps).toEqual([{ agentId: 'agent-4', effort: 'max' }])
  })

  test('effortNudge: cards="" posts no nudge on a hand-back that names a cards artefact', async ($, on) => {
    const w = world(on, { agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await set($, 'effortNudge', '{"cards":""}')
    expect(await status($)).toContain('effort nudge: off')
    await $.agent.spawn(spawnInput({ prompt: brief('T-14') }))
    await $.turn.complete(turnInput('agent-4', '[[report v=1 task=T-14 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a artefacts=cards/H1.jpg]]'))
    const row = rowsOf(w).find(l => l.includes('T-14 handed back'))
    expect(row).toBeDefined()
    expect(row).not.toContain('lead:')
  })

  test('defaultBudget: 5 gives a brief with no budget= five attempts (the built-in 3)', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    await set($, 'defaultBudget', '5')
    await $.agent.spawn(spawnInput({ prompt: brief('T-5') }))
    expect(w.notices).toContain('tier=standard → sonnet (brief) · attempt 1/5')
  })

  test('maxWorkers: 3 lets a third briefed worker start at once (the built-in 2 queues it)', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    expect(await say($, 'maxWorkers 3')).toBe('maxWorkers = 3 (yours)')
    expect(await say($, '')).toContain('maxWorkers = 3 (yours)')
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    expect(third.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
  })

  test('maxWorkersByTier: frontier=1 queues a second frontier worker while a standard one still starts', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'maxWorkers', '6')
    expect(await say($, 'maxWorkersByTier frontier=1')).toBe('maxWorkersByTier = frontier 1 (yours)')
    await $.agent.spawn(spawnInput({ prompt: brief('T-1').replace('tier=standard', 'tier=frontier'), tool_use_id: 'toolu_A0000001' }))
    const second = await $.agent.spawn(spawnInput({ prompt: brief('T-2').replace('tier=standard', 'tier=frontier'), tool_use_id: 'toolu_B0000002' }))
    expect(second.deny).toContain('when a frontier slot frees')
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))).deny).toBeUndefined()
    expect(w.spawns).toHaveLength(2)
  })

  test('agentTypes: backend=frontend prepares a backend card on the frontend agent type', async ($, on) => {
    dispatchWorld(on)
    await $.session.start(sessionStart)
    await set($, 'agentTypes', 'backend=frontend')
    const out = await dispatch($, 'BE-101 --scope app/**')
    expect(spawnCallOf(out)?.subagent_type).toBe('frontend')
  })

  test('domains: web, api lets a card of domain web dispatch (the built-in six refuse it)', async ($, on) => {
    const w = dispatchWorld(on, { card: FIXTURE_CARD.replace('domain: backend', 'domain: web') })
    await $.session.start(sessionStart)
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.has(DEFAULT_BRIEF)).toBe(false)
    await set($, 'domains', 'web, api')
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.has(DEFAULT_BRIEF)).toBe(true)
  })

  test('autoEscalate: on sends a refuted worker straight back in', async ($, on) => {
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'autoEscalate', 'on')
    await handBack($)
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.to).toBe('agent-4')
    expect(records(w, 'T-4').map(r => r.kind)).toEqual(['spawn', 'resume'])
  })

  /** The model ids the mod asked the classifier with: the probe of probeModels. */
  const probed = (on: unknown) => {
    const asked: string[] = []
    ;(on as unknown as (n: string, h: unknown) => void)('model.classify', (_$: unknown, e: { model?: string; options?: { model?: string } }) => {
      const id = e.model ?? e.options?.model
      if (id) asked.push(id)
      return { value: 'ok' }
    })
    return asked
  }
  const settle = async (w: W) => {
    for (let i = 0; i < 5; i++) await w.clock.advance(1)
  }

  test('probeModels: on asks each listed model at the next session start', async ($, on) => {
    const w = world(on, { skip: ['model.classify'] })
    const asked = probed(on)
    await $.session.start(sessionStart)
    await set($, 'candidateIds', 'claude-next-9')
    await $.session.start(sessionStart)
    await settle(w)
    expect(asked).toEqual([])
    await set($, 'probeModels', 'on')
    await $.session.start(sessionStart)
    await settle(w)
    expect(asked).toEqual(['claude-next-9'])
    expect(w.toasts).toContain('claude-next-9 answers now')
  })

  test('candidateIds: the ids listed are the ones asked about', async ($, on) => {
    const w = world(on, { skip: ['model.classify'] })
    const asked = probed(on)
    await $.session.start(sessionStart)
    await set($, 'probeModels', 'on')
    await set($, 'candidateIds', 'claude-a-1, claude-b-2')
    await $.session.start(sessionStart)
    await settle(w)
    expect(asked).toEqual(['claude-a-1', 'claude-b-2'])
  })

  // ---- Checking the work ----
  test('gateMap: prettier=… makes the verifier re-run the gate the brief names', async ($, on) => {
    const w = handBackWorld(on, { gates: false })
    await $.session.start(sessionStart)
    await set($, 'gateMap', 'prettier=npx prettier --check {files}')
    await handBack($)
    expect(w.runs.find(x => x.argv[0] === 'npx')?.argv).toEqual(['npx', 'prettier', '--check', `${SCRATCH}/T-4/files.txt`])
  })

  test('mergeCheckMap: a /config row is read as a map and shown in the config view', async ($, on) => {
    world(on, {})
    await $.session.start(sessionStart)
    await set($, 'mergeCheckMap', 'smoke=node smoke.cjs {card}')
    expect(await say($, 'mergeCheckMap')).toContain('smoke')
  })

  test('applyAmends: off leaves the brief alone when a worker asks for more scope', async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/x.ts reason=the helper lives there]]'
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'applyAmends', 'off')
    await handBack($, AMEND + '\n' + REPORT('1234abcd'))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
    expect(delivered(w)).toContain('amend not applied (applyAmends off)')
  })

  test('scopeAmends: ask holds a worker\'s request to widen its scope until the lead appends it', async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/x.ts reason=the helper lives there]]'
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'scopeAmends', 'ask')
    await handBack($, AMEND + '\n' + REPORT('1234abcd'))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
    expect(delivered(w)).toContain('(scopeAmends ask)')
  })

  test('MOD-196 scopeAmends within-parent from /config holds a scope+= block when the brief carries no parent_scope', async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/x.ts reason=the helper lives there]]'
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'scopeAmends', 'within-parent')
    await handBack($, AMEND + '\n' + REPORT('1234abcd'))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
    expect(delivered(w)).toContain('(scopeAmends within-parent)')
  })

  test('MOD-196 scopeAmends within-parent from the repo file applies a block inside the brief parent_scope', async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/x.ts reason=the helper lives there]]'
    const H = HEADER.replace(' gate=prettier', ' parent_scope=c/** gate=prettier')
    const w = handBackWorld(on, { files: { [BRIEF]: H + '\nbody', [REPO_FILE]: JSON.stringify({ scopeAmends: 'within-parent', gateMap: { prettier: 'npx prettier --check {files}' } }) } })
    await $.session.start(sessionStart)
    await handBack($, AMEND + '\n' + REPORT('1234abcd'))
    expect(w.files.get(BRIEF)).toContain(AMEND)
  })

  test('MOD-196 scopeAmends within-parent from the repo file holds a block that escapes the brief parent_scope', async ($, on) => {
    const AMEND = '[[amend v=1 scope+=d/x.ts reason=the helper lives there]]'
    const H = HEADER.replace(' gate=prettier', ' parent_scope=c/** gate=prettier')
    const w = handBackWorld(on, { files: { [BRIEF]: H + '\nbody', [REPO_FILE]: JSON.stringify({ scopeAmends: 'within-parent', gateMap: { prettier: 'npx prettier --check {files}' } }) } })
    await $.session.start(sessionStart)
    await handBack($, AMEND + '\n' + REPORT('1234abcd'))
    expect(w.files.get(BRIEF)).toBe(H + '\nbody')
    expect(delivered(w)).toContain('(scopeAmends within-parent)')
  })

  test('project: set to owner/number, land adds the new issue to it; anything else is unset', { options: { landAuto: true } }, async ($, on) => {
    const card = ['---', 'id: MOD-1', 'title: Card MOD-1', 'domain: mod', 'tier: standard', 'status: queued', 'scope: [a/**]', 'gate: node', '---', 'body', ''].join('\n')
    const w = world(on, {
      files: { [REPO_FILE]: JSON.stringify({ domains: ['mod'], cardDir: 'docs/cards', project: 'not a project' }), [`${ROOT}/docs/cards/MOD-1-a.md`]: card, [`${ROOT}/.git/config`]: '[remote "origin"]\n\turl = https://github.com/o/r.git\n' },
      dirs: { [`${ROOT}/docs/cards`]: ['MOD-1-a.md'] },
      run: async argv => (argv[0] === 'gh' && argv[2] === 'create' ? { exitCode: 0, stdout: 'https://github.com/o/r/issues/42\n' } : undefined),
    })
    await $.session.start(sessionStart)
    const land = (t: string) => $.command.run({ command: 'delegation', args: `land task ${t}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    await land('One')
    expect(argvs(w).some(a => a[1] === 'project')).toBe(false) // the repo file's value is not owner/number: unset
    await set($, 'project', 'o/1')
    await land('Three')
    expect(argvs(w).filter(a => a[1] === 'project')).toEqual([['gh', 'project', 'item-add', '1', '--owner', 'o', '--url', 'https://github.com/o/r/issues/42']])
  })

  test('review: on sends a clean hand-back to a second checker (next=review)', async ($, on) => {
    const w = handBackWorld(on, { gate: 0 })
    await $.session.start(sessionStart)
    await set($, 'review', 'on')
    await handBack($)
    expect(delivered(w)).toContain('next=review')
  })

  test('reviewTier: frontier puts the second checker on opus (one tier below a standard worker is haiku)', async ($, on) => {
    const w = handBackWorld(on, { gate: 0 })
    await $.session.start(sessionStart)
    await set($, 'review', 'on')
    await set($, 'verdictVerbosity', 'full')
    await set($, 'reviewTier', 'frontier')
    await handBack($)
    expect(spawnCallOf(delivered(w))?.model).toBe('opus')
  })

  test('verdictVerbosity: silent posts no row, a toast only', async ($, on) => {
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'verdictVerbosity', 'silent')
    await handBack($)
    expect(rowsOf(w)).toEqual([])
    expect(w.toasts.some(t => t.startsWith('chassis-delegation: T-4 attempt 1/3 refuted'))).toBe(true)
  })

  test('ledgerFile: off writes no .delegation/ledger.jsonl', async ($, on) => {
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'ledgerFile', 'off')
    await handBack($)
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'refuted' })
    expect(w.files.has(`${ROOT}/.delegation/ledger.jsonl`)).toBe(false)
  })

  test('baseRef: develop is the branch a worker\'s changes are compared against', async ($, on) => {
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await set($, 'baseRef', 'develop')
    await handBack($)
    expect(argvs(w).some(a => a[0] === 'git' && a.includes('develop'))).toBe(true)
  })

  test('ignore: traces/** is left out of what a repo=here worker is held to', async ($, on) => {
    const here = FIXTURE_CARD.replace('status: queued', 'status: queued\nrepo: here')
    const w = dispatchWorld(on, { card: here, run: argv => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : argv[3] === 'rev-parse' ? { exitCode: 0, stdout: `${'c'.repeat(40)}\n` } : undefined) })
    await $.session.start(sessionStart)
    await set($, 'ignore', 'traces/**')
    await dispatch($, 'BE-101 --scope app/billing/Rate*.ts')
    expect((w.files.get(DEFAULT_BRIEF) ?? '').split('\n')[0]).toContain(' ignore=traces/**,agents/tasks/** ')
  })

  // ---- Where things go ----
  test('briefDir: a folder of your own is where /dispatch writes the brief', async ($, on) => {
    const w = dispatchWorld(on)
    await $.session.start(sessionStart)
    await set($, 'briefDir', `${SCRATCH}/mine`)
    expect(await dispatch($, 'BE-101 --dry-run')).toContain(`2. brief ${SCRATCH}/mine/BE-101.brief.md written`)
    expect(w.files.has(DEFAULT_BRIEF)).toBe(false)
  })

  test('briefTemplate: a file of your own is the layout of the brief', async ($, on) => {
    const w = dispatchWorld(on, { files: { '/tpl/brief.md': 'Our own layout: read the card, then work.\n' } })
    await $.session.start(sessionStart)
    await set($, 'briefTemplate', '/tpl/brief.md')
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.get(DEFAULT_BRIEF) ?? '').toContain('Our own layout: read the card, then work.')
  })

  test('briefExtra: the lines are in every brief', async ($, on) => {
    // the engine cannot read the shipped template; the repo names one that has the {{extra}} line, as the shipped one does
    const w = dispatchWorld(on, { files: { '/tpl/brief.md': 'Rules.\n{{extra}}\n', [REPO_FILE]: '{"briefTemplate":"/tpl/brief.md"}' } })
    await $.session.start(sessionStart)
    await set($, 'briefExtra', 'Run make check before you report.')
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.get(DEFAULT_BRIEF) ?? '').toContain('Run make check before you report.')
  })

  test('briefLocal: the rules in a private file are in every brief, under their own heading', async ($, on) => {
    const w = dispatchWorld(on, { files: { '/tpl/brief.md': 'Rules.\n{{extra}}\n', [REPO_FILE]: '{"briefTemplate":"/tpl/brief.md"}', [`${ROOT}/local.md`]: 'Keep the shared app closed.\n' }, run: argv => (argv.includes('ls-files') ? { exitCode: 1, stdout: '' } : undefined) })
    await $.session.start(sessionStart)
    await set($, 'briefLocal', 'local.md')
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.get(DEFAULT_BRIEF) ?? '').toContain('## Local rules (not for debrief)\n\nKeep the shared app closed.')
  })

  test('worktreeRoot: /trees is where the worker\'s copy of the repo is made', async ($, on) => {
    const w = dispatchWorld(on)
    await $.session.start(sessionStart)
    await set($, 'worktreeRoot', '/trees')
    await dispatch($, 'BE-101 --scope app/**')
    expect(argvs(w)).toContainEqual(['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', '/trees/acme-app-BE-101', 'origin/main'])
  })

  test('cardDir: docs/cards is where /dispatch finds the card', async ($, on) => {
    const w = dispatchWorld(on, { dir: 'docs/cards' })
    await $.session.start(sessionStart)
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.has(DEFAULT_BRIEF)).toBe(false)
    await set($, 'cardDir', 'docs/cards')
    await dispatch($, 'BE-101 --dry-run')
    expect(w.files.has(DEFAULT_BRIEF)).toBe(true)
  })

  // ---- Debriefs ----
  test('autoDebrief: off writes no debrief at a clean stop', async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'autoDebrief', 'off')
    await $.turn.complete(mainTurn())
    await w.clock.advance(60 * MIN)
    expect(w.spawns).toHaveLength(0)
  })

  test('debriefIdleMinutes: 45 waits 45 quiet minutes (the built-in 20)', async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'debriefMode', 'transcript')
    await set($, 'debriefIdleMinutes', '45')
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
    await w.clock.advance(25 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.spawns[0]).toMatchObject({ description: '🔵 debrief' })
  })

  test('debriefMinNewLines: 50 holds a debrief back on 30 new lines (the built-in 25 runs it)', async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'debriefMode', 'transcript')
    await set($, 'debriefMinNewLines', '50')
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
  })

  test('debriefMinEvents: 2 corrections are enough with no breadcrumb file (the built-in 5)', async ($, on) => {
    const w = world(on, { listAgents: true, skip: ['prompt.submit'] })
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    await $.session.start(sessionStart)
    await set($, 'debriefMode', 'transcript')
    await set($, 'debriefMinEvents', '2')
    for (const text of ['no, the other file', 'actually use pnpm']) await $.prompt.submit({ text } as never)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ mode: 'events', lines: 2 })
  })

  test('debriefCooldownHours: 8 holds back a debrief 7 hours after the last (the built-in 6 runs it)', async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(80), [DONE]: '10\n' }, listAgents: true, store: { 'delegation.debrief.sess-1': { lastAt: NOW - 7 * H, watermark: 0, lines: 40 } } })
    await $.session.start(sessionStart)
    await set($, 'debriefMode', 'transcript')
    await set($, 'debriefCooldownHours', '8')
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0) // 7 h 20 min since the last
    await w.clock.advance(40 * MIN)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1) // 8 h 20 min since the last
  })

  test('debriefMode: notes (the built-in) adds one row and spawns no agent; transcript spawns the debrief agent', async ($, on) => {
    const verdict = { task: 'T-1', attempt: 1, verdict: 'consistent', line: 'T-1 consistent', at: NOW - 30 * MIN }
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true, store: { 'delegation.recent.sess-1': [verdict] } })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
    expect([...w.appended.map(a => a.text), ...w.logs].join('\n')).toContain('write the review note, then /delegation debrief ingest <note.md>')
    await set($, 'debriefMode', 'transcript')
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
  })

  test('debriefAgent: Explore is the agent type that writes the debrief', async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs(40), [DONE]: '10\n' }, listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'debriefMode', 'transcript')
    await set($, 'debriefAgent', 'Explore')
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(typeOf(w.spawns[0])).toBe('Explore')
  })

  const FOLDER = `${ROOT}/.delegation/debriefs`
  const FINDINGS = `${FOLDER}/2026-10-10-mod-run.findings.json`
  const finding = { kind: 'went_wrong', surface: '/delegation accept', fault_class: 'bug', severity: 'P2', title: 'Accepted row stayed owed', body: 'It came back.', evidence: ['e1'] }
  const ghRun = (argv: string[]): RunAnswer => {
    if (argv[0] === 'gh' && argv[2] === 'list') return { exitCode: 0, stdout: '[]' }
    if (argv[0] === 'gh' && argv[2] === 'create') return { exitCode: 0, stdout: 'https://github.com/owner/mod/issues/31\n' }
    return { exitCode: 0, stdout: '' }
  }

  test('redact: a word list lets /delegation debrief post 1 post (with none it is refused)', async ($, on) => {
    const w = world(on, {
      files: { [FINDINGS]: JSON.stringify({ debrief: 'x', modVersion: '0.9.8', scrubbed: true, findings: [finding] }), [REPO_FILE]: '{"issueRepo":"owner/mod"}' },
      dirs: { [FOLDER]: ['2026-10-10-mod-run.findings.json'] },
      run: ghRun,
    })
    await $.session.start(sessionStart)
    const post = { command: 'delegation', args: 'debrief post 1', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never
    expect(String((await $.command.run(post)).text)).toContain('debrief post refused, nothing posted')
    await set($, 'redact', 'globex, initech')
    await $.command.run(post)
    expect(w.runs.filter(r => r.argv[0] === 'gh' && r.argv[2] === 'create')).toHaveLength(1)
  })

  test('postFindings: off is the posting mode for the issue repo', async ($, on) => {
    world(on, { files: { [REPO_FILE]: '{"issueRepo":"owner/mod"}' } })
    await $.session.start(sessionStart)
    expect(await status($)).toContain('post findings: ask → owner/mod')
    await set($, 'postFindings', 'off')
    expect(await status($)).toContain('post findings: off → owner/mod')
  })

  // ---- Evals ----
  test('autoEval: on runs the eval command once main moves and you are idle', async ($, on) => {
    const w = evalWorld(on)
    await $.session.start(sessionStart)
    await set($, 'evalCommand', 'npm run eval')
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(0)
    await set($, 'autoEval', 'on')
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(1)
    expect(w.spawns[0]).toMatchObject({ description: '🔵 eval T1' })
  })

  test('evalIdleMinutes: 30 waits 30 quiet minutes (the built-in 10)', async ($, on) => {
    const w = evalWorld(on)
    await $.session.start(sessionStart)
    await evalOn($)
    await set($, 'evalIdleMinutes', '30')
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(w.spawns).toHaveLength(0)
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(1)
  })

  test('evalCommand: the command is what the eval runner is told to run', async ($, on) => {
    const w = evalWorld(on)
    await $.session.start(sessionStart)
    await evalOn($, 'make eval')
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(String(w.spawns[0]?.prompt)).toContain(`Run \`make eval\` once in ${ROOT}`)
  })

  const live = async ($: Tester, w: W, extra: [string, string][] = []) => {
    await $.session.start(sessionStart)
    await evalOn($)
    for (const [f, v] of extra) await set($, f, v)
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    await $.turn.complete(turnInput('agent-1', cleanT1))
  }

  test('evalLive: on runs the real-world test after a clean first check', async ($, on) => {
    const w = evalWorld(on)
    await live($, w, [['evalLiveCommand', './scripts/live.sh'], ['evalLive', 'on']])
    expect(w.spawns).toHaveLength(2)
    expect(w.spawns[1]).toMatchObject({ description: '🔵 eval T2' })
  })

  test('evalLiveCommand: the command is what the real-world runner is told to run', async ($, on) => {
    const w = evalWorld(on)
    await live($, w, [['evalLive', 'on'], ['evalLiveCommand', './scripts/live-run.sh --all']])
    expect(String(w.spawns[1]?.prompt)).toContain('Run `./scripts/live-run.sh --all` once in')
  })

  test('evalLiveMaxUsd: 3 is the most the real-world runner is told it may spend', async ($, on) => {
    const w = evalWorld(on)
    await live($, w, [['evalLive', 'on'], ['evalLiveCommand', './scripts/live.sh'], ['evalLiveMaxUsd', '3']])
    expect(String(w.spawns[1]?.prompt)).toContain('at most $3.00')
  })

  test('sessionUsdCap: $2 holds the real-world test back when the session would pass it', async ($, on) => {
    const w = evalWorld(on)
    await live($, w, [['evalLive', 'on'], ['evalLiveCommand', './scripts/live.sh'], ['sessionUsdCap', '2']])
    expect(w.spawns).toHaveLength(1) // $1.50 so far + $1.00 > $2.00
  })

  test('evalAgent: Explore is the agent type that runs the eval', async ($, on) => {
    const w = evalWorld(on)
    await $.session.start(sessionStart)
    await evalOn($)
    await set($, 'evalAgent', 'Explore')
    await $.turn.complete(mainTurn())
    await w.clock.advance(10 * MIN)
    expect(typeOf(w.spawns[0])).toBe('Explore')
  })

  // ---- Guards and nudges for the brain ----
  test('gitGuard: off lets a commit on main through', async ($, on) => {
    world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)).deny).toContain('no commit on main')
    await set($, 'gitGuard', 'off')
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)).deny).toBeUndefined()
  })

  test('guardBranches: develop is protected, and main no longer is', async ($, on) => {
    let branch = 'develop'
    world(on, { run: argv => branchIs(branch)(argv) })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    await set($, 'guardBranches', 'develop')
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m x' } as never)).deny).toContain('no commit on develop')
    branch = 'main'
    expect((await $.tool.call({ tool: 'Bash', command: 'git commit -m y' } as never)).deny).toBeUndefined()
  })

  test('delegateOnly: deny refuses the main assistant an edit to source', async ($, on) => {
    world(on, { model: FABLE })
    on('tool.call', { tool: 'Edit' }, passed)
    await $.session.start(sessionStart)
    const edit = { tool: 'Edit', file_path: `${ROOT}/hooks/lib/a.ts`, old_string: 'a', new_string: 'b' } as never
    expect((await $.tool.call(edit)).deny).toBeUndefined()
    await set($, 'delegateOnly', 'deny')
    expect((await $.tool.call(edit)).deny).toContain('delegateOnly is on')
  })

  const bench = async ($: Tester, w: W) => {
    w.context = { window: 1_000_000, percent: 30 }
    for (let i = 0; i < 3; i++) await $.tool.call({ tool: 'Bash', command: './bench.sh --scene 3 --frames 600 --out /tmp/one.csv' } as never)
    return w.appended.filter(a => a.text.includes('bench.sh --scene 3'))
  }

  test('MOD-119 (#187): three distinct probes to one tool raise no warning; the same argv three times with unchanged output does', async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    w.context = { window: 1_000_000, percent: 30 }
    const prefix = 'O=/tmp/probe-output-folder-with-a-rather-long-name-to-pass-sixty; ./bench.sh --scene 3'
    for (const n of ['one', 'two', 'three']) await $.tool.call({ tool: 'Bash', command: `${prefix} --probe ${n}` } as never)
    expect(w.appended.filter(a => a.text.includes('bench.sh --scene 3'))).toHaveLength(0)
    expect(await bench($, w)).toHaveLength(1)
  })

  test('driveWarn: off raises no warning on a third identical run in a big session', async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    await set($, 'driveWarn', 'off')
    expect(await bench($, w)).toHaveLength(0)
  })

  test('driveWarnTokens: 500K raises no warning at 300K (the built-in 200K does)', async ($, on) => {
    const w = world(on, { model: FABLE })
    on('tool.call', { tool: 'Bash' }, passed)
    await $.session.start(sessionStart)
    await set($, 'driveWarnTokens', '500K')
    expect(await bench($, w)).toHaveLength(0)
  })

  test('waitStallMin: 5 says a silent waiting worker stalled after five minutes (the built-in 20 does not)', async ($, on) => {
    const w = world(on, { files: { [`${SCRATCH}/briefs/T-4.brief.md`]: '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]\nbody' }, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await set($, 'waitStallMin', '5')
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${SCRATCH}/briefs/T-4.brief.md.` }))
    await $.turn.complete(turnInput('agent-4', 'Waiting for the background job.'))
    await w.clock.advance(5 * MIN)
    expect(w.appended.filter(a => a.text.includes('T-4 stalled 5 min; resume or stop it'))).toHaveLength(1)
  })

  test('freshSessionTokens: 100K suggests a fresh session at 150K (the built-in 400K does not)', async ($, on) => {
    const w = world(on, { model: FABLE })
    w.context = { window: 1_000_000, percent: 15 }
    await $.session.start(sessionStart)
    await set($, 'freshSessionTokens', '100K')
    await $.turn.complete(brainTurn(usage(FABLE, 0, 1_000, 150_000, 0)))
    await $.turn.complete(brainTurn(usage(FABLE, 0, 1_000, 160_000, 0)))
    const rows = w.appended.filter(a => a.text.includes('start a fresh session at the next phase boundary'))
    expect(rows).toHaveLength(1)
    expect(rows[0]?.text).toContain('(freshSessionTokens 100K)')
  })

  test('wakeOnVerdict: on starts a turn on its own when a result is judged', async ($, on) => {
    const w = handBackWorld(on, { gate: 0 })
    await $.session.start(sessionStart)
    await set($, 'wakeOnVerdict', 'on')
    await handBack($)
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
  })

  test('landNudge: a flagged prompt is cleared by a land call, shown at turn end when none came, and off draws and records nothing', { options: { landAuto: true } }, async ($, on) => {
    const w = world(on, { skip: ['prompt.submit'] })
    on('prompt.submit', (_$, e) => ({ text: e.text }) as never)
    await $.session.start(sessionStart)
    const LINE = 'lead: land this as an issue (land or land_plan) or say it is not work'
    const drawn = async () => {
      try {
        const ui = await $.ui.mount({ plugin: 'chassis-delegation', surface: 'terminal', component: 'AbovePrompt', props: bandProps() } as never)
        return (await ui.find({ type: 'Text', text: LINE })) !== undefined
      } catch {
        return false
      }
    }
    const PROMPT = 'the merge button is broken on dark mode'
    await $.prompt.submit({ text: PROMPT } as never)
    await $.tool.call({ tool: 'mcp__chassis-delegation__land', type: 'bug', title: 'Merge button', dryRun: true } as never)
    await $.turn.complete(mainTurn())
    expect(await drawn()).toBe(false)
    await $.prompt.submit({ text: PROMPT } as never)
    await $.turn.complete(mainTurn())
    expect(await drawn()).toBe(true)
    await set($, 'landNudge', 'off')
    expect(await drawn()).toBe(false)
    await $.prompt.submit({ text: PROMPT } as never)
    await $.turn.complete(mainTurn())
    expect(await drawn()).toBe(false)
    await set($, 'landNudge', 'on')
    expect(await drawn()).toBe(false) // nothing was recorded while off
    expect(w.invalidations).toBeGreaterThan(0)
  })

  test('landAuto: off makes land show the issue and file nothing without confirm: true', async ($, on) => {
    const w = world(on, { skip: ['prompt.submit'], files: { [`${ROOT}/.git/config`]: '[remote "origin"]\n\turl = https://github.com/o/r.git\n' } })
    await $.session.start(sessionStart)
    await set($, 'landAuto', 'off')
    const r = await $.tool.call({ tool: 'mcp__chassis-delegation__land', type: 'bug', title: 'Merge button' } as never)
    const out = typeof (r as { result?: unknown }).result === 'string' ? ((r as { result?: string }).result as string) : String((r as { text?: string }).text ?? '')
    expect(out).toContain('nothing filed: landAuto is off')
    expect(w.runs.some(x => x.argv[0] === 'gh' && x.argv[2] === 'create')).toBe(false)
  })

  test('MOD-208: landAuto on restores filing at once', async ($, on) => {
    const w = world(on, { skip: ['prompt.submit'], files: { [`${ROOT}/.git/config`]: '[remote "origin"]\n\turl = https://github.com/o/r.git\n' }, run: async (argv: string[]) => (argv[0] === 'gh' ? { exitCode: 0, stdout: 'https://github.com/o/r/issues/7\n' } : undefined) })
    await $.session.start(sessionStart)
    await set($, 'landAuto', 'on')
    const r = await $.tool.call({ tool: 'mcp__chassis-delegation__land', type: 'bug', title: 'Merge button' } as never)
    const out = typeof (r as { result?: unknown }).result === 'string' ? ((r as { result?: string }).result as string) : String((r as { text?: string }).text ?? '')
    expect(out).toContain('filed #7')
    expect(w.runs.some(x => x.argv[0] === 'gh' && x.argv[2] === 'create')).toBe(true)
  })

  test('readyFallbackMinutes: 1 starts a waiting task itself after a minute (the built-in 10)', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    await set($, 'readyFallbackMinutes', '1')
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    expect((await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))).deny).toContain('queued: T-9')
    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    await w.clock.advance(MIN)
    expect(w.spawns).toHaveLength(3)
    expect(records(w, 'T-9')[0]).toMatchObject({ source: 'fallback' })
  })

  test('classifierSecondOpinion: off asks no classifier in a card dry run', async ($, on) => {
    const given = { title: 'The rom reader returns the header size', why: 'The decompiler cannot tell how big a header is.', doneWhen: ['read_header(path) returns the size'], scope: ['game_decompiler/**', 'tests/**'], redTest: 'python3 -m unittest tests.test_rom' }
    const w = world(on, { classify: 'economy', files: { [REPO_FILE]: JSON.stringify({ gateMap: { test: 'npm test' } }) }, dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, store: { 'delegation.agentTypes': ['general-purpose'] } })
    await $.session.start(sessionStart)
    await set($, 'classifierSecondOpinion', 'off')
    const out = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__card', ...given } as never))
    expect(out).toContain('wrote ')
    expect(out).not.toContain('classifier')
    expect(w.store.has('delegation.classifier.OPS-1')).toBe(false)
    expect(w.store.has(`delegation.classifier.OPS-1@${ROOT}`)).toBe(false)
  })

  // ---- Display ----
  test('dashboardBand: off draws no strip above the prompt', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    w.state.set('chassis-delegation.queue', [{ prompt: '', description: '', subagentType: 'general-purpose', task: 'T-3', at: NOW }])
    const band = async () => {
      try {
        const ui = await $.ui.mount({ plugin: 'chassis-delegation', surface: 'terminal', component: 'AbovePrompt', props: bandProps() } as never)
        return await ui.find({ key: 'dash-band' })
      } catch {
        return undefined
      }
    }
    expect(await band()).toBeUndefined() // MOD-128: off by default
    await set($, 'dashboardBand', 'on')
    expect(await band()).toBeDefined()
    await set($, 'dashboardBand', 'off')
    expect(await band()).toBeUndefined()
  })

  test('ration: off draws no meter in the footer; five_hour reads the five-hour window', async ($, on) => {
    ;(on as unknown as (n: string, h: unknown) => void)('session.measure', (_$: unknown, e: { changed: string[] }) => ({ changed: e.changed }))
    const w = world(on)
    await $.session.start(sessionStart)
    const rateLimits = [{ kind: 'five_hour', percentUsed: 40, resetsAt: Math.floor(NOW / 1000) + 3 * 3600 }, { kind: 'seven_day', percentUsed: 71, resetsAt: Math.floor(NOW / 1000) + 3 * 86400 }]
    await set($, 'ration', 'five_hour')
    await $.session.measure({ context: { tokens: 1, window: 200_000, percent: 1 }, rateLimits, changed: ['rateLimits'] } as never)
    const ask = async () => String((await $.command.run({ command: 'delegation', args: 'ration', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    const five = await ask()
    expect(five).toContain('40%')
    expect(five).not.toContain('71%')
    await set($, 'ration', 'off')
    expect(await ask()).not.toContain('40%')
    expect(w.store.size).toBeGreaterThanOrEqual(0)
  })

  test('rationDaily: a number fixes the daily allowance, 0 paces to the reset', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    await set($, 'rationDaily', '8')
    const all = String((await $.command.run({ command: 'delegation', args: 'config', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(all).toContain('rationDaily')
  })

  test('modelGlyphs: off removes the glyph from a started row', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1') }))
    expect(delivered(w)).toContain('T-1 started · 🔵 sonnet (standard)')
    await set($, 'modelGlyphs', 'off')
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_02ABCDEFGH' }))
    expect(delivered(w)).toContain('T-2 started · sonnet (standard)')
  })
  const gateRunOf = (w: W) => w.runs.find(r => r.argv[0] === 'npx')
  const gateRepo = (extra: Record<string, unknown>) => JSON.stringify({ gateMap: { prettier: 'npx prettier --check {files}' }, ...extra })

  test('gateTimeoutMinutes: 8 in the repo file lets the verifier run a gate for 8 minutes', async ($, on) => {
    const w = handBackWorld(on, { files: { [REPO_FILE]: gateRepo({ gateTimeoutMinutes: 8 }) } })
    await $.session.start(sessionStart)
    await handBack($)
    expect(gateRunOf(w)?.timeoutMs).toBe(480_000)
  })

  test('gate timeout 10 minutes runs the gate for the host ceiling of 10 minutes', async ($, on) => {
    const w = handBackWorld(on, { files: { [REPO_FILE]: gateRepo({ gateTimeoutMinutes: 10 }) } })
    await $.session.start(sessionStart)
    await handBack($)
    expect(gateRunOf(w)?.timeoutMs).toBe(600_000)
  })

  test('gate timeout unset: the verifier lets a gate run 9 minutes', async ($, on) => {
    const w = handBackWorld(on)
    await $.session.start(sessionStart)
    await handBack($)
    expect(gateRunOf(w)?.timeoutMs).toBe(540_000)
  })

  test('gate timeout 15 is named in the config errors and the 9 minutes hold', async ($, on) => {
    const w = handBackWorld(on, { files: { [REPO_FILE]: gateRepo({ gateTimeoutMinutes: 15 }) } })
    await $.session.start(sessionStart)
    await handBack($)
    expect(gateRunOf(w)?.timeoutMs).toBe(540_000)
    expect(await say($, 'gateTimeoutMinutes')).toContain('gateTimeoutMinutes')
    expect(delivered(w) + w.debugLogs.join('\n')).toContain('gateTimeoutMinutes')
  })

  test('treeImportBatch: 1 makes a tree import create one issue and stop', async ($, on) => {
    let n = 49
    const w = world(on, {
      skip: ['prompt.submit'],
      files: { [`${ROOT}/.git/config`]: '[remote "origin"]\n\turl = https://github.com/o/r.git\n', [`${ROOT}/.delegation/plans/p.json`]: JSON.stringify({ version: 1, items: [{ type: 'epic', title: 'One' }, { type: 'epic', title: 'Two' }] }) },
      run: async (argv: string[]) => (argv[0] === 'sleep' ? { exitCode: 0, stdout: '' } : argv[0] === 'gh' ? { exitCode: 0, stdout: argv[2] === 'create' ? `https://github.com/o/r/issues/${++n}\n` : '' } : undefined),
    })
    await $.session.start(sessionStart)
    await set($, 'treeImportBatch', '1')
    const r = await $.tool.call({ tool: 'mcp__chassis-delegation__tree_import', file: '.delegation/plans/p.json', confirm: true } as never)
    const out = typeof (r as { result?: unknown }).result === 'string' ? ((r as { result?: string }).result as string) : String((r as { text?: string }).text ?? '')
    expect(out).toContain('filed 1 of 2; run again to continue')
    expect(w.runs.filter(x => x.argv[0] === 'gh' && x.argv[2] === 'create').length).toBe(1)
  })
})

