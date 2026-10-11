// MOD-19: the verdict word. `verified` became `consistent` everywhere the mod
// writes it (public issue #1); the old word is read, as consistent, until
// 0.9.0, and only by hooks/lib/legacy.ts. This greps hooks/ and bin/ for any
// other `verified` (the identifier, the string, the prose: not `unverified`).
// Node only: it reads files. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
/** The one file that may name the old word: the legacy reader and its deprecation comment. */
const LEGACY_READER = 'hooks/lib/legacy.ts'
const TEXT = /\.(ts|tsx|mjs|js|json|md)$/
// `verified`, `Verified`, `verifiedBy`: not `unverified` (a letter before it)
const OLD_WORD = /(?<![A-Za-z])verified/i

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (TEXT.test(name)) out.push(full)
  }
  return out
}

describe('MOD-19: no verdict the mod writes says verified', () => {
  test('hooks/ and bin/ name the old word only in the legacy reader', () => {
    const found = []
    for (const dir of ['hooks', 'bin']) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file)
        if (rel === LEGACY_READER) continue
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (OLD_WORD.test(line)) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
        })
      }
    }
    expect(found).toEqual([])
  })

  test('the legacy reader exists, names the word, and says it is read until 0.9.0', () => {
    const text = readFileSync(join(ROOT, LEGACY_READER), 'utf8')
    expect(OLD_WORD.test(text)).toBe(true)
    expect(text.includes('0.9.0')).toBe(true)
    expect(/deprecat/i.test(text)).toBe(true)
  })

  test('the test is not blind: it sees a stray verified and ignores unverified', () => {
    expect(OLD_WORD.test("verdict: 'verified'")).toBe(true)
    expect(OLD_WORD.test('type Verified = {}')).toBe(true)
    expect(OLD_WORD.test('verifiedBy: {}')).toBe(true)
    expect(OLD_WORD.test("verdict: 'unverified'")).toBe(false)
    expect(OLD_WORD.test('an unverified verdict')).toBe(false)
  })
})
