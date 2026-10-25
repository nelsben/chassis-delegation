// `/dispatch <TASK-ID>` (SPEC amendment 1 A): card frontmatter → brief header
// and body → worktree argv → the spawn block. MOD-12 (#22): the mod spawns no
// worker; the brain makes the Agent call the block names, and the spawn hook
// shapes and records it like any other. Pure: no `$`.
import { isBaseRef, isSha, isTaskId } from './allow'
import { isSpacedPath, listForHeader, parseBudget, parseHeader } from './brief'
import { worktreePath as worktreePathOf } from './paths'
import { DEFAULT_AGENT_TYPES, DEFAULT_DOMAINS } from './repoconfig'

export { DEFAULT_AGENT_TYPES }

export type FieldValue = string | string[]

export type Card = {
  id: string
  title: string
  domain: string
  tier?: string
  status?: string
  gate: string[]
  /** The gate exactly as the card wrote it (for the template). */
  gateText: string
  redTest: string
  scope: string[]
  forbid: string[]
  budget?: string
  /** GH-106: the card's `spend:` ceiling in dollars, as written. */
  spend?: string
  /** GH-16: `repo: here` dispatches into the session's own checkout (no worktree). MOD-22: `repo: none` has no repo at all. MOD-44: an absolute path is another local checkout. */
  repo?: string
  /** MOD-22: the card's output folder, when it names one; else the first absolute scope entry's folder. */
  outdir?: string
  /** MOD-22: where the worker puts helper files, when the card names it; else a folder under the system temp dir. */
  scratch?: string
  /** MOD-23: the exclusive resources the card holds while it runs (`resources: [blender-live]`); another card naming one waits. */
  resources: string[]
  /** MOD-124 (#188): the named exception blocks (`allow: [live-reads]`) the brief pulls from the briefLocal file. */
  allow: string[]
  /** The card's markdown below the frontmatter, verbatim. */
  body: string
  fields: Record<string, FieldValue>
}

export const USAGE = 'usage: /dispatch <TASK-ID> [--dry-run] [--base <origin/main|sha>] [--replay --base <sha>] [--scope <globs>] [--forbid <globs>] [--here] [--repo <abs path>] [--force-overlap] | /dispatch <TASK-ID> --verify <sha>'
export const REPLAY_NEEDS_BASE = 'refused --replay without --base <sha>: a replay reads the card at the commit where it was still queued'
export const HERE_NO_REPLAY = 'refused --here with --replay: a replay works in its own worktree at the base commit'
/** MOD-44: another repo's task has no replay (a replay reads the card at a commit of the session's own repo). */
export const REPO_NO_REPLAY = 'refused --repo with --replay: a replay reads the card at a commit of the session repo'
export const REPO_NO_HERE = 'refused --repo with --here: a task for another repo works in its own worktree there'
/** MOD-44: `--repo none` is a card's mode, not a dispatch option. */
export const REPO_NONE = 'refused --repo none: repo none is a card\'s mode (write repo: none on the card); --repo takes the absolute path of a git checkout'
/** GH-104: `--verify <sha>` judges the work already in the task's tree; it takes no other option. */
export const VERIFY_ALONE = 'refused --verify with another option: /dispatch <TASK-ID> --verify <sha> takes the task id and the sha alone'
export const verifyShaRefusal = (sha: string): string => `refused --verify ${sha || '(empty)'}: name the branch head as a 7-40 character hex sha`

/**
 * Part 5C: briefs go to `<root>/.delegation/briefs/` (gitignored by
 * `/delegation init`) unless `briefDir` names a folder.
 */
export const briefDirFor = (root: string, configured: string): string =>
  configured.trim() ? configured.trim().replace(/\/+$/, '') : `${root.replace(/\/+$/, '')}/.delegation/briefs`

/** Lockfiles at the repo root, in the order they decide the brief's install step. */
export const INSTALL_FILES = ['package-lock.json', 'pnpm-lock.yaml', 'yarn.lock', 'requirements.txt'] as const
const INSTALL_STEPS: Record<(typeof INSTALL_FILES)[number], string> = {
  'package-lock.json': 'npm ci',
  'pnpm-lock.yaml': 'pnpm i --frozen-lockfile',
  'yarn.lock': 'yarn install --immutable',
  'requirements.txt': 'pip install -r requirements.txt',
}

/** The brief's install step, picked by the first lockfile present at the root. */
export function installStep(present: readonly string[]): string {
  const hit = INSTALL_FILES.find(f => present.includes(f))
  return hit ? INSTALL_STEPS[hit] : 'none needed (no lockfile at the repo root)'
}

/**
 * The FALLBACK brief folder, used only when the repo root is not writable:
 * Claude Code's session scratchpad on macOS for uid 501 (this machine).
 */
export const SCRATCH_BASE = '/private/tmp/claude-501'

/**
 * The session scratchpad: `<base>/<root, every character but a letter, digit
 * or dash made a dash>/<sessionId>/scratchpad` (so `/` and `.` both become
 * `-`, as in `-Users-dev--claude-dev-mods-…`).
 */
export function scratchpadFor(root: string, sessionId: string, base = SCRATCH_BASE): string {
  const slug = root.replace(/\/+$/, '').replace(/[^A-Za-z0-9-]/g, '-')
  return `${base}/${slug}/${sessionId}/scratchpad`
}

export const defaultBriefDir = (root: string, sessionId: string, base = SCRATCH_BASE): string => `${scratchpadFor(root, sessionId, base)}/briefs`

/** MOD-40: a double-quoted scalar's body, with \" \\ \n \t read back. */
const decodeDq = (inner: string): string => inner.replace(/\\(["\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))

/**
 * One scalar. MOD-40: a `#` is a comment only as ` # ` (a hash followed by a space or the end, after a space) and only
 * outside quotes; `#89`, `#n` and a hash inside a word stay in the value.
 */
function unquote(raw: string): string {
  const v = raw.trim()
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) return decodeDq(v.slice(1, -1))
  const dq = /^"((?:[^"\\]|\\.)*)"\s+#(\s.*)?$/.exec(v)
  if (dq) return decodeDq(dq[1] as string)
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'")
  return v.replace(/(^|\s+)#(\s.*)?$/, '')
}

/** MOD-40: a value the card writes unquoted would read back cut at ` #`, so one that holds ` #` or starts with `#` is double-quoted (\ and " escaped). */
export const yamlScalar = (v: string): string => (/ #|^#/.test(v) ? `"${v.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"` : v)

function flowList(raw: string): string[] {
  const inner = raw.trim().slice(1, -1).trim()
  return inner ? inner.split(',').map(unquote).filter(Boolean) : []
}

/** A small YAML frontmatter reader: `key: scalar`, `key: [flow, list]`, block lists, `|`/`>` blocks. */
export function parseFrontmatter(text: string): { fields: Record<string, FieldValue>; body: string } | undefined {
  const lines = text.split('\n')
  if ((lines[0] ?? '').trim() !== '---') return undefined
  const end = lines.findIndex((l, i) => i > 0 && l.trim() === '---')
  if (end < 0) return undefined
  const fields: Record<string, FieldValue> = {}
  let i = 1
  while (i < end) {
    const line = lines[i] as string
    const m = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s(.*))?$/.exec(line)
    i += 1
    if (!m) continue
    const key = m[1] as string
    const raw = (m[2] ?? '').trim()
    if (raw === '' || raw === '|' || raw === '>' || raw === '|-' || raw === '>-') {
      const items: string[] = []
      const block: string[] = []
      while (i < end && /^\s+\S/.test(lines[i] as string)) {
        const l = (lines[i] as string).trim()
        if (l.startsWith('- ') && raw === '') items.push(unquote(l.slice(2)))
        else block.push(l)
        i += 1
      }
      fields[key] = items.length > 0 ? items : block.join(raw.startsWith('|') ? '\n' : ' ')
    } else if (raw.startsWith('[') && raw.endsWith(']')) fields[key] = flowList(raw)
    else fields[key] = unquote(raw)
  }
  return { fields, body: lines.slice(end + 1).join('\n').replace(/^\n+/, '') }
}

const asText = (v: FieldValue | undefined): string => (Array.isArray(v) ? v.join(', ') : v ?? '')

/** A list field: a YAML list, or a scalar split on `,` and `;`. */
function asList(v: FieldValue | undefined): string[] {
  const parts = Array.isArray(v) ? v : (v ?? '').split(/[,;]/)
  return parts.map(s => s.trim()).filter(Boolean)
}

export function parseCard(text: string): Card | { error: string } {
  const fm = parseFrontmatter(text)
  if (!fm) return { error: 'the card has no YAML frontmatter' }
  const f = fm.fields
  const id = asText(f.id).trim()
  if (!id) return { error: 'the card frontmatter has no id' }
  return {
    id,
    title: asText(f.title).trim(),
    domain: asText(f.domain).trim(),
    tier: asText(f.tier).trim() || undefined,
    status: asText(f.status).trim() || undefined,
    gate: asList(f.gate),
    gateText: asText(f.gate).trim(),
    redTest: asText(f.red_test).trim(),
    scope: asList(f.scope),
    forbid: asList(f.forbid),
    budget: asText(f.budget).trim() || undefined,
    spend: asText(f.spend).trim() || undefined,
    repo: asText(f.repo).trim() || undefined,
    outdir: asText(f.outdir).trim() || undefined,
    scratch: asText(f.scratch).trim() || undefined,
    resources: asList(f.resources),
    allow: asList(f.allow),
    body: fm.body,
    fields: f,
  }
}

export function checkStatus(card: Card): string | undefined {
  const status = card.status ?? '(none)'
  return status === 'queued' || status === 'claimed' ? undefined : `${card.id} is status ${status}; /dispatch takes a queued or claimed card`
}

/** The card's domain must be one of the repo's (`domains`; default the chassis six). */
export function checkDomain(card: Card, domains: readonly string[] = DEFAULT_DOMAINS): string | undefined {
  if (domains.includes(card.domain)) return undefined
  const list = domains.length > 1 ? `${domains.slice(0, -1).join(', ')} or ${domains.at(-1)}` : (domains[0] ?? '(none)')
  return `${card.id} has domain ${card.domain || '(none)'}; /dispatch takes ${list}`
}

/** The card's `budget:` as attempts; a value off the grammar falls back, and `budgetWarning` says so in the /dispatch output (GH-1 item 6). */
export const budgetAttempts = (budget: string | undefined, fallback: number): number => parseBudget(budget, fallback)

/** GH-103: what dispatch ends with when the card scope is prose and no globs were passed. */
export const PROSE_SCOPE_STOP = 'stopped: the card scope is prose; pass --scope <globs> (or scope on the tool) and dispatch again'

/** True when a scope entry is prose, not a glob: the verifier leaves such a scope unchecked unless scope_globs= is added. */
export const scopeLooksProse = (scope: readonly string[]): boolean => scope.some(s => /\s/.test(s) && !isSpacedPath(s))

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * The brief header, exactly as SPEC amendment 1 A writes it. `scope` and
 * `forbid`, when given (from `/dispatch --scope/--forbid`), replace the card's.
 * GH-16: a repo=here brief adds `repo=here`, `base=<ref>` when one is named,
 * and `ignore=<globs>` after the gate. MOD-22: `repo=none` likewise, and a card
 * with an output folder adds `outdir=<abs>` and `scratch=<abs>` after those.
 * MOD-23: a card that names resources adds `resources=<a,b>` after those.
 */
export function renderHeader(input: {
  card: Card
  tier: string
  alias: string
  budget: number
  /** GH-106: the ceiling in dollars; 0 or absent writes no `spend=`. */
  spend?: number
  scope?: readonly string[]
  forbid?: readonly string[]
  repo?: string
  base?: string
  ignore?: readonly string[]
  /** MOD-22: the output folder and the scratch folder, absolute. */
  outdir?: string
  scratch?: string
}): string {
  const c = input.card
  const scope = input.scope ?? c.scope
  const forbid = input.forbid ?? c.forbid
  const here =
    (input.repo ? ` repo=${input.repo}` : '') +
    (input.base ? ` base=${input.base}` : '') +
    (input.ignore && input.ignore.length > 0 ? ` ignore=${input.ignore.join(',')}` : '') +
    (input.outdir ? ` outdir=${input.outdir}` : '') +
    (input.scratch ? ` scratch=${input.scratch}` : '') +
    (c.resources.length > 0 ? ` resources=${c.resources.join(',')}` : '') +
    // MOD-124: and `allow=<a,b>` after those
    (c.allow.length > 0 ? ` allow=${c.allow.join(',')}` : '')
  return (
    `[[brief v=1 task=${c.id} subtask=main purpose=build tier=${input.tier} model=${input.alias}` +
    ` scope=${listForHeader(scope.map(oneLine))} forbid=${listForHeader(forbid.map(oneLine))}` +
    // MOD-98: a spaced path in scope would read as prose to the verifier, so the same list is also given as globs
    (scope.some(isSpacedPath) && scope.every(e => !/\s/.test(e) || isSpacedPath(e)) ? ` scope_globs=${listForHeader(scope.map(oneLine))}` : '') +
    ` red_test="${oneLine(c.redTest).replace(/"/g, "'")}" gate=${c.gate.join(',')}${here}` +
    (input.spend ? ` spend=${input.spend}` : '') +
    ` budget=${input.budget}-attempts report=chassis.report.v1]]`
  )
}

/** MOD-54: the most literal scope entries a card may name before dispatch warns (cost tracked the files a card touched). */
export const SCOPE_FILES_MAX = 6
/** MOD-54: the most scope entries (tests left out) and done-when statements a standard card may hold for the economy hint. */
export const TIER_HINT_SCOPE_MAX = 2
export const TIER_HINT_DONE_MAX = 3

const hasGlobChar = (s: string): boolean => /[*?[\]{}]/.test(s)

/** MOD-54: the warning when a scope holds more than SCOPE_FILES_MAX literal entries (globs are counted in the line, never trigger it). */
export function scopeSizeWarning(scope: readonly string[]): string | undefined {
  const entries = scope.filter(s => s.trim() !== '')
  const globs = entries.filter(hasGlobChar).length
  const files = entries.length - globs
  return files > SCOPE_FILES_MAX ? `warning: scope names ${files} files (and ${globs} globs); cost tracks the files a card touches: split it` : undefined
}

/** MOD-54: the hint that economy would do for a small standard card; nothing is refused or changed. */
export function tierHint(input: { tier: string; scope: readonly string[]; doneCount: number; redTest: string }): string | undefined {
  if (input.tier !== 'standard') return undefined
  if (input.redTest.trim().toLowerCase() === 'none') return undefined
  const entries = input.scope.map(s => s.trim()).filter(s => s !== '' && !/^\.?\/?tests?\//.test(s))
  if (entries.length > TIER_HINT_SCOPE_MAX || entries.some(hasGlobChar)) return undefined
  if (input.doneCount > TIER_HINT_DONE_MAX) return undefined
  return `hint: tier economy would do: ${entries.length} files in scope, ${input.doneCount} done-when lines, a red test`
}

/** MOD-140: phrases that hand the worker a decision a Done when line should name. */
export const HEDGE_WORDS: readonly string[] = [
  'appropriate', 'appropriately', 'sensible', 'sensibly', 'as needed', 'as necessary', 'if needed', 'where relevant', 'reasonable', 'reasonably',
  'etc', 'and so on', 'the existing one', 'as usual', 'properly', 'correctly', 'clean up', 'tidy', 'improve', 'better',
]

/** MOD-140: at most this many hedge hint lines, then one closing count. */
export const HEDGE_HINTS_MAX = 3

const HEDGE_RE = new RegExp(`(?<![A-Za-z0-9])(?:${HEDGE_WORDS.map(w => w.replace(/ /g, '\\s+')).join('|')})(?![A-Za-z0-9])`, 'i')

/** MOD-140: one hint per Done when statement (a list item, or a non-blank line when there is no list) that holds a hedge word outside backticks. Pure. */
export function hedgeHints(doneLines: readonly string[]): string[] {
  const items = doneLines.filter(l => /^\s*(?:[-*+]|\d+[.)])\s+\S/.test(l))
  const statements = items.length > 0 ? items : doneLines.filter(l => l.trim() !== '')
  const found: string[] = []
  statements.forEach((line, i) => {
    const m = HEDGE_RE.exec(line.replace(/`[^`]*`/g, ' '))
    if (m) found.push(`hint: done-when line ${i + 1} says "${m[0].replace(/\s+/g, ' ')}": the worker decides that alone; name the outcome`)
  })
  if (found.length <= HEDGE_HINTS_MAX) return found
  return [...found.slice(0, HEDGE_HINTS_MAX), `hint: ${found.length - HEDGE_HINTS_MAX} more done-when lines hedge`]
}

/** MOD-22: which sections a brief keeps: a worktree brief, a repo=here one, or a repo=none one. */
export type BriefMode = 'worktree' | 'here' | 'none'

/**
 * GH-16: a template's mode sections. `{{#here}}…{{/here}}` is kept for a
 * repo=here brief and `{{#worktree}}…{{/worktree}}` otherwise; the other
 * section goes, markers and all (a marker's own line break with it).
 * MOD-22: `{{#none}}…{{/none}}` is the third, for a repo=none brief, and
 * `{{#repo}}…{{/repo}}` is kept for the two modes that have a repo. `mode` is
 * a BriefMode, or the boolean the first callers pass (true: here, false: worktree).
 */
export function renderSections(template: string, mode: BriefMode | boolean): string {
  const on: BriefMode = mode === true ? 'here' : mode === false ? 'worktree' : mode
  // `{{#repo}}` is kept for a worktree or a repo=here brief and dropped for a repo=none one
  const off: string[] = [...(['worktree', 'here', 'none'] as const).filter(m => m !== on), ...(on === 'none' ? ['repo'] : [])]
  const kept = [on, ...(on === 'none' ? [] : ['repo']), 'spend', 'outdir', 'scratch', 'lessons']
  let out = template
  for (const m of off) out = out.replace(new RegExp(`\\{\\{#${m}\\}\\}[\\s\\S]*?\\{\\{/${m}\\}\\}\\n?`, 'g'), '')
  return out.replace(new RegExp(`\\{\\{[#/](?:${kept.join('|')})\\}\\}\\n?`, 'g'), '')
}

/**
 * GH-16: a repo=here brief's ignore=: the config's globs, then the files
 * other in-flight cards claimed so far, each once. An entry the header could
 * not carry (a space, a quote, `]]`) is left out; the verifier still
 * subtracts those cards' files from the store.
 */
export function hereIgnore(config: readonly string[], claimed: readonly string[]): string[] {
  const out: string[] = []
  for (const g of [...config, ...claimed]) {
    const v = g.trim()
    if (v === '' || /[\s"]/.test(v) || v.includes(']]') || out.includes(v)) continue
    out.push(v)
  }
  return out
}

/** GH-16: the refusal when this card's scope overlaps an in-flight repo=here card's. */
export const overlapRefusal = (id: string, mine: string, card: string, theirs: string): string =>
  `/dispatch ${id}: refused — ${id} scope ${mine} overlaps in-flight ${card} scope ${theirs} in the shared checkout; both would claim the same paths (pass --force-overlap to dispatch anyway)`

/** GH-16: the same overlap, let through by --force-overlap. */
export const overlapWarning = (id: string, mine: string, card: string, theirs: string): string =>
  `warning: ${id} scope ${mine} overlaps in-flight ${card} scope ${theirs} in the shared checkout (--force-overlap: dispatched anyway)`

/** MOD-23: the refusal when this repo=here card names a resource an in-flight repo=here card holds: both would use it at once. */
export const resourceOverlapRefusal = (id: string, resource: string, card: string): string =>
  `/dispatch ${id}: refused — ${id} holds resource ${resource}, which in-flight ${card} holds in the shared checkout; both would use it at once (pass --force-overlap to dispatch anyway; it then waits for the resource)`

/** MOD-23: the same overlap, let through by --force-overlap. */
export const resourceOverlapWarning = (id: string, resource: string, card: string): string =>
  `warning: ${id} holds resource ${resource}, which in-flight ${card} holds in the shared checkout (--force-overlap: dispatched anyway; it waits for the resource)`

/** The values a brief is rendered with (the card and where its worker runs, plus the optional parts). */
export type BriefVars = {
  card: Card
  worktree: string
  branch: string
  cardPath: string
  install?: string
  extra?: string
  here?: boolean
  mode?: BriefMode
  spend?: number
  outdir?: string
  scratch?: string
  reportExtra?: string
  /** MOD-120 (#199): the sentence after the gate line that tells the worker to write the {files} listing; '' when no gate command names it. */
  gateNote?: string
  /** MOD-34: the domain's lessons file (its text and the path it was read from); the brief carries it under `## Lessons (<domain>)`, capped. */
  lessons?: { text: string; path: string }
}

/**
 * MOD-120 (#199 items 1): the brief's gate line as the worker can run it. Each gate id the map has reads
 * `id (`command`)` with {worktree}, {outdir} (when the card has one) and {files} filled; an id the map lacks stays
 * a bare id. `note` (leading space, empty when no command names {files}) tells the worker to write that listing first.
 */
export function gateLineText(ids: readonly string[], map: Readonly<Record<string, string>>, at: { worktree: string; outdir?: string; filesPath: string; base?: string }): { gate: string; note: string } {
  let usesFiles = false
  const fill = (cmd: string): string => {
    if (cmd.includes('{files}')) usesFiles = true
    const withOut = at.outdir === undefined ? cmd : cmd.split('{outdir}').join(at.outdir)
    return withOut.split('{worktree}').join(at.worktree).split('{files}').join(at.filesPath)
  }
  const gate = ids.map(g => (map[g] !== undefined ? `${g} (\`${fill(map[g] as string)}\`)` : g)).join(', ')
  const note = usesFiles ? ` Write the file list ${at.filesPath} yourself before you run the gate: \`git diff --name-only ${at.base ?? 'origin/main'}\` into it, one path a line (make its folder first); the verifier writes its own when it re-runs the gate.` : ''
  return { gate, note }
}

/** MOD-34: the most lines of a domain's lessons file a brief carries. */
export const LESSONS_CAP = 40

/** MOD-34: the lines of a lessons file (a trailing newline is not a line). */
export const lessonLines = (text: string): string[] => {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  while (lines.length > 0 && (lines.at(-1) ?? '').trim() === '') lines.pop()
  return lines
}

/** MOD-34: how many lines a lessons file holds. */
export const lessonLineCount = (text: string): number => lessonLines(text).length

/** MOD-34: the lessons section as the brief carries it: the file as it stands, cut at the cap with a last line saying how many were left out. */
export function lessonsSection(domain: string, text: string, path: string): string {
  const lines = lessonLines(text)
  const kept = lines.length > LESSONS_CAP ? [...lines.slice(0, LESSONS_CAP), `(${lines.length - LESSONS_CAP} more lines not carried; prune ${path})`] : lines
  return `## Lessons (${domain})\n\n${kept.join('\n')}`
}

/** MOD-34: where a domain's lessons file lives: beside the cards. */
export const lessonsPath = (root: string, cardDir: string | undefined, domain: string): string => `${cardDirPath(root, cardDir)}/lessons/${domain}.md`

/** MOD-34: the warning when a lessons file is over the cap. */
export const lessonsCapWarning = (domain: string, n: number, path: string): string =>
  `warning: the ${domain} lessons file holds ${n} lines; the brief carries the first ${LESSONS_CAP} (${n - LESSONS_CAP} not carried): prune ${path}`

/**
 * The template with its sections decided and its `{{key}}`s still in place, and the values they take.
 * MOD-28: split from the fill so a scan for a leftover marker can look at the template's own text, before
 * any value (a card body that quotes `{{#none}}`, say) is put in.
 */
function stageBrief(template: string, v: BriefVars): { staged: string; values: Record<string, string> } {
  const values: Record<string, string> = {
    install: v.install ?? "the repo's own install step, if a lockfile is present",
    extra: v.extra ?? '',
    spend: String(v.spend ?? 0),
    outdir: v.outdir ?? '',
    scratch: v.scratch ?? '',
    reportExtra: v.reportExtra ?? '',
    gateNote: v.gateNote ?? '',
    id: v.card.id,
    title: v.card.title,
    domain: v.card.domain,
    worktree: v.worktree,
    branch: v.branch,
    cardPath: v.cardPath,
    redTest: v.card.redTest,
    gate: v.card.gateText,
    body: v.card.body,
    lessons: v.lessons && lessonLineCount(v.lessons.text) > 0 ? lessonsSection(v.card.domain, v.lessons.text, v.lessons.path) : '',
  }
  // GH-106: `{{#spend}}…{{/spend}}` is kept only when the brief carries a ceiling
  const withSpend = template.replace(/\{\{#spend\}\}([\s\S]*?)\{\{\/spend\}\}\n?/g, (_, inner: string) => (v.spend && v.spend > 0 ? inner : ''))
  // MOD-22: `{{#outdir}}…{{/outdir}}` and `{{#scratch}}…{{/scratch}}` are kept only when the brief names the folder
  const keep = (text: string, name: string, on: boolean) => text.replace(new RegExp(`\\{\\{#${name}\\}\\}\\n?([\\s\\S]*?)\\{\\{/${name}\\}\\}\\n?`, 'g'), (_, inner: string) => (on ? inner : ''))
  const withFolders = keep(keep(keep(withSpend, 'outdir', !!v.outdir), 'scratch', !!v.scratch), 'lessons', values.lessons !== '')
  return { staged: renderSections(withFolders, v.mode ?? (v.here === true ? 'here' : 'worktree')), values }
}

/** One pass over the staged template: a `{{key}}` with a value takes it; the rest stays. Nothing a value holds is read again. */
const fillBrief = (staged: string, values: Readonly<Record<string, string>>): string => staged.replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? (values[key] as string) : whole))

/**
 * The brief body from the template: `{{id}} {{title}} {{domain}} {{worktree}}
 * {{branch}} {{cardPath}} {{redTest}} {{gate}} {{body}}`, plus `{{install}}`
 * (the lockfile's install step) and `{{extra}}` (the repo file's briefExtra).
 * GH-16: `here` keeps the template's `{{#here}}` sections (`{{worktree}}` is
 * then the shared checkout) and drops its `{{#worktree}}` ones; else the reverse.
 */
export function renderBrief(template: string, v: BriefVars): string {
  const { staged, values } = stageBrief(template, v)
  return fillBrief(staged, values)
}

/**
 * MOD-28: the first `{{` marker in `text` that is not a `{{key}}` naming one of `known`, as written
 * (a section opener or closer, a key with a space in it, a key nothing fills, a `{{` never closed); undefined when none.
 * A marker the code rendered is gone by the time this looks; one that survives is a template this code does not understand.
 */
export function leftoverMarker(text: string, known: readonly string[] = []): string | undefined {
  for (const m of text.matchAll(/\{\{[^\n]*?\}\}|\{\{[^\n]*/g)) {
    const key = /^\{\{(\w+)\}\}$/.exec(m[0])?.[1]
    if (key === undefined || !known.includes(key)) return m[0].length > 60 ? `${m[0].slice(0, 60)}…` : m[0]
  }
  return undefined
}

/**
 * MOD-28: renderBrief, and the first marker the template itself leaves behind (see leftoverMarker). The scan is
 * of the template once its sections are decided, before the values go in: a card body, title or red test that
 * quotes `{{#none}}` is the card's text, never a leftover.
 */
export function renderBriefChecked(template: string, v: BriefVars): { text: string; leftover?: string } {
  const { staged, values } = stageBrief(template, v)
  const leftover = leftoverMarker(staged, Object.keys(values))
  return { text: fillBrief(staged, values), ...(leftover !== undefined ? { leftover } : {}) }
}

/** MOD-28: the refusal when a rendered brief still holds a marker: nothing is written, so no worker reads it. */
export const unrenderedRefusal = (id: string, marker: string, template: string): string =>
  `/dispatch ${id}: refused — the brief rendered from ${template} still holds ${marker}, which this code does not render; a brief with unrendered markers never reaches a worker, so no brief and no worktree were written (the template is newer or other than the code running: reload the window if the folder was updated, else fix the template)`

/** MOD-28: the files under hooks/templates/ the mod renders; each is read once, when the mod loads. A node test holds this equal to the folder. */
export const TEMPLATE_FILES = ['brief.md', 'review.md', 'debrief.md'] as const

/** MOD-28: where a template of the mod lives, under the loaded plugin folder. */
export const templatePath = (pluginRoot: string, name: string): string => `${pluginRoot.replace(/\/+$/, '')}/hooks/templates/${name}`

export type DispatchArgs =
  | { id: string; dryRun: boolean; base: string; replay?: true; scope?: string[]; forbid?: string[]; here?: true; /** MOD-44: the absolute path of another local checkout this task is for, as written (the caller checks it). */ repo?: string; forceOverlap?: true; verify?: string; error?: undefined }
  | { error: string; id?: undefined }

/** `a/**,b.ts,` → ['a/**', 'b.ts']; an empty list, a quote or `]]` (which would break the header) is refused. */
function globList(flag: string, raw: string | undefined): string[] | { error: string } {
  if (raw === undefined || raw === '' || raw.startsWith('--')) return { error: `${flag} needs comma-separated globs` }
  const list = raw.split(',').map(s => s.trim()).filter(Boolean)
  if (list.length === 0) return { error: `${flag} needs comma-separated globs` }
  const bad = list.find(g => g.includes('"') || g.includes(']]'))
  if (bad) return { error: `refused ${flag} glob ${bad} (no quotes or ]] in a glob)` }
  const spaced = list.find(g => /\s/.test(g))
  return spaced ? { error: `refused ${flag} glob ${spaced} (no spaces in a glob)` } : list
}

export function parseDispatchArgs(args: string): DispatchArgs {
  const tokens = args.trim().split(/\s+/).filter(Boolean)
  let id: string | undefined
  let dryRun = false
  let base = 'origin/main'
  let scope: string[] | undefined
  let forbid: string[] | undefined
  let replay = false
  let here = false
  let forceOverlap = false
  let verify: string | undefined
  let repo: string | undefined
  let others = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i] as string
    if (t === '--verify' || t.startsWith('--verify=')) {
      const sha = t === '--verify' ? tokens[++i] ?? '' : t.slice('--verify='.length)
      if (!isSha(sha)) return { error: verifyShaRefusal(sha) }
      verify = sha
      continue
    }
    if (t.startsWith('-')) others += 1
    if (t === '--dry-run') dryRun = true
    else if (t === '--replay') replay = true
    else if (t === '--here') here = true
    else if (t === '--force-overlap') forceOverlap = true
    else if (t === '--repo' || t.startsWith('--repo=')) {
      const value = t === '--repo' ? tokens[++i] ?? '' : t.slice('--repo='.length)
      if (value === '' || value.startsWith('--')) return { error: '--repo needs the absolute path of a git checkout' }
      // the words keep their meaning: worktree is the default, here is --here
      if (value === 'none') return { error: REPO_NONE }
      if (value === 'here') here = true
      else if (value !== 'worktree') repo = value
    }
    else if (t === '--scope' || t.startsWith('--scope=') || t === '--forbid' || t.startsWith('--forbid=')) {
      const flag = t.startsWith('--scope') ? '--scope' : '--forbid'
      const raw = t === flag ? tokens[++i] : t.slice(flag.length + 1)
      const list = globList(flag, raw)
      if (!Array.isArray(list)) return list
      if (flag === '--scope') scope = list
      else forbid = list
    } else if (t === '--base' || t.startsWith('--base=')) {
      const ref = t === '--base' ? tokens[++i] ?? '' : t.slice('--base='.length)
      if (!isBaseRef(ref)) return { error: `refused --base ${ref || '(empty)'}: use origin/main or a 7-40 character hex sha` }
      base = ref
    } else if (t.startsWith('-')) return { error: `unknown option ${t}` }
    else if (id === undefined) id = t
    else return { error: USAGE }
  }
  if (id === undefined) return { error: USAGE }
  if (!isTaskId(id)) return { error: `refused task id ${id}` }
  if (verify !== undefined) return others > 0 ? { error: VERIFY_ALONE } : { id, dryRun: false, base: 'origin/main', verify }
  if (replay && !isSha(base)) return { error: REPLAY_NEEDS_BASE }
  if (replay && here) return { error: HERE_NO_REPLAY }
  if (repo !== undefined && replay) return { error: REPO_NO_REPLAY }
  if (repo !== undefined && here) return { error: REPO_NO_HERE }
  return {
    id,
    dryRun,
    base,
    ...(replay ? { replay: true as const } : {}),
    ...(scope ? { scope } : {}),
    ...(forbid ? { forbid } : {}),
    ...(here ? { here: true as const } : {}),
    ...(repo !== undefined ? { repo } : {}),
    ...(forceOverlap ? { forceOverlap: true as const } : {}),
  }
}

/** Card files for a task: `<id>-*.md` exactly (BE-101-x.md, never BE-1010-x.md). */
export const cardMatches = (names: readonly string[], id: string): string[] =>
  names.filter(n => n.startsWith(`${id}-`) && n.endsWith('.md'))

const suffix = (replay?: boolean): string => (replay ? '-replay' : '')
export const worktreePath = (root: string, id: string, replay?: boolean, worktreeRoot?: string): string => worktreePathOf(root, id, replay, worktreeRoot)
export const branchName = (domain: string, id: string, replay?: boolean): string => `agent/${domain}/${id}${suffix(replay)}`
export const briefFileName = (id: string, replay?: boolean): string => `${id}${replay ? '.replay' : ''}.brief.md`

/** One plain file-name segment: no dot, no slash. */
const NAME_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/

/**
 * GH-6: the brief file an inline header lands in, `<task>.<subtask>.brief.md`.
 * Undefined when the task or subtask is not a plain name segment, or the
 * subtask is `replay` (`<task>.replay.brief.md` is /dispatch's replay brief).
 */
export const inlineBriefFileName = (task: string, subtask: string): string | undefined =>
  NAME_SEGMENT.test(task) && NAME_SEGMENT.test(subtask) && subtask !== 'replay' ? `${task}.${subtask}.brief.md` : undefined

/** GH-6: an inline header's brief file: the header, then the rest of the prompt. */
export function inlineBriefText(prompt: string, headerRaw: string): string {
  const at = prompt.indexOf(headerRaw)
  const body = (at >= 0 ? prompt.slice(0, at) + prompt.slice(at + headerRaw.length) : prompt).trim()
  return body ? `${headerRaw}\n\n${body}\n` : `${headerRaw}\n`
}

export const fetchArgv = (root: string): string[] => ['git', '-C', root, 'fetch', '-q', 'origin', 'main']
/** GH-16, repo=here: the checkout's current branch, and the sha HEAD is at (a baseRef of HEAD is pinned to it). */
export const currentBranchArgv = (root: string): string[] => ['git', '-C', root, 'rev-parse', '--abbrev-ref', 'HEAD']
export const headShaArgv = (root: string): string[] => ['git', '-C', root, 'rev-parse', 'HEAD']
export const worktreeAddArgv = (root: string, domain: string, id: string, base: string, replay?: boolean, worktreeRoot?: string): string[] =>
  ['git', '-C', root, 'worktree', 'add', '-q', '-b', branchName(domain, id, replay), worktreePath(root, id, replay, worktreeRoot), base]

/** GH-12: the folder /dispatch reads cards from: `<root>/<cardDir>` (empty = agents/tasks). Replay stays on agents/tasks (the allowlist's exact shapes). */
export const cardDirPath = (root: string, cardDir?: string): string => `${root.replace(/\/+$/, '')}/${(cardDir ?? '').replace(/^\/+|\/+$/g, '') || 'agents/tasks'}`

/** Replay: the card files at the base commit, and one card's text there (both read-only). */
export const lsTreeArgv = (root: string, sha: string): string[] => ['git', '-C', root, 'ls-tree', '--name-only', sha, 'agents/tasks/']
export const showCardArgv = (root: string, sha: string, file: string): string[] => ['git', '-C', root, 'show', `${sha}:agents/tasks/${file}`]
export const cardNamesFromLsTree = (stdout: string): string[] =>
  stdout.split('\n').map(l => l.trim()).filter(Boolean).map(l => l.slice(l.lastIndexOf('/') + 1))

/**
 * The subagent type a domain's card spawns on: the map's (a record, or JSON
 * text), else a type the session offers under the domain's own name
 * (`known`), else general-purpose.
 */
export function agentTypeFor(domain: string, json: string | Readonly<Record<string, string>> | undefined, known: readonly string[] = []): string {
  let map: Record<string, unknown> = { ...DEFAULT_AGENT_TYPES }
  if (json && typeof json === 'object') map = { ...map, ...json }
  else if (json && json.trim()) {
    try {
      const parsed: unknown = JSON.parse(json)
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) map = { ...map, ...(parsed as Record<string, unknown>) }
    } catch {
      // keep the default map
    }
  }
  const t = map[domain]
  if (typeof t === 'string' && t) return t
  return known.includes(domain) ? domain : 'general-purpose'
}

export const spawnPrompt = (briefPath: string): string => `Your brief is the file ${briefPath}. Read it whole, then follow it exactly.`
export const spawnDescription = (id: string, title: string): string => `${id}: ${title.slice(0, 60)}`

/** MOD-12: the Agent tool's input for a worker, in the tool's own spelling: the brain passes it verbatim. */
export type SpawnCall = { subagent_type: string; model: string; description: string; prompt: string }

/** MOD-12: the call for a task's brief: its agent type, the tier's alias, `<id> <tier> <alias>`, the brief handoff. */
export const spawnCall = (o: { label: string; tier: string; alias: string; subagentType: string; briefPath: string }): SpawnCall => ({
  subagent_type: o.subagentType,
  model: o.alias,
  description: `${o.label} ${o.tier} ${o.alias}`,
  prompt: spawnPrompt(o.briefPath),
})

/** The one line under the block: nothing runs until the brain makes the call. */
export const SPAWN_STARTS = 'The worker starts when you make this Agent call: pass the JSON above as its input, verbatim; the mod tiers it, records the attempt and verifies the hand-back.'

/** MOD-12: what a dispatch result (and a respawn verdict) ends with: `spawn: Agent`, the call as fenced JSON, the line. */
export const spawnBlock = (call: SpawnCall): string => ['spawn: Agent', '```json', JSON.stringify(call, null, 2), '```', SPAWN_STARTS].join('\n')

/** The model-callable twin of /dispatch (SPEC part 2A): `$.tool.register`'s spec. */
export const DISPATCH_TOOL = {
  name: 'dispatch',
  description:
    "Prepare a chassis task card for a worker: writes the brief from the card, cuts the worktree (or, with here, shares the session's own checkout) and picks the tier, then returns the Agent call to make (a spawn block of JSON): the worker starts when you make it, and the mod records and verifies it. When every worker slot is taken it says queued, and tells you when a slot frees. Pass scope/forbid globs when the card's are prose. Pass repo, the absolute path of another local git checkout, for a task that works in that repo (a card written by the card tool with repo set to a path is found by its id alone). With verify (a sha), spawns nothing: runs the verifier on the work already in the task's worktree.",
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task id, e.g. BE-101' },
      scope: { type: 'string', description: "Comma-separated scope globs (paths, not prose); replaces the card's scope in the brief header. Required when the card's scope is prose: dispatch stops until it is given" },
      forbid: { type: 'string', description: 'Comma-separated forbid globs; replaces the card forbid in the brief header' },
      replay: { type: 'boolean', description: 'Re-run a card already merged on main, read at base (needs a sha base)' },
      base: { type: 'string', description: 'origin/main (default) or a 7-40 hex sha to cut the worktree from' },
      dryRun: { type: 'boolean', description: 'Write the brief and print its header; no worktree, no spawn block' },
      here: { type: 'boolean', description: "repo=here: no worktree and no fetch; the worker shares the session's own checkout" },
      repo: { type: 'string', description: "The absolute path of another local git checkout this task is for (the folder holding .git): the worktree is cut from that repo's origin/main beside it, and the verifier, the gate and the config are that repo's. Leave it out for a task of this repo; a card written with repo set to a path remembers it" },
      forceOverlap: { type: 'boolean', description: "repo=here: dispatch even when the card's scope overlaps an in-flight card's" },
      verify: { type: 'string', description: "A 7-40 hex sha, the branch head: run the verifier on the work in the task's worktree with a synthetic report naming the delta; no spawn. Takes no other option" },
    },
    required: ['task'],
    additionalProperties: false,
  },
} as const

/** The name the model calls it by: `mcp__<plugin>__<name>`. */
export const DISPATCH_TOOL_NAME = 'mcp__chassis-delegation__dispatch'

/**
 * The tool's input → the same DispatchArgs the command's flags parse to, by
 * the same rules (task id, base ref, replay needs a sha, glob lists), so the
 * one dispatch function behind both doors sees identical requests.
 */
export function parseDispatchTool(input: Record<string, unknown>): DispatchArgs {
  const task = input.task
  if (typeof task !== 'string' || task.trim() === '') return { error: 'dispatch: task is required (a task id such as BE-101)' }
  for (const k of ['dryRun', 'replay', 'here', 'forceOverlap'] as const) {
    if (input[k] !== undefined && typeof input[k] !== 'boolean') return { error: `dispatch: ${k} must be a boolean` }
  }
  for (const k of ['scope', 'forbid', 'base', 'verify', 'repo'] as const) {
    if (input[k] !== undefined && typeof input[k] !== 'string') return { error: `dispatch: ${k} must be a string` }
  }
  const id = task.trim()
  if (!isTaskId(id)) return { error: `refused task id ${id}` }
  if (input.verify !== undefined) {
    const sha = (input.verify as string).trim()
    if (!isSha(sha)) return { error: verifyShaRefusal(sha) }
    const others = (['dryRun', 'replay', 'here', 'forceOverlap', 'scope', 'forbid', 'base', 'repo'] as const).some(k => input[k] !== undefined && input[k] !== false)
    return others ? { error: VERIFY_ALONE } : { id, dryRun: false, base: 'origin/main', verify: sha }
  }
  let base = 'origin/main'
  if (typeof input.base === 'string' && input.base !== '') {
    if (!isBaseRef(input.base)) return { error: `refused --base ${input.base}: use origin/main or a 7-40 character hex sha` }
    base = input.base
  }
  let scope: string[] | undefined
  let forbid: string[] | undefined
  for (const k of ['scope', 'forbid'] as const) {
    const raw = input[k]
    if (typeof raw !== 'string') continue
    const list = globList(`--${k}`, raw)
    if (!Array.isArray(list)) return list
    if (k === 'scope') scope = list
    else forbid = list
  }
  const replay = input.replay === true
  const repoIn = typeof input.repo === 'string' && input.repo.trim() !== '' ? input.repo.trim() : undefined
  if (repoIn === 'none') return { error: REPO_NONE }
  // MOD-44: the words keep their meaning (worktree is the default, here is `here`); anything else is a path, checked by the caller
  const here = input.here === true || repoIn === 'here'
  const repo = repoIn === 'here' || repoIn === 'worktree' ? undefined : repoIn
  if (replay && !isSha(base)) return { error: REPLAY_NEEDS_BASE }
  if (replay && here) return { error: HERE_NO_REPLAY }
  if (repo !== undefined && replay) return { error: REPO_NO_REPLAY }
  if (repo !== undefined && here) return { error: REPO_NO_HERE }
  return {
    id,
    dryRun: input.dryRun === true,
    base,
    ...(replay ? { replay: true as const } : {}),
    ...(scope ? { scope } : {}),
    ...(forbid ? { forbid } : {}),
    ...(here ? { here: true as const } : {}),
    ...(repo !== undefined ? { repo } : {}),
    ...(input.forceOverlap === true ? { forceOverlap: true as const } : {}),
  }
}

/** MOD-141: the refusal when a worker on the task is live and the brief it reads would change. */
export const liveBriefRefusal = (id: string, briefPath: string): string =>
  `/dispatch ${id}: a worker on ${id} is live and reads ${briefPath}; its brief is not rewritten under it. Wait for its hand-back, then dispatch again`

/**
 * MOD-141: why a brief on disk is rewritten: `--scope applied` / `--forbid applied` when that flag was passed and the
 * header field differs, and `the card changed` when the text still differs once the flagged fields are made equal.
 */
export function rewriteReasonsOf(old: string, next: string, scopeFlag: boolean, forbidFlag: boolean): string {
  // scope runs to the forbid field, forbid to the next field (a prose scope may hold spaces)
  const list = (key: string) => new RegExp(key === 'scope' ? '(\\sscope=)(.*?)(?= forbid=)' : '(\\sforbid=)(.*?)(?=\\s[a-z_]+=|\\]\\]$)')
  const reasons: string[] = []
  let same = old
  for (const [key, flagged, label] of [['scope', scopeFlag, '--scope applied'], ['forbid', forbidFlag, '--forbid applied']] as const) {
    const a = list(key).exec(parseHeader(same)?.raw ?? '')
    const b = list(key).exec(parseHeader(next)?.raw ?? '')
    if (!flagged || !a || !b || a[2] === b[2]) continue
    reasons.push(label)
    const h = parseHeader(same)
    if (h) same = same.replace(h.raw, h.raw.replace(list(key), (_m, k: string) => `${k}${b[2]}`))
  }
  if (same !== next || reasons.length === 0) reasons.unshift('the card changed')
  return reasons.join(', ')
}
