// MOD-143 (#231 part 2): a card can name a merge check, `merge_check:` in the card or a `mergeCheckMap` entry for
// one of its gate ids. Merge runs it in the worktree, by argv, before it rebases; a non-zero exit refuses the merge.
// Every command here is answered by the harness; nothing real runs.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT, NOW, type RunAnswer } from './harness'
import { cardFromFields, type CardCtx } from '../hooks/lib/card'

const ID = 'MOD-1'
const WT = `${ROOT}-${ID}`
const CARD_NAME = `${ID}-a-thing.md`
const CARD_PATH = `${ROOT}/docs/cards/${CARD_NAME}`
const WT_CARD = `${WT}/docs/cards/${CARD_NAME}`
const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const HEAD = 'def5678def5678def5678def5678def5678def56'
const BRANCH = `agent/mod/${ID}`
const GATES = { test: 'claude plugin test {worktree}', smoke: 'node smoke.cjs' }
const repoFile = (extra: Record<string, unknown> = {}) => JSON.stringify({ gateMap: GATES, domains: ['mod'], cardDir: 'docs/cards', ...extra })
const card = (extra: string[] = [], gate = 'test') =>
  ['---', `id: ${ID}`, 'title: The thing works', 'domain: mod', 'tier: standard', 'status: queued', 'scope: [hooks/register.ts]', `gate: ${gate}`, ...extra, '---', '## Why', '', 'Because.', '', '## Done when', '', '- The thing works.', ''].join('\n')
const RECORD = { task: ID, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: NOW - 60_000, sha: 'abc1234', root: ROOT, sessionId: 'sess-1' }
const ROW = JSON.stringify({ task: ID, subtask: 'main', attempt: 1, kind: 'spawn', verdict: 'consistent', sha: 'abc1234', next: 'accept' }) + '\n'
const PORCELAIN = [`worktree ${ROOT}`, 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '', `worktree ${WT}`, `HEAD ${HEAD}`, `branch refs/heads/${BRANCH}`, ''].join('\n')

const is = (argv: string[], ...want: string[]) => argv.join(' ') === want.join(' ')
type Answers = (argv: string[]) => RunAnswer | undefined
const happy = (over: Answers = () => undefined): Answers => argv => {
  const o = over(argv)
  if (o) return o
  if (is(argv, 'git', '-C', ROOT, 'worktree', 'list', '--porcelain')) return { exitCode: 0, stdout: PORCELAIN }
  if (is(argv, 'git', '-C', ROOT, 'check-ignore', '-q', '--', `docs/cards/${CARD_NAME}`)) return { exitCode: 1, stdout: '' }
  if (is(argv, 'git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')) return { exitCode: 0, stdout: 'main\n' }
  if (is(argv, 'git', '-C', ROOT, 'status', '--porcelain')) return { exitCode: 0, stdout: `?? docs/cards/${CARD_NAME}\n` }
  if (is(argv, 'git', '-C', ROOT, 'remote', 'get-url', 'origin')) return { exitCode: 0, stdout: 'git@github.com:acme/acme-app.git\n' }
  if (is(argv, 'git', '-C', WT, 'rev-parse', 'HEAD')) return { exitCode: 0, stdout: `${HEAD}\n` }
  return undefined
}
const setup = (cardText: string, repo = repoFile()) => ({
  files: { [`${ROOT}/.chassis-delegation.json`]: repo, [CARD_PATH]: cardText, [LEDGER]: ROW },
  dirs: { [`${ROOT}/docs/cards`]: [CARD_NAME] },
  store: { [`delegation.tasks.${ID}`]: [RECORD] },
})
const mergeCmd = (args: string) => ({ command: 'delegation', args: `merge ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const noRebase = (w: { runs: { argv: string[] }[] }) => !w.runs.some(r => r.argv.includes('rebase') || r.argv.includes('commit'))

describe('MOD-143: merge runs the card\'s merge check before it rebases', () => {
  test('(1) a check that exits 0 lets merge go on and is named in the success line; the script saw the card id and the full sha', async ($, on) => {
    const s = setup(card(['merge_check: node check.cjs {card} {sha}']))
    const w = world(on, { ...s, run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    const ran = w.runs.find(r => r.argv[0] === 'node' && r.argv[1] === 'check.cjs')
    expect(ran?.argv).toEqual(['node', 'check.cjs', ID, HEAD])
    expect(ran?.cwd).toBe(WT)
    expect(/^[0-9a-f]{40}$/.test(ran?.argv[3] ?? '')).toBe(true)
    // the check ran before the rebase
    const order = w.runs.map(r => r.argv.join(' '))
    expect(order.indexOf(`node check.cjs ${ID} ${HEAD}`)).toBeLessThan(order.indexOf(`git -C ${WT} rebase origin/main`))
    expect(out).toContain('merge check passed (node check.cjs {card} {sha})')
    expect(out).toContain('rebased onto origin/main')
  })

  test('(2) a check that exits 1 refuses the merge with the output tail; nothing is rebased or committed', async ($, on) => {
    const noisy = Array.from({ length: 20 }, (_, i) => `out ${i + 1}`).join('\n')
    const s = setup(card(['merge_check: node fail.cjs {card}']))
    const w = world(on, { ...s, run: happy(argv => (argv[1] === 'fail.cjs' ? { exitCode: 1, stdout: noisy, stderr: 'boom' } : undefined)) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    const lines = out.split('\n')
    expect(lines[0]).toBe(`${ID}: merge check failed: node fail.cjs {card} exited 1; nothing was rebased or committed`)
    expect(lines.slice(1)).toHaveLength(15)
    expect(lines.at(-1)).toBe('boom')
    expect(noRebase(w)).toBe(true)
    expect(w.runs.some(r => r.argv.includes('fetch'))).toBe(false)
    expect(w.files.has(WT_CARD)).toBe(false)
    expect(w.files.get(CARD_PATH)).toBe(s.files[CARD_PATH])
  })

  test('(3) a mergeCheckMap entry for gate id smoke applies to a card with gate "test, smoke"', async ($, on) => {
    const repo = repoFile({ mergeCheckMap: { smoke: 'node mapcheck.cjs {card}' } })
    const w = world(on, { ...setup(card([], 'test, smoke'), repo), run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.some(r => is(r.argv, 'node', 'mapcheck.cjs', ID))).toBe(true)
    expect(out).toContain('merge check passed (node mapcheck.cjs {card})')
  })

  test('(3b) ... and not to a card with gate "test"', async ($, on) => {
    const repo = repoFile({ mergeCheckMap: { smoke: 'node mapcheck.cjs {card}' } })
    const w = world(on, { ...setup(card([], 'test'), repo), run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.some(r => r.argv[1] === 'mapcheck.cjs')).toBe(false)
    expect(out).not.toContain('merge check passed')
  })

  test('(4) the card\'s own merge_check overrides the map', async ($, on) => {
    const repo = repoFile({ mergeCheckMap: { smoke: 'node mapcheck.cjs {card}' } })
    const w = world(on, { ...setup(card(['merge_check: node own.cjs {card}'], 'test, smoke'), repo), run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.some(r => is(r.argv, 'node', 'own.cjs', ID))).toBe(true)
    expect(w.runs.some(r => r.argv[1] === 'mapcheck.cjs')).toBe(false)
    expect(out).toContain('merge check passed (node own.cjs {card})')
  })
})

describe('MOD-143: the card tool takes mergeCheck', () => {
  const ctx: CardCtx = { domains: ['ops'], gateIds: ['test'], names: [], spendByTier: { economy: 2, standard: 6, frontier: 15 } }
  const input = (over: Record<string, unknown> = {}) => ({ title: 'T', why: 'W', doneWhen: ['d'], scope: ['a/**'], redTest: 'none', ...over })

  test('a mergeCheck is written as the merge_check field', () => {
    const r = cardFromFields(input({ mergeCheck: 'node check.cjs {card} {sha}' }), ctx)
    if ('error' in r) throw new Error(r.error)
    expect(r.text).toContain('\nmerge_check: node check.cjs {card} {sha}\n')
  })

  test('(5) a command the gate checker refuses is named at card write, with its reason', () => {
    expect(cardFromFields(input({ mergeCheck: 'curl http://x' }), ctx)).toEqual({ error: 'mergeCheck refused: a gate may not run curl' })
    expect('error' in cardFromFields(input({ mergeCheck: 'node a.cjs; rm -rf x' }), ctx)).toBe(true)
  })
})

describe('MOD-155 (#246): gateTimeoutMinutes sets how long merge lets one gate run', () => {
  const delta: Answers = argv => (argv.includes('diff') ? { exitCode: 0, stdout: 'hooks/register.ts\n' } : undefined)
  const gateRun = (w: { runs: { argv: string[]; timeoutMs?: number }[] }) => w.runs.find(r => r.argv[0] === 'claude' && r.argv[1] === 'plugin' && r.argv[2] === 'test')
  test('8 in the repo file gives the merge gate run 480000, 15 the host ceiling of 600000', async ($, on) => {
    const set15 = world(on, { ...setup(card(), repoFile({ gateTimeoutMinutes: 8 })), run: happy(delta) })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(ID))
    expect(gateRun(set15)?.timeoutMs).toBe(480_000)
  })
  test('15 runs the merge gate at the host ceiling, which refuses a longer run', async ($, on) => {
    const w = world(on, { ...setup(card(), repoFile({ gateTimeoutMinutes: 15 })), run: happy(delta) })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(ID))
    expect(gateRun(w)?.timeoutMs).toBe(600_000)
  })
  test('unset: 540000', async ($, on) => {
    const w = world(on, { ...setup(card()), run: happy(delta) })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(ID))
    expect(gateRun(w)?.timeoutMs).toBe(540_000)
  })
})
