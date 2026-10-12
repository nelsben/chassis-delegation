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

/** MOD-18: what a post says while the person's own redact list is empty: the automatic scrub cannot know a product name that differs from the folder name. */
export const REDACT_EMPTY = 'run /delegation config redact <words>, the product, customer, employer and repo names this session must never publish, then post again'

// ---- MOD-31: the mod asks whether to post, or posts ------------------------------------

/** The person's postFindings setting: ask (the default), auto or off. Never read from the repo file. */
export type PostMode = 'ask' | 'auto' | 'off'

/** Anything but auto or off is ask: the safe default. */
export const parsePostMode = (v: unknown): PostMode => (v === 'auto' || v === 'off' ? v : 'ask')

/** Findings auto posts from one debrief; the rest stay drafts. */
export const AUTO_POST_CAP = 5

/** The one question line a debrief ends with in ask mode. */
export const askLine = (count: number, repo: string): string =>
  `post ${count} findings to ${repo}? say yes to post them all, scrubbed, or name some (/delegation debrief post 1,3); nothing is posted without a yes`

/** What the delegation-state section tells the brain while a question is waiting. */
export const askPosture = (count: number, repo: string): string =>
  `Posture: the debrief left ${count} new ${count === 1 ? 'finding' : 'findings'} for ${repo}. Ask the person once whether to post ${count === 1 ? 'it' : 'them'} (the question is in the debrief output); never post without an explicit yes in the person's own words, then run /delegation debrief post all, or the numbers they name.`

/** `/delegation`: the mode beside the issues line. */
export const postModeLine = (mode: PostMode, repo: string): string => `post findings: ${mode} → ${repo}`

/** Auto's closing line when the cap left findings as drafts. */
export const capLine = (left: number): string => `${left} more stay drafts (auto posts at most ${AUTO_POST_CAP} per debrief; /delegation debrief post all posts the rest)`
