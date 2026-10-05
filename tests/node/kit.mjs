// A minimal stand-in for claude-code/testing: describe/test/expect for pure tests.
import { isDeepStrictEqual, inspect } from 'node:util'
export const tests = []
let prefix = []
export function describe(name, fn) { prefix.push(name); try { fn() } finally { prefix.pop() } }
export function test(name, a, b) {
  const fn = typeof a === 'function' ? a : b
  tests.push({ name: [...prefix, name].join(' > '), fn, usesEngine: fn.length > 0 })
}
export const mock = { clock: () => ({}), env: () => {} }
const show = v => inspect(v, { depth: 6, breakLength: 160 })
function matchObject(actual, expected) {
  if (expected === null || typeof expected !== 'object') return isDeepStrictEqual(actual, expected)
  if (actual === null || typeof actual !== 'object') return false
  if (Array.isArray(expected)) return Array.isArray(actual) && actual.length === expected.length && expected.every((e, i) => matchObject(actual[i], e))
  return Object.keys(expected).every(k => matchObject(actual[k], expected[k]))
}
function eq(a, b) { return isDeepStrictEqual(JSON.parse(JSON.stringify(a ?? null)), JSON.parse(JSON.stringify(b ?? null))) && (a === undefined) === (b === undefined) }
function make(actual, negate) {
  const check = (ok, msg) => { if (negate ? ok : !ok) throw new Error((negate ? 'NOT ' : '') + msg) }
  const m = {
    toBe: e => check(Object.is(actual, e), `expected ${show(actual)} toBe ${show(e)}`),
    toEqual: e => check(eq(actual, e), `expected ${show(actual)} toEqual ${show(e)}`),
    toContain: e => check(typeof actual === 'string' ? actual.includes(e) : Array.isArray(actual) && actual.includes(e), `expected ${show(actual)} toContain ${show(e)}`),
    toContainEqual: e => check(Array.isArray(actual) && actual.some(x => eq(x, e)), `expected ${show(actual)} toContainEqual ${show(e)}`),
    toMatchObject: e => check(matchObject(actual, e), `expected ${show(actual)} toMatchObject ${show(e)}`),
    toHaveLength: n => check(actual != null && actual.length === n, `expected length ${actual?.length} toBe ${n}: ${show(actual)}`),
    toBeUndefined: () => check(actual === undefined, `expected ${show(actual)} toBeUndefined`),
    toBeDefined: () => check(actual !== undefined, `expected defined`),
    toBeNull: () => check(actual === null, `expected ${show(actual)} toBeNull`),
    toBeTruthy: () => check(Boolean(actual), `expected ${show(actual)} truthy`),
    toBeLessThan: n => check(actual < n, `expected ${actual} < ${n}`),
    toBeLessThanOrEqual: n => check(actual <= n, `expected ${actual} <= ${n}`),
    toBeGreaterThan: n => check(actual > n, `expected ${actual} > ${n}`),
    toBeGreaterThanOrEqual: n => check(actual >= n, `expected ${actual} >= ${n}`),
    toBeCloseTo: (n, d = 2) => check(Math.abs(actual - n) < Math.pow(10, -d) / 2, `expected ${actual} toBeCloseTo ${n}`),
    toMatch: r => check(typeof actual === 'string' && (r instanceof RegExp ? r.test(actual) : actual.includes(r)), `expected ${show(actual)} toMatch ${r}`),
  }
  return m
}
export function expect(actual) { const m = make(actual, false); m.not = make(actual, true); return m }
