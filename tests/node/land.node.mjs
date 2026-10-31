// MOD-190: /delegation land, the pure half: the arguments and the issue body.
import { test, expect, describe } from './kit.mjs'

const ABS = `/${'Users'}/someone/x.ts`
const lib = () => import('../../hooks/lib/land.ts')
const { redact } = await import('../../hooks/lib/redact.ts')

describe('MOD-190: parseLandArgs', () => {
  test('each of the six types is taken', async () => {
    const { parseLandArgs } = await lib()
    for (const t of ['feature', 'epic', 'story', 'task', 'bug', 'spike']) expect(parseLandArgs(`${t} Something broke`)).toEqual({ type: t, title: 'Something broke', paths: [] })
  })
  test('a double-quoted title is one title', async () => {
    const { parseLandArgs } = await lib()
    expect(parseLandArgs('bug "Export drops the last row" --parent 7')).toEqual({ type: 'bug', title: 'Export drops the last row', parent: 7, paths: [] })
  })
  test('--parent, --paths and --note', async () => {
    const { parseLandArgs } = await lib()
    expect(parseLandArgs('task Fix it --parent 12 --paths src/a.ts,docs/** --note "seen in the dashboard"')).toEqual({ type: 'task', title: 'Fix it', parent: 12, paths: ['src/a.ts', 'docs/**'], note: 'seen in the dashboard' })
    expect(parseLandArgs('story A b --note two words here').note).toBe('two words here')
  })
  test('a bad type, a missing title and a bad parent are refused with the usage line', async () => {
    const { parseLandArgs } = await lib()
    for (const bad of ['chore Do it', 'bug', '', 'bug "  "', 'bug T --parent 0', 'bug T --parent x', 'bug T --parent 1.5', 'bug T --parent -2', 'bug T --parent']) {
      const r = parseLandArgs(bad)
      expect('error' in r).toBe(true)
      expect(r.error).toContain('feature, epic, story, task, bug, spike')
      expect(r.error.includes('\n')).toBe(false)
    }
  })
})

describe('MOD-190: landedBody', () => {
  test('the scope block is present with paths and absent without', async () => {
    const { landedBody } = await lib()
    const withPaths = landedBody({ paths: ['src/a.ts', 'docs/**'], cards: [], defaultBranch: 'main' })
    expect(withPaths).toContain('## Scope\n\n```scope\nsrc/a.ts\ndocs/**\n```')
    const without = landedBody({ paths: [], cards: [], defaultBranch: 'main' })
    expect(without.includes('## Scope')).toBe(false)
    expect(without.includes('```')).toBe(false)
  })
  test('the note leads, and only the open cards whose scope holds a path are listed (MOD-204)', async () => {
    const { landedBody } = await lib()
    const cards = [{ id: 'MOD-1', title: 'First', scope: ['src/**'] }, { id: 'MOD-2', title: 'Second', scope: ['docs/**'] }, { id: 'MOD-3', title: 'Third', scope: ['src/a.ts'] }]
    const b = landedBody({ note: 'Seen twice.', paths: ['src/a.ts'], cards, defaultBranch: 'main' })
    expect(b.startsWith('Seen twice.')).toBe(true)
    expect(b).toContain('## Landed from')
    expect(b).toContain('- MOD-1 First\n- MOD-3 Third')
    expect(b.includes('MOD-2')).toBe(false)
    expect(b).toContain('main')
    expect(landedBody({ paths: ['src/a.ts'], cards: [], defaultBranch: 'main' }).includes('## Landed from')).toBe(false)
    expect(landedBody({ paths: [], cards, defaultBranch: 'main' }).includes('## Landed from')).toBe(false)
    expect(landedBody({ paths: ['zzz/q.ts'], cards, defaultBranch: 'main' }).includes('MOD-')).toBe(false)
  })
  test('an absolute path in the note is scrubbed by the redact helper', async () => {
    const { landedBody } = await lib()
    const body = landedBody({ note: `See ${ABS}`, paths: [], cards: [], defaultBranch: 'main' })
    expect(redact(body, {})).toContain('See <home>/x.ts')
    expect(redact(body, {}).includes(ABS)).toBe(false)
  })
})

describe('MOD-190: open cards, parent hint, slug file', () => {
  test('openCards drops merged cards and cards with an accepted or merged ledger row', async () => {
    const { openCards, doneTasks } = await lib()
    const done = doneTasks('{"task":"A-2","kind":"accepted"}\nnot json\n{"task":"A-3","how":"merged"}\n{"task":"A-4","kind":"spawn"}')
    const cards = [1, 2, 3, 4].map(n => ({ id: `A-${n}`, title: `t${n}`, status: n === 1 ? 'merged' : 'queued', parent: undefined, scope: [] }))
    expect(openCards(cards, done).map(c => c.id)).toEqual(['A-4'])
  })
  test('parentHint names the parent of an open card whose scope holds a path', async () => {
    const { parentHint } = await lib()
    const cards = [{ id: 'A-1', title: 't', status: 'queued', parent: '9', scope: ['src/export/**'] }, { id: 'A-2', title: 't', status: 'queued', parent: undefined, scope: ['docs/**'] }]
    expect(parentHint(['docs/a.md'], cards)).toBe(undefined)
    expect(parentHint(['src/export/a.ts'], cards)).toEqual({ parent: 9, card: 'A-1' })
  })
  test('freeName adds -2, -3', async () => {
    const { freeName } = await lib()
    expect(freeName('fix-it', new Set())).toBe('fix-it.md')
    expect(freeName('fix-it', new Set(['fix-it.md']))).toBe('fix-it-2.md')
    expect(freeName('fix-it', new Set(['fix-it.md', 'fix-it-2.md']))).toBe('fix-it-3.md')
  })
})

describe('MOD-193: parsePlan', () => {
  const ok = () => ({ feature: { title: ' Big  thing ', paths: ['src/**'] }, tasks: [{ title: 'A', paths: ['src/a.ts'] }, { title: 'B', type: 'bug', paths: ['src/x/b.ts'], note: 'n' }] })
  test('a good plan is normalised with the default types', async () => {
    const { parsePlan } = await lib()
    const p = parsePlan(ok())
    expect(p.error).toBe(undefined)
    expect(p.feature).toEqual({ title: 'Big thing', type: 'feature', paths: ['src/**'] })
    expect(p.tasks.map(t => t.type)).toEqual(['task', 'bug'])
    expect(p.tasks[1].note).toBe('n')
    expect(p.confirm).toBe(false)
    expect(parsePlan({ ...ok(), confirm: true }).confirm).toBe(true)
  })
  test('a stray task path names the task, the path and the feature paths', async () => {
    const { parsePlan } = await lib()
    const r = parsePlan({ ...ok(), tasks: [{ title: 'Stray', paths: ['docs/z.md'] }] })
    expect(r.error).toContain('Stray')
    expect(r.error).toContain('docs/z.md')
    expect(r.error).toContain('src/**')
    expect(r.error.includes('\n')).toBe(false)
  })
  test('bad shapes are one-line errors', async () => {
    const { parsePlan } = await lib()
    const bad = [
      {}, { ...ok(), feature: { title: '', paths: ['a'] } }, { ...ok(), feature: { title: 'F', paths: [] } },
      { ...ok(), feature: { title: 'F', type: 'bug', paths: ['src/**'] } }, { ...ok(), tasks: [] },
      { ...ok(), tasks: Array.from({ length: 31 }, (_, i) => ({ title: `t${i}`, paths: ['src/a'] })) },
      { ...ok(), tasks: [{ title: 'A', type: 'epic', paths: ['src/a'] }] }, { ...ok(), tasks: [{ title: 'A', paths: [] }] },
    ]
    for (const b of bad) {
      const r = parsePlan(b)
      expect(typeof r.error).toBe('string')
      expect(r.error.includes('\n')).toBe(false)
    }
  })
})

describe('MOD-198: issueLineOf', () => {
  test('reads the number and url back; the last matching line wins; else undefined', async () => {
    const { issueLineOf } = await lib()
    expect(issueLineOf('body\n\nissue: #50 https://github.com/o/r/issues/50\n')).toEqual({ number: 50, url: 'https://github.com/o/r/issues/50' })
    expect(issueLineOf('issue: #1 https://github.com/o/r/issues/1\nissue: #2 https://github.com/o/r/issues/2\n')).toEqual({ number: 2, url: 'https://github.com/o/r/issues/2' })
    expect(issueLineOf('no issue here\nissue: #x https://github.com/o/r/issues/5\n')).toBe(undefined)
  })
})

describe('MOD-207: planKey', () => {
  test('the title slug, a dash, the first 8 hex of sha256 of the sorted paths joined by commas', async () => {
    const { planKey } = await lib()
    const { createHash } = await import('node:crypto')
    const hex = (t) => createHash('sha256').update(t).digest('hex').slice(0, 8)
    expect(planKey('Export rework', ['src/b/**', 'src/a/**'])).toBe(`export-rework-${hex('src/a/**,src/b/**')}`)
    expect(planKey('Export rework', ['src/a/**', 'src/b/**'])).toBe(planKey('Export rework', ['src/b/**', 'src/a/**']))
    expect(planKey('Export rework', ['src/a/**'])).not.toBe(planKey('Export rework', ['src/b/**']))
    expect(planKey('Export rework', ['x'])).toMatch(/^export-rework-[0-9a-f]{8}$/)
  })
})

describe('MOD-207: subIssuesOf', () => {
  test('reads a list or a nodes object; skips rows without a number', async () => {
    const { subIssuesOf } = await lib()
    expect(subIssuesOf({ subIssues: [{ number: 5, state: 'OPEN' }, { title: 'x' }] })).toEqual([{ number: 5, state: 'OPEN' }])
    expect(subIssuesOf({ subIssues: { nodes: [{ number: 6, state: 'CLOSED' }] } })).toEqual([{ number: 6, state: 'CLOSED' }])
    expect(subIssuesOf({})).toEqual([])
    expect(subIssuesOf(null)).toEqual([])
  })
})

describe('MOD-218: redact leaves dotfolder segments and the same repo alone', () => {
  test('a dotfolder named like the repo or a listed word is kept; the home prefix is still scrubbed', () => {
    const rules = { repo: 'acme-app', words: ['globex'] }
    expect(redact('see ~/.acme-app/cfg and ~/.globex/x', rules)).toBe('see ~/.acme-app/cfg and ~/.globex/x')
    expect(redact('at /Users/x/.acme-app/y', rules)).toBe('at <home>/.acme-app/y')
    expect(redact('see /srv/.acme-app', rules)).toBe('see /srv/.acme-app')
  })
  test('a bare name in prose, and a name after a slash that is not a dotfolder, are still replaced', () => {
    const rules = { repo: 'acme-app', words: ['globex'] }
    expect(redact('the acme-app tool and Globex', rules)).toBe('the <repo> tool and <redacted>')
    expect(redact('in /srv/acme-app/src', rules)).toBe('in /srv/<repo>/src')
    expect(redact('a name.acme-app here', rules)).toBe('a name.<repo> here')
  })
  test('sameRepo skips the origin and repo-name rules only', () => {
    const rules = { repo: 'acme-app', origin: 'https://github.com/o/acme-app.git', sameRepo: true, words: ['globex'], userEmail: 'a@b.io' }
    expect(redact('acme-app o/acme-app https://github.com/o/acme-app.git Globex a@b.io /Users/x/y', rules)).toBe('acme-app o/acme-app https://github.com/o/acme-app.git <redacted> <person> <home>/y')
  })
  test('parseLandArgs takes --no-project; land_plan and the tool take project: false', async () => {
    const { parseLandArgs, parseLandTool } = await lib()
    expect(parseLandArgs('bug T --no-project')).toEqual({ type: 'bug', title: 'T', paths: [], noProject: true })
    expect(parseLandTool({ type: 'bug', title: 'T', project: false }).noProject).toBe(true)
    expect(parseLandTool({ type: 'bug', title: 'T' }).noProject).toBe(undefined)
  })
})
