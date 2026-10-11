// MOD-17: the settings.json hook fallback, bin/chassis-hook.mjs, driven the way
// Claude Code drives a command hook: the hook input as JSON on stdin, the
// answer as JSON on stdout. The wrapper runs in a child `node` that has none of
// this suite's flags (no loader), against REAL git repositories built under
// tests/.tmp/. Node only. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const TMP = fileURLToPath(new URL('../.tmp/', import.meta.url))
const BIN = fileURLToPath(new URL('../../bin/chassis-hook.mjs', import.meta.url))
const GATE_MAP = { check: 'bash gate.sh' }

/** Setup only: a fixed identity, no hooks, no signing. */
function sh(dir, ...args) {
  return execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' }).trim()
}

function write(dir, path, text) {
  const full = join(dir, path)
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
  writeFileSync(full, text)
}

/**
 * A repo whose main carries README.md, gate.sh and the repo file (gate map
 * `check` = bash gate.sh). `agent/x/y` is a branch off main; `agent/ops/T-1`
 * carries src/a.ts then docs/x.md and is checked out. The gate passes while
 * src/a.ts exists.
 */
function makeRepo() {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'bin-'))
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  write(dir, 'README.md', '# t\n')
  write(dir, 'gate.sh', 'test -f src/a.ts\n')
  write(dir, '.chassis-delegation.json', JSON.stringify({ gateMap: GATE_MAP }))
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'base')
  sh(dir, 'branch', 'agent/x/y')
  sh(dir, 'checkout', '-q', '-b', 'agent/ops/T-1')
  write(dir, 'src/a.ts', 'export const a = 1\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'one')
  write(dir, 'docs/x.md', 'x\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'two')
  return { dir, sha: sh(dir, 'rev-parse', '--short', 'HEAD') }
}

const header = (extra = '') => `[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=secrets/** gate=check budget=2-attempts${extra} report=chassis.report.v1]]`
const reportLine = (sha, f = {}) => `[[report v=1 task=T-1 subtask=main branch=${f.branch ?? 'agent/ops/T-1'} pr=none sha=${sha} gate=${f.gate ?? 'pass'} files=${f.files ?? 'src/a.ts,docs/x.md'}]]`

/** The brief as a file outside the repo (the prompt names its path). */
function writeBrief(text = `${header()}\n\nbody\n`) {
  const path = join(mkdtempSync(join(TMP, 'brief-')), 'T-1.brief.md')
  writeFileSync(path, text)
  return path
}

const agentCall = (cwd, prompt, answer) => ({
  session_id: 's1',
  transcript_path: '/dev/null',
  cwd,
  hook_event_name: 'PostToolUse',
  tool_name: 'Agent',
  tool_input: { description: 'T-1', prompt, subagent_type: 'general-purpose' },
  tool_response: { status: 'completed', content: [{ type: 'text', text: answer }] },
  tool_use_id: 'toolu_1',
})

const bashCall = (cwd, command) => ({
  session_id: 's1',
  transcript_path: '/dev/null',
  cwd,
  hook_event_name: 'PreToolUse',
  tool_name: 'Bash',
  tool_input: { command },
  tool_use_id: 'toolu_2',
})

/** `node bin/chassis-hook.mjs <mode>` with the input on stdin and no flags of this suite's. */
function hook(mode, input) {
  const env = { ...process.env }
  delete env.NODE_OPTIONS
  const r = spawnSync(process.execPath, [BIN, mode], { input: typeof input === 'string' ? input : JSON.stringify(input), encoding: 'utf8', env, timeout: 120000 })
  return { code: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
}

/** The additional context a post-agent run printed, in the engine's settings-hook shape. */
function contextOf(r) {
  expect(r.code).toBe(0)
  const out = JSON.parse(r.stdout)
  expect(out.hookSpecificOutput.hookEventName).toBe('PostToolUse')
  expect(typeof out.hookSpecificOutput.additionalContext).toBe('string')
  return out.hookSpecificOutput.additionalContext
}

const cleanup = (...dirs) => dirs.forEach(d => rmSync(d, { recursive: true, force: true }))

describe('MOD-17: post-agent (PostToolUse on Agent)', () => {
  test('a matching report: a consistent row as additional context', () => {
    const { dir, sha } = makeRepo()
    const brief = writeBrief()
    try {
      const r = hook('post-agent', agentCall(dir, `Your brief is the file ${brief}. Follow it exactly.`, `Done.\n${reportLine(sha)}`))
      const ctx = contextOf(r)
      expect(ctx).toContain('chassis-delegation: verdict=consistent task=T-1')
      expect(ctx).toContain('claim files: held — files= matches the sha delta exactly')
      expect(ctx).toContain(`claim gate: held — gate green at ${sha} (gate=pass confirmed)`)
      expect(r.stderr).toBe('')
    } finally {
      cleanup(dir, join(brief, '..'))
    }
  })

  test('a report naming a file outside the delta: a refute, naming it', () => {
    const { dir, sha } = makeRepo()
    const brief = writeBrief()
    try {
      const ctx = contextOf(hook('post-agent', agentCall(dir, `Your brief is the file ${brief}.`, reportLine(sha, { files: 'src/a.ts,docs/x.md,src/ghost.ts' }))))
      expect(ctx).toContain('verdict=refuted task=T-1')
      expect(ctx).toContain('claim files: failed')
      expect(ctx).toContain('src/ghost.ts')
    } finally {
      cleanup(dir, join(brief, '..'))
    }
  })

  test('no report in the result: nothing printed, exit 0', () => {
    const { dir } = makeRepo()
    const brief = writeBrief()
    try {
      const r = hook('post-agent', agentCall(dir, `Your brief is the file ${brief}.`, 'I looked around and have nothing to report.'))
      expect(r.code).toBe(0)
      expect(r.stdout).toBe('')
    } finally {
      cleanup(dir, join(brief, '..'))
    }
  })

  test('the LAST report of the result is the one verified', () => {
    const { dir, sha } = makeRepo()
    const brief = writeBrief()
    try {
      const text = `first try ${reportLine('deadbeef')}\nthen fixed:\n${reportLine(sha)}`
      expect(contextOf(hook('post-agent', agentCall(dir, `Your brief is the file ${brief}.`, text)))).toContain('verdict=consistent task=T-1')
    } finally {
      cleanup(dir, join(brief, '..'))
    }
  })

  test('an inline [[brief …]] header in the prompt is the brief', () => {
    const { dir, sha } = makeRepo()
    try {
      const prompt = `${header()}\n\nDo the thing in the worktree.\n`
      expect(contextOf(hook('post-agent', agentCall(dir, prompt, reportLine(sha))))).toContain('verdict=consistent task=T-1')
    } finally {
      cleanup(dir)
    }
  })

  test('the report is verified in the worker\'s own worktree, found from the main checkout by its branch', () => {
    const { dir, sha } = makeRepo()
    const brief = writeBrief()
    const wt = join(mkdtempSync(join(TMP, 'wt-')), 'tree')
    try {
      sh(dir, 'checkout', '-q', 'main')
      sh(dir, 'worktree', 'add', '-q', wt, 'agent/ops/T-1')
      const ctx = contextOf(hook('post-agent', agentCall(dir, `Your brief is the file ${brief}.`, reportLine(sha))))
      expect(ctx).toContain('verdict=consistent task=T-1')
      expect(ctx).toContain(`claim gate: held — gate green at ${sha}`)
    } finally {
      cleanup(dir, join(brief, '..'), join(wt, '..'))
    }
  })

  test('a report with no brief at all: only the git claims are checked, a fabricated sha is refuted', () => {
    const { dir } = makeRepo()
    try {
      const ctx = contextOf(hook('post-agent', agentCall(dir, 'Look into the build and report back.', reportLine('deadbeef'))))
      expect(ctx).toContain('verdict=refuted')
      expect(ctx).toContain('fabrication')
    } finally {
      cleanup(dir)
    }
  })

  test('a brief with repo=none is said to be engine-only, not consistent', () => {
    const { dir, sha } = makeRepo()
    const brief = writeBrief(`${header(' repo=none')}\n\nbody\n`)
    try {
      const ctx = contextOf(hook('post-agent', agentCall(dir, `Your brief is the file ${brief}.`, reportLine(sha))))
      expect(ctx).toContain('verdict=unverified task=T-1')
      expect(ctx).toContain('repo=none')
    } finally {
      cleanup(dir, join(brief, '..'))
    }
  })

  test('a result that is not an Agent call, or input that is not JSON: nothing printed, exit 0', () => {
    const { dir, sha } = makeRepo()
    try {
      const other = { ...agentCall(dir, 'x', reportLine(sha)), tool_name: 'Bash' }
      expect(hook('post-agent', other)).toMatchObject({ code: 0, stdout: '' })
      expect(hook('post-agent', 'not json at all')).toMatchObject({ code: 0, stdout: '' })
      expect(hook('post-agent', '')).toMatchObject({ code: 0, stdout: '' })
    } finally {
      cleanup(dir)
    }
  })
})

describe('MOD-17: pre-bash (PreToolUse on Bash)', () => {
  const denied = r => {
    expect(r.code).toBe(0)
    const out = JSON.parse(r.stdout)
    expect(out.hookSpecificOutput.hookEventName).toBe('PreToolUse')
    expect(out.hookSpecificOutput.permissionDecision).toBe('deny')
    return out.hookSpecificOutput.permissionDecisionReason
  }

  test('git commit on main: a deny carrying the guard\'s own reason', () => {
    const { dir } = makeRepo()
    try {
      sh(dir, 'checkout', '-q', 'main')
      expect(denied(hook('pre-bash', bashCall(dir, 'git commit -m x')))).toBe('chassis-delegation: no commit on main; branch first (git checkout -b agent/<domain>/<id>)')
    } finally {
      cleanup(dir)
    }
  })

  test('git commit on agent/x/y: nothing printed, exit 0', () => {
    const { dir } = makeRepo()
    try {
      sh(dir, 'checkout', '-q', 'agent/x/y')
      expect(hook('pre-bash', bashCall(dir, 'git commit -m x'))).toMatchObject({ code: 0, stdout: '' })
    } finally {
      cleanup(dir)
    }
  })

  test('the repo is the one the command runs in: cd and -C are followed from another folder', () => {
    const { dir } = makeRepo()
    try {
      sh(dir, 'checkout', '-q', 'main')
      expect(denied(hook('pre-bash', bashCall(TMP, `cd ${dir} && git commit -m x`)))).toContain('no commit on main')
      expect(denied(hook('pre-bash', bashCall(TMP, `git -C ${dir} commit -m x`)))).toContain('no commit on main')
    } finally {
      cleanup(dir)
    }
  })

  test('a push that names main is denied from any branch; a read-only git command and a non-git command pass', () => {
    const { dir } = makeRepo()
    try {
      expect(denied(hook('pre-bash', bashCall(dir, 'git push origin main')))).toContain('no push on main')
      sh(dir, 'checkout', '-q', 'main')
      expect(hook('pre-bash', bashCall(dir, 'git status && git log --oneline'))).toMatchObject({ code: 0, stdout: '' })
      expect(hook('pre-bash', bashCall(dir, 'ls -la'))).toMatchObject({ code: 0, stdout: '' })
    } finally {
      cleanup(dir)
    }
  })

  test('a folder that is no repository, a non-Bash call, and input that is not JSON: nothing printed, exit 0', () => {
    const plain = mkdtempSync(join(TMP, 'plain-'))
    try {
      expect(hook('pre-bash', bashCall(plain, 'git commit -m x'))).toMatchObject({ code: 0, stdout: '' })
      expect(hook('pre-bash', { ...bashCall(plain, 'git commit -m x'), tool_name: 'Read' })).toMatchObject({ code: 0, stdout: '' })
      expect(hook('pre-bash', 'not json at all')).toMatchObject({ code: 0, stdout: '' })
    } finally {
      cleanup(plain)
    }
  })
})

describe('MOD-17: the modes', () => {
  test('an unknown mode, or none, is an error that blocks nothing', () => {
    const r = hook('nonsense', {})
    expect(r.code).toBe(1)
    expect(r.stdout).toBe('')
    expect(r.stderr).toContain('post-agent')
    expect(r.stderr).toContain('pre-bash')
  })
})

describe('MOD-17: tests/selfcheck.sh', () => {
  const SELFCHECK = fileURLToPath(new URL('../selfcheck.sh', import.meta.url))
  const ROOT = fileURLToPath(new URL('../../', import.meta.url)).replace(/\/$/, '')

  /** selfcheck.sh with a stand-in `claude` (and a `node` that runs nothing, or the suite would run itself) first on PATH. */
  function selfcheck(claudeTest) {
    const bin = mkdtempSync(join(TMP, 'fakebin-'))
    writeFileSync(join(bin, 'claude'), `#!/bin/sh\ncase "$2" in\n  validate) exit 0 ;;\n  test) ${claudeTest} ;;\nesac\n`)
    writeFileSync(join(bin, 'node'), '#!/bin/sh\necho v0.0.0-stand-in\n')
    chmodSync(join(bin, 'claude'), 0o755)
    chmodSync(join(bin, 'node'), 0o755)
    try {
      const r = spawnSync('/bin/bash', [SELFCHECK], { encoding: 'utf8', env: { PATH: `${bin}:/usr/bin:/bin`, HOME: process.env.HOME ?? '/' }, timeout: 120000 })
      return { code: r.status, out: `${r.stdout ?? ''}${r.stderr ?? ''}` }
    } finally {
      cleanup(bin)
    }
  }

  test('the rollout switch off: it prints the two settings.json entries, with this folder in them', () => {
    mkdirSync(TMP, { recursive: true })
    const r = selfcheck('echo "hooks modules are turned off in this process: the rollout switch served off"; exit 1')
    expect(r.code).toBe(0)
    expect(r.out).toContain('"matcher": "Agent|Task"')
    expect(r.out).toContain('"matcher": "Bash"')
    expect(r.out).toContain(`node \\"${ROOT}/bin/chassis-hook.mjs\\" post-agent`)
    expect(r.out).toContain(`node \\"${ROOT}/bin/chassis-hook.mjs\\" pre-bash`)
    // what it prints is JSON a person can paste
    const json = r.out.slice(r.out.indexOf('{\n  "hooks"'), r.out.indexOf('\n}\n', r.out.indexOf('{\n  "hooks"')) + 2)
    expect(JSON.parse(json).hooks.PreToolUse[0].matcher).toBe('Bash')
  })

  test('the switch on and the tests passing: the entries are not printed', () => {
    mkdirSync(TMP, { recursive: true })
    const r = selfcheck('echo ok; exit 0')
    expect(r.code).toBe(0)
    expect(r.out).not.toContain('chassis-hook.mjs')
  })
})
