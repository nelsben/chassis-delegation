import { test, expect, describe } from 'claude-code/testing'
import { world, spawnInput, turnInput, usage, sessionStart } from './harness'
import { handedBackRow, runningSection, startedRow } from '../hooks/lib/rows'

// MOD-74: what reached the brain as a row (the appended user row, or the transcript log line the kit keeps)
const delivered = (w: { appended: { text: string }[]; logs: string[] }) => [...w.appended.map(a => a.text), ...w.logs].join('\n')
const brief = (task: string, extra = '') => `[[brief v=1 task=${task} subtask=main purpose=build tier=standard budget=2-attempts${extra}]]\nDo it.`
const REPORT = (task: string) => `[[report v=1 task=${task} subtask=main branch=b pr=none sha=abc1234 gate=pass files=a]]`
const status = { command: 'delegation', args: '', origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never

describe('MOD-74: a row when a worker starts', () => {
  test('a briefed spawn posts `MOD-1 started · sonnet (standard) · attempt 1/2` at spawn', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('MOD-1') }))
    expect(delivered(w)).toContain('MOD-1 started · 🔵 sonnet (standard) · attempt 1/2')
    expect(w.appended.length + w.logs.length).toBeGreaterThan(0)
  })

  test('an ad hoc spawn posts no started row', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: 'look around' }))
    expect(delivered(w)).not.toContain(' started · ')
  })

  test('a queued task that starts later says `started from queue`', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    const queued = await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    expect(queued.deny).toContain('queued: T-9')
    expect(delivered(w)).not.toContain('T-9 started')
    w.agents[0]!.status = 'completed'
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_D0000009' }))
    expect(delivered(w)).toContain('T-9 started from queue · 🔵 sonnet (standard) · attempt 1/2')
  })

  test('a message to a failed worker that records its resume says `resumed`', async ($, on) => {
    const w = world(on, { listAgents: true })
    await $.agent.spawn(spawnInput({ prompt: brief('T-5') }))
    await $.turn.complete(turnInput('agent-1', 'I got stuck, no report.'))
    await $.session.send({ to: 'agent-1', text: 'try again', origin: { kind: 'model' } } as never)
    expect(delivered(w)).toContain('T-5 resumed · 🔵 sonnet (standard) · attempt 2/2')
  })

  test('verdictVerbosity=silent posts neither the started nor the handed-back row; line posts both', { options: { verdictVerbosity: 'silent' } }, async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-6') }))
    await $.turn.complete(turnInput('agent-1', REPORT('T-6'), usage('claude-sonnet-5-5', 1000, 500)))
    expect(delivered(w)).not.toContain('T-6 started')
    expect(delivered(w)).not.toContain('T-6 handed back')
  })
})

describe('MOD-74: a row when a worker hands back', () => {
  test('the row carries the alias, elapsed minutes and the worker spend, before the verdict', { options: { verdictVerbosity: 'line' } }, async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-4') }))
    await w.clock.advance(7 * 60_000)
    await $.turn.complete(turnInput('agent-1', REPORT('T-4'), usage('claude-sonnet-5-5', 1_000_000, 100_000)))
    const text = delivered(w)
    expect(text).toMatch(/T-4 handed back · 🔵 sonnet · 7 min · \$\d+\.\d\d · verifying/)
    expect(text.indexOf('T-4 handed back')).toBeLessThan(text.indexOf('T-4 attempt 1/2'))
  })

  test('one row per attempt, however many times the hand-back fires', async ($, on) => {
    const w = world(on)
    await $.agent.spawn(spawnInput({ prompt: brief('T-4') }))
    await $.turn.complete(turnInput('agent-1', REPORT('T-4')))
    await $.turn.complete(turnInput('agent-1', REPORT('T-4'), undefined, 'turn-again'))
    expect(delivered(w).split('T-4 handed back').length).toBe(2)
  })

  test('the pure rows: `$?` while the spend is unknown', () => {
    expect(handedBackRow({ label: 'T-4', alias: 'opus', minutes: 12 })).toBe('chassis-delegation: T-4 handed back · opus · 12 min · $? · verifying')
    expect(handedBackRow({ label: 'T-4', alias: 'opus', minutes: 12, usd: 1.4 })).toContain('· 12 min · $1.40 · verifying')
    expect(startedRow({ label: 'T-4', alias: 'opus', tier: 'frontier', attempt: 2, budget: 3, kind: 'resumed' })).toBe('chassis-delegation: T-4 resumed · opus (frontier) · attempt 2/3')
  })
})

describe('MOD-74: the running: section of /delegation status', () => {
  test('one live, one verifying and one queued worker, then the brain, as the first lines', { options: { maxWorkers: 1 } }, async ($, on) => {
    const w = world(on, { listAgents: true, model: 'claude-opus-4-7' })
    await $.session.start(sessionStart)
    await $.agent.spawn(spawnInput({ prompt: brief('T-2'), tool_use_id: 'toolu_B0000002' }))
    w.agents[0]!.status = 'completed' // handed back, verdict still owed
    await $.agent.spawn(spawnInput({ prompt: brief('T-1'), tool_use_id: 'toolu_A0000001' }))
    await $.agent.spawn(spawnInput({ prompt: brief('T-9'), tool_use_id: 'toolu_C0000009' }))
    await w.clock.advance(4 * 60_000)
    const out = String((await $.command.run(status)).text).split('\n')
    expect(out[0]).toBe('running:')
    expect(out.slice(1, 4)).toEqual([
      expect.stringMatching(/^T-1 · 🔵 sonnet \(standard\) · running · 4 min · \$\d+\.\d\d$/),
      expect.stringMatching(/^T-2 · 🔵 sonnet \(standard\) · verifying · 4 min · \$\d+\.\d\d$/),
      expect.stringMatching(/^T-9 · 🔵 sonnet \(standard\) · queued · \d+ min · \$0\.00$/),
    ])
    expect(out[4]).toBe('brain: 🟣 opus')
  })

  test('nothing live: `running: none · brain: <model>`; no model from the host: unknown', async ($, on) => {
    world(on, { model: 'claude-opus-4-7' })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(status)).text)
    expect(out.split('\n')[0]).toBe('running: none · brain: 🟣 opus')
    expect(runningSection([], undefined)).toEqual(['running: none · brain: unknown'])
  })
})

// MOD-114 (#201): the brain's effort nudge on the rows, and the worker's effort on the started row. Pure first.
import { cardsHandedBack, effortNudgeOf, nudgeText, DEFAULT_EFFORT_NUDGE } from '../hooks/lib/nudge'
import { commandInput, brainSpawn, ROOT, SCRATCH } from './harness'

describe('MOD-114: the rows (pure)', () => {
  test('the started row names the effort, then the nudge, last; neither when absent', () => {
    const base = { label: 'T-1', alias: 'opus', tier: 'frontier', attempt: 1, budget: 2, kind: 'started' as const, glyph: '🟣' }
    expect(startedRow(base)).toBe('chassis-delegation: T-1 started · 🟣 opus (frontier) · attempt 1/2')
    expect(startedRow({ ...base, effort: 'high' })).toBe('chassis-delegation: T-1 started · 🟣 opus (frontier) · attempt 1/2 · effort high')
    expect(startedRow({ ...base, effort: 'high', nudge: 'lead: back to medium' })).toBe('chassis-delegation: T-1 started · 🟣 opus (frontier) · attempt 1/2 · effort high · lead: back to medium')
  })
  test('the handed-back row ends with the up nudge when given', () => {
    expect(handedBackRow({ label: 'T-1', alias: 'opus', minutes: 3, usd: 1.2, nudge: 'lead: judgment next, raise to high' })).toBe('chassis-delegation: T-1 handed back · opus · 3 min · $1.20 · verifying · lead: judgment next, raise to high')
  })
  test('cardsHandedBack: the glob is anchored at any folder; "" is off; `none` artefacts are nothing', () => {
    expect(cardsHandedBack(['cards/H10.jpg'], 'cards/**')).toBe(true)
    expect(cardsHandedBack(['/out/loop/138/hair10/cards/H10.jpg', 'notes.md'], 'cards/**')).toBe(true)
    expect(cardsHandedBack(['notes.md', 'tables/stand.json', 'mycards/x.jpg'], 'cards/**')).toBe(false)
    expect(cardsHandedBack(['cards/H1.jpg'], '')).toBe(false)
    expect(cardsHandedBack([], 'cards/**')).toBe(false)
    expect(cardsHandedBack(['renders/a.png'], 'renders/*.png')).toBe(true)
    expect(cardsHandedBack(['renders/a.jpg'], 'renders/*.png')).toBe(false)
  })
  test('effortNudgeOf: keys cards, up, down as strings; a bad key or value is named and dropped; cards may be ""', () => {
    const errors: string[] = []
    expect(effortNudgeOf({ cards: 'renders/**', up: ' xhigh ', down: 'low', _note: 'x' }, errors, '')).toEqual({ cards: 'renders/**', up: 'xhigh', down: 'low' })
    expect(effortNudgeOf({ cards: '', bogus: 1, up: 3, down: ' ' }, errors, ' (settings)')).toEqual({ cards: '' })
    expect(errors).toEqual(['effortNudge.bogus (settings): not a key (cards, up, down) (ignored)', 'effortNudge.up (settings): needs a string (ignored)', 'effortNudge.down (settings): needs an effort word (ignored)'])
    expect(effortNudgeOf('high', errors, '')).toBeUndefined()
    expect(errors.at(-1)).toBe('effortNudge: not an object (ignored)')
    expect(nudgeText(DEFAULT_EFFORT_NUDGE)).toBe('effort nudge: cards/** · up high · down medium')
    expect(nudgeText({ ...DEFAULT_EFFORT_NUDGE, cards: '' })).toBe('effort nudge: off')
  })
})

describe('MOD-114: the nudge on the rows (engine)', () => {
  const card = (id: string, extra = '') =>
    ['---', `id: ${id}`, `title: ${id}`, 'domain: ops', 'tier: frontier', 'status: queued', 'repo: none', 'scope: [/out/hair/**]', 'forbid: []', 'red_test: none', 'gate: check', 'budget: 2-attempts', ...(extra ? [extra] : []), '---', '## Why', '', 'Outside the repo.', ''].join('\n')
  const NAMES = ['OPS-8-plain.md', 'OPS-9-cards.md']
  const OPTIONS = { briefDir: `${SCRATCH}/briefs`, verdictVerbosity: 'line' as const, gateMap: '{"check":"checker {outdir}"}' }
  const REPORT = (id: string, extra: string) => `[[report v=1 task=${id} subtask=main branch=none pr=none sha=none gate=pass red=none files=none ${extra}]]`
  const setup = (on: Parameters<typeof world>[0], extra: Record<string, string> = {}) =>
    world(on, {
      files: { [`${ROOT}/agents/tasks/OPS-8-plain.md`]: card('OPS-8'), [`${ROOT}/agents/tasks/OPS-9-cards.md`]: card('OPS-9', 'effort: xhigh'), [`${ROOT}/.chassis-delegation.json`]: JSON.stringify(extra) },
      dirs: { [`${ROOT}/agents/tasks`]: NAMES },
      trees: ['/out/hair'],
      run: argv => (argv[0] === 'checker' ? { exitCode: 0, stdout: 'checked\n' } : undefined),
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
  const rows = (w: { appended: { text: string }[]; logs: string[] }) => delivered(w).split('\n').filter(l => l.startsWith('chassis-delegation: OPS-'))
  // the world numbers agents by spawn order; the spawn record says which task an agent runs
  const agentOf = (w: { store: Map<string, unknown> }, task: string): string => {
    for (const [k, v] of w.store) if (k.startsWith('delegation.spawn.') && (v as { task?: string }).task === task) return String((v as { agentId?: string }).agentId)
    throw new Error(`no spawn record for ${task}`)
  }

  test('a hand-back naming a cards artefact nudges up; its own accept row does not nudge down; the accept of another task does, once; the started row names the effort', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text), { tool_use_id: 'toolu_B0000008' })
    expect(rows(w).find(l => l.includes('OPS-9 started'))).toBe('chassis-delegation: OPS-9 started · 🟣 opus (frontier) · attempt 1/2 · effort xhigh')
    expect(rows(w).find(l => l.includes('OPS-8 started'))).toBe('chassis-delegation: OPS-8 started · 🟣 opus (frontier) · attempt 1/2 · effort high')
    w.files.set('/out/hair/cards/H1.jpg', 'jpeg-bytes')
    w.files.set('/out/hair/model.glb', 'glb-bytes')
    await $.turn.complete(turnInput(agentOf(w, 'OPS-9'), `Done.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg')}`))
    const afterNine = rows(w)
    expect(afterNine.find(l => l.includes('OPS-9 handed back'))).toMatch(/OPS-9 handed back · 🟣 opus · \d+ min · \$[\d?.]+ · verifying · lead: judgment next, raise to high$/)
    expect(afterNine.find(l => l.includes('OPS-9 attempt 1/2'))).toMatch(/consistent \(no repo\) · 🟣 opus · .*next=accept$/)
    await $.turn.complete(turnInput(agentOf(w, 'OPS-8'), `Done.\n${REPORT('OPS-8', 'artefacts=model.glb')}`))
    const eight = rows(w).find(l => l.includes('OPS-8 attempt 1/2'))
    expect(eight).toMatch(/consistent \(no repo\) · 🟣 opus · .*next=accept · lead: back to medium$/)
    expect(rows(w).find(l => l.includes('OPS-8 handed back'))).not.toContain('lead:')
    // the nudge is closed: the next started row says nothing
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text), { tool_use_id: 'toolu_C0000008' })
    expect(rows(w).filter(l => l.includes('OPS-8 started')).at(-1)).not.toContain('lead:')
  })

  test('with no other task in flight, the next started row carries the down nudge', { options: OPTIONS }, async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/cards/H1.jpg', 'jpeg-bytes')
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg')}`))
    expect(rows(w).find(l => l.includes('OPS-9 handed back'))).toContain('· lead: judgment next, raise to high')
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text))
    expect(rows(w).find(l => l.includes('OPS-8 started'))).toBe('chassis-delegation: OPS-8 started · 🟣 opus (frontier) · attempt 1/2 · effort high · lead: back to medium')
  })

  test('a resumed started row carries no down nudge, and the next fresh start of another task does', { options: OPTIONS }, async ($, on) => {
    let gateOk = false
    const w = world(on, {
      files: { [`${ROOT}/agents/tasks/OPS-8-plain.md`]: card('OPS-8'), [`${ROOT}/agents/tasks/OPS-9-cards.md`]: card('OPS-9', 'effort: xhigh'), [`${ROOT}/.chassis-delegation.json`]: '{}' },
      dirs: { [`${ROOT}/agents/tasks`]: NAMES },
      trees: ['/out/hair'],
      run: argv => (argv[0] === 'checker' ? (gateOk ? { exitCode: 0, stdout: 'checked\n' } : { exitCode: 1, stdout: 'failed\n' }) : undefined),
      store: { 'delegation.agentTypes': ['general-purpose', 'ops'] },
    })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/cards/H1.jpg', 'jpeg-bytes')
    await $.turn.complete(turnInput(agentOf(w, 'OPS-9'), `Done.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg')}`))
    expect(rows(w).find(l => l.includes('OPS-9 handed back'))).toContain('· lead: judgment next, raise to high')
    expect(rows(w).find(l => l.includes('OPS-9 attempt 1/2'))).toContain('next=resume')
    // the brain resumes the worker: the judgment is not over, so its started row has no down nudge
    gateOk = true
    await $.agent.spawn(spawnInput({ tool_use_id: 'toolu_R0000009', prompt: 'Fix the gate, then report again.', description: 'OPS-9 resume', subagentType: 'ops' }))
    await $.turn.complete(turnInput(agentOf(w, 'OPS-9'), `Fixed.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg')}`))
    const resumed = rows(w).find(l => l.includes('OPS-9 resumed'))
    expect(resumed).toBeDefined()
    expect(resumed).not.toContain('lead: back to')
    // a later fresh start of another task still closes the nudge
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text), { tool_use_id: 'toolu_B0000008' })
    expect(rows(w).find(l => l.includes('OPS-8 started'))).toMatch(/ · lead: back to medium$/)
  })

  test('effortNudge in the repo file: the glob and the words; cards "" turns the nudge off', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { effortNudge: { cards: 'renders/**', up: 'max', down: 'low' } })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/cards/H1.jpg', 'jpeg-bytes')
    w.files.set('/out/hair/renders/a.png', 'png-bytes')
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg,renders/a.png')}`))
    expect(rows(w).find(l => l.includes('OPS-9 handed back'))).toContain('· lead: judgment next, raise to max')
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text))
    expect(rows(w).find(l => l.includes('OPS-8 started'))).toContain('· lead: back to low')
    expect(String((await $.command.run(status)).text)).toContain('effort nudge: renders/** · up max · down low')
  })

  test('effortNudge cards "" posts no nudge at all', { options: OPTIONS }, async ($, on) => {
    const w = setup(on, { effortNudge: { cards: '' } })
    await $.session.start(sessionStart)
    await brainSpawn($, String((await $.command.run(commandInput('OPS-9'))).text))
    w.files.set('/out/hair/cards/H1.jpg', 'jpeg-bytes')
    await $.turn.complete(turnInput('agent-1', `Done.\n${REPORT('OPS-9', 'artefacts=cards/H1.jpg')}`))
    await brainSpawn($, String((await $.command.run(commandInput('OPS-8'))).text))
    expect(rows(w).some(l => l.includes('lead:'))).toBe(false)
    expect(String((await $.command.run(status)).text)).toContain('effort nudge: off')
  })
})
