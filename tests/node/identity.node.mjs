// MOD-16: the prefix is run by a real shell. Node only: it spawns `sh`.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'

const sh = command => {
  const r = spawnSync('sh', ['-c', command], { encoding: 'utf8' })
  return { stdout: r.stdout, status: r.status }
}
const SHOW = 'printf "%s|%s|%s" "$CHASSIS_SESSION_ID" "$CHASSIS_TASK" "$CHASSIS_ATTEMPT"'

describe('MOD-16: a real shell reads the prefix', () => {
  test('the three variables are exported to the command, and to a child process of it', async () => {
    const { withIdentity } = await import('../../hooks/lib/identity.ts')
    const id = { task: 'BE-101', subtask: 'ui', attempt: 3 }
    expect(sh(withIdentity(SHOW, id))).toEqual({ stdout: 'BE-101.ui-a3|BE-101|3', status: 0 })
    expect(sh(withIdentity(`sh -c '${SHOW}'`, id))).toEqual({ stdout: 'BE-101.ui-a3|BE-101|3', status: 0 })
  })

  test('every command of a compound line sees them, not just the first', async () => {
    const { withIdentity } = await import('../../hooks/lib/identity.ts')
    const run = sh(withIdentity(`true && ${SHOW}`, { task: 'BE-101', subtask: 'main', attempt: 2 }))
    expect(run).toEqual({ stdout: 'BE-101-a2|BE-101|2', status: 0 })
  })

  test('a hostile task id is data, never code: quotes, spaces, $(), backticks and ; survive whole', async () => {
    const { workerIdentity } = await import('../../hooks/lib/identity.ts')
    for (const task of ["it's", 'a b', '$(echo pwned)', '`echo pwned`', 'x; echo pwned', 'a"b', 'a\\b', '*']) {
      const id = workerIdentity({ task, subtask: 'main', attempt: 1 })
      const run = sh(id.prefix + SHOW)
      expect(run).toEqual({ stdout: `${task}-a1|${task}|1`, status: 0 })
    }
  })

  test('a heredoc after the prefix still works, and the exit status is the command’s own', async () => {
    const { withIdentity } = await import('../../hooks/lib/identity.ts')
    const id = { task: 'T-1', subtask: 'main', attempt: 1 }
    expect(sh(withIdentity('cat <<EOF\n$CHASSIS_TASK\nEOF', id))).toEqual({ stdout: 'T-1\n', status: 0 })
    expect(sh(withIdentity('exit 7', id)).status).toBe(7)
  })
})
