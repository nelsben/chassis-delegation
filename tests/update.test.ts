import { test, expect, describe } from 'claude-code/testing'
import { classifyRoot, changelogSlice, migrateConfig, updateLine, upToDateLine, behindLine, CLONE_URL } from '../hooks/lib/update'

const HOME = '/Users/b'
const DEV = `${HOME}/.claude/dev-mods/abc-123/chassis-delegation`

describe('MOD-3: classifying the loaded folder', () => {
  test('a clone under ~/.claude/dev-mods reloads when the turn ends', () => {
    const c = classifyRoot(DEV, HOME, true)
    expect(c.kind).toBe('clone')
    expect(c.reload).toBe('turn-end')
    expect(c.reloadStory).toContain('reloads when the turn ends')
  })
  test('a clone elsewhere says restart, names the window command, the transcript and the env var or flag', () => {
    const c = classifyRoot('/Users/b/Documents/chassis-delegation', HOME, true)
    expect(c.kind).toBe('clone')
    expect(c.reload).toBe('restart')
    for (const s of ['Developer: Reload Window', 'restart claude', 'transcript', 'CLAUDE_CODE_PLUGIN_DIRS', '--plugin-dir']) expect(c.reloadStory).toContain(s)
  })
  test('a non-clone, under dev-mods or not, changes nothing and prints the clone command with its own path', () => {
    for (const root of [DEV, '/opt/mods/chassis-delegation']) {
      const c = classifyRoot(root, HOME, false)
      expect(c.kind).toBe('folder')
      expect(c.reload).toBe('none')
      expect(c.reloadStory).toContain(`git clone ${CLONE_URL} ${root}`)
    }
  })
  test('a folder that only looks like dev-mods is not one', () => {
    expect(classifyRoot('/Users/b/.claude/dev-mods-old/x/chassis-delegation', HOME, true).reload).toBe('restart')
    expect(classifyRoot('/Users/other/.claude/dev-mods/x/chassis-delegation', HOME, true).reload).toBe('restart')
  })
})

const LOG = (extra = '') => `# Changelog

${extra}## 0.5.0 — 2026-10-08

- five a
- five b

## 0.4.0 — 2026-10-05

- four a

## 0.3.0 — 2026-10-04

- three a
`

describe('MOD-3: the changelog slice', () => {
  test('between 0.4.0 and 0.5.0 it is exactly the 0.5.0 section', () => {
    expect(changelogSlice(LOG(), '0.4.0').text).toBe('## 0.5.0 — 2026-10-08\n\n- five a\n- five b')
  })
  test('from 0.3.0 it holds the 0.5.0 and 0.4.0 sections, newest first', () => {
    const t = changelogSlice(LOG(), '0.3.0').text
    expect(t.startsWith('## 0.5.0')).toBe(true)
    expect(t).toContain('## 0.4.0')
    expect(t).not.toContain('three a')
  })
  test('nothing newer is an empty slice', () => {
    expect(changelogSlice(LOG(), '0.5.0').text).toBe('')
  })
  test('an Unreleased section is newer than any version', () => {
    expect(changelogSlice(LOG('## Unreleased\n\n- new\n\n'), '0.5.0').text).toBe('## Unreleased\n\n- new')
  })
  test('capped at 40 lines with a pointer to the changelog, and to the README section when it exists', () => {
    const big = `## 0.5.0 — x\n\n${Array.from({ length: 80 }, (_, i) => `- item ${i}`).join('\n')}\n\n## 0.4.0 — y\n\n- old\n`
    const s = changelogSlice(big, '0.4.0')
    expect(s.text.split('\n').length).toBeLessThanOrEqual(41)
    expect(s.text).toContain('- item 0')
    expect(s.text).not.toContain('- item 79')
    expect(s.truncated).toBe(true)
    const withReadme = changelogSlice(big, '0.4.0', '0.5.0', '### From 0.4.0 to 0.5.0\n\ntext')
    expect(withReadme.text).toContain('README')
    expect(withReadme.text).toContain('From 0.4.0 to 0.5.0')
    expect(changelogSlice(big, '0.4.0', '0.5.0', '### From 0.3.0 or earlier').text).not.toContain('From 0.4.0 to 0.5.0')
  })
})

describe('MOD-3: the lines', () => {
  test('update, up to date, behind', () => {
    expect(updateLine('0.4.0', 'aaaaaaa', '0.5.0', 'bbbbbbb', 3)).toBe('update: 0.4.0 (aaaaaaa) → 0.5.0 (bbbbbbb), 3 commits')
    expect(updateLine('0.5.0', 'aaaaaaa', '0.5.0', 'bbbbbbb', 1)).toBe('update: 0.5.0 (aaaaaaa) → 0.5.0 (bbbbbbb), 1 commit')
    expect(upToDateLine('0.5.0', 'aaaaaaa')).toBe('up to date at 0.5.0 (aaaaaaa)')
    expect(behindLine(2)).toBe('update: 2 commits behind origin/main · run /delegation update')
    expect(behindLine(0)).toBe('')
  })
})

const CFG = `{
  "_gateMap": "my gates",
  "gateMap": {
    "test": "npm test"
  },
  "maxWorkers": 3
}
`

const FULL = `{
  "gateMap": { "test": "npm test" },
  "tierMap": { "economy": "haiku" },
  "maxWorkers": 3,
  "domains": ["a"],
  "cardDir": "c",
  "autoEval": false,
  "ignore": [],
  "spendByTier": { "economy": 1 }
}
`

describe('MOD-3: migrating the repo config', () => {
  test('a config that lacks delegateOnly gains _delegateOnly and delegateOnly: "off", every other byte unchanged', () => {
    const m = migrateConfig(FULL)
    expect(m.error).toBeUndefined()
    expect(m.added).toEqual(['delegateOnly'])
    expect(m.text).toContain('"_delegateOnly": ')
    expect(m.text).toContain('"delegateOnly": "off"')
    expect(JSON.parse(m.text).delegateOnly).toBe('off')
    const open = FULL.lastIndexOf('}')
    const body = FULL.slice(0, open).replace(/\s*$/, '')
    expect(m.text.startsWith(body + ',\n')).toBe(true)
    expect(m.text.endsWith(FULL.slice(body.length))).toBe(true)
  })
  test('a config with every key is unchanged; the same text comes back', () => {
    const first = migrateConfig(CFG)
    expect(first.added.length).toBeGreaterThan(1)
    expect(first.added).toContain('delegateOnly')
    const again = migrateConfig(first.text)
    expect(again.added).toEqual([])
    expect(again.text).toBe(first.text)
  })
  test('the original bytes are a prefix-plus-suffix of the migrated text', () => {
    const m = migrateConfig(CFG)
    const open = CFG.lastIndexOf('}')
    const body = CFG.slice(0, open).replace(/\s*$/, '')
    expect(m.text.startsWith(body)).toBe(true)
    expect(m.text.endsWith(CFG.slice(body.length))).toBe(true)
  })
  test('compact one-line and empty objects, tab indentation', () => {
    expect(JSON.parse(migrateConfig('{}').text).maxWorkers).toBe(2)
    expect(JSON.parse(migrateConfig('{"maxWorkers":3}').text).maxWorkers).toBe(3)
    expect(migrateConfig('{\n\t"maxWorkers": 3\n}').text).toContain('\n\t"_cardDir"')
  })
  test('invalid JSON is an error and no text', () => {
    expect(migrateConfig('{ nope').error).toBeDefined()
    expect(migrateConfig('[]').error).toBeDefined()
  })
})
