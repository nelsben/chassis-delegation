// MOD-321: the live permission mode and the host refusal text of a failure event. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/identity.ts')
const HOST = "The server-side auto mode classifier gave no verdict for Bash: a hook changed this call's input after auto mode reviewed it, so the review does not cover what would run."

describe('MOD-321: effectiveMode', () => {
  test('the live mode wins', async () => {
    const { effectiveMode } = await lib()
    expect(effectiveMode('auto', 'default')).toBe('auto')
  })
  test('the spawn row when the live mode is undefined or empty', async () => {
    const { effectiveMode } = await lib()
    expect(effectiveMode(undefined, 'acceptEdits')).toBe('acceptEdits')
    expect(effectiveMode('', 'default')).toBe('default')
  })
  test('undefined when both are', async () => {
    const { effectiveMode } = await lib()
    expect(effectiveMode(undefined, undefined)).toBe(undefined)
    expect(effectiveMode('', undefined)).toBe(undefined)
  })
})

describe('MOD-321: isHostRefusalError', () => {
  test('the verbatim host text is true', async () => {
    const { isHostRefusalError } = await lib()
    expect(isHostRefusalError(HOST)).toBe(true)
  })
  test('an ordinary failed command and a non-string are false', async () => {
    const { isHostRefusalError } = await lib()
    expect(isHostRefusalError('Permission denied (publickey)')).toBe(false)
    expect(isHostRefusalError(undefined)).toBe(false)
    expect(isHostRefusalError({ message: HOST })).toBe(false)
  })
})
