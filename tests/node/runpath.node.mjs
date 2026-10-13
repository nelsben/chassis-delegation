// MOD-72: `run()` is the only path to `$.process.run`, so every argv passes checkArgv. Node only: it reads a file.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

describe('MOD-72: the one path to the host', () => {
  test('hooks/register.ts calls $.process.run( exactly once, inside run()', () => {
    const text = readFileSync(fileURLToPath(new URL('../../hooks/register.ts', import.meta.url)), 'utf8')
    expect(text.split('$.process.run(').length - 1).toBe(1)
  })
})
