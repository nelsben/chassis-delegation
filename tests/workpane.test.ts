// MOD-354: /delegation work opens the Work pane (the list view); the drawing's keys, toggles, chips, filters and background read.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sessionStart, ROOT, NOW } from './harness'

const CARDS = `${ROOT}/docs/cards`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })
const card = (id: string, status: string, title: string, issue?: number) =>
  ['---', `id: ${id}`, ...(issue !== undefined ? [`issue: ${issue}`] : []), `title: ${title}`, 'domain: mod', 'tier: standard', `status: ${status}`, 'scope: [hooks/x.ts]', 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const issue = (number: number, title: string, state: string, type: string, parent?: number) => ({ number, title, state, labels: [{ name: `type:${type}` }], ...(parent !== undefined ? { parent: { number: parent } } : {}) })
// Two epics and a group: #10 Checkout rework (#11 Cart totals: #12 done, #13 queued through MOD-9, #14 backlog), #30 Search (#31 backlog),
// and MOD-8 with no epic (queued).
const ISSUES = JSON.stringify([
  issue(10, 'Checkout rework', 'OPEN', 'epic'),
  issue(11, 'Cart totals', 'OPEN', 'feature', 10),
  issue(12, 'Round tax', 'CLOSED', 'story', 11),
  issue(13, 'Restore a saved cart', 'OPEN', 'story', 11),
  issue(14, 'Empty cart banner', 'OPEN', 'bug', 11),
  issue(30, 'Search', 'OPEN', 'epic'),
  issue(31, 'Filter chips', 'OPEN', 'story', 30),
])
// MOD-356: a blocked card waiting on MOD-9 (no epic), and ledger rows for MOD-9
const BLOCKED = ['---', 'id: MOD-7', 'title: Blocked thing', 'domain: mod', 'tier: standard', 'status: blocked', 'blocked_by: [MOD-9]', 'scope: [hooks/x.ts]', 'gate: node', '---', '## Done when', '', '- It works.', ''].join('\n')
const LEDGER = [
  { task: 'MOD-9', kind: 'amend', at: NOW - 3_600_000 },
  { task: 'MOD-9', kind: 'accept', at: NOW - 600_000 },
  { task: 'MOD-9', kind: 'verify', verdict: 'pass', verdictAt: NOW - 120_000 },
  { task: 'MOD-8', kind: 'amend', at: NOW - 30_000 },
]
  .map(r => JSON.stringify(r))
  .join('\n')
const setup = (on: any, opts: { url?: string; gh?: (argv: string[]) => unknown; unplaced?: string; ledger?: boolean } = {}) =>
  world(on, {
    files: {
      [`${CARDS}/MOD-7-c.md`]: BLOCKED,
      ...(opts.ledger ? { [`${ROOT}/.delegation/ledger.jsonl`]: `${LEDGER}\n` } : {}),
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'queued', 'Restore cart', 13),
      [`${CARDS}/MOD-8-b.md`]: card('MOD-8', 'queued', 'Lint config'),
      ...gitCfg(opts.url ?? 'https://github.com/o/r.git'),
    },
    dirs: { [CARDS]: ['MOD-9-a.md', 'MOD-8-b.md', 'MOD-7-c.md'] },
    ...(opts.unplaced !== undefined ? { panesUnplaced: opts.unplaced } : {}),
    run: async (argv: string[]) => {
      if (argv[0] === 'sleep') return { exitCode: 0, stdout: '' }
      if (argv[0] === 'gh' && argv[1] === 'issue' && argv[2] === 'list') return (opts.gh ? opts.gh(argv) : { exitCode: 0, stdout: ISSUES }) as never
      return undefined
    },
  })
const command = ($: any, args: string) => $.command.run({ command: 'delegation', args, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } } as never)
const PANE = (bodyColumns: number) => ({ title: 'Work', isFocused: false, bodyColumns, placement: 'dock', scroll: { bodyRows: 30 }, view: {} }) as never
const mountWork = ($: any, bodyColumns = 130, surface = 'terminal') => $.ui.mount({ plugin: 'chassis-delegation', surface, component: 'Pane', requestId: 'delegation-work', props: PANE(bodyColumns) })
const listCalls = (w: any) => w.runs.map((r: { argv: string[] }) => r.argv).filter((a: string[]) => a[0] === 'gh' && a[1] === 'issue' && a[2] === 'list')
const settle = () => new Promise(resolve => setTimeout(resolve, 150))

describe('MOD-354: the Work pane', () => {
  test('/delegation work opens the pane and answers so; the drawing carries its toolbar, summary, table and the rows', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    const out = await command($, 'work')
    expect(String(out.text)).toBe('Work opened in a pane.')
    expect(w.opened).toContain('delegation-work')
    const ui = await mountWork($, 130)
    expect(await ui.find({ key: 'work-toolbar' })).toBeDefined()
    expect(await ui.find({ key: 'work-summary' })).toBeDefined()
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i10' })).toBeDefined()
    for (const s of ['working', 'review', 'queued', 'blocked', 'backlog', 'done']) expect(await ui.find({ key: `work-chip-${s}` })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /QUEUED/ })).toBeDefined()
  })

  test('at 80 columns the header has Progress and no Worker', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 80)
    expect(await ui.find({ type: 'Text', text: /^Progress/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^Worker/ })).toBeUndefined()
  })

  test('at 50 columns the header has no Progress', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 50)
    expect(await ui.find({ type: 'Text', text: /^Progress/ })).toBeUndefined()
  })

  test('pressing a parent toggle removes its children rows, and pressing it again brings them back', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    expect(await ui.find({ key: 'work-row-i11' })).toBeDefined()
    await ui.press({ key: 'work-toggle-i10' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i11' })).toBeUndefined()
    await ui.press({ key: 'work-toggle-i10' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i11' })).toBeDefined()
  })

  test('pressing a state chip leaves only rows of that state under their parents; Clear filters restores the list', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    await ui.press({ key: 'work-chip-queued' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i13' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i11' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i14' })).toBeUndefined()
    expect(await ui.find({ key: 'work-row-i31' })).toBeUndefined()
    await ui.press({ key: 'work-clear' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i14' })).toBeDefined()
  })

  test('the search filters by a title word and by a card id, on Enter', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    await ui.input({ key: 'work-search', text: 'banner' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i14' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i13' })).toBeUndefined()
    await ui.input({ key: 'work-search', text: 'MOD-9' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i13' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i14' })).toBeUndefined()
  })

  test('the epic select leaves one root', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    await ui.select({ key: 'work-epic', value: '#30' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i30' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i10' })).toBeUndefined()
  })

  test('a done leaf is hidden under its parent, which offers the show button; pressing it shows the leaf', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    expect(await ui.find({ key: 'work-row-i12' })).toBeUndefined()
    expect(await ui.find({ key: 'work-show-i11' })).toBeDefined()
    await ui.press({ key: 'work-show-i11' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i12' })).toBeDefined()
  })

  test('Show done brings every done leaf back and removes the show buttons', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    await ui.press({ key: 'work-done' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i12' })).toBeDefined()
    expect(await ui.find({ key: 'work-show-i11' })).toBeUndefined()
  })

  test('Refresh runs one more gh issue list', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    expect(listCalls(w)).toHaveLength(1)
    const ui = await mountWork($)
    await ui.press({ key: 'work-refresh' })
    await ui.redraw()
    await settle()
    expect(listCalls(w)).toHaveLength(2)
  })

  test('mounted in a fresh session with no command, the drawing reads once in the background; mounting again runs no second read', async ($, on) => {
    const w = setup(on)
    await $.session.start(sessionStart)
    await mountWork($)
    await settle()
    const desk = await mountWork($, 130, 'desktop')
    expect(await desk.find({ key: 'work-row-i13' })).toBeDefined()
    await mountWork($, 130, 'vscode')
    await settle()
    expect(listCalls(w)).toHaveLength(1)
  })

  test('when that background read fails, no second read runs on the next mount and the cards-only note is drawn', async ($, on) => {
    const w = setup(on, { gh: () => ({ exitCode: 1, stdout: '', stderr: 'boom' }) })
    await $.session.start(sessionStart)
    await mountWork($)
    await settle()
    const again = await mountWork($, 130, 'desktop')
    await settle()
    expect(listCalls(w)).toHaveLength(1)
    expect(await again.find({ type: 'Text', text: /could not read the issues \(gh issue list failed: boom\): cards only/ })).toBeDefined()
  })

  test('the drawing mounts on desktop, vscode and mobile; mobile has no search', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    for (const surface of ['desktop', 'vscode', 'mobile']) {
      const ui = await mountWork($, 100, surface)
      expect(await ui.find({ key: 'work-table' })).toBeDefined()
      if (surface === 'mobile') expect(await ui.find({ key: 'work-search' })).toBeUndefined()
    }
  })

  test('a screen that places no panes gets the text form, and /delegation work text opens no pane', async ($, on) => {
    const w = setup(on, { unplaced: 'no attached surface places panes' })
    await $.session.start(sessionStart)
    const out = String((await command($, 'work')).text)
    expect(out.split('\n')[0]).toBe("This screen does not show a mod's panes (no attached surface places panes), so here is the work list as text.")
    expect(out).toContain('**Work** · 0 working · 0 to review')
    expect(w.closed).toContain('delegation-work')
    const text = String((await command($, 'work text')).text)
    expect(text.startsWith('**Work**')).toBe(true)
    expect(w.opened.filter((id: string) => id === 'delegation-work')).toHaveLength(1)
  })
})

describe('MOD-356: the Work pane detail and actions', () => {
  const DISPATCH = 'Work pane: Dispatch was pressed on MOD-9. Dispatch MOD-9.'
  const UNBLOCK = 'Work pane: Unblock was pressed and confirmed on MOD-7, which waits on MOD-9. Release its card (status queued, no blocked_by line) and say what it still overlaps.'
  const open = async ($: any, w: any, columns = 130, key = 'work-open-i13', opts: { surface?: string } = {}) => {
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, columns, opts.surface ?? 'terminal')
    await ui.press({ key })
    await ui.redraw()
    return ui
  }

  test('at 130 columns a leaf opens its detail beside the table', async ($, on) => {
    const w = setup(on)
    const ui = await open($, w)
    expect(await ui.find({ key: 'work-detail' }), w.debugLogs.join('\n')).toBeDefined()
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Checkout rework / Cart totals' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Restore a saved cart' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'MOD-9' })).toBeDefined()
    expect((await ui.find({ key: 'work-act-i13' }))?.props.label).toBe('Dispatch')
    expect((await ui.find({ key: 'work-detail-close' }))?.props.label).toBe('Close')
  })

  test('at 80 columns the detail takes the table\'s place and Back brings the table back', async ($, on) => {
    const w = setup(on)
    const ui = await open($, w, 80)
    expect(await ui.find({ key: 'work-detail' })).toBeDefined()
    expect(await ui.find({ key: 'work-table' })).toBeUndefined()
    expect((await ui.find({ key: 'work-detail-close' }))?.props.label).toBe('← Back to list')
    await ui.press({ key: 'work-detail-close' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ key: 'work-detail' })).toBeUndefined()
  })

  test('Dispatch submits its line once and the item reads Asked', async ($, on) => {
    const w = setup(on)
    const ui = await open($, w)
    await ui.press({ key: 'work-act-i13' })
    await settle()
    await ui.redraw()
    expect(w.submitted.map((x: { text: string }) => x.text)).toEqual([DISPATCH])
    expect(await ui.find({ type: 'Text', text: 'Asked · waiting for the session' })).toBeDefined()
    expect(await ui.find({ key: 'work-act-i13' })).toBeUndefined()
  })

  test('Unblock asks first; Cancel submits nothing; confirming submits the line and the item reads Asked', async ($, on) => {
    const w = setup(on)
    const ui = await open($, w, 130, 'work-open-MOD-7')
    expect((await ui.find({ key: 'work-act-MOD-7' }))?.props.label).toBe('Unblock')
    expect(await ui.find({ key: 'work-by-MOD-9' })).toBeDefined()
    await ui.press({ key: 'work-act-MOD-7' })
    await settle()
    await ui.redraw()
    expect(w.submitted).toHaveLength(0)
    expect(await ui.find({ type: 'Text', text: 'Still waiting on MOD-9. Unblock anyway?' })).toBeDefined()
    expect(await ui.find({ key: 'work-confirm-yes-MOD-7' })).toBeDefined()
    await ui.press({ key: 'work-confirm-no-MOD-7' })
    await settle()
    await ui.redraw()
    expect(w.submitted).toHaveLength(0)
    expect(await ui.find({ key: 'work-act-MOD-7' })).toBeDefined()
    await ui.press({ key: 'work-act-MOD-7' })
    await settle()
    await ui.redraw()
    await ui.press({ key: 'work-confirm-yes-MOD-7' })
    await settle()
    await ui.redraw()
    expect(w.submitted.map((x: { text: string }) => x.text)).toEqual([UNBLOCK])
    expect(await ui.find({ type: 'Text', text: 'Asked · waiting for the session' })).toBeDefined()
  })

  test('a backlog leaf has no action button and its Card field reads a dash', async ($, on) => {
    const w = setup(on)
    const ui = await open($, w, 130, 'work-open-i14')
    expect(await ui.find({ key: 'work-detail' })).toBeDefined()
    expect(await ui.find({ key: 'work-act-i14' })).toBeUndefined()
    expect(await ui.find({ key: 'work-field-card' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '—' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'No card yet.' })).toBeDefined()
  })

  test('the detail lists the ledger rows of its card, newest first', async ($, on) => {
    const w = setup(on, { ledger: true })
    const ui = await open($, w)
    expect(await ui.find({ type: 'Text', text: 'Activity' })).toBeDefined()
    const row = async (i: number) => JSON.stringify(await ui.find({ key: `work-event-${i}` }))
    expect(await row(0)).toContain('Verified by hand: pass')
    expect(await row(1)).toContain('Accepted')
    expect(await row(2)).toContain('Scope amended')
    expect(await ui.find({ key: 'work-event-3' })).toBeUndefined()
  })

  test('with a detail open the drawing mounts on desktop, vscode and mobile', async ($, on) => {
    const w = setup(on)
    await open($, w)
    for (const surface of ['desktop', 'vscode', 'mobile']) {
      const ui = await mountWork($, 100, surface)
      expect(await ui.find({ key: 'work-detail' })).toBeDefined()
    }
  })

  test('a new session.start closes the detail', async ($, on) => {
    const w = setup(on)
    await open($, w)
    await $.session.start(sessionStart)
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ key: 'work-detail' })).toBeUndefined()
  })
})

describe('MOD-357: the Work pane board', () => {
  const board = async ($: any, columns = 130, surface = 'terminal') => {
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, columns, surface)
    await ui.press({ key: 'work-view-board' })
    await ui.redraw()
    return ui
  }

  test('the switch draws the board with a header, lanes and cards, and List brings the table back', async ($, on) => {
    const w = setup(on)
    const ui = await board($)
    expect(await ui.find({ key: 'work-board' }), w.debugLogs.join('\n')).toBeDefined()
    expect(await ui.find({ key: 'work-board-header' })).toBeDefined()
    expect(await ui.find({ key: 'work-table' })).toBeUndefined()
    expect(await ui.find({ key: 'work-lane-i10' })).toBeDefined()
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
    expect(await ui.find({ key: 'work-card-i14' })).toBeDefined()
    await ui.press({ key: 'work-view-list' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ key: 'work-board' })).toBeUndefined()
  })

  test('the done column offers N done · show, and pressing it draws the done card', async ($, on) => {
    setup(on)
    const ui = await board($)
    expect(await ui.find({ key: 'work-card-i12' })).toBeUndefined()
    expect((await ui.find({ key: 'work-show-i10' }))?.props.label).toBe('1 done · show')
    await ui.press({ key: 'work-show-i10' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-card-i12' })).toBeDefined()
  })

  test('at 80 columns the columns stack: no header, and a QUEUED · 1 line', async ($, on) => {
    setup(on)
    const ui = await board($, 80)
    expect(await ui.find({ key: 'work-board' })).toBeDefined()
    expect(await ui.find({ key: 'work-board-header' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'QUEUED · 1' })).toBeDefined()
  })

  test('the Queued chip keeps the queued card and drops the backlog card and the lane without one', async ($, on) => {
    setup(on)
    const ui = await board($)
    await ui.press({ key: 'work-chip-queued' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
    expect(await ui.find({ key: 'work-card-i14' })).toBeUndefined()
    expect(await ui.find({ key: 'work-lane-i30' })).toBeUndefined()
  })

  test('the lane toggle removes its cards and leaves its header; pressing again brings them back', async ($, on) => {
    setup(on)
    const ui = await board($)
    await ui.press({ key: 'work-toggle-i10' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-card-i13' })).toBeUndefined()
    expect(await ui.find({ key: 'work-toggle-i10' })).toBeDefined()
    await ui.press({ key: 'work-toggle-i10' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
  })

  test('at 80 columns a card title opens the detail with Back to board, which brings the board back', async ($, on) => {
    setup(on)
    const ui = await board($, 80)
    await ui.press({ key: 'work-open-i13' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-detail' })).toBeDefined()
    expect((await ui.find({ key: 'work-detail-close' }))?.props.label).toBe('← Back to board')
    await ui.press({ key: 'work-detail-close' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-board' })).toBeDefined()
    expect(await ui.find({ key: 'work-detail' })).toBeUndefined()
  })

  test('the board mounts on desktop, vscode and mobile', async ($, on) => {
    setup(on)
    await board($)
    for (const surface of ['desktop', 'vscode', 'mobile']) {
      const ui = await mountWork($, 100, surface)
      expect(await ui.find({ key: 'work-board' })).toBeDefined()
      expect(await ui.find({ key: 'work-view-board' })).toBeDefined()
    }
  })

  test('a new session.start returns the pane to the list', async ($, on) => {
    setup(on)
    await board($)
    await $.session.start(sessionStart)
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ key: 'work-table' })).toBeDefined()
    expect(await ui.find({ key: 'work-board' })).toBeUndefined()
  })
})
