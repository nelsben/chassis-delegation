import { test, expect, describe } from 'claude-code/testing'
import {
  countLines,
  parseWatermark,
  cleanStop,
  breadcrumbPath,
  watermarkPath,
  debriefSkillPath,
  debriefPrompt,
  debriefPathOf,
  debriefToast,
  type CleanStopInput,
  addFriction,
  builtInDebriefPrompt,
  debriefSource,
  DEFAULT_DEBRIEF_MIN_EVENTS,
  frictionFacts,
  isCorrection,
  type FrictionEvent,
} from '../hooks/lib/cleanstop'

const H = 60 * 60 * 1000
const base: CleanStopInput = { inTurn: false, running: 0, pending: 0, queued: 0, lines: 40, watermark: 10, minNewLines: 25, now: 100 * H, cooldownMs: 6 * H }

describe('breadcrumbs and the watermark', () => {
  test('lines are counted as wc -l counts them', () => {
    expect(countLines('')).toBe(0)
    expect(countLines('{"a":1}\n{"b":2}\n')).toBe(2)
    expect(countLines('{"a":1}\n{"b":2}')).toBe(1)
  })
  test('the .done watermark is a line count; absent, empty (a legacy touch) or junk reads 0', () => {
    expect(parseWatermark('42\n')).toBe(42)
    expect(parseWatermark(' 7 ')).toBe(7)
    expect(parseWatermark('')).toBe(0)
    expect(parseWatermark(undefined)).toBe(0)
    expect(parseWatermark('x')).toBe(0)
  })
  test('the files the debrief reads, from the home folder and the session id', () => {
    expect(breadcrumbPath('/Users/b', 's-1')).toBe('/Users/b/.claude/harness/breadcrumbs/s-1.jsonl')
    expect(watermarkPath('/Users/b', 's-1')).toBe('/Users/b/.claude/harness/breadcrumbs/s-1.done')
    expect(debriefSkillPath('/Users/b')).toBe('/Users/b/.claude/commands/debrief.md')
  })
})

describe('the clean-stop predicate', () => {
  const cases: [string, Partial<CleanStopInput>, string | undefined][] = [
    ['all clear', {}, undefined],
    ['a main turn is running', { inTurn: true }, 'a turn is running'],
    ['a worker is running', { running: 1 }, '1 worker running'],
    ['two workers are running', { running: 2 }, '2 workers running'],
    ['a verdict is pending', { pending: 1 }, '1 verdict pending'],
    ['a spawn is queued', { queued: 1 }, '1 spawn queued'],
    ['24 new lines past the watermark', { lines: 34 }, 'only 24 new breadcrumb lines (need 25)'],
    ['exactly 25 new lines', { lines: 35 }, undefined],
    ['no watermark file: every line is new', { lines: 25, watermark: 0 }, undefined],
    ['the last debrief was 5 hours ago', { lastAt: 95 * H }, 'last debrief 5.0h ago (cooldown 6h)'],
    ['the last debrief was 6 hours ago', { lastAt: 94 * H }, undefined],
    ['the last debrief ran at this same watermark', { lastAt: 1 * H, lastWatermark: 10 }, 'already debriefed at watermark 10'],
    ['the last debrief ran at an older watermark', { lastAt: 1 * H, lastWatermark: 3 }, undefined],
  ]
  for (const [name, over, why] of cases) {
    test(name, () => {
      const r = cleanStop({ ...base, ...over })
      if (why === undefined) expect(r).toEqual({ ok: true })
      else expect(r).toEqual({ ok: false, why })
    })
  }
})

describe('the background debrief agent', () => {
  test('its prompt names the skill file and the session', () => {
    expect(debriefPrompt('/Users/b/.claude/commands/debrief.md', 's-1')).toBe(
      'Run the /debrief skill exactly as written in /Users/b/.claude/commands/debrief.md. Session id s-1. Write only what the skill allows.',
    )
  })
  test('its answer names the debrief file; the toast carries the path, else says it finished', () => {
    const answer = 'Wrote `/Users/b/.claude/harness/debriefs/2026-10-03-mod-build.json` — 3 gaps, 2 wins.'
    expect(debriefPathOf(answer)).toBe('/Users/b/.claude/harness/debriefs/2026-10-03-mod-build.json')
    expect(debriefPathOf('nothing to debrief')).toBeUndefined()
    expect(debriefToast(answer)).toBe('debrief written: /Users/b/.claude/harness/debriefs/2026-10-03-mod-build.json')
    expect(debriefToast('done')).toBe('debrief finished')
  })
})

describe('5E: the debrief without the harness', () => {
  test('the user skill wins when it exists; else the built-in template', () => {
    expect(debriefSource('/home/u', '/mods/cd', true)).toEqual({ path: '/home/u/.claude/commands/debrief.md', builtIn: false })
    expect(debriefSource('/home/u', '/mods/cd', false)).toEqual({ path: '/mods/cd/templates/debrief.md', builtIn: true })
  })
  test('the built-in prompt names the template, the root, the session and the facts', () => {
    const p = builtInDebriefPrompt('/mods/cd/templates/debrief.md', 'sess-1', '/w/app', ['correction: no, use the other file', 'refuted: OPS-1 attempt 1 refuted on scope'])
    expect(p).toContain('Run the debrief exactly as written in /mods/cd/templates/debrief.md.')
    expect(p).toContain('Session id sess-1. Repo root /w/app.')
    expect(p).toContain('- correction: no, use the other file')
    expect(p).toContain('Write only what it allows.')
  })
  test('a correction is a prompt whose first word is no, stop, don\'t or actually (any case)', () => {
    for (const t of ['no, the other one', 'Stop.', "DON'T touch that", 'actually use pnpm', 'dont']) expect(isCorrection(t)).toBe(true)
    for (const t of ['now do it', 'nothing else', 'please stop', '', 'actuallyx']) expect(isCorrection(t)).toBe(false)
  })
  test('friction events: appended with their kind, capped, counted', () => {
    let list: FrictionEvent[] = []
    for (let i = 0; i < 120; i += 1) list = addFriction(list, { kind: 'denial', detail: `Bash ${i}`, at: i })
    expect(list).toHaveLength(100)
    expect(list[0]?.detail).toBe('Bash 20')
    expect(frictionFacts([{ kind: 'correction', detail: 'no, x', at: 1 }, { kind: 'denial', detail: 'Bash: git push', at: 2 }])).toEqual(['correction: no, x', 'tool denied: Bash: git push'])
    expect(DEFAULT_DEBRIEF_MIN_EVENTS).toBe(5)
  })
  test('the debrief file the agent names, in either place', () => {
    expect(debriefPathOf('Wrote /w/app/.delegation/debriefs/2026-10-03-guard-day.json and the ledger line.')).toBe('/w/app/.delegation/debriefs/2026-10-03-guard-day.json')
    expect(debriefPathOf('see ~/.claude/harness/debriefs/2026-10-03-x.json')).toBe('~/.claude/harness/debriefs/2026-10-03-x.json')
  })
})
