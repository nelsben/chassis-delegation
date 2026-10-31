// MOD-48: what the brain's driving costs it: the call kinds, the split's lines, and the warn row (pure).
import { test, expect, describe } from 'claude-code/testing'
import { priceFor, usdOf } from '../hooks/lib/cost'
import { callKind, cutText, isPoll, commandKey, driveCall, driveLines, driveOutput, driveStep, driveTurn, emptyDrive, emptyWatch, DRIVE_THRESHOLD_TOKENS, freshSessionRow } from '../hooks/lib/drive'

describe('MOD-48: the kind of a call', () => {
  test('a background Bash call, an until loop and a sleep loop are run-or-poll', () => {
    expect(callKind('Bash', { command: 'make build', run_in_background: true })).toBe('run')
    expect(callKind('Bash', { command: 'until grep -q done /tmp/log; do sleep 5; done' })).toBe('run')
    expect(callKind('Bash', { command: 'sleep 30 && tail /tmp/log' })).toBe('run')
  })
  test('Read, grep/sed/cat/ls are read; Edit, Write, MultiEdit and a Bash write are edit; Agent and SendMessage are spawn', () => {
    expect(callKind('Read', { file_path: '/a' })).toBe('read')
    expect(callKind('Bash', { command: 'grep -n x src/a.ts' })).toBe('read')
    expect(callKind('Bash', { command: 'ls -la' })).toBe('read')
    expect(callKind('Edit', {})).toBe('edit')
    expect(callKind('Write', {})).toBe('edit')
    expect(callKind('MultiEdit', {})).toBe('edit')
    expect(callKind('Bash', { command: 'echo x > a.ts' }, true)).toBe('edit')
    expect(callKind('Agent', {})).toBe('spawn')
    expect(callKind('SendMessage', {})).toBe('spawn')
  })
  test('a build or bench command is run-or-poll; a tool that is none of these has no kind', () => {
    expect(callKind('Bash', { command: './bench.sh --scene 3' })).toBe('run')
    expect(callKind('Bash', { command: 'git status' })).toBeUndefined()
    expect(callKind('TodoWrite', {})).toBeUndefined()
  })
  test('a command already run this turn is run-or-poll, even one that reads', () => {
    expect(callKind('Bash', { command: 'cat /tmp/x.csv' }, false, true)).toBe('run')
  })
})

describe('MOD-48: the record and its lines', () => {
  test('counts by kind and the average context per call', () => {
    let r = emptyDrive()
    for (let i = 0; i < 3; i++) r = driveCall(r, 'run')
    r = driveCall(r, 'read')
    r = driveTurn(r, 300_000, 3)
    expect(r.run).toBe(3)
    const text = driveLines(r).join('\n')
    expect(text).toContain('3 run-or-poll')
    expect(text).toContain('1 read')
    expect(text).toContain('100K')
  })
  test('nothing counted shows no line', () => {
    expect(driveLines(emptyDrive())).toEqual([])
  })
})

describe('MOD-48: the warn row', () => {
  const OPUS = 'claude-opus-5-5'
  const run = (cmd: string, ctx: number, state = emptyWatch()) => driveStep(state, { command: cmd, context: ctx, threshold: DRIVE_THRESHOLD_TOKENS, model: OPUS, enabled: true })
  const CMD = './bench.sh --scene 3 --frames 600 --out /tmp/bench-one-of-many.csv'

  test('commandKey squeezes whitespace and keys on the whole command, not its first 60 characters', () => {
    expect(commandKey('  a   b  ')).toBe('a b')
    const head = 'a'.repeat(80)
    expect(commandKey(`${head} one`)).not.toBe(commandKey(`${head} two`))
    expect(commandKey(`${head} one`)).toBe(commandKey(` ${head}   one `))
  })
  test('MOD-119 (#187): commands sharing a leading NAME=value assignment get different keys', () => {
    const out = `O=/tmp/${'x'.repeat(70)};`
    expect(commandKey(`${out} ./probe-a --flag`)).not.toBe(commandKey(`${out} ./probe-b --flag`))
    expect(commandKey('O=/tmp/x; ./probe-a --flag')).not.toBe(commandKey('O=/tmp/x; ./probe-b --flag'))
    expect(commandKey('O=/tmp/x && A=1 ./probe-a')).not.toBe(commandKey('O=/tmp/x && A=1 ./probe-b'))
  })
  test('MOD-119 (#187): the same command behind different assignments or a cd has the same key', () => {
    expect(commandKey('O=/tmp/x; ./probe-a --flag')).toBe(commandKey('O=/tmp/y; ./probe-a --flag'))
    expect(commandKey('O="/tmp/a b" ./probe-a')).toBe(commandKey('./probe-a'))
    expect(commandKey('cd /somewhere && O=1; ./probe-a')).toBe(commandKey('./probe-a'))
    expect(commandKey('O=/tmp/x')).toBe('O=/tmp/x')
  })
  test('it fires on the third run of the same command at 300K, and names the command, the count, the context and the dollars', () => {
    let s = emptyWatch()
    for (let i = 0; i < 2; i++) {
      const r = run(CMD, 300_000, s)
      expect(r.row).toBeUndefined()
      s = r.state
    }
    const third = run(CMD, 300_000, s)
    expect(third.row).toContain('bench.sh --scene 3')
    expect(third.row).toContain('3 times')
    expect(third.row).toContain('300K')
    const call = usdOf({ in: 0, out: 0, cacheRead: 300_000, cacheWrite: 0 }, priceFor(OPUS)!) // a call at 300K, read from the cache
    expect(third.row).toContain(`$${call.toFixed(2)}`)
    expect(third.row).toContain('standard card')
    expect(third.row).toContain('resources')
  })
  test('MOD-119: three distinct commands sharing a long prefix do not fire', () => {
    let s = emptyWatch()
    for (let i = 0; i < 4; i++) {
      const r = run(`${CMD} ${i}`, 300_000, s)
      expect(r.row).toBeUndefined()
      s = r.state
    }
  })
  test('MOD-119: the same command with unchanged output fires; with output that changed each time it does not', () => {
    const sequence = (outs: string[]) => {
      let s = emptyWatch()
      let rows = 0
      outs.forEach(o => {
        const r = run(CMD, 300_000, s)
        if (r.row) rows++
        s = driveOutput(r.state, CMD, o)
      })
      return rows
    }
    expect(sequence(['same', 'same', 'same'])).toBe(1)
    expect(sequence(['a', 'b', 'c'])).toBe(0)
    expect(sequence(['a', 'b', 'b', 'b'])).toBe(1)
  })
  test('it does not fire at 100K', () => {
    let s = emptyWatch()
    for (let i = 0; i < 4; i++) {
      const r = run(CMD, 100_000, s)
      expect(r.row).toBeUndefined()
      s = r.state
    }
  })
  test('once per turn: a fourth match is silent', () => {
    let s = emptyWatch()
    let rows = 0
    for (let i = 0; i < 5; i++) {
      const r = run(CMD, 300_000, s)
      if (r.row) rows++
      s = r.state
    }
    expect(rows).toBe(1)
  })
  test('a poll at or above the threshold fires on its own; off, it never does', () => {
    expect(run('until grep -q done /tmp/log; do sleep 5; done', 250_000).row).toContain('poll')
    expect(driveStep(emptyWatch(), { command: 'until x; do sleep 1; done', context: 250_000, threshold: 200_000, model: OPUS, enabled: false }).row).toBeUndefined()
  })
})

describe('MOD-99: the polling nudge names the move', () => {
  const OPUS = 'claude-opus-5-5'
  const POLL = 'until grep -q done /tmp/blender-live.log; do sleep 5; done'
  const step = (command: string, extra: Record<string, unknown> = {}) => driveStep(emptyWatch(), { command, context: 250_000, threshold: 200_000, model: OPUS, enabled: true, ...extra } as never).row

  test('a command naming a declared resource says to card it with resources', () => {
    expect(step(POLL, { resources: ['blender-live'] })).toContain('card it with resources: [blender-live] so one worker drives it')
  })
  test('a poll while a worker runs says to wait with the verdict tool', () => {
    expect(step('until test -f /tmp/done; do sleep 5; done', { waitingOnWorker: true })).toContain('wait with the verdict tool (it returns when the worker hands back) instead of polling')
  })
  test('a resource beats the worker form when the command names it', () => {
    const row = step(POLL, { resources: ['blender-live'], waitingOnWorker: true }) ?? ''
    expect(row).toContain('card it with resources: [blender-live]')
    expect(row).not.toContain('verdict tool')
  })
  test('otherwise today\'s text stays and points at the guide section', () => {
    const row = step('until test -f /tmp/done; do sleep 5; done') ?? ''
    expect(row).toContain('A standard card would drive this loop')
    expect(row).toContain('see docs/guide.md#one-client-resources')
  })
  test('a resource the command does not name is not offered', () => {
    expect(step('until test -f /tmp/done; do sleep 5; done', { resources: ['blender-live'] })).toContain('see docs/guide.md#one-client-resources')
  })
})

describe('MOD-53: the fresh-session row', () => {
  test('below the threshold, nothing', () => {
    expect(freshSessionRow(399_999, 400_000)).toBeUndefined()
  })
  test('at the threshold, the row with both figures rounded to K', () => {
    expect(freshSessionRow(400_000, 400_000)).toBe('chassis-delegation: brain context 400K (freshSessionTokens 400K): start a fresh session at the next phase boundary; cards, the ledger and lessons carry over')
  })
  test('above the threshold', () => {
    expect(freshSessionRow(512_000, 400_000)).toBe('chassis-delegation: brain context 512K (freshSessionTokens 400K): start a fresh session at the next phase boundary; cards, the ledger and lessons carry over')
  })
  test('0 is off', () => {
    expect(freshSessionRow(900_000, 0)).toBeUndefined()
  })
})

describe('MOD-225 (#305): a poll is looked for outside heredoc bodies and quoted text', () => {
  const NOTES = "cat > notes.md <<'EOF'\nwe wait while the build runs, then\nuntil it is green we sleep 5 and retry\nEOF"
  test('real polls still poll', () => {
    expect(isPoll('until [ -f x ]; do sleep 5; done')).toBe(true)
    expect(isPoll('while true; do ls; sleep 10; done')).toBe(true)
    expect(isPoll('sleep 30 && cat log')).toBe(true)
    expect(isPoll("bash -c 'until [ -f x ]; do sleep 5; done'")).toBe(true)
    expect(isPoll('sh -c "while true; do sleep 2; done"')).toBe(true)
    expect(isPoll("zsh -lc 'sleep 30'")).toBe(true)
  })
  test('a heredoc write, a quoted message and a quoted echo do not poll', () => {
    expect(isPoll(NOTES)).toBe(false)
    expect(isPoll("cat > f <<-'EOF'\n\twhile x; do sleep 1; done\n\tEOF\n")).toBe(false)
    expect(isPoll('cat > f <<EOF\nuntil done\nEOF')).toBe(false)
    expect(isPoll('git commit -m "wait until the sleep test passes"')).toBe(false)
    expect(isPoll('echo "sleep 5"')).toBe(false)
    expect(isPoll("echo 'until x'")).toBe(false)
  })
  test('a poll after a heredoc on the same command still polls', () => {
    expect(isPoll("cat > f <<'EOF'\nhello\nEOF\nsleep 30")).toBe(true)
  })
  test('callKind: the notes write is not a run-or-poll', () => {
    expect(callKind('Bash', { command: NOTES }, true)).toBe('edit')
  })
  test('cutText removes heredoc bodies and quoted strings, keeps a bash -c body', () => {
    expect(cutText("cat > f <<'EOF'\nbody\nEOF\nls")).toBe('cat > f <<\nls')
    expect(cutText('echo "a b" \'c\' d')).toBe('echo "" \'\' d')
    expect(cutText("bash -c 'sleep 3'")).toBe("bash -c ' sleep 3'")
    expect(cutText('cat <<< "x y"')).toBe('cat <<< ""')
  })
  test('commandKey ignores a heredoc body, so two writes of different prose are not a repeat', () => {
    expect(commandKey("cat > f <<'EOF'\none\nEOF")).toBe(commandKey("cat > f <<'EOF'\ntwo\nEOF"))
    expect(commandKey('git commit -m "a"')).toBe(commandKey('git commit -m "b"'))
  })
  test('the row does not speak for a notes write at a large context', () => {
    const r = driveStep(emptyWatch(), { command: NOTES, context: 300_000, threshold: DRIVE_THRESHOLD_TOKENS, model: 'claude-opus-5-5', enabled: true })
    expect(r.row).toBeUndefined()
  })
})
