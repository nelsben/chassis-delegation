// Part 5B: `/delegation init` and the `init` tool. In a repo that lacks them,
// write the task-card folder's README, one sample card, the repo config file
// with its defaults commented, and the `.delegation/` line in .gitignore.
// Never overwrite a file: one that exists is left as it is (.gitignore only
// gains the line when it lacks it). Pure: no `$`; the hook does the writes.
import { DEFAULT_AGENT_TYPES, DEFAULT_CARD_DIR, DEFAULT_DOMAINS, DEFAULT_MAX_WORKERS, DEFAULT_TIER_MAP, REPO_CONFIG_FILE } from './repoconfig'

export const GITIGNORE_LINE = '.delegation/'
/** GH-12: a repo holding this file is itself a plugin, and the engine reads its agents/*.md as subagents. */
export const PLUGIN_MANIFEST = '.claude-plugin/plugin.json'
export const PLUGIN_CARD_DIR = 'docs/cards'
export const INIT_FILES = ['agents/tasks/README.md', 'agents/tasks/OPS-000-sample.md', REPO_CONFIG_FILE, '.gitignore'] as const

export const tasksReadme = (dir: string): string => TASKS_README.split('agents/tasks').join(dir)
export const sampleCard = (dir: string): string => SAMPLE_CARD.split('agents/tasks').join(dir)

export const TASKS_README = `# Task cards

One file per task: \`agents/tasks/<ID>-<slug>.md\`, YAML frontmatter, then the spec
in markdown. \`<ID>\` is \`<PREFIX>-<number>[letter]\`: OPS-12, BE-101, FE-7b. The
brain (the main model) dispatches a card with the \`dispatch\` tool, or you do
with \`/dispatch <ID>\`; chassis-delegation writes the brief, cuts the worktree,
picks the model tier, spawns the worker and verifies what it reports.

\`\`\`yaml
---
id: OPS-12
title: One line that says what done looks like
domain: ops
tier: standard
status: queued
scope: [src/feature/**, docs/feature.md]
forbid: [src/secrets/**]
red_test: npm test -- feature.test.ts
gate: test
budget: 2-attempts
---
\`\`\`

| Field | What it means |
| --- | --- |
| \`id:\` | the task id; the file name starts with it |
| \`title:\` | one line, the outcome |
| \`domain:\` | one of the repo's domains (\`domains\` in .chassis-delegation.json; default ${DEFAULT_DOMAINS.join(', ')}); the branch is \`agent/<domain>/<id>\` and \`agentTypes\` maps it to the subagent type |
| \`tier:\` | economy, standard or frontier: haiku, sonnet, opus by default (\`tierMap\`) |
| \`status:\` | \`/dispatch\` takes \`queued\` or \`claimed\`; anything else (\`template\`, \`merged\`) is refused |
| \`scope:\` | globs the worker may change (\`*\` crosses folders; a trailing \`/\` means everything under it) |
| \`forbid:\` | globs it must not touch |
| \`red_test:\` | the test that fails before the change and passes after |
| \`gate:\` | gate ids from \`gateMap\` (comma-separated); the verifier re-runs them in the worker's worktree |
| \`budget:\` | \`<n>-attempts\`: spawns plus resumes before the task is handed back to you |

Below the frontmatter, write the card as you would brief a colleague: why, what,
and how you will know it is done. The worker reads it verbatim inside its brief.

A worker ends its hand-back with one line,
\`[[report v=1 task=<id> subtask=main branch=<branch> pr=none sha=<sha> gate=pass|fail files=<a,b>]]\`,
and when it had to touch a file outside its scope, an amend block on its own line,
\`[[amend v=1 scope+=<path> reason=<one line>]]\`, which the mod appends to the brief
before verifying (\`scope-=\` / \`forbid-=\` wait for your approval).
`

export const SAMPLE_CARD = `---
id: OPS-000
title: A sample card (status template, so /dispatch refuses it; copy it to start a real one)
domain: ops
tier: standard
status: template
scope: [docs/**]
forbid: [.chassis-delegation.json]
red_test: none (docs only)
gate: test
budget: 2-attempts
---
## Why

Shows the card format. Copy this file to \`agents/tasks/OPS-1-<slug>.md\`, give it a
real id, title, scope and red test, set \`status: queued\`, and ask the brain to
dispatch it (or run \`/dispatch OPS-1\`).

## Done when

- The red test named above fails on the base branch and passes on the worker's branch.
- The gate (\`gate:\` ids, mapped in \`gateMap\`) is green in the worker's worktree.
`

const tierMap = { ...DEFAULT_TIER_MAP }

/** The repo config file: every key with its default, a `_`-key comment before each. */
export const configTemplate = (cardDir: string = DEFAULT_CARD_DIR): string => {
  const o = JSON.parse(CONFIG_TEMPLATE) as Record<string, unknown>
  const out: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(o)) {
    if (k === 'cardDir') out[k] = cardDir
    else out[k] = v
  }
  return `${JSON.stringify(out, null, 2)}\n`
}

export const CONFIG_TEMPLATE = `${JSON.stringify(
  {
    _comment:
      'chassis-delegation per-repo config. Every key is optional. Precedence: built-in defaults < this file < /config settings (maps merge per key). Keys starting with _ are comments and are ignored.',
    _gateMap:
      "Brief gate= id -> the command the verifier re-runs in the worker's own worktree, by argv (no shell). {files} is the changed-files list (one path a line); chain with ' && '. Example: {\"test\": \"npm test\", \"lint\": \"npx eslint --max-warnings 0 {files}\"}. An id the map lacks is reported 'gate not re-run' (unverified), never run raw.",
    gateMap: {},
    _agentTypes: 'Card domain -> the subagent type /dispatch spawns (the Agent tool subagent_type). A domain not named here runs on a subagent type of its own name when the session offers one, else general-purpose. Example: {"ops": "general-purpose", "web": "frontend"}.',
    agentTypes: { ...DEFAULT_AGENT_TYPES },
    _tierMap: 'Card tier -> model alias (haiku, sonnet, opus; fable is rewritten to opus). Always an alias, so model releases move the ladder.',
    tierMap,
    _domains: 'The card domains /dispatch accepts; the branch is agent/<domain>/<id>.',
    domains: [...DEFAULT_DOMAINS],
    _maxWorkers: 'Briefed workers at once; a briefed spawn past it waits in a queue.',
    maxWorkers: DEFAULT_MAX_WORKERS,
    _worktreeRoot: "Folder for the workers' worktrees; empty = sibling folders <repo>-<id>.",
    worktreeRoot: '',
    _cardDir: "The folder the task cards live in, relative to the repo root. In a repo that is itself a plugin keep it out of agents/: the engine reads agents/*.md as subagents.",
    cardDir: DEFAULT_CARD_DIR,
    _briefTemplate: "A brief body template file (absolute path); empty = the mod's hooks/templates/brief.md.",
    briefTemplate: '',
    _briefExtra: 'Repo-specific lines added to every brief (setup steps, conventions, things never to do).',
    briefExtra: '',
    _evalCommand: 'What a background eval runner runs once per new origin/main sha when the session is idle; empty = no eval. Needs autoEval true here or in /config.',
    evalCommand: '',
    evalLiveCommand: '',
    autoEval: false,
  },
  null,
  2,
)}\n`

export type InitStep = { path: string; action: 'write' | 'append' | 'skip'; text: string }

const hasIgnoreLine = (text: string): boolean =>
  text.split(/\r?\n/).some(l => ['.delegation', '.delegation/', '/.delegation', '/.delegation/'].includes(l.trim()))

/**
 * What init does in `root`, given the current text of each of its four files
 * (absent = not there): write the missing ones, leave the present ones, and
 * append `.delegation/` to a .gitignore that lacks it.
 */
export function initPlan(root: string, existing: Readonly<Record<string, string | undefined>>): InitStep[] {
  const r = root.replace(/\/+$/, '')
  // GH-12: a plugin repo keeps its cards out of agents/, which the engine reads as subagents
  const dir = existing[`${r}/${PLUGIN_MANIFEST}`] !== undefined ? PLUGIN_CARD_DIR : DEFAULT_CARD_DIR
  const rels = INIT_FILES.map(rel => (rel.startsWith('agents/tasks/') ? `${dir}/${rel.slice('agents/tasks/'.length)}` : rel))
  const contents: Record<string, string> = {
    [`${dir}/README.md`]: tasksReadme(dir),
    [`${dir}/OPS-000-sample.md`]: sampleCard(dir),
    [REPO_CONFIG_FILE]: configTemplate(dir),
    '.gitignore': `${GITIGNORE_LINE}\n`,
  }
  return rels.map(rel => {
    const path = `${r}/${rel}`
    const now = existing[path]
    if (rel === '.gitignore' && now !== undefined) {
      if (hasIgnoreLine(now)) return { path, action: 'skip' as const, text: now }
      return { path, action: 'append' as const, text: `${now}${now === '' || now.endsWith('\n') ? '' : '\n'}${GITIGNORE_LINE}\n` }
    }
    return now === undefined ? { path, action: 'write' as const, text: contents[rel] as string } : { path, action: 'skip' as const, text: now }
  })
}

/** What init says it did. */
export const RESTART_NOTE = 'If Claude Code says an update is pending, restart the session once before dispatching; init itself needs no re-run.'

export function initText(root: string, plan: readonly InitStep[], failed: Readonly<Record<string, string>> = {}, updateNote = false, nextLine = true): string {
  const lines = plan.map(s => {
    if (failed[s.path]) return `could not write ${s.path}: ${failed[s.path]}`
    if (s.action === 'skip') return `left ${s.path} (exists; never overwritten)`
    if (s.path.endsWith('/.gitignore')) return `${s.action === 'append' ? 'appended to' : 'wrote'} ${s.path} (${GITIGNORE_LINE})`
    return `wrote ${s.path}`
  })
  const plugin = plan.some(s => s.path === `${root.replace(/\/+$/, '')}/${PLUGIN_CARD_DIR}/README.md`)
  const dir = plugin ? PLUGIN_CARD_DIR : DEFAULT_CARD_DIR
  const why = plugin ? [`- cards go under ${PLUGIN_CARD_DIR}/ (this repo is a plugin: agents/ is the engine's subagent folder)`] : []
  return [`chassis-delegation init in ${root}:`, ...lines.map(l => `- ${l}`), ...why, ...(nextLine ? [`Next: write a card under ${dir}/ (copy OPS-000-sample.md), set status: queued, and ask the brain to dispatch it.`] : []), ...(updateNote ? [RESTART_NOTE] : [])].join('\n')
}
