import { test, expect, describe } from 'claude-code/testing'
import { isRepoPath, normRepoPath, repoFolderName, repoPathCheck, sessionCardsFor, withRepoName, worktreePath } from '../hooks/lib/paths'

const ROOT = '/Users/b/api-server'
const HOME = '/Users/b'

describe('MOD-44: repo as the path of another checkout', () => {
  test('the three words are not paths; anything else is read as one', () => {
    for (const w of ['worktree', 'here', 'none']) expect(isRepoPath(w)).toBe(false)
    for (const v of ['/Users/b/notes-app', '~/notes-app', '../notes-app', 'notes-app']) expect(isRepoPath(v)).toBe(true)
  })
  test('an absolute path passes, ~ is expanded, trailing slashes go', () => {
    expect(repoPathCheck('/Users/b/notes-app', HOME, ROOT)).toEqual({ path: '/Users/b/notes-app' })
    expect(repoPathCheck('~/notes-app/', HOME, ROOT)).toEqual({ path: '/Users/b/notes-app' })
    expect(normRepoPath('~', HOME)).toBe('/Users/b')
  })
  test('refused in one line, naming why: not absolute, the session root, characters git should not carry', () => {
    expect(repoPathCheck('../notes-app', HOME, ROOT)).toEqual({ error: 'is not an absolute path; give the folder of a git checkout, e.g. /Users/you/other (or worktree, here, none)' })
    expect('error' in repoPathCheck('notes-app', HOME, ROOT)).toBe(true)
    expect('error' in repoPathCheck('~/x', '', ROOT)).toBe(true)
    expect(repoPathCheck(ROOT, HOME, ROOT)).toEqual({ error: "is the session's own repo; leave repo unset to delegate here" })
    expect(repoPathCheck(`${ROOT}//`, HOME, ROOT)).toEqual({ error: "is the session's own repo; leave repo unset to delegate here" })
    expect(repoPathCheck('~/api-server', HOME, ROOT)).toEqual({ error: "is the session's own repo; leave repo unset to delegate here" })
    for (const bad of ['/Users/b/a b', '/Users/b/../etc', '/Users/b/$HOME', '/', '/Users/b/x;y']) {
      expect(repoPathCheck(bad, HOME, ROOT)).toEqual({ error: 'is not a plain absolute folder (letters, digits and . _ - / only, no ..)' })
    }
  })
  test('the folder name, the session board for a repo with no config, the worktree beside the repo', () => {
    expect(repoFolderName('/Users/b/notes-app/')).toBe('notes-app')
    expect(sessionCardsFor(`${ROOT}/`, '/Users/b/notes-app')).toBe(`${ROOT}/.delegation/cards/notes-app`)
    expect(worktreePath('/Users/b/notes-app', 'OPS-1')).toBe('/Users/b/notes-app-OPS-1')
  })
  test('a task for another repo shows its folder name; the session own does not', () => {
    expect(withRepoName('T-1', '/Users/b/notes-app', ROOT)).toBe('T-1 [notes-app]')
    expect(withRepoName('T-1/ui', '/Users/b/notes-app', ROOT)).toBe('T-1/ui [notes-app]')
    expect(withRepoName('T-1', ROOT, ROOT)).toBe('T-1')
    expect(withRepoName('T-1', `${ROOT}/`, ROOT)).toBe('T-1')
    expect(withRepoName('T-1', undefined, ROOT)).toBe('T-1')
  })
})
