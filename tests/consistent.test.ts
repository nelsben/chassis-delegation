// MOD-19: the verdict says what it checked. `verified` became `consistent`
// (public issue #1): the report is consistent with git, nothing read the diff.
// What the mod writes says consistent; the old word is still read, as
// consistent, until 0.9.0. Pure: the engine half is in hooks.test.ts.
import { test, expect, describe } from 'claude-code/testing'
import { parseReport } from '../hooks/lib/brief'
import { advise, verdictLine, type AdviseInput } from '../hooks/lib/verify'
import { escalatesOn, escalationSource, readLine, readRecord, readVerdict, type AttemptRecord } from '../hooks/lib/attempts'
import { quietLine } from '../hooks/lib/quiet'
import { noRepoVerdict, noRepoVerdictText } from '../hooks/lib/norepo'
import { verifyNative, type ExecOut, type RedEvidence } from '../hooks/lib/verify-native'
import { dashboardText, firstTry, liveView, modelLabel, spendByModel, verdictMark } from '../hooks/lib/live'
import { applyMetric, emptyMetrics, fillMetrics, isFalseRefute, metricsFromRecords } from '../hooks/lib/metrics'
import { blocksFor, decisionText } from '../hooks/lib/dashboard'

// The old word, held in one place so the rest of the file reads as what it is: a stored value from before the rename.
const OLD = 'verified' as never

const NOW = 10_000_000
const rec = (o: Partial<AttemptRecord> & { task: string }): AttemptRecord => ({
  subtask: 'main',
  attempt: 1,
  kind: 'spawn',
  lineage: 1,
  tier: 'standard',
  alias: 'sonnet',
  verdict: 'pending',
  at: NOW - 600_000,
  ...o,
})

// ---- a fully held report, through the native verifier ----------------------------------------------

const REPO = '/w/repo-T-1'
const FULL = 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678'
const MB = '0000000000000000000000000000000000000abc'
const HEADER = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=src/secret/** gate=test budget=2-attempts report=chassis.report.v1]]'
const ok = (stdout = ''): ExecOut => ({ ok: true, exitCode: 0, stdout, stderr: '' })
const git = (...args: string[]) => ['git', '-C', REPO, ...args].join(' ')
const TABLE: Record<string, ExecOut> = {
  [git('rev-parse', '--verify', '--quiet', 'a1b2c3d^{commit}')]: ok(FULL + '\n'),
  [git('rev-parse', '--verify', '--quiet', 'refs/heads/agent/ops/T-1')]: ok(FULL + '\n'),
  [git('merge-base', '--is-ancestor', FULL, 'refs/heads/agent/ops/T-1')]: ok(),
  [git('rev-parse', '--verify', '--quiet', 'origin/main')]: ok(MB + '\n'),
  [git('merge-base', 'origin/main', FULL)]: ok(MB + '\n'),
  [git('diff', '--name-status', '-M', MB, FULL)]: ok('A\tsrc/a.ts\nA\tdocs/x.md\n'),
  [git('rev-parse', 'HEAD')]: ok(FULL + '\n'),
  [git('status', '--porcelain')]: ok(''),
  'npm test': ok('all green\n'),
}
const heldVerdict = async () => {
  const report = parseReport('[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=a1b2c3d gate=pass files=src/a.ts,docs/x.md]]')
  return verifyNative(
    { repo: REPO, report, briefText: `${HEADER}\n\nbody\n`, gateMap: { test: 'npm test' }, allowed: argv => argv.join(' ') === 'npm test', filesPath: '/r/.delegation/T-1/files.txt' },
    {
      exec: async argv => TABLE[argv.join(' ')] ?? { ok: true, exitCode: 1, stdout: '', stderr: `no such answer: ${argv.join(' ')}` },
      write: async () => {},
      readRed: async (): Promise<RedEvidence> => ({ exists: false }),
    },
  )
}

describe('MOD-19: a report whose every claim holds is consistent, not verified', () => {
  test('the native verifier says consistent, and the verdict row and the one-line row read it', async () => {
    const v = await heldVerdict()
    expect(v.verdict).toBe('consistent')
    expect(verdictLine({ verdict: v.verdict, task: 'T-1', attempt: 1, budget: 2, usd: 0.19, model: 'claude-sonnet-5-5', next: 'accept' })).toBe(
      'chassis-delegation: verdict=consistent task=T-1 attempt=1/2 usd=0.19 model=claude-sonnet-5-5 next=accept',
    )
    expect(quietLine({ task: 'T-1', attempt: 1, budget: 2, verdict: v.verdict, alias: 'sonnet', usd: 0.19, next: 'accept', lines: v.lines })).toBe(
      'chassis-delegation: T-1 attempt 1/2 consistent · sonnet · $0.19 · next=accept',
    )
  })
  test('the no-repo verifier says consistent (no repo)', () => {
    const base = { root: '/m', files: ['/m/hooks/a.ts'], missing: [], outOfScope: [], forbidden: [], gates: [{ label: 'claude plugin validate /m', exitCode: 0 }], notRerun: [], noGate: false }
    const v = noRepoVerdict(base)
    expect(v.verdict).toBe('consistent')
    expect(noRepoVerdictText(v)).toBe('consistent (no repo)')
  })
  test('consistent accepts; an honestly declared gate=fail is still never accepted, and the row says so', () => {
    const input: AdviseInput = { verdict: 'consistent', task: 'T-1', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard', adhoc: false, agentId: 'agent-1' }
    expect(advise(input)).toEqual({ kind: 'accept', next: 'accept' })
    expect(advise({ ...input, reportGate: 'fail' }).kind).toBe('resume')
    expect(advise({ ...input, adhoc: true, cardless: true })).toEqual({ kind: 'accept', next: 'accept' })
    expect(advise({ ...input, adhoc: true, cardless: true, reportGate: 'fail' }).next).toBe('check the diff')
    expect(quietLine({ task: 'T-4', attempt: 1, budget: 2, verdict: 'consistent', reportGate: 'fail', alias: 'opus', next: 'resume agent=agent-4', lines: [] })).toBe(
      'chassis-delegation: T-4 attempt 1/2 consistent (report gate=fail) · opus · next=resume agent=agent-4',
    )
  })
  test('a confirmed gate=fail escalates the tier on a consistent record', () => {
    expect(escalatesOn('consistent', 'fail')).toBe(true)
    expect(escalatesOn('consistent', 'pass')).toBe(false)
    expect(escalationSource([rec({ task: 'T-1', verdict: 'consistent', reportGate: 'fail' })], 'main')).toBe('standard')
  })
  test('the dashboard counts it and says consistent: spend by model, first try, the mark, the text', () => {
    const records = [rec({ task: 'A', usd: 1.5, tokens: 1000, verdict: 'consistent' }), rec({ task: 'B', usd: 1, tokens: 500, verdict: 'refuted' })]
    const sonnet = spendByModel(records).find(r => r.family === 'sonnet')
    expect(sonnet).toMatchObject({ consistent: 1 })
    expect(modelLabel(sonnet as never)).toBe('sonnet · $2.50 · 1.5k tok · 1 consistent')
    expect(firstTry(records)).toEqual({ n: 1, m: 2 })
    expect(verdictMark('consistent')).toMatchObject({ icon: '✓', word: 'consistent' })
    const view = liveView({ root: '/r', porcelain: '', records, queue: [], liveAt: {}, now: NOW, budget: 3, since: 0, usd: 2.5, series: [], owed: 0 })
    expect(dashboardText(view)).toContain('1 of 2 consistent on the first attempt')
  })
  test('the Verdicts block and the metrics count it', () => {
    const m = applyMetric(undefined, { kind: 'verdict', verdict: 'consistent', alias: 'sonnet' }, NOW)
    expect(m.verdicts).toMatchObject({ consistent: 1 })
    expect(m.consistentBy).toMatchObject({ sonnet: 1 })
    const from = metricsFromRecords([rec({ task: 'A', verdict: 'consistent' })], NOW)
    expect(from.verdicts.consistent).toBe(1)
    const blocks = blocksFor({ history: [from], current: from })
    expect(blocks.find(b => b.key === 'verdicts')?.number).toBe('1 consistent · 0 unverified · 0 refuted')
    expect(isFalseRefute({ verdict: 'refuted', reportSha: 'abc' }, { verdict: 'consistent', reportSha: 'abc', amended: false })).toBe(true)
    expect(decisionText({ verdict: 'consistent', advice: 'accept', approval: true })).toBe('consistent · amend needs approval')
  })
})

// ---- the old word, read until 0.9.0: a record or row written before the rename --------------------------

describe('MOD-19, MOD-49: a stored verdict saying verified is read as consistent at the read sites only', () => {
  const input: AdviseInput = { verdict: 'consistent', task: 'T-1', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard', adhoc: false, agentId: 'agent-1' }
  test('the normaliser reads the old record and row as consistent; a new word is untouched', () => {
    expect(readVerdict(OLD)).toBe('consistent')
    expect(readVerdict('refuted')).toBe('refuted')
    expect(readRecord(rec({ task: 'T-1', verdict: OLD })).verdict).toBe('consistent')
    expect(readRecord(rec({ task: 'T-1', verdict: 'refuted' })).verdict).toBe('refuted')
    expect(readLine(`chassis-delegation: T-4 attempt 1/2 ${OLD} (report gate=fail) · opus`)).toBe('chassis-delegation: T-4 attempt 1/2 consistent (report gate=fail) · opus')
    expect(readLine(`chassis-delegation: verdict=${OLD} task=T-4`)).toBe('chassis-delegation: verdict=consistent task=T-4')
    expect(readLine('chassis-delegation: T-4 attempt 1/2 refuted')).toBe('chassis-delegation: T-4 attempt 1/2 refuted')
  })
  test('accept, and a confirmed gate=fail still resumes and escalates', () => {
    expect(advise(input)).toEqual({ kind: 'accept', next: 'accept' })
    expect(advise({ ...input, reportGate: 'fail' }).kind).toBe('resume')
    expect(advise({ ...input, adhoc: true, cardless: true })).toEqual({ kind: 'accept', next: 'accept' })
    expect(escalatesOn('consistent', 'fail')).toBe(true)
    expect(escalatesOn('consistent', 'pass')).toBe(false)
    expect(escalationSource([rec({ task: 'T-1', verdict: 'consistent', reportGate: 'fail' })], 'main')).toBe('standard')
  })
  test('the row prints the new word for the old one', () => {
    expect(quietLine({ task: 'T-4', attempt: 1, budget: 2, verdict: 'consistent', reportGate: 'fail', alias: 'opus', next: 'resume agent-4', lines: [] })).toBe(
      'chassis-delegation: T-4 attempt 1/2 consistent (report gate=fail) · opus · next=resume agent-4',
    )
    expect(verdictMark('consistent')).toMatchObject({ icon: '✓', word: 'consistent' })
    expect(decisionText({ verdict: 'consistent', advice: 'accept', approval: true })).toBe('consistent · amend needs approval')
  })
  test('spend by model and first try count a read record as a success', () => {
    const records = [rec({ task: 'A', usd: 1.5, tokens: 1000, verdict: 'consistent' }), rec({ task: 'B', usd: 1, tokens: 500, verdict: 'refuted' })]
    expect(spendByModel(records).find(r => r.family === 'sonnet')).toMatchObject({ usd: 2.5, tokens: 1500, consistent: 1 })
    expect(firstTry(records)).toEqual({ n: 1, m: 2 })
    const view = liveView({ root: '/r', porcelain: '', records, queue: [], liveAt: {}, now: NOW, budget: 3, since: 0, usd: 2.5, series: [], owed: 0 })
    expect(dashboardText(view)).toContain('1 of 2 consistent on the first attempt')
  })
  test('a metrics object stored before the rename folds its verified counts into consistent', () => {
    const stored = { verdicts: { verified: 3, unverified: 1, refuted: 2, falseRefuted: 1 }, verifiedBy: { haiku: 0, sonnet: 2, opus: 1 } } as never
    const m = fillMetrics(stored, NOW)
    expect(m.verdicts).toEqual({ consistent: 3, unverified: 1, refuted: 2, falseRefuted: 1 })
    expect(m.consistentBy).toEqual({ haiku: 0, sonnet: 2, opus: 1 })
    expect(Object.keys(m.verdicts)).not.toContain(OLD)
    expect(applyMetric(stored, { kind: 'verdict', verdict: 'consistent', alias: 'sonnet' }, NOW).verdicts.consistent).toBe(4)
    expect(metricsFromRecords([rec({ task: 'A', verdict: 'consistent' })], NOW).verdicts.consistent).toBe(1)
    expect(emptyMetrics(NOW).verdicts.consistent).toBe(0)
    expect(isFalseRefute({ verdict: 'refuted', reportSha: 'abc' }, { verdict: 'consistent', reportSha: 'abc', amended: false })).toBe(true)
  })
})
