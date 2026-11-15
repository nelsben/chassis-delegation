// MOD-373 (#512): a `purpose: spike` card: header fields, brief rules, refusals, kind, no exploring, the card tool. Pure.
import { test, expect, describe } from './kit.mjs'

const D = () => import('../../hooks/lib/dispatch.ts')
const X = () => import('../../hooks/lib/explore.ts')
const K = () => import('../../hooks/lib/card.ts')
const C = () => import('../../hooks/lib/classof.ts')
const fs = await import('node:fs')

const QUESTIONS = '## Questions\n\n1. What does the API return?\n2. Should we adopt it? (verdict)\n'
const cardText = (fm, body = `## Why\n\nBecause.\n\n${QUESTIONS}\n## Done when\n\n- a findings file\n`) =>
  `---\n${fm}\n---\n${body}`
const SPIKE_FM = [
  'id: MOD-400',
  'title: A spike',
  'domain: mod',
  'tier: standard',
  'status: queued',
  'purpose: spike',
  'findings: docs/spikes/MOD-400-findings.md',
  'sources: [docs.anthropic.com, github.com/anthropics]',
  'verdicts: [adopt, adapt, skip]',
  'scope: [docs/spikes/**]',
  'forbid: []',
  'red_test: none',
  'gate: findings',
  'budget: 2-attempts',
].join('\n')
const parse = async (fm, body) => {
  const { parseCard } = await D()
  const c = parseCard(cardText(fm, body))
  if ('error' in c) throw new Error(c.error)
  return c
}
const swap = (fm, key, value) => fm.split('\n').map(l => (l.startsWith(`${key}:`) ? (value === null ? '' : `${key}: ${value}`) : l)).filter(l => l !== '').join('\n')

describe('MOD-373: spikeOf', () => {
  test('a spike card reads findings, sources and verdicts; a build card is undefined', async () => {
    const { spikeOf } = await D()
    expect(spikeOf(await parse(SPIKE_FM))).toEqual({ findings: 'docs/spikes/MOD-400-findings.md', sources: ['docs.anthropic.com', 'github.com/anthropics'], verdicts: ['adopt', 'adapt', 'skip'] })
    expect(spikeOf(await parse(swap(SPIKE_FM, 'purpose', 'build')))).toBeUndefined()
    expect(spikeOf(await parse(swap(SPIKE_FM, 'purpose', null)))).toBeUndefined()
    expect(spikeOf(await parse(swap(SPIKE_FM, 'purpose', ' Spike ')))).toBeDefined()
  })
  test('sources and verdicts may be absent', async () => {
    const { spikeOf } = await D()
    const fm = swap(swap(SPIKE_FM, 'sources', null), 'verdicts', null)
    expect(spikeOf(await parse(fm))).toEqual({ findings: 'docs/spikes/MOD-400-findings.md', sources: [], verdicts: [] })
  })
})

describe('MOD-373: spikeRefusal', () => {
  const refusal = async (fm, body) => (await D()).spikeRefusal(await parse(fm, body))
  test('a good spike and a build card are not refused', async () => {
    expect(await refusal(SPIKE_FM)).toBeUndefined()
    expect(await refusal(swap(swap(SPIKE_FM, 'purpose', null), 'findings', null))).toBeUndefined()
    expect(await refusal(swap(SPIKE_FM, 'purpose', 'build'))).toBeUndefined()
  })
  test('1: a purpose that is neither build nor spike', async () => {
    expect(await refusal(swap(SPIKE_FM, 'purpose', 'research'))).toBe('purpose: research is not build or spike')
  })
  test('3: findings empty', async () => {
    expect(await refusal(swap(SPIKE_FM, 'findings', null))).toBe('a spike card names its findings file: findings: <repo path>')
  })
  test('4: findings outside the repo', async () => {
    for (const f of ['/abs/f.md', '~/f.md', 'docs/../x.md', '../x.md']) {
      expect(await refusal(swap(SPIKE_FM, 'findings', f))).toBe('findings: must be a path inside the repo')
    }
  })
  test('5: repo none', async () => {
    expect(await refusal(`${SPIKE_FM}\nrepo: none`)).toBe('a spike card writes its findings in a repo: drop repo: none')
  })
  test('6: findings in no scope entry', async () => {
    expect(await refusal(swap(SPIKE_FM, 'scope', '[hooks/**]'))).toBe("findings: docs/spikes/MOD-400-findings.md is not in the card's scope")
  })
  test('7: the gate names findings', async () => {
    expect(await refusal(swap(SPIKE_FM, 'gate', 'validate'))).toBe("a spike card's gate names findings")
    expect(await refusal(swap(SPIKE_FM, 'gate', 'findings, validate'))).toBeUndefined()
  })
  test('8: red_test is none', async () => {
    expect(await refusal(swap(SPIKE_FM, 'red_test', 'npm test'))).toBe("a spike card's red_test is none")
    expect(await refusal(swap(SPIKE_FM, 'red_test', 'None'))).toBeUndefined()
  })
  test('9: the questions error is the refusal', async () => {
    const { spikeQuestions } = await import('../../hooks/lib/spike.ts')
    const body = '## Why\n\nx\n\n## Done when\n\n- y\n'
    expect(await refusal(SPIKE_FM, body)).toBe(spikeQuestions(body).error)
  })
})

describe('MOD-373: renderHeader', () => {
  const head = async (fm, over = {}) => (await D()).renderHeader({ card: await parse(fm), tier: 'standard', alias: 'sonnet', budget: 2, ...over })
  test('a spike: purpose=spike, findings, sources, verdicts after allow=', async () => {
    const h = await head(swap(SPIKE_FM, 'gate', 'findings') + '\nallow: [live-reads]')
    expect(h).toContain(' purpose=spike ')
    expect(h).toContain('gate=findings allow=live-reads findings=docs/spikes/MOD-400-findings.md sources=docs.anthropic.com,github.com/anthropics verdicts=adopt,adapt,skip budget=2-attempts')
  })
  test('empty sources and verdicts write no field', async () => {
    const h = await head(swap(swap(SPIKE_FM, 'sources', null), 'verdicts', null))
    expect(h).toContain(' findings=docs/spikes/MOD-400-findings.md budget=')
    expect(h).not.toContain('sources=')
    expect(h).not.toContain('verdicts=')
  })
  test('a build card is as before', async () => {
    const h = await head('id: MOD-1\ntitle: t\ndomain: mod\nscope: [a/**]\nforbid: [b/**]\nred_test: npm test\ngate: validate\nbudget: 2-attempts')
    expect(h).toBe('[[brief v=1 task=MOD-1 subtask=main purpose=build tier=standard model=sonnet scope=a/** forbid=b/** red_test="npm test" gate=validate budget=2-attempts report=chassis.report.v1]]')
  })
})

describe('MOD-373: renderBrief keeps the spike section only for a spike', () => {
  const vars = async fm => ({ card: await parse(fm), worktree: '/w', branch: 'b', cardPath: '/c.md' })
  test('the real template: spike rules for a spike, none for a build card, no marker left either way', async () => {
    const { renderBriefChecked } = await D()
    const tpl = fs.readFileSync(new URL('../../hooks/templates/brief.md', import.meta.url), 'utf8')
    const spike = renderBriefChecked(tpl, await vars(SPIKE_FM))
    expect(spike.leftover).toBeUndefined()
    expect(spike.text).toContain('your deliverable is the findings file docs/spikes/MOD-400-findings.md')
    expect(spike.text).toContain('Cite only from: docs.anthropic.com, github.com/anthropics.')
    expect(spike.text).toContain('`Verdict: <word>` (one of: adopt, adapt, skip).')
    expect(spike.text).toContain('report red=none')
    expect(spike.text).not.toContain('Red test first')
    const open = renderBriefChecked(tpl, await vars(swap(swap(SPIKE_FM, 'sources', null), 'verdicts', null)))
    expect(open.leftover).toBeUndefined()
    expect(open.text).toContain('Cite only from: any source.')
    expect(open.text).toContain('`Verdict: <word>`. Flag')
    const build = renderBriefChecked(tpl, await vars('id: MOD-1\ntitle: t\ndomain: mod\nscope: [a/**]\nred_test: npm test\ngate: validate'))
    expect(build.leftover).toBeUndefined()
    expect(build.text).not.toContain('Spike:')
    expect(build.text).not.toContain('Findings format')
  })
  test('the stand-in template in the harness holds the same section', () => {
    const h = fs.readFileSync(new URL('../harness.ts', import.meta.url), 'utf8')
    expect(h).toContain('{{#spike}}')
    expect(h).toContain('{{/spike}}')
  })
})

describe('MOD-373: cardKind and explorePlan', () => {
  test('purpose spike gives spike, over a kind:', async () => {
    const { cardKind, CARD_KINDS } = await X()
    expect(CARD_KINDS).toContain('spike')
    expect(cardKind({ purpose: ' Spike ', kind: 'bug', title: 'Fix x', scope: ['docs/**'] })).toBe('spike')
    expect(cardKind({ purpose: 'build', kind: 'bug', title: 'x', scope: ['a'] })).toBe('bug')
    expect(cardKind({ title: 'Add', scope: ['hooks/a.ts'] })).toBe('feature')
  })
  test('explorePlan never explores a spike', async () => {
    const { explorePlan, exploreDraw } = await X()
    let task = ''
    for (let i = 1; i < 5000; i++) if (exploreDraw(`T-${i}`) < 0.1) { task = `T-${i}`; break }
    const i = { task, attempt: 1, hasEffort: false, hasReason: false, tier: 'standard', kind: 'feature', className: 'feature/large', explore: 0.5, baseEffort: 'medium', maxEffort: 'high', aliasOfTier: t => ({ economy: 'haiku', standard: 'sonnet', frontier: 'opus', premium: 'fable' })[t], rows: [] }
    expect(explorePlan(i)).toBeDefined()
    expect(explorePlan({ ...i, kind: 'spike', className: 'spike/large' })).toBeUndefined()
  })
  test('classOfCardText reads a spike card as spike', async () => {
    const { classOfCardText } = await C()
    expect(classOfCardText(cardText(SPIKE_FM))).toMatch(/^spike\//)
  })
})

describe('MOD-373: the card tool', () => {
  const ctx = { domains: ['mod'], gateIds: ['validate', 'node', 'findings'], names: [], spendByTier: { standard: 6 } }
  const base = { title: 'Look at X', why: 'Because.', doneWhen: ['the findings file exists'], redTest: 'none', scope: ['docs/spikes/**'], domain: 'mod', purpose: 'spike', questions: ['What is X?', 'Adopt it? (verdict)'], findings: 'docs/spikes/X.md' }
  const make = async (over, c = ctx) => (await K()).cardFromFields({ ...base, ...over }, c)
  test('the schema names the five spike fields', async () => {
    const { CARD_TOOL } = await K()
    const p = CARD_TOOL.inputSchema.properties
    expect(p.purpose.enum).toEqual(['build', 'spike'])
    for (const k of ['questions', 'findings', 'sources', 'verdicts']) expect(p[k]).toBeDefined()
  })
  test('a spike card: frontmatter, questions, gate default', async () => {
    const r = await make({ sources: ['docs.anthropic.com'], verdicts: ['adopt', 'skip'] })
    expect('error' in r).toBe(false)
    expect(r.gate).toEqual(['findings'])
    const t = r.text
    expect(t).toMatch(/purpose: spike\nfindings: docs\/spikes\/X\.md\nsources: \[docs\.anthropic\.com\]\nverdicts: \[adopt, skip\]\nred_test: none/)
    expect(t).toContain('## Why\n\nBecause.\n\n## Questions\n\n1. What is X?\n2. Adopt it? (verdict)\n\n## Done when')
    const { parseCard, spikeRefusal } = await D()
    expect(spikeRefusal(parseCard(t))).toBeUndefined()
  })
  test('without sources and verdicts those lines are absent; findings joins scope when unmatched; gate gains findings first', async () => {
    const r = await make({ scope: ['hooks/**'], gate: 'validate' })
    expect(r.text).not.toContain('sources:')
    expect(r.text).not.toContain('verdicts:')
    expect(r.scope).toEqual(['docs/spikes/X.md', 'hooks/**'])
    expect(r.gate).toEqual(['findings', 'validate'])
  })
  test('errors', async () => {
    expect(await make({ purpose: 'research' })).toEqual({ error: 'purpose must be build or spike' })
    expect(await make({ purpose: undefined })).toEqual({ error: 'questions belongs to a spike card (purpose: spike)' })
    expect(await make({ purpose: 'build', findings: 'a.md', questions: undefined })).toEqual({ error: 'findings belongs to a spike card (purpose: spike)' })
    expect(await make({ purpose: 'build', questions: undefined, findings: undefined, sources: ['x'] })).toEqual({ error: 'sources belongs to a spike card (purpose: spike)' })
    expect(await make({ questions: [' '] })).toEqual({ error: 'a spike card needs questions: one string each' })
    expect(await make({ questions: undefined })).toEqual({ error: 'a spike card needs questions: one string each' })
    expect(await make({ findings: ' ' })).toEqual({ error: 'a spike card needs findings: the findings file, a repo path' })
    expect(await make({ findings: '/abs/x.md' })).toEqual({ error: 'findings must be a path inside the repo' })
    expect(await make({ findings: 'a/../x.md' })).toEqual({ error: 'findings must be a path inside the repo' })
    expect(await make({ redTest: 'npm test' })).toEqual({ error: 'a spike card\'s redTest is "none": the findings gate checks it' })
    expect(await make({ repo: 'none' })).toEqual({ error: 'a spike card writes its findings in a repo' })
  })
  test('a build card is unchanged: no purpose line', async () => {
    const r = await make({ purpose: undefined, questions: undefined, findings: undefined, redTest: 'npm test', gate: 'validate' })
    expect(r.text).not.toContain('purpose:')
    expect(r.text).not.toContain('## Questions')
  })
  test('purpose spike with lanes is refused', async () => {
    const { cardsFromFields } = await K()
    expect(cardsFromFields({ ...base, scope: undefined, lanes: [{ title: 'a', scope: ['docs/a/**'] }] }, ctx)).toEqual({ error: 'a spike is one card; drop lanes' })
  })
})
