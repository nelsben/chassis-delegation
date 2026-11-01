import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, composeInput, ROOT, HOME } from './harness'

// MOD-238: prompt.compose does not rebuild the delegation snapshot from disk on every brain model request.
const REPO = `${ROOT}/.delegation/debriefs`
const HARNESS = `${HOME}/.claude/harness/debriefs`
const DEBRIEF = `${REPO}/2026-10-20-mod-run.json`
const FINDINGS = `${REPO}/2026-10-20-mod-run.findings.json`
const PROPOSALS = { proposed_harness_changes: [{ target: 'CLAUDE.md', rationale: 'r1', proposed_diff_summary: 'Add a rule.' }] }
const O = { options: { autoEval: false, autoDebrief: false } }
const files = () => ({
  [DEBRIEF]: JSON.stringify({ session_id: 'sess-1', mod_findings: [], ...PROPOSALS }),
  [FINDINGS]: JSON.stringify({ debrief: DEBRIEF, modVersion: '0.9.40', scrubbed: true, findings: [], host_findings: [] }),
})
const section = async ($: any) => (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''

describe('MOD-238: compose reads the debrief once while it is unchanged', () => {
  test('two composes 4 fake seconds apart, no state change: the second reads neither the debrief nor the findings file, and no git runs', O, async ($, on) => {
    const w = world(on, { files: files(), dirs: { [REPO]: ['2026-10-20-mod-run.json', '2026-10-20-mod-run.findings.json'] }, store: { 'delegation.debrief.sess-1': { lastAt: 1, watermark: 0, lines: 1, sessionId: 'sess-1', path: DEBRIEF } } })
    await $.session.start(sessionStart)
    const first = await section($)
    expect(first).toContain('1 debrief proposals open')
    const before = w.reads.filter(p => p === DEBRIEF || p === FINDINGS).length
    const runs = w.runs.length
    expect(before).toBeGreaterThan(0)
    await w.clock.advance(4000)
    const second = await section($)
    expect(second).toBe(first)
    expect(w.reads.filter(p => p === DEBRIEF || p === FINDINGS).length).toBe(before)
    expect(w.runs.length).toBe(runs)
  })

  test('a debrief whose file changed is read again', O, async ($, on) => {
    const w = world(on, { files: files(), dirs: { [REPO]: ['2026-10-20-mod-run.json', '2026-10-20-mod-run.findings.json'] }, store: { 'delegation.debrief.sess-1': { lastAt: 1, watermark: 0, lines: 1, sessionId: 'sess-1', path: DEBRIEF } } })
    await $.session.start(sessionStart)
    await section($)
    await w.clock.advance(4000)
    w.files.set(FINDINGS, JSON.stringify({ debrief: DEBRIEF, modVersion: '0.9.40', scrubbed: true, findings: [], host_findings: [], proposals_status: [{ n: 1, status: 'done', note: '', at: 'x' }] }))
    expect(await section($)).not.toContain('debrief proposals open')
  })
})
void HARNESS
