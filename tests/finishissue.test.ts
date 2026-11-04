// MOD-286: merge finish walks up the issue tree: each ancestor whose sub-issues are all closed is closed, in order.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT, NOW, type RunAnswer } from './harness'
import { markMerged } from '../hooks/lib/mergecmd'

const ID = 'MOD-1'
const WT = `${ROOT}-${ID}`
const BRANCH = `agent/mod/${ID}`
const CARD_NAME = `${ID}-a-thing.md`
const CARD_PATH = `${ROOT}/docs/cards/${CARD_NAME}`
const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const HEAD = 'def5678def5678def5678def5678def5678def56'
const TWIN = '9999999999999999999999999999999999999999'
const TREE = 'aaaa111122223333444455556666777788889999'
const GATES = { validate: 'claude plugin validate {worktree}', node: 'node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs', test: 'claude plugin test {worktree}' }
const CARD = ['---', `id: ${ID}`, 'title: The thing works', 'domain: mod', 'tier: standard', 'status: queued', 'scope: [hooks/register.ts]', 'gate: validate, node, test', 'issue: 52', 'parent: 50', '---', '## Why', '', 'Because.', '', '## Done when', '', '- The thing works.', ''].join('\n')
const PORCELAIN = [`worktree ${ROOT}`, 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '', `worktree ${WT}`, `HEAD ${HEAD}`, `branch refs/heads/${BRANCH}`, ''].join('\n')
const is = (argv: string[], ...want: string[]) => argv.join(' ') === want.join(' ')
const view = (n: number) => ['gh', 'issue', 'view', String(n), '--repo', 'acme/acme-app', '--json', 'number,title,state,labels,body,subIssues,parent']
const json = (number: number, parent: number | undefined, subs: [number, string][]) => JSON.stringify({ number, title: 'x', state: 'OPEN', labels: [], body: '', ...(parent ? { parent: { number: parent } } : {}), subIssues: { nodes: subs.map(([n, state]) => ({ number: n, title: 't', state })), totalCount: subs.length } })

const answers = (over: (argv: string[]) => RunAnswer | undefined): ((argv: string[]) => RunAnswer | undefined) => argv => {
  const o = over(argv)
  if (o) return o
  if (is(argv, 'git', '-C', ROOT, 'worktree', 'list', '--porcelain')) return { exitCode: 0, stdout: PORCELAIN }
  if (is(argv, 'git', '-C', ROOT, 'check-ignore', '-q', '--', `docs/cards/${CARD_NAME}`)) return { exitCode: 1, stdout: '' }
  if (is(argv, 'git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')) return { exitCode: 0, stdout: 'main\n' }
  if (is(argv, 'git', '-C', ROOT, 'status', '--porcelain')) return { exitCode: 0, stdout: `?? docs/cards/${CARD_NAME}\n` }
  if (is(argv, 'git', '-C', ROOT, 'remote', 'get-url', 'origin')) return { exitCode: 0, stdout: 'git@github.com:acme/acme-app.git\n' }
  if (is(argv, 'git', '-C', WT, 'rev-parse', 'HEAD')) return { exitCode: 0, stdout: `${HEAD}\n` }
  if (is(argv, 'git', '-C', WT, 'log', '-1', '--format=%T%x09%s', 'HEAD')) return { exitCode: 0, stdout: `${TREE}\tcards: ${ID} merged\n` }
  if (is(argv, 'git', '-C', ROOT, 'log', '--format=%H%x09%T%x09%s', '-n', '200', 'origin/main')) return { exitCode: 0, stdout: `${TWIN}\t${TREE}\tcards: ${ID} merged\n` }
  if (is(argv, 'git', '-C', ROOT, 'show', `${TWIN}:docs/cards/${CARD_NAME}`)) return { exitCode: 0, stdout: markMerged(CARD) }
  return undefined
}
const mergeCmd = (args: string) => ({ command: 'delegation', args: `merge ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const RECORD = { task: ID, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: NOW - 60_000, sha: 'abc1234', root: ROOT, sessionId: 'sess-1' }

describe('MOD-286: finish closes every ancestor whose sub-issues are all closed', () => {
  test('two views answered: the task, the parent and the grandparent are closed in order', async ($, on) => {
    const run = answers(argv => {
      if (is(argv, ...view(50))) return { exitCode: 0, stdout: json(50, 40, [[51, 'CLOSED'], [52, 'OPEN']]) }
      if (is(argv, ...view(40))) return { exitCode: 0, stdout: json(40, undefined, [[50, 'OPEN']]) }
      return undefined
    })
    const w = world(on, { files: { [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: GATES, domains: ['mod'], cardDir: 'docs/cards' }), [CARD_PATH]: CARD, [LEDGER]: JSON.stringify({ task: ID, subtask: 'main', attempt: 1, kind: 'spawn', verdict: 'consistent', sha: 'abc1234', next: 'accept' }) + '\n' }, dirs: { [`${ROOT}/docs/cards`]: [CARD_NAME] }, store: { [`delegation.tasks.${ID}`]: [RECORD] }, run })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(ID))
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    const closes = w.runs.map(r => r.argv).filter(a => a[0] === 'gh' && a[2] === 'close')
    expect(closes.map(a => a[3])).toEqual(['52', '50', '40'])
    expect(closes[1]?.[7]).toBe('all 2 tasks done')
    expect(closes[2]?.[7]).toBe('all 1 sub-issues done')
    expect(out).toContain('closed #40')
    expect(w.runs.map(r => r.argv)).toContainEqual(view(40))
  })
})
