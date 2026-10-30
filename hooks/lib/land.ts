// MOD-190: /delegation land. Pure: the arguments, the issue body, the open cards, the parent hint. No I/O, no gh.
import { contained } from './scopetree'

export const LAND_TYPES = ['feature', 'epic', 'story', 'task', 'bug', 'spike'] as const
export type LandType = (typeof LAND_TYPES)[number]
export const LAND_USAGE = `usage: /delegation land <${LAND_TYPES.join('|')}> <title> [--parent <n>] [--paths a,b] [--note <text>] [--dry-run]; type is one of ${LAND_TYPES.join(', ')}; --parent is a whole number 1 or more`

export type LandArgs = { type: LandType; title: string; parent?: number; paths: string[]; note?: string; dryRun?: boolean }

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
  let dryRun = false
  for (const { w, quoted } of ws.slice(1)) {
    if (!quoted && w === '--dry-run') {
      if (flag === '--parent' || flag === '--paths') return { error: LAND_USAGE }
      dryRun = true
      flag = ''
      continue
    }
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
  return { type, title: t, ...(parent !== undefined ? { parent } : {}), paths, ...(n !== '' ? { note: n } : {}), ...(dryRun ? { dryRun } : {}) }
}

/** MOD-192: the land tool, answered by the same function as /delegation land. */
export const LAND_TOOL = {
  name: 'land',
  description:
    'Files a GitHub issue in this repo for work that came up mid-session, labelled type:<type>, under the parent issue when one is given, and added to the configured Project (the project option). The body is written first under .delegation/landed/ and redacted; the issue number is written back to that file. With dryRun: true it only writes the body and prints the gh line, and files nothing. Nothing is dispatched and no card is written.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...LAND_TYPES], description: 'The issue type; becomes the label type:<type>.' },
      title: { type: 'string', description: 'The issue title.' },
      parent: { type: 'number', description: 'Optional: the parent issue number, a whole number 1 or more.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Optional: the repo paths the work touches (listed as a scope block in the body).' },
      note: { type: 'string', description: 'Optional: text for the top of the issue body.' },
      dryRun: { type: 'boolean', description: 'true: write the body and print the gh line only; file nothing.' },
    },
    required: ['type', 'title'],
    additionalProperties: false,
  },
} as const

/** The land tool's input as LandArgs, or the usage line. */
export function parseLandTool(input: Record<string, unknown>): LandArgs | { error: string } {
  const type = input.type as LandType
  if (typeof input.type !== 'string' || !LAND_TYPES.includes(type)) return { error: LAND_USAGE }
  const title = typeof input.title === 'string' ? input.title.replace(/\s+/g, ' ').trim() : ''
  if (title === '') return { error: LAND_USAGE }
  let parent: number | undefined
  if (input.parent !== undefined && input.parent !== null) {
    if (typeof input.parent !== 'number' || !Number.isInteger(input.parent) || input.parent < 1) return { error: LAND_USAGE }
    parent = input.parent
  }
  const paths = Array.isArray(input.paths) ? input.paths.filter((p): p is string => typeof p === 'string').map(p => p.trim()).filter(p => p !== '') : []
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  return { type, title, ...(parent !== undefined ? { parent } : {}), paths, ...(note !== '' ? { note } : {}), ...(input.dryRun === true ? { dryRun: true } : {}) }
}

/** MOD-192: the `project` option, `<owner>/<number>`; undefined when it is not that. */
export function parseProject(v: string): { owner: string; number: number } | undefined {
  const m = /^([A-Za-z0-9-]+)\/([0-9]{1,9})$/.exec(v.trim())
  return m ? { owner: m[1] as string, number: Number(m[2]) } : undefined
}

/** The issue url on gh's stdout: the last line that is exactly `https://github.com/<owner/name>/issues/<digits>`. */
export function issueUrlOf(stdout: string, ownerRepo: string): { url: string; number: number } | undefined {
  const re = new RegExp(`^https://github\\.com/${ownerRepo.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}/issues/([0-9]+)$`)
  for (const line of stdout.split('\n').map(l => l.trim()).reverse()) {
    const m = re.exec(line)
    if (m) return { url: line, number: Number(m[1]) }
  }
  return undefined
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

export type PlanItem = { title: string; type: LandType; paths: string[]; note?: string }
export type Plan = { feature: PlanItem; tasks: PlanItem[]; confirm: boolean }

/** MOD-193: the land_plan tool. */
export const LAND_PLAN_TOOL = {
  name: 'land_plan',
  description:
    'Lands a settled plan on GitHub as a sub-issue tree: one feature (or epic) and its tasks, each task under the feature, each added to the configured Project. Plan in chat first. Call without confirm to show the tree: every body is written under .delegation/landed/ and nothing is filed. Show that tree to the person, and call again with confirm: true only after the person says yes in their own words. Every task path must sit inside the feature paths, or the whole call is refused before anything is written.',
  inputSchema: {
    type: 'object',
    properties: {
      feature: {
        type: 'object',
        properties: {
          title: { type: 'string', description: 'The feature issue title.' },
          type: { type: 'string', enum: ['feature', 'epic'], description: 'Default feature.' },
          paths: { type: 'array', items: { type: 'string' }, minItems: 1, description: 'The repo paths the whole feature may touch.' },
          note: { type: 'string', description: 'Optional: text for the top of the body.' },
        },
        required: ['title', 'paths'],
        additionalProperties: false,
      },
      tasks: {
        type: 'array',
        minItems: 1,
        maxItems: 30,
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'The task issue title.' },
            type: { type: 'string', enum: ['story', 'task', 'bug', 'spike'], description: 'Default task.' },
            paths: { type: 'array', items: { type: 'string' }, minItems: 1, description: "The repo paths this task touches; each must sit inside the feature's paths." },
            note: { type: 'string', description: 'Optional: text for the top of the body.' },
          },
          required: ['title', 'paths'],
          additionalProperties: false,
        },
      },
      confirm: { type: 'boolean', description: 'true only after the person has said yes to the tree shown; otherwise the call files nothing.' },
    },
    required: ['feature', 'tasks'],
    additionalProperties: false,
  },
} as const

const planItem = (raw: unknown, what: string, types: readonly LandType[], dflt: LandType): PlanItem | string => {
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return `land_plan: ${what} must be an object`
  const o = raw as Record<string, unknown>
  const title = typeof o.title === 'string' ? o.title.replace(/\s+/g, ' ').trim() : ''
  if (title === '') return `land_plan: ${what} needs a title`
  let type = dflt
  if (o.type !== undefined && o.type !== null) {
    if (typeof o.type !== 'string' || !types.includes(o.type as LandType)) return `land_plan: ${what} "${title}" has type ${JSON.stringify(o.type)}; use one of ${types.join(', ')}`
    type = o.type as LandType
  }
  const paths = Array.isArray(o.paths) ? o.paths.filter((p): p is string => typeof p === 'string').map(p => p.trim()).filter(p => p !== '') : []
  if (paths.length === 0) return `land_plan: ${what} "${title}" needs at least one path`
  const note = typeof o.note === 'string' ? o.note.trim() : ''
  return { title, type, paths, ...(note !== '' ? { note } : {}) }
}

/** The land_plan input as a normalised plan, or a one-line error. A task path outside the feature's paths is an error. */
export function parsePlan(input: unknown): Plan | { error: string } {
  const o = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>
  const feature = planItem(o.feature, 'feature', ['feature', 'epic'], 'feature')
  if (typeof feature === 'string') return { error: feature }
  if (!Array.isArray(o.tasks) || o.tasks.length < 1 || o.tasks.length > 30) return { error: 'land_plan: tasks must be a list of 1 to 30' }
  const tasks: PlanItem[] = []
  for (const [i, raw] of o.tasks.entries()) {
    const t = planItem(raw, `task ${i + 1}`, ['story', 'task', 'bug', 'spike'], 'task')
    if (typeof t === 'string') return { error: t }
    const stray = t.paths.find(p => !contained(p, feature.paths))
    if (stray !== undefined) return { error: `land_plan: task "${t.title}" path ${stray} is outside the feature paths (${feature.paths.join(', ')})` }
    tasks.push(t)
  }
  return { feature, tasks, confirm: o.confirm === true }
}
