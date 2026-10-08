// GH-109: `/delegation setup` and the `setup` tool. Phase 1 checks the repo and
// the tools the mod needs and names the exact fix for each failing check; the
// mod cannot run those fixes (its host-command allowlist has no git init, commit,
// remote or install). Phase 2, only when every required check holds, scaffolds
// the config from what was found and hands over by asking for the first task (GH-111). Pure: no `$`;
// register.ts gathers the probe with allowlisted reads and does the writes.
import { REPO_CONFIG_FILE } from './repoconfig'
import { PLUGIN_CARD_DIR } from './init'

/** The tool names register.ts looks for on PATH. */
export const PATH_TOOLS = ['git', 'node', 'npm', 'pnpm', 'yarn', 'python3', 'pytest', 'cargo', 'go', 'gh'] as const
/** Files at the root whose presence the checks read. */
export const ROOT_MARKERS = ['package.json', 'pyproject.toml', 'pytest.ini', 'Cargo.toml', 'go.mod', 'package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt', '.claude-plugin/plugin.json'] as const
/** The files and folders of the user's home that would shadow the mod's commands. */
export const SHADOWS = ['.claude/skills/delegation', '.claude/skills/dispatch', '.claude/commands/delegation.md', '.claude/commands/dispatch.md'] as const

export type SetupProbe = {
  root: string
  home: string
  inRepo: boolean
  toplevel?: string
  branch?: string
  hasCommit: boolean
  hasOriginMain: boolean
  dirty: boolean
  /** ROOT_MARKERS that exist. */
  markers: readonly string[]
  /** The text of package.json, when it exists and was readable. */
  packageJson?: string
  /** tests/ holds a test_*.py. */
  pyTests: boolean
  /** The PATH_TOOLS found in a PATH directory. */
  onPath: readonly string[]
  /** The SHADOWS (as `~`-relative paths) that exist. */
  shadows: readonly string[]
  /** Child folders of the root holding `.git`. */
  childRepos: readonly string[]
  /** The root's .gitignore text, if any. */
  gitignore?: string
  autoDebrief: boolean
}

export type SetupLine = { level: 'required' | 'advice'; ok: boolean; text: string; fix?: string }
export type Stack = 'node' | 'python' | 'rust' | 'go'
export type Gate = { command: string; stack: Stack; pm?: string; runner?: 'pytest' | 'unittest' }

const has = (p: SetupProbe, m: string): boolean => p.markers.includes(m)
const norm = (s: string): string => s.replace(/\/+$/, '')
const base = (s: string): string => norm(s).slice(norm(s).lastIndexOf('/') + 1) || 'project'

/** The package manager the lockfile names (npm without one). */
export const packageManager = (p: SetupProbe): string => (has(p, 'pnpm-lock.yaml') ? 'pnpm' : has(p, 'yarn.lock') ? 'yarn' : 'npm')

/** The test command the repo already has, or undefined. */
export function detectGate(p: SetupProbe): Gate | undefined {
  if (has(p, 'package.json') && p.packageJson !== undefined) {
    let test: unknown
    try {
      test = (JSON.parse(p.packageJson) as { scripts?: { test?: unknown } }).scripts?.test
    } catch {
      test = undefined
    }
    if (typeof test === 'string' && test.trim() !== '' && !/no test specified/i.test(test)) {
      const pm = packageManager(p)
      return { command: `${pm} test`, stack: 'node', pm }
    }
  }
  // python: pytest when the repo names it (pytest.ini) or it is installed; else the standard library's unittest, which needs nothing installed
  if (has(p, 'pyproject.toml') || has(p, 'pytest.ini') || p.pyTests) {
    if (has(p, 'pytest.ini') || p.onPath.includes('pytest')) return { command: 'pytest', stack: 'python', runner: 'pytest' }
    return { command: 'python3 -m unittest discover -s tests', stack: 'python', runner: 'unittest' }
  }
  if (has(p, 'Cargo.toml')) return { command: 'cargo test', stack: 'rust' }
  if (has(p, 'go.mod')) return { command: 'go test ./...', stack: 'go' }
  return undefined
}

const gateExample = (p: SetupProbe): string =>
  has(p, 'package.json')
    ? 'for example "scripts": {"test": "node --test"} in package.json'
    : has(p, 'Cargo.toml') || has(p, 'go.mod') || has(p, 'pyproject.toml')
      ? 'for example an empty test that passes'
      : 'for example a package.json with "scripts": {"test": "node --test"}, or a tests/test_ok.py (run with python3 -m unittest, or pytest when it is installed)'

/** The `.gitignore` ignores `name` (a plain folder name, with or without slashes). */
export const gitignored = (gitignore: string | undefined, name: string): boolean =>
  (gitignore ?? '').split(/\r?\n/).some(l => [name, `${name}/`, `/${name}`, `/${name}/`].includes(l.trim()))

/** Whether the mode is repo=here: no origin/main to cut worktrees from. */
export const isHereMode = (p: SetupProbe): boolean => !p.hasOriginMain

/** The base ref setup writes in repo=here mode. */
export const hereBaseRef = (p: SetupProbe): string => (p.branch && p.branch !== 'HEAD' ? p.branch : 'main')

/** The ordered checks: required first (1 to 6), then the advice (7 to 13). */
export function setupChecks(p: SetupProbe): SetupLine[] {
  const out: SetupLine[] = []
  const req = (ok: boolean, text: string, fix?: string): void => void out.push({ level: 'required', ok, text, ...(!ok && fix ? { fix } : {}) })
  const adv = (text: string, fix?: string): void => void out.push({ level: 'advice', ok: true, text, ...(fix ? { fix } : {}) })

  req(p.inRepo, p.inRepo ? 'a git repo' : 'a git repo: none here', 'git init -b main')
  const top = p.toplevel ? norm(p.toplevel) : undefined
  const atTop = p.inRepo && top === norm(p.root)
  req(
    atTop,
    atTop ? 'the session root is the repo top level' : p.inRepo ? `the session root is not the repo top level (${top ?? 'unknown'})` : 'the session root is the repo top level: no repo yet',
    p.inRepo ? `start Claude Code in ${top ?? 'the repo top level'}` : 'run git init -b main in this folder, which then is the top level',
  )
  req(p.hasCommit, p.hasCommit ? 'a first commit' : 'a first commit: none yet', 'git add -A && git commit -m "Initial commit"')

  const gate = detectGate(p)
  req(
    gate !== undefined,
    gate ? `a gate: ${gate.command}` : 'a gate: no test command found',
    `add a test command that passes on the empty project, then run /delegation setup again (${gateExample(p)})`,
  )

  const need = ['git', ...(gate?.stack === 'node' ? ['node', gate.pm ?? 'npm'] : gate?.stack === 'python' ? ['python3', ...(gate.runner === 'pytest' ? ['pytest'] : [])] : gate?.stack === 'rust' ? ['cargo'] : gate?.stack === 'go' ? ['go'] : [])]
  const missing = need.filter(t => !p.onPath.includes(t))
  req(missing.length === 0, missing.length === 0 ? `the tools on PATH: ${need.join(', ')}` : `the tools on PATH: missing ${missing.join(', ')}`, `install ${missing.join(', ')} and put it on PATH`)

  req(
    p.shadows.length === 0,
    p.shadows.length === 0 ? 'no shadowing command or skill' : `a command or skill shadows the mod: ${p.shadows.map(s => `~/${s}`).join(', ')}`,
    `remove ${p.shadows.map(s => `~/${s}`).join(' and ')}`,
  )

  if (p.hasOriginMain) adv('mode: worktree (origin/main resolves; each worker gets its own worktree)')
  else
    adv(
      `mode: repo=here (no origin/main); setup writes "baseRef": "${hereBaseRef(p)}" and cards dispatch with --here`,
      `or give worktree mode a remote: gh repo create ${base(p.root)} --private --source . --push (your call)`,
    )

  const lock = (['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt'] as const).find(l => has(p, l))
  adv(lock ? `a lockfile for the brief's install step: ${lock}` : "no lockfile (package-lock.json, pnpm-lock.yaml, yarn.lock, requirements.txt): the worker will have no install step")

  for (const child of p.childRepos.filter(c => gitignored(p.gitignore, c))) adv(`code in ${child} is its own repo; to delegate there, start Claude Code in ${child}`)

  if (has(p, '.claude-plugin/plugin.json')) adv(`a plugin repo: the cards go under ${PLUGIN_CARD_DIR}/`)

  adv(p.onPath.includes('gh') ? 'gh is on PATH: a report\'s pr= claim can be checked' : "gh is not on PATH: a report's pr= claim can be checked only with it")

  if (p.dirty && p.hasOriginMain) adv('uncommitted changes: in worktree mode they are not in a worker\'s worktree', 'commit them first')

  if (p.autoDebrief) adv('background debrief is on: it spends an agent at a quiet stop', 'turn it off in /config (autoDebrief)')
  return out
}

/** The count of required checks that hold, and the total. */
export const requiredTally = (lines: readonly SetupLine[]): { held: number; total: number } => {
  const r = lines.filter(l => l.level === 'required')
  return { held: r.filter(l => l.ok).length, total: r.length }
}

export const allRequiredHold = (lines: readonly SetupLine[]): boolean => {
  const t = requiredTally(lines)
  return t.held === t.total
}

/** Header, then one line per check, each fix indented under it. */
export function setupText(root: string, lines: readonly SetupLine[]): string {
  const t = requiredTally(lines)
  const out = [`chassis-delegation setup in ${root}: ${t.held} of ${t.total} required checks hold`]
  for (const l of lines) {
    out.push(`${l.level === 'advice' ? '·' : l.ok ? '✓' : '✗'} ${l.text}`)
    if (l.fix) out.push(`    ${l.level === 'required' ? 'fix: ' : ''}${l.fix}`)
  }
  return out.join('\n')
}

/** What setup found that the config should carry. */
export type Found = { gate: string; baseRef?: string; cardDir?: string }

export function foundOf(p: SetupProbe): Found {
  const gate = detectGate(p)
  return {
    gate: gate?.command ?? '',
    ...(isHereMode(p) ? { baseRef: hereBaseRef(p) } : {}),
    ...(has(p, '.claude-plugin/plugin.json') ? { cardDir: PLUGIN_CARD_DIR } : {}),
  }
}

/** The config template with what setup found filled in. Key order is the template's; baseRef goes last. */
export function scaffoldConfig(template: string, found: Found): string {
  const o = JSON.parse(template) as Record<string, unknown>
  o.gateMap = { test: found.gate }
  if (found.cardDir) o.cardDir = found.cardDir
  if (found.baseRef) o.baseRef = found.baseRef
  return `${JSON.stringify(o, null, 2)}\n`
}

/** What setup would have set, when the config already exists and is left alone. */
export function wouldSet(found: Found): string {
  const parts = [`"gateMap": {"test": "${found.gate}"}`, ...(found.baseRef ? [`"baseRef": "${found.baseRef}"`] : []), ...(found.cardDir ? [`"cardDir": "${found.cardDir}"`] : [])]
  return `· ${REPO_CONFIG_FILE} exists and is left as it is; setup would have set ${parts.join(', ')}`
}

/** One line per key setup set in a fresh config. */
export function configLines(found: Found): string[] {
  return [`config: gateMap.test = ${found.gate}`, ...(found.baseRef ? [`config: baseRef = ${found.baseRef}`] : []), ...(found.cardDir ? [`config: cardDir = ${found.cardDir}`] : [])]
}

/** A first task the person could say, by the detected stack. */
export function firstTaskExample(gate: Gate | undefined): string {
  const what = 'add a function that reads a file header and returns its size, with'
  if (!gate) return `${what} a test`
  if (gate.stack === 'python') return `${what} a unittest`
  if (gate.stack === 'node') return `${what} a node --test test`
  if (gate.stack === 'rust') return `${what} a cargo test`
  return `${what} a go test`
}

/** What setup ends with: ask for the first task in a sentence; the brain writes the card with the card tool. */
export const handoverText = (gate: Gate | undefined): string =>
  `Set up. Tell Claude your first task in a sentence, for example: "${firstTaskExample(gate)}". Claude writes the card, shows you the brief, and dispatches when you say go.`

/** The extra line the setup tool (the brain) gets. */
export const BRAIN_HANDOVER = 'Ask the person for the first task, then call the card tool.'
