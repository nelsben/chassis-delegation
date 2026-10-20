// bin/evidence-charts.mjs: a summary in, six accessible SVG charts out. Node only: it spawns the script.
import { test, expect, describe } from './kit.mjs'
import { spawnSync } from 'node:child_process'
import { readFileSync, mkdtempSync, readdirSync, rmSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const here = rel => fileURLToPath(new URL(rel, import.meta.url))
const script = here('../../bin/evidence-charts.mjs')
const fixture = here('../fixtures/evidence-charts/summary.json')
const summary = JSON.parse(readFileSync(fixture, 'utf8'))
const FILES = ['outcomes.svg', 'attempts.svg', 'tiers.svg', 'spend-by-day.svg', 'repos.svg', 'hand-vs-mod.svg']

function generate() {
  const dir = mkdtempSync(join(tmpdir(), 'evidence-charts-'))
  const r = spawnSync(process.execPath, ['--no-warnings', script, fixture, dir], { encoding: 'utf8' })
  const svgs = {}
  if (r.status === 0) for (const f of FILES) if (existsSync(join(dir, f))) svgs[f] = readFileSync(join(dir, f), 'utf8')
  const listed = r.status === 0 ? readdirSync(dir).sort() : []
  rmSync(dir, { recursive: true, force: true })
  return { r, svgs, listed }
}

describe('bin/evidence-charts.mjs', () => {
  const { r, svgs, listed } = generate()
  const textOf = s => [...s.matchAll(/<text\b[^>]*>([^<]*)<\/text>/g)].map(m => m[1]).join('\n')

  test('exits 0 and writes the six files', () => {
    expect(r.status).toBe(0)
    expect(listed).toEqual([...FILES].sort())
  })
  test('each file is svg text with role="img", a title and a desc', () => {
    for (const f of FILES) {
      const s = svgs[f]
      expect(typeof s).toBe('string')
      expect(/^<svg\b[^>]*\bwidth="720"/.test(s)).toBe(true)
      expect(s.includes('role="img"')).toBe(true)
      expect(/<title>[^<]+<\/title>/.test(s)).toBe(true)
      expect(/<desc>[^<]+<\/desc>/.test(s)).toBe(true)
      expect(s.trimEnd().endsWith('</svg>')).toBe(true)
    }
  })
  test('every bar value appears as text', () => {
    const v = summary.verdicts
    for (const n of Object.values(v)) expect(textOf(svgs['outcomes.svg']).includes(String(n))).toBe(true)
    for (const n of Object.values(summary.attempts)) expect(textOf(svgs['attempts.svg']).includes(String(n))).toBe(true)
    for (const t of Object.values(summary.tiers)) {
      expect(textOf(svgs['tiers.svg']).includes(`$${t.meanUsd.toFixed(2)}`)).toBe(true)
      expect(textOf(svgs['tiers.svg']).includes(`${t.medianMin} min`)).toBe(true)
    }
    const days = textOf(svgs['spend-by-day.svg'])
    for (const d of ['$13', '$40', '$8.2', '$5.0']) expect(days.includes(d)).toBe(true)
    for (const R of Object.values(summary.repos)) for (const n of Object.values(R.verdicts)) expect(textOf(svgs['repos.svg']).includes(String(n))).toBe(true)
    for (const n of ['$7.19', '$10.79', '$7.78', '$0.91', '$1.75', '$1.27']) expect(textOf(svgs['hand-vs-mod.svg']).includes(n)).toBe(true)
  })
  test('the spend chart labels the ceiling marker', () => {
    expect(textOf(svgs['spend-by-day.svg']).includes('spend ceiling, 0.5.0')).toBe(true)
  })
  test('dark-mode media query, transparent background, text at least 12px', () => {
    for (const f of FILES) {
      const s = svgs[f]
      expect(s.includes('@media (prefers-color-scheme: dark)')).toBe(true)
      expect(/<rect[^>]*width="720"[^>]*fill="(?!none)/.test(s)).toBe(false)
      for (const m of s.matchAll(/font-size:\s*(\d+)px/g)) expect(Number(m[1]) >= 12).toBe(true)
    }
  })
  test('no path and no task-id-shaped token in any file', () => {
    for (const f of FILES) {
      const s = svgs[f]
      expect(/\/(Users|home|tmp|private|var)\//.test(s)).toBe(false)
      expect(/[A-Za-z]:\\/.test(s)).toBe(false)
      expect(/\b[A-Z]{2,}-\d+\b/.test(s)).toBe(false)
    }
  })
  test('a missing or malformed summary exits non-zero', () => {
    const bad = spawnSync(process.execPath, ['--no-warnings', script, here('../fixtures/evidence-charts/nope.json'), tmpdir()], { encoding: 'utf8' })
    expect(bad.status === 0).toBe(false)
  })
})
