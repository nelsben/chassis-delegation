// The host-command allowlist. HARD RULE: `$.process.run` runs with no
// permission prompt, so every argv the mod would run passes `checkArgv` first
// and a refused argv never runs. Pure: no `$`.
//
// Allowed, and nothing else (part 5A: no chassis script is on the list):
//   git [-C <dir>] diff|merge-base|rev-parse|status|log …   (no --output, --ext-diff, --textconv; the verifier's delta is `diff --name-status -M`)
//   git [-C <dir>] worktree list [--porcelain|-v|--verbose|-z]
//   git [-C <dir>] fetch [-q] origin main                    (exact)
//   git -C <plugin root> merge --ff-only origin/main        (exact; <plugin root> is the loaded folder only; /delegation update)
//   git -C <dir> check-ignore -q -- <one path>               (MOD-86: is the card git-ignored; exit 0 = ignored)
//   git -C <dir> ls-files --error-unmatch -- <one path>       (MOD-124: is the briefLocal file tracked; exit 0 = tracked)
//   git -C <root> worktree add -q -b agent/<domain>/<id>[-replay] <worktree> <origin/main|7-40 hex sha>
//                                       (<domain>: the configured domains, by default
//                                        frontend|backend|ops|dispatcher|cross|shared;
//                                        <worktree>: <root>-<id>[-replay], or
//                                        <worktreeRoot>/<repo name>-<id>[-replay];
//                                        the literal -replay suffix on both or neither)
//   git -C <task repo> worktree add -q -b agent/<domain>/<id> <task repo>-<id> <origin/main|sha>
//                                       (MOD-44: <task repo> is the absolute path the task <id> names as its repo,
//                                        <domain>: that repo's own; with the session root known, no other -C passes)
//   git -C <root> worktree lock --reason 'chassis-delegation: verifier running; land after the verdict' <worktree>
//   git -C <root> worktree unlock <worktree>
//                                       (MOD-152: the worker's worktree is locked while the verifier judges it; exactly these two
//                                        shapes, one -C <root> under the same root rules as worktree add, <worktree> the path
//                                        worktreePath gives for a task id, and for lock exactly that --reason)
//   git -C <root> ls-tree --name-only <sha> agents/tasks/    (exact; /dispatch --replay)
//   git -C <root> show <sha>:agents/tasks/<id>-<name>.md     (exact; /dispatch --replay)
//   the same two with origin/main for <sha> and the configured cardDir for agents/tasks
//                                                            (MOD-4: is a task's card merged)
//   gh pr list|view …                                        (no --web)
//   gh issue create|comment|list, for the configured issueRepo only (MOD-7; the body file under <root>/.delegation/debriefs/)
//   gh issue create --repo <landRepo> --title <t> --label type:<known> [--parent <n>] --body-file <file under <root>/.delegation/landed/>
//   gh project item-add <number> --owner <owner> --url https://github.com/<landRepo>/issues/<n>
//                                                            (MOD-192: /delegation land and the land tool; landRepo is the session root's origin,
//                                                             <owner> and <number> the configured project; nothing else of gh issue or gh project)
//   gh issue comment <1-9 digits> --repo <landRepo> --body-file <file under <root>/.delegation/status/>
//   gh issue close <1-9 digits> --repo <landRepo> --comment <text not starting with ->
//                                                            (MOD-200: dispatch, the verdict, merge finish and land --supersedes write status to
//                                                             the card's issue; both also pass while /delegation merge runs; no gh issue edit)
//   gh issue view <1-9 digits> --repo <landRepo> --json number,title,state,labels,body,subIssues
//                                                            (MOD-197: this one shape also passes while /delegation merge runs, ahead of
//                                                             the remote refusal; every other gh is still refused then)
//                                                            (MOD-194: the tree tool and /delegation tree; read-only, args in exactly that order)
//   claude plugin validate|test <absolute folder>            (exact; a no-repo brief's gate)
//   a gate-map command, word for word, `{files}`, `{worktree}` and `{outdir}` filled by absolute paths
//                                                            (./gates.ts holds what a map may name)
// <id> is a dispatchable task id, <PREFIX>-<number>[letter]: BE-101, OPS-195b.
// Notably refused: sf, curl, git push|commit|reset|checkout, any other git
// global option (-c, --exec-path, --git-dir …), gh pr merge|create, gh issue edit|delete (close and comment only in the exact MOD-200 shapes), and any
// script or package command the gate map does not name exactly.

import { fillPlaceholders, gateCommandTemplates, matchesAnyTemplate } from './gates'
import { worktreePath } from './paths'

export const DEFAULT_DOMAINS = ['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared'] as const

export type Check = { ok: true } | { ok: false; reason: string }

/** What the allowlist reads of the config: the gate templates (gateTemplatesOf(gateMap)), the domains, the worktree root. */
/** MOD-44: a task that works in another local repo: the checkout's path, and that repo's own domains when it has them. */
export type TaskRepo = { path: string; domains?: readonly string[] }

export type AllowConfig = { /** MOD-44: the task ids that name another local repo as theirs, and that repo; `git -C <path> worktree add` passes for those tasks only. */ taskRepos?: Readonly<Record<string, TaskRepo>>; gateTemplates?: readonly (readonly string[])[]; domains?: readonly string[]; worktreeRoot?: string; /** MOD-3: the loaded plugin folder, the one dir `merge --ff-only origin/main` may run in. */ pluginRoot?: string; cardDir?: string; /** MOD-7: the one repo `gh issue` may name (owner/name); empty or absent = no issue form passes. */ issueRepo?: string; /** MOD-7: the session root, whose .delegation/debriefs/ holds the only body files. */ root?: string; /** MOD-192: owner/name of the session root's origin (empty or absent = no land create passes). */ landRepo?: string; /** MOD-192: the configured GitHub Project; absent = no item-add passes. */ project?: { owner: string; number: number }; /** MOD-75: set only while `/delegation merge` runs: its local git writes pass, exact shapes bound to this one task; a push, gh, curl, sf or wget never does. */ merge?: MergeCtx }

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
  if (allow.merge) {
    // MOD-75: while the merge command runs, the remote refusal comes ahead of everything, then its exact shapes
    if (isMergeIssueView(argv, allow)) return ok
    if (isRemoteArgv(argv)) return refuse('the merge command never pushes, nor runs gh, curl, sf or wget')
    if (isMergeShape(argv, allow.merge)) return ok
  }
  if (cmd === 'git') return checkGit(rest, allow)
  if (cmd === 'gh') return checkGh(rest, allow)
  if (cmd === 'claude') return checkClaude(rest)
  // MOD-72: the verdict tool's wait is a `sleep` process (a $.clock wait would spend the hook's budget); only `sleep <whole seconds, 1 to 600>`
  if (cmd === 'sleep') return rest.length === 1 && /^[0-9]{1,3}$/.test(rest[0]!) && Number(rest[0]) >= 1 && Number(rest[0]) <= 600 ? ok : refuse('sleep takes one whole number of seconds, 1 to 600')
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
  if (sub === 'check-ignore') {
    // MOD-86: is this path git-ignored? Exactly `-q -- <one path>`; no other option, no second path.
    const [q, dd, path, ...more] = tail
    const exact = dirs.length === 1 && q === '-q' && dd === '--' && more.length === 0 && path !== undefined && path !== '' && !path.startsWith('-')
    return exact ? ok : refuse(`git check-ignore ${tail.join(' ')} is not the exact shape (-C <dir> check-ignore -q -- <path>)`)
  }
  if (sub === 'ls-files') {
    // MOD-124: is this path tracked? Exactly `-C <dir> ls-files --error-unmatch -- <one path>`; exit 0 = tracked.
    const [flag, dd, path, ...more] = tail
    const exact = dirs.length === 1 && flag === '--error-unmatch' && dd === '--' && more.length === 0 && path !== undefined && path !== '' && !path.startsWith('-')
    return exact ? ok : refuse(`git ls-files ${tail.join(' ')} is not the exact shape (-C <dir> ls-files --error-unmatch -- <path>)`)
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
    if (action === 'lock' || action === 'unlock') return checkWorktreeLock(action, dirs, tail.slice(1), allow)
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
  const m = new RegExp(`^agent/([A-Za-z0-9_-]+)/(${TASK_ID_SRC})(${REPLAY})?$`).exec(branch)
  // MOD-44: with the session root known, -C is that root, or the repo the task named by this branch names as its own
  const session = (allow.root ?? '').replace(/\/+$/, '')
  const taskRepo = m ? allow.taskRepos?.[m[2] as string] : undefined
  const other = session !== '' && root !== session
  if (other && !(taskRepo && taskRepo.path.replace(/\/+$/, '') === root && m?.[3] === undefined)) {
    return refuse(`git -C ${root} worktree add is for the session's own repo, or for a task that names ${root} as its repo${m ? ` (${m[2]} ${taskRepo ? `names ${taskRepo.path}` : 'names no other repo'})` : ''}`)
  }
  const domains: readonly string[] = other ? (taskRepo?.domains && taskRepo.domains.length > 0 ? taskRepo.domains : DEFAULT_DOMAINS) : allow.domains && allow.domains.length > 0 ? allow.domains : DEFAULT_DOMAINS
  if (!m || !domains.includes(m[1] as string)) return refuse(`branch ${branch} is not agent/<${domains.join('|')}>/<id>[-replay]`)
  const want = worktreePath(root, m[2] as string, m[3] !== undefined, other ? undefined : allow.worktreeRoot)
  if (path !== want) return refuse(`worktree path ${path} is not ${want}`)
  if (!isBaseRef(base)) return refuse(`base ${base} is not origin/main or a 7-40 hex sha`)
  return ok
}

/** MOD-152: the one reason a verify's lock carries. */
export const LOCK_REASON = 'chassis-delegation: verifier running; land after the verdict'

/**
 * MOD-152: `-C <root> worktree lock --reason <LOCK_REASON> <worktree>` and `-C <root> worktree unlock <worktree>`, exactly.
 * <worktree> is what worktreePath gives for a task id, under the root rules of `worktree add`.
 */
function checkWorktreeLock(action: 'lock' | 'unlock', dirs: readonly string[], args: readonly string[], allow: AllowConfig): Check {
  const shape = action === 'lock' ? `-C <root> worktree lock --reason '${LOCK_REASON}' <worktree>` : '-C <root> worktree unlock <worktree>'
  if (dirs.length !== 1) return refuse(`git worktree ${action} needs exactly one -C <root> (${shape})`)
  const root = (dirs[0] as string).replace(/\/+$/, '')
  if (action === 'lock') {
    if (args.length !== 3 || args[0] !== '--reason') return refuse(`git worktree lock ${args.join(' ')} is not the exact shape (${shape})`)
    if (args[1] !== LOCK_REASON) return refuse(`git worktree lock reason ${args[1]} is not '${LOCK_REASON}'`)
  } else if (args.length !== 1) return refuse(`git worktree unlock ${args.join(' ')} is not the exact shape (${shape})`)
  const path = args[args.length - 1] as string
  const session = (allow.root ?? '').replace(/\/+$/, '')
  const other = session !== '' && root !== session
  for (let i = path.indexOf('-'); i >= 0; i = path.indexOf('-', i + 1)) {
    const m = new RegExp(`^(${TASK_ID_SRC})(${REPLAY})?$`).exec(path.slice(i + 1))
    if (!m) continue
    const id = m[1] as string
    const replay = m[2] !== undefined
    const taskRepo = allow.taskRepos?.[id]
    if (other && !(taskRepo && taskRepo.path.replace(/\/+$/, '') === root && !replay)) continue
    if (path === worktreePath(root, id, replay, other ? undefined : allow.worktreeRoot)) return ok
  }
  return refuse(`git -C ${root} worktree ${action} ${path}: the path is not a task worktree of ${root}${other ? ' (a task that names it as its repo)' : ''}`)
}

function checkGh(args: readonly string[], allow: AllowConfig): Check {
  if (args[0] === 'issue') return checkGhIssue(args.slice(1), allow)
  if (args[0] === 'project') return checkGhProject(args.slice(1), allow)
  if (args[0] !== 'pr' || (args[1] !== 'list' && args[1] !== 'view')) return refuse(`gh ${args.slice(0, 2).join(' ')} is not on the list`)
  const bad = args.find(a => a === '--web' || a === '-w')
  return bad ? refuse(`gh pr ${args[1]} ${bad} is not on the list`) : ok
}

const ISSUE_REPO = /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/
/** A body file: absolute, under <root>/.delegation/debriefs/, plain segments. */
const debriefBodyOk = (path: string, root: string | undefined): boolean => bodyUnder(path, root, 'debriefs')
/** MOD-192: a landed body: absolute, under <root>/.delegation/landed/, plain segments, ending .md. */
const landedBodyOk = (path: string, root: string | undefined): boolean => bodyUnder(path, root, 'landed') && path.endsWith('.md')
function bodyUnder(path: string, root: string | undefined, folder: string): boolean {
  const r = (root ?? '').replace(/\/+$/, '')
  const prefix = `${r}/.delegation/${folder}/`
  return r !== '' && ABS_FOLDER.test(path) && path.startsWith(prefix) && path.length > prefix.length && !path.split('/').slice(1).some(seg => seg === '..' || seg === '.' || seg === '') && !path.endsWith('/')
}

/**
 * MOD-7: gh issue, three exact shapes, the repo equal to the configured issueRepo:
 *   create --repo <r> --title <t> --body-file <path>
 *   comment <number> --repo <r> --body-file <path>
 *   list --repo <r> --state all --limit 200 --json number,title,body   (read-only)
 */
function checkGhIssue(args: readonly string[], allow: AllowConfig): Check {
  const repo = allow.issueRepo ?? ''
  const issueRepoSet = repo !== '' && ISSUE_REPO.test(repo)
  const [verb, ...t] = args
  const shape = (s: string): Check => refuse(`gh issue ${verb ?? ''} is not the exact shape (${s})`.replace('  ', ' '))
  if (verb === 'create') {
    const exact = issueRepoSet && t.length === 6 && t[0] === '--repo' && t[1] === repo && t[2] === '--title' && (t[3] ?? '') !== '' && !(t[3] as string).startsWith('-') && t[4] === '--body-file' && debriefBodyOk(t[5] as string, allow.root)
    if (exact || landCreateOk(t, allow)) return ok
    return shape('create --repo <issueRepo> --title <title> --body-file <file under .delegation/debriefs/>; or create --repo <landRepo> --title <title> --label type:<feature|epic|story|task|bug|spike> [--parent <n>] --body-file <file under .delegation/landed/>')
  }
  if (verb === 'view') {
    const lr = allow.landRepo ?? ''
    const exact = lr !== '' && ISSUE_REPO.test(lr) && t.length === 5 && /^\d{1,9}$/.test(t[0] as string) && t[1] === '--repo' && t[2] === lr && t[3] === '--json' && t[4] === 'number,title,state,labels,body,subIssues'
    return exact ? ok : shape('view <number> --repo <landRepo> --json number,title,state,labels,body,subIssues')
  }
  if (verb === 'close') return statusCloseOk(t, allow) ? ok : shape('close <number> --repo <landRepo> --comment <text not starting with ->')
  if (verb === 'comment' && statusCommentOk(t, allow)) return ok
  if (!issueRepoSet) return refuse('gh issue is not on the list: no issueRepo is configured')
  if (verb === 'comment') {
    const exact = t.length === 5 && /^\d{1,9}$/.test(t[0] as string) && t[1] === '--repo' && t[2] === repo && t[3] === '--body-file' && debriefBodyOk(t[4] as string, allow.root)
    return exact ? ok : shape('comment <number> --repo <issueRepo> --body-file <file under .delegation/debriefs/>; or comment <number> --repo <landRepo> --body-file <file under .delegation/status/>')
  }
  if (verb === 'list') {
    const exact = t.join(' ') === `--repo ${repo} --state all --limit 200 --json number,title,body`
    return exact ? ok : shape('list --repo <issueRepo> --state all --limit 200 --json number,title,body')
  }
  return refuse(`gh issue ${verb ?? ''} is not on the list`.replace('  ', ' '))
}

/** MOD-200: a status body: absolute, under <root>/.delegation/status/, plain segments. */
const statusBodyOk = (path: string, root: string | undefined): boolean => bodyUnder(path, root, 'status')
const landRepoOf = (allow: AllowConfig): string => {
  const lr = allow.landRepo ?? ''
  return lr !== '' && ISSUE_REPO.test(lr) ? lr : ''
}
/** MOD-200: `<number> --repo <landRepo> --body-file <file under .delegation/status/>` (the args after `comment`). */
const statusCommentOk = (t: readonly string[], allow: AllowConfig): boolean => {
  const lr = landRepoOf(allow)
  return lr !== '' && t.length === 5 && /^\d{1,9}$/.test(t[0] as string) && t[1] === '--repo' && t[2] === lr && t[3] === '--body-file' && statusBodyOk(t[4] as string, allow.root)
}
/** MOD-200: `<number> --repo <landRepo> --comment <text not starting with ->` (the args after `close`). */
const statusCloseOk = (t: readonly string[], allow: AllowConfig): boolean => {
  const lr = landRepoOf(allow)
  return lr !== '' && t.length === 5 && /^\d{1,9}$/.test(t[0] as string) && t[1] === '--repo' && t[2] === lr && t[3] === '--comment' && (t[4] ?? '') !== '' && !(t[4] as string).startsWith('-')
}

const LAND_LABEL = /^type:(feature|epic|story|task|bug|spike)$/
/**
 * MOD-192: the land create, args in exactly this order:
 *   --repo <landRepo> --title <t> --label type:<known> [--parent <1-9 digits>] --body-file <file under <root>/.delegation/landed/>
 */
function landCreateOk(t: readonly string[], allow: AllowConfig): boolean {
  const repo = allow.landRepo ?? ''
  if (repo === '' || !ISSUE_REPO.test(repo)) return false
  const hasParent = t.length === 10
  if (t.length !== 8 && !hasParent) return false
  if (t[0] !== '--repo' || t[1] !== repo || t[2] !== '--title' || (t[3] ?? '') === '' || (t[3] as string).startsWith('-')) return false
  if (t[4] !== '--label' || !LAND_LABEL.test(t[5] as string)) return false
  if (hasParent && (t[6] !== '--parent' || !/^\d{1,9}$/.test(t[7] as string))) return false
  const at = hasParent ? 8 : 6
  return t[at] === '--body-file' && landedBodyOk(t[at + 1] as string, allow.root)
}

/** MOD-192: gh project item-add <number> --owner <owner> --url https://github.com/<landRepo>/issues/<n>, the configured project only. */
function checkGhProject(args: readonly string[], allow: AllowConfig): Check {
  const [verb, ...t] = args
  const p = allow.project
  const repo = allow.landRepo ?? ''
  const shape = 'item-add <number> --owner <owner> --url https://github.com/<landRepo>/issues/<n>, the number and owner the configured project'
  if (verb !== 'item-add') return refuse(`gh project ${verb ?? ''} is not on the list`.replace('  ', ' '))
  if (!p || repo === '' || !ISSUE_REPO.test(repo)) return refuse('gh project item-add is not on the list: no project or no GitHub origin is configured')
  const exact = t.length === 5 && /^\d{1,9}$/.test(t[0] as string) && Number(t[0]) === p.number && t[1] === '--owner' && t[2] === p.owner && t[3] === '--url' && new RegExp(`^https://github\\.com/${repo.replace(/\./g, '\\.')}/issues/\\d{1,9}$`).test(t[4] as string)
  return exact ? ok : refuse(`gh project item-add is not the exact shape (${shape})`)
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
const SAMPLE_OUTDIR = '/sample/out'

/**
 * A gate-map entry at config load: the shape rules, then every part of it with
 * `{files}`, `{worktree}` and `{outdir}` filled by a sample absolute path through the
 * allowlist itself, so what would be refused at verify time is refused now.
 */
export function checkGateEntry(cmd: string): Check {
  const t = gateCommandTemplates(cmd)
  if ('reason' in t) return refuse(t.reason)
  for (const words of t.templates) {
    const argv = fillPlaceholders(words, SAMPLE_FILES, SAMPLE_TREE, SAMPLE_OUTDIR)
    const c = checkArgv(argv, { gateTemplates: t.templates })
    if (!c.ok) return refuse(`${c.reason.includes('not an absolute folder') ? `${c.reason}; write {worktree}` : c.reason}`)
  }
  return ok
}

// ---- MOD-75: the merge command's local git writes -----------------------------------------

/** The one task `/delegation merge` works on: the session root, its worktree and branch, the base ref, the card's repo-relative path. */
export type MergeCtx = { root: string; worktree: string; branch: string; baseRef: string; cardRel?: string; id: string }

/** The subject of the merged-card commit, the only commit message that passes. */
export const mergedSubject = (id: string): string => `cards: ${id} merged`

/** MOD-197: the one gh the merge command runs, the MOD-194 read-only issue view of the parent (MOD-195), landRepo set. */
const isMergeIssueView = (argv: readonly string[], allow: AllowConfig): boolean => {
  const lr = allow.landRepo ?? ''
  const [cmd, a, b, n, r, repo, j, fields, ...more] = argv
  if (cmd === 'gh' && a === 'issue' && (b === 'close' || b === 'comment')) return (b === 'close' ? statusCloseOk : statusCommentOk)(argv.slice(3), allow)
  return cmd === 'gh' && a === 'issue' && b === 'view' && more.length === 0 && lr !== '' && ISSUE_REPO.test(lr) && /^\d{1,9}$/.test(n ?? '') && r === '--repo' && repo === lr && j === '--json' && fields === 'number,title,state,labels,body,subIssues'
}

/** An argv the merge command may never run: a push, gh, curl, sf or wget. */
export const isRemoteArgv = (argv: readonly string[]): boolean => {
  const [cmd = '', ...rest] = argv
  const base = cmd.split('/').pop() ?? cmd
  if (base === 'gh' || base === 'curl' || base === 'sf' || base === 'wget') return true
  return base === 'git' && rest.includes('push')
}

/**
 * The git writes `/delegation merge` runs, exactly, and only with `allow.merge` set:
 *   git -C <worktree> fetch origin            git -C <root> fetch origin
 *   git -C <worktree> rebase <baseRef>        git -C <worktree> rebase --abort
 *   git -C <worktree> add -- <card>           git -C <worktree> commit -q -m 'cards: <ID> merged' [-m <Co-Authored-By trailer>]
 *   git -C <root> remote get-url origin       git -C <root> clean -q -f -- <card>
 *   git -C <root> pull --ff-only              git -C <root> worktree remove <worktree>
 *   git -C <root> branch -D <branch>          git -C <root> worktree unlock <worktree>   (MOD-152: finish frees a lock a crashed verify left)
 * <worktree>, <branch> and <card> are the one task's; nothing else passes here.
 */
function isMergeShape(argv: readonly string[], c: MergeCtx): boolean {
  if (argv[0] !== 'git' || argv[1] !== '-C' || argv.length < 4) return false
  const dir = (argv[2] as string).replace(/\/+$/, '')
  const root = c.root.replace(/\/+$/, '')
  const wt = c.worktree.replace(/\/+$/, '')
  const tail = argv.slice(3).join('\u0000')
  const is = (...words: string[]) => tail === words.join('\u0000')
  if (dir === wt) {
    if (is('fetch', 'origin') || is('rebase', c.baseRef) || is('rebase', '--abort')) return true
    if (c.cardRel && is('add', '--', c.cardRel)) return true
    const [sub, q, m1, subj, m2, trailer, ...more] = argv.slice(3)
    if (sub === 'commit' && q === '-q' && m1 === '-m' && subj === mergedSubject(c.id) && more.length === 0) {
      if (m2 === undefined && trailer === undefined) return true
      if (m2 === '-m' && /^Co-Authored-By: Claude [A-Za-z]+ [0-9.]+ <noreply@anthropic\.com>$/.test(trailer ?? '')) return true
    }
    return false
  }
  if (dir === root) {
    if (is('fetch', 'origin') || is('remote', 'get-url', 'origin') || is('pull', '--ff-only') || is('worktree', 'remove', wt) || is('worktree', 'unlock', wt) || is('branch', '-D', c.branch)) return true
    if (c.cardRel && is('clean', '-q', '-f', '--', c.cardRel)) return true
  }
  return false
}
