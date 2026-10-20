#!/usr/bin/env node
// Draws the evidence charts from one anonymized summary (the output of bin/evidence.mjs).
// usage: node bin/evidence-charts.mjs <summary.json> <outdir>
// Node built-ins only. Writes six SVG files; every one has a title, a desc, a visible value on every bar,
// a dark-mode style block and a transparent background. Never writes a path, a task id or free text.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join } from 'node:path'

const [summaryPath, outDir] = process.argv.slice(2)
if (!summaryPath || !outDir) {
  process.stderr.write('usage: node bin/evidence-charts.mjs <summary.json> <outdir>\n')
  process.exit(2)
}
let S
try {
  S = JSON.parse(readFileSync(summaryPath, 'utf8'))
  for (const k of ['totals', 'verdicts', 'attempts', 'tiers', 'days', 'repos']) {
    if (S[k] === null || typeof S[k] !== 'object') throw new Error(`missing "${k}"`)
  }
} catch (err) {
  process.stderr.write(`error: cannot use the summary: ${err.message}\n`)
  process.exit(1)
}

// The hand-vs-mod eval of 3 Oct 2026 (the same three cards built twice); matches the table in docs/evidence.md.
const HAND_VS_MOD = {
  cards: ['Card 1', 'Card 2', 'Card 3'],
  hand: [7.19, 10.79, 7.78],
  mod: [0.91, 1.75, 1.27],
}
const CEILING = { day: '2026-10-08', label: 'spend ceiling, 0.5.0' }

const W = 720
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
const usd = v => `$${v.toFixed(2)}`
const pct = (n, d) => (d ? `${Math.round((100 * n) / d)}%` : '0%')
const sum = o => Object.values(o).reduce((a, b) => a + b, 0)

const STYLE = `<style>
    text { font-family: system-ui, -apple-system, "Segoe UI", sans-serif; font-size: 13px; fill: #1f2328; }
    .h { font-size: 14px; font-weight: 600; }
    .m { fill: #59636e; }
    .ax { stroke: #59636e; stroke-width: 1; fill: none; }
    .mk { stroke: #59636e; stroke-width: 1.5; stroke-dasharray: 5 4; }
    .b0 { fill: #0969da; } .b1 { fill: #bf8700; } .b2 { fill: #cf222e; } .b3 { fill: #6e7781; } .b4 { fill: #8250df; }
    .b0, .b1, .b2, .b3, .b4 { stroke: #1f2328; stroke-width: 1; }
    @media (prefers-color-scheme: dark) {
      text { fill: #e6edf3; }
      .m { fill: #9198a1; }
      .ax, .mk { stroke: #9198a1; }
      .b0 { fill: #58a6ff; } .b1 { fill: #d29922; } .b2 { fill: #ff7b72; } .b3 { fill: #9198a1; } .b4 { fill: #bc8cff; }
      .b0, .b1, .b2, .b3, .b4 { stroke: #e6edf3; }
    }
  </style>`

function svg({ title, desc, height, body }) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${height}" viewBox="0 0 ${W} ${height}" role="img">
  <title>${esc(title)}</title>
  <desc>${esc(desc)}</desc>
  ${STYLE}
${body.join('\n')}
</svg>
`
}
const text = (x, y, s, cls = '', anchor = 'start') =>
  `  <text x="${x}" y="${y}"${cls ? ` class="${cls}"` : ''}${anchor === 'start' ? '' : ` text-anchor="${anchor}"`}>${esc(s)}</text>`
const rect = (x, y, w, h, cls) => `  <rect x="${x}" y="${y}" width="${Math.max(w, 1).toFixed(1)}" height="${h}" class="${cls}"/>`

// Horizontal bars: rows of {label, value, text, cls}. Returns {lines, height}.
function hbars(rows, { top, labelW = 130, max, rowH = 30, barH = 20, right = 150 }) {
  const m = max ?? Math.max(...rows.map(r => r.value), 1)
  const x0 = 10 + labelW
  const span = W - x0 - right
  const lines = []
  rows.forEach((r, i) => {
    const y = top + i * rowH
    lines.push(text(10 + labelW - 8, y + barH - 6, r.label, '', 'end'))
    const w = (r.value / m) * span
    lines.push(rect(x0, y, w, barH, r.cls ?? 'b0'))
    lines.push(text(x0 + w + 6, y + barH - 6, r.text))
  })
  lines.push(`  <line x1="${x0}" y1="${top - 4}" x2="${x0}" y2="${top + rows.length * rowH - (rowH - barH) + 4}" class="ax"/>`)
  return { lines, height: top + rows.length * rowH }
}

const VERDICTS = [
  ['consistent', 'consistent', 'b0'],
  ['unverified', 'unverified', 'b1'],
  ['refuted', 'refuted', 'b2'],
  ['no-report', 'no report', 'b3'],
  ['refused', 'refused', 'b4'],
]

const files = {}

// 1. outcomes
{
  const total = sum(S.verdicts)
  const rows = VERDICTS.filter(([k]) => S.verdicts[k] !== undefined).map(([k, label, cls]) => ({
    label, value: S.verdicts[k], cls, text: `${S.verdicts[k]} (${pct(S.verdicts[k], total)})`,
  }))
  const c = S.verdicts.consistent || 0
  const { lines, height } = hbars(rows, { top: 50 })
  files['outcomes.svg'] = svg({
    title: 'Final verdict per task',
    desc: `${c} of ${total} tasks (${pct(c, total)}) ended with a consistent verdict; the rest were unverified, refuted, had no report or were refused.`,
    height: height + 14,
    body: [text(10, 24, `Final verdict per task (${total} tasks)`, 'h'), ...lines],
  })
}

// 2. attempts
{
  const total = sum(S.attempts)
  const keys = Object.keys(S.attempts).sort((a, b) => Number(a) - Number(b))
  const rows = keys.map(k => ({ label: `${k} attempt${k === '1' ? '' : 's'}`, value: S.attempts[k], text: `${S.attempts[k]} (${pct(S.attempts[k], total)})` }))
  const one = S.attempts['1'] || 0
  const { lines, height } = hbars(rows, { top: 50 })
  files['attempts.svg'] = svg({
    title: 'Tasks by attempts to settle',
    desc: `${one} of ${total} tasks (${pct(one, total)}) settled in a single attempt.`,
    height: height + 14,
    body: [text(10, 24, `Tasks by number of attempts to settle (${total} tasks)`, 'h'), ...lines],
  })
}

// 3. tiers: two small panels
{
  const order = ['haiku', 'sonnet', 'opus'].filter(t => S.tiers[t])
  const name = t => `${t[0].toUpperCase()}${t.slice(1)} (n=${S.tiers[t].n})`
  const p1 = hbars(order.map(t => ({ label: name(t), value: S.tiers[t].meanUsd, text: usd(S.tiers[t].meanUsd) })), { top: 50, labelW: 150 })
  const top2 = p1.height + 50
  const p2 = hbars(order.map(t => ({ label: name(t), value: S.tiers[t].medianMin, cls: 'b1', text: `${S.tiers[t].medianMin} min` })), { top: top2 + 26, labelW: 150 })
  const lo = order[0]
  const hi = order[order.length - 1]
  files['tiers.svg'] = svg({
    title: 'Cost and time per tier',
    desc: `Mean cost per attempt rises from ${usd(S.tiers[lo].meanUsd)} at ${lo} to ${usd(S.tiers[hi].meanUsd)} at ${hi}, and median time from ${S.tiers[lo].medianMin} to ${S.tiers[hi].medianMin} minutes.`,
    height: p2.height + 14,
    body: [
      text(10, 24, 'Mean cost per attempt (USD)', 'h'), ...p1.lines,
      text(10, top2 + 8, 'Median time per attempt (minutes)', 'h'), ...p2.lines,
    ],
  })
}

// 4. spend by day: vertical bars on a continuous day axis, one marker
{
  const dayMs = d => Date.parse(`${d}T00:00:00Z`)
  const keys = Object.keys(S.days).sort()
  const first = keys[0]
  const last = keys[keys.length - 1]
  const list = []
  for (let t = dayMs(first); t <= dayMs(last); t += 86400000) list.push(new Date(t).toISOString().slice(0, 10))
  const peakDay = keys.reduce((a, k) => (S.days[k].usd > S.days[a].usd ? k : a), first)
  const peak = S.days[peakDay].usd
  const fmt = v => (v >= 10 ? `$${Math.round(v)}` : `$${v.toFixed(1)}`)
  const left = 14
  const slot = (W - left - 14) / list.length
  const chartTop = 64
  const chartH = 220
  const base = chartTop + chartH
  const lines = []
  list.forEach((d, i) => {
    const cx = left + slot * i + slot / 2
    const u = S.days[d]?.usd
    if (u !== undefined) {
      const h = Math.max((u / peak) * chartH, 1)
      lines.push(rect((cx - slot * 0.32).toFixed(1), (base - h).toFixed(1), slot * 0.64, h.toFixed(1), 'b0'))
      lines.push(text(cx.toFixed(1), (base - h - 5).toFixed(1), fmt(u), '', 'middle'))
    }
    const lab = i === 0 || d.endsWith('-01') ? d.slice(5) : d.slice(8)
    lines.push(text(cx.toFixed(1), base + 18, lab, 'm', 'middle'))
  })
  lines.push(`  <line x1="${left}" y1="${base}" x2="${W - 14}" y2="${base}" class="ax"/>`)
  const mi = list.indexOf(CEILING.day)
  if (mi >= 0) {
    const mx = left + slot * mi
    lines.push(`  <line x1="${mx.toFixed(1)}" y1="${chartTop - 14}" x2="${mx.toFixed(1)}" y2="${base}" class="mk"/>`)
    lines.push(text((mx + 6).toFixed(1), chartTop - 2, CEILING.label))
  }
  const after = mi >= 0 ? list.slice(mi + 1).filter(d => S.days[d]).reduce((a, d) => Math.max(a, S.days[d].usd), 0) : null
  files['spend-by-day.svg'] = svg({
    title: 'Worker spend per day',
    desc: `Spend peaked at ${fmt(peak)} on ${peakDay}${after !== null && mi >= 0 ? `; after the spend ceiling on ${CEILING.day} no day passed $${Math.ceil(after)}` : ''}.`,
    height: base + 52,
    body: [
      text(10, 24, 'Worker spend per day (USD), by day of month', 'h'),
      ...lines,
      text(left, base + 42, `${first} to ${last}; days with no attempts have no bar`, 'm'),
    ],
  })
}

// 5. repos: 100% stacked horizontal bars
{
  const names = Object.keys(S.repos).sort()
  const barX = 40
  const barW = 290
  const rowH = 34
  const top = 92
  const lines = []
  // legend: swatch + name, in the stacking order, left to right
  let lx = 10
  VERDICTS.forEach(([k, label, cls], i) => {
    lines.push(rect(lx, 38, 12, 12, cls))
    lines.push(text(lx + 18, 49, `${i + 1} ${label}`))
    lx += 18 + label.length * 7.2 + 36
  })
  lines.push(text(10, 76, 'Bars run in the legend order, left to right; the figures after each bar are task counts.', 'm'))
  names.forEach((n, i) => {
    const R = S.repos[n]
    const y = top + i * rowH
    const total = sum(R.verdicts)
    lines.push(text(10, y + 15, n, 'h'))
    let x = barX
    const parts = []
    VERDICTS.forEach(([k, , cls], idx) => {
      const v = R.verdicts[k]
      if (!v) return
      const w = (v / total) * barW
      lines.push(rect(x.toFixed(1), y, w, 22, cls))
      x += w
      parts.push(`${idx + 1}=${v}`)
    })
    lines.push(text(barX + barW + 10, y + 15, `${parts.join('  ')}  of ${total} tasks`))
  })
  const best = names.reduce((a, n) => ((S.repos[n].verdicts.consistent || 0) / sum(S.repos[n].verdicts) > (S.repos[a].verdicts.consistent || 0) / sum(S.repos[a].verdicts) ? n : a), names[0])
  const worst = names.reduce((a, n) => ((S.repos[n].verdicts.consistent || 0) / sum(S.repos[n].verdicts) < (S.repos[a].verdicts.consistent || 0) / sum(S.repos[a].verdicts) ? n : a), names[0])
  const share = n => pct(S.repos[n].verdicts.consistent || 0, sum(S.repos[n].verdicts))
  files['repos.svg'] = svg({
    title: 'Verdict mix per repo',
    desc: `Consistent verdicts range from ${share(worst)} of tasks in repo ${worst} to ${share(best)} in repo ${best}.`,
    height: top + names.length * rowH + 10,
    body: [text(10, 24, 'Final verdict mix per repo (share of tasks)', 'h'), ...lines],
  })
}

// 6. hand vs mod: grouped horizontal bars
{
  const max = Math.max(...HAND_VS_MOD.hand, ...HAND_VS_MOD.mod)
  const x0 = 130
  const span = W - x0 - 90
  const lines = []
  let y = 52
  HAND_VS_MOD.cards.forEach((c, i) => {
    lines.push(text(10, y + 28, c, 'h'))
    ;[['by hand', HAND_VS_MOD.hand[i], 'b3'], ['through the mod', HAND_VS_MOD.mod[i], 'b0']].forEach(([lab, v, cls], j) => {
      const yy = y + j * 26
      const w = (v / max) * span
      lines.push(text(x0 - 6, yy + 15, lab, 'm', 'end'))
      lines.push(rect(x0, yy, w, 20, cls))
      lines.push(text(x0 + w + 6, yy + 15, usd(v)))
    })
    y += 66
  })
  lines.push(`  <line x1="${x0}" y1="44" x2="${x0}" y2="${y - 10}" class="ax"/>`)
  const h = HAND_VS_MOD.hand.reduce((a, b) => a + b, 0)
  const m = HAND_VS_MOD.mod.reduce((a, b) => a + b, 0)
  files['hand-vs-mod.svg'] = svg({
    title: 'Cost per card, by hand and through the mod',
    desc: `The same three cards cost ${usd(m)} through the mod against ${usd(h)} by hand.`,
    height: y + 4,
    body: [text(10, 24, 'Worker cost per card (USD, same token method both arms)', 'h'), ...lines],
  })
}

try {
  mkdirSync(outDir, { recursive: true })
  for (const [name, body] of Object.entries(files)) writeFileSync(join(outDir, name), body)
} catch (err) {
  process.stderr.write(`error: cannot write the charts: ${err.message}\n`)
  process.exit(1)
}
process.stdout.write(`wrote ${Object.keys(files).length} charts\n`)
