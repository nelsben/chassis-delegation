// The host-command allowlist. HARD RULE: `$.process.run` runs with no
// permission prompt, so every argv the mod would run passes `checkArgv` first
// and a refused argv never runs. Pure: no `$`.
//
// Allowed, and nothing else (part 5A: no chassis script is on the list):
//   git [-C <dir>] diff|merge-base|rev-parse|status|log …   (no --output, --ext-diff, --textconv; the verifier's delta is `diff --name-status -M`)
//   git [-C <dir>] worktree list [--porcelain|-v|--verbose|-z]
//   git [-C <dir>] fetch [-q] origin main                    (exact)
//   git -C <plugin root> merge --ff-only origin/main        (exact; <plugin root> is the loaded folder only; /delegation update)
//   git -C <root> worktree add -q -b agent/<domain>/<id>[-replay] <worktree> <origin/main|7-40 hex sha>
//                                       (<domain>: the configured domains, by default
//                                        frontend|backend|ops|dispatcher|cross|shared;
//                                        <worktree>: <root>-<id>[-replay], or
//                                        <worktreeRoot>/<repo name>-<id>[-replay];
//                                        the literal -replay suffix on both or neither)
//   git -C <root> ls-tree --name-only <sha> agents/tasks/    (exact; /dispatch --replay)
//   git -C <root> show <sha>:agents/tasks/<id>-<name>.md     (exact; /dispatch --replay)
//   the same two with origin/main for <sha> and the configured cardDir for agents/tasks
//                                                            (MOD-4: is a task's card merged)
//   gh pr list|view …                                        (no --web)
//   claude plugin validate|test <absolute folder>            (exact; a no-repo brief's gate)
//   a gate-map command, word for word, `{files}` and `{worktree}` filled by absolute paths
//                                                            (./gates.ts holds what a map may name)
// <id> is a dispatchable task id, <PREFIX>-<number>[letter]: BE-101, OPS-195b.
// Notably refused: sf, curl, git push|commit|reset|checkout, any other git
// global option (-c, --exec-path, --git-dir …), gh pr merge|create, and any
// script or package command the gate map does not name exactly.

import { fillPlaceholders, gateCommandTemplates, matchesAnyTemplate } from './gates'
import { worktreePath } from './paths'

export const DEFAULT_DOMAINS = ['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared'] as const

export type Check = { ok: true } | { ok: false; reason: string }

/** What the allowlist reads of the config: the gate templates (gateTemplatesOf(gateMap)), the domains, the worktree root. */
export type AllowConfig = { gateTemplates?: readonly (readonly string[])[]; domains?: readonly string[]; worktreeRoot?: string; /** MOD-3: the loaded plugin folder, the one dir `merge --ff-only origin/main` may run in. */ pluginRoot?: string; cardDir?: string }

const GIT_READ = ['diff', 'merge-base', 'rev-parse', 'status', 'log']
const GIT_WRITEY_FLAGS = /^(--output(=|$)|--ext-diff$|--textconv$|-O)/
const TASK_ID = /^[A-Z][A-Z0-9]*-\d+[a-z]?$/
const TASK_ID_SRC = '[A-Z][A-Z0-9]*-\\d+[a-z]?'
const SHA = /^[0-9a-f]{7,40}$/
const SHOW_CARD = new RegExp(`^[0-9a-f]{7,40}:agents/tasks/${TASK_ID_SRC}-[A-Za-z0-9._-]+\\.md$`)
const CARD_FILE = new RegExp(`^${TASK_ID_SRC}-[A-Za-z0-9._-]+\\.md$`)
/** A relative folder, plain segments only (the configured cardDir). */
const PLAIN_DIR = /^[A-Za-z0-9._-]+(\/[A-Za-z0-9._-]+)*$/
const cardDirOk = (d: string, allow: AllowConfig): boolean => {
  const want = (allow.cardDir ?? '').replace(/^\/+|\/+$/g, '')
  return PLAIN_DIR.test(d) && !d.split('/').some(seg => seg === '.' || seg === '..') && (d === 'agents/tasks' || (want !== '' && d === want))
}
const REPLAY = '-replay'

const refuse = (reason: string): Check => ({ ok: false, reason })
const ok: Check = { ok: true }

export const isTaskId = (s: string): boolean => TASK_ID.test(s) && s.length <= 64
export const isSha = (s: string): boolean => SHA.test(s)
export const isBaseRef = (s: string): boolean => s === 'origin/main' || SHA.test(s)

export function checkArgv(argv: readonly string[], allow: AllowConfig = {}): Check {
  const [cmd, ...rest] = argv
  if (cmd === undefined) return refuse('empty argv')
  if (cmd === 'git') return checkGit(rest, allow)
  if (cmd === 'gh') return checkGh(rest)
  if (cmd === 'claude') return checkClaude(rest)
  if (matchesAnyTemplate(argv, allow.gateTemplates ?? [])) return ok
  return refuse(`${cmd} is not on the list (not git, gh, claude plugin, nor a gate-map command word for word)`)
}

function checkGit(args: readonly string[], allow: AllowConfig): Check {
  let i = 0
  const dirs: string[] = []
  while (args[i] === '-C') {
    const dir = args[i + 1]
    if (!dir || dir.startsWith('-')) return refuse('git -C needs a directory')
    dirs.push(dir)
    i += 2
  }
  const sub = args[i]
  if (sub === undefined) return refuse('git with no subcommand')
  if (sub.startsWith('-')) return refuse(`git global option ${sub} is not on the list`)
  const tail = args.slice(i + 1)
  if (GIT_READ.includes(sub)) {
    const bad = tail.find(a => GIT_WRITEY_FLAGS.test(a))
    return bad ? refuse(`git ${sub} ${bad} is not on the list`) : ok
  }
  if (sub === 'ls-tree') {
    const [flag, sha, path, ...more] = tail
    const dir = (path ?? '').replace(/\/$/, '')
    const exact =
      dirs.length === 1 && flag === '--name-only' && more.length === 0 && (path ?? '').endsWith('/') &&
      ((SHA.test(sha ?? '') && path === 'agents/tasks/') || (isBaseRef(sha ?? '') && cardDirOk(dir, allow)))
    return exact ? ok : refuse(`git ls-tree ${tail.join(' ')} is not the exact shape (-C <root> ls-tree --name-only <sha> agents/tasks/)`)
  }
  if (sub === 'show') {
    const spec = tail[0] ?? ''
    const colon = spec.indexOf(':')
    const ref = spec.slice(0, colon)
    const file = spec.slice(colon + 1)
    const slash = file.lastIndexOf('/')
    const cardAtRef = colon > 0 && isBaseRef(ref) && slash > 0 && cardDirOk(file.slice(0, slash), allow) && CARD_FILE.test(file.slice(slash + 1))
    const exact = dirs.length === 1 && tail.length === 1 && (SHOW_CARD.test(spec) || cardAtRef) && !spec.includes('..')
    return exact ? ok : refuse(`git show ${tail.join(' ')} is not the exact shape (-C <root> show <sha>:agents/tasks/<id>-<name>.md)`)
  }
  if (sub === 'fetch') {
    const exact = tail.join(' ')
    return exact === '-q origin main' || exact === 'origin main' ? ok : refuse(`git fetch ${exact} is not the exact shape (fetch [-q] origin main)`)
  }
  if (sub === 'merge') {
    const exact = dirs.length === 1 && allow.pluginRoot !== undefined && allow.pluginRoot !== '' && (dirs[0] as string).replace(/\/+$/, '') === allow.pluginRoot.replace(/\/+$/, '') && tail.join(' ') === '--ff-only origin/main'
    return exact ? ok : refuse(`git merge ${tail.join(' ')} is not the exact shape (-C <the loaded plugin folder> merge --ff-only origin/main)`)
  }
  if (sub === 'worktree') {
    const action = tail[0]
    if (action === 'list') {
      const bad = tail.slice(1).find(a => !['--porcelain', '-v', '--verbose', '-z'].includes(a))
      return bad ? refuse(`git worktree list ${bad} is not on the list`) : ok
    }
    if (action === 'add') return checkWorktreeAdd(dirs, tail.slice(1), allow)
    return refuse(`git worktree ${action ?? ''} is not on the list`.trim())
  }
  return refuse(`git ${sub} is not on the list`)
}

function checkWorktreeAdd(dirs: readonly string[], args: readonly string[], allow: AllowConfig): Check {
  if (dirs.length !== 1) return refuse('git worktree add needs exactly one -C <root>')
  const root = (dirs[0] as string).replace(/\/+$/, '')
  if (args.length !== 5 || args[0] !== '-q' || args[1] !== '-b') {
    return refuse('git worktree add must be exactly: -q -b agent/<domain>/<id> <worktree> <base>')
  }
  const [, , branch, path, base] = args as [string, string, string, string, string]
  const domains: readonly string[] = allow.domains && allow.domains.length > 0 ? allow.domains : DEFAULT_DOMAINS
  const m = new RegExp(`^agent/([A-Za-z0-9_-]+)/(${TASK_ID_SRC})(${REPLAY})?$`).exec(branch)
  if (!m || !domains.includes(m[1] as string)) return refuse(`branch ${branch} is not agent/<${domains.join('|')}>/<id>[-replay]`)
  const want = worktreePath(root, m[2] as string, m[3] !== undefined, allow.worktreeRoot)
  if (path !== want) return refuse(`worktree path ${path} is not ${want}`)
  if (!isBaseRef(base)) return refuse(`base ${base} is not origin/main or a 7-40 hex sha`)
  return ok
}

function checkGh(args: readonly string[]): Check {
  if (args[0] !== 'pr' || (args[1] !== 'list' && args[1] !== 'view')) return refuse(`gh ${args.slice(0, 2).join(' ')} is not on the list`)
  const bad = args.find(a => a === '--web' || a === '-w')
  return bad ? refuse(`gh pr ${args[1]} ${bad} is not on the list`) : ok
}

/** An absolute folder with no `..` segment and nothing a shell would read. */
const ABS_FOLDER = /^\/[A-Za-z0-9._@%+=:,\/-]*$/

/** `claude plugin validate <folder>` and `claude plugin test <folder>`, exactly, the folder absolute. */
function checkClaude(args: readonly string[]): Check {
  const [noun, verb, folder, ...more] = args
  const shape = 'claude plugin validate|test <absolute folder>'
  if (noun !== 'plugin' || (verb !== 'validate' && verb !== 'test')) return refuse(`claude ${args.slice(0, 2).join(' ')} is not on the list (only ${shape})`)
  if (folder === undefined || more.length > 0) return refuse(`claude plugin ${verb} must be exactly: ${shape}`)
  if (!ABS_FOLDER.test(folder) || folder.split('/').includes('..')) return refuse(`claude plugin ${verb} ${folder} is not an absolute folder`)
  return ok
}

/** Whether a gate-map command may stand in the map at all (./gates.ts holds the rules). */
export function checkGateCommand(cmd: string): Check {
  const t = gateCommandTemplates(cmd)
  return 'reason' in t ? refuse(t.reason) : ok
}

export const refusedLine = (argv: readonly string[], reason: string): string =>
  `chassis-delegation: refused argv ${JSON.stringify(argv)} (${reason})`

const SAMPLE_FILES = '/sample/.delegation/T-1/files.txt'
const SAMPLE_TREE = '/sample/worktree'

/**
 * A gate-map entry at config load: the shape rules, then every part of it with
 * `{files}` and `{worktree}` filled by a sample absolute path through the
 * allowlist itself, so what would be refused at verify time is refused now.
 */
export function checkGateEntry(cmd: string): Check {
  const t = gateCommandTemplates(cmd)
  if ('reason' in t) return refuse(t.reason)
  for (const words of t.templates) {
    const argv = fillPlaceholders(words, SAMPLE_FILES, SAMPLE_TREE)
    const c = checkArgv(argv, { gateTemplates: t.templates })
    if (!c.ok) return refuse(`${c.reason.includes('not an absolute folder') ? `${c.reason}; write {worktree}` : c.reason}`)
  }
  return ok
}
