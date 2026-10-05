// `/dispatch <TASK-ID>` (SPEC amendment 1 A): card frontmatter → brief header
// and body → worktree argv → spawn input. Pure: no `$`.
import { isBaseRef, isSha, isTaskId } from './allow'
import { parseBudget } from './brief'
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
  /** GH-16: `repo: here` dispatches into the session's own checkout (no worktree). */
  repo?: string
  /** The card's markdown below the frontmatter, verbatim. */
  body: string
  fields: Record<string, FieldValue>
}

export const USAGE = 'usage: /dispatch <TASK-ID> [--dry-run] [--base <origin/main|sha>] [--replay --base <sha>] [--scope <globs>] [--forbid <globs>] [--here] [--force-overlap]'
export const REPLAY_NEEDS_BASE = 'refused --replay without --base <sha>: a replay reads the card at the commit where it was still queued'
export const HERE_NO_REPLAY = 'refused --here with --replay: a replay works in its own worktree at the base commit'

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

function unquote(raw: string): string {
  const v = raw.trim()
  if (v.startsWith('"') && v.endsWith('"') && v.length >= 2) {
    return v.slice(1, -1).replace(/\\(["\\nt])/g, (_, c: string) => (c === 'n' ? '\n' : c === 't' ? '\t' : c))
  }
  if (v.startsWith("'") && v.endsWith("'") && v.length >= 2) return v.slice(1, -1).replace(/''/g, "'")
  return v.replace(/\s+#.*$/, '')
}

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
    repo: asText(f.repo).trim() || undefined,
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

/** True when a scope entry is prose, not a glob: the verifier refuses such a scope (BRIEF-SCOPE-PROSE) unless scope_globs= is added. */
export const scopeLooksProse = (scope: readonly string[]): boolean => scope.some(s => /\s/.test(s))

const oneLine = (s: string): string => s.replace(/\s+/g, ' ').trim()

/**
 * The brief header, exactly as SPEC amendment 1 A writes it. `scope` and
 * `forbid`, when given (from `/dispatch --scope/--forbid`), replace the card's.
 * GH-16: a repo=here brief adds `repo=here`, `base=<ref>` when one is named,
 * and `ignore=<globs>` after the gate.
 */
export function renderHeader(input: {
  card: Card
  tier: string
  alias: string
  budget: number
  scope?: readonly string[]
  forbid?: readonly string[]
  repo?: string
  base?: string
  ignore?: readonly string[]
}): string {
  const c = input.card
  const scope = input.scope ?? c.scope
  const forbid = input.forbid ?? c.forbid
  const here =
    (input.repo ? ` repo=${input.repo}` : '') +
    (input.base ? ` base=${input.base}` : '') +
    (input.ignore && input.ignore.length > 0 ? ` ignore=${input.ignore.join(',')}` : '')
  return (
    `[[brief v=1 task=${c.id} subtask=main purpose=build tier=${input.tier} model=${input.alias}` +
    ` scope=${scope.map(oneLine).join(',')} forbid=${forbid.map(oneLine).join(',')}` +
    ` red_test="${oneLine(c.redTest).replace(/"/g, "'")}" gate=${c.gate.join(',')}${here}` +
    ` budget=${input.budget}-attempts report=chassis.report.v1]]`
  )
}

/**
 * GH-16: a template's mode sections. `{{#here}}…{{/here}}` is kept for a
 * repo=here brief and `{{#worktree}}…{{/worktree}}` otherwise; the other
 * section goes, markers and all (a marker's own line break with it).
 */
export function renderSections(template: string, here: boolean): string {
  const on = here ? 'here' : 'worktree'
  const off = here ? 'worktree' : 'here'
  return template
    .replace(new RegExp(`\\{\\{#${off}\\}\\}[\\s\\S]*?\\{\\{/${off}\\}\\}\\n?`, 'g'), '')
    .replace(new RegExp(`\\{\\{[#/]${on}\\}\\}\\n?`, 'g'), '')
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

/**
 * The brief body from the template: `{{id}} {{title}} {{domain}} {{worktree}}
 * {{branch}} {{cardPath}} {{redTest}} {{gate}} {{body}}`, plus `{{install}}`
 * (the lockfile's install step) and `{{extra}}` (the repo file's briefExtra).
 * GH-16: `here` keeps the template's `{{#here}}` sections (`{{worktree}}` is
 * then the shared checkout) and drops its `{{#worktree}}` ones; else the reverse.
 */
export function renderBrief(template: string, v: { card: Card; worktree: string; branch: string; cardPath: string; install?: string; extra?: string; here?: boolean }): string {
  const values: Record<string, string> = {
    install: v.install ?? "the repo's own install step, if a lockfile is present",
    extra: v.extra ?? '',
    id: v.card.id,
    title: v.card.title,
    domain: v.card.domain,
    worktree: v.worktree,
    branch: v.branch,
    cardPath: v.cardPath,
    redTest: v.card.redTest,
    gate: v.card.gateText,
    body: v.card.body,
  }
  return renderSections(template, v.here === true).replace(/\{\{(\w+)\}\}/g, (whole, key: string) => (key in values ? (values[key] as string) : whole))
}

export type DispatchArgs =
  | { id: string; dryRun: boolean; base: string; replay?: true; scope?: string[]; forbid?: string[]; here?: true; forceOverlap?: true; error?: undefined }
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
  for (let i = 0; i < tokens.length; i += 1) {
    const t = tokens[i] as string
    if (t === '--dry-run') dryRun = true
    else if (t === '--replay') replay = true
    else if (t === '--here') here = true
    else if (t === '--force-overlap') forceOverlap = true
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
  if (replay && !isSha(base)) return { error: REPLAY_NEEDS_BASE }
  if (replay && here) return { error: HERE_NO_REPLAY }
  return {
    id,
    dryRun,
    base,
    ...(replay ? { replay: true as const } : {}),
    ...(scope ? { scope } : {}),
    ...(forbid ? { forbid } : {}),
    ...(here ? { here: true as const } : {}),
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

/** The model-callable twin of /dispatch (SPEC part 2A): `$.tool.register`'s spec. */
export const DISPATCH_TOOL = {
  name: 'dispatch',
  description:
    "Dispatch a chassis task card to a worker: writes the brief from the card, cuts the worktree (or, with here, shares the session's own checkout), picks the tier and spawns. Pass scope/forbid globs when the card's are prose.",
  inputSchema: {
    type: 'object',
    properties: {
      task: { type: 'string', description: 'The task id, e.g. BE-101' },
      scope: { type: 'string', description: 'Comma-separated scope globs; replaces the card scope in the brief header' },
      forbid: { type: 'string', description: 'Comma-separated forbid globs; replaces the card forbid in the brief header' },
      replay: { type: 'boolean', description: 'Re-run a card already merged on main, read at base (needs a sha base)' },
      base: { type: 'string', description: 'origin/main (default) or a 7-40 hex sha to cut the worktree from' },
      dryRun: { type: 'boolean', description: 'Write the brief and print its header; no worktree, no spawn' },
      here: { type: 'boolean', description: "repo=here: no worktree and no fetch; the worker shares the session's own checkout" },
      forceOverlap: { type: 'boolean', description: "repo=here: dispatch even when the card's scope overlaps an in-flight card's" },
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
  for (const k of ['scope', 'forbid', 'base'] as const) {
    if (input[k] !== undefined && typeof input[k] !== 'string') return { error: `dispatch: ${k} must be a string` }
  }
  const id = task.trim()
  if (!isTaskId(id)) return { error: `refused task id ${id}` }
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
  const here = input.here === true
  if (replay && !isSha(base)) return { error: REPLAY_NEEDS_BASE }
  if (replay && here) return { error: HERE_NO_REPLAY }
  return {
    id,
    dryRun: input.dryRun === true,
    base,
    ...(replay ? { replay: true as const } : {}),
    ...(scope ? { scope } : {}),
    ...(forbid ? { forbid } : {}),
    ...(here ? { here: true as const } : {}),
    ...(input.forceOverlap === true ? { forceOverlap: true as const } : {}),
  }
}
