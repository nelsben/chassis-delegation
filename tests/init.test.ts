import { test, expect, describe } from 'claude-code/testing'
import { CONFIG_TEMPLATE, GITIGNORE_LINE, INIT_FILES, initPlan, initText, SAMPLE_CARD, TASKS_README } from '../hooks/lib/init'
import { parseCard } from '../hooks/lib/dispatch'
import { mergeConfig, parseRepoConfig } from '../hooks/lib/repoconfig'

const R = '/w/app'

describe('5B: /delegation init scaffolds a repo that lacks the files', () => {
  test('in an empty repo it writes the four files', () => {
    const plan = initPlan(R, {})
    expect(INIT_FILES).toEqual(['agents/tasks/README.md', 'agents/tasks/OPS-000-sample.md', '.chassis-delegation.json', '.gitignore'])
    expect(plan.map(p => [p.path, p.action])).toEqual([
      [`${R}/agents/tasks/README.md`, 'write'],
      [`${R}/agents/tasks/OPS-000-sample.md`, 'write'],
      [`${R}/.chassis-delegation.json`, 'write'],
      [`${R}/.gitignore`, 'write'],
    ])
    expect(plan[3]?.text).toBe(`${GITIGNORE_LINE}\n`)
    expect(GITIGNORE_LINE).toBe('.delegation/')
  })
  test('never overwrites: an existing file is left as it is; .gitignore gains the line only when it lacks it', () => {
    const existing = {
      [`${R}/agents/tasks/README.md`]: '# ours\n',
      [`${R}/.chassis-delegation.json`]: '{}',
      [`${R}/.gitignore`]: 'node_modules/\ndist/',
    }
    const plan = initPlan(R, existing)
    expect(plan.map(p => p.action)).toEqual(['skip', 'write', 'skip', 'append'])
    expect(plan[3]?.text).toBe('node_modules/\ndist/\n.delegation/\n')
    expect(initPlan(R, { [`${R}/.gitignore`]: 'x\n.delegation/\n' })[3]?.action).toBe('skip')
    expect(initPlan(R, { [`${R}/.gitignore`]: 'x\n/.delegation\n' })[3]?.action).toBe('skip')
  })
  test('GH-12: in a repo that is itself a plugin, cards go under delegation/tasks and cardDir says so', () => {
    const plan = initPlan(R, { [`${R}/.claude-plugin/plugin.json`]: '{}' })
    expect(plan.map(p => [p.path, p.action])).toEqual([
      [`${R}/delegation/tasks/README.md`, 'write'],
      [`${R}/delegation/tasks/OPS-000-sample.md`, 'write'],
      [`${R}/.chassis-delegation.json`, 'write'],
      [`${R}/.gitignore`, 'write'],
    ])
    const config = JSON.parse(plan[2]?.text ?? '{}')
    expect(config.cardDir).toBe('delegation/tasks')
    expect(typeof config._cardDir).toBe('string')
    expect(plan[0]?.text).toContain('delegation/tasks/<ID>-<slug>.md')
    expect(plan[0]?.text).not.toContain('agents/tasks')
    expect(plan[1]?.text).not.toContain('agents/tasks')
    expect(initText(R, plan)).toContain('cards go under delegation/tasks/ (this repo is a plugin: agents/ is the engine\'s subagent folder)')
    // not a plugin: the default stays
    const plain = initPlan(R, {})
    expect(JSON.parse(plain[2]?.text ?? '{}').cardDir).toBe('agents/tasks')
    expect(initText(R, plain)).not.toContain('this repo is a plugin')
    // an existing config is never overwritten
    expect(initPlan(R, { [`${R}/.claude-plugin/plugin.json`]: '{}', [`${R}/.chassis-delegation.json`]: '{}' })[2]?.action).toBe('skip')
  })
  test('with a pending-update flag, init ends with the restart note; without, it does not', () => {
    const plan = initPlan(R, {})
    const note = 'If Claude Code says an update is pending, restart the session once before dispatching; init itself needs no re-run.'
    expect(initText(R, plan, {}, true).endsWith(note)).toBe(true)
    expect(initText(R, plan).includes('restart the session')).toBe(false)
  })
  test('it prints what it wrote, and what it left', () => {
    const text = initText(R, initPlan(R, { [`${R}/.chassis-delegation.json`]: '{}' }))
    expect(text).toContain(`wrote ${R}/agents/tasks/README.md`)
    expect(text).toContain(`left ${R}/.chassis-delegation.json (exists; never overwritten)`)
    expect(text).toContain(`wrote ${R}/.gitignore (.delegation/)`)
  })
})

describe('5B: the scaffolded files are usable as written', () => {
  test('the sample card parses and /dispatch refuses it (status template)', () => {
    const card = parseCard(SAMPLE_CARD)
    expect('error' in card).toBe(false)
    if (!('error' in card)) {
      expect(card.id).toBe('OPS-000')
      expect(card.status).toBe('template')
      expect(card.domain).toBe('ops')
      expect(card.scope.length).toBeGreaterThan(0)
    }
  })
  test('the config file holds the defaults, commented, and parses without one error', () => {
    const { config, errors } = parseRepoConfig(CONFIG_TEMPLATE)
    expect(errors).toEqual([])
    const e = mergeConfig(config, {})
    expect(e.gateMap).toEqual({})
    expect(e.maxWorkers).toBe(2)
    expect(e.autoEval).toBe(false)
    expect(e.domains).toEqual(['frontend', 'backend', 'ops', 'dispatcher', 'cross', 'shared'])
    expect(JSON.parse(CONFIG_TEMPLATE)._comment).toContain('defaults < this file < /config')
  })
  test('the cards README names the frontmatter fields', () => {
    for (const f of ['id:', 'title:', 'domain:', 'tier:', 'status:', 'scope:', 'forbid:', 'red_test:', 'gate:', 'budget:']) expect(TASKS_README).toContain(f)
  })
})
