// MOD-137: the lead's review note as a source of debrief findings. Pure: no `$`.
// The note's "For the mod owner" section holds one top-level bullet per finding; a nested
// `Evidence:` line under a bullet is that finding's evidence.

import type { ModFinding } from './cleanstop'
import { MOD_SURFACES } from './debriefcheck'

/** What a finding about the mod in general is filed under when its bullet names no surface. */
export const NOTE_DEFAULT_SURFACE = 'debrief'

const HEADING = /^(#{1,6})\s+(.*?)\s*#*\s*$/

/** The lines under the first heading (any level) that matches /for the mod owner/i, up to the next heading of the same or a higher level. */
export function ownerSection(markdown: string): string[] {
  const lines = markdown.split(/\r?\n/)
  let level = 0
  const out: string[] = []
  let fence = false
  for (const line of lines) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence
    const h = fence ? null : HEADING.exec(line)
    if (level === 0) {
      if (h && /for the mod owner/i.test(h[2] ?? '')) level = (h[1] ?? '').length
      continue
    }
    if (h && (h[1] ?? '').length <= level) break
    out.push(line)
  }
  return out
}

const BULLET = /^([-*+])\s+(.*)$/

/** The top-level bullets of the section: each is its first line plus the indented or blank-continued lines after it. */
function bullets(section: readonly string[]): string[][] {
  const out: string[][] = []
  let cur: string[] | undefined
  for (const line of section) {
    const m = BULLET.exec(line)
    if (m) {
      cur = [m[2] ?? '']
      out.push(cur)
    } else if (cur && /^\s+\S/.test(line)) {
      cur.push(line.trim().replace(/^[-*+]\s+/, ''))
    } else if (line.trim() !== '' ) {
      cur = undefined
    }
  }
  return out
}

const firstSentence = (s: string): string => {
  const flat = s.replace(/\s+/g, ' ').trim()
  const m = /^.*?[.!?](?=\s|$)/.exec(flat)
  return m ? m[0] : flat
}

const cut = (s: string, cap: number): string => (s.length <= cap ? s : `${s.slice(0, cap - 1).trimEnd()}…`)

function surfaceOf(text: string): string {
  let best: { at: number; name: string } | undefined
  for (const name of MOD_SURFACES) {
    const m = new RegExp(`(?<![a-z])${name}(?![a-z])`, 'i').exec(text)
    if (m && (best === undefined || m.index < best.at)) best = { at: m.index, name }
  }
  return best ? best.name : NOTE_DEFAULT_SURFACE
}

/** One finding per top-level bullet of the owner section; none when the section is missing or empty. */
export function noteFindings(markdown: string, source: string): (ModFinding & { source: string })[] {
  return bullets(ownerSection(markdown)).map(lines => {
    const head = lines[0] ?? ''
    const sev = /^(P[123])\b[\s:.\-–—]*/.exec(head)
    const text = sev ? head.slice(sev[0].length) : head
    const evidence = lines.slice(1).filter(l => /^Evidence:/i.test(l))
    return {
      kind: 'went_wrong' as const,
      surface: surfaceOf(lines.join('\n')),
      fault_class: 'design' as const,
      severity: (sev ? sev[1] : 'P3') as 'P1' | 'P2' | 'P3',
      title: cut(firstSentence(text), 80),
      body: [head, ...lines.slice(1)].join('\n'),
      evidence: evidence.length > 0 ? evidence : [head],
      source,
    }
  })
}

/** The one row a clean stop appends in notes mode, once per round. */
export const notesPromptRow = (verdicts: number): string =>
  `a round of tasks closed (${verdicts} ${verdicts === 1 ? 'verdict' : 'verdicts'}): write the review note, then /delegation debrief ingest <note.md>`

/** The file name of an ingested note's findings: `<YYYY-MM-DD>-note-<stem>.findings.json`. */
export const noteFindingsName = (date: string, notePath: string): string => {
  const base = notePath.slice(notePath.lastIndexOf('/') + 1)
  const stem = base.replace(/\.md$/i, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || 'note'
  return `${date}-note-${stem}.findings.json`
}
