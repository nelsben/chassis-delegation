// MOD-270: the brain picks each worker's model and effort with a reason; the dry run and dispatch print the choice and the history.
import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, sessionStart, commandInput, brainSpawn, stepInput, ROOT, SCRATCH } from './harness'

const CARD_TOOL = 'mcp__chassis-delegation__card'
const tasksDir = `${ROOT}/agents/tasks`
const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'line' as const, gateMap: '{"check":"checker {outdir}"}' }
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task}@${ROOT}`) ?? []) as Record<string, unknown>[]
const runStep = async ($: { turn: { step: (e: never) => AsyncIterable<unknown> } }, input: never) => {
  for await (const chunk of $.turn.step(input)) void chunk
}
const REPORT = (id: string) => `[[report v=1 task=${id} subtask=main branch=none pr=none sha=none gate=pass red=none files=none]]`
const card = (id: string, tier: string, extra: string[] = []) =>
  ['---', `id: ${id}`, `title: ${id}`, 'domain: ops', `tier: ${tier}`, ...extra, 'status: queued', 'repo: none', 'scope: [/out/hair/**]', 'forbid: []', 'red_test: none', 'gate: check', 'budget: 3-attempts', '---', '## Why', '', 'Outside the repo.', ''].join('\n')
const setup = (on: Parameters<typeof world>[0], files: Record<string, string>, extra: Record<string, unknown> = {}) =>
  world(on, {
    files,
    dirs: { [tasksDir]: Object.keys(files).map(f => f.slice(tasksDir.length + 1)).filter(f => f.endsWith('.md')) },
    trees: ['/out/hair'],
    run: argv => (argv[0] === 'checker' ? { exitCode: 0, stdout: 'checked\n' } : undefined),
    store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    ...extra,
  })

describe('MOD-270: the card tool takes the choice', () => {
  const input = { title: 'Rename the hair files', why: 'Mechanical.', doneWhen: ['the files are renamed'], redTest: 'none', repo: 'none', gate: 'check', scope: ['/out/hair/**'] }

  test('the dry run writes tier_reason, effort and effort_reason, and prints the choice line then the history line before the classifier line', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/README.md`]: '' }, { classify: 'standard' })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input, tierReason: 'a plain\nrename: easy', effort: 'low', effortReason: 'mechanical' } as never))
    const text = w.files.get(`${tasksDir}/OPS-1-rename-the-hair-files.md`) ?? ''
    expect(text).toContain('\ntier_reason: a plain rename easy\n')
    expect(text).toContain('\neffort: low\n')
    expect(text).toContain('\neffort_reason: mechanical\n')
    const lines = out.split('\n')
    const at = lines.findIndex(l => l.startsWith('tier standard → sonnet'))
    expect(lines[at]).toBe('tier standard → sonnet (a plain rename easy) · effort low (mechanical)')
    expect(lines[at + 1]).toBe('history: none')
    expect(lines[at + 2]).toBe('card says standard · classifier agrees')
  })

  test('without reasons the line says default and tier default; a bad effort is refused naming the allowed ones and writes nothing', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/README.md`]: '' })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input } as never))
    expect(out).toContain('tier standard → sonnet (default) · effort medium (tier default)')
    const bad = resultText(await $.tool.call({ tool: CARD_TOOL, ...input, title: 'Another one', effort: 'max' } as never))
    expect(bad).toContain('card refused:')
    expect(bad).toContain('low, medium, high')
    expect(w.files.get(`${tasksDir}/OPS-2-another-one.md`)).toBeUndefined()
  })

  test('a premium card shows the final alias: opus when fable is not allowed', { options: OPTIONS }, async ($, on) => {
    setup(on, { [`${tasksDir}/README.md`]: '' })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input, tier: 'premium', tierReason: 'default' } as never))
    expect(out).toContain('tier premium → opus (default) · effort high (tier default)')
  })

  test('the history line reads the ledger: one pair from seeded rows', { options: OPTIONS }, async ($, on) => {
    const rows = ['T-1', 'T-2'].map(task => JSON.stringify({ kind: 'spawn', task, attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 0.5 }))
    setup(on, { [`${tasksDir}/README.md`]: '', [`${ROOT}/.delegation/ledger.jsonl`]: rows.join('\n') + '\n' })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input } as never))
    expect(out).toContain('history: sonnet/medium 2 thin · 100% · $0.50/card')
  })
})

describe('MOD-275: the choice line suggests the cheapest pair that has passed for the class', () => {
  const input = { title: 'Rename the hair files', why: 'Mechanical.', doneWhen: ['the files are renamed'], redTest: 'none', repo: 'none', gate: 'check', scope: ['/out/hair/**'] }
  // 60 default cards and 60 exploratory ones one effort level down, all passing, the exploratory ones cheaper; class feature/large
  const ledger = () => {
    const row = (task: string, effort: string, usd: number, over: Record<string, unknown> = {}) =>
      JSON.stringify({ kind: 'spawn', task, attempt: 1, tier: 'standard', alias: 'sonnet', effort, class: 'feature/large', verdict: 'consistent', usd, effortSource: 'tier', ...over })
    return [
      ...Array.from({ length: 60 }, (_, i) => row(`D-${i}`, 'medium', i % 2 ? 0.99 : 0.79)),
      ...Array.from({ length: 60 }, (_, i) => row(`E-${i}`, 'low', i % 2 ? 0.55 : 0.45, { effortSource: 'explore', explore: true, exploreFrom: 'sonnet/medium' })),
    ].join('\n') + '\n'
  }

  test('suggest (the default): the line follows the history line', { options: OPTIONS }, async ($, on) => {
    setup(on, { [`${tasksDir}/README.md`]: '', [`${ROOT}/.delegation/ledger.jsonl`]: ledger() })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input } as never))
    expect(out).toMatch(/suggest sonnet\/low for feature\/large \(n 60, lower bound \d+% vs default 100%, \$0\.50 vs \$0\.89 per confirmed card\)/)
  })

  test('off: no suggestion line', { options: { ...OPTIONS, adaptive: 'off' } }, async ($, on) => {
    setup(on, { [`${tasksDir}/README.md`]: '', [`${ROOT}/.delegation/ledger.jsonl`]: ledger() })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...input } as never))
    expect(out).not.toContain('suggest sonnet')
  })
})

describe('MOD-270: dispatch stores the choice, the worker steps at it, the record and the started row carry it', () => {
  test('a card effort with reasons: the dispatch prints the choice line; the started row shows the reasons; the record says effortSource card', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-8-x.md`]: card('OPS-8', 'standard', ['tier_reason: two modules', 'effort: high', 'effort_reason: ambiguous scope']) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-8'))).text)
    expect(out).toContain('tier standard → sonnet (two modules) · effort high (ambiguous scope)')
    expect(out).toContain('history: none')
    await brainSpawn($, out)
    expect(delivered(w)).toContain('OPS-8 started · 🔵 sonnet (standard) · attempt 1/3 · effort high · two modules / ambiguous scope')
    await runStep($, stepInput('agent-1', 'low'))
    expect(w.steps).toEqual([{ agentId: 'agent-1', effort: 'high' }])
    expect(records(w, 'OPS-8')[0]).toMatchObject({ effort: 'high', effortSource: 'card', tierReason: 'two modules', effortReason: 'ambiguous scope' })
  })

  test('a card with no effort: the tier decides, the record says effortSource tier and holds no reasons', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-9-x.md`]: card('OPS-9', 'standard') })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    await runStep($, stepInput('agent-1'))
    const r = records(w, 'OPS-9')[0] as Record<string, unknown>
    expect(r).toMatchObject({ effort: 'medium', effortSource: 'tier' })
    expect(r.tierReason).toBeUndefined()
    expect(r.effortReason).toBeUndefined()
  })

  test('reasons ride on the record when the effort resolves to the engine default', { options: { ...OPTIONS, effortByTier: '{"standard":0}' } }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-7-x.md`]: card('OPS-7', 'standard', ['tier_reason: because']) })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-7'))).text))
    await runStep($, stepInput('agent-1', 'xhigh'))
    expect(w.steps).toEqual([{ agentId: 'agent-1', effort: 'xhigh' }])
    expect(records(w, 'OPS-7')[0]).toMatchObject({ tierReason: 'because' })
  })

  test('a card edited to a new effort and re-dispatched runs attempt 2 (a new worker) at it; attempt 1 ran at the old one', { options: OPTIONS }, async ($, on) => {
    const path = `${tasksDir}/OPS-6-x.md`
    const w = setup(on, { [path]: card('OPS-6', 'standard', ['effort: medium']) })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-6'))).text))
    await runStep($, stepInput('agent-1'))
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('OPS-6')}`))
    w.files.set(path, card('OPS-6', 'standard', ['effort: high']))
    await brainSpawn($, String((await $.command.run(commandInput('OPS-6'))).text), { tool_use_id: 'toolu_SECOND006' })
    await runStep($, stepInput('agent-2'))
    expect(w.steps).toEqual([{ agentId: 'agent-1', effort: 'medium' }, { agentId: 'agent-2', effort: 'high' }])
    expect(records(w, 'OPS-6').map(r => [r.attempt, r.effort])).toEqual([[1, 'medium'], [2, 'high']])
  })
})

describe('MOD-270: a resume of the same agent keeps the effort it started at', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }

  test('the card effort changes in the store after attempt 1; the SendMessage resume still steps at the first effort', { options: GM }, async ($, on) => {
    on('tool.call', { tool: 'SendMessage' }, async () => ({ result: 'queued' }))
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, dirs: { [`${ROOT}-T-4`]: [] }, run: argv => (argv[0] === 'npx' ? { exitCode: 1, stdout: 'a/x.ts: not formatted\n' } : undefined), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    w.store.set(`delegation.effort.T-4@${ROOT}`, 'medium')
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: `${ROOT}-T-4` }))
    await runStep($, stepInput('agent-4'))
    await $.turn.complete(turnInput('agent-4', 'Done.\n[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1111111 gate=pass files=a/x.ts]]'))
    w.store.set(`delegation.effort.T-4@${ROOT}`, 'high')
    await $.tool.call({ tool: 'SendMessage', to: 'agent-4', message: 'fix it' } as never)
    await runStep($, stepInput('agent-4'))
    expect(w.steps).toEqual([{ agentId: 'agent-4', effort: 'medium' }, { agentId: 'agent-4', effort: 'medium' }])
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.effort])).toEqual([[1, 'spawn', 'medium'], [2, 'resume', 'medium']])
  })
})

describe('MOD-276: a frontier or premium card needs a tier_reason', () => {
  test('dispatching a frontier card with no tier_reason: is refused with a message naming tier_reason; a dry run says the same; a reason, or standard, dispatches', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, {
      [`${tasksDir}/OPS-30-x.md`]: card('OPS-30', 'frontier'),
      [`${tasksDir}/OPS-31-x.md`]: card('OPS-31', 'frontier', ['tier_reason: ambiguous across two modules']),
      [`${tasksDir}/OPS-32-x.md`]: card('OPS-32', 'premium'),
      [`${tasksDir}/OPS-33-x.md`]: card('OPS-33', 'premium', ['tier_reason: ']),
      [`${tasksDir}/OPS-34-x.md`]: card('OPS-34', 'standard'),
    })
    await $.session.start(sessionStart)
    const refused = String((await $.command.run(commandInput('OPS-30'))).text)
    expect(refused).toContain('OPS-30')
    expect(refused).toContain('tier_reason')
    expect(refused).toContain('drop to standard')
    expect(w.spawns).toHaveLength(0)
    expect(String((await $.command.run(commandInput('OPS-30 --dry-run'))).text)).toBe(refused)
    expect(String((await $.command.run(commandInput('OPS-32'))).text)).toContain('tier_reason')
    expect(String((await $.command.run(commandInput('OPS-33'))).text)).toContain('tier_reason')
    expect(String((await $.command.run(commandInput('OPS-31'))).text)).toContain('tier frontier → opus (ambiguous across two modules)')
    expect(String((await $.command.run(commandInput('OPS-34'))).text)).toContain('tier standard → sonnet (default)')
  })

  // the card being dispatched is OPS-40 (standard); the folder holds 4 queued standard, 1 held economy, 2 dispatched and 1 queued frontier,
  // and a merged standard and a dropped frontier that are left out
  const mixFiles = (frontier: number, standard: number): Record<string, string> => {
    const files: Record<string, string> = { [`${tasksDir}/OPS-40-x.md`]: card('OPS-40', 'standard') }
    let n = 100
    const add = (count: number, tier: string, status: string) => {
      for (let k = 0; k < count; k++, n++) files[`${tasksDir}/OPS-${n}-x.md`] = card(`OPS-${n}`, tier, tier === 'frontier' ? ['tier_reason: hard'] : []).replace('status: queued', `status: ${status}`)
    }
    add(standard, 'standard', 'queued')
    add(frontier, 'frontier', 'dispatched')
    add(1, 'standard', 'merged')
    add(1, 'frontier', 'dropped')
    return files
  }

  test('dispatch prints the tier mix of the open cards, counting itself, leaving out merged and dropped cards and zero tiers; with one open card there is no line', { options: OPTIONS }, async ($, on) => {
    setup(on, mixFiles(0, 0))
    await $.session.start(sessionStart)
    expect(String((await $.command.run(commandInput('OPS-40 --dry-run'))).text)).not.toContain('plan tiers')
  })

  test('the mix line: standard, frontier and economy counted, the same in a dry run and a real dispatch', { options: OPTIONS }, async ($, on) => {
    const files = mixFiles(2, 4)
    files[`${tasksDir}/OPS-90-x.md`] = card('OPS-90', 'economy').replace('status: queued', 'status: held')
    setup(on, files)
    await $.session.start(sessionStart)
    const dry = String((await $.command.run(commandInput('OPS-40 --dry-run'))).text)
    expect(dry).toContain('\n   plan tiers: standard 5 · frontier 2 · economy 1 (frontier 2/8)\n')
    expect(String((await $.command.run(commandInput('OPS-40'))).text)).toContain('   plan tiers: standard 5 · frontier 2 · economy 1 (frontier 2/8)')
  })

  test('maxFrontierShare 0 never warns; 0.3 warns at 16/22 and not at 6/22', { options: OPTIONS }, async ($, on) => {
    setup(on, mixFiles(15, 5))
    await $.session.start(sessionStart)
    expect(String((await $.command.run(commandInput('OPS-40 --dry-run'))).text)).not.toContain('maxFrontierShare')
  })

  test('maxFrontierShare 0.3 warns when the share is above it and does not refuse', { options: { ...OPTIONS, maxFrontierShare: 0.3 } }, async ($, on) => {
    setup(on, mixFiles(15, 5))
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-40'))).text)
    expect(out).toContain('   plan tiers: standard 6 · frontier 15 (frontier 15/21)')
    expect(out).toContain('warning: frontier share 0.71 is above maxFrontierShare 0.3')
    expect(out).toContain('spawn: Agent')
  })

  test('maxFrontierShare 0.3 stays quiet at a low share', { options: { ...OPTIONS, maxFrontierShare: 0.3 } }, async ($, on) => {
    setup(on, mixFiles(1, 5))
    await $.session.start(sessionStart)
    expect(String((await $.command.run(commandInput('OPS-40 --dry-run'))).text)).not.toContain('maxFrontierShare')
  })
})
