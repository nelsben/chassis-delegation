// MOD-12 (#22): the brain spawns every worker; the mod spawns only its own
// runners. Node only: it reads hooks/register.ts.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../../hooks/register.ts', import.meta.url)), 'utf8')

/** The name of the function a source offset sits in: the last `function <name>(` above it. */
const enclosing = at => {
  const names = [...source.slice(0, at).matchAll(/\n(?:async )?function (\w+)\(/g)]
  return names.at(-1)?.[1]
}
const callers = pattern => [...source.matchAll(pattern)].map(m => enclosing(m.index))

describe('MOD-12: nothing in the mod spawns a worker', () => {
  test('spawnSelf is called only by the debrief and eval runners', () => {
    expect([...new Set(callers(/(?<!function )\bspawnSelf\(\$/g))].sort()).toEqual(['startDebrief', 'startEvalRunner'])
  })

  test('$.agent.spawn is called only inside spawnSelf', () => {
    expect([...new Set(callers(/\$\.agent\.spawn\(/g))]).toEqual(['spawnSelf'])
  })
})
