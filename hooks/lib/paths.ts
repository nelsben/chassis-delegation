// Where a task's worktree goes: one function, so /dispatch and the allowlist
// that admits its `git worktree add` always agree. Pure: no `$`, no imports.
//
//   default         <root>-<id>[-replay]                  (a sibling folder)
//   worktreeRoot    <worktreeRoot>/<repo name>-<id>[-replay]

export function worktreePath(root: string, id: string, replay?: boolean, worktreeRoot?: string): string {
  const r = root.replace(/\/+$/, '')
  const suffix = replay ? '-replay' : ''
  const under = (worktreeRoot ?? '').replace(/\/+$/, '')
  if (!under) return `${r}-${id}${suffix}`
  return `${under}/${r.slice(r.lastIndexOf('/') + 1)}-${id}${suffix}`
}

// ---- MOD-44: a task for another local repo -----------------------------------------------------
// `repo` on the card tool, on dispatch and in a card's frontmatter may be the absolute path of a git
// checkout. These are the pure rules; the one fact they cannot know (a `.git` in the folder) is
// checked by the caller.

/** The values `repo` took before MOD-44; anything else is read as a path. */
export const REPO_WORDS = ['worktree', 'here', 'none'] as const

/** True for a `repo` value that is a path (absolute, or a `~` home path), not one of the three words. */
export const isRepoPath = (v: string): boolean => !(REPO_WORDS as readonly string[]).includes(v) && v !== ''

/** A folder the mod will put in an argv and a brief header: absolute, plain characters, no `..`. */
const PLAIN_ABS = /^\/[A-Za-z0-9._@%+=:,/-]*$/

/** The folder name of a path: what the dashboard shows beside a task for another repo. */
export const repoFolderName = (path: string): string => {
  const p = path.replace(/\/+$/, '')
  return p.slice(p.lastIndexOf('/') + 1)
}

/** The path with a leading `~` expanded and trailing slashes dropped. */
export const normRepoPath = (value: string, home: string): string => {
  const v = value.trim()
  const h = home.replace(/\/+$/, '')
  const expanded = v === '~' ? h : v.startsWith('~/') ? `${h}${v.slice(1)}` : v
  return expanded.length > 1 ? expanded.replace(/\/+$/, '') : expanded
}

/**
 * MOD-44: `repo` read as the path of a checkout: the normalised path, or the reason it is refused (said after
 * `repo <value> `). Not absolute (after `~`), the session's own repo, or characters the mod will not pass to git.
 */
export function repoPathCheck(value: string, home: string, sessionRoot: string): { path: string } | { error: string } {
  const v = value.trim()
  if ((v.startsWith('~') && home.trim() === '') || !(v.startsWith('/') || v === '~' || v.startsWith('~/'))) {
    return { error: 'is not an absolute path; give the folder of a git checkout, e.g. /Users/you/other (or worktree, here, none)' }
  }
  const path = normRepoPath(v, home)
  if (path === sessionRoot.replace(/\/+$/, '')) return { error: "is the session's own repo; leave repo unset to delegate here" }
  if (path === '/' || !PLAIN_ABS.test(path) || path.split('/').some(seg => seg === '..' || seg === '.')) {
    return { error: 'is not a plain absolute folder (letters, digits and . _ - / only, no ..)' }
  }
  return { path }
}

/** The reason a folder with no `.git` is refused. */
export const NOT_A_CHECKOUT = 'is not a git checkout (no .git in it)'

/** Where a repo with no `.chassis-delegation.json` keeps its cards: under the session's own `.delegation/cards/<folder name>/`. */
export const sessionCardsFor = (sessionRoot: string, repoPath: string): string => `${sessionRoot.replace(/\/+$/, '')}/.delegation/cards/${repoFolderName(repoPath)}`

/** The label a task for another repo carries on a row: `T-1 [other]`. */
export const withRepoName = (label: string, repoPath: string | undefined, sessionRoot: string): string =>
  repoPath && repoPath.replace(/\/+$/, '') !== sessionRoot.replace(/\/+$/, '') ? `${label} [${repoFolderName(repoPath)}]` : label
