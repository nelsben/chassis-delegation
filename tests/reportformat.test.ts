// MOD-295: the wiring: a report in a foreign format is not refuted as malformed on its missing sha=.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { parseReport } from '../hooks/lib/brief'
import { verifyNative, type ExecOut } from '../hooks/lib/verify-native'

const none = (): ExecOut => ({ ok: true, exitCode: 1, stdout: '', stderr: '' })
const brief = (report?: string) => `[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/** forbid=src/secret/** gate=test${report === undefined ? '' : ` report=${report}`}]]\n\nbody\n`
const run = (briefText: string) =>
  verifyNative(
    {
      repo: '/w/repo-T-1',
      report: parseReport('[[report v=1 task=T-1 gate=pass files=src/a.ts]]'),
      briefText,
      gateMap: {},
      allowed: () => false,
      filesPath: '/r/.delegation/T-1/files.txt',
    },
    { exec: async () => none(), write: async () => undefined },
  )

describe('MOD-295: a foreign report format is not refuted as malformed', () => {
  test('foreign report=: the sha claim is unchecked with the not-checked line, no malformed refutation', async () => {
    const r = await run(brief('repo-x.report.v1'))
    const text = r.lines.join('\n')
    expect(text).toContain('report format repo-x.report.v1: fields not checked by the mod')
    expect(r.lines.find(l => l.startsWith('claim sha:'))).toBe('claim sha: unchecked — report format repo-x.report.v1: fields not checked by the mod')
    expect(text).not.toContain('malformed report')
  })

  test('the mod format with no sha= is still refuted as malformed', async () => {
    const r = await run(brief('chassis.report.v1'))
    expect(r.lines.find(l => l.startsWith('claim sha:'))).toContain('malformed report: missing sha=')
    expect(r.lines.join('\n')).not.toContain('not checked by the mod')
  })
})
