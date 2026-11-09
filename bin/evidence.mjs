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
  const R = (repos[label(i)] = { judged: new Map(), tasks: new Set(), accepted: new Set(), merged: new Set(), mergedRows: [], spawns: [], brain: [], judgedRows: [], amends: [] })
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    let r
    try { r = JSON.parse(line) } catch { skippedLines++; continue }
    if (r === null || typeof r !== 'object' || Array.isArray(r)) { skippedLines++; continue }
    const task = String(r.task ?? '')
    const at = num(r.at)
    if (at !== null) allDays.push(at)
    if (r.brain !== null && typeof r.brain === 'object' && num(r.brain.since) !== null) R.brain.push({ row: r, since: num(r.brain.since), usd: num(r.brain.usd), turns: num(r.brain.turns) })
    if (r.kind === 'amend') { if (r.source !== 'worker') R.amends.push({ task, subtask: r.subtask ?? 'main' }); continue }
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

// The scorecard: per ISO week (UTC), per model alias, per brain pair and per context bucket. A card is one [repo, task, subtask, lineage].
const scorecardOf = repoMap => {
  const weeks = new Map()
  const models = new Map()
  const W = w => {
    if (!weeks.has(w)) weeks.set(w, { cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, usd: 0, choicesStated: 0, choicesSum: 0, linkedKnown: 0, linked: 0, fixCards: 0, fixIds: new Set(), repaired: 0, merged: new Set(), brainUsd: 0, brainPlaced: 0 })
    return weeks.get(w)
  }
  const M = a => {
    if (!models.has(a)) models.set(a, { cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, usd: 0, choicesStated: 0, choicesSum: 0, repaired: 0 })
    return models.get(a)
  }
  // per pair: what was spent on it (the intervals) and the cards run mainly on it (the tasks whose setup it is)
  const pairs = new Map()
  const P = s => {
    if (!pairs.has(s)) pairs.set(s, { eligible: false, sessions: new Set(), usd: 0, turns: 0, steps: 0, ctx: 0, compactions: 0, cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, repaired: 0, choicesStated: 0, choicesSum: 0, grants: 0, workerUsd: 0, tasks: new Map() })
    return pairs.get(s)
  }
  const buckets = new Map()
  const B = lo => {
    if (!buckets.has(lo)) buckets.set(lo, { cards: 0, firstTry: 0, firstTryStrict: 0, rework: 0, repaired: 0, tasks: new Map() })
    return buckets.get(lo)
  }
  const cardKey = (name, r) => JSON.stringify([name, String(r.task ?? ''), r.subtask ?? null, r.lineage ?? null])
  const diff = (a, b) => Math.max(0, (num(a) ?? 0) - (num(b) ?? 0))
  const live = s => s.usd > 0 || s.steps > 0
  // the pair with the most dollars; ties: more steps, then the name that sorts first; none when no pair has dollars or steps
  const top = m => {
    let best = null
    for (const [n, v] of m) {
      if (!live(v)) continue
      if (!best || v.usd > best.v.usd || (v.usd === best.v.usd && (v.steps > best.v.steps || (v.steps === best.v.steps && n < best.n)))) best = { n, v }
    }
    return best ? best.n : null
  }
  for (const [name, R] of Object.entries(repoMap)) {
    const cards = new Map()
    // the attempt-1 rows of each card: the earliest, and whether any attempt above 1 is judged
    for (const r of R.judgedRows) {
      if (when(r) === null) continue
      const k = cardKey(name, r)
      const c = cards.get(k) ?? { first: null, newest: null, rework: false, repaired: false, task: String(r.task ?? ''), subtask: r.subtask ?? null, lineage: num(r.lineage) ?? 0 }
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
    const fixed = new Set()
    for (const r of fixFirst.values()) {
      const wk = W(weekOf(when(r)))
      wk.fixCards++
      for (const id of r.fixes) { wk.fixIds.add(JSON.stringify([name, String(id)])); fixed.add(String(id)) }
    }
    // a repaired card: a card named in fixes, the one(s) of the largest lineage among the cards of that task
    for (const id of fixed) {
      let max = -1
      for (const c of cards.values()) if (c.first && c.task === id) max = Math.max(max, c.lineage)
      for (const c of cards.values()) if (c.first && c.task === id && c.lineage === max) c.repaired = true
    }
    for (const r of R.mergedRows) {
      if (when(r) === null) continue
      W(weekOf(when(r))).merged.add(JSON.stringify([name, r.task]))
    }
    // the brain's stamped rows, per session [repo, since], in order
    const sessions = new Map()
    for (const b of R.brain.filter(x => when(x.row) !== null).sort((x, y) => order(x.row) - order(y.row))) {
      if (!sessions.has(b.since)) sessions.set(b.since, [])
      sessions.get(b.since).push(b.row)
    }
    const tasks = new Map() // task id -> { pairs: Map(pair -> { usd, steps }), usd, steps, ctx }
    for (const [since, rows] of sessions) {
      const sessionKey = JSON.stringify([name, since])
      let prevUsd = 0
      let base = null
      rows.forEach((row, i) => {
        const bs = row.brain
        // the brain's dollars between this stamp and the last one that had dollars, in the week of this row
        if (num(bs.usd) !== null) {
          const wk = W(weekOf(when(row)))
          wk.brainUsd += diff(bs.usd, prevUsd)
          wk.brainPlaced++
          prevUsd = bs.usd
        }
        if (bs.pairs === null || typeof bs.pairs !== 'object' || Array.isArray(bs.pairs)) return
        if (base || i === 0) {
          const before = base ? base.pairs : {}
          const iv = new Map()
          for (const [pn, v] of Object.entries(bs.pairs)) {
            if (v === null || typeof v !== 'object') continue
            const o = before[pn] !== null && typeof before[pn] === 'object' ? before[pn] : {}
            iv.set(pn, { usd: diff(v.usd, o.usd), turns: diff(v.turns, o.turns), steps: diff(v.steps, o.steps), ctx: diff(v.ctx, o.ctx) })
          }
          const compactions = diff(bs.compactions, base ? base.compactions : 0)
          const topPair = top(iv)
          if (topPair !== null) P(topPair).compactions += compactions
          const task = String(row.task ?? '')
          const t = task ? (tasks.get(task) ?? { pairs: new Map(), usd: 0, steps: 0, ctx: 0 }) : null
          if (t) tasks.set(task, t)
          for (const [pn, v] of iv) {
            const g = P(pn)
            g.usd += v.usd; g.turns += v.turns; g.steps += v.steps; g.ctx += v.ctx
            if (live(v)) { g.eligible = true; g.sessions.add(sessionKey) }
            if (t) {
              const tp = t.pairs.get(pn) ?? { usd: 0, steps: 0 }
              tp.usd += v.usd; tp.steps += v.steps
              t.pairs.set(pn, tp)
              t.usd += v.usd; t.steps += v.steps; t.ctx += v.ctx
            }
          }
        }
        base = { pairs: bs.pairs, compactions: num(bs.compactions) ?? 0 }
      })
    }
    const setupOf = new Map()
    for (const [id, t] of tasks) setupOf.set(id, { setup: top(t.pairs), context: t.steps > 0 ? t.ctx / t.steps : null, t })
    // cards: tallied per week and model, and, by their task, per pair and per context bucket
    const cardSetup = new Map()
    for (const [k, c] of cards) {
      if (!c.first) continue
      const wk = W(weekOf(when(c.first)))
      const m = M(aliasOf(c.first))
      const firstTry = c.newest !== null && c.newest.verdict === 'consistent' && !c.rework
      const strict = c.first.verdict === 'consistent' && !c.rework
      const tally = e => {
        e.cards++
        if (firstTry) e.firstTry++
        if (strict) e.firstTryStrict++
        if (c.rework) e.rework++
        if (c.repaired) e.repaired++
      }
      tally(wk); tally(m)
      const s = setupOf.get(c.task)
      if (!s) continue
      if (s.setup !== null) {
        const g = P(s.setup)
        tally(g)
        g.tasks.set(JSON.stringify([name, c.task]), s.t)
        cardSetup.set(k, s.setup)
      }
      if (s.context !== null) {
        const b = B(Math.floor(s.context / 50000) * 50)
        tally(b)
        b.tasks.set(JSON.stringify([name, c.task]), s.t)
      }
    }
    for (const r of R.judged.values()) {
      if (when(r) === null) continue
      const setup = cardSetup.get(cardKey(name, r))
      if (!setup) continue
      const g = P(setup)
      g.workerUsd += num(r.usd) ?? 0
      if (num(r.choices) !== null) { g.choicesStated++; g.choicesSum += r.choices }
    }
    // a grant belongs to the setup of its task
    for (const a of R.amends) {
      const s = setupOf.get(a.task)
      if (s && s.setup !== null) P(s.setup).grants++
    }
  }

  const perCard = (e, cards) => {
    const ts = [...e.tasks.values()]
    const usd = ts.reduce((n, t) => n + t.usd, 0)
    const steps = ts.reduce((n, t) => n + t.steps, 0)
    const sorted = ts.map(t => t.usd).sort((a, b) => a - b)
    return { usd, brainUsdPerCard: cards ? round(usd / cards, 2) : null, brainUsdMedian: sorted.length ? round(nearest(sorted, 0.5), 2) : null, stepsPerCard: cards ? round(steps / cards, 1) : null }
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
      repaired: e.repaired,
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
      repaired: e.repaired,
    }
  }
  const brainOut = {}
  for (const [pair, e] of pairs) {
    if (!e.eligible) continue
    const pc = perCard(e, e.cards)
    brainOut[pair] = {
      sessions: e.sessions.size,
      brainUsd: round(e.usd, 2),
      turns: e.turns,
      steps: e.steps,
      usdPerStep: e.steps ? round(e.usd / e.steps, 4) : null,
      ctxPerStep: e.steps ? Math.round(e.ctx / e.steps) : null,
      compactions: e.compactions,
      cards: e.cards,
      firstTry: e.firstTry,
      firstTryStrict: e.firstTryStrict,
      rework: e.rework,
      choicesMean: e.choicesStated ? round(e.choicesSum / e.choicesStated, 2) : null,
      grants: e.grants,
      workerUsd: round(e.workerUsd, 2),
      repaired: e.repaired,
      brainUsdPerCard: pc.brainUsdPerCard,
      brainUsdMedian: pc.brainUsdMedian,
      stepsPerCard: pc.stepsPerCard,
      brainShare: pc.usd + e.workerUsd > 0 ? round(pc.usd / (pc.usd + e.workerUsd), 2) : null,
    }
  }
  const contextOut = {}
  for (const lo of [...buckets.keys()].sort((a, b) => a - b)) {
    const e = buckets.get(lo)
    const pc = perCard(e, e.cards)
    contextOut[`${lo}-${lo + 50}k`] = { cards: e.cards, firstTry: e.firstTry, firstTryStrict: e.firstTryStrict, rework: e.rework, repaired: e.repaired, brainUsdPerCard: pc.brainUsdPerCard, stepsPerCard: pc.stepsPerCard }
  }
  return { weeks: sortKeys(weekOut), models: sortKeys(modelOut), brains: sortKeys(brainOut), contexts: contextOut }
}

// The text form: one line per week oldest first, then one per model; right-aligned columns.
const scorecardText = ({ weeks, models, brains, contexts }) => {
  const pct = (n, d) => (d > 0 ? `${Math.round((100 * n) / d)}%` : '-')
  const dash = (v, f) => (v === null || v === undefined ? '-' : f(v))
  const head = ['week', 'cards', '1st try', 'strict', 'rework', 'choices', 'linked', 'escaped', 'repaired', 'brain', 'usd']
  const cells = (name, e) => [
    name,
    String(e.cards),
    `${e.firstTry}/${e.cards} ${pct(e.firstTry, e.cards)}`,
    pct(e.firstTryStrict, e.cards),
    String(e.rework),
    e.choicesMean === null || e.choicesMean === undefined ? '-' : e.choicesMean.toFixed(2),
    e.linkedKnown ? `${e.linked}/${e.linkedKnown}` : '-',
    e.escaped === undefined ? '-' : String(e.escaped),
    String(e.repaired ?? 0),
    e.brainShare === null || e.brainShare === undefined ? '-' : `${Math.round(e.brainShare * 100)}%`,
    e.usd.toFixed(2),
  ]
  const weekRows = Object.entries(weeks).map(([w, e]) => cells(w, e))
  const modelRows = Object.entries(models).map(([a, e]) => cells(a, e))
  const all = [head, ...weekRows, ...modelRows]
  const widths = head.map((_, i) => Math.max(...all.map(row => row[i].length)))
  const line = row => row.map((c, i) => c.padStart(widths[i])).join('  ')
  // a block whose first column is its key, left-aligned
  const block = (bhead, brows) => {
    const bw = bhead.map((_, i) => Math.max(...[bhead, ...brows].map(row => row[i].length)))
    const bline = row => row.map((c, i) => (i === 0 ? c.padEnd(bw[i]) : c.padStart(bw[i]))).join('  ')
    return [bline(bhead), ...brows.map(bline)]
  }
  const rate = e => (e.cards ? `${e.firstTry}/${e.cards} ${pct(e.firstTry, e.cards)}` : '-')
  const lines = ['scorecard, ISO weeks in UTC', line(head), ...weekRows.map(line)]
  if (modelRows.length) lines.push('', ...modelRows.map(line))
  const setups = Object.entries(brains ?? {}).sort(([a, x], [b, y]) => y.cards - x.cards || (a < b ? -1 : a > b ? 1 : 0))
  if (setups.length) {
    const bhead = ['brain', 'sessions', 'cards', '1st try', 'strict', 'rework', 'repaired', 'choices', 'grants', 'compactions', 'reqs', 'ctx/req', '$/req', 'brain $/card', 'median', 'reqs/card', 'brain', 'brain $']
    const brows = setups.map(([name, e]) => [
      name,
      String(e.sessions),
      String(e.cards),
      rate(e),
      pct(e.firstTryStrict, e.cards),
      String(e.rework),
      String(e.repaired),
      dash(e.choicesMean, v => v.toFixed(2)),
      String(e.grants),
      String(e.compactions),
      String(e.steps),
      dash(e.ctxPerStep, v => `${Math.round(v / 1000)}k`),
      dash(e.usdPerStep, v => v.toFixed(2)),
      dash(e.brainUsdPerCard, v => v.toFixed(2)),
      dash(e.brainUsdMedian, v => v.toFixed(2)),
      dash(e.stepsPerCard, v => v.toFixed(1)),
      dash(e.brainShare, v => `${Math.round(v * 100)}%`),
      e.brainUsd.toFixed(2),
    ])
    lines.push('', ...block(bhead, brows))
  }
  const buckets = Object.entries(contexts ?? {})
  if (buckets.length) {
    const chead = ['context', 'cards', '1st try', 'strict', 'rework', 'repaired', 'brain $/card', 'reqs/card']
    const crows = buckets.map(([name, e]) => [name, String(e.cards), rate(e), pct(e.firstTryStrict, e.cards), String(e.rework), String(e.repaired), dash(e.brainUsdPerCard, v => v.toFixed(2)), dash(e.stepsPerCard, v => v.toFixed(1))])
    lines.push('', ...block(chead, crows))
  }
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
