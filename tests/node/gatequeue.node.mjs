// MOD-379 (#513): the gate queue: at most n gates at once, the rest first in first out. Pure.
import { test, expect, describe } from './kit.mjs'
import { gateQueue } from '../../hooks/lib/gaterun.ts'

const tick = () => new Promise(resolve => setImmediate(resolve))
const track = p => {
  const s = { done: false }
  p.then(() => (s.done = true))
  return s
}

describe('MOD-379: gateQueue', () => {
  test('with max 0, three acquires all resolve at once and count as running', async () => {
    const q = gateQueue()
    const a = track(q.acquire(0))
    const b = track(q.acquire(0))
    const c = track(q.acquire(0))
    await tick()
    expect([a.done, b.done, c.done]).toEqual([true, true, true])
    expect(q.running()).toBe(3)
    expect(q.waiting()).toBe(0)
  })
  test('with max 1, each waits for the release before it, in the order asked', async () => {
    const q = gateQueue()
    const order = []
    const p1 = q.acquire(1).then(r => (order.push(1), r))
    const p2 = q.acquire(1).then(r => (order.push(2), r))
    const p3 = q.acquire(1).then(r => (order.push(3), r))
    await tick()
    expect(order).toEqual([1])
    expect(q.waiting()).toBe(2)
    ;(await p1)()
    await tick()
    expect(order).toEqual([1, 2])
    ;(await p2)()
    await tick()
    expect(order).toEqual([1, 2, 3])
    ;(await p3)()
    expect(q.running()).toBe(0)
    expect(q.waiting()).toBe(0)
  })
  test('a release called twice lowers the count once', async () => {
    const q = gateQueue()
    const r1 = await q.acquire(2)
    await q.acquire(2)
    expect(q.running()).toBe(2)
    r1()
    r1()
    expect(q.running()).toBe(1)
  })
  test('with max 2, two run and the third waits', async () => {
    const q = gateQueue()
    const r1 = await q.acquire(2)
    await q.acquire(2)
    const c = track(q.acquire(2))
    await tick()
    expect(c.done).toBe(false)
    expect(q.running()).toBe(2)
    expect(q.waiting()).toBe(1)
    r1()
    await tick()
    expect(c.done).toBe(true)
    expect(q.running()).toBe(2)
  })
  test('an uncapped caller counts as running, so a later capped caller waits', async () => {
    const q = gateQueue()
    const free = await q.acquire(0)
    const capped = track(q.acquire(1))
    await tick()
    expect(capped.done).toBe(false)
    free()
    await tick()
    expect(capped.done).toBe(true)
  })
})
