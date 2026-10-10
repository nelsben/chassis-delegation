import { test, expect, describe } from 'claude-code/testing'
import { checkArgv, checkGateCommand, refusedLine, type AllowConfig } from '../hooks/lib/allow'
import { gateTemplatesOf, resolveGateRuns, fillFiles } from '../hooks/lib/gates'
import { parseRepoConfig, settingsLayer } from '../hooks/lib/repoconfig'

const R = '/Users/b/acme-app'
const MAP = { prettier: 'bash scripts/ci/gates/prettier-changed.sh {files}', test: 'npm test', lint: 'npx eslint --max-warnings 0 {files} && npm run typecheck' }
const ALLOW: AllowConfig = { gateTemplates: gateTemplatesOf(MAP) }
const ok = (argv: string[], allow: AllowConfig = ALLOW) => expect(checkArgv(argv, allow).ok, JSON.stringify(argv)).toBe(true)
const no = (argv: string[], allow: AllowConfig = ALLOW) => expect(checkArgv(argv, allow).ok, JSON.stringify(argv)).toBe(false)

describe('allowlist accepts', () => {
  test('a gate-map command exactly, {files} filled with an absolute path; each part of a chained one', () => {
    ok(['bash', 'scripts/ci/gates/prettier-changed.sh', '/r/.delegation/FE-1/files.txt'])
    ok(['npm', 'test'])
    ok(['npx', 'eslint', '--max-warnings', '0', '/r/.delegation/FE-1/files.txt'])
    ok(['npm', 'run', 'typecheck'])
  })
  test('read-only git and gh', () => {
    ok(['git', '-C', R, 'diff', '--no-renames', '--name-only', 'abc', 'def'])
    ok(['git', '-C', R, 'diff', '--name-status', '-M', 'abc', 'def'])
    ok(['git', '-C', R, 'merge-base', '--is-ancestor', 'abc', 'refs/heads/agent/ops/X'])
    ok(['git', '-C', R, 'rev-parse', '--verify', '--quiet', 'abc^{commit}'])
    ok(['git', '-C', R, 'rev-parse', '--abbrev-ref', 'HEAD'])
    ok(['git', 'status', '--porcelain'])
    ok(['git', 'log', '-1', '--format=%H'])
    ok(['git', 'worktree', 'list', '--porcelain'])
    ok(['gh', 'pr', 'list', '--json', 'number'])
    ok(['gh', 'pr', 'view', '12', '--json', 'state'])
  })
  test('the exact /dispatch shapes', () => {
    ok(['git', '-C', R, 'fetch', '-q', 'origin', 'main'])
    ok(['git', '-C', R, 'fetch', 'origin', 'main'])
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', R + '-BE-101', 'origin/main'])
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-195b', R + '-OPS-195b', 'origin/main'])
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/frontend/FE-205', R + '-FE-205', '96014e3b'])
  })
  test('replay: the base-commit card read, and the -replay branch and path', () => {
    ok(['git', '-C', R, 'ls-tree', '--name-only', '96014e3b', 'agents/tasks/'])
    ok(['git', '-C', R, 'show', '96014e3b:agents/tasks/BE-101-the-rate-ladder-loads-the-current-tables.md'])
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-269-replay', R + '-OPS-269-replay', '96014e3b'])
  })
  test('the default six domains, or the repo own; worktreeRoot moves the path', () => {
    for (const domain of ['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared']) {
      ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', `agent/${domain}/OPS-230`, R + '-OPS-230', 'origin/main'])
    }
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/web/OPS-1', R + '-OPS-1', 'origin/main'], { domains: ['web', 'api'] })
    no(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-1', R + '-OPS-1', 'origin/main'], { domains: ['web', 'api'] })
    ok(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-1', '/trees/acme-app-OPS-1', 'origin/main'], { worktreeRoot: '/trees' })
    no(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-1', R + '-OPS-1', 'origin/main'], { worktreeRoot: '/trees' })
  })
  test('claude plugin validate|test <absolute folder>', () => {
    ok(['claude', 'plugin', 'validate', '/Users/b/mods/x'])
    ok(['claude', 'plugin', 'test', '/Users/b/mods/x'])
  })
  test('GH-16, repo=here: the dirty-tree status and the current branch, with or without -C', () => {
    ok(['git', '-C', R, 'status', '--porcelain=v1', '--untracked-files=all', '-z'])
    ok(['git', 'status', '--porcelain=v1', '--untracked-files=all', '-z'])
    ok(['git', '-C', R, 'rev-parse', '--abbrev-ref', 'HEAD'])
    ok(['git', 'rev-parse', '--abbrev-ref', 'HEAD'])
    // nothing else new: a write is still refused
    no(['git', '-C', R, 'stash'])
    no(['git', '-C', R, 'status', '--porcelain', '--output=/tmp/x'])
  })
})

describe('allowlist refuses', () => {
  test('sf and git push (the spec pair)', () => {
    no(['sf', 'project', 'deploy', 'start'])
    no(['git', 'push'])
  })
  test('5A: the chassis scripts are gone from the list', () => {
    no(['bash', 'chassis/bin/dispatch-emit.sh', 'FE-1', 'standard', 'sonnet', 'build'])
    no(['bash', 'chassis/bin/dispatch-verify.sh', '--brief', '/b.md', '--repo', R])
    no(['bash', 'chassis/bin/which-model.sh', '--no-emit', 'X'])
    // a gate script the map does not name is refused like anything else
    no(['bash', 'scripts/ci/gates/prettier-changed.sh', '/s/files.txt'], {})
  })
  test('a gate argv that differs from its template in any word', () => {
    no(['npm', 'test', '--', '--watch'])
    no(['npm', 'ci'])
    no(['bash', 'scripts/ci/gates/prettier-changed.sh', 'files.txt'])
    no(['bash', 'scripts/ci/gates/prettier-changed.sh', '/r/../../etc/passwd'])
    no(['bash', 'scripts/ci/gates/prettier-changed.sh', '/r/x;rm'])
  })
  test('writes, network and anything off the list', () => {
    no(['curl', 'https://example.com'])
    no(['git', 'commit', '-m', 'x'])
    no(['git', 'reset', '--hard'])
    no(['git', 'checkout', 'main'])
    no(['git', '-C', R, 'push', 'origin', 'HEAD'])
    no(['gh', 'pr', 'merge', '12'])
    no(['gh', 'pr', 'create'])
    no(['gh', 'pr', 'view', '12', '--web'])
    no([])
  })
  test('git global options that could run anything', () => {
    no(['git', '-c', 'core.pager=sh', 'log'])
    no(['git', '--exec-path=/tmp', 'status'])
    no(['git', '-C', R, 'diff', '--output=/etc/x'])
    no(['git', 'diff', '--ext-diff'])
  })
  test('replay, worktree and fetch beyond the exact shapes', () => {
    no(['git', '-C', R, 'ls-tree', '--name-only', 'HEAD~3', 'agents/tasks/'])
    no(['git', '-C', R, 'show', '96014e3b:agents/tasks/../../.env'])
    no(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/ops/OPS-1-foo', R + '-OPS-1-foo', 'origin/main'])
    no(['git', '-C', R, 'worktree', 'remove', R + '-BE-101'])
    no(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', '/tmp/elsewhere', 'origin/main'])
    no(['git', '-C', R, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', R + '-BE-101', 'HEAD~3'])
    no(['git', '-C', R, 'fetch', 'upstream', 'main'])
  })
  test('claude beyond plugin validate|test <absolute folder>', () => {
    no(['claude', 'plugin', 'install', '/x'])
    no(['claude', 'plugin', 'validate', 'relative/x'])
    no(['claude', 'plugin', 'validate', '/x/../y'])
    no(['claude', '-p', 'hi'])
  })
  test('the refusal line names the argv', () => {
    expect(refusedLine(['git', 'push'], 'git push is not on the list')).toBe('chassis-delegation: refused argv ["git","push"] (git push is not on the list)')
  })
})

describe('what a gate map may hold', () => {
  test('commands by argv: no shell syntax, no deploy/network/privilege/git first word, no publish', () => {
    expect(checkGateCommand('bash scripts/ci/gates/prettier-changed.sh {files}').ok).toBe(true)
    expect(checkGateCommand('npm test && npm run lint').ok).toBe(true)
    expect(checkGateCommand('npm test; curl x').ok).toBe(false)
    expect(checkGateCommand('bash scripts/x.sh $(rm -rf /)').ok).toBe(false)
    expect(checkGateCommand('bash scripts/x.sh `id`').ok).toBe(false)
    expect(checkGateCommand('bash -c "npm test"').ok).toBe(false)
    expect(checkGateCommand('sf project deploy start').ok).toBe(false)
    expect(checkGateCommand('/usr/bin/curl x').ok).toBe(false)
    expect(checkGateCommand('git commit -m x').ok).toBe(false)
    expect(checkGateCommand('npm publish').ok).toBe(false)
    expect(checkGateCommand('rm -rf build').ok).toBe(false)
  })
  test('a refused map entry yields no template, so its argv is never allowed', () => {
    const t = gateTemplatesOf({ evil: 'curl x', good: 'npm test' })
    expect(t).toEqual([['npm', 'test']])
    no(['curl', 'x'], { gateTemplates: t })
  })
})

describe('GH-11: {worktree} in a gate-map command', () => {
  const WMAP = { validate: 'claude plugin validate {worktree}', both: 'bash scripts/x.sh {files} {worktree}' }
  const allow: AllowConfig = { gateTemplates: gateTemplatesOf(WMAP) }
  const allowed = (argv: readonly string[]) => checkArgv(argv, allow).ok
  test('claude plugin validate {worktree} resolves to the absolute worktree and the allowlist accepts it', () => {
    const g = resolveGateRuns('validate', WMAP, allowed, '/w/.delegation/T-1/files.txt', '/abs/worktree')
    expect(g.notRerun).toEqual([])
    expect(g.runs.map(r => r.argv)).toEqual([['claude', 'plugin', 'validate', '/abs/worktree']])
    ok(['claude', 'plugin', 'validate', '/abs/worktree'], allow)
  })
  test('{files} and {worktree} may share one command; a relative or .. path is refused', () => {
    const g = resolveGateRuns('both', WMAP, allowed, '/f/files.txt', '/abs/worktree')
    expect(g.runs[0]?.argv).toEqual(['bash', 'scripts/x.sh', '/f/files.txt', '/abs/worktree'])
    ok(['bash', 'scripts/x.sh', '/f/files.txt', '/abs/worktree'], allow)
    no(['bash', 'scripts/x.sh', '/f/files.txt', 'rel'], allow)
    no(['bash', 'scripts/x.sh', '/f/files.txt', '/a/../b'], allow)
    expect(fillFiles(['a', '{files}', '{worktree}'], '/f', '/w')).toEqual(['a', '/f', '/w'])
  })
  test('a word may carry {worktree} once', () => {
    expect(checkGateCommand('npm run x {worktree}{worktree}').ok).toBe(false)
  })
  test('claude plugin validate . is refused at config load, naming the absolute-folder rule', () => {
    const r = parseRepoConfig(JSON.stringify({ gateMap: { validate: 'claude plugin validate .', test: 'npm test', good: 'claude plugin validate {worktree}' } }))
    expect(r.config.gateMap).toEqual({ test: 'npm test', good: 'claude plugin validate {worktree}' })
    expect(r.errors).toEqual(['gateMap.validate: claude plugin validate . is not an absolute folder; write {worktree} (ignored)'])
    const s = settingsLayer({ gateMap: '{"validate":"claude plugin validate ."}' })
    expect(s.config.gateMap).toBeUndefined()
    expect(s.errors[0]).toContain('not an absolute folder')
  })
})

describe('MOD-3: the one merge form', () => {
  const PLUGIN = '/Users/b/.claude/dev-mods/s1/chassis-delegation'
  const A: AllowConfig = { ...ALLOW, pluginRoot: PLUGIN }
  test('git -C <loaded root> merge --ff-only origin/main is allowed', () => {
    ok(['git', '-C', PLUGIN, 'merge', '--ff-only', 'origin/main'], A)
    ok(['git', '-C', PLUGIN + '/', 'merge', '--ff-only', 'origin/main'], A)
  })
  test('merge on any other dir, without --ff-only, of any other ref, and pull stay refused', () => {
    no(['git', '-C', R, 'merge', '--ff-only', 'origin/main'], A)
    no(['git', '-C', PLUGIN + '-x', 'merge', '--ff-only', 'origin/main'], A)
    no(['git', 'merge', '--ff-only', 'origin/main'], A)
    no(['git', '-C', PLUGIN, 'merge', 'origin/main'], A)
    no(['git', '-C', PLUGIN, 'merge', '--ff-only', 'origin/develop'], A)
    no(['git', '-C', PLUGIN, 'merge', '--ff-only', 'main'], A)
    no(['git', '-C', PLUGIN, 'merge', '--ff-only', 'origin/main', '--no-verify'], A)
    no(['git', '-C', PLUGIN, 'pull', '--ff-only', 'origin', 'main'], A)
    no(['git', '-C', PLUGIN, 'pull'], A)
  })
  test('with no plugin root known, no merge is allowed', () => {
    no(['git', '-C', PLUGIN, 'merge', '--ff-only', 'origin/main'], ALLOW)
  })
})
