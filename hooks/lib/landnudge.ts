// MOD-201: the land nudge. Two one-line leads for the brain, never for the person: a prompt that
// describes work and a turn that landed nothing, and a merge finish whose parent still has open
// tasks. Pure: no I/O; register.ts holds the state and draws the line (band.tsx).

const WORK = /\b(?:bug|broken|crash|regression|fails|failing|feature|idea|we need|we should|let['’]s add|add support|todo|follow-up)(?![\w-])/i
const MIN_LENGTH = 20

/** True for a person's prompt that describes a bug, feature or idea. Conservative: whole words only. */
export function describesWork(text: string): boolean {
  const t = text.trim()
  if (t.length < MIN_LENGTH) return false
  if (t.startsWith('/')) return false
  if (/#\d+/.test(t)) return false
  return WORK.test(t)
}

/** The line for the band. */
export function nudgeLine(kind: 'prompt', landAuto?: boolean): string // MOD-208: unset means off
export function nudgeLine(kind: 'parent', parent: { number: number; open: number }): string
export function nudgeLine(kind: 'prompt' | 'parent', arg?: { number: number; open: number } | boolean): string {
  const parent = typeof arg === 'object' ? arg : undefined
  // MOD-205: with landAuto off, land shows the issue and files on the person's yes
  if (kind === 'prompt' || !parent) return arg !== true ? "lead: propose landing this as an issue (land shows it; file on the person's yes) or say it is not work" : 'lead: land this as an issue (land or land_plan) or say it is not work'
  return `lead: parent #${parent.number} has ${parent.open} open tasks; land the next or close it`
}

/** The parent and its still-open task count after `issue` merged; undefined when none is open or the read is missing. */
export function parentNudge(parent: number, issue: number, siblings: readonly { number: number; state: string }[] | undefined): { number: number; open: number } | undefined {
  if (!siblings) return undefined
  const open = siblings.filter(s => s.number !== issue && s.state.toUpperCase() !== 'CLOSED').length
  return open > 0 ? { number: parent, open } : undefined
}
