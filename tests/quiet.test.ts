import { test, expect, describe } from 'claude-code/testing'
import { parseVerbosity, parseClaimLine, verdictReason, amendClauses, shortNext, quietLine, deliveryFor } from '../hooks/lib/quiet'

const RESUME = 'resume agent=agent-4 — SendMessage it the verifier lines below'
const RESPAWN = 'respawn at frontier — same brief /s/briefs/T-4.brief.md, model omitted so the mod picks'

describe('verdictVerbosity', () => {
  test('line is the default; full and silent are taken as given; anything else reads as line', () => {
    expect(parseVerbosity(undefined)).toBe('line')
    expect(parseVerbosity('')).toBe('line')
    expect(parseVerbosity('full')).toBe('full')
    expect(parseVerbosity('silent')).toBe('silent')
    expect(parseVerbosity('loud')).toBe('line')
  })
})

describe('the verifier claim lines', () => {
  test('a claim line splits into name, status and detail; other lines are not claims', () => {
    expect(parseClaimLine('claim scope: failed — out-of-scope path: hooks/x.ts')).toEqual({ name: 'scope', status: 'failed', detail: 'out-of-scope path: hooks/x.ts' })
    expect(parseClaimLine('claim gate: unchecked — no gate command available')).toEqual({ name: 'gate', status: 'unchecked', detail: 'no gate command available' })
    expect(parseClaimLine('amendment: #1 scope+=a')).toBeUndefined()
    expect(parseClaimLine('note: files.txt not written')).toBeUndefined()
  })

  test('refuted names the first failed claim, unverified the first unchecked one; a pass and no-report name none', () => {
    const lines = ['claim branch: held — agent/frontend/T-4', 'claim scope: failed — out-of-scope path: hooks/x.ts', 'claim gate: failed — red']
    expect(verdictReason('refuted', lines)).toBe('on scope (out-of-scope path: hooks/x.ts)')
    expect(verdictReason('unverified', ['claim sha: held — abc', 'claim gate: unchecked — no gate command available'])).toBe('on gate (no gate command available)')
    expect(verdictReason('unverified', ['note: dispatch-verify.sh did not run: refused: x'])).toBe('(note: dispatch-verify.sh did not run: refused: x)')
    expect(verdictReason('verified', lines)).toBeUndefined()
    expect(verdictReason('no-report', [])).toBeUndefined()
  })

  test('a long detail is cut to fit one line', () => {
    const reason = verdictReason('refuted', [`claim files: failed — ${'x'.repeat(200)}`]) ?? ''
    expect(reason.length).toBeLessThanOrEqual(100)
    expect(reason.endsWith('…)')).toBe(true)
  })
})

describe('amend clauses', () => {
  test('amends applied are one clause; amends waiting for approval another; none, nothing', () => {
    const lines = [
      'amended: scope+=a/x.ts (reason one)',
      'amended: scope+=b/y.ts forbid+=c/** (reason two)',
      'amend needs approval: [[amend v=1 forbid-=b/** reason=the fixture lives under b]] — append it to /s/b.md and re-verify to accept it',
      'amend not applied (applyAmends off): [[amend v=1 scope+=d/z.ts reason=three]] — append it to /s/b.md and re-verify to accept it',
      'claim scope: held — fine',
    ]
    expect(amendClauses(lines)).toEqual(['amended scope+=a/x.ts, scope+=b/y.ts forbid+=c/**', 'amend needs approval: forbid-=b/**', 'amend not applied: scope+=d/z.ts'])
    expect(amendClauses(['claim branch: held — x'])).toEqual([])
  })
})

describe('the one-line row', () => {
  test('verified: task, attempt, verdict, alias, cost, next', () => {
    expect(quietLine({ task: 'OPS-232', attempt: 2, budget: 3, verdict: 'verified', alias: 'sonnet', usd: 2.2611, next: 'accept', lines: ['claim branch: held — x'] })).toBe(
      'chassis-delegation: OPS-232 attempt 2/3 verified · sonnet · $2.26 · next=accept',
    )
  })

  test('refuted names the claim; resume advice stays on the line without the "lines below" tail', () => {
    expect(shortNext(RESUME)).toBe('resume agent=agent-4')
    expect(shortNext(RESPAWN)).toBe(RESPAWN)
    const line = quietLine({
      task: 'T-4',
      attempt: 1,
      budget: 3,
      verdict: 'refuted',
      alias: 'sonnet',
      next: RESUME,
      lines: ['claim branch: held — b', 'claim scope: failed — out-of-scope path: hooks/x.ts'],
    })
    expect(line).toBe('chassis-delegation: T-4 attempt 1/3 refuted on scope (out-of-scope path: hooks/x.ts) · sonnet · next=resume agent=agent-4')
    expect(line.includes('\n')).toBe(false)
  })

  test('respawn advice stays whole; amends are named in one clause each', () => {
    const line = quietLine({
      task: 'T-4',
      attempt: 2,
      budget: 3,
      verdict: 'refuted',
      alias: 'sonnet',
      usd: 0,
      next: RESPAWN,
      lines: ['amended: scope+=a/x.ts (reason one)', 'amend needs approval: [[amend v=1 forbid-=b/** reason=r]] — append it', 'claim gate: failed — red at abc'],
    })
    expect(line).toBe(`chassis-delegation: T-4 attempt 2/3 refuted on gate (red at abc) · sonnet · $0.00 · amended scope+=a/x.ts · amend needs approval: forbid-=b/** · next=${RESPAWN}`)
  })

  test('no-report has no reason; an honest gate=fail on a verified report says so', () => {
    expect(quietLine({ task: 'T-4', attempt: 1, budget: 2, verdict: 'no-report', alias: 'haiku', next: RESUME, lines: [] })).toBe('chassis-delegation: T-4 attempt 1/2 no-report · haiku · next=resume agent=agent-4')
    expect(quietLine({ task: 'T-4', attempt: 1, budget: 2, verdict: 'verified', reportGate: 'fail', alias: 'opus', next: RESUME, lines: [] })).toBe(
      'chassis-delegation: T-4 attempt 1/2 verified (report gate=fail) · opus · next=resume agent=agent-4',
    )
  })
})

describe('3A/5A: a no-repo verdict says so', () => {
  test('the label rides after the verdict and the reason still names the claim', () => {
    expect(quietLine({ task: 'MOD-4', attempt: 1, budget: 2, verdict: 'refuted', noRepo: true, alias: 'opus', next: 'resume agent=a-1', lines: ['claim files: failed — /m/x.ts is not there'] })).toBe(
      'chassis-delegation: MOD-4 attempt 1/2 refuted (no repo) on files (/m/x.ts is not there) · opus · next=resume agent=a-1',
    )
    expect(quietLine({ task: 'MOD-4', attempt: 1, budget: 2, verdict: 'verified', noRepo: true, next: 'accept', lines: [] })).toBe('chassis-delegation: MOD-4 attempt 1/2 verified (no repo) · next=accept')
  })
})

describe('delivery per verbosity', () => {
  const r = { full: 'chassis-delegation: verdict=refuted task=T-4\nclaim gate: failed — red', line: 'chassis-delegation: T-4 attempt 1/3 refuted on gate (red)' }
  test('full: the multi-line row; line: the one line, the full text to the debug log; silent: a toast only', () => {
    expect(deliveryFor('full', r)).toEqual({ row: r.full })
    expect(deliveryFor('line', r)).toEqual({ row: r.line, log: r.full })
    expect(deliveryFor('silent', r)).toEqual({ toast: r.line, log: r.full })
  })
})
