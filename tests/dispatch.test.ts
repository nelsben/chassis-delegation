import { test, expect, describe } from 'claude-code/testing'
import { FIXTURE_CARD, FIXTURE_CARD_NAME, FIXTURE_HEADER } from './fixtures/sample-card'
import {
  parseCard,
  checkStatus,
  checkDomain,
  renderHeader,
  renderBrief,
  parseDispatchArgs,
  cardMatches,
  worktreePath,
  branchName,
  fetchArgv,
  worktreeAddArgv,
  agentTypeFor,
  spawnPrompt,
  spawnDescription,
  scopeLooksProse,
  budgetAttempts,
  scratchpadFor,
  defaultBriefDir,
  lsTreeArgv,
  cardDirPath,
  showCardArgv,
  cardNamesFromLsTree,
  briefFileName,
  briefDirFor,
  inlineBriefFileName,
  inlineBriefText,
  installStep,
  INSTALL_FILES,
  HERE_NO_REPLAY,
  renderSections,
  hereIgnore,
  overlapRefusal,
  overlapWarning,
  currentBranchArgv,
  headShaArgv,
} from '../hooks/lib/dispatch'
import { checkArgv } from '../hooks/lib/allow'

const R = '/Users/b/acme-app'

describe('card parse (the sample card)', () => {
  test('frontmatter fields and the body below it', () => {
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    expect(card.id).toBe('BE-101')
    expect(card.title.startsWith('The rate ladder loads the current tables')).toBe(true)
    expect(card.domain).toBe('backend')
    expect(card.tier).toBe('frontier')
    expect(card.status).toBe('queued')
    expect(card.gate).toEqual(['G2', 'G8p'])
    expect(card.redTest).toBe("RateProviderHttpTest: `roundingParam('table-2026-b', off)` returns `{mode: banker}` with no other key; the request body for `table-2026-c` under `off` carries NO `rounding` key and carries `output.precision = low`; no body for either 2026 id ever carries `mode: disabled` or `scale_digits`; RateCatalogTest: the standard and premium `legacy__` names resolve to the 2026 ids \u2192 all fail on main")
    expect(card.scope).toHaveLength(7)
    expect(card.forbid).toHaveLength(7)
    expect(card.forbid[6]).toBe('any `legacy.` reference')
    expect(card.budget).toBe('frontier-60m')
    expect(card.body.startsWith('## Why')).toBe(true)
    expect(budgetAttempts(card.budget, 3)).toBe(3)
    expect(budgetAttempts('3-attempts', 2)).toBe(3)
  })
  test('refuses a card that is not queued or claimed, saying which', () => {
    const merged = FIXTURE_CARD.replace('status: queued', 'status: merged')
    const card = parseCard(merged)
    if ('error' in card) throw new Error(card.error)
    expect(checkStatus(card)).toBe('BE-101 is status merged; /dispatch takes a queued or claimed card')
    const claimed = parseCard(FIXTURE_CARD.replace('status: queued', 'status: claimed'))
    if ('error' in claimed) throw new Error(claimed.error)
    expect(checkStatus(claimed)).toBeUndefined()
  })
  test('the six board domains pass; a joined or placeholder domain is refused', () => {
    for (const domain of ['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared']) {
      const card = parseCard(FIXTURE_CARD.replace('domain: backend', `domain: ${domain}`))
      if ('error' in card) throw new Error(card.error)
      expect(checkDomain(card)).toBeUndefined()
    }
    for (const domain of ['backend+frontend', '<which domain agent owns this>', '']) {
      const card = parseCard(FIXTURE_CARD.replace('domain: backend', `domain: ${domain}`))
      if ('error' in card) throw new Error(card.error)
      expect(checkDomain(card)).toBe(`BE-101 has domain ${domain || '(none)'}; /dispatch takes frontend, backend, ops, dispatcher, cross or shared`)
    }
  })
  test('no frontmatter or no id is an error', () => {
    expect(parseCard('# just markdown')).toEqual({ error: 'the card has no YAML frontmatter' })
    expect(parseCard('---\ntitle: x\n---\nbody')).toEqual({ error: 'the card frontmatter has no id' })
  })
  test('renders the brief header exactly', () => {
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    expect(renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3 })).toBe(FIXTURE_HEADER)
    expect(scopeLooksProse(card.scope)).toBe(true)
    const globs = renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3, scope: ['app/billing/Rate*.ts', 'docs/architecture/rate-provider-ladder.md'], forbid: ['app/ui/**'] })
    expect(globs).toBe(FIXTURE_HEADER.replace(/ scope=.* red_test=/, ' scope=app/billing/Rate*.ts,docs/architecture/rate-provider-ladder.md forbid=app/ui/** red_test='))
    // --scope alone keeps the card's forbid
    expect(renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3, scope: ['a/**'] })).toContain(' scope=a/** forbid=app/ui/**,any copy text')
    expect(scopeLooksProse(['a/**', 'b.ts'])).toBe(false)
  })
  test('the template fills every placeholder and keeps the card body verbatim', () => {
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    const out = renderBrief('{{id}}|{{title}}|{{domain}}|{{worktree}}|{{branch}}|{{cardPath}}|{{redTest}}|{{gate}}|{{unknown}}\n{{body}}', {
      card, worktree: worktreePath(R, 'BE-101'), branch: branchName('backend', 'BE-101'), cardPath: R + '/agents/tasks/' + FIXTURE_CARD_NAME,
    })
    const [first, ...rest] = out.split('\n')
    expect(first).toBe('BE-101|' + card.title + '|backend|' + R + '-BE-101|agent/backend/BE-101|' + R + '/agents/tasks/' + FIXTURE_CARD_NAME + '|' + card.redTest + '|G2, G8p|{{unknown}}')
    expect(rest.join('\n')).toBe(card.body)
  })
})

describe('default briefDir (the scratchpad convention)', () => {
  test('root /Users/x/repo and session abc', () => {
    expect(defaultBriefDir('/Users/x/repo', 'abc')).toBe('/private/tmp/claude-501/-Users-x-repo/abc/scratchpad/briefs')
    expect(scratchpadFor('/Users/x/repo', 'abc')).toBe('/private/tmp/claude-501/-Users-x-repo/abc/scratchpad')
  })
  test('a dot becomes a dash too (-Users-dev--claude-dev-mods-…)', () => {
    expect(scratchpadFor('/Users/dev/.claude/dev-mods/s1', 'abc')).toBe('/private/tmp/claude-501/-Users-dev--claude-dev-mods-s1/abc/scratchpad')
    expect(scratchpadFor('/Users/x/sample-app/', 'abc')).toBe('/private/tmp/claude-501/-Users-x-sample-app/abc/scratchpad')
  })
})

describe('command arguments', () => {
  test('id, --dry-run and --base', () => {
    expect(parseDispatchArgs('BE-101')).toEqual({ id: 'BE-101', dryRun: false, base: 'origin/main' })
    expect(parseDispatchArgs(' BE-101 --dry-run ')).toEqual({ id: 'BE-101', dryRun: true, base: 'origin/main' })
    expect(parseDispatchArgs('BE-101 --base 96014e3b')).toEqual({ id: 'BE-101', dryRun: false, base: '96014e3b' })
    expect(parseDispatchArgs('BE-101 --base=25117cdf')).toEqual({ id: 'BE-101', dryRun: false, base: '25117cdf' })
  })
  test('--scope and --forbid take comma globs', () => {
    expect(parseDispatchArgs('BE-101 --scope a/**,b.ts, --forbid=c/**')).toEqual({ id: 'BE-101', dryRun: false, base: 'origin/main', scope: ['a/**', 'b.ts'], forbid: ['c/**'] })
    expect(parseDispatchArgs('BE-101 --scope').error).toBe('--scope needs comma-separated globs')
    expect(parseDispatchArgs('BE-101 --scope --dry-run').error).toBe('--scope needs comma-separated globs')
    expect(parseDispatchArgs('BE-101 --forbid a"]]').error).toBe('refused --forbid glob a"]] (no quotes or ]] in a glob)')
  })
  test('--replay needs --base <sha>', () => {
    expect(parseDispatchArgs('OPS-269 --replay --base 96014e3b')).toEqual({ id: 'OPS-269', dryRun: false, base: '96014e3b', replay: true })
    expect(parseDispatchArgs('OPS-269 --replay').error).toBe('refused --replay without --base <sha>: a replay reads the card at the commit where it was still queued')
    expect(parseDispatchArgs('OPS-269 --replay --base origin/main').error).toBe('refused --replay without --base <sha>: a replay reads the card at the commit where it was still queued')
  })
  test('task ids are <PREFIX>-<number>[letter]', () => {
    expect(parseDispatchArgs('OPS-195b').error).toBeUndefined()
    expect(parseDispatchArgs('OPS-1-foo').error).toBe('refused task id OPS-1-foo')
  })
  test('refusals', () => {
    expect(parseDispatchArgs('BE-101 --base HEAD~3').error).toBe('refused --base HEAD~3: use origin/main or a 7-40 character hex sha')
    expect(parseDispatchArgs('').error).toBe('usage: /dispatch <TASK-ID> [--dry-run] [--base <origin/main|sha>] [--replay --base <sha>] [--scope <globs>] [--forbid <globs>] [--here] [--force-overlap]')
    expect(parseDispatchArgs('../etc').error).toBe('refused task id ../etc')
    expect(parseDispatchArgs('BE-101 --force').error).toBe('unknown option --force')
  })
  test('the card file is <id>-*.md and nothing that merely starts like it', () => {
    expect(cardMatches(['BE-101-x.md', 'BE-1010-y.md', 'BE-101.md', 'FE-1-z.md', 'BE-101-z.txt'], 'BE-101')).toEqual(['BE-101-x.md'])
  })
})

describe('GH-12: the card folder is cardDir', () => {
  test('the card lookup honours cardDir, defaulting to agents/tasks', () => {
    expect(cardDirPath(R, '')).toBe(R + '/agents/tasks')
    expect(cardDirPath(R + '/', 'agents/tasks')).toBe(R + '/agents/tasks')
    expect(cardDirPath(R, 'delegation/tasks')).toBe(R + '/delegation/tasks')
  })
})

describe('replay (never run for real here)', () => {
  test('the card is read from the base commit with two read-only git argv', () => {
    expect(lsTreeArgv(R, '96014e3b')).toEqual(['git', '-C', R, 'ls-tree', '--name-only', '96014e3b', 'agents/tasks/'])
    expect(showCardArgv(R, '96014e3b', FIXTURE_CARD_NAME)).toEqual(['git', '-C', R, 'show', '96014e3b:agents/tasks/' + FIXTURE_CARD_NAME])
    expect(checkArgv(lsTreeArgv(R, '96014e3b')).ok).toBe(true)
    expect(checkArgv(showCardArgv(R, '96014e3b', FIXTURE_CARD_NAME)).ok).toBe(true)
    expect(cardNamesFromLsTree('agents/tasks/BE-101-x.md\nagents/tasks/FE-1-y.md\n\n')).toEqual(['BE-101-x.md', 'FE-1-y.md'])
  })
  test('replay paths: brief, worktree, branch', () => {
    expect(briefFileName('OPS-269', true)).toBe('OPS-269.replay.brief.md')
    expect(briefFileName('OPS-269', false)).toBe('OPS-269.brief.md')
    expect(worktreePath(R, 'OPS-269', true)).toBe(R + '-OPS-269-replay')
    expect(branchName('ops', 'OPS-269', true)).toBe('agent/ops/OPS-269-replay')
    const add = worktreeAddArgv(R, 'ops', 'OPS-269', '96014e3b', true)
    expect(add).toEqual(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-269-replay', R + '-OPS-269-replay', '96014e3b'])
    expect(checkArgv(add).ok).toBe(true)
  })
})

describe('the argv /dispatch would run (never run for real here)', () => {
  test('fetch then worktree add from origin/main, both on the allowlist', () => {
    expect(fetchArgv(R)).toEqual(['git', '-C', R, 'fetch', '-q', 'origin', 'main'])
    const add = worktreeAddArgv(R, 'backend', 'BE-101', 'origin/main')
    expect(add).toEqual(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', R + '-BE-101', 'origin/main'])
    expect(checkArgv(fetchArgv(R)).ok).toBe(true)
    expect(checkArgv(add).ok).toBe(true)
  })
  test('a sha base is allowed; a non-sha ref is refused', () => {
    const sha = worktreeAddArgv(R, 'frontend', 'FE-205', '96014e3b')
    expect(sha[sha.length - 1]).toBe('96014e3b')
    expect(checkArgv(sha).ok).toBe(true)
    expect(checkArgv(worktreeAddArgv(R, 'frontend', 'FE-205', 'HEAD~3')).ok).toBe(false)
  })
  test('5B: agent type per domain — the map, else a subagent type named for the domain, else general-purpose', () => {
    // nothing built in names a repo's own subagent types
    expect(agentTypeFor('backend', '')).toBe('general-purpose')
    expect(agentTypeFor('ops', {})).toBe('general-purpose')
    // a subagent type the session offers under the domain's name is used
    expect(agentTypeFor('backend', '', ['general-purpose', 'backend', 'frontend'])).toBe('backend')
    expect(agentTypeFor('ops', '', ['backend', 'frontend'])).toBe('general-purpose')
    // the map wins over both
    expect(agentTypeFor('ops', '{"ops":"frontend"}', ['ops'])).toBe('frontend')
    expect(agentTypeFor('ops', { ops: 'frontend' })).toBe('frontend')
    expect(agentTypeFor('frontend', 'not json', ['frontend'])).toBe('frontend')
    expect(spawnPrompt('/s/briefs/BE-101.brief.md')).toBe('Your brief is the file /s/briefs/BE-101.brief.md. Read it whole, then follow it exactly.')
    const d = spawnDescription('BE-101', 'x'.repeat(100))
    expect(d).toBe('BE-101: ' + 'x'.repeat(60))
  })
})

describe('5C: a portable brief folder and a repo-neutral brief', () => {
  test('briefs go to <root>/.delegation/briefs unless briefDir is set', () => {
    expect(briefDirFor('/w/app', '')).toBe('/w/app/.delegation/briefs')
    expect(briefDirFor('/w/app/', '')).toBe('/w/app/.delegation/briefs')
    expect(briefDirFor('/w/app', '/elsewhere/briefs/')).toBe('/elsewhere/briefs')
  })
  test('the install step is picked by the lockfile present at the root', () => {
    expect(installStep(['package-lock.json', 'README.md'])).toBe('npm ci')
    expect(installStep(['pnpm-lock.yaml'])).toBe('pnpm i --frozen-lockfile')
    expect(installStep(['yarn.lock'])).toBe('yarn install --immutable')
    expect(installStep(['requirements.txt'])).toBe('pip install -r requirements.txt')
    expect(installStep(['README.md'])).toBe('none needed (no lockfile at the repo root)')
    expect(INSTALL_FILES).toEqual(['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt'])
  })
  test('{{install}} and {{extra}} fill in; an empty extra leaves no line', () => {
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    const t = 'Install: {{install}}\n{{extra}}\nEnd'
    expect(renderBrief(t, { card, worktree: '/w', branch: 'b', cardPath: '/c', install: 'npm ci', extra: 'Run make setup.' })).toBe('Install: npm ci\nRun make setup.\nEnd')
    expect(renderBrief(t, { card, worktree: '/w', branch: 'b', cardPath: '/c', install: 'npm ci', extra: '' })).toBe('Install: npm ci\n\nEnd')
  })
  test('worktreeRoot puts the worktrees under it, named <repo>-<id>', () => {
    expect(worktreePath('/w/app', 'OPS-1', false, '/trees')).toBe('/trees/app-OPS-1')
    expect(worktreePath('/w/app', 'OPS-1', true, '/trees/')).toBe('/trees/app-OPS-1-replay')
    expect(worktreePath('/w/app', 'OPS-1')).toBe('/w/app-OPS-1')
    expect(checkArgv(worktreeAddArgv('/w/app', 'ops', 'OPS-1', 'origin/main', false, '/trees'), { worktreeRoot: '/trees' }).ok).toBe(true)
    expect(checkArgv(worktreeAddArgv('/w/app', 'ops', 'OPS-1', 'origin/main', false, '/trees')).ok).toBe(false)
  })
  test('the domains are the repo own when it names them', () => {
    const card = parseCard(FIXTURE_CARD.replace('domain: backend', 'domain: web'))
    if ('error' in card) throw new Error(card.error)
    expect(checkDomain(card, ['web', 'api'])).toBeUndefined()
    expect(checkDomain(card)).toContain('/dispatch takes frontend, backend, ops, dispatcher, cross or shared')
    expect(checkArgv(worktreeAddArgv('/w/app', 'web', 'BE-101', 'origin/main'), { domains: ['web'] }).ok).toBe(true)
    expect(checkArgv(worktreeAddArgv('/w/app', 'web', 'BE-101', 'origin/main')).ok).toBe(false)
  })
})

describe('GH-6: the brief file of an inline header', () => {
  test('<task>.<subtask>.brief.md, never a name /dispatch writes', () => {
    expect(inlineBriefFileName('FE-232', 'e2e')).toBe('FE-232.e2e.brief.md')
    expect(inlineBriefFileName('FE-232', 'main')).toBe('FE-232.main.brief.md')
    expect(inlineBriefFileName('FE-232', 'main')).not.toBe(briefFileName('FE-232'))
    // <task>.replay.brief.md is /dispatch --replay's brief
    expect(inlineBriefFileName('FE-232', 'replay')).toBeUndefined()
  })

  test('a task or subtask that is not a plain name segment names no file', () => {
    for (const [task, subtask] of [['../etc', 'main'], ['FE-1', 'a/b'], ['FE-1', '..'], ['.x', 'main'], ['FE 1', 'main'], ['FE-1', 'v1.2'], ['FE-1', 'x'.repeat(65)]] as const) {
      expect(inlineBriefFileName(task, subtask)).toBeUndefined()
    }
  })

  test('the file is the header, then the rest of the prompt', () => {
    const H = '[[brief v=1 task=FE-232 subtask=e2e scope=a/** gate=node]]'
    expect(inlineBriefText(`${H}\n\nWrite the test.\nHold.`, H)).toBe(`${H}\n\nWrite the test.\nHold.\n`)
    // text above the header follows it; a header alone is the whole file
    expect(inlineBriefText(`You are a worker.\n${H}\nWrite the test.`, H)).toBe(`${H}\n\nYou are a worker.\n\nWrite the test.\n`)
    expect(inlineBriefText(`${H}\n`, H)).toBe(`${H}\n`)
  })
})

describe('GH-16: repo=here, a dispatch into the session checkout', () => {
  test('--here and --force-overlap parse; --here with --replay is refused', () => {
    expect(parseDispatchArgs('BE-101 --here')).toEqual({ id: 'BE-101', dryRun: false, base: 'origin/main', here: true })
    expect(parseDispatchArgs('BE-101 --here --force-overlap --dry-run')).toEqual({ id: 'BE-101', dryRun: true, base: 'origin/main', here: true, forceOverlap: true })
    expect(parseDispatchArgs('BE-101 --here --replay --base 96014e3b').error).toBe(HERE_NO_REPLAY)
    expect(HERE_NO_REPLAY).toBe('refused --here with --replay: a replay works in its own worktree at the base commit')
  })
  test('a card may say repo: here', () => {
    const card = parseCard(FIXTURE_CARD.replace('status: queued', 'status: queued\nrepo: here'))
    if ('error' in card) throw new Error(card.error)
    expect(card.repo).toBe('here')
    const plain = parseCard(FIXTURE_CARD)
    if ('error' in plain) throw new Error(plain.error)
    expect(plain.repo).toBeUndefined()
  })
  test('the header adds repo=here, base= and ignore= after the gate; without them it is unchanged', () => {
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    expect(renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3, repo: 'here', base: 'main', ignore: ['.delegation/**', 'src/b.ts'] })).toBe(
      FIXTURE_HEADER.replace(' budget=3-attempts', ' repo=here base=main ignore=.delegation/**,src/b.ts budget=3-attempts'),
    )
    expect(renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3, repo: 'here', ignore: [] })).toBe(FIXTURE_HEADER.replace(' budget=3-attempts', ' repo=here budget=3-attempts'))
    expect(renderHeader({ card, tier: 'frontier', alias: 'opus', budget: 3 })).toBe(FIXTURE_HEADER)
  })
  test('the template keeps the {{#here}} sections for a repo=here brief and the {{#worktree}} ones otherwise', () => {
    const t = 'A\n{{#worktree}}\nWorktree {{worktree}}.\n{{/worktree}}\n{{#here}}\nShared {{worktree}}.\n{{/here}}\nZ'
    expect(renderSections(t, false)).toBe('A\nWorktree {{worktree}}.\nZ')
    expect(renderSections(t, true)).toBe('A\nShared {{worktree}}.\nZ')
    const card = parseCard(FIXTURE_CARD)
    if ('error' in card) throw new Error(card.error)
    expect(renderBrief(t, { card, worktree: '/w/app', branch: 'main', cardPath: '/c', here: true })).toBe('A\nShared /w/app.\nZ')
    expect(renderBrief(t, { card, worktree: '/w/app-BE-101', branch: 'b', cardPath: '/c' })).toBe('A\nWorktree /w/app-BE-101.\nZ')
    // a template with no sections renders as before
    expect(renderBrief('{{id}} in {{worktree}}', { card, worktree: '/w/app', branch: 'main', cardPath: '/c', here: true })).toBe('BE-101 in /w/app')
  })
  test("ignore= is the config's globs, then the files other in-flight cards claimed, each once; what a header cannot carry is left out", () => {
    expect(hereIgnore(['.delegation/**'], ['src/b.ts', '.delegation/**', 'src/b.ts', 'a b.ts', 'q"x', 'z]]'])).toEqual(['.delegation/**', 'src/b.ts'])
    expect(hereIgnore([], [])).toEqual([])
  })
  test('the overlap refusal names both cards and both globs; --force-overlap turns it into a warning', () => {
    expect(overlapRefusal('BE-101', 'src/**', 'GH-19', 'src/lib/**')).toBe(
      '/dispatch BE-101: refused — BE-101 scope src/** overlaps in-flight GH-19 scope src/lib/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)',
    )
    expect(overlapWarning('BE-101', 'src/**', 'GH-19', 'src/lib/**')).toBe('warning: BE-101 scope src/** overlaps in-flight GH-19 scope src/lib/** in the shared checkout (--force-overlap: dispatched anyway)')
  })
  test('the two reads a repo=here dispatch makes are on the allowlist; fetch and worktree add are not among them', () => {
    expect(currentBranchArgv(R)).toEqual(['git', '-C', R, 'rev-parse', '--abbrev-ref', 'HEAD'])
    expect(headShaArgv(R)).toEqual(['git', '-C', R, 'rev-parse', 'HEAD'])
    expect(checkArgv(currentBranchArgv(R)).ok).toBe(true)
    expect(checkArgv(headShaArgv(R)).ok).toBe(true)
  })
})
