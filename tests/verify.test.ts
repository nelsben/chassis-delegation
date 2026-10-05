import { test, expect, describe } from 'claude-code/testing'
import {
  isFailing,
  advise,
  verdictLine,
  contextBlock,
  budgetDenyMessage,
  scratchFor,
  filesPathFor,
  resumeText,
  isProveResume,
  uncheckedClaimLines,
  amendedLine,
  amendPendingLine,
  amendMalformedLine,
  amendApprovalLine,
} from '../hooks/lib/verify'
import {
  nextAttempt,
  attemptsFor,
  lineageResumes,
  escalationSource,
  patchRecord,
  priorRedHashes,
  type AttemptRecord,
} from '../hooks/lib/attempts'

describe('where files.txt goes', () => {
  test('scratch and files.txt sit beside the briefs folder', () => {
    expect(scratchFor('/tmp/s/scratchpad/briefs/FE-1.brief.md')).toBe('/tmp/s/scratchpad')
    expect(scratchFor('/elsewhere/FE-1.brief.md')).toBe('/elsewhere')
    expect(filesPathFor('/tmp/s/scratchpad', 'FE-1')).toBe('/tmp/s/scratchpad/FE-1/files.txt')
  })
})

describe('verdict, advice and budgets', () => {
  test('failing means refuted, no-report, or a report that says gate=fail', () => {
    expect(isFailing('refuted')).toBe(true)
    expect(isFailing('no-report')).toBe(true)
    expect(isFailing('unverified', 'fail')).toBe(true)
    expect(isFailing('unverified', 'pass')).toBe(false)
    expect(isFailing('verified')).toBe(false)
  })
  const base = { task: 'FE-1', adhoc: false, briefPath: '/s/briefs/FE-1.brief.md', agentId: 'agent-7' }
  test('first failing verdict: resume the same worker', () => {
    const a = advise({ ...base, verdict: 'refuted', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard' })
    expect(a.kind).toBe('resume')
    expect(a.next).toBe('resume agent=agent-7 — SendMessage it the verifier lines below')
  })
  test('second failing verdict: respawn at the next tier with the same brief', () => {
    const a = advise({ ...base, verdict: 'no-report', attempts: 2, budget: 3, lineageResumes: 1, tier: 'standard' })
    expect(a.kind).toBe('respawn')
    expect(a.tier).toBe('frontier')
    expect(a.next).toBe('respawn at frontier — same brief /s/briefs/FE-1.brief.md, model omitted so the mod picks')
  })
  test('attempts at budget: exhausted, with the deny wording', () => {
    const a = advise({ ...base, verdict: 'refuted', attempts: 2, budget: 2, lineageResumes: 1, tier: 'standard' })
    expect(a.kind).toBe('exhausted')
    expect(a.next).toBe("stop — budget exhausted for FE-1 (2 attempts); raise budget= in the task's brief to continue (the ladder resumes from attempt 2, the brief is re-read)")
    expect(budgetDenyMessage('FE-1', 2)).toBe("budget exhausted for FE-1 (2 attempts); raise budget= in the task's brief to continue (the ladder resumes from attempt 2, the brief is re-read)")
  })
  test('verified accepts; unverified is not a pass; ad hoc spawns get no escalation', () => {
    expect(advise({ ...base, verdict: 'verified', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard' }).kind).toBe('accept')
    expect(advise({ ...base, verdict: 'unverified', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard' }).next).toBe('check by hand — unverified is not a pass')
    expect(advise({ ...base, adhoc: true, verdict: 'no-report', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard' }).kind).toBe('none')
  })
  test('GH-1 item 5: unverified with an agent and budget left resumes, naming each unchecked claim and its reason', () => {
    const lines = [
      'claim branch: held — refs/heads/agent/frontend/FE-1',
      'claim gate: unchecked — tree not at sha: 1 uncommitted path in the worktree; the gate was not re-run',
      `claim red: unchecked — ${'x'.repeat(200)}`,
    ]
    const a = advise({ ...base, verdict: 'unverified', attempts: 1, budget: 2, lineageResumes: 1, tier: 'standard', lines })
    expect(a.kind).toBe('resume')
    expect(a.next).toBe(`resume agent=agent-7 — prove: gate (tree not at sha: 1 uncommitted path in the worktree; the gate was not re-run), red (${'x'.repeat(159)}…)`)
    // past the budget, or with no agent, today's text
    expect(advise({ ...base, verdict: 'unverified', attempts: 2, budget: 2, lineageResumes: 0, tier: 'standard', lines }).next).toBe('check by hand — unverified is not a pass')
    expect(advise({ ...base, agentId: undefined, verdict: 'unverified', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard', lines }).next).toBe('check by hand — unverified is not a pass')
  })
  test('GH-1 item 2: a cardless hand-back accepts when verified, else says check the diff; never resume or respawn', () => {
    const cardless = { ...base, adhoc: true, cardless: true, attempts: 1, budget: 3, lineageResumes: 0, tier: 'standard' as const }
    expect(advise({ ...cardless, verdict: 'verified' })).toEqual({ kind: 'accept', next: 'accept' })
    for (const verdict of ['unverified', 'refuted'] as const) expect(advise({ ...cardless, verdict, lines: ['claim gate: unchecked — x'] })).toEqual({ kind: 'check', next: 'check the diff' })
    expect(advise({ ...cardless, verdict: 'verified', reportGate: 'fail' }).next).toBe('check the diff')
  })
  test('the verdict line and the context cap', () => {
    const line = verdictLine({ verdict: 'refuted', task: 'FE-1', attempt: 1, budget: 2, next: 'resume agent=a — x' })
    expect(line).toBe('chassis-delegation: verdict=refuted task=FE-1 attempt=1/2 next=resume agent=a — x')
    // cost and the resolved model sit before next=, which runs to the end of the line
    expect(verdictLine({ verdict: 'verified', task: 'OPS-230', attempt: 1, budget: 3, usd: 2.9061, model: 'claude-sonnet-5-5', next: 'accept' })).toBe(
      'chassis-delegation: verdict=verified task=OPS-230 attempt=1/3 usd=2.91 model=claude-sonnet-5-5 next=accept',
    )
    expect(verdictLine({ verdict: 'verified', task: 'T', attempt: 1, budget: 3, usd: 0, next: 'accept' })).toBe('chassis-delegation: verdict=verified task=T attempt=1/3 usd=0.00 next=accept')
    const many = Array.from({ length: 60 }, (_, i) => `claim c${i}: held — ok`)
    const block = contextBlock(line, many)
    expect(block.split('\n')).toHaveLength(40)
    expect(block.split('\n')[0]).toBe(line)
    expect(block.split('\n')[39]).toBe('… 22 more verifier lines cut')
  })
  test('the amend lines on a verdict row', () => {
    const a = { block: '[[amend v=1 scope+=x.sh reason=it lives there]]', ops: ['scope+=x.sh'], reason: 'it lives there' }
    expect(amendedLine(a)).toBe('amended: scope+=x.sh (reason it lives there)')
    expect(amendPendingLine(a, '/s/b.brief.md')).toBe('amend not applied (applyAmends off): [[amend v=1 scope+=x.sh reason=it lives there]] — append it to /s/b.brief.md and re-verify to accept it')
    expect(amendMalformedLine({ block: '[[amend v=1 scope+=x]]', why: 'no reason' })).toBe('amend not applied (malformed: no reason): [[amend v=1 scope+=x]]')
    expect(amendApprovalLine({ block: '[[amend v=1 forbid-=b/** reason=r]]' }, '/s/b.brief.md')).toBe('amend needs approval: [[amend v=1 forbid-=b/** reason=r]] — append it to /s/b.brief.md and re-verify to accept it')
  })
  test('the resume message carries the verifier lines and asks for a fresh report', () => {
    const t = resumeText({ verdict: 'refuted', task: 'FE-1', attempt: 1, budget: 2, lines: ['claim gate: failed — red'] })
    expect(t).toContain('claim gate: failed — red')
    expect(t).toContain('[[report v=1')
  })
  test('GH-1 item 5: a prove resume sends only the unchecked claim lines and asks for proof', () => {
    const lines = ['claim branch: held — refs/heads/x', 'claim gate: unchecked — gate not re-run: test (not in gateMap)', 'claim pr: held — no PR claimed']
    const t = resumeText({ verdict: 'unverified', task: 'FE-1', attempt: 1, budget: 3, lines, prove: true })
    expect(t).toContain('came back unverified')
    expect(t).toContain('claim gate: unchecked — gate not re-run: test (not in gateMap)')
    expect(t).not.toContain('claim branch: held')
    expect(t).toContain('Prove each one')
    expect(t).toContain('[[report v=1')
    expect(uncheckedClaimLines(lines)).toEqual(['claim gate: unchecked — gate not re-run: test (not in gateMap)'])
    expect(isProveResume('unverified')).toBe(true)
    expect(isProveResume('unverified', 'fail')).toBe(false)
    expect(isProveResume('refuted')).toBe(false)
  })
})

describe('attempt arithmetic', () => {
  const rec = (n: number, kind: 'spawn' | 'resume', lineage: number, verdict: AttemptRecord['verdict'], subtask = 'main'): AttemptRecord => ({
    task: 'FE-1', subtask, attempt: n, kind, lineage, tier: 'standard', alias: 'sonnet', verdict, at: n,
  })
  const recs = [rec(1, 'spawn', 1, 'refuted'), rec(2, 'resume', 1, 'refuted'), rec(1, 'spawn', 1, 'verified', 'retry')]
  test('counts per subtask; a re-brief under a new subtask starts over', () => {
    expect(attemptsFor(recs, 'main')).toHaveLength(2)
    expect(nextAttempt(recs, 'main')).toBe(3)
    expect(nextAttempt(recs, 'other')).toBe(1)
    expect(lineageResumes(recs, 'main', 1)).toBe(1)
  })
  test('replays count in their own lane (replay + base), apart from the real runs', () => {
    const replay = { ...rec(1, 'spawn', 1, 'refuted'), replay: true as const, base: '96014e3b' }
    const all = [...recs, replay]
    expect(attemptsFor(all, 'main')).toHaveLength(2)
    expect(attemptsFor(all, 'main', { replay: true, base: '96014e3b' })).toHaveLength(1)
    expect(nextAttempt(all, 'main', { replay: true, base: '96014e3b' })).toBe(2)
    expect(nextAttempt(all, 'main', { replay: true, base: 'aaaaaaa' })).toBe(1)
    expect(escalationSource(all, 'main', { replay: true, base: '96014e3b' })).toBe('standard')
  })
  test('a respawn after a failed last attempt escalates from that attempt tier', () => {
    expect(escalationSource(recs, 'main')).toBe('standard')
    expect(escalationSource(recs, 'retry')).toBeUndefined()
    expect(escalationSource([rec(1, 'spawn', 1, 'pending')], 'main')).toBeUndefined()
  })
  test('GH-20: the record keeps red= and its hash; a later attempt is checked against the earlier ones only', () => {
    const patched = patchRecord(recs, 'main', 1, { red: '.delegation/FE-1/red-1.txt', redHash: 'h1' })
    expect(patched[0]).toMatchObject({ attempt: 1, red: '.delegation/FE-1/red-1.txt', redHash: 'h1' })
    const two = patchRecord(patched, 'main', 2, { red: '.delegation/FE-1/red-2.txt', redHash: 'h2' })
    expect(priorRedHashes(two, 'main', 2)).toEqual([{ attempt: 1, hash: 'h1' }])
    expect(priorRedHashes(two, 'main', 3)).toEqual([{ attempt: 1, hash: 'h1' }, { attempt: 2, hash: 'h2' }])
    expect(priorRedHashes(two, 'retry', 2)).toEqual([])
    expect(priorRedHashes(two, 'main', 1)).toEqual([])
  })
})
