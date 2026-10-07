// 5G: the native verifier against REAL git repositories built in a temp folder
// under tests/.tmp/ (Node only: `claude plugin test` cannot run git for a
// test). Every argv the verifier runs goes through the mod's own allowlist
// first, exactly as `run()` does in a session, so a command the allowlist
// refuses fails here too. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'
import { verifyNative } from '../../hooks/lib/verify-native.ts'
import { parseReport } from '../../hooks/lib/brief.ts'
import { checkArgv } from '../../hooks/lib/allow.ts'
import { gateTemplatesOf } from '../../hooks/lib/gates.ts'

const TMP = fileURLToPath(new URL('../.tmp/', import.meta.url))
const GATE_MAP = { check: 'bash gate.sh' }
const ALLOW = { gateTemplates: gateTemplatesOf(GATE_MAP) }

/** Setup only (not through the allowlist): a fixed identity, no hooks, no signing. */
function sh(dir, ...args) {
  return execFileSync('git', ['-C', dir, '-c', 'user.name=Test', '-c', 'user.email=t@example.com', '-c', 'commit.gpgsign=false', '-c', 'core.hooksPath=/dev/null', ...args], { encoding: 'utf8' }).trim()
}

function write(dir, path, text) {
  const full = join(dir, path)
  mkdirSync(full.slice(0, full.lastIndexOf('/')), { recursive: true })
  writeFileSync(full, text)
}

/**
 * A repo with main (README.md, gate.sh) and agent/ops/T-1 carrying two
 * commits (src/a.ts, then docs/x.md); `other` is a branch off main with its
 * own commit. The gate passes while src/a.ts exists.
 */
function makeRepo() {
  mkdirSync(TMP, { recursive: true })
  const dir = mkdtempSync(join(TMP, 'repo-'))
  execFileSync('git', ['init', '-q', '-b', 'main', dir])
  write(dir, 'README.md', '# t\n')
  write(dir, 'gate.sh', 'test -f src/a.ts\n')
  write(dir, 'src/old/x.md', 'a moved file with enough text to be detected as a rename\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'base')
  sh(dir, 'checkout', '-q', '-b', 'other')
  write(dir, 'other.txt', 'x\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'other')
  const otherSha = sh(dir, 'rev-parse', '--short', 'HEAD')
  sh(dir, 'checkout', '-q', 'main')
  sh(dir, 'checkout', '-q', '-b', 'agent/ops/T-1')
  write(dir, 'src/a.ts', 'export const a = 1\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'one')
  write(dir, 'docs/x.md', 'x\n')
  sh(dir, 'add', '-A')
  sh(dir, 'commit', '-q', '-m', 'two')
  return { dir, sha: sh(dir, 'rev-parse', '--short', 'HEAD'), otherSha }
}

function io() {
  const ran = []
  const refused = []
  const files = {}
  return {
    ran,
    refused,
    files,
    exec: async (argv, init) => {
      const check = checkArgv(argv, ALLOW)
      if (!check.ok) {
        refused.push(argv.join(' '))
        return { ok: false, why: `refused: ${check.reason}` }
      }
      ran.push(argv.join(' '))
      const r = spawnSync(argv[0], argv.slice(1), { cwd: init?.cwd, encoding: 'utf8', timeout: init?.timeoutMs ?? 30000 })
      if (r.error) return { ok: false, why: String(r.error) }
      return { ok: true, exitCode: r.status ?? 1, stdout: r.stdout ?? '', stderr: r.stderr ?? '' }
    },
    write: async (path, text) => {
      files[path] = text
    },
    // GH-20: what register.ts does through $.fs, with Node's own fs and sha-256
    readRed: async path => {
      if (!existsSync(path)) return { exists: false }
      const bytes = readFileSync(path)
      return { exists: true, bytes: bytes.length, text: bytes.toString('utf8'), hash: createHash('sha256').update(bytes).digest('hex') }
    },
  }
}

const BRIEF = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=secrets/** gate=check budget=2-attempts report=chassis.report.v1]]\n\nbody\n'
const report = (f) => parseReport(`[[report v=1 task=T-1 subtask=main branch=${f.branch ?? 'agent/ops/T-1'} pr=none sha=${f.sha} gate=${f.gate ?? 'pass'} files=${f.files ?? 'src/a.ts,docs/x.md'}]]`)
const input = (repo, f) => ({ repo, report: report(f), briefText: BRIEF, gateMap: GATE_MAP, allowed: argv => checkArgv(argv, ALLOW).ok, filesPath: '/x/.delegation/T-1/files.txt' })
const BRIEF_RED = BRIEF.replace(' gate=check', ' red_test="bash gate.sh" gate=check')

describe('5G: native verify against a real git repository', () => {
  test('two commits on the branch, everything as reported: verified', async () => {
    const { dir, sha } = makeRepo()
    try {
      const t = io()
      const r = await verifyNative(input(dir, { sha }), t)
      expect(t.refused).toEqual([])
      expect(r.lines).toContain('claim branch: held — refs/heads/agent/ops/T-1')
      expect(r.lines).toContain('claim files: held — files= matches the sha delta exactly')
      expect(r.lines).toContain(`claim gate: held — gate green at ${sha} (gate=pass confirmed)`)
      expect(r.verdict).toBe('verified')
      // files.txt is the actual delta in git's order, not the report's
      expect(t.files['/x/.delegation/T-1/files.txt']).toBe('docs/x.md\nsrc/a.ts\n')
      expect(t.ran).toContain('bash gate.sh')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('GH-102: a worker commit that git mv-s a file lists it once, at the new path: held', async () => {
    const { dir } = makeRepo()
    try {
      mkdirSync(join(dir, 'src/new'), { recursive: true })
      sh(dir, 'mv', 'src/old/x.md', 'src/new/x.md')
      sh(dir, 'commit', '-q', '-m', 'move')
      const sha = sh(dir, 'rev-parse', '--short', 'HEAD')
      const t = io()
      const r = await verifyNative(input(dir, { sha, files: 'src/a.ts,docs/x.md,src/new/x.md' }), t)
      expect(t.refused).toEqual([])
      expect(r.lines).toContain('claim files: held — files= matches the sha delta exactly')
      const both = await verifyNative(input(dir, { sha, files: 'src/a.ts,docs/x.md,src/old/x.md,src/new/x.md' }), io())
      expect(both.lines).toContain('claim files: held — files= matches the sha delta exactly (1 rename collapsed)')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a sha that is not on the branch: refuted', async () => {
    const { dir, otherSha } = makeRepo()
    try {
      const r = await verifyNative(input(dir, { sha: otherSha }), io())
      expect(r.verdict).toBe('refuted')
      expect(r.lines).toContain(`claim sha: failed — sha ${otherSha} exists but is NOT reachable on agent/ops/T-1`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a dirty tree: the gate is unchecked and never run', async () => {
    const { dir, sha } = makeRepo()
    try {
      write(dir, 'src/b.ts', 'uncommitted\n')
      const t = io()
      const r = await verifyNative(input(dir, { sha }), t)
      expect(r.verdict).toBe('unverified')
      expect(r.lines).toContain('claim gate: unchecked — tree not at sha: 1 uncommitted path in the worktree; the gate was not re-run')
      expect(t.ran.includes('bash gate.sh')).toBe(false)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('files= that misses a changed path: refuted, naming it', async () => {
    const { dir, sha } = makeRepo()
    try {
      const r = await verifyNative(input(dir, { sha, files: 'src/a.ts' }), io())
      expect(r.verdict).toBe('refuted')
      expect(r.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): omits docs/x.md')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a sha that does not exist: refuted as a fabrication', async () => {
    const { dir } = makeRepo()
    try {
      const r = await verifyNative(input(dir, { sha: 'deadbeef' }), io())
      expect(r.verdict).toBe('refuted')
      expect(r.lines).toContain(`claim sha: failed — sha 'deadbeef' does not exist in ${dir} (fabrication)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('a red gate under gate=pass: refuted', async () => {
    const { dir } = makeRepo()
    try {
      sh(dir, 'rm', '-q', 'src/a.ts')
      sh(dir, 'commit', '-q', '-m', 'drop a')
      const sha = sh(dir, 'rev-parse', '--short', 'HEAD')
      const r = await verifyNative(input(dir, { sha, files: 'docs/x.md' }), io())
      expect(r.verdict).toBe('refuted')
      expect(r.lines).toContain(`claim gate: failed — gate=pass claimed but the gate is RED at ${sha} (exit 1)`)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test('GH-20: a red file in the worktree (.delegation/ ignored, so the tree stays clean): the red claim holds with its sha-256', async () => {
    const { dir, sha } = makeRepo()
    try {
      writeFileSync(join(dir, '.git/info/exclude'), '.delegation/\n')
      write(dir, '.delegation/T-1/red-1.txt', 'bash gate.sh\nexit code 1: src/a.ts not found\n')
      const body = `${BRIEF_RED.split('\n')[0]}\n\nbody\n`
      const rep = parseReport(`[[report v=1 task=T-1 subtask=main branch=agent/ops/T-1 pr=none sha=${sha} gate=pass red=.delegation/T-1/red-1.txt files=src/a.ts,docs/x.md]]`)
      const t = io()
      const r = await verifyNative({ ...input(dir, { sha }), briefText: body, report: rep }, t)
      expect(t.refused).toEqual([])
      expect(r.lines).toContain(`claim gate: held — gate green at ${sha} (gate=pass confirmed)`)
      expect(r.lines).toContain('claim red: held — .delegation/T-1/red-1.txt, 45 bytes, first failure line: exit code 1: src/a.ts not found')
      expect(r.verdict).toBe('verified')
      expect(r.red?.hash).toBe(createHash('sha256').update('bash gate.sh\nexit code 1: src/a.ts not found\n').digest('hex'))
      // the same file named again by a later attempt is attempt 1's file again
      const again = await verifyNative({ ...input(dir, { sha }), briefText: body, report: rep, priorRed: [{ attempt: 1, hash: r.red?.hash }] }, io())
      expect(again.verdict).toBe('refuted')
      expect(again.lines).toContain("claim red: failed — red evidence is attempt 1's file again (red=.delegation/T-1/red-1.txt is byte-identical to it)")
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

// GH-16: repo=here against a real checkout: the brain's main, dirty, shared with another worker
describe('GH-16: repo=here against a real git checkout', () => {
  const HERE_BRIEF = '[[brief v=1 task=GH-16 subtask=main purpose=build tier=standard scope=src/**,docs/ forbid=secrets/** gate=check repo=here ignore=.delegation/** budget=2-attempts report=chassis.report.v1]]\n\nbody\n'
  function makeCheckout() {
    mkdirSync(TMP, { recursive: true })
    const dir = mkdtempSync(join(TMP, 'here-'))
    execFileSync('git', ['init', '-q', '-b', 'main', dir])
    write(dir, 'src/a.ts', 'export const a = 1\n')
    write(dir, 'docs/old.md', 'old\n')
    write(dir, 'gate.sh', 'test -f src/a.ts && test -f docs/new.md\n')
    sh(dir, 'add', '-A')
    sh(dir, 'commit', '-q', '-m', 'base')
    // the worker's changes, never committed: unstaged, staged, a staged rename
    write(dir, 'src/a.ts', 'export const a = 2\n')
    write(dir, 'src/new.ts', 'export const n = 1\n')
    sh(dir, 'add', 'src/new.ts')
    sh(dir, 'mv', 'docs/old.md', 'docs/new.md')
    // the brain's scratch and another in-flight worker's file, untracked
    write(dir, '.delegation/briefs/GH-16.brief.md', HERE_BRIEF)
    write(dir, 'src/b.ts', 'export const b = 1\n')
    return dir
  }
  const hereInput = (dir, others, files = 'src/a.ts,src/new.ts,docs/new.md') => ({
    repo: dir,
    here: true,
    report: parseReport(`[[report v=1 task=GH-16 subtask=main branch=main pr=none sha=HEAD gate=pass files=${files}]]`),
    briefText: HERE_BRIEF,
    gateMap: GATE_MAP,
    allowed: argv => checkArgv(argv, ALLOW).ok,
    filesPath: '/x/.delegation/GH-16/files.txt',
    others,
  })

  test('the dirty-tree delta less ignore= and the other card: verified, the gate run on the dirty tree', async () => {
    const dir = makeCheckout()
    try {
      const t = io()
      const r = await verifyNative(hereInput(dir, [{ card: 'GH-19', files: ['src/b.ts'] }]), t)
      expect(t.refused).toEqual([])
      expect(r.lines).toContain(`claim branch: held — main is the current branch of ${dir}`)
      expect(r.lines).toContain('ignored: 1 path by ignore= (.delegation/briefs/GH-16.brief.md), 1 path belonging to GH-19 (src/b.ts)')
      expect(r.lines).toContain('claim files: held — files= matches the dirty-tree delta exactly')
      expect(r.verdict).toBe('verified')
      expect(t.ran).toContain('bash gate.sh')
      expect(t.ran.some(c => c.includes('worktree') || c.includes('fetch'))).toBe(false)
      // the rename is its new path only
      expect((t.files['/x/.delegation/GH-16/files.txt'] ?? '').split('\n').filter(Boolean).sort()).toEqual(['docs/new.md', 'src/a.ts', 'src/new.ts'])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  test("without the other card in flight, its file is in the delta: refuted, naming it", async () => {
    const dir = makeCheckout()
    try {
      const r = await verifyNative(hereInput(dir, []), io())
      expect(r.verdict).toBe('refuted')
      expect(r.lines).toContain('claim files: failed — files= does not match the actual delta (omits or invents a path): omits src/b.ts')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
