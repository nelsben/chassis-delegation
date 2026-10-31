import { test, expect, describe } from 'claude-code/testing'
import { briefHasEngineGate, engineLanesLine, isLoaded, loadedWords, parseProcLoad, parseSysctlLoad } from '../hooks/lib/load'
import { verifyNative, type ExecOut, type NativeIo, type NativeInput } from '../hooks/lib/verify-native'

describe('MOD-230: reading the load', () => {
  test('macOS sysctl text', () => {
    expect(parseSysctlLoad('{ 100.20 80.10 60.00 }\n10\n')).toEqual({ load: 100.2, cores: 10 })
  })
  test('Linux /proc/loadavg and nproc', () => {
    expect(parseProcLoad('0.52 0.58 0.59 1/467 12345\n', '8\n')).toEqual({ load: 0.52, cores: 8 })
  })
  test('garbage reads as nothing', () => {
    expect(parseSysctlLoad('sysctl: unknown oid')).toBeUndefined()
    expect(parseSysctlLoad('')).toBeUndefined()
    expect(parseProcLoad('garbage', '8')).toBeUndefined()
    expect(parseProcLoad('1.0 1.0 1.0', 'many')).toBeUndefined()
    expect(parseProcLoad('1.0 1.0 1.0', '0')).toBeUndefined()
    expect(isLoaded(undefined)).toBe(false)
  })
  test('loaded at twice the cores or more', () => {
    expect(isLoaded({ load: 20, cores: 10 })).toBe(true)
    expect(isLoaded({ load: 19.9, cores: 10 })).toBe(false)
  })
  test('the words', () => {
    expect(loadedWords({ load: 100.2, cores: 10 }, 'MOD-9')).toBe('machine loaded (load 100.2 on 10 cores): may be load, not the change; re-run with /dispatch MOD-9 --verify <sha> once it drops')
  })
})

describe('MOD-230: lanes sharing the engine gate', () => {
  const map = { validate: 'claude plugin validate {worktree}', test: 'claude plugin test {worktree}', node: 'node --test' }
  test('a brief whose gate map entry runs the engine suite has the engine gate', () => {
    expect(briefHasEngineGate('[[brief v=1 task=A-1 subtask=main purpose=build tier=standard model=sonnet scope=a gate=validate,test]]\n', map)).toBe(true)
    expect(briefHasEngineGate('[[brief v=1 task=A-1 subtask=main purpose=build tier=standard model=sonnet scope=a gate=validate,node]]\n', map)).toBe(false)
  })
  test('the line at 3 lanes, none at 2', () => {
    expect(engineLanesLine(3)).toBe('3 lanes share the engine gate; it runs one at a time: expect verdict waits')
    expect(engineLanesLine(4)).toBe('4 lanes share the engine gate; it runs one at a time: expect verdict waits')
    expect(engineLanesLine(2)).toBeUndefined()
  })
})

describe('MOD-230: a red gate on a loaded machine', () => {
  const brief = '[[brief v=1 task=T-1 subtask=main purpose=build tier=standard model=sonnet scope=a.txt forbid=none gate=test]]\n\n# T-1\n'
  const run = async (exit: number, load: string | undefined) => {
    const calls: string[] = []
    const exec = async (argv: readonly string[]): Promise<ExecOut> => {
      calls.push(argv.join(' '))
      const a = argv.slice(0, 2).join(' ')
      if (argv[0] === 'git' && argv.includes('rev-parse') && argv.includes('HEAD')) return { ok: true, exitCode: 0, stdout: 'a'.repeat(40) + '\n', stderr: '' }
      if (argv[0] === 'git' && argv.includes('status')) return { ok: true, exitCode: 0, stdout: '', stderr: '' }
      if (argv[0] === 'git' && argv.includes('diff')) return { ok: true, exitCode: 0, stdout: 'M\ta.txt\n', stderr: '' }
      if (a === 'npm test') return { ok: true, exitCode: exit, stdout: exit ? 'boom\n' : 'ok\n', stderr: '' }
      return { ok: true, exitCode: 0, stdout: 'a'.repeat(40) + '\n', stderr: '' }
    }
    const io: NativeIo = { exec, write: async () => undefined, ...(load !== undefined ? { load: async () => (load === 'throw' ? Promise.reject(new Error('x')) : load) } : {}) }
    const input = {
      repo: '/w', report: { task: 'T-1', subtask: 'main', branch: 'b', sha: 'a'.repeat(40), gate: exit ? 'fail' : 'pass', files: 'a.txt', pr: 'none', red: 'none' } as never,
      briefText: brief, gateMap: { test: 'npm test' }, allowed: () => true, filesPath: '/f.txt',
    } satisfies NativeInput
    return verifyNative(input, io)
  }
  test('red and loaded: the words are added, the verdict is unchanged', async () => {
    const plain = await run(1, undefined)
    const busy = await run(1, 'machine loaded (load 100 on 10 cores): may be load, not the change; re-run with /dispatch T-1 --verify <sha> once it drops')
    expect(busy.verdict).toBe(plain.verdict)
    expect(busy.lines.join('\n')).toContain('machine loaded (load 100 on 10 cores): may be load, not the change')
    expect(plain.lines.join('\n')).not.toContain('machine loaded')
  })
  test('red and a failing load read: no words', async () => {
    expect((await run(1, 'throw')).lines.join('\n')).not.toContain('machine loaded')
  })
  test('green and loaded: unchanged', async () => {
    const quiet = await run(0, undefined)
    const busy = await run(0, 'machine loaded (load 100 on 10 cores): x')
    expect(busy.lines).toEqual(quiet.lines)
    expect(busy.verdict).toBe(quiet.verdict)
  })
})
