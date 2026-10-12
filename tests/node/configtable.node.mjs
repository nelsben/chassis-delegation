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
