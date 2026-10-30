// MOD-190: /delegation land. Pure: the arguments, the issue body, the open cards, the parent hint. No I/O, no gh.
import { contained } from './scopetree'

export const LAND_TYPES = ['feature', 'epic', 'story', 'task', 'bug', 'spike'] as const
export type LandType = (typeof LAND_TYPES)[number]
export const LAND_USAGE = `usage: /delegation land <${LAND_TYPES.join('|')}> <title> [--parent <n>] [--paths a,b] [--note <text>]; type is one of ${LAND_TYPES.join(', ')}; --parent is a whole number 1 or more`

export type LandArgs = { type: LandType; title: string; parent?: number; paths: string[]; note?: string }

/** Words of the text; a double-quoted run is one word (the quotes dropped). */
function words(text: string): { w: string; quoted: boolean }[] {
  const out: { w: string; quoted: boolean }[] = []
  const re = /"([^"]*)"|(\S+)/g
  for (let m = re.exec(text); m; m = re.exec(text)) out.push(m[1] !== undefined ? { w: m[1], quoted: true } : { w: m[2] as string, quoted: false })
  return out
}

/** `<type> <title> [--parent n] [--paths a,b] [--note text]`; a one-line usage message in `error` when it does not parse. */
export function parseLandArgs(text: string): LandArgs | { error: string } {
  const ws = words(text)
  const type = ws[0]?.w as LandType | undefined
  if (!type || !LAND_TYPES.includes(type)) return { error: LAND_USAGE }
  const title: string[] = []
  const note: string[] = []
  let parent: number | undefined
  let paths: string[] = []
  let flag = ''
  for (const { w, quoted } of ws.slice(1)) {
    if (!quoted && /^--(parent|paths|note)$/.test(w)) {
      if (flag === '--parent' || flag === '--paths') return { error: LAND_USAGE }
      flag = w
      continue
    }
    if (flag === '--parent') {
      if (!/^[0-9]+$/.test(w) || Number(w) < 1) return { error: LAND_USAGE }
      parent = Number(w)
      flag = ''
    } else if (flag === '--paths') {
      paths = w.split(',').map(p => p.trim()).filter(p => p !== '')
      flag = ''
    } else if (flag === '--note') note.push(w)
    else title.push(w)
  }
  if (flag === '--parent' || flag === '--paths') return { error: LAND_USAGE }
  const t = title.join(' ').trim()
  if (t === '') return { error: LAND_USAGE }
  const n = note.join(' ').trim()
  return { type, title: t, ...(parent !== undefined ? { parent } : {}), paths, ...(n !== '' ? { note: n } : {}) }
}

/** The Markdown issue body: the note, the scope block when paths were given, and where it was landed from. Redact it before it is written. */
export function landedBody(o: { note?: string; paths: readonly string[]; cards: readonly { id: string; title: string }[]; defaultBranch: string }): string {
  const parts: string[] = []
  if (o.note && o.note.trim() !== '') parts.push(o.note.trim())
  if (o.paths.length > 0) parts.push(`## Scope\n\n\`\`\`scope\n${o.paths.join('\n')}\n\`\`\``)
  parts.push(`## Landed from\n\nOpen cards:\n\n${o.cards.length > 0 ? o.cards.map(c => `- ${c.id} ${c.title}`.trimEnd()).join('\n') : 'none'}\n\nDefault branch: ${o.defaultBranch}`)
  return `${parts.join('\n\n')}\n`
}

/** The task ids with an accepted or merged ledger row (the same rule the card tool reads siblings by). */
export function doneTasks(ledgerText: string): Set<string> {
  const done = new Set<string>()
  for (const line of ledgerText.split('\n')) {
    try {
      const row = JSON.parse(line) as { task?: unknown; kind?: unknown; how?: unknown } | null
      if (typeof row?.task === 'string' && [row.kind, row.how].some(m => m === 'accepted' || m === 'merged')) done.add(row.task)
    } catch {
      // a line that is not JSON is skipped
    }
  }
  return done
}

export type LandCard = { id: string; title: string; status?: string; parent: unknown; scope: readonly string[] }

/** Cards whose status is not merged and whose task id has no accepted or merged ledger row. */
export const openCards = (cards: readonly LandCard[], done: ReadonlySet<string>): LandCard[] => cards.filter(c => c.status !== 'merged' && !done.has(c.id))

/** The parent of the first open card with a `parent:` whose scope holds one of the paths. */
export function parentHint(paths: readonly string[], open: readonly LandCard[]): { parent: number; card: string } | undefined {
  for (const c of open) {
    const parent = Number(c.parent)
    if (c.parent === undefined || c.parent === '' || !Number.isInteger(parent) || parent < 1) continue
    if (paths.some(p => contained(p, c.scope))) return { parent, card: c.id }
  }
  return undefined
}

/** `<slug>.md`, or `<slug>-2.md`, `-3`… when the name is taken. */
export function freeName(slug: string, taken: ReadonlySet<string>): string {
  if (!taken.has(`${slug}.md`)) return `${slug}.md`
  let n = 2
  while (taken.has(`${slug}-${n}.md`)) n++
  return `${slug}-${n}.md`
}
