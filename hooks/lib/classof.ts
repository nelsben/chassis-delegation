// MOD-277: a card's class (`feature/narrow`) from its card file, for ledger rows written before MOD-274 recorded one. Pure: no host calls.
import { parseCard } from './dispatch'
import { cardClassName, cardKind, cardSize } from './explore'

/** The class of a card from its file's text (kind:, title, scope, and the breadth size rule); undefined when the text is not a card. */
export function classOfCardText(text: string): string | undefined {
  const card = parseCard(text)
  if ('error' in card) return undefined
  const kind = cardKind({ kind: card.fields.kind, purpose: card.fields.purpose, title: card.title, scope: card.scope })
  return cardClassName(kind, cardSize(card.scope))
}

/** A `classOf(task)` over card files: `files` maps a file name (`MOD-12-slug.md`) to its text; a task with no file has no class. */
export function classOfFiles(files: Readonly<Record<string, string>>): (task: string) => string | undefined {
  const byTask = new Map<string, string | undefined>()
  return task => {
    if (byTask.has(task)) return byTask.get(task)
    const name = Object.keys(files).filter(n => n.endsWith('.md') && n.startsWith(`${task}-`)).sort()[0]
    const cls = name === undefined ? undefined : classOfCardText(files[name] as string)
    byTask.set(task, cls)
    return cls
  }
}
