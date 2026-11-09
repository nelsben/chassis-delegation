#!/usr/bin/env node
// Turns delegation ledgers into one anonymized JSON summary of outcomes, cost and time.
// With --scorecard it prints the weekly and per-model scorecard as plain text instead.
// Reads only the files named, writes nothing, needs only Node built-ins.
// Never emits a path, task id, sha, session id, agent id, brief path or free text.
import { readFileSync } from 'node:fs'

const argv = process.argv.slice(2)
const scorecardMode = argv.includes('--scorecard')
const files = argv.filter(a => a !== '--scorecard')
if (files.length === 0 || argv.some(a => a.startsWith('--') && a !== '--scorecard')) {
  process.stderr.write('usage: node bin/evidence.mjs [--scorecard] <ledger.jsonl> [<ledger.jsonl>...]\n')
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
const when = r => num(r.verdictAt) ?? num(r.at) // a row's time for the scorecard; null leaves it out
const order = r => num(r.at) ?? when(r) // the order "earliest" and "newest" use
const aliasOf = r => (typeof r.alias === 'string' && r.alias ? r.alias : 'unknown')
// ISO week of a time, in UTC: the year and week of that day's Thursday, e.g. 2026-W45
const weekOf = ms => {
  const d = new Date(ms)
  const thu = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7)))
  const year = thu.getUTCFullYear()
  const ordinal = Math.round((thu - Date.UTC(year, 0, 1)) / 864e5) + 1
  return `${year}-W${String(Math.ceil(ordinal / 7)).padStart(2, '0')}`
}

let skippedLines = 0
const repos = {}
const allDays = []
files.forEach((file, i) => {
  let text
  try { text = readFileSync(file, 'utf8') } catch {
    process.stderr.write(`error: cannot read ledger at argument ${i + 1}\n`)
    process.exit(1)
  }
  const R = (repos[label(i)] = { judged: new Map(), tasks: new Set(), accepted: new Set(), merged: new Set(), mergedRows: [], spawns: [], brain: [], judgedRows: [] })
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { skippedLines++; continue }
    if (r === null || typeof r !== 'object' || Array.isArray(r)) { skippedLines++; continue }
    const task = String(r.task ?? '')
    const at = num(r.at)
    if (at !== null) allDays.push(at)
    if (r.brain !== null && typeof r.brain === 'object' && num(r.brain.since) !== null) R.brain.push({ row: r, since: num(r.brain.since), usd: num(r.brain.usd) })
    if (r.kind === 'accept') { R.accepted.add(task); continue }
    if (r.kind === 'merged') { R.merged.add(task); R.mergedRows.push({ ...r, task }); continue }
    if (r.event === 'spawn') { R.spawns.push({ ...r, task }); continue }
    if (r.event !== undefined || r.kind === 'review' || typeof r.verdict !== 'string') continue
    R.judgedRows.push({ ...r, task, verdict: fold(r.verdict) })
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

// The scorecard: per ISO week (UTC) and per model alias. A card is one [repo, task, subtask, lineage].
const scorecardOf = repoMap => {
  const weeks = new Map()
  const models = new Map()
  const W = w => {
    if (!weeks.has(w)) weeks.set(w, { cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, usd: 0, choicesStated: 0, choicesSum: 0, linkedKnown: 0, linked: 0, fixCards: 0, fixIds: new Set(), merged: new Set(), brainUsd: 0, brainPlaced: 0 })
    return weeks.get(w)
  }
  const M = a => {
    if (!models.has(a)) models.set(a, { cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, usd: 0, choicesStated: 0, choicesSum: 0 })
    return models.get(a)
  }
  const cardKey = (name, r) => JSON.stringify([name, String(r.task ?? ''), r.subtask ?? null, r.lineage ?? null])
  for (const [name, R] of Object.entries(repoMap)) {
    const cards = new Map()
    // the attempt-1 rows of each card: the earliest, and whether any attempt above 1 is judged
    for (const r of R.judgedRows) {
      if (when(r) === null) continue
      const k = cardKey(name, r)
      const c = cards.get(k) ?? { first: null, newest: null, rework: false }
      cards.set(k, c)
      const n = num(r.attempt)
      if (n === 1) { if (!c.first || order(r) < order(c.first)) c.first = r }
      else if (n > 1) c.rework = true
    }
    // the folded rows (a re-verify replaces its earlier row): dollars, choices, and the newest attempt 1
    for (const r of R.judged.values()) {
      if (when(r) === null) continue
      const wk = W(weekOf(when(r)))
      const m = M(aliasOf(r))
      const u = num(r.usd) ?? 0
      wk.usd += u
      m.usd += u
      if (num(r.choices) !== null) { wk.choicesStated++; wk.choicesSum += r.choices; m.choicesStated++; m.choicesSum += r.choices }
      if (num(r.attempt) === 1) { const c = cards.get(cardKey(name, r)); if (c) c.newest = r }
    }
    for (const c of cards.values()) {
      if (!c.first) continue
      const wk = W(weekOf(when(c.first)))
      const m = M(aliasOf(c.first))
      const firstTry = c.newest !== null && c.newest.verdict === 'consistent' && !c.rework
      const strict = c.first.verdict === 'consistent' && !c.rework
      wk.cards++; m.cards++
      if (firstTry) { wk.firstTry++; m.firstTry++ }
      if (strict) { wk.firstTryStrict++; m.firstTryStrict++ }
      if (c.rework) { wk.rework++; m.rework++ }
    }
    // the spawn rows: the earliest attempt-1 row per card that states linked, and per card that names fixes
    const linkedFirst = new Map()
    const fixFirst = new Map()
    for (const r of R.spawns) {
      if (num(r.attempt) !== 1 || when(r) === null) continue
      const k = cardKey(name, r)
      if (typeof r.linked === 'boolean' && (!linkedFirst.has(k) || order(r) < order(linkedFirst.get(k)))) linkedFirst.set(k, r)
      if (Array.isArray(r.fixes) && r.fixes.length > 0 && (!fixFirst.has(k) || order(r) < order(fixFirst.get(k)))) fixFirst.set(k, r)
    }
    for (const r of linkedFirst.values()) {
      const wk = W(weekOf(when(r)))
      wk.linkedKnown++
      if (r.linked === true) wk.linked++
    }
    for (const r of fixFirst.values()) {
      const wk = W(weekOf(when(r)))
      wk.fixCards++
      for (const id of r.fixes) wk.fixIds.add(JSON.stringify([name, String(id)]))
    }
    for (const r of R.mergedRows) {
      if (when(r) === null) continue
      W(weekOf(when(r))).merged.add(JSON.stringify([name, r.task]))
    }
    // the brain's spend: per [repo, since] the largest usd on any row, placed in the week of the newest row with that since
    const brainKeys = new Map()
    for (const b of R.brain) {
      if (when(b.row) === null) continue
      const k = JSON.stringify([name, b.since])
      const e = brainKeys.get(k) ?? { usd: null, newest: null }
      if (b.usd !== null && (e.usd === null || b.usd > e.usd)) e.usd = b.usd
      if (!e.newest || order(b.row) >= order(e.newest)) e.newest = b.row
      brainKeys.set(k, e)
    }
    for (const e of brainKeys.values()) {
      if (e.usd === null) continue
      const wk = W(weekOf(when(e.newest)))
      wk.brainUsd += e.usd
      wk.brainPlaced++
    }
  }

  const weekOut = {}
  for (const [w, e] of weeks) {
    const brainUsd = e.brainPlaced ? round(e.brainUsd, 2) : null
    weekOut[w] = {
      cards: e.cards,
      firstTry: e.firstTry,
      firstTryStrict: e.firstTryStrict,
      rework: e.rework,
      usd: round(e.usd, 2),
      choicesStated: e.choicesStated,
      choicesMean: e.choicesStated ? round(e.choicesSum / e.choicesStated, 2) : null,
      linkedKnown: e.linkedKnown,
      linked: e.linked,
      fixCards: e.fixCards,
      escaped: e.fixIds.size,
      merged: e.merged.size,
      brainUsd,
      brainShare: brainUsd !== null && brainUsd + e.usd > 0 ? round(brainUsd / (brainUsd + e.usd), 2) : null,
    }
  }
  const modelOut = {}
  for (const [a, e] of models) {
    modelOut[a] = {
      cards: e.cards,
      firstTry: e.firstTry,
      firstTryStrict: e.firstTryStrict,
      rework: e.rework,
      usd: round(e.usd, 2),
      choicesStated: e.choicesStated,
      choicesMean: e.choicesStated ? round(e.choicesSum / e.choicesStated, 2) : null,
    }
  }
  return { weeks: sortKeys(weekOut), models: sortKeys(modelOut) }
}

// The text form: one line per week oldest first, then one per model; right-aligned columns.
const scorecardText = ({ weeks, models }) => {
  const pct = (n, d) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '-')
  const head = ['week', 'cards', '1st try', 'strict', 'rework', 'choices', 'linked', 'escaped', 'brain', 'usd']
  const cells = (name, e) => [
    name,
    String(e.cards),
    `${e.firstTry}/${e.cards} ${pct(e.firstTry, e.cards)}`,
    pct(e.firstTryStrict, e.cards),
    String(e.rework),
    e.choicesMean === null || e.choicesMean === undefined ? '-' : e.choicesMean.toFixed(2),
    e.linkedKnown ? `${e.linked}/${e.linkedKnown}` : '-',
    e.escaped === undefined ? '-' : String(e.escaped),
    e.brainShare === null || e.brainShare === undefined ? '-' : `${Math.round(e.brainShare * 100)}%`,
    e.usd.toFixed(2),
  ]
  const weekRows = Object.entries(weeks).map(([w, e]) => cells(w, e))
  const modelRows = Object.entries(models).map(([a, e]) => cells(a, e))
  const all = [head, ...weekRows, ...modelRows]
  const widths = head.map((_, i) => Math.max(...all.map(row => row[i].length)))
  const line = row => row.map((c, i) => c.padStart(widths[i])).join('  ')
  const lines = ['scorecard, ISO weeks in UTC', line(head), ...weekRows.map(line)]
  if (modelRows.length) lines.push('', ...modelRows.map(line))
  return lines.join('\n') + '\n'
}

const scorecard = scorecardOf(repos)
if (scorecardMode) {
  process.stdout.write(totals.judged === 0 ? 'no judged attempts\n' : scorecardText(scorecard))
} else {
  process.stdout.write(JSON.stringify({
    window: allDays.length ? { first: day(Math.min(...allDays)), last: day(Math.max(...allDays)) } : { first: null, last: null },
    totals: { ...totals, usd: Math.round(totals.usd) },
    verdicts: sortKeys(verdicts),
    attempts: sortKeys(attempts),
    firstAttempt,
    tiers: sortKeys(tiers),
    days: sortKeys(days),
    repos: outRepos,
    scorecard,
    skippedLines,
  }, null, 2) + '\n')
}
