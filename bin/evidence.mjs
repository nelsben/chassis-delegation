#!/usr/bin/env node
// Turns delegation ledgers into one anonymized JSON summary of outcomes, cost and time.
// Reads only the files named, writes nothing, needs only Node built-ins.
// Never emits a path, task id, sha, session id, agent id, brief path or free text.
import { readFileSync } from 'node:fs'

const files = process.argv.slice(2)
if (files.length === 0) {
  process.stderr.write('usage: node bin/evidence.mjs <ledger.jsonl> [<ledger.jsonl>...]\n')
  process.exit(2)
}

const label = i => {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
const day = ms => new Date(ms).toISOString().slice(0, 10)
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const round = (v, p) => Math.round(v * 10 ** p) / 10 ** p
const bump = (o, k, by = 1) => { o[k] = (o[k] || 0) + by }
const sortKeys = o => Object.fromEntries(Object.entries(o).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
const nearest = (sorted, p) => sorted[Math.max(0, Math.ceil(p * sorted.length) - 1)]
const fold = v => (v === 'verified' ? 'consistent' : v) // legacy word: read-only normaliser

let skippedLines = 0
const repos = {}
const allDays = []
files.forEach((file, i) => {
  let text
  try { text = readFileSync(file, 'utf8') } catch {
    process.stderr.write(`error: cannot read ledger at argument ${i + 1}\n`)
    process.exit(1)
  }
  const R = (repos[label(i)] = { judged: new Map(), tasks: new Set(), accepted: new Set(), merged: new Set() })
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { skippedLines++; continue }
    if (r === null || typeof r !== 'object' || Array.isArray(r)) { skippedLines++; continue }
    const task = String(r.task ?? '')
    const at = num(r.at)
    if (at !== null) allDays.push(at)
    if (r.kind === 'accept') { R.accepted.add(task); continue }
    if (r.kind === 'merged') { R.merged.add(task); continue }
    if (r.event !== undefined || r.kind === 'review' || typeof r.verdict !== 'string') continue
    const key = JSON.stringify([task, r.subtask ?? null, r.lineage ?? null, r.attempt ?? null])
    const prev = R.judged.get(key)
    if (!prev || (at ?? 0) >= (num(prev.at) ?? 0)) R.judged.set(key, { ...r, task, verdict: fold(r.verdict) })
    R.tasks.add(task)
  }
})

const totals = { tasks: 0, judged: 0, usd: 0, accepted: 0, merged: 0 }
const verdicts = {}
const attempts = {}
const firstAttempt = { consistent: 0, judged: 0 }
const tierRows = {}
const days = {}
const outRepos = {}
for (const [name, R] of Object.entries(repos)) {
  const perTask = new Map()
  const rv = {}
  let usd = 0
  const stamps = []
  for (const r of R.judged.values()) {
    const u = num(r.usd) ?? 0
    usd += u
    const cur = perTask.get(r.task)
    if (!cur) perTask.set(r.task, { max: num(r.attempt) ?? 0, last: r })
    else {
      cur.max = Math.max(cur.max, num(r.attempt) ?? 0)
      if ((num(r.at) ?? 0) >= (num(cur.last.at) ?? 0)) cur.last = r
    }
    if (num(r.attempt) === 1) { firstAttempt.judged++; if (r.verdict === 'consistent') firstAttempt.consistent++ }
    const alias = typeof r.alias === 'string' && r.alias ? r.alias : 'unknown'
    const t = (tierRows[alias] ||= { usd: [], min: [], consistent: 0 })
    t.usd.push(u)
    if (num(r.at) !== null && num(r.verdictAt) !== null && r.verdictAt >= r.at) t.min.push((r.verdictAt - r.at) / 60000)
    if (r.verdict === 'consistent') t.consistent++
    const when = num(r.verdictAt) ?? num(r.at)
    if (when !== null) {
      stamps.push(when)
      const d = (days[day(when)] ||= { judged: 0, refuted: 0, usd: 0 })
      d.judged++
      if (r.verdict === 'refuted') d.refuted++
      d.usd += u
    }
  }
  for (const { max, last } of perTask.values()) {
    bump(verdicts, last.verdict)
    bump(rv, last.verdict)
    bump(attempts, String(max))
  }
  totals.tasks += perTask.size
  totals.judged += R.judged.size
  totals.usd += usd
  totals.accepted += R.accepted.size
  totals.merged += R.merged.size
  outRepos[name] = {
    tasks: perTask.size,
    judged: R.judged.size,
    verdicts: sortKeys(rv),
    usd: round(usd, 2),
    first: stamps.length ? day(Math.min(...stamps)) : null,
    last: stamps.length ? day(Math.max(...stamps)) : null,
  }
}

const tiers = {}
for (const [alias, t] of Object.entries(tierRows)) {
  const m = t.min.sort((a, b) => a - b)
  tiers[alias] = {
    n: t.usd.length,
    meanUsd: round(t.usd.reduce((a, b) => a + b, 0) / t.usd.length, 2),
    medianMin: m.length ? Math.round(nearest(m, 0.5)) : null,
    p90Min: m.length ? Math.round(nearest(m, 0.9)) : null,
    consistent: t.consistent,
  }
}
for (const d of Object.values(days)) d.usd = round(d.usd, 2)

process.stdout.write(JSON.stringify({
  window: allDays.length ? { first: day(Math.min(...allDays)), last: day(Math.max(...allDays)) } : { first: null, last: null },
  totals: { ...totals, usd: Math.round(totals.usd) },
  verdicts: sortKeys(verdicts),
  attempts: sortKeys(attempts),
  firstAttempt,
  tiers: sortKeys(tiers),
  days: sortKeys(days),
  repos: outRepos,
  skippedLines,
}, null, 2) + '\n')
