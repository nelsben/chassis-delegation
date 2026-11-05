// MOD-315: setup's gate check holds on the repo's gateMap when the repo has no package.json test script. Pure.
import { test, expect, describe } from './kit.mjs'

const lib = () => import('../../hooks/lib/setup.ts')
const R = '/w/app'
const base = { root: R, home: '/home/u', inRepo: true, toplevel: R, branch: 'main', hasCommit: true, hasOriginMain: true, dirty: false, markers: [], pyTests: false, onPath: ['git', 'node', 'npm', 'gh'], shadows: [], childRepos: [], autoDebrief: false }

describe('MOD-315: the gate check reads the gateMap', () => {
  test('a gateMap with three gates and no package.json holds the gate check with the first gate and +2 more', async () => {
    const m = await lib()
    const lines = m.setupChecks({ ...base, gateMap: { validate: 'claude plugin validate .', node: 'node --test', test: 'claude plugin test .' } })
    const gate = lines.find(l => l.text.startsWith('a gate'))
    expect(gate.ok).toBe(true)
    expect(gate.text).toBe('a gate: validate: claude plugin validate . (+2 more)')
  })
  test('a single gate in the gateMap names it with no more-suffix', async () => {
    const m = await lib()
    const gate = m.setupChecks({ ...base, gateMap: { test: 'make test' } }).find(l => l.text.startsWith('a gate'))
    expect(gate.text).toBe('a gate: test: make test')
  })
  test('neither a gateMap nor a test script still fails with the no-gate text and fix', async () => {
    const m = await lib()
    const gate = m.setupChecks({ ...base, gateMap: {} }).find(l => l.text.startsWith('a gate'))
    expect(gate.ok).toBe(false)
    expect(gate.text).toBe('a gate: no test command found')
    expect(gate.fix).toContain('add a test command that passes on the empty project')
  })
})
