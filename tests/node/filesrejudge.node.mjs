// MOD-376 (#516): a refute on files alone, gate green, advises a by-hand re-judge at the same sha (no attempt spent).
import { test, expect, describe } from './kit.mjs'

const V = () => import('../../hooks/lib/verify.ts')
const base = { task: 'FE-1', adhoc: false, briefPath: '/s/briefs/FE-1.brief.md', agentId: 'agent-7', verdict: 'refuted', attempts: 1, budget: 2, lineageResumes: 0, tier: 'standard', reportGate: 'pass', sha: 'abc1234' }
const files = ['claim files: failed — files= does not match the actual delta (omits or invents a path): a.ts']
const verifyStep = 'files= is wrong, not the tree: check the paths named above are the worker\'s, then dispatch task=FE-1 verify=abc1234 (re-judges this attempt against the delta; no attempt spent)'

describe('MOD-376: a files-only refute advises a re-judge', () => {
  test('gate pass and a sha: kind check naming the task and sha, with the resume clause while budget is left', async () => {
    const { advise } = await V()
    const a = advise({ ...base, lines: files })
    expect(a.kind).toBe('check')
    expect(a.next).toBe(`${verifyStep}; else resume agent=agent-7 — revert the extras`)
  })
  test('at budget the resume clause is gone and the advice is not exhausted', async () => {
    const { advise } = await V()
    const a = advise({ ...base, attempts: 2, lineageResumes: 1, lines: files })
    expect(a).toEqual({ kind: 'check', next: verifyStep })
  })
  test('no agent id: no resume clause', async () => {
    const { advise } = await V()
    expect(advise({ ...base, agentId: undefined, lines: files }).next).toBe(verifyStep)
  })
  test('a gate fail or no sha keeps today\'s advice', async () => {
    const { advise } = await V()
    expect(advise({ ...base, reportGate: 'fail', lines: files }).next).toBe('resume agent=agent-7 — list the paths named above in files= (or revert the extras)')
    expect(advise({ ...base, sha: undefined, lines: files }).next).toBe('resume agent=agent-7 — list the paths named above in files= (or revert the extras)')
  })
  test('files and scope together keep today\'s advice', async () => {
    const { advise } = await V()
    const both = [...files, 'claim scope: failed — out-of-scope path: hooks/x.ts']
    const a = advise({ ...base, lines: both })
    expect(a.kind).toBe('resume')
    expect(a.next).toBe('resume agent=agent-7 — list the paths named above in files= (or revert the extras)')
  })
})
