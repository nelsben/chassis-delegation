// MOD-124 (#188): briefLocal, a gitignored rules file copied into every brief under a marked section,
// and a card's allow: [id], which pulls the named `### allow: <id>` block from that file into the brief.
// Pure: no `$`.

export const LOCAL_HEADING = '## Local rules (not for debrief)'
export const EXCEPTION_HEADING = '## Exception for this card:'

const ALLOW_HEADING = /^###\s+allow:\s*(\S+)\s*$/

/** The file split: the text before the first `### allow:` heading, and each block by id (to the next `###` heading or the end). */
export function splitLocal(text: string): { rules: string; blocks: Record<string, string> } {
  const lines = text.replace(/\r\n/g, '\n').split('\n')
  const rules: string[] = []
  const blocks: Record<string, string> = {}
  let current: string | undefined
  let metAllow = false
  let buf: string[] = []
  const close = (): void => {
    if (current !== undefined && !Object.hasOwn(blocks, current)) blocks[current] = buf.join('\n').trim()
    buf = []
  }
  for (const line of lines) {
    const m = ALLOW_HEADING.exec(line)
    if (m) {
      close()
      current = m[1] as string
      metAllow = true
    } else if (/^###\s/.test(line)) {
      close()
      current = undefined
      if (!metAllow) rules.push(line)
    } else if (current !== undefined) buf.push(line)
    else if (!metAllow) rules.push(line)
  }
  close()
  return { rules: rules.join('\n').trim(), blocks }
}

/** The brief's extra text with the local rules and then one exception section per id appended; unchanged with nothing local. */
export function renderLocal(extra: string, localText: string | undefined, ids: readonly string[]): string {
  const parts: string[] = extra.trim() === '' ? [] : [extra]
  if (localText !== undefined) {
    const { rules, blocks } = splitLocal(localText)
    if (rules !== '') parts.push(`${LOCAL_HEADING}\n\n${rules}`)
    for (const id of ids) if (Object.hasOwn(blocks, id)) parts.push(`${EXCEPTION_HEADING} ${id}\n\n${blocks[id]}`)
  }
  return parts.length === 0 ? extra : parts.join('\n\n')
}

/** The ids the card names that the file holds no block for. */
export const missingBlocks = (localText: string, ids: readonly string[]): string[] => {
  const { blocks } = splitLocal(localText)
  return ids.filter(id => !Object.hasOwn(blocks, id))
}

/** The ids a brief header's `allow=` names, each once. */
export function allowOf(h: { fields: Record<string, string> } | undefined): string[] {
  const out: string[] = []
  for (const part of (h?.fields.allow ?? '').split(',')) {
    const name = part.trim()
    if (name !== '' && !out.includes(name)) out.push(name)
  }
  return out
}

export const trackedRefusal = (id: string, path: string): string =>
  `/dispatch ${id}: refused — briefLocal ${path} is tracked by git; a local rules file must stay untracked (add it to .gitignore and run git rm --cached)`
export const unreadableRefusal = (id: string, path: string, why: string): string => `/dispatch ${id}: refused — briefLocal ${path} could not be read: ${why}`
export const missingBlockRefusal = (id: string, block: string, path: string): string => `/dispatch ${id}: refused — allow: ${block} has no "### allow: ${block}" block in ${path}`
export const noLocalRefusal = (id: string, ids: readonly string[]): string => `/dispatch ${id}: refused — the card has allow: [${ids.join(', ')}] but briefLocal is not set (name the rules file in .chassis-delegation.json)`
