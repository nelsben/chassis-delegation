// 4A/4B/3D: the band's lines, the pane's blocks, the sparklines and the status text (pure).
import { test, expect, describe } from 'claude-code/testing'
import {
  base64,
  bandLines,
  blocksFor,
  decisionText,
  elapsed,
  openItemLines,
  sparkCells,
  sparkPoints,
  sparkSvg,
  statusToolText,
  STATUS_TOOL,
  STATUS_TOOL_NAME,
  type BandItem,
} from '../hooks/lib/dashboard'
import { emptyMetrics } from '../hooks/lib/metrics'

const NOW = 10_000_000

const items: BandItem[] = [
  { kind: 'running', task: 'OPS-232', tier: 'standard', alias: 'sonnet', at: NOW - (4 * 60 + 12) * 1000, usd: 1.75, phase: 'building' },
  { kind: 'running', task: 'BE-1', tier: 'frontier', alias: 'opus', at: NOW - 65_000, phase: 'verifying' },
  { kind: 'decision', task: 'OPS-230', text: 'refuted on scope · resume advised', next: 'resume agent=a9 — SendMessage it the verifier lines below' },
  { kind: 'queued', task: 'BE-301', position: 1 },
  { kind: 'eval-failed', tier: 'T1', pass: 61, total: 63, at: NOW - 1000, sha: 'abcdef12' },
  { kind: 'runner', what: 'debrief', at: NOW - 30_000 },
]

describe('4A: the band lines', () => {
  test('nothing to show: no lines', () => {
    expect(bandLines([], NOW, 100)).toEqual([])
  })
  test('one line per item, the running ones aligned', () => {
    const lines = bandLines(items, NOW, 100).map(l => l.text)
    expect(lines).toEqual([
      '▸ OPS-232 · standard/sonnet · 04:12 · $1.75 · building',
      '▸ BE-1    · frontier/opus   · 01:05 · $–    · verifying',
      '▸ OPS-230 · refuted on scope · resume advised',
      '▸ queued: BE-301 (pos 1)',
      '▸ eval T1 61/63 — see transcript',
      '▸ debrief running · 00:30',
    ])
  })
  test('the eval-failed line carries a clear', () => {
    const lines = bandLines(items, NOW, 100)
    expect(lines.filter(l => l.clear).map(l => l.key)).toEqual(['eval-failed'])
  })
  test('sized to the band: a long line is cut with an ellipsis', () => {
    const lines = bandLines(items.slice(0, 1), NOW, 20)
    expect(lines[0]?.text).toBe('▸ OPS-232 · standar…')
    expect(lines[0]?.text.length).toBe(20)
  })
  test('elapsed reads mm:ss, h:mm:ss past the hour', () => {
    expect(elapsed(0)).toBe('00:00')
    expect(elapsed(252_000)).toBe('04:12')
    expect(elapsed(3_725_000)).toBe('1:02:05')
  })
  test('a decision in one clause: the verdict, its claim, the advice', () => {
    expect(decisionText({ verdict: 'refuted', reason: 'on scope (out-of-scope path: x)', advice: 'resume' })).toBe('refuted on scope · resume advised')
    expect(decisionText({ verdict: 'refuted', advice: 'respawn' })).toBe('refuted · respawn advised')
    expect(decisionText({ verdict: 'unverified', reason: 'on gate (x)', advice: 'check' })).toBe('unverified on gate · check by hand')
    expect(decisionText({ verdict: 'refuted', advice: 'exhausted' })).toBe('refuted · budget exhausted')
    expect(decisionText({ verdict: 'verified', advice: 'accept', approval: true })).toBe('verified · amend needs approval')
    expect(decisionText({ verdict: 'refuted', noRepo: true, reason: 'out of scope: /etc/passwd', advice: 'resume' })).toBe('refuted (no repo): out of scope: /etc/passwd · resume advised')
  })
})

describe('4B: the pane', () => {
  test('six blocks, each a heading, one number line and a series', () => {
    const cur = { ...emptyMetrics(NOW), dispatches: 3, verdicts: { verified: 4, unverified: 1, refuted: 2, falseRefuted: 1 }, spawns: { haiku: 1, sonnet: 4, opus: 2 }, escalations: { resume: 1, respawn: 0 }, debriefs: 1, evals: { run: 2, failed: 1 }, compactions: 2, usd: 4.21, verifiedBy: { haiku: 0, sonnet: 3, opus: 1 } }
    const blocks = blocksFor({ history: [emptyMetrics(1), cur], current: cur, rateLimits: [{ kind: 'five_hour', percentUsed: 37 }], owedRows: ['debrief 14:02 — /h/d.json'] })
    expect(blocks.map(b => b.heading)).toEqual(['Steps saved', 'Verdicts', 'Tiers', 'Owed work that ran itself', 'Compaction', 'Spend'])
    expect(blocks.map(b => b.number)).toEqual([
      '3 dispatches · ~30 hand steps saved',
      '4 verified · 1 unverified · 2 refuted (1 false)',
      'haiku 1 · sonnet 4 · opus 2 · resume 1 · respawn 0',
      '1 debrief · 2 evals (1 failed)',
      '2 compactions served, state block attached',
      '$4.21 on workers · five_hour window 37%',
    ])
    expect(blocks[3]?.detail).toEqual(['debrief 14:02 — /h/d.json'])
    expect(blocks.every(b => b.series.length === 2)).toBe(true)
    expect(blocks[0]?.series).toEqual([0, 3])
  })
  test('open items: every band item with the exact next action', () => {
    expect(openItemLines(items, NOW)).toEqual([
      'OPS-232: running standard/sonnet 04:12 — wait for the hand-back',
      'BE-1: verifying frontier/opus 01:05 — the verdict lands on its own',
      'OPS-230: resume agent=a9 — SendMessage it the verifier lines below',
      'BE-301: queued (position 1) — starts when a worker slot frees',
      'eval T1 61/63 at abcdef12: read the failing names in the transcript, then press clear in the band',
      'debrief: running 00:30 — nothing to do',
    ])
  })
})

describe('4B: sparklines', () => {
  test('one polyline over at most 14 points, zero at the bottom, nulls dropped', () => {
    const pts = sparkPoints([0, 2, null, 4], 100, 16)
    expect(pts).toBe('1,15 50,8 99,1')
    expect(sparkPoints([3], 100, 16)).toBe('1,1 99,1')
    expect(sparkPoints([0, 0], 100, 16)).toBe('1,15 99,15')
    expect(sparkPoints([], 100, 16)).toBe('')
    const many = Array.from({ length: 20 }, (_, i) => i)
    expect(sparkPoints(many, 100, 16).split(' ')).toHaveLength(14)
  })
  test('the Svg: one polyline, no fill, 2 px, the surface foreground, sized to the column', () => {
    const svg = sparkSvg([1, 2, 3], 40)
    expect(svg?.width).toBe(320)
    expect(svg?.height).toBe(16)
    expect(svg?.source).toContain('viewBox="0 0 320 16"')
    expect(svg?.source.match(/<polyline/g)).toHaveLength(1)
    expect(svg?.source).toContain('fill="none"')
    expect(svg?.source).toContain('stroke-width="2"')
    expect(svg?.source).toContain('stroke="currentColor"')
    expect(svg?.source).not.toContain('<rect')
    expect(sparkSvg([null, null], 40)).toBeUndefined()
  })
  test('the Raster: one row of block glyphs in the terminal default colour', () => {
    const r = sparkCells([0, 4, 8])
    expect(r?.columns).toBe(3)
    expect(r?.rows).toBe(1)
    expect(r?.glyphs).toBe('▁▅█')
    // three cells of [codePoint, fg, bg] u32 little-endian
    const bytes = Uint8Array.from(atobBytes(r?.cells ?? ''))
    const words = new Uint32Array(bytes.buffer)
    expect([...words]).toEqual([0x2581, 0x01000000, 0x01000000, 0x2585, 0x01000000, 0x01000000, 0x2588, 0x01000000, 0x01000000])
    expect(sparkCells([null])).toBeUndefined()
  })
  test('base64 is the standard padded alphabet', () => {
    const enc = (s: string) => base64(new TextEncoder().encode(s))
    expect(enc('')).toBe('')
    expect(enc('f')).toBe('Zg==')
    expect(enc('fo')).toBe('Zm8=')
    expect(enc('foo')).toBe('Zm9v')
    expect(enc('foobar')).toBe('Zm9vYmFy')
  })
})

describe('3D: the status tool', () => {
  test('declared as status, listed as mcp__chassis-delegation__status, with an open flag', () => {
    expect(STATUS_TOOL.name).toBe('status')
    expect(STATUS_TOOL_NAME).toBe('mcp__chassis-delegation__status')
    expect(Object.keys(STATUS_TOOL.inputSchema.properties)).toEqual(['open'])
  })
  test('the compose section, then the last 10 verdicts and the last eval and debrief rows', () => {
    const verdicts = Array.from({ length: 12 }, (_, i) => `chassis-delegation: T-${i} attempt 1/3 verified · sonnet · next=accept`)
    const text = statusToolText('Delegation state (chassis-delegation):\n- running: X', { verdicts, eval: 'T1 63/63 at abcdef12 (2026-10-03 14:00Z)', debrief: '2026-10-03 14:00Z — /h/d.json' })
    const lines = text.split('\n')
    expect(lines.slice(0, 2)).toEqual(['Delegation state (chassis-delegation):', '- running: X'])
    expect(lines).toContain('Last 10 verdicts:')
    expect(lines.filter(l => l.startsWith('- chassis-delegation: T-'))).toHaveLength(10)
    expect(lines).toContain('- chassis-delegation: T-11 attempt 1/3 verified · sonnet · next=accept')
    expect(lines).not.toContain('- chassis-delegation: T-1 attempt 1/3 verified · sonnet · next=accept')
    expect(lines).toContain('Last eval: T1 63/63 at abcdef12 (2026-10-03 14:00Z)')
    expect(lines).toContain('Last debrief: 2026-10-03 14:00Z — /h/d.json')
  })
  test('nothing running or owed still answers', () => {
    expect(statusToolText(undefined, { verdicts: [] }).split('\n')).toEqual([
      'Delegation state (chassis-delegation): nothing running, nothing owed.',
      'Last 10 verdicts: none this session',
      'Last eval: none',
      'Last debrief: none this session',
    ])
  })
})

/** Decodes standard base64 to bytes (the test's own reader). */
function atobBytes(s: string): number[] {
  const abc = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
  const out: number[] = []
  let buf = 0
  let bits = 0
  for (const ch of s.replace(/=+$/, '')) {
    buf = (buf << 6) | abc.indexOf(ch)
    bits += 6
    if (bits >= 8) {
      bits -= 8
      out.push((buf >> bits) & 0xff)
    }
  }
  return out
}
