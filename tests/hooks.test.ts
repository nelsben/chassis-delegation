import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, agentResult, sessionStart, commandInput, composeInput, ROOT, SCRATCH, NOW, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME, FIXTURE_HEADER as PLAIN_HEADER } from './fixtures/sample-card'
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

  test('background worker, autoEscalate: first failure resumes it, the second respawns one tier up', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run: nativeRun(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=resumed agent=agent-4 (autoEscalate)')
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.to).toBe('agent-4') // the engine spells { agentId } as the id
    expect(w.sent[0]?.text).toContain(RED)
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'refuted'], [2, 'resume', 1, 'pending']])

    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('5678abcd')))
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=2/3 usd=~0.00 model=claude-sonnet-5-5 next=respawned at frontier')
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
    expect(rows(w)[0]?.text.split('\n')[0]).toBe('chassis-delegation: verdict=verified task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'verified' })
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
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'verified' })
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
    expect(row.split('\n')[0]).toBe('chassis-delegation: verdict=verified task=T-4 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 next=accept')
    expect(row).toContain('claim red: held — .delegation/T-4/red-1.txt, 79 bytes, first failure line: FAIL a/x.test.ts')
    const rec = records(w, 'T-4')[0] ?? {}
    expect(rec).toMatchObject({ verdict: 'verified', red: RED_1 })
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
    expect(rows(w)[1]).toContain('verdict=verified task=T-4 attempt=2/3')
    expect(rows(w)[1]).toContain("claim red: held — attempt 1's proof, reused (one proof per task)")
    expect(records(w, 'T-4').map(r => [r.attempt, r.verdict, r.red])).toEqual([[1, 'refuted', RED_1], [2, 'verified', RED_2]])
  })

  test('a brief with red_test=none yields no red claim', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const none = HEADER.replace(' red_test="npx vitest run a/x.test.ts"', ' red_test=none')
    const w = world(on, { files: { [BRIEF]: none + '\nbody' }, dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd')))
    const row = rows(w)[0] ?? ''
    expect(row.split('\n')[0]).toContain('verdict=verified task=T-4')
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
    expect(w.runs.some(r => r.argv[0] === 'git')).toBe(false)
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
    expect(String(out.text).trimEnd().split('\n').at(-1)).toBe('Set up. Tell Claude your first task in a sentence, for example: "add a function that reads a file header and returns its size, with a node --test test". Claude writes the card, shows you the brief, and dispatches when you say go.')
    expect(w.files.has(`${ROOT}/agents/tasks/README.md`)).toBe(true)
    expect(w.files.has(`${ROOT}/agents/tasks/OPS-000-sample.md`)).toBe(false)
    const viaTool = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__setup' } as never))
    expect(viaTool.trimEnd().split('\n').at(-1)).toBe('Ask the person for the first task, then call the card tool.')
    expect(viaTool).toContain('Set up. Tell Claude your first task')
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
  const behindClone = async ($: any, on: any, opts: { fetchFails?: boolean; dirty?: boolean } = {}) => {
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
    expect(w.spawns).toHaveLength(1)
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
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('general-purpose')
    expect(out.text).toContain('4. spawned general-purpose agent')
  })

  test('5B: the repo file agentTypes, domains and worktreeRoot steer the dispatch', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('domain: backend', 'domain: web')
    f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ agentTypes: { web: 'frontend' }, domains: ['web', 'api'], worktreeRoot: '/trees' })
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(argvs(w).filter(a => a[0] === 'git')).toContainEqual(['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/web/BE-101', '/trees/acme-app-BE-101', 'origin/main'])
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('frontend')
    expect(w.spawns[0]).toMatchObject({ cwd: '/trees/acme-app-BE-101' })
    expect(out.text).toContain('4. spawned frontend agent')
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

  test('the full run adds the worktree from a sha base and spawns with model omitted', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run, agentId: 'agent-318', store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/** --base 96014e3b'))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', `${ROOT}-BE-101`, '96014e3b'],
    ])
    expect(w.spawns[0]).toMatchObject({
      prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.brief.md. Read it whole, then follow it exactly.`,
      cwd: `${ROOT}-BE-101`,
      model: 'opus',
    })
    // the kit hands a plugin's spawn on in the Agent tool's own spelling (subagent_type);
    // no map entry, so the domain's own type, which the session offers
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('backend')
    expect(out.text).toContain('4. spawned backend agent')
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
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    const header = brief.split('\n')[0] ?? ''
    expect(header).toContain(' gate=G2,G8p repo=here ignore=.delegation/**,agents/tasks/** spend=25 budget=3-attempts report=chassis.report.v1]]')
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
    expect(header).toContain(` gate=G2,G8p repo=here base=${HEAD_SHA} ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts spend=25 budget=3-attempts`)
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'],
      ['git', '-C', ROOT, 'rev-parse', 'HEAD'],
    ])
    expect(out.text).toContain(`   repo=here: base=${HEAD_SHA} · ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts`)
    expect(out.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(out.text).toContain(`brief ${SCRATCH}/briefs/BE-101.brief.md · repo=here in ${ROOT} · branch main · agent agent-1`)
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
    expect(w.spawns).toHaveLength(1)
  })

  test('GH-16: not in flight here: a card with a verdict, a worktree card, a card in another checkout', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const done = inFlight('GH-19', 'app/**', { verdict: 'verified' })
    const tree = inFlight('GH-20', 'app/**', { here: null })
    const away = inFlight('GH-21', 'app/**', { here: '/repo/elsewhere' })
    const w = world(on, { files: { ...files(), ...done.files, ...tree.files, ...away.files }, dirs, run: onMain, store: { ...offered, ...done.store, ...tree.store, ...away.store } })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    expect(out.text).not.toContain('refused')
    expect(out.text).not.toContain('overlaps')
    expect(w.spawns).toHaveLength(1)
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
    await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    // meanwhile GH-19 handed back: its record now claims src/b.ts
    w.store.set('delegation.tasks.GH-19', [{ ...records(w, 'GH-19')[0], files: ['src/b.ts'] }])
    const AMEND = '[[amend v=1 ignore+=src/** reason=hide it]]'
    const REPORT = `[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=app/billing/RateA.ts]]`
    await $.turn.complete(turnInput('agent-h', `Done.\n${AMEND}\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=verified task=BE-101 attempt=1/3')
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
    expect(records(w, 'BE-101')[0]).toMatchObject({ here: ROOT, files: ['app/billing/RateA.ts'], verdict: 'verified' })
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

  test('(a) both workers hand back: the queued task starts before the turn ends, with a toast naming it', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const queued = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queued.deny).toContain('T-9 starts when a worker slot frees')
    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    await $.turn.complete(turnInput('agent-2', '[[report v=1 task=T-2 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    expect(w.spawns).toHaveLength(3)
    expect(String(w.spawns[2]?.prompt)).toContain('task=T-9')
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
    expect(again).toMatch(/already queued since \d\d:\d\d \(position 1\)/)
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
    expect(res.deny).toBe('queued by chassis-delegation: BE-314 starts when a worker slot frees (1 live: BE-310; 1 queued: BE-314)')
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
    expect(out).toContain('verdict=verified task=T-4 attempt=1/3')
    expect(out).not.toContain('budget exhausted')
    expect(records(w, 'T-4').map(r => [r.attempt, r.verdict])).toEqual([[1, 'verified']])
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
    expect(rows(w)[1]).toContain('verdict=verified task=T-4 attempt=2/3')
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
    return [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: '))]
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

  test('(a) autoEscalate: no-report resumes, a second no-report respawns at the SAME tier', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: files(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    await $.turn.complete(turnInput('agent-4', 'Working on it.'))
    expect(w.sent).toHaveLength(1)
    await $.turn.complete(turnInput('agent-4', 'Still working on it.'))
    expect(posted(w)[1]?.split('\n')[0]).toBe('chassis-delegation: verdict=no-report task=T-4 attempt=2/3 usd=~0.00 model=claude-sonnet-5-5 next=respawned at standard as agent-2 (autoEscalate)')
    // the mod's own spawn has no dialog to carry a notice: the record says the tier and its source
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
    expect(row.split('\n')[0]).toBe(`chassis-delegation: T-4 attempt 1/3 no-report · sonnet · ~$0.00 · next=verify sha=${HEAD}`)
    expect(row).toContain(WORK_PRESENT)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict, x.sha ?? null])).toEqual([
      [1, 'spawn', 'no-report', null],
      [2, 'verify', 'work-present', HEAD],
    ])
    // only allowlisted git reads, in the worker's worktree
    expect(w.runs.every(x => x.argv[0] === 'git' && x.argv[2] === WT && ['rev-parse', 'status', 'log'].includes(x.argv[3] ?? ''))).toBe(true)
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
    expect(out).toContain('chassis-delegation: verdict=verified task=T-4 attempt=2/3')
    expect(out).toContain('next=accept')
    expect(out).toContain('claim files: held — files= matches the sha delta exactly')
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([WT])
    expect(w.spawns).toHaveLength(1)
    expect(w.sent).toHaveLength(0)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict])).toEqual([
      [1, 'spawn', 'no-report'],
      [2, 'verify', 'verified'],
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
    expect(out).toMatch(/^4\. spawned general-purpose agent agent-7 on \S+ · attempt 1\/3$/m)
    expect(w.spawns[0]?.model).toBe('sonnet')
  })
})

describe('GH-107: a drained spawn that is refused keeps its place at the head of the queue', () => {
  const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const report = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
  const rowsOf = (w: { appended: { type: string; text: string }[] }) => w.appended.filter(a => a.type === 'user').map(a => a.text)

  test('(a) one worker hands back: A starts, B stays queued at position 1', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-8'), tool_use_id: 'toolu_C0000008' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(queueOf(w).map(q => q.task)).toEqual(['T-8', 'T-9'])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.spawns).toHaveLength(3)
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

  test('(b) A is refused at the drain for work present: A leaves the queue with a row saying so, and B starts', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: worker, files: { [BRIEF]: HEADER + '\nbody' }, dirs: { [WT]: [] } })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const a = { prompt: `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`, description: 'task', subagentType: 'general-purpose', cwd: WT, task: 'T-4', subtask: 'main', at: 1000 }
    const b = { prompt: brief('T-9'), description: 'task', subagentType: 'general-purpose', task: 'T-9', subtask: 'main', at: 2000 }
    w.state.set('chassis-delegation.queue', [a, b])
    // T-4 already had an attempt: its worktree holds finished work
    w.store.set('delegation.tasks.T-4', [{ attempt: 1, subtask: 'main', kind: 'spawn', tier: 'standard', alias: 'sonnet', verdict: 'no-report', source: 'brief', purpose: 'build', briefPath: BRIEF }])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
    const row = rowsOf(w).concat(w.logs).find(r => r.startsWith('chassis-delegation: queued T-4 not started: ')) ?? ''
    expect(row).toContain('work present at')
    expect(row).toContain('; it is removed from the queue (retrying cannot succeed)')
  })
  test('(c) a transient refusal keeps A at the head and posts its row once, however often the drain runs', { options: { gateMap: '{"prettier":"npx prettier --check {files}"}' } }, async ($, on) => {
    const w = world(on, { listAgents: true, run: worker, spawnDeny: e => (String(e.prompt).includes('T-4') ? 'the engine is busy' : undefined) })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const a = { prompt: brief('T-4'), description: 'task', subagentType: 'general-purpose', task: 'T-4', subtask: 'main', at: 1000 }
    const b = { prompt: brief('T-9'), description: 'task', subagentType: 'general-purpose', task: 'T-9', subtask: 'main', at: 2000 }
    w.state.set('chassis-delegation.queue', [a, b])
    await $.turn.complete(turnInput('agent-1', report('T-1')))
    await $.turn.complete(turnInput('agent-2', report('T-2')))
    expect(queueOf(w).map(q => q.task)).toEqual(['T-4', 'T-9'])
    const posted = rowsOf(w).concat(w.logs).filter(r => r.startsWith('chassis-delegation: queued T-4 not started: '))
    expect(posted).toHaveLength(1)
    expect(posted[0]).toContain('the engine is busy; it keeps its place (position 1)')
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
    const REPORT = `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=a/x.ts]]`
    await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=verified task=T-4 attempt=1/3')
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
    await $.command.run(commandInput(`T-4 --base ${BASE}`))
    const REPORT = `[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass red=none files=a/x.ts]]`
    await $.turn.complete(turnInput('agent-4', `Done.\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('verdict=verified task=T-4')
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

  test('with dispatch: true it dispatches the card it wrote: one spawn', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = resultText(await $.tool.call({ tool: TOOL, ...given, dispatch: true } as never))
    expect(out).toContain(`wrote ${ROOT}/agents/tasks/OPS-1-the-rom-reader-returns-the-header.md`)
    expect(out).toContain('4. spawned')
    expect(out).not.toContain('Say go and Claude dispatches')
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
    await $.tool.call({ tool: TOOL, ...given, title: 'Another thing', dispatch: true } as never)
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
    await $.turn.complete(mainTurn(usage(FABLE, 100_000, 10_000, 500_000, 20_000))) // $2.25
    await $.turn.complete(mainTurn(usage(FABLE, 0, 0)))
    const out = await $.command.run(delegation)
    expect(out.text).toContain('brain: fable $2.25 over 2 turns · workers $0.00 (0 attempts) · brain share 100%')
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
    expect(out.text).toContain('Spend split: brain $2.25 / workers $0.00')
    expect(out.text).toContain('brain · fable · $2.25 · 630k tok · 1 turn')
  })
})
