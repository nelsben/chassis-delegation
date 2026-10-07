import { test, expect, describe } from 'claude-code/testing'
import { startingOthers, hasSlot, queuedDeny, isQueuedDeny, enqueue, dequeue, promptKey, queuedText, parseMaxWorkers } from '../hooks/lib/scheduler'

const item = (task: string) => ({ prompt: `Your brief is the file /s/briefs/${task}.brief.md.`, description: task, subagentType: 'backend', task, at: 1 })

describe('the worker scheduler', () => {
  test('maxWorkers: 2 by default; a whole number of at least 1', () => {
    expect(parseMaxWorkers(undefined)).toBe(2)
    expect(parseMaxWorkers(3)).toBe(3)
    expect(parseMaxWorkers(2.7)).toBe(2)
    expect(parseMaxWorkers(0)).toBe(2)
    expect(parseMaxWorkers('4')).toBe(2)
  })

  test('a slot is free while running plus starting is under the cap', () => {
    expect(hasSlot(0, 0, 2)).toBe(true)
    expect(hasSlot(1, 0, 2)).toBe(true)
    expect(hasSlot(1, 1, 2)).toBe(false)
    expect(hasSlot(2, 0, 2)).toBe(false)
    expect(hasSlot(3, 0, 2)).toBe(false)
  })

  test('the deny names the task and the workers holding the slots', () => {
    const deny = queuedDeny('BE-101', ['OPS-1', 'OPS-2'], ['BE-101'])
    expect(deny).toBe('queued by chassis-delegation: BE-101 starts when a worker slot frees (2 live: OPS-1, OPS-2; 1 queued: BE-101)')
    expect(isQueuedDeny(deny)).toBe(true)
    expect(isQueuedDeny("budget exhausted for T-2 (2 attempts); raise budget= in the task's brief to continue (the ladder resumes from attempt 2, the brief is re-read)")).toBe(false)
    expect(queuedText(2)).toBe('queued (position 2)')
  })

  test('a task and subtask already queued is never entered twice', () => {
    const one = enqueue([], { ...item('A'), at: 5 })
    const again = enqueue(one.queue, item('A'))
    expect(again.queue).toHaveLength(1)
    expect(again.existing).toEqual({ at: 5, position: 1 })
    expect(enqueue(one.queue, { ...item('A'), subtask: 'other' }).queue).toHaveLength(2)
  })

  test('first in, first out; the position is 1-based', () => {
    const one = enqueue([], item('A'))
    expect(one.position).toBe(1)
    const two = enqueue(one.queue, item('B'))
    expect(two.position).toBe(2)
    expect(two.queue.map(q => q.task)).toEqual(['A', 'B'])
    const out = dequeue(two.queue)
    expect(out.head?.task).toBe('A')
    expect(out.rest.map(q => q.task)).toEqual(['B'])
    expect(dequeue([]).head).toBeUndefined()
  })

  test('a spawn is known by its prompt and working folder', () => {
    expect(promptKey({ prompt: 'p', cwd: '/w' })).toBe(promptKey({ prompt: 'p', cwd: '/w' }))
    expect(promptKey({ prompt: 'p', cwd: '/w' })).not.toBe(promptKey({ prompt: 'p' }))
  })
})

describe('GH-5: a dispatch does not count its own starting token', () => {
  test('with maxWorkers 2 and one worker live, the dispatch tool spawn starts at once; with two live it queues naming only real workers', () => {
    // the dispatch path holds a `starting` token for BE-320 itself; the spawn hook claims again
    const starting = ['FE-232']
    const others = startingOthers(starting, 'FE-232')
    expect(others).toEqual([])
    expect(hasSlot(1, others.length, 2)).toBe(true)
    // another task still starting does count
    expect(startingOthers(['FE-232', 'BE-9'], 'FE-232')).toEqual(['BE-9'])
    expect(hasSlot(1, startingOthers(['FE-232', 'BE-9'], 'FE-232').length, 2)).toBe(false)
    // two live: queued, and the line names only them
    expect(hasSlot(2, others.length, 2)).toBe(false)
    expect(queuedDeny('FE-232', ['BE-320', 'BE-321', ...others], ['FE-232'])).toBe('queued by chassis-delegation: FE-232 starts when a worker slot frees (2 live: BE-320, BE-321; 1 queued: FE-232)')
  })
})
