import { test, expect, describe } from 'claude-code/testing'
import type { TestBody } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, agentResult, sessionStart, commandInput, DEBRIEF_TEMPLATE, composeInput, brainSpawn, spawnCallOf, workerCall, stepInput, paneProps, STEPPED_PAST, ROOT, SCRATCH, NOW, HOME, type RunAnswer, type SpawnCall } from './harness'
import { FIXTURE_CARD, FIXTURE_CARD_NAME, FIXTURE_HEADER as PLAIN_HEADER } from './fixtures/sample-card'
import { MOD_VERSION } from '../hooks/lib/version'
import { DEFAULT_DEBRIEF_COOLDOWN_HOURS } from '../hooks/lib/cleanstop'
import { MAP_CAPS, addBounded, setBounded } from '../hooks/lib/cut'
// GH-106: /dispatch writes the tier's ceiling (frontier: $15) into the header
const FIXTURE_HEADER = PLAIN_HEADER.replace(' budget=', ' spend=25 budget=')

// MOD-117: a local card's records sit under its repo's key
const records = (w: { store: Map<string, unknown> }, task: string) => (w.store.get(`delegation.tasks.${task.includes('@') ? task : `${task}@${ROOT}`}`) ?? []) as Record<string, unknown>[]
const argvs = (w: { runs: { argv: string[] }[] }) => w.runs.map(r => r.argv)
// What reached the brain or Ben for a background verdict: the appended row, or
// (the kit cannot answer a plugin's own session.append) the transcript log line.
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const resultText = (r: { result?: unknown; text?: string }) => (typeof r.result === 'string' ? r.result : r.text ?? '')
const fullSha = (sha: string) => sha.padEnd(40, '0')
const MB = 'b'.repeat(40)
/** The first git read of a native verify (5A): the report's sha resolved. */
const isVerifyStart = (argv: readonly string[]) => argv[0] === 'git' && (argv[argv.length - 1] ?? '').endsWith('^{commit}')
/**
 * A worker repo answered from memory for the native verifier (5A): the branch and
 * the sha exist, HEAD is the sha last asked about, the tree is clean, the delta is
 * a/x.ts, and the gate (npx …) is red unless `gate` says otherwise.
 */
const nativeRun = (o: { gate?: number; delta?: string } = {}) => {
  let head = ''
  return (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) {
      head = fullSha(last.slice(0, -'^{commit}'.length))
      return { exitCode: 0, stdout: `${head}\n` }
    }
    if (sub[0] === 'rev-parse' && sub[1] === '--verify') return { exitCode: 0, stdout: `${last === 'origin/main' ? MB : head}\n` }
    if (sub[0] === 'rev-parse' && last === 'HEAD' && sub[1] !== '--abbrev-ref') return { exitCode: 0, stdout: `${head}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'diff') return { exitCode: 0, stdout: o.delta ?? 'A\ta/x.ts\n' }
    return undefined
  }
}

describe('GH-6: an inline [[brief]] header and no brief file', () => {
  const INLINE = '[[brief v=1 task=FE-232 subtask=e2e purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const BODY = 'Write the e2e test for the checkout flow.\nCommit and hold.'
  const PROMPT = `${INLINE}\n\n${BODY}`
  const WRITTEN = `${ROOT}/.delegation/briefs/FE-232.e2e.brief.md`
  // the issue's sha: a real short sha padded out to 40 hex with invented digits
  const PADDED = '1234abcd' + 'e'.repeat(32)
  const REPORT = (sha: string) => `[[report v=1 task=FE-232 subtask=e2e branch=agent/frontend/FE-232 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  /** A green worker repo where the sha resolves but is not an ancestor of the branch. */
  const offBranch = () => {
    const run = nativeRun({ gate: 0 })
    return (argv: string[]): RunAnswer | undefined => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : run(argv))
  }

  test('a complete inline header is written to the brief folder and the hand-back is verified: a sha not on the branch is refuted', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6', run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.files.get(WRITTEN)).toBe(`${INLINE}\n\n${BODY}\n`)
    expect(records(w, 'FE-232')[0]).toMatchObject({ subtask: 'e2e', briefPath: WRITTEN, tier: 'standard', source: 'brief' })
    expect(w.store.get('delegation.spawn.toolu_01ABCDEFGH')).toMatchObject({ briefPath: WRITTEN })
    await $.turn.complete(turnInput('agent-6', 'Done.\n' + REPORT(PADDED)))
    const row = delivered(w)
    expect(row).not.toContain('no brief file named')
    expect(row).toContain('chassis-delegation: verdict=refuted task=FE-232/e2e attempt=1/3')
    expect(row).toContain(`claim sha: failed — sha ${PADDED} exists but is NOT reachable on agent/frontend/FE-232`)
    expect(records(w, 'FE-232')[0]).toMatchObject({ verdict: 'refuted', reportGate: 'pass' })
  })

  test('a brief file already at that path is reused, never overwritten, and its amend blocks count', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const AMEND = '[[amend v=1 scope+=c/y.ts reason=the fixture lives in c]]'
    const held = `${INLINE}\n\nan earlier attempt's body\n${AMEND}\n`
    const w = world(on, { agentId: 'agent-6', files: { [WRITTEN]: held }, run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.files.get(WRITTEN)).toBe(held)
    await $.turn.complete(turnInput('agent-6', REPORT(PADDED)))
    expect(w.files.get(WRITTEN)).toBe(held)
    expect(delivered(w)).toContain('amendment: #1 scope+=c/y.ts — reason: the fixture lives in c')
    expect(delivered(w)).toContain('chassis-delegation: verdict=refuted task=FE-232/e2e')
  })

  test('a named brief file still wins over the inline header: nothing is written', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const named = `${SCRATCH}/briefs/FE-232.brief.md`
    const w = world(on, { agentId: 'agent-6', files: { [named]: INLINE + '\nbody' }, run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: `${INLINE}\nYour brief is the file ${named}.` }))
    expect(w.files.has(WRITTEN)).toBe(false)
    expect(records(w, 'FE-232')[0]).toMatchObject({ briefPath: named })
  })

  test('an incomplete inline header writes nothing; the unverified line names the missing field', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6', run: offBranch() })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-233 subtask=main tier=standard scope=a/**]]\nDo it.' }))
    expect([...w.files.keys()].some(p => p.endsWith('.brief.md'))).toBe(false)
    await $.turn.complete(turnInput('agent-6', REPORT(PADDED).replace(/FE-232/g, 'FE-233').replace('subtask=e2e', 'subtask=main')))
    expect(delivered(w)).toContain('chassis-delegation: verdict=unverified task=FE-233')
    expect(delivered(w)).toContain('note: no brief file named in the prompt; the inline header lacks gate= (or repo=none); verify skipped')
    expect(w.runs.some(r => r.argv[0] === 'git' && !['ls-tree'].includes(r.argv[3] ?? ''))).toBe(false) // MOD-60: the merged check lists origin/main's cards
  })

  test('scope and gate both missing are both named; repo=none stands in for a gate', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { agentId: 'agent-6' })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-234 subtask=main tier=standard]]\nDo it.' }))
    await $.turn.complete(turnInput('agent-6', '[[report v=1 task=FE-234 subtask=main branch=x pr=none sha=1234abcd gate=pass files=a/x.ts]]'))
    expect(delivered(w)).toContain('note: no brief file named in the prompt; the inline header lacks scope= (or scope_globs=) and gate= (or repo=none); verify skipped')
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=FE-235 subtask=docs tier=standard scope_globs=/notes/** repo=none]]\nWrite the notes.', tool_use_id: 'toolu_02ABCDEFGH' }))
    expect(w.files.get(`${ROOT}/.delegation/briefs/FE-235.docs.brief.md`)).toBe('[[brief v=1 task=FE-235 subtask=docs tier=standard scope_globs=/notes/** repo=none]]\n\nWrite the notes.\n')
  })

  test('a header without task= runs ad hoc; its line names task= instead of "no brief header"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const prompt = '[[brief v=1 tier=economy scope=a/** gate=node]]\nLook around.'
    const w = world(on, { agentId: 'agent-7' })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Done.\n[[report v=1 branch=x pr=none sha=1234abcd gate=pass files=a/x.ts]]', 'agent-7'))
    await $.agent.spawn(spawnInput({ prompt }))
    const r = await $.tool.call({ tool: 'Agent', description: 'look', prompt })
    expect((r.context ?? []).join('\n')).toContain('note: no brief file named in the prompt; the inline header lacks task=; verify skipped')
    expect([...w.files.keys()].some(p => p.endsWith('.brief.md'))).toBe(false)
  })
})

describe('5D: the git guard on Bash', () => {
  const branchIs = (branch: string) => (argv: string[]) => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: `${branch}\n` } : undefined)
  const bash = (command: string) => ({ tool: 'Bash', command }) as never
  // the engine takes a tool.call hook's answer as { result } (the Bash record) or { deny }
  const ran = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never

  test('a commit on main is denied; on agent/ops/X it runs', async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git add -A && git commit -m "x"'))
    expect(r.deny).toBe('chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)')
    expect(w.runs.map(x => x.argv)).toEqual([['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD']])
  })

  test('on an agent branch the commit passes through', async ($, on) => {
    world(on, { run: branchIs('agent/ops/X') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git commit -m "x"'))
    expect(r.deny).toBeUndefined()
  })

  test('a push naming main is denied from any branch, without asking git', async ($, on) => {
    const w = world(on, { run: branchIs('agent/ops/X') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git push origin main'))
    expect(r.deny).toBe('chassis-delegation: no push on main; branch first (git checkout -b agent/<domain>/<id>)')
    expect(w.runs).toEqual([])
  })

  test('the words inside a heredoc body never trigger it', async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash("cat > notes.md <<'EOF'\nthen git commit -m x and git push origin main\nEOF"))
    expect(r.deny).toBeUndefined()
    expect(w.runs).toEqual([])
  })

  test('gitGuard off: nothing is checked', { options: { gitGuard: false } }, async ($, on) => {
    const w = world(on, { run: branchIs('main') })
    on('tool.call', { tool: 'Bash' }, ran)
    const r = await $.tool.call(bash('git commit -m x'))
    expect(r.deny).toBeUndefined()
    expect(w.runs).toEqual([])
  })
})

describe('5B: /delegation init and the init tool', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never

  test('init writes the four files and says so; a second init overwrites nothing', async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/.gitignore`]: 'node_modules/\n' } })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('delegation')
    expect(w.tools).toContain('init')
    const out = await $.command.run(delegation('init'))
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/README.md`)
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/OPS-000-sample.md`)
    expect(out.text).toContain(`wrote ${ROOT}/.chassis-delegation.json`)
    expect(w.files.get(`${ROOT}/.gitignore`)).toBe('node_modules/\n.delegation/\n')
    expect(w.files.get(`${ROOT}/agents/tasks/OPS-000-sample.md`)).toContain('status: template')
    w.files.set(`${ROOT}/agents/tasks/README.md`, 'mine')
    const again = await $.tool.call({ tool: 'mcp__chassis-delegation__init' } as never)
    expect(resultText(again)).toContain(`left ${ROOT}/agents/tasks/README.md (exists; never overwritten)`)
    expect(w.files.get(`${ROOT}/agents/tasks/README.md`)).toBe('mine')
    expect(w.files.get(`${ROOT}/.gitignore`)).toBe('node_modules/\n.delegation/\n')
  })

  const localCardsLine = (ignored: boolean): TestBody => async ($, on) => {
    const LINE = 'cards: agents/tasks is git-ignored, so cards stay local; /delegation merge marks them merged in place'
    const ignoredWhen = (ignored: boolean) => (argv: string[]): RunAnswer | undefined => {
      if (argv[3] === 'check-ignore') return { exitCode: ignored ? 0 : 1, stdout: '' }
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      return { exitCode: 0, stdout: '' }
    }
    const files = { [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' }
    const w = world(on, { run: ignoredWhen(ignored), files, dirs: { [ROOT]: ['package.json'] } })
    await $.session.start(sessionStart)
    const init = String((await $.command.run(delegation('init'))).text)
    const setup = String((await $.command.run(delegation('setup'))).text)
    expect(init.includes(LINE)).toBe(ignored)
    expect(setup.includes(LINE)).toBe(ignored)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${ROOT} check-ignore -q -- agents/tasks`)
  }
  test('MOD-86: init and setup print the local-cards line when the card folder is git-ignored', localCardsLine(true))
  test('MOD-86: init and setup print no local-cards line when it is not', localCardsLine(false))

  test('GH-109: /delegation setup in an empty folder lists the failing checks and writes nothing', async ($, on) => {
    const w = world(on, { run: () => ({ exitCode: 128, stdout: '', stderr: 'fatal: not a git repository' }) })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('delegation')
    expect(w.tools).toContain('setup')
    const out = await $.command.run(delegation('setup'))
    expect(out.text).toContain(`chassis-delegation setup in ${ROOT}: 1 of 6 required checks hold`)
    expect(out.text).toContain('✗ a git repo: none here\n    fix: git init -b main')
    expect(out.text).toContain('✗ a gate: no test command found')
    expect(out.text).toContain('✗ the tools on PATH: missing git')
    expect(out.text).not.toContain('First card')
    expect(w.files.size).toBe(0)
    expect(w.runs.every(r => r.argv[0] === 'git' && r.argv[1] === '-C')).toBe(true)
  })

  test('GH-109: with the world made green setup writes the four init files and the gate map, and asks for the first task', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, {
      run: answer,
      files: {
        [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}',
        '/usr/bin/git': '',
        '/usr/bin/node': '',
        '/usr/bin/npm': '',
      },
      dirs: { [ROOT]: ['package.json'] },
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup'))
    expect(out.text).toContain(`chassis-delegation setup in ${ROOT}: 6 of 6 required checks hold`)
    expect(out.text).toContain('· mode: repo=here (no origin/main); setup writes "baseRef": "main" and cards dispatch with --here')
    expect(out.text).toContain(`wrote ${ROOT}/agents/tasks/README.md`)
    expect(out.text).not.toContain('Next: write a card under')
    expect(out.text).not.toContain('update is pending')
    expect(out.text).toContain('config: gateMap.test = npm test')
    expect(out.text).toContain('config: baseRef = main')
    for (const f of ['agents/tasks/README.md', '.chassis-delegation.json', '.gitignore']) expect(w.files.has(`${ROOT}/${f}`)).toBe(true)
    const cfgText = JSON.parse(w.files.get(`${ROOT}/.chassis-delegation.json`) ?? '{}')
    expect(cfgText.gateMap).toEqual({ test: 'npm test' })
    expect(cfgText.baseRef).toBe('main')
    // a second run changes nothing in the config and says what it would have set
    w.files.set(`${ROOT}/.chassis-delegation.json`, '{"gateMap":{"test":"make test"}}')
    const again = await $.tool.call({ tool: 'mcp__chassis-delegation__setup' } as never)
    expect(resultText(again)).toContain('setup would have set "gateMap": {"test": "npm test"}, "baseRef": "main"')
    expect(w.files.get(`${ROOT}/.chassis-delegation.json`)).toBe('{"gateMap":{"test":"make test"}}')
  })

  test('GH-111: setup ends by asking for the first task: no card to save, no sample card, no commit step', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: `${ROOT}\n` }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 1, stdout: '' }
      if (rest === 'status --porcelain') return { exitCode: 0, stdout: ' M x\n' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, { run: answer, files: { [`${ROOT}/package.json`]: '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' }, dirs: { [ROOT]: ['package.json'] } })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup'))
    expect(out.text).not.toContain('First card: save this as')
    expect(out.text).not.toContain('REPLACE ME')
    expect(out.text).not.toContain('Commit the card')
    expect(out.text).not.toContain('git add -A')
    expect(out.text).not.toContain('Ask the person for the first task')
    expect(String(out.text).trimEnd().split('\n').at(-1)).toBe('Set up. Tell Claude your first task in a sentence, for example: "add a function that reads a file header and returns its size, with a node --test test". Claude writes the card, shows you the brief, and when you say go dispatches it and makes the Agent call that starts the worker; the mod shapes and verifies it.')
    expect(w.files.has(`${ROOT}/agents/tasks/README.md`)).toBe(true)
    expect(w.files.has(`${ROOT}/agents/tasks/OPS-000-sample.md`)).toBe(false)
    const viaTool = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__setup' } as never))
    expect(viaTool.trimEnd().split('\n').at(-1)).toBe('Ask the person for the first task, then call the card tool. On go, call dispatch and make the Agent call its result ends with (the spawn block, verbatim): that call starts the worker.')
    expect(viaTool).toContain('Set up. Tell Claude your first task')
  })

  test('MOD-45: /delegation setup /other scaffolds the other repo with its detected gate and writes nothing in the session root', async ($, on) => {
    const answer = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] !== 'git' || argv[2] !== '/other') return { exitCode: 1, stdout: '' }
      const rest = argv.slice(3).join(' ')
      if (rest === 'rev-parse --is-inside-work-tree') return { exitCode: 0, stdout: 'true\n' }
      if (rest === 'rev-parse --show-toplevel') return { exitCode: 0, stdout: '/other\n' }
      if (rest === 'rev-parse --abbrev-ref HEAD') return { exitCode: 0, stdout: 'main\n' }
      if (rest === 'rev-parse --verify --quiet HEAD') return { exitCode: 0, stdout: 'abc1234\n' }
      if (rest === 'rev-parse --verify --quiet origin/main') return { exitCode: 0, stdout: 'abc1234\n' }
      return { exitCode: 0, stdout: '' }
    }
    const w = world(on, {
      run: answer,
      files: { '/other/package.json': '{"scripts":{"test":"node --test"}}', '/usr/bin/git': '', '/usr/bin/node': '', '/usr/bin/npm': '' },
      dirs: { '/other': ['package.json'], '/other/.git': [] },
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation('setup /other'))
    expect(out.text).toContain('chassis-delegation setup in /other: 6 of 6 required checks hold')
    expect(JSON.parse(w.files.get('/other/.chassis-delegation.json') ?? '{}').gateMap).toEqual({ test: 'npm test' })
    expect(w.files.get('/other/agents/tasks/README.md')).toContain('Task cards')
    expect(w.files.get('/other/.gitignore')).toBe('.delegation/\n')
    expect([...w.files.keys()].filter(k => k.startsWith(`${ROOT}/`))).toEqual([])
    expect(String(out.text).trimEnd().split('\n').at(-1)).toContain('card tool with repo set to /other')
    // the tool takes the same path; a relative path and a folder with no .git are refused in one line, writing nothing
    const rel = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__setup', path: 'other' } as never))
    expect(rel).toContain('not an absolute path')
    expect(rel.trim().split('\n').length).toBe(1)
    const none = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__init', path: '/nowhere' } as never))
    expect(none).toContain('is not a git checkout')
    expect([...w.files.keys()].filter(k => k.startsWith('/nowhere') || k.startsWith(`${ROOT}/`))).toEqual([])
    const viaInit = resultText(await $.tool.call({ tool: 'mcp__chassis-delegation__init', path: '/other' } as never))
    expect(viaInit).toContain('left /other/.chassis-delegation.json (exists; never overwritten)')
  })

  test('GH-109: /delegation with no config adds the not-set-up line', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation(''))
    expect(out.text).toContain('not set up here: run /delegation setup')
  })

  test('/delegation with no argument prints the state and where the config came from', async ($, on) => {
    world(on)
    await $.session.start(sessionStart)
    const out = await $.command.run(delegation(''))
    expect(out.text).toContain('Delegation state (chassis-delegation): nothing running, queued or owed.')
    expect(out.text).toContain(`config: no .chassis-delegation.json in ${ROOT}`)
    expect(out.text).toContain('git guard on (main, master)')
    expect(String(out.text)).toMatch(/^mod: chassis-delegation \d+\.\d+\.\d+ loaded from \S+/m)
  })
})

describe('MOD-3: /delegation update', () => {
  const delegation = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const CHANGELOG_NEW = '# Changelog\n\n## 0.5.0 — 2026-10-08\n\n- five a\n\n## 0.4.0 — 2026-10-05\n\n- four a\n'
  /** A clone root behind origin/main by two commits, 0.4.0 → 0.5.0; the merge moves the files in. */
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const behindClone = async ($: any, on: any, opts: { fetchFails?: boolean; dirty?: boolean; folderVersion?: string } = {}) => {
    let merged = false
    const root = { value: '' }
    let files: Map<string, string> | undefined
    const O = 'a'.repeat(40)
    const N = 'b'.repeat(40)
    const w = world(on, {
      run: argv => {
        if (argv[0] !== 'git') return undefined
        const sub = argv.slice(3)
        if (sub[0] === 'fetch') return opts.fetchFails ? { exitCode: 128, stdout: '', stderr: 'fatal: no origin' } : { exitCode: 0, stdout: '' }
        if (sub[0] === 'status') return { exitCode: 0, stdout: opts.dirty ? ' M hooks/register.ts\n' : '' }
        if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${merged ? N : O}\n` }
        if (sub[0] === 'log') return { exitCode: 0, stdout: merged ? '' : `${N}\n${O.replace(/a/, 'c')}\n` }
        if (sub[0] === 'merge') {
          merged = true
          files?.set(`${root.value}/.claude-plugin/plugin.json`, '{"version":"0.5.0"}')
          files?.set(`${root.value}/CHANGELOG.md`, CHANGELOG_NEW)
          if (opts.folderVersion) files?.set(`${root.value}/hooks/lib/version.ts`, `export const MOD_VERSION = '${opts.folderVersion}'\n`)
          return { exitCode: 0, stdout: 'Updating\n' }
        }
        return undefined
      },
    })
    files = w.files
    await $.session.start(sessionStart)
    const first = String((await $.command.run(delegation(''))).text)
    root.value = /loaded from (\S+)/.exec(first)?.[1] ?? ''
    w.files.set(`${root.value}/.git`, 'gitdir')
    w.files.set(`${root.value}/.claude-plugin/plugin.json`, '{"version":"0.4.0"}')
    w.files.set(`${ROOT}/.chassis-delegation.json`, '{\n  "maxWorkers": 2\n}\n')
    return { w, N, O }
  }

  test('a clone behind origin/main: fetch then merge --ff-only, the update line and the changelog slice; /delegation afterwards has no update: line', async ($, on) => {
    const { w, N, O } = await behindClone($, on)
    const out = String((await $.command.run(delegation('update'))).text)
    const git = argvs(w).filter(a => a[0] === 'git').map(a => a.slice(3).join(' '))
    const fetchAt = git.findIndex(g => g === 'fetch origin main' || g === 'fetch -q origin main')
    const mergeAt = git.findIndex(g => g === 'merge --ff-only origin/main')
    expect(fetchAt).toBeGreaterThanOrEqual(0)
    expect(mergeAt).toBeGreaterThan(fetchAt)
    expect(out).toContain(`update: 0.4.0 (${O.slice(0, 7)}) → 0.5.0 (${N.slice(0, 7)}), 2 commits`)
    expect(out).toContain('## 0.5.0 — 2026-10-08')
    expect(out).toContain('- five a')
    expect(out).not.toContain('four a')
    expect(out).toContain('config: added')
    expect(out).toContain('delegateOnly')
    expect(String(w.files.get(`${ROOT}/.chassis-delegation.json`))).toContain('"delegateOnly": "warn"')
    const after = String((await $.command.run(delegation(''))).text)
    expect(after).not.toMatch(/^update:/m)
  })

  test('the status line says n commits behind when the clone is behind, and is silent once current', async ($, on) => {
    const { w } = await behindClone($, on)
    const out = String((await $.command.run(delegation(''))).text)
    expect(out).toContain('update: 2 commits behind origin/main · run /delegation update')
    // the fetch is cached for ten minutes
    const fetches = () => argvs(w).filter(a => a[0] === 'git' && a[3] === 'fetch').length
    const n = fetches()
    await $.command.run(delegation(''))
    expect(fetches()).toBe(n)
  })

  test('a dirty tree or a failed fetch refuses with the reason and merges nothing; a failed status fetch is one line', async ($, on) => {
    const { w } = await behindClone($, on, { dirty: true })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain('uncommitted')
    expect(argvs(w).some(a => a.includes('merge'))).toBe(false)
  })

  test('a failed fetch: update names it and merges nothing; /delegation says one line, no error', async ($, on) => {
    const { w } = await behindClone($, on, { fetchFails: true })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain('fatal: no origin')
    expect(argvs(w).some(a => a.includes('merge'))).toBe(false)
    const st = String((await $.command.run(delegation(''))).text)
    expect(st.split('\n').filter(l => l.startsWith('update:')).length).toBeLessThanOrEqual(1)
  })

  test('MOD-28: a merge that moved the version prints the code line: running the old, the folder holds the new, reload the window', async ($, on) => {
    await behindClone($, on, { folderVersion: '9.9.9' })
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toContain(`code: running ${MOD_VERSION}, folder holds 9.9.9 — reload the window to run it`)
    // before the reload line, which says the same thing for a folder outside ~/.claude/dev-mods
    expect(out.indexOf('code: running')).toBeLessThan(out.indexOf('reload: not done'))
  })

  test('MOD-28: an update that moved no version prints no code line', async ($, on) => {
    await behindClone($, on)
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).not.toContain('code: running')
  })

  test('a plain folder changes nothing and prints the clone command with its own path', async ($, on) => {
    const w = world(on)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegation('update'))).text)
    expect(out).toMatch(/git clone \S+ \S+/)
    expect(argvs(w).some(a => a[0] === 'git')).toBe(false)
  })
})

describe('turn.complete', () => {
  test('a background ad hoc agent finishing adds nothing to the conversation', async ($, on) => {
    const w = world(on, { classify: 'standard' })
    await $.agent.spawn(spawnInput({ prompt: 'Find where the brief is rendered.' }))
    await $.turn.complete(turnInput('agent-1', 'It is in dealStrategyBrief.js.'))
    expect(delivered(w)).not.toContain('verdict=')
    expect(w.runs.some(r => r.argv[0] === 'git')).toBe(false)
  })
})

describe('/dispatch', () => {
  const files = (): Record<string, string> => ({
    [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD,
  })
  const dirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME, 'BE-1010-other.md', 'FE-1-x.md'] }
  const run = (_argv: string[]): RunAnswer | undefined => undefined
  // the subagent types the session offers (noted from $.agent.list and agent.offer)
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }

  test('--dry-run reads the card, writes the brief and prints the header', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    expect(w.commands).toContain('dispatch')
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(FIXTURE_HEADER)
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    expect(brief.startsWith(FIXTURE_HEADER + '\n\nWork in ' + ROOT + '-BE-101 on agent/backend/BE-101;')).toBe(true)
    expect(brief.endsWith(FIXTURE_CARD.slice(FIXTURE_CARD.indexOf('## Why')))).toBe(true)
    expect(w.runs.find(r => r.argv[0] === 'git')).toBeUndefined()
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toEqual([])
    // no --scope: the prose scope is written as the card has it, and flagged
    expect(out.text).toContain('the card scope reads as prose')
  })

  test('GH-103: a prose card scope and no --scope stops at dispatch: the brief and the prose are shown, no worktree, no spawn; the second dispatch with --scope rewrites the brief with it (MOD-141)', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run, store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101'))
    expect(out.text).toContain(`2. brief ${SCRATCH}/briefs/BE-101.brief.md written`)
    expect(out.text).toContain(FIXTURE_HEADER)
    expect(out.text).toContain('app/billing/RateCatalog.ts, RateProviderHttp.ts')
    expect(out.text).toContain('stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again')
    expect(w.spawns).toHaveLength(0)
    expect(w.runs).toEqual([])
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(true)
    const again = await $.command.run(commandInput('BE-101 --scope app/billing/**'))
    expect(again.text).toContain('rewritten: --scope applied')
    expect(again.text).not.toContain('stopped:')
    expect(spawnCallOf(String(again.text))).toMatchObject({ subagent_type: 'backend', model: 'opus' })
    expect(w.spawns).toHaveLength(0)
  })

  test('--scope and --forbid replace the card prose in the header', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run --scope app/billing/Rate*.ts,docs/architecture/rate-provider-ladder.md --forbid app/ui/**,vendor/**'))
    const header = FIXTURE_HEADER.replace(/ scope=.* red_test=/, ' scope=app/billing/Rate*.ts,docs/architecture/rate-provider-ladder.md forbid=app/ui/**,vendor/** red_test=')
    expect(out.text).toContain(header)
    expect(out.text).not.toContain('the card scope reads as prose')
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').startsWith(header + '\n\n')).toBe(true)
  })

  test('a scope entry inside the card\'s own forbid refuses the dispatch and writes no brief (GH-17, MOD-227)', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run --scope docs/a.md,src/**/x.ts --forbid docs/**'))
    const line = 'scope docs/a.md is under forbid docs/** \u2014 drop the forbid, narrow it, or drop the scope path'
    expect(String(out.text)).toContain(line)
    expect(String(out.text)).not.toContain('[[brief ')
    expect(String(out.text)).not.toContain('scope src/')
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
  })

  test('--replay reads the card at the base commit and works in the -replay worktree', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    // the working tree has the card merged; the base commit still has it queued
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: merged')
    const replayRun = (argv: string[]) => {
      if (argv[3] === 'ls-tree') return { exitCode: 0, stdout: `agents/tasks/${FIXTURE_CARD_NAME}\nagents/tasks/BE-1010-other.md\n` }
      if (argv[3] === 'show') return { exitCode: 0, stdout: FIXTURE_CARD }
      return run(argv)
    }
    const w = world(on, { files: f, dirs, run: replayRun, agentId: 'agent-r' })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay --base 96014e3b --scope app/billing/Rate*.ts'))
    await brainSpawn($, String(out.text))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'ls-tree', '--name-only', '96014e3b', 'agents/tasks/'],
      ['git', '-C', ROOT, 'show', `96014e3b:agents/tasks/${FIXTURE_CARD_NAME}`],
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101-replay', `${ROOT}-BE-101-replay`, '96014e3b'],
    ])
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.replay.brief.md`) ?? ''
    expect(brief).toContain(' scope=app/billing/Rate*.ts forbid=')
    expect(brief).toContain(`Work in ${ROOT}-BE-101-replay on agent/backend/BE-101-replay; card ${ROOT}-BE-101-replay/agents/tasks/${FIXTURE_CARD_NAME}.`)
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.spawns[0]).toMatchObject({ prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.replay.brief.md. Read it whole, then follow it exactly.`, cwd: `${ROOT}-BE-101-replay`, model: 'opus' })
    expect(records(w, 'BE-101')[0]).toMatchObject({ task: 'BE-101', attempt: 1, kind: 'spawn', replay: true, base: '96014e3b' })
    expect(out.text).toContain('replay of BE-101 at 96014e3b')
  })

  test('--replay refuses a card that is not queued at the base commit', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, {
      files: files(), dirs,
      run: argv => (argv[3] === 'ls-tree' ? { exitCode: 0, stdout: `agents/tasks/${FIXTURE_CARD_NAME}\n` } : argv[3] === 'show' ? { exitCode: 0, stdout: FIXTURE_CARD.replace('status: queued', 'status: merged') } : run(argv)),
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay --base 96014e3b'))
    expect(out.text).toContain('BE-101 is status merged')
    expect(w.spawns).toHaveLength(0)
    expect(argvs(w).some(a => a[3] === 'worktree')).toBe(false)
  })

  test('--replay without --base is refused before anything runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --replay'))
    expect(out.text).toContain('refused --replay without --base <sha>')
    expect(w.runs).toHaveLength(0)
  })

  test('a dispatcher card dispatches: its domain stays in the branch; with no type of its name it runs on general-purpose', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('domain: backend', 'domain: dispatcher')
    const w = world(on, { files: f, dirs, run, store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/dispatcher/BE-101', `${ROOT}-BE-101`, 'origin/main'],
    ])
    expect(spawnCallOf(String(out.text))?.subagent_type).toBe('general-purpose')
    expect(out.text).toContain('4. spawn prepared: general-purpose on opus')
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('general-purpose')
  })

  test('5B: the repo file agentTypes, domains and worktreeRoot steer the dispatch', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('domain: backend', 'domain: web')
    f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ agentTypes: { web: 'frontend' }, domains: ['web', 'api'], worktreeRoot: '/trees' })
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(argvs(w).filter(a => a[0] === 'git')).toContainEqual(['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/web/BE-101', '/trees/acme-app-BE-101', 'origin/main'])
    expect(out.text).toContain('4. spawn prepared: frontend on opus')
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('frontend')
    expect(w.spawns[0]).toMatchObject({ cwd: '/trees/acme-app-BE-101' })
  })

  test('briefDir unset: the brief goes to <root>/.delegation/briefs/', async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(`2. brief ${ROOT}/.delegation/briefs/BE-101.brief.md written`)
    expect(w.files.has(`${ROOT}/.delegation/briefs/BE-101.brief.md`)).toBe(true)
  })

  test('briefDir unset and the root not writable: the session scratchpad is the fallback', async ($, on) => {
    const pad = '/private/tmp/claude-501/-repo-acme-app/sess-9/scratchpad'
    const w = world(on, { files: files(), dirs: { ...dirs, [pad]: [] }, run, sessionId: 'sess-9', skip: ['fs.write'] })
    on('fs.write', (_$, e) => {
      if (e.path.startsWith(`${ROOT}/`)) throw new Error(`EACCES: ${e.path}`)
      w.files.set(e.path, e.text)
      return { value: undefined } as never
    })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --dry-run'))
    expect(out.text).toContain(`2. brief ${pad}/briefs/BE-101.brief.md written`)
    expect(w.files.has(`${pad}/briefs/BE-101.brief.md`)).toBe(true)
  })

  test('the full run adds the worktree from a sha base and ends with the spawn block; the brain makes it and the hook sets its folder', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run, agentId: 'agent-318', store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/** --base 96014e3b'))
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'fetch', '-q', 'origin', 'main'],
      ['git', '-C', ROOT, 'worktree', 'add', '-q', '-b', 'agent/backend/BE-101', `${ROOT}-BE-101`, '96014e3b'],
    ])
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]).toMatchObject({
      prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.brief.md. Read it whole, then follow it exactly.`,
      cwd: `${ROOT}-BE-101`,
      model: 'opus',
    })
    // no map entry, so the domain's own type, which the session offers
    expect(w.spawns[0]?.subagentType ?? w.spawns[0]?.subagent_type).toBe('backend')
    expect(out.text).toContain('4. spawn prepared: backend on opus')
    expect(out.text).toContain('tier=frontier → opus')
    expect(argvs(w).some(a => a[0] === 'bash')).toBe(false)
  })

  test('refuses a card that is not queued or claimed; nothing else runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: merged')
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(out.text).toContain('BE-101 is status merged; /dispatch takes a queued or claimed card')
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.runs).toHaveLength(0)
  })

  test('MOD-216: a parked card is refused with how to dispatch it', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const f = files()
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: parked')
    const w = world(on, { files: f, dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(out.text).toContain('BE-101 is parked; set status: queued to dispatch it')
    expect(w.runs).toHaveLength(0)
  })

  for (const [value, line] of [
    ['abc', 'issue: abc is not an issue number; no status comments or close for this card'],
    ['https://github.com/x/y/issues/5', 'issue: https://github.com/x/y/issues/5 names x/y, not acme/app; no status comments or close for this card'],
  ] as const) {
    test(`MOD-216: issue: ${value} prints one warning at dispatch`, { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
      const f = files()
      f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', `status: queued\nissue: ${value}`)
      f[`${ROOT}/.git/config`] = '[remote "origin"]\n\turl = https://github.com/acme/app.git\n'
      world(on, { files: f, dirs, run })
      await $.session.start(sessionStart)
      const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
      expect(out.split('\n').filter(l => l.includes('is not an issue number') || l.includes('names x/y'))).toEqual([`   ${line}`])
    })
  }

  test('a non-sha --base is refused before anything runs', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --base HEAD~3'))
    expect(out.text).toContain('refused --base HEAD~3')
    expect(w.runs).toHaveLength(0)
  })

  // GH-16: repo=here, the main-checkout mode
  const onMain = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === '--abbrev-ref' ? { exitCode: 0, stdout: 'main\n' } : undefined)

  test('GH-16: --here writes a repo=here brief, cuts no worktree, runs no fetch, and spawns in the root', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: onMain, agentId: 'agent-h', store: offered })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput('BE-101 --here --scope app/billing/Rate*.ts'))
    await brainSpawn($, String(out.text))
    const brief = w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? ''
    const header = brief.split('\n')[0] ?? ''
    expect(header).toContain(' gate=G2,G8p repo=here ignore=.delegation/**,agents/tasks/** scratch=/tmp/td/chassis-delegation/BE-101 spend=25 budget=3-attempts report=chassis.report.v1]]') // MOD-22: a repo=here brief names its scratch folder
    expect(header).not.toContain(' base=')
    // no worktree, no fetch: the only git the dispatch runs reads the current branch
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD']])
    expect(w.spawns[0]).toMatchObject({ prompt: `Your brief is the file ${SCRATCH}/briefs/BE-101.brief.md. Read it whole, then follow it exactly.`, cwd: ROOT, model: 'opus' })
    expect(brief).toContain(`Work in ${ROOT} on main; card ${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}.`)
    expect(out.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(out.text).not.toContain('3. worktree')
    expect(records(w, 'BE-101')[0]).toMatchObject({ attempt: 1, kind: 'spawn', here: ROOT })
  })

  /** Another repo=here card in flight in ROOT: a pending record marked here, its brief, and the files it claimed so far. */
  const inFlight = (task: string, scope: string, o: { files?: string[]; verdict?: string; here?: string | null } = {}) => {
    const path = `${ROOT}/.delegation/briefs/${task}.brief.md`
    const here = o.here === null ? {} : { here: o.here ?? ROOT }
    return {
      store: { [`delegation.tasks.${task}`]: [{ task, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: o.verdict ?? 'pending', at: 1, briefPath: path, ...here, ...(o.files ? { files: o.files } : {}) }] },
      files: { [path]: `[[brief v=1 task=${task} subtask=main tier=standard scope=${scope} forbid= gate=node repo=here]]\nbody` },
    }
  }
  const LLM = 'app/billing/Rate*.ts'

  test('GH-16: a card that says repo: here dispatches the same way; baseRef HEAD is pinned to its sha; ignore= adds the files in-flight cards claimed', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const HEAD_SHA = 'c'.repeat(40)
    const gh19 = inFlight('GH-19', 'src/**', { files: ['src/b.ts'] })
    const f = { ...files(), ...gh19.files }
    f[`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`] = FIXTURE_CARD.replace('status: queued', 'status: queued\nrepo: here')
    f[`${ROOT}/.chassis-delegation.json`] = JSON.stringify({ baseRef: 'HEAD', ignore: ['.delegation/**', 'traces/**'] })
    const run = (argv: string[]): RunAnswer | undefined => (argv[3] === 'rev-parse' && argv[4] === 'HEAD' ? { exitCode: 0, stdout: `${HEAD_SHA}\n` } : onMain(argv))
    const w = world(on, { files: f, dirs, run, store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput(`BE-101 --scope ${LLM}`))
    const header = (w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(` gate=G2,G8p repo=here base=${HEAD_SHA} ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts scratch=/tmp/td/chassis-delegation/BE-101 spend=25 budget=3-attempts`)
    expect(argvs(w).filter(a => a[0] === 'git')).toEqual([
      ['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'],
      ['git', '-C', ROOT, 'rev-parse', 'HEAD'],
    ])
    expect(out.text).toContain(`   repo=here: base=${HEAD_SHA} · ignore=.delegation/**,traces/**,agents/tasks/**,src/b.ts`)
    expect(out.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(out.text).toContain(`brief ${SCRATCH}/briefs/BE-101.brief.md · repo=here in ${ROOT} · branch main · tier=frontier → opus`)
    await brainSpawn($, String(out.text))
    expect(w.spawns[0]).toMatchObject({ cwd: ROOT })
  })

  test('GH-16: a scope overlapping an in-flight repo=here card is refused, naming both cards and globs; --force-overlap dispatches with a warning', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const gh19 = inFlight('GH-19', 'app/**')
    const w = world(on, { files: { ...files(), ...gh19.files }, dirs, run: onMain, store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    const refused = await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    expect(refused.text).toContain(`/dispatch BE-101: refused — BE-101 scope ${LLM} overlaps in-flight GH-19 scope app/** in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)`)
    expect(w.files.has(`${SCRATCH}/briefs/BE-101.brief.md`)).toBe(false)
    expect(w.spawns).toHaveLength(0)
    const forced = await $.command.run(commandInput(`BE-101 --here --force-overlap --scope ${LLM}`))
    expect(forced.text).toContain(`   warning: BE-101 scope ${LLM} overlaps in-flight GH-19 scope app/** in the shared checkout (--force-overlap: dispatched anyway)`)
    expect(forced.text).toContain(`3. no worktree (repo=here): the worker shares ${ROOT}`)
    expect(spawnCallOf(String(forced.text))).toBeDefined()
  })

  test('GH-16: not in flight here: a card with a verdict, a worktree card, a card in another checkout', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const done = inFlight('GH-19', 'app/**', { verdict: 'consistent' })
    const tree = inFlight('GH-20', 'app/**', { here: null })
    const away = inFlight('GH-21', 'app/**', { here: '/repo/elsewhere' })
    const w = world(on, { files: { ...files(), ...done.files, ...tree.files, ...away.files }, dirs, run: onMain, store: { ...offered, ...done.store, ...tree.store, ...away.store } })
    await $.session.start(sessionStart)
    const out = await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))
    expect(out.text).not.toContain('refused')
    expect(out.text).not.toContain('overlaps')
    expect(spawnCallOf(String(out.text))).toBeDefined()
  })

  test('GH-16: a repo=here hand-back is verified in the root: the dirty tree less ignore= and the files another in-flight card claimed', { options: { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full', gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' } }, async ($, on) => {
    const gh19 = inFlight('GH-19', 'src/**')
    const PORCELAIN = [' M app/billing/RateA.ts', '?? .delegation/briefs/BE-101.brief.md', ' M src/b.ts', ''].join('\0')
    const run = (argv: string[]): RunAnswer | undefined => {
      if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
      if (argv[3] === 'status') return { exitCode: 0, stdout: PORCELAIN }
      return onMain(argv)
    }
    // GH-20: the brief has a red test, so the report names its red file, read in the shared checkout
    const RED_HERE = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
    const w = world(on, { files: { ...files(), ...gh19.files, ...RED_HERE }, dirs, run, agentId: 'agent-h', store: { ...offered, ...gh19.store } })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
    // meanwhile GH-19 handed back: its record now claims src/b.ts
    w.store.set(`delegation.tasks.GH-19@${ROOT}`, [{ ...records(w, 'GH-19')[0], files: ['src/b.ts'] }])
    const AMEND = '[[amend v=1 ignore+=src/** reason=hide it]]'
    const REPORT = `[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=app/billing/RateA.ts]]`
    await $.turn.complete(turnInput('agent-h', `Done.\n${AMEND}\n${REPORT}`))
    const row = delivered(w)
    expect(row).toContain('chassis-delegation: verdict=consistent task=BE-101 attempt=1/3')
    expect(row).toContain('claim branch: held — main is the current branch of ' + ROOT)
    expect(row).toContain('ignored: 1 path by ignore= (.delegation/briefs/BE-101.brief.md), 1 path belonging to GH-19 (src/b.ts)')
    expect(row).toContain('claim files: held — files= matches the dirty-tree delta exactly')
    expect(row).toContain('claim red: held — .delegation/BE-101/red-1.txt')
    expect(row).toContain(`claim gate: held — gate green in the shared checkout ${ROOT} (gate=pass confirmed; repo=here: the dirty tree is allowed, the clean-tree rule does not apply)`)
    // ignore+= hides paths from the check: it waits for approval, never applied on the worker's word
    expect(row).toContain(`amend needs approval: ${AMEND} — append it to ${SCRATCH}/briefs/BE-101.brief.md and re-verify to accept it`)
    expect(w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').not.toContain('[[amend')
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([ROOT, ROOT])
    expect(argvs(w).some(a => a.includes('worktree') || a.includes('fetch'))).toBe(false)
    expect(records(w, 'BE-101')[0]).toMatchObject({ here: ROOT, files: ['app/billing/RateA.ts'], verdict: 'consistent' })
  })

  describe('MOD-217: repo=here attribution', () => {
    const OPTS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'full' as const, gateMap: '{"G2":"npx g2","G8p":"npx g8p"}' }
    const REPORT = 'Done.\n[[report v=1 task=BE-101 subtask=main branch=main pr=none sha=HEAD gate=pass red=.delegation/BE-101/red-1.txt files=app/billing/RateA.ts]]'
    const RED_HERE = { [`${ROOT}/.delegation/BE-101/red-1.txt`]: 'npx vitest run\nFAIL RateA.test.ts: expected 1 got 0\n' }
    const edit = ($: any, file: string) => $.tool.call({ tool: 'Edit', file_path: file, old_string: 'a', new_string: 'b', agentId: 'agent-h' } as never)
    const passed = () => ({ result: { stdout: 'ran', stderr: '', interrupted: false } }) as never
    const setupHere = (on: Parameters<typeof world>[0], porcelain: string[]) => {
      on('tool.call', { tool: 'Edit' }, passed)
      const run = (argv: string[]): RunAnswer | undefined => {
        if (argv[0] === 'npx') return { exitCode: 0, stdout: 'ok\n' }
        if (argv[3] === 'status') return { exitCode: 0, stdout: porcelain.join('\0') }
        return onMain(argv)
      }
      return world(on, { files: { ...files(), ...RED_HERE }, dirs, run, agentId: 'agent-h', store: offered })
    }

    test('a sibling worker\'s edit is listed as not by this worker and does not refute', { options: OPTS }, async ($, on) => {
      const w = setupHere(on, [' M app/billing/RateA.ts', ' M src/sibling.ts', ''])
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
      await edit($, `${ROOT}/app/billing/RateA.ts`)
      await $.turn.complete(turnInput('agent-h', REPORT))
      const row = delivered(w)
      expect(row).toContain('verdict=consistent task=BE-101 attempt=1/3')
      expect(row).toContain('changed during the run, not by this worker: src/sibling.ts')
    })

    test('the worker\'s own out-of-scope edit refutes and charges an attempt', { options: OPTS }, async ($, on) => {
      const w = setupHere(on, [' M app/billing/RateA.ts', ' M src/mine.ts', ' M src/sibling.ts', ''])
      await $.session.start(sessionStart)
      await brainSpawn($, String((await $.command.run(commandInput(`BE-101 --here --scope ${LLM}`))).text))
      await edit($, `${ROOT}/app/billing/RateA.ts`)
      await edit($, `${ROOT}/src/mine.ts`)
      await $.turn.complete(turnInput('agent-h', REPORT.replace('files=app/billing/RateA.ts', 'files=app/billing/RateA.ts,src/mine.ts')))
      const row = delivered(w)
      expect(row).toContain('verdict=refuted task=BE-101')
      expect(row).toContain('claim scope: failed — out-of-scope path: src/mine.ts')
      expect(row).not.toContain('out-of-scope path: src/sibling.ts')
      expect(records(w, 'BE-101')[0]).toMatchObject({ verdict: 'refuted', attempt: 1 })
    })
  })
})

describe('GH-16: a nested child repo is its own root', () => {
  test("the parent's .chassis-delegation.json is never consulted when the session root is the child", async ($, on) => {
    const PARENT = ROOT.slice(0, ROOT.lastIndexOf('/'))
    const reads: string[] = []
    const w = world(on, { files: { [`${PARENT}/.chassis-delegation.json`]: JSON.stringify({ tierMap: { standard: 'opus' }, baseRef: 'develop' }) }, skip: ['fs.read'] })
    on('fs.read', (_$, e) => {
      reads.push(e.path)
      const text = w.files.get(e.path)
      if (text === undefined) throw new Error(`ENOENT: ${e.path}`)
      return { value: text } as never
    })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=standard]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('sonnet') // not the parent's tierMap
    const status = await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
    expect(status.text).toContain(`config: no .chassis-delegation.json in ${ROOT}`)
    expect(status.text).toContain('base: origin/main → main → origin/master → master · repo=here ignore: .delegation/**')
    expect(reads).toContain(`${ROOT}/.chassis-delegation.json`)
    expect(reads.some(p => p.startsWith(`${PARENT}/.chassis-delegation.json`))).toBe(false)
  })
})

describe('GH-1: the adopter review leftovers (items 2, 5, 6, 8)', () => {
  const NO_BRIEF = 'no brief: no scope=/gate=/red_test= to check against'
  const CARDLESS = (sha: string, task?: string) =>
    `[[report v=1${task ? ` task=${task} subtask=main` : ''} branch=agent/mod/GH-77 pr=none sha=${sha} gate=pass files=a/x.ts]]`
  /** A green worker repo where the sha resolves but is not an ancestor of the branch. */
  const offBranch = () => {
    const run = nativeRun({ gate: 0 })
    return (argv: string[]): RunAnswer | undefined => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : run(argv))
  }
  const verdictRows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))

  test('item 2: a plain Agent spawn with no header whose report names a sha off the branch is refuted, not "no brief header"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { classify: 'standard', agentId: 'agent-c', run: offBranch() })
    on('tool.call', { tool: 'Agent' }, () => agentResult('Fixed the flake.\n' + CARDLESS('1234abcd', 'GH-77'), 'agent-c'))
    await $.agent.spawn(spawnInput({ prompt: 'Fix the flaky date test.' }))
    const r = await $.tool.call({ tool: 'Agent', description: 'fix', prompt: 'Fix the flaky date test.' })
    const context = (r.context ?? []).join('\n')
    expect(context).not.toContain('no brief header')
    expect(context).toContain('chassis-delegation: verdict=refuted task=GH-77 attempt=1/3')
    expect(context.split('\n')[0]).toMatch(/ next=check the diff$/)
    expect(context).toContain('claim branch: held — refs/heads/agent/mod/GH-77')
    expect(context).toContain('claim sha: failed — sha 1234abcd exists but is NOT reachable on agent/mod/GH-77')
    expect(context).toContain(`claim scope: unchecked — ${NO_BRIEF}`)
    expect(context).toContain('claim files: held — files= matches the sha delta exactly')
    expect(context).toContain(`claim gate: unchecked — ${NO_BRIEF}`)
    expect(context).toContain(`claim red: unchecked — ${NO_BRIEF}`)
    expect(context).toContain('claim pr: held — no PR claimed')
    // the tree is the session root (the spawn named no cwd); no gate runs without a brief
    expect(w.runs.filter(x => isVerifyStart(x.argv))[0]?.argv.slice(0, 3)).toEqual(['git', '-C', ROOT])
    expect(w.runs.some(x => x.argv[0] === 'npx')).toBe(false)
    expect(records(w, 'GH-77')[0]).toMatchObject({ task: 'GH-77', subtask: 'main', attempt: 1, verdict: 'refuted', reportGate: 'pass', adhoc: true, agentId: 'agent-c' })
    const ledger = (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n')
    expect(ledger).toHaveLength(1)
    expect(JSON.parse(ledger[0] ?? '{}')).toMatchObject({ task: 'GH-77', attempt: 1, verdict: 'refuted', next: 'check the diff' })
    expect(w.sent).toHaveLength(0)
  })

  test('item 2: a background ad hoc hand-back with a report and no task= is verified in the spawn cwd, recorded under adhoc-<key>, and posted', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const WT = '/work/tidy'
    const w = world(on, { classify: 'standard', agentId: 'agent-c', dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }) })
    await $.agent.spawn(spawnInput({ prompt: 'Tidy the README.', cwd: WT }))
    await $.turn.complete(turnInput('agent-c', 'Done.\n' + CARDLESS('1234abcd')))
    const row = verdictRows(w)[0] ?? ''
    expect(row.split('\n')[0]).toMatch(/^chassis-delegation: verdict=unverified task=adhoc-ABCDEFGH attempt=1\/3 .*next=check the diff$/)
    expect(row).toContain('claim sha: held')
    expect(w.runs.filter(x => isVerifyStart(x.argv))[0]?.argv.slice(0, 3)).toEqual(['git', '-C', WT])
    expect(records(w, 'adhoc-ABCDEFGH')[0]).toMatchObject({ attempt: 1, verdict: 'unverified', adhoc: true })
    // never a resume or a respawn: there is no brief to resume against
    expect(w.sent).toHaveLength(0)
    expect(w.spawns).toHaveLength(1)
  })

  // MOD-154 (#246): a cardless ad hoc hand-back that commits nothing has no sha, patch or card for the retire sweep; its owed row names the way out
  const adhocCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const adhocOwed = async ($: any, on: any) => {
    const WT = '/work/tidy'
    const w = world(on, { classify: 'standard', agentId: 'agent-c', dirs: { [WT]: [] }, run: nativeRun({ gate: 0 }) })
    await $.agent.spawn(spawnInput({ prompt: 'Tidy the README.', cwd: WT }))
    await $.turn.complete(turnInput('agent-c', 'Done.\n' + CARDLESS('1234abcd')))
    await $.session.start(sessionStart)
    return w
  }

  test('MOD-154: a cardless ad hoc hand-back judged check the diff leaves an owed row that names /delegation accept; the verdict next= is unchanged', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = await adhocOwed($, on)
    expect(verdictRows(w)[0]?.split('\n')[0]).toMatch(/ next=check the diff$/)
    const out = String((await $.command.run(adhocCmd(''))).text)
    expect(out).toContain('owed: adhoc-ABCDEFGH: check the diff (ad hoc: clears with /delegation accept adhoc-ABCDEFGH)')
  })

  test('MOD-154: /delegation accept <id> clears the hinted ad hoc row; so does --owed', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    await adhocOwed($, on)
    const accepted = String((await $.command.run(adhocCmd('accept adhoc-ABCDEFGH looked'))).text)
    expect(accepted).toContain('accepted adhoc-ABCDEFGH')
    expect(String((await $.command.run(adhocCmd(''))).text)).not.toContain('owed: adhoc-ABCDEFGH')
  })

  test('MOD-154: /delegation accept --owed clears the hinted ad hoc row', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    await adhocOwed($, on)
    expect(String((await $.command.run(adhocCmd('accept --owed'))).text)).toContain('retired 1 owed row (adhoc-ABCDEFGH)')
    expect(String((await $.command.run(adhocCmd(''))).text)).not.toContain('owed: adhoc-ABCDEFGH')
  })

  const BRIEF = `${SCRATCH}/briefs/T-5.brief.md`
  const HEADER = (budget = 3) => `[[brief v=1 task=T-5 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=${budget}-attempts report=chassis.report.v1]]`
  const REPORT = '[[report v=1 task=T-5 subtask=main branch=agent/frontend/T-5 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
  const PROVE = 'resume agent=agent-5 — prove: gate (gate not re-run: prettier (not in gateMap))'

  test('item 5: an unverified verdict advises a resume naming the unchecked claims; the resume counts against the budget', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER() + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    const row = verdictRows(w)[0] ?? ''
    expect(row.split('\n')[0]).toBe(`chassis-delegation: verdict=unverified task=T-5 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 · gate not re-run (not in gateMap) next=${PROVE}`)
    expect(row).not.toContain('check by hand')
    const sent = (await $.session.send({ to: 'agent-5', text: 'prove the gate', origin: { kind: 'model' } } as never)) as { isDelivered?: boolean }
    expect(sent.isDelivered).toBe(true)
    expect(records(w, 'T-5').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'unverified'], [2, 'resume', 1, 'pending']])
  })

  test('item 5: autoEscalate performs that resume, sending the unchecked claim lines', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER() + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    expect(verdictRows(w)[0]?.split('\n')[0]).toContain('verdict=unverified task=T-5 attempt=1/3 usd=~0.00 model=claude-sonnet-5-5 · gate not re-run (not in gateMap) next=resumed agent=agent-5 (autoEscalate)')
    expect(w.sent).toHaveLength(1)
    expect(w.sent[0]?.text).toContain('claim gate: unchecked — gate not re-run: prettier (not in gateMap)')
    expect(w.sent[0]?.text).not.toContain('claim branch: held')
    expect(records(w, 'T-5').map(r => [r.attempt, r.kind, r.verdict])).toEqual([[1, 'spawn', 'unverified'], [2, 'resume', 'pending']])
  })

  test('item 5: past the budget an unverified verdict keeps "check by hand"', { options: { verdictVerbosity: 'full' } }, async ($, on) => {
    const w = world(on, { files: { [BRIEF]: HEADER(1) + '\nbody' }, run: nativeRun({ gate: 0 }), agentId: 'agent-5' })
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.` }))
    await $.turn.complete(turnInput('agent-5', REPORT))
    expect(verdictRows(w)[0]?.split('\n')[0]).toContain('verdict=unverified task=T-5 attempt=1/1 usd=~0.00 model=claude-sonnet-5-5 · gate not re-run (not in gateMap) next=check by hand — unverified is not a pass')
  })

  const WARN = 'warning: budget "frontier-60m" is not <n>-attempts; using the default 3'

  test('item 6: a card budget of frontier-60m warns once in the /dispatch output; the brief takes the default budget and the card tier', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out.split(WARN)).toHaveLength(2)
    const header = (w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0] ?? ''
    expect(header).toContain(' tier=frontier model=opus ')
    expect(header).toContain(' budget=3-attempts ')
  })

  test("item 6: the spawn hook logs the same line to debug when a header's budget= is malformed", async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-6 subtask=main tier=standard budget=frontier-60m]]\nDo it.' }))
    expect(w.debugLogs).toContain(`chassis-delegation: T-6: ${WARN}`)
    expect(w.store.get('delegation.spawn.toolu_01ABCDEFGH')).toMatchObject({ budget: 3, tier: 'standard' })
    expect(w.spawns[0]?.model).toBe('sonnet')
  })

  const TIER_WARN = 'warning: tier "deep" is not economy, standard, frontier or premium; dispatched at standard'
  const cardAt = (tier: string) => FIXTURE_CARD.replace('tier: frontier', `tier: ${tier}`)

  test('GH-108: a card tier the mod does not know is named once and dispatched at standard', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: cardAt('deep') }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out.split(TIER_WARN)).toHaveLength(2)
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0]).toContain(' tier=standard model=sonnet ')
  })

  test('GH-108: a card tier that is a model name dispatches at its tier, no warning', { options: { briefDir: `${SCRATCH}/briefs` } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: cardAt('opus') }, dirs: { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] } })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('BE-101 --dry-run'))).text)
    expect(out).not.toContain('warning: tier')
    expect((w.files.get(`${SCRATCH}/briefs/BE-101.brief.md`) ?? '').split('\n')[0]).toContain(' tier=frontier model=opus ')
  })

  test('GH-108: the spawn hook maps a header tier= of a model name and logs the warning for an unknown one', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=opus]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.debugLogs.filter(l => l.includes('warning: tier'))).toEqual([])
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-9 subtask=main tier=deep]]\nDo it.', tool_use_id: 'toolu_0900000009' }))
    expect(w.debugLogs).toContain(`chassis-delegation: T-9: ${TIER_WARN}`)
    expect(w.spawns[1]?.model).toBe('sonnet')
  })

  test('item 8: a header tier or a caller model makes no classify call; the debug line names the source', async ($, on) => {
    let calls = 0
    const w = world(on, { skip: ['model.classify'] })
    on('model.classify', () => {
      calls += 1
      return { value: 'frontier' } as never
    })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-7 subtask=main tier=economy]]\nDo it.' }))
    expect(calls).toBe(0)
    expect(w.debugLogs).toContain("chassis-delegation: T-7: tier=economy picked by the brief header's tier= (no classify call)")
    await $.agent.spawn(spawnInput({ prompt: 'Look around.', model: 'haiku', tool_use_id: 'toolu_0200000002' }))
    expect(calls).toBe(0)
    expect(w.debugLogs).toContain("chassis-delegation: adhoc-00000002: tier=economy picked by the caller's model hint (haiku) (no classify call)")
    await $.agent.spawn(spawnInput({ prompt: 'Work out why the race happens.', tool_use_id: 'toolu_0300000003' }))
    expect(calls).toBe(1)
    expect(w.debugLogs).toContain('chassis-delegation: adhoc-00000003: tier=frontier picked by the classifier (classify called)')
  })

  const FABLE = 'tier=frontier → opus (fable requested; fable is never spawned by the mod)'

  test('item 8: a brief naming model=fable (or tier=premium) spawns opus, says so in the notice, and the record keeps requestedAlias', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-8 subtask=main tier=frontier model=fable]]\nDo it.' }))
    expect(w.spawns[0]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(`${FABLE} · attempt 1/3`)
    expect(records(w, 'T-8')[0]).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-9 subtask=main tier=premium model=fable]]\nDo it.', tool_use_id: 'toolu_0200000002' }))
    expect(w.spawns[1]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(`${FABLE} · attempt 1/3`)
    expect(records(w, 'T-9')[0]).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    // the caller naming fable
    await $.agent.spawn(spawnInput({ prompt: 'Review this.', model: 'claude-fable-1', tool_use_id: 'toolu_0300000003' }))
    expect(w.spawns[2]?.model).toBe('opus')
    expect(w.notices.at(-1)).toBe(FABLE)
    expect(((w.store.get('delegation.adhoc') ?? []) as Record<string, unknown>[]).at(-1)).toMatchObject({ tier: 'frontier', alias: 'opus', requestedAlias: 'fable' })
    // a brief that never names fable keeps its plain notice and no requestedAlias
    await $.agent.spawn(spawnInput({ prompt: '[[brief v=1 task=T-10 subtask=main tier=frontier]]\nDo it.', tool_use_id: 'toolu_0400000004' }))
    expect(w.notices.at(-1)).toBe('tier=frontier → opus (brief) · attempt 1/3')
    expect(records(w, 'T-10')[0]?.requestedAlias).toBeUndefined()
  })
})

describe('GH-101: the queue never holds a phantom', () => {
  const brief = (task: string) => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard]]\nDo it.`
  const queueOf = (w: { state: Map<string, unknown> }) => (w.state.get('chassis-delegation.queue') ?? []) as Record<string, unknown>[]
  const BRIEFS = { options: { briefDir: `${SCRATCH}/briefs` } }
  const cardFiles = { [`${ROOT}/agents/tasks/${FIXTURE_CARD_NAME}`]: FIXTURE_CARD }
  const cardDirs = { [`${ROOT}/agents/tasks`]: [FIXTURE_CARD_NAME] }
  const offered = { 'delegation.agentTypes': ['general-purpose', 'backend', 'frontend'] }
  const TOOL = 'mcp__chassis-delegation__dispatch'

  test('(a) both workers hand back: the queued task is said ready once, the brain starts it, with a toast naming it (MOD-12)', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const queued = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queued.deny).toContain('queued: T-9 — the mod will tell you when a slot frees')
    await $.turn.complete(turnInput('agent-1', '[[report v=1 task=T-1 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    await $.turn.complete(turnInput('agent-2', '[[report v=1 task=T-2 subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]'))
    expect(w.spawns).toHaveLength(2)
    const ready = w.appended.filter(a => a.text.includes('ready: T-9 — run its spawn block'))
    expect(ready).toHaveLength(1)
    expect(queueOf(w).map(q => q.task)).toEqual(['T-9'])
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
    expect(w.toasts.some(t => /^T-9 started after \d+ min in queue$/.test(t))).toBe(true)
  })

  test('(b) a second dispatch of a queued task says already queued and queues nothing more', BRIEFS, async ($, on) => {
    const w = world(on, { files: cardFiles, dirs: cardDirs, listAgents: true, store: offered })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    const first = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(first.text).toContain('queued (position 1)')
    const again = resultText(await $.tool.call({ tool: TOOL, task: 'BE-101', scope: 'app/**' } as never))
    expect(again).toMatch(/queued: BE-101 — the mod will tell you when a slot frees; already queued since \d\d:\d\d \(position 1\)/)
    const viaCommand = await $.command.run(commandInput('BE-101 --scope app/**'))
    expect(viaCommand.text).toMatch(/already queued since \d\d:\d\d \(position 1\)/)
    expect(queueOf(w)).toHaveLength(1)
    expect(w.spawns).toHaveLength(2)
  })

  test('(c) a by-hand spawn of a queued task takes its queued place', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queueOf(w)).toHaveLength(1)
    // a worker dies with no turn.complete: the slot is free, nothing has drained yet
    const dead = w.agents.find(a => a.id === 'agent-1')
    if (dead) dead.status = 'completed'
    const res = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(res.deny).toBeUndefined()
    expect(w.spawns).toHaveLength(3)
    expect(queueOf(w)).toEqual([])
  })

  test('(d) the queued refusal names live agents and queued rows apart', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('BE-310'), tool_use_id: 'toolu_A0000001' }))
    const res = await $.agent.spawn(spawnInput({ prompt: brief('BE-314'), tool_use_id: 'toolu_B0000002' }))
    expect(res.deny).toBe('queued: BE-314 — the mod will tell you when a slot frees (1 live: BE-310; 1 queued: BE-314; limit: maxWorkers 1 from the host options) — queued: position 1 of 1 (maxWorkers 1 running)')
    expect(w.spawns).toHaveLength(1)
  })
})

describe('MOD-1: one proof of red per task, and --verify at the last attempt\'s own sha re-judges it', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** red_test="npx vitest run a/x.test.ts" gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: npx vitest run a/x.test.ts\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card for the red proof.\n'
  const WT = `${ROOT}-T-4`
  const RED_1 = '.delegation/T-4/red-1.txt'
  const RED_TEXT = 'FAIL a/x.test.ts\n  ✗ adds two numbers\n    AssertionError: expected 3 to be 4\n'
  const REPORT = (sha: string, red: string) => `[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=${sha} gate=pass red=${red} files=a/x.ts]]`
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const rows = (w: { appended: { type: string; text: string }[]; logs: string[] }) =>
    [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs].filter(t => t.startsWith('chassis-delegation: verdict='))
  const setup = (on: Parameters<typeof world>[0], gate: { v: number }) => {
    const repo = nativeRun({ gate: 0 })
    return world(on, {
      files: { [BRIEF]: HEADER + '\nbody', [`${WT}/${RED_1}`]: RED_TEXT, [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD },
      dirs: { [WT]: [], [`${WT}/.delegation/T-4`]: ['red-1.txt'], [`${ROOT}/agents/tasks`]: [CARD_NAME] },
      run: argv => (argv[0] === 'npx' ? { exitCode: gate.v, stdout: gate.v ? 'a/x.ts: not formatted\n' : '' } : argv[3] === 'diff' && !argv.includes('--name-status') ? { exitCode: 0, stdout: 'a/x.ts\n' } : repo(argv)),
      agentId: 'agent-4',
    })
  }

  test('--verify at the sha attempt 1 handed back re-judges attempt 1: no attempt 2, red held, no budget line', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 1 }
    const w = setup(on, gate)
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    expect(rows(w)[0]).toContain('verdict=refuted task=T-4 attempt=1/3')
    gate.v = 0
    const out = String((await $.command.run(commandInput('T-4 --verify 1234abcd'))).text)
    expect(out.split('\n')[0]).toBe('re-judging attempt 1/3 at 1234abcd')
    expect(out).toContain('claim red: held')
    expect(out).toContain('verdict=consistent task=T-4 attempt=1/3')
    expect(out).not.toContain('budget exhausted')
    expect(records(w, 'T-4').map(r => [r.attempt, r.verdict])).toEqual([[1, 'consistent']])
    expect(w.spawns).toHaveLength(1)
  })

  describe('MOD-147: a re-judge reads the newest red file', () => {
    const RED_2 = '.delegation/T-4/red-2.txt'
    const PASSING = 'PASS a/x.test.ts\n  ok adds two numbers\n'
    const FAILING = 'FAIL a/x.test.ts\n  \u2717 adds three numbers\n    AssertionError: expected 6 to be 7\n'
    const handBack = async ($: Parameters<typeof setup>[0] extends never ? never : any, w: ReturnType<typeof setup>) => {
      await $.session.start(sessionStart)
      await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
      await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
      expect(rows(w)[0]).toContain('verdict=unverified')
    }

    test('(1) a newer red-N.txt than the recorded one is the red the re-judge reads, said on a red: line', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = setup(on, { v: 0 })
      w.files.set(`${WT}/${RED_1}`, PASSING)
      await handBack($, w)
      w.files.set(`${WT}/${RED_2}`, FAILING)
      const out = String((await $.command.run(commandInput('T-4 --verify 1234abcd'))).text)
      const lines = out.split('\n')
      const redLine = lines.findIndex(l => l === `red: ${RED_2} (newer than the attempt's ${RED_1})`)
      expect(redLine).toBeGreaterThan(0)
      expect(lines[redLine + 1]).toMatch(/^\/dispatch T-4 --verify 1234abcd: no spawn/)
      expect(lines[redLine + 2]).toContain(`red=${RED_2}`)
      expect(out).not.toContain(`red=${RED_1}`)
      expect(out).not.toContain('claim red: unchecked')
      expect(records(w, 'T-4').map(r => [r.attempt, r.red])).toEqual([[1, RED_2]])
    })

    test('(2) no newer file: the recorded red is used and no red: line is printed', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = setup(on, { v: 0 })
      w.files.set(`${WT}/${RED_1}`, PASSING)
      await handBack($, w)
      const out = String((await $.command.run(commandInput('T-4 --verify 1234abcd'))).text)
      expect(out).not.toMatch(/^red: /m)
      expect(out).toContain(`red=${RED_1}`)
      expect(records(w, 'T-4').map(r => [r.attempt, r.red])).toEqual([[1, RED_1]])
    })

    test('(3) a verify at a new sha, not a re-judge, still takes the newest red and prints no red: line', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
      const w = setup(on, { v: 0 })
      w.files.set(`${WT}/${RED_1}`, PASSING)
      await handBack($, w)
      w.files.set(`${WT}/${RED_2}`, FAILING)
      const out = String((await $.command.run(commandInput('T-4 --verify 5678abcd'))).text)
      expect(out).not.toMatch(/^red: /m)
      expect(out).toContain(`red=${RED_2}`)
    })
  })

  test("a resume hand-back at a new sha whose red= is attempt 1's held file is held on red", { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const gate = { v: 1 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1234abcd', RED_1)))
    expect(rows(w)[0]).toContain('claim red: held')
    gate.v = 0
    await $.turn.complete(turnInput('agent-4', 'Docs.\n' + REPORT('5678abcd', RED_1)))
    expect(rows(w)[1]).toContain("claim red: held — attempt 1's proof, reused (one proof per task)")
    expect(rows(w)[1]).toContain('verdict=consistent task=T-4 attempt=2/3')
  })

  // MOD-41: the brain resumes a worker after a consistent verdict (SendMessage, not advised by the mod)
  // (the verdict rows: MOD-94's spawn row is the spawn's, not a judged attempt's)
  const ledgerRows = (w: { files: Map<string, string> }) =>
    (w.files.get(`${ROOT}/.delegation/ledger.jsonl`) ?? '').trim().split('\n').filter(Boolean).map(l => JSON.parse(l) as Record<string, unknown>).filter(r => r.event !== 'spawn')

  test('MOD-41: a hand-back at a new sha after a consistent verdict is attempt 2/3 and writes one ledger row; at the same sha again it writes nothing', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 0 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111', RED_1)))
    expect(rows(w)[0]).toContain('verdict=consistent task=T-4 attempt=1/3')
    expect(ledgerRows(w)).toHaveLength(1)
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222', RED_1)))
    expect(rows(w)).toHaveLength(2)
    expect(rows(w)[1]).toContain('verdict=consistent task=T-4 attempt=2/3')
    expect(ledgerRows(w)).toHaveLength(2)
    expect(ledgerRows(w)[1]).toMatchObject({ task: 'T-4', attempt: 2, kind: 'resume', verdict: 'consistent' })
    expect(records(w, 'T-4').map(r => [r.attempt, r.kind, r.lineage, r.verdict])).toEqual([[1, 'spawn', 1, 'consistent'], [2, 'resume', 1, 'consistent']])
    // the same hand-back again, and the first sha again: nothing new
    await $.turn.complete(turnInput('agent-4', 'Fixed.\n' + REPORT('2222222', RED_1)))
    expect(rows(w)).toHaveLength(2)
    expect(ledgerRows(w)).toHaveLength(2)
    expect(records(w, 'T-4')).toHaveLength(2)
  })

  test('MOD-41: a hand-back past the budget is judged, and its row says the budget is spent', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const gate = { v: 0 }
    const w = setup(on, gate)
    await $.agent.spawn(spawnInput({ prompt: `Your brief is the file ${BRIEF}.`, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Done.\n' + REPORT('1111111', RED_1)))
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('2222222', RED_1)))
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('3333333', RED_1)))
    gate.v = 1
    await $.turn.complete(turnInput('agent-4', 'Again.\n' + REPORT('4444444', RED_1)))
    expect(rows(w)).toHaveLength(4)
    expect(rows(w)[3]).toContain('verdict=refuted task=T-4 attempt=4/3')
    expect(rows(w)[3]).toContain('next=stop — budget exhausted')
    expect(ledgerRows(w)).toHaveLength(4)
  })
})

describe('GH-104: spend guards', () => {
  const BRIEF = `${ROOT}/.delegation/briefs/T-4.brief.md`
  const HEADER = '[[brief v=1 task=T-4 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** gate=prettier budget=3-attempts report=chassis.report.v1]]'
  const CARD_NAME = 'T-4-the-thing.md'
  const CARD = '---\nid: T-4\ntitle: The thing\ndomain: frontend\ntier: standard\nstatus: queued\nscope: [a/**]\nforbid: [b/**]\nred_test: none\ngate: prettier\nbudget: 3-attempts\n---\n## Why\nA card for the spend guards.\n'
  const WT = `${ROOT}-T-4`
  const BRANCH = 'agent/frontend/T-4'
  const HEAD = 'abcdef1' + '2'.repeat(33)
  const SHORT = HEAD.slice(0, 7)
  const GM = { gateMap: '{"prettier":"npx prettier --check {files}"}' }
  const PROMPT = `Your brief is the file ${BRIEF}. Read it whole, then follow it exactly.`
  const WORK_PRESENT = `work present at ${SHORT} on ${BRANCH}: verify it (next=verify sha=${HEAD})`
  /**
   * The worker's worktree, answered from memory: HEAD is HEAD on BRANCH, `ahead`
   * commits past origin/main (the base), the tree clean unless `dirty`, the delta
   * a/x.ts, the gate (npx …) red unless `gate` says otherwise.
   */
  const worker = (o: { ahead?: number; dirty?: boolean; gate?: number } = {}) => (argv: string[]): RunAnswer | undefined => {
    if (argv[0] === 'npx') return { exitCode: o.gate ?? 1, stdout: 'a/x.ts: not formatted\n' }
    if (argv[0] !== 'git') return undefined
    const sub = argv.slice(3)
    const last = sub[sub.length - 1] ?? ''
    if (sub[0] === 'rev-parse' && sub[1] === '--abbrev-ref') return { exitCode: 0, stdout: `${BRANCH}\n` }
    if (sub[0] === 'rev-parse' && last.endsWith('^{commit}')) return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'rev-parse' && last === 'origin/main') return { exitCode: 0, stdout: `${MB}\n` }
    if (sub[0] === 'rev-parse') return { exitCode: 0, stdout: `${HEAD}\n` }
    if (sub[0] === 'merge-base' && sub[1] !== '--is-ancestor') return { exitCode: 0, stdout: `${MB}\n` }
    // MOD-4: the work is not on origin/main yet (its owed row stays)
    if (sub[0] === 'merge-base' && last === 'origin/main') return { exitCode: 1, stdout: '' }
    // the delta as either spelling asks for it: --name-only (this base), --name-status (a rename-aware verifier)
    if (sub[0] === 'diff') return { exitCode: 0, stdout: sub.includes('--name-status') ? 'M\ta/x.ts\n' : 'a/x.ts\n' }
    if (sub[0] === 'log') return { exitCode: 0, stdout: Array.from({ length: o.ahead ?? 2 }, (_, i) => `${i + 3}`.repeat(40)).join('\n') + (o.ahead === 0 ? '' : '\n') }
    if (sub[0] === 'status') return { exitCode: 0, stdout: o.dirty ? ' M a/x.ts\n' : '' }
    return undefined
  }
  // The rows that reached the conversation (the kit logs a plugin's refused append), never the debug log.
  const posted = (w: { logs: string[]; debugLogs: string[]; appended: { type: string; text: string }[] }) => {
    const debug = new Set(w.debugLogs)
    // MOD-74: the started and handed-back rows are not verdict rows
    return [...w.appended.filter(a => a.type === 'user').map(a => a.text), ...w.logs.filter(l => !debug.has(l) && l.startsWith('chassis-delegation: '))].filter(t => !/^chassis-delegation: \S+ (started|resumed|started from queue|handed back) · /.test(t))
  }
  const files = () => ({ [BRIEF]: HEADER + '\nbody', [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD })
  const dirs = { [WT]: [], [`${ROOT}/agents/tasks`]: [CARD_NAME] }

  test('(a, c) a no-report then a respawn stays at the brief tier; the notice names the model and the attempt', async ($, on) => {
    const w = world(on, { files: files(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    expect(w.notices.at(-1)).toBe('tier=standard → sonnet (brief) · attempt 1/3')
    await $.turn.complete(turnInput('agent-4', 'I ran out of road.'))
    expect(records(w, 'T-4')[0]).toMatchObject({ attempt: 1, verdict: 'no-report' })
    // the brain respawns by hand: a no-report is a reporting defect, not a reason to go one tier up
    const r = await $.agent.spawn(spawnInput({ prompt: PROMPT, tool_use_id: 'toolu_02RESPAWN' }))
    expect(r.deny).toBeUndefined()
    expect(w.spawns[1]?.model).toBe('sonnet')
    expect(w.notices.at(-1)).toBe('tier=standard → sonnet (brief) · attempt 2/3')
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.tier, x.source])).toEqual([
      [1, 'spawn', 'standard', 'brief'],
      [2, 'spawn', 'standard', 'brief'],
    ])
    // the debug line keeps the tier source
    expect(w.debugLogs).toContain("chassis-delegation: T-4: tier=standard picked by the brief header's tier= (no classify call)")
  })

  test('(a) autoEscalate: no-report resumes, a second no-report advises a respawn at the SAME tier (MOD-12: the brain makes it)', { options: { verdictVerbosity: 'full', autoEscalate: true } }, async ($, on) => {
    const w = world(on, { files: files(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT }))
    await $.turn.complete(turnInput('agent-4', 'Working on it.'))
    expect(w.sent).toHaveLength(1)
    await $.turn.complete(turnInput('agent-4', 'Still working on it.'))
    expect(posted(w)[1]?.split('\n')[0]).toBe(`chassis-delegation: verdict=no-report task=T-4 attempt=2/3 usd=~0.00 model=claude-sonnet-5-5 next=respawn at standard — same brief ${BRIEF}, make the spawn block below (it names the model)`)
    // the row carries the spawn block at the same tier; the brain makes it
    expect(spawnCallOf(posted(w)[1] ?? '')).toMatchObject({ model: 'sonnet', description: 'T-4 standard sonnet' })
    expect(w.spawns).toHaveLength(1)
    await brainSpawn($, posted(w)[1] ?? '', { tool_use_id: 'toolu_03RESPAWN' })
    expect(w.spawns[1]?.model).toBe('sonnet')
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.tier, x.source, x.verdict])).toEqual([
      [1, 'spawn', 'standard', 'brief', 'no-report'],
      [2, 'resume', 'standard', 'resume', 'no-report'],
      [3, 'spawn', 'standard', 'brief', 'pending'],
    ])
  })

  test('(b) work present in the worktree (commits ahead of the base, a clean tree): no resume, no respawn; the row says verify it', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    // the worker finished, but its report line never reached the mod
    await $.turn.complete(turnInput('agent-4', 'All done, the gate is green.'))
    expect(w.sent).toHaveLength(0)
    expect(w.spawns).toHaveLength(1)
    const row = posted(w)[0] ?? ''
    expect(row.split('\n')[0]).toBe(`chassis-delegation: T-4 attempt 1/3 no-report · 🔵 sonnet · ~$0.00 · next=verify sha=${HEAD}`)
    expect(row).toContain(WORK_PRESENT)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict, x.sha ?? null])).toEqual([
      [1, 'spawn', 'no-report', null],
      [2, 'verify', 'work-present', HEAD],
    ])
    // only allowlisted git reads, in the worker's worktree
    expect(w.runs.every(x => x.argv[0] === 'git' && (x.argv[2] === WT ? ['rev-parse', 'status', 'log'] : ['ls-tree']).includes(x.argv[3] ?? ''))).toBe(true) // MOD-60: the merged check lists origin/main's cards from the repo root
    // the delegation state says what is owed
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''
    expect(section).toContain(`- owed: T-4: verify sha=${HEAD}`)
    // a respawn by hand is not spawned either, and records nothing new
    const again = await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT, tool_use_id: 'toolu_02AGAIN' }))
    expect(again.deny).toContain(WORK_PRESENT)
    expect(w.spawns).toHaveLength(1)
    expect(records(w, 'T-4')).toHaveLength(2)
  })

  // MOD-4: an owed row retires by itself when the work is on origin/main, or by hand
  const delegationCmd = (args: string) => ({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
  const owedWorkPresent = async ($: any, on: any, ancestor: number) => {
    const base = worker()
    const w = world(on, { files: files(), dirs, run: argv => (argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: ancestor, stdout: '' } : base(argv)), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done, the gate is green.'))
    return w
  }

  test('MOD-4: after an owed attempt whose sha is an ancestor of origin/main, /delegation prints no row for it and the record says retired: merged', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 0)
    await $.session.start(sessionStart)
    const out = String((await $.command.run(delegationCmd(''))).text)
    expect(out).not.toContain('owed: T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'merged' })
    expect(w.runs.some(x => x.argv.includes('--is-ancestor') && x.argv.includes('origin/main') && x.argv.includes(HEAD))).toBe(true)
    const section = (await $.prompt.compose(composeInput(['Agent']))).sections.at(-1)?.text ?? ''
    expect(section).not.toContain('T-4')
  })

  test('MOD-4: a sha that is not on origin/main keeps its row, and the check runs once per 15 minutes', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 1)
    await $.session.start(sessionStart)
    expect(String((await $.command.run(delegationCmd(''))).text)).toContain(`- owed: T-4: verify sha=${HEAD}`)
    // MOD-154: a carded task's owed row carries no ad hoc hint
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('ad hoc: clears')
    const n = () => w.runs.filter(x => x.argv.includes('--is-ancestor')).length
    const first = n()
    expect(first).toBeGreaterThan(0)
    await $.command.run(delegationCmd(''))
    expect(n()).toBe(first)
  })

  test('MOD-4: /delegation accept <id> [note] records it on the last attempt, retires the row, prints one line; an unknown id changes nothing', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWorkPresent($, on, 1)
    await $.session.start(sessionStart)
    const before = JSON.stringify(records(w, 'T-4'))
    const none = String((await $.command.run(delegationCmd('accept NOPE-9 fine'))).text)
    expect(none.split('\n')).toHaveLength(1)
    expect(JSON.stringify(records(w, 'T-4'))).toBe(before)
    const out = String((await $.command.run(delegationCmd('accept T-4 reviewed by hand'))).text)
    expect(out.split('\n')).toHaveLength(1)
    expect(out).toContain('T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'reviewed by hand' } })
    expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
  })

  // MOD-101 (#158): work cherry-picked onto the session's current branch retires the row; accept takes several ids or --owed
  const cherryRun = (answer: string) => {
    const base = worker()
    return (argv: string[]): RunAnswer | undefined =>
      argv[3] === 'merge-base' && argv[4] === '--is-ancestor' ? { exitCode: 1, stdout: '' } : argv[3] === 'log' && argv.includes('--cherry-mark') ? { exitCode: 0, stdout: answer } : base(argv)
  }
  const owedWith = async ($: any, on: any, run: (argv: string[]) => RunAnswer | undefined, f = files()) => {
    const w = world(on, { files: f, dirs, run, agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done, the gate is green.'))
    await $.session.start(sessionStart)
    return w
  }

  test('MOD-101: a sha whose patch is on the current branch by cherry-pick (the cherry log marks it =) retires the owed row', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWith($, on, cherryRun(`=${'1'.repeat(40)}\n`))
    const out = String((await $.command.run(delegationCmd(''))).text)
    expect(out).not.toContain('owed: T-4')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'merged' })
    expect(w.runs.some(x => x.argv[3] === 'log' && x.argv.includes('--cherry-mark') && x.argv.includes(`HEAD...${HEAD}`))).toBe(true)
  })

  test('MOD-101: a sha whose patch is not on the current branch (the cherry log marks it >) stays owed', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWith($, on, cherryRun(`=${'1'.repeat(40)}\n>${HEAD}\n`))
    expect(String((await $.command.run(delegationCmd(''))).text)).toContain(`- owed: T-4: verify sha=${HEAD}`)
    expect(records(w, 'T-4').at(-1)?.retired).toBeUndefined()
  })

  for (const status of ['merged', 'landed']) {
    test(`MOD-101: a card reading ${status} in the working tree retires the row`, { options: { autoEscalate: true, ...GM } }, async ($, on) => {
      const w = await owedWith($, on, cherryRun(`>${HEAD}\n`), { ...files(), [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD.replace('status: queued', `status: ${status}`) })
      expect(String((await $.command.run(delegationCmd(''))).text)).not.toContain('owed: T-4')
      expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'merged' })
    })
  }

  test('MOD-101: /delegation accept A B C [note] retires each named id, one line per id; an unknown id says so and the rest retire', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWith($, on, cherryRun(`>${HEAD}\n`))
    const t4 = records(w, 'T-4')
    w.store.set(`delegation.tasks.T-5@${ROOT}`, t4.map(r => ({ ...r, task: 'T-5' })))
    const out = String((await $.command.run(delegationCmd('accept T-4 NOPE-9 T-5 landed by hand'))).text).split('\n')
    expect(out).toHaveLength(3)
    expect(out[0]).toContain('T-4')
    expect(out[1]).toContain('NOPE-9')
    expect(out[1]).toContain('no attempts recorded')
    expect(out[2]).toContain('T-5')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'landed by hand' } })
    expect(records(w, 'T-5').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'landed by hand' } })
    const again = String((await $.command.run(delegationCmd('accept T-4 T-5'))).text).split('\n')
    expect(again).toHaveLength(2)
    expect(again[0]).toContain('already')
  })

  test('MOD-101: /delegation accept --owed [note] retires every owed row of the session and says how many', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWith($, on, cherryRun(`>${HEAD}\n`))
    const recentKey = [...w.store.keys()].find(k => k.startsWith('delegation.recent'))
    expect(recentKey).toBeDefined()
    w.store.set(`delegation.tasks.T-5@${ROOT}`, records(w, 'T-4').map(r => ({ ...r, task: 'T-5' })))
    w.store.set(recentKey as string, [...((w.store.get(recentKey as string) ?? []) as object[]), { task: 'T-5', attempt: 1, verdict: 'work-present', line: 'x', at: Date.now(), owed: 'T-5: verify sha=abc' }])
    const out = String((await $.command.run(delegationCmd('accept --owed swept'))).text)
    expect(out).toContain('retired 2')
    expect(records(w, 'T-4').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'swept' } })
    expect(records(w, 'T-5').at(-1)).toMatchObject({ retired: 'accepted' })
    expect(String((await $.command.run(delegationCmd('accept --owed'))).text)).toContain('retired 0')
  })

  test('MOD-101: /delegation accept OPS-1 landed by hand is still one id with the note', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = await owedWith($, on, cherryRun(`>${HEAD}\n`))
    w.store.set(`delegation.tasks.OPS-1@${ROOT}`, records(w, 'T-4').map(r => ({ ...r, task: 'OPS-1' })))
    const out = String((await $.command.run(delegationCmd('accept OPS-1 landed by hand'))).text)
    expect(out.split('\n')).toHaveLength(1)
    expect(records(w, 'OPS-1').at(-1)).toMatchObject({ retired: 'accepted', accepted: { note: 'landed by hand' } })
  })

  test('(b) /dispatch --verify <sha> runs the verifier on the branch head with a synthetic report, no spawn; the work-present attempt takes the verdict', { options: { verdictVerbosity: 'full', autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker({ gate: 0 }), agentId: 'agent-4' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'All done.'))
    expect(records(w, 'T-4').at(-1)).toMatchObject({ attempt: 2, verdict: 'work-present' })
    const out = String((await $.command.run(commandInput(`T-4 --verify ${HEAD}`))).text)
    expect(out).toContain(`[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${HEAD} gate=pass files=a/x.ts]]`)
    expect(out).toContain('chassis-delegation: verdict=consistent task=T-4 attempt=2/3')
    expect(out).toContain('next=accept')
    expect(out).toContain('claim files: held — files= matches the sha delta exactly')
    expect(w.runs.filter(x => x.argv[0] === 'npx').map(x => x.cwd)).toEqual([WT])
    expect(w.spawns).toHaveLength(1)
    expect(w.sent).toHaveLength(0)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict])).toEqual([
      [1, 'spawn', 'no-report'],
      [2, 'verify', 'consistent'],
    ])
  })

  test('(b) --verify with no work-present attempt judges a new verify attempt; a red gate refutes it, nothing spawns', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)
    expect(out).toContain(`/dispatch T-4 --verify ${SHORT}: no spawn — the verifier ran on worktree ${WT} at ${SHORT} (base origin/main)`)
    expect(out).toContain('chassis-delegation: verdict=refuted task=T-4 attempt=1/3')
    expect(out).toContain(`claim gate: failed — gate=pass claimed but the gate is RED at ${SHORT} (exit 1; output /repo/acme-app/.delegation/T-4/verify-gate-1.txt)`)
    expect(out).toContain(`next=respawn at frontier — same brief ${BRIEF}`)
    expect(records(w, 'T-4').map(x => [x.attempt, x.kind, x.verdict, x.sha])).toEqual([[1, 'verify', 'refuted', SHORT]])
    expect(w.spawns).toHaveLength(0)
  })

  test('(b) --verify waits for a worker still running in the tree; a bad sha or a missing brief is refused before any git runs', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4', listAgents: true })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    const runs = w.runs.length
    expect(String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)).toBe(`/dispatch T-4 --verify ${SHORT}: attempt 1 of T-4 is still running (agent agent-4); --verify judges finished work`)
    expect(String((await $.command.run(commandInput('T-4 --verify HEAD'))).text)).toBe('refused --verify HEAD: name the branch head as a 7-40 character hex sha')
    w.files.delete(BRIEF)
    expect(String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)).toContain(`/dispatch T-4 --verify ${SHORT}: no brief for T-4 under ${ROOT}/.delegation/briefs`)
    expect(w.runs.length).toBe(runs)
    expect(records(w, 'T-4')).toHaveLength(1)
  })

  test('(b) the sha the verifier already judged is not work present: a refuted attempt is still resumed', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', `Done.\n[[report v=1 task=T-4 subtask=main branch=${BRANCH} pr=none sha=${SHORT} gate=pass files=a/x.ts]]`))
    expect(records(w, 'T-4')[0]).toMatchObject({ verdict: 'refuted', sha: SHORT })
    expect(w.sent).toHaveLength(1)
    expect(posted(w)[0]).not.toContain('work present')
  })

  test('(b) a dirty tree is not work present: resumed as before', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const dirty = world(on, { files: files(), dirs, run: worker({ dirty: true }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Half done.'))
    expect(dirty.sent).toHaveLength(1)
    expect(records(dirty, 'T-4').map(x => x.verdict)).toEqual(['no-report', 'pending'])
  })

  test('(b) no commits ahead of the base: resumed as before', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const w = world(on, { files: files(), dirs, run: worker({ ahead: 0 }), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: WT }))
    await $.turn.complete(turnInput('agent-4', 'Nothing yet.'))
    expect(w.sent).toHaveLength(1)
  })

  test('(b) repo=here: no look at the worktree, the resume goes ahead', { options: { autoEscalate: true, ...GM } }, async ($, on) => {
    const here = HEADER.replace(' budget=', ' repo=here budget=')
    const w = world(on, { files: { ...files(), [BRIEF]: here + '\nbody' }, dirs, run: worker(), agentId: 'agent-4' })
    await $.agent.spawn(spawnInput({ prompt: PROMPT, cwd: ROOT }))
    await $.turn.complete(turnInput('agent-4', 'All done.'))
    expect(w.sent).toHaveLength(1)
    expect(w.runs.some(x => x.argv[3] === 'log')).toBe(false)
  })

  test('(c) /dispatch line 4 names the model and the attempt', { options: { ...GM } }, async ($, on) => {
    const w = world(on, { files: { [`${ROOT}/agents/tasks/${CARD_NAME}`]: CARD }, dirs: { [`${ROOT}/agents/tasks`]: [CARD_NAME] }, agentId: 'agent-7' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(commandInput('T-4'))).text)
    expect(out).toMatch(/^4\. spawn prepared: general-purpose on sonnet · tier=standard \(brief\) · attempt 1\/3 — nothing runs until the Agent call below is made$/m)
    expect(w.spawns).toHaveLength(0)
    await brainSpawn($, out)
    expect(w.spawns[0]?.model).toBe('sonnet')
  })

  test('MOD-170: the lead appends a held scope+= block, then dispatch verify=<sha> judges the work consistent', { options: { verdictVerbosity: 'full', ...GM } }, async ($, on) => {
    const AMEND_C = '[[amend v=1 scope+=c/x.ts reason=the helper lives in c]]'
    const run = worker({ gate: 0 })
    const wide = (argv: string[]): RunAnswer | undefined =>
      argv[3] === 'diff' ? { exitCode: 0, stdout: argv.includes('--name-status') ? 'M\ta/x.ts\nM\tc/x.ts\n' : 'a/x.ts\nc/x.ts\n' } : run(argv)
    const w = world(on, { files: { ...files(), [`${ROOT}/.chassis-delegation.json`]: '{"scopeAmends":"ask"}' }, dirs, run: wide })
    await $.session.start(sessionStart)
    const refuted = String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)
    expect(refuted).toContain('claim scope: failed — out-of-scope path: c/x.ts')
    w.files.set(BRIEF, HEADER + '\nbody\n' + AMEND_C + '\n')
    const out = String((await $.command.run(commandInput(`T-4 --verify ${SHORT}`))).text)
    expect(out).toContain('verdict=consistent task=T-4')
    expect(out).toContain('amendment: #1 scope+=c/x.ts')
  })
})
