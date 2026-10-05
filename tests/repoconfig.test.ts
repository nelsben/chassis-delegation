import { test, expect, describe } from 'claude-code/testing'
import { DEFAULT_DOMAINS, DEFAULT_IGNORE, isGitRef, mergeConfig, parseRepoConfig, settingsLayer, REPO_CONFIG_FILE } from '../hooks/lib/repoconfig'

describe('5B: the repo file .chassis-delegation.json', () => {
  test('is named .chassis-delegation.json; _comment keys are ignored at every level', () => {
    expect(REPO_CONFIG_FILE).toBe('.chassis-delegation.json')
    const { config, errors } = parseRepoConfig(
      JSON.stringify({
        _comment: 'top',
        gateMap: { _comment: 'id → command', test: 'npm test', lint: 'npx eslint {files}' },
        tierMap: { _comment: 'x', economy: 'sonnet' },
        maxWorkers: 3,
        domains: ['web', 'api'],
        briefExtra: 'Run make setup first.',
        worktreeRoot: '/w',
        evalCommand: 'npm run eval',
        autoEval: true,
      }),
    )
    expect(errors).toEqual([])
    expect(config).toEqual({
      gateMap: { test: 'npm test', lint: 'npx eslint {files}' },
      tierMap: { economy: 'sonnet' },
      maxWorkers: 3,
      domains: ['web', 'api'],
      briefExtra: 'Run make setup first.',
      worktreeRoot: '/w',
      evalCommand: 'npm run eval',
      autoEval: true,
    })
  })
  test('bad values are named and dropped; the rest stands', () => {
    const { config, errors } = parseRepoConfig(
      JSON.stringify({ gateMap: { ok: 'npm test', bad: 3 }, maxWorkers: 0, tierMap: { economy: 'gpt' }, domains: 'web, Bad Domain', nope: 1, evalCommand: '' }),
    )
    expect(config).toEqual({ gateMap: { ok: 'npm test' }, domains: ['web'] })
    expect(errors).toEqual([
      'gateMap.bad: not a string (ignored)',
      'maxWorkers: needs a whole number of 1 or more (ignored)',
      'tierMap.economy: gpt is not haiku, sonnet, opus or fable (ignored)',
      'domains: "Bad Domain" is not a lowercase word (ignored)',
      'nope: unknown key (ignored)',
    ])
  })
  test('GH-12: cardDir is a relative folder, validated like worktreeRoot would be; default agents/tasks', () => {
    expect(parseRepoConfig(JSON.stringify({ cardDir: 'delegation/tasks/' })).config).toEqual({ cardDir: 'delegation/tasks' })
    for (const bad of ['../x', '/abs', 'a/../b', 3]) expect(parseRepoConfig(JSON.stringify({ cardDir: bad })).errors[0]).toContain('cardDir')
    expect(mergeConfig({}, {}).cardDir).toBe('agents/tasks')
    expect(mergeConfig({ cardDir: 'delegation/tasks' }, {}).cardDir).toBe('delegation/tasks')
  })
  test('not JSON, or not an object: nothing, and one error', () => {
    expect(parseRepoConfig('{ nope').config).toEqual({})
    expect(parseRepoConfig('{ nope').errors[0]).toContain('not valid JSON')
    expect(parseRepoConfig('[1]').errors).toEqual(['the file is not a JSON object'])
  })
})

describe('5B: precedence defaults < repo file < user settings', () => {
  test('the defaults alone', () => {
    const e = mergeConfig({}, {})
    expect(e.gateMap).toEqual({})
    expect(e.tierMap).toEqual({ economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' })
    expect(e.domains).toEqual([...DEFAULT_DOMAINS])
    expect(e.domains).toEqual(['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared'])
    expect(e.maxWorkers).toBe(2)
    expect(e.worktreeRoot).toBe('')
    expect(e.evalCommand).toBe('')
    expect(e.autoEval).toBe(false)
    // no repo's subagent types are built in (a domain falls to its own type when offered, else general-purpose)
    expect(e.agentTypes).toEqual({})
    expect(e.sources.maxWorkers).toBe('default')
  })
  test('the repo file beats the defaults; settings beat the repo file; maps merge per key', () => {
    const repo = parseRepoConfig(JSON.stringify({ gateMap: { test: 'npm test', lint: 'npm run lint' }, tierMap: { economy: 'sonnet' }, maxWorkers: 3, evalCommand: 'npm run eval' })).config
    const settings = settingsLayer({ gateMap: '{"lint":"pnpm lint"}', tierMap: '', maxWorkers: 4, evalCommand: '', domains: '', agentTypes: '', briefTemplate: '', briefExtra: '', worktreeRoot: '', evalLiveCommand: '', autoEval: false })
    const e = mergeConfig(repo, settings.config)
    expect(e.gateMap).toEqual({ test: 'npm test', lint: 'pnpm lint' })
    expect(e.tierMap.economy).toBe('sonnet')
    expect(e.tierMap.standard).toBe('sonnet')
    expect(e.maxWorkers).toBe(4)
    expect(e.evalCommand).toBe('npm run eval')
    expect(e.sources).toMatchObject({ gateMap: 'settings', maxWorkers: 'settings', evalCommand: 'repo', tierMap: 'repo', domains: 'default' })
  })
  test('settings: empty strings and 0 mean unset; JSON strings parse; autoEval true turns eval on', () => {
    const s = settingsLayer({ gateMap: 'nope', agentTypes: '{"web":"frontend"}', domains: 'web,api', maxWorkers: 0, autoEval: true, tierMap: '{"frontier":"fable"}' })
    expect(s.config).toEqual({ agentTypes: { web: 'frontend' }, domains: ['web', 'api'], autoEval: true, tierMap: { frontier: 'fable' } })
    expect(s.errors).toEqual(['gateMap (settings): not valid JSON (ignored)'])
    expect(mergeConfig({ autoEval: true }, {}).autoEval).toBe(true)
    // settings cannot turn a repo's autoEval off with the default false: false is "unset" there
    expect(mergeConfig({ autoEval: true }, settingsLayer({ autoEval: false }).config).autoEval).toBe(true)
  })
})

describe('GH-16: baseRef and ignore', () => {
  test('defaults: no baseRef (the origin/main → main → origin/master → master chain), ignore .delegation/**', () => {
    const e = mergeConfig({}, {})
    expect(e.baseRef).toBe('')
    expect(e.ignore).toEqual(['.delegation/**'])
    expect(DEFAULT_IGNORE).toEqual(['.delegation/**'])
    expect(e.sources).toMatchObject({ baseRef: 'default', ignore: 'default' })
  })
  test('the repo file names them; a bad value is named and dropped like any key', () => {
    const good = parseRepoConfig(JSON.stringify({ baseRef: ' main ', ignore: ['.delegation/**', 'traces/**', ' ', 'traces/**'] }))
    expect(good.errors).toEqual([])
    expect(good.config).toEqual({ baseRef: 'main', ignore: ['.delegation/**', 'traces/**'] })
    expect(mergeConfig(good.config, {})).toMatchObject({ baseRef: 'main', ignore: ['.delegation/**', 'traces/**'] })
    // an explicit empty list means nothing is ignored
    expect(mergeConfig(parseRepoConfig('{"ignore":[]}').config, {}).ignore).toEqual([])
    const bad = parseRepoConfig(JSON.stringify({ baseRef: '--output=/tmp/x', ignore: ['ok/**', 'a b', 3, 'x"y', 'z]]'] }))
    expect(bad.config).toEqual({ ignore: ['ok/**'] })
    expect(bad.errors).toEqual([
      'baseRef: "--output=/tmp/x" is not a git ref (ignored)',
      'ignore: "a b" is not a glob (no spaces, quotes or ]]) (ignored)',
      'ignore: 3 is not a glob (no spaces, quotes or ]]) (ignored)',
      'ignore: "x\\"y" is not a glob (no spaces, quotes or ]]) (ignored)',
      'ignore: "z]]" is not a glob (no spaces, quotes or ]]) (ignored)',
    ])
    expect(parseRepoConfig('{"baseRef":7,"ignore":{}}').errors).toEqual(['baseRef: not a string (ignored)', 'ignore: needs a list of globs (ignored)'])
  })
  test('/config: an empty string is unset; a comma string is the list; settings win over the repo file', () => {
    expect(settingsLayer({ baseRef: '', ignore: '' }).config).toEqual({})
    const s = settingsLayer({ baseRef: 'HEAD', ignore: '.delegation/**, out/**' })
    expect(s.config).toEqual({ baseRef: 'HEAD', ignore: ['.delegation/**', 'out/**'] })
    const e = mergeConfig(parseRepoConfig('{"baseRef":"main","ignore":["a/**"]}').config, s.config)
    expect(e).toMatchObject({ baseRef: 'HEAD', ignore: ['.delegation/**', 'out/**'] })
    expect(e.sources).toMatchObject({ baseRef: 'settings', ignore: 'settings' })
  })
  test('a git ref is one argv word: never an option, never a range', () => {
    for (const ok of ['main', 'origin/develop', 'HEAD', 'HEAD~2', 'v1.2.3', '96014e3b', 'release/2026-10']) expect(isGitRef(ok)).toBe(true)
    for (const no of ['', '-x', '--output=x', 'a..b', 'a b', 'a;b', '$(x)']) expect(isGitRef(no)).toBe(false)
  })
})
