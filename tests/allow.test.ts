import { test, expect, describe } from 'claude-code/testing'
import { checkArgv, checkGateCommand, isRemoteArgv, refusedLine, type AllowConfig } from '../hooks/lib/allow'
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
  test('MOD-4: the merged-card read: origin/main, and the configured cardDir only', () => {
    const cfg: AllowConfig = { ...ALLOW, cardDir: 'docs/cards' }
    ok(['git', '-C', R, 'ls-tree', '--name-only', 'origin/main', 'docs/cards/'], cfg)
    ok(['git', '-C', R, 'show', 'origin/main:docs/cards/MOD-4-owed-rows.md'], cfg)
    ok(['git', '-C', R, 'ls-tree', '--name-only', 'origin/main', 'agents/tasks/'])
    ok(['git', '-C', R, 'merge-base', '--is-ancestor', '96014e3b', 'origin/main'])
    no(['git', '-C', R, 'ls-tree', '--name-only', 'origin/main', 'docs/cards/'])
    no(['git', '-C', R, 'ls-tree', '--name-only', 'origin/main', 'src/'], cfg)
    no(['git', '-C', R, 'show', 'origin/main:docs/cards/../../.env'], cfg)
    no(['git', '-C', R, 'show', 'origin/main:docs/other/MOD-4-x.md'], cfg)
    no(['git', '-C', R, 'show', 'HEAD~1:docs/cards/MOD-4-x.md'], cfg)
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

describe('MOD-7: the two issue forms, for the configured issueRepo only', () => {
  const X = '/Users/b/acme-app'
  const A: AllowConfig = { ...ALLOW, issueRepo: 'owner/mod', root: X }
  const BODY = `${X}/.delegation/debriefs/2026-10-10-mod-run.post-1.md`
  test('create and comment pass with the configured repo and a body file under .delegation/debriefs/', () => {
    ok(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'A title', '--body-file', BODY], A)
    ok(['gh', 'issue', 'comment', '9', '--repo', 'owner/mod', '--body-file', BODY], A)
    ok(['gh', 'issue', 'list', '--repo', 'owner/mod', '--state', 'all', '--limit', '200', '--json', 'number,title,body'], A)
  })
  test('refused: another repo, an unset issueRepo, inline --body, a body file elsewhere or climbing out', () => {
    no(['gh', 'issue', 'create', '--repo', 'other/mod', '--title', 'T', '--body-file', BODY], A)
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', BODY], { ...ALLOW, root: X })
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body', 'inline'], A)
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', `${X}/README.md`], A)
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', '/etc/passwd'], A)
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', `${X}/.delegation/debriefs/../../.env`], A)
    no(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', `/other/.delegation/debriefs/x.md`], A)
    no(['gh', 'issue', 'comment', '9', '--repo', 'other/mod', '--body-file', BODY], A)
    no(['gh', 'issue', 'comment', 'x', '--repo', 'owner/mod', '--body-file', BODY], A)
    no(['gh', 'issue', 'comment', '9', '--repo', 'owner/mod', '--body', 'hi'], A)
    no(['gh', 'issue', 'list', '--repo', 'other/mod', '--state', 'all', '--limit', '200', '--json', 'number,title,body'], A)
  })
  test('refused: edit, close, delete, reopen, and gh pr create, even with the repo set', () => {
    no(['gh', 'issue', 'edit', '9', '--repo', 'owner/mod', '--body-file', BODY], A)
    no(['gh', 'issue', 'close', '9', '--repo', 'owner/mod'], A)
    no(['gh', 'issue', 'delete', '9', '--repo', 'owner/mod'], A)
    no(['gh', 'issue', 'reopen', '9', '--repo', 'owner/mod'], A)
    no(['gh', 'pr', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', BODY], A)
  })
})

describe('MOD-192: gh issue create (land) and gh project item-add', () => {
  const X = '/Users/b/acme-app'
  const A: AllowConfig = { ...ALLOW, issueRepo: 'owner/mod', root: X, landRepo: 'o/r', project: { owner: 'o', number: 1 } }
  const F = `${X}/.delegation/landed/export-drops-a-row.md`
  const create = (over: Partial<Record<string, string | string[]>> = {}) => {
    const v = { repo: 'o/r', title: 'Export drops a row', label: 'type:bug', file: F, ...over }
    return ['gh', 'issue', 'create', '--repo', v.repo as string, '--title', v.title as string, '--label', v.label as string, ...((over.parent as string[] | undefined) ?? []), '--body-file', v.file as string]
  }
  const add = (num = '1', owner = 'o', url = 'https://github.com/o/r/issues/42') => ['gh', 'project', 'item-add', num, '--owner', owner, '--url', url]
  test('the land create shape passes, with and without --parent, for every known type', () => {
    ok(create(), A)
    ok(create({ parent: ['--parent', '9'] }), A)
    for (const t of ['feature', 'epic', 'story', 'task', 'bug', 'spike']) ok(create({ label: `type:${t}` }), A)
  })
  test('the item-add shape passes for the configured owner and number', () => {
    ok(add(), A)
  })
  test('the MOD-7 debrief shapes still pass beside them', () => {
    ok(['gh', 'issue', 'create', '--repo', 'owner/mod', '--title', 'T', '--body-file', `${X}/.delegation/debriefs/a.md`], A)
  })
  test('near-misses of create are refused', () => {
    no(create({ repo: 'other/r' }), A)
    no(create({ label: 'type:chore' }), A)
    no(create({ label: 'bug' }), A)
    no(create({ file: `${X}/README.md` }), A)
    no(create({ file: `${X}/.delegation/landed/../x.md` }), A)
    no(create({ file: `${X}/.delegation/landed/a.txt` }), A)
    no(create({ file: `/other/.delegation/landed/a.md` }), A)
    no(create({ title: '' }), A)
    no(create({ title: '--web' }), A)
    no(create({ parent: ['--parent', 'x'] }), A)
    no(create({ parent: ['--parent', '1234567890'] }), A)
    no([...create(), '--assignee', 'me'], A)
    no([...create(), '--web'], A)
    no(['gh', 'issue', 'create', '--repo', 'o/r', '--label', 'type:bug', '--title', 'T', '--body-file', F], A)
  })
  test('without landRepo the land create shape is refused; without a project item-add is', () => {
    no(create(), { ...A, landRepo: undefined })
    no(add(), { ...A, project: undefined })
  })
  test('near-misses of item-add are refused', () => {
    no(add('2'), A)
    no(add('1', 'x'), A)
    no(add('1', 'o', 'https://github.com/other/r/issues/42'), A)
    no(add('1', 'o', 'https://github.com/o/r/issues/x'), A)
    no(add('1', 'o', 'https://github.com/o/r/pull/42'), A)
    no([...add(), '--format', 'json'], A)
    no(['gh', 'project', 'item-delete', '1', '--owner', 'o'], A)
    no(['gh', 'project', 'list', '--owner', 'o'], A)
  })
  test('a create that matches neither shape names both', () => {
    const c = checkArgv(create({ repo: 'other/r' }), A)
    expect(c.ok).toBe(false)
    const reason = c.ok ? '' : c.reason
    expect(reason).toContain('.delegation/debriefs/')
    expect(reason).toContain('.delegation/landed/')
  })
})

describe('MOD-44: git -C <another repo> worktree add, for a task that names that repo only', () => {
  const X = '/Users/b/acme-app'
  const OTHER = '/Users/b/other'
  const add = (dir: string, id: string, branchDomain = 'ops', path = `${dir}-${id}`) => ['git', '-C', dir, 'worktree', 'add', '-q', '-b', `agent/${branchDomain}/${id}`, path, 'origin/main']
  const A: AllowConfig = { ...ALLOW, root: X, taskRepos: { 'T-1': { path: OTHER } } }
  test('the task that names /other may cut its worktree from /other, beside it', () => {
    ok(add(OTHER, 'T-1'), A)
    ok(add(`${OTHER}/`, 'T-1', 'ops', `${OTHER}-T-1`), A)
    ok(['git', '-C', OTHER, 'worktree', 'add', '-q', '-b', 'agent/ops/T-1', `${OTHER}-T-1`, 'a1b2c3d4'], A)
  })
  test('another task, another folder, another path or branch shape is refused', () => {
    no(add(OTHER, 'T-2'), A)
    no(add('/Users/b/elsewhere', 'T-1'), A)
    no(add(OTHER, 'T-1', 'ops', '/Users/b/elsewhere-T-1'), A)
    no(add(OTHER, 'T-1', 'ops', `${OTHER}-T-1/inner`), A)
    no(add(OTHER, 'T-1', 'nodomain'), A)
    no(add(OTHER, 'T-1'), { ...ALLOW, root: X })
  })
  test('the session own repo still takes its tasks, and the folder it names is the only other one', () => {
    ok(add(X, 'T-2'), A)
    ok(add(X, 'T-1'), { ...ALLOW, root: X })
    no(add(X, 'T-1', 'ops', `${OTHER}-T-1`), A)
  })
  test('the repo own domains, from its config, name the branch', () => {
    const B: AllowConfig = { ...ALLOW, root: X, taskRepos: { 'T-1': { path: OTHER, domains: ['web'] } } }
    ok(add(OTHER, 'T-1', 'web'), B)
    no(add(OTHER, 'T-1', 'ops'), B)
  })
  test('the reads and the fetch stay as they were for any folder', () => {
    ok(['git', '-C', OTHER, 'fetch', '-q', 'origin', 'main'], A)
    ok(['git', '-C', `${OTHER}-T-1`, 'diff', '--name-status', '-M', 'abc', 'def'], A)
    ok(['git', '-C', `${OTHER}-T-1`, 'merge-base', 'origin/main', 'abc'], A)
    ok(['git', '-C', `${OTHER}-T-1`, 'status', '--porcelain'], A)
    ok(['git', '-C', OTHER, 'log', '-1', '--format=%H'], A)
    no(['git', '-C', OTHER, 'push', 'origin', 'main'], A)
    no(['git', '-C', OTHER, 'commit', '-m', 'x'], A)
  })
})

describe('MOD-72: the verdict tool\'s wait', () => {
  test('sleep takes exactly one whole number of seconds, 1 to 600', () => {
    ok(['sleep', '5'])
    ok(['sleep', '600'])
    no(['sleep', '5', 'x'])
    no(['sleep', '-1'])
    no(['sleep', '1.5'])
    no(['sleep'])
    no(['sleep', '0'])
    no(['sleep', '601'])
  })
})

describe('MOD-86: git check-ignore, the one read shape', () => {
  test('-C <dir> check-ignore -q -- <one path> passes, with or without the merge context', () => {
    ok(['git', '-C', R, 'check-ignore', '-q', '--', 'docs/cards/MOD-1-a-thing.md'])
    ok(['git', '-C', `${R}-MOD-1`, 'check-ignore', '-q', '--', 'agents/tasks'])
    ok(['git', '-C', R, 'check-ignore', '-q', '--', 'docs/cards/MOD-1-a-thing.md'], { ...ALLOW, merge: { root: R, worktree: `${R}-MOD-1`, branch: 'agent/mod/MOD-1', baseRef: 'origin/main', id: 'MOD-1' } })
  })
  test('any other option, a second path, no path or no -- is refused', () => {
    no(['git', '-C', R, 'check-ignore', '-q', '--', 'a', 'b'])
    no(['git', '-C', R, 'check-ignore', '-q', '--', 'a', '-v'])
    no(['git', '-C', R, 'check-ignore', '-v', '-q', '--', 'a'])
    no(['git', '-C', R, 'check-ignore', '--stdin'])
    no(['git', '-C', R, 'check-ignore', '-q', '--no-index', '--', 'a'])
    no(['git', '-C', R, 'check-ignore', '-q', '--'])
    no(['git', '-C', R, 'check-ignore', '-q', 'a'])
    no(['git', '-C', R, 'check-ignore', '--', 'a'])
    no(['git', '-C', R, 'check-ignore', '-q', '--', '-v'])
    no(['git', 'check-ignore', '-q', '--', 'a'])
  })
})

describe('MOD-200: gh issue comment and close on the landRepo', () => {
  const X = '/Users/b/acme-app'
  const A: AllowConfig = { ...ALLOW, issueRepo: 'owner/mod', root: X, landRepo: 'o/r' }
  const F = `${X}/.delegation/status/MOD-1-attempt-1-started.md`
  const comment = (over: Partial<Record<string, string>> = {}) => {
    const v = { n: '12', repo: 'o/r', file: F, ...over }
    return ['gh', 'issue', 'comment', v.n as string, '--repo', v.repo as string, '--body-file', v.file as string]
  }
  const close = (over: Partial<Record<string, string>> = {}) => {
    const v = { n: '12', repo: 'o/r', text: 'merged in #5', ...over }
    return ['gh', 'issue', 'close', v.n as string, '--repo', v.repo as string, '--comment', v.text as string]
  }
  test('both exact shapes pass', () => {
    ok(comment(), A)
    ok(close(), A)
    ok(close({ text: 'all 3 tasks done' }), A)
  })
  test('the MOD-7 debrief comment still passes', () => {
    ok(['gh', 'issue', 'comment', '3', '--repo', 'owner/mod', '--body-file', `${X}/.delegation/debriefs/a.md`], A)
  })
  test('comment refusals', () => {
    no(comment({ repo: 'other/r' }), A)
    no([...comment(), '--web'], A)
    no(comment({ file: `${X}/.delegation/debriefs/a.md` }), A)
    no(comment({ file: `${X}/.delegation/status/../x.md` }), A)
    no(comment({ file: `/other/.delegation/status/a.md` }), A)
    no(comment({ n: 'x' }), A)
    no(comment(), { ...A, landRepo: undefined })
  })
  test('close refusals', () => {
    no(close({ repo: 'other/r' }), A)
    no([...close(), '--reason', 'completed'], A)
    no(close({ text: '--web' }), A)
    no(close({ n: '1234567890' }), A)
    no(['gh', 'issue', 'close', '12', '--repo', 'o/r'], A)
    no(close(), { ...A, landRepo: undefined })
    no(['gh', 'issue', 'edit', '12', '--repo', 'o/r', '--add-label', 'x'], A)
  })
  test('both pass while merge runs, and nothing else of gh does', () => {
    const WT = `${X}-MOD-1`
    const MERGE: AllowConfig = { ...A, merge: { root: X, worktree: WT, branch: 'agent/mod/MOD-1', baseRef: 'origin/main', id: 'MOD-1' } }
    ok(close(), MERGE)
    ok(comment(), MERGE)
    no(close({ repo: 'o/other' }), MERGE)
    no(close(), { ...MERGE, landRepo: undefined })
    no([...close(), '--reason', 'x'], MERGE)
    no(['gh', 'pr', 'merge', '3'], MERGE)
    expect(isRemoteArgv(['gh', 'issue', 'edit', '1'])).toBe(true)
  })
})

describe('MOD-197: the merge allowlist passes the MOD-194 issue view', () => {
  const WT = `${R}-MOD-1`
  const MERGE: AllowConfig = { ...ALLOW, root: R, landRepo: 'o/r', merge: { root: R, worktree: WT, branch: 'agent/mod/MOD-1', baseRef: 'origin/main', id: 'MOD-1' } }
  test('the exact view passes while merge runs; other gh does not', () => {
    ok(['gh', 'issue', 'view', '12', '--repo', 'o/r', '--json', 'number,title,state,labels,body,subIssues'], MERGE)
    no(['gh', 'issue', 'close', '12', '--repo', 'o/r'], MERGE)
    no(['gh', 'issue', 'view', '12', '--repo', 'o/other', '--json', 'number,title,state,labels,body,subIssues'], MERGE)
    no(['gh', 'issue', 'view', '12', '--repo', 'o/r', '--json', 'number,title,state,labels,body,subIssues'], { ...MERGE, landRepo: undefined })
  })
})

describe('MOD-75: the merge shapes, on only while /delegation merge runs', () => {
  const WT = `${R}-MOD-1`
  const BRANCH = 'agent/mod/MOD-1'
  const CARD = 'docs/cards/MOD-1-a-thing.md'
  const MERGE: AllowConfig = { ...ALLOW, cardDir: 'docs/cards', root: R, merge: { root: R, worktree: WT, branch: BRANCH, baseRef: 'origin/main', cardRel: CARD, id: 'MOD-1' } }
  const SHAPES = [
    ['git', '-C', WT, 'fetch', 'origin'],
    ['git', '-C', WT, 'rebase', 'origin/main'],
    ['git', '-C', WT, 'rebase', '--abort'],
    ['git', '-C', WT, 'add', '--', CARD],
    ['git', '-C', WT, 'commit', '-q', '-m', 'cards: MOD-1 merged'],
    ['git', '-C', WT, 'commit', '-q', '-m', 'cards: MOD-1 merged', '-m', 'Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>'],
    ['git', '-C', R, 'fetch', 'origin'],
    ['git', '-C', R, 'remote', 'get-url', 'origin'],
    ['git', '-C', R, 'clean', '-q', '-f', '--', CARD],
    ['git', '-C', R, 'pull', '--ff-only'],
    ['git', '-C', R, 'worktree', 'remove', WT],
    ['git', '-C', R, 'branch', '-D', BRANCH],
  ]
  test('with the merge context, the exact local shapes pass, bound to the one task', () => {
    for (const argv of SHAPES) ok(argv, MERGE)
  })
  test('without it, every one of those shapes is refused (the narrow case: the allowlist outside a merge is unchanged)', () => {
    for (const argv of SHAPES) no(argv)
    for (const argv of SHAPES) no(argv, { ...MERGE, merge: undefined })
  })
  test('with the merge context, a push, gh, curl, sf, wget, another worktree, branch, file or message, add -A, reset --hard and worktree remove --force are refused', () => {
    for (const argv of [
      ['git', '-C', WT, 'push', '-u', 'origin', BRANCH],
      ['git', '-C', R, 'push', 'origin', '--delete', BRANCH],
      ['gh', 'pr', 'create', '--repo', 'acme/acme-app'],
      ['gh', 'pr', 'merge', BRANCH, '--rebase'],
      ['gh', 'pr', 'list'],
      ['curl', 'https://example.com'],
      ['sf', 'project', 'deploy'],
      ['wget', 'https://example.com'],
      ['git', '-C', `${R}-MOD-2`, 'rebase', 'origin/main'],
      ['git', '-C', R, 'branch', '-D', 'agent/mod/MOD-2'],
      ['git', '-C', R, 'clean', '-q', '-f', '--', 'README.md'],
      ['git', '-C', R, 'clean', '-fdx'],
      ['git', '-C', WT, 'add', '-A'],
      ['git', '-C', WT, 'commit', '-q', '-m', 'anything else'],
      ['git', '-C', WT, 'commit', '-q', '-m', 'cards: MOD-2 merged'],
      ['git', '-C', WT, 'reset', '--hard', 'origin/main'],
      ['git', '-C', R, 'worktree', 'remove', '--force', WT],
      ['git', '-C', WT, 'rebase', 'origin/other'],
    ])
      no(argv, MERGE)
  })
  test('the remote refusal comes first while merging: gh pr list, fine outside a merge, is refused inside one', () => {
    ok(['gh', 'pr', 'list'])
    expect(checkArgv(['gh', 'pr', 'list'], MERGE)).toEqual({ ok: false, reason: 'the merge command never pushes, nor runs gh, curl, sf or wget' })
  })
  test('the rest of the allowlist still answers while merging', () => {
    ok(['git', '-C', R, 'status', '--porcelain'], MERGE)
    ok(['git', '-C', R, 'worktree', 'list', '--porcelain'], MERGE)
  })
})

describe('MOD-152 (#246): git worktree lock / unlock, the two exact shapes', () => {
  const X = '/Users/b/acme-app'
  const OTHER = '/Users/b/other'
  const REASON = 'chassis-delegation: verifier running; land after the verdict'
  const lock = (dir: string, path: string, reason = REASON) => ['git', '-C', dir, 'worktree', 'lock', '--reason', reason, path]
  const unlock = (dir: string, path: string) => ['git', '-C', dir, 'worktree', 'unlock', path]
  const A: AllowConfig = { ...ALLOW, root: X, taskRepos: { 'T-1': { path: OTHER } } }
  test('the exact shapes pass for the session repo, a replay, and a worktreeRoot', () => {
    ok(lock(X, `${X}-T-1`), A)
    ok(unlock(X, `${X}-T-1`), A)
    ok(lock(`${X}/`, `${X}-T-2`), A)
    ok(lock(X, `${X}-T-2-replay`), A)
    ok(unlock(X, `/wt/acme-app-T-2`), { ...A, worktreeRoot: '/wt' })
  })
  test('a task that names another repo may lock and unlock in that repo only', () => {
    ok(lock(OTHER, `${OTHER}-T-1`), A)
    ok(unlock(OTHER, `${OTHER}-T-1`), A)
    no(lock(OTHER, `${OTHER}-T-2`), A)
    no(unlock(OTHER, `${OTHER}-T-1-replay`), A)
    no(lock('/Users/b/elsewhere', '/Users/b/elsewhere-T-1'), A)
  })
  test('a wrong path is refused with a reason that names it', () => {
    for (const p of [X, `${X}-T-1/inner`, `${X}/../x-T-1`, '/Users/b/other-T-9', `${X}-notanid`]) no(unlock(X, p), A)
    const c = checkArgv(lock(X, '/etc/passwd'), A)
    expect(c.ok).toBe(false)
    expect(c.ok ? '' : c.reason).toContain('/etc/passwd')
    no(lock(X, `${OTHER}-T-1`), A)
  })
  test('a wrong reason, --force, extra words or no -C are refused', () => {
    const c = checkArgv(lock(X, `${X}-T-1`, 'because'), A)
    expect(c.ok).toBe(false)
    expect(c.ok ? '' : c.reason).toContain('because')
    no(['git', '-C', X, 'worktree', 'lock', `${X}-T-1`], A)
    no(['git', '-C', X, 'worktree', 'lock', '--force', '--reason', REASON, `${X}-T-1`], A)
    no(['git', '-C', X, 'worktree', 'lock', '--reason', REASON, `${X}-T-1`, 'x'], A)
    no(['git', '-C', X, 'worktree', 'unlock', '--force', `${X}-T-1`], A)
    no(['git', '-C', X, 'worktree', 'unlock', `${X}-T-1`, `${X}-T-2`], A)
    no(['git', 'worktree', 'lock', '--reason', REASON, `${X}-T-1`], A)
    no(['git', 'worktree', 'unlock', `${X}-T-1`], A)
    no(['git', '-C', X, '-C', X, 'worktree', 'unlock', `${X}-T-1`], A)
    no(['git', '-C', X, 'worktree', 'remove', '--force', `${X}-T-1`], A)
  })
  test('the merge context passes the unlock of its one worktree, no other', () => {
    const merge = { root: X, worktree: `${X}-T-1`, branch: 'agent/ops/T-1', baseRef: 'origin/main', id: 'T-1' }
    ok(unlock(X, `${X}-T-1`), { ...ALLOW, merge })
    no(unlock(X, '/etc/elsewhere'), { ...ALLOW, merge })
    no(unlock(`${X}-T-1`, `${X}-T-1`), { ...ALLOW, merge })
  })
})

describe('MOD-194: gh issue view', () => {
  const A: AllowConfig = { ...ALLOW, issueRepo: 'owner/mod', root: '/Users/b/acme-app', landRepo: 'o/r' }
  const view = (over: Partial<{ n: string; repo: string; json: string }> = {}) => ['gh', 'issue', 'view', over.n ?? '50', '--repo', over.repo ?? 'o/r', '--json', over.json ?? 'number,title,state,labels,body,subIssues']
  test('the view shape passes', () => {
    ok(view(), A)
    ok(view({ n: '123456789' }), A)
  })
  test('near-misses are refused', () => {
    no(view({ json: 'number,title,state,labels,body' }), A)
    no(view({ json: 'number,title,state,labels,body,subIssues,comments' }), A)
    no(view({ repo: 'other/r' }), A)
    no(view({ n: 'x' }), A)
    no(view({ n: '1234567890' }), A)
    no([...view(), '--web'], A)
    no([...view(), '--comments'], A)
    no(['gh', 'issue', 'view', '50', '--repo', 'o/r', '--web'], A)
    no(view(), { ...A, landRepo: undefined })
  })
})
