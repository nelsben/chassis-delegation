// MOD-190: /delegation land writes a redacted issue body under .delegation/landed/ and prints the gh line; it files and dispatches nothing.
import { test, expect, describe } from 'claude-code/testing'
import { world, sessionStart, ROOT } from './harness'

const land = (args: string) => ({ command: 'delegation', args: `land ${args}`, origin: { kind: 'composer' }, presentation: { isFullscreen: false, columns: 120 } }) as never
const ABS = `/${'home'}/someone/x.ts`
const CARDS = `${ROOT}/docs/cards`
const LANDED = `${ROOT}/.delegation/landed`
const REPO_FILE = `${ROOT}/.chassis-delegation.json`
const card = (id: string, status: string, scope: string, extra = '') => ['---', `id: ${id}`, `title: Card ${id}`, 'domain: mod', 'tier: standard', `status: ${status}`, `scope: [${scope}]`, 'gate: node', ...(extra ? [extra] : []), '---', '## Done when', '', '- It works.', ''].join('\n')
const files = () => ({
  [REPO_FILE]: JSON.stringify({ gateMap: { node: 'node t.mjs' }, domains: ['mod'], cardDir: 'docs/cards' }),
  [`${CARDS}/MOD-1-a.md`]: card('MOD-1', 'queued', 'src/export/**', 'parent: 9'),
  [`${CARDS}/MOD-2-b.md`]: card('MOD-2', 'merged', 'docs/**'),
  [`${CARDS}/MOD-3-c.md`]: card('MOD-3', 'queued', 'lib/**'),
})
const dirs = () => ({ [CARDS]: ['MOD-1-a.md', 'MOD-2-b.md', 'MOD-3-c.md'] })
const gitCfg = (url: string) => ({ [`${ROOT}/.git/config`]: `[remote "origin"]\n\turl = ${url}\n` })

describe('MOD-190: /delegation land', () => {
  test('writes the body, prints the gh line and the hint, files nothing', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('git@github.com:acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land(`bug "Export drops a row" --paths src/export/a.ts --note "see ${ABS}"`))).text)
    const file = `${LANDED}/export-drops-a-row.md`
    expect(out.split('\n')).toEqual([
      file,
      `gh issue create --repo acme/widgets --title 'Export drops a row' --label type:bug --body-file ${file}`,
      'parent hint: #9 (from MOD-1)',
      'nothing was filed or dispatched',
    ])
    const body = w.files.get(file) ?? ''
    expect(body).toContain('```scope\nsrc/export/a.ts\n```')
    expect(body).toContain('- MOD-1 Card MOD-1')
    expect(body).toContain('- MOD-3 Card MOD-3')
    expect(body.includes('MOD-2')).toBe(false)
    expect(body.includes(ABS)).toBe(false)
    expect([...w.files.keys()].filter(k => k.startsWith(`${ROOT}/.delegation/`) && !k.startsWith(LANDED))).toEqual([])
    expect(w.spawns.length).toBe(0)
    expect(w.runs.some(r => r.argv[0] === 'gh')).toBe(false)
  })

  test('a second landing with the same title gets -2; --parent is passed through and no hint is printed', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('https://github.com/acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    await $.command.run(land('task Same title'))
    const out = String((await $.command.run(land('task Same title --parent 4 --paths src/export/a.ts'))).text).split('\n')
    expect(out[0]).toBe(`${LANDED}/same-title-2.md`)
    expect(out[1]).toBe(`gh issue create --repo acme/widgets --title 'Same title' --label type:task --parent 4 --body-file ${LANDED}/same-title-2.md`)
    expect(out.length).toBe(3)
    expect(w.files.has(`${LANDED}/same-title.md`)).toBe(true)
  })

  test('an origin that is not GitHub replaces the gh line; the file is still written', async ($, on) => {
    const w = world(on, { files: { ...files(), ...gitCfg('git@example.org:acme/widgets.git') }, dirs: dirs() })
    await $.session.start(sessionStart)
    const out = String((await $.command.run(land('spike Try it'))).text).split('\n')
    expect(out[1]).toContain('not a GitHub remote')
    expect(w.files.has(`${LANDED}/try-it.md`)).toBe(true)
  })

  test('a bad type or parent is refused with the usage line and writes nothing', async ($, on) => {
    const w = world(on, { files: files(), dirs: dirs() })
    await $.session.start(sessionStart)
    for (const bad of ['chore Do it', 'bug', 'bug T --parent 0']) {
      const out = String((await $.command.run(land(bad))).text)
      expect(out).toContain('feature, epic, story, task, bug, spike')
    }
    expect([...w.files.keys()].some(k => k.startsWith(LANDED))).toBe(false)
  })
})
