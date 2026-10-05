// The engine-free test runner: `node --import ./tests/node/register.mjs tests/node/run.mjs [files...]`.
// It runs every PURE test of the given `*.test.ts` files (a test whose body takes
// no `($, on)`) through the small kit in kit.mjs, and every `*.node.mjs` suite
// (tests that need Node itself, e.g. a real git repository in a temp folder).
// Engine tests (`($, on) => …`) are counted as skipped: `claude plugin test` runs them.
// With no file arguments it runs tests/*.test.ts and tests/node/*.node.mjs.
import { tests } from './kit.mjs'
import { readdirSync } from 'node:fs'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { join, resolve } from 'node:path'

const here = fileURLToPath(new URL('./', import.meta.url))
const testsDir = resolve(here, '..')
let files = process.argv.slice(2)
if (files.length === 0) {
  files = [
    ...readdirSync(testsDir).filter(f => f.endsWith('.test.ts')).sort().map(f => join(testsDir, f)),
    ...readdirSync(here).filter(f => f.endsWith('.node.mjs')).sort().map(f => join(here, f)),
  ]
}
for (const f of files) await import(pathToFileURL(resolve(f)).href)
let pass = 0
let fail = 0
let skipped = 0
for (const t of tests) {
  if (t.usesEngine) {
    skipped++
    continue
  }
  try {
    await t.fn()
    pass++
    console.log(`(pass) ${t.name}`)
  } catch (err) {
    fail++
    console.log(`(fail) ${t.name}\n    ${String(err && err.message).split('\n').join('\n    ')}`)
  }
}
console.log(`\n ${pass} pass\n ${fail} fail\n ${skipped} skipped (engine tests: claude plugin test runs them)`)
process.exit(fail ? 1 : 0)
