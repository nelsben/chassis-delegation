// GH-113: the brain's own spend, priced and kept apart from the workers', and the delegate-only decision table (pure).
import { test, expect, describe } from 'claude-code/testing'
import { priceFor } from '../hooks/lib/cost'
import { brainTurn, brainEdit, brainSplit, brainFamily, brainSummary, brainLine, brainTileText, bashWrites, delegateDecision, DELEGATE_DENY, PREMIUM_POSTURE } from '../hooks/lib/brain'
import { mergeConfig, parseRepoConfig, settingsLayer } from '../hooks/lib/repoconfig'

const turn = (model: string, input: number, output: number, read = 0, write = 0) => ({
  model,
  input_tokens: input,
  output_tokens: output,
  cache_read_input_tokens: read,
  cache_creation_input_tokens: write,
})

describe('GH-113: Fable is priced', () => {
  test('fable-5-1 and fable-5 are $10 / $50 per million; the old fable-1 stays unpriced', () => {
    expect(priceFor('claude-fable-5-1')).toEqual({ in: 10, out: 50 })
    expect(priceFor('claude-fable-5')).toEqual({ in: 10, out: 50 })
    expect(priceFor('claude-fable-5-1[1m]')).toEqual({ in: 10, out: 50 })
    expect(priceFor('us.anthropic.claude-fable-5-1')).toEqual({ in: 10, out: 50 })
    expect(priceFor('claude-fable-1')).toBeUndefined()
  })
})

describe('GH-113: the brain record', () => {
  test('main-loop turns add up by model: tokens, dollars, turns', () => {
    let r = brainTurn(undefined, turn('claude-fable-5-1', 100_000, 10_000, 500_000, 20_000))
    // in 1.00 + out 0.50 + read 0.50 + write 0.25
    expect(r.usd).toBe(2.25)
    expect(r.turns).toBe(1)
    expect(r.tokens).toEqual({ in: 100_000, out: 10_000, cacheRead: 500_000, cacheWrite: 20_000 })
    r = brainTurn(r, turn('claude-fable-5-1', 10_000, 1_000))
    r = brainTurn(r, turn('claude-opus-5-5', 100_000, 10_000)) // 0.40 + 0.20
    expect(r.turns).toBe(3)
    expect(Math.round(r.usd * 1e4) / 1e4).toBe(3.0)
    expect(r.byModel['claude-fable-5-1']).toMatchObject({ turns: 2, usd: 2.4 })
    expect(r.byModel['claude-opus-5-5']).toMatchObject({ turns: 1, usd: 0.6 })
    expect(r.unpriced).toBe(false)
  })
  test('an unpriced model keeps its tokens and flags the record; it adds no dollars', () => {
    const r = brainTurn(brainTurn(undefined, turn('claude-fable-5-1', 1_000_000, 0)), turn('claude-mystery-9', 1000, 1000))
    expect(r.usd).toBe(10)
    expect(r.unpriced).toBe(true)
    expect(r.tokens.in).toBe(1_001_000)
  })
  test('brain edits count apart from turns', () => {
    const r = brainEdit(brainEdit(brainTurn(undefined, turn('claude-fable-5-1', 1, 1))))
    expect(r.edits).toBe(2)
    expect(r.turns).toBe(1)
    expect(brainEdit(undefined).edits).toBe(1)
  })
  test('the family of the brain model', () => {
    expect(brainFamily('claude-fable-5-1')).toBe('fable')
    expect(brainFamily('claude-opus-5-5')).toBe('opus')
    expect(brainFamily('us.anthropic.claude-sonnet-5-5')).toBe('sonnet')
    expect(brainFamily('claude-haiku-5-5')).toBe('haiku')
    expect(brainFamily(undefined)).toBe('other')
  })
})

describe('GH-113: the split', () => {
  test('brain, workers, total and the brain share', () => {
    expect(brainSplit(10, 7.5, 2)).toEqual({ total: 10, brain: 7.5, workers: 2, share: 0.75 })
  })
  test('without a session total it is brain + workers; with nothing at all the share is 0', () => {
    expect(brainSplit(undefined, 3, 1)).toEqual({ total: 4, brain: 3, workers: 1, share: 0.75 })
    expect(brainSplit(undefined, 0, 0).share).toBe(0)
  })
  test('the line and the tile', () => {
    const rec = brainTurn(brainTurn(undefined, turn('claude-fable-5-1', 100_000, 10_000, 500_000, 20_000)), turn('claude-fable-5-1', 0, 0))
    const s = brainSummary(rec, 0.75, 3)
    expect(brainLine(s)).toBe('brain: fable $2.25 over 2 turns · workers $0.75 (3 attempts) · brain share 75%')
    expect(brainTileText(s)).toBe('brain $2.25 / workers $0.75')
  })
})

describe('GH-113: delegate-only: the decision table', () => {
  const base = { root: '/repo/x', cardDir: 'docs/cards' }
  const d = (mode: 'off' | 'warn' | 'deny', family: string, tool: string, paths: string[], extra: { commit?: boolean } = {}) =>
    delegateDecision({ mode, brainFamily: family as never, tool, paths, ...base, ...extra })

  test('off, and a sonnet or haiku brain, are never restricted', () => {
    expect(d('off', 'fable', 'Edit', ['/repo/x/src/a.ts'])).toMatchObject({ action: 'allow' })
    expect(d('deny', 'sonnet', 'Edit', ['/repo/x/src/a.ts'])).toMatchObject({ action: 'allow' })
    expect(d('deny', 'haiku', 'Write', ['/repo/x/src/a.ts'])).toMatchObject({ action: 'allow' })
  })
  test('a source edit by a fable or opus brain: warn lets it run, deny stops it', () => {
    for (const family of ['fable', 'opus']) {
      expect(d('warn', family, 'Edit', ['/repo/x/src/a.ts'])).toEqual({ action: 'warn', edit: true, path: 'src/a.ts' })
      expect(d('deny', family, 'Edit', ['/repo/x/src/a.ts'])).toEqual({ action: 'deny', edit: true, path: 'src/a.ts' })
    }
    for (const tool of ['Write', 'MultiEdit', 'NotebookEdit']) expect(d('deny', 'fable', tool, ['/repo/x/src/a.ts']).action).toBe('deny')
  })
  test('the allowlist: the card folder, .delegation/, the repo file, CHANGELOG.md and any docs/ folder', () => {
    for (const p of ['/repo/x/docs/cards/GH-1.md', '/repo/x/.delegation/briefs/GH-1.brief.md', '/repo/x/.chassis-delegation.json', '/repo/x/CHANGELOG.md', '/repo/x/docs/guide.md', '/repo/x/pkg/docs/a.md'])
      expect(d('deny', 'fable', 'Write', [p])).toEqual({ action: 'allow', edit: true })
    expect(d('deny', 'fable', 'Write', ['/repo/x/docs-not/a.md']).action).toBe('deny')
    expect(d('deny', 'fable', 'Write', ['/repo/x/README.md']).action).toBe('deny')
  })
  test('a path outside the root is no source edit', () => {
    expect(d('deny', 'fable', 'Edit', ['/home/u/.claude/memory/a.md'])).toEqual({ action: 'allow', edit: false })
  })
  test('the card folder follows cardDir', () => {
    expect(delegateDecision({ mode: 'deny', brainFamily: 'fable', tool: 'Write', paths: ['/repo/x/agents/tasks/T-1.md'], root: '/repo/x', cardDir: 'agents/tasks' }).action).toBe('allow')
    expect(delegateDecision({ mode: 'deny', brainFamily: 'fable', tool: 'Write', paths: ['/repo/x/agents/tasks/T-1.md'], root: '/repo/x', cardDir: 'docs/cards' }).action).toBe('deny')
  })
  test('other tools are untouched and no edit', () => {
    expect(d('deny', 'fable', 'Read', ['/repo/x/src/a.ts'])).toEqual({ action: 'allow', edit: false })
    expect(d('deny', 'fable', 'Bash', [])).toEqual({ action: 'allow', edit: false })
  })
  test('git commit in a Bash command is a write with no path', () => {
    expect(d('deny', 'fable', 'Bash', [], { commit: true })).toEqual({ action: 'deny', edit: true, path: 'git commit' })
  })
  test('one path off the allowlist is enough; the first such path is named', () => {
    expect(d('warn', 'opus', 'Bash', ['/repo/x/docs/a.md', '/repo/x/src/b.ts'])).toEqual({ action: 'warn', edit: true, path: 'src/b.ts' })
  })
  test('the texts', () => {
    expect(DELEGATE_DENY).toBe('chassis-delegation: delegateOnly is on: the brain does not edit source. Describe the task and call the card tool, or set delegateOnly off.')
    expect(PREMIUM_POSTURE).toHaveLength(2)
    expect(PREMIUM_POSTURE.join(' ')).toBe(
      'You are the brain on a premium model. Build work goes to workers through the card tool; you read the repo to write cards, verify hand-backs, and read diffs. Do not edit source or run the test suite yourself.',
    )
  })
})

describe('GH-113: what in a Bash command writes to a file', () => {
  const w = (c: string) => bashWrites(c, '/repo/x')
  test('redirections, tee, sed -i, cp and mv into the root', () => {
    expect(w('echo hi > src/a.ts')).toEqual({ paths: ['/repo/x/src/a.ts'], commit: false })
    expect(w('echo hi >> /repo/x/src/a.ts')).toEqual({ paths: ['/repo/x/src/a.ts'], commit: false })
    expect(w('cat a | tee src/b.ts')).toEqual({ paths: ['/repo/x/src/b.ts'], commit: false })
    expect(w("sed -i 's/a/b/' src/c.ts")).toEqual({ paths: ['/repo/x/src/c.ts'], commit: false })
    expect(w('sed -i.bak -e s/a/b/ src/c.ts src/d.ts').paths).toEqual(['/repo/x/src/c.ts', '/repo/x/src/d.ts'])
    expect(w('cp /tmp/a src/e.ts').paths).toEqual(['/repo/x/src/e.ts'])
    expect(w('mv /tmp/a /repo/x/src/f.ts').paths).toEqual(['/repo/x/src/f.ts'])
  })
  test('git commit', () => {
    expect(w('git add -A && git commit -m x')).toEqual({ paths: [], commit: true })
  })
  test('reads, /dev/null, fd redirects and heredoc bodies are no write', () => {
    for (const c of ['cat src/a.ts', 'grep -n x src/a.ts | head', 'ls > /dev/null', 'make 2>&1', 'echo hi >&2', "cat <<'EOF'\n> not a redirect\nsed -i x y\nEOF", 'sed -n 1,5p src/a.ts', 'git status'])
      expect(w(c)).toEqual({ paths: [], commit: false })
  })
})

describe('GH-113: the delegateOnly key', () => {
  test('off | warn | deny; off by default; a bad value is named and ignored; settings win over the repo file', () => {
    expect(mergeConfig({}, {}).delegateOnly).toBe('off')
    const repo = parseRepoConfig('{"delegateOnly":"warn"}')
    expect(repo.errors).toEqual([])
    expect(mergeConfig(repo.config, {}).delegateOnly).toBe('warn')
    expect(mergeConfig(repo.config, settingsLayer({ delegateOnly: 'deny' }).config).delegateOnly).toBe('deny')
    expect(mergeConfig(repo.config, settingsLayer({ delegateOnly: 'off' }).config).delegateOnly).toBe('warn') // the manifest default is unset
    const bad = parseRepoConfig('{"delegateOnly":"strict"}')
    expect(bad.errors.join()).toContain('delegateOnly')
    expect(mergeConfig(bad.config, {}).delegateOnly).toBe('off')
  })
})
