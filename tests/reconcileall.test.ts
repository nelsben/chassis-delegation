// MOD-299: tree reconcile all: the word reaches the tool, the usage line, and the no-epic line.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT } from './harness'

const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const setup = (on: any, epics: string) =>
  world(on, {
    files: {
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      ...gitCfg('https://github.com/o/r.git'),
    },
    run: async (argv: string[]) => {
      if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
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
    const list = w.runs.map((r: { argv: string[] }) => r.argv).find((a: string[]) => a[0] === 'gh' && a[2] === 'list')
    expect(list).toEqual(['gh', 'issue', 'list', '--repo', 'o/r', '--state', 'open', '--label', 'type:epic', '--limit', '100', '--json', 'number,title'])
  })
})
