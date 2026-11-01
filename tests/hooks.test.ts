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

describe('agent.spawn: tier selection, ledger, store', () => {
  test('a spawn whose prompt carries a header resolves model sonnet', async ($, on) => {
    const w = world(on)
    const r = await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=opus]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('sonnet')
    expect(r.model).toBe('claude-sonnet-5-5')
    expect(w.notices).toContain('tier=standard → sonnet (brief) · attempt 1/3') // GH-104: a briefed spawn names its attempt
    expect(w.runs).toEqual([]) // 5A: no ledger script, no which-model; the store is the ledger
    expect(records(w, 'T-1')[0]).toMatchObject({ task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', resolvedModel: 'claude-sonnet-5-5', verdict: 'pending', source: 'brief' })
    expect(w.store.get('delegation.alias.sonnet')).toMatchObject({ id: 'claude-sonnet-5-5', since: expect.any(Number) })
  })

  test('a header in a named .brief.md file counts; the built-in tier map maps it', async ($, on) => {
    const brief = `${SCRATCH}/briefs/T-9.brief.md`
    const w = world(on, { files: { [brief]: '[[brief v=1 task=T-9 subtask=main purpose=review tier=economy]]\nbody' } })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${brief}. Read it whole.` }))
    expect(w.spawns[0]?.model).toBe('haiku')
    expect(records(w, 'T-9')[0]).toMatchObject({ tier: 'economy', alias: 'haiku', purpose: 'review', source: 'brief' })
    expect(w.runs).toEqual([])
  })

  test('5B: the repo file tierMap moves a tier to another alias', async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/.chassis-delegation.json`]: '{"tierMap":{"standard":"opus"}}' } })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=standard]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.notices).toContain('tier=standard → opus (brief) · attempt 1/3')
  })

  test('no header and no caller model: the classifier picks, logged as classified', async ($, on) => {
    const w = world(on, { classify: 'frontier' })
    await $.agent.spawn(spawnInput({ prompt: 'Work out why the race happens.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.notices).toContain('tier=frontier → opus (classified)')
    expect(((w.store.get('delegation.adhoc') ?? []) as Record<string, unknown>[])[0]).toMatchObject({ task: 'adhoc-ABCDEFGH', tier: 'frontier', alias: 'opus', source: 'classified' })
  })

  test('the caller model beats the classifier; fable is rewritten to opus; a fork is untouched', async ($, on) => {
    const w = world(on, { classify: 'economy' })
    await $.agent.spawn(spawnInput({ prompt: 'x', model: 'claude-sonnet-5-5' }))
    expect(w.spawns[0]?.model).toBe('sonnet')
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-3 tier=premium]]', tool_use_id: 'toolu_02' }))
    expect(w.spawns[1]?.model).toBe('opus')
    await $.agent.spawn(spawnInput({ prompt: 'fork me', fork: true, model: undefined, tool_use_id: 'toolu_03' }))
    expect(w.spawns[2]?.model).toBeUndefined()
    expect(w.runs).toEqual([])
  })

  test('a cardless attempt recorded under the task (GH-1 item 2) does not count against a later dispatch budget or escalation', async ($, on) => {
    const adhocRec = (n: number) => ({ task: 'T-2', subtask: 'main', attempt: n, kind: 'spawn', lineage: n, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: n, adhoc: true })
    const w = world(on, { store: { 'delegation.tasks.T-2': [adhocRec(1), adhocRec(2)] } })
    const r = await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-2 subtask=main tier=standard budget=2-attempts]]' }))
    expect(r.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(1)
    // no escalation from the refuted cardless attempts: the header's tier stands, and it is attempt 1
    expect(w.notices.at(-1)).toBe('tier=standard → sonnet (brief) · attempt 1/2')
  })

  test('a spawn past budget is denied', async ($, on) => {
    const rec = (n: number) => ({ task: 'T-2', subtask: 'main', attempt: n, kind: n === 1 ? 'spawn' : 'resume', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: n })
    const w = world(on, { store: { 'delegation.tasks.T-2': [rec(1), rec(2)] } })
    const r = await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-2 subtask=main tier=standard budget=2-attempts]]' }))
    expect(r.deny).toBe("budget exhausted for T-2 (2 attempts); raise budget= in the task's brief to continue (the ladder resumes from attempt 2, the brief is re-read)")
    expect(w.spawns).toHaveLength(0)
  })

  test('GH-3: raising budget= in the brief file lifts the refusal on resume and respawn; the record is not rewritten', async ($, on) => {
    const BRIEF = `${ROOT}/.delegation/briefs/T-9.brief.md`
    const hdr = (n: number) => `[[brief v=1 task=T-9 subtask=main tier=standard budget=${n}-attempts]]\nDo it.`
    const rec = (n: number) => ({ task: 'T-9', subtask: 'main', attempt: n, kind: n === 1 ? 'spawn' : 'resume', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', at: n })
    const spawn = { key: 'k9', task: 'T-9', subtask: 'main', adhoc: false, attempt: 2, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', briefPath: BRIEF, prompt: 'x', description: 'd', subagentType: 'general-purpose', agentId: 'agent-9', verdictAttempt: 2, lastFailed: true }
    const w = world(on, {
      files: { [BRIEF]: hdr(2) },
      store: { 'delegation.tasks.T-9': [rec(1), rec(2)], 'delegation.spawn.k9': spawn, 'delegation.agent.agent-9': 'k9' },
    })
    const send = () => $.session.send({ to: 'agent-9', text: 'fix it', origin: { kind: 'model' } } as never)
    const first = (await send()) as { isDelivered?: boolean; reason?: string }
    expect(first.isDelivered).toBe(false)
    expect(first.reason).toContain(BRIEF)
    expect(first.reason).toContain('budget=')
    expect(first.reason).not.toContain('Ben')
    w.files.set(BRIEF, hdr(4))
    const second = (await send()) as { isDelivered?: boolean }
    expect(second.isDelivered).toBe(true)
    expect((w.store.get('delegation.spawn.k9') as { budget: number }).budget).toBe(2)
    // a respawn reads the same file
    w.files.set(BRIEF, hdr(2))
    const denied = await $.agent.spawn(spawnInput({ prompt: `${BRIEF}\n${hdr(9)}`, tool_use_id: 'toolu_09' }))
    expect(denied.deny).toContain(BRIEF)
  })

  test('alias drift is toasted once and kept in the transcript', async ($, on) => {
    const w = world(on, { store: { 'delegation.alias.sonnet': 'claude-sonnet-5' } })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-5 tier=standard]]' }))
    expect(w.toasts).toContain('sonnet now resolves to claude-sonnet-5-5 (was claude-sonnet-5)')
    expect(w.toasts.filter(t => t.startsWith('sonnet now resolves'))).toHaveLength(1)
    // the transcript notice goes through session.append (live only: the kit refuses a plugin's append)
    expect(delivered(w)).toContain('sonnet now resolves to claude-sonnet-5-5')
    expect(w.statuses.at(-1)).toBeUndefined() // MOD-128: the status line is retired
  })
})

describe('tool.call on Agent: report capture and verify', () => {
  test('a result without a report gets verdict=no-report in context', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    world(on)
    on('tool.call', { tool: 'Agent' }, () => agentResult('All done, everything passes.'))
    const r = await $.tool.call({ tool: 'Agent', description: 'look', prompt: 'look around' })
    const context = (r.context ?? []).join('\n')
    expect(context).toContain('chassis-delegation: verdict=no-report')
    expect(context).toContain('attempt=1/3 model=claude-sonnet-5-5 next=none') // default budget 3; no spawn seen, so no cost
  })

  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const REPORT = (sha: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  // 5A: the repo names its gate; the verifier re-runs it in the worker's own tree
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const GATE_ARGV = ['npx', 'prettier', '--check', `${SCRATCH}/T-4/files.txt`]
  const RED = 'claim gate: failed — gate=pass claimed but the gate is RED at 1234abcd (exit 1; output /repo/acme-app/.delegation/T-4/verify-gate-1.txt)'
  const verifierRun = nativeRun()
  const verifyStarts = (w: { runs: { argv: string[] }[] }) => w.runs.filter(x => isVerifyStart(x.argv))

  test('a refuted report on a foreground spawn: verify runs natively in the worker tree, context advises resume', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n' + REPORT('1234abcd'), 'agent-4'))
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}. Read it whole.`, tool_use_id: 'toolu_fg000001' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'T-4', prompt: `Your brief is the file ${BRIEF}. Read it whole.` })
    const context = (r.context ?? []).join('\n')
    expect(context).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=resume agent=agent-4 — SendMessage it the verifier lines below')
    expect(context).toContain('claim branch: held — refs/heads/agent/frontend/T-4')
    expect(context).toContain('claim files: held — files= matches the sha delta exactly')
    expect(context).toContain(`${RED}\n  | a/x.ts: not formatted`)
    // no chassis script: git reads, the gate, and (MOD-230) the load read after a red gate, nothing else
    expect(w.runs.every(x => x.argv[0] === 'git' || x.argv[0] === 'npx' || x.argv[0] === 'sysctl' || x.argv[0] === 'nproc')).toBe(true)
    const gate = w.runs.find(x => x.argv[0] === 'npx')
    expect(gate?.argv).toEqual(GATE_ARGV)
    expect(gate?.cwd).toBe(ROOT) // no worktree beside the root: the root itself
    expect(w.files.get(`${SCRATCH}/T-4/files.txt`)).toBe('a/x.ts\n')
    expect(records(w, 'T-4')[0]).toMatchObject({ attempt: 1, verdict: 'refuted', reportGate: 'pass', agentId: 'agent-4' })
    expect(w.sent).toHaveLength(0)
  })

  test('5A: the worker worktree is verified, not the root; a dirty tree leaves the gate unchecked', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const wt = `${ROOT}-T-4`
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      dirs: { [wt]: [] },
      agentId: 'agent-4',
      run: argv => (argv[3] === 'status' ? { exitCode: 0, stdout: ' M a/x.ts\n' } : verifierRun(argv)),
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: wt }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(verifyStarts(w)[0]?.argv.slice(0, 3)).toEqual(['git', '-C', wt])
    expect(delivered(w)).toContain('claim gate: unchecked — tree not at sha: 1 uncommitted path in the worktree; the gate was not re-run')
    expect(delivered(w)).toContain('chassis-delegation: verdict=unverified task=T-4')
    expect(w.runs.some(x => x.argv[0] === 'npx')).toBe(false)
  })

  test('5A: one JSON line per judged attempt in .delegation/ledger.jsonl', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    const lines = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n')
    // MOD-94: the spawn's own row, then the verdict's
    expect(lines).toHaveLength(2)
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ event: 'spawn', task: 'T-4', subtask: 'main', attempt: 1, sessionId: 'sess-1' })
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({ task: 'T-4', subtask: 'main', attempt: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', reportGate: 'pass', sessionId: 'sess-1' })
  })

  test('MOD-56: a hand-back with the 429 text and no report is no-report (rate limited), and the record and ledger carry stop', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', "API Error: 429 You've hit your weekly limit · resets 3pm"))
    expect(delivered(w)).toContain('verdict=no-report (rate limited, resets 3pm) task=T-4')
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'no-report', stop: 'rate_limited', resetsAt: '3pm' })
    const lines = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n')
    expect(JSON.parse(lines[1] ?? '{}')).toMatchObject({ task: 'T-4', verdict: 'no-report', stop: 'rate_limited', resetsAt: '3pm' })
  })

  test('ledgerFile off: no ledger file', { options: { ...GM, ledgerFile: false } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(w.files.has(`${ROOT}/.delegation/ledger.jsonl`)).toBe(false)
  })

  test('5B: the repo file gate map is used when /config names none', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ _comment: 'x', gateMap: { prettier: 'npx prettier --check {files}' } }) }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(w.runs.find(x => x.argv[0] === 'npx')?.argv).toEqual(GATE_ARGV)
    expect(delivered(w)).toContain(RED)
  })

  test('no gate map at all: the gate is named not re-run and the verdict is unverified', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(delivered(w)).toContain('claim gate: unchecked — gate not re-run: prettier (not in gateMap)')
    expect(delivered(w)).toContain('chassis-delegation: verdict=unverified task=T-4')
  })

  test('background worker, autoEscalate: first failure resumes it, the second advises a respawn one tier up (MOD-12: the brain makes it)', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=resumed agent=agent-4 (autoEscalate)')
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.to).toBe('agent-4') // the engine spells { agentId } as the id
    expect(w.sent[0]?.text).toContain(RED)
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'refuted'], [2, 'resume', 1, 'pending']])

    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5678abcd')))
    expect(delivered(w)).toContain(`chassis-delegation: verdict=refuted task=T-4 attempt=2/3 usd=~0.00 model=claude-sonnet-5-5 next=respawn at frontier — same brief ${BRIEF}`)
    expect(w.spawns).toHaveLength(1)
    await brainSpawn($, delivered(w), { tool_use_id: 'toolu_02RESPAWN' })
    expect(w.spawns[1]?.model).toBe('opus')
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.lineage, r.tier, r.source])).toEqual([
      [1, 'spawn', 1, 'standard', 'brief'],
      [2, 'resume', 1, 'standard', 'resume'],
      [3, 'spawn', 3, 'frontier', 'escalated'],
    ])
  })

  const AMEND = '[[amend v=1 scope+=scripts/ci/owned-paths-selftest.sh reason=the selftest lives beside the script]]'
  const AMENDED = 'amended: scope+=scripts/ci/owned-paths-selftest.sh (reason the selftest lives beside the script)'
  // A background verdict row: the appended user row live, the transcript log line in the kit
  // (it cannot answer a plugin's own session.append, so the mod's fallback logs the row).
  const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => ({ text: a.text })), ...w.logs.map(text => ({ text }))].filter(r => r.text.startsWith('chassis-delegation: verdict='))

  test('a hand-back amend is appended to the brief before verify, once; the row says amended', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const atVerify: (string | undefined)[] = []
    const run = nativeRun()
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => {
        if (isVerifyStart(argv)) atVerify.push(w.files.get(BRIEF))
        return run(argv)
      },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    const handback = 'Done; the selftest needed one more file.\n' + AMEND + '\n' + REPORT('1234abcd')
    await $.turn.complete(turnInput('agent-4', handback))
    expect(atVerify[0]).toBe(HEADER + '\nbody\n' + AMEND + '\n') // on disk before the verifier read it
    expect(w.runs.find(x => x.argv[0] === 'npx')?.argv).toEqual(GATE_ARGV)
    expect(rows(w)[0]?.text.split('\n')[1]).toBe(AMENDED)
    // the verifier discloses the amendment it applied
    expect(rows(w)[0]?.text).toContain('amendment: #1 scope+=scripts/ci/owned-paths-selftest.sh')
    // autoEscalate resumed it; the same hand-back on attempt 2 leaves the brief as it was
    await $.turn.complete(turnInput('agent-4', handback))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + AMEND + '\n')
    expect(verifyStarts(w)).toHaveLength(2)
    expect(rows(w)).toHaveLength(2)
    expect(rows(w)[1]?.text).not.toContain('amended:')
  })

  test('a scope+= block applies; a forbid-= block and a block carrying both wait for approval, and verify runs without them', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const FORBID_MINUS = '[[amend v=1 forbid-=b/** reason=the fixture lives under b]]'
    const BOTH = '[[amend v=1 scope+=c/x.ts forbid-=b/** reason=both at once]]'
    const atVerify: (string | undefined)[] = []
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      agentId: 'agent-4',
      run: argv => {
        if (isVerifyStart(argv)) atVerify.push(w.files.get(BRIEF))
        return verifierRun(argv)
      },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', [AMEND, FORBID_MINUS, BOTH, REPORT('1234abcd')].join('\n')))
    expect(atVerify).toEqual([HEADER + '\nbody\n' + AMEND + '\n']) // the verdict reflects the brief without the two
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + AMEND + '\n')
    const row = rows(w)[0]?.text.split('\n') ?? []
    expect(row.slice(1, 4)).toEqual([
      AMENDED,
      `amend needs approval: ${FORBID_MINUS} — append it to ${BRIEF} and re-verify to accept it`,
      `amend needs approval: ${BOTH} — append it to ${BRIEF} and re-verify to accept it`,
    ])
  })

  test('a scope+= inside a forbid glob waits for approval and is not applied (GH-17)', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const INSIDE = '[[amend v=1 scope+=b/NOTES.md reason=the notes live under b]]'
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', [AMEND, INSIDE, REPORT('1234abcd')].join('\n')))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + AMEND + '\n')
    const row = rows(w)[0]?.text.split('\n') ?? []
    expect(row).toContain('amend needs approval: scope+=b/NOTES.md lies inside forbid b/**; scope+= alone does nothing, shrink the forbid')
  })

  // MOD-170: scopeAmends decides whether a scope+= block applies on the worker's word
  describe('MOD-170: scopeAmends', () => {
    const AMEND_C = '[[amend v=1 scope+=c/x.ts reason=the helper lives in c]]'
    const REPORT_C = `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts,c/x.ts]]`
    const HELD = (mode: string, block = AMEND_C) => `amend needs approval: ${block} (scopeAmends ${mode}) — append it to ${BRIEF} to accept, then dispatch verify=1234abcd`
    const APPROVE_NEXT = `next=approve the amend (append it to ${BRIEF}), then dispatch verify=1234abcd; or refuse it`
    // c/x.ts is a changed file; \`existing\` are the paths present at the base, every other path is new there
    const baseRun = (existing: string[], delta = 'A\ta/x.ts\nM\tc/x.ts\n') => {
      const inner = nativeRun({ gate: 0, delta })
      return (argv: string[]): RunAnswer | undefined => {
        const last = argv[argv.length - 1] ?? ''
        if (argv[3] === 'rev-parse' && argv.includes('--quiet') && /^[0-9a-f]{40}:/.test(last)) return { exitCode: existing.includes(last.slice(41)) ? 0 : 1, stdout: '' }
        return inner(argv)
      }
    }
    const repoFile = (mode: string) => ({ [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ scopeAmends: mode }) })

    test('ask: at base, a scope+= for an existing out-of-scope file is held, the verdict refutes on scope and next= says approve-then-verify', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', ...repoFile('ask') }, run: baseRun(['c/x.ts']), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [AMEND_C, REPORT_C].join('\n')))
      expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
      const row = rows(w)[0]?.text ?? ''
      expect(row).toContain(HELD('ask'))
      expect(row).not.toContain('amended:')
      expect(row.split('\n')[0]).toContain('verdict=refuted')
      expect(row).toContain('claim scope: failed — out-of-scope path: c/x.ts')
      expect(row.split('\n')[0]).toContain(APPROVE_NEXT)
      expect(w.sent).toHaveLength(0)
    })

    for (const [name, files] of [['default', {}], ['spelled out', repoFile('apply')]] as const) {
      test(`apply (${name}): the block is appended and the verdict is consistent`, { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
        const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', ...files }, run: baseRun(['c/x.ts']), agentId: 'agent-4' })
        await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
        await $.turn.complete(turnInput('agent-4', [AMEND_C, REPORT_C].join('\n')))
        expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + AMEND_C + '\n')
        expect(rows(w)[0]?.text.split('\n')[0]).toContain('verdict=consistent')
        expect(rows(w)[0]?.text).toContain('amended: scope+=c/x.ts (reason the helper lives in c)')
      })
    }

    const SCOPED = HEADER.replace('scope=a/**', 'scope=a/x.ts,a/sub/**')
    const reportOf = (...files: string[]) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=${files.join(',')}]]`
    test('new-files: an existing file in a scoped folder is held', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const Y = '[[amend v=1 scope+=a/y.ts reason=it exists]]'
      const w = world(on, { files: { [BRIEF]: SCOPED + '\nbody', ...repoFile('new-files') }, run: baseRun(['a/y.ts'], 'A\ta/x.ts\nM\ta/y.ts\n'), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [Y, reportOf('a/x.ts', 'a/y.ts')].join('\n')))
      expect(w.files.get(BRIEF)).toBe(SCOPED + '\nbody')
      expect(rows(w)[0]?.text).toContain(HELD('new-files', Y))
      expect(rows(w)[0]?.text.split('\n')[0]).toContain('next=approve the amend')
    })
    test('new-files: a new file beside a scoped file is applied', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const Z = '[[amend v=1 scope+=a/z.ts reason=a new helper]]'
      const w = world(on, { files: { [BRIEF]: SCOPED + '\nbody', ...repoFile('new-files') }, run: baseRun([], 'A\ta/x.ts\nA\ta/z.ts\n'), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [Z, reportOf('a/x.ts', 'a/z.ts')].join('\n')))
      expect(w.files.get(BRIEF)).toBe(SCOPED + '\nbody\n' + Z + '\n')
      expect(rows(w)[0]?.text).toContain('amended: scope+=a/z.ts (reason a new helper)')
      expect(rows(w)[0]?.text.split('\n')[0]).toContain('verdict=consistent')
    })
    test('new-files: a new file in an unrelated folder is held', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = world(on, { files: { [BRIEF]: SCOPED + '\nbody', ...repoFile('new-files') }, run: baseRun([]), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [AMEND_C, REPORT_C].join('\n')))
      expect(w.files.get(BRIEF)).toBe(SCOPED + '\nbody')
      expect(rows(w)[0]?.text).toContain(HELD('new-files'))
    })

    test('ask: forbid+= still applies on the worker\'s word', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const F = '[[amend v=1 forbid+=d/** reason=keep out of d]]'
      const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', ...repoFile('ask') }, run: baseRun([], 'A\ta/x.ts\n'), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [F, REPORT('1234abcd')].join('\n')))
      expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + F + '\n')
      expect(rows(w)[0]?.text).toContain('amended: forbid+=d/**')
    })

    test('a bad scopeAmends value is named in the config errors and apply is used', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', ...repoFile('sometimes') }, run: baseRun(['c/x.ts']), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [AMEND_C, REPORT_C].join('\n')))
      expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody\n' + AMEND_C + '\n')
    })

    test('applyAmends off stays the master switch whatever scopeAmends says', { options: { verdictVerbosity: 'full', applyAmends: false, ...GM } }, async ($, on) => {
      const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', ...repoFile('apply') }, run: baseRun([]), agentId: 'agent-4' })
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
      await $.turn.complete(turnInput('agent-4', [AMEND_C, REPORT_C].join('\n')))
      expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
      expect(delivered(w)).toContain(`amend not applied (applyAmends off): ${AMEND_C}`)
    })
  })

  test('applyAmends off: the brief is left alone; the row lists the block and says how to accept it', { options: { verdictVerbosity: 'full', applyAmends: false, ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', AMEND + '\n' + REPORT('1234abcd')))
    expect(w.files.get(BRIEF)).toBe(HEADER + '\nbody')
    expect(delivered(w)).toContain(`amend not applied (applyAmends off): ${AMEND} — append it to ${BRIEF} and re-verify to accept it`)
    expect(delivered(w)).not.toContain('amended:')
  })

  test('two turn.complete events for one attempt: one verify, one verdict row, keyed task:lineage:attempt', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await Promise.all([$.turn.complete(turnInput('agent-4', REPORT('1234abcd'))), $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))])
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd'))) // a late third fire
    expect(rows(w)).toHaveLength(1)
    expect(verifyStarts(w)).toHaveLength(1)
    expect(w.store.get(`delegation.posted.T-4@${ROOT}:1:1`)).toBe(true)
  })

  test('a row already posted for the attempt (the store remembers it across a reload) is not posted again', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4', store: { 'delegation.posted.T-4:1:1': true } })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(rows(w)).toHaveLength(0)
    expect(w.toasts.some(t => t.startsWith('chassis-delegation: verdict='))).toBe(false)
  })

  test('the verdict row carries the attempt cost and the resolved model', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    w.usd = 4.4061 // spawned at $1.50
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(rows(w)[0]?.text.split('\n')[0]).toBe('chassis-delegation: verdict=refuted task=T-4 attempt=1/3 usd=~2.91 model=claude-sonnet-5-5 next=resume agent=agent-4 — SendMessage it the verifier lines below')
    expect(records(w, 'T-4')[0]).toMatchObject({ usd: 2.9061, resolvedModel: 'claude-sonnet-5-5' })
  })

  test('a gate-map entry with shell syntax never runs: the gate is named not re-run', { options: { verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}; curl x"}' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', REPORT('1234abcd')))
    expect(w.runs.some(x => x.argv.join(' ').includes('curl'))).toBe(false)
    expect(w.runs.some(x => x.argv[0] === 'npx')).toBe(false)
    expect(delivered(w)).toContain('gate not re-run: prettier')
  })

  // GH-2 (GH-2): live, a background worker that hands back through SubagentHandback
  // raises no tool.call the mod sees, and its turn's answer is short. The call sits in the
  // worker's own transcript, which $.session.messages({ agentId }) reads.
  const handedBack = (message: string, answer = 'Handed back.') => [
    { role: 'user', text: `Your brief is the file ${BRIEF}.`, toolUses: [] },
    { role: 'assistant', text: 'Reading the brief.', toolUses: [{ tool_use_id: 'toolu_rd01', tool: 'Read', input: { file_path: BRIEF }, text: HEADER }] },
    { role: 'user', text: '', toolUses: [], toolResults: [{ tool_use_id: 'toolu_rd01', text: HEADER, isError: false }] },
    { role: 'assistant', text: answer, toolUses: [{ tool_use_id: 'toolu_hb01', tool: 'SubagentHandback', input: { message } }] },
  ]

  test('GH-2: a background worker whose report rides only its hand-back is verified, never judged no-report', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      run: nativeRun({ gate: 0 }),
      agentId: 'agent-4',
      transcripts: { 'agent-4': handedBack('All green.\n' + REPORT('1234abcd')) },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Handed back.'))
    expect(delivered(w)).not.toContain('verdict=no-report')
    expect(verifyStarts(w)).toHaveLength(1)
    expect(rows(w)[0]?.text.split('\n')[0]).toBe('chassis-delegation: verdict=consistent task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'consistent' })
  })

  test('GH-2: the last report wins across the answer and the hand-back', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    // the answer still carries the first try; the hand-back, the run's last word, the fix
    const answer = 'First try: ' + REPORT('1234abcd')
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody' },
      run: nativeRun({ gate: 0 }),
      agentId: 'agent-4',
      transcripts: { 'agent-4': handedBack('Fixed.\n' + REPORT('5678abcd'), answer) },
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', answer))
    expect(verifyStarts(w).map(x => x.argv.at(-1))).toEqual(['5678abcd^{commit}'])
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'consistent' })
  })

  test('GH-2: a resumed run that hands back nothing is not judged on the run before it', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const first = handedBack('Done.\n' + REPORT('1234abcd'))
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4', transcripts: { 'agent-4': first } })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Handed back.'))
    expect(rows(w)[0]?.text).toContain('verdict=refuted task=T-4 attempt=1/3') // the gate is red; autoEscalate resumes it
    expect(w.sent).toHaveLength(1)
    // the resume is the next prompt of the same transcript; this run ends on text alone
    w.transcripts.set('agent-4', [...first, { role: 'user', text: String(w.sent[0]?.text), toolUses: [] }, { role: 'assistant', text: 'Still on it.', toolUses: [] }])
    await $.turn.complete(turnInput('agent-4', 'Still on it.'))
    expect(rows(w)[1]?.text).toContain('verdict=no-report task=T-4 attempt=2/3')
    expect(verifyStarts(w)).toHaveLength(1)
  })
})

describe('GH-20: the report names its red evidence (red=) and the verifier reads it in the worker tree', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** red_test="npx vitest run a/x.test.ts" gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const WT = `${ROOT}-T-4`
  const RED_1 = '.delegation/T-4/red-1.txt'
  const RED_2 = '.delegation/T-4/red-2.txt'
  const RED_TEXT = 'FAIL a/x.test.ts\n  ✗ adds two numbers\n    AssertionError: expected 3 to be 4\n'
  const REPORT = (sha: string, red?: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass${red ? ` red=${red}` : ''} files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))
  const MISSING = "claim red: unchecked — no red= evidence named; the brief asks for the red test's failing output"

  test('a report with red= naming a non-empty file with a failure line holds; the row shows the claim, the record keeps path and hash', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${WT}/${RED_1}`]: RED_TEXT }, dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    const row = rows(w)[0] ?? ''
    expect(row.split('\n')[0]).toBe('chassis-delegation: verdict=consistent task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(row).toContain('claim red: held — .delegation/T-4/red-1.txt, 79 bytes, first failure line: FAIL a/x.test.ts')
    const rec = records(w, 'T-4')[0] ?? {}
    expect(rec).toMatchObject({ verdict: 'consistent', red: RED_1 })
    expect(String(rec.redHash)).toMatch(/^[0-9a-f]{64}$/)
  })

  test('the same report with no red= is unverified, naming the missing evidence', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody', [`${WT}/${RED_1}`]: RED_TEXT }, dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const row = rows(w)[0] ?? ''
    expect(row.split('\n')[0]).toContain('chassis-delegation: verdict=unverified task=T-4 attempt=1/3')
    expect(row).toContain(MISSING)
    expect(records(w, 'T-4')[0]?.redHash).toBeUndefined()
  })

  test("a resume that re-uses attempt 1's held bytes is held on red (one proof per task, MOD-1)", { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    let gate = 1
    const repo = nativeRun({ gate: 0 })
    const w = world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [`${WT}/${RED_1}`]: RED_TEXT },
      dirs: { [WT]: [] },
      run: argv => (argv[0] === 'npx' ? { exitCode: gate, stdout: gate ? 'a/x.ts: not formatted\n' : '' } : repo(argv)),
      agentId: 'agent-4',
    })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    expect(rows(w)[0]).toContain('verdict=refuted task=T-4 attempt=1/3') // the gate is red; autoEscalate resumes it
    expect(rows(w)[0]).toContain('claim red: held — .delegation/T-4/red-1.txt')
    // attempt 2: the gate is green now, but its "new" red file is attempt 1's bytes again
    gate = 0
    w.files.set(`${WT}/${RED_2}`, RED_TEXT)
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5678abcd', RED_2)))
    expect(rows(w)[1]).toContain('verdict=consistent task=T-4 attempt=2/3')
    expect(rows(w)[1]).toContain("claim red: held — attempt 1's proof, reused (one proof per task)")
    expect(records(w, 'T-4').map(r => [r.attempt, r.verdict, r.red])).toEqual([[1, 'refuted', RED_1], [2, 'consistent', RED_2]])
  })

  test('a brief with red_test=none yields no red claim', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const none = HEADER.replace(' red_test="npx vitest run a/x.test.ts"', ' red_test=none')
    const w = world(on, { files: { [BRIEF]: none + '\nbody' }, dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const row = rows(w)[0] ?? ''
    expect(row.split('\n')[0]).toContain('verdict=consistent task=T-4')
    expect(row).not.toContain('claim red:')
  })
})
