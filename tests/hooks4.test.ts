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

describe('MOD-19: the verdict says what it checked (verified became consistent; the old word is read until 0.9.0)', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)

  test('a report whose every claim holds: the long row, the one-line row, the record and the ledger line all say consistent', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(row).not.toMatch(/(^|[^n])verified/)
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'consistent' })
    expect(ledgerOf(w).at(-1)).toMatchObject({ task: 'T-4', attempt: 1, verdict: 'consistent', next: 'accept' })
  })

  test('the one-line row reads consistent and still says next=accept; the brain is woken with it', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/3 consistent')
    expect(w.submitted[0]?.text).toContain('consistent')
    expect(w.submitted[0]?.text).toContain('next=accept')
  })

  // A store and a ledger as 0.7.x wrote them: the verdict word is `verified`. Nothing in them is rewritten; the mod reads them as it reads consistent.
  const OLD = 'verified'
  const SHA_OWED = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
  const legacyRecord = (task: string, o: Record<string, unknown>) => ({ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: OLD, at: NOW - 600_000, verdictAt: NOW - 300_000, root: ROOT, ...o })
  const legacyStore = {
    // T-4: the report was consistent with git but declared gate=fail honestly, so a resume is owed
    'delegation.tasks.T-4': [legacyRecord('T-4', { reportGate: 'fail', sha: SHA_OWED, agentId: 'agent-4', usd: 0.4, tokens: 2000 })],
    // T-5: a plain success
    'delegation.tasks.T-5': [legacyRecord('T-5', { reportGate: 'pass', sha: 'b'.repeat(40), usd: 0.19, tokens: 1000 })],
    'delegation.recent.sess-1': [
      { task: 'T-4', attempt: 1, verdict: OLD, line: `chassis-delegation: T-4 attempt 1/3 ${OLD} (report gate=fail) · sonnet · next=resume agent=agent-4`, at: NOW - 300_000, owed: 'T-4: resume agent=agent-4' },
      { task: 'T-5', attempt: 1, verdict: OLD, line: `chassis-delegation: T-5 attempt 1/3 ${OLD} · sonnet · $0.19 · next=accept`, at: NOW - 200_000 },
    ],
  }
  const legacyLedger = [
    { task: 'T-4', subtask: 'main', attempt: 1, verdict: OLD, reportGate: 'fail', next: 'resume agent=agent-4', sessionId: 'sess-0' },
    { task: 'T-5', subtask: 'main', attempt: 1, verdict: OLD, reportGate: 'pass', next: 'accept', sessionId: 'sess-0' },
  ]
  const ledgerFile = { [`${ROOT}/.delegation/ledger.jsonl`]: legacyLedger.map(l => JSON.stringify(l)).join('\n') + '\n' }
  const merged = (ancestor: number) => (argv: string[]): RunAnswer | undefined => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: ancestor, stdout: '' } : undefined)

  test('a store written before the rename: the owed row is there, then retires when the work is on origin/main', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: ledgerFile, store: legacyStore, run: merged(0) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegationCmd(''))).text)
    expect(out).not.toContain('owed: T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ verdict: OLD, retired: 'merged' })
    expect(w.runs.some(x => x.argv.includes('--is-ancestor') && x.argv.includes(SHA_OWED))).toBe(true)
  })

  test('a store written before the rename: an owed row whose work is not on origin/main stays', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    world(on, { files: ledgerFile, store: legacyStore, run: merged(1) })
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegationCmd(''))).text)).toContain('- owed: T-4: resume agent=agent-4')
  })

  test('a store written before the rename: both records count as successes on the dashboard, in whichever word it uses', { options: { ...GM } }, async ($, on) => {
    world(on, { files: ledgerFile, store: legacyStore, run: merged(1), panesUnplaced: 'no panes here' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegationCmd('dashboard'))).text)
    expect(out).toMatch(/2 of 2 \w+ on the first attempt/)
    expect(out).toMatch(/sonnet · \$0\.59 · 3k tok · 2 \w+/)
  })

  test('a ledger written before the rename stays as it was; the next verdict is appended after it, saying consistent', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { ...ledgerFile, [BRIEF]: HEADER + '\nbody', [`${ROOT}/.chassis-delegation.json`]: '{"review":"off"}' }, store: legacyStore, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const lines = ledgerOf(w)
    expect(lines.slice(0, 2)).toEqual(legacyLedger)
    expect(lines).toHaveLength(4)
    expect(lines[2]).toMatchObject({ event: 'spawn', task: 'T-4', attempt: 2 })
    expect(lines[3]).toMatchObject({ task: 'T-4', verdict: 'consistent', next: 'accept' })
  })
})

describe('MOD-20: a gate that ran beside another worker does not false-refute', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=engine budget=3-attempts report=chassis.report.v1]]'
  const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const GM = { gateMap: '{"engine":"claude plugin test {worktree}"}' }
  const LOCK = 'delegation.engineGate'
  const TIMED_OUT = ['dashboard.test.ts', 'dispatchtool.test.ts'].map(f => `tests/${f}:\n(fail) a test in ${f} [5003.1ms]\n  Error: timed out after 5000 ms\n`).join('')
  const SUMMARY = '\n 764 pass\n 2 fail\nRan 766 tests across 34 files. [70.1s]\n'
  const engineRuns = (w: { runs: { argv: string[] }[] }) => w.runs.filter(x => x.argv[0] === 'claude')

  test('red on two timeouts in tests the delta never touched, green on the rerun: consistent, the claim says so', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const base = nativeRun()
    let n = 0
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => (argv[0] === 'claude' ? (++n === 1 ? { exitCode: 1, stdout: TIMED_OUT + SUMMARY } : { exitCode: 0, stdout: ' 766 pass\n 0 fail\n' }) : base(argv)),
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(delivered(w)).toContain('chassis-delegation: verdict=consistent task=T-4')
    expect(delivered(w)).toContain('claim gate: held — gate green on rerun (first run: 2 timeouts in untouched tests) at 1234abcd (gate=pass confirmed)')
    expect(engineRuns(w)).toHaveLength(2)
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'consistent' })
  })

  test('red on timeouts again: refuted as before, after one rerun and no more', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const base = nativeRun()
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => (argv[0] === 'claude' ? { exitCode: 1, stdout: TIMED_OUT + SUMMARY } : base(argv)),
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=T-4')
    expect(delivered(w)).toContain('claim gate: failed — gate=pass claimed but the gate is RED at 1234abcd (exit 1; output /repo/acme-app/.delegation/T-4/verify-gate-1.txt)')
    expect(engineRuns(w)).toHaveLength(2)
  })

  test('an assertion failure is not re-run', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const base = nativeRun()
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => (argv[0] === 'claude' ? { exitCode: 1, stdout: 'tests/a.test.ts:\n(fail) a > b [1ms]\n  AssertionError: expected 1\n' + SUMMARY.replace(' 2 fail', ' 1 fail') } : base(argv)),
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(delivered(w)).toContain('verdict=refuted')
    expect(engineRuns(w)).toHaveLength(1)
  })

  test('the engine gate holds the lock while it runs and clears it after; no other holder, no wait line', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const base = nativeRun({ gate: 0 })
    let held: unknown
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => {
        if (argv[0] === 'claude') held = w.store.get(LOCK)
        return base(argv)
      },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(held).toMatchObject({ holder: 'T-4', since: NOW, until: NOW + 30 * 60 * 1000 }) // MOD-229: the default ceiling, 30 minutes
    expect(w.store.has(LOCK)).toBe(false)
    expect(delivered(w)).not.toContain('waited')
    expect(delivered(w)).toContain('verdict=consistent')
  })

  test("another worker's engine gate is waited for: nothing runs until it is done, and the verdict says how long", { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: nativeRun({ gate: 0 }),
      store: { [LOCK]: { holder: 'MOD-9', token: 'MOD-9#1', since: NOW - 5000, until: NOW + 40_000 } },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const done = $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await w.clock.advance(20_000)
    expect(engineRuns(w)).toHaveLength(0)
    await w.clock.advance(30_000)
    await done
    expect(engineRuns(w)).toHaveLength(1)
    expect(delivered(w)).toContain("waited 40 s for MOD-9's engine gate")
    expect(delivered(w)).toContain('verdict=consistent')
    expect(w.store.has(LOCK)).toBe(false)
  })

  test('two verifiers finishing together run their engine gates one after the other, the second saying it waited', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const base = nativeRun({ gate: 0 })
    const BRIEF5 = `${SCRATCH}/briefs/T-5.brief.md`
    let live = 0
    let most = 0
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [BRIEF5]: HEADER.replace('task=T-4', 'task=T-5') + '\nbody' },
      run: async argv => {
        if (argv[0] !== 'claude') return base(argv)
        live += 1
        most = Math.max(most, live)
        await w.clock.sleep(30_000) // an engine suite takes a while
        live -= 1
        return { exitCode: 0, stdout: '' }
      },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_01AAAAAAAA' }))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF5}.`, tool_use_id: 'toolu_01BBBBBBBB' }))
    const first = $.turn.complete(turnInput('agent-1', 'Done.\n' + REPORT))
    const second = $.turn.complete(turnInput('agent-2', 'Done.\n' + REPORT.replace(/T-4/g, 'T-5')))
    await w.clock.advance(10_000)
    expect(engineRuns(w)).toHaveLength(1) // one is running, the other waits its turn
    await w.clock.advance(100_000)
    await Promise.all([first, second])
    expect(engineRuns(w)).toHaveLength(2)
    expect(most).toBe(1)
    expect(delivered(w)).toMatch(/waited \d+ s for T-[45]'s engine gate/)
    expect(delivered(w).match(/verdict=consistent/g)).toHaveLength(2)
    expect(w.store.has(LOCK)).toBe(false)
  })

  test('a lock past its expiry is a crashed holder: taken at once, no wait', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: nativeRun({ gate: 0 }),
      store: { [LOCK]: { holder: 'MOD-9', token: 'MOD-9#1', since: NOW - 600_000, until: NOW - 60_000 } },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(engineRuns(w)).toHaveLength(1)
    expect(delivered(w)).not.toContain('waited')
  })
})

describe('MOD-21: an optional reviewer stage after a consistent verdict', () => {
  type Tester = Parameters<TestBody>[0]
  type On = Parameters<TestBody>[1]
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=2-attempts report=chassis.report.v1]]'
  const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const FULL = { verdictVerbosity: 'full', wakeOnVerdict: true, ...GM }
  const ON = { options: { review: 'on', ...FULL } }
  const ledgerOf = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  const kinds = (w: { store: Map<string, unknown> }, kind: string) => records(w, 'T-4').filter(r => r.kind === kind)
  const recentOf = (w: { store: Map<string, unknown> }) => (w.store.get('delegation.recent.sess-1') ?? []) as { owed?: string; line: string }[]
  const REVIEW_REFUTED = ['confirmed: a/x.ts gains the parser — a/x.ts:12', 'refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1', '[[review v=1 task=T-4 confirmed=1 refuted=1 unverifiable=0]]'].join('\n')
  const REVIEW_CLEAN = ['confirmed: a/x.ts gains the parser — a/x.ts:12', 'confirmed: the README is untouched — git diff --stat', 'unverifiable: CI is green — no network here', '[[review v=1 task=T-4 confirmed=2 refuted=0 unverifiable=1]]'].join('\n')
  /** What reached the engine's own tool, past every hook of the mod (the Bash command as it would run). */
  let bottom: { tool: unknown; command?: unknown; agentId?: unknown }[] = []
  /** What the mod delivered after a mark: the appended rows, then the log lines. */
  const mark = (w: { appended: unknown[]; logs: string[] }) => ({ a: w.appended.length, l: w.logs.length })
  const since = (w: { appended: { text: string }[]; logs: string[] }, m: { a: number; l: number }) => [...w.appended.slice(m.a).map(x => x.text), ...w.logs.slice(m.l)].join('\n')
  const delegationText = async ($: Tester) => String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)

  // The worker hands back a consistent report (agent-4); a review spawn, when the brain makes it, is agent-2.
  const handBack = async ($: Tester, on: On, over: { header?: string; cwd?: string; dirs?: Record<string, string[]>; agentSays?: string; files?: Record<string, string> } = {}) => {
    const w = world(on, { files: { [BRIEF]: (over.header ?? HEADER) + '\nbody', ...over.files }, ...(over.dirs ? { dirs: over.dirs } : {}), run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    bottom = []
    // the engine's own tool, at the bottom; an Agent call goes on to a test's own hook
    ;(on as unknown as (n: string, h: unknown) => void)('tool.call', async (_$: unknown, e: { tool: unknown; command?: unknown; agentId?: unknown }, next: (x: unknown) => unknown) => {
      if (e.tool === 'Agent') return next(e)
      bottom.push({ tool: e.tool, command: e.command, agentId: e.agentId })
      return { result: 'ok' }
    })
    // a foreground Agent call: the reviewer's answer comes back in its result (hooks are registered before the first $ call)
    if (over.agentSays !== undefined) on('tool.call', { tool: 'Agent' }, () => agentResult(over.agentSays as string, 'agent-2'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, ...(over.cwd ? { cwd: over.cwd } : {}) }))
    await $.turn.complete(turnInput('agent-4', 'Added the parser.\n' + REPORT('1234abcd')))
    return w
  }
  const review = async ($: Tester, w: Parameters<typeof delivered>[0]) => brainSpawn($, delivered(w), { tool_use_id: 'toolu_REVIEW01' })
  const reviewed = async ($: Tester, on: On, text: string, header?: string) => {
    const w = await handBack($, on, header ? { header } : {})
    await review($, w)
    const m = mark(w)
    await $.turn.complete(turnInput('agent-2', text, usage('claude-haiku-4-5', 40_000, 2_000)))
    return { w, row: since(w, m) }
  }

  test('review off in the repo file (MOD-166: the default is on-frontier): a consistent hand-back says next=accept and prints no spawn block', { options: FULL }, async ($, on) => {
    const w = await handBack($, on, { files: { [`${ROOT}/.chassis-delegation.json`]: '{"review":"off"}' } })
    expect(delivered(w)).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=1/2 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(delivered(w)).not.toContain('spawn: Agent')
    expect(delivered(w)).not.toContain('review')
    expect(w.spawns).toHaveLength(1)
    expect(kinds(w, 'review')).toHaveLength(0)
    expect(await delegationText($)).not.toContain('review')
  })

  test('review on: a consistent hand-back prints next=review and the reviewer spawn block, one tier below the worker', ON, async ($, on) => {
    const w = await handBack($, on)
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=1/2 usd=~0.00 model=claude-sonnet-5-5 next=review')
    expect(row).not.toContain('next=accept')
    const call = spawnCallOf(row) as SpawnCall
    expect(call.model).toBe('haiku')
    expect(call.subagent_type).toBe('general-purpose')
    expect(call.description).toBe('T-4 review economy haiku')
    expect(call.prompt.split('\n')[0]).toBe('[[review-of v=1 task=T-4 subtask=main attempt=1 worker=agent-4 sha=1234abcd]]')
    expect(call.prompt).toContain(`read the brief ${BRIEF}`)
    expect(call.prompt).toContain('Added the parser.')
    expect(call.prompt).toContain('Edit nothing.')
    // the brain is woken with the same text; the review is owed until it is made
    expect(w.submitted[0]?.text).toContain('next=review')
    expect(w.submitted[0]?.text).toContain('spawn: Agent')
    expect(ledgerOf(w).at(-1)).toMatchObject({ task: 'T-4', attempt: 1, verdict: 'consistent', next: 'review' })
    expect(recentOf(w).at(-1)?.owed).toBe('T-4: review')
  })

  test('the one-line row carries the block too, and /delegation says review is on', { options: { review: 'on', ...GM } }, async ($, on) => {
    const w = await handBack($, on)
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/2 consistent · 🔵 sonnet')
    expect(delivered(w)).toContain('next=review')
    expect(spawnCallOf(delivered(w))?.model).toBe('haiku')
    expect(await delegationText($)).toContain('review: on')
  })

  test('on-frontier: a standard card is accepted as before', { options: { review: 'on-frontier', ...FULL } }, async ($, on) => {
    const w = await handBack($, on)
    expect(delivered(w)).toContain('next=accept')
    expect(delivered(w)).not.toContain('spawn: Agent')
  })

  test('on-frontier: a frontier card is reviewed, by a sonnet', { options: { review: 'on-frontier', ...FULL } }, async ($, on) => {
    const w = await handBack($, on, { header: HEADER.replace('tier=standard model=sonnet', 'tier=frontier model=opus') })
    expect(delivered(w)).toContain('next=review')
    expect(spawnCallOf(delivered(w))?.model).toBe('sonnet')
    expect(spawnCallOf(delivered(w))?.description).toBe('T-4 review standard sonnet')
  })

  test('reviewTier overrides the tier below the worker', { options: { review: 'on', reviewTier: 'frontier', ...FULL } }, async ($, on) => {
    const w = await handBack($, on)
    expect(spawnCallOf(delivered(w))?.model).toBe('opus')
  })

  test('the repo file sets the option: review on in .chassis-delegation.json', { options: { ...FULL } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ review: 'on' }) }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Added the parser.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('next=review')
  })

  test('review changes nothing for a refuted hand-back', ON, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 1 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(delivered(w)).toContain('verdict=refuted')
    expect(delivered(w)).not.toContain('next=review')
    expect(delivered(w)).not.toContain('spawn: Agent')
  })

  test('the reviewer is recorded as an attempt of kind review, and it never counts against budget=', ON, async ($, on) => {
    const w = await handBack($, on)
    const r = await review($, w)
    expect(r.deny).toBeUndefined()
    expect(w.spawns[1]?.model).toBe('haiku')
    expect(w.notices.at(-1)).toBe('tier=economy → haiku (review)')
    expect(kinds(w, 'review')).toEqual([
      expect.objectContaining({ task: 'T-4', subtask: 'main', attempt: 1, kind: 'review', lineage: 1, tier: 'economy', alias: 'haiku', source: 'review', verdict: 'pending', agentId: 'agent-2', toolUseId: 'toolu_REVIEW01', briefPath: BRIEF }),
    ])
    // budget=2-attempts: the worker has used one; the reviewer is not a second
    const again = await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_02WORKER' }))
    expect(again.deny).toBeUndefined()
    expect(kinds(w, 'spawn').map(x => x.attempt)).toEqual([1, 2])
    // the budget really spent, the denial counts the worker attempts alone
    const third = await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, tool_use_id: 'toolu_03WORKER' }))
    expect(third.deny).toContain('budget exhausted for T-4 (2 attempts)')
  })

  test('the reviewer runs where the worker ran and steps at the engine default effort; the worker record is left as it was', ON, async ($, on) => {
    const wt = `${ROOT}-T-4`
    const w = await handBack($, on, { cwd: wt, dirs: { [wt]: [] } })
    await review($, w)
    expect(w.spawns[1]).toMatchObject({ cwd: wt })
    for await (const chunk of $.turn.step(stepInput('agent-2', 'xhigh'))) void chunk
    expect(w.steps.at(-1)).toEqual({ agentId: 'agent-2', effort: 'xhigh' })
    expect(kinds(w, 'spawn')[0]?.effort).toBeUndefined()
    expect(kinds(w, 'review')[0]?.effort).toBeUndefined()
  })

  test('while the reviewer runs the task is pending, not a worker holding a slot, and the review is no longer owed', ON, async ($, on) => {
    const w = await handBack($, on)
    w.agents.push({ id: 'agent-4', type: 'general-purpose', description: 'T-4', status: 'completed' })
    await review($, w)
    w.agents.push({ id: 'agent-2', type: 'general-purpose', description: 'T-4 review economy haiku', status: 'running' })
    const state = await delegationText($)
    expect(state).toContain('pending verdict: T-4 agent agent-2')
    expect(state).not.toContain('running: T-4')
    expect(state).not.toContain('owed: T-4: review')
  })

  test('/dispatch T-4 --verify <sha> is reviewed like a hand-back when its verdict is consistent', { options: { review: 'on', ...FULL } }, async ($, on) => {
    const wt = `${ROOT}-T-4`
    const card = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 2-attempts\n---\n## Why\nA card.\n'
    const repo = nativeRun({ gate: 0 })
    const w = world(on, {
      files: { [`${ROOT}/.delegation/briefs/T-4.brief.md`]: HEADER + '\nbody', [`${ROOT}/agents/tasks/T-4-the-thing.md`]: card },
      dirs: { [wt]: [], [`${ROOT}/agents/tasks`]: ['T-4-the-thing.md'] },
      run: argv => (argv[3] === 'diff' && !argv.includes('--name-status') ? { exitCode: 0, stdout: 'a/x.ts\n' } : repo(argv)),
    })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('T-4 --verify 1234abcd'))).text)
    expect(out).toContain('verdict=consistent task=T-4 attempt=1/2')
    expect(out).toContain('next=review')
    const call = spawnCallOf(out) as SpawnCall
    expect(call.model).toBe('haiku')
    expect(call.prompt.split('\n')[0]).toBe('[[review-of v=1 task=T-4 subtask=main attempt=1 sha=1234abcd]]')
    expect(w.spawns).toHaveLength(0)
  })

  test('a review template the mod cannot read: next=accept with the reason (a review never blocks on its own failure)', { options: { review: 'on', ...FULL } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-4', noReviewTemplate: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Added the parser.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('next=accept')
    expect(delivered(w)).toContain('note: review not run — the review template could not be read')
    expect(delivered(w)).not.toContain('spawn: Agent')
    expect(recentOf(w).at(-1)?.owed).toBeUndefined()
  })

  describe('the reviewer never edits', () => {
    const tool = async ($: Tester, w: Parameters<typeof workerCall>[1], agentId: string, input: Record<string, unknown>) => {
      const out = await workerCall($, w, agentId, input)
      return out.seen ? out.result.deny : 'unseen'
    }

    test('Edit, Write, MultiEdit and NotebookEdit are refused with one line saying a reviewer never edits', ON, async ($, on) => {
      const w = await handBack($, on)
      await review($, w)
      for (const input of [
        { tool: 'Edit', file_path: `${ROOT}/a/x.ts`, old_string: 'a', new_string: 'b' },
        { tool: 'Write', file_path: `${ROOT}/a/x.ts`, content: 'x' },
        { tool: 'MultiEdit', file_path: `${ROOT}/a/x.ts`, edits: [] },
        { tool: 'NotebookEdit', notebook_path: `${ROOT}/a/n.ipynb`, new_source: 'x' },
        { tool: 'Write', file_path: '/tmp/notes.md', content: 'x' },
      ]) {
        const deny = await tool($, w, 'agent-2', input)
        expect(deny).toContain('a reviewer never edits')
        expect(deny).toContain('T-4')
        expect(deny?.includes('\n')).toBe(false)
      }
      expect(bottom.filter(b => b.agentId === 'agent-2')).toEqual([])
    })

    test('a Bash command the delegateOnly lexer counts as a write is refused: a redirection, sed -i, tee, cp, a commit; reads run', ON, async ($, on) => {
      const w = await handBack($, on)
      await review($, w)
      for (const command of ['echo x > a/x.ts', "sed -i 's/a/b/' a/x.ts", 'cat a/x.ts | tee a/y.ts', 'cp a/x.ts a/z.ts', 'git commit -am fix', 'git diff HEAD~1 && echo done >> notes.txt']) {
        expect(await tool($, w, 'agent-2', { tool: 'Bash', command })).toContain('a reviewer never edits')
      }
      for (const command of ['git diff HEAD~1 -- a/x.ts', 'git show 1234abcd:a/x.ts', 'cat a/x.ts', 'grep -n parser a/x.ts', 'git log --oneline -3 2>/dev/null']) {
        expect(await tool($, w, 'agent-2', { tool: 'Bash', command })).toBeUndefined()
      }
      expect(await tool($, w, 'agent-2', { tool: 'Read', file_path: `${ROOT}/a/x.ts` })).toBeUndefined()
      // the hand-back itself is never refused
      expect(await tool($, w, 'agent-2', { tool: 'SubagentHandback', message: REVIEW_CLEAN })).toBeUndefined()
    })

    test('a reviewer in the worker worktree: a write there is refused too, not only one in the session root', ON, async ($, on) => {
      const wt = `${ROOT}-T-4`
      const w = await handBack($, on, { cwd: wt, dirs: { [wt]: [] } })
      await review($, w)
      expect(await tool($, w, 'agent-2', { tool: 'Bash', command: `echo x > ${wt}/a/x.ts` })).toContain('a reviewer never edits')
      expect(await tool($, w, 'agent-2', { tool: 'Bash', command: `cd ${wt} && echo x > a/x.ts` })).toContain('a reviewer never edits')
      expect(await tool($, w, 'agent-2', { tool: 'Bash', command: `git -C ${wt} commit -m x` })).toContain('a reviewer never edits')
      expect(await tool($, w, 'agent-2', { tool: 'Bash', command: `git -C ${wt} diff HEAD~1` })).toBeUndefined()
    })

    test('the worker and the brain keep their tools: only the reviewer is held', ON, async ($, on) => {
      const w = await handBack($, on)
      await review($, w)
      expect(await tool($, w, 'agent-4', { tool: 'Write', file_path: `${ROOT}/a/x.ts`, content: 'x' })).toBeUndefined()
      expect(await tool($, w, 'agent-4', { tool: 'Bash', command: 'echo x > a/x.ts' })).toBeUndefined()
      expect(((await $.tool.call({ tool: 'Write', file_path: `${ROOT}/a/x.ts`, content: 'x' } as never)) as { deny?: string }).deny).toBeUndefined()
    })

    test('the reviewer is not given the worker identity in its Bash environment; a worker still is', ON, async ($, on) => {
      const w = await handBack($, on)
      await review($, w)
      await workerCall($, w, 'agent-2', { tool: 'Bash', command: 'git diff HEAD~1' })
      await workerCall($, w, 'agent-4', { tool: 'Bash', command: 'git status' })
      expect(bottom.find(b => b.agentId === 'agent-2')?.command).toBe('git diff HEAD~1')
      expect(String(bottom.find(b => b.agentId === 'agent-4')?.command)).toContain('CHASSIS_SESSION_ID=T-4-a1')
    })
  })

  describe('the reviewer hands back', () => {
    test('refuted=0: next=accept with the confirmed and unverifiable counts; the record and the ledger carry them', ON, async ($, on) => {
      const { w, row } = await reviewed($, on, REVIEW_CLEAN)
      expect(row).toContain('chassis-delegation: review task=T-4 attempt=1/2')
      expect(row).toContain('confirmed=2 refuted=0 unverifiable=1')
      expect(row).toContain('next=accept')
      expect(row).toContain('review: 2 confirmed, 1 unverifiable')
      expect(row).not.toContain('next=resume')
      expect(kinds(w, 'review')[0]).toMatchObject({ verdict: 'reviewed', review: { confirmed: 2, refuted: 0, unverifiable: 1 } })
      expect(typeof kinds(w, 'review')[0]?.usd).toBe('number')
      expect(ledgerOf(w).at(-1)).toMatchObject({ task: 'T-4', kind: 'review', verdict: 'reviewed', review: { confirmed: 2, refuted: 0, unverifiable: 1 }, next: 'accept', agentId: 'agent-2' })
      expect(recentOf(w).at(-1)?.owed).toBeUndefined() // nothing is owed any more
      expect(w.submitted.at(-1)?.text).toContain('next=accept')
    })

    test('the one-line row reads: reviewed, the reviewer, its cost, the counts, next=accept', { options: { review: 'on', ...GM } }, async ($, on) => {
      const { row } = await reviewed($, on, REVIEW_CLEAN)
      expect(row).toMatch(/chassis-delegation: T-4 attempt 1\/2 reviewed · 🟢 haiku · ~?\$0\.\d\d · review: 2 confirmed, 1 unverifiable · next=accept/)
    })

    test('refuted=1: next=resume naming the worker, and the refuted row quoted (the confirmed ones are not)', ON, async ($, on) => {
      const { w, row } = await reviewed($, on, REVIEW_REFUTED)
      expect(row).toContain('confirmed=1 refuted=1 unverifiable=0')
      expect(row).toContain('next=resume agent=agent-4')
      expect(row).toContain('refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1')
      expect(row).not.toContain('a/x.ts gains the parser')
      expect(row).not.toContain('next=accept')
      expect(kinds(w, 'review')[0]).toMatchObject({ verdict: 'reviewed', review: { confirmed: 1, refuted: 1, unverifiable: 0 } })
      expect(w.sent).toHaveLength(0) // advice only, as every resume is without autoEscalate
      expect(recentOf(w).at(-1)?.owed).toBe('T-4: resume agent=agent-4')
    })

    test('the one-line row quotes the refuted row under it', { options: { review: 'on', ...GM } }, async ($, on) => {
      const { row } = await reviewed($, on, REVIEW_REFUTED)
      expect(row).toMatch(/chassis-delegation: T-4 attempt 1\/2 reviewed · 🟢 haiku · .*review: 1 confirmed, 1 refuted, 0 unverifiable · next=resume agent=agent-4\n/)
      expect(row).toContain('refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1')
    })

    test('the brain sends the worker the refuted rows: that message is the worker\'s second attempt, and the reviewer did not spend it', ON, async ($, on) => {
      const { w } = await reviewed($, on, REVIEW_REFUTED)
      // budget=2-attempts: one worker attempt so far; counting the review it would be two and this would be refused
      const sent = (await $.session.send({ to: 'agent-4', text: 'refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1', origin: { kind: 'model' } } as never)) as { isDelivered?: boolean; reason?: string }
      expect(sent.isDelivered).toBe(true)
      expect([...kinds(w, 'spawn'), ...kinds(w, 'resume')].map(r => [r.attempt, r.kind, r.lineage])).toEqual([[1, 'spawn', 1], [2, 'resume', 1]])
    })

    test('autoEscalate: the mod sends the worker the refuted rows itself', { options: { review: 'on', autoEscalate: true, ...FULL } }, async ($, on) => {
      const { w, row } = await reviewed($, on, REVIEW_REFUTED)
      expect(row).toContain('next=resumed agent=agent-4 (autoEscalate)')
      expect(w.sent).toHaveLength(1)
      expect(w.sent[0]?.to).toBe('agent-4')
      expect(w.sent[0]?.text).toContain('refuted: the gate passes — ran npx prettier --check a/x.ts, exit 1')
      expect(w.sent[0]?.text).not.toContain('a/x.ts gains the parser')
      expect(w.sent[0]?.text).toContain('[[report v=1')
      expect(kinds(w, 'resume')).toEqual([expect.objectContaining({ attempt: 2, kind: 'resume', lineage: 1, agentId: 'agent-4' })])
    })

    test('a worker that hands back again is reviewed again: the second consistent verdict prints a new block for the new sha', { options: { review: 'on', autoEscalate: true, ...FULL } }, async ($, on) => {
      const { w } = await reviewed($, on, REVIEW_REFUTED)
      await $.turn.complete(turnInput('agent-4', 'Fixed the gate.\n' + REPORT('5678abcd')))
      expect(delivered(w)).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=2/2')
      expect(delivered(w)).toContain('[[review-of v=1 task=T-4 subtask=main attempt=2 worker=agent-4 sha=5678abcd]]')
    })

    test('refuted>0 with the budget spent: check by hand, not a resume the budget would refuse', { options: { review: 'on', ...FULL } }, async ($, on) => {
      const { w, row } = await reviewed($, on, REVIEW_REFUTED, HEADER.replace('budget=2-attempts', 'budget=1-attempts'))
      expect(row).toContain('next=check by hand')
      expect(row).toContain('budget')
      expect(row).toContain('refuted: the gate passes')
      expect(row).not.toContain('next=resume')
      expect(kinds(w, 'review')[0]).toMatchObject({ verdict: 'reviewed', review: { refuted: 1 } })
    })

    test('no review block: next=accept with `review: no review block` (the review never blocks on its own failure)', ON, async ($, on) => {
      const { w, row } = await reviewed($, on, 'Looks fine to me. confirmed: a/x.ts gains the parser — a/x.ts:12')
      expect(row).toContain('next=accept')
      expect(row).toContain('review: no review block')
      expect(kinds(w, 'review')[0]).toMatchObject({ verdict: 'reviewed' })
      expect(kinds(w, 'review')[0]?.review).toBeUndefined()
      expect(ledgerOf(w).at(-1)).toMatchObject({ kind: 'review', verdict: 'reviewed', next: 'accept' })
    })

    test('a malformed review block is no block', ON, async ($, on) => {
      const { row } = await reviewed($, on, 'refuted: all of it\n[[review v=1 task=T-4 confirmed=2 refuted=lots unverifiable=0]]')
      expect(row).toContain('next=accept')
      expect(row).toContain('review: no review block')
      expect(row).not.toContain('next=resume')
    })

    test('a foreground reviewer is judged from its Agent result, like a foreground worker', ON, async ($, on) => {
      const w = await handBack($, on, { agentSays: REVIEW_REFUTED })
      await review($, w)
      const r = await $.tool.call({ tool: 'Agent', description: 'T-4 review economy haiku', prompt: 'x', tool_use_id: 'toolu_REVIEW01' } as never)
      const context = (r.context ?? []).join('\n')
      expect(context).toContain('chassis-delegation: review task=T-4 attempt=1/2')
      expect(context).toContain('next=resume agent=agent-4')
      expect(context).toContain('refuted: the gate passes')
      expect(kinds(w, 'review')[0]).toMatchObject({ verdict: 'reviewed', review: { refuted: 1 } })
    })

    test('one review is posted once: a second turn.complete does not post or ledger it again', ON, async ($, on) => {
      const { w } = await reviewed($, on, REVIEW_CLEAN)
      const rows = () => w.appended.flatMap(a => a.text.split('\n')).filter(l => l.startsWith('chassis-delegation: review task=T-4'))
      expect(rows()).toHaveLength(1)
      await $.turn.complete(turnInput('agent-2', REVIEW_CLEAN))
      expect(rows()).toHaveLength(1)
      expect(ledgerOf(w).filter(l => l.kind === 'review')).toHaveLength(1)
    })
  })
})

describe('MOD-22: research cards (repo=none, an output folder outside the repo)', () => {
  const NAME = 'OPS-9-extract-the-hair-model.md'
  const CARD = [
    '---',
    'id: OPS-9',
    'title: Extract the hair model and its renders',
    'domain: ops',
    'tier: standard',
    'status: queued',
    'repo: none',
    'scope: [/out/hair/**, /out/notes/*.md]',
    'forbid: []',
    'red_test: none',
    'gate: check',
    'budget: 2-attempts',
    '---',
    '## Why',
    '',
    'The model is exported outside the repo.',
    '',
  ].join('\n')
  const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' as const, gateMap: '{"check":"checker {outdir}"}' }
  const BRIEF = `${SCRATCH}/briefs/OPS-9.brief.md`
  const OUTSIDE_FILE = `${ROOT}/.delegation/outside/OPS-9_${ROOT.replace(/[^A-Za-z0-9._-]/g, '_')}.json`
  const run = (argv: string[]): RunAnswer | undefined => (argv[0] === 'checker' ? { exitCode: 0, stdout: 'checked\n' } : undefined)
  const REPORT = (extra: string) => `[[report v=1 task=OPS-9 subtask=main branch=none pr=none sha=none gate=pass red=none files=none ${extra}]]`
  // the harness answers the shipped template with a stub; a template of the test's own shows the sections
  const TEMPLATE = '{{#none}}\nrepo=none in {{worktree}}\n{{/none}}\n{{#outdir}}\nOutput folder: {{outdir}}\n{{/outdir}}\n{{#scratch}}\nScratch: {{scratch}} (never in the repo)\n{{/scratch}}\n{{body}}'
  const setup = (on: Parameters<typeof world>[0]) =>
    world(on, {
      files: { [`${ROOT}/agents/tasks/${NAME}`]: CARD, '/out/hair/old.txt': 'x', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE },
      dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
      trees: ['/out/hair', '/out/notes'],
      run,
      agentId: 'agent-r',
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })

  test('a repo: none card dispatches with no worktree and no git: the header carries repo=none, outdir= and scratch=, and the listing of every root is recorded', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-9'))).text)
    const header = (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(' scope=/out/hair/**,/out/notes/*.md forbid= ')
    expect(header).toContain(` gate=check repo=none outdir=/out/hair scratch=/tmp/td/chassis-delegation/OPS-9 `)
    expect(out).toContain(`3. no worktree (repo=none): the worker runs in ${ROOT} and writes outside the repo`)
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([])
    const brief = w.files.get(BRIEF) ?? ''
    expect(brief).toContain(`repo=none in ${ROOT}`)
    expect(brief).toContain('Output folder: /out/hair')
    expect(brief).toContain('Scratch: /tmp/td/chassis-delegation/OPS-9 (never in the repo)')
    // MOD-186: the store holds a pointer; the listing is the file under .delegation/outside/
    expect(w.store.get(`delegation.outside.OPS-9@${ROOT}`)).toMatchObject({ file: OUTSIDE_FILE, files: 1 })
    expect(JSON.parse(w.files.get(OUTSIDE_FILE) ?? 'null')).toEqual([
      { root: '/out/hair', entries: [{ path: 'old.txt', size: 1, mtimeMs: 0 }] },
      { root: '/out/notes', entries: [] },
    ])
    await brainSpawn($, out)
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT })
  })

  test('a worker that wrote only under its outdir and named its artefacts is consistent; the gate ran against the outdir; the metrics are recorded', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
    w.files.set('/out/notes/findings.md', '# findings')
    await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb,/out/notes/findings.md metrics="tris=1200,len_s=2.4"')}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent (no repo) task=OPS-9 attempt=1/2')
    expect(row).toContain('claim scope: held — every file in scope; outside delta: 2 changed paths under /out/hair, /out/notes, every one within scope and none in forbid')
    expect(row).toContain('claim artefacts: held — 2 artefacts exist and are not empty: model.glb (17 bytes), /out/notes/findings.md (10 bytes)')
    expect(row).toContain('claim gate: held — checker {outdir} exited 0')
    expect(row).toContain('metrics: tris=1200, len_s=2.4')
    expect(w.runs.filter(r => r.argv[0] === 'checker').map(r => ({ argv: r.argv, cwd: r.cwd }))).toEqual([{ argv: ['checker', '/out/hair'], cwd: ROOT }])
    expect(records(w, 'OPS-9')[0]).toMatchObject({ verdict: 'consistent', metrics: { tris: '1200', len_s: '2.4' } })
  })

  // MOD-185: the mod's own writes in the session checkout are not the worker's
  test('a forbid over the session checkout still holds after the ledger was written and the brief edited between dispatch and hand-back', { options: OPTIONS }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/agents/tasks/${NAME}`]: CARD.replace('forbid: []', `forbid: [${ROOT}/**]`), '/out/hair/old.txt': 'x', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE },
      dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
      trees: ['/out/hair', '/out/notes', ROOT],
      run,
      agentId: 'agent-r',
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set(`${ROOT}/.delegation/briefs/OPS-9.brief.md`, 'edited by the lead, longer than before')
    w.files.set(`${ROOT}/.delegation/ledger.jsonl`, '{"row":1}\n')
    w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
    await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
    const row = delivered(w)
    expect(row).toContain('verdict=consistent (no repo) task=OPS-9')
    expect(row).toContain('ignored ')
    expect(row).toContain('the mod and the lead write')
  })

  // MOD-163: {worktree} in a repo=none gate is the checkout the worker ran in, not the output folder
  describe('MOD-163: where a repo=none gate runs', () => {
    const WT_OPTIONS = { ...OPTIONS, gateMap: '{"check":"checker {outdir}","wt":"validator {worktree}","both":"scanner {worktree} {outdir}"}' }
    const runWt = (argv: string[]): RunAnswer | undefined => (argv[0] === 'checker' || argv[0] === 'validator' || argv[0] === 'scanner' ? { exitCode: 0, stdout: 'ok\n' } : undefined)
    const setupGate = (on: Parameters<typeof world>[0], gate: string) =>
      world(on, {
        files: { [`${ROOT}/agents/tasks/${NAME}`]: CARD.replace('gate: check', `gate: ${gate}`), '/out/hair/old.txt': 'x', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE },
        dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
        trees: ['/out/hair', '/out/notes'],
        run: runWt,
        agentId: 'agent-r',
        store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
      })

    test('a gate naming {worktree} gets the session root as argv and cwd, and the verdict names the checkout', { options: WT_OPTIONS }, async ($, on) => {
      const w = setupGate(on, 'wt')
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      expect(w.runs.filter(r => r.argv[0] === 'validator').map(r => ({ argv: r.argv, cwd: r.cwd }))).toEqual([{ argv: ['validator', ROOT], cwd: ROOT }])
      expect(delivered(w)).toContain('gate wt ran in the checkout (repo=none)')
    })

    test('{outdir} still fills with the output folder while {worktree} is the checkout', { options: WT_OPTIONS }, async ($, on) => {
      const w = setupGate(on, 'both')
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      expect(w.runs.filter(r => r.argv[0] === 'scanner').map(r => r.argv)).toEqual([['scanner', ROOT, '/out/hair']])
    })

    test('the dispatch line names the gate and the root it runs in, and a dry run says the same', { options: WT_OPTIONS }, async ($, on) => {
      setupGate(on, 'wt')
      await $.session.start(sessionStart)
      const out = String((await $.command.run(commandInput('OPS-9'))).text)
      expect(out).toContain(`research card: outdir=/out/hair · scratch=/tmp/td/chassis-delegation/OPS-9 · gate wt runs in ${ROOT}`)
    })
  })

  test('a worker that also wrote a file outside every scope entry is refuted on scope, naming the file and the outside delta', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
    w.files.set('/out/notes/scratch.txt', 'left behind')
    await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
    const row = delivered(w)
    expect(row).toContain('verdict=refuted (no repo) task=OPS-9')
    expect(row).toContain('claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)')
    expect(records(w, 'OPS-9')[0]).toMatchObject({ verdict: 'refuted', firstFailed: 'scope' })
  })

  // MOD-217: scope is charged only for paths the worker wrote
  describe('MOD-217: attribution of the outside delta', () => {
    const write = ($: any, file: string) => $.tool.call({ tool: 'Write', file_path: file, content: 'x', agentId: 'agent-r' } as never)
    const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
    const allowWrites = (on: Parameters<typeof world>[0]) => on('tool.call', { tool: 'Write' }, passed)

    test('a brain edit to an outside file during the run does not refute the worker; it is listed as not by this worker', { options: OPTIONS }, async ($, on) => {
      const w = setup(on)
      allowWrites(on)
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      await write($, '/out/hair/model.glb')
      w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
      w.files.set('/out/notes/spec.txt', 'edited by the brain')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('verdict=consistent (no repo) task=OPS-9')
      expect(row).toContain('changed during the run, not by this worker: /out/notes/spec.txt')
    })

    test('the worker\'s own outside write still refutes', { options: OPTIONS }, async ($, on) => {
      const w = setup(on)
      allowWrites(on)
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      await write($, '/out/hair/model.glb')
      await write($, '/out/notes/scratch.txt')
      w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
      w.files.set('/out/notes/scratch.txt', 'left behind')
      w.files.set('/out/notes/spec.txt', 'edited by the brain')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('verdict=refuted (no repo) task=OPS-9')
      expect(row).toContain('claim scope: failed — out-of-scope path: /out/notes/scratch.txt (outside delta)')
    })

    test('another task\'s .delegation/<id>/files.txt in a watched folder never counts, with or without a write log', { options: OPTIONS }, async ($, on) => {
      const w = world(on, {
        files: { [`${ROOT}/agents/tasks/${NAME}`]: CARD.replace('forbid: []', 'forbid: [/work/**]'), '/out/hair/old.txt': 'x', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE },
        dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
        trees: ['/out/hair', '/out/notes', '/work'],
        run,
        agentId: 'agent-r',
        store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
      })
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
      w.files.set('/work/MOD-9-wt/.delegation/OTHER-1/files.txt', 'a.ts\n')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('verdict=consistent (no repo) task=OPS-9')
      expect(row).not.toContain('files.txt')
    })
  })

  test('an artefact the report names that is not there is refuted on artefacts, naming it; nothing named is no claim', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
    await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb,render.png')}`))
    const row = delivered(w)
    expect(row).toContain('verdict=refuted (no repo) task=OPS-9')
    expect(row).toContain('claim artefacts: failed — missing: render.png (/out/hair/render.png)')
  })

  test('a root that exists but cannot be listed at hand-back leaves the scope claim unchecked: unverified, never held', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/model.glb', 'glTF-binary-bytes')
    // the listing now refuses /out/notes
    w.unreadable.add('/out/notes')
    await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
    const row = delivered(w)
    expect(row).toContain('verdict=unverified (no repo) task=OPS-9')
    expect(row).toContain('claim scope: unchecked — ')
    expect(row).not.toContain('claim scope: held')
  })

  describe('MOD-186: the listing is a file, not a store value', () => {
    const forbidCard = CARD.replace('forbid: []', 'forbid: [/secret/**]')
    const many = (on: Parameters<typeof world>[0], card = forbidCard, extra: Record<string, string> = {}) => {
      const files: Record<string, string> = { [`${ROOT}/agents/tasks/${NAME}`]: card, [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE, '/secret/keep.txt': 'k', ...extra }
      for (let i = 0; i < 2000; i++) files[`/out/hair/d${i % 20}/some-long-file-name-${i}.txt`] = 'x'
      return world(on, { files, dirs: { [`${ROOT}/agents/tasks`]: [NAME] }, trees: ['/out/hair', '/out/notes', '/secret'], run, agentId: 'agent-r', store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    }

    test('2000 files: the store value is under 1000 characters and the file holds every entry; a forbid touch is still refuted', { options: OPTIONS }, async ($, on) => {
      const w = many(on)
      await $.session.start(sessionStart)
      const out = String((await $.command.run(commandInput('OPS-9'))).text)
      const saved = w.store.get(`delegation.outside.OPS-9@${ROOT}`)
      expect(JSON.stringify(saved).length).toBeLessThan(1000)
      expect(saved).toMatchObject({ file: OUTSIDE_FILE, files: 2001, briefPath: BRIEF })
      const listed = JSON.parse(w.files.get(OUTSIDE_FILE) ?? '[]') as { root: string; entries: unknown[] }[]
      expect(listed.find(l => l.root === '/out/hair')?.entries).toHaveLength(2000)
      await brainSpawn($, out)
      w.files.set('/secret/keep.txt', 'changed')
      w.files.set('/out/hair/model.glb', 'glTF')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      expect(delivered(w)).toContain('claim scope: failed — touches forbid path: /secret/keep.txt (outside delta)')
    })

    test('a store value from an older version, with roots inline and no file, still verifies', { options: OPTIONS }, async ($, on) => {
      const w = many(on)
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      const listed = JSON.parse(w.files.get(OUTSIDE_FILE) ?? '[]')
      w.store.set(`delegation.outside.OPS-9@${ROOT}`, { at: 1, briefPath: BRIEF, roots: listed })
      w.files.delete(OUTSIDE_FILE)
      w.files.set('/secret/keep.txt', 'changed')
      w.files.set('/out/hair/model.glb', 'glTF')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      expect(delivered(w)).toContain('claim scope: failed — touches forbid path: /secret/keep.txt (outside delta)')
    })

    test('a missing listing file leaves the scope claim unchecked, naming the file', { options: OPTIONS }, async ($, on) => {
      const w = many(on)
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      w.files.delete(OUTSIDE_FILE)
      w.files.set('/out/hair/model.glb', 'glTF')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('claim scope: unchecked — ')
      expect(row).toContain(OUTSIDE_FILE)
      expect(row).not.toContain('claim scope: held')
    })

    test('a brief that names no outside root drops the key and empties its file', { options: OPTIONS }, async ($, on) => {
      const w = many(on)
      await $.session.start(sessionStart)
      await $.command.run(commandInput('OPS-9'))
      expect(w.files.get(OUTSIDE_FILE)).toBeTruthy()
      w.files.set(`${ROOT}/agents/tasks/${NAME}`, CARD.replace('scope: [/out/hair/**, /out/notes/*.md]', 'scope: [hooks/**]'))
      await $.command.run(commandInput('OPS-9'))
      expect(w.store.has(`delegation.outside.OPS-9@${ROOT}`)).toBe(false)
      expect(w.files.get(OUTSIDE_FILE) ?? '').toBe('')
    })
  })

  describe('MOD-85: a forbid root past 10000 files is watched by modification time', () => {
    const BIG_CARD = CARD.replace('scope: [/out/hair/**, /out/notes/*.md]', 'scope: [/out/hair/**]').replace('forbid: []', 'forbid: [/big/**]')
    const bigSetup = (on: Parameters<typeof world>[0]) => {
      const files: Record<string, string> = { [`${ROOT}/agents/tasks/${NAME}`]: BIG_CARD, [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }), '/tpl/brief.md': TEMPLATE }
      for (let i = 0; i < 10001; i++) files[`/big/d${i % 50}/f${i}.txt`] = 'x'
      return world(on, { files, dirs: { [`${ROOT}/agents/tasks`]: [NAME] }, trees: ['/out/hair', '/big'], run, agentId: 'agent-r', store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    }

    test('the dispatch records a watermark and says so; a file changed after it refutes scope, naming the file', { options: OPTIONS }, async ($, on) => {
      const w = bigSetup(on)
      await $.session.start(sessionStart)
      const out = String((await $.command.run(commandInput('OPS-9'))).text)
      expect(out).toContain('/big holds more than 10000 files, so changes there will be found by modification time')
      const saved = { roots: JSON.parse(w.files.get(OUTSIDE_FILE) ?? '[]') as Record<string, unknown>[] }
      expect(saved.roots.find(r => r.root === '/big')).toEqual({ root: '/big', since: 1_000_000, files: 10001 })
      await brainSpawn($, out)
      w.files.set('/out/hair/model.glb', 'glTF')
      w.files.set('/big/d3/f3.txt', 'changed')
      w.mtimes.set('/big/d3/f3.txt', 1_005_000)
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('verdict=refuted (no repo) task=OPS-9')
      expect(row).toContain('claim scope: failed — touches forbid path: /big/d3/f3.txt (outside delta)')
    })

    test('with nothing changed the scope claim holds, checked by modification time, not unchecked', { options: OPTIONS }, async ($, on) => {
      const w = bigSetup(on)
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
      w.files.set('/out/hair/model.glb', 'glTF')
      await $.turn.complete(turnInput('agent-r', `Done.\n${REPORT('artefacts=model.glb')}`))
      const row = delivered(w)
      expect(row).toContain('claim scope: held — every file in scope; outside delta: 1 changed path under /out/hair, /big, every one within scope and none in forbid (checked by modification time)')
      expect(row).not.toContain('claim scope: unchecked')
    })
  })

  test('the card tool takes repo none and an absolute scope: the card, the header and the folders', { options: { briefDir: `${SCRATCH}/briefs`, gateMap: '{"check":"checker {outdir}"}' } }, async ($, on) => {
    const w = world(on, { dirs: { [`${ROOT}/agents/tasks`]: ['README.md'] }, trees: ['/out/hair'], store: { 'delegation.agentTypes': ['general-purpose'] } })
    await $.session.start(sessionStart)
    const out = resultText(
      await $.tool.call({
        tool: 'mcp__chassis-delegation__card',
        title: 'Extract the hair model',
        why: 'The model lives outside the repo.',
        doneWhen: ['model.glb is in the output folder'],
        scope: ['/out/hair/**'],
        redTest: 'none',
        repo: 'none',
        gate: 'check',
      } as never),
    )
    const card = w.files.get(`${ROOT}/agents/tasks/OPS-1-extract-the-hair-model.md`) ?? ''
    expect(card).toContain('\nrepo: none\n')
    expect(card).toContain('\nscope: [/out/hair/**]\n')
    expect(out).toContain(' · repo none · ')
    expect(out).toContain('gate=check repo=none outdir=/out/hair scratch=/tmp/td/chassis-delegation/OPS-1 ')
    expect(w.spawns).toHaveLength(0)
  })

  test('a tilde in scope is expanded to the home folder in the brief header', { options: OPTIONS }, async ($, on) => {
    const w = world(on, {
      files: { [`${ROOT}/agents/tasks/${NAME}`]: CARD.replace('[/out/hair/**, /out/notes/*.md]', '[~/out/hair/**]').replace('forbid: []', 'forbid: [~/secrets/**]') },
      dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
      trees: [`${HOME}/out/hair`],
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
    await $.session.start(sessionStart)
    await $.command.run(commandInput('OPS-9'))
    const header = (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(` scope=${HOME}/out/hair/** forbid=${HOME}/secrets/** `)
    expect(header).toContain(` outdir=${HOME}/out/hair scratch=`)
  })
})

describe('MOD-23: exclusive resources and fan-out', () => {
  type Dollar = Parameters<NonNullable<Parameters<typeof test>[2]>>[0]
  const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' as const, gateMap: '{"check":"checker {outdir}"}' }
  const run = (argv: string[]): RunAnswer | undefined => (argv[0] === 'checker' ? { exitCode: 0, stdout: 'checked\n' } : undefined)
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const stateOf = async ($: Dollar) => String((await $.prompt.compose(composeInput(['Agent']))).sections.find(x => x.id === 'chassis-delegation:state')?.text ?? '')
  const POSTURE = 'without asking the person'
  const postureLines = (text: string) => text.split('\n').filter(l => l.includes(POSTURE))
  const tasksDir = `${ROOT}/agents/tasks`
  // two research cards that both need the one live Blender
  const cardText = (id: string, title: string, folder: string) =>
    ['---', `id: ${id}`, `title: ${title}`, 'domain: ops', 'tier: standard', 'status: queued', 'repo: none', `scope: [${folder}/**]`, 'forbid: [/out/notes/shared.md]', 'resources: [blender-live]', 'red_test: none', 'gate: check', 'budget: 2-attempts', '---', '## Why', '', 'One live Blender, one open file.', ''].join('\n')
  const HAIR = 'OPS-8-extract-the-hair-model.md'
  const EYES = 'OPS-9-extract-the-eye-model.md'
  const REPORT = (task: string) => `[[report v=1 task=${task} subtask=main branch=none pr=none sha=none gate=pass red=none files=none]]`
  const setup = (on: Parameters<typeof world>[0]) =>
    world(on, {
      files: { [`${tasksDir}/${HAIR}`]: cardText('OPS-8', 'Extract the hair model', '/out/hair'), [`${tasksDir}/${EYES}`]: cardText('OPS-9', 'Extract the eye model', '/out/eyes') },
      dirs: { [tasksDir]: [HAIR, EYES] },
      trees: ['/out/hair', '/out/eyes'],
      run,
      listAgents: true,
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })

  test('dispatching a second card that needs a held resource prints the waiting line and spawns nothing; the first card’s hand-back carries ready: for it', { options: { ...OPTIONS, wakeOnVerdict: true } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const first = String((await $.command.run(commandInput('OPS-8'))).text)
    expect((w.files.get(`${SCRATCH}/briefs/OPS-8.brief.md`) ?? '').split('\n')[0]).toContain(' resources=blender-live ')
    await brainSpawn($, first)
    expect(w.spawns).toHaveLength(1)
    // a free slot, but the one Blender is in use: the second card waits, naming the first
    const second = String((await $.command.run(commandInput('OPS-9'))).text)
    expect(second).toContain('queued: OPS-9 — waiting for resource blender-live (held by OPS-8)')
    expect(second).toContain('queued (position 1)')
    expect(spawnCallOf(second)).toBeUndefined()
    expect(w.spawns).toHaveLength(1)
    expect(queueOf(w).map(q => q.task)).toEqual(['OPS-9'])
    // asked again, it keeps its place
    const again = String((await $.command.run(commandInput('OPS-9'))).text)
    expect(again).toMatch(/queued: OPS-9 — waiting for resource blender-live \(held by OPS-8\); already queued since \d\d:\d\d \(position 1\)/)
    expect(queueOf(w)).toHaveLength(1)
    expect(delivered(w)).not.toContain('ready: OPS-9')
    // the first card hands back: the hand-back that frees the resource says ready for the second
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('OPS-8')}`))
    expect(delivered(w)).toContain('ready: OPS-9 — run its spawn block (/dispatch OPS-9 prints it again)')
    expect(w.submitted.at(-1)?.text).toContain('ready: OPS-9 — run its spawn block')
    // the brain makes the spawn and the row leaves the queue
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    expect(w.spawns).toHaveLength(2)
    expect(queueOf(w)).toEqual([])
  })

  test('a brain spawn of a brief whose resource is held is queued with the waiting line; a brief with no resources is not held up', async ($, on) => {
    const w = world(on, { listAgents: true })
    const brief = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard${over}]]\nDo it.`
    await $.agent.spawn(spawnInput({ prompt: brief('T-1', ' resources=blender-live'), tool_use_id: 'toolu_A0000001' }))
    const held = await $.agent.spawn(spawnInput({ prompt: brief('T-2', ' resources=blender-live'), tool_use_id: 'toolu_B0000002' }))
    expect(held.deny).toBe('queued: T-2 — waiting for resource blender-live (held by T-1)')
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'T-2')).toEqual([])
    // a slot is free, so nothing is ready, and the state names what the row waits for
    const waiting = await stateOf($)
    expect(waiting).toContain('- queued: T-2 (position 1) — waiting for resource blender-live (held by T-1)')
    expect(waiting).not.toContain('ready: T-2')
    expect(postureLines(waiting)).toEqual([])
    // a card with no resources is not held up behind it
    const free = await $.agent.spawn(spawnInput({ prompt: brief('T-3'), tool_use_id: 'toolu_C0000003' }))
    expect(free.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(2)
    // T-1 hands back: T-2 is ready, and the posture line says to make its call
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('T-1')}`))
    expect(delivered(w)).toContain('ready: T-2 — run its spawn block (/dispatch T-2 prints it again)')
    const ready = await stateOf($)
    expect(ready).toContain('- ready: T-2 — run its spawn block')
    expect(postureLines(ready)).toHaveLength(1)
    // the brain spawns it; it now holds the resource, and a third card that wants it waits for T-2
    await $.agent.spawn(spawnInput({ prompt: brief('T-2', ' resources=blender-live'), tool_use_id: 'toolu_D0000002' }))
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
    const third = await $.agent.spawn(spawnInput({ prompt: brief('T-4', ' resources=blender-live'), tool_use_id: 'toolu_E0000004' }))
    expect(third.deny).toBe('queued: T-4 — waiting for resource blender-live (held by T-2)')
  })

  test('two queued cards that both hold a resource: only the first is said ready when the holder hands back', async ($, on) => {
    const w = world(on, { listAgents: true })
    const brief = (task: string, over = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard${over}]]\nDo it.`
    await $.agent.spawn(spawnInput({ prompt: brief('T-1', ' resources=blender-live'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2', ' resources=blender-live'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-3', ' resources=blender-live'), tool_use_id: 'toolu_C0000003' }))
    expect(queueOf(w).map(q => q.task)).toEqual(['T-2', 'T-3'])
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('T-1')}`))
    expect(delivered(w)).toContain('ready: T-2 — run its spawn block')
    expect(delivered(w)).not.toContain('ready: T-3')
    const state = await stateOf($)
    expect(state).toContain('- queued: T-3 (position 2) — waiting for resource blender-live (held by T-2)')
  })

  test('MOD-24: a shared resource alone no longer refuses a repo=here dispatch: the in-flight card is not a live worker holding it, so the card is dispatched and its brief carries the resource', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const card = FIXTURE_CARD.replace('status: queued', 'status: queued\nrepo: here\nresources: [blender-live]')
    const path = `${ROOT}/.delegation/briefs/GH-19.brief.md`
    const w = world(on, {
      files: { [`${tasksDir}/${FIXTURE_CARD_NAME}`]: card, [path]: '[[brief v=1 task=GH-19 subtask=main tier=standard scope=src/** forbid= gate=node repo=here resources=blender-live]]\nbody' },
      dirs: { [tasksDir]: [FIXTURE_CARD_NAME] },
      run: argv => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined),
      store: {
        'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'],
        'delegation.tasks.GH-19': [{ task: 'GH-19', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'pending', at: 1, briefPath: path, here: ROOT }],
      },
    })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --scope app/billing/Rate*.ts'))).text)
    expect(out).not.toContain('refused')
    expect(out).not.toContain('--force-overlap')
    expect(spawnCallOf(out)).toBeDefined()
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0]).toContain(' resources=blender-live ')
  })

  describe('the posture line covers a pending review spawn block', () => {
    const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
    const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=2-attempts report=chassis.report.v1]]'
    const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }

    test('owed review: one posture line right under the header, naming the reviewer’s call; gone once the brain makes it', { options: { review: 'on', verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const verifier = nativeRun({ gate: 0 })
      // the work is not on origin/main (MOD-4's retire check): the owed row stays
      const run = (argv: string[]): RunAnswer | undefined => (argv.includes('--is-ancestor') && argv.at(-1) === 'origin/main' ? { exitCode: 1, stdout: '' } : verifier(argv))
      const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run, agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', 'Added the parser.\n[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
      expect(delivered(w)).toContain('next=review')
      const owed = await stateOf($)
      expect(owed).toContain('- owed: T-4: review')
      expect(postureLines(owed)).toHaveLength(1)
      expect(postureLines(owed)[0]).toContain('a pending review block’s Agent call')
      expect(owed.indexOf(POSTURE)).toBeLessThan(owed.indexOf('- owed: T-4: review')) // right under the header
      // the brain makes the reviewer's call: the review is no longer owed, and the posture line goes
      await brainSpawn($, delivered(w), { tool_use_id: 'toolu_REVIEW01' })
      w.agents.push({ id: 'agent-2', type: 'general-purpose', description: 'T-4 review economy haiku', status: 'running' })
      const running = await stateOf($)
      expect(running).not.toContain('owed: T-4: review')
      expect(postureLines(running)).toEqual([])
    })
  })

  describe('the card tool writes lanes', () => {
    const TOOL = 'mcp__chassis-delegation__card'
    const lanesInput = {
      title: 'Extract the avatar parts',
      why: 'One live Blender with one open file: the lanes take turns.',
      doneWhen: ['each part is in its lane folder'],
      redTest: 'none',
      repo: 'none',
      gate: 'check',
      forbid: ['/out/notes/shared.md'],
      resources: ['blender-live'],
      lanes: [
        { title: 'Extract the hair model', scope: ['/out/hair/**'] },
        { title: 'Extract the eye model', scope: ['/out/eyes/**'], doneWhen: ['eyes.glb is in /out/eyes'] },
      ],
    }
    const empty = (on: Parameters<typeof world>[0]) =>
      world(on, { dirs: { [tasksDir]: ['README.md'] }, trees: ['/out/hair', '/out/eyes'], run, listAgents: true, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })

    test('the dry run writes one card per lane and prints every lane’s header, then says go for all of them', { options: OPTIONS }, async ($, on) => {
      const w = empty(on)
      await $.session.start(sessionStart)
      const out = resultText(await $.tool.call({ tool: TOOL, ...lanesInput } as never))
      const hair = w.files.get(`${tasksDir}/OPS-1-extract-the-hair-model.md`) ?? ''
      const eyes = w.files.get(`${tasksDir}/OPS-2-extract-the-eye-model.md`) ?? ''
      expect(hair).toContain('id: OPS-1\n')
      expect(eyes).toContain('id: OPS-2\n')
      for (const text of [hair, eyes]) {
        expect(text).toContain('\nresources: [blender-live]\n')
        expect(text).toContain('\nforbid: [/out/notes/shared.md]\n')
        expect(text).toContain('\nrepo: none\n')
        expect(text).toContain('One live Blender with one open file: the lanes take turns.')
      }
      expect(hair).toContain('\nscope: [/out/hair/**]\n')
      expect(eyes).toContain('\nscope: [/out/eyes/**]\n')
      expect(eyes).toContain('- eyes.glb is in /out/eyes')
      expect(out).toContain(`wrote ${tasksDir}/OPS-1-extract-the-hair-model.md`)
      expect(out).toContain(`wrote ${tasksDir}/OPS-2-extract-the-eye-model.md`)
      // every lane's header, each with its own output folder and the shared forbid and resource
      expect((out.match(/\[\[brief v=1 /g) ?? []).length).toBe(2)
      expect(out).toContain('task=OPS-1 ')
      expect(out).toContain('task=OPS-2 ')
      expect(out).toContain(' scope=/out/hair/** forbid=/out/notes/shared.md ')
      expect(out).toContain(' scope=/out/eyes/** forbid=/out/notes/shared.md ')
      expect(out).toContain(' outdir=/out/hair ')
      expect(out).toContain(' outdir=/out/eyes ')
      expect((out.match(/ resources=blender-live /g) ?? []).length).toBe(2)
      expect(out.trimEnd().endsWith('Say go and Claude dispatches OPS-1, OPS-2.')).toBe(true)
      expect(w.spawns).toHaveLength(0)
    })

    test('overlapping lane scopes are refused naming both lanes, and nothing is written', { options: OPTIONS }, async ($, on) => {
      const w = empty(on)
      await $.session.start(sessionStart)
      const before = w.files.size
      const out = resultText(await $.tool.call({ tool: TOOL, ...lanesInput, lanes: [{ title: 'Extract the hair model', scope: ['/out/avatar/**'] }, { title: 'Extract the eye model', scope: ['/out/avatar/eyes/**'] }] } as never))
      expect(out).toContain('card refused:')
      expect(out).toContain('Extract the hair model')
      expect(out).toContain('Extract the eye model')
      expect(w.files.size).toBe(before)
      expect(w.spawns).toHaveLength(0)
    })

    test('dispatch: true dispatches every lane: the first runs, and the second waits for the resource they share', { options: OPTIONS }, async ($, on) => {
      const w = empty(on)
      await $.session.start(sessionStart)
      const out = resultText(await $.tool.call({ tool: TOOL, ...lanesInput, dispatch: true } as never))
      const sections = out.split(/^--- OPS-\d+ ---$/m)
      expect(sections).toHaveLength(3)
      expect(spawnCallOf(sections[1] as string)).toMatchObject({ description: 'OPS-1 standard sonnet' })
      expect(spawnCallOf(sections[2] as string)).toMatchObject({ description: 'OPS-2 standard sonnet' })
      expect(w.spawns).toHaveLength(0)
      await brainSpawn($, sections[1] as string)
      expect(w.spawns).toHaveLength(1)
      const second = await brainSpawn($, sections[2] as string)
      expect(second.deny).toBe('queued: OPS-2 — waiting for resource blender-live (held by OPS-1)')
      expect(w.spawns).toHaveLength(1)
    })
  })
})

describe('MOD-24: a repo=here card that shares a resource is queued, not refused', () => {
  const OPTIONS = { briefDir: `${SCRATCH}/briefs` }
  const tasksDir = `${ROOT}/agents/tasks`
  const onMain = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined)
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const hereCard = (id: string, title: string, scope: string) =>
    ['---', `id: ${id}`, `title: ${title}`, 'domain: ops', 'tier: standard', 'status: queued', 'repo: here', `scope: [${scope}]`, 'forbid: [docs/**]', 'resources: [blender-live]', 'red_test: none', 'gate: node', 'budget: 2-attempts', '---', '## Why', '', 'One live Blender, one open file.', ''].join('\n')
  const HAIR = 'OPS-8-extract-the-hair-model.md'
  const EYES = 'OPS-9-extract-the-eye-model.md'
  const setup = (on: Parameters<typeof world>[0], hairScope: string, eyesScope: string) =>
    world(on, {
      files: { [`${tasksDir}/${HAIR}`]: hereCard('OPS-8', 'Extract the hair model', hairScope), [`${tasksDir}/${EYES}`]: hereCard('OPS-9', 'Extract the eye model', eyesScope) },
      dirs: { [tasksDir]: [HAIR, EYES] },
      run: onMain,
      listAgents: true,
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
  const PANE_PROPS = paneProps(120)
  const seen = async (ui: { find: (q: never) => Promise<unknown> }, text: RegExp): Promise<boolean> => {
    try {
      return (await ui.find({ type: 'Text', text } as never)) !== undefined
    } catch {
      return false
    }
  }

  test('two repo=here cards with disjoint scopes that share blender-live: the second dispatch prints the waiting line, no refusal, no spawn block; the pane’s open item names the resource', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, 'src/hair/**', 'src/eyes/**')
    await $.session.start(sessionStart)
    const first = String((await $.command.run(commandInput('OPS-8'))).text)
    expect(first).not.toContain('refused')
    await brainSpawn($, first)
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'OPS-8')[0]).toMatchObject({ here: ROOT })
    // a free slot, an in-flight repo=here card with a disjoint scope, but the one Blender is in use: queued, not refused
    const second = String((await $.command.run(commandInput('OPS-9'))).text)
    expect(second).not.toContain('refused')
    expect(second).not.toContain('--force-overlap')
    expect(second).toContain('queued: OPS-9 — waiting for resource blender-live (held by OPS-8)')
    expect(second).toContain('queued (position 1)')
    expect(spawnCallOf(second)).toBeUndefined()
    expect(w.spawns).toHaveLength(1)
    expect(queueOf(w).map(q => q.task)).toEqual(['OPS-9'])
    // the band's item for the queued card carries the resource it waits for, and not the slot wording
    const ui = await $.ui.mount({ plugin: 'chassis-delegation', surface: 'terminal', component: 'Pane', requestId: 'delegation-dash', props: PANE_PROPS })
    expect(await seen(ui, /OPS-9: queued \(position 1\) — waits for blender-live \(held by OPS-8\)/)).toBe(true)
    expect(await seen(ui, /OPS-9: queued .*starts when a worker slot frees/)).toBe(false)
  })

  test('two repo=here cards with overlapping scopes are still refused, as before; --force-overlap dispatches with the scope warning and the card then waits for the resource', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, 'src/**', 'src/eyes/**')
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text))
    expect(w.spawns).toHaveLength(1)
    const refused = String((await $.command.run(commandInput('OPS-9'))).text)
    expect(refused).toContain('/dispatch OPS-9: refused — OPS-9 scope src/eyes/** overlaps in-flight OPS-8 scope src/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)')
    expect(refused).not.toContain('holds resource')
    expect(refused).not.toContain('queued:')
    expect(w.files.has(`${SCRATCH}/briefs/OPS-9.brief.md`)).toBe(false)
    expect(queueOf(w)).toEqual([])
    const forced = String((await $.command.run(commandInput('OPS-9 --force-overlap'))).text)
    expect(forced).toContain('   warning: OPS-9 scope src/eyes/** overlaps in-flight OPS-8 scope src/** in the shared checkout (--force-overlap: dispatched anyway)')
    expect(forced).toContain('queued: OPS-9 — waiting for resource blender-live (held by OPS-8)')
    expect(queueOf(w).map(q => q.task)).toEqual(['OPS-9'])
  })
})

describe('MOD-28: the mod reads its templates once, at load, and says when the folder is newer than the code', () => {
  type Tester = Parameters<TestBody>[0]
  const OPTIONS = { briefDir: `${SCRATCH}/briefs` }
  const files = (): Record<string, string> => ({ [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD })
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  /** The folder the mod loaded from, as /delegation says it (the status reads no template, so this loads nothing). */
  const rootOf = async ($: Tester) => /loaded from (\S+)/.exec(String((await $.command.run(delegation(''))).text))?.[1] ?? ''
  const gitRuns = (w: { runs: { argv: string[] }[] }) => argvs(w).filter(a => a[0] === 'git')

  test('a brief.md changed in the folder after the load is not read: dispatch renders the template as loaded', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: files(), dirs })
    await $.session.start(sessionStart)
    const root = await rootOf($)
    expect(root).not.toBe('')
    // a pull under the running session: the folder now holds a newer brief.md, with a section this code never rendered
    w.files.set(`${root}/hooks/templates/brief.md`, 'FROM THE FOLDER NOW {{id}}\n{{#none}}a section the loaded code never rendered{{/none}}\n{{body}}')
    await $.command.run(commandInput('BE-101 --dry-run'))
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    expect(brief).toContain(`Work in ${ROOT}-BE-101 on agent/backend/BE-101;`)
    expect(brief).not.toContain('FROM THE FOLDER NOW')
    expect(brief).not.toContain('{{')
  })

  test('a template holding a section the code does not know: dispatch is refused naming the marker and the template; no brief, no worktree, no spawn', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: files(), dirs, store: { 'delegation.agentTypes': ['general-purpose', 'backend'] } })
    const root = await rootOf($)
    const template = `${root}/hooks/templates/brief.md`
    w.files.set(template, 'Work in {{worktree}}.\n{{#mystery}}only when the mystery applies{{/mystery}}\n{{body}}')
    await $.session.start(sessionStart) // the load reads the folder's copy, mystery section and all
    const out = String((await $.command.run(commandInput('BE-101 --scope app/**'))).text)
    expect(out).toContain('/dispatch BE-101: refused')
    expect(out).toContain('{{#mystery}}')
    expect(out).toContain(template)
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(gitRuns(w)).toEqual([])
    expect(w.spawns).toHaveLength(0)
    expect(spawnCallOf(out)).toBeUndefined()
    // a dry run is refused the same way: the brief is never shown
    const dry = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(dry).toContain('{{#mystery}}')
    expect(dry).not.toContain('[[brief v=1')
  })

  test('a card body that quotes a marker is not a leftover: only the template is scanned', { options: OPTIONS }, async ($, on) => {
    const quoting = FIXTURE_CARD.replace('## Why', '## Why\n\nThe old brief carried raw {{#none}} and {{/repo}} markers.')
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: quoting }, dirs })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out).not.toContain('refused')
    expect(w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').toContain('raw {{#none}} and {{/repo}} markers')
  })

  test('a brief template that cannot be read at load is reported once at load; dispatch says so when used, without reading the folder again', { options: OPTIONS }, async ($, on) => {
    const w = world(on, { files: files(), dirs, noBriefTemplate: true })
    await $.session.start(sessionStart)
    const root = await rootOf($)
    const briefReads = () => w.reads.filter(r => r.endsWith('/templates/brief.md'))
    expect(briefReads()).toEqual([`${root}/hooks/templates/brief.md`])
    expect(w.toasts.filter(t => t.includes('brief.md'))).toHaveLength(1)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out).toContain('/dispatch BE-101: the brief template could not be read')
    expect(out).toContain('it failed to load when the mod started')
    // once at load: dispatch neither read the folder again nor toasted again
    expect(briefReads()).toHaveLength(1)
    expect(w.toasts.filter(t => t.includes('brief.md'))).toHaveLength(1)
  })

  test('the debrief agent is given the loaded debrief.md in its prompt, not a path to read in the folder', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.session.start(sessionStart)
    const root = await rootOf($)
    w.files.set(`${root}/hooks/templates/debrief.md`, 'CHANGED AFTER THE LOAD')
    await $.command.run(delegation('debrief'))
    const prompt = String(w.spawns[0]?.prompt)
    expect(prompt).toContain(DEBRIEF_TEMPLATE)
    expect(prompt).not.toContain('CHANGED AFTER THE LOAD')
    expect(prompt).not.toContain('exactly as written in')
  })

  test('a debrief.md that cannot be read: /delegation debrief says so and starts nothing, claiming no watermark', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, noDebriefTemplate: true })
    await $.session.start(sessionStart)
    expect(w.toasts.filter(t => t.includes('debrief.md'))).toHaveLength(1)
    const out = String((await $.command.run(delegation('debrief'))).text)
    expect(out).toContain('debrief not started')
    expect(out).toContain('debrief template could not be read')
    expect(w.spawns).toHaveLength(0)
    expect(w.store.get('delegation.debrief.sess-1')).toBeUndefined()
  })

  test('a review.md that cannot be read is reported once at load', { options: { review: 'on' } }, async ($, on) => {
    const w = world(on, { noReviewTemplate: true })
    await $.session.start(sessionStart)
    expect(w.toasts.filter(t => t.includes('review.md'))).toHaveLength(1)
    expect(w.toasts.filter(t => t.includes('brief.md') || t.includes('debrief.md'))).toHaveLength(0)
  })

  test('/delegation says when hooks/lib/version.ts on disk names another version than the one running', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    const first = String((await $.command.run(delegation(''))).text)
    const root = /loaded from (\S+)/.exec(first)?.[1] ?? ''
    // no version.ts to read (a folder cut down): no line
    expect(first).not.toContain('code: running')
    w.files.set(`${root}/hooks/lib/version.ts`, `export const MOD_VERSION = '${MOD_VERSION}'\n`)
    expect(String((await $.command.run(delegation(''))).text)).not.toContain('code: running')
    // the folder is pulled under the session: it names 9.9.9 (read as text, never imported)
    w.files.set(`${root}/hooks/lib/version.ts`, "// The mod's version\nexport const MOD_VERSION = '9.9.9'\n")
    const out = String((await $.command.run(delegation(''))).text)
    expect(out).toContain(`code: running ${MOD_VERSION}, folder holds 9.9.9 — reload the window to run it`)
    // under the mod line, in the status block
    expect(out.indexOf('code: running')).toBeGreaterThan(out.indexOf(`mod: chassis-delegation ${MOD_VERSION}`))
  })
})

describe('MOD-31: after a debrief, the mod asks whether to post its findings', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const FOLDER = `${ROOT}/.delegation/debriefs`
  const DEBRIEF = `${FOLDER}/2026-10-10-mod-run.json`
  const FINDINGS = `${FOLDER}/2026-10-10-mod-run.findings.json`
  const REPO_FILE = `${ROOT}/.chassis-delegation.json`
  const one = (over: Record<string, unknown>) => ({ kind: 'went_wrong', surface: '/delegation accept', fault_class: 'bug', severity: 'P2', title: 'Accepted row stayed owed', body: 'It came back.', evidence: ['e1'], ...over })
  const two = [one({}), one({ surface: '/delegation debrief', title: 'Debrief wrote findings late' })]
  const isCreate = (argv: string[]) => argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'create'
  let nextIssue = 40
  const ghRun = (argv: string[]) => {
    if (argv[0] === 'gh' && argv[2] === 'list') return { exitCode: 0, stdout: '[]' }
    if (isCreate(argv)) return { exitCode: 0, stdout: `https://github.com/owner/mod/issues/${nextIssue++}\n` }
    return { exitCode: 0, stdout: '' }
  }
  const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
  const handBack = async ($: any, w: ReturnType<typeof world>) => {
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    return w
  }
  const files = (findings: unknown[], extra: Record<string, unknown> = {}) => ({ [DEBRIEF]: JSON.stringify({ summary: 'x', mod_findings: findings, ...extra }), [REPO_FILE]: '{"issueRepo":"owner/mod"}' })
  const QUESTION = 'post 2 findings to owner/mod? say yes to post them all, scrubbed, or name some (/delegation debrief post 1,3); nothing is posted without a yes'

  test('unset (ask): the hand-back ends with the question naming 2, runs no gh issue create, and the state section carries the ask-once line', { options: { autoEval: false, redact: 'globex', wakeOnVerdict: true } }, async ($, on) => {
    nextIssue = 40
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    await handBack($, w)
    const rows = w.appended.map(a => a.text)
    expect(rows[rows.length - 1]?.split('\n').pop()).toBe(QUESTION)
    expect(w.runs.filter(r => isCreate(r.argv))).toHaveLength(0)
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.find(s => s.id === 'chassis-delegation:state')
    expect(section?.text).toContain('Ask the person once whether to post them')
    expect(section?.text).toContain("never post without an explicit yes in the person's own words")
    expect(w.submitted.map(s => s.text)).toContain(QUESTION)
  })

  test('MOD-62: the question lands in an open turn and a main-loop step follows: no wake is submitted', { options: { autoEval: false, redact: 'globex', wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    const mainEnd = () => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer' }) as never
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    expect(w.appended.map(a => a.text).join('\n')).toContain(QUESTION)
    for await (const chunk of $.turn.step(stepInput(undefined))) void chunk
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: row read in the turn'))).toBe(true)
  })

  test('MOD-62: the same question with no later main-loop step is submitted at the turn\'s end', { options: { autoEval: false, redact: 'globex', wakeOnVerdict: true } }, async ($, on) => {
    const w2 = world(on, { listAgents: true, files: files(two), run: ghRun })
    const mainEnd = () => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer' }) as never
    await $.session.start(sessionStart)
    await $.command.run(delegation('debrief'))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    await $.turn.complete(mainEnd())
    expect(w2.submitted.map(s => s.text)).toContain(QUESTION)
  })

  test('ask with wakeOnVerdict off: the question is printed and nothing is submitted', { options: { autoEval: false, redact: 'globex', wakeOnVerdict: false } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    await handBack($, w)
    expect(shown(w)).toContain(QUESTION)
    expect(w.submitted).toEqual([])
  })

  test('host findings and proposals are not in the question; a covered finding is not counted', { options: { autoEval: false, redact: 'globex' } }, async ($, on) => {
    const host = one({ surface: 'the host app', title: 'Host thing broke' })
    const covered = JSON.stringify([{ number: 4, title: 'Accepted row stayed owed again', body: '**Surface:** /delegation accept' }])
    const w = world(on, { listAgents: true, files: files([...two, host], { proposed_harness_changes: [{ target: 'CLAUDE.md', proposed_diff_summary: 'x' }] }), run: (argv: string[]) => (argv[0] === 'gh' && argv[2] === 'list' ? { exitCode: 0, stdout: covered } : ghRun(argv)) })
    await handBack($, w)
    const rows = w.appended.map(a => a.text)
    expect(rows[rows.length - 1]).toContain('post 1 findings to owner/mod?')
  })

  test('auto: exactly two gh issue create calls, both printed, the numbers recorded; no question', { options: { autoEval: false, redact: 'globex', postFindings: 'auto' } }, async ($, on) => {
    nextIssue = 40
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    await handBack($, w)
    expect(w.runs.filter(r => isCreate(r.argv))).toHaveLength(2)
    const text = shown(w)
    expect(text).toContain('#40 https://github.com/owner/mod/issues/40')
    expect(text).toContain('#41 https://github.com/owner/mod/issues/41')
    expect(text).not.toContain('say yes to post them all')
    expect(JSON.parse(w.files.get(FINDINGS) ?? '{}').findings.map((f: { issue?: number }) => f.issue)).toEqual([40, 41])
  })

  test('auto posts at most 5 per debrief and says how many stay drafts', { options: { autoEval: false, redact: 'globex', postFindings: 'auto' } }, async ($, on) => {
    nextIssue = 40
    const seven = Array.from({ length: 7 }, (_, i) => one({ surface: '/delegation accept', title: `Distinct finding number ${i} alpha${i}` }))
    const w = world(on, { listAgents: true, files: files(seven), run: ghRun })
    await handBack($, w)
    expect(w.runs.filter(r => isCreate(r.argv))).toHaveLength(5)
    expect(shown(w)).toContain('2 more stay drafts')
  })

  test('auto with the redact list empty posts nothing, prints the set-redact line and asks', { options: { autoEval: false, postFindings: 'auto' } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    await handBack($, w)
    expect(w.runs.filter(r => isCreate(r.argv))).toHaveLength(0)
    expect(shown(w)).toContain('/delegation config redact')
    expect(shown(w)).toContain(QUESTION)
  })

  test('off: no question, no posting, the drafts are still listed', { options: { autoEval: false, redact: 'globex', postFindings: 'off' } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: files(two), run: ghRun })
    await handBack($, w)
    expect(w.runs.filter(r => isCreate(r.argv))).toHaveLength(0)
    expect(shown(w)).toContain(`drafts: ${FINDINGS}`)
    expect(shown(w)).not.toContain('say yes to post them all')
    expect(w.submitted).toEqual([])
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.find(s => s.id === 'chassis-delegation:state')
    expect(section?.text ?? '').not.toContain('Ask the person once')
  })

  test('/delegation prints the post findings line beside the issues line', { options: { autoEval: false, postFindings: 'auto' } }, async ($, on) => {
    world(on, { files: { [REPO_FILE]: '{"issueRepo":"owner/mod"}' } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation(''))).text)
    expect(out).toContain('post findings: auto → owner/mod')
    expect(out.indexOf('issues: owner/mod')).toBeLessThan(out.indexOf('post findings: auto'))
  })
})

describe('MOD-35: a merged task is not woken for, an accept is on the ledger, a verdict row is written once', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const ledgerOf = (w: { files: Map<string, string> }) =>
    (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  /** The verifier's repo, with origin/main answering the ancestor check: exit 0 merged, 1 not. */
  const runWith = (ancestor: number) => {
    const base = nativeRun({ gate: 0 })
    return (argv: string[]): RunAnswer | undefined =>
      argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? (argv.at(-1) === 'origin/main' ? { exitCode: ancestor, stdout: '' } : { exitCode: 0, stdout: '' }) : base(argv)
  }
  const ran = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never

  test('a consistent hand-back whose sha is on origin/main submits no wake and logs the skip', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(0), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 already merged'))).toBe(true)
    expect(delivered(w)).toContain('chassis-delegation: T-4 attempt 1/3 consistent') // the row is still posted
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(1)
    expect(ledgerOf(w).find(r => r.kind === 'accept')).toMatchObject({ task: 'T-4', attempt: 1, how: 'merged' })
  })

  test('a consistent hand-back not yet merged submits its wake as today', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toHaveLength(1)
    expect(w.debugLogs.some(l => l.includes('wake skipped'))).toBe(false)
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(0)
  })

  test('MOD-60: a refuted hand-back whose sha is only an ancestor of origin/main (no work committed) is still woken for, and writes no accept row', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const base = nativeRun() // gate red: the claim gate=pass is refuted
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 0, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('refuted')
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(0)
  })

  test('MOD-60: a refuted hand-back whose card on origin/main reads merged submits no wake, logs the skip and still posts its row', { options: { ...GM } }, async ($, on) => {
    const base = nativeRun() // gate red: the claim gate=pass is refuted
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[3] === 'ls-tree') return { exitCode: 0, stdout: 'agents/tasks/T-4-the-card.md\n' }
      if (argv[3] === 'show') return { exitCode: 0, stdout: '---\nstatus: merged\n---\nbody' }
      return base(argv)
    }
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 already merged'))).toBe(true)
    expect(delivered(w)).toContain('refuted')
    expect(ledgerOf(w).some(r => r.verdict === 'refuted')).toBe(true)
  })

  test('MOD-60: a refuted hand-back not merged submits its wake', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const base = nativeRun()
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('refuted')
  })

  test('MOD-60: a non-consistent hand-back for a task accepted by hand submits no wake', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const base = nativeRun() // gate red: refuted
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toHaveLength(1) // not merged, not accepted yet: woken as today
    await $.session.start(sessionStart)
    await $.command.run(delegationCmd('accept T-4 by hand'))
    w.submitted.length = 0
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([])
  })

  const mainEnd = () => ({ answer: 'ok', durationMs: 10, isAborted: false, turnId: 'turn-main', reason: 'answer' }) as never

  test('MOD-42: a consistent wake held while the brain\'s turn is open is dropped when the task is merged by the turn\'s end', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    let ancestor = 1
    const base = nativeRun({ gate: 0 })
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? (argv.at(-1) === 'origin/main' ? { exitCode: ancestor, stdout: '' } : { exitCode: 0, stdout: '' }) : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([]) // held: the brain's turn is open
    ancestor = 0 // the brain reads the verdict and merges in this turn
    await $.turn.complete(mainEnd())
    expect(w.submitted).toEqual([])
    expect(w.debugLogs.some(l => l.includes('wake skipped: T-4 merged before delivery'))).toBe(true)
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(1)
  })

  test('MOD-42: a consistent wake still unmerged at the turn\'s end is submitted then; a refuted one is never dropped', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([])
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('next=accept')
  })

  test('MOD-42/MOD-60: a refuted wake is still delivered at the turn\'s end when only the sha reads as merged', { options: { ...GM, wakeOnVerdict: true } }, async ($, on) => {
    const base = nativeRun()
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 0, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.start({ text: '', turnId: 'turn-main' } as never)
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(w.submitted).toEqual([])
    await $.turn.complete(mainEnd())
    expect(w.submitted).toHaveLength(1)
    expect(w.submitted[0]?.text).toContain('refuted')
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(0)
  })

  test('/delegation accept appends one accept row with how accepted, and a second accept appends none', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await $.session.start(sessionStart)
    // MOD-94: the spawn's own row is on the ledger too, and the accept reads past it
    expect(ledgerOf(w).filter(r => r.event === 'spawn')).toHaveLength(1)
    await $.command.run(delegationCmd('accept T-4 looks right'))
    const accepts = () => ledgerOf(w).filter(r => r.kind === 'accept')
    expect(accepts()).toHaveLength(1)
    expect(accepts()[0]).toMatchObject({ kind: 'accept', task: 'T-4', attempt: 1, sha: expect.any(String), how: 'accepted' })
    expect(typeof accepts()[0]?.at).toBe('number')
    await $.command.run(delegationCmd('accept T-4'))
    expect(accepts()).toHaveLength(1)
  })

  test('a hand-back delivered twice (notification and tool result) leaves exactly one verdict row on the ledger', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n' + REPORT, 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}.` })
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(ledgerOf(w).filter(r => r.verdict === 'consistent')).toHaveLength(1)
  })

  test('the write guard: the same (task, attempt, sha, verdict) is never appended twice, even from a ledger that already holds it', { options: { ...GM } }, async ($, on) => {
    const row = { task: 'T-4', subtask: 'main', attempt: 1, kind: 'spawn', sha: '1234abcd', verdict: 'consistent', next: 'accept' }
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}/.delegation/ledger.jsonl`]: JSON.stringify(row) + '\n' }, run: runWith(1), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    expect(ledgerOf(w).filter(r => r.verdict === 'consistent')).toHaveLength(1)
  })

  test('the brain\'s `gh pr merge agent/frontend/T-4 --rebase` appends an accept row with how merged, once', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    on('tool.call', { tool: 'Bash' }, ran)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge agent/frontend/T-4 --rebase' } as never)
    const accepts = () => ledgerOf(w).filter(r => r.kind === 'accept')
    expect(accepts()).toHaveLength(1)
    expect(accepts()[0]).toMatchObject({ task: 'T-4', attempt: 1, how: 'merged' })
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge agent/frontend/T-4 --rebase' } as never)
    expect(accepts()).toHaveLength(1)
  })

  test('a Bash command that is not a merge of a recorded task appends nothing', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: runWith(1), agentId: 'agent-4' })
    on('tool.call', { tool: 'Bash' }, ran)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT))
    await $.tool.call({ tool: 'Bash', command: 'gh pr merge agent/frontend/NOPE-9 --rebase' } as never)
    await $.tool.call({ tool: 'Bash', command: 'gh pr view agent/frontend/T-4' } as never)
    expect(ledgerOf(w).filter(r => r.kind === 'accept')).toHaveLength(0)
  })
})

describe('MOD-44: the brain delegates into another local repo (repo set to an absolute path)', () => {
  const CARD_TOOL = 'mcp__chassis-delegation__card'
  const DISPATCH = 'mcp__chassis-delegation__dispatch'
  const OTHER = '/other'
  const WT = `${OTHER}-T-1`
  const CARDS = `${ROOT}/.delegation/cards/other`
  const CARD_NAME = 'T-1-the-first-version.md'
  const CARD = [
    '---',
    'id: T-1',
    'title: The first version',
    'domain: ops',
    'tier: standard',
    'status: queued',
    `repo: ${OTHER}`,
    'scope: [src/**, tests/**]',
    'forbid: []',
    'red_test: none',
    'gate: test',
    'budget: 2-attempts',
    '---',
    '## Why',
    '',
    'A new sibling repo with its own gates.',
    '',
  ].join('\n')
  const BRIEFS = { briefDir: `${SCRATCH}/briefs` }
  const BRIEF = `${SCRATCH}/briefs/T-1.brief.md`
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const BRANCH = 'agent/ops/T-1'
  // /other: a checkout (a .git folder), a package.json with a test script, no .chassis-delegation.json
  const otherFiles = (): Record<string, string> => ({ [`${OTHER}/package.json`]: '{"scripts":{"test":"node --test"}}' })
  const otherDirs = (): Record<string, string[]> => ({ [OTHER]: ['package.json'], [`${OTHER}/.git`]: [], [`${ROOT}/agents/tasks`]: ['README.md'], [CARDS]: [] })
  const given = {
    title: 'The first version',
    why: 'A new sibling repo that needs its first version.',
    doneWhen: ['npm test passes'],
    scope: ['src/**', 'tests/**'],
    redTest: 'npm test',
    repo: OTHER,
  }
  const asked = (w: { files: Map<string, string> }, prefix: string) => [...w.files.keys()].filter(k => k.startsWith(prefix))
  // the worker's repo answered from memory: a branch of /other, a delta of src/a.ts, the gate green
  const otherRun = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npm') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'fetch' || sub[0] === 'worktree') return { exitCode: 0, stdout: '' }
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'A\tsrc/a.ts\n' : 'src/a.ts\n' }
    if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
    return undefined
  }

  test('the card tool with repo /other writes the card under the session .delegation/cards/other/, and its dry run names the detected gate', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: otherFiles(), dirs: otherDirs(), store: { 'delegation.agentTypes': ['general-purpose'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...given } as never))
    const path = `${CARDS}/OPS-1-the-first-version.md`
    expect(w.files.get(path)).toContain('id: OPS-1\n')
    expect(w.files.get(path)).toContain(`repo: ${OTHER}\n`)
    expect(out).toContain(`wrote ${path}`)
    expect(out).toContain('repo: /other (config: none, gate: npm test)')
    expect(out).toContain(` gate=test repo=${OTHER} `)
    // the session's own board stays clean; the dry run runs no git and spawns nothing
    expect(asked(w, `${ROOT}/agents/tasks/`)).toEqual([])
    expect(w.files.get(`${SCRATCH}/briefs/OPS-1.brief.md`) ?? '').toContain(`repo=${OTHER}`)
    expect(argvs(w).filter(a => a[0] === 'git' && a[3] !== 'rev-parse')).toEqual([])
    expect(w.spawns).toHaveLength(0)
    // a second card takes the next id: ids do not collide with the session's own board
    const again = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, title: 'Another thing' } as never))
    expect(again).toContain(`wrote ${CARDS}/OPS-2-another-thing.md`)
  })

  test('a repo with its own .chassis-delegation.json supplies the gate map and the card folder: the card goes there', { options: BRIEFS }, async ($, on) => {
    const w = world(on, {
      files: { ...otherFiles(), [`${OTHER}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { build: 'npm run build', test: 'npm test' }, cardDir: 'docs/cards', domains: ['web'] }) },
      dirs: { ...otherDirs(), [`${OTHER}/docs/cards`]: ['README.md'] },
      store: { 'delegation.agentTypes': ['general-purpose'] },
    })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, gate: 'build' } as never))
    expect(out).toContain('repo: /other (config: its own, gate: npm run build)')
    expect(asked(w, `${OTHER}/docs/cards/WEB-1`)).toHaveLength(1)
    expect(asked(w, CARDS)).toEqual([])
    expect(out).toContain(' gate=build repo=/other ')
    // its domains name the branch it may be cut on
    expect(resultText(await $.tool.call({ tool: CARD_TOOL, ...given, domain: 'ops' } as never))).toContain('domain ops is not one of web')
  })

  test('repo as a relative path, the session root, a folder that is no checkout: refused in one line, nothing written', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: { ...otherFiles(), [`${CARDS}/${CARD_NAME}`]: CARD }, dirs: { ...otherDirs(), [CARDS]: [CARD_NAME], [ROOT]: [], [`${ROOT}/.git`]: [], '/plain': [] } })
    await $.session.start(sessionStart)
    const before = w.files.size
    const rel = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: '../other' } as never))
    expect(rel).toBe('card refused: repo ../other is not an absolute path; give the folder of a git checkout, e.g. /Users/you/other (or worktree, here, none)')
    expect(resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: 'other' } as never))).toContain('is not an absolute path')
    const same = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: ROOT } as never))
    expect(same).toBe(`card refused: repo ${ROOT} is the session's own repo; leave repo unset to delegate here`)
    expect(resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: `${ROOT}/` } as never))).toContain("is the session's own repo")
    const plain = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: '/plain' } as never))
    expect(plain).toBe('card refused: repo /plain is not a git checkout (no .git in it)')
    expect(resultText(await $.tool.call({ tool: CARD_TOOL, ...given, repo: '/nowhere' } as never))).toContain('is not a git checkout')
    expect(w.files.size).toBe(before)
    // dispatch says the same, and runs nothing
    for (const [repo, why] of [['../other', 'is not an absolute path'], [ROOT, "is the session's own repo"], ['/plain', 'is not a git checkout']] as const) {
      const text = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo } as never))
      expect(text).toContain(`refused repo ${repo}`)
      expect(text).toContain(why)
    }
    const viaCommand = await $.command.run(commandInput('T-1 --repo ../other'))
    expect(String(viaCommand.text)).toContain('refused repo ../other')
    expect(argvs(w).filter(a => a[0] === 'git' && a[3] !== 'rev-parse')).toEqual([])
    expect(w.spawns).toHaveLength(0)
  })

  test('dispatch with repo /other fetches in /other, cuts /other-T-1 from its origin/main, and the spawn block names the brief', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: { ...otherFiles(), [`${CARDS}/${CARD_NAME}`]: CARD }, dirs: { ...otherDirs(), [CARDS]: [CARD_NAME] }, run: otherRun, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    const text = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', OTHER, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', OTHER, 'worktree', 'add', '-q', '-b', BRANCH, WT, 'origin/main'],
    ])
    expect(w.runs.every(r => r.cwd === undefined || r.cwd === OTHER || r.cwd === ROOT)).toBe(true)
    const header = (w.files.get(BRIEF) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(` gate=test repo=${OTHER} `)
    expect(w.files.get(BRIEF)).toContain(`Work in ${WT} on ${BRANCH}; card ${CARDS}/${CARD_NAME}.`)
    expect(text).toContain(`3. worktree ${WT} on ${BRANCH} from origin/main`)
    expect(spawnCallOf(text)).toMatchObject({ prompt: `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.` })
    expect(w.spawns).toHaveLength(0)
  })

  test('the card the card tool wrote dispatches by its id alone (dispatch: true, then the dispatch tool with no repo)', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: otherFiles(), dirs: otherDirs(), run: otherRun, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: CARD_TOOL, ...given, dispatch: true } as never))
    expect(argvs(w).filter(a => a[0] === 'git' && a[3] !== 'rev-parse').map(a => a.slice(0, 5))).toEqual([
      ['git', '-C', OTHER, 'fetch', '-q'],
      ['git', '-C', OTHER, 'worktree', 'add'],
    ])
    expect(spawnCallOf(out)).toMatchObject({ description: 'OPS-1 standard sonnet' })
    // the same task again, named by id only: the card is found where the tool wrote it, in /other's worktree
    const again = resultText(await $.tool.call({ tool: DISPATCH, task: 'OPS-1', dryRun: true } as never))
    expect(again).toContain(` gate=test repo=${OTHER} `)
  })

  test('a hand-back from that worker is verified in /other-T-1 against /other origin/main and its gate; the records stay the session\'s', { options: { ...BRIEFS, verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { ...otherFiles(), [`${CARDS}/${CARD_NAME}`]: CARD }, dirs: { ...otherDirs(), [CARDS]: [CARD_NAME], [WT]: [] }, run: otherRun, agentId: 'agent-4', listAgents: true, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never))
    await brainSpawn($, out)
    expect(w.spawns[0]).toMatchObject({ cwd: WT })
    // the mod's running list names the repo beside the task
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''
    expect(section).toContain('running: T-1 [other]')
    const before = w.runs.length
    const REPORT = `[[report v=1 task=T-1 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=src/a.ts]]`
    await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
    const verifying = w.runs.slice(before).map(r => r.argv)
    // every git read of the verify is in the worktree; the merged check asks /other's origin/main; none is in the session root
    expect(verifying.filter(a => a[0] === 'git').filter(a => a[2] !== WT && a[2] !== OTHER)).toEqual([])
    expect(verifying.filter(a => a[0] === 'git' && a[2] === OTHER).map(a => a.slice(3, 5))).toEqual([['worktree', 'lock'], ['worktree', 'unlock'], ['merge-base', '--is-ancestor']])
    expect(verifying.some(a => a[0] === 'git' && a.includes('origin/main'))).toBe(true)
    // the gate is /other's own detected gate, run in /other-T-1
    const gate = w.runs.slice(before).find(r => r.argv[0] === 'npm')
    expect(gate?.argv).toEqual(['npm', 'test'])
    expect(gate?.cwd).toBe(WT)
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    expect(row).toContain('claim files: held — files= matches the sha delta exactly')
    // the attempt record's root is that repo, under that repo's key (MOD-97); the ledger row goes to the session
    expect(records(w, 'T-1')).toEqual([])
    expect(records(w, `T-1@${OTHER}`)[0]).toMatchObject({ task: 'T-1', attempt: 1, verdict: 'consistent', root: OTHER })
    expect(w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').toContain('"task":"T-1"')
    expect(w.files.has(`${OTHER}/.delegation/ledger.jsonl`)).toBe(false)
  })

  test('the id alone finds a card on one of the session\'s boards for another repo when nothing remembered it, and the card\'s own repo: is the one used', { options: BRIEFS }, async ($, on) => {
    const w = world(on, { files: { ...otherFiles(), [`${CARDS}/${CARD_NAME}`]: CARD }, dirs: { ...otherDirs(), [CARDS]: [CARD_NAME], [`${ROOT}/.delegation/cards`]: ['other'], '/third': [], '/third/.git': [] }, run: otherRun, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('T-1'))).text)
    expect(out).toContain(`1. card ${CARDS}/${CARD_NAME} (status queued, domain ops)`)
    expect(out).toContain('repo: /other (config: none, gate: npm test)')
    expect(argvs(w).filter(a => a[0] === 'git').map(a => a.slice(0, 5))).toEqual([
      ['git', '-C', OTHER, 'fetch', '-q'],
      ['git', '-C', OTHER, 'worktree', 'add'],
    ])
    // a dispatch that names another folder looks for the card on that folder's board, and says where
    expect(resultText(await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: '/third', dryRun: true } as never))).toContain(`no card folder at ${ROOT}/.delegation/cards/third`)
  })

  test('--verify on a task for another repo judges /other-T-1 at the sha, with /other\'s gate, and spawns nothing', { options: { ...BRIEFS, verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { ...otherFiles(), [`${CARDS}/${CARD_NAME}`]: CARD }, dirs: { ...otherDirs(), [CARDS]: [CARD_NAME], [WT]: [] }, run: otherRun, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
    await $.session.start(sessionStart)
    await $.tool.call({ tool: DISPATCH, task: 'T-1', repo: OTHER } as never)
    const before = w.runs.length
    const out = String((await $.command.run(commandInput(`T-1 --verify ${HEAD}`))).text)
    expect(out).toContain(`/dispatch T-1 --verify ${HEAD}: no spawn — the verifier ran on worktree ${WT} at ${HEAD.slice(0, 7)} (base origin/main)`)
    expect(out).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    const after = w.runs.slice(before).map(r => r.argv)
    expect(after.filter(a => a[0] === 'git').filter(a => a[2] === ROOT)).toEqual([])
    expect(w.runs.slice(before).find(r => r.argv[0] === 'npm')?.cwd).toBe(WT)
    expect(w.spawns).toHaveLength(0)
    expect(records(w, `T-1@${OTHER}`).map(x => [x.attempt, x.kind, x.verdict, x.root])).toEqual([[1, 'verify', 'consistent', OTHER]])
  })

  test('the git guard refuses a commit or a push on /other main exactly as on the session root', async ($, on) => {
    const branchOf = (argv: string[]) => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: argv[2] === OTHER ? 'main\n' : 'agent/ops/T-1\n' } : undefined)
    const w = world(on, { run: branchOf })
    const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
    on('tool.call', { tool: 'Bash' }, passed)
    expect((await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} commit -m x` } as never)).deny).toBe('chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)')
    expect((await $.tool.call({ tool: 'Bash', command: `cd ${OTHER} && git push` } as never)).deny).toContain('no push on main')
    expect((await $.tool.call({ tool: 'Bash', command: `git -C ${WT} commit -m x` } as never)).deny).toBeUndefined()
    expect((await $.tool.call({ tool: 'Bash', command: `git -C ${OTHER} push origin main` } as never)).deny).toContain('no push on main')
    expect(w.runs.length).toBeGreaterThan(0)
  })
})

describe('MOD-89 (#157, #159): the store stays under the host cap', () => {
  const DAY = 24 * 60 * 60 * 1000
  const status = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never
  const spawnRec = (key: string, task: string, at: number, extra: Record<string, unknown> = {}) => ({ key, task, subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', description: task, subagentType: 'general-purpose', agentId: `ag-${key}`, at, ...extra })
  const attemptRec = (task: string, key: string, at: number, verdict: string) => [{ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict, at, toolUseId: key, agentId: `ag-${key}` }]

  test('session.start prunes a closed task older than 7 days through $.store.delete, keeps a running one as old and a fresh one, and says so once', async ($, on) => {
    const old = NOW - 8 * DAY
    const w = world(on, {
      store: {
        'delegation.tasks.T-OLD': attemptRec('T-OLD', 'k-old', old, 'consistent'),
        'delegation.spawn.k-old': spawnRec('k-old', 'T-OLD', old, { verdictAttempt: 1 }),
        'delegation.agent.ag-k-old': 'k-old',
        'delegation.tasks.T-RUN': attemptRec('T-RUN', 'k-run', old, 'consistent'),
        'delegation.spawn.k-run': spawnRec('k-run', 'T-RUN', old, { attempt: 2 }),
        'delegation.agent.ag-k-run': 'k-run',
        'delegation.tasks.T-NEW': attemptRec('T-NEW', 'k-new', NOW - DAY, 'consistent'),
        'delegation.recent.sess-0': [{ task: 'T-OLD', attempt: 1, verdict: 'consistent', line: 'x', at: old }],
      },
    })
    w.agents.push({ id: 'ag-k-run', type: 'general-purpose', description: 'T-RUN', status: 'running' })
    await $.session.start(sessionStart)
    // MOD-117: the seeded bare keys moved to this root's key at the start, and the prune walked those
    expect(w.store.has('delegation.tasks.T-OLD')).toBe(false)
    expect(w.store.has(`delegation.tasks.T-OLD@${ROOT}`)).toBe(false)
    expect(w.store.has('delegation.spawn.k-old')).toBe(false)
    expect(w.store.has('delegation.agent.ag-k-old')).toBe(false)
    expect(w.store.has('delegation.spawn.k-run')).toBe(true)
    expect(w.store.has(`delegation.tasks.T-RUN@${ROOT}`)).toBe(true)
    expect(w.store.has(`delegation.tasks.T-NEW@${ROOT}`)).toBe(true)
    expect(w.store.has('delegation.recent.sess-0')).toBe(true)
    const line = /store: pruned 3 records \(\d+\.\d\d MiB to \d+\.\d\d MiB of 4 MiB\)/
    expect(delivered(w)).toMatch(line)
    expect(w.debugLogs.some(l => line.test(l))).toBe(true)
    // nothing left to prune: a second start says nothing more
    const rows = w.appended.length
    await $.session.start(sessionStart)
    expect(w.appended.slice(rows).some(a => a.text.startsWith('store: pruned'))).toBe(false)
  })

  test('MOD-186: pruning a closed task\'s outside record empties the listing file it names, and only under .delegation/outside/', async ($, on) => {
    const old = NOW - 8 * DAY
    const file = `${ROOT}/.delegation/outside/T-OLD.json`
    const w = world(on, {
      files: { [file]: '[{"root":"/x","entries":[]}]', '/elsewhere/keep.json': 'keep' },
      store: {
        'delegation.tasks.T-OLD': attemptRec('T-OLD', 'k-old', old, 'consistent'),
        'delegation.spawn.k-old': spawnRec('k-old', 'T-OLD', old, { verdictAttempt: 1 }),
        'delegation.outside.T-OLD': { at: old, briefPath: '/b', file, files: 1 },
        'delegation.tasks.T-ODD': attemptRec('T-ODD', 'k-odd', old, 'consistent'),
        'delegation.spawn.k-odd': spawnRec('k-odd', 'T-ODD', old, { verdictAttempt: 1 }),
        'delegation.outside.T-ODD': { at: old, briefPath: '/b', file: '/elsewhere/keep.json', files: 1 },
      },
    })
    await $.session.start(sessionStart)
    expect([...w.store.keys()].some(k => k.startsWith('delegation.outside.'))).toBe(false)
    expect(w.files.get(file)).toBe('')
    expect(w.files.get('/elsewhere/keep.json')).toBe('keep')
  })

  test('a spawn record no longer keeps the prompt text', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard]]\nDo it, at length.' }))
    const rec = w.store.get('delegation.spawn.toolu_01ABCDEFGH') as Record<string, unknown>
    expect(rec).toMatchObject({ task: 'T-1', description: 'task' })
    expect('prompt' in rec).toBe(false)
  })

  test('a refused $.store.set: the first makes a toast and one row, later ones count; /delegation shows the size and the count', async ($, on) => {
    const w = world(on, { skip: ['store.set'] })
    on('store.set', (_$, e) => {
      if (e.key.startsWith('delegation.spawn.')) return { deny: 'store over 4 MiB' } as never // the host refuses: the store would pass 4 MiB
      w.store.set(e.key, JSON.parse(JSON.stringify(e.value)))
      return { value: undefined } as never
    })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard]]\nDo it.' }))
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-2 subtask=main purpose=build tier=standard]]\nDo it.', tool_use_id: 'toolu_02ABCDEFGH' }))
    const said = delivered(w).split('\n').filter(l => l.startsWith('store write failed: '))
    expect(said.length).toBe(1)
    expect(said[0]).toContain('store write failed: delegation.spawn.toolu_01ABCDEFGH (')
    expect(said[0]).toContain('store over 4 MiB')
    expect(said[0]).toContain('); new workers may have no verdict until the store is pruned')
    expect(w.toasts.filter(t => t.includes('store write failed: ')).length).toBe(1)
    const text = String((await $.command.run(status)).text)
    expect(text).toMatch(/^store: \d+\.\d\d MiB of 4 MiB$/m)
    expect(text).toContain('store: 2 writes refused this session (last delegation.spawn.toolu_02ABCDEFGH)')
  })

  test('/delegation shows the store size and no refused line when every write went in', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    const text = String((await $.command.run(status)).text)
    expect(text).toMatch(/^store: \d+\.\d\d MiB of 4 MiB$/m)
    expect(text).not.toContain('writes refused')
  })
})

describe('MOD-92 (#168): concurrent agent.spawn events are decided one at a time, inside the budget, and an abort stops the decision', () => {
  const brief = (task: string, subtask = 'main') => `[[brief v=1 task=${task} subtask=${subtask} purpose=build tier=standard]]\nDo it.`
  const BRIEF_FILE = `${SCRATCH}/briefs/T-3.brief.md`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const workersOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.workers') ?? []) as Record<string, unknown>[]

  test('three spawns in one message with two workers live and maxWorkers 2: each is decided once, queued in the order made', { options: { maxWorkers: 2 } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: { [BRIEF_FILE]: brief('T-3') } })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    // the first names its brief file (one read more than the others): it is still decided first
    const res = await Promise.all([
      $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF_FILE}. Read it whole.`, tool_use_id: 'toolu_C0000003' })),
      $.agent.spawn(spawnInput({ prompt: brief('T-4'), tool_use_id: 'toolu_D0000004' })),
      $.agent.spawn(spawnInput({ prompt: brief('T-5'), tool_use_id: 'toolu_E0000005' })),
    ])
    expect(w.spawns).toHaveLength(2)
    expect(res.map(r => r.deny?.split(' — ')[0])).toEqual(['queued: T-3', 'queued: T-4', 'queued: T-5'])
    expect(queueOf(w).map(q => q.task)).toEqual(['T-3', 'T-4', 'T-5'])
    expect(res[2]?.deny).toContain('2 live: T-1, T-2; 3 queued: T-3, T-4, T-5')
  })

  test('three spawns at once with maxWorkers 2 and no worker live: the first two made start, the third queues; no record is lost and no attempt number is shared', { options: { maxWorkers: 2 } }, async ($, on) => {
    const w = world(on, { listAgents: true, files: { [BRIEF_FILE]: brief('T-3') } })
    const res = await Promise.all([
      $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF_FILE}. Read it whole.`, tool_use_id: 'toolu_C0000003' })),
      $.agent.spawn(spawnInput({ prompt: brief('T-3', 'b'), tool_use_id: 'toolu_D0000004' })),
      $.agent.spawn(spawnInput({ prompt: brief('T-5'), tool_use_id: 'toolu_E0000005' })),
    ])
    expect(res.map(r => r.deny === undefined)).toEqual([true, true, false])
    expect(res[2]?.deny).toMatch(/^queued: T-5 — /)
    expect(w.spawns).toHaveLength(2)
    // both subtasks of T-3 are on its record, attempt 1 each, each its own agent
    expect(records(w, 'T-3').map(r => [r.subtask, r.attempt, r.agentId])).toEqual([
      ['main', 1, res[0]?.agentId],
      ['b', 1, res[1]?.agentId],
    ])
    expect(res[0]?.agentId).not.toBe(res[1]?.agentId)
    expect(workersOf(w).map(x => [x.task, x.subtask, x.attempt])).toEqual([
      ['T-3', 'main', 1],
      ['T-3', 'b', 1],
    ])
    expect(queueOf(w).map(q => q.task)).toEqual(['T-5'])
  })

  test('the signal aborted mid-decision: the hook stops there; it starts nothing, records nothing, and the next spawn is decided at once', { plugins: [{ name: 'impatient', tier: 'prepend', register(on) {
    // a hook above that settles first: it gives up on the spawn after one (mock) second
    on('agent.spawn', ($, e, next) =>
      new Promise(resolve => {
        const late = $.clock.after(1000, () => resolve({ deny: 'impatient: gave up' }))
        next(e).then(
          r => (late.cancel(), resolve(r)),
          err => (late.cancel(), resolve({ deny: String(err) })),
        )
      }),
    )
  } }] }, async ($, on) => {
    let hold = true
    const w = world(on, { listAgents: true, skip: ['agent.list'] })
    // $.agent.list answers late while `hold`: the decision is in flight at its slot check
    on('agent.list', async () => {
      if (hold) await w.clock.sleep(20_000)
      return { value: w.agents.map(a => ({ ...a })) } as never
    })
    const first = $.agent.spawn(spawnInput({ prompt: brief('T-8'), tool_use_id: 'toolu_F0000008' }))
    await w.clock.settle()
    await w.clock.advance(1000)
    expect((await first).deny).toBe('impatient: gave up')
    hold = false
    // the aborted decision holds no slot, no lock and no turn: the next spawn of the task starts with no clock moved
    const second = $.agent.spawn(spawnInput({ prompt: brief('T-8'), tool_use_id: 'toolu_G0000009' }))
    await w.clock.settle()
    expect(w.spawns).toHaveLength(1)
    expect((await second).deny).toBeUndefined()
    // the late answer comes: the aborted decision does nothing with it
    await w.clock.advance(20_000)
    await w.clock.settle()
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'T-8').map(r => [r.attempt, r.toolUseId])).toEqual([[1, 'toolu_G0000009']])
  })
})

// MOD-171: /delegation merge prints each amend the brief carried
describe('MOD-171: merge lists the amends the brief carried', () => {
  const ID = 'MOD-1'
  const WT = `${ROOT}-${ID}`
  const CARD_NAME = `${ID}-a-thing.md`
  const HEAD = 'def5678def5678def5678def5678def5678def56'
  const CARD = ['---', `id: ${ID}`, 'title: The thing works', 'domain: mod', 'tier: standard', 'status: queued', 'scope: [hooks/register.ts]', 'gate: validate', '---', '## Why', '', 'Because.', '', '## Done when', '', '- The thing works.', ''].join('\n')
  const BRIEF_PATH = `${ROOT}/.delegation/briefs/${ID}.brief.md`
  const BRIEF = [`[[brief v=1 task=${ID} subtask=main purpose=build tier=standard model=sonnet scope=hooks/register.ts]]`, '', 'body', '[[amend v=1 scope+=docs/a.md reason=the doc needed a line]]', '[[amend v=1 scope+=tests/b.ts forbid-=tests/** reason=a test file]]', ''].join('\n')
  const PORCELAIN = [`worktree ${ROOT}`, 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '', `worktree ${WT}`, `HEAD ${HEAD}`, `branch refs/heads/agent/mod/${ID}`, ''].join('\n')
  const answers = (argv: string[]): RunAnswer | undefined => {
    const j = argv.join(' ')
    if (j === `git -C ${ROOT} worktree list --porcelain`) return { exitCode: 0, stdout: PORCELAIN }
    if (j === `git -C ${ROOT} check-ignore -q -- docs/cards/${CARD_NAME}`) return { exitCode: 1, stdout: '' }
    if (j === `git -C ${ROOT} rev-parse --abbrev-ref HEAD`) return { exitCode: 0, stdout: 'main\n' }
    if (j === `git -C ${ROOT} status --porcelain`) return { exitCode: 0, stdout: `?? docs/cards/${CARD_NAME}\n` }
    if (j === `git -C ${ROOT} remote get-url origin`) return { exitCode: 0, stdout: 'git@github.com:acme/acme-app.git\n' }
    if (j === `git -C ${WT} rev-parse HEAD`) return { exitCode: 0, stdout: `${HEAD}\n` }
    return undefined
  }
  const setup = (on: Parameters<typeof world>[0], brief?: string) =>
    world(on, {
      files: {
        [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: { validate: 'claude plugin validate {worktree}' }, domains: ['mod'], cardDir: 'docs/cards' }),
        [`${ROOT}/docs/cards/${CARD_NAME}`]: CARD,
        [`${ROOT}/.delegation/ledger.jsonl`]: JSON.stringify({ task: ID, subtask: 'main', attempt: 1, kind: 'spawn', verdict: 'consistent', sha: 'abc1234', next: 'accept' }) + '\n',
        ...(brief ? { [BRIEF_PATH]: brief } : {}),
      },
      dirs: { [`${ROOT}/docs/cards`]: [CARD_NAME] },
      store: { [`delegation.tasks.${ID}`]: [{ task: ID, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: NOW - 60_000, sha: 'abc1234', root: ROOT, sessionId: 'sess-1' }] },
      run: answers,
    })
  const mergeIn = (args: string) => ({ command: 'delegation', args: `merge ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

  test('red: a brief with two amend blocks prints one line each, in order, before the success line; pr.md gains ## Amends', async ($, on) => {
    const w = setup(on, BRIEF)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeIn(ID))).text)
    const lines = out.split('\n')
    const a = lines.findIndex(l => l.startsWith('amend: '))
    expect(a).toBeGreaterThanOrEqual(0)
    expect(lines[a]).toBe('amend: scope+=docs/a.md (the doc needed a line) — check these paths in the diff')
    expect(lines[a + 1]).toBe('amend: scope+=tests/b.ts forbid-=tests/** (a test file) — check these paths in the diff')
    expect(a).toBeLessThan(lines.findIndex(l => l.includes('rebased onto')))
    const pr = w.files.get(`${ROOT}/.delegation/${ID}/pr.md`) ?? ''
    const at = pr.indexOf('## Amends')
    expect(at).toBeGreaterThan(pr.indexOf('## Done when'))
    expect(at).toBeLessThan(pr.indexOf('## Verdict'))
    expect(pr).toContain('- scope+=docs/a.md (the doc needed a line)')
    expect(pr).toContain('- scope+=tests/b.ts forbid-=tests/** (a test file)')
  })

  test('a brief with no amends changes neither output', async ($, on) => {
    const w = setup(on, BRIEF.split('\n').filter(l => !l.startsWith('[[amend')).join('\n'))
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeIn(ID))).text)
    expect(out).not.toContain('amend:')
    expect(w.files.get(`${ROOT}/.delegation/${ID}/pr.md`) ?? '').not.toContain('## Amends')
  })

  test('--finish prints no amend line', async ($, on) => {
    setup(on, BRIEF)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeIn(`${ID} --finish`))).text)
    expect(out).not.toContain('amend:')
  })
})

// MOD-248: the module maps that grew all session are bounded; the oldest-inserted entry goes first
describe('MOD-248: bounded module maps', () => {
  test('after 10x the cap of distinct ids each map holds at most its cap, newest kept', () => {
    expect(MAP_CAPS).toEqual({ handedBackPosted: 200, taskRepos: 200, offered: 200, glyphLogged: 500, handbacks: 200, gateTails: 200 })
    for (const name of ['handedBackPosted', 'offered', 'glyphLogged'] as const) {
      const cap = MAP_CAPS[name]
      const s = new Set<string>()
      for (let i = 0; i < cap * 10; i++) addBounded(s, `k${i}`, cap)
      expect(s.size).toBeLessThanOrEqual(cap)
      expect(s.has(`k${cap * 10 - 1}`)).toBe(true)
      expect(s.has('k0')).toBe(false)
    }
    for (const name of ['taskRepos', 'handbacks', 'gateTails'] as const) {
      const cap = MAP_CAPS[name]
      const m = new Map<string, number>()
      for (let i = 0; i < cap * 10; i++) setBounded(m, `k${i}`, i, cap)
      expect(m.size).toBeLessThanOrEqual(cap)
      expect(m.get(`k${cap * 10 - 1}`)).toBe(cap * 10 - 1)
      expect(m.has('k0')).toBe(false)
    }
  })
})
