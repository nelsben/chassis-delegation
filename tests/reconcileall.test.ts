// MOD-299: tree reconcile all: the word reaches the tool, the usage line, and the no-epic line.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT } from './harness'

const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const setup = (on: any, epics: string, labels = '[{"name":"type:epic"}]', views: Record<string, unknown> = {}) =>
  world(on, {
    files: {
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      ...gitCfg('https://github.com/o/r.git'),
    },
    run: async (argv: string[]) => {
      if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
      if (argv[0] === 'gh' && argv[1] === 'label') return { exitCode: 0, stdout: labels }
      if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'view') return { exitCode: 0, stdout: JSON.stringify(views[argv[3]!] ?? { number: Number(argv[3]), title: '', state: 'OPEN', body: '', subIssues: [] }) }
      if (argv[0] === 'gh' && argv[2] === 'list') return { exitCode: 0, stdout: epics }
      return undefined
    },
  })
const run = async ($: any, args: string) => String((await $.command.run({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)

describe('MOD-299: tree reconcile all', () => {
  test('a bad word prints the usage line naming all', async ($, on) => {
    setup(on, '[]')
    await $.session.start(sessionStart)
    expect(await run($, 'tree reconcile every')).toContain('/delegation tree reconcile <n>|all [--confirm]')
  })

  test('no open type:epic issue prints the name-one line', async ($, on) => {
    const w = setup(on, '[]')
    await $.session.start(sessionStart)
    const out = String(((await $.tool.call({ tool: 'mcp__chassis-delegation__tree', reconcile: true, all: true } as never)) as { result?: unknown }).result)
    expect(out).toBe('tree reconcile all: no open type:epic issue on o/r; name one: /delegation tree reconcile <n>')
    const list = w.runs.map((r: { argv: string[] }) => r.argv).find((a: string[]) => a[0] === 'gh' && a[1] === 'issue' && a[2] === 'list')
    expect(list).toEqual(['gh', 'issue', 'list', '--repo', 'o/r', '--state', 'open', '--label', 'type:epic', '--limit', '100', '--json', 'number,title'])
  })

  test('no type:epic label on the repo points at setup', async ($, on) => {
    const w = setup(on, '[]', '[{"name":"bug"}]')
    await $.session.start(sessionStart)
    const out = String(((await $.tool.call({ tool: 'mcp__chassis-delegation__tree', reconcile: true, all: true } as never)) as { result?: unknown }).result)
    expect(out).toBe('tree reconcile all: no type:epic label on o/r: run /delegation setup to create the tree labels')
    const label = w.runs.map((r: { argv: string[] }) => r.argv).find((a: string[]) => a[0] === 'gh' && a[1] === 'label')
    expect(label).toEqual(['gh', 'label', 'list', '--repo', 'o/r', '--json', 'name', '--limit', '100'])
  })

  test('a label list that is not JSON falls back to the no-open-epic line', async ($, on) => {
    setup(on, '[]', 'oops')
    await $.session.start(sessionStart)
    const out = String(((await $.tool.call({ tool: 'mcp__chassis-delegation__tree', reconcile: true, all: true } as never)) as { result?: unknown }).result)
    expect(out).toContain('no open type:epic issue on o/r')
  })

  test('every epic is walked in one run, newest first, with the cap per epic', { options: { treeImportBatch: 1 } }, async ($, on) => {
    const kids = (ns: number[]) => ns.map(n => ({ number: n, title: `Kid ${n}`, state: 'OPEN', subIssues: [] }))
    setup(on, '[{"number":10,"title":"Old"},{"number":20,"title":"Mid"},{"number":30,"title":"New"}]', undefined, {
      '10': { number: 10, title: 'Old', subIssues: kids([11, 12]) },
      '20': { number: 20, title: 'Mid', subIssues: kids([21, 22]) },
      '30': { number: 30, title: 'New', subIssues: kids([31]) },
    })
    await $.session.start(sessionStart)
    const out = String(((await $.tool.call({ tool: 'mcp__chassis-delegation__tree', reconcile: true, all: true } as never)) as { result?: unknown }).result)
    const at = (h: string) => out.indexOf(h)
    expect(at('## #30 New')).toBeGreaterThan(-1)
    expect(at('## #20 Mid')).toBeGreaterThan(at('## #30 New'))
    expect(at('## #10 Old')).toBeGreaterThan(at('## #20 Mid'))
    expect(out).toContain('#22 — not read: run /delegation tree reconcile 20')
    expect(out).toContain('#12 — not read: run /delegation tree reconcile 10')
    expect(out).not.toContain('epics (')
  })
})
