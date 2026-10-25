import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT, SCRATCH, type RunAnswer } from './harness'

// MOD-144 (#234): the session's own card wins; the store's remembered repo only finds a card the session does not hold.
const DISPATCH = 'mcp__chassis-delegation__dispatch'
const OTHER = '/other'
const OTHER_CARDS = `${ROOT}/.delegation/cards/other`
const OWN_CARDS = `${ROOT}/agents/tasks`
const KEY = `delegation.taskRepo.OPS-17@${ROOT}`
const BRIEFS = { briefDir: `${SCRATCH}/briefs` }
const card = (status: string, extra: string[] = []) =>
  ['---', 'id: OPS-17', 'title: The seventeenth', 'domain: ops', 'tier: standard', `status: ${status}`, ...extra, 'scope: [src/**]', 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A card.', ''].join('\n')
const NAME = 'OPS-17-the-seventeenth.md'
const MB = 'b'.repeat(40)
const run = (argv: string[]): RunAnswer | undefined => {
  if (argv[0] === 'npm') return { exitCode: 0, stdout: 'ok\n' }
  if (argv[0] !== 'git') return undefined
  const sub = argv.slice(3)
  const last = sub[sub.length - 1] ?? ''
  if (sub[0] === 'fetch' || sub[0] === 'worktree') return { exitCode: 0, stdout: '' }
  if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${last.slice(0, -'^{commit}'.length)}\n` }
  if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'merge-base') return { exitCode: 0, stdout: `${MB}\n` }
  if (sub[0] === 'status') return { exitCode: 0, stdout: '' }
  return undefined
}
const text = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const base = (own: boolean) => ({
  files: { [`${OTHER}/package.json`]: '{"scripts":{"test":"node --test"}}', [`${OTHER_CARDS}/${NAME}`]: card('merged'), ...(own ? { [`${OWN_CARDS}/${NAME}`]: card('queued') } : {}) },
  dirs: { [OTHER]: ['package.json'], [`${OTHER}/.git`]: [], [OWN_CARDS]: own ? [NAME] : ['README.md'], [OTHER_CARDS]: [NAME], [`${ROOT}/.delegation/cards`]: ['other'] },
  run,
  store: { [KEY]: OTHER, 'delegation.agentTypes': ['general-purpose', 'ops'] },
})
const NOTE = `note: OPS-17 was once a task for ${OTHER}; this dispatch is for the card in ${OWN_CARDS} (pass repo=${OTHER} for the other)`

describe('MOD-144: dispatch reads the session\'s own card first', () => {
  test('#234: a queued card in the session\'s folder is dispatched though the store remembers the id for a repo whose card is merged; dry run prints the note', { options: BRIEFS }, async ($, on) => {
    const w = world(on, base(true))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: DISPATCH, task: 'OPS-17', dryRun: true } as never))
    expect(out).not.toContain('status merged')
    expect(out).toContain(`card ${OWN_CARDS}/${NAME}`)
    expect(out).toContain(NOTE)
    expect(w.store.get(KEY)).toBe(OTHER)
  })

  test('the card tool\'s dry run follows the same order', { options: BRIEFS }, async ($, on) => {
    world(on, base(true))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: 'mcp__chassis-delegation__card', title: 'The seventeenth', why: 'x', doneWhen: ['npm test passes'], scope: ['src/**'], domain: 'ops', id: 'OPS-17', dryRun: true } as never))
    expect(out).not.toContain('status merged')
  })

  test('a dispatch that cuts the session\'s own worktree deletes the stale taskRepo record', { options: BRIEFS }, async ($, on) => {
    const w = world(on, base(true))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: DISPATCH, task: 'OPS-17' } as never))
    expect(out).toContain(NOTE)
    expect(out).not.toContain('status merged')
    expect(w.store.has(KEY)).toBe(false)
    expect(w.runs.some(r => r.argv.includes('worktree') && r.argv[2] === ROOT)).toBe(true)
  })

  test('no card in the session\'s folders: the stored taskRepo still sends dispatch to the other repo', { options: BRIEFS }, async ($, on) => {
    const w = world(on, base(false))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: DISPATCH, task: 'OPS-17', dryRun: true } as never))
    expect(out).toContain('OPS-17 is status merged; /dispatch takes a queued or claimed card')
    expect(out).not.toContain('note:')
    expect(w.store.get(KEY)).toBe(OTHER)
  })

  test('repo= given explicitly: unchanged, the other repo\'s card is the one read', { options: BRIEFS }, async ($, on) => {
    const w = world(on, base(true))
    await $.session.start(sessionStart)
    const out = text(await $.tool.call({ tool: DISPATCH, task: 'OPS-17', repo: OTHER, dryRun: true } as never))
    expect(out).toContain('OPS-17 is status merged; /dispatch takes a queued or claimed card')
    expect(out).not.toContain('note:')
    expect(w.store.get(KEY)).toBe(OTHER)
  })
})
