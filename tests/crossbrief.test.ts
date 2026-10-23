import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, commandInput, ROOT, SCRATCH } from './harness'

// MOD-95 (#154): a dispatch never reuses a brief written for another repo, and a brief for another repo carries that repo's briefExtra.
const OTHER = '/other'
const NAME = 'T-1-the-first-version.md'
const card = (title: string, extra = ''): string =>
  ['---', 'id: T-1', `title: ${title}`, 'domain: ops', 'tier: standard', 'status: queued', extra, 'scope: [src/**, tests/**]', 'forbid: []', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A card.', ''].filter(l => l !== '').join('\n')
const SESSION_CARD = card('The first version')
const OTHER_CARD = card('The first version')
const BRIEFS = { briefDir: `${SCRATCH}/briefs` }
const BRIEF = `${SCRATCH}/briefs/T-1.brief.md`
const SESSION_LINE = 'SESSION-ONLY-LINE: run make check.'
const OTHER_LINE = 'OTHER-ONLY-LINE: run npm run lint.'
const files = (): Record<string, string> => ({
  [`${ROOT}/agents/tasks/${NAME}`]: SESSION_CARD,
  [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefExtra: SESSION_LINE, briefTemplate: '/tpl/brief.md' }),
  // the engine cannot read the shipped template; the repo names one that has the lines the shipped one has
  '/tpl/brief.md': 'Work in {{worktree}} on {{branch}}; card {{cardPath}}.\n{{extra}}\n',
  [`${OTHER}/package.json`]: '{"scripts":{"test":"node --test"}}',
  [`${OTHER}/.chassis-delegation.json`]: JSON.stringify({ briefExtra: OTHER_LINE, cardDir: 'docs/cards', domains: ['ops'], gateMap: { test: 'npm test' } }),
  [`${OTHER}/docs/cards/${NAME}`]: OTHER_CARD,
})
const dirs = (): Record<string, string[]> => ({
  [`${ROOT}/agents/tasks`]: [NAME],
  [OTHER]: ['package.json'],
  [`${OTHER}/.git`]: [],
  [`${OTHER}/docs/cards`]: [NAME],
})
const setup = (on: never) => world(on, { files: files(), dirs: dirs(), run: () => undefined, store: { 'delegation.agentTypes': ['general-purpose', 'ops'] } })
const dispatch = async ($: { command: { run: (i: never) => Promise<{ text?: unknown }> } }, args: string) => String((await $.command.run(commandInput(args))).text)

describe('MOD-95: a brief written for another repo is not reused', () => {
  test('(a) a brief written for the session repo, then the card re-carded for another repo: the brief is rewritten for it', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    const first = await dispatch($, 'T-1 --dry-run')
    expect(first).toContain(`2. brief ${BRIEF} written`)
    expect(w.files.get(BRIEF)).toContain(`Work in ${ROOT}-T-1 on`)
    const again = await dispatch($, `T-1 --dry-run --repo ${OTHER}`)
    expect(again).toContain(`2. brief ${BRIEF} was written for `)
    expect(again).toContain('; rewritten for this card (repo, worktree, card)')
    expect(again).not.toContain('exists — reused')
    const brief = w.files.get(BRIEF) ?? ''
    expect(brief.split('\n')[0]).toContain(` repo=${OTHER} `)
    expect(brief).toContain(`Work in ${OTHER}-T-1 on`)
    expect(brief).not.toContain(`${ROOT}-T-1`)
    expect(brief).toContain(`card ${OTHER}/docs/cards/${NAME}.`)
  })

  test('(b) the same with an attempt open: refused in one line, the brief byte-identical, no git', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    // MOD-117: the open attempt is the other repo's, under its key
    w.store.set(`delegation.tasks.T-1@${OTHER}`, [{ task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', tier: 'standard', alias: 'sonnet', verdict: 'pending', at: 1 }])
    const before = w.files.get(BRIEF)
    const files0 = new Map(w.files)
    const out = await dispatch($, `T-1 --repo ${OTHER}`)
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain(BRIEF)
    expect(out).toContain('repo')
    expect(out).toContain('attempt 1')
    expect(out).toContain('refused')
    expect(w.files.get(BRIEF)).toBe(before)
    expect([...w.files.entries()]).toEqual([...files0.entries()])
    expect(w.runs.filter(r => r.argv[0] === 'git')).toEqual([])
    expect(w.spawns).toHaveLength(0)
  })

  test('(c) a reused brief whose only change is an amended scope is kept byte-identical', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    const amended = (w.files.get(BRIEF) ?? '').replace('scope=src/**,tests/**', 'scope=src/**,tests/**,docs/**') + '\n[[amend v=1 scope+=docs/** reason=the docs page]]\n'
    w.files.set(BRIEF, amended)
    const again = await dispatch($, 'T-1 --dry-run')
    expect(again).toContain('exists — reused')
    expect(w.files.get(BRIEF)).toBe(amended)
  })

  test('(d) two repos with different briefExtra: the brief for the other repo holds its line and not the session repo\'s', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    // a card in the session repo is unchanged: it carries the session's line
    await dispatch($, 'T-1 --dry-run')
    expect(w.files.get(BRIEF)).toContain(SESSION_LINE)
    expect(w.files.get(BRIEF)).not.toContain(OTHER_LINE)
    w.files.delete(BRIEF)
    await dispatch($, `T-1 --dry-run --repo ${OTHER}`)
    const other = w.files.get(BRIEF) ?? ''
    expect(other).toContain(OTHER_LINE)
    expect(other).not.toContain(SESSION_LINE)
  })
})
