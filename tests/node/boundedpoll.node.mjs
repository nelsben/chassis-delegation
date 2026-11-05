// MOD-318: a bounded retry loop is not a poll; a sleep or an unbounded while/until outside one still is.
import { test, expect, describe } from './kit.mjs'

const D = () => import('../../hooks/lib/drive.ts')

describe('MOD-318: isPoll and bounded retry loops', () => {
  test('a for retry loop around a push is not a poll', async () => {
    const { isPoll } = await D()
    expect(isPoll('for i in 1 2 3; do git push && break; sleep 5; done')).toBe(false)
  })
  test('a while or (( )) loop bounded by a comparison, with a sleep, is not a poll', async () => {
    const { isPoll } = await D()
    expect(isPoll('n=0; while [ $n -lt 5 ]; do n=$((n+1)); sleep 1; done')).toBe(false)
    expect(isPoll('n=0; while (( n < 5 )); do n=$((n+1)); sleep 1; done')).toBe(false)
  })
  test('the poll shapes stay polls', async () => {
    const { isPoll } = await D()
    expect(isPoll('while true; do ls; sleep 1; done')).toBe(true)
    expect(isPoll('until git ls-remote origin main >/dev/null; do sleep 2; done')).toBe(true)
    expect(isPoll('sleep 5')).toBe(true)
    expect(isPoll('until [ "$(curl -s http://localhost:8080)" -eq 200 ]; do sleep 2; done')).toBe(true)
  })
  test('a bare sleep after a bounded loop is still a poll', async () => {
    const { isPoll } = await D()
    expect(isPoll('for i in 1 2; do git push && break; done; sleep 5')).toBe(true)
  })
})
