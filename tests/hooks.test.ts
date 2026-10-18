import { test, expect, describe } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, agentResult, sessionStart, commandInput, DEBRIEF_TEMPLATE, composeInput, brainSpawn, spawnCallOf, workerCall, stepInput, paneProps, STEPPED_PAST, ROOT, SCRATCH, NOW, HOME, type RunAnswer, type SpawnCall } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME, FIXTURE_HEADER as PLAIN_HEADER } from './fixtures/sample-card'
import { MOD_VERSION } from '../hooks/lib/version'
// GH-106: /dispatch writes the tier's ceiling (frontier: $15) into the header
const FIXTURE_HEADER = PLAIN_HEADER.replace(' budget=', ' spend=25 budget=')

const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task}`) ?? []) as Record<string, unknown>[]
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
    expect(w.statuses.at(-1)).toBe('0 workers · $1.50 · ctx 12%')
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
  const RED = 'claim gate: failed — gate=pass claimed but the gate is RED at 1234abcd (exit 1)'
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
    // no chassis script: git reads and the gate, nothing else
    expect(w.runs.every(x => x.argv[0] === 'git' || x.argv[0] === 'npx')).toBe(true)
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
    expect(lines).toHaveLength(1)
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ task: 'T-4', subtask: 'main', attempt: 1, tier: 'standard', alias: 'sonnet', verdict: 'refuted', reportGate: 'pass', sessionId: 'sess-1' })
  })

  test('MOD-56: a hand-back with the 429 text and no report is no-report (rate limited), and the record and ledger carry stop', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: verifierRun, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', "API Error: 429 You've hit your weekly limit · resets 3pm"))
    expect(delivered(w)).toContain('verdict=no-report (rate limited, resets 3pm) task=T-4')
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'no-report', stop: 'rate_limited', resetsAt: '3pm' })
    const lines = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n')
    expect(JSON.parse(lines[0] ?? '{}')).toMatchObject({ task: 'T-4', verdict: 'no-report', stop: 'rate_limited', resetsAt: '3pm' })
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
    expect(w.store.get('delegation.posted.T-4:1:1')).toBe(true)
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

describe('GH-6: an inline [[brief]] header and no brief file', () => {
  const INLINE = '[[brief v=1 task=FE-232 subtask=e2e purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const BODY = 'Write the e2e test for the checkout flow.\nCommit and hold.'
  const PROMPT = `${INLINE}\n\n${BODY}`
  const WRITTEN = `${ROOT}/.delegation/briefs/FE-232.e2e.brief.md`
  // the issue's sha: a real short sha padded out to 40 hex with invented digits
  const PADDED = '1234abcd' + 'e'.repeat(32)
  const REPORT = (sha: string) => `[[report v=1 task=FE-232 subtask=e2e branch=agent/frontend/FE-232 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  /** A green worker repo where the sha resolves but is not an ancestor of the branch. */
  const offBranch = () => {
    const run = nativeRun({ gate: 0 })
    return (argv: string[]): RunAnswer | undefined => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : run(argv))
  }

  test('a complete inline header is written to the brief folder and the hand-back is verified: a sha not on the branch is refuted', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6', run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.files.get(WRITTEN)).toBe(`${INLINE}\n\n${BODY}\n`)
    expect(records(w, 'FE-232')[0]).toMatchObject({ subtask: 'e2e', briefPath: WRITTEN, tier: 'standard', source: 'brief' })
    expect(w.store.get('delegation.spawn.toolu_01ABCDEFGH')).toMatchObject({ briefPath: WRITTEN })
    await $.turn.complete(turnInput('agent-6', 'Done.\n' + REPORT(PADDED)))
    const row = delivered(w)
    expect(row).not.toContain('no brief file named')
    expect(row).toContain('chassis-delegation: verdict=refuted task=FE-232/e2e attempt=1/3')
    expect(row).toContain(`claim sha: failed — sha ${PADDED} exists but is NOT reachable on agent/frontend/FE-232`)
    expect(records(w, 'FE-232')[0]).toMatchObject({ verdict: 'refuted', reportGate: 'pass' })
  })

  test('a brief file already at that path is reused, never overwritten, and its amend blocks count', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/y.ts reason=the fixture lives in c]]'
    const held = `${INLINE}\n\nan earlier attempt's body\n${AMEND}\n`
    const w = world(on, { agentId: 'agent-6', files: { [WRITTEN]: held }, run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.files.get(WRITTEN)).toBe(held)
    await $.turn.complete(turnInput('agent-6', REPORT(PADDED)))
    expect(w.files.get(WRITTEN)).toBe(held)
    expect(delivered(w)).toContain('amendment: #1 scope+=c/y.ts — reason: the fixture lives in c')
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=FE-232/e2e')
  })

  test('a named brief file still wins over the inline header: nothing is written', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const named = `${SCRATCH}/briefs/FE-232.brief.md`
    const w = world(on, { agentId: 'agent-6', files: { [named]: INLINE + '\nbody' }, run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: `${INLINE}\nYour brief is the file ${named}.` }))
    expect(w.files.has(WRITTEN)).toBe(false)
    expect(records(w, 'FE-232')[0]).toMatchObject({ briefPath: named })
  })

  test('an incomplete inline header writes nothing; the unverified line names the missing field', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6', run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-233 subtask=main tier=standard scope=a/**]]\nDo it.' }))
    expect([...w.files.keys()].some(p => p.endsWith('.brief.md'))).toBe(false)
    await $.turn.complete(turnInput('agent-6', REPORT(PADDED).replace(/FE-232/g, 'FE-233').replace('subtask=e2e', 'subtask=main')))
    expect(delivered(w)).toContain('chassis-delegation: verdict=unverified task=FE-233')
    expect(delivered(w)).toContain('note: no brief file named in the prompt; the inline header lacks gate= (or repo=none); verify skipped')
    expect(w.runs.some(r => r.argv[0] === 'git' && !['ls-tree'].includes(r.argv[3] ?? ''))).toBe(false) // MOD-60: the merged check lists origin/main's cards
  })

  test('scope and gate both missing are both named; repo=none stands in for a gate', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-234 subtask=main tier=standard]]\nDo it.' }))
    await $.turn.complete(turnInput('agent-6', '[[report v=1 task=FE-234 subtask=main branch=x pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
    expect(delivered(w)).toContain('note: no brief file named in the prompt; the inline header lacks scope= (or scope_globs=) and gate= (or repo=none); verify skipped')
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-235 subtask=docs tier=standard scope_globs=/notes/** repo=none]]\nWrite the notes.', tool_use_id: 'toolu_02ABCDEFGH' }))
    expect(w.files.get(`${ROOT}/.delegation/briefs/FE-235.docs.brief.md`)).toBe('[[brief v=1 task=FE-235 subtask=docs tier=standard scope_globs=/notes/** repo=none]]\n\nWrite the notes.\n')
  })

  test('a header without task= runs ad hoc; its line names task= instead of "no brief header"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const prompt = '[[brief v=1 tier=economy scope=a/** gate=node]]\nLook around.'
    const w = world(on, { agentId: 'agent-7' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n[[report v=1 branch=x pr=none sha=1234abcd gate=pass files=a/x.ts]]', 'agent-7'))
    await $.agent.spawn(spawnInput({ prompt }))
    const r = await $.tool.call({ tool: 'Agent', description: 'look', prompt })
    expect((r.context ?? []).join('\n')).toContain('note: no brief file named in the prompt; the inline header lacks task=; verify skipped')
    expect([...w.files.keys()].some(p => p.endsWith('.brief.md'))).toBe(false)
  })
})

describe('5D: the git guard on Bash', () => {
  const branchIs = (branch: string) => (argv: string[]) => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: `${branch}\n` } : undefined)
  const bash = (command: string) => ({ tool: 'Bash', command }) as never
  // the engine takes a tool.call hook's answer as { result } (the Bash record) or { deny }
  const ran = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never

  test('a commit on main is denied; on agent/ops/X it runs', async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git add -A && git commit -m "x"'))
    expect(r.deny).toBe('chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)')
    expect(w.runs.map(x => x.argv)).toEqual([['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD']])
  })

  test('on an agent branch the commit passes through', async ($, on) => {
    world(on, { run: branchIs('agent/ops/X') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git commit -m "x"'))
    expect(r.deny).toBeUndefined()
  })

  test('a push naming main is denied from any branch, without asking git', async ($, on) => {
    const w = world(on, { run: branchIs('agent/ops/X') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git push origin main'))
    expect(r.deny).toBe('chassis-delegation: no push on main; branch first (git checkout -b agent/<domain>/<id>)')
    expect(w.runs).toEqual([])
  })

  test('the words inside a heredoc body never trigger it', async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash("cat > notes.md <<'EOF'\nthen git commit -m x and git push origin main\nEOF"))
    expect(r.deny).toBeUndefined()
    expect(w.runs).toEqual([])
  })

  test('gitGuard off: nothing is checked', { options: { gitGuard: false } }, async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git commit -m x'))
    expect(r.deny).toBeUndefined()
    expect(w.runs).toEqual([])
  })
})

describe('5B: /delegation init and the init tool', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

  test('init writes the four files and says so; a second init overwrites nothing', async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/.gitignore`]: 'node_modules/\n' } })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('delegation')
    expect(w.tools).toContain('init')
    const out = await $.command.run(delegation('init'))
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/README.md`)
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/OPS-000-sample.md`)
    expect(out.text).toContain(`wrote ${ROOT}/.chassis-delegation.json`)
    expect(w.files.get(`${ROOT}/.gitignore`)).toBe('node_modules/\n.delegation/\n')
    expect(w.files.get(`${ROOT}/agents/tasks/OPS-000-sample.md`)).toContain('status: template')
    w.files.set(`${ROOT}/agents/tasks/README.md`, 'mine')
    const again = await $.tool.call({ tool: 'mcp__chassis-delegation__init' } as never)
    expect(resultText(again)).toContain(`left ${ROOT}/agents/tasks/README.md (exists; never overwritten)`)
    expect(w.files.get(`${ROOT}/agents/tasks/README.md`)).toBe('mine')
    expect(w.files.get(`${ROOT}/.gitignore`)).toBe('node_modules/\n.delegation/\n')
  })

  const localCardsLine = (ignored: boolean): TestBody => async ($, on) => {
    const LINE = 'cards: agents/tasks is git-ignored, so cards stay local; /delegation merge marks them merged in place'
    const ignoredWhen = (ignored: boolean) => (argv: string[]): RunAnswer | undefined => {
      if (argv[3] === 'check-ignore') return { exitCode: ignored ? 0 : 1, stdout: '' }
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      return { exitCode: 0, stdout: '' }
    }
    const files = { [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' }
    const w = world(on, { run: ignoredWhen(ignored), files, dirs: { [ROOT]: ['package.json'] } })
    await $.session.start(sessionStart)
    const init = String((await $.command.run(delegation('init'))).text)
    const setup = String((await $.command.run(delegation('setup'))).text)
    expect(init.includes(LINE)).toBe(ignored)
    expect(setup.includes(LINE)).toBe(ignored)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${ROOT} check-ignore -q -- agents/tasks`)
  }
  test('MOD-86: init and setup print the local-cards line when the card folder is git-ignored', localCardsLine(true))
  test('MOD-86: init and setup print no local-cards line when it is not', localCardsLine(false))

  test('GH-109: /delegation setup in an empty folder lists the failing checks and writes nothing', async ($, on) => {
    const w = world(on, { run: () => ({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }) })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('delegation')
    expect(w.tools).toContain('setup')
    const out = await $.command.run(delegation('setup'))
    expect(out.text).toContain(`chassis-delegation setup in ${ROOT}: 1 of 6 required checks hold`)
    expect(out.text).toContain('✗ a git repo: none here\n    fix: git init -b main')
    expect(out.text).toContain('✗ a gate: no test command found')
    expect(out.text).toContain('✗ the tools on PATH: missing git')
    expect(out.text).not.toContain('First card')
    expect(w.files.size).toBe(0)
    expect(w.runs.every(r => r.argv[0] === 'git' && r.argv[1] === '-C')).toBe(true)
  })

  test('GH-109: with the world made green setup writes the four init files and the gate map, and asks for the first task', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, {
      run: answer,
      files: {
        [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}',
        '/usr/bin/git': '',
        '/usr/bin/node': '',
        '/usr/bin/npm': '',
      },
      dirs: { [ROOT]: ['package.json'] },
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup'))
    expect(out.text).toContain(`chassis-delegation setup in ${ROOT}: 6 of 6 required checks hold`)
    expect(out.text).toContain('· mode: repo=here (no origin/main); setup writes "baseRef": "main" and cards dispatch with --here')
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/README.md`)
    expect(out.text).not.toContain('Next: write a card under')
    expect(out.text).not.toContain('update is pending')
    expect(out.text).toContain('config: gateMap.test = npm test')
    expect(out.text).toContain('config: baseRef = main')
    for (const f of ['agents/tasks/README.md', '.chassis-delegation.json', '.gitignore']) expect(w.files.has(`${ROOT}/${f}`)).toBe(true)
    const cfgText = JSON.parse(w.files.get(`${ROOT}/.chassis-delegation.json`) ?? '{}')
    expect(cfgText.gateMap).toEqual({ test: 'npm test' })
    expect(cfgText.baseRef).toBe('main')
    // a second run changes nothing in the config and says what it would have set
    w.files.set(`${ROOT}/.chassis-delegation.json`, '{"gateMap":{"test":"make test"}}')
    const again = await $.tool.call({ tool: 'mcp__chassis-delegation__setup' } as never)
    expect(resultText(again)).toContain('setup would have set "gateMap": {"test": "npm test"}, "baseRef": "main"')
    expect(w.files.get(`${ROOT}/.chassis-delegation.json`)).toBe('{"gateMap":{"test":"make test"}}')
  })

  test('GH-111: setup ends by asking for the first task: no card to save, no sample card, no commit step', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      if (rest === 'status --porcelain') return { exitCode: 0, stdout: ' M x\n' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, { run: answer, files: { [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' }, dirs: { [ROOT]: ['package.json'] } })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup'))
    expect(out.text).not.toContain('First card: save this as')
    expect(out.text).not.toContain('REPLACE ME')
    expect(out.text).not.toContain('Commit the card')
    expect(out.text).not.toContain('git add -A')
    expect(out.text).not.toContain('Ask the person for the first task')
    expect(String(out.text).trimEnd().split('\n').at(-1)).toBe('Set up. Tell Claude your first task in a sentence, for example: "add a function that reads a file header and returns its size, with a node --test test". Claude writes the card, shows you the brief, and when you say go dispatches it and makes the Agent call that starts the worker; the mod shapes and verifies it.')
    expect(w.files.has(`${ROOT}/agents/tasks/README.md`)).toBe(true)
    expect(w.files.has(`${ROOT}/agents/tasks/OPS-000-sample.md`)).toBe(false)
    const viaTool = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__setup' } as never))
    expect(viaTool.trimEnd().split('\n').at(-1)).toBe('Ask the person for the first task, then call the card tool. On go, call dispatch and make the Agent call its result ends with (the spawn block, verbatim): that call starts the worker.')
    expect(viaTool).toContain('Set up. Tell Claude your first task')
  })

  test('MOD-45: /delegation setup /other scaffolds the other repo with its detected gate and writes nothing in the session root', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] !== 'git' || argv[2] !== '/other') return { exitCode: 1, stdout: '' }
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/other\n' }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 0, stdout: 'abc1234\n' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, {
      run: answer,
      files: { '/other/package.json': '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' },
      dirs: { '/other': ['package.json'], '/other/.git': [] },
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup /other'))
    expect(out.text).toContain('chassis-delegation setup in /other: 6 of 6 required checks hold')
    expect(JSON.parse(w.files.get('/other/.chassis-delegation.json') ?? '{}').gateMap).toEqual({ test: 'npm test' })
    expect(w.files.get('/other/agents/tasks/README.md')).toContain('Task cards')
    expect(w.files.get('/other/.gitignore')).toBe('.delegation/\n')
    expect([...w.files.keys()].filter(k => k.startsWith(`${ROOT}/`))).toEqual([])
    expect(String(out.text).trimEnd().split('\n').at(-1)).toContain('card tool with repo set to /other')
    // the tool takes the same path; a relative path and a folder with no .git are refused in one line, writing nothing
    const rel = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__setup', path: 'other' } as never))
    expect(rel).toContain('not an absolute path')
    expect(rel.trim().split('\n').length).toBe(1)
    const none = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__init', path: '/nowhere' } as never))
    expect(none).toContain('is not a git checkout')
    expect([...w.files.keys()].filter(k => k.startsWith('/nowhere') || k.startsWith(`${ROOT}/`))).toEqual([])
    const viaInit = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__init', path: '/other' } as never))
    expect(viaInit).toContain('left /other/.chassis-delegation.json (exists; never overwritten)')
  })

  test('GH-109: /delegation with no config adds the not-set-up line', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation(''))
    expect(out.text).toContain('not set up here: run /delegation setup')
  })

  test('/delegation with no argument prints the state and where the config came from', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation(''))
    expect(out.text).toContain('Delegation state (chassis-delegation): nothing running, queued or owed.')
    expect(out.text).toContain(`config: no .chassis-delegation.json in ${ROOT}`)
    expect(out.text).toContain('git guard on (main, master)')
    expect(String(out.text)).toMatch(/^mod: chassis-delegation \d+\.\d+\.\d+ loaded from \S+/m)
  })
})

describe('MOD-3: /delegation update', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const CHANGELOG_NEW = '# Changelog\n\n## 0.5.0 — 2026-10-08\n\n- five a\n\n## 0.4.0 — 2026-10-05\n\n- four a\n'
  /** A clone root behind origin/main by two commits, 0.4.0 → 0.5.0; the merge moves the files in. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const behindClone = async ($: any, on: any, opts: { fetchFails?: boolean; dirty?: boolean; folderVersion?: string } = {}) => {
    let merged = false
    const root = { value: '' }
    let files: Map<string, string> | undefined
    const O = 'a'.repeat(40)
    const N = 'b'.repeat(40)
    const w = world(on, {
      run: argv => {
        if (argv[0] !== 'git') return undefined
        const sub = argv.slice(3)
        if (sub[0] === 'fetch') return opts.fetchFails ? { exitCode: 128, stdout: '', stderr: 'fatal: no origin' } : { exitCode: 0, stdout: '' }
        if (sub[0] === 'status') return { exitCode: 0, stdout: opts.dirty ? ' M hooks/register.ts\n' : '' }
        if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${merged ? N : O}\n` }
        if (sub[0] === 'log') return { exitCode: 0, stdout: merged ? '' : `${N}\n${O.replace(/a/, 'c')}\n` }
        if (sub[0] === 'merge') {
          merged = true
          files?.set(`${root.value}/.claude-plugin/plugin.json`, '{"version":"0.5.0"}')
          files?.set(`${root.value}/CHANGELOG.md`, CHANGELOG_NEW)
          if (opts.folderVersion) files?.set(`${root.value}/hooks/lib/version.ts`, `export const MOD_VERSION = '${opts.folderVersion}'\n`)
          return { exitCode: 0, stdout: 'Updating\n' }
        }
        return undefined
      },
    })
    files = w.files
    await $.session.start(sessionStart)
    const first = String((await $.command.run(delegation(''))).text)
    root.value = /loaded from (\S+)/.exec(first)?.[1] ?? ''
    w.files.set(`${root.value}/.git`, 'gitdir')
    w.files.set(`${root.value}/.claude-plugin/plugin.json`, '{"version":"0.4.0"}')
    w.files.set(`${ROOT}/.chassis-delegation.json`, '{\n  "maxWorkers": 2\n}\n')
    return { w, N, O }
  }

  test('a clone behind origin/main: fetch then merge --ff-only, the update line and the changelog slice; /delegation afterwards has no update: line', async ($, on) => {
    const { w, N, O } = await behindClone($, on)
    const out = String((await $.command.run(delegation('update'))).text)
    const git = argvs(w).filter(a => a[0] === 'git').map(a => a.slice(3).join(' '))
    const fetchAt = git.findIndex(g => g === 'fetch origin main' || g === 'fetch -q origin main')
    const mergeAt = git.findIndex(g => g === 'merge --ff-only origin/main')
    expect(fetchAt).toBeGreaterThanOrEqual(0)
    expect(mergeAt).toBeGreaterThan(fetchAt)
    expect(out).toContain(`update: 0.4.0 (${O.slice(0, 7)}) → 0.5.0 (${N.slice(0, 7)}), 2 commits`)
    expect(out).toContain('## 0.5.0 — 2026-10-08')
    expect(out).toContain('- five a')
    expect(out).not.toContain('four a')
    expect(out).toContain('config: added')
    expect(out).toContain('delegateOnly')
    expect(String(w.files.get(`${ROOT}/.chassis-delegation.json`))).toContain('"delegateOnly": "off"')
    const after = String((await $.command.run(delegation(''))).text)
    expect(after).not.toMatch(/^update:/m)
  })

  test('the status line says n commits behind when the clone is behind, and is silent once current', async ($, on) => {
    const { w } = await behindClone($, on)
    const out = String((await $.command.run(delegation(''))).text)
    expect(out).toContain('update: 2 commits behind origin/main · run /delegation update')
    // the fetch is cached for ten minutes
    const fetches = () => argvs(w).filter(a => a[0] === 'git' && a[3] === 'fetch').length
    const n = fetches()
    await $.command.run(delegation(''))
    expect(fetches()).toBe(n)
  })

  test('a dirty tree or a failed fetch refuses with the reason and merges nothing; a failed status fetch is one line', async ($, on) => {
    const { w } = await behindClone($, on, { dirty: true })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain('uncommitted')
    expect(argvs(w).some(a => a.includes('merge'))).toBe(false)
  })

  test('a failed fetch: update names it and merges nothing; /delegation says one line, no error', async ($, on) => {
    const { w } = await behindClone($, on, { fetchFails: true })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain('fatal: no origin')
    expect(argvs(w).some(a => a.includes('merge'))).toBe(false)
    const st = String((await $.command.run(delegation(''))).text)
    expect(st.split('\n').filter(l => l.startsWith('update:')).length).toBeLessThanOrEqual(1)
  })

  test('MOD-28: a merge that moved the version prints the code line: running the old, the folder holds the new, reload the window', async ($, on) => {
    await behindClone($, on, { folderVersion: '9.9.9' })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain(`code: running ${MOD_VERSION}, folder holds 9.9.9 — reload the window to run it`)
    // before the reload line, which says the same thing for a folder outside ~/.claude/dev-mods
    expect(out.indexOf('code: running')).toBeLessThan(out.indexOf('reload: not done'))
  })

  test('MOD-28: an update that moved no version prints no code line', async ($, on) => {
    await behindClone($, on)
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).not.toContain('code: running')
  })

  test('a plain folder changes nothing and prints the clone command with its own path', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toMatch(/git clone \S+ \S+/)
    expect(argvs(w).some(a => a[0] === 'git')).toBe(false)
  })
})

describe('turn.complete', () => {
  test('a background ad hoc agent finishing adds nothing to the conversation', async ($, on) => {
    const w = world(on, { classify: 'standard' })
    await $.agent.spawn(spawnInput({ prompt: 'Find where the brief is rendered.' }))
    await $.turn.complete(turnInput('agent-1', 'It is in dealStrategyBrief.js.'))
    expect(delivered(w)).not.toContain('verdict=')
    expect(w.runs.some(r => r.argv[0] === 'git')).toBe(false)
  })
})

describe('/dispatch', () => {
  const files = (): Record<string, string> => ({
    [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD,
  })
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME, 'BE-1010-other.md', 'FE-1-x.md'] }
  const run = (_argv: string[]): RunAnswer | undefined => undefined
  // the subagent types the session offers (noted from $.agent.list and agent.offer)
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }

  test('--dry-run reads the card, writes the brief and prints the header', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('dispatch')
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(FIXTURE_HEADER)
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    expect(brief.startsWith(FIXTURE_HEADER + '\n\nWork in ' + ROOT + '-BE-101 on agent/backend/BE-101;')).toBe(true)
    expect(brief.endsWith(FIXTURE_CARD.slice(FIXTURE_CARD.indexOf('## Why')))).toBe(true)
    expect(w.runs.find(r => r.argv[0] === 'git')).toBeUndefined()
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toEqual([])
    // no --scope: the prose scope is written as the card has it, and flagged
    expect(out.text).toContain('the card scope reads as prose')
  })

  test('GH-103: a prose card scope and no --scope stops at dispatch: the brief and the prose are shown, no worktree, no spawn; the second dispatch with --scope reuses the brief', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run, store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101'))
    expect(out.text).toContain(`2. brief ${SCRATCH}/briefs/BE-101.brief.md written`)
    expect(out.text).toContain(FIXTURE_HEADER)
    expect(out.text).toContain('app/billing/RateCatalog.ts, RateProviderHttp.ts')
    expect(out.text).toContain('stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again')
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toEqual([])
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(true)
    const again = await $.command.run(commandInput('BE-101 --scope app/billing/**'))
    expect(again.text).toContain('exists — reused, not overwritten')
    expect(again.text).not.toContain('stopped:')
    expect(spawnCallOf(String(again.text))).toMatchObject({ subagent_type: 'backend', model: 'opus' })
    expect(w.spawns).toHaveLength(0)
  })

  test('--scope and --forbid replace the card prose in the header', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run --scope app/billing/Rate*.ts,docs/architecture/rate-provider-ladder.md --forbid app/ui/**,vendor/**'))
    const header = FIXTURE_HEADER.replace(/ scope=.* red_test=/, ' scope=app/billing/Rate*.ts,docs/architecture/rate-provider-ladder.md forbid=app/ui/**,vendor/** red_test=')
    expect(out.text).toContain(header)
    expect(out.text).not.toContain('the card scope reads as prose')
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').startsWith(header + '\n\n')).toBe(true)
  })

  test('a scope entry inside a forbid glob is named once in the dispatch output (GH-17)', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run --scope docs/a.md,src/**/x.ts --forbid docs/**'))
    const warning = 'warning: scope entry docs/a.md is inside forbid docs/** and can never be touched; shrink the forbid (forbid-=) to allow it'
    expect(String(out.text).split(warning)).toHaveLength(2)
    expect(String(out.text)).not.toContain('scope entry src/')
  })

  test('--replay reads the card at the base commit and works in the -replay worktree', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    // the working tree has the card merged; the base commit still has it queued
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: merged')
    const replayRun = (argv: string[]) => {
      if (argv[3] === 'ls-tree') return { exitCode: 0, stdout: `agents/tasks/${FIXTURE_CARD_NAME}\nagents/tasks/BE-1010-other.md\n` }
      if (argv[3] === 'show') return { exitCode: 0, stdout: FIXTURE_CARD }
      return run(argv)
    }
    const w = world(on, { files: f, dirs, run: replayRun, agentId: 'agent-r' })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay --base 96014e3b --scope app/billing/Rate*.ts'))
    await brainSpawn($, String(out.text))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'ls-tree', '--name-only', '96014e3b', 'agents/tasks/'],
      ['git', '-C', ROOT, 'show', `96014e3b:agents/tasks/${FIXTURE_CARD_NAME}`],
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101-replay', `${ROOT}-BE-101-replay`, '96014e3b'],
    ])
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.replay.brief.md`) ?? ''
    expect(brief).toContain(' scope=app/billing/Rate*.ts forbid=')
    expect(brief).toContain(`Work in ${ROOT}-BE-101-replay on agent/backend/BE-101-replay; card ${ROOT}-BE-101-replay/agents/tasks/${FIXTURE_CARD_NAME}.`)
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.spawns[0]).toMatchObject({ prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.replay.brief.md. Read it whole, then follow it exactly.`, cwd: `${ROOT}-BE-101-replay`, model: 'opus' })
    expect(records(w, 'BE-101')[0]).toMatchObject({ task: 'BE-101', attempt: 1, kind: 'spawn', replay: true, base: '96014e3b' })
    expect(out.text).toContain('replay of BE-101 at 96014e3b')
  })

  test('--replay refuses a card that is not queued at the base commit', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: files(), dirs,
      run: argv => (argv[3] === 'ls-tree' ? { exitCode: 0, stdout: `agents/tasks/${FIXTURE_CARD_NAME}\n` } : argv[3] === 'show' ? { exitCode: 0, stdout: FIXTURE_CARD.replace('status: queued', 'status: merged') } : run(argv)),
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay --base 96014e3b'))
    expect(out.text).toContain('BE-101 is status merged')
    expect(w.spawns).toHaveLength(0)
    expect(argvs(w).some(a => a[3] === 'worktree')).toBe(false)
  })

  test('--replay without --base is refused before anything runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay'))
    expect(out.text).toContain('refused --replay without --base <sha>')
    expect(w.runs).toHaveLength(0)
  })

  test('a dispatcher card dispatches: its domain stays in the branch; with no type of its name it runs on general-purpose', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('domain: backend', 'domain: dispatcher')
    const w = world(on, { files: f, dirs, run, store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/dispatcher/BE-101', `${ROOT}-BE-101`, 'origin/main'],
    ])
    expect(spawnCallOf(String(out.text))?.subagent_type).toBe('general-purpose')
    expect(out.text).toContain('4. spawn prepared: general-purpose on opus')
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('general-purpose')
  })

  test('5B: the repo file agentTypes, domains and worktreeRoot steer the dispatch', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('domain: backend', 'domain: web')
    f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ agentTypes: { web: 'frontend' }, domains: ['web', 'api'], worktreeRoot: '/trees' })
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(argvs(w).filter(a => a[0] === 'git')).toContainEqual(['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/web/BE-101', '/trees/acme-app-BE-101', 'origin/main'])
    expect(out.text).toContain('4. spawn prepared: frontend on opus')
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('frontend')
    expect(w.spawns[0]).toMatchObject({ cwd: '/trees/acme-app-BE-101' })
  })

  test('briefDir unset: the brief goes to <root>/.delegation/briefs/', async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(`2. brief ${ROOT}/.delegation/briefs/BE-101.brief.md written`)
    expect(w.files.has(`${ROOT}/.delegation/briefs/BE-101.brief.md`)).toBe(true)
  })

  test('briefDir unset and the root not writable: the session scratchpad is the fallback', async ($, on) => {
    const pad = '/private/tmp/claude-501/-repo-acme-app/sess-9/scratchpad'
    const w = world(on, { files: files(), dirs: { ...dirs, [pad]: [] }, run, sessionId: 'sess-9', skip: ['fs.write'] })
    on('fs.write', (_$, e) => {
      if (e.path.startsWith(`${ROOT}/`)) throw new Error(`EACCES: ${e.path}`)
      w.files.set(e.path, e.text)
      return { value: undefined } as never
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(`2. brief ${pad}/briefs/BE-101.brief.md written`)
    expect(w.files.has(`${pad}/briefs/BE-101.brief.md`)).toBe(true)
  })

  test('the full run adds the worktree from a sha base and ends with the spawn block; the brain makes it and the hook sets its folder', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run, agentId: 'agent-318', store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/** --base 96014e3b'))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', `${ROOT}-BE-101`, '96014e3b'],
    ])
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]).toMatchObject({
      prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.brief.md. Read it whole, then follow it exactly.`,
      cwd: `${ROOT}-BE-101`,
      model: 'opus',
    })
    // no map entry, so the domain's own type, which the session offers
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('backend')
    expect(out.text).toContain('4. spawn prepared: backend on opus')
    expect(out.text).toContain('tier=frontier → opus')
    expect(argvs(w).some(a => a[0] === 'bash')).toBe(false)
  })

  test('refuses a card that is not queued or claimed; nothing else runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: merged')
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(out.text).toContain('BE-101 is status merged; /dispatch takes a queued or claimed card')
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.runs).toHaveLength(0)
  })

  test('a non-sha --base is refused before anything runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --base HEAD~3'))
    expect(out.text).toContain('refused --base HEAD~3')
    expect(w.runs).toHaveLength(0)
  })

  // GH-16: repo=here, the main-checkout mode
  const onMain = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined)

  test('GH-16: --here writes a repo=here brief, cuts no worktree, runs no fetch, and spawns in the root', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: onMain, agentId: 'agent-h', store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --here --scope app/billing/Rate*.ts'))
    await brainSpawn($, String(out.text))
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    const header = brief.split('\n')[0] ?? ''
    expect(header).toContain(' gate=G2,G8p repo=here ignore=.delegation/**,agents/tasks/** scratch=/tmp/td/chassis-delegation/BE-101 spend=25 budget=3-attempts report=chassis.report.v1]]') // MOD-22: a repo=here brief names its scratch folder
    expect(header).not.toContain(' base=')
    // no worktree, no fetch: the only git the dispatch runs reads the current branch
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD']])
    expect(w.spawns[0]).toMatchObject({ prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.brief.md. Read it whole, then follow it exactly.`, cwd: ROOT, model: 'opus' })
    expect(brief).toContain(`Work in ${ROOT} on main; card ${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}.`)
    expect(out.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(out.text).not.toContain('3. worktree')
    expect(records(w, 'BE-101')[0]).toMatchObject({ attempt: 1, kind: 'spawn', here: ROOT })
  })

  /** Another repo=here card in flight in ROOT: a pending record marked here, its brief, and the files it claimed so far. */
  const inFlight = (task: string, scope: string, o: { files?: string[]; verdict?: string; here?: string | null } = {}) => {
    const path = `${ROOT}/.delegation/briefs/${task}.brief.md`
    const here = o.here === null ? {} : { here: o.here ?? ROOT }
    return {
      store: { [`delegation.tasks.${task}`]: [{ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: o.verdict ?? 'pending', at: 1, briefPath: path, ...here, ...(o.files ? { files: o.files } : {}) }] },
      files: { [path]: `[[brief v=1 task=${task} subtask=main tier=standard scope=${scope} forbid= gate=node repo=here]]\nbody` },
    }
  }
  const LLM = 'app/billing/Rate*.ts'

  test('GH-16: a card that says repo: here dispatches the same way; baseRef HEAD is pinned to its sha; ignore= adds the files in-flight cards claimed', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const HEAD_SHA = 'c'.repeat(40)
    const gh19 = inFlight('GH-19', 'src/**', { files: ['src/b.ts'] })
    const f = { ...files(), ...gh19.files }
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: queued\nrepo: here')
    f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ baseRef: 'HEAD', ignore: ['.delegation/**', 'traces/**'] })
    const run = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === 'HEAD' ? { exitCode: 0, stdout: `${HEAD_SHA}\n` } : onMain(argv))
    const w = world(on, { files: f, dirs, run, store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput(`BE-101 --scope ${LLM}`))
    const header = (w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(` gate=G2,G8p repo=here base=${HEAD_SHA} ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts scratch=/tmp/td/chassis-delegation/BE-101 spend=25 budget=3-attempts`)
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'],
      ['git', '-C', ROOT, 'rev-parse', 'HEAD'],
    ])
    expect(out.text).toContain(`   repo=here: base=${HEAD_SHA} · ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts`)
    expect(out.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(out.text).toContain(`brief ${SCRATCH}/briefs/BE-101.brief.md · repo=here in ${ROOT} · branch main · tier=frontier → opus`)
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT })
  })

  test('GH-16: a scope overlapping an in-flight repo=here card is refused, naming both cards and globs; --force-overlap dispatches with a warning', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const gh19 = inFlight('GH-19', 'app/**')
    const w = world(on, { files: { ...files(), ...gh19.files }, dirs, run: onMain, store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const refused = await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    expect(refused.text).toContain(`/dispatch BE-101: refused — BE-101 scope ${LLM} overlaps in-flight GH-19 scope app/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)`)
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.spawns).toHaveLength(0)
    const forced = await $.command.run(commandInput(`BE-101 --here --force-overlap --scope ${LLM}`))
    expect(forced.text).toContain(`   warning: BE-101 scope ${LLM} overlaps in-flight GH-19 scope app/** in the shared checkout (--force-overlap: dispatched anyway)`)
    expect(forced.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(spawnCallOf(String(forced.text))).toBeDefined()
  })

  test('GH-16: not in flight here: a card with a verdict, a worktree card, a card in another checkout', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const done = inFlight('GH-19', 'app/**', { verdict: 'consistent' })
    const tree = inFlight('GH-20', 'app/**', { here: null })
    const away = inFlight('GH-21', 'app/**', { here: '/repo/elsewhere' })
    const w = world(on, { files: { ...files(), ...done.files, ...tree.files, ...away.files }, dirs, run: onMain, store: { ...offered, ...done.store, ...tree.store, ...away.store } })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    expect(out.text).not.toContain('refused')
    expect(out.text).not.toContain('overlaps')
    expect(spawnCallOf(String(out.text))).toBeDefined()
  })

  test('GH-16: a repo=here hand-back is verified in the root: the dirty tree less ignore= and the files another in-flight card claimed', { options: { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full', gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' } }, async ($, on) => {
    const gh19 = inFlight('GH-19', 'src/**')
    const PORCELAIN = [' M app/billing/RateA.ts', '?? .delegation/briefs/BE-101.brief.md', ' M src/b.ts', ''].join('\0')
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[3] === 'status') return { exitCode: 0, stdout: PORCELAIN }
      return onMain(argv)
    }
    // GH-20: the brief has a red test, so the report names its red file, read in the shared checkout
    const RED_HERE = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
    const w = world(on, { files: { ...files(), ...gh19.files, ...RED_HERE }, dirs, run, agentId: 'agent-h', store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
    // meanwhile GH-19 handed back: its record now claims src/b.ts
    w.store.set('delegation.tasks.GH-19', [{ ...records(w, 'GH-19')[0], files: ['src/b.ts'] }])
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
    // ignore+= hides paths from the check: it waits for approval, never applied on the worker's word
    expect(row).toContain(`amend needs approval: ${AMEND} — append it to ${SCRATCH}/briefs/BE-101.brief.md and re-verify to accept it`)
    expect(w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').not.toContain('[[amend')
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([ROOT, ROOT])
    expect(argvs(w).some(a => a.includes('worktree') || a.includes('fetch'))).toBe(false)
    expect(records(w, 'BE-101')[0]).toMatchObject({ here: ROOT, files: ['app/billing/RateA.ts'], verdict: 'consistent' })
  })
})

describe('GH-16: a nested child repo is its own root', () => {
  test("the parent's .chassis-delegation.json is never consulted when the session root is the child", async ($, on) => {
    const PARENT = ROOT.slice(0, ROOT.lastIndexOf('/'))
    const reads: string[] = []
    const w = world(on, { files: { [`${PARENT}/.chassis-delegation.json`]: JSON.stringify({ tierMap: { standard: 'opus' }, baseRef: 'develop' }) }, skip: ['fs.read'] })
    on('fs.read', (_$, e) => {
      reads.push(e.path)
      const text = w.files.get(e.path)
      if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
      return { value: text } as never
    })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=standard]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('sonnet') // not the parent's tierMap
    const status = await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    expect(status.text).toContain(`config: no .chassis-delegation.json in ${ROOT}`)
    expect(status.text).toContain('base: origin/main → main → origin/master → master · repo=here ignore: .delegation/**')
    expect(reads).toContain(`${ROOT}/.chassis-delegation.json`)
    expect(reads.some(p => p.startsWith(`${PARENT}/.chassis-delegation.json`))).toBe(false)
  })
})

describe('GH-1: the adopter review leftovers (items 2, 5, 6, 8)', () => {
  const NO_BRIEF = 'no brief: no scope=/gate=/red_test= to check against'
  const CARDLESS = (sha: string, task?: string) =>
    `[[report v=1${task ? ` task=${task} subtask=main` : ''} branch=agent/mod/GH-77 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  /** A green worker repo where the sha resolves but is not an ancestor of the branch. */
  const offBranch = () => {
    const run = nativeRun({ gate: 0 })
    return (argv: string[]): RunAnswer | undefined => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : run(argv))
  }
  const verdictRows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))

  test('item 2: a plain Agent spawn with no header whose report names a sha off the branch is refuted, not "no brief header"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { classify: 'standard', agentId: 'agent-c', run: offBranch() })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Fixed the flake.\n' + CARDLESS('1234abcd', 'GH-77'), 'agent-c'))
    await $.agent.spawn(spawnInput({ prompt: 'Fix the flaky date test.' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'fix', prompt: 'Fix the flaky date test.' })
    const context = (r.context ?? []).join('\n')
    expect(context).not.toContain('no brief header')
    expect(context).toContain('chassis-delegation: verdict=refuted task=GH-77 attempt=1/3')
    expect(context.split('\n')[0]).toMatch(/ next=check the diff$/)
    expect(context).toContain('claim branch: held — refs/heads/agent/mod/GH-77')
    expect(context).toContain('claim sha: failed — sha 1234abcd exists but is NOT reachable on agent/mod/GH-77')
    expect(context).toContain(`claim scope: unchecked — ${NO_BRIEF}`)
    expect(context).toContain('claim files: held — files= matches the sha delta exactly')
    expect(context).toContain(`claim gate: unchecked — ${NO_BRIEF}`)
    expect(context).toContain(`claim red: unchecked — ${NO_BRIEF}`)
    expect(context).toContain('claim pr: held — no PR claimed')
    // the tree is the session root (the spawn named no cwd); no gate runs without a brief
    expect(w.runs.filter(x => isVerifyStart(x.argv))[0]?.argv.slice(0, 3)).toEqual(['git', '-C', ROOT])
    expect(w.runs.some(x => x.argv[0] === 'npx')).toBe(false)
    expect(records(w, 'GH-77')[0]).toMatchObject({ task: 'GH-77', subtask: 'main', attempt: 1, verdict: 'refuted', reportGate: 'pass', adhoc: true, agentId: 'agent-c' })
    const ledger = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n')
    expect(ledger).toHaveLength(1)
    expect(JSON.parse(ledger[0] ?? '{}')).toMatchObject({ task: 'GH-77', attempt: 1, verdict: 'refuted', next: 'check the diff' })
    expect(w.sent).toHaveLength(0)
  })

  test('item 2: a background ad hoc hand-back with a report and no task= is verified in the spawn cwd, recorded under adhoc-<key>, and posted', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const WT = '/work/tidy'
    const w = world(on, { classify: 'standard', agentId: 'agent-c', dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }) })
    await $.agent.spawn(spawnInput({ prompt: 'Tidy the README.', cwd: WT }))
    await $.turn.complete(turnInput('agent-c', 'Done.\n' + CARDLESS('1234abcd')))
    const row = verdictRows(w)[0] ?? ''
    expect(row.split('\n')[0]).toMatch(/^chassis-delegation: verdict=unverified task=adhoc-ABCDEFGH attempt=1\/3 .*next=check the diff$/)
    expect(row).toContain('claim sha: held')
    expect(w.runs.filter(x => isVerifyStart(x.argv))[0]?.argv.slice(0, 3)).toEqual(['git', '-C', WT])
    expect(records(w, 'adhoc-ABCDEFGH')[0]).toMatchObject({ attempt: 1, verdict: 'unverified', adhoc: true })
    // never a resume or a respawn: there is no brief to resume against
    expect(w.sent).toHaveLength(0)
    expect(w.spawns).toHaveLength(1)
  })

  const BRIEF = `${SCRATCH}/briefs/T-5.brief.md`
  const HEADER = (budget = 3) => `[[brief v=1 task=T-5 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=${budget}-attempts report=chassis.report.v1]]`
  const REPORT = '[[report v=1 task=T-5 subtask=main branch=agent/frontend/T-5 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const PROVE = 'resume agent=agent-5 — prove: gate (gate not re-run: prettier (not in gateMap))'

  test('item 5: an unverified verdict advises a resume naming the unchecked claims; the resume counts against the budget', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER() + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    const row = verdictRows(w)[0] ?? ''
    expect(row.split('\n')[0]).toBe(`chassis-delegation: verdict=unverified task=T-5 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=${PROVE}`)
    expect(row).not.toContain('check by hand')
    const sent = (await $.session.send({ to: 'agent-5', text: 'prove the gate', origin: { kind: 'model' } } as never)) as { isDelivered?: boolean }
    expect(sent.isDelivered).toBe(true)
    expect(records(w, 'T-5').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'unverified'], [2, 'resume', 1, 'pending']])
  })

  test('item 5: autoEscalate performs that resume, sending the unchecked claim lines', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER() + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    expect(verdictRows(w)[0]?.split('\n')[0]).toContain('verdict=unverified task=T-5 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=resumed agent=agent-5 (autoEscalate)')
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.text).toContain('claim gate: unchecked — gate not re-run: prettier (not in gateMap)')
    expect(w.sent[0]?.text).not.toContain('claim branch: held')
    expect(records(w, 'T-5').map(r => [r.attempt, r.kind, r.verdict])).toEqual([[1, 'spawn', 'unverified'], [2, 'resume', 'pending']])
  })

  test('item 5: past the budget an unverified verdict keeps "check by hand"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER(1) + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    expect(verdictRows(w)[0]?.split('\n')[0]).toContain('verdict=unverified task=T-5 attempt=1/1 usd=~0.00 model=claude-sonnet-5-5 next=check by hand — unverified is not a pass')
  })

  const WARN = 'warning: budget "frontier-60m" is not <n>-attempts; using the default 3'

  test('item 6: a card budget of frontier-60m warns once in the /dispatch output; the brief takes the default budget and the card tier', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out.split(WARN)).toHaveLength(2)
    const header = (w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(' tier=frontier model=opus ')
    expect(header).toContain(' budget=3-attempts ')
  })

  test("item 6: the spawn hook logs the same line to debug when a header's budget= is malformed", async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-6 subtask=main tier=standard budget=frontier-60m]]\nDo it.' }))
    expect(w.debugLogs).toContain(`chassis-delegation: T-6: ${WARN}`)
    expect(w.store.get('delegation.spawn.toolu_01ABCDEFGH')).toMatchObject({ budget: 3, tier: 'standard' })
    expect(w.spawns[0]?.model).toBe('sonnet')
  })

  const TIER_WARN = 'warning: tier "deep" is not economy, standard, frontier or premium; dispatched at standard'
  const cardAt = (tier: string) => FIXTURE_CARD.replace('tier: frontier', `tier: ${tier}`)

  test('GH-108: a card tier the mod does not know is named once and dispatched at standard', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: cardAt('deep') }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out.split(TIER_WARN)).toHaveLength(2)
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0]).toContain(' tier=standard model=sonnet ')
  })

  test('GH-108: a card tier that is a model name dispatches at its tier, no warning', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: cardAt('opus') }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out).not.toContain('warning: tier')
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0]).toContain(' tier=frontier model=opus ')
  })

  test('GH-108: the spawn hook maps a header tier= of a model name and logs the warning for an unknown one', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=opus]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.debugLogs.filter(l => l.includes('warning: tier'))).toEqual([])
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-9 subtask=main tier=deep]]\nDo it.', tool_use_id: 'toolu_0900000009' }))
    expect(w.debugLogs).toContain(`chassis-delegation: T-9: ${TIER_WARN}`)
    expect(w.spawns[1]?.model).toBe('sonnet')
  })

  test('item 8: a header tier or a caller model makes no classify call; the debug line names the source', async ($, on) => {
    let calls = 0
    const w = world(on, { skip: ['model.classify'] })
    on('model.classify', () => {
      calls += 1
      return { value: 'frontier' } as never
    })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-7 subtask=main tier=economy]]\nDo it.' }))
    expect(calls).toBe(0)
    expect(w.debugLogs).toContain("chassis-delegation: T-7: tier=economy picked by the brief header's tier= (no classify call)")
    await $.agent.spawn(spawnInput({ prompt: 'Look around.', model: 'haiku', tool_use_id: 'toolu_0200000002' }))
    expect(calls).toBe(0)
    expect(w.debugLogs).toContain("chassis-delegation: adhoc-00000002: tier=economy picked by the caller's model hint (haiku) (no classify call)")
    await $.agent.spawn(spawnInput({ prompt: 'Work out why the race happens.', tool_use_id: 'toolu_0300000003' }))
    expect(calls).toBe(1)
    expect(w.debugLogs).toContain('chassis-delegation: adhoc-00000003: tier=frontier picked by the classifier (classify called)')
  })

  const FABLE = 'tier=frontier → opus (fable requested; fable is never spawned by the mod)'

  test('item 8: a brief naming model=fable (or tier=premium) spawns opus, says so in the notice, and the record keeps requestedAlias', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=frontier model=fable]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(`${FABLE} · attempt 1/3`)
    expect(records(w, 'T-8')[0]).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-9 subtask=main tier=premium model=fable]]\nDo it.', tool_use_id: 'toolu_0200000002' }))
    expect(w.spawns[1]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(`${FABLE} · attempt 1/3`)
    expect(records(w, 'T-9')[0]).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    // the caller naming fable
    await $.agent.spawn(spawnInput({ prompt: 'Review this.', model: 'claude-fable-1', tool_use_id: 'toolu_0300000003' }))
    expect(w.spawns[2]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(FABLE)
    expect(((w.store.get('delegation.adhoc') ?? []) as Record<string, unknown>[]).at(-1)).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    // a brief that never names fable keeps its plain notice and no requestedAlias
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-10 subtask=main tier=frontier]]\nDo it.', tool_use_id: 'toolu_0400000004' }))
    expect(w.notices.at(-1)).toBe('tier=frontier → opus (brief) · attempt 1/3')
    expect(records(w, 'T-10')[0]?.requestedAlias).toBeUndefined()
  })
})

describe('GH-101: the queue never holds a phantom', () => {
  const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const BRIEFS = { options: { briefDir: `${SCRATCH}/briefs` } }
  const cardFiles = { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }
  const cardDirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const TOOL = 'mcp__chassis-delegation__dispatch'

  test('(a) both workers hand back: the queued task is said ready once, the brain starts it, with a toast naming it (MOD-12)', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const queued = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queued.deny).toContain('queued: T-9 — the mod will tell you when a slot frees')
    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    await $.turn.complete(turnInput('agent-2', '[[report v=1 task=T-2 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    expect(w.spawns).toHaveLength(2)
    const ready = w.appended.filter(a => a.text.includes('ready: T-9 — run its spawn block'))
    expect(ready).toHaveLength(1)
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
    expect(w.toasts.some(t => /^started queued T-9 \(waited \d+ min\)$/.test(t))).toBe(true)
  })

  test('(b) a second dispatch of a queued task says already queued and queues nothing more', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles, dirs: cardDirs, listAgents: true, store: offered })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const first = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(first.text).toContain('queued (position 1)')
    const again = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(again).toMatch(/queued: BE-101 — the mod will tell you when a slot frees; already queued since \d\d:\d\d \(position 1\)/)
    const viaCommand = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(viaCommand.text).toMatch(/already queued since \d\d:\d\d \(position 1\)/)
    expect(queueOf(w)).toHaveLength(1)
    expect(w.spawns).toHaveLength(2)
  })

  test('(c) a by-hand spawn of a queued task takes its queued place', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queueOf(w)).toHaveLength(1)
    // a worker dies with no turn.complete: the slot is free, nothing has drained yet
    const dead = w.agents.find(a => a.id === 'agent-1')
    if (dead) dead.status = 'completed'
    const res = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(res.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
  })

  test('(d) the queued refusal names live agents and queued rows apart', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('BE-310'), tool_use_id: 'toolu_A0000001' }))
    const res = await $.agent.spawn(spawnInput({ prompt: brief('BE-314'), tool_use_id: 'toolu_B0000002' }))
    expect(res.deny).toBe('queued: BE-314 — the mod will tell you when a slot frees (1 live: BE-310; 1 queued: BE-314)')
    expect(w.spawns).toHaveLength(1)
  })
})

describe('MOD-1: one proof of red per task, and --verify at the last attempt\'s own sha re-judges it', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** red_test="npx vitest run a/x.test.ts" gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: npx vitest run a/x.test.ts\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card for the red proof.\n'
  const WT = `${ROOT}-T-4`
  const RED_1 = '.delegation/T-4/red-1.txt'
  const RED_TEXT = 'FAIL a/x.test.ts\n  ✗ adds two numbers\n    AssertionError: expected 3 to be 4\n'
  const REPORT = (sha: string, red: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass red=${red} files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))
  const setup = (on: Parameters<typeof world>[0], gate: { v: number }) => {
    const repo = nativeRun({ gate: 0 })
    return world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [`${WT}/${RED_1}`]: RED_TEXT, [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD },
      dirs: { [WT]: [], [`${WT}/.delegation/T-4`]: ['red-1.txt'], [`${ROOT}/agents/tasks`]: [CARD_NAME] },
      run: argv => (argv[0] === 'npx' ? { exitCode: gate.v, stdout: gate.v ? 'a/x.ts: not formatted\n' : '' } : argv[3] === 'diff' && !argv.includes('--name-status') ? { exitCode: 0, stdout: 'a/x.ts\n' } : repo(argv)),
      agentId: 'agent-4',
    })
  }

  test('--verify at the sha attempt 1 handed back re-judges attempt 1: no attempt 2, red held, no budget line', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 1 }
    const w = setup(on, gate)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    expect(rows(w)[0]).toContain('verdict=refuted task=T-4 attempt=1/3')
    gate.v = 0
    const out = String((await $.command.run(commandInput('T-4 --verify 1234abcd'))).text)
    expect(out.split('\n')[0]).toBe('re-judging attempt 1/3 at 1234abcd')
    expect(out).toContain('claim red: held')
    expect(out).toContain('verdict=consistent task=T-4 attempt=1/3')
    expect(out).not.toContain('budget exhausted')
    expect(records(w, 'T-4').map(r => [r.attempt, r.verdict])).toEqual([[1, 'consistent']])
    expect(w.spawns).toHaveLength(1)
  })

  test("a resume hand-back at a new sha whose red= is attempt 1's held file is held on red", { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const gate = { v: 1 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    expect(rows(w)[0]).toContain('claim red: held')
    gate.v = 0
    await $.turn.complete(turnInput('agent-4', 'Docs.\n' + REPORT('5678abcd', RED_1)))
    expect(rows(w)[1]).toContain("claim red: held — attempt 1's proof, reused (one proof per task)")
    expect(rows(w)[1]).toContain('verdict=consistent task=T-4 attempt=2/3')
  })

  // MOD-41: the brain resumes a worker after a consistent verdict (SendMessage, not advised by the mod)
  const ledgerRows = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)

  test('MOD-41: a hand-back at a new sha after a consistent verdict is attempt 2/3 and writes one ledger row; at the same sha again it writes nothing', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 0 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111', RED_1)))
    expect(rows(w)[0]).toContain('verdict=consistent task=T-4 attempt=1/3')
    expect(ledgerRows(w)).toHaveLength(1)
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222', RED_1)))
    expect(rows(w)).toHaveLength(2)
    expect(rows(w)[1]).toContain('verdict=consistent task=T-4 attempt=2/3')
    expect(ledgerRows(w)).toHaveLength(2)
    expect(ledgerRows(w)[1]).toMatchObject({ task: 'T-4', attempt: 2, kind: 'resume', verdict: 'consistent' })
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'consistent'], [2, 'resume', 1, 'consistent']])
    // the same hand-back again, and the first sha again: nothing new
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222', RED_1)))
    expect(rows(w)).toHaveLength(2)
    expect(ledgerRows(w)).toHaveLength(2)
    expect(records(w, 'T-4')).toHaveLength(2)
  })

  test('MOD-41: a hand-back past the budget is judged, and its row says the budget is spent', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 0 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111', RED_1)))
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('2222222', RED_1)))
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('3333333', RED_1)))
    gate.v = 1
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('4444444', RED_1)))
    expect(rows(w)).toHaveLength(4)
    expect(rows(w)[3]).toContain('verdict=refuted task=T-4 attempt=4/3')
    expect(rows(w)[3]).toContain('next=stop — budget exhausted')
    expect(ledgerRows(w)).toHaveLength(4)
  })
})

describe('GH-104: spend guards', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card for the spend guards.\n'
  const WT = `${ROOT}-T-4`
  const BRANCH = 'agent/frontend/T-4'
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const SHORT = HEAD.slice(0, 7)
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
  const WORK_PRESENT = `work present at ${SHORT} on ${BRANCH}: verify it (next=verify sha=${HEAD})`
  /**
   * The worker's worktree, answered from memory: HEAD is HEAD on BRANCH, `ahead`
   * commits past origin/main (the base), the tree clean unless `dirty`, the delta
   * a/x.ts, the gate (npx …) red unless `gate` says otherwise.
   */
  const worker = (o: { ahead?: number; dirty?: boolean; gate?: number } = {}) => (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    // MOD-4: the work is not on origin/main yet (its owed row stays)
    if (sub[0] === 'merge-base' && last === 'origin/main') return { exitCode: 1, stdout: '' }
    // the delta as either spelling asks for it: --name-only (this base), --name-status (a rename-aware verifier)
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
    if (sub[0] === 'log') return { exitCode: 0, stdout: Array.from({ length: o.ahead ?? 2 }, (_, i) => `${i + 3}`.repeat(40)).join('\n') + (o.ahead === 0 ? '' : '\n') }
    if (sub[0] === 'status') return { exitCode: 0, stdout: o.dirty ? ' M a/x.ts\n' : '' }
    return undefined
  }
  // The rows that reached the conversation (the kit logs a plugin's refused append), never the debug log.
  const posted = (w: { logs: string[]; debugLogs: string[]; appended: { type: string; text: string }[] }) => {
    const debug = new Set(w.debugLogs)
    // MOD-74: the started and handed-back rows are not verdict rows
    return [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: '))].filter(t => !/^chassis-delegation: \S+ (started|resumed|started from queue|handed back) · /.test(t))
  }
  const files = () => ({ [BRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD })
  const dirs = { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] }

  test('(a, c) a no-report then a respawn stays at the brief tier; the notice names the model and the attempt', async ($, on) => {
    const w = world(on, { files: files(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.notices.at(-1)).toBe('tier=standard → sonnet (brief) · attempt 1/3')
    await $.turn.complete(turnInput('agent-4', 'I ran out of road.'))
    expect(records(w, 'T-4')[0]).toMatchObject({ attempt: 1, verdict: 'no-report' })
    // the brain respawns by hand: a no-report is a reporting defect, not a reason to go one tier up
    const r = await $.agent.spawn(spawnInput({ prompt: PROMPT, tool_use_id: 'toolu_02RESPAWN' }))
    expect(r.deny).toBeUndefined()
    expect(w.spawns[1]?.model).toBe('sonnet')
    expect(w.notices.at(-1)).toBe('tier=standard → sonnet (brief) · attempt 2/3')
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.tier, x.source])).toEqual([
      [1, 'spawn', 'standard', 'brief'],
      [2, 'spawn', 'standard', 'brief'],
    ])
    // the debug line keeps the tier source
    expect(w.debugLogs).toContain("chassis-delegation: T-4: tier=standard picked by the brief header's tier= (no classify call)")
  })

  test('(a) autoEscalate: no-report resumes, a second no-report advises a respawn at the SAME tier (MOD-12: the brain makes it)', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: files(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    await $.turn.complete(turnInput('agent-4', 'Working on it.'))
    expect(w.sent).toHaveLength(1)
    await $.turn.complete(turnInput('agent-4', 'Still working on it.'))
    expect(posted(w)[1]?.split('\n')[0]).toBe(`chassis-delegation: verdict=no-report task=T-4 attempt=2/3 usd=~0.00 model=claude-sonnet-5-5 next=respawn at standard — same brief ${BRIEF}, make the spawn block below (it names the model)`)
    // the row carries the spawn block at the same tier; the brain makes it
    expect(spawnCallOf(posted(w)[1] ?? '')).toMatchObject({ model: 'sonnet', description: 'T-4 standard sonnet' })
    expect(w.spawns).toHaveLength(1)
    await brainSpawn($, posted(w)[1] ?? '', { tool_use_id: 'toolu_03RESPAWN' })
    expect(w.spawns[1]?.model).toBe('sonnet')
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.tier, x.source, x.verdict])).toEqual([
      [1, 'spawn', 'standard', 'brief', 'no-report'],
      [2, 'resume', 'standard', 'resume', 'no-report'],
      [3, 'spawn', 'standard', 'brief', 'pending'],
    ])
  })

  test('(b) work present in the worktree (commits ahead of the base, a clean tree): no resume, no respawn; the row says verify it', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    // the worker finished, but its report line never reached the mod
    await $.turn.complete(turnInput('agent-4', 'All done, the gate is green.'))
    expect(w.sent).toHaveLength(0)
    expect(w.spawns).toHaveLength(1)
    const row = posted(w)[0] ?? ''
    expect(row.split('\n')[0]).toBe(`chassis-delegation: T-4 attempt 1/3 no-report · 🔵 sonnet · ~$0.00 · next=verify sha=${HEAD}`)
    expect(row).toContain(WORK_PRESENT)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict, x.sha ?? null])).toEqual([
      [1, 'spawn', 'no-report', null],
      [2, 'verify', 'work-present', HEAD],
    ])
    // only allowlisted git reads, in the worker's worktree
    expect(w.runs.every(x => x.argv[0] === 'git' && (x.argv[2] === WT ? ['rev-parse', 'status', 'log'] : ['ls-tree']).includes(x.argv[3] ?? ''))).toBe(true) // MOD-60: the merged check lists origin/main's cards from the repo root
    // the delegation state says what is owed
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''
    expect(section).toContain(`- owed: T-4: verify sha=${HEAD}`)
    // a respawn by hand is not spawned either, and records nothing new
    const again = await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT, tool_use_id: 'toolu_02AGAIN' }))
    expect(again.deny).toContain(WORK_PRESENT)
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'T-4')).toHaveLength(2)
  })

  // MOD-4: an owed row retires by itself when the work is on origin/main, or by hand
  const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const owedWorkPresent = async ($: any, on: any, ancestor: number) => {
    const base = worker()
    const w = world(on, { files: files(), dirs, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: ancestor, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done, the gate is green.'))
    return w
  }

  test('MOD-4: after an owed attempt whose sha is an ancestor of origin/main, /delegation prints no row for it and the record says retired: merged', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 0)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegationCmd(''))).text)
    expect(out).not.toContain('owed: T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'merged' })
    expect(w.runs.some(x => x.argv.includes('--is-ancestor') && x.argv.includes('origin/main') && x.argv.includes(HEAD))).toBe(true)
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''
    expect(section).not.toContain('T-4')
  })

  test('MOD-4: a sha that is not on origin/main keeps its row, and the check runs once per 15 minutes', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 1)
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegationCmd(''))).text)).toContain(`- owed: T-4: verify sha=${HEAD}`)
    const n = () => w.runs.filter(x => x.argv.includes('--is-ancestor')).length
    const first = n()
    expect(first).toBeGreaterThan(0)
    await $.command.run(delegationCmd(''))
    expect(n()).toBe(first)
  })

  test('MOD-4: /delegation accept <id> [note] records it on the last attempt, retires the row, prints one line; an unknown id changes nothing', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 1)
    await $.session.start(sessionStart)
    const before = JSON.stringify(records(w, 'T-4'))
    const none = String((await $.command.run(delegationCmd('accept NOPE-9 fine'))).text)
    expect(none.split('\n')).toHaveLength(1)
    expect(JSON.stringify(records(w, 'T-4'))).toBe(before)
    const out = String((await $.command.run(delegationCmd('accept T-4 reviewed by hand'))).text)
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'reviewed by hand' } })
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
  })

  test('(b) /dispatch --verify <sha> runs the verifier on the branch head with a synthetic report, no spawn; the work-present attempt takes the verdict', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker({ gate: 0 }), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done.'))
    expect(records(w, 'T-4').at(-1)).toMatchObject({ attempt: 2, verdict: 'work-present' })
    const out = String((await $.command.run(commandInput(`T-4 --verify ${HEAD}`))).text)
    expect(out).toContain(`[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass files=a/x.ts]]`)
    expect(out).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=2/3')
    expect(out).toContain('next=accept')
    expect(out).toContain('claim files: held — files= matches the sha delta exactly')
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([WT])
    expect(w.spawns).toHaveLength(1)
    expect(w.sent).toHaveLength(0)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict])).toEqual([
      [1, 'spawn', 'no-report'],
      [2, 'verify', 'consistent'],
    ])
  })

  test('(b) --verify with no work-present attempt judges a new verify attempt; a red gate refutes it, nothing spawns', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)
    expect(out).toContain(`/dispatch T-4 --verify ${SHORT}: no spawn — the verifier ran on worktree ${WT} at ${SHORT} (base origin/main)`)
    expect(out).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=1/3')
    expect(out).toContain(`claim gate: failed — gate=pass claimed but the gate is RED at ${SHORT} (exit 1)`)
    expect(out).toContain(`next=respawn at frontier — same brief ${BRIEF}`)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict, x.sha])).toEqual([[1, 'verify', 'refuted', SHORT]])
    expect(w.spawns).toHaveLength(0)
  })

  test('(b) --verify waits for a worker still running in the tree; a bad sha or a missing brief is refused before any git runs', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4', listAgents: true })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    const runs = w.runs.length
    expect(String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)).toBe(`/dispatch T-4 --verify ${SHORT}: attempt 1 of T-4 is still running (agent agent-4); --verify judges finished work`)
    expect(String((await $.command.run(commandInput('T-4 --verify HEAD'))).text)).toBe('refused --verify HEAD: name the branch head as a 7-40 character hex sha')
    w.files.delete(BRIEF)
    expect(String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)).toContain(`/dispatch T-4 --verify ${SHORT}: no brief for T-4 under ${ROOT}/.delegation/briefs`)
    expect(w.runs.length).toBe(runs)
    expect(records(w, 'T-4')).toHaveLength(1)
  })

  test('(b) the sha the verifier already judged is not work present: a refuted attempt is still resumed', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', `Done.\n[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${SHORT} gate=pass files=a/x.ts]]`))
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'refuted', sha: SHORT })
    expect(w.sent).toHaveLength(1)
    expect(posted(w)[0]).not.toContain('work present')
  })

  test('(b) a dirty tree is not work present: resumed as before', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const dirty = world(on, { files: files(), dirs, run: worker({ dirty: true }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Half done.'))
    expect(dirty.sent).toHaveLength(1)
    expect(records(dirty, 'T-4').map(x => x.verdict)).toEqual(['no-report', 'pending'])
  })

  test('(b) no commits ahead of the base: resumed as before', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker({ ahead: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Nothing yet.'))
    expect(w.sent).toHaveLength(1)
  })

  test('(b) repo=here: no look at the worktree, the resume goes ahead', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const here = HEADER.replace(' budget=', ' repo=here budget=')
    const w = world(on, { files: { ...files(), [BRIEF]: here + '\nbody' }, dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: ROOT }))
    await $.turn.complete(turnInput('agent-4', 'All done.'))
    expect(w.sent).toHaveLength(1)
    expect(w.runs.some(x => x.argv[3] === 'log')).toBe(false)
  })

  test('(c) /dispatch line 4 names the model and the attempt', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD }, dirs: { [`${ROOT}/agents/tasks`]: [CARD_NAME] }, agentId: 'agent-7' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('T-4'))).text)
    expect(out).toMatch(/^4\. spawn prepared: general-purpose on sonnet · tier=standard \(brief\) · attempt 1\/3 — nothing runs until the Agent call below is made$/m)
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, out)
    expect(w.spawns[0]?.model).toBe('sonnet')
  })
})

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
    w.store.set('delegation.tasks.T-4', [{ attempt: 1, subtask: 'main', kind: 'spawn', tier: 'standard', alias: 'sonnet', verdict: 'no-report', source: 'brief', purpose: 'build', briefPath: BRIEF }])
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

  test('the status line names each live worker with its running cost', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-6', listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-6', 'working', turnUsage(600_000, 100_000))) // $2.20: warned, carries on
    w.agents[0]!.status = 'running'
    await w.clock.advance(60_000) // the status line's tick
    expect(w.statuses.at(-1)).toContain('(1 live: T-6 $2.20)')
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
    expect(out).toContain('warning: forbid artifacts/*.html matches artifacts/kit/index.html named in done-when')
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
    expect(w.store.get('delegation.classifier.OPS-1')).toEqual({ card: 'standard', classifier: 'economy' })
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

  test('MOD-91 (#156): a debrief whose check fails twice starts no third time, says the stopped row once, and leaves .check.txt and .orig.json beside the debrief', { options: { autoEval: false } }, async ($, on) => {
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
      await w.clock.advance(20 * MIN)
    }
    await $.session.start(sessionStart)
    await idle(0)
    expect(w.spawns).toHaveLength(1)
    await $.turn.complete(turnInput('agent-1', `Wrote ${DEBRIEF}`))
    // the failed attempt started a moment ago: the cooldown holds, though the last passed debrief is old
    await idle(0)
    expect(w.spawns).toHaveLength(1)
    await idle(7)
    expect(w.spawns).toHaveLength(2)
    w.files.set(DEBRIEF, bad)
    await $.turn.complete(turnInput('agent-2', `Wrote ${DEBRIEF}`))
    expect(w.store.get('delegation.debrief.sess-1')).toMatchObject({ watermark: 1, failedChecks: { watermark: 10, count: 2 } })
    await idle(7)
    await idle(7)
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
    expect(other.deny).toBe('queued: T-2 — the mod will tell you when a slot frees (1 live: BE-101; 1 queued: T-2)')
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
    const w = world(on, { files: { ...files(), ...gh19.files, ...RED_HERE }, dirs, run, agentId: 'agent-h', store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text)
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, out)
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT, model: 'opus' })
    w.store.set('delegation.tasks.GH-19', [{ ...records(w, 'GH-19')[0], files: ['src/b.ts'] }])
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
    w.store.set('delegation.effort.T-6', 'xhigh')
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
    const w = world(on, { files: { ...ledgerFile, [BRIEF]: HEADER + '\nbody' }, store: legacyStore, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const lines = ledgerOf(w)
    expect(lines.slice(0, 2)).toEqual(legacyLedger)
    expect(lines).toHaveLength(3)
    expect(lines[2]).toMatchObject({ task: 'T-4', verdict: 'consistent', next: 'accept' })
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
    expect(delivered(w)).toContain('claim gate: failed — gate=pass claimed but the gate is RED at 1234abcd (exit 1)')
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
    expect(held).toMatchObject({ holder: 'T-4', since: NOW, until: NOW + 9 * 60 * 1000 })
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
  const handBack = async ($: Tester, on: On, over: { header?: string; cwd?: string; dirs?: Record<string, string[]>; agentSays?: string } = {}) => {
    const w = world(on, { files: { [BRIEF]: (over.header ?? HEADER) + '\nbody' }, ...(over.dirs ? { dirs: over.dirs } : {}), run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
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

  test('review off (the default): a consistent hand-back says next=accept and prints no spawn block', { options: FULL }, async ($, on) => {
    const w = await handBack($, on)
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
    expect(w.store.get('delegation.outside.OPS-9')).toMatchObject({
      roots: [
        { root: '/out/hair', entries: [{ path: 'old.txt', size: 1, mtimeMs: 0 }] },
        { root: '/out/notes', entries: [] },
      ],
    })
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
    expect(w.runs.filter(r => r.argv[0] === 'checker').map(r => ({ argv: r.argv, cwd: r.cwd }))).toEqual([{ argv: ['checker', '/out/hair'], cwd: '/out/hair' }])
    expect(records(w, 'OPS-9')[0]).toMatchObject({ verdict: 'consistent', metrics: { tris: '1200', len_s: '2.4' } })
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
      const saved = w.store.get('delegation.outside.OPS-9') as { roots: Record<string, unknown>[] }
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
    expect(verifying.filter(a => a[0] === 'git' && a[2] === OTHER).map(a => a.slice(3, 5))).toEqual([['merge-base', '--is-ancestor']])
    expect(verifying.some(a => a[0] === 'git' && a.includes('origin/main'))).toBe(true)
    // the gate is /other's own detected gate, run in /other-T-1
    const gate = w.runs.slice(before).find(r => r.argv[0] === 'npm')
    expect(gate?.argv).toEqual(['npm', 'test'])
    expect(gate?.cwd).toBe(WT)
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=T-1 attempt=1/2')
    expect(row).toContain('claim files: held — files= matches the sha delta exactly')
    // the attempt record's root is that repo; the ledger row goes to the session
    expect(records(w, 'T-1')[0]).toMatchObject({ task: 'T-1', attempt: 1, verdict: 'consistent', root: OTHER })
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
    expect(records(w, 'T-1').map(x => [x.attempt, x.kind, x.verdict, x.root])).toEqual([[1, 'verify', 'consistent', OTHER]])
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
    expect(w.store.has('delegation.tasks.T-OLD')).toBe(false)
    expect(w.store.has('delegation.spawn.k-old')).toBe(false)
    expect(w.store.has('delegation.agent.ag-k-old')).toBe(false)
    expect(w.store.has('delegation.spawn.k-run')).toBe(true)
    expect(w.store.has('delegation.tasks.T-RUN')).toBe(true)
    expect(w.store.has('delegation.tasks.T-NEW')).toBe(true)
    expect(w.store.has('delegation.recent.sess-0')).toBe(true)
    const line = /store: pruned 3 records \(\d+\.\d\d MiB to \d+\.\d\d MiB of 4 MiB\)/
    expect(delivered(w)).toMatch(line)
    expect(w.debugLogs.some(l => line.test(l))).toBe(true)
    // nothing left to prune: a second start says nothing more
    const rows = w.appended.length
    await $.session.start(sessionStart)
    expect(w.appended.slice(rows).some(a => a.text.startsWith('store: pruned'))).toBe(false)
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
