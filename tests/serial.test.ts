import { test, expect, describe } from 'claude-code/testing'
import { abortedDeny, budgetDelay, decisionId, DECISION_RESERVE_MS, isStopped, outOfTimeDeny, stopper, turns, type Stopped } from '../hooks/lib/serial'

/** What a call throws (its message), or undefined; the node kit has no toThrow. */
const thrown = (fn: () => unknown): string | undefined => {
  try {
    fn()
    return undefined
  } catch (err) {
    return (err as Error).message
  }
}
const rejection = (p: Promise<unknown>): Promise<unknown> =>
  p.then(
    () => undefined,
    err => err as unknown,
  )
const tick = () => Promise.resolve()
const flush = async (n = 20) => {
  for (let i = 0; i < n; i++) await tick()
}

describe('MOD-92: one spawn decision at a time', () => {
  test('turns run in the order asked, the next only once the one before has settled', async () => {
    const t = turns()
    const log: string[] = []
    let release: () => void = () => undefined
    const held = new Promise<void>(r => {
      release = r
    })
    const a = t.run(async () => {
      log.push('a start')
      await held
      log.push('a end')
      return 'a'
    })
    const b = t.run(async () => (log.push('b'), 'b'))
    const c = t.run(async () => (log.push('c'), 'c'))
    await flush()
    expect(log).toEqual(['a start'])
    expect(t.waiting).toBe(3)
    release()
    expect(await Promise.all([a, b, c])).toEqual(['a', 'b', 'c'])
    expect(log).toEqual(['a start', 'a end', 'b', 'c'])
    await flush()
    expect(t.waiting).toBe(0)
  })

  test('a turn that throws does not stop the next', async () => {
    const t = turns()
    const a = t.run(async () => {
      throw new Error('boom')
    })
    const b = t.run(async () => 'b')
    expect(((await rejection(a)) as Error).message).toBe('boom')
    expect(await b).toBe('b')
  })
})

describe('MOD-92: the stop a decision is raced against', () => {
  test('before commit a stop rejects what is pending at once, and check() throws', async () => {
    const s = stopper()
    const never = new Promise<string>(() => undefined)
    const raced = s.race(never)
    s.stop('abort')
    const err = await rejection(raced)
    expect(isStopped(err)).toBe(true)
    expect((err as Stopped).why).toBe('abort')
    expect(thrown(() => s.check())).toBe('spawn decision stopped (abort)')
    expect(thrown(() => s.commit())).toBe('spawn decision stopped (abort)')
    expect(isStopped(await rejection(s.race(Promise.resolve(1))))).toBe(true)
    expect(await s.settled).toBe('abort')
  })

  test('after commit a stop takes nothing back: what is under way resolves, check() passes, settled says why', async () => {
    const s = stopper()
    let done: (v: string) => void = () => undefined
    const late = s.race(
      new Promise<string>(r => {
        done = r
      }),
    )
    s.commit()
    s.stop('budget')
    expect(s.stopped).toBe('budget')
    expect(thrown(() => s.check())).toBeUndefined()
    done('started')
    expect(await late).toBe('started')
    expect(await s.race(Promise.resolve('views'))).toBe('views')
    expect(await s.settled).toBe('budget')
  })

  test('the first stop is the one kept', () => {
    const s = stopper()
    s.stop('budget')
    s.stop('abort')
    expect(s.stopped).toBe('budget')
  })
})

describe('MOD-92: the budget and the refusals', () => {
  test('the wait left is the budget less the reserve; unmetered is no wait; spent is now', () => {
    expect(DECISION_RESERVE_MS).toBe(2500)
    expect(budgetDelay(10_000)).toBe(7_500)
    expect(budgetDelay(2_000)).toBe(0)
    expect(budgetDelay(0)).toBe(0)
    expect(budgetDelay(Infinity)).toBeUndefined()
    expect(budgetDelay(undefined)).toBeUndefined()
    expect(budgetDelay(9_999.6, 1_000)).toBe(8_999)
  })

  test('the out-of-time refusal is one line naming the spawn and the cure', () => {
    expect(outOfTimeDeny('MOD-7')).toBe('MOD-7: the spawn decision ran out of time; make the Agent call again')
    expect(abortedDeny('MOD-7')).toBe('MOD-7: the spawn was abandoned before its decision finished; nothing started')
  })

  test("the spawn's id: the header's task (and subtask), else the brief file's id, else agent", () => {
    expect(decisionId('T-1', 'main', undefined)).toBe('T-1')
    expect(decisionId('T-1', 'ui', '/x/T-1.brief.md')).toBe('T-1/ui')
    expect(decisionId(undefined, undefined, '/s/briefs/MOD-92.brief.md')).toBe('MOD-92')
    expect(decisionId(undefined, undefined, '/s/briefs/MOD-9.replay.brief.md')).toBe('MOD-9')
    expect(decisionId(undefined, undefined, undefined)).toBe('agent')
  })
})
