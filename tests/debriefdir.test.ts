import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT, HOME } from './harness'
import { resolveFindings } from '../hooks/lib/debriefdir'

// MOD-80: the by-hand debrief doors find the findings where the debrief wrote them
const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const REPO = `${ROOT}/.delegation/debriefs`
const HARNESS = `${HOME}/.claude/harness/debriefs`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const finding = { kind: 'went_wrong', surface: '/delegation debrief', fault_class: 'bug', severity: 'P2', title: 'Post could not see the harness folder', body: 'It answered no findings.', evidence: ['e1'] }
const ISSUES = JSON.stringify([])
const ghRun = (argv: string[]) => (argv[0] === 'gh' && argv[2] === 'list' ? { exitCode: 0, stdout: ISSUES } : { exitCode: 0, stdout: '' })
const O = { options: { autoEval: false } }
const PROPOSALS = { proposed_harness_changes: [{ target: 'CLAUDE.md', rationale: 'r1', proposed_diff_summary: 'Add a rule about the harness folder.' }] }

const MINE = `${HARNESS}/2026-10-15-mine.json`
const MINE_F = `${HARNESS}/2026-10-15-mine.findings.json`
const OTHER = `${HARNESS}/2026-10-16-other.json`
const OTHER_F = `${HARNESS}/2026-10-16-other.findings.json`
const mineFiles = () => ({
  [REPO_FILE]: '{"issueRepo":"owner/mod"}',
  [MINE]: JSON.stringify({ session_id: 'sess-1', mod_findings: [finding], ...PROPOSALS }),
  [MINE_F]: JSON.stringify({ debrief: MINE, modVersion: '0.9.11', scrubbed: true, findings: [finding], host_findings: [] }),
})

describe('MOD-80: the by-hand doors read the harness folder', () => {
  test('the record names the harness debrief: debrief post shows its findings', O, async ($, on) => {
    world(on, { files: mineFiles(), dirs: { [HARNESS]: ['2026-10-15-mine.json', '2026-10-15-mine.findings.json'] }, run: ghRun, store: { 'delegation.debrief.sess-1': { lastAt: 1, watermark: 0, lines: 1, sessionId: 'sess-1', path: MINE } } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post'))).text)
    expect(out).toContain(MINE_F)
    expect(out).toContain('Post could not see the harness folder')
  })

  test('the record is gone: the harness file whose debrief names this session is still found', O, async ($, on) => {
    world(on, { files: mineFiles(), dirs: { [HARNESS]: ['2026-10-15-mine.json', '2026-10-15-mine.findings.json'] }, run: ghRun })
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegation('debrief post'))).text)).toContain(MINE_F)
  })

  test('a newer harness findings file from another session is ignored and the refusal names both folders', O, async ($, on) => {
    const files = { [REPO_FILE]: '{"issueRepo":"owner/mod"}', [OTHER]: JSON.stringify({ session_id: 'sess-other' }), [OTHER_F]: JSON.stringify({ debrief: OTHER, findings: [finding] }) }
    world(on, { files, dirs: { [HARNESS]: ['2026-10-16-other.json', '2026-10-16-other.findings.json'] }, run: ghRun })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief post'))).text)
    expect(out).toBe(`debrief post: no findings file for this session; looked in ${REPO}/, ${HARNESS}/ (only this session's debriefs) and this session's debrief record. Run /delegation debrief first.`)
  })

  test('a repo-folder file is still found as before', O, async ($, on) => {
    const R = `${REPO}/2026-10-10-mod-run.findings.json`
    world(on, { files: { [REPO_FILE]: '{"issueRepo":"owner/mod"}', [R]: JSON.stringify({ debrief: 'x', findings: [finding] }) }, dirs: { [REPO]: ['2026-10-10-mod-run.findings.json'] }, run: ghRun })
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegation('debrief post'))).text)).toContain(R)
  })

  test('debrief apply lists a harness-folder debrief\'s proposals', O, async ($, on) => {
    world(on, { files: mineFiles(), dirs: { [HARNESS]: ['2026-10-15-mine.json', '2026-10-15-mine.findings.json'] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief apply'))).text)
    expect(out).toContain(MINE)
    expect(out).toContain('[1] CLAUDE.md')
  })

  test('apply with nothing names the folders it looked in', O, async ($, on) => {
    world(on, { files: {}, dirs: {} })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('debrief apply'))).text)
    expect(out).toContain(`${REPO}/`)
    expect(out).toContain(`${HARNESS}/`)
  })
})

describe('MOD-80: the resolver order', () => {
  const base = { repoFolder: '/r/.delegation/debriefs', harnessFolder: '/h/.claude/harness/debriefs', recordFindings: undefined, repoNames: [] as string[], harnessMine: [] as string[] }
  test('the record wins over a newer repo file and the harness folder', () => {
    expect(resolveFindings({ ...base, recordFindings: '/h/a.findings.json', repoNames: ['z.findings.json'], harnessMine: ['y.findings.json'] })).toEqual({ path: '/h/a.findings.json' })
  })
  test('the newest repo file wins over the harness folder', () => {
    expect(resolveFindings({ ...base, repoNames: ['a.findings.json', 'b.findings.json'], harnessMine: ['z.findings.json'] })).toEqual({ path: '/r/.delegation/debriefs/b.findings.json' })
  })
  test('else the newest harness file of this session', () => {
    expect(resolveFindings({ ...base, harnessMine: ['a.findings.json', 'c.findings.json'] })).toEqual({ path: '/h/.claude/harness/debriefs/c.findings.json' })
  })
  test('nothing resolves: the folders looked in', () => {
    expect(resolveFindings(base)).toEqual({ looked: ['/r/.delegation/debriefs', '/h/.claude/harness/debriefs'] })
  })
})
