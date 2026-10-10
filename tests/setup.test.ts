import { test, expect, describe } from 'claude-code/testing'
import { DEFAULT_SPEND_BY_TIER } from '../hooks/lib/cost'
import { allRequiredHold, proposedSpend, BRAIN_HANDOVER, configLines, detectGate, foundOf, handoverText, scaffoldConfig, setupChecks, setupText, wouldSet, type SetupProbe } from '../hooks/lib/setup'
import { CONFIG_TEMPLATE } from '../hooks/lib/init'
import { parseCard } from '../hooks/lib/dispatch'
import { parseRepoConfig } from '../hooks/lib/repoconfig'

const R = '/w/app'
// a node repo in which every required check holds, on a remote
const green = (over: Partial<SetupProbe> = {}): SetupProbe => ({
  root: R,
  home: '/home/u',
  inRepo: true,
  toplevel: R,
  branch: 'main',
  hasCommit: true,
  hasOriginMain: true,
  dirty: false,
  markers: ['package.json', 'package-lock.json'],
  packageJson: '{"scripts":{"test":"node --test"}}',
  pyTests: false,
  onPath: ['git', 'node', 'npm', 'gh'],
  shadows: [],
  childRepos: [],
  autoDebrief: false,
  ...over,
})
const text = (p: SetupProbe): string => setupText(R, setupChecks(p))

describe('GH-109: setupChecks over a table of probes', () => {
  test('a green node repo on a remote: six required hold, the advice says worktree mode', () => {
    const lines = setupChecks(green())
    expect(allRequiredHold(lines)).toBe(true)
    expect(text(green())).toBe(
      [
        `chassis-delegation setup in ${R}: 6 of 6 required checks hold`,
        '✓ a git repo',
        '✓ the session root is the repo top level',
        '✓ a first commit',
        '✓ a gate: npm test',
        '✓ the tools on PATH: git, node, npm',
        '✓ no shadowing command or skill',
        '· mode: worktree (origin/main resolves; each worker gets its own worktree)',
        '· a lockfile for the brief\'s install step: package-lock.json',
        '· gh is on PATH: a report\'s pr= claim can be checked',
      ].join('\n'),
    )
  })

  test('no git repo: the repo, top level and commit checks fail with the fix, and the gate is still found', () => {
    const p = green({ inRepo: false, toplevel: undefined, branch: undefined, hasCommit: false, hasOriginMain: false })
    const lines = setupChecks(p)
    expect(allRequiredHold(lines)).toBe(false)
    const t = text(p).split('\n')
    expect(t[0]).toBe(`chassis-delegation setup in ${R}: 3 of 6 required checks hold`)
    expect(t.slice(1, 8)).toEqual([
      '✗ a git repo: none here',
      '    fix: git init -b main',
      '✗ the session root is the repo top level: no repo yet',
      '    fix: run git init -b main in this folder, which then is the top level',
      '✗ a first commit: none yet',
      '    fix: git add -A && git commit -m "Initial commit"',
      '✓ a gate: npm test',
    ])
  })

  test('a repo with no commit names the commit', () => {
    const p = green({ hasCommit: false, hasOriginMain: false })
    expect(text(p)).toContain('✗ a first commit: none yet\n    fix: git add -A && git commit -m "Initial commit"')
    expect(setupChecks(p).filter(l => l.level === 'required' && !l.ok)).toHaveLength(1)
  })

  test('a session root below the top level is told where to start', () => {
    const p = green({ toplevel: '/w' })
    expect(text(p)).toContain('✗ the session root is not the repo top level (/w)\n    fix: start Claude Code in /w')
  })

  test('a repo with no origin: repo=here, baseRef from the branch, cards dispatch with --here, the remote offered', () => {
    const p = green({ hasOriginMain: false, branch: 'trunk' })
    expect(allRequiredHold(setupChecks(p))).toBe(true)
    expect(text(p)).toContain(
      '· mode: repo=here (no origin/main); setup writes "baseRef": "trunk" and cards dispatch with --here\n    or give worktree mode a remote: gh repo create app --private --source . --push (your call)',
    )
    expect(foundOf(p)).toEqual({ gate: 'npm test', baseRef: 'trunk' })
    expect(foundOf(green({ hasOriginMain: false, branch: 'HEAD' })).baseRef).toBe('main')
    expect(foundOf(green())).toEqual({ gate: 'npm test' })
  })

  test('a node repo: the placeholder test script is no gate; a lockfile picks the package manager', () => {
    const none = green({ packageJson: '{"scripts":{"test":"echo \\"Error: no test specified\\" && exit 1"}}' })
    expect(allRequiredHold(setupChecks(none))).toBe(false)
    expect(text(none)).toContain('✗ a gate: no test command found\n    fix: add a test command that passes on the empty project, then run /delegation setup again (for example "scripts": {"test": "node --test"} in package.json)')
    const pnpm = green({ markers: ['package.json', 'pnpm-lock.yaml'], onPath: ['git', 'node', 'pnpm'] })
    expect(text(pnpm)).toContain('✓ a gate: pnpm test')
    expect(text(pnpm)).toContain('✓ the tools on PATH: git, node, pnpm')
    const yarn = green({ markers: ['package.json', 'yarn.lock'], onPath: ['git', 'node'] })
    expect(text(yarn)).toContain('✗ the tools on PATH: missing yarn\n    fix: install yarn and put it on PATH')
  })

  test('other stacks: pytest, cargo test, go test', () => {
    const base = { packageJson: undefined, markers: [] as string[] }
    expect(text(green({ ...base, markers: ['pyproject.toml'], onPath: ['git', 'python3', 'pytest'] }))).toContain('✓ a gate: pytest')
    // no pytest installed and none named: the standard library's unittest, which needs only python3
    expect(text(green({ ...base, pyTests: true, onPath: ['git', 'python3'] }))).toContain('✓ a gate: python3 -m unittest discover -s tests')
    expect(text(green({ ...base, pyTests: true, onPath: ['git', 'python3'] }))).toContain('✓ the tools on PATH: git, python3')
    // pytest.ini names pytest: it is required even when it is not installed
    expect(text(green({ ...base, markers: ['pytest.ini'], onPath: ['git', 'python3'] }))).toContain('✗ the tools on PATH: missing pytest')
    expect(text(green({ ...base, markers: ['Cargo.toml'], onPath: ['git', 'cargo'] }))).toContain('✓ a gate: cargo test')
    expect(text(green({ ...base, markers: ['go.mod'], onPath: ['git', 'go'] }))).toContain('✓ a gate: go test ./...')
    expect(text(green({ ...base, onPath: ['git'] }))).toContain('· no lockfile')
  })

  test('a plugin repo: the cards go under docs/cards, and the config gets cardDir', () => {
    const p = green({ markers: ['package.json', '.claude-plugin/plugin.json'] })
    expect(text(p)).toContain('· a plugin repo: the cards go under docs/cards/')
    expect(foundOf(p)).toEqual({ gate: 'npm test', cardDir: 'docs/cards' })
  })

  test('a nested gitignored child repo is named; one the root does not ignore is not', () => {
    const p = green({ childRepos: ['api', 'tools'], gitignore: 'node_modules/\n/api/\n' })
    expect(text(p)).toContain('· code in api is its own repo; to delegate there, start Claude Code in api')
    expect(text(p)).not.toContain('code in tools')
  })

  test('a shadowing ~/.claude/commands/dispatch.md fails the check and names the file', () => {
    const p = green({ shadows: ['.claude/commands/dispatch.md'] })
    expect(allRequiredHold(setupChecks(p))).toBe(false)
    expect(text(p)).toContain('✗ a command or skill shadows the mod: ~/.claude/commands/dispatch.md\n    fix: remove ~/.claude/commands/dispatch.md')
  })

  test('advice: no gh, uncommitted changes (worktree mode only), background debrief', () => {
    const p = green({ onPath: ['git', 'node', 'npm'], dirty: true, autoDebrief: true })
    const t = text(p)
    expect(t).toContain("· gh is not on PATH: a report's pr= claim can be checked only with it")
    expect(t).toContain("· uncommitted changes: in worktree mode they are not in a worker's worktree\n    commit them first")
    expect(t).toContain('· background debrief is on: it spends an agent at a quiet stop\n    turn it off in /config (autoDebrief)')
    expect(text(green({ dirty: true, hasOriginMain: false }))).not.toContain('uncommitted')
  })
})

describe('GH-109: the scaffold', () => {
  test('the config carries the gate, baseRef and cardDir found, and still parses', () => {
    const out = scaffoldConfig(CONFIG_TEMPLATE, { gate: 'npm test', baseRef: 'main', cardDir: 'docs/cards' })
    const parsed = parseRepoConfig(out)
    expect(parsed.errors).toEqual([])
    expect(parsed.config.gateMap).toEqual({ test: 'npm test' })
    expect(parsed.config.baseRef).toBe('main')
    expect(parsed.config.cardDir).toBe('docs/cards')
  })
  test('an existing config is described, not changed', () => {
    expect(wouldSet({ gate: 'pytest', baseRef: 'main' })).toBe('· .chassis-delegation.json exists and is left as it is; setup would have set "gateMap": {"test": "pytest"}, "baseRef": "main"')
  })
})

describe('GH-111: the handover asks for the first task', () => {
  const go = ' Claude writes the card, shows you the brief, and when you say go dispatches it and makes the Agent call that starts the worker; the mod shapes and verifies it.'
  test('one sentence, with an example from the detected stack', () => {
    const t = (p: SetupProbe): string => handoverText(detectGate(p))
    const base = { packageJson: undefined, markers: [] as string[] }
    expect(t(green())).toBe(`Set up. Tell Claude your first task in a sentence, for example: "add a function that reads a file header and returns its size, with a node --test test".${go}`)
    expect(t(green({ ...base, pyTests: true, onPath: ['git', 'python3'] }))).toContain('"add a function that reads a file header and returns its size, with a unittest"')
    expect(t(green({ ...base, markers: ['Cargo.toml'] }))).toContain('with a cargo test"')
    expect(t(green({ ...base, markers: ['go.mod'] }))).toContain('with a go test"')
    expect(handoverText(undefined)).toContain('with a test"')
  })
  test('no card skeleton, no commit step', () => {
    const t = handoverText(detectGate(green()))
    expect(t).not.toContain('REPLACE ME')
    expect(t).not.toContain('save this as')
    expect(t).not.toContain('git commit')
    expect(BRAIN_HANDOVER).toBe('Ask the person for the first task, then call the card tool. On go, call dispatch and make the Agent call its result ends with (the spawn block, verbatim): that call starts the worker.')
  })
})

describe('GH-110: config lines', () => {
  test('one per key set', () => {
    expect(configLines({ gate: 'pytest', baseRef: 'main', cardDir: 'docs/cards' })).toEqual(['config: gateMap.test = pytest', 'config: baseRef = main', 'config: cardDir = docs/cards'])
    expect(configLines({ gate: 'cargo test' })).toEqual(['config: gateMap.test = cargo test'])
  })
})

describe('GH-116: spend ceilings that fit the host', () => {
  test('the defaults are economy 3, standard 10, frontier 25', () => {
    expect(DEFAULT_SPEND_BY_TIER).toEqual({ economy: 3, standard: 10, frontier: 25 })
  })
  test('a cloud gate proposes economy 5, standard 15, frontier 35; any other gate the defaults', () => {
    for (const c of ['sf project deploy start', 'sfdx force:source:deploy', 'npm run deploy && npm test', 'sf apex run test --target-org dev', 'gcloud builds submit', 'aws s3 ls', 'az deployment group create', 'terraform plan']) {
      expect(proposedSpend(c)).toEqual({ economy: 5, standard: 15, frontier: 35 })
    }
    expect(proposedSpend(['npm test', 'sf apex run test']).standard).toBe(15)
    for (const c of ['npm test', 'pytest', 'cargo test', 'go test ./...', 'python3 -m unittest discover -s tests']) expect(proposedSpend(c)).toEqual(DEFAULT_SPEND_BY_TIER)
  })
  test('a fresh config carries the proposal, and setup names it with a reason', () => {
    const found = { gate: 'sf apex run test', spendByTier: proposedSpend('sf apex run test') }
    expect(parseRepoConfig(scaffoldConfig(CONFIG_TEMPLATE, found)).config.spendByTier).toEqual({ economy: 5, standard: 15, frontier: 35 })
    const lines = configLines(found)
    expect(lines).toContain('config: spendByTier = economy 5, standard 15, frontier 35 (the gate deploys or runs remote tests)')
    expect(configLines({ gate: 'npm test', spendByTier: proposedSpend('npm test') })).toContain('config: spendByTier = economy 3, standard 10, frontier 25 (the defaults)')
  })
})
