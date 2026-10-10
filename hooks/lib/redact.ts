// MOD-6: the mechanical scrub a debrief's mod_findings go through before they
// are written beside the debrief, ready to post. Pure: no `$`.

/** What the scrub knows about this session and this person. Every field is optional; an empty one scrubs nothing. */
export type RedactRules = {
  /** The session root's folder name (the repo). */
  repo?: string
  /** The origin remote's URL; both `owner/name` and the full URL become the repo. */
  origin?: string
  /** git user.name. */
  userName?: string
  /** git user.email. */
  userEmail?: string
  /** The person's own list (the /config option `redact`); never read from the repo file, which is public. */
  words?: readonly string[]
}
// one private-use character per placeholder, so a placeholder is never rescanned by a later rule
const MARKS = { home: '\uE001', repo: '\uE002', person: '\uE003', redacted: '\uE004' } as const
const M = (name: keyof typeof MARKS): string => MARKS[name]
const PLACEHOLDERS: Record<string, string> = { [MARKS.home]: '<home>', [MARKS.repo]: '<repo>', [MARKS.person]: '<person>', [MARKS.redacted]: '<redacted>' }

const escapeRe = (s: string): string => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
/** Not preceded or followed by a letter, digit, underscore (or hyphen, for names that carry one). */
const wholeWord = (s: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_])${escapeRe(s)}(?![\\p{L}\\p{N}_])`, 'giu')
const wholeName = (s: string): RegExp => new RegExp(`(?<![\\p{L}\\p{N}_-])${escapeRe(s)}(?![\\p{L}\\p{N}_-])`, 'giu')

/** The comma-separated /config option as a list: trimmed, empties dropped. */
export const parseRedactList = (text: string | undefined): string[] =>
  (text ?? '')
    .split(',')
    .map(w => w.trim())
    .filter(w => w !== '' && w !== '0')

/** `owner/name` out of a remote URL (https, ssh or scp-like); undefined when it has no such tail. */
export function ownerNameOf(origin: string): string | undefined {
  const m = /[:/]([^/:\s]+\/[^/:\s]+?)(?:\.git)?\/?$/.exec(origin.trim())
  return m ? m[1] : undefined
}

/** Home folder prefixes: `/Users/<name>` and `/home/<name>`. */
const HOME_PREFIX = /\/(?:Users|home)\/[^/\s"'`<>()\\]+/g
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g

/**
 * Scrubs one string. Order matters: the origin URL before owner/name before the
 * bare repo name; the home prefix; the person; the person's word list last.
 */
export function redact(text: string, rules: RedactRules = {}): string {
  let out = text
  const repoMark = M('repo')
  const origin = (rules.origin ?? '').trim()
  if (origin !== '') {
    out = out.replace(new RegExp(escapeRe(origin), 'giu'), repoMark)
    const on = ownerNameOf(origin)
    if (on) out = out.replace(wholeName(on), repoMark)
  }
  out = out.replace(HOME_PREFIX, M('home'))
  const repo = (rules.repo ?? '').trim()
  if (repo !== '') out = out.replace(wholeName(repo), repoMark)
  const email = (rules.userEmail ?? '').trim()
  if (email !== '') out = out.replace(new RegExp(escapeRe(email), 'giu'), M('person'))
  const name = (rules.userName ?? '').trim()
  if (name !== '') out = out.replace(wholeWord(name), M('person'))
  // any other email address is a person too
  out = out.replace(EMAIL, M('person'))
  for (const w of rules.words ?? []) if (w.trim() !== '') out = out.replace(wholeWord(w.trim()), M('redacted'))
  return out.replace(/[\uE001-\uE004]/g, c => PLACEHOLDERS[c] ?? '')
}

/** `[section "name"] key = value` values out of a git config file's text, e.g. ('remote "origin"', 'url'). */
export function gitConfigValue(text: string, section: string, key: string): string | undefined {
  let current = ''
  let found: string | undefined
  for (const raw of text.split('\n')) {
    const line = raw.trim()
    const head = /^\[\s*([^\]]*?)\s*\]$/.exec(line)
    if (head) {
      current = (head[1] ?? '').replace(/^(\w+)\s+"([^"]*)"$/, '$1 "$2"').toLowerCase()
      continue
    }
    const kv = /^([A-Za-z][\w-]*)\s*=\s*(.*)$/.exec(line)
    if (kv && current === section.toLowerCase() && (kv[1] ?? '').toLowerCase() === key.toLowerCase()) found = (kv[2] ?? '').replace(/^"(.*)"$/, '$1').trim()
  }
  return found === '' ? undefined : found
}
