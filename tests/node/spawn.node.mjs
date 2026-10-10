// MOD-12 (#22): the brain spawns every worker; the mod spawns only its own
// runners. MOD-15: and, for a ready worktree row the brain left unclaimed past
// readyFallbackMinutes, the fallback (selfSpawnReady): the third named caller.
// Node only: it reads hooks/register.ts.
import { test, expect, describe } from './kit.mjs'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

const source = readFileSync(fileURLToPath(new URL('../../hooks/register.ts', import.meta.url)), 'utf8')

/** The name of the function a source offset sits in: the last `function <name>(` above it. */
const enclosing = (src, at) => {
  const names = [...src.slice(0, at).matchAll(/\n(?:async )?function (\w+)\(/g)]
  return names.at(-1)?.[1]
}
const callersIn = (src, pattern) => [...src.matchAll(pattern)].map(m => enclosing(src, m.index))
const callers = pattern => callersIn(source, pattern)
const SPAWN_SELF = /(?<!function )\bspawnSelf\(\$/g
const NAMED = ['selfSpawnReady', 'startDebrief', 'startEvalRunner']

describe('MOD-12 + MOD-15: the mod spawns no worker but the fallback', () => {
  test('spawnSelf is called only by the debrief and eval runners and the ready-row fallback', () => {
    expect([...new Set(callers(SPAWN_SELF))].sort()).toEqual(NAMED)
  })

  test('the check fails on any other caller: a fourth function calling spawnSelf is not the named three', () => {
    const planted = `${source}\nasync function drainQueue($) {\n  return spawnSelf($, {})\n}\n`
    expect([...new Set(callersIn(planted, SPAWN_SELF))].sort()).not.toEqual(NAMED)
    expect([...new Set(callersIn(planted, SPAWN_SELF))].sort()).toEqual(['drainQueue', ...NAMED])
  })

  test('$.agent.spawn is called only inside spawnSelf', () => {
    expect([...new Set(callers(/\$\.agent\.spawn\(/g))]).toEqual(['spawnSelf'])
  })
})
