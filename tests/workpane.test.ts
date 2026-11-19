// MOD-354: /delegation work opens the Work pane (the list view); the drawing's keys, toggles, chips, filters and background read.
import { expect, describe } from 'claude-code/testing'
import { test } from './harness'
import { world, sleepMs, sessionStart, ROOT, NOW } from './harness'

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
const setup = (on: any, opts: { url?: string; gh?: (argv: string[]) => unknown; unplaced?: string; ledger?: boolean; cards?: boolean; weird?: boolean; store?: Record<string, unknown> } = {}) =>
  world(on, {
    ...(opts.store ? { store: opts.store } : {}),
    files: {
      ...(opts.cards === false ? {} : { [`${CARDS}/MOD-7-c.md`]: BLOCKED }),
      ...(opts.weird ? { [`${CARDS}/MOD-6-w.md`]: card('MOD-6', 'zonked', 'Odd status') } : {}),
      ...(opts.ledger ? { [`${ROOT}/.delegation/ledger.jsonl`]: `${LEDGER}\n` } : {}),
      [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
      ...(opts.cards === false
        ? {}
        : {
            [`${CARDS}/MOD-9-a.md`]: card('MOD-9', 'queued', 'Restore cart', 13),
            [`${CARDS}/MOD-8-b.md`]: card('MOD-8', 'queued', 'Lint config'),
          }),
      ...gitCfg(opts.url ?? 'https://github.com/o/r.git'),
    },
    dirs: { [CARDS]: opts.cards === false ? [] : ['MOD-9-a.md', 'MOD-8-b.md', 'MOD-7-c.md', ...(opts.weird ? ['MOD-6-w.md'] : [])] },
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
const settle = () => sleepMs(150)

const FAIL = () => ({ exitCode: 1, stdout: '', stderr: 'boom' })

describe('MOD-395: the Work heading and the folded notes', () => {
  const href = (key: string) => `https://work.invalid/${encodeURIComponent(key)}`
  // the label of the work-notes control: a Button's label on the terminal, a Markdown link's text on a remote surface
  const notesLabel = async (ui: any, surface: string): Promise<string | undefined> => {
    const n = await ui.find({ key: 'work-notes' })
    return n === undefined ? undefined : String(surface === 'terminal' ? n.props.label : n.props.text)
  }
  const pressNotes = async (ui: any, surface: string) => {
    await ui.press(surface === 'terminal' ? { key: 'work-notes' } : { key: 'work-notes', link: { href: href('work-notes') } })
    await ui.redraw()
  }

  test('the toolbar starts with the bold Work heading on the terminal and on desktop', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    for (const surface of ['terminal', 'desktop']) {
      const ui = await mountWork($, 130, surface)
      const title = await ui.find({ type: 'Text', text: /^Work$/ })
      expect(title?.props.bold).toBe(true)
      const bar = await ui.find({ key: 'work-toolbar' })
      const kids = (bar as any)?.children ?? (bar as any)?.props?.children
      if (Array.isArray(kids)) expect(kids[0]?.props?.bold).toBe(true)
    }
  })

  test('two notes fold behind `2 notes · show`; a press opens them and `hide notes`, another folds them', async ($, on) => {
    setup(on, { gh: FAIL, weird: true })
    await $.session.start(sessionStart)
    await command($, 'work')
    for (const surface of ['terminal', 'desktop']) {
      const ui = await mountWork($, 130, surface)
      expect(await notesLabel(ui, surface)).toContain('2 notes · show')
      expect(await ui.find({ type: 'Text', text: /could not read the issues/ })).toBeUndefined()
      await pressNotes(ui, surface)
      expect(await ui.find({ type: 'Text', text: /could not read the issues/ })).toBeDefined()
      expect(await ui.find({ type: 'Text', text: /zonked/ })).toBeDefined()
      expect(await notesLabel(ui, surface)).toContain('hide notes')
      await pressNotes(ui, surface)
      expect(await ui.find({ type: 'Text', text: /could not read the issues/ })).toBeUndefined()
      expect(await notesLabel(ui, surface)).toContain('2 notes · show')
    }
  })

  test('one note reads `1 note · show`', async ($, on) => {
    setup(on, { gh: FAIL })
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130)
    expect(await notesLabel(ui, 'terminal')).toContain('1 note · show')
  })

  test('with no notes there is no work-notes line', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130)
    expect(await ui.find({ key: 'work-row-i10' })).toBeDefined()
    expect(await ui.find({ key: 'work-notes' })).toBeUndefined()
  })
})

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

  test('at 80 columns the header has Card and no Worker', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 80)
    expect(await ui.find({ type: 'Text', text: /^CARD/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WORKER/ })).toBeUndefined()
  })

  test('at 50 columns the header has no Card', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 50)
    expect(await ui.find({ type: 'Text', text: /^CARD/ })).toBeUndefined()
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
    await again.press({ key: 'work-notes', link: { href: 'https://work.invalid/work-notes' } })
    await again.redraw()
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

  // the board is switched on at the terminal (the desktop switch is a link), then the pane is mounted on the surface
  const boardOn = async ($: any, columns: number, surface: string) => {
    await board($, 130)
    return mountWork($, columns, surface)
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

  test('on mobile at 40 columns the columns stack under their headings and there is no Column select', async ($, on) => {
    setup(on)
    await board($, 130)
    const ui = await mountWork($, 40, 'mobile')
    expect(await ui.find({ key: 'work-board' })).toBeDefined()
    expect(await ui.find({ key: 'work-board-header' })).toBeUndefined()
    expect(await ui.find({ key: 'work-board-col' })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: 'QUEUED · 1' })).toBeDefined()
    // MOD-393 (#548): the heading counts the folded done card, not only the ones on screen
    expect(await ui.find({ type: 'Text', text: 'DONE · 1' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'DONE · 0' })).toBeUndefined()
  })

  test('MOD-396 (#553): at 80 columns on desktop a Column select shows Working, and a lane draws only that column', async ($, on) => {
    setup(on)
    const ui = await boardOn($, 80, 'desktop')
    const sel = await ui.find({ key: 'work-board-col' })
    expect(sel).toBeDefined()
    expect(sel?.props.value).toBe('working')
    expect(sel?.props.options).toHaveLength(5)
    for (const o of sel?.props.options ?? []) expect(o.label).toMatch(/ · \d+$/)
    expect(await ui.find({ key: 'work-board-header' })).toBeUndefined()
    expect(await ui.find({ key: 'work-col-i10-working' })).toBeDefined()
    for (const c of ['backlog', 'queued', 'review', 'done']) expect(await ui.find({ key: `work-col-i10-${c}` })).toBeUndefined()
  })

  test('MOD-396 (#553): selecting done draws the done column with its N done · show line', async ($, on) => {
    setup(on)
    const ui = await boardOn($, 80, 'desktop')
    await ui.select({ key: 'work-board-col', value: 'done' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-col-i10-done' })).toBeDefined()
    expect(await ui.find({ key: 'work-col-i10-working' })).toBeUndefined()
    expect((await ui.find({ key: 'work-show-i10' }))?.props.text).toContain('1 done · show')
  })

  test('MOD-396 (#553): a lane with no card in the picked column draws a dash', async ($, on) => {
    setup(on)
    const ui = await boardOn($, 80, 'desktop')
    await ui.select({ key: 'work-board-col', value: 'review' })
    await ui.redraw()
    const col = await ui.find({ key: 'work-col-i10-review' })
    expect(col).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '—' })).toBeDefined()
  })

  test('MOD-396 (#553): at 130 columns there is no Column select', async ($, on) => {
    setup(on)
    const ui = await boardOn($, 130, 'desktop')
    expect(await ui.find({ key: 'work-board-col' })).toBeUndefined()
    expect(await ui.find({ key: 'work-board-header' })).toBeDefined()
  })

  test('MOD-393 (#548): a chip with a count of 0 is dim while off, and full strength once pressed', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    expect((await ui.find({ key: 'work-chip-working' }))?.props.dimColor).toBe(true)
    expect((await ui.find({ key: 'work-chip-queued' }))?.props.dimColor).toBeFalsy()
    await ui.press({ key: 'work-chip-working' })
    await ui.redraw()
    expect((await ui.find({ key: 'work-chip-working' }))?.props.dimColor).toBeFalsy()
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
    await ui.select({ key: 'work-board-col', value: 'queued' })
    await ui.redraw()
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

// MOD-387 (#537): the model badge: a working leaf on sonnet (MOD-9, issue #13) shows 🔵 beside its model on every surface.
describe('MOD-387 (#537): the model badge on the Work pane', () => {
  const RUNNING = {
    'delegation.spawn.k-run': { key: 'k-run', task: 'MOD-9', subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', description: 'MOD-9', subagentType: 'general-purpose', agentId: 'ag-k-run', at: NOW - 60_000 },
    'delegation.agent.ag-k-run': 'k-run',
    'delegation.tasks.MOD-9': [{ task: 'MOD-9', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', at: NOW - 60_000, toolUseId: 'k-run', agentId: 'ag-k-run', root: ROOT }],
  }
  const working = async ($: any, on: any, columns = 130, surface = 'terminal', view?: 'board') => {
    const w = setup(on, { store: RUNNING })
    w.agents.push({ id: 'ag-k-run', type: 'general-purpose', description: 'MOD-9', status: 'running' })
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, columns, surface)
    if (view === 'board') {
      await ui.press({ key: 'work-view-board' })
      await ui.redraw()
    }
    return { w, ui }
  }

  test('at 130 columns the list draws the badge before sonnet in the Worker cell', async ($, on) => {
    const { w, ui } = await working($, on)
    expect(await ui.find({ key: 'work-row-i13' }), w.debugLogs.join('\n')).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔵 ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeDefined()
  })

  test('the list draws the same badge on vscode', async ($, on) => {
    const { ui } = await working($, on, 130, 'vscode')
    expect(await ui.find({ type: 'Text', text: '🔵 ' })).toBeDefined()
  })

  test('on the board at 130 columns the card worker line draws the badge', async ($, on) => {
    const { ui } = await working($, on, 130, 'terminal', 'board')
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔵 ' })).toBeDefined()
  })

  test('with the detail open the Worker field draws the badge', async ($, on) => {
    const { ui } = await working($, on)
    await ui.press({ key: 'work-open-i13' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-detail' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔵 ' })).toBeDefined()
  })

  test('with modelGlyphs off the list draws the plain dot as before', { options: { modelGlyphs: 'off' } }, async ($, on) => {
    const { ui } = await working($, on)
    // the bug row of the fixture also draws a `● ` (its type mark), so this checks the badge is absent rather than the dot's colour
    expect(await ui.find({ type: 'Text', text: '● ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '🔵 ' })).toBeUndefined()
  })
})

// MOD-388 (#538): the steady controls, the detail status row, the loading line, the empty state, the footer and the selected marker.
describe('MOD-388 (#538): the Work pane steady controls, detail row, empty state, footer and marker', () => {
  const look = (el: any) => ({ variant: el?.props.variant, plain: el?.props.plain })

  test('a state chip and the List and Board switch are never plain: secondary when off, primary when on', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    expect(look(await ui.find({ key: 'work-chip-queued' }))).toEqual({ variant: 'secondary', plain: undefined })
    expect(look(await ui.find({ key: 'work-view-list' }))).toEqual({ variant: 'primary', plain: undefined })
    expect(look(await ui.find({ key: 'work-view-board' }))).toEqual({ variant: 'secondary', plain: undefined })
    await ui.press({ key: 'work-chip-queued' })
    await ui.redraw()
    expect(look(await ui.find({ key: 'work-chip-queued' }))).toEqual({ variant: 'primary', plain: undefined })
    await ui.press({ key: 'work-view-board' })
    await ui.redraw()
    expect(look(await ui.find({ key: 'work-view-board' }))).toEqual({ variant: 'primary', plain: undefined })
    expect(look(await ui.find({ key: 'work-view-list' }))).toEqual({ variant: 'secondary', plain: undefined })
  })

  test('the detail status row has a one-column gap and wraps', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130)
    await ui.press({ key: 'work-open-i13' })
    await ui.redraw()
    const row = await ui.find({ key: 'work-detail-status' })
    expect(row?.props.columnGap).toBe(1)
    expect(row?.props.flexWrap).toBe('wrap')
  })

  test('with nothing loaded and a read running, Reading the issues… is drawn once, in the empty state', async ($, on) => {
    let release: (r: unknown) => void = () => undefined
    setup(on, { cards: false, gh: () => new Promise(r => (release = r)) })
    await $.session.start(sessionStart)
    const ui = await mountWork($)
    await settle()
    await ui.redraw()
    expect(JSON.stringify(await ui.find({ key: 'work-toolbar' }))).not.toContain('Reading the issues')
    expect(JSON.stringify(await ui.find({ key: 'work-table' }))).toContain('Reading the issues…')
    release({ exitCode: 0, stdout: '[]' })
    await settle()
  })

  test('a filter that matches nothing draws Clear filters after No work matches., and pressing it clears the filters', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    await ui.input({ key: 'work-search', text: 'zzzz' })
    await ui.redraw()
    expect(await ui.find({ type: 'Text', text: 'No work matches.' })).toBeDefined()
    expect((await ui.find({ key: 'work-clear-empty' }))?.props.label).toBe('Clear filters')
    expect((await ui.find({ key: 'work-clear-empty' }))?.props.plain).toBe(true)
    await ui.press({ key: 'work-clear-empty' })
    await ui.redraw()
    expect(await ui.find({ key: 'work-clear-empty' })).toBeUndefined()
    expect(await ui.find({ key: 'work-row-i14' })).toBeDefined()
  })

  test('the footer button reads Close', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($)
    expect((await ui.find({ key: 'work-close' }))?.props.label).toBe('Close')
  })

  test('a selected leaf row draws the blue marker, and an unselected leaf row does not', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130)
    await ui.press({ key: 'work-open-i13' })
    await ui.redraw()
    expect(JSON.stringify(await ui.find({ key: 'work-row-i13' }))).toContain('▌ ')
    expect(JSON.stringify(await ui.find({ key: 'work-row-i13' }))).toContain('#1d7afc')
    expect(JSON.stringify(await ui.find({ key: 'work-row-i14' }))).not.toContain('▌')
  })
})

// MOD-389 (#539): two-line board titles, the card id at the right, header counts and a right-aligned Cost.
describe('MOD-389 (#539): the board card, its header and the list Cost', () => {
  const LONG = 'Restore a saved cart after the session expires'
  const LONG_ISSUES = JSON.stringify([
    issue(10, 'Checkout rework', 'OPEN', 'epic'),
    issue(11, 'Cart totals', 'OPEN', 'feature', 10),
    issue(13, LONG, 'OPEN', 'story', 11),
    issue(14, 'Empty cart banner', 'OPEN', 'bug', 11),
  ])
  const RUN = {
    'delegation.spawn.k-run': { key: 'k-run', task: 'MOD-9', subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', description: 'MOD-9', subagentType: 'general-purpose', agentId: 'ag-k-run', at: NOW - 60_000 },
    'delegation.agent.ag-k-run': 'k-run',
    'delegation.tasks.MOD-9': [{ task: 'MOD-9', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', usd: 0.61, at: NOW - 60_000, toolUseId: 'k-run', agentId: 'ag-k-run', root: ROOT }],
  }
  const open = async ($: any, on: any, view?: 'board') => {
    const w = setup(on, { store: RUN, gh: () => ({ exitCode: 0, stdout: LONG_ISSUES }) })
    w.agents.push({ id: 'ag-k-run', type: 'general-purpose', description: 'MOD-9', status: 'running' })
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130)
    if (view === 'board') {
      await ui.press({ key: 'work-view-board' })
      await ui.redraw()
    }
    return { w, ui }
  }

  test('on the board at 130 columns a 40-character title draws two lines', async ($, on) => {
    const { w, ui } = await open($, on, 'board')
    expect(await ui.find({ key: 'work-card-i13' }), w.debugLogs.join('\n')).toBeDefined()
    // col is 24, so the title width is 22: the break falls at the last space before it
    expect((await ui.find({ key: 'work-open-i13' }))?.props.label, 'line 1').toBe('Restore a saved cart')
    expect(await ui.find({ type: 'Text', text: 'after the session exp…' }), 'line 2').toBeDefined()
  })

  test('the board header reads QUEUED with the column count', async ($, on) => {
    const { ui } = await open($, on, 'board')
    expect(await ui.find({ type: 'Text', text: /^QUEUED \d+ *$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^QUEUED · / })).toBeUndefined()
  })

  test('in the list at 130 columns the Cost header and a Cost cell end at the column edge', async ($, on) => {
    const { ui } = await open($, on)
    expect(await ui.find({ type: 'Text', text: /^ +COST$/ }), 'header').toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^ +\$\d+\.\d\d$/ }), 'cell').toBeDefined()
  })
})

// MOD-390 (#540): one Card column, Worker from 96, the capital header over a rule, only epics bold, the dark grey mark, and the dot status below 28.
describe('MOD-390 (#540): the Work list columns, header rule, hierarchy and narrow status', () => {
  const RUNNING = {
    'delegation.spawn.k-run': { key: 'k-run', task: 'MOD-9', subtask: 'main', adhoc: false, attempt: 1, lineage: 1, tier: 'standard', alias: 'sonnet', budget: 2, purpose: 'build', description: 'MOD-9', subagentType: 'general-purpose', agentId: 'ag-k-run', at: NOW - 60_000 },
    'delegation.agent.ag-k-run': 'k-run',
    'delegation.tasks.MOD-9': [{ task: 'MOD-9', subtask: 'main', attempt: 1, kind: 'spawn', lineage: 1, tier: 'standard', alias: 'sonnet', at: NOW - 60_000, toolUseId: 'k-run', agentId: 'ag-k-run', root: ROOT }],
  }
  const open = async ($: any, on: any, columns: number) => {
    const w = setup(on, { store: RUNNING })
    w.agents.push({ id: 'ag-k-run', type: 'general-purpose', description: 'MOD-9', status: 'running' })
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, columns)
    return { w, ui }
  }

  test('at 100 columns a working leaf draws its Worker cell', async ($, on) => {
    const { ui } = await open($, on, 100)
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WORKER/ })).toBeDefined()
  })

  test('at 90 columns the Worker column is gone', async ($, on) => {
    const { ui } = await open($, on, 90)
    expect(await ui.find({ type: 'Text', text: /sonnet/ })).toBeUndefined()
    expect(await ui.find({ type: 'Text', text: /^WORKER/ })).toBeUndefined()
  })

  test('the Card cell draws a parent its progress bar and count, and a leaf its card id', async ($, on) => {
    const { ui } = await open($, on, 130)
    expect(await ui.find({ type: 'Text', text: /[█░]/ })).toBeUndefined()
    expect((await ui.find({ type: 'Box', key: 'work-bar-done' }))?.props.backgroundColor).toMatch(/^#(216e4e|7ee2b8)$/)
    expect((await ui.find({ type: 'Box', key: 'work-bar-track' }))?.props.backgroundColor).toMatch(/^#(dcdfe4|38414a)$/)
    expect(await ui.find({ type: 'Text', text: /^ \d+\/\d+$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^MOD-9$/ })).toBeDefined()
  })

  test('the header is in capitals and a dim rule is drawn under it', async ($, on) => {
    const { ui } = await open($, on, 130)
    expect(await ui.find({ type: 'Text', text: /^WORK\s*$/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^STATUS/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^WORKER/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /^─+$/ }), 'rule').toBeDefined()
  })

  test('an epic title is bold and a feature title is not', async ($, on) => {
    const { ui } = await open($, on, 130)
    expect((await ui.find({ type: 'Text', text: 'Checkout rework' }))?.props.bold).toBe(true)
    expect((await ui.find({ type: 'Text', text: 'Cart totals' }))?.props.bold).toBeFalsy()
  })

  test('at 24 columns a leaf draws a dot in Status and no lozenge', async ($, on) => {
    const { ui } = await open($, on, 24)
    expect(await ui.find({ type: 'Text', text: '● ' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: / QUEUED / })).toBeUndefined()
  })
})

// MOD-392 (#547): on a remote surface the controls are Markdown links, so the desktop draws no box; the terminal keeps its Buttons.
describe('MOD-392 (#547): the Work pane controls are links on a remote surface', () => {
  const href = (key: string) => `https://work.invalid/${encodeURIComponent(key)}`
  const pressLink = (ui: any, key: string) => ui.press({ key, link: { href: href(key) } })
  const LONG = 'Restore a saved cart after the session expires'
  const LONG_ISSUES = JSON.stringify([issue(10, 'Checkout rework', 'OPEN', 'epic'), issue(11, 'Cart totals', 'OPEN', 'feature', 10), issue(13, LONG, 'OPEN', 'story', 11)])

  test('on desktop at 130 columns a leaf title is a Markdown link to its key, and pressing the link opens the detail', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    const title = await ui.find({ type: 'Markdown', key: 'work-open-i13' })
    expect(String(title?.props.text).endsWith('](https://work.invalid/work-open-i13)')).toBe(true)
    expect(await ui.find({ type: 'Button', key: 'work-open-i13' })).toBeUndefined()
    await pressLink(ui, 'work-open-i13')
    await ui.redraw()
    expect(await ui.find({ key: 'work-detail' })).toBeDefined()
  })

  test('on desktop pressing a parent toggle link closes it', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ type: 'Markdown', key: 'work-toggle-i10' })).toBeDefined()
    expect(await ui.find({ key: 'work-row-i11' })).toBeDefined()
    await pressLink(ui, 'work-toggle-i10')
    await ui.redraw()
    expect(await ui.find({ key: 'work-row-i11' })).toBeUndefined()
  })

  test('on desktop a state chip and Refresh are still Buttons, and Show done is a link', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ type: 'Button', key: 'work-chip-queued' })).toBeDefined()
    expect(await ui.find({ type: 'Button', key: 'work-refresh' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', key: 'work-done' })).toBeDefined()
  })

  test('on desktop the List and Board switch shows the current view as bold text and the other as a link', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ type: 'Text', text: 'List' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', key: 'work-view-board' })).toBeDefined()
    await pressLink(ui, 'work-view-board')
    await ui.redraw()
    expect(await ui.find({ key: 'work-board' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: 'Board' })).toBeDefined()
    expect(await ui.find({ type: 'Markdown', key: 'work-view-list' })).toBeDefined()
  })

  test('the footer Close is drawn on the terminal and on mobile, and not on desktop or vscode', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    for (const surface of ['desktop', 'vscode']) expect(await (await mountWork($, 130, surface)).find({ key: 'work-close' }), surface).toBeUndefined()
    for (const surface of ['terminal', 'mobile']) expect(await (await mountWork($, 100, surface)).find({ key: 'work-close' }), surface).toBeDefined()
  })

  test('on the terminal a leaf title is still a plain Button', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'terminal')
    expect((await ui.find({ type: 'Button', key: 'work-open-i13' }))?.props.plain).toBe(true)
    expect(await ui.find({ type: 'Markdown', key: 'work-open-i13' })).toBeUndefined()
  })

  test('on the desktop board a long card title is one Markdown and draws no second line', async ($, on) => {
    setup(on, { gh: () => ({ exitCode: 0, stdout: LONG_ISSUES }) })
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    await pressLink(ui, 'work-view-board')
    await ui.redraw()
    const title = await ui.find({ type: 'Markdown', key: 'work-open-i13' })
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
    expect(String(title?.props.text)).toContain('Restore a saved cart after the session expi…')
    expect(await ui.find({ type: 'Text', text: /after the session/ })).toBeUndefined()
  })
})

// MOD-397 (#554): on a remote surface the type mark is a 14 px Svg icon, the terminal keeps the glyph Text.
describe('MOD-397 (#554): the type mark is an Svg icon on a remote surface', () => {
  const href = (key: string) => `https://work.invalid/${encodeURIComponent(key)}`
  const pressLink = (ui: any, key: string) => ui.press({ key, link: { href: href(key) } })
  const iconOf = async (ui: any, alt: string) => (await ui.findAll({ type: 'Svg' })).find((s: any) => s.props.alt === alt)

  test('on desktop a list leaf draws its type as an Svg icon at 14 px and no glyph Text', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    expect(await ui.find({ key: 'work-row-i13' })).toBeDefined()
    const icon = await iconOf(ui, 'story')
    expect(icon?.props.width).toBe(14)
    expect(icon?.props.height).toBe(14)
    // the state chips draw a ■ in their own colour; the story mark is the ■ in the story colour, and that Text is gone
    expect((await ui.findAll({ type: 'Text', text: '■ ' })).some((t: any) => t.props.color === '#22a06b')).toBe(false)
  })

  test('on desktop a board card draws its mark as an Svg icon', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'desktop')
    await pressLink(ui, 'work-view-board')
    await ui.redraw()
    expect(await ui.find({ key: 'work-card-i13' })).toBeDefined()
    expect((await iconOf(ui, 'story'))?.props.width).toBe(14)
  })

  test('on the terminal the list row still draws the glyph Text and no Svg icon', async ($, on) => {
    setup(on)
    await $.session.start(sessionStart)
    await command($, 'work')
    const ui = await mountWork($, 130, 'terminal')
    expect((await ui.findAll({ type: 'Text', text: '■ ' })).some((t: any) => t.props.color === '#22a06b')).toBe(true)
    expect(await iconOf(ui, 'story')).toBeUndefined()
  })
})
