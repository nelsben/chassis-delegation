#!/usr/bin/env node
// Reads session transcripts (and, optionally, delegation ledgers) and prints one anonymized JSON summary of advisor use:
// by caller, advisor, day, project, rule and cue. With --text it prints the same numbers as plain lines.
// Transcripts are streamed line by line, never read whole. Reads only the files named, writes nothing, needs only Node built-ins.
// Never emits a path, folder name, session id, agent id, task id or free text.
import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs'
import { createInterface } from 'node:readline'
import { basename, dirname, join, sep } from 'node:path'

const USAGE = 'usage: node bin/advisor.mjs [--text] [--since YYYY-MM-DD] [--ledger <ledger.jsonl>]... <file or folder>...\n'
const die = () => { process.stderr.write(USAGE); process.exit(2) }

let text = false
let since = null
const ledgers = []
const inputs = []
{
  const argv = process.argv.slice(2)
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--text') text = true
    else if (a === '--since') {
      const v = argv[++i]
      if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v) || new Date(`${v}T00:00:00Z`).toISOString().slice(0, 10) !== v) die()
      since = v
    } else if (a === '--ledger') {
      const v = argv[++i]
      if (!v) die()
      ledgers.push(v)
    } else if (a.startsWith('--')) die()
    else inputs.push(a)
  }
  if (inputs.length === 0) die()
}
const sinceMs = since === null ? null : Date.parse(`${since}T00:00:00Z`)

// dollars per million tokens, advisor models only; a model id matches when it starts with the key
const PRICES = [
  ['claude-fable-5-2', { in: 8, out: 40, cacheRead: 0.2 }],
  ['claude-fable-5-1', { in: 10, out: 50, cacheRead: 0.25 }],
  ['claude-opus-5-5', { in: 4, out: 20, cacheRead: 0.2 }],
]
const priceOf = model => (typeof model === 'string' ? PRICES.find(([k]) => model.startsWith(k))?.[1] : undefined)
const familyOf = model => {
  const m = typeof model === 'string' ? model.toLowerCase() : ''
  return ['fable', 'opus', 'sonnet', 'haiku'].find(f => m.includes(f)) ?? 'other'
}
const label = i => {
  let s = ''
  for (let n = i; n >= 0; n = Math.floor(n / 26) - 1) s = String.fromCharCode(65 + (n % 26)) + s
  return s
}
const num = v => (typeof v === 'number' && Number.isFinite(v) ? v : 0)
const round2 = v => Math.round(v * 100) / 100
const bump = (o, k, by = 1) => { o[k] = (o[k] || 0) + by }
const cmp = (a, b) => (a < b ? -1 : a > b ? 1 : 0)
const sortDeep = v => (v !== null && typeof v === 'object' && !Array.isArray(v)
  ? Object.fromEntries(Object.entries(v).sort(([a], [b]) => cmp(a, b)).map(([k, x]) => [k, sortDeep(x)]))
  : v)
const isConsistent = v => v === 'consistent' || v === 'verified' // legacy word: read-only normaliser
const isObj = v => v !== null && typeof v === 'object' && !Array.isArray(v)

// every .jsonl under the arguments, in sorted order
const files = []
const walk = p => {
  let st
  try { st = statSync(p) } catch {
    process.stderr.write('error: cannot read an input path\n')
    process.exit(1)
  }
  if (st.isDirectory()) for (const e of readdirSync(p).sort()) walk(join(p, e))
  else if (p.endsWith('.jsonl')) files.push(p)
}
inputs.forEach(walk)
const unique = [...new Set(files)]

// where a file sits: main or subagent, its session id, its project folder
const place = file => {
  const parts = file.split(sep)
  const at = parts.lastIndexOf('subagents')
  if (at >= 2) return { side: 'subagent', session: parts[at - 1], project: parts[at - 2] }
  return { side: 'main', session: basename(file, '.jsonl'), project: basename(dirname(file)) }
}

let skippedLines = 0
let unpriced = 0
let uncounted = 0
const calls = [] // { side, session, project, day, ms, caller, advisor, in, out, usd, self }
const projectNames = new Set()
for (const file of unique) {
  const where = place(file)
  projectNames.add(where.project)
  const seen = new Set()
  const withResult = new Set()
  let counted = 0
  const rl = createInterface({ input: createReadStream(file, { encoding: 'utf8' }), crlfDelay: Infinity })
  for await (const line of rl) {
    const hasCall = line.includes('"advisor_message"')
    const hasResult = line.includes('"advisor_tool_result"')
    if (!hasCall && !hasResult) continue
    let r
    try { r = JSON.parse(line) } catch { skippedLines++; continue }
    const m = isObj(r) && isObj(r.message) ? r.message : null
    if (!m) continue
    const id = typeof m.id === 'string' ? m.id : null
    if (hasResult && id !== null && Array.isArray(m.content) && m.content.some(b => isObj(b) && b.type === 'advisor_tool_result')) withResult.add(id)
    if (!hasCall) continue
    if (id !== null) {
      if (seen.has(id)) continue
      seen.add(id)
    }
    const iters = isObj(m.usage) && Array.isArray(m.usage.iterations) ? m.usage.iterations.filter(it => isObj(it) && it.type === 'advisor_message') : []
    const ms = Date.parse(r.timestamp)
    for (const it of iters) {
      counted++
      if (Number.isNaN(ms)) { skippedLines++; continue }
      const day = new Date(ms).toISOString().slice(0, 10)
      if (since !== null && day < since) continue
      const tokIn = num(it.input_tokens) + num(it.cache_read_input_tokens) + num(it.cache_creation_input_tokens)
      const p = priceOf(it.model)
      let usd = 0
      if (p) usd = ((num(it.input_tokens) + num(it.cache_creation_input_tokens)) * p.in + num(it.cache_read_input_tokens) * p.cacheRead + num(it.output_tokens) * p.out) / 1e6
      else unpriced++
      const caller = familyOf(m.model)
      const advisor = familyOf(it.model)
      calls.push({ ...where, day, ms, caller, advisor, in: tokIn, out: num(it.output_tokens), usd, self: caller === advisor })
    }
  }
  uncounted += Math.max(0, withResult.size - counted)
}

const group = key => {
  const g = {}
  for (const c of calls) {
    const k = typeof key === 'function' ? key(c) : c[key]
    const e = (g[k] ??= { calls: 0, usd: 0 })
    e.calls++
    e.usd += c.usd
  }
  return Object.fromEntries(Object.entries(g).map(([k, e]) => [k, { calls: e.calls, usd: round2(e.usd) }]))
}
const letters = new Map([...projectNames].sort().map((n, i) => [n, label(i)]))
const days = calls.map(c => c.day).sort()
const out = {
  window: days.length ? { first: days[0], last: days[days.length - 1] } : null,
  files: unique.length,
  sessions: new Set(calls.map(c => c.session)).size,
  skippedLines,
  unpriced,
  uncounted,
  totals: {
    calls: calls.length,
    usd: round2(calls.reduce((s, c) => s + c.usd, 0)),
    in: calls.reduce((s, c) => s + c.in, 0),
    out: calls.reduce((s, c) => s + c.out, 0),
    self: calls.filter(c => c.self).length,
  },
  sides: group('side'),
  callers: group('caller'),
  advisors: group('advisor'),
  days: group('day'),
  projects: group(c => letters.get(c.project)),
}

if (ledgers.length) {
  const carded = { calls: 0, usd: 0 }
  const rules = {}
  const cues = {}
  const mainCalls = new Map() // session -> [{ ms, taken }]
  for (const c of calls) {
    if (c.side !== 'main') continue
    if (!mainCalls.has(c.session)) mainCalls.set(c.session, [])
    mainCalls.get(c.session).push({ ms: c.ms, taken: false })
  }
  for (const list of mainCalls.values()) list.sort((a, b) => a.ms - b.ms)
  for (const file of ledgers) {
    let raw
    try { raw = readFileSync(file, 'utf8') } catch {
      process.stderr.write('error: cannot read a ledger\n')
      process.exit(1)
    }
    const rows = []
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue
      let r
      try { r = JSON.parse(line) } catch { skippedLines++; continue }
      if (!isObj(r)) { skippedLines++; continue }
      if (sinceMs !== null && typeof r.at === 'number' && r.at < sinceMs) continue
      rows.push(r)
    }
    const raised = []
    rows.forEach((r, i) => {
      if (isObj(r.advisor)) { carded.calls += num(r.advisor.calls); carded.usd += num(r.advisor.usd) }
      if (typeof r.advisorRule === 'string' && typeof r.verdict === 'string' && r.advisorRuleSource !== 'card') {
        const tier = typeof r.tier === 'string' ? r.tier : 'unknown'
        const e = ((rules[tier] ??= {})[r.advisorRule] ??= { attempts: 0, consistent: 0, usd: 0, calls: 0, over: 0, changed: 0, noChange: 0 })
        e.attempts++
        if (isConsistent(r.verdict)) e.consistent++
        e.usd += num(r.usd)
        if (isObj(r.advisor)) e.calls += num(r.advisor.calls)
        if (r.advisorOver !== undefined && r.advisorOver !== null) e.over++
        if (r.advisorSaid === 'changed') e.changed++
        if (r.advisorSaid === 'no-change') e.noChange++
      }
      if (r.kind === 'advisor-cue') raised.push({ r, i })
    })
    // the earliest cue claims the earliest unclaimed call of its session within 15 minutes after it
    raised.sort((a, b) => (typeof a.r.at === 'number' ? a.r.at : Infinity) - (typeof b.r.at === 'number' ? b.r.at : Infinity) || a.i - b.i)
    for (const { r, i } of raised) {
      const name = typeof r.cue === 'string' ? r.cue : 'unknown'
      const e = (cues[name] ??= { raised: 0, followed: 0, mergedFollowed: 0, mergedNot: 0 })
      e.raised++
      const list = typeof r.sessionId === 'string' && typeof r.at === 'number' ? mainCalls.get(r.sessionId) : undefined
      const hit = list?.find(c => !c.taken && c.ms >= r.at && c.ms <= r.at + 15 * 60 * 1000)
      if (hit) { hit.taken = true; e.followed++ }
      const merged = rows.some((x, j) => j > i && x.task === r.task && x.kind === 'accept' && x.how === 'merged')
      if (merged) e[hit ? 'mergedFollowed' : 'mergedNot']++
    }
  }
  out.carded = { calls: carded.calls, usd: round2(carded.usd) }
  out.rules = Object.fromEntries(Object.entries(rules).map(([t, byRule]) => [t, Object.fromEntries(Object.entries(byRule).map(([k, e]) => [k, { ...e, usd: round2(e.usd) }]))]))
  out.cues = cues
  out.skippedLines = skippedLines
}

const sorted = sortDeep(out)
if (!text) {
  process.stdout.write(`${JSON.stringify(sorted, null, 2)}\n`)
} else {
  const t = sorted.totals
  const lines = [
    `calls ${t.calls} usd ${t.usd} in ${t.in} out ${t.out} self ${t.self} files ${sorted.files} sessions ${sorted.sessions} unpriced ${sorted.unpriced} uncounted ${sorted.uncounted} skipped ${sorted.skippedLines} window ${sorted.window ? `${sorted.window.first}..${sorted.window.last}` : 'none'}${sorted.carded ? ` carded calls ${sorted.carded.calls} usd ${sorted.carded.usd}` : ''}`,
  ]
  const flat = o => Object.entries(o).map(([k, v]) => `${k} ${v}`).join(' ')
  for (const key of ['sides', 'callers', 'days']) for (const [k, v] of Object.entries(sorted[key])) lines.push(`${key} ${k} ${flat(v)}`)
  for (const [tier, byRule] of Object.entries(sorted.rules ?? {})) for (const [rule, v] of Object.entries(byRule)) lines.push(`rules ${tier} ${rule} ${flat(v)}`)
  for (const [cue, v] of Object.entries(sorted.cues ?? {})) lines.push(`cues ${cue} ${flat(v)}`)
  process.stdout.write(`${lines.join('\n')}\n`)
}
