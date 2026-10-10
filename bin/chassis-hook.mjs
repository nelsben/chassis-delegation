#!/usr/bin/env node
// MOD-17: the settings.json fallback. Two ordinary command hooks that carry the
// parts of the mod that are pure functions to a host where the mod engine does
// not load (the rollout switch serves off, or the host cannot load a hooks
// module): the native verifier after an Agent call, the git guard before a Bash
// call. No scheduler, no ladder, no queue, no runners, no state: a verdict row
// and a deny, nothing else.
//
//   node bin/chassis-hook.mjs post-agent   PostToolUse on Agent: verify the worker's
//                                          last [[report …]] against its brief and
//                                          print the verdict row as additional context
//   node bin/chassis-hook.mjs pre-bash     PreToolUse on Bash: deny a git commit, merge,
//                                          cherry-pick, rebase or push on a guarded branch
//
// The hook input is JSON on stdin, the answer JSON on stdout (the shape of a
// settings command hook's hookSpecificOutput); nothing to say prints nothing
// and exits 0. Exit 1 is a hook error that blocks nothing.
//
// Needs only a node on PATH with type stripping (22.18 or newer, where it is on
// by default): the libraries it reads are the mod's own hooks/lib/*.ts, loaded
// through bin/ts-resolve.mjs. Every command it runs (read-only git, the repo's
// gate) first passes hooks/lib/allow.ts with the repo file's gate map, exactly
// as in the engine; it never pushes, installs or fetches.
import { register } from 'node:module'
import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { dirname, join } from 'node:path'

const MODES = ['post-agent', 'pre-bash']
const GATE_TIMEOUT_MS = 9 * 60 * 1000
const GIT_TIMEOUT_MS = 30 * 1000
const AGENT_TOOLS = ['Agent', 'Task']
const NEXT = {
  verified: 'accept',
  unverified: 'check the unchecked claims before accepting',
  refuted: 'send the worker back with these lines',
  refused: 'fix the brief',
}

const isObject = v => v !== null && typeof v === 'object' && !Array.isArray(v)

/** Every string of a tool result in reading order, the worker's echoed prompt left out. */
function textOf(v, depth = 0) {
  if (typeof v === 'string') return v
  if (depth > 6) return ''
  if (Array.isArray(v)) return v.map(x => textOf(x, depth + 1)).filter(Boolean).join('\n')
  if (isObject(v)) return Object.entries(v).filter(([k]) => k !== 'prompt').map(([, x]) => textOf(x, depth + 1)).filter(Boolean).join('\n')
  return ''
}

async function readStdin() {
  if (process.stdin.isTTY) return ''
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8')
}

/** The mod's pure libraries, read through the .ts resolver; nothing is fetched. */
async function loadLibs() {
  // Node's own warning that type stripping is experimental (22.18 to 23.x) goes to stderr: not wanted per hook call.
  process.removeAllListeners('warning')
  register('./ts-resolve.mjs', import.meta.url)
  const at = name => import(new URL(`../hooks/lib/${name}.ts`, import.meta.url).href)
  const [allow, brief, gates, gitguard, paths, repoconfig, verify] = await Promise.all(
    ['allow', 'brief', 'gates', 'gitguard', 'paths', 'repoconfig', 'verify-native'].map(at),
  )
  return { ...allow, ...brief, ...gates, ...gitguard, ...paths, ...repoconfig, ...verify }
}

/**
 * What the two modes share: a `run` that is the ONLY way a command starts and
 * refuses any argv the allowlist does not take, and the repo file's config.
 * `allow` is filled once the repo file is read; until then only what the
 * allowlist takes with no gate map (read-only git) can run.
 */
function makeEnv(lib, base) {
  const env = { base, root: undefined, cfg: lib.mergeConfig({}, {}), allow: {}, configFrom: undefined }
  env.run = async (argv, init = {}) => {
    const check = lib.checkArgv(argv, env.allow)
    if (!check.ok) return { ok: false, why: `refused: ${check.reason}` }
    const r = spawnSync(argv[0], argv.slice(1), {
      cwd: init.cwd,
      encoding: 'utf8',
      timeout: init.timeoutMs ?? GIT_TIMEOUT_MS,
      maxBuffer: 64 * 1024 * 1024,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, GIT_OPTIONAL_LOCKS: '0' },
    })
    if (r.error) return { ok: false, why: String(r.error.message ?? r.error) }
    if (r.status === null) return { ok: false, why: `${argv[0]} was stopped (${r.signal ?? 'no exit code'})` }
    return { ok: true, exitCode: r.status, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
  }
  env.git = async (dir, ...args) => {
    const r = await env.run(['git', '-C', dir, ...args])
    return r.ok && r.exitCode === 0 ? r.stdout : undefined
  }
  /** The repo file at `dir`, if it has one: gate map and the rest, with the allowlist rebuilt from it. */
  env.useConfig = dir => {
    const path = join(dir, lib.REPO_CONFIG_FILE)
    if (!existsSync(path)) return false
    let text
    try {
      text = readFileSync(path, 'utf8')
    } catch {
      return false
    }
    env.cfg = lib.mergeConfig(lib.parseRepoConfig(text).config, {})
    env.allow = {
      gateTemplates: lib.gateTemplatesOf(env.cfg.gateMap),
      domains: env.cfg.domains,
      cardDir: env.cfg.cardDir,
      root: dir,
      ...(env.cfg.worktreeRoot ? { worktreeRoot: env.cfg.worktreeRoot } : {}),
    }
    env.configFrom = dir
    return true
  }
  return env
}

/** The repo the hook runs in (its top folder) and its repo file. */
async function openRepo(lib, base) {
  const env = makeEnv(lib, base)
  const top = (await env.git(base, 'rev-parse', '--show-toplevel'))?.trim()
  if (top) {
    env.root = top
    env.useConfig(top)
  }
  return env
}

// ---- pre-bash: the git guard ------------------------------------------------------------
async function preBash(lib, input) {
  if (typeof input.tool_name === 'string' && input.tool_name !== 'Bash') return undefined
  const command = isObject(input.tool_input) && typeof input.tool_input.command === 'string' ? input.tool_input.command : ''
  if (command === '') return undefined
  const guarded = lib.parseGuardBranches(undefined)
  const writes = lib.gitWrites(command, guarded)
  if (writes.length === 0) return undefined
  const base = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()
  const env = await openRepo(lib, base)
  const branches = new Map()
  for (const w of writes) {
    let current
    if (!w.namesGuarded && w.state.kind === 'unknown') {
      const dir = lib.joinDir(base, w.dir)
      if (!branches.has(dir)) {
        const b = (await env.git(dir, 'rev-parse', '--abbrev-ref', 'HEAD'))?.trim()
        branches.set(dir, b && b !== 'HEAD' ? b : undefined)
      }
      current = branches.get(dir)
    }
    const deny = lib.guardDeny(w, current, guarded)
    if (deny) return { hookSpecificOutput: { hookEventName: 'PreToolUse', permissionDecision: 'deny', permissionDecisionReason: deny } }
  }
  return undefined
}

// ---- post-agent: the native verifier ----------------------------------------------------
const abs = p => typeof p === 'string' && p.startsWith('/') && existsSync(p)

/** `git worktree list --porcelain` → the path of the worktree that has `branch` checked out. */
async function treeOfBranch(env, branch) {
  if (!env.root || !branch) return undefined
  const out = await env.git(env.root, 'worktree', 'list', '--porcelain')
  if (out === undefined) return undefined
  for (const block of out.split(/\n\s*\n/)) {
    const lines = block.split('\n')
    const path = lines.find(l => l.startsWith('worktree '))?.slice('worktree '.length)
    if (path && lines.includes(`branch refs/heads/${branch}`)) return path
  }
  return undefined
}

/** The worker's tree: the brief's repo=, the call's cwd, the worktree holding the report's branch, the sibling worktree of the task, else this repo. */
async function treeFor(lib, env, { header, toolInput, report, task }) {
  if (abs(header?.repo)) return header.repo
  if (abs(toolInput.cwd)) return toolInput.cwd
  const byBranch = await treeOfBranch(env, (report.branch ?? '').trim())
  if (byBranch) return byBranch
  if (env.root && task) {
    const sibling = lib.worktreePath(env.root, task, false, env.cfg.worktreeRoot || undefined)
    if (existsSync(sibling)) return sibling
  }
  return env.root
}

/** The red evidence at `path`, as the engine reads it: size, text, sha-256. */
async function readRed(path) {
  if (!existsSync(path)) return { exists: false }
  try {
    const bytes = readFileSync(path)
    return { exists: true, bytes: bytes.length, text: bytes.toString('utf8'), hash: createHash('sha256').update(bytes).digest('hex') }
  } catch (err) {
    return { exists: true, error: String(err) }
  }
}

const row = (label, verdict, lines) => {
  const head = `chassis-delegation: verdict=${verdict} task=${label} via=settings-hook next=${NEXT[verdict] ?? NEXT.unverified}`
  const keep = lines.length + 1 <= 40 ? lines : [...lines.slice(0, 38), `… ${lines.length - 38} more verifier lines cut`]
  return [head, ...keep].join('\n')
}

const answer = context => ({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext: context } })

async function postAgent(lib, input) {
  if (typeof input.tool_name === 'string' && !AGENT_TOOLS.includes(input.tool_name)) return undefined
  const said = textOf(input.tool_response)
  const block = lib.extractReport(said)
  if (!block) return undefined
  const report = lib.parseReport(block)
  const toolInput = isObject(input.tool_input) ? input.tool_input : {}
  const prompt = typeof toolInput.prompt === 'string' ? toolInput.prompt : ''
  const base = typeof input.cwd === 'string' && input.cwd !== '' ? input.cwd : process.cwd()

  // the brief: the file the prompt names, else the header written into the prompt
  const named = lib.findBriefPath(prompt)
  let briefText
  if (named) {
    try {
      briefText = readFileSync(named, 'utf8')
    } catch {
      briefText = undefined
    }
  }
  const header = lib.parseHeader(briefText ?? prompt)
  const task = header?.task ?? (report.task ?? '').trim()
  const label = (task || 'adhoc') + (header && header.subtask !== 'main' ? `/${header.subtask}` : '')
  const unverified = lines => answer(row(label, 'unverified', lines))

  if (named && briefText === undefined) return unverified([`note: the brief ${named} could not be read; verify skipped`])
  if (!named && header) {
    const missing = lib.inlineHeaderMissing(header)
    if (missing.length > 0) return unverified([lib.noBriefLine(lib.lacksLine(missing))])
    briefText = prompt
  }
  if (header?.repo === 'none' || header?.repo === 'here') {
    return unverified([`note: repo=${header.repo}: the settings-hook fallback verifies a branch in a git work tree only; this brief is verified with the engine`])
  }

  const env = await openRepo(lib, base)
  const tree = await treeFor(lib, env, { header, toolInput, report, task })
  if (!tree) return unverified([`note: no git work tree found for branch ${report.branch ?? '(none)'} from ${base}; verify skipped`])
  // a worktree outside the session root may carry the repo file the root lacks
  if (env.configFrom === undefined) env.useConfig(tree)

  const exec = (argv, init) => env.run([...argv], init)
  const baseRef = env.cfg.baseRef ? { baseRef: env.cfg.baseRef } : {}
  let result
  if (briefText === undefined) {
    // GH-1 item 2: no brief at all: only what git can say alone, so never verified
    result = await lib.verifyCardless({ repo: tree, report, ...baseRef }, { exec })
  } else {
    const safe = (task || 'task').replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '_')
    result = await lib.verifyNative(
      {
        repo: tree,
        report,
        briefText,
        gateMap: env.cfg.gateMap,
        allowed: argv => lib.checkArgv(argv, env.allow).ok,
        filesPath: join(tmpdir(), 'chassis-delegation-hook', safe, 'files.txt'),
        gateTimeoutMs: GATE_TIMEOUT_MS,
        ...baseRef,
      },
      {
        exec,
        write: async (path, text) => {
          mkdirSync(dirname(path), { recursive: true })
          writeFileSync(path, text)
        },
        readRed,
      },
    )
  }
  // amend blocks in the hand-back are the engine's to apply; saying so beats a scope refute that looks unexplained
  const amends = lib.extractAmendBlocks(said).amends
  const notes = amends.length > 0 ? [`note: ${amends.length} [[amend …]] block(s) in the hand-back were not applied; the settings-hook fallback verifies against the brief as written`] : []
  return answer(row(label, result.verdict, [...notes, ...result.lines]))
}

async function main() {
  const mode = process.argv[2]
  if (!MODES.includes(mode)) {
    process.stderr.write(`chassis-delegation hook: usage: node chassis-hook.mjs ${MODES.join('|')} (hook input JSON on stdin)\n`)
    return 1
  }
  if (!process.features.typescript) {
    process.stderr.write(`chassis-delegation hook: this node (${process.version}) cannot strip types; use node 22.18 or newer\n`)
    return 1
  }
  let input
  try {
    input = JSON.parse(await readStdin())
  } catch {
    return 0
  }
  if (!isObject(input)) return 0
  const lib = await loadLibs()
  const out = await (mode === 'pre-bash' ? preBash(lib, input) : postAgent(lib, input))
  if (out !== undefined) process.stdout.write(`${JSON.stringify(out)}\n`)
  return 0
}

try {
  process.exitCode = await main()
} catch (err) {
  process.stderr.write(`chassis-delegation hook: ${String(err && err.stack ? err.stack : err)}\n`)
  process.exitCode = 1
}
