// GH-111: the `card` tool. The person says a task in a sentence; the brain looks
// at the repo, chooses the scope globs and calls this with the fields. Pure: it
// validates them, assigns the next free id in the card folder and renders the
// card the README documents. register.ts writes it and runs the dry run (or the
// dispatch) through the same code `/dispatch <ID>` runs.
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
}

export const CARD_TOOL = {
  name: 'card',
  description:
    'When the person describes work to delegate, look at the repo to choose scope globs, then call this with the task. It writes the card, runs the dry run and returns the brief; show the person the summary and dispatch when they say go (call dispatch, or call this with dispatch: true when they already said to go ahead). Never ask the person to edit a card file.',
  inputSchema: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'One line that says what done looks like' },
      why: { type: 'string', description: 'Two or three sentences: why this task' },
      doneWhen: { type: 'array', items: { type: 'string' }, description: 'Checkable statements: what is true when it is done' },
      scope: { type: 'array', items: { type: 'string' }, description: 'Globs or paths the worker may change, e.g. ["src/feature/**", "tests/test_feature.py"]. Not prose' },
      forbid: { type: 'array', items: { type: 'string' }, description: 'Globs the worker must not touch (default none)' },
      redTest: { type: 'string', description: 'The command or test that fails now and passes after, or "none" for docs-only work' },
      tier: { type: 'string', description: 'economy, standard (default), frontier or premium' },
      domain: { type: 'string', description: 'One of the repo domains (default: ops when the repo has it, else the first)' },
      gate: { type: 'string', description: 'Gate id(s) from gateMap, comma-separated (default: the first)' },
      budget: { type: 'number', description: 'Attempts before the task is handed back (default 2)' },
      spend: { type: 'number', description: "Dollars one attempt may spend; 0 = no ceiling (default: the tier's)" },
      dispatch: { type: 'boolean', description: 'Dispatch right after writing the card, instead of the dry run (default false)' },
    },
    required: ['title', 'why', 'doneWhen', 'scope', 'redTest'],
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

/** Validate the tool input and render the card, or say exactly what to change. Writes nothing. */
export function cardFromFields(input: Record<string, unknown>, ctx: CardCtx): NewCard | { error: string } {
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
  const id = `${prefix}-${nextNumber(ctx.names, prefix)}`
  const body = `---
id: ${id}
title: ${title}
domain: ${domain}
tier: ${tier}
status: queued
${ctx.here ? 'repo: here\n' : ''}scope: [${scope.join(', ')}]
forbid: [${forbid.join(', ')}]
red_test: ${redTest}
gate: ${gate.join(', ')}
budget: ${budget}-attempts
spend: ${spend}
---
## Why

${why}

## Done when

${done.map(d => `- ${d}`).join('\n')}
`
  return { id, file: `${id}-${slugOf(title)}.md`, text: body, title, domain, tier, scope, forbid, gate, redTest, budget, spend }
}

/** `OPS-1 · standard → sonnet · scope a, b · gate test · red: cmd · 2 attempts · $6 ceiling` */
export const cardSummary = (c: Pick<NewCard, 'id' | 'tier' | 'scope' | 'gate' | 'redTest' | 'budget' | 'spend'>, alias: string): string =>
  [c.id, `${c.tier} → ${alias}`, `scope ${c.scope.join(', ')}`, `gate ${c.gate.join(', ')}`, `red: ${c.redTest}`, `${c.budget} attempts`, c.spend > 0 ? `${dollars(c.spend)} ceiling` : 'no ceiling'].join(' · ')

/** The closing line of the dry-run answer. */
export const sayGo = (id: string): string => `Say go and Claude dispatches ${id}.`
