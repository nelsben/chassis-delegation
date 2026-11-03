// MOD-282: every engine test file takes `test` from ./harness (its 20 s default), never from claude-code/testing. Node only: it reads files.
import { test, expect, describe } from './kit.mjs'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join } from 'node:path'

const testsDir = fileURLToPath(new URL('../', import.meta.url))
const files = readdirSync(testsDir).filter(f => f.endsWith('.test.ts')).sort()

// The local names a file's runtime imports bind from one module: `{ test, expect as e }` from 'm' gives test for 'm'.
const boundFrom = (src, mod) => {
  const names = []
  for (const m of src.matchAll(/^import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gm)) {
    if (m[1] || m[3] !== mod) continue
    for (const part of m[2].split(',')) {
      const name = part.trim()
      if (name) names.push(name.split(/\s+as\s+/).pop())
    }
  }
  return names
}

describe('MOD-282: engine tests import test from ./harness', () => {
  test('every tests/*.test.ts imports test from ./harness and not from claude-code/testing', () => {
    const bad = []
    for (const f of files) {
      const src = readFileSync(join(testsDir, f), 'utf8')
      if (boundFrom(src, 'claude-code/testing').includes('test')) bad.push(`${f}: imports test from claude-code/testing`)
      if (!boundFrom(src, './harness').includes('test')) bad.push(`${f}: imports no test from ./harness`)
    }
    expect(files.length).toBeGreaterThan(0)
    if (bad.length > 0) throw new Error(`${bad.length} file(s) off the harness:\n${bad.join('\n')}`)
  })
})
