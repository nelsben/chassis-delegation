// MOD-288: /delegation tree reconcile <n> [--confirm]: the dry run prints the close line and runs no close; confirm runs exactly the done-elsewhere closes.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT } from './harness'

const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const card = (id: string, status: string, scope: string, issue?: number) => ['---', `id: ${id}`, ...(issue !== undefined ? [`issue: ${issue}`] : []), `title: Card ${id}`, 'domain: mod', 'tier: standard', `status: ${status}`, `scope: [${scope}]`, 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const PARENT = JSON.stringify({
  number: 50,
  title: 'Export rework',
  state: 'OPEN',
  labels: [{ name: 'type:feature' }],
  body: '',
  subIssues: [
    { number: 51, title: 'Fix header', state: 'OPEN' },
    { number: 52, title: 'Closed story', state: 'CLOSED', subIssues: [{ number: 55, state: 'OPEN' }] },
    { number: 53, title: 'Unrelated', state: 'OPEN' },
  ],
})
const bodyOf = (n: number) => (n === 51 ? '```scope\nhooks/x.ts\n```' : '```scope\nsrc/else/**\n```')
const ghRun = async (argv: string[]) => {
  if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
  if (argv[0] !== 'gh') return undefined
  if (argv[2] === 'view') {
    const n = Number(argv[3])
    return { exitCode: 0, stdout: n === 50 ? PARENT : JSON.stringify({ number: n, title: 't', state: 'OPEN', labels: [], body: bodyOf(n), subIssues: [] }) }
  }
  return { exitCode: 0, stdout: '' }
}
const setup = (on: any) =>
  world(on, {
    files: {
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'merged', 'hooks/x.ts', 51),
      [LEDGER]: `${JSON.stringify({ kind: 'merged', task: 'MOD-9', sha: 'abc1234', pr: 41, at: 1 })}\n`,
      ...gitCfg('https://github.com/o/r.git'),
    },
    dirs: { [CARDS]: ['MOD-9-a.md'] },
    run: ghRun,
  })
const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const closes = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh' && a[2] === 'close')

describe('MOD-288: tree reconcile', () => {
  test('the dry run prints the close line and runs no close', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50, reconcile: true } as never))
    expect(out).toContain('#51 Fix header — done in MOD-9 (#41)')
    expect(out).toContain("gh issue close 51 --repo o/r --comment 'done in MOD-9 (#41)'")
    expect(out).toContain('#52 Closed story — closed, 1 children open (#55)')
    expect(out).toContain("# gh issue close 53 --repo o/r --comment 'not planned'")
    expect(closes(w)).toEqual([])
  })

  test('confirm runs exactly the done-elsewhere closes', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = String((await $.command.run({ command: 'delegation', args: 'tree reconcile 50 --confirm', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(closes(w)).toEqual([['gh', 'issue', 'close', '51', '--repo', 'o/r', '--comment', 'done in MOD-9 (#41)']])
    expect(out).toContain('closed #51')
  })
})

describe('MOD-340: a merged card with no ledger row', () => {
  const bare = (on: any) =>
    world(on, {
      files: {
        [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
        [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'merged', 'hooks/x.ts', 51),
        ...gitCfg('https://github.com/o/r.git'),
      },
      dirs: { [CARDS]: ['MOD-9-a.md'] },
      run: ghRun,
    })
  test('the dry run lists the sub-issue as done in the card', async ($, on) => {
    bare(on)
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50, reconcile: true } as never))
    expect(out).toContain('#51 Fix header — done in MOD-9')
  })
  test('confirm closes it with done in <card id>', async ($, on) => {
    const w = bare(on)
    await $.session.start(sessionStart)
    await $.command.run({ command: 'delegation', args: 'tree reconcile 50 --confirm', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    expect(closes(w)).toEqual([['gh', 'issue', 'close', '51', '--repo', 'o/r', '--comment', 'done in MOD-9']])
  })
})

describe('MOD-361: a repo statusMap reads a card status as the mod word (tree reconcile)', () => {
  const doneCard = (on: any, statusMap?: Record<string, string>) =>
    world(on, {
      files: {
        [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards', ...(statusMap ? { statusMap } : {}) }),
        [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'done', 'hooks/x.ts', 51),
        ...gitCfg('https://github.com/o/r.git'),
      },
      dirs: { [CARDS]: ['MOD-9-a.md'] },
      run: ghRun,
    })
  test('without a map a done card is not a merged one: sub-issue 51 is listed in no done-elsewhere line', async ($, on) => {
    doneCard(on)
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50, reconcile: true } as never))
    expect(out).not.toContain('#51 Fix header — done in MOD-9')
  })
  test('with statusMap done -> merged the card counts as merged and sub-issue 51 is done in MOD-9', async ($, on) => {
    doneCard(on, { done: 'merged' })
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50, reconcile: true } as never))
    expect(out).toContain('#51 Fix header — done in MOD-9')
  })
})


describe('MOD-362: an open parent whose sub-issues are all closed', () => {
  // parent 60 has an open sub-issue 61 (its own two sub-issues closed) and a closed sub-issue 62
  const NODES = [{ number: 63, title: 'a', state: 'CLOSED' }, { number: 64, title: 'b', state: 'CLOSED' }]
  const parentView = (totalCount = 2) =>
    JSON.stringify({
      number: 60,
      title: 'Parent story',
      state: 'OPEN',
      labels: [],
      body: '',
      subIssues: { nodes: [{ number: 61, title: 'Open leaf parent', state: 'OPEN' }, { number: 62, title: 'Done leaf', state: 'CLOSED' }], totalCount },
    })
  let parentTotal = 2
  let ownTotal = 2
  const build = (on: any, failOn?: number) => {
    parentTotal = 2
    ownTotal = 2
    const w = world(on, {
      files: {
        [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
        ...gitCfg('https://github.com/o/r.git'),
      },
      run: async (argv: string[]) => {
        if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
        if (argv[0] !== 'gh') return undefined
        if (argv[2] === 'view') {
          const n = Number(argv[3])
          return { exitCode: 0, stdout: n === 60 ? parentView(parentTotal) : JSON.stringify({ number: n, title: 't', state: 'OPEN', labels: [], body: '', subIssues: { nodes: NODES, totalCount: ownTotal } }) }
        }
        if (argv[2] === 'close' && Number(argv[3]) === failOn) return { exitCode: 1, stdout: '', stderr: 'boom' }
        return { exitCode: 0, stdout: '' }
      },
    })
    return w
  }
  const confirm = async ($: any) => String((await $.command.run({ command: 'delegation', args: 'tree reconcile 60 --confirm', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
  test('the dry run prints both rows and both live close lines and closes nothing', async ($, on) => {
    const w = build(on)
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 60, reconcile: true } as never))
    expect(out).toContain('#61 Open leaf parent — open, all 2 sub-issues closed')
    expect(out).toContain('#60 Parent story — open, all 2 sub-issues closed once the closes above run')
    expect(out).toContain("gh issue close 61 --repo o/r --comment 'all 2 sub-issues done'")
    expect(out).toContain("gh issue close 60 --repo o/r --comment 'all 2 sub-issues done'")
    expect(out).not.toContain('not planned')
    expect(closes(w)).toEqual([])
  })
  test('confirm closes the sub-issue, then the parent', async ($, on) => {
    const w = build(on)
    await $.session.start(sessionStart)
    const out = await confirm($)
    expect(closes(w)).toEqual([
      ['gh', 'issue', 'close', '61', '--repo', 'o/r', '--comment', 'all 2 sub-issues done'],
      ['gh', 'issue', 'close', '60', '--repo', 'o/r', '--comment', 'all 2 sub-issues done'],
    ])
    expect(out).toContain('closed #61')
    expect(out).toContain('closed #60')
  })
  test('a failed sub-issue close leaves the parent untried and says so', async ($, on) => {
    const w = build(on, 61)
    await $.session.start(sessionStart)
    const out = await confirm($)
    expect(closes(w).map((a: string[]) => a[3])).toEqual(['61'])
    expect(out).toContain('close #61 failed: boom')
    expect(out).toContain('#60 left open: run again once its sub-issues are closed')
  })
  test('a sub-issue whose own list was cut short is no match, and nothing says open, all', async ($, on) => {
    build(on)
    ownTotal = 3
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 60, reconcile: true } as never))
    expect(out).toContain('#61 Open leaf parent — no match')
    expect(out).not.toContain('open, all')
  })
  test('a parent whose own list was cut short prints no parent row', async ($, on) => {
    build(on)
    parentTotal = 3
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 60, reconcile: true } as never))
    expect(out).toContain('#61 Open leaf parent — open, all 2 sub-issues closed')
    expect(out).not.toContain('#60 Parent story')
  })
})
