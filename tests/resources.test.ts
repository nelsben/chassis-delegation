// MOD-23: exclusive resources and fan-out. A card names the resources it holds (one live app at
// a time), the queue enforces it, and the card tool writes several research lanes from one
// sentence. Pure. The modules are imported whole so a missing function fails its own test.
import { test, expect, describe } from 'claude-code/testing'
import * as brief from '../hooks/lib/brief'
import * as card from '../hooks/lib/card'
import * as compaction from '../hooks/lib/compaction'
import * as dispatch from '../hooks/lib/dispatch'
import * as live from '../hooks/lib/live'
import * as scheduler from '../hooks/lib/scheduler'

const want = (label: string, ...resources: string[]) => ({ label, resources })

describe('MOD-23: the queue plans around exclusive resources', () => {
  test('two queued cards that both hold blender-live: the first is ready, the second waits naming the first', () => {
    const plan = scheduler.planQueue([want('OPS-1', 'blender-live'), want('OPS-2', 'blender-live')], [], 2)
    expect(plan.ready).toEqual(['OPS-1'])
    expect(plan.waits.get('OPS-2')).toEqual({ resource: 'blender-live', holder: 'OPS-1' })
    expect(plan.waits.has('OPS-1')).toBe(false)
  })

  test('a card with no resources is not held up, even behind a card that waits', () => {
    const plan = scheduler.planQueue([want('OPS-1', 'blender-live'), want('OPS-2', 'blender-live'), want('OPS-3')], [], 3)
    expect(plan.ready).toEqual(['OPS-1', 'OPS-3'])
    expect([...plan.waits.keys()]).toEqual(['OPS-2'])
  })

  test('a running worker that holds the resource keeps every queued card that wants it waiting, naming that worker', () => {
    const plan = scheduler.planQueue([want('OPS-2', 'blender-live'), want('OPS-3'), want('OPS-4', 'blender-live')], [want('OPS-1', 'blender-live')], 3)
    expect(plan.ready).toEqual(['OPS-3'])
    expect(plan.waits.get('OPS-2')).toEqual({ resource: 'blender-live', holder: 'OPS-1' })
    expect(plan.waits.get('OPS-4')).toEqual({ resource: 'blender-live', holder: 'OPS-1' })
  })

  test('a card that waits for a resource takes no slot: the free slots go to the cards that can run', () => {
    const plan = scheduler.planQueue([want('OPS-2', 'blender-live'), want('OPS-3'), want('OPS-4')], [want('OPS-1', 'blender-live')], 1)
    expect(plan.ready).toEqual(['OPS-3'])
    // OPS-4 only lacks a slot, so it is not said to wait for a resource
    expect(plan.waits.has('OPS-4')).toBe(false)
  })

  test('different resources do not meet; a nothing queue plans nothing', () => {
    expect(scheduler.planQueue([want('OPS-1', 'blender-live'), want('OPS-2', 'gpu')], [], 2).ready).toEqual(['OPS-1', 'OPS-2'])
    expect(scheduler.planQueue([], [want('OPS-1', 'blender-live')], 2)).toEqual({ ready: [], waits: new Map() })
  })

  test('resourceBlock names the first resource the card wants that another attempt holds, and who holds it', () => {
    const held = [want('OPS-1', 'blender-live'), want('OPS-5', 'gpu')]
    expect(scheduler.resourceBlock(['blender-live'], held, 'OPS-2')).toEqual({ resource: 'blender-live', holder: 'OPS-1' })
    expect(scheduler.resourceBlock(['gpu', 'blender-live'], held, 'OPS-2')).toEqual({ resource: 'gpu', holder: 'OPS-5' })
    expect(scheduler.resourceBlock([], held, 'OPS-2')).toBeUndefined()
    expect(scheduler.resourceBlock(['disk'], held, 'OPS-2')).toBeUndefined()
  })

  test('a card never waits for itself: its own label holds nothing against it', () => {
    expect(scheduler.resourceBlock(['blender-live'], [want('OPS-1', 'blender-live')], 'OPS-1')).toBeUndefined()
  })

  test('the refusal line, exactly, and it counts as queued', () => {
    const deny = scheduler.resourceDeny('BE-101', 'blender-live', 'T-1')
    expect(deny).toBe('queued: BE-101 — waiting for resource blender-live (held by T-1)')
    expect(scheduler.isQueuedDeny(deny)).toBe(true)
    // asked again while it waits: it keeps its place and says since when
    const again = scheduler.resourceDeny('BE-101', 'blender-live', 'T-1', { at: 0, position: 1 })
    expect(again).toMatch(/^queued: BE-101 — waiting for resource blender-live \(held by T-1\); already queued since \d\d:\d\d \(position 1\)$/)
    expect(scheduler.isQueuedDeny(again)).toBe(true)
    expect(scheduler.alreadyQueuedPart(again)).toMatch(/^already queued since \d\d:\d\d \(position 1\)$/)
  })

  test('the part of a state row that says what it waits for', () => {
    expect(scheduler.waitsText({ resource: 'blender-live', holder: 'T-1' })).toBe('waiting for resource blender-live (held by T-1)')
  })
})

describe('MOD-23: the brief header carries resources=', () => {
  test('resources= is a recognised field: the value before it keeps its end, and it reads back as a list', () => {
    const h = brief.parseHeader('[[brief v=1 task=OPS-1 subtask=main purpose=build tier=standard model=sonnet scope=/out/a/** forbid= red_test="none" gate=check repo=none outdir=/out/a scratch=/tmp/x resources=blender-live,gpu spend=10 budget=2-attempts report=chassis.report.v1]]\nbody')
    if (!h) throw new Error('no header')
    expect(h.fields.scratch).toBe('/tmp/x')
    expect(h.fields.resources).toBe('blender-live,gpu')
    expect(brief.resourcesOf(h)).toEqual(['blender-live', 'gpu'])
    expect(h.fields.spend).toBe('10')
  })

  test('no resources= (or an empty one, or no header) is no resources', () => {
    const plain = brief.parseHeader('[[brief v=1 task=OPS-1 subtask=main tier=standard]]\nbody')
    expect(brief.resourcesOf(plain)).toEqual([])
    expect(brief.resourcesOf(brief.parseHeader('[[brief v=1 task=OPS-1 resources= budget=2-attempts]]\nbody'))).toEqual([])
    expect(brief.resourcesOf(undefined)).toEqual([])
  })

  test('a name is listed once, trimmed', () => {
    expect(brief.resourcesOf(brief.parseHeader('[[brief v=1 task=T-1 resources=a, b,a budget=2-attempts]]\nx'))).toEqual(['a', 'b'])
  })

  test('two lists meet at the first resource they share', () => {
    expect(brief.sharedResource(['a', 'b'], ['c', 'b'])).toBe('b')
    expect(brief.sharedResource(['a'], ['c'])).toBeUndefined()
    expect(brief.sharedResource([], ['c'])).toBeUndefined()
    expect(brief.sharedResource(['a'], [])).toBeUndefined()
  })
})

describe('MOD-23: a card may carry resources', () => {
  const CARD = ['---', 'id: OPS-8', 'title: Extract the hair', 'domain: ops', 'tier: standard', 'status: queued', 'repo: none', 'scope: [/out/hair/**]', 'forbid: []', 'resources: [blender-live, gpu]', 'red_test: none', 'gate: check', 'budget: 2-attempts', '---', '## Why', '', 'x', ''].join('\n')

  test('the frontmatter list is read, and a card without it holds nothing', () => {
    const c = dispatch.parseCard(CARD)
    if ('error' in c) throw new Error(c.error)
    expect(c.resources).toEqual(['blender-live', 'gpu'])
    const none = dispatch.parseCard(CARD.replace('resources: [blender-live, gpu]\n', ''))
    if ('error' in none) throw new Error(none.error)
    expect(none.resources).toEqual([])
  })

  test('the header names them after the folders and before spend=; a card with none renders the header it always did', () => {
    const c = dispatch.parseCard(CARD)
    if ('error' in c) throw new Error(c.error)
    const header = dispatch.renderHeader({ card: c, tier: 'standard', alias: 'sonnet', budget: 2, spend: 10, repo: 'none', outdir: '/out/hair', scratch: '/tmp/x' })
    expect(header).toContain(' repo=none outdir=/out/hair scratch=/tmp/x resources=blender-live,gpu spend=10 budget=2-attempts ')
    const bare = dispatch.parseCard(CARD.replace('resources: [blender-live, gpu]\n', ''))
    if ('error' in bare) throw new Error(bare.error)
    expect(dispatch.renderHeader({ card: bare, tier: 'standard', alias: 'sonnet', budget: 2 })).not.toContain('resources=')
  })

  test('the header parses back to the same list', () => {
    const c = dispatch.parseCard(CARD)
    if ('error' in c) throw new Error(c.error)
    const h = brief.parseHeader(`${dispatch.renderHeader({ card: c, tier: 'standard', alias: 'sonnet', budget: 2 })}\nbody`)
    expect(brief.resourcesOf(h)).toEqual(['blender-live', 'gpu'])
  })

  test('the overlap refusal and warning for a resource two repo=here cards would use at once', () => {
    expect(dispatch.resourceOverlapRefusal('BE-101', 'blender-live', 'GH-19')).toBe(
      '/dispatch BE-101: refused — BE-101 holds resource blender-live, which in-flight GH-19 holds in the shared checkout; both would use it at once (pass --force-overlap to dispatch anyway; it then waits for the resource)',
    )
    expect(dispatch.resourceOverlapWarning('BE-101', 'blender-live', 'GH-19')).toBe(
      'warning: BE-101 holds resource blender-live, which in-flight GH-19 holds in the shared checkout (--force-overlap: dispatched anyway; it waits for the resource)',
    )
  })
})

describe('MOD-23: the card tool takes resources and lanes', () => {
  const ctx = (over: Partial<card.CardCtx> = {}): card.CardCtx => ({
    domains: ['frontend', 'backend', 'ops'],
    gateIds: ['check', 'test'],
    names: ['README.md', 'OPS-1-a.md', 'OPS-4-b.md'],
    spendByTier: { economy: 2, standard: 6, frontier: 15 },
    ...over,
  })
  const input = (over: Record<string, unknown> = {}): Record<string, unknown> => ({
    title: 'Extract the avatar parts',
    why: 'The avatar is built outside the repo; one lane per part.',
    doneWhen: ['the part is in the lane output folder'],
    redTest: 'none',
    repo: 'none',
    gate: 'check',
    forbid: ['/out/notes/shared.md'],
    resources: ['blender-live'],
    lanes: [
      { title: 'Extract the hair model', scope: ['/out/hair/**'] },
      { title: 'Extract the eye model', scope: ['/out/eyes/**'], doneWhen: ['eyes.glb is in /out/eyes'] },
    ],
    ...over,
  })
  const lanes = (r: ReturnType<typeof card.cardsFromFields>): card.NewCard[] => {
    if ('error' in r) throw new Error(r.error)
    return r
  }
  /** The refusal text, or a failure when the call was not refused. */
  const refusal = (r: ReturnType<typeof card.cardsFromFields>): string => {
    if (!('error' in r)) throw new Error('expected a refusal')
    return r.error
  }
  const parsed = (text: string) => {
    const c = dispatch.parseCard(text)
    if ('error' in c) throw new Error(c.error)
    return c
  }

  test('two lanes write two cards with ids N and N+1, the shared forbid, resources, gate and tier, and each lane its own scope', () => {
    const made = lanes(card.cardsFromFields(input({ tier: 'frontier' }), ctx()))
    expect(made.map(m => m.id)).toEqual(['OPS-5', 'OPS-6'])
    expect(made.map(m => m.file)).toEqual(['OPS-5-extract-the-hair-model.md', 'OPS-6-extract-the-eye-model.md'])
    const [hair, eyes] = made.map(m => parsed(m.text))
    expect(hair).toMatchObject({ id: 'OPS-5', title: 'Extract the hair model', tier: 'frontier', repo: 'none', scope: ['/out/hair/**'], forbid: ['/out/notes/shared.md'], resources: ['blender-live'], gate: ['check'], redTest: 'none' })
    expect(eyes).toMatchObject({ id: 'OPS-6', title: 'Extract the eye model', tier: 'frontier', repo: 'none', scope: ['/out/eyes/**'], forbid: ['/out/notes/shared.md'], resources: ['blender-live'], gate: ['check'] })
    // the shared why on both
    for (const m of made) expect(m.text).toContain('## Why\n\nThe avatar is built outside the repo; one lane per part.\n')
  })

  test("a lane's doneWhen is its own; a lane without one takes the shared list", () => {
    const [hair, eyes] = lanes(card.cardsFromFields(input(), ctx())).map(m => m.text)
    expect(hair).toContain('## Done when\n\n- the part is in the lane output folder\n')
    expect(eyes).toContain('## Done when\n\n- eyes.glb is in /out/eyes\n')
    expect(eyes).not.toContain('the part is in the lane output folder')
  })

  test('the ids continue the card folder per prefix, and a lane of another domain takes that prefix', () => {
    const made = lanes(card.cardsFromFields(input({ domain: 'backend' }), ctx({ names: ['BE-9-x.md', 'OPS-30-y.md'] })))
    expect(made.map(m => m.id)).toEqual(['BE-10', 'BE-11'])
  })

  test('lane scopes that overlap are refused, naming both lanes and both scopes; nothing is returned to write', () => {
    const error = refusal(card.cardsFromFields(input({ lanes: [{ title: 'Extract the hair model', scope: ['/out/avatar/**'] }, { title: 'Extract the eye model', scope: ['/out/avatar/eyes/**'] }] }), ctx()))
    expect(error).toContain('Extract the hair model')
    expect(error).toContain('Extract the eye model')
    expect(error).toContain('/out/avatar/**')
    expect(error).toContain('/out/avatar/eyes/**')
    expect(error).toContain('overlap')
  })

  test('disjoint output folders are fine, and so is a lane list of one', () => {
    expect('error' in card.cardsFromFields(input({ lanes: [{ title: 'A', scope: ['/out/a/**'] }, { title: 'B', scope: ['/out/ab/**'] }] }), ctx())).toBe(false)
    expect(lanes(card.cardsFromFields(input({ lanes: [{ title: 'Only one', scope: ['/out/a/**'] }] }), ctx()))).toHaveLength(1)
  })

  test('a lane needs a title and a scope of globs; the refusal names the lane', () => {
    expect(refusal(card.cardsFromFields(input({ lanes: [{ title: 'A', scope: ['/out/a/**'] }, { scope: ['/out/b/**'] }] }), ctx()))).toContain('lane 2')
    expect(refusal(card.cardsFromFields(input({ lanes: [{ title: 'A', scope: ['the hair folder'] }] }), ctx()))).toContain('lane 1')
    expect(refusal(card.cardsFromFields(input({ lanes: [{ title: 'A' }] }), ctx()))).toContain('lane 1')
    expect('error' in card.cardsFromFields(input({ lanes: [] }), ctx())).toBe(true)
    expect('error' in card.cardsFromFields(input({ lanes: 'hair' }), ctx())).toBe(true)
  })

  test('a shared scope beside lanes is refused: the lanes carry their own', () => {
    expect(refusal(card.cardsFromFields(input({ scope: ['/out/**'] }), ctx()))).toContain('scope')
  })

  test('no lanes: one card, as before', () => {
    const { lanes: _unused, ...single } = input({ scope: ['/out/hair/**'] })
    const made = lanes(card.cardsFromFields(single, ctx()))
    expect(made).toHaveLength(1)
    expect(made[0]?.id).toBe('OPS-5')
    expect(parsed((made[0] as card.NewCard).text).resources).toEqual(['blender-live'])
  })

  test('a single card takes resources too: written on the card, listed in the summary; none writes nothing', () => {
    const { lanes: _unused, ...single } = input({ scope: ['/out/hair/**'] })
    const r = card.cardFromFields(single, ctx())
    if ('error' in r) throw new Error(r.error)
    expect(r.text).toContain('\nresources: [blender-live]\n')
    expect(r.resources).toEqual(['blender-live'])
    expect(card.cardSummary(r, 'sonnet')).toContain(' · resources blender-live · ')
    const bare = card.cardFromFields({ ...single, resources: undefined }, ctx())
    if ('error' in bare) throw new Error(bare.error)
    expect(bare.text).not.toContain('resources')
    expect(bare.resources).toEqual([])
    expect(card.cardSummary(bare, 'sonnet')).not.toContain('resources')
  })

  test('a resource name is one plain word: a space, a comma or a quote is refused with the fix', () => {
    for (const bad of ['blender live', 'a,b', 'a"b', '']) {
      expect(refusal(card.cardsFromFields(input({ resources: [bad] }), ctx()))).toContain('resources')
    }
    expect('error' in card.cardsFromFields(input({ resources: 'blender-live' }), ctx())).toBe(true)
  })

  test('the tool schema takes resources and lanes; scope is no longer required of every call; the old description lines stay', () => {
    const props = card.CARD_TOOL.inputSchema.properties as Record<string, { type?: string; items?: { type?: string; properties?: Record<string, unknown> } }>
    expect(props.resources?.type).toBe('array')
    expect(props.lanes?.type).toBe('array')
    expect(Object.keys(props.lanes?.items?.properties ?? {}).sort()).toEqual(['doneWhen', 'scope', 'title'])
    expect(card.CARD_TOOL.inputSchema.required).toEqual(['title', 'why', 'doneWhen', 'redTest'])
    expect(card.CARD_TOOL.description).toContain('lanes')
    expect(card.CARD_TOOL.description).toContain('Never ask the person to edit a card file.')
    expect(card.CARD_TOOL.description).toContain('research or extraction with outputs outside the repo: repo none or here, scope = the output folder')
  })

  test('a call with no lanes and no scope is still refused for the scope', () => {
    const { lanes: _unused, ...single } = input()
    expect(refusal(card.cardsFromFields(single, ctx()))).toContain('scope')
  })

  test('the closing line names every lane', () => {
    expect(card.sayGo('OPS-5')).toBe('Say go and Claude dispatches OPS-5.')
    expect(card.sayGo(['OPS-5', 'OPS-6'])).toBe('Say go and Claude dispatches OPS-5, OPS-6.')
  })
})

describe('MOD-23: the state names what a waiting row waits for, and the posture covers a pending review block', () => {
  const READY = 'ready: BE-9 — run its spawn block (/dispatch BE-9 prints it again)'
  const WAITS = 'waiting for resource blender-live (held by T-1)'
  const lines = (s: compaction.StateSnapshot) => (compaction.composeSection(s)?.text ?? '').split('\n')

  test('a row waiting on a resource says what it waits for', () => {
    const s = { ...compaction.emptySnapshot(), queued: [{ task: 'T-9', position: 1, waits: WAITS }, { task: 'T-10', position: 2 }] }
    expect(compaction.renderState(s)).toEqual(['Delegation state (chassis-delegation):', `- queued: T-9 (position 1) — ${WAITS}`, '- queued: T-10 (position 2)'])
  })

  test('a row that only waits (for a slot or a resource) is no call for the brain to make: no posture line', () => {
    const s = { ...compaction.emptySnapshot(), queued: [{ task: 'T-9', position: 1, waits: WAITS }] }
    expect(compaction.actPending(s)).toBe(false)
    expect(lines(s)).not.toContain(compaction.ACT_POSTURE)
  })

  test('an owed review is told from the other owed rows by its advice', () => {
    expect(compaction.isReviewOwed('T-4: review')).toBe(true)
    expect(compaction.isReviewOwed('T-1/ui: review')).toBe(true)
    expect(compaction.isReviewOwed('T-4: resume agent=agent-9')).toBe(false)
    expect(compaction.isReviewOwed('T-4: review the diff by hand')).toBe(false)
    expect(compaction.isReviewOwed('T-4: respawn at frontier — same brief /s/briefs/T-4.brief.md, make the spawn block below (it names the model)')).toBe(false)
  })

  test('an owed review carries the posture line once, right under the header, beside a ready row', () => {
    for (const s of [
      { ...compaction.emptySnapshot(), owed: ['T-4: review'] },
      { ...compaction.emptySnapshot(), owed: ['T-4: review'], queued: [{ task: 'BE-9', position: 1, ready: READY }] },
    ]) {
      expect(compaction.actPending(s)).toBe(true)
      const out = lines(s)
      expect(out[0]).toBe('Delegation state (chassis-delegation):')
      expect(out[1]).toBe(compaction.ACT_POSTURE)
      expect(out.filter(l => l === compaction.ACT_POSTURE)).toHaveLength(1)
    }
  })

  test('the posture line names the reviewer’s Agent call beside the ready and respawn calls, and keeps its three exceptions', () => {
    expect(compaction.ACT_POSTURE).toContain('a ready: row’s spawn call')
    expect(compaction.ACT_POSTURE).toContain('a respawn block’s Agent call')
    expect(compaction.ACT_POSTURE).toContain('a pending review block’s Agent call')
    expect(compaction.ACT_POSTURE).toContain('without asking the person')
    expect(compaction.ACT_POSTURE).toContain('over-spend')
  })
})

describe('MOD-23: the dashboard shows the resource a worker holds', () => {
  const NOW = 10_000_000
  const rec = (task: string, over: Record<string, unknown> = {}) => ({
    task,
    subtask: 'main',
    attempt: 1,
    kind: 'spawn' as const,
    lineage: 1,
    tier: 'standard' as const,
    alias: 'sonnet',
    verdict: 'pending',
    at: NOW - 600_000,
    ...over,
  })
  const input = {
    root: '/r/acme-app',
    porcelain: '',
    now: NOW,
    budget: 3,
    liveAt: { 'T-1': NOW - 60_000 },
    queue: [{ task: 'T-3', subtask: 'main' }],
    records: [rec('T-1'), rec('T-2', { verdict: 'consistent' })],
    holds: { 'T-1': ['blender-live'] },
    waits: { 'T-3': { resource: 'blender-live', holder: 'T-1' } },
  }

  test('a live worker row names the resource it holds, a queued row what it waits for, and a row with none has none', () => {
    const rows = live.worktreeRows(input)
    expect(rows.find(r => r.task === 'T-1')?.resource).toBe('blender-live')
    expect(rows.find(r => r.task === 'T-3')?.resource).toBe('waits blender-live')
    expect(rows.find(r => r.task === 'T-2')?.resource).toBeUndefined()
  })

  test('the text fallback gains a Resource column when any row has one, and keeps its columns when none does', () => {
    const view = (rows: live.WorktreeRow[]): live.LiveView => ({ now: NOW, live: 1, queued: 1, owed: 0, usd: 0, series: [], events: [], rows, byModel: [], firstTry: { n: 0, m: 0 } })
    const withRes = live.dashboardText(view(live.worktreeRows(input)))
    expect(withRes).toContain('| Task | Model | State | Worktree | Resource | Tokens | Cost | Attempt |')
    expect(withRes).toMatch(/\| T-1 \| [^|]*\| live [^|]*\| – \| blender-live \| – \| – \| 1\/3 \|/)
    expect(withRes).toMatch(/\| T-3 \| [^|]*\| queued #1 \| – \| waits blender-live \|/)
    const without = live.dashboardText(view(live.worktreeRows({ ...input, holds: {}, waits: {} })))
    expect(without).toContain('| Task | Model | State | Worktree | Tokens | Cost | Attempt |')
    expect(without).not.toContain('Resource')
  })
})
