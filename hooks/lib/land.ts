// MOD-190: /delegation land. Pure: the arguments, the issue body, the open cards, the parent hint. No I/O, no gh.
import { slugOf } from './card'
import { contained } from './scopetree'

export const LAND_TYPES = ['feature', 'epic', 'story', 'task', 'bug', 'spike'] as const
export type LandType = (typeof LAND_TYPES)[number]
export const LAND_USAGE = `usage: /delegation land <${LAND_TYPES.join('|')}> <title> [--parent <n>] [--supersedes <n>] [--paths a,b] [--note <text>] [--dry-run] [--confirm] [--no-project]; type is one of ${LAND_TYPES.join(', ')}; --parent and --supersedes are whole numbers 1 or more; --confirm files the issue when the landAuto option is off`

export type LandArgs = { type: LandType; title: string; parent?: number; /** MOD-200: the issue this one replaces; it is closed `superseded by #n` once this is filed. */ supersedes?: number; paths: string[]; note?: string; dryRun?: boolean; /** MOD-205: with landAuto off, true files; otherwise land only shows the issue. */ confirm?: boolean; /** MOD-218: skip the Project item-add for this call only. */ noProject?: boolean }

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
  let supersedes: number | undefined
  let paths: string[] = []
  let flag = ''
  let dryRun = false
  let confirm = false
  let noProject = false
  for (const { w, quoted } of ws.slice(1)) {
    if (!quoted && w === '--no-project') {
      if (flag === '--parent' || flag === '--paths' || flag === '--supersedes') return { error: LAND_USAGE }
      noProject = true
      flag = ''
      continue
    }
    if (!quoted && w === '--dry-run') {
      if (flag === '--parent' || flag === '--paths' || flag === '--supersedes') return { error: LAND_USAGE }
      dryRun = true
      flag = ''
      continue
    }
    if (!quoted && w === '--confirm') {
      if (flag === '--parent' || flag === '--paths' || flag === '--supersedes') return { error: LAND_USAGE }
      confirm = true
      flag = ''
      continue
    }
    if (!quoted && /^--(parent|paths|note|supersedes)$/.test(w)) {
      if (flag === '--parent' || flag === '--paths' || flag === '--supersedes') return { error: LAND_USAGE }
      flag = w
      continue
    }
    if (flag === '--parent') {
      if (!/^[0-9]+$/.test(w) || Number(w) < 1) return { error: LAND_USAGE }
      parent = Number(w)
      flag = ''
    } else if (flag === '--supersedes') {
      if (!/^[0-9]+$/.test(w) || Number(w) < 1) return { error: LAND_USAGE }
      supersedes = Number(w)
      flag = ''
    } else if (flag === '--paths') {
      paths = w.split(',').map(p => p.trim()).filter(p => p !== '')
      flag = ''
    } else if (flag === '--note') note.push(w)
    else title.push(w)
  }
  if (flag === '--parent' || flag === '--paths' || flag === '--supersedes') return { error: LAND_USAGE }
  const t = title.join(' ').trim()
  if (t === '') return { error: LAND_USAGE }
  const n = note.join(' ').trim()
  return { type, title: t, ...(parent !== undefined ? { parent } : {}), ...(supersedes !== undefined ? { supersedes } : {}), paths, ...(n !== '' ? { note: n } : {}), ...(dryRun ? { dryRun } : {}), ...(confirm ? { confirm } : {}), ...(noProject ? { noProject } : {}) }
}

/** MOD-192: the land tool, answered by the same function as /delegation land. */
export const LAND_TOOL = {
  name: 'land',
  description:
    'Files a GitHub issue in this repo for work that came up mid-session, labelled type:<type>, under the parent issue when one is given, and added to the configured Project (the project option). The body is written first under .delegation/landed/ and redacted; the issue number is written back to that file. With dryRun: true it only writes the body and prints the gh line, and files nothing. Unless the landAuto option is on (it is off by default) it also files nothing until it is called again with confirm: true. Nothing is dispatched and no card is written.',
  inputSchema: {
    type: 'object',
    properties: {
      type: { type: 'string', enum: [...LAND_TYPES], description: 'The issue type; becomes the label type:<type>.' },
      title: { type: 'string', description: 'The issue title.' },
      parent: { type: 'number', description: 'Optional: the parent issue number, a whole number 1 or more.' },
      supersedes: { type: 'number', description: 'Optional: the number of the issue this one replaces, a whole number 1 or more. Once this is filed the old issue is closed with `superseded by #<new>: <note or title>`; the old issue is never edited.' },
      paths: { type: 'array', items: { type: 'string' }, description: 'Optional: the repo paths the work touches (listed as a scope block in the body).' },
      note: { type: 'string', description: 'Optional: text for the top of the issue body.' },
      dryRun: { type: 'boolean', description: 'true: write the body and print the gh line only; file nothing.' },
      project: { type: 'boolean', description: 'false: do not add this issue to the configured Project (this call only). Omit or true: add it as the project option says.' },
      confirm: { type: 'boolean', description: 'true only after the person has said yes to the issue shown; unless the landAuto option is on (off by default) the call files nothing without it. Ignored when landAuto is on.' },
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
  let supersedes: number | undefined
  if (input.supersedes !== undefined && input.supersedes !== null) {
    if (typeof input.supersedes !== 'number' || !Number.isInteger(input.supersedes) || input.supersedes < 1) return { error: LAND_USAGE }
    supersedes = input.supersedes
  }
  const paths = Array.isArray(input.paths) ? input.paths.filter((p): p is string => typeof p === 'string').map(p => p.trim()).filter(p => p !== '') : []
  const note = typeof input.note === 'string' ? input.note.trim() : ''
  return { type, title, ...(parent !== undefined ? { parent } : {}), ...(supersedes !== undefined ? { supersedes } : {}), paths, ...(note !== '' ? { note } : {}), ...(input.dryRun === true ? { dryRun: true } : {}), ...(input.confirm === true ? { confirm: true } : {}), ...(input.project === false ? { noProject: true } : {}) }
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

const ISSUE_LINE = /^issue: #(\d+) (https:\/\/github\.com\/\S+\/issues\/\d+)$/

/** MOD-198: the last `issue: #n url` line of a landed file, else undefined. */
export function issueLineOf(text: string): { number: number; url: string } | undefined {
  for (const line of text.split('\n').reverse()) {
    const m = ISSUE_LINE.exec(line)
    if (m) return { number: Number(m[1]), url: m[2] as string }
  }
  return undefined
}

/** MOD-198: the landed text with its trailing `issue:` line (and the blank lines after it) removed. */
export function withoutIssueLine(text: string): string {
  const lines = text.replace(/\n*$/, '').split('\n')
  if (lines.length > 0 && ISSUE_LINE.test(lines[lines.length - 1] as string)) lines.pop()
  return `${lines.join('\n').replace(/\n*$/, '')}\n`
}

/** The Markdown issue body: the note, the scope block when paths were given, and the open cards that overlap those paths. Redact it before it is written. */
export function landedBody(o: { note?: string; supersedes?: number; paths: readonly string[]; cards: readonly { id: string; title: string; scope?: readonly string[] }[]; defaultBranch: string }): string {
  const parts: string[] = []
  if (o.note && o.note.trim() !== '') parts.push(o.note.trim())
  if (o.supersedes !== undefined) parts.push(`supersedes: #${o.supersedes}`)
  if (o.paths.length > 0) parts.push(`## Scope\n\n\`\`\`scope\n${o.paths.join('\n')}\n\`\`\``)
  // MOD-204: only the open cards whose scope holds one of the paths; no section when none does or there are no paths
  const overlap = o.cards.filter(c => o.paths.some(p => contained(p, c.scope ?? [])))
  if (overlap.length > 0) parts.push(`## Landed from\n\nOpen cards:\n\n${overlap.map(c => `- ${c.id} ${c.title}`.trimEnd()).join('\n')}\n\nDefault branch: ${o.defaultBranch}`)
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
export type Plan = { feature: PlanItem; tasks: PlanItem[]; confirm: boolean; /** MOD-218: skip the Project item-add for this call only. */ noProject?: boolean }

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
      project: { type: 'boolean', description: 'false: do not add the issues to the configured Project (this call only).' },
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
  return { feature, tasks, confirm: o.confirm === true, ...(o.project === false ? { noProject: true } : {}) }
}

const K256 = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]

/** sha-256 of the UTF-8 text, hex. Synchronous and pure, so planKey needs no crypto host. */
export function sha256Text(text: string): string {
  const bytes = new TextEncoder().encode(text)
  const bitLen = bytes.length * 8
  const padded = new Uint8Array(((bytes.length + 9 + 63) >> 6) << 6)
  padded.set(bytes)
  padded[bytes.length] = 0x80
  const view = new DataView(padded.buffer)
  view.setUint32(padded.length - 8, Math.floor(bitLen / 0x100000000))
  view.setUint32(padded.length - 4, bitLen >>> 0)
  const h = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19]
  const w = new Array<number>(64).fill(0)
  const rotr = (x: number, n: number) => (x >>> n) | (x << (32 - n))
  for (let off = 0; off < padded.length; off += 64) {
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(off + i * 4)
    for (let i = 16; i < 64; i++) {
      const a = w[i - 15] as number
      const b = w[i - 2] as number
      const s0 = rotr(a, 7) ^ rotr(a, 18) ^ (a >>> 3)
      const s1 = rotr(b, 17) ^ rotr(b, 19) ^ (b >>> 10)
      w[i] = ((w[i - 16] as number) + s0 + (w[i - 7] as number) + s1) | 0
    }
    let [a, b, c, d, e, f, g, hh] = h as [number, number, number, number, number, number, number, number]
    for (let i = 0; i < 64; i++) {
      const t1 = (hh + (rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25)) + ((e & f) ^ (~e & g)) + (K256[i] as number) + (w[i] as number)) | 0
      const t2 = ((rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22)) + ((a & b) ^ (a & c) ^ (b & c))) | 0
      hh = g
      g = f
      f = e
      e = (d + t1) | 0
      d = c
      c = b
      b = a
      a = (t1 + t2) | 0
    }
    const next = [a, b, c, d, e, f, g, hh]
    for (let i = 0; i < 8; i++) h[i] = ((h[i] as number) + (next[i] as number)) | 0
  }
  return h.map(x => (x >>> 0).toString(16).padStart(8, '0')).join('')
}

/** MOD-207: the plan key, the feature title's slug, `-`, and the first 8 hex of the sha-256 of the sorted feature paths joined by commas. */
export function planKey(featureTitle: string, featurePaths: readonly string[]): string {
  return `${slugOf(featureTitle)}-${sha256Text([...featurePaths].sort().join(',')).slice(0, 8)}`
}

/** MOD-207: the value of the last `plan: <key>` line of a landed file, else undefined. */
export function planLineOf(text: string): string | undefined {
  for (const line of text.split('\n').reverse()) {
    const m = /^plan: (\S+)$/.exec(line)
    if (m) return m[1] as string
  }
  return undefined
}

/** MOD-207: the sub-issues in a parsed `gh issue view --json ...subIssues` answer: number and state (empty when gh gave none). */
export function subIssuesOf(json: unknown): { number: number; state: string }[] {
  const v = (json as { subIssues?: unknown } | null)?.subIssues
  const list = Array.isArray(v) ? v : v && typeof v === 'object' && Array.isArray((v as { nodes?: unknown }).nodes) ? (v as { nodes: unknown[] }).nodes : []
  const out: { number: number; state: string }[] = []
  for (const s of list) {
    const o = s as { number?: unknown; state?: unknown } | null
    if (o && typeof o.number === 'number') out.push({ number: o.number, state: typeof o.state === 'string' ? o.state : '' })
  }
  return out
}
