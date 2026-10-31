// MOD-247: the ledger is held as parsed rows keyed on the (mtimeMs, size) of .delegation/ledger.jsonl.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, spawnInput, ROOT, NOW } from './harness'
import * as attempts from '../hooks/lib/attempts'
import * as storeloss from '../hooks/lib/storeloss'

const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const card = (id: string) => ['---', `id: ${id}`, `title: Card ${id}`, 'domain: mod', 'tier: standard', 'status: queued', 'scope: [src/**]', 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const row = (task: string, extra: Record<string, unknown> = {}) => JSON.stringify({ kind: 'accept', task, subtask: 'main', attempt: 1, how: 'merged', at: NOW, ...extra })
const land = (args: string) => ({ command: 'delegation', args: `land ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const setup = (on: any, ledger: string) =>
  world(on, {
    files: { [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }), [`${CARDS}/MOD-1-a.md`]: card('MOD-1'), [LEDGER]: ledger },
    dirs: { [CARDS]: ['MOD-1-a.md'], [`${ROOT}/.delegation`]: ['ledger.jsonl'] },
  })
const ledgerReads = (w: { reads: string[] }) => w.reads.filter(p => p === LEDGER).length

describe('MOD-247: the ledger is read once while its (mtime, size) is unchanged', () => {
  test('two reads with no append between them make one fs.read of the ledger', async ($, on) => {
    const w = setup(on, `${row('MOD-9')}\n`)
    await $.session.start(sessionStart)
    await $.command.run(land('bug "A" --paths src/a.ts --dry-run'))
    await $.command.run(land('bug "B" --paths src/b.ts --dry-run'))
    expect(ledgerReads(w)).toBe(1)
  })

  test('a row appended by another writer changes the size and is seen on the next read', async ($, on) => {
    const w = setup(on, `${row('MOD-9')}\n`)
    await $.session.start(sessionStart)
    await $.command.run(land('bug "A" --paths src/a.ts --dry-run'))
    w.files.set(LEDGER, `${row('MOD-9')}\n${row('MOD-1')}\n`)
    const out = String((await $.command.run(land('bug "B" --paths src/b.ts --dry-run'))).text)
    expect(ledgerReads(w)).toBe(2)
    expect(out).not.toContain('MOD-1')
  })

  test('the mod\'s own append keeps the cache: the row is seen with no fs.read; a foreign row then drops it', async ($, on) => {
    const T = `${ROOT}/.delegation/briefs/T-4.brief.md`
    const w = world(on, {
      files: { [REPO_FILE]: JSON.stringify({ domains: ['mod'], cardDir: 'docs/cards' }), [`${CARDS}/MOD-1-a.md`]: card('MOD-1'), [LEDGER]: `${row('MOD-9')}\n`, [T]: '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]\nbody' },
      dirs: { [CARDS]: ['MOD-1-a.md'] },
      agentId: 'agent-4',
    })
    await $.session.start(sessionStart)
    await $.command.run(land('bug "A" --paths src/a.ts --dry-run'))
    expect(ledgerReads(w)).toBe(1)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${T}.` }))
    expect((w.files.get(LEDGER) ?? '').trim().split('\n')).toHaveLength(2)
    await $.command.run(land('bug "B" --paths src/b.ts --dry-run'))
    expect(ledgerReads(w)).toBe(1)
    // a row another session appends: the size is no longer what the cache holds
    w.files.set(LEDGER, `${w.files.get(LEDGER)}${row('MOD-1')}\n`)
    await $.command.run(land('bug "C" --paths src/c.ts --dry-run'))
    expect(ledgerReads(w)).toBe(2)
  })
})

describe('MOD-247: the pure readers take parsed rows', () => {
  test('parseLedger skips blank and non-JSON lines; ledgerHas reads the rows', () => {
    const { ledgerHas } = attempts as any
    const { parseLedger } = storeloss as any
    const rows = parseLedger(`${row('A-1')}\nnot json\n\n[1]\n${row('A-2')}\n`)
    expect(rows).toHaveLength(2)
    expect(ledgerHas(rows, { kind: 'accept', task: 'A-2', subtask: 'main', attempt: 1 })).toBe(true)
    expect(ledgerHas(rows, { kind: 'accept', task: 'A-3', subtask: 'main', attempt: 1 })).toBe(false)
  })
})
