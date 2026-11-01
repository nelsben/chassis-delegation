// MOD-235: whether a Bash command runs the engine suite, and the trailing line a result gains. Pure.
import { test, expect, describe } from './kit.mjs'

const G = () => import('../../hooks/lib/gates.ts')

describe('MOD-235: runsEngineSuite', () => {
  test('the plain command and its wrappers', async () => {
    const { runsEngineSuite } = await G()
    for (const c of ['claude plugin test .', 'claude plugin test /w/wt', '/usr/local/bin/claude plugin test .', 'timeout 300 claude plugin test .', 'timeout -s KILL 300 claude plugin test .', 'env X=1 claude plugin test .', 'X=1 claude plugin test .', 'npx claude plugin test .', 'npx -y claude plugin test .', 'time nice -n 5 claude plugin test .']) {
      expect(runsEngineSuite(c)).toBe(true)
    }
  })
  test('inside && ; | and newline chains', async () => {
    const { runsEngineSuite } = await G()
    for (const c of ['cd /w && claude plugin test .', 'node a.js; claude plugin test .', 'claude plugin test . | tail -5', 'claude plugin test . 2>&1 | tail -5', 'echo hi\nclaude plugin test .', 'a || timeout 9 claude plugin test .', '(claude plugin test .)']) {
      expect(runsEngineSuite(c)).toBe(true)
    }
  })
  test('inside bash, sh and zsh -c bodies', async () => {
    const { runsEngineSuite } = await G()
    for (const c of ['bash -c "claude plugin test ."', "sh -c 'cd /w && claude plugin test .'", "zsh -c 'timeout 60 claude plugin test .'", "bash -lc 'claude plugin test .'"]) {
      expect(runsEngineSuite(c)).toBe(true)
    }
  })
  test('commands that only mention it, or run something else, do not match', async () => {
    const { runsEngineSuite } = await G()
    for (const c of ['node tests/x.js', 'claude plugin validate .', 'claude --version', 'echo "claude plugin test ."', "grep 'claude plugin test' notes.md", 'cat <<EOF\nclaude plugin test .\nEOF', 'git commit -m "run claude plugin test"', 'npm test', 'ls claude plugin test']) {
      expect(runsEngineSuite(c)).toBe(false)
    }
  })
})

describe('MOD-235: withTrailingLine', () => {
  test('the line goes after the text, else the result string, else its stdout', async () => {
    const { withTrailingLine } = await G()
    expect(withTrailingLine({ text: 'a' }, 'L')).toEqual({ text: 'a\nL' })
    expect(withTrailingLine({ result: 'a' }, 'L')).toEqual({ result: 'a\nL' })
    expect(withTrailingLine({ result: { stdout: 'a', stderr: 'e' } }, 'L')).toEqual({ result: { stdout: 'a\nL', stderr: 'e' } })
    expect(withTrailingLine({}, 'L')).toEqual({ text: 'L' })
  })
})
