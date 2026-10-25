import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, commandInput, ROOT, SCRATCH } from './harness'

// MOD-141 (#232): an existing brief follows the card and the --scope/--forbid flags, unless a worker on the task is live.
const NAME = 'T-1-the-first-version.md'
const card = (scope: string, extra = ''): string =>
  ['---', 'id: T-1', 'title: The first version', 'domain: ops', 'tier: standard', 'status: queued', extra, `scope: [${scope}]`, 'forbid: [vendor/**]', 'red_test: none', 'gate: test', 'budget: 2-attempts', '---', '## Why', '', 'A card.', ''].filter(l => l !== '').join('\n')
const BRIEFS = { briefDir: `${SCRATCH}/briefs` }
const BRIEF = `${SCRATCH}/briefs/T-1.brief.md`
const setup = (on: never, cardText = card('src/**, tests/**')) =>
  world(on, {
    files: {
      [`${ROOT}/agents/tasks/${NAME}`]: cardText,
      [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ briefTemplate: '/tpl/brief.md' }),
      '/tpl/brief.md': 'Work in {{worktree}} on {{branch}}; card {{cardPath}}.\n',
    },
    dirs: { [`${ROOT}/agents/tasks`]: [NAME] },
    run: () => undefined,
    store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
  })
const dispatch = async ($: { command: { run: (i: never) => Promise<{ text?: unknown }> } }, args: string) => String((await $.command.run(commandInput(args))).text)
const header = (w: { files: Map<string, string> }) => (w.files.get(BRIEF) ?? '').split('\n')[0] as string
const live = (w: { store: Map<string, unknown> }) =>
  w.store.set(`delegation.tasks.T-1@${ROOT}`, [{ task: 'T-1', subtask: 'main', attempt: 1, kind: 'spawn', tier: 'standard', alias: 'sonnet', verdict: 'pending', at: 1 }])

describe('MOD-141: a brief follows the card and the flags', () => {
  test('(1) a card edited after its brief was written: the brief is rewritten and says the card changed', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    expect(await dispatch($, 'T-1 --dry-run')).toContain(`2. brief ${BRIEF} written`)
    expect(header(w)).toContain('scope=src/**,tests/**')
    w.files.set(`${ROOT}/agents/tasks/${NAME}`, card('src/**, docs/**'))
    const again = await dispatch($, 'T-1 --dry-run')
    expect(again).toContain(`2. brief ${BRIEF} rewritten: the card changed`)
    expect(again).not.toContain('reused')
    expect(header(w)).toContain('scope=src/**,docs/**')
    expect(header(w)).not.toContain('tests/**')
  })

  test('(2) --scope and --forbid on an existing brief are both applied and named', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    const again = await dispatch($, 'T-1 --dry-run --scope lib/** --forbid secrets/**')
    expect(again).toContain(`2. brief ${BRIEF} rewritten: --scope applied, --forbid applied`)
    expect(again).not.toContain('card changed')
    expect(header(w)).toContain('scope=lib/** forbid=secrets/**')
  })

  test('(3) the same card and no flags: reused, not overwritten, no suffix; the same flags again too', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run --scope lib/**')
    const before = w.files.get(BRIEF)
    const again = await dispatch($, 'T-1 --dry-run --scope lib/**')
    expect(again).toContain(`2. brief ${BRIEF} exists — reused, not overwritten`)
    expect(again).not.toContain('not applied')
    expect(w.files.get(BRIEF)).toBe(before)
    await dispatch($, 'T-1 --dry-run')
    const plain = await dispatch($, 'T-1 --dry-run')
    expect(plain).toContain('exists — reused, not overwritten')
    expect(plain).not.toContain('not applied')
  })

  test('(4) a live worker and a changed card: refused with the line, the brief and the tree untouched', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    live(w)
    w.files.set(`${ROOT}/agents/tasks/${NAME}`, card('src/**, docs/**'))
    const before = w.files.get(BRIEF)
    const out = await dispatch($, 'T-1')
    expect(out).toContain(`T-1: a worker on T-1 is live and reads ${BRIEF}; its brief is not rewritten under it. Wait for its hand-back, then dispatch again`)
    expect(out.split('\n')).toHaveLength(1)
    expect(w.files.get(BRIEF)).toBe(before)
    expect(w.runs.filter(r => r.argv[0] === 'git')).toEqual([])
    expect(w.spawns).toHaveLength(0)
  })

  test('(4b) a live worker and an unchanged brief: dispatch goes on as before', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    live(w)
    const out = await dispatch($, 'T-1 --dry-run')
    expect(out).toContain('exists — reused, not overwritten')
    expect(out).not.toContain('is live')
  })

  test('(5) a brief written by hand for no card is never rewritten', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    const hand = '[[brief v=1 task=HAND-1 subtask=main purpose=build tier=standard model=sonnet scope=x/** forbid= gate=test budget=2-attempts report=chassis.report.v1]]\n\nDo the thing by hand.\n'
    w.files.set(BRIEF, hand)
    const out = await dispatch($, 'T-1 --dry-run --scope lib/**')
    expect(out).toContain('exists — reused')
    expect(out).not.toContain('rewritten')
    expect(w.files.get(BRIEF)).toBe(hand)
    w.files.set(BRIEF, 'No header at all.\n')
    await dispatch($, 'T-1 --dry-run')
    expect(w.files.get(BRIEF)).toBe('No header at all.\n')
  })

  test('(6) a base flag on an unchanged brief sets base= and nothing else', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    const before = w.files.get(BRIEF) ?? ''
    const sha = 'abc1234def5678'
    const out = await dispatch($, `T-1 --dry-run --base ${sha}`)
    expect(out).toContain('exists — reused, base= set to')
    expect(out).not.toContain('rewritten')
    const after = w.files.get(BRIEF) ?? ''
    expect(header(w)).toContain(` base=${sha}`)
    expect(after.replace(` base=${sha}`, '')).toBe(before)
    // and again: the brief now carries it, so the same dispatch is a plain reuse
    expect(await dispatch($, `T-1 --dry-run --base ${sha}`)).toContain('exists — reused, not overwritten')
  })

  test('amend blocks a worker appended survive a rewrite', { options: BRIEFS }, async ($, on) => {
    const w = setup(on as never)
    await $.session.start(sessionStart)
    await dispatch($, 'T-1 --dry-run')
    const amend = '[[amend v=1 scope+=docs/** reason=the docs page]]'
    w.files.set(BRIEF, (w.files.get(BRIEF) ?? '') + amend + '\n')
    expect(await dispatch($, 'T-1 --dry-run')).toContain('exists — reused, not overwritten')
    w.files.set(`${ROOT}/agents/tasks/${NAME}`, card('src/**, lib/**'))
    expect(await dispatch($, 'T-1 --dry-run')).toContain('rewritten: the card changed')
    expect(w.files.get(BRIEF)).toContain(amend)
    expect(header(w)).toContain('scope=src/**,lib/**')
  })
})
