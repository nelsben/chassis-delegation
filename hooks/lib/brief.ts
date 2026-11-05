// Brief header + amend parsing and report-block extraction. Pure: no `$`.
//
// The grammar is chassis.brief.v1 and chassis.report.v1 (the README's
// "Contracts"; the same grammar the original shell verifier read): a value runs to
// the next RECOGNIZED field marker, so a value may hold spaces (red_test=cd x
// && npx vitest run y); a value written in double quotes runs to its closing
// quote, so field-looking text inside the quotes stays in the value.

import { globMatches } from './verify-native'
import { contained } from './scopetree'
import { sha256Text } from './land'

export const BRIEF_FIELDS = [
  'v', 'task', 'subtask', 'purpose', 'tier', 'model', 'scope', 'forbid', 'parent_scope', 'scope_globs', 'forbid_globs',
  'red_test', 'gate', 'spend', 'budget', 'report', 'repo', 'base', 'ignore', 'outdir', 'scratch', 'resources', 'allow', 'context', 'note',
] as const

/**
 * `red=` (GH-20): the red test's failing output, a path relative to the worker's tree, or `none`.
 * `artefacts=` and `metrics=` (MOD-22): what a research card delivered outside the repo, and numbers worth recording.
 */
export const REPORT_FIELDS = ['v', 'task', 'card', 'id', 'subtask', 'branch', 'pr', 'sha', 'gate', 'red', 'files', 'artefacts', 'metrics', 'tokens', 'note'] as const

export type BriefHeader = {
  /** The header as written, `[[brief` to `]]`. */
  raw: string
  fields: Record<string, string>
  task?: string
  subtask: string
  purpose: string
  tier?: string
  model?: string
  gate?: string
  budget?: string
  /** GH-106: the per-attempt spend ceiling in dollars, as written. */
  spend?: string
  repo?: string
}

export type Report = Partial<Record<(typeof REPORT_FIELDS)[number], string>>

export type Amend = { ops: string[]; reason: string }
export type AmendParse = { amends: Amend[]; malformed?: string }

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** MOD-98: the header fields that hold a comma list of paths or globs, where an entry may be written in double quotes. */
export const LIST_FIELDS = ['scope', 'forbid', 'parent_scope', 'scope_globs', 'forbid_globs', 'ignore'] as const

/**
 * MOD-98: a list entry that is a path or glob holding a space (`Old Stuff/**`, `My Docs/n.md`), as opposed to prose
 * (`any copy text`): it names a folder (a slash), a glob (`* ? [`) or a file (an extension), and nothing else odd.
 */
export const isSpacedPath = (e: string): boolean =>
  /\s/.test(e) && e === e.trim() && !/\s\s|\s\/|\/\s/.test(e) && /^[A-Za-z0-9_.@%+=:/~ *?[\]{}!^()&'-]+$/.test(e) && (e.includes('/') || /[*?[]/.test(e) || /\.[A-Za-z0-9]+$/.test(e))

/** MOD-98: a header list as written: an entry that is a spaced path goes in double quotes, every other entry as it is. */
export const listForHeader = (entries: readonly string[]): string => entries.map(e => (isSpacedPath(e) ? `"${e}"` : e)).join(',')

/** MOD-98: the entries of a header list value, comma-separated outside double quotes, a quoted entry without its quotes. */
function listEntries(value: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuote = false
  for (const c of value) {
    if (c === '"') inQuote = !inQuote
    else if (c === ',' && !inQuote) {
      out.push(cur)
      cur = ''
    } else cur += c
  }
  out.push(cur)
  return out
}

/**
 * Splits `k=v k2=v two words k3="quoted v"` into fields. A field starts at a
 * `key=` that follows whitespace (or the start); an unquoted value ends at the
 * next whitespace + known key + `=`; the LAST field (`note=` by contract) runs
 * to the end.
 */
export function parseFields(body: string, known: readonly string[]): Record<string, string> {
  const out: Record<string, string> = {}
  const keys = [...known].sort((a, b) => b.length - a.length).map(escapeRe).join('|')
  const marker = new RegExp(`(?:^|\\s)(${keys})=`, 'g')
  const lead = /^\s*([A-Za-z_][A-Za-z0-9_]*)=/
  let rest = body
  while (rest.length > 0) {
    const m = lead.exec(rest)
    if (!m) break
    const key = m[1] as string
    let after = rest.slice(m[0].length)
    let value: string
    const isList = (LIST_FIELDS as readonly string[]).includes(key)
    const quoted = after.startsWith('"') && !isList ? /^"([\s\S]*?)"(?=\s|$)/.exec(after) : null
    if (isList) {
      // MOD-98: a list runs to the next marker outside double quotes; its quoted entries are read whole
      marker.lastIndex = 0
      let cut = -1
      let first = -1
      for (let next = marker.exec(after); next; next = marker.exec(after)) {
        if (first < 0) first = next.index
        if (after.slice(0, next.index).split('"').length % 2 === 1) {
          cut = next.index
          break
        }
      }
      // quotes that never balance (a stray one in prose) fall back to the first marker
      if (cut < 0) cut = first < 0 ? after.length : first
      const raw = after.slice(0, cut).trim()
      value = raw.includes('"') ? listEntries(raw).map(e => e.trim()).join(',') : raw
      after = after.slice(cut)
    } else if (quoted) {
      value = quoted[1] as string
      after = after.slice(quoted[0].length)
    } else if (key === 'note') {
      value = after
      after = ''
    } else {
      marker.lastIndex = 0
      const next = marker.exec(after)
      const cut = next ? next.index : after.length
      value = after.slice(0, cut)
      after = after.slice(cut)
    }
    if (!(key in out)) out[key] = value.trim()
    rest = after
  }
  return out
}

/** The first `[[brief …]]` header in the text: it ends at the first `]]` that closes a line. */
export function parseHeader(text: string): BriefHeader | undefined {
  const m = /\[\[brief(\s[\s\S]*?)\]\](?=[ \t]*(?:\r?\n|$))/.exec(text)
  if (!m) return undefined
  const fields = parseFields((m[1] as string).replace(/\s+/g, ' ').trim(), BRIEF_FIELDS)
  const opt = (k: string) => (fields[k] !== undefined && fields[k] !== '' ? fields[k] : undefined)
  return {
    raw: m[0],
    fields,
    task: opt('task'),
    subtask: opt('subtask') ?? 'main',
    purpose: opt('purpose') ?? 'build',
    tier: opt('tier'),
    model: opt('model'),
    gate: opt('gate'),
    budget: opt('budget'),
    spend: opt('spend'),
    repo: opt('repo'),
  }
}

/**
 * MOD-2: set or replace one field in the brief header, everything else
 * (the rest of the header, amend blocks, the body) byte-identical. A new
 * field goes before `spend=`/`budget=`, where dispatch renders `base=`; a
 * replaced one keeps its place. `previous` is the value it replaced. Text with
 * no header comes back as it was.
 */
export function setHeaderField(text: string, key: string, value: string): { text: string; previous?: string } {
  const h = parseHeader(text)
  if (!h) return { text }
  const at = text.indexOf(h.raw)
  const prior = h.fields[key]
  let raw: string
  if (prior !== undefined) {
    const hit = new RegExp(`(\\s${key}=)(?:"[^"]*"|\\S*)`).exec(h.raw)
    if (!hit) return { text }
    // MOD-268: a value with whitespace, or one that was quoted, is written in double quotes
    const shown = /\s/.test(value) || hit[0].endsWith('"') ? `"${value.replace(/"/g, "'")}"` : value
    raw = h.raw.slice(0, hit.index) + hit[1] + shown + h.raw.slice(hit.index + hit[0].length)
  } else {
    const budget = h.raw.lastIndexOf(' budget=')
    const spend = /\sspend=\S+(?=\s+budget=)/.exec(h.raw.slice(0, budget < 0 ? 0 : budget + 8))
    const cut = spend ? spend.index : budget >= 0 ? budget : h.raw.length - 2
    raw = `${h.raw.slice(0, cut)} ${key}=${/\s/.test(value) ? `"${value.replace(/"/g, "'")}"` : value}${h.raw.slice(cut)}`
  }
  return { text: text.slice(0, at) + raw + text.slice(at + h.raw.length), ...(prior !== undefined && prior !== '' ? { previous: prior } : {}) }
}

/**
 * What a header still lacks to stand as its own brief (GH-6): a task, a
 * scope (`scope=` or `scope_globs=`) and a gate (`gate=` or `repo=none`).
 * Empty when it is complete.
 */
export function inlineHeaderMissing(h: BriefHeader): string[] {
  const has = (k: string) => (h.fields[k] ?? '').trim() !== ''
  return [
    ...(h.task ? [] : ['task=']),
    ...(has('scope') || has('scope_globs') ? [] : ['scope= (or scope_globs=)']),
    ...(h.gate || h.repo === 'none' ? [] : ['gate= (or repo=none)']),
  ]
}

/** The unverified note of a spawn that has no brief file; `why` says what kept an inline header from becoming one. */
export const noBriefLine = (why?: string): string => `note: no brief file named in the prompt${why ? `; ${why}` : ''}; verify skipped`

/** `why` for an incomplete inline header: the fields it lacks. */
export const lacksLine = (missing: readonly string[]): string => `the inline header lacks ${missing.join(' and ')}`

/**
 * The first `….brief.md` path the text names: an absolute one wins (MOD-135: else the first relative one, such as
 * `.delegation/briefs/T-1.brief.md` or `./.delegation/briefs/T-1.brief.md`), with the same delimiters for both.
 */
export function findBriefPath(text: string): string | undefined {
  // MOD-268: a quoted absolute path may hold spaces
  const quoted = /(["'`])(\/[^"'`\n]*?\.brief\.md)\1/.exec(text)
  if (quoted) return quoted[2] as string
  const abs = /(?:^|[\s"'`(<[])(\/[^\s"'`<>()[\]]*?\.brief\.md)(?![A-Za-z0-9_-])/.exec(text)
  if (abs) return abs[1] as string
  // MOD-268: an unquoted absolute path with single spaces inside a segment, never a space before a `/` (that starts another path)
  const spaced = /(?:^|[\s"'`(<[])(\/(?:[^\s"'`<>()[\]]| (?![\s/]))*?\.brief\.md)(?![A-Za-z0-9_-])/.exec(text)
  if (spaced) return spaced[1] as string
  const rel = /(?:^|[\s"'`(<[])([^\s"'`<>()[\]/][^\s"'`<>()[\]]*?\.brief\.md)(?![A-Za-z0-9_-])/.exec(text)
  return rel ? (rel[1] as string) : undefined
}

/**
 * MOD-273: the prompt hands the brief at `path` only in the spawnPrompt form, `Your brief is the file <path>.` (the path bare
 * or in backticks); a path cited anywhere else in the prompt is a mention.
 */
export function briefHanded(prompt: string, path: string): boolean {
  const esc = path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp('Your brief is the file\\s+(`?)' + esc + '\\1\\.(?![A-Za-z0-9_-])').test(prompt)
}

/**
 * MOD-135: a brief path as a file to read. An absolute path stands; a relative one is read from the spawn's folder,
 * else the session root, and is refused (undefined) when `..` climbs out of that folder.
 */
export function resolveBriefPath(path: string, cwd: string | undefined, root: string): string | undefined {
  if (path.startsWith('/')) return path
  const base = (cwd && cwd.startsWith('/') ? cwd : root).replace(/\/+$/, '')
  const kept: string[] = []
  for (const seg of path.split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (kept.length === 0) return undefined
      kept.pop()
    } else kept.push(seg)
  }
  return kept.length === 0 ? undefined : `${base}/${kept.join('/')}`
}

/**
 * `[[amend v=1 scope+=… scope-=… forbid+=… forbid-=… ignore+=… reason=…]]`
 * blocks, the verifier's grammar (plus GH-16's `ignore+=`, globs a repo=here
 * delta drops): line-anchored, applied in file order; one bad block makes the
 * whole set malformed (the verifier then applies none).
 */
export function parseAmends(text: string): AmendParse {
  const blocks: string[] = []
  let buf: string | undefined
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (buf !== undefined) {
      buf += ' ' + line
      if (line.includes(']]')) {
        if (!line.endsWith(']]')) return { amends: [], malformed: 'a block has trailing text after its closing brackets' }
        blocks.push(buf)
        buf = undefined
      }
      continue
    }
    if (line.startsWith('[[amend')) {
      if (line.includes(']]')) {
        if (!line.endsWith(']]')) return { amends: [], malformed: 'a block has trailing text after its closing brackets' }
        blocks.push(line)
      } else buf = line
    }
  }
  if (buf !== undefined) return { amends: [], malformed: 'an amend block was opened and never closed' }
  const amends: Amend[] = []
  for (const block of blocks) {
    const body = block.slice('[[amend'.length, -2).replace(/\t/g, ' ')
    const at = body.indexOf(' reason=')
    const reason = at >= 0 ? body.slice(at + ' reason='.length).trim() : ''
    const ahead = at >= 0 ? body.slice(0, at) : body
    let version = false
    const ops: string[] = []
    for (const tok of ahead.split(/\s+/).filter(Boolean)) {
      if (tok === 'v=1') version = true
      else if (tok.startsWith('v=')) return { amends: [], malformed: `unknown amend version '${tok}'` }
      else if (/^(scope|forbid)[+-]=/.test(tok) || tok.startsWith('ignore+=')) {
        if (tok.split('=').slice(1).join('=') === '') return { amends: [], malformed: `empty value in operation '${tok}'` }
        ops.push(tok)
      } else return { amends: [], malformed: `unrecognized token '${tok}' (allowed: v, scope+=, scope-=, forbid+=, forbid-=, ignore+=, reason)` }
    }
    if (!version) return { amends: [], malformed: "a block is missing 'v=1'" }
    if (ops.length === 0) return { amends: [], malformed: 'a block carries no scope/forbid/ignore operation' }
    if (!reason) return { amends: [], malformed: "a block is missing a non-empty 'reason='" }
    amends.push({ ops, reason })
  }
  return { amends }
}

/** One `[[amend v=1 …]]` block from a worker's hand-back, as the brief will carry it. */
export type HandbackAmend = Amend & { block: string }

/**
 * The amend blocks a hand-back carries, in order, read the way the verifier
 * reads a brief: a block starts its own line (leading whitespace allowed) and
 * may wrap until its closing `]]`; a block quoted mid-line is prose, never an
 * amend. A wrapped block is joined with single spaces, as the verifier
 * normalizes it. Each block is checked alone with `parseAmends`: a malformed
 * one is set aside with its reason (appending it would make the verifier
 * discard every amendment in the brief). A block repeated in the text is
 * taken once.
 */
export function extractAmendBlocks(text: string): { amends: HandbackAmend[]; malformed: { block: string; why: string }[] } {
  const raw: string[] = []
  const malformed: { block: string; why: string }[] = []
  let buf: string | undefined
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim()
    if (buf !== undefined) {
      buf += ' ' + line
      if (line.includes(']]')) {
        if (line.endsWith(']]')) raw.push(buf)
        else malformed.push({ block: buf, why: 'a block has trailing text after its closing brackets' })
        buf = undefined
      }
      continue
    }
    if (!line.startsWith('[[amend')) continue
    if (!line.includes(']]')) buf = line
    else if (line.endsWith(']]')) raw.push(line)
    else malformed.push({ block: line, why: 'a block has trailing text after its closing brackets' })
  }
  if (buf !== undefined) malformed.push({ block: buf, why: 'an amend block was opened and never closed' })
  const amends: HandbackAmend[] = []
  for (const block of raw) {
    if (amends.some(a => a.block === block) || malformed.some(m => m.block === block)) continue
    const parsed = parseAmends(block)
    const one = parsed.amends[0]
    if (parsed.malformed !== undefined || !one) malformed.push({ block, why: parsed.malformed ?? 'not an amend block' })
    else amends.push({ block, ops: one.ops, reason: one.reason })
  }
  return { amends, malformed }
}

/**
 * True for a block that takes anything away (`scope-=` or `forbid-=`), or that
 * hides paths from the check (`ignore+=`): it is never appended on the
 * worker's word. `scope+=` (a path the worker had to touch) and `forbid+=`
 * (less freedom) apply on their own.
 */
export const amendNeedsApproval = (a: Amend, forbid: readonly string[] = []): boolean =>
  a.ops.some(op => /^(scope|forbid)-=|^ignore\+=/.test(op)) || amendScopeInsideForbid(a, forbid).length > 0

/** MOD-170: whether a worker's `scope+=` applies on its word (apply), only for new files beside paths in scope (new-files), or waits for the lead (ask). */
export type ScopeAmends = 'apply' | 'new-files' | 'ask' | 'within-parent'
export const SCOPE_AMENDS_MODES: readonly ScopeAmends[] = ['apply', 'new-files', 'ask', 'within-parent']

/** MOD-196: the brief header's parent_scope= globs, or [] when the header names none. */
export const parentScopeOf = (briefText: string): string[] =>
  (parseHeader(briefText)?.fields.parent_scope ?? '').split(',').map(s => s.trim()).filter(Boolean)

/** MOD-170: the paths of a block's `scope+=` operations, in order. */
export const amendScopePaths = (a: Amend): string[] =>
  a.ops.filter(op => op.startsWith('scope+=')).flatMap(op => op.slice('scope+='.length).split(',').filter(Boolean))

const hasWildcard = (p: string): boolean => /[*?[]/.test(p)

/**
 * MOD-170: whether a (literal) path sits in a folder a scope entry already names: the folder of a listed
 * file, or the folder holding the fixed prefix of a listed glob (`hooks/lib/**` names `hooks/lib/`).
 * A path that is itself a glob never does.
 */
export function inScopeFolder(path: string, scope: readonly string[]): boolean {
  if (path === '' || hasWildcard(path)) return false
  const dirOf = (p: string): string => p.slice(0, p.lastIndexOf('/') + 1)
  const folder = dirOf(path)
  return scope.some(entry => {
    if (entry === '') return false
    const wild = entry.search(/[*?[]/)
    // a glob names the folder its fixed prefix sits in; a listed file or `dir/` names its own folder
    const dir = wild < 0 ? (entry.endsWith('/') ? entry : dirOf(entry)) : dirOf(entry.slice(0, wild))
    if (wild < 0) return dir === folder
    return dir === '' ? false : folder.startsWith(dir)
  })
}

/**
 * MOD-170: whether a `scope+=` block waits for approval under scopeAmends. `apply`: never; `ask`: always;
 * `new-files`: unless every path it names is a literal path that did not exist at the base ('new') and
 * sits in a folder the scope already names. `within-parent` (MOD-196): unless the brief's parent_scope= is non-empty
 * and every path sits inside it (scopetree's `contained`). `base` gives each path's state; a path it does not know
 * (a git error) holds the block. A block with no `scope+=` is never held by this rule.
 */
export function scopeAmendHeld(a: Amend, mode: ScopeAmends, scope: readonly string[], base: ReadonlyMap<string, 'new' | 'exists' | 'error'>, parentScope: readonly string[] = []): boolean {
  const paths = amendScopePaths(a)
  if (paths.length === 0 || mode === 'apply') return false
  if (mode === 'ask') return true
  // MOD-196: within-parent applies only when the parent's scope is known and every path sits inside it; no parent scope behaves as ask
  if (mode === 'within-parent') return !(parentScope.length > 0 && paths.every(p => contained(p, parentScope)))
  return !paths.every(p => !hasWildcard(p) && base.get(p) === 'new' && inScopeFolder(p, scope))
}

/**
 * The first forbid glob that entirely covers a scope entry, or undefined.
 * Forbid wins over scope, so such an entry can never be touched. Conservative:
 * a literal path is covered when the forbid matches it; a glob when its literal
 * prefix (up to the first wildcard) is non-empty, the forbid matches that prefix,
 * and the forbid ends in a wildcard or `/` (so it matches every extension of it).
 */
export function forbidCovering(entry: string, forbid: readonly string[]): string | undefined {
  const wild = entry.search(/[*?[]/)
  const prefix = wild < 0 ? entry : entry.slice(0, wild)
  if (prefix === '') return undefined
  return forbid.find(f => f !== '' && globMatches(prefix, f) && (wild < 0 || /[*/]$/.test(f)))
}

/** The scope entries a forbid glob entirely covers (see forbidCovering). */
export const scopeInsideForbid = (scope: readonly string[], forbid: readonly string[]): string[] =>
  scope.filter(e => forbidCovering(e, forbid) !== undefined)

/**
 * GH-16: the first pair of scope globs, one from each card, that overlap: one
 * glob's literal prefix matches the other glob (forbidCovering's conservative
 * rule, tried both ways). Undefined when no pair does. Two repo=here workers
 * whose scopes overlap would both claim the same paths of the shared checkout.
 */
export function scopeOverlap(mine: readonly string[], theirs: readonly string[]): { mine: string; theirs: string } | undefined {
  for (const a of mine) {
    for (const b of theirs) {
      if (a === '' || b === '') continue
      if (forbidCovering(a, [b]) !== undefined || forbidCovering(b, [a]) !== undefined) return { mine: a, theirs: b }
    }
  }
  return undefined
}

/** MOD-23: a resource name is one plain word, safe in a card's list and in the header (no space, comma, quote or bracket). */
export const RESOURCE_NAME = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,63}$/

/** MOD-23: the resources the header's `resources=` names (a comma list), each once; none when the field is absent or empty. */
export function resourcesOf(h: Pick<BriefHeader, 'fields'> | undefined): string[] {
  const out: string[] = []
  for (const part of (h?.fields.resources ?? '').split(',')) {
    const name = part.trim()
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}

/** MOD-23: the first resource two lists share, or undefined. Two attempts that share one cannot run at once. */
export const sharedResource = (mine: readonly string[], theirs: readonly string[]): string | undefined => mine.find(r => theirs.includes(r))

/** Each `scope+=` path of the block that lies inside a forbid glob, with that glob. */
export function amendScopeInsideForbid(a: Amend, forbid: readonly string[]): { path: string; forbid: string }[] {
  const out: { path: string; forbid: string }[] = []
  for (const op of a.ops) {
    if (!op.startsWith('scope+=')) continue
    for (const path of op.slice('scope+='.length).split(',').filter(Boolean)) {
      const f = forbidCovering(path, forbid)
      if (f !== undefined) out.push({ path, forbid: f })
    }
  }
  return out
}

/** The verdict row for a `scope+=` held back because it lies inside a forbid. */
export const amendInsideForbidLine = (p: { path: string; forbid: string }): string =>
  `amend needs approval: scope+=${p.path} lies inside forbid ${p.forbid}; scope+= alone does nothing, shrink the forbid`

/**
 * MOD-227 (#304): the scope entries a forbid entry or glob covers, each with the forbid and where that forbid came
 * from (`originOf(forbid)`: '' for the card's own, else 'repo config' or 'sibling card <ID>'). Forbid wins over scope,
 * so a worker could never touch such an entry; it is knowable when the brief is built.
 */
export function scopeForbidClashes(
  scope: readonly string[],
  forbid: readonly string[],
  originOf: (forbid: string) => string = () => '',
): { entry: string; forbid: string; origin: string }[] {
  const out: { entry: string; forbid: string; origin: string }[] = []
  for (const entry of scope) {
    // the card's own forbid is named before any other: that is the one it can fix itself
    const hits = forbid.filter(f => forbidCovering(entry, [f]) !== undefined)
    const f = hits.find(h => originOf(h) === '') ?? hits[0]
    if (f !== undefined) out.push({ entry, forbid: f, origin: originOf(f) })
  }
  return out
}

/** MOD-227: the one line for a clash; `origin` ('repo config', 'sibling card MOD-9') is named when the forbid is not the card's own. */
export const scopeForbidClashLine = (entry: string, forbid: string, origin = ''): string =>
  `scope ${entry} is under forbid ${forbid}${origin !== '' ? ` (from ${origin})` : ''} \u2014 drop the forbid, narrow it, or drop the scope path`

/**
 * Appends each block to the brief on its own line, in order (append-only: the
 * header and body are never rewritten), skipping a block the brief already
 * holds, the brief's own blocks read the same way as the hand-back's.
 */
export function appendAmends(brief: string, blocks: readonly string[]): { text: string; added: string[] } {
  const held = new Set(briefAmendBlocks(brief))
  let text = brief
  const added: string[] = []
  for (const block of blocks) {
    if (held.has(block)) continue
    text = (text === '' || text.endsWith('\n') ? text : text + '\n') + block + '\n'
    held.add(block)
    added.push(block)
  }
  return { text, added }
}

/** Every line-anchored amend block text in a brief, malformed or not. */
function briefAmendBlocks(brief: string): string[] {
  const found = extractAmendBlocks(brief)
  return [...found.amends.map(a => a.block), ...found.malformed.map(m => m.block)]
}

/** A comma list after the amendments for `key` (`scope`, `forbid` or `ignore`), entries compared literally. */
export function effectiveList(base: string, amends: readonly Amend[], key: 'scope' | 'forbid' | 'ignore'): string {
  let list = base.split(',').filter(Boolean)
  for (const amend of amends) {
    for (const op of amend.ops) {
      const add = op.startsWith(`${key}+=`)
      const del = op.startsWith(`${key}-=`)
      if (!add && !del) continue
      const items = op.slice(key.length + 2).split(',').filter(Boolean)
      list = add ? [...list, ...items.filter(i => !list.includes(i))] : list.filter(i => !items.includes(i))
    }
  }
  return list.join(',')
}

// ---- MOD-293 (#389, #393): a scope the brain grants is written into the brief --------------------------

/** MOD-293: whether a literal path is inside a scope list: named by an entry, or matched by an entry's glob. */
export const pathInScope = (path: string, scope: readonly string[]): boolean => scope.some(e => e !== '' && (e === path || globMatches(path, e)))

/**
 * MOD-293: the paths of a hand-back block that asks only for `scope+=` paths the brief header's scope already holds
 * (because the brain granted them): they need no approval and no refute. Undefined when the block carries any other
 * operation, or any path outside the scope.
 */
export function grantedPaths(a: Amend, scope: readonly string[]): string[] | undefined {
  if (a.ops.length === 0 || !a.ops.every(op => op.startsWith('scope+='))) return undefined
  const paths = amendScopePaths(a)
  return paths.length > 0 && paths.every(p => pathInScope(p, scope)) ? paths : undefined
}

export type GrantResult = { ok: true; text: string; lines: string[] } | { ok: false; error: string }

/** MOD-293: the refusal for a `scope+=` path under a forbid entry the grant does not lift. */
export const grantUnderForbidLine = (path: string, entry: string): string => `scope+=${path} is under forbid ${entry}; add forbid-=${entry} to lift it`

/**
 * MOD-293: the brain's grant (`scope+=a b/c.ts forbid-=d/**`, amend tokens) applied to a brief's text. The tokens are
 * parsed as one amend block with `reason=brain grant`. A `scope+=` path under a forbid entry (the header's, the brief's
 * amends applied, this grant's own `forbid-=` lifting) is refused naming the entry, and nothing is written. Else the block
 * is appended on its own line and the header's `scope=`/`forbid=` are rewritten to the result.
 */
export function applyGrant(brief: string, amend: string): GrantResult {
  const header = parseHeader(brief)
  if (!header) return { ok: false, error: 'the brief has no [[brief ...]] header' }
  const block = `[[amend v=1 ${amend.trim().replace(/\s+/g, ' ')} reason=brain grant]]`
  const parsed = parseAmends(block)
  const one = parsed.amends[0]
  if (parsed.malformed !== undefined || !one) return { ok: false, error: `amend refused: ${parsed.malformed ?? 'not an amend'} (use scope+=<path> forbid-=<glob>)` }
  const scopeKey = header.fields.scope !== undefined || header.fields.scope_globs === undefined ? 'scope' : 'scope_globs'
  const forbidKey = header.fields.forbid !== undefined || header.fields.forbid_globs === undefined ? 'forbid' : 'forbid_globs'
  const held = parseAmends(brief).amends
  const scopeNow = effectiveList(header.fields[scopeKey] ?? '', held, 'scope')
  const forbidNow = effectiveList(header.fields[forbidKey] ?? '', held, 'forbid')
  const forbidAfter = effectiveList(forbidNow, [one], 'forbid')
  const forbidList = forbidAfter.split(',').filter(Boolean)
  for (const path of amendScopePaths(one)) {
    const entry = forbidCovering(path, forbidList)
    if (entry !== undefined) return { ok: false, error: grantUnderForbidLine(path, entry) }
  }
  const scopeAfter = effectiveList(scopeNow, [one], 'scope')
  let text = brief
  if (scopeAfter !== scopeNow) text = setHeaderField(text, scopeKey, listForHeader(scopeAfter.split(',').filter(Boolean))).text
  if (forbidAfter !== forbidNow && (header.fields[forbidKey] !== undefined || forbidAfter !== '')) text = setHeaderField(text, forbidKey, listForHeader(forbidList)).text
  const appended = appendAmends(text, [block])
  return { ok: true, text: appended.text, lines: appended.added.length > 0 ? appended.added : [block] }
}

/**
 * The LAST `[[report …]]` block of a hand-back. It ends at the first `]]`
 * that closes a line (so a note holding `]]` mid-line stays whole), else at
 * the first `]]`.
 */
export function extractReport(text: string): string | undefined {
  const start = text.lastIndexOf('[[report')
  if (start < 0) return undefined
  const tail = text.slice(start)
  const lineEnd = /^\[\[report[\s\S]*?\]\](?=[ \t]*(?:\r?\n|$))/.exec(tail)
  if (lineEnd) return lineEnd[0]
  const close = tail.indexOf(']]')
  return close >= 0 ? tail.slice(0, close + 2) : undefined
}

export function parseReport(block: string): Report {
  const body = block.replace(/^\[\[report/, '').replace(/\]\]$/, '').replace(/\s+/g, ' ').trim()
  const r = parseFields(body, REPORT_FIELDS) as Report
  // MOD-211 (#271): card= and id= are read for task= (task= wins; an empty one is skipped)
  const task = [r.task, r.card, r.id].find(v => v !== undefined && v.trim() !== '')
  return task !== undefined ? { ...r, task: task.trim() } : r
}

/** `budget=<n>-attempts` → n (n ≥ 1); anything else (`frontier-60m`, absent) → the fallback. */
export function parseBudget(value: string | undefined, fallback: number): number {
  const m = /^(\d+)-attempts$/.exec((value ?? '').trim())
  const n = m ? Number(m[1]) : NaN
  return Number.isInteger(n) && n >= 1 ? n : fallback
}

/**
 * GH-1 item 6: the line for a budget written but not in the grammar (a
 * chassis `frontier-60m`, `0-attempts`), which parseBudget quietly replaces
 * by the fallback; undefined when the budget is absent or well formed. The
 * tier part of a `<tier>-<minutes>m` budget is never taken as the tier.
 */
export function budgetWarning(value: string | undefined, fallback: number): string | undefined {
  const v = (value ?? '').trim()
  if (v === '' || parseBudget(v, 0) >= 1) return undefined
  return `warning: budget "${v}" is not <n>-attempts; using the default ${fallback}`
}

/** GH-106: `spend=<usd>` → dollars (0 or more); absent or off the grammar → undefined (no ceiling). */
export function spendOf(h: Pick<BriefHeader, 'spend'> | undefined): number | undefined {
  const v = h?.spend?.trim().replace(/^\$/, '')
  if (v === undefined || !/^\d+(\.\d+)?$/.test(v)) return undefined
  const n = Number(v)
  return Number.isFinite(n) && n > 0 ? n : undefined
}

/** MOD-295: the report format the mod checks the fields of (sha=, branch=, red=). */
export const MOD_REPORT_FORMAT = 'chassis.report.v1'

/**
 * MOD-295: the header's report= value when it names a format other than the mod's own (a repo's
 * `<repo>.report.v1`), else undefined (absent, empty or chassis.report.v1). The mod does not check that
 * format's fields, so the verifier says so instead of refuting the report on them.
 */
export function foreignReportFormat(briefText: string): string | undefined {
  const value = (parseHeader(briefText)?.fields.report ?? '').trim()
  return value === '' || value === MOD_REPORT_FORMAT ? undefined : value
}

/** MOD-295: the verdict line for a report in a foreign format. */
export const notCheckedLine = (format: string): string => `report format ${format}: fields not checked by the mod`

// ---- MOD-308 (#395): the brief's hash on the ledger rows ----------------------------------------------

/** MOD-308: the first 12 hex characters of the sha-256 of a brief's text: the brief version a ledger row was written against. */
export const briefHash = (text: string): string => sha256Text(text).slice(0, 12)
