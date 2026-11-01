import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, ROOT, SCRATCH, type RunAnswer } from './harness'
import { advise, type AdviseInput } from '../hooks/lib/verify'
import { attemptsFor, nextAttempt, patchRecord, type AttemptRecord } from '../hooks/lib/attempts'
import { parseRepoConfig, mergeConfig, settingsLayer } from '../hooks/lib/repoconfig'
import { reviewerTier } from '../hooks/lib/tier'
import { reviewLine, shortNext } from '../hooks/lib/quiet'
import {
  parseReviewBlock,
  parseReviewMarker,
  refutedRows,
  renderReview,
  gateRecord,
  reviewAdvice,
  reviewClause,
  reviewDue,
  reviewMarker,
  matchReview,
  reviewPlan,
  reviewResumeText,
  reviewRows,
  type ReviewPlanInput,
} from '../hooks/lib/review'

// MOD-21: the optional reviewer stage. Pure parts: the [[review]] block, the rows, the tier, the advice.

const BLOCK = '[[review v=1 task=T-4 confirmed=3 refuted=1 unverifiable=0]]'

describe('MOD-21: the [[review]] block', () => {
  test('a well-formed block gives its task and the three counts', () => {
    expect(parseReviewBlock(`rows above\n${BLOCK}`)).toEqual({ task: 'T-4', confirmed: 3, refuted: 1, unverifiable: 0 })
    expect(parseReviewBlock('[[review v=1 task=MOD-21 confirmed=0 refuted=0 unverifiable=7]]')).toEqual({ task: 'MOD-21', confirmed: 0, refuted: 0, unverifiable: 7 })
  })

  test('a malformed block gives none: a word for a count, a missing count, a wrong version, the template line itself', () => {
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=x unverifiable=0]]')).toBeUndefined()
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=3 refuted=1]]')).toBeUndefined()
    expect(parseReviewBlock('[[review v=2 task=T-4 confirmed=3 refuted=1 unverifiable=0]]')).toBeUndefined()
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=N refuted=N unverifiable=N]]')).toBeUndefined()
    expect(parseReviewBlock('[[review v=1 task=T-4 confirmed=-1 refuted=1 unverifiable=0]]')).toBeUndefined()
    expect(parseReviewBlock('no block at all')).toBeUndefined()
    expect(parseReviewBlock('')).toBeUndefined()
  })

  test('the last well-formed block wins; a block for another task is not this review', () => {
    const text = `${BLOCK}\nthen I recounted\n[[review v=1 task=T-4 confirmed=4 refuted=0 unverifiable=0]]\n[[review v=1 task=T-4 confirmed=N refuted=N unverifiable=N]]`
    expect(parseReviewBlock(text)).toEqual({ task: 'T-4', confirmed: 4, refuted: 0, unverifiable: 0 })
    expect(parseReviewBlock(BLOCK, 'T-4')).toEqual({ task: 'T-4', confirmed: 3, refuted: 1, unverifiable: 0 })
    expect(parseReviewBlock(BLOCK, 'T-9')).toBeUndefined()
  })
})

describe('MOD-21: the rows', () => {
  const TEXT = [
    'I read the diff at 1234abcd.',
    'confirmed: a/x.ts gains the parser — a/x.ts:12',
    '- refuted: the gate passes — ran `npx prettier --check a/x.ts`, exit 1',
    '* unverifiable: the CI run is green — no network from here',
    '2. **Refuted** - the README names the option — README.md has no such line (grep -n review README.md)',
    'refuted claims are listed above, none hidden.',
    BLOCK,
  ].join('\n')

  test('each labelled line is a row: confirmed, refuted or unverifiable, bullets and bold stripped', () => {
    expect(reviewRows(TEXT).map(r => r.label)).toEqual(['confirmed', 'refuted', 'unverifiable', 'refuted'])
    expect(reviewRows(TEXT)[1]).toEqual({ label: 'refuted', text: 'the gate passes — ran `npx prettier --check a/x.ts`, exit 1', line: 'refuted: the gate passes — ran `npx prettier --check a/x.ts`, exit 1' })
  })

  test('the refuted rows are quoted as the reviewer wrote them, in order; prose that merely starts with the word is no row', () => {
    expect(refutedRows(TEXT)).toEqual([
      'refuted: the gate passes — ran `npx prettier --check a/x.ts`, exit 1',
      'refuted: the README names the option — README.md has no such line (grep -n review README.md)',
    ])
    expect(refutedRows('nothing refuted here\nconfirmed: x — y')).toEqual([])
  })
})

describe('MOD-21: when a review is due, and at which tier', () => {
  test('off reviews nothing; on reviews every tier; on-frontier only frontier and premium', () => {
    for (const t of ['economy', 'standard', 'frontier', 'premium'] as const) {
      expect(reviewDue('off', t)).toBe(false)
      expect(reviewDue('on', t)).toBe(true)
    }
    expect(reviewDue('on-frontier', 'economy')).toBe(false)
    expect(reviewDue('on-frontier', 'standard')).toBe(false)
    expect(reviewDue('on-frontier', 'frontier')).toBe(true)
    expect(reviewDue('on-frontier', 'premium')).toBe(true)
  })

  test('the reviewer is one tier below the worker, the floor is economy, and reviewTier overrides', () => {
    expect(reviewerTier('premium')).toBe('frontier')
    expect(reviewerTier('frontier')).toBe('standard')
    expect(reviewerTier('standard')).toBe('economy')
    expect(reviewerTier('economy')).toBe('economy')
    expect(reviewerTier('standard', 'frontier')).toBe('frontier')
    expect(reviewerTier('frontier', 'economy')).toBe('economy')
  })
})

describe('MOD-21: the advice for a consistent verdict', () => {
  const base: AdviseInput = { verdict: 'consistent', reportGate: 'pass', task: 'T-4', attempts: 1, budget: 3, lineageResumes: 0, tier: 'standard', agentId: 'agent-4', briefPath: '/s/briefs/T-4.brief.md', adhoc: false }

  test('review off: next=accept, as before', () => {
    expect(advise(base)).toEqual({ kind: 'accept', next: 'accept' })
    expect(advise({ ...base, review: false })).toEqual({ kind: 'accept', next: 'accept' })
  })

  test('review on: next=review instead of next=accept', () => {
    expect(advise({ ...base, review: true })).toEqual({ kind: 'review', next: 'review' })
  })

  test('review changes nothing but a consistent verdict: a gate=fail report, a refuted, an unverified one and a cardless hand-back are advised as they were', () => {
    expect(advise({ ...base, review: true, reportGate: 'fail' }).kind).toBe('resume')
    expect(advise({ ...base, review: true, verdict: 'refuted', lines: ['claim gate: failed — red'] }).kind).toBe('resume')
    expect(advise({ ...base, review: true, verdict: 'unverified' }).kind).toBe('check')
    expect(advise({ ...base, review: true, adhoc: true, cardless: true })).toEqual({ kind: 'accept', next: 'accept' })
    expect(advise({ ...base, review: true, adhoc: true }).kind).toBe('none')
  })
})

describe('MOD-21: the reviewer spawn block', () => {
  const TEMPLATE = 'Review {{id}} attempt {{attempt}}.\nBrief: {{brief}}\nTree: {{worktree}}\nSha: {{sha}}\nBase: {{base}}\nReport: {{report}}\nHand-back:\n{{handback}}\n[[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N]]'
  const TIER_MAP = { economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' } as const
  const plan = (over: Partial<ReviewPlanInput> = {}) =>
    reviewPlan({
      template: TEMPLATE,
      workerTier: 'standard',
      tierMap: TIER_MAP,
      label: 'T-4',
      marker: { task: 'T-4', subtask: 'main', attempt: 1, worker: 'agent-4', sha: '1234abcd' },
      vars: { id: 'T-4', subtask: 'main', attempt: '1', budget: '3', brief: '/s/briefs/T-4.brief.md', worktree: '/repo/acme-app-T-4', branch: 'agent/frontend/T-4', sha: '1234abcd', base: 'origin/main', report: '[[report v=1 task=T-4 sha=1234abcd gate=pass files=a/x.ts]]', handback: 'Added the parser.' },
      ...over,
    })

  test('the model is one tier below the worker: a standard worker gets haiku, a frontier worker sonnet, a premium worker opus', () => {
    expect(plan().alias).toBe('haiku')
    expect(plan().tier).toBe('economy')
    expect(plan({ workerTier: 'frontier' }).alias).toBe('sonnet')
    expect(plan({ workerTier: 'premium' }).alias).toBe('opus')
    expect(plan({ workerTier: 'economy' }).alias).toBe('haiku') // the floor
  })

  test('the tier map decides the alias; reviewTier overrides the tier; fable is never spawned', () => {
    expect(plan({ tierMap: { ...TIER_MAP, economy: 'sonnet' } }).alias).toBe('sonnet')
    expect(plan({ override: 'frontier' }).alias).toBe('opus')
    const p = plan({ override: 'premium' })
    expect(p.alias).toBe('opus')
    expect(p.tier).toBe('frontier')
  })

  test('the block is the Agent call as fenced JSON: the task, kind review, the model, and a prompt built from the template', () => {
    const p = plan()
    expect(p.call.model).toBe('haiku')
    expect(p.call.subagent_type).toBe('general-purpose')
    expect(p.call.description).toBe('T-4 review economy haiku')
    expect(p.block.startsWith('spawn: Agent\n```json\n')).toBe(true)
    const json = JSON.parse(/```json\n([\s\S]*?)\n```/.exec(p.block)?.[1] ?? '{}')
    expect(json).toEqual(p.call)
    expect(p.call.prompt.startsWith('[[review-of v=1 task=T-4 subtask=main attempt=1 worker=agent-4 sha=1234abcd]]\n')).toBe(true)
    expect(p.call.prompt).toContain('Review T-4 attempt 1.')
    expect(p.call.prompt).toContain('Brief: /s/briefs/T-4.brief.md')
    expect(p.call.prompt).toContain('Hand-back:\nAdded the parser.')
    expect(p.call.prompt).toContain('[[review v=1 task=T-4 confirmed=N refuted=N unverifiable=N]]')
    expect(p.block).toContain('edits nothing')
  })
})

describe('MOD-21: the marker the spawn hook recognises', () => {
  test('a marker round-trips; only the first line of a prompt is a marker', () => {
    const marker = { task: 'T-4', subtask: 'main', attempt: 2, worker: 'agent-4', sha: '1234abcd' }
    const line = reviewMarker(marker)
    expect(line).toBe('[[review-of v=1 task=T-4 subtask=main attempt=2 worker=agent-4 sha=1234abcd]]')
    expect(parseReviewMarker(`${line}\nthe rest`)).toEqual(marker)
    expect(parseReviewMarker(`  \n${line}\nthe rest`)).toEqual(marker)
    expect(parseReviewMarker(`Your brief is the file /s/briefs/T-4.brief.md.\n${line}`)).toBeUndefined()
    expect(parseReviewMarker('[[brief v=1 task=T-4]]')).toBeUndefined()
    expect(parseReviewMarker('[[review-of v=1 subtask=main attempt=1]]')).toBeUndefined() // no task
    expect(parseReviewMarker('[[review-of v=1 task=T-4 attempt=x]]')).toBeUndefined()
  })

  test('a template renders its {{keys}} once; an unknown key and text in a value stay as they are', () => {
    expect(renderReview('{{id}} {{x}} {{handback}}', { id: 'T-4', handback: 'see {{id}} and $& here' })).toBe('T-4 {{x}} see {{id}} and $& here')
  })
})

describe('MOD-21: what the review hand-back advises', () => {
  const rows = ['refuted: the gate passes — exit 1', 'refuted: no other file changed — a/y.ts:3']
  const base = { counts: { task: 'T-4', confirmed: 3, refuted: 0, unverifiable: 1 }, refuted: [] as string[], agentId: 'agent-4', attempts: 1, budget: 3, label: 'T-4' }

  test('refuted=0: next=accept; the clause counts confirmed and unverifiable', () => {
    expect(reviewAdvice(base)).toEqual({ kind: 'accept', next: 'accept' })
    expect(reviewClause(base.counts)).toBe('review: 3 confirmed, 1 unverifiable')
  })

  test('a missing or malformed block: next=accept and the clause says so (the review never blocks on its own failure)', () => {
    expect(reviewAdvice({ ...base, counts: undefined })).toEqual({ kind: 'accept', next: 'accept' })
    expect(reviewClause(undefined)).toBe('review: no review block')
  })

  test('refuted>0: next=resume naming the worker; the clause counts all three', () => {
    const advice = reviewAdvice({ ...base, counts: { task: 'T-4', confirmed: 3, refuted: 2, unverifiable: 0 }, refuted: rows })
    expect(advice.kind).toBe('resume')
    expect(advice.next).toBe('resume agent=agent-4 — SendMessage it the refuted rows below')
    expect(shortNext(advice.next)).toBe('resume agent=agent-4')
    expect(reviewClause({ task: 'T-4', confirmed: 3, refuted: 2, unverifiable: 0 })).toBe('review: 3 confirmed, 2 refuted, 0 unverifiable')
  })

  test('refuted>0 with the budget spent, or no worker to resume: check by hand, never a resume that would be refused', () => {
    const refuted = { ...base, counts: { task: 'T-4', confirmed: 0, refuted: 1, unverifiable: 0 }, refuted: [rows[0] as string] }
    expect(reviewAdvice({ ...refuted, attempts: 3 }).kind).toBe('check')
    expect(reviewAdvice({ ...refuted, attempts: 3 }).next).toContain('budget')
    expect(reviewAdvice({ ...refuted, agentId: undefined }).kind).toBe('check')
  })

  test('the resume message quotes the refuted rows; with no row parsed it quotes what the reviewer said', () => {
    const text = reviewResumeText({ label: 'T-4', attempt: 1, budget: 3, refuted: rows, said: 'ignored' })
    expect(text).toContain('T-4 (attempt 1/3)')
    for (const row of rows) expect(text).toContain(row)
    expect(text).not.toContain('ignored')
    expect(text).toContain('[[report v=1')
    const none = reviewResumeText({ label: 'T-4', attempt: 1, budget: 3, refuted: [], said: 'the gate claim is false, see out.txt:4' })
    expect(none).toContain('the gate claim is false, see out.txt:4')
  })

  test('the one-line row: the label, the attempt, the alias and the cost, the clause, then next= last', () => {
    expect(reviewLine({ task: 'T-4', attempt: 1, budget: 3, alias: 'haiku', usd: 0.05, counts: base.counts, next: 'accept' })).toBe('chassis-delegation: T-4 attempt 1/3 reviewed · haiku · $0.05 · review: 3 confirmed, 1 unverifiable · next=accept')
    expect(reviewLine({ task: 'T-4', attempt: 1, budget: 3, counts: undefined, next: 'accept' })).toBe('chassis-delegation: T-4 attempt 1/3 reviewed · review: no review block · next=accept')
    expect(reviewLine({ task: 'T-4', attempt: 1, budget: 3, alias: 'haiku', counts: { task: 'T-4', confirmed: 3, refuted: 1, unverifiable: 0 }, next: 'resume agent=agent-4 — SendMessage it the refuted rows below' })).toBe(
      'chassis-delegation: T-4 attempt 1/3 reviewed · haiku · review: 3 confirmed, 1 refuted, 0 unverifiable · next=resume agent=agent-4',
    )
  })
})

describe('MOD-21: a review is an attempt of kind review that never counts against budget=', () => {
  const rec = (attempt: number, kind: AttemptRecord['kind'], verdict: AttemptRecord['verdict']): AttemptRecord => ({ task: 'T-4', subtask: 'main', attempt, kind, lineage: 1, tier: 'standard', alias: 'sonnet', verdict, at: attempt })

  test('attemptsFor, nextAttempt and patchRecord pass a review record by', () => {
    const records = [rec(1, 'spawn', 'consistent'), rec(1, 'review', 'pending')]
    expect(attemptsFor(records, 'main')).toHaveLength(1)
    expect(attemptsFor(records, 'main')[0]?.kind).toBe('spawn')
    expect(nextAttempt(records, 'main')).toBe(2)
    const patched = patchRecord(records, 'main', 1, { sha: 'abc1234' })
    expect(patched[0]).toMatchObject({ kind: 'spawn', sha: 'abc1234' })
    expect(patched[1]).toMatchObject({ kind: 'review' })
    expect((patched[1] as AttemptRecord).sha).toBeUndefined()
  })
})

describe('MOD-21: the review option', () => {
  test('review defaults to on-frontier; the repo file and /config set it; /config off is unset but a repo-file off wins; a bad value is named and dropped', () => {
    expect(mergeConfig({}, {}).review).toBe('on-frontier')
    expect(mergeConfig(parseRepoConfig('{"review":"off"}').config, {}).review).toBe('off')
    expect(mergeConfig({}, settingsLayer({ review: 'off' }).config).review).toBe('on-frontier')
    const repo = parseRepoConfig('{"review":"on-frontier"}')
    expect(repo.errors).toEqual([])
    expect(mergeConfig(repo.config, {}).review).toBe('on-frontier')
    expect(mergeConfig(repo.config, settingsLayer({ review: 'on' }).config).review).toBe('on')
    expect(mergeConfig(repo.config, settingsLayer({ review: 'off' }).config).review).toBe('on-frontier') // the manifest default is unset
    const bad = parseRepoConfig('{"review":"always"}')
    expect(bad.errors.join()).toContain('review')
    expect(mergeConfig(bad.config, {}).review).toBe('on-frontier')
  })

  test('reviewTier defaults to none; a tier sets it; a word that is no tier is named and dropped', () => {
    expect(mergeConfig({}, {}).reviewTier).toBe('')
    expect(mergeConfig(parseRepoConfig('{"reviewTier":"standard"}').config, {}).reviewTier).toBe('standard')
    expect(mergeConfig({}, settingsLayer({ reviewTier: 'frontier' }).config).reviewTier).toBe('frontier')
    const bad = parseRepoConfig('{"reviewTier":"fast"}')
    expect(bad.errors.join()).toContain('reviewTier')
    expect(mergeConfig(bad.config, {}).reviewTier).toBe('')
  })
})

describe('MOD-224: a review that arrives with no spawn record', () => {
  const WAIT = { task: 'T-4', attempt: 2, sha: '1234abcdef' }
  const block = (extra: string) => `confirmed: x — y\n[[review v=1 task=T-4${extra} confirmed=1 refuted=0 unverifiable=0]]`

  test('a block naming the task, the attempt and the sha the verdict waits on is recorded, with no spawn record to go by', () => {
    const m = matchReview(block(' attempt=2 sha=1234abc'), WAIT)
    expect(m.kind).toBe('match')
    if (m.kind === 'match') expect(m.counts).toEqual({ task: 'T-4', attempt: 2, sha: '1234abc', confirmed: 1, refuted: 0, unverifiable: 0 })
  })

  test('a wrong sha is not recorded and says so in one line', () => {
    const m = matchReview(block(' attempt=2 sha=ffff000'), WAIT)
    expect(m).toEqual({ kind: 'refused', line: 'review seen for T-4 but it names sha ffff000, waiting on 1234abcdef; spawn the reviewer again' })
  })

  test('a wrong attempt, and a block with no attempt or sha, are not recorded either; task alone never matches', () => {
    expect(matchReview(block(' attempt=1 sha=1234abc'), WAIT)).toEqual({ kind: 'refused', line: 'review seen for T-4 but it names attempt 1, waiting on attempt 2; spawn the reviewer again' })
    const bare = matchReview(block(''), WAIT)
    expect(bare.kind).toBe('refused')
    if (bare.kind === 'refused') expect(bare.line).toBe('review seen for T-4 but it names no attempt or sha, waiting on attempt 2 sha 1234abcdef; spawn the reviewer again')
  })

  test('no block, or another task\'s block, is not a review seen', () => {
    expect(matchReview('no block here', WAIT).kind).toBe('none')
    expect(matchReview('[[review v=1 task=T-9 attempt=2 sha=1234abc confirmed=1 refuted=0 unverifiable=0]]', WAIT).kind).toBe('none')
  })

  test('a normal spawn-and-return review is unchanged: the bare block parses as before, and the prompt asks for attempt and sha', () => {
    expect(parseReviewBlock(BLOCK, 'T-4')).toEqual({ task: 'T-4', confirmed: 3, refuted: 1, unverifiable: 0 })
    const p = reviewPlan({
      template: 'Review {{id}}.\n[[review v=1 task={{id}} confirmed=N refuted=N unverifiable=N]]',
      workerTier: 'standard',
      tierMap: { economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' },
      label: 'T-4',
      marker: { task: 'T-4', subtask: 'main', attempt: 2, sha: '1234abc' },
      vars: { id: 'T-4' } as never,
    })
    expect(p.call.prompt).toContain('attempt=2 sha=1234abc')
    expect(p.call.prompt).toContain('[[review v=1 task=T-4 confirmed=N refuted=N unverifiable=N]]')
  })
})

describe('MOD-253: the review brief carries the verifier\'s gate record', () => {
  const claim = 'claim gate: held — gate green at 1234abcd (gate=pass confirmed)'
  test('a passing gate gives the heading, its claim lines and the output tail', () => {
    const out = gateRecord(['claim files: held — ok', claim], ['  | 120 pass', '  | 0 fail'])
    expect(out.startsWith("## Verifier's gate record")).toBe(true)
    expect(out.includes(claim)).toBe(true)
    expect(out.includes('claim files')).toBe(false)
    expect(out.includes('  | 0 fail')).toBe(true)
  })
  test('no gate claim gives a line saying no record exists', () => {
    const out = gateRecord(['claim files: held — ok'], [])
    expect(out.startsWith("## Verifier's gate record")).toBe(true)
    expect(out.includes('no gate record')).toBe(true)
  })
  test('the record renders into the template through {{gaterecord}}', () => {
    expect(renderReview('{{gaterecord}}\nend', { gaterecord: gateRecord([claim], []) }).includes(claim)).toBe(true)
  })
})

describe('MOD-258: orphanReview through the hooks (MOD-224)', () => {
  const BRIEF = `${SCRATCH}/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=2-attempts report=chassis.report.v1]]'
  const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const OPTIONS = { review: 'on', verdictVerbosity: 'full', gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const MB = 'b'.repeat(40)
  const run = (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length).padEnd(40, '0')}\n` }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : '1234abcd'.padEnd(40, '0')}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${'1234abcd'.padEnd(40, '0')}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: 'A\ta/x.ts\n' }
    return undefined
  }
  const block = (task: string, extra: string) => `confirmed: a/x.ts gains the parser — a/x.ts:12\n[[review v=1 task=${task}${extra} confirmed=1 refuted=0 unverifiable=0]]`
  const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
  const recs = (w: { store: Map<string, unknown> }) => (w.store.get(`delegation.tasks.T-4@${ROOT}`) ?? []) as Record<string, unknown>[]
  const ledger = (w: { files: Map<string, string> }) => (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>)
  const handedBack = async ($: Parameters<Parameters<typeof test>[1]>[0], on: Parameters<typeof world>[0]) => {
    const w = world(on, { files: { [BRIEF]: HEADER + '\nbody' }, run, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-4', 'Added the parser.\n' + REPORT))
    return w
  }

  test('a reviewer hand-back with no spawn record is matched by task+attempt+sha and its row is written once', { options: OPTIONS }, async ($, on) => {
    const w = await handedBack($, on)
    expect(recs(w).filter(r => r.kind === 'review')).toHaveLength(0)
    expect([...w.store.keys()].filter(k => k.startsWith('delegation.spawn.review-'))).toEqual([])
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=1 sha=1234abcd'), usage('claude-haiku-4-5', 40_000, 2_000)))
    // the record the orphan path rebuilds for the lost spawn, joined to the worker's attempt by task+attempt+sha
    expect(w.store.get('delegation.spawn.review-agent-9')).toMatchObject({ task: 'T-4', attempt: 1, purpose: 'review', description: 'T-4 review (spawn record lost)', review: { worker: 'agent-4', sha: '1234abcd' }, verdictAttempt: 1 })
    expect(ledger(w).filter(l => l.kind === 'review')).toHaveLength(1)
    expect(ledger(w).at(-1)).toMatchObject({ task: 'T-4', kind: 'review', verdict: 'reviewed', next: 'accept' })
    // the same hand-back again is not recorded twice
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=1 sha=1234abcd')))
    expect(ledger(w).filter(l => l.kind === 'review')).toHaveLength(1)
  })

  test('MOD-265: at turn.complete an orphan review row is appended once, wakes the brain once and is the verdict tool row', { options: { ...OPTIONS, wakeOnVerdict: true } }, async ($, on) => {
    const w = await handedBack($, on)
    const before = w.appended.length
    const woke = w.submitted.length
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=1 sha=1234abcd'), usage('claude-haiku-4-5', 40_000, 2_000)))
    const added = w.appended.slice(before).map(a => a.text)
    expect(added.filter(t => t.includes('review'))).toHaveLength(1)
    expect(w.submitted.length - woke).toBe(1)
    // the same hand-back again adds nothing
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=1 sha=1234abcd')))
    expect(w.appended.slice(before)).toHaveLength(added.length)
    expect(w.submitted.length - woke).toBe(1)
  })

  test('MOD-265: a refuting orphan review shows its row once at turn.complete', { options: { ...OPTIONS, wakeOnVerdict: true } }, async ($, on) => {
    const w = await handedBack($, on)
    const refuting = 'refuted: a/x.ts gains the parser — a/x.ts:12 has no parser\n[[review v=1 task=T-4 attempt=1 sha=1234abcd confirmed=0 refuted=1 unverifiable=0]]'
    const before = w.appended.length
    await $.turn.complete(turnInput('agent-9', refuting, usage('claude-haiku-4-5', 40_000, 2_000)))
    const added = w.appended.slice(before).map(a => a.text)
    expect(added.filter(t => t.includes('no parser'))).toHaveLength(1)
    await $.turn.complete(turnInput('agent-9', refuting))
    expect(w.appended.slice(before).filter(a => a.text.includes('no parser'))).toHaveLength(1)
  })

  test('MOD-265: a block that names another attempt or sha appends nothing at turn.complete', { options: OPTIONS }, async ($, on) => {
    const w = await handedBack($, on)
    const before = w.appended.length
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=2 sha=1234abcd')))
    await $.turn.complete(turnInput('agent-9', block('T-4', ' attempt=1 sha=deadbeef')))
    expect(w.appended.slice(before).filter(a => a.text.includes('review'))).toHaveLength(0)
  })

  test('an orphan review that names a task nothing waits on is ignored: no row, no record', { options: OPTIONS }, async ($, on) => {
    const w = await handedBack($, on)
    const before = { led: ledger(w).length, shown: delivered(w) }
    await $.turn.complete(turnInput('agent-9', block('T-9', ' attempt=1 sha=1234abcd')))
    expect(ledger(w)).toHaveLength(before.led)
    expect(ledger(w).some(l => l.kind === 'review')).toBe(false)
    expect(recs(w).filter(r => r.kind === 'review')).toHaveLength(0)
    expect(w.store.get('delegation.tasks.T-9@' + ROOT)).toBeUndefined()
    expect([...w.store.keys()].filter(k => k.startsWith('delegation.spawn.review-'))).toEqual([])
    const added = delivered(w).slice(before.shown.length).split('\n').filter(l => !l.includes('no transcript for'))
    expect(added.join('\n').trim()).toBe('')
  })
})
