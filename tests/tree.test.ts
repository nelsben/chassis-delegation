// MOD-194: the tree tool and /delegation tree <n>: one read-only gh issue view, printed as planned / in flight / done.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT } from './harness'

const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const card = (id: string, status: string, extra = '') => ['---', `id: ${id}`, `title: Card ${id}`, 'domain: mod', 'tier: standard', `status: ${status}`, 'scope: [hooks/x.ts]', 'gate: node', ...(extra ? [extra] : []), '---', '## Done when', '', '- It works.', ''].join('\n')
const FIXTURE = JSON.stringify({
  number: 50,
  title: 'Export rework',
  state: 'OPEN',
  labels: [{ name: 'type:feature' }],
  body: 'Why.\n\n```scope\nhooks/**\n```\n\n```forbid\ndocs/cards/**\n```\n',
  subIssues: [
    { number: 51, title: 'Fix header', state: 'CLOSED' },
    { number: 52, title: 'Fix footer', state: 'OPEN' },
    { number: 53, title: 'Fix body', state: 'OPEN' },
  ],
})
const VIEW = ['gh', 'issue', 'view', '50', '--repo', 'o/r', '--json', 'number,title,state,labels,body,subIssues']
const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const setup = (on: any, run: (argv: string[]) => any, origin = 'https://github.com/o/r.git') =>
  world(on, {
    files: { [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }), [`${CARDS}/MOD-7-a.md`]: card('MOD-7', 'queued', 'issue: 52'), ...gitCfg(origin) },
    dirs: { [CARDS]: ['MOD-7-a.md'] },
    run,
  })

describe('MOD-194: tree', () => {
  test('the tool runs the one gh issue view and prints done, in flight and planned', async ($, on) => {
    const w = setup(on, async argv => (argv[0] === 'gh' ? { exitCode: 0, stdout: FIXTURE } : undefined))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50 } as never))
    expect(w.runs.map(r => r.argv).filter(a => a[0] === 'gh')).toEqual([VIEW])
    const lines = out.split('\n')
    expect(lines[0]).toBe('#50 feature: Export rework (open)')
    expect(lines).toContain('scope: hooks/**')
    expect(lines).toContain('forbid: docs/cards/**')
    expect(lines.some(l => l.startsWith('done #51 '))).toBe(true)
    expect(lines.some(l => l.startsWith('in flight #52 ') && l.endsWith('MOD-7'))).toBe(true)
    expect(lines.some(l => l.startsWith('planned #53 '))).toBe(true)
    expect(lines).toContain('1 done · 1 in flight · 1 planned')
    expect(lines[lines.length - 1]).toBe('parentScope for a task card: ["hooks/**"]')
  })

  test('/delegation tree 50 answers the same text', async ($, on) => {
    setup(on, async argv => (argv[0] === 'gh' ? { exitCode: 0, stdout: FIXTURE } : undefined))
    await $.session.start(sessionStart)
    const viaTool = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50 } as never))
    const viaCmd = String((await $.command.run({ command: 'delegation', args: 'tree 50', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(viaCmd).toBe(viaTool)
  })

  const noFiles = (w: { files: Map<string, string> }) => [...w.files.keys()].some(k => k.startsWith(`${ROOT}/.delegation/`))
  test('a failing gh gives one line with its stderr and writes nothing', async ($, on) => {
    const w = setup(on, async argv => (argv[0] === 'gh' ? { exitCode: 1, stdout: '', stderr: 'boom: not found' } : undefined))
    await $.session.start(sessionStart)
    const a = text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50 } as never))
    expect(a.includes('\n')).toBe(false)
    expect(a).toContain('boom: not found')
    expect(noFiles(w)).toBe(false)
  })
  test('bad JSON gives one line and writes nothing', async ($, on) => {
    const w = setup(on, async argv => (argv[0] === 'gh' ? { exitCode: 0, stdout: 'not json' } : undefined))
    await $.session.start(sessionStart)
    expect(text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50 } as never)).includes('\n')).toBe(false)
    expect(noFiles(w)).toBe(false)
  })
  test('a non-GitHub origin gives one line and calls no gh', async ($, on) => {
    const w = setup(on, async () => undefined, 'git@example.org:o/r.git')
    await $.session.start(sessionStart)
    expect(text(await $.tool.call({ tool: 'mcp__chassis-delegation__tree', issue: 50 } as never)).includes('\n')).toBe(false)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
    expect(noFiles(w)).toBe(false)
  })
})
