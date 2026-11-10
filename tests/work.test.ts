// MOD-353: /delegation work and work refresh: one gh issue list, kept five minutes, joined to the cards on disk.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT } from './harness'

const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const card = (id: string, status: string, title: string, issue?: number) =>
  ['---', `id: ${id}`, ...(issue !== undefined ? [`issue: ${issue}`] : []), `title: ${title}`, 'domain: mod', 'tier: standard', `status: ${status}`, 'scope: [hooks/x.ts]', 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const issue = (number: number, title: string, state: string, type: string, parent?: number) => ({ number, title, state, labels: [{ name: `type:${type}` }], ...(parent !== undefined ? { parent: { number: parent } } : {}) })
const ISSUES = JSON.stringify([
  issue(10, 'Checkout rework', 'OPEN', 'epic'),
  issue(11, 'Cart totals', 'OPEN', 'feature', 10),
  issue(12, 'Round tax', 'CLOSED', 'story', 11),
  issue(13, 'Restore a saved cart', 'OPEN', 'story', 11),
  issue(14, 'Empty cart banner', 'OPEN', 'bug', 11),
])
const setup = (on: any, opts: { url?: string; gh?: (argv: string[]) => unknown } = {}) =>
  world(on, {
    files: {
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'queued', 'Restore cart', 13),
      [`${CARDS}/MOD-8-b.md`]: card('MOD-8', 'queued', 'Lint config'),
      ...gitCfg(opts.url ?? 'https://github.com/o/r.git'),
    },
    dirs: { [CARDS]: ['MOD-9-a.md', 'MOD-8-b.md'] },
    run: async (argv: string[]) => {
      if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
      if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'list') return (opts.gh ? opts.gh(argv) : { exitCode: 0, stdout: ISSUES }) as never
      return undefined
    },
  })
const run = async ($: any, args: string) => String((await $.command.run({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
const listCalls = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh' && a[1] === 'issue' && a[2] === 'list')

describe('MOD-353: /delegation work', () => {
  test('prints the summary line, the parent line and the card leaves', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = await run($, 'work text')
    expect(out).toContain('**Work** · 0 working · 0 to review · 2 queued · 0 blocked · 1 backlog · 1 done · Updated just now')
    expect(out).toContain('- **#10 Checkout rework** 1/3')
    expect(out).toContain('  - QUEUED — Lint config · MOD-8')
    expect(listCalls(w)).toEqual([['gh', 'issue', 'list', '--repo', 'o/r', '--state', 'all', '--limit', '300', '--json', 'number,title,state,labels,parent']])
  })

  test('a second work within five minutes runs no second gh issue list; work refresh reads again', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await run($, 'work text')
    await run($, 'work text')
    expect(listCalls(w)).toHaveLength(1)
    await run($, 'work refresh')
    expect(listCalls(w)).toHaveLength(2)
  })

  test('a failed read gives the cards-only note and still lists the cards', async ($, on) => {
    setup(on, { gh: () => ({ exitCode: 1, stdout: '', stderr: 'boom' }) })
    await $.session.start(sessionStart)
    const out = await run($, 'work text')
    expect(out).toContain('could not read the issues (gh issue list failed: boom): cards only')
    expect(out).toContain('MOD-9')
    expect(out).toContain('QUEUED — Lint config · MOD-8')
  })

  test('an origin that is not GitHub gives its note and runs no gh', async ($, on) => {
    const w = setup(on, { url: 'https://example.com/o/r.git' })
    await $.session.start(sessionStart)
    const out = await run($, 'work text')
    expect(out).toContain('origin is not a GitHub remote: cards only')
    expect(w.runs.filter((r: { argv: string[] }) => r.argv[0] === 'gh')).toEqual([])
  })
})
