// GH-111: the `card` tool. The person says a task in a sentence; the brain looks
// at the repo, chooses the scope globs and calls this with the fields. Pure: it
// validates them, assigns the next free id in the card folder and renders the
// card the README documents. register.ts writes it and runs the dry run (or the
// dispatch) through the same code `/dispatch <ID>` runs.
// MOD-23: `resources` names what the worker holds while it runs, and `lanes` splits one
// sentence into several cards (one per worker) with sequential ids, the shared fields
// and each lane's own scope.
import { RESOURCE_NAME, scopeOverlap } from './brief'
import { dollars, spendCeiling } from './cost'
import { scopeLooksProse } from './dispatch'
import { tierOf, type Tier } from './tier'

/** What the validation needs from the effective config and the card folder. */
export type CardCtx = {
  domains: readonly string[]
  /** The ids in the effective gateMap. */
  gateIds: readonly string[]
  /** The file names in the card folder. */
  names: readonly string[]
  spendByTier: Readonly<Record<string, number>>
  /** repo=here: the repo has no origin/main, so the worker shares the checkout (the card says `repo: here`). */
  here?: boolean
}

/** MOD-22: where the worker runs: in its own worktree (the default), in the session's checkout, or with no repo at all. */
export type CardRepo = 'worktree' | 'here' | 'none'
export const CARD_REPOS: readonly CardRepo[] = ['worktree', 'here', 'none']

export type NewCard = {
  id: string
  /** The file name inside the card folder. */
  file: string
  text: string
  title: string
  domain: string
  tier: Tier
  scope: string[]
  forbid: string[]
  gate: string[]
  redTest: string
  budget: number
  spend: number
  /** MOD-22: the mode the card was written for. */
  repo: CardRepo
  /** MOD-23: the exclusive resources the card holds while it runs. */
  resources: string[]
}

export const CARD_TOOL = {
  name: 'card',
  description:
    'When the person describes work to delegate, look at the repo to choose scope globs, then call this with the task (research or extraction with outputs outside the repo: repo none or here, scope = the output folder). For several workers at once pass lanes: one { title, scope } per worker, each with its own output folder, and put what the lanes share but none may touch (a notes file) in forbid; name a live app only one worker may use in resources, and the queue runs the lanes that hold it one at a time. It writes the card (one per lane), runs the dry run and returns the brief; show the person the summary and dispatch when they say go (call dispatch, or call this with dispatch: true when they already said to go ahead). Never ask the person to edit a card file.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'One line that says what done looks like' },
      why: { type: 'string', description: 'Two or three sentences: why this task' },
      doneWhen: { type: 'array', items: { type: 'string' }, description: 'Checkable statements: what is true when it is done' },
      scope: { type: 'array', items: { type: 'string' }, description: 'Globs or paths the worker may change, e.g. ["src/feature/**", "tests/test_feature.py"]; an absolute path or glob (a leading ~ is the home folder) names a folder outside the repo, and the first one is the output folder. Not prose. Required unless lanes carry their own; given with lanes, it is refused' },
      forbid: { type: 'array', items: { type: 'string' }, description: 'Globs the worker must not touch (default none); absolute paths and globs too' },
      repo: { type: 'string', description: 'worktree (default): the worker gets its own worktree; here: it works in this checkout; none: no repo at all. For research or extraction with outputs outside the repo use none or here, with scope = the output folder' },
      redTest: { type: 'string', description: 'The command or test that fails now and passes after, or "none" for docs-only work' },
      tier: { type: 'string', description: 'economy, standard (default), frontier or premium' },
      domain: { type: 'string', description: 'One of the repo domains (default: ops when the repo has it, else the first)' },
      gate: { type: 'string', description: 'Gate id(s) from gateMap, comma-separated (default: the first)' },
      budget: { type: 'number', description: 'Attempts before the task is handed back (default 2)' },
      spend: { type: 'number', description: "Dollars one attempt may spend; 0 = no ceiling (default: the tier's)" },
      resources: { type: 'array', items: { type: 'string' }, description: 'Exclusive resources the worker holds while it runs, e.g. ["blender-live"] (one live app with one open file): one plain word each. A card that names a resource a running worker holds waits in the queue until that worker hands back' },
      lanes: {
        type: 'array',
        description: 'Fan-out: one card per lane, with sequential ids, the shared why, gate, tier, repo, resources and forbid, and each lane its own scope (and so its own output folder). Lanes whose scopes overlap are refused. Give the shared title/doneWhen as the umbrella; a lane without its own doneWhen takes the shared one',
        items: {
          type: 'object',
          properties: {
            title: { type: 'string', description: 'One line that says what this lane delivers' },
            scope: { type: 'array', items: { type: 'string' }, description: "The lane's own globs or paths, its output folder first; disjoint from every other lane's" },
            doneWhen: { type: 'array', items: { type: 'string' }, description: 'Checkable statements for this lane (default: the shared doneWhen)' },
          },
          required: ['title', 'scope'],
          additionalProperties: false,
        },
      },
      dispatch: { type: 'boolean', description: 'Dispatch right after writing the card, instead of the dry run (default false)' },
    },
    required: ['title', 'why', 'doneWhen', 'redTest'],
    additionalProperties: false,
  },
} as const

export const CARD_TOOL_NAME = 'mcp__chassis-delegation__card'

const GLOB_EXAMPLE = 'game_decompiler/**, tests/test_rom.py'
const text = (v: unknown): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '')

/** The id prefix of a domain: frontend FE, backend BE, ops OPS, else its first three letters upper-cased. */
export function domainPrefix(domain: string): string {
  if (domain === 'frontend') return 'FE'
  if (domain === 'backend') return 'BE'
  if (domain === 'ops') return 'OPS'
  return domain.slice(0, 3).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'OPS'
}

/** The next free number among `names` for `prefix` (OPS-1-a.md, OPS-3b-c.md → 4). */
export function nextNumber(names: readonly string[], prefix: string): number {
  let max = 0
  for (const n of names) {
    const m = new RegExp(`^${prefix}-(\\d+)`).exec(n)
    if (m) max = Math.max(max, Number(m[1]))
  }
  return max + 1
}

/** The title as a file-name slug: lower case, at most six words joined by `-`. */
export const slugOf = (title: string): string => (title.toLowerCase().match(/[a-z0-9]+/g) ?? []).slice(0, 6).join('-') || 'task'

function globs(key: 'scope' | 'forbid', v: unknown, required: boolean): string[] | { error: string } {
  if (v === undefined && !required) return []
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return { error: `${key} must be a list of globs, e.g. ${GLOB_EXAMPLE}` }
  const list = (v as string[]).map(s => s.trim()).filter(Boolean)
  if (required && list.length === 0) return { error: `scope needs at least one glob, e.g. ${GLOB_EXAMPLE}` }
  const prose = list.find(s => scopeLooksProse([s]))
  if (prose !== undefined) return { error: `${key} must be globs, e.g. ${GLOB_EXAMPLE} (got "${prose}")` }
  const bad = list.find(s => /[,"'\]\\]/.test(s))
  if (bad !== undefined) return { error: `${key} entry "${bad}" cannot hold a comma, quote, backslash or ]]; list one glob per entry` }
  return list
}

/** MOD-23: the card's `resources`: a list of plain words, each once; none when absent. */
function resourceNames(v: unknown): string[] | { error: string } {
  if (v === undefined) return []
  if (!Array.isArray(v) || v.some(x => typeof x !== 'string')) return { error: 'resources must be a list of names, e.g. ["blender-live"]' }
  const out: string[] = []
  for (const raw of v as string[]) {
    const name = raw.trim()
    if (!RESOURCE_NAME.test(name)) return { error: `resources entry "${raw}" must be one plain word (letters, digits, . _ : -), e.g. blender-live` }
    if (!out.includes(name)) out.push(name)
  }
  return out
}

/**
 * Validate the tool input and render the card, or say exactly what to change. Writes nothing.
 * `at` (MOD-23, a lane's place) is added to the next free number, so lane 2 takes id N+1.
 */
export function cardFromFields(input: Record<string, unknown>, ctx: CardCtx, at = 0): NewCard | { error: string } {
  const title = text(input.title)
  if (title === '') return { error: 'title is required: one line that says what done looks like' }
  const why = typeof input.why === 'string' ? input.why.trim() : ''
  if (why === '') return { error: 'why is required: two or three sentences' }
  const done = Array.isArray(input.doneWhen) ? (input.doneWhen as unknown[]).map(text).filter(Boolean) : []
  if (done.length === 0) return { error: 'doneWhen is required: a list of checkable statements' }

  const scope = globs('scope', input.scope, true)
  if ('error' in scope) return scope
  const forbid = globs('forbid', input.forbid, false)
  if ('error' in forbid) return forbid
  const resources = resourceNames(input.resources)
  if ('error' in resources) return resources

  // MOD-22: no repo given keeps the old rule (a repo with no origin/main works in the checkout)
  const repoIn = input.repo === undefined ? undefined : typeof input.repo === 'string' ? text(input.repo) : String(input.repo)
  if (repoIn !== undefined && !(CARD_REPOS as readonly string[]).includes(repoIn)) return { error: `repo must be worktree, here or none (got "${repoIn}")` }
  const repo: CardRepo = (repoIn as CardRepo | undefined) ?? (ctx.here ? 'here' : 'worktree')

  const redTest = text(input.redTest)
  if (redTest === '') return { error: 'redTest is required: the command or test that fails now and passes after, or "none" for docs-only work' }

  const tierIn = input.tier === undefined ? 'standard' : text(input.tier)
  const tier = tierOf(tierIn)
  if (tier === undefined) return { error: `tier ${tierIn} is not economy, standard, frontier or premium` }

  const domain = input.domain === undefined ? (ctx.domains.includes('ops') ? 'ops' : (ctx.domains[0] ?? 'ops')) : text(input.domain)
  if (!ctx.domains.includes(domain)) return { error: `domain ${domain} is not one of ${ctx.domains.join(', ')}` }

  if (ctx.gateIds.length === 0) return { error: 'gateMap has no gate; run /delegation setup, or add a gateMap entry in .chassis-delegation.json' }
  const gate = input.gate === undefined ? [ctx.gateIds[0] as string] : text(input.gate).split(/\s*,\s*/).filter(Boolean)
  if (gate.length === 0) return { error: `gate is empty; the ids are ${ctx.gateIds.join(', ')}` }
  for (const g of gate) if (!ctx.gateIds.includes(g)) return { error: `gate ${g} is not in gateMap; the ids are ${ctx.gateIds.join(', ')}` }

  const budget = input.budget === undefined ? 2 : Number(input.budget)
  if (!Number.isInteger(budget) || budget < 1) return { error: 'budget must be a whole number of attempts, 1 or more' }
  const spendIn = input.spend === undefined ? undefined : Number(input.spend)
  if (spendIn !== undefined && (!Number.isFinite(spendIn) || spendIn < 0)) return { error: 'spend must be dollars, 0 or more (0 = no ceiling)' }
  const spend = spendIn ?? spendCeiling(undefined, tier, ctx.spendByTier)

  const prefix = domainPrefix(domain)
  const id = `${prefix}-${nextNumber(ctx.names, prefix) + at}`
  const body = `---
id: ${id}
title: ${title}
domain: ${domain}
tier: ${tier}
status: queued
${repo === 'worktree' ? '' : `repo: ${repo}\n`}scope: [${scope.join(', ')}]
forbid: [${forbid.join(', ')}]
${resources.length > 0 ? `resources: [${resources.join(', ')}]\n` : ''}red_test: ${redTest}
gate: ${gate.join(', ')}
budget: ${budget}-attempts
spend: ${spend}
---
## Why

${why}

## Done when

${done.map(d => `- ${d}`).join('\n')}
`
  return { id, file: `${id}-${slugOf(title)}.md`, text: body, title, domain, tier, scope, forbid, gate, redTest, budget, spend, repo, resources }
}

/**
 * MOD-23: the cards one call writes. Without `lanes`, the one card `cardFromFields` renders. With them, one card per
 * lane, in order, ids N, N+1, … : the shared why, gate, tier, repo, resources, budget and forbid, and each lane its own
 * title, scope and (when it has one) doneWhen. A shared scope beside lanes is refused, and so are lanes whose scopes
 * overlap, naming both: two workers must not own the same files. Nothing is returned to write on a refusal.
 */
export function cardsFromFields(input: Record<string, unknown>, ctx: CardCtx): NewCard[] | { error: string } {
  if (input.lanes === undefined) {
    const one = cardFromFields(input, ctx)
    return 'error' in one ? one : [one]
  }
  const raw = input.lanes
  if (!Array.isArray(raw) || raw.length === 0) return { error: 'lanes must be a list of { title, scope, doneWhen? }, one per worker' }
  if (input.scope !== undefined) return { error: 'scope belongs to each lane when lanes are given (lanes: [{ title, scope }]); drop the shared scope' }
  const lanes: { title: string; scope: string[]; doneWhen?: string[] }[] = []
  for (const [i, entry] of (raw as unknown[]).entries()) {
    const n = i + 1
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) return { error: `lane ${n} must be { title, scope, doneWhen? }` }
    const lane = entry as Record<string, unknown>
    const title = text(lane.title)
    if (title === '') return { error: `lane ${n} needs a title: one line that says what the lane delivers` }
    const scope = globs('scope', lane.scope, true)
    if ('error' in scope) return { error: `lane ${n} (${title}): ${scope.error}` }
    let doneWhen: string[] | undefined
    if (lane.doneWhen !== undefined) {
      doneWhen = Array.isArray(lane.doneWhen) ? (lane.doneWhen as unknown[]).map(text).filter(Boolean) : []
      if (doneWhen.length === 0) return { error: `lane ${n} (${title}): doneWhen must be a list of checkable statements` }
    }
    lanes.push({ title, scope, ...(doneWhen ? { doneWhen } : {}) })
  }
  for (let i = 0; i < lanes.length; i += 1) {
    for (let j = i + 1; j < lanes.length; j += 1) {
      const a = lanes[i] as (typeof lanes)[number]
      const b = lanes[j] as (typeof lanes)[number]
      const pair = scopeOverlap(a.scope, b.scope)
      if (pair) return { error: `lanes overlap: lane ${i + 1} "${a.title}" scope ${pair.mine} overlaps lane ${j + 1} "${b.title}" scope ${pair.theirs}; give each lane its own output folder` }
    }
  }
  const { lanes: _lanes, ...shared } = input
  const made: NewCard[] = []
  for (const [i, lane] of lanes.entries()) {
    const one = cardFromFields({ ...shared, title: lane.title, scope: lane.scope, ...(lane.doneWhen ? { doneWhen: lane.doneWhen } : {}) }, ctx, i)
    if ('error' in one) return one
    made.push(one)
  }
  return made
}

/** `OPS-1 · standard → sonnet · scope a, b · gate test · red: cmd · 2 attempts · $6 ceiling`; a card that is not a worktree card names its repo after the scope (`… · repo none · gate test …`). */
export const cardSummary = (c: Pick<NewCard, 'id' | 'tier' | 'scope' | 'gate' | 'redTest' | 'budget' | 'spend'> & { repo?: CardRepo; resources?: readonly string[] }, alias: string): string =>
  [c.id, `${c.tier} → ${alias}`, `scope ${c.scope.join(', ')}`, ...(c.repo && c.repo !== 'worktree' ? [`repo ${c.repo}`] : []), ...(c.resources && c.resources.length > 0 ? [`resources ${c.resources.join(', ')}`] : []), `gate ${c.gate.join(', ')}`, `red: ${c.redTest}`, `${c.budget} attempts`, c.spend > 0 ? `${dollars(c.spend)} ceiling` : 'no ceiling'].join(' · ')

/** The closing line of the dry-run answer; MOD-23: with lanes, every id. */
export const sayGo = (ids: string | readonly string[]): string => `Say go and Claude dispatches ${typeof ids === 'string' ? ids : ids.join(', ')}.`
