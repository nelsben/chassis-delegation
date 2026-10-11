import { test, expect, describe } from 'claude-code/testing'
import { tokenize } from '../hooks/lib/gitguard'
import { setsSessionId, withIdentity, workerIdentity } from '../hooks/lib/identity'

const rec = (task: string, subtask: string, attempt: number) => ({ task, subtask, attempt })

/** What a shell makes of a prefix: the NAME=value words after `export`, up to the `;` (the repo's own tokenizer reads the quotes). */
const exported = (prefix: string): Record<string, string> => {
  const tokens = tokenize(prefix)
  expect(tokens[0]).toBe('export')
  expect(tokens[tokens.length - 1]).toBe(';')
  return Object.fromEntries(tokens.slice(1, -1).map(t => [t.slice(0, t.indexOf('=')), t.slice(t.indexOf('=') + 1)]))
}

describe('MOD-16: what a worker is called in its Bash environment', () => {
  test('attempt 2 of BE-101 main: CHASSIS_SESSION_ID=BE-101-a2, and the prefix a shell reads back as the three variables', () => {
    const id = workerIdentity(rec('BE-101', 'main', 2))
    expect(id.env).toEqual({ CHASSIS_SESSION_ID: 'BE-101-a2', CHASSIS_TASK: 'BE-101', CHASSIS_ATTEMPT: '2' })
    expect(id.prefix).toBe('export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; ')
    expect(exported(id.prefix)).toEqual(id.env)
  })

  test('a subtask other than main goes into the session id, not into CHASSIS_TASK: BE-101.ui-a1', () => {
    const id = workerIdentity(rec('BE-101', 'ui', 1))
    expect(id.env).toEqual({ CHASSIS_SESSION_ID: 'BE-101.ui-a1', CHASSIS_TASK: 'BE-101', CHASSIS_ATTEMPT: '1' })
    expect(exported(id.prefix)).toEqual(id.env)
  })

  test('two siblings of one task, and two attempts of one worker, never share a session id', () => {
    const ids = [rec('BE-101', 'main', 1), rec('BE-101', 'main', 2), rec('BE-101', 'ui', 1), rec('BE-102', 'main', 1)].map(r => workerIdentity(r).env.CHASSIS_SESSION_ID)
    expect(new Set(ids).size).toBe(ids.length)
  })

  test('a value the shell would split or expand is single-quoted, and reads back whole', () => {
    const id = workerIdentity(rec('A B', 'main', 1))
    expect(id.prefix).toContain("CHASSIS_TASK='A B'")
    expect(id.prefix).toContain("CHASSIS_SESSION_ID='A B-a1'")
    expect(exported(id.prefix)).toEqual(id.env)
    expect(workerIdentity(rec('$(x)', 'main', 1)).prefix).toContain("CHASSIS_TASK='$(x)'")
  })
})

describe('MOD-16: which commands get the prefix', () => {
  const R = rec('BE-101', 'main', 2)
  const PREFIX = 'export CHASSIS_SESSION_ID=BE-101-a2 CHASSIS_TASK=BE-101 CHASSIS_ATTEMPT=2; '

  test('a command is returned behind the prefix, and the typed text stays whole behind it', () => {
    expect(withIdentity('lock acquire', R)).toBe(PREFIX + 'lock acquire')
    const multi = 'cd /w && make test\n./run.sh'
    expect(withIdentity(multi, R)).toBe(PREFIX + multi)
    expect(withIdentity('echo $CHASSIS_SESSION_ID', R)).toBe(PREFIX + 'echo $CHASSIS_SESSION_ID')
  })

  test('a command that already sets CHASSIS_SESSION_ID is returned unchanged: assignment, export, env, after a separator', () => {
    for (const typed of [
      'CHASSIS_SESSION_ID=mine lock acquire',
      'export CHASSIS_SESSION_ID=mine; lock acquire',
      'env CHASSIS_SESSION_ID=mine lock acquire',
      'cd /w && CHASSIS_SESSION_ID="mine" lock release',
      'make test;\nCHASSIS_SESSION_ID=mine ./go',
    ]) {
      expect(setsSessionId(typed)).toBe(true)
      expect(withIdentity(typed, R)).toBe(typed)
    }
  })

  test('only a real assignment counts: reading it, or a name that merely ends the same way, does not', () => {
    for (const typed of ['echo "$CHASSIS_SESSION_ID"', 'echo $CHASSIS_SESSION_ID', 'MY_CHASSIS_SESSION_ID=1 run', 'echo CHASSIS_SESSION_IDS=1']) {
      expect(setsSessionId(typed)).toBe(false)
    }
  })

  test('an empty command is left as it is', () => {
    expect(withIdentity('', R)).toBe('')
    expect(withIdentity('  \n', R)).toBe('  \n')
  })
})
