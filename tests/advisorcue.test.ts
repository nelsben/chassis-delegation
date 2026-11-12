// MOD-367: the delegation state carries one advisor line by the brain's model family; a second refute and a review that refutes raise a cue line and a ledger row.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, spawnInput, turnInput, usage, composeInput, brainSpawn, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'

const MB = 'b'.repeat(40)
const fullSha = (sha: string) => sha.padEnd(40, '0')
/** A worker repo answered from memory for the native verifier; the gate (npx …) exits with `gate`. */
const nativeRun = (gate: number) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: gate, stdout: 'a/x.ts: not formatted\n' }
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

const BRIEF = `${SCRATCH}/briefs/T-7.brief.md`
const HEADER = '[[brief v=1 task=T-7 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
const REPORT = (sha: string) => `[[report v=1 task=T-7 subtask=main branch=agent/frontend/T-7 pr=none sha=${sha} gate=pass files=a/x.ts]]`
const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
const OPTIONS = { verdictVerbosity: 'full', wakeOnVerdict: true, ...GM } as never
const ON = { ...OPTIONS, review: 'on' } as never
const TOP = 'Advisor: do not call the advisor tool. You are on the top model; a call would consult your own model.'
const ONLY_WHEN = 'Advisor: call it only when the mod prints an advisor cue'
const REFUTE2 = "advisor cue: this card's second attempt was refuted."
const REVIEW_CUE = 'advisor cue: the review refuted a claim.'
const REVIEW_REFUTED = ['refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1', '[[review v=1 task=T-7 confirmed=0 refuted=1 unverifiable=0]]'].join('\n')
const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
const cuesOf = (w: { files: Map<string, string> }) => ledgerOf(w).filter(r => r.kind === 'advisor-cue')
const delivered = (w: { appended: { text: string }[]; logs: string[]; submitted: { text: string }[] }) => [...w.appended.map(a => a.text), ...w.logs, ...w.submitted.map(s => s.text)].join('\n')
const count = (text: string, part: string) => text.split(part).length - 1
const stateOf = async ($: { prompt: { compose: (e: never) => Promise<{ sections: { id: string; text: string }[] }> } }) =>
  (await $.prompt.compose(composeInput(['Agent']))).sections.find(s => s.id === 'chassis-delegation:state')?.text ?? ''

describe('MOD-367: the advisor line of the delegation state', () => {
  test('a brain on the second model: the "call it only when" line once', { options: OPTIONS }, async ($, on) => {
    world(on, { model: 'claude-opus-5-5', run: nativeRun(1) })
    const text = await stateOf($)
    expect(count(text, ONLY_WHEN)).toBe(1)
    expect(text).not.toContain(TOP)
  })
  test('a brain on the top model: the "do not call" line once, after the premium posture', { options: OPTIONS }, async ($, on) => {
    world(on, { model: 'claude-fable-5-2', run: nativeRun(1) })
    const text = await stateOf($)
    expect(count(text, TOP)).toBe(1)
    expect(text).not.toContain(ONLY_WHEN)
    expect(text.indexOf('You are the brain on a premium model.')).toBeLessThan(text.indexOf(TOP))
  })
  test('delegateOnly off: the line is still there, the premium posture is not', { options: OPTIONS }, async ($, on) => {
    world(on, { model: 'claude-fable-5-2', run: nativeRun(1), files: { [`${ROOT}/.chassis-delegation.json`]: '{"delegateOnly":"off"}' } })
    await $.session.start(sessionStart)
    const text = await stateOf($)
    expect(count(text, TOP)).toBe(1)
    expect(text).not.toContain('You are the brain on a premium model.')
  })
})

describe('MOD-367: the second refute cue', () => {
  const hand = async ($: Parameters<Parameters<typeof test>[2]>[0], w: ReturnType<typeof world>, id: string, toolUse: string, sha: string) => {
    const before = [w.appended.length, w.logs.length, w.submitted.length]
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: toolUse }))
    await $.turn.complete(turnInput(id, REPORT(sha)))
    return delivered({ appended: w.appended.slice(before[0]), logs: w.logs.slice(before[1]), submitted: w.submitted.slice(before[2]) })
  }
  test('refuted on attempt 1: no cue line, no row; refuted on attempt 2: the line and one refute2 row', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { model: 'claude-opus-5-5', files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(1), agentId: 'agent-7' })
    const first = await hand($, w, 'agent-7', 'toolu_01', '1234abcd')
    expect(first).toContain('verdict=refuted task=T-7 attempt=1/3')
    expect(first).not.toContain('advisor cue:')
    expect(cuesOf(w)).toHaveLength(0)
    const second = await hand($, w, 'agent-2', 'toolu_02', '5678abcd')
    expect(second).toContain('verdict=refuted task=T-7 attempt=2/3')
    expect(second).toContain(REFUTE2)
    expect(count(second, REFUTE2)).toBeGreaterThan(0)
    const rows = cuesOf(w)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'advisor-cue', cue: 'refute2', task: 'T-7', subtask: 'main', attempt: 2, brain: 'claude-opus-5-5' })
    expect(typeof rows[0]?.sessionId).toBe('string')
    // the verdict row is unchanged by the cue: still refuted, still its own next
    expect(ledgerOf(w).filter(r => r.verdict === 'refuted').map(r => r.attempt)).toEqual([1, 2])
  })
  test('the same second refute with the brain on the top model: no line, no row', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { model: 'claude-fable-5-2', files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(1), agentId: 'agent-7' })
    await hand($, w, 'agent-7', 'toolu_01', '1234abcd')
    const second = await hand($, w, 'agent-2', 'toolu_02', '5678abcd')
    expect(second).toContain('verdict=refuted task=T-7 attempt=2/3')
    expect(second).not.toContain('advisor cue:')
    expect(cuesOf(w)).toHaveLength(0)
  })
  test('a second attempt that is consistent raises no cue', { options: OPTIONS }, async ($, on) => {
    let gate = 1
    const run = nativeRun(0)
    const w = world(on, { model: 'claude-opus-5-5', files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[0] === 'npx' ? { exitCode: gate, stdout: '' } : run(argv)), agentId: 'agent-7' })
    await hand($, w, 'agent-7', 'toolu_01', '1234abcd')
    gate = 0
    const second = await hand($, w, 'agent-2', 'toolu_02', '5678abcd')
    expect(second).toContain('verdict=consistent')
    expect(cuesOf(w)).toHaveLength(0)
  })
})

describe('MOD-367: the review cue', () => {
  const reviewRefuted = async ($: Parameters<Parameters<typeof test>[2]>[0], on: Parameters<Parameters<typeof test>[2]>[1], model: string) => {
    const w = world(on, { model, files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(0), agentId: 'agent-7' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-7', 'Added the parser.\n' + REPORT('1234abcd')))
    await brainSpawn($, delivered(w), { tool_use_id: 'toolu_REVIEW01' })
    const mark = [w.appended.length, w.logs.length, w.submitted.length]
    await $.turn.complete(turnInput('agent-2', REVIEW_REFUTED, usage('claude-haiku-4-5', 40_000, 2_000)))
    return { w, row: delivered({ appended: w.appended.slice(mark[0]), logs: w.logs.slice(mark[1]), submitted: w.submitted.slice(mark[2]) }) }
  }
  test('a review that refutes a claim: the review cue line and one review row', { options: ON }, async ($, on) => {
    const { w, row } = await reviewRefuted($, on, 'claude-opus-5-5')
    expect(row).toContain(REVIEW_CUE)
    const rows = cuesOf(w)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ kind: 'advisor-cue', cue: 'review', task: 'T-7', brain: 'claude-opus-5-5' })
    expect(ledgerOf(w).some(r => r.kind === 'review' && r.verdict === 'reviewed')).toBe(true)
  })
  test('the same review with the brain on the top model: no line, no row', { options: ON }, async ($, on) => {
    const { w, row } = await reviewRefuted($, on, 'claude-fable-5-2')
    expect(row).toContain('refuted')
    expect(row).not.toContain('advisor cue:')
    expect(cuesOf(w)).toHaveLength(0)
  })
})

describe('MOD-367: the readers skip the advisor-cue row', () => {
  const CUE = JSON.stringify({ kind: 'advisor-cue', cue: 'refute2', task: 'T-1', subtask: 'main', attempt: 2, at: 1, brain: 'claude-opus-5-5', sessionId: 's' })
  const OPTS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'line' as const, gateMap: '{"check":"checker {outdir}"}' }
  const tasksDir = `${ROOT}/agents/tasks`
  const CARD_TOOL = 'mcp__chassis-delegation__card'
  const historyLine = async ($: Parameters<Parameters<typeof test>[2]>[0], on: Parameters<Parameters<typeof test>[2]>[1], extra: string) => {
    const rows = ['T-1', 'T-2'].map(task => JSON.stringify({ kind: 'spawn', task, attempt: 1, alias: 'sonnet', effort: 'medium', verdict: 'consistent', usd: 0.5 }))
    world(on, {
      files: { [`${tasksDir}/README.md`]: '', [`${ROOT}/.delegation/ledger.jsonl`]: rows.join('\n') + '\n' + extra },
      dirs: { [tasksDir]: ['README.md'] },
      trees: ['/out/hair'],
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
    await $.session.start(sessionStart)
    const r = (await $.tool.call({ tool: CARD_TOOL, title: 'Rename the hair files', why: 'Mechanical.', doneWhen: ['the files are renamed'], redTest: 'none', repo: 'none', gate: 'check', scope: ['/out/hair/**'] } as never)) as { result?: unknown; text?: string }
    const text = typeof r.result === 'string' ? r.result : r.text ?? ''
    return text.split('\n').find(l => l.startsWith('history:')) ?? ''
  }
  test('the history line of the card tool is the same with and without the row', { options: OPTS }, async ($, on) => {
    const without = await historyLine($, on, '')
    expect(without).toContain('history: sonnet/medium 2 thin')
  })
  test('the history line with the row', { options: OPTS }, async ($, on) => {
    const withRow = await historyLine($, on, CUE + '\n')
    expect(withRow).toContain('history: sonnet/medium 2 thin · 100% · $0.50/card')
  })
})
