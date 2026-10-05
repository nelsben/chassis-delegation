import { test, expect, describe } from 'claude-code/testing'
import { DEFAULT_GUARD_BRANCHES, gitWrites, guardDeny, joinDir, parseGuardBranches, tokenize } from '../hooks/lib/gitguard'

const G = [...DEFAULT_GUARD_BRANCHES]
const verbs = (cmd: string) => gitWrites(cmd, G).map(w => w.verb)
const denyOn = (cmd: string, current: string | undefined) => gitWrites(cmd, G).map(w => guardDeny(w, current, G)).find(d => d !== undefined)

describe('5D: what the guard reads in a Bash command', () => {
  test('the five write verbs, after git global options and env assignments', () => {
    expect(G).toEqual(['main', 'master'])
    expect(verbs('git commit -m "x"')).toEqual(['commit'])
    expect(verbs('git -C /r -c core.editor=true --no-pager merge feat')).toEqual(['merge'])
    expect(verbs('GIT_AUTHOR_NAME=x git cherry-pick abc')).toEqual(['cherry-pick'])
    expect(verbs('git rebase main; git push')).toEqual(['rebase', 'push'])
  })
  test('not a write: reads, plumbing, aborts, and the words inside quotes', () => {
    expect(verbs('git log --grep commit && git merge-base main HEAD && git status')).toEqual([])
    expect(verbs('git rebase --abort && git merge --abort')).toEqual([])
    expect(verbs('echo "git commit -m x" && printf \'%s\' "git push origin main"')).toEqual([])
    expect(verbs('grep -rn "git commit" .')).toEqual([])
  })
  test('a heredoc body that merely contains the words never triggers', () => {
    const cmd = "cat > notes.md <<'EOF'\ngit commit -m x\ngit push origin main\nEOF\necho done"
    expect(verbs(cmd)).toEqual([])
    expect(verbs('cat <<-EOF > x\n\tgit commit\n\tEOF\ngit status')).toEqual([])
    // the command after the heredoc is still read
    expect(verbs('cat > x <<EOF\nhello\nEOF\ngit commit -m y')).toEqual(['commit'])
  })
  test('the folder: -C, a command-position cd, a subshell scope', () => {
    expect(gitWrites('git -C /r commit -m x', G)[0]?.dir).toBe('/r')
    expect(gitWrites('cd /r && git commit', G)[0]?.dir).toBe('/r')
    const two = gitWrites('(cd /x && git commit) && git commit', G)
    expect(two.map(w => w.dir)).toEqual(['/x', ''])
    expect(joinDir('/a/b', '../c')).toBe('/a/c')
    expect(joinDir('/a', '')).toBe('/a')
    expect(joinDir('/a', '/z')).toBe('/z')
  })
  test('tokens: quotes kept whole, separators their own tokens', () => {
    expect(tokenize('git commit -m "a b" && echo \'c;d\'')).toEqual(['git', 'commit', '-m', 'a b', '&&', 'echo', 'c;d'])
  })
})

describe('5D: what the guard denies', () => {
  const MSG = (verb: string, branch: string) => `chassis-delegation: no ${verb} on ${branch}; branch first (git checkout -b agent/<domain>/<id>)`
  test('a commit on main is denied; on agent/ops/X it is allowed', () => {
    expect(denyOn('git commit -m x', 'main')).toBe(MSG('commit', 'main'))
    expect(denyOn('git commit -m x', 'agent/ops/X')).toBeUndefined()
    expect(denyOn('git merge feat', 'master')).toBe(MSG('merge', 'master'))
  })
  test('a push naming a guarded branch is denied from any branch', () => {
    expect(denyOn('git push origin main', 'agent/ops/X')).toBe(MSG('push', 'main'))
    expect(denyOn('git push origin HEAD:refs/heads/main', 'agent/ops/X')).toBe(MSG('push', 'main'))
    expect(denyOn('git push -f origin +agent/ops/X:master', 'agent/ops/X')).toBe(MSG('push', 'master'))
    expect(denyOn('git push -u origin agent/ops/X', 'agent/ops/X')).toBeUndefined()
    expect(denyOn('git push', 'main')).toBe(MSG('push', 'main'))
  })
  test('GH-24: a push is a push OF the current branch only by its refspecs; tags and other-branch deletes pass', () => {
    for (const c of ['git push origin v0.3.0', 'git push origin refs/tags/v0.3.0', 'git push --tags', 'git push origin --tags', 'git push origin --delete agent/mod/GH-21', 'git push origin :agent/mod/GH-21', 'git push origin agent/mod/GH-5', 'git push -f origin agent/mod/GH-5']) {
      expect(denyOn(c, 'main')).toBeUndefined()
    }
    for (const c of ['git push', 'git push origin', 'git push origin main', 'git push origin HEAD', 'git push origin HEAD:main', 'git push origin HEAD:refs/heads/x', 'git push --all', 'git push --mirror', 'git push origin :main', 'git push origin --delete main', 'git push origin x:main', 'git push origin main:x']) {
      expect(denyOn(c, 'main')).toBe(MSG('push', 'main'))
    }
    expect(denyOn('git push origin v1 main', 'main')).toBe(MSG('push', 'main'))
    expect(denyOn('git push origin v1 HEAD', 'main')).toBe(MSG('push', 'main'))
    expect(denyOn('git push origin v1', 'agent/ops/X')).toBeUndefined()
  })
  test('branching first in the same command lets the commit through; switching back to main does not', () => {
    expect(denyOn('git checkout -b agent/ops/X && git commit -m y', 'main')).toBeUndefined()
    expect(denyOn('git switch -c agent/ops/X && git commit -m y', 'main')).toBeUndefined()
    expect(denyOn('git checkout main && git commit -m y', 'agent/ops/X')).toBe(MSG('commit', 'main'))
    expect(denyOn('git checkout -b agent/ops/X && git checkout - && git commit', 'main')).toBe(MSG('commit', 'main'))
  })
  test('an unknown branch (not a repo, detached) is let through; guardBranches is configurable', () => {
    expect(denyOn('git commit', undefined)).toBeUndefined()
    expect(parseGuardBranches(' main, release ,')).toEqual(['main', 'release'])
    expect(parseGuardBranches('')).toEqual(['main', 'master'])
    expect(gitWrites('git commit', ['release']).map(w => guardDeny(w, 'release', ['release']))[0]).toBe(MSG('commit', 'release'))
  })
})
