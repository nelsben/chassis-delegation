// MOD-248: bounded maps (wiring read from register.ts), and cutToBytes' fast path.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../../hooks/register.ts', import.meta.url)), 'utf8')

describe('MOD-248: register.ts writes the six maps through the bound', () => {
  for (const name of ['handedBackPosted', 'offered', 'glyphLogged']) {
    test(`${name} is filled by addBounded`, () => {
      expect(source).toContain(`addBounded(${name}, `)
      expect(source).not.toMatch(new RegExp(`\\b${name}\\.add\\(`))
    })
  }
  for (const name of ['taskRepos', 'handbacks', 'gateTails']) {
    test(`${name} is filled by setBounded`, () => {
      expect(source).toContain(`setBounded(${name}, `)
      expect(source).not.toMatch(new RegExp(`\\b${name}\\.set\\(`))
    })
  }
})

describe('MOD-248: cutToBytes', () => {
  test('text under the limit comes back as the same string with its byte count', async () => {
    const { cutToBytes } = await import('../../hooks/lib/gaterun.ts')
    const t = 'aé€😀'
    expect(cutToBytes(t, 100)).toEqual({ text: t, bytes: 10 })
    expect(cutToBytes(t, 10)).toEqual({ text: t, bytes: 10 })
  })
  test('over the limit still cuts at a character edge', async () => {
    const { cutToBytes } = await import('../../hooks/lib/gaterun.ts')
    expect(cutToBytes('aé€😀', 5)).toEqual({ text: 'aé', bytes: 3 })
    expect(cutToBytes('abc', 0)).toEqual({ text: '', bytes: 0 })
  })
})
