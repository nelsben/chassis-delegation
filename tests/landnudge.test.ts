import { test, expect, describe } from 'claude-code/testing'
import { describesWork, nudgeLine, parentNudge } from '../hooks/lib/landnudge'

// MOD-201: the land nudge's pure parts.
describe('MOD-201: describesWork', () => {
  test('a prompt that describes a bug, feature or idea is work', () => {
    expect(describesWork('the merge button is broken on dark mode')).toBe(true)
    expect(describesWork('We should let the band show the parent count')).toBe(true)
    expect(describesWork("let's add a retry to the land tool please")).toBe(true)
    expect(describesWork('there is a follow-up after the release is cut')).toBe(true)
  })
  test('short text, slash commands, issue references and ordinary talk are not', () => {
    expect(describesWork('go ahead')).toBe(false)
    expect(describesWork('/delegation status')).toBe(false)
    expect(describesWork('fix #231 please, it is broken')).toBe(false)
    expect(describesWork('it is broken')).toBe(false) // 12 characters
    expect(describesWork('please run the whole suite once more now')).toBe(false)
  })
  test('whole words only', () => {
    expect(describesWork('the debugger prints an ideal layout today')).toBe(false)
  })
})

describe('MOD-201: nudgeLine', () => {
  test('both forms', () => {
    expect(nudgeLine('prompt')).toBe('lead: land this as an issue (land or land_plan) or say it is not work')
    expect(nudgeLine('parent', { number: 50, open: 2 })).toBe('lead: parent #50 has 2 open tasks; land the next or close it')
  })
  test('parentNudge counts the other open siblings and is silent when none are open', () => {
    const subs = [{ number: 51, state: 'OPEN' }, { number: 52, state: 'OPEN' }, { number: 53, state: 'CLOSED' }]
    expect(parentNudge(50, 52, subs)).toEqual({ number: 50, open: 1 })
    expect(parentNudge(50, 52, [{ number: 52, state: 'OPEN' }])).toBeUndefined()
    expect(parentNudge(50, 52, undefined)).toBeUndefined()
  })
})
