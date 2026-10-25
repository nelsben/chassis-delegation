// MOD-137: the review note as the debrief. `/delegation debrief ingest <note.md>` and the notes-mode clean stop.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, mainTurn, ROOT, HOME, NOW } from './harness'

const MIN = 60_000
const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const FOLDER = `${ROOT}/.delegation/debriefs`
const NOTE = [
  '# Round review',
  '',
  '## For the mod owner',
  '',
  '- P2 The verifier counted a late hand-back as new work. It should not.',
  '  Evidence: verdict row T-1 refuted at abc1234',
  '- The dispatch queue gave no row when a slot freed',
  '',
  '## Next',
  '- unrelated',
].join('\n')
const shown = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const verdict = (task: string, at: number) => ({ task, attempt: 1, verdict: 'consistent', line: `${task} consistent`, at })

describe('MOD-137: /delegation debrief ingest', () => {
  test('writes a findings file from the note and prints the lines; debrief post then lists them', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/note.md`]: NOTE, [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ issueRepo: "acme/tool" }) } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief ingest note.md'))).text)
    expect(out).toContain('[1] went_wrong · P2 · verifier · The verifier counted a late hand-back as new work.')
    expect(out).toContain('[2] went_wrong · P3 · dispatch ·')
    expect(out).toContain('post with /delegation debrief post all|1,3')
    const file = [...w.files.keys()].find(k => k.startsWith(FOLDER) && k.endsWith('-note-note.findings.json'))
    expect(file).toBeDefined()
    const doc = JSON.parse(w.files.get(file as string) ?? '{}')
    expect(doc.findings).toHaveLength(2)
    expect(doc.findings[0].evidence).toEqual(['Evidence: verdict row T-1 refuted at abc1234'])
    expect(doc.findings[0].source).toBe('review note note.md')
    const listed = String((await $.command.run(delegation('debrief post'))).text)
    expect(listed).toContain(file as string)
    expect(listed).toContain('The verifier counted a late hand-back as new work.')
  })

  test('a note with no owner section writes nothing and says so', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/plain.md`]: '# Notes\n- nothing for you\n' } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief ingest plain.md'))).text)
    expect(out).toBe('debrief ingest: plain.md has no "For the mod owner" section; nothing written')
    expect([...w.files.keys()].some(k => k.endsWith('.findings.json'))).toBe(false)
  })
})

describe('MOD-137: debriefMode notes at a clean stop', () => {
  const BC = `${HOME}/.claude/harness/breadcrumbs/sess-1.jsonl`
  const crumbs = Array.from({ length: 40 }, (_, i) => `{"ts":${i},"kind":"correction","detail":"x"}`).join('\n') + '\n'

  test('the idle clean stop appends the prompt row and spawns no agent, once per round', { options: { autoEval: false } }, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs }, listAgents: true, store: { 'delegation.recent.sess-1': [verdict('T-1', NOW - 40 * MIN), verdict('T-2', NOW - 30 * MIN)] } })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(w.spawns).toHaveLength(0)
    const row = 'a round of tasks closed (2 verdicts): write the review note, then /delegation debrief ingest <note.md>'
    expect(shown(w).split(row).length - 1).toBe(1)
    await $.turn.complete(mainTurn())
    await w.clock.advance(20 * MIN)
    expect(shown(w).split(row).length - 1).toBe(1)
    expect(w.spawns).toHaveLength(0)
  })

  test('autoDebrief false silences it', { options: { autoEval: false, autoDebrief: false } }, async ($, on) => {
    const w = world(on, { files: { [BC]: crumbs }, listAgents: true, store: { 'delegation.recent.sess-1': [verdict('T-1', NOW - 40 * MIN)] } })
    await $.session.start(sessionStart)
    await $.turn.complete(mainTurn())
    await w.clock.advance(60 * MIN)
    expect(shown(w)).not.toContain('write the review note')
  })
})
