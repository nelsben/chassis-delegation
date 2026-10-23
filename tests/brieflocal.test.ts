// MOD-124 (#188): briefLocal copies a gitignored rules file into every brief under a marked
// section the debrief drops; a card's allow: [id] pulls a named exception block into the brief
// and onto the verdict row. Engine tests (the pure section split is in tests/node/brieflocal.node.mjs).
import { test, expect, describe } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { world, commandInput, sessionStart, spawnInput, turnInput, ROOT, SCRATCH, type RunAnswer } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME } from './fixtures/sample-card'
import { parseCard, renderBriefChecked, type Card } from '../hooks/lib/dispatch'

type Tester = Parameters<TestBody>[0]
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const LOCAL = `${ROOT}/.delegation/local-rules.md`
const BRIEF = `${ROOT}/.delegation/briefs/BE-101.brief.md`
const RULE = 'Never write to the shared app outside your own window.'
const BLOCK = 'You may read the shared app while you work; never save its file.'
const LOCAL_TEXT = `${RULE}\n\n### allow: live-reads\n${BLOCK}\n\n### allow: other\nSomething else.\n`
const WITH_ALLOW = (ids: string) => FIXTURE_CARD.replace('gate: G2, G8p\n', `gate: G2, G8p\nallow: [${ids}]\n`)

/** untracked unless `tracked`: git ls-files --error-unmatch exits 1 for a file git does not know */
const lsFiles = (tracked: boolean) => (argv: string[]): RunAnswer | undefined => (argv.includes('ls-files') ? { exitCode: tracked ? 0 : 1, stdout: '' } : undefined)

const make = (on: unknown, o: { card?: string; config?: Record<string, unknown> | null; local?: string | null; tracked?: boolean } = {}) => {
  const files: Record<string, string> = {
    [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: o.card ?? FIXTURE_CARD,
    '/tpl/brief.md': 'Rules.\n{{extra}}\n\n## The card\n\n{{body}}\n',
  }
  if (o.config !== null) files[REPO_FILE] = JSON.stringify({ briefTemplate: '/tpl/brief.md', ...(o.config ?? {}) })
  if (o.local !== null) files[LOCAL] = o.local ?? LOCAL_TEXT
  return world(on as never, { files, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }, run: lsFiles(o.tracked === true), store: { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] } })
}
const dispatch = async ($: Tester, args = 'BE-101 --dry-run') => String((await $.command.run(commandInput(args))).text)

describe('MOD-124: briefLocal and allow:', () => {
  test('a card with allow: [live-reads] and a briefLocal file: both sections and allow= on the header', async ($, on) => {
    const w = make(on, { card: WITH_ALLOW('live-reads'), config: { briefLocal: '.delegation/local-rules.md' } })
    await $.session.start(sessionStart)
    await dispatch($)
    const text = w.files.get(BRIEF) ?? ''
    expect(text).toContain(`## Local rules (not for debrief)\n\n${RULE}`)
    expect(text).toContain(`## Exception for this card: live-reads\n\n${BLOCK}`)
    expect(text).not.toContain('Something else.')
    expect(text.split('\n')[0]).toContain(' allow=live-reads ')
    expect(text.indexOf('## Local rules')).toBeLessThan(text.indexOf('## Exception for this card'))
  })

  test('the verdict row carries allow= when the brief header names it', async ($, on) => {
    const header = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier allow=live-reads budget=3-attempts report=chassis.report.v1]]'
    const path = `${SCRATCH}/briefs/T-4.brief.md`
    const w = world(on as never, { files: { [path]: header + '\nbody', [REPO_FILE]: JSON.stringify({ gateMap: { prettier: 'npx prettier --check {files}' } }) }, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${path}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
    const row = [...w.appended.map(a => a.text), ...w.logs].find(l => l.includes('T-4 attempt')) ?? ''
    expect(row).toContain(' · allow live-reads · next=')
  })

  test('allow rides inside the row: the quiet line and the full line both end with next=, the allow clause before it', async ($, on) => {
    const header = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier allow=live-reads budget=3-attempts report=chassis.report.v1]]'
    const path = `${SCRATCH}/briefs/T-4.brief.md`
    const w = world(on as never, { files: { [path]: header + '\nbody', [REPO_FILE]: JSON.stringify({ gateMap: { prettier: 'npx prettier --check {files}' } }) }, agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${path}.` }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
    const all = [...w.appended.map(a => a.text), ...w.logs].flatMap(t => t.split('\n'))
    const quiet = all.find(l => l.startsWith('chassis-delegation: T-4 attempt ')) ?? ''
    // the fixture's sha is not in the repo, so the verdict is a refusal with a resume; a consistent one ends next=accept (pinned in tests/node/allowrow.node.mjs)
    expect(quiet).toMatch(/ · allow live-reads · next=[^·]+$/)
    expect(quiet.indexOf('next=')).toBe(quiet.lastIndexOf('next='))
    const full = all.find(l => l.startsWith('chassis-delegation: verdict=')) ?? ''
    expect(full).toMatch(/ · allow=live-reads · next=[^·]+$/)
  })

  test('a card naming an id the file has no block for is refused, naming the id and the file', async ($, on) => {
    make(on, { card: WITH_ALLOW('nope'), config: { briefLocal: '.delegation/local-rules.md' } })
    await $.session.start(sessionStart)
    const out = await dispatch($)
    expect(out).toContain('nope')
    expect(out).toContain('.delegation/local-rules.md')
    expect(out).toContain('refused')
  })

  test('allow: with no briefLocal set is refused', async ($, on) => {
    const w = make(on, { card: WITH_ALLOW('live-reads'), local: null })
    await $.session.start(sessionStart)
    expect(await dispatch($)).toContain('refused')
    expect(w.files.has(BRIEF)).toBe(false)
  })

  test('a git-tracked briefLocal file is refused naming the path', async ($, on) => {
    make(on, { config: { briefLocal: '.delegation/local-rules.md' }, tracked: true })
    await $.session.start(sessionStart)
    const out = await dispatch($)
    expect(out).toContain('refused')
    expect(out).toContain('.delegation/local-rules.md')
  })

  test('a missing briefLocal file renders nothing; no briefLocal and no allow: is the brief it always was', async ($, on) => {
    const w = make(on, { config: { briefLocal: '.delegation/absent.md' }, local: null })
    await $.session.start(sessionStart)
    await dispatch($)
    const withMissing = w.files.get(BRIEF) ?? ''
    expect(withMissing).not.toContain('Local rules')
    expect(withMissing.split('\n')[0]).not.toContain('allow=')
  })

  test('a repo with neither briefLocal nor allow: gets the same brief as one pointing briefLocal at a missing file, and as the plain render', async ($, on) => {
    const plain = 'PLAIN EXTRA'
    const w = make(on, { config: { briefExtra: plain }, local: null })
    await $.session.start(sessionStart)
    await dispatch($)
    const noLocal = w.files.get(BRIEF) ?? ''
    w.files.set(REPO_FILE, JSON.stringify({ briefTemplate: '/tpl/brief.md', briefExtra: plain, briefLocal: '.delegation/absent.md' }))
    w.files.delete(BRIEF)
    await dispatch($)
    const withMissing = w.files.get(BRIEF) ?? ''
    expect(noLocal).not.toBe('')
    expect(withMissing).toBe(noLocal)
    // the stored expectation: the header, a blank line, then the template rendered with the plain briefExtra and nothing local
    const card = parseCard(FIXTURE_CARD) as Card
    const expected = renderBriefChecked('Rules.\n{{extra}}\n\n## The card\n\n{{body}}\n', { card, worktree: '', branch: '', cardPath: '', extra: plain }).text
    expect(noLocal.endsWith(`\n\n${expected}`)).toBe(true)
  })
})
