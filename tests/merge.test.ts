// MOD-75: `/delegation merge <ID>` does the local half of the merge pipeline (rebase, the merged
// card, the gates) and prints the remote half as one block the brain runs verbatim; `--finish`
// cleans up after the PR lands. Every git call here is answered by the harness; nothing real runs.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT, NOW, type RunAnswer } from './harness'
import { isRemoteArgv } from '../hooks/lib/allow'
import { cardDiff, labelIsMerged, markMerged, parseMergeArgs, prBody, readsMerged } from '../hooks/lib/mergecmd'

const ID = 'MOD-1'
const WT = `${ROOT}-${ID}`
const BRANCH = `agent/mod/${ID}`
const CARD_NAME = `${ID}-a-thing.md`
const CARD_PATH = `${ROOT}/docs/cards/${CARD_NAME}`
const WT_CARD = `${WT}/docs/cards/${CARD_NAME}`
const LEDGER = `${ROOT}/.delegation/ledger.jsonl`
const HEAD = 'def5678def5678def5678def5678def5678def56'
const GATES = {
  validate: 'claude plugin validate {worktree}',
  node: 'node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs',
  test: 'claude plugin test {worktree}',
}
const REPO_FILE = JSON.stringify({ gateMap: GATES, domains: ['mod'], cardDir: 'docs/cards' })
const CARD = [
  '---',
  `id: ${ID}`,
  'title: The thing works',
  'domain: mod',
  'tier: standard',
  'status: queued',
  'scope: [hooks/register.ts]',
  'gate: validate, node, test',
  '---',
  '## Why',
  '',
  'Because.',
  '',
  '## Done when',
  '',
  '- The thing works.',
  '- A test holds it.',
  '',
].join('\n')
const RECORD = { task: ID, subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', verdict: 'consistent', at: NOW - 60_000, sha: 'abc1234', root: ROOT, sessionId: 'sess-1' }
const ledgerRow = (verdict: string, next: string) => JSON.stringify({ task: ID, subtask: 'main', attempt: 1, kind: 'spawn', verdict, sha: 'abc1234', next }) + '\n'
const PORCELAIN = [`worktree ${ROOT}`, 'HEAD 1111111111111111111111111111111111111111', 'branch refs/heads/main', '', `worktree ${WT}`, `HEAD ${HEAD}`, `branch refs/heads/${BRANCH}`, ''].join('\n')

const is = (argv: string[], ...want: string[]) => argv.join(' ') === want.join(' ')
type Answers = (argv: string[]) => RunAnswer | undefined
/** The happy world's answers: the worktree on its branch and clean, main on main with only the card untracked, origin on GitHub. */
const happy = (over: Answers = () => undefined): Answers => argv => {
  const o = over(argv)
  if (o) return o
  if (is(argv, 'git', '-C', ROOT, 'worktree', 'list', '--porcelain')) return { exitCode: 0, stdout: PORCELAIN }
  // MOD-86: a tracked card: git does not ignore the card path
  if (is(argv, 'git', '-C', ROOT, 'check-ignore', '-q', '--', `docs/cards/${CARD_NAME}`)) return { exitCode: 1, stdout: '' }
  if (is(argv, 'git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')) return { exitCode: 0, stdout: 'main\n' }
  if (is(argv, 'git', '-C', ROOT, 'status', '--porcelain')) return { exitCode: 0, stdout: `?? docs/cards/${CARD_NAME}\n` }
  if (is(argv, 'git', '-C', ROOT, 'remote', 'get-url', 'origin')) return { exitCode: 0, stdout: 'git@github.com:acme/acme-app.git\n' }
  if (is(argv, 'git', '-C', WT, 'rev-parse', 'HEAD')) return { exitCode: 0, stdout: `${HEAD}\n` }
  return undefined
}
const files = (ledger = ledgerRow('consistent', 'accept')) => ({ [`${ROOT}/.chassis-delegation.json`]: REPO_FILE, [CARD_PATH]: CARD, [LEDGER]: ledger })
const store = { [`delegation.tasks.${ID}`]: [RECORD] }
const dirs = { [`${ROOT}/docs/cards`]: [CARD_NAME] }
const mergeCmd = (args: string) => ({ command: 'delegation', args: `merge ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
/** The fenced block after `remote:` in a merge answer, as lines. */
const blockOf = (text: string): string[] => (/```sh\n([\s\S]*?)\n```/.exec(text)?.[1] ?? '').split('\n').filter(Boolean)

describe('MOD-75: /delegation merge <id>', () => {
  test('red: after a consistent verdict with a clean worktree, merge rebases, commits the merged card, runs the gates and prints the push block', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    // on main, merge was no subcommand: the answer was the usage line
    expect(out).not.toMatch(/^usage: \/delegation/)
    const ran = w.runs.map(r => r.argv.join(' '))
    expect(ran).toContain(`git -C ${WT} fetch origin`)
    expect(ran).toContain(`git -C ${WT} rebase origin/main`)
    expect(w.runs.find(r => r.argv.includes('commit'))?.argv).toContain(`cards: ${ID} merged`)
    expect(ran).toContain(`claude plugin validate ${WT}`)
    expect(ran).toContain('node --no-warnings --import ./tests/node/register.mjs tests/node/run.mjs')
    expect(ran).toContain(`claude plugin test ${WT}`)
    expect(blockOf(out)[0]).toBe(`git -C ${WT} push -u origin ${BRANCH}`)
  })

  test('happy path: the exact argv sequence, the merged card, the gate log, pr.md and the printed block', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.slice(from).map(r => r.argv)).toEqual([
      ['git', '-C', ROOT, 'worktree', 'list', '--porcelain'],
      ['git', '-C', WT, 'status', '--porcelain'],
      ['git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD'],
      ['git', '-C', ROOT, 'status', '--porcelain'],
      ['git', '-C', ROOT, 'check-ignore', '-q', '--', `docs/cards/${CARD_NAME}`],
      ['git', '-C', ROOT, 'remote', 'get-url', 'origin'],
      ['git', '-C', WT, 'fetch', 'origin'],
      ['git', '-C', WT, 'rebase', 'origin/main'],
      ['git', '-C', WT, 'add', '--', `docs/cards/${CARD_NAME}`],
      ['git', '-C', WT, 'commit', '-q', '-m', `cards: ${ID} merged`, '-m', 'Co-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>'],
      ['git', '-C', WT, 'rev-parse', 'HEAD'],
      ['git', '-C', WT, 'diff', '--name-only', 'origin/main...HEAD'],
      ['claude', 'plugin', 'validate', WT],
      ['node', '--no-warnings', '--import', './tests/node/register.mjs', 'tests/node/run.mjs'],
      ['claude', 'plugin', 'test', WT],
    ])
    // every write and every gate ran in the worktree
    expect(w.runs.slice(from).filter(r => r.argv[0] !== 'git').every(r => r.cwd === WT)).toBe(true)
    expect(blockOf(out)).toEqual([
      `git -C ${WT} push -u origin ${BRANCH}`,
      `gh pr create --repo acme/acme-app --base main --head ${BRANCH} --title 'The thing works' --body-file ${ROOT}/.delegation/${ID}/pr.md`,
      `gh pr merge --repo acme/acme-app ${BRANCH} --rebase`,
      `/delegation merge ${ID} --finish`,
    ])
    expect(out).toContain(`${ID}: rebased onto origin/main; card committed as merged (docs/cards/${CARD_NAME}); gates green at ${HEAD.slice(0, 10)} (validate, node, test)`)
    // the worktree's card reads merged, the rest as the root card
    const merged = w.files.get(WT_CARD) ?? ''
    expect(readsMerged(merged)).toBe(true)
    expect(merged).toBe(CARD.replace('status: queued', 'status: merged'))
    // the gate output and the PR body
    expect(w.files.get(`${ROOT}/.delegation/${ID}/merge-gates.txt`)).toContain('## node: node --no-warnings')
    const pr = w.files.get(`${ROOT}/.delegation/${ID}/pr.md`) ?? ''
    expect(pr).toContain('- [x] The thing works.')
    expect(pr).toContain('- [x] A test holds it.')
    expect(pr).toContain(`${ID} attempt 1: consistent at abc1234 · next=accept`)
    expect(pr).toContain('- validate (`claude plugin validate {worktree}`): pass')
    expect(pr.trimEnd().split('\n').at(-1)).toBe('🤖 Generated with [Claude Code](https://claude.com/claude-code)')
    expect(pr).not.toContain(ROOT)
    expect(pr).not.toMatch(/\/(Users|home)\//)
  })

  test('the merge tool is registered and answers as the command does (one function, two doors)', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    expect(w.tools).toContain('merge')
    const r = (await $.tool.call({ tool: 'mcp__chassis-delegation__merge', task: ID } as never)) as { result?: unknown }
    expect(blockOf(String(r.result))[0]).toBe(`git -C ${WT} push -u origin ${BRANCH}`)
  })

  test('refusal: the last verdict is not consistent/accept; nothing runs', async ($, on) => {
    const w = world(on, { files: files(ledgerRow('consistent', 'accept') + ledgerRow('refuted', 'resume')), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const from = w.runs.length
    expect(String((await $.command.run(mergeCmd(ID))).text)).toBe(`${ID}: last verdict is refuted · next=resume; merge needs consistent/accept`)
    expect(w.runs.slice(from)).toHaveLength(0)
  })

  test('refusal: a dirty worktree names the dirty file; nothing is fetched', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy(argv => (is(argv, 'git', '-C', WT, 'status', '--porcelain') ? { exitCode: 0, stdout: ' M hooks/register.ts\n' } : undefined)) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(out).toBe(`${ID}: the worktree ${WT} is not clean: hooks/register.ts; commit or remove it first`)
    expect(w.runs.some(r => r.argv.includes('fetch'))).toBe(false)
  })

  test('refusal: the main checkout has tracked changes (an untracked root card is fine)', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy(argv => (is(argv, 'git', '-C', ROOT, 'status', '--porcelain') ? { exitCode: 0, stdout: ` M README.md\n?? docs/cards/${CARD_NAME}\n` } : undefined)) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(out).toBe(`${ID}: the main checkout ${ROOT} has tracked changes: README.md; commit or stash them first (untracked files are fine)`)
    expect(w.runs.some(r => r.argv.includes('fetch') || r.argv.includes('rebase'))).toBe(false)
  })

  test('a rebase conflict aborts the rebase and names the files; nothing is committed', async ($, on) => {
    const w = world(on, {
      files: files(),
      dirs,
      store,
      run: happy(argv => {
        if (is(argv, 'git', '-C', WT, 'rebase', 'origin/main')) return { exitCode: 1, stdout: '', stderr: 'CONFLICT (content): Merge conflict in hooks/register.ts' }
        if (is(argv, 'git', '-C', WT, 'diff', '--name-only', '--diff-filter=U')) return { exitCode: 0, stdout: 'hooks/register.ts\nREADME.md\n' }
        return undefined
      }),
    })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(out).toBe(`${ID}: rebase onto origin/main conflicts in hooks/register.ts, README.md; resolve by hand`)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${WT} rebase --abort`)
    expect(w.runs.some(r => r.argv.includes('commit'))).toBe(false)
    expect(w.files.has(WT_CARD)).toBe(false)
  })

  test('a failing gate stops the merge: the gate, the sha, the last 20 lines; no block, the later gates do not run', async ($, on) => {
    const noisy = Array.from({ length: 30 }, (_, i) => `line ${i + 1}`).join('\n')
    const w = world(on, { files: files(), dirs, store, run: happy(argv => (argv[0] === 'node' ? { exitCode: 1, stdout: noisy, stderr: '' } : undefined)) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    const lines = out.split('\n')
    expect(lines[0]).toBe(`${ID}: gate node failed at ${HEAD.slice(0, 10)}; not pushed`)
    expect(lines.slice(1)).toEqual(Array.from({ length: 20 }, (_, i) => `line ${i + 11}`))
    expect(out).not.toContain('```')
    expect(w.runs.some(r => is(r.argv, 'claude', 'plugin', 'test', WT))).toBe(false)
    expect(w.files.get(`${ROOT}/.delegation/${ID}/merge-gates.txt`)).toContain('line 30')
    expect(w.files.has(`${ROOT}/.delegation/${ID}/pr.md`)).toBe(false)
  })

  test('a worktree that already carries the merged card commits nothing again; --review appends a Review section the first time', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(`${ID} --review Accepted as handed back; no fixes.`))
    expect(w.files.get(WT_CARD)).toContain('## Review\n\nAccepted as handed back; no fixes.')
    const commits = () => w.runs.filter(r => r.argv.includes('commit')).length
    expect(commits()).toBe(1)
    const again = String((await $.command.run(mergeCmd(ID))).text)
    expect(commits()).toBe(1)
    expect(again).toContain('the worktree already carries the merged card; nothing committed again')
    expect(blockOf(again)[0]).toBe(`git -C ${WT} push -u origin ${BRANCH}`)
  })

  // ---- --finish ----------------------------------------------------------------------------
  const TWIN = '9999999999999999999999999999999999999999'
  const TREE = 'aaaa111122223333444455556666777788889999'
  const landed = (card = markMerged(CARD), over: Answers = () => undefined): Answers =>
    happy(argv => {
      const o = over(argv)
      if (o) return o
      if (is(argv, 'git', '-C', WT, 'log', '-1', '--format=%T%x09%s', 'HEAD')) return { exitCode: 0, stdout: `${TREE}\tcards: ${ID} merged\n` }
      if (is(argv, 'git', '-C', ROOT, 'log', '--format=%H%x09%T%x09%s', '-n', '200', 'origin/main')) return { exitCode: 0, stdout: `${TWIN}\t${TREE}\tcards: ${ID} merged\n1234567123456712345671234567123456712345\tbbbb\tolder\n` }
      if (is(argv, 'git', '-C', ROOT, 'show', `${TWIN}:docs/cards/${CARD_NAME}`)) return { exitCode: 0, stdout: card }
      return undefined
    })

  test('--finish before the PR landed refuses: the branch is not in origin/main yet; nothing is removed', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out).toBe(`${ID}: ${BRANCH} is not in origin/main yet`)
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran).toContain(`git -C ${ROOT} fetch origin`)
    expect(ran.some(a => / (clean|pull|worktree remove|branch -D) /.test(` ${a} `))).toBe(false)
  })

  test('--finish happy path, no version bump: root card removed, pull, worktree and branch removed, record and ledger, the delete block; /delegation lists it under merged:', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: landed() })
    await $.session.start(sessionStart)
    await $.command.run(mergeCmd(ID))
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(w.runs.slice(from).map(r => r.argv)).toEqual([
      ['git', '-C', ROOT, 'worktree', 'list', '--porcelain'],
      ['git', '-C', ROOT, 'check-ignore', '-q', '--', `docs/cards/${CARD_NAME}`],
      ['git', '-C', ROOT, 'fetch', 'origin'],
      ['git', '-C', WT, 'rev-parse', 'HEAD'],
      ['git', '-C', ROOT, 'merge-base', '--is-ancestor', HEAD, 'origin/main'],
      ['git', '-C', WT, 'log', '-1', '--format=%T%x09%s', 'HEAD'],
      ['git', '-C', ROOT, 'log', '--format=%H%x09%T%x09%s', '-n', '200', 'origin/main'],
      ['git', '-C', WT, 'status', '--porcelain', '--ignored', '--untracked-files=all'],
      ['git', '-C', ROOT, 'show', `${TWIN}:docs/cards/${CARD_NAME}`],
      ['git', '-C', ROOT, 'clean', '-q', '-f', '--', `docs/cards/${CARD_NAME}`],
      ['git', '-C', ROOT, 'pull', '--ff-only'],
      ['git', '-C', ROOT, 'worktree', 'unlock', WT],
      ['git', '-C', ROOT, 'worktree', 'remove', WT],
      ['git', '-C', ROOT, 'branch', '-D', BRANCH],
    ])
    expect(blockOf(out)).toEqual([`git push origin --delete ${BRANCH}`])
    expect(out.split('\n').at(-1)).toBe(`${ID} merged at ${TWIN}`)
    expect(out).not.toContain('release v')
    const recs = w.store.get(`delegation.tasks.${ID}@${ROOT}`) as Record<string, unknown>[]
    expect(recs[0]).toMatchObject({ retired: 'merged', mergedSha: TWIN })
    const rows = (w.files.get(LEDGER) ?? '').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
    expect(rows.at(-1)).toMatchObject({ kind: 'merged', task: ID, sha: TWIN })
    const status = String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(status).toContain(`merged:\n- ${ID} at ${TWIN.slice(0, 10)}`)
  })

  test('--finish with a version bump: the tag, its push and the loaded clone pull ride in the block; the release line ends it', async ($, on) => {
    const extra = { [`${WT}/hooks/lib/version.ts`]: "export const MOD_VERSION = '0.9.9'\n" }
    const w = world(on, {
      files: { ...files(), ...extra },
      dirs,
      store,
      run: landed(undefined, argv => (is(argv, 'git', '-C', WT, 'diff', '--name-only', 'origin/main...HEAD') ? { exitCode: 0, stdout: 'hooks/lib/version.ts\nCHANGELOG.md\n' } : undefined)),
    })
    await $.session.start(sessionStart)
    // the loaded clone: the folder the mod loaded from, a git checkout other than the session root
    const status = String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    const loaded = /loaded from (\S+)/.exec(status)?.[1] ?? ''
    expect(loaded).not.toBe('')
    w.files.set(`${loaded}/.git`, 'gitdir: x')
    const prep = String((await $.command.run(mergeCmd(ID))).text)
    expect(prep).toContain('releases v0.9.9')
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(blockOf(out)).toEqual([`git push origin --delete ${BRANCH}`, 'git tag -a v0.9.9 -m v0.9.9', 'git push origin v0.9.9', `git -C ${loaded} pull --ff-only`])
    expect(out.split('\n').slice(-2)).toEqual([`${ID} merged at ${TWIN}`, 'release v0.9.9: run the block above, then reload the window'])
    const after = String((await $.command.run({ command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)).text)
    expect(after).toContain(`- ${ID} at ${TWIN.slice(0, 10)} (v0.9.9)`)
  })

  test('--finish when the merged card on origin differs from the root card: the lines are named, the root card is left, nothing is pulled or removed', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: landed(markMerged(CARD.replace('- A test holds it.', '- A test holds it, twice.'))) })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out.split('\n')).toEqual([`${ID}: the merged card on origin/main differs from docs/cards/${CARD_NAME} (status aside); the root card is left and nothing else was done:`, '- - A test holds it.', '+ - A test holds it, twice.'])
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran.some(a => / (clean|pull|worktree remove|branch -D) /.test(` ${a} `))).toBe(false)
  })

  // ---- MOD-142: finish keeps a worker's evidence ----------------------------------------------
  const STATUS_ARGV = ['git', '-C', WT, 'status', '--porcelain', '--ignored', '--untracked-files=all']
  const withStatus = (stdout: string, exitCode = 0): Answers => landed(markMerged(CARD), argv => (is(argv, ...STATUS_ARGV) ? { exitCode, stdout } : undefined))
  const EVIDENCE = '!! .local/run/log.txt\n!! .local/run/shot.png\n'

  test('MOD-142: --finish with ignored evidence in the worktree stops, names it, and removes nothing', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: withStatus(EVIDENCE) })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out.split('\n')).toEqual([
      `${ID}: the worktree ${WT} holds 2 untracked or ignored files the merge does not carry; copy what you need, then run /delegation merge ${ID} --finish again, or add --discard to delete them:`,
      '.local/run/log.txt',
      '.local/run/shot.png',
    ])
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran.some(a => / (clean|pull|worktree remove|branch -D) /.test(` ${a} `))).toBe(false)
    expect(w.files.get(LEDGER)).not.toContain('"kind":"merged"')
  })

  for (const unlockExit of [0, 128]) {
    test(`MOD-152 (#246): --finish on a locked worktree unlocks, then removes (unlock exits ${unlockExit})`, async ($, on) => {
      const w = world(on, { files: files(), dirs, store, run: landed(markMerged(CARD), argv => (is(argv, 'git', '-C', ROOT, 'worktree', 'unlock', WT) ? { exitCode: unlockExit, stdout: '', stderr: unlockExit ? 'not locked' : '' } : undefined)) })
      await $.session.start(sessionStart)
      const from = w.runs.length
      const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
      const ran = w.runs.slice(from).map(r => r.argv.join(' '))
      const unlock = ran.indexOf(`git -C ${ROOT} worktree unlock ${WT}`)
      expect(unlock).toBeGreaterThanOrEqual(0)
      expect(ran.indexOf(`git -C ${ROOT} worktree remove ${WT}`)).toBe(unlock + 1)
      expect(out.split('\n').at(-1)).toBe(`${ID} merged at ${TWIN}`)
    })
  }

  test('MOD-142: --finish --discard completes and notes what it discarded', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: withStatus(EVIDENCE) })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish --discard`))).text)
    expect(out).toContain(`note: discarded 2 untracked or ignored files from ${WT}`)
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran).toContain(`git -C ${ROOT} worktree remove ${WT}`)
    expect(out.split('\n').at(-1)).toBe(`${ID} merged at ${TWIN}`)
  })

  test('MOD-142: --discard with an untracked file: the worktree is not removed, the note says why, no discarded line, no merged row, branch kept', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: landed(markMerged(CARD), argv => (is(argv, ...STATUS_ARGV) ? { exitCode: 0, stdout: '?? notes.txt\n!! .local/log.txt\n' } : is(argv, 'git', '-C', ROOT, 'worktree', 'remove', WT) ? { exitCode: 1, stdout: '', stderr: 'contains untracked files' } : undefined)) })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish --discard`))).text)
    expect(out).toContain(`note: the worktree ${WT} was not removed: it still holds 1 untracked files (git removes ignored files but not untracked ones); delete them, then run /delegation merge ${ID} --finish again`)
    expect(out).not.toContain('discarded')
    expect(w.runs.slice(from).map(r => r.argv.join(' ')).some(a => a.includes('branch -D'))).toBe(false)
    expect(w.files.get(LEDGER)).not.toContain('"kind":"merged"')
  })

  test('MOD-142: only node_modules/ and .delegation/ present: finish completes with no note', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: withStatus('!! node_modules/\n!! .delegation/MOD-1/red-1.txt\n!! pkg/node_modules/x/y.js\n') })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out).not.toContain('discarded')
    expect(out).not.toContain('note:')
    expect(w.runs.slice(from).map(r => r.argv.join(' '))).toContain(`git -C ${ROOT} worktree remove ${WT}`)
  })

  test('MOD-142: a status read that fails is a note and finish goes on', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: withStatus('', 128) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out).toContain(`note: could not list untracked or ignored files in ${WT}: exit 128`)
    expect(out.split('\n').at(-1)).toBe(`${ID} merged at ${TWIN}`)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${ROOT} worktree remove ${WT}`)
  })

  test('MOD-142: --discard without --finish is refused', async ($, on) => {
    world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(`${ID} --discard`))).text)
    expect(out).toContain('refused --discard without --finish')
  })

  test('no argv the command runs, prepare or finish, is a push, gh, curl or sf', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: landed() })
    await $.session.start(sessionStart)
    const from = w.runs.length
    await $.command.run(mergeCmd(`${ID} --review fine`))
    await $.command.run(mergeCmd(`${ID} --finish`))
    const ran = w.runs.slice(from).map(r => r.argv)
    expect(ran.length).toBeGreaterThan(20)
    expect(ran.filter(a => ['gh', 'curl', 'sf'].includes(a[0] ?? '') || a.includes('push'))).toEqual([])
    expect(ran.filter(a => isRemoteArgv(a))).toEqual([])
  })
})

describe('MOD-86: a git-ignored card folder', () => {
  const REL = `docs/cards/${CARD_NAME}`
  /** The stand-in git of a repo that keeps its cards local: check-ignore says ignored, and add refuses an ignored path. */
  const ignoring = (over: Answers = () => undefined): Answers =>
    happy(argv => {
      const o = over(argv)
      if (o) return o
      if (is(argv, 'git', '-C', ROOT, 'check-ignore', '-q', '--', REL)) return { exitCode: 0, stdout: '' }
      if (argv[3] === 'add') return { exitCode: 1, stdout: '', stderr: 'The following paths are ignored by one of your .gitignore files:\n' + REL }
      return undefined
    })

  test('red: an ignored card is marked merged in the root checkout; no add, no card commit; the first line says it was kept local', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: ignoring() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(`${ID} --review Accepted as handed back.`))).text)
    const ran = w.runs.map(r => r.argv.join(' '))
    expect(ran).toContain(`git -C ${ROOT} check-ignore -q -- ${REL}`)
    expect(ran.some(a => a.includes(' add '))).toBe(false)
    expect(ran.some(a => a.includes(' commit '))).toBe(false)
    const root = w.files.get(CARD_PATH) ?? ''
    expect(readsMerged(root)).toBe(true)
    expect(root).toContain('## Review\n\nAccepted as handed back.')
    expect(w.files.has(WT_CARD)).toBe(false)
    expect(out.split('\n')[0]).toContain(`card kept local (git-ignored): ${CARD_PATH} marked merged; gates green at ${HEAD.slice(0, 10)}`)
    expect(out).not.toContain('card committed as merged')
    expect(ran).toContain(`git -C ${WT} rebase origin/main`)
    expect(ran).toContain(`claude plugin test ${WT}`)
    expect(blockOf(out)[0]).toBe(`git -C ${WT} push -u origin ${BRANCH}`)
    expect(w.files.get(`${ROOT}/.delegation/${ID}/pr.md`)).toContain('- [x] The thing works.')
  })

  const TWIN = '9999999999999999999999999999999999999999'
  const TREE = 'aaaa111122223333444455556666777788889999'
  const merged = markMerged(CARD, 'ok')
  const landedIgnored = (over: Answers = () => undefined): Answers =>
    ignoring(argv => {
      const o = over(argv)
      if (o) return o
      if (is(argv, 'git', '-C', WT, 'log', '-1', '--format=%T%x09%s', 'HEAD')) return { exitCode: 0, stdout: `${TREE}\tcards: ${ID} merged\n` }
      if (is(argv, 'git', '-C', ROOT, 'log', '--format=%H%x09%T%x09%s', '-n', '200', 'origin/main')) return { exitCode: 0, stdout: `${TWIN}\t${TREE}\tcards: ${ID} merged\n` }
      return undefined
    })

  test('--finish with a rebased twin on origin: cleans up, writes the merged row, keeps the root card', async ($, on) => {
    const w = world(on, { files: { ...files(), [CARD_PATH]: merged }, dirs, store, run: landedIgnored() })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran.some(a => / (show|clean) /.test(a))).toBe(false)
    expect(ran).toContain(`git -C ${ROOT} pull --ff-only`)
    expect(ran).toContain(`git -C ${ROOT} worktree remove ${WT}`)
    expect(ran).toContain(`git -C ${ROOT} branch -D ${BRANCH}`)
    expect(w.files.get(CARD_PATH)).toBe(merged)
    expect(blockOf(out)).toEqual([`git push origin --delete ${BRANCH}`])
    expect(out).toContain('root card kept (git-ignored)')
    expect(out.split('\n').at(-1)).toBe(`${ID} merged at ${TWIN}`)
    const rows = (w.files.get(LEDGER) ?? '').trim().split('\n').map(l => JSON.parse(l) as Record<string, unknown>)
    expect(rows.at(-1)).toMatchObject({ kind: 'merged', task: ID, sha: TWIN })
  })

  test('--finish with neither the head nor a twin on origin refuses, names the head and removes nothing', async ($, on) => {
    const w = world(on, { files: { ...files(), [CARD_PATH]: merged }, dirs, store, run: landedIgnored(argv => (is(argv, 'git', '-C', ROOT, 'log', '--format=%H%x09%T%x09%s', '-n', '200', 'origin/main') ? { exitCode: 0, stdout: '1234567123456712345671234567123456712345\tbbbb\tolder\n' } : undefined)) })
    await $.session.start(sessionStart)
    const from = w.runs.length
    const out = String((await $.command.run(mergeCmd(`${ID} --finish`))).text)
    expect(out).toContain(HEAD.slice(0, 10))
    expect(out).toContain('is not in origin/main yet')
    const ran = w.runs.slice(from).map(r => r.argv.join(' '))
    expect(ran.some(a => / (clean|pull|worktree remove|branch -D) /.test(` ${a} `))).toBe(false)
    expect(w.files.get(CARD_PATH)).toBe(merged)
    expect(w.files.get(LEDGER)).not.toContain('"kind":"merged"')
  })
})

describe('MOD-118 (#186): merge targets the configured base', () => {
  const repoWith = (baseRef: string) => ({ ...files(), [`${ROOT}/.chassis-delegation.json`]: JSON.stringify({ gateMap: GATES, domains: ['mod'], cardDir: 'docs/cards', baseRef }) })
  /** The checkout is on `branch`; `remote` names the origin branches that exist. */
  const onBranch = (branch: string, remote: string[]): Answers => argv => {
    if (is(argv, 'git', '-C', ROOT, 'rev-parse', '--abbrev-ref', 'HEAD')) return { exitCode: 0, stdout: `${branch}\n` }
    const m = /^refs\/remotes\/origin\/(.+)$/.exec(argv[argv.length - 1] ?? '')
    if (argv.includes('--verify') && m) return { exitCode: remote.includes(m[1] as string) ? 0 : 1, stdout: '' }
    return undefined
  }

  test('red: baseRef names a branch and the checkout is on it: rebase, PR --base and the card all use that branch', async ($, on) => {
    const w = world(on, { files: repoWith('work'), dirs, store, run: happy(onBranch('work', ['main', 'work'])) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(out).not.toContain('is on work, not main')
    const ran = w.runs.map(r => r.argv.join(' '))
    expect(ran).toContain(`git -C ${WT} rebase origin/work`)
    expect(blockOf(out)[1]).toContain('--base work --head')
    expect(out).toContain(`${ID}: rebased onto origin/work;`)
    expect(out).not.toContain('is not a branch')
  })

  test('an origin/-prefixed branch works the same', async ($, on) => {
    const w = world(on, { files: repoWith('origin/work'), dirs, store, run: happy(onBranch('work', ['work'])) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${WT} rebase origin/work`)
    expect(blockOf(out)[1]).toContain('--base work --head')
  })

  test('the checkout on the default branch is refused, naming the baseRef branch', async ($, on) => {
    const w = world(on, { files: repoWith('origin/work'), dirs, store, run: happy(onBranch('main', ['main', 'work'])) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(out).toBe(`${ID}: the main checkout ${ROOT} is on main, not work; switch it to work first`)
    expect(w.runs.some(r => r.argv.includes('fetch') || r.argv.includes('rebase'))).toBe(false)
  })

  test('a sha baseRef is not a branch: the default branch as today, and the output says so', async ($, on) => {
    const sha = 'abc1234abc1234abc1234abc1234abc1234abc12'
    const w = world(on, { files: repoWith(sha), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${WT} rebase origin/main`)
    expect(blockOf(out)[1]).toContain('--base main --head')
    expect(out).toContain(`${ID}: baseRef ${sha} is not a branch; merging onto main`)
  })

  test('a tag baseRef (no such origin branch) is not a branch either', async ($, on) => {
    const w = world(on, { files: repoWith('origin/v1.2'), dirs, store, run: happy(onBranch('main', ['main'])) })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.map(r => r.argv.join(' '))).toContain(`git -C ${WT} rebase origin/main`)
    expect(out).toContain('is not a branch; merging onto main')
  })

  test('unset baseRef: unchanged, no branch probe, no note', async ($, on) => {
    const w = world(on, { files: files(), dirs, store, run: happy() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(mergeCmd(ID))).text)
    expect(w.runs.some(r => r.argv.includes('--verify'))).toBe(false)
    expect(out).not.toContain('is not a branch')
    expect(blockOf(out)[1]).toContain('--base main --head')
  })
})

describe('MOD-75: the merge command\'s pure parts (the allowlist shapes are in tests/allow.test.ts)', () => {
  test('arguments: an id, --finish, --review text or --review-file, and nothing else', () => {
    expect(parseMergeArgs(' MOD-1')).toEqual({ id: 'MOD-1', finish: false })
    expect(parseMergeArgs('MOD-1 --finish')).toEqual({ id: 'MOD-1', finish: true })
    expect(parseMergeArgs('MOD-1 --review all good here')).toEqual({ id: 'MOD-1', finish: false, review: 'all good here' })
    expect(parseMergeArgs('MOD-1 --review-file /tmp/r.md')).toEqual({ id: 'MOD-1', finish: false, reviewFile: '/tmp/r.md' })
    expect('error' in parseMergeArgs('')).toBe(true)
    expect('error' in parseMergeArgs('rm -rf /')).toBe(true)
    expect('error' in parseMergeArgs('MOD-1 --finish --review x')).toBe(true)
    expect('error' in parseMergeArgs('MOD-1 --review-file relative.md')).toBe(true)
    expect(parseMergeArgs('MOD-1 --finish --discard')).toEqual({ id: 'MOD-1', finish: true, discard: true })
    expect(parseMergeArgs('MOD-1 --discard')).toEqual({ error: 'refused --discard without --finish' })
  })
  test('cards compare with the status aside and a Review section allowed as extra', () => {
    expect(cardDiff(markMerged(CARD, 'ok'), CARD)).toEqual([])
    expect(cardDiff(markMerged(CARD), CARD.replace('Because.', 'Because, really.'))).toEqual(['- Because, really.', '+ Because.'])
  })
  test('pr.md carries no absolute path or home folder', () => {
    const body = prBody({ body: `## Done when\n\n- ${WT}/hooks/x.ts and /Users/someone/notes.md hold\n`, verdictLine: 'v', gates: [], folders: [WT, ROOT] })
    expect(body).toContain('- [x] hooks/x.ts and ~/notes.md hold')
    expect(body).not.toContain('/Users/')
  })
  test('a merged task leaves the running and pending lines', () => {
    const merged = [{ task: 'MOD-1', sha: 'abc', at: 0 }]
    expect(labelIsMerged('MOD-1', merged)).toBe(true)
    expect(labelIsMerged('MOD-1/sub', merged)).toBe(true)
    expect(labelIsMerged('MOD-1 (other-repo)', merged)).toBe(true)
    expect(labelIsMerged('MOD-10', merged)).toBe(false)
  })
})
