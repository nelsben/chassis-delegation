import { test, expect, describe } from 'claude-code/testing'
import { redact, parseRedactList, ownerNameOf, gitConfigValue } from '../hooks/lib/redact'
import { scrubbedFindings, findingsPathOf, findingsLines } from '../hooks/lib/cleanstop'

const RULES = {
  repo: 'acme-app',
  origin: 'https://github.com/nelsben/acme-app.git',
  userName: 'Someone',
  userEmail: 'someone@example.com',
  words: ['acme'],
}
const FIXTURE = "nelsben/acme-app at /Users/someone/Documents/acme-app, by Someone <someone@example.com>, Acme's BE-351"

describe('MOD-6: redact', () => {
  test('the fixture comes out with no home path, no acme, no owner/name, no email; BE-351 untouched', () => {
    const out = redact(FIXTURE, RULES)
    expect(out).not.toMatch(/\/Users\//)
    expect(out).not.toMatch(/someone/i)
    expect(out).not.toMatch(/acme/i)
    expect(out).not.toContain('nelsben')
    expect(out).not.toContain('@')
    expect(out).toContain('BE-351')
    expect(out).toBe("<repo> at <home>/Documents/<repo>, by <person> <<person>>, <redacted>'s BE-351")
  })
  test('the full origin URL and a /home/<name> prefix', () => {
    expect(redact('cloned https://github.com/nelsben/acme-app.git into /home/bob/src', RULES)).toBe('cloned <repo> into <home>/src')
  })
  test('the redact list matches whole words, any case, and only whole words', () => {
    expect(redact('ACME and acme, not acmeish or macme', { words: ['acme'] })).toBe('<redacted> and <redacted>, not acmeish or macme')
    expect(redact('a.b (x)', { words: ['a.b', '(x)'] })).not.toContain('a.b')
  })
  test('empty rules scrub nothing but the home prefix and addresses', () => {
    expect(redact('plain text P2', {})).toBe('plain text P2')
    expect(redact('/Users/x/y', {})).toBe('<home>/y')
  })
  test('a placeholder is not rescanned by the list', () => {
    expect(redact('/Users/x/y', { words: ['home', 'repo', 'person'] })).toBe('<home>/y')
  })
  test('the redact list parses comma separated; owner/name and git config values are read', () => {
    expect(parseRedactList(' acme, ,Globex,0')).toEqual(['acme', 'Globex'])
    expect(ownerNameOf('git@github.com:nelsben/acme-app.git')).toBe('nelsben/acme-app')
    expect(ownerNameOf('https://github.com/nelsben/acme-app')).toBe('nelsben/acme-app')
    const cfg = '[core]\n\tbare = false\n[remote "origin"]\n\turl = https://github.com/nelsben/acme-app.git\n[user]\n\tname = Some One\n\temail = s@example.com\n'
    expect(gitConfigValue(cfg, 'remote "origin"', 'url')).toBe('https://github.com/nelsben/acme-app.git')
    expect(gitConfigValue(cfg, 'user', 'name')).toBe('Some One')
    expect(gitConfigValue(cfg, 'user', 'phone')).toBeUndefined()
  })
})

describe('MOD-6: the findings of a debrief', () => {
  const debrief = JSON.stringify({
    summary: 'x',
    mod_findings: [
      { kind: 'went_wrong', surface: '/delegation accept', fault_class: 'bug', severity: 'P2', title: 'Acme row stayed owed', body: 'in /Users/someone/Documents/acme-app', evidence: ['Acme-1', 'verdict line'] },
      { kind: 'nonsense', title: 'odd one' },
      { title: '' },
    ],
  })
  test('every string is scrubbed, junk kinds fall back, an entry with no title is dropped', () => {
    const f = scrubbedFindings(debrief, RULES) ?? []
    expect(f).toHaveLength(2)
    expect(f[0]).toMatchObject({ kind: 'went_wrong', severity: 'P2', fault_class: 'bug', title: '<redacted> row stayed owed', body: 'in <home>/Documents/<repo>' })
    expect(f[0]?.evidence).toEqual(['<redacted>-1', 'verdict line'])
    expect(f[1]).toMatchObject({ kind: 'went_wrong', fault_class: 'design', severity: 'P3', title: 'odd one' })
  })
  test('no key is no findings; not JSON is undefined', () => {
    expect(scrubbedFindings('{"summary":"x"}', RULES)).toEqual([])
    expect(scrubbedFindings('not json', RULES)).toBeUndefined()
    expect(scrubbedFindings('[]', RULES)).toBeUndefined()
  })
  test('the file lands beside the debrief; one line per finding, then drafts:', () => {
    expect(findingsPathOf('/h/debriefs/2026-10-03-x.json')).toBe('/h/debriefs/2026-10-03-x.findings.json')
    const f = scrubbedFindings(debrief, RULES) ?? []
    expect(findingsLines(f, '/p.findings.json')).toEqual(['[1] went_wrong · P2 · /delegation accept · <redacted> row stayed owed', '[2] went_wrong · P3 · (no surface) · odd one', 'drafts: /p.findings.json'])
    expect(findingsLines([], '/p')).toEqual(['no findings'])
  })
})
