// MOD-3: `/delegation update`. Pure: no `$`. The classification of the loaded
// folder, the changelog slice the brain reads after an update, the repo-config
// migration (text in, text out, byte-stable around the insert), and the lines.
import { DEFAULT_SPEND_BY_TIER } from './cost'
import { DEFAULT_CARD_DIR, DEFAULT_DOMAINS, DEFAULT_IGNORE, DEFAULT_MAX_WORKERS, DEFAULT_TIER_MAP, REPO_KEYS } from './repoconfig'

export const CLONE_URL = 'https://github.com/nelsben/chassis-delegation.git'
export const CHANGELOG_CAP = 40

export type RootClass = {
  /** clone: a git clone (it can be updated); folder: anything else (nothing is changed). */
  kind: 'clone' | 'folder'
  /** turn-end: the engine reloads it when the turn ends; restart: the window must be reloaded; none: nothing was updated. */
  reload: 'turn-end' | 'restart' | 'none'
  reloadStory: string
  devMods: boolean
}

const trimSlash = (s: string): string => s.replace(/\/+$/, '')

/** The loaded plugin root → what it is and what happens to the session after it moves. */
export function classifyRoot(root: string, home: string, isClone: boolean): RootClass {
  const r = trimSlash(root)
  const devMods = home !== '' && r.startsWith(`${trimSlash(home)}/.claude/dev-mods/`)
  if (!isClone) {
    return {
      kind: 'folder',
      reload: 'none',
      devMods,
      reloadStory: [
        `${r} is not a git clone, so nothing was changed.`,
        `Move it aside and clone the repository in its place:`,
        `  git clone ${CLONE_URL} ${r}`,
      ].join('\n'),
    }
  }
  if (devMods) {
    return { kind: 'clone', reload: 'turn-end', devMods, reloadStory: 'reload: this folder is under ~/.claude/dev-mods, so it reloads when the turn ends.' }
  }
  return {
    kind: 'clone',
    reload: 'restart',
    devMods,
    reloadStory: [
      `reload: not done. Nothing can reload a folder outside ~/.claude/dev-mods, so this session still runs the old copy: reload the window to load ${r}.`,
      'In the VS Code extension: Developer: Reload Window. In a terminal: restart claude. The session can be reopened with its transcript.',
      'The folder is the one CLAUDE_CODE_PLUGIN_DIRS or --plugin-dir points at.',
    ].join('\n'),
  }
}

const plural = (n: number, w: string): string => `${n} ${w}${n === 1 ? '' : 's'}`

export const updateLine = (oldV: string, oldSha: string, newV: string, newSha: string, commits: number): string => `update: ${oldV} (${oldSha}) → ${newV} (${newSha}), ${plural(commits, 'commit')}`
export const upToDateLine = (version: string, sha: string): string => `up to date at ${version} (${sha})`
export const behindLine = (n: number): string => (n > 0 ? `update: ${plural(n, 'commit')} behind origin/main · run /delegation update` : '')

const versionOf = (s: string): number[] | undefined => {
  const m = /^(\d+)\.(\d+)\.(\d+)/.exec(s.trim())
  return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : undefined
}
/** > 0 when a is newer than b. */
export function compareVersions(a: string, b: string): number {
  const x = versionOf(a) ?? [0, 0, 0]
  const y = versionOf(b) ?? [0, 0, 0]
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return (x[i] as number) - (y[i] as number)
  return 0
}

/**
 * The CHANGELOG sections newer than `oldVersion` (Unreleased counts as newer),
 * newest first, capped at 40 lines; a README `### From <old> to <new>` section
 * gets a pointer when `readme` has one.
 */
export function changelogSlice(changelog: string, oldVersion: string, newVersion?: string, readme?: string): { text: string; truncated: boolean } {
  const parts = changelog.split(/^(?=## )/m).filter(p => p.startsWith('## '))
  const keep = parts.filter(p => {
    const head = /^## (\S+)/.exec(p)?.[1] ?? ''
    return head.toLowerCase() === 'unreleased' || (versionOf(head) !== undefined && compareVersions(head, oldVersion) > 0)
  })
  const lines = keep.map(p => p.trimEnd()).join('\n\n').split('\n')
  const body = lines.length === 1 && lines[0] === '' ? [] : lines
  const truncated = body.length > CHANGELOG_CAP
  const out = truncated ? [...body.slice(0, CHANGELOG_CAP), `… ${body.length - CHANGELOG_CAP} more lines in CHANGELOG.md`] : body
  const heading = newVersion !== undefined ? `### From ${oldVersion} to ${newVersion}` : undefined
  if (body.length > 0 && heading && readme?.split('\n').some(l => l.trimEnd() === heading)) out.push(`README: ${heading.slice(4)}`)
  return { text: out.join('\n'), truncated }
}

// ---- repo config migration ----------------------------------------------------
const NOTES: Record<string, string> = {
  tierMap: 'tier → model alias; the built-in ladder',
  maxWorkers: 'workers running at once',
  domains: 'the card domains a branch may carry',
  cardDir: 'where the task cards live, relative to the repo root',
  autoEval: 'run the eval command after a verified task',
  ignore: 'globs a repo=here delta never counts',
  spendByTier: 'dollars one attempt may spend, per tier; 0 = no ceiling',
  delegateOnly: 'off | warn | deny: whether an opus or fable brain may edit source itself',
}

/** Every REPO_KEYS key with a built-in default, as the JSON the config file would hold. */
export function migrationDefaults(): Record<string, unknown> {
  const all: Record<string, unknown> = {
    tierMap: DEFAULT_TIER_MAP,
    maxWorkers: DEFAULT_MAX_WORKERS,
    domains: [...DEFAULT_DOMAINS],
    cardDir: DEFAULT_CARD_DIR,
    autoEval: false,
    ignore: [...DEFAULT_IGNORE],
    spendByTier: DEFAULT_SPEND_BY_TIER,
    delegateOnly: 'off',
  }
  return Object.fromEntries(REPO_KEYS.filter(k => k in all).map(k => [k, all[k]]))
}

export type Migration = { text: string; added: string[]; error?: string }

/**
 * Adds each missing defaulted key, with a `_<key>` note, before the object's
 * closing brace. Everything before it and the whitespace after the last
 * property stay byte-identical.
 */
export function migrateConfig(text: string): Migration {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (err) {
    return { text, added: [], error: `not valid JSON: ${String(err).slice(0, 100)}` }
  }
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return { text, added: [], error: 'not a JSON object' }
  const have = parsed as Record<string, unknown>
  const defaults = migrationDefaults()
  const missing = Object.keys(defaults).filter(k => !(k in have))
  if (missing.length === 0) return { text, added: [] }
  const close = text.lastIndexOf('}')
  const body = text.slice(0, close).replace(/\s*$/, '')
  const tail = text.slice(body.length)
  const indent = /\n([ \t]+)"/.exec(text)?.[1] ?? '  '
  const pieces: string[] = []
  for (const k of missing) {
    if (!(`_${k}` in have)) pieces.push(`"_${k}": ${JSON.stringify(NOTES[k] ?? `${k}: the built-in default`)}`)
    pieces.push(`"${k}": ${JSON.stringify(defaults[k])}`)
  }
  const sep = body.endsWith('{') ? '' : ','
  return { text: `${body}${sep}\n${pieces.map(p => indent + p).join(',\n')}${tail}`, added: missing }
}
