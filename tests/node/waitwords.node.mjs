// MOD-418 (#593): saysWaiting reads a worker's own "still running in the background" and "waiting for the monitors" as a wait. Pure.
import { test, expect, describe } from './kit.mjs'
import { saysWaiting } from '../../hooks/lib/waitstate.ts'

const REPORT = '[[report v=1 task=T-4 subtask=main branch=agent/frontend/T-4 pr=none sha=1234abcd gate=pass files=a/x.ts]]'
const REAL1 = "The engine suite is still running in the background (task bcx26ic5i). Its completion will re-invoke me, so I'll wait for that rather than poll the output file. Once it finishes I'll check the result, commit the change, and hand back the report."
const REAL2 = "The engine suite is running again in the background (task bx1b24y43). I'll pick up the result when it completes."
const REAL3 = 'Waiting for the monitors to fire.'

describe('MOD-418: a worker waiting on its own run', () => {
  test('the three real worker texts are waits', () => {
    expect(saysWaiting(REAL1)).toBe(true)
    expect(saysWaiting(REAL2)).toBe(true)
    expect(saysWaiting(REAL3)).toBe(true)
  })
  for (const t of [
    'I started the suite in the background. I\'ll wait for it to finish.',
    'Both runs are now running in the background.',
    'Waiting for the engine suite to finish.',
    "I'll wait for the task notification.",
    'Still waiting on the gate to finish.',
    'I will wait for the tests to complete.',
    `Tests started.\n\n${REAL2}`,
  ]) test(`is a wait: ${t.slice(0, 60)}`, () => expect(saysWaiting(t)).toBe(true))
})

describe('MOD-418: not a wait', () => {
  for (const t of [
    'The suite was running in the background and has finished: 2348 pass.',
    'The dev server is no longer running in the background.',
    'The suite ran in the background and passed.',
    'Waiting for you to test it.',
    'Waiting for your call on the build.',
    "I'll wait for it.",
    'Waiting for the tester.',
    `${REAL1}\n\nSummary: the change is done.`,
    `${REAL1}\n\n${REPORT}`,
    "You've hit your usage limit. The suite is still running in the background; resets at 5pm.",
  ]) test(`is not a wait: ${t.slice(0, 60)}`, () => expect(saysWaiting(t)).toBe(false))
})
