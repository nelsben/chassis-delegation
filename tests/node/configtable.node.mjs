// MOD-70: every manifest userConfig field has a group and a short plain-English summary in configcmd.ts.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const manifest = () => JSON.parse(readFileSync(fileURLToPath(new URL('../../.claude-plugin/plugin.json', import.meta.url)), 'utf8')).userConfig
const BANNED = ['brief', 'amend', 'T1', 'T2', 'delta', 'owed', 'breadcrumb', 'lane']

describe('MOD-70: the /delegation config table', () => {
  test('every manifest userConfig field has a group and a summary of at most 90 characters', async () => {
    const { CONFIG_TABLE, CONFIG_GROUPS } = await import('../../hooks/lib/configcmd.ts')
    const missing = Object.keys(manifest()).filter(f => !CONFIG_TABLE?.[f])
    expect(missing).toEqual([])
    for (const [f, e] of Object.entries(CONFIG_TABLE)) {
      expect(CONFIG_GROUPS.includes(e.group)).toBe(true)
      expect(e.summary.length > 0 && e.summary.length <= 90).toBe(true)
    }
  })
  test('the table names no field the manifest lacks', async () => {
    const { CONFIG_TABLE } = await import('../../hooks/lib/configcmd.ts')
    const m = manifest()
    expect(Object.keys(CONFIG_TABLE ?? {}).filter(f => !(f in m))).toEqual([])
  })
  test('no summary uses the mod\'s own terms or repeats its field name', async () => {
    const { CONFIG_TABLE } = await import('../../hooks/lib/configcmd.ts')
    for (const [f, e] of Object.entries(CONFIG_TABLE ?? {})) {
      for (const w of BANNED) expect(new RegExp(`\\b${w}`, w.length <= 2 ? '' : 'i').test(e.summary) ? `${f}: ${w}` : '').toBe('')
      expect(e.summary.toLowerCase().includes(f.toLowerCase()) ? f : '').toBe('')
    }
  })
})

describe('MOD-73: the table holds the manifest both ways, and every option is measured', () => {
  test('one row per manifest field and no other; its built-in default and its choices are the manifest\'s', async () => {
    const { CONFIG_TABLE, TABLE_FIELDS } = await import('../../hooks/lib/configtable.ts')
    const m = manifest()
    expect([...TABLE_FIELDS].sort()).toEqual(Object.keys(m).sort())
    for (const [f, e] of Object.entries(CONFIG_TABLE)) {
      expect([f, e.def]).toEqual([f, m[f].default])
      // the manifest's options, when it lists them; a repo field may name the words its repo-file parser takes
      if (m[f].options) expect([f, e.choices]).toEqual([f, m[f].options])
      else if (e.choices) expect([f, e.scope]).toEqual([f, 'repo'])
    }
  })
  test('scope repo is exactly the repo keys the manifest declares; the rest are user', async () => {
    const { CONFIG_TABLE } = await import('../../hooks/lib/configtable.ts')
    const { REPO_KEYS } = await import('../../hooks/lib/repoconfig.ts')
    const m = manifest()
    const repo = Object.entries(CONFIG_TABLE).filter(([, e]) => e.scope === 'repo').map(([f]) => f).sort()
    expect(repo).toEqual(REPO_KEYS.filter(k => k in m).sort())
    expect(Object.values(CONFIG_TABLE).every(e => e.scope === 'repo' || e.scope === 'user')).toBe(true)
  })
  test('the reserved words of /delegation config are never field names', async () => {
    const { RESERVED, TABLE_FIELDS } = await import('../../hooks/lib/configtable.ts')
    const lower = TABLE_FIELDS.map(f => f.toLowerCase())
    expect(RESERVED.filter(r => lower.includes(r))).toEqual([])
  })
  test('tests/options.test.ts has one case per manifest field, named by the field, and no case for a field the manifest lacks', () => {
    const text = readFileSync(fileURLToPath(new URL('../options.test.ts', import.meta.url)), 'utf8')
    const named = [...text.matchAll(/^\s*test\('([A-Za-z]+): /gm)].map(x => x[1])
    const m = Object.keys(manifest())
    expect(m.filter(f => !named.includes(f))).toEqual([])
    expect(named.filter(f => !m.includes(f))).toEqual([])
    expect(named.length).toBe(new Set(named).size)
  })
})
