// MOD-295: a brief whose header names a report format other than chassis.report.v1 is not judged on the mod's report fields.
import { test, expect, describe } from './kit.mjs'

const B = () => import('../../hooks/lib/brief.ts')
const V = () => import('../../hooks/lib/verify-native.ts')
const header = (report) => `[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/** forbid=src/secret/** gate=test${report === undefined ? '' : ` report=${report}`}]]\n\nbody\n`

describe('MOD-295: a foreign report format is not checked for the mod fields', () => {
  test('a foreign report= yields the not-checked line and no malformed detail', async () => {
    const { foreignReportFormat, notCheckedLine } = await B()
    const { malformedReportDetail } = await V()
    const fmt = foreignReportFormat(header('repo-x.report.v1'))
    expect(fmt).toBe('repo-x.report.v1')
    expect(notCheckedLine(fmt)).toBe('report format repo-x.report.v1: fields not checked by the mod')
  })

  test('the mod format or an absent report= is checked as today', async () => {
    const { foreignReportFormat } = await B()
    expect(foreignReportFormat(header('chassis.report.v1'))).toBeUndefined()
    expect(foreignReportFormat(header())).toBeUndefined()
    expect(foreignReportFormat('no header at all')).toBeUndefined()
  })

  test('the mod format with no sha= still yields the malformed detail', async () => {
    const { malformedReportDetail, MALFORMED_REPORT } = await V()
    const detail = malformedReportDetail({ task: 'T-1', gate: 'pass', files: 'a.ts' }, { here: false, cardless: false, wantsRed: false })
    expect(detail.startsWith(MALFORMED_REPORT)).toBe(true)
    expect(detail).toContain('missing sha=')
  })
})
