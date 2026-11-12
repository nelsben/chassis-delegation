// MOD-366: the brief carries one advisor rule line; the row records it; the hand-back's advisor: line and calls over the rule reach the verdict.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, usage, sessionStart, commandInput, brainSpawn, ROOT, SCRATCH, HOME, type RunAnswer } from './harness'
import { advisorRuleLine, workerTranscriptPath } from '../hooks/lib/advisor'
import { fnv1a32 } from '../hooks/lib/explore'

const MB = 'b'.repeat(40)
const fullSha = (sha: string) => sha.padEnd(40, '0')
const nativeRun = () => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
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
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
}

describe('MOD-366: calls and the hand-back advisor: line reach the verdict', () => {
  const BRIEF = `${SCRATCH}/briefs/T-6.brief.md`
  const header = (tier: string) => `[[brief v=1 task=T-6 subtask=main purpose=build tier=${tier} model=sonnet scope=a/** forbid=b/** gate=prettier spend=20 budget=3-attempts report=chassis.report.v1]]`
  const REPORT = '[[report v=1 task=T-6 subtask=main branch=agent/frontend/T-6 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const OPTIONS = { verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}"}' } as never
  const TRANSCRIPT = workerTranscriptPath(HOME, ROOT, 'sess-1', 'agent-6')
  const advisorRow = JSON.stringify({
    type: 'assistant',
    timestamp: '2026-11-11T04:32:21.704Z',
    message: { id: 'msg_01', model: 'claude-opus-5-5', content: [{ type: 'server_tool_use', id: 'srvtoolu_01', name: 'advisor', input: {} }], usage: { input_tokens: 12, output_tokens: 900, iterations: [{ type: 'message', input_tokens: 12, output_tokens: 300 }, { type: 'advisor_message', model: 'claude-fable-5-2', input_tokens: 88102, output_tokens: 7654 }] } },
  })
  const ledgerRows = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  const delivered = (w: { appended: { type: string; text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')

  test('a frontier attempt: advisor: no change and one call under the once rule: advisorSaid, no advisorOver, the line in the verdict', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: header('frontier') + '\n' + advisorRuleLine('once') + '\nbody', [TRANSCRIPT]: advisorRow + '\n' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', `Done.\nadvisor: no change\n${REPORT}`, usage('claude-sonnet-5-5', 500_000, 50_000)))
    const rec = ledgerRows(w).find(r => r.verdict === 'consistent')
    expect(rec).toMatchObject({ advisorRule: 'once', advisorSaid: 'no-change', advisor: { calls: 1 } })
    expect(rec).not.toHaveProperty('advisorOver')
    expect(delivered(w)).toContain('advisor: no change')
    expect(delivered(w)).not.toContain('the brief allowed')
  })

  test('a standard attempt under the none rule with one call: advisorOver 1 and the over line', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: header('standard') + '\n' + advisorRuleLine('none') + '\nbody', [TRANSCRIPT]: advisorRow + '\n' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', `Done.\n${REPORT}`, usage('claude-sonnet-5-5', 500_000, 50_000)))
    const rec = ledgerRows(w).find(r => r.verdict === 'consistent')
    expect(rec).toMatchObject({ advisorRule: 'none', advisorOver: 1 })
    expect(rec).not.toHaveProperty('advisorSaid')
    expect(delivered(w)).toContain('advisor: 1 call, the brief allowed 0')
  })

  test('a brief written before the rule has no advisorRule and no over line', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: header('standard') + '\nbody', [TRANSCRIPT]: advisorRow + '\n' }, run: nativeRun(), agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', `Done.\n${REPORT}`, usage('claude-sonnet-5-5', 500_000, 50_000)))
    const rec = ledgerRows(w).find(r => r.verdict === 'consistent')
    expect(rec).not.toHaveProperty('advisorRule')
    expect(rec).not.toHaveProperty('advisorOver')
  })
})

describe('MOD-366: dispatch writes the rule into the brief and the row', () => {
  const tasksDir = `${ROOT}/agents/tasks`
  const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'line' as const, gateMap: '{"check":"checker {outdir}"}' }
  const CARD_TOOL = 'mcp__chassis-delegation__card'
  const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
  const card = (id: string, tier: string, extra: string[] = []) =>
    ['---', `id: ${id}`, `title: ${id}`, 'domain: ops', `tier: ${tier}`, ...extra, 'status: queued', 'repo: none', 'scope: [/out/hair/**]', 'forbid: []', 'red_test: none', 'gate: check', 'budget: 3-attempts', '---', '## Why', '', 'Outside the repo.', ''].join('\n')
  const setup = (on: Parameters<typeof world>[0], files: Record<string, string>) =>
    world(on, {
      files,
      dirs: { [tasksDir]: Object.keys(files).map(f => f.slice(tasksDir.length + 1)).filter(f => f.endsWith('.md')) },
      trees: ['/out/hair'],
      run: argv => (argv[0] === 'checker' ? { exitCode: 0, stdout: 'checked\n' } : undefined),
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
  const spawnRows = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>).filter(r => r.event === 'spawn')
  const briefOf = (w: { files: Map<string, string> }, id: string) => [...w.files].find(([k]) => k.endsWith(`/${id}.brief.md`))?.[1] ?? ''
  const count = (text: string, line: string) => text.split('\n').filter(l => l === line).length
  const drawOf = (n: number) => (fnv1a32(`advisor:OPS-${n}`) % 2 === 0 ? 'once' : 'none')

  test('a standard card: the none line once, advisorRule none, no source', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-1-x.md`]: card('OPS-1', 'standard') })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-1'))).text))
    expect(count(briefOf(w, 'OPS-1'), advisorRuleLine('none'))).toBe(1)
    expect(count(briefOf(w, 'OPS-1'), advisorRuleLine('once'))).toBe(0)
    const row = spawnRows(w)[0] as Record<string, unknown>
    expect(row.advisorRule).toBe('none')
    expect(row).not.toHaveProperty('advisorRuleSource')
  })

  test('two frontier cards whose ids draw differently: one once, one none, both split', { options: OPTIONS }, async ($, on) => {
    let a = 1
    while (drawOf(a) !== 'once') a += 1
    let b = 1
    while (drawOf(b) !== 'none') b += 1
    const files = {
      [`${tasksDir}/OPS-${a}-x.md`]: card(`OPS-${a}`, 'frontier', ['tier_reason: ambiguous']),
      [`${tasksDir}/OPS-${b}-x.md`]: card(`OPS-${b}`, 'frontier', ['tier_reason: ambiguous']),
    }
    const w = setup(on, files)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`OPS-${a}`))).text))
    await brainSpawn($, String((await $.command.run(commandInput(`OPS-${b}`))).text), { tool_use_id: 'toolu_SECOND' })
    expect(count(briefOf(w, `OPS-${a}`), advisorRuleLine('once'))).toBe(1)
    expect(count(briefOf(w, `OPS-${b}`), advisorRuleLine('none'))).toBe(1)
    const rows = spawnRows(w)
    expect(rows.find(r => r.task === `OPS-${a}`)).toMatchObject({ advisorRule: 'once', advisorRuleSource: 'split' })
    expect(rows.find(r => r.task === `OPS-${b}`)).toMatchObject({ advisorRule: 'none', advisorRuleSource: 'split' })
  })

  test('a standard card with advisor: once: the once line, source card, and the dispatch note', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-2-x.md`]: card('OPS-2', 'standard', ['advisor: once']) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-2'))).text)
    expect(out).toContain('advisor rule once (card)')
    await brainSpawn($, out)
    expect(count(briefOf(w, 'OPS-2'), advisorRuleLine('once'))).toBe(1)
    expect(spawnRows(w)[0]).toMatchObject({ advisorRule: 'once', advisorRuleSource: 'card' })
  })

  test('a card with advisor: twice: the dispatch stops with the refusal and writes no brief', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-3-x.md`]: card('OPS-3', 'standard', ['advisor: twice']) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-3'))).text)
    expect(out).toContain('refused: advisor: twice on the card; it takes none or once')
    expect(briefOf(w, 'OPS-3')).toBe('')
  })

  test('the card tool with advisor none on a frontier card writes the line, and the brief it leads to holds the none line', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/README.md`]: '' })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, title: 'Rename the hair files', why: 'Hard.', doneWhen: ['the files are renamed'], redTest: 'none', repo: 'none', gate: 'check', scope: ['/out/hair/**'], tier: 'frontier', tierReason: 'ambiguous', advisor: 'none' } as never))
    const text = w.files.get(`${tasksDir}/OPS-1-rename-the-hair-files.md`) ?? ''
    expect(text).toContain('\nadvisor: none\n')
    expect(out).toContain('tier frontier')
    await $.command.run(commandInput('OPS-1'))
    expect(count(briefOf(w, 'OPS-1'), advisorRuleLine('none'))).toBe(1)
    expect(count(briefOf(w, 'OPS-1'), advisorRuleLine('once'))).toBe(0)
  })
})
