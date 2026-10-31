// MOD-215: tree import. Pure: the plan file validator, the preview lines, the counts, the folder rule, the batch option,
// the tool shape. No I/O, no gh; hooks/register.ts files the tree.
import { contained } from './scopetree'

export const TREE_TYPES = ['feature', 'epic', 'story', 'task'] as const
export type TreeType = (typeof TREE_TYPES)[number]
export const TREE_MAX_DEPTH = 4
export const SUB_ISSUE_CAP = 100
export const TREE_BATCH_DEFAULT = 20
export const TREE_IMPORT_USAGE = '/delegation tree import <file under .delegation/plans/> [--dry-run] [--confirm]'

export type TreeNode = {
  type: TreeType
  title: string
  paths: string[]
  note?: string
  /** Evidence the item was done before filing; it is closed with it once all its children are closed. */
  close?: string
  /** The issue number the file already holds for this item (the manifest). */
  issue?: number
  children: TreeNode[]
  /** The item path in the file, such as `items[2].children[0]`. */
  at: string
  /** The index path from the top list: [2, 0] is items[2].children[0]. */
  idx: number[]
}
export type TreePlan = { parent?: number; items: TreeNode[] }

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v)
const whole = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1

/** The plan file's text as the normalised tree, or every error with its item path. Nothing is filed on any error. */
export function parseTreePlan(source: string): { plan: TreePlan } | { errors: string[] } {
  let raw: unknown
  try {
    raw = JSON.parse(source)
  } catch (err) {
    return { errors: [`the file is not valid JSON: ${String(err instanceof Error ? err.message : err).slice(0, 200)}`] }
  }
  if (!isObj(raw)) return { errors: ['the file must hold a JSON object'] }
  const errors: string[] = []
  if (raw.version !== 1) errors.push('version must be 1')
  let parent: number | undefined
  if (raw.parent !== undefined && raw.parent !== null) {
    if (!whole(raw.parent)) errors.push('parent must be a whole number, 1 or more')
    else parent = raw.parent
  }
  const walk = (list: unknown[], base: string, depth: number, parentPaths: readonly string[], idx: number[]): TreeNode[] => {
    const out: TreeNode[] = []
    for (const [i, it] of list.entries()) {
      const at = `${base}[${i}]`
      const here = [...idx, i]
      if (!isObj(it)) {
        errors.push(`${at}: must be an object`)
        continue
      }
      if (depth > TREE_MAX_DEPTH) {
        errors.push(`${at}: nested deeper than ${TREE_MAX_DEPTH} levels`)
        continue
      }
      const before = errors.length
      const type = it.type as TreeType
      if (typeof it.type !== 'string' || !TREE_TYPES.includes(type)) errors.push(`${at}: type must be one of ${TREE_TYPES.join(', ')}`)
      const title = typeof it.title === 'string' ? it.title.replace(/\s+/g, ' ').trim() : ''
      if (title === '') errors.push(`${at}: needs a title`)
      let paths: string[] = []
      if (it.paths !== undefined && it.paths !== null) {
        if (!Array.isArray(it.paths) || it.paths.some(p => typeof p !== 'string')) errors.push(`${at}: paths must be a list of text`)
        else paths = (it.paths as string[]).map(p => p.trim()).filter(p => p !== '')
      }
      if (type === 'task' && paths.length === 0) errors.push(`${at}: a task needs at least one path`)
      if (parentPaths.length > 0) {
        const stray = paths.find(p => !contained(p, parentPaths))
        if (stray !== undefined) errors.push(`${at}: path ${stray} is outside the parent paths (${parentPaths.join(', ')})`)
      }
      let note = ''
      if (it.note !== undefined && it.note !== null) {
        if (typeof it.note !== 'string') errors.push(`${at}: note must be text`)
        else note = it.note.trim()
      }
      let close = ''
      if (it.close !== undefined && it.close !== null) {
        close = typeof it.close === 'string' ? it.close.replace(/\s+/g, ' ').trim() : ''
        if (close === '') errors.push(`${at}: close must be evidence text`)
      }
      let issue: number | undefined
      if (it.issue !== undefined && it.issue !== null) {
        if (!whole(it.issue)) errors.push(`${at}: issue must be a whole number, 1 or more`)
        else issue = it.issue
      }
      let children: TreeNode[] = []
      if (it.children !== undefined && it.children !== null) {
        if (!Array.isArray(it.children)) errors.push(`${at}: children must be a list`)
        else {
          if (it.children.length > SUB_ISSUE_CAP) errors.push(`${at}: ${it.children.length} children; GitHub allows ${SUB_ISSUE_CAP} sub-issues per parent`)
          children = walk(it.children, `${at}.children`, depth + 1, paths.length > 0 ? paths : [], here)
        }
      }
      if (errors.length === before) out.push({ type, title, paths, ...(note !== '' ? { note } : {}), ...(close !== '' ? { close } : {}), ...(issue !== undefined ? { issue } : {}), children, at, idx: here })
    }
    return out
  }
  let items: TreeNode[] = []
  if (!Array.isArray(raw.items) || raw.items.length === 0) errors.push('items must be a list of 1 or more')
  else {
    if (parent !== undefined && raw.items.length > SUB_ISSUE_CAP) errors.push(`items: ${raw.items.length} items under #${parent}; GitHub allows ${SUB_ISSUE_CAP} sub-issues per parent`)
    items = walk(raw.items, 'items', 1, [], [])
  }
  if (errors.length > 0) return { errors }
  return { plan: { ...(parent !== undefined ? { parent } : {}), items } }
}

/** Every node, parents before their children. */
export function flatten(items: readonly TreeNode[]): TreeNode[] {
  const out: TreeNode[] = []
  for (const n of items) out.push(n, ...flatten(n.children))
  return out
}

export type TreeCounts = { byType: Record<TreeType, number>; total: number; fresh: number; reuse: number; closed: number }

/** Items per type, how many are new (no `issue` in the file), may be reused (have one) and will be filed closed. */
export function treeCounts(plan: TreePlan): TreeCounts {
  const byType: Record<TreeType, number> = { feature: 0, epic: 0, story: 0, task: 0 }
  let reuse = 0
  let closed = 0
  const all = flatten(plan.items)
  for (const n of all) {
    byType[n.type]++
    if (n.issue !== undefined) reuse++
    if (n.close !== undefined) closed++
  }
  return { byType, total: all.length, fresh: all.length - reuse, reuse, closed }
}

/** The tree, one line per item, two spaces a level. */
export function treeLines(plan: TreePlan): string[] {
  const out: string[] = []
  const go = (list: readonly TreeNode[], depth: number) => {
    for (const n of list) {
      out.push(`${'  '.repeat(depth)}${n.type}: ${n.title} [${n.paths.length > 0 ? n.paths.join(', ') : 'scope: none'}]${n.issue !== undefined ? ` may reuse #${n.issue} (checked on confirm)` : ''}${n.close !== undefined ? ` (filed closed: ${n.close})` : ''}`)
      go(n.children, depth + 1)
    }
  }
  go(plan.items, 0)
  return out
}

export const countsLine = (c: TreeCounts): string => `counts: ${TREE_TYPES.map(t => `${t} ${c.byType[t]}`).join(', ')} (${c.total} items); new ${c.fresh}, may reuse ${c.reuse}, filed closed ${c.closed}`

/** The plan file as an absolute path, only when it is a .json file under <root>/.delegation/plans/ (no `..` out of it). */
export function planFileOf(root: string, file: string): string | undefined {
  const f = file.trim()
  if (f === '' || !f.endsWith('.json')) return undefined
  const base = root.replace(/\/+$/, '')
  const parts: string[] = []
  for (const seg of (f.startsWith('/') ? f : `${base}/${f}`).split('/')) {
    if (seg === '' || seg === '.') continue
    if (seg === '..') {
      if (parts.length === 0) return undefined
      parts.pop()
    } else parts.push(seg)
  }
  const abs = `/${parts.join('/')}`
  return abs.startsWith(`${base}/.delegation/plans/`) && abs.length > `${base}/.delegation/plans/`.length ? abs : undefined
}

/** The treeImportBatch option: a whole number 1 to 100, else 20. */
export const treeBatch = (v: unknown): number => (typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 100 ? v : TREE_BATCH_DEFAULT)

/** Puts `issue: <n>` on the item at the index path in the parsed (raw) file. */
export function setIssueAt(raw: unknown, idx: readonly number[], n: number): boolean {
  let list = (raw as { items?: unknown } | null)?.items
  let node: Record<string, unknown> | undefined
  for (const i of idx) {
    if (!Array.isArray(list) || !isObj(list[i])) return false
    node = list[i] as Record<string, unknown>
    list = node.children
  }
  if (!node) return false
  node.issue = n
  return true
}

/** `<file> [--dry-run] [--confirm]` of the command. */
export function parseTreeImportArgs(text: string): { file: string; confirm: boolean; dryRun: boolean } | { error: string } {
  let file = ''
  let confirm = false
  let dryRun = false
  for (const w of text.split(/\s+/).filter(x => x !== '')) {
    if (w === '--dry-run') dryRun = true
    else if (w === '--confirm') confirm = true
    else if (file === '' && !w.startsWith('--')) file = w
    else return { error: `usage: ${TREE_IMPORT_USAGE}` }
  }
  return file === '' ? { error: `usage: ${TREE_IMPORT_USAGE}` } : { file, confirm, dryRun }
}

/** The tree_import tool's input as the command's arguments. */
export function parseTreeImportTool(input: Record<string, unknown>): { file: string; confirm: boolean; dryRun: boolean } | { error: string } {
  const file = typeof input.file === 'string' ? input.file.trim() : ''
  return file === '' ? { error: `usage: ${TREE_IMPORT_USAGE}` } : { file, confirm: input.confirm === true, dryRun: input.dryRun === true }
}

export const TREE_IMPORT_TOOL = {
  name: 'tree_import',
  description:
    'Files a large multi-level plan (feature, epic, story, task, up to 4 levels) from a JSON file under .delegation/plans/: {"version":1,"parent"?:n,"items":[{"type","title","paths"?,"note"?,"close"?,"children"?:[...]}]}. The whole file is checked first (every error names its item path). Without confirm it prints the tree with counts and files nothing, and runs no gh. With confirm: true it files parents before children, at most the treeImportBatch option (default 20) creates per run, writes each issue number back into the file as "issue", and a re-run files only what is missing. Show the dry run to the person and call with confirm: true only after they say yes.',
  inputSchema: {
    type: 'object',
    properties: {
      file: { type: 'string', description: 'The plan file, a .json path under .delegation/plans/ (relative to the repo root, or absolute).' },
      dryRun: { type: 'boolean', description: 'true: print the tree and counts only, whatever confirm says.' },
      confirm: { type: 'boolean', description: 'true only after the person has said yes to the dry run; otherwise nothing is filed.' },
    },
    required: ['file'],
    additionalProperties: false,
  },
} as const
