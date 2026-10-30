// MOD-197: the gh guard. A recorded worker (or reviewer) may read GitHub with gh
// but never write to it: the brain files and closes issues, merges PRs and keeps
// the Project, or the plan on GitHub (the founder's record) lies. This names the
// gh write commands in a Bash command string. An accident tripwire like the git
// guard (gitguard.ts), not adversary-proof: `bash -c "…"`, `eval` and the like
// are not looked into. Pure: no `$`.
//
// It reads the command the way gitguard.ts does (its exported tokenizer): quotes
// keep words whole, heredoc bodies are skipped, and only the FIRST command word
// of each pipeline/&&/||/; segment (after VAR=x assignments) can be `gh`.
//
// A write is:
//   gh issue create|close|reopen|edit|delete|transfer|comment|lock|unlock|pin|unpin|develop
//   gh pr create|merge|close|reopen|edit|comment|review|ready
//   gh project <anything but list|view|item-list|field-list>
//   gh label|release|repo|secret|variable|workflow|ruleset|gist <a verb other than list|view>
//   gh api with -X/--method other than GET, or any -f/-F/--field/--raw-field/--input

import { tokenize } from './gitguard'

const SEPS = new Set(['&&', '||', ';;', ';', '|&', '|', '&', '(', ')', '\n', '$(', '`'])
const ASSIGN = /^[A-Za-z_][A-Za-z0-9_]*=/
const PREFIXES = new Set(['command', 'time', 'nohup', 'env'])
const GH_OPT_ARG = new Set(['-R', '--repo', '--hostname'])

const ISSUE_WRITES = new Set(['create', 'close', 'reopen', 'edit', 'delete', 'transfer', 'comment', 'lock', 'unlock', 'pin', 'unpin', 'develop'])
const PR_WRITES = new Set(['create', 'merge', 'close', 'reopen', 'edit', 'comment', 'review', 'ready'])
const PROJECT_READS = new Set(['list', 'view', 'item-list', 'field-list'])
const READ_ONLY_VERBS = new Set(['list', 'view'])
const VERB_NOUNS = new Set(['label', 'release', 'repo', 'secret', 'variable', 'workflow', 'ruleset', 'gist'])
const FIELD_FLAGS = new Set(['-f', '-F', '--field', '--raw-field', '--input'])

/** The write a `gh api` call makes (a phrase naming it), or undefined for a read. */
function apiWrite(rest: readonly string[]): string | undefined {
  let method: string | undefined
  let field = false
  let endpoint: string | undefined
  for (let i = 0; i < rest.length; i += 1) {
    const w = rest[i] as string
    if (w === '-X' || w === '--method') {
      method = rest[i + 1]
      i += 1
    } else if (w.startsWith('--method=')) method = w.slice('--method='.length)
    else if (/^-X./.test(w)) method = w.slice(2)
    else if (FIELD_FLAGS.has(w)) {
      field = true
      i += 1
    } else if (/^--(?:field|raw-field|input)=/.test(w) || /^-[fF]./.test(w)) field = true
    else if (!w.startsWith('-') && endpoint === undefined) endpoint = w
  }
  if (method !== undefined && method.toUpperCase() !== 'GET') return `gh api -X ${method.toUpperCase()}`
  if (field) return endpoint === 'graphql' ? 'gh api graphql' : 'gh api with a field'
  return undefined
}

/** The gh write commands in a Bash command, each as a verb phrase (`gh issue close`), in order. */
export function ghWrites(command: string): string[] {
  const toks = tokenize(command)
  const out: string[] = []
  let i = 0
  while (i < toks.length) {
    if (SEPS.has(toks[i] as string)) {
      i += 1
      continue
    }
    let end = i
    while (end < toks.length && !SEPS.has(toks[end] as string)) end += 1
    const words = toks.slice(i, end)
    i = end
    let k = 0
    while (k < words.length && (ASSIGN.test(words[k] as string) || PREFIXES.has(words[k] as string))) k += 1
    const head = words[k]
    if (head === undefined || (head !== 'gh' && !head.endsWith('/gh'))) continue
    let j = k + 1
    while (j < words.length) {
      const o = words[j] as string
      if (GH_OPT_ARG.has(o)) j += 2
      else if (o.startsWith('-')) j += 1
      else break
    }
    const noun = words[j]
    const rest = words.slice(j + 1)
    const verb = rest.find(w => !w.startsWith('-'))
    if (noun === undefined) continue
    if (noun === 'api') {
      const w = apiWrite(rest)
      if (w) out.push(w)
    } else if (noun === 'issue') {
      if (verb !== undefined && ISSUE_WRITES.has(verb)) out.push(`gh issue ${verb}`)
    } else if (noun === 'pr') {
      if (verb !== undefined && PR_WRITES.has(verb)) out.push(`gh pr ${verb}`)
    } else if (noun === 'project') {
      if (verb !== undefined && !PROJECT_READS.has(verb)) out.push(`gh project ${verb}`)
    } else if (VERB_NOUNS.has(noun)) {
      if (verb !== undefined && !READ_ONLY_VERBS.has(verb)) out.push(`gh ${noun} ${verb}`)
    }
  }
  return out
}
