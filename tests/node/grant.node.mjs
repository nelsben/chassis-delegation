// MOD-293 (#389, #393): a scope the brain grants is written into the brief, where the verifier reads it. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/brief.ts')
const brief = (scope, forbid) => `[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=sonnet scope=${scope} forbid=${forbid} gate=validate spend=5 budget=2-attempts]]\n\n# T-1\n`

describe('MOD-293: a brain grant', () => {
  test('rewrites the header scope and appends one amend line with reason=brain grant', async () => {
    const { applyGrant, parseHeader } = await lib()
    const r = applyGrant(brief('a/x.ts', 'z/**'), 'scope+=hooks/lib/x.ts')
    expect(r.ok).toBe(true)
    expect(parseHeader(r.text).fields.scope).toBe('a/x.ts,hooks/lib/x.ts')
    expect(r.lines).toEqual(['[[amend v=1 scope+=hooks/lib/x.ts reason=brain grant]]'])
    expect(r.text).toContain('[[amend v=1 scope+=hooks/lib/x.ts reason=brain grant]]\n')
    expect(parseHeader(r.text).fields.forbid).toBe('z/**')
  })
  test('a later hand-back amend for the granted path is already in scope', async () => {
    const { applyGrant, parseHeader, parseAmends, grantedPaths } = await lib()
    const r = applyGrant(brief('a/x.ts', 'z/**'), 'scope+=hooks/lib/x.ts')
    const scope = parseHeader(r.text).fields.scope.split(',')
    const a = parseAmends('[[amend v=1 scope+=hooks/lib/x.ts reason=needed]]').amends[0]
    expect(grantedPaths(a, scope)).toEqual(['hooks/lib/x.ts'])
    const b = parseAmends('[[amend v=1 scope+=other.ts reason=needed]]').amends[0]
    expect(grantedPaths(b, scope)).toBeUndefined()
  })
  test('a path under a forbid is refused naming the entry, and nothing is appended', async () => {
    const { applyGrant } = await lib()
    const r = applyGrant(brief('a/x.ts', 'hooks/lib/**'), 'scope+=hooks/lib/x.ts')
    expect(r).toEqual({ ok: false, error: 'scope+=hooks/lib/x.ts is under forbid hooks/lib/**; add forbid-=hooks/lib/** to lift it' })
  })
  test('with forbid-= in the same line it is accepted and the header loses the entry', async () => {
    const { applyGrant, parseHeader } = await lib()
    const r = applyGrant(brief('a/x.ts', 'hooks/lib/**,z/**'), 'scope+=hooks/lib/x.ts forbid-=hooks/lib/**')
    expect(r.ok).toBe(true)
    const h = parseHeader(r.text)
    expect(h.fields.scope).toBe('a/x.ts,hooks/lib/x.ts')
    expect(h.fields.forbid).toBe('z/**')
    expect(r.lines).toEqual(['[[amend v=1 scope+=hooks/lib/x.ts forbid-=hooks/lib/** reason=brain grant]]'])
  })
  test('a malformed amend, or a brief with no header, is refused', async () => {
    const { applyGrant } = await lib()
    expect(applyGrant(brief('a', 'b'), 'nonsense').ok).toBe(false)
    expect(applyGrant('no header', 'scope+=a').ok).toBe(false)
  })
  test('a path already in scope appends the line and leaves scope as it was', async () => {
    const { applyGrant, parseHeader } = await lib()
    const r = applyGrant(brief('hooks/lib/**', 'z/**'), 'scope+=hooks/lib/x.ts')
    expect(r.ok).toBe(true)
    expect(parseHeader(r.text).fields.scope).toBe('hooks/lib/**,hooks/lib/x.ts')
  })
})
