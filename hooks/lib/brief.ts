// Brief header + amend parsing and report-block extraction. Pure: no `$`.
//
// The grammar is chassis.brief.v1 and chassis.report.v1 (the README's
// "Contracts"; the same grammar the original shell verifier read): a value runs to
// the next RECOGNIZED field marker, so a value may hold spaces (red_test=cd x
// && npx vitest run y); a value written in double quotes runs to its closing
// quote, so field-looking text inside the quotes stays in the value.

import { globMatches } from './verify-native'

export const BRIEF_FIELDS = [
  'v', 'task', 'subtask', 'purpose', 'tier', 'model', 'scope', 'forbid', 'scope_globs', 'forbid_globs',
  'red_test', 'gate', 'spend', 'budget', 'report', 'repo', 'base', 'ignore', 'context', 'note',
] as const

/** `red=` (GH-20): the red test's failing output, a path relative to the worker's tree, or `none`. */
export const REPORT_FIELDS = ['v', 'task', 'subtask', 'branch', 'pr', 'sha', 'gate', 'red', 'files', 'tokens', 'note'] as const

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
    const quoted = after.startsWith('"') ? /^"([\s\S]*?)"(?=\s|$)/.exec(after) : null
    if (quoted) {
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

/** The first absolute `….brief.md` path the text names. */
export function findBriefPath(text: string): string | undefined {
  const m = /(?:^|[\s"'`(<[])(\/[^\s"'`<>()[\]]*?\.brief\.md)(?![A-Za-z0-9_-])/.exec(text)
  return m ? (m[1] as string) : undefined
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

/** The dispatch warning for a scope entry a forbid covers. */
export const scopeInsideForbidWarning = (entry: string, forbid: string): string =>
  `warning: scope entry ${entry} is inside forbid ${forbid} and can never be touched; shrink the forbid (forbid-=) to allow it`

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
  return parseFields(body, REPORT_FIELDS) as Report
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
