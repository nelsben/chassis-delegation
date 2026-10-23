// MOD-114: the effort nudge for the brain. The brain's own effort is the user's `/model`
// setting; the mod never changes it. It only says, on rows it already posts, when a
// judgment step is about to start (a worker handed back cards to look at) and when the
// procedural work is back (the verdict row that accepts a later task, or the next worker
// starting). Pure text and config; no `$`.

/** Config `effortNudge`: the artefact glob that marks a hand-back as judgment, and the two effort words the rows name. */
export type EffortNudge = { cards: string; up: string; down: string }

/**
 * Config `effortNudge` default: a hand-back naming an artefact in the card folder nudges up to high; the way back is medium.
 * `cards` here is the glob for the built-in card folder; a layer that does not set `cards` gets `<cardDir>/**` (see `nudgeCardsFor`).
 */
export const DEFAULT_EFFORT_NUDGE: Readonly<EffortNudge> = { cards: 'agents/tasks/**', up: 'high', down: 'medium' }

/** The glob a layer-less `effortNudge.cards` means: the card folder as resolved. */
export const nudgeCardsFor = (cardDir: string): string => `${cardDir.replace(/^\/+|\/+$/g, '')}/**`

export const NUDGE_KEYS: readonly (keyof EffortNudge)[] = ['cards', 'up', 'down']

/** `effortNudge` from a layer: each key a string; `cards` "" turns the nudge off. A bad entry is named and dropped. */
export function effortNudgeOf(v: unknown, errors: string[], where: string): Partial<EffortNudge> | undefined {
  if (typeof v !== 'object' || v === null || Array.isArray(v)) {
    errors.push(`effortNudge${where}: not an object (ignored)`)
    return undefined
  }
  const out: Partial<EffortNudge> = {}
  for (const [k, x] of Object.entries(v as Record<string, unknown>)) {
    if (k.startsWith('_')) continue
    if (!(NUDGE_KEYS as readonly string[]).includes(k)) errors.push(`effortNudge.${k}${where}: not a key (cards, up, down) (ignored)`)
    else if (typeof x !== 'string') errors.push(`effortNudge.${k}${where}: needs a string (ignored)`)
    else if (k !== 'cards' && x.trim() === '') errors.push(`effortNudge.${k}${where}: needs an effort word (ignored)`)
    else out[k as keyof EffortNudge] = x.trim()
  }
  return Object.keys(out).length > 0 ? out : undefined
}

/** The verifier's glob dialect (`*` and `**` match across `/`, `?` one character), anchored at any folder of the path. */
function cardsRegExp(glob: string): RegExp {
  let re = ''
  for (const c of glob.replace(/\*\*/g, '*')) {
    if (c === '*') re += '.*'
    else if (c === '?') re += '.'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp(`(^|/)${re}$`)
}

/** Whether a report's artefacts name a file the `cards` glob takes; no glob (the nudge off) or no artefacts: no. */
export function cardsHandedBack(artefacts: readonly string[], cards: string): boolean {
  const g = cards.trim()
  if (g === '' || artefacts.length === 0) return false
  const re = cardsRegExp(g)
  return artefacts.some(a => re.test(a.trim()))
}

/** The clause on the handed-back row: `lead: judgment next, raise to high`. */
export const nudgeUp = (n: Readonly<EffortNudge>): string => `lead: judgment next, raise to ${n.up}`
/** The clause on a later accept or started row: `lead: back to medium`. */
export const nudgeDown = (n: Readonly<EffortNudge>): string => `lead: back to ${n.down}`

/** The `/delegation` line: `effort nudge: agents/tasks/** · up high · down medium`, or `effort nudge: off`. */
export const nudgeText = (n: Readonly<EffortNudge>): string => (n.cards.trim() === '' ? 'effort nudge: off' : `effort nudge: ${n.cards} · up ${n.up} · down ${n.down}`)
