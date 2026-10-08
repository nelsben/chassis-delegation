// The version is named in four places; they agree. Node only: it reads files.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const read = rel => readFileSync(fileURLToPath(new URL(`../../${rel}`, import.meta.url)), 'utf8')

describe('the version', () => {
  test('MOD_VERSION, the manifest, the README and the changelog name the same version', async () => {
    const { MOD_VERSION } = await import('../../hooks/lib/version.ts')
    expect(JSON.parse(read('.claude-plugin/plugin.json')).version).toBe(MOD_VERSION)
    expect(read('README.md').includes(`Version ${MOD_VERSION}, MIT.`)).toBe(true)
    expect(read('CHANGELOG.md').includes(`\n## ${MOD_VERSION} — `)).toBe(true)
  })
})
