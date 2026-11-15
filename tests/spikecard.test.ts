// MOD-373 (#512): /dispatch refuses a spike card that is malformed before it writes a brief; a good one carries the spike header and rules.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, commandInput, ROOT, SCRATCH } from './harness'

describe('MOD-373: a spike card at dispatch', () => {
  const tasksDir = `${ROOT}/agents/tasks`
  const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'line' as const, gateMap: '{"check":"checker {outdir}"}' }
  const card = (id: string, fm: string[]) =>
    ['---', `id: ${id}`, `title: ${id}`, 'domain: ops', 'tier: standard', 'status: queued', 'purpose: spike', ...fm, 'forbid: []', 'budget: 2-attempts', '---', '## Why', '', 'Look.', '', '## Questions', '', '1. What is it?', '2. Adopt it? (verdict)', ''].join('\n')
  const setup = (on: Parameters<typeof world>[0], files: Record<string, string>) =>
    world(on, {
      files,
      dirs: { [tasksDir]: Object.keys(files).map(f => f.slice(tasksDir.length + 1)).filter(f => f.endsWith('.md')) },
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
  const briefOf = (w: { files: Map<string, string> }, id: string) => [...w.files].find(([k]) => k.endsWith(`/${id}.brief.md`))?.[1] ?? ''

  test('no findings: the dispatch is refused with the line and writes no brief', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-1-x.md`]: card('OPS-1', ['scope: [docs/spikes/**]', 'red_test: none', 'gate: findings']) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-1'))).text)
    expect(out).toContain('refused, no brief written: a spike card names its findings file: findings: <repo path>')
    expect(briefOf(w, 'OPS-1')).toBe('')
  })

  test('the dry run is refused alike', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { [`${tasksDir}/OPS-2-x.md`]: card('OPS-2', ['findings: docs/spikes/OPS-2.md', 'scope: [docs/spikes/**]', 'red_test: npm test', 'gate: findings']) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('OPS-2 --dry-run'))).text)
    expect(out).toContain("refused, no brief written: a spike card's red_test is none")
    expect(briefOf(w, 'OPS-2')).toBe('')
  })
})
