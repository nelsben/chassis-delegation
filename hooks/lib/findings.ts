// MOD-7: /delegation debrief post. A finding as it would be posted, whether an issue
// already covers it, the post argument, and the last check before a body leaves. Pure: no `$`.

import type { ModFinding } from './cleanstop'

/** A finding in the .findings.json; `issue` / `commentedOn` are written back when it is posted. */
export type PostFinding = ModFinding & { issue?: number; commentedOn?: number }

export type IssueRow = { number: number; title: string; body: string }

/** The title, with [went well] in front of a went_well one, and the body in the tracker's existing shape. */
export function renderPost(f: ModFinding, version: string): { title: string; body: string } {
  const title = f.kind === 'went_well' ? `[went well] ${f.title}` : f.title
  const lines = [`**Surface:** ${f.surface || '(none)'} · **Fault class:** ${f.fault_class} · **Severity:** ${f.severity}`, '', f.body]
  if (f.evidence.length > 0) lines.push('', '**Evidence**', '', ...f.evidence.map(e => `- ${e}`))
  lines.push('', `posted by chassis-delegation ${version} via /delegation debrief`)
  return { title, body: `${lines.join('\n')}\n` }
}

const words = (s: string): string[] => s.toLowerCase().match(/[\p{L}\p{N}]{3,}/gu) ?? []

/** The first issue that shares the finding's surface and at least three of its title words; undefined = new. */
export function coveredBy(f: ModFinding, issues: readonly IssueRow[]): number | undefined {
  const surface = f.surface.trim().toLowerCase()
  if (surface === '') return undefined
  const mine = new Set(words(f.title))
  for (const i of issues) {
    if (!`${i.title}\n${i.body}`.toLowerCase().includes(surface)) continue
    const theirs = new Set(words(i.title))
    if ([...mine].filter(w => theirs.has(w)).length >= 3) return i.number
  }
  return undefined
}

/** `all` or `1,3` against `count` findings; the numbers are 1-based. */
export function parsePostArg(arg: string, count: number): { all: boolean; nums: number[] } | { error: string } {
  const t = arg.trim()
  if (t === 'all') return { all: true, nums: Array.from({ length: count }, (_, i) => i + 1) }
  const nums: number[] = []
  for (const part of t.split(',')) {
    const p = part.trim()
    if (!/^\d+$/.test(p)) return { error: `post takes all or finding numbers like 1,3 (got ${JSON.stringify(t)})` }
    const n = Number(p)
    if (n < 1 || n > count) return { error: `there is no finding [${n}] (1 to ${count})` }
    if (!nums.includes(n)) nums.push(n)
  }
  return { all: false, nums }
}

/** A word of the redact list still in the text, in any case, even inside a longer word; undefined = clean. */
export function survivingWord(text: string, list: readonly string[]): string | undefined {
  const low = text.toLowerCase()
  return list.map(w => w.trim()).find(w => w !== '' && low.includes(w.toLowerCase()))
}

/** The number out of the url `gh issue create` prints. */
export const issueNumberOf = (stdout: string): number | undefined => {
  const m = /\/issues\/(\d+)\s*$/m.exec(stdout.trim())
  return m ? Number(m[1]) : undefined
}
