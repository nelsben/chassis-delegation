// MOD-19: the verdict word. `verified` became `consistent` everywhere the mod
// writes it (public issue #1). MOD-49: the reader of the old word is gone too.
// The one read-only normaliser in hooks/lib/attempts.ts may spell it, on a line
// ending `// legacy word: read-only normaliser`; that exact line alone is skipped. This greps hooks/
// and bin/ for any `verified` (the identifier, the string, the prose: not `unverified`).
// Node only: it reads files. Run by tests/node/run.mjs.
import { test, expect, describe } from './kit.mjs'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, relative } from 'node:path'

const ROOT = fileURLToPath(new URL('../../', import.meta.url))
const TEXT = /\.(ts|tsx|mjs|js|json|md)$/
// `verified`, `Verified`, `verifiedBy`: not `unverified` (a letter before it)
const OLD_WORD = /(?<![A-Za-z])verified/i
/** The one allowed spelling: a line ending with this comment (and nothing else is skipped). */
const SKIP_MARK = '// legacy word: read-only normaliser'

function walk(dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) out.push(...walk(full))
    else if (TEXT.test(name)) out.push(full)
  }
  return out
}

describe('MOD-19, MOD-49: no verdict the mod writes or reads says verified', () => {
  test('hooks/ and bin/ never name the old word', () => {
    const found = []
    for (const dir of ['hooks', 'bin']) {
      for (const file of walk(join(ROOT, dir))) {
        const rel = relative(ROOT, file)
        readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
          if (line.trimEnd().endsWith(SKIP_MARK)) return
          if (OLD_WORD.test(line)) found.push(`${rel}:${i + 1}: ${line.trim().slice(0, 120)}`)
        })
      }
    }
    expect(found).toEqual([])
  })

  test('the test is not blind: it sees a stray verified and ignores unverified', () => {
    expect(OLD_WORD.test("verdict: 'verified'")).toBe(true)
    expect(OLD_WORD.test('type Verified = {}')).toBe(true)
    expect(OLD_WORD.test('verifiedBy: {}')).toBe(true)
    expect(OLD_WORD.test("verdict: 'unverified'")).toBe(false)
    expect(OLD_WORD.test('an unverified verdict')).toBe(false)
  })
})
