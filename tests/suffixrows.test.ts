// MOD-296 (#398): a spawn row recorded under a suffixed id (`TASK-20 a0cd00b3`) reads closed once a later accept for the
// plain id is written, so the status view shows no open row for it. The rule itself is pure (tests/node/suffixrows.node.mjs).
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT, NOW } from './harness'

const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const card = (id: string) => ['---', `id: ${id}`, `title: Card ${id}`, 'domain: mod', 'tier: standard', 'status: queued', 'scope: [src/**]', 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const suffixedSpawn = JSON.stringify({ event: 'spawn', task: 'TASK-20 a0cd00b3', subtask: 'main', attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'pending', at: NOW - 60_000 })
const plainAccept = JSON.stringify({ kind: 'accept', task: 'TASK-20', subtask: 'main', attempt: 1, how: 'merged', at: NOW })
const status = { command: 'delegation', args: 'status', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never

describe('MOD-296: a suffixed open row closed by a later plain accept is not shown as open', () => {
  test('the status view names no open row for the suffixed id once the plain id is accepted', async ($, on) => {
    world(on, {
      files: { [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }), [`${CARDS}/MOD-20-a.md`]: card('TASK-20'), [LEDGER]: `${suffixedSpawn}\n${plainAccept}\n` },
      dirs: { [CARDS]: ['MOD-20-a.md'], [`${ROOT}/.delegation`]: ['ledger.jsonl'] },
    })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(status)).text)
    expect(out).not.toContain('a0cd00b3')
    expect(out).toContain('nothing running, queued or owed')
  })
})
