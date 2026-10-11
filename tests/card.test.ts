import { test, expect, describe } from 'claude-code/testing'
import { CARD_TOOL, cardFromFields, cardSummary, forbidCollisions, type CardCtx } from '../hooks/lib/card'
import { parseCard } from '../hooks/lib/dispatch'

const ctx = (over: Partial<CardCtx> = {}): CardCtx => ({
  domains: ['frontend', 'backend', 'ops'],
  gateIds: ['test', 'lint'],
  names: [],
  spendByTier: { economy: 2, standard: 6, frontier: 15 },
  ...over,
})
const input = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
  title: 'The rom reader returns the header size',
  why: 'The decompiler cannot tell how big a header is. Add the reader.',
  doneWhen: ['read_header(path) returns the size', 'a unittest covers it'],
  scope: ['game_decompiler/**', 'tests/**'],
  redTest: 'python3 -m unittest tests.test_rom',
  ...over,
})
const ok = (r: ReturnType<typeof cardFromFields>) => {
  if ('error' in r) throw new Error(r.error)
  return r
}

describe('GH-111: cardFromFields', () => {
  test('the first card in a folder is OPS-1 (the first domain when ops is absent takes its first three letters)', () => {
    const r = ok(cardFromFields(input({ domain: 'ops' }), ctx()))
    expect(r.id).toBe('OPS-1')
    expect(r.file).toBe('OPS-1-the-rom-reader-returns-the-header.md')
    expect(ok(cardFromFields(input(), ctx({ domains: ['web', 'api'] }))).id).toBe('WEB-1')
    expect(ok(cardFromFields(input({ domain: 'frontend' }), ctx())).id).toBe('FE-1')
    expect(ok(cardFromFields(input({ domain: 'backend' }), ctx())).id).toBe('BE-1')
  })

  test('the next free number per prefix, over the cards already in the folder', () => {
    const names = ['README.md', 'OPS-000-sample.md', 'OPS-1-a.md', 'OPS-3-b.md', 'OPS-3b-c.md', 'BE-2-x.md']
    expect(ok(cardFromFields(input({ domain: 'ops' }), ctx({ names }))).id).toBe('OPS-4')
    expect(ok(cardFromFields(input({ domain: 'backend' }), ctx({ names }))).id).toBe('BE-3')
    expect(ok(cardFromFields(input({ domain: 'frontend' }), ctx({ names }))).id).toBe('FE-1')
  })

  test('the slug is the title in lower case, words joined by -, at most six words', () => {
    expect(ok(cardFromFields(input({ title: 'Add a `read_header()` function: it returns the size, with a test!' }), ctx())).file).toBe('OPS-1-add-a-read-header-function-it.md'.replace('OPS-1', 'OPS-1'))
    expect(ok(cardFromFields(input({ title: '!!!' }), ctx())).file).toBe('OPS-1-task.md')
  })

  test('the card parses back to what was given, with the defaults filled in', () => {
    const r = ok(cardFromFields(input(), ctx()))
    expect(r.text).toContain('## Why\n\nThe decompiler cannot tell how big a header is. Add the reader.\n')
    expect(r.text).toContain('## Done when\n\n- read_header(path) returns the size\n- a unittest covers it\n')
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c).toMatchObject({
      id: 'OPS-1',
      title: 'The rom reader returns the header size',
      domain: 'ops',
      tier: 'standard',
      status: 'queued',
      scope: ['game_decompiler/**', 'tests/**'],
      forbid: [],
      redTest: 'python3 -m unittest tests.test_rom',
      gate: ['test'],
      budget: '2-attempts',
      spend: '6',
    })
  })

  test('tier, budget, spend, forbid and gate are taken as given', () => {
    const r = ok(cardFromFields(input({ tier: 'frontier', budget: 3, spend: 4, forbid: ['docs/**'], gate: 'lint' }), ctx()))
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c).toMatchObject({ tier: 'frontier', budget: '3-attempts', spend: '4', forbid: ['docs/**'], gate: ['lint'] })
  })

  test('scope given as prose is refused with the fix, and so is forbid', () => {
    const e = cardFromFields(input({ scope: ['the decompiler and its tests'] }), ctx())
    expect(e).toEqual({ error: 'scope must be globs, e.g. game_decompiler/**, tests/test_rom.py (got "the decompiler and its tests")' })
    expect(cardFromFields(input({ forbid: ['anything else'] }), ctx())).toEqual({ error: 'forbid must be globs, e.g. game_decompiler/**, tests/test_rom.py (got "anything else")' })
    expect('error' in cardFromFields(input({ scope: [] }), ctx())).toBe(true)
  })

  test('a gate id missing from gateMap is refused naming the ids that exist', () => {
    expect(cardFromFields(input({ gate: 'nope' }), ctx())).toEqual({ error: 'gate nope is not in gateMap; the ids are test, lint' })
    expect(cardFromFields(input(), ctx({ gateIds: [] }))).toEqual({ error: 'gateMap has no gate; run /delegation setup, or add a gateMap entry in .chassis-delegation.json' })
  })

  test('red_test is required unless it says none', () => {
    expect('error' in cardFromFields(input({ redTest: '' }), ctx())).toBe(true)
    expect('error' in cardFromFields(input({ redTest: undefined }), ctx())).toBe(true)
    expect(ok(cardFromFields(input({ redTest: 'none' }), ctx())).text).toContain('red_test: none')
  })

  test('title, why, doneWhen, tier and domain are checked; nothing is returned to write on a refusal', () => {
    expect(cardFromFields(input({ title: '' }), ctx())).toEqual({ error: 'title is required: one line that says what done looks like' })
    expect('error' in cardFromFields(input({ why: '' }), ctx())).toBe(true)
    expect('error' in cardFromFields(input({ doneWhen: [] }), ctx())).toBe(true)
    expect(cardFromFields(input({ tier: 'huge' }), ctx())).toEqual({ error: 'tier huge is not economy, standard, frontier or premium' })
    expect(cardFromFields(input({ domain: 'legal' }), ctx())).toEqual({ error: 'domain legal is not one of frontend, backend, ops' })
    expect('error' in cardFromFields(input({ budget: 0 }), ctx())).toBe(true)
  })

  test('the summary is one line', () => {
    const r = ok(cardFromFields(input(), ctx()))
    expect(cardSummary(r, 'sonnet')).toBe('OPS-1 · standard → sonnet · scope game_decompiler/**, tests/** · gate test · red: python3 -m unittest tests.test_rom · 2 attempts · $6 ceiling')
    const n = ok(cardFromFields(input({ spend: 0 }), ctx()))
    expect(cardSummary(n, 'sonnet')).toContain('· no ceiling')
  })

  test('MOD-22: repo here or none is written on the card; worktree is the default and writes nothing; anything else is refused', () => {
    const here = ok(cardFromFields(input({ repo: 'here' }), ctx()))
    expect(here.text).toContain('\nrepo: here\n')
    expect(here.repo).toBe('here')
    const none = ok(cardFromFields(input({ repo: 'none' }), ctx()))
    expect(none.text).toContain('\nrepo: none\n')
    const c = parseCard(none.text)
    if ('error' in c) throw new Error(c.error)
    expect(c.repo).toBe('none')
    for (const r of [ok(cardFromFields(input(), ctx())), ok(cardFromFields(input({ repo: 'worktree' }), ctx()))]) {
      expect(r.text).not.toContain('repo:')
      expect(r.repo).toBe('worktree')
    }
    // a repo with no origin/main still defaults to here, and an explicit repo wins over that default
    expect(ok(cardFromFields(input(), ctx({ here: true }))).text).toContain('\nrepo: here\n')
    expect(ok(cardFromFields(input({ repo: 'none' }), ctx({ here: true }))).text).toContain('\nrepo: none\n')
    expect(ok(cardFromFields(input({ repo: 'worktree' }), ctx({ here: true }))).text).not.toContain('repo:')
    expect(cardFromFields(input({ repo: 'sideways' }), ctx())).toEqual({ error: 'repo must be worktree, here, none or the absolute path of a git checkout (got "sideways")' })
    expect(cardFromFields(input({ repo: 3 }), ctx())).toEqual({ error: 'repo must be worktree, here, none or the absolute path of a git checkout (got "3")' })
  })

  test('MOD-22: scope and forbid may hold absolute paths and globs, and a tilde', () => {
    const r = ok(cardFromFields(input({ repo: 'none', scope: ['/out/hair/**', '~/exports/*.glb', 'notes/x.md'], forbid: ['/etc/**', '~/Documents/**'] }), ctx()))
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c.scope).toEqual(['/out/hair/**', '~/exports/*.glb', 'notes/x.md'])
    expect(c.forbid).toEqual(['/etc/**', '~/Documents/**'])
    // prose is still refused, absolute or not
    expect('error' in cardFromFields(input({ scope: ['/out/my folder/**'] }), ctx())).toBe(true)
  })

  test('MOD-22: the tool takes repo, and its description says when to use it', () => {
    expect(CARD_TOOL.inputSchema.properties.repo.type).toBe('string')
    expect(CARD_TOOL.inputSchema.required).not.toContain('repo')
    expect(CARD_TOOL.description).toContain('research or extraction with outputs outside the repo: repo none or here, scope = the output folder')
  })

  test('MOD-22: the summary names a repo that is not a worktree', () => {
    expect(cardSummary(ok(cardFromFields(input({ repo: 'none' }), ctx())), 'sonnet')).toContain(' · repo none · ')
    expect(cardSummary(ok(cardFromFields(input(), ctx())), 'sonnet')).not.toContain('repo')
  })

  test('the tool takes the spec schema', () => {
    expect(CARD_TOOL.name).toBe('card')
    expect(CARD_TOOL.inputSchema.additionalProperties).toBe(false)
    // MOD-23: scope is each lane's own on a call with lanes, so the schema no longer requires a shared one (the card still refuses a single card without it)
    expect(CARD_TOOL.inputSchema.required).toEqual(['title', 'why', 'doneWhen', 'redTest'])
    expect(CARD_TOOL.description).toContain('Never ask the person to edit a card file.')
  })
})

describe('MOD-29: the dry run warns when a forbid glob collides with the card', () => {
  test('a forbid glob that matches a path named in done-when warns, naming both', () => {
    expect(forbidCollisions([], ['artifacts/*.html'], ['`artifacts/kit/index.html` exists'])).toEqual([
      'warning: forbid artifacts/*.html matches artifacts/kit/index.html named in done-when',
    ])
    // a bare path (no backticks), a trailing full stop, and a path under the forbid's folder all count
    expect(forbidCollisions([], ['docs/**'], ['docs/notes.md is written.'])).toEqual(['warning: forbid docs/** matches docs/notes.md named in done-when'])
  })

  test('a forbid glob that matches a scope glob warns, naming the entry', () => {
    expect(forbidCollisions(['artifacts/kit/**'], ['artifacts/*.html'], [])).toEqual(['warning: forbid artifacts/*.html matches scope artifacts/kit/**'])
    expect(forbidCollisions(['docs/a.md'], ['docs/**'], [])).toEqual(['warning: forbid docs/** matches scope docs/a.md'])
  })

  test('a forbid that touches neither the scope nor a done-when path warns nothing', () => {
    expect(forbidCollisions(['src/**'], ['docs/**'], ['all the tests pass'])).toEqual([])
    expect(forbidCollisions(['src/**'], ['docs/**'], ['`src/x.ts` exists'])).toEqual([])
  })

  test('a class does not stop the * after it from crossing folders, so artifacts/[^/]*.html still collides', () => {
    expect(forbidCollisions(['artifacts/kit/**'], ['artifacts/[^/]*.html'], [])).toEqual(['warning: forbid artifacts/[^/]*.html matches scope artifacts/kit/**'])
  })

  test('a repo glob crosses folders: out/*.png matches out/sub/a.png under scope out/sub/**', () => {
    expect(forbidCollisions(['out/sub/**'], ['out/*.png'], [])).toEqual(['warning: forbid out/*.png matches scope out/sub/**'])
  })

  test('an absolute forbid stays in one folder: /out/*.png does not match /out/sub/a.png', () => {
    expect(forbidCollisions([], ['/out/*.png'], ['`/out/sub/a.png` exists'])).toEqual([])
    expect(forbidCollisions(['/out/sub/**'], ['/out/*.png'], [])).toEqual([])
    expect(forbidCollisions([], ['/out/*.png'], ['`/out/a.png` exists'])).toEqual(['warning: forbid /out/*.png matches /out/a.png named in done-when'])
  })

  test('only the Done when statements are read: a path in the why or the title is not a collision', () => {
    expect(forbidCollisions([], ['artifacts/*.html'], ['the page builds'])).toEqual([])
  })
})

describe('MOD-40: a frontmatter value with a space and a hash is not cut there', () => {
  const legacy = (redLine: string) => `---
id: OPS-1
title: Legacy card
domain: ops
tier: standard
status: queued
scope: [a/**]
forbid: []
${redLine}
gate: test
budget: 2-attempts
spend: 6
---
## Why

A card written before the change.

## Done when

- it reads whole
`

  test('a card whose red_test holds " #89" round-trips whole through the writer and the reader', () => {
    const red = 'isCorrection on the first three #89 messages'
    const r = ok(cardFromFields(input({ redTest: red }), ctx()))
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c.redTest).toBe(red)
  })

  test('" #n" and a value with both a quote and a hash round-trip whole (title and red_test)', () => {
    const title = 'Prints "both" lines #n and #3'
    const red = 'grep "#n" out.txt # 2 hits'
    const r = ok(cardFromFields(input({ title, redTest: red }), ctx()))
    const c = parseCard(r.text)
    if ('error' in c) throw new Error(c.error)
    expect(c.title).toBe(title)
    expect(c.redTest).toBe(red)
  })

  test('an unquoted legacy red_test with " #n" (the MOD-31 case) reads whole', () => {
    const c = parseCard(legacy('red_test: prints both #n lines'))
    if ('error' in c) throw new Error(c.error)
    expect(c.redTest).toBe('prints both #n lines')
  })

  test('an unquoted legacy red_test with " #89" reads whole', () => {
    const c = parseCard(legacy('red_test: isCorrection on the first three #89 messages'))
    if ('error' in c) throw new Error(c.error)
    expect(c.redTest).toBe('isCorrection on the first three #89 messages')
  })

  test('an unquoted value with " # " and a trailing note reads only up to the hash', () => {
    const c = parseCard(legacy('red_test: npm test # the unit tests'))
    if ('error' in c) throw new Error(c.error)
    expect(c.redTest).toBe('npm test')
  })
})

describe('MOD-44: a card for another local repo', () => {
  const other = (over: Partial<CardCtx> = {}) => ctx({ repoPath: '/Users/b/notes-app', gateIds: ['test'], ...over })
  test('repo is the path the caller resolved: the card says it, the gate and the domain are that repo\'s', () => {
    const r = ok(cardFromFields(input({ repo: '/Users/b/notes-app' }), other()))
    expect(r.repo).toBe('/Users/b/notes-app')
    expect(r.text).toContain('\nrepo: /Users/b/notes-app\n')
    expect(r.gate).toEqual(['test'])
    expect(cardSummary(r, 'sonnet')).toContain('repo /Users/b/notes-app')
    expect(parseCard(r.text)).toMatchObject({ repo: '/Users/b/notes-app', gate: ['test'] })
  })
  test('a path nobody resolved is refused, the words keep working', () => {
    expect(cardFromFields(input({ repo: '/Users/b/notes-app' }), ctx())).toEqual({ error: 'repo must be worktree, here, none or the absolute path of a git checkout (got "/Users/b/notes-app")' })
    expect(ok(cardFromFields(input({ repo: 'none' }), ctx())).repo).toBe('none')
  })
  test('a repo with no gate at all needs a one-off command; a command passes the gate rules and holds no comma', () => {
    const bare = other({ gateIds: [] })
    expect(cardFromFields(input(), bare)).toEqual({ error: '/Users/b/notes-app has no gate: no gateMap in its .chassis-delegation.json and no test command found (package.json scripts.test, pytest, cargo or go); name one in gate, e.g. "npm run build"' })
    const one = ok(cardFromFields(input({ gate: 'npm run build' }), bare))
    expect(one.gate).toEqual(['npm run build'])
    expect(one.text).toContain('\ngate: npm run build\n')
    expect(parseCard(one.text)).toMatchObject({ gate: ['npm run build'] })
    expect(ok(cardFromFields(input({ gate: 'npm run build' }), other())).gate).toEqual(['npm run build'])
    expect(cardFromFields(input({ gate: 'npm run build, npm test' }), bare)).toEqual({ error: 'a one-off gate command cannot hold a comma; name one command, or gate ids from gateMap' })
    expect(cardFromFields(input({ gate: 'curl http://x' }), bare)).toEqual({ error: 'gate command refused: a gate may not run curl' })
    // ids still work beside it, and an unknown id is named
    expect(ok(cardFromFields(input({ gate: 'test' }), other())).gate).toEqual(['test'])
    expect(cardFromFields(input({ gate: 'lint' }), other())).toEqual({ error: 'gate lint is not in gateMap; the ids are test' })
    // the session's own repo takes no one-off command
    expect(cardFromFields(input({ gate: 'npm run build' }), ctx())).toEqual({ error: 'gate npm run build is not in gateMap; the ids are test, lint' })
  })
})
