// MOD-372 (#512): the built-in findings gate for a spike (a research card that hands back a findings
// file, not code). Pure: text in, verdict out; no host calls, no git. The verifier (verify-native.ts) and
// the merge gate loop (register.ts) run findingsCheck against the findings file at the sha, held to the
// card's ## Questions: each question has a ## Q<n> section that cites a URL or path:line or is marked
// Unanswered:, a verdict word from verdicts=, URLs under sources=, well-formed ⚠ flags, and a Decisions section.

/** The gate id that names the built-in check (a brief with findings= and this id in gate=). */
export const FINDINGS_GATE = 'findings'

export type SpikeQuestion = { n: number; text: string; verdict: boolean }

export type FindingsInput = {
  text: string | undefined
  path: string
  questions: readonly SpikeQuestion[]
  sources: readonly string[]
  verdicts: readonly string[]
}

export type FindingsCheck = { ok: boolean; problems: string[]; summary: string }

const NO_LIST = 'the card has no ## Questions list'
const CARD_HEAD = /^## The card\s*$/
const QUESTIONS_HEAD = /^##\s+Questions\s*$/
const LIST_END = /^#{1,2}\s/
const QUESTION_LINE = /^\s*(\d+)[.)]\s+(.+?)\s*$/
const VERDICT_TAG = /\(verdict\)$/i

const QUESTION_HEAD = /^#{2,3}\s+Q(\d+)\b/
const SECTION_END = /^#{1,3}\s/
const DECISIONS_HEAD = /^##\s+Decisions this implies\s*$/i
const DECISIONS_END = /^#{1,2}\s/
const DECISION_ITEM = /^\s*[-*]\s+\S/
const URL_ANY = /https?:\/\/[^\s)>\]"'`]+/g
const URL_TRAIL = /[.,;:]+$/
const PATH_CITE = /(^|[\s([`])([\w.-]+(?:\/[\w.-]+)*\.\w+):(\d+(?:-\d+)?)(?![\w-])/g
const FLAG_OK = /^ *(Unverified|Conflict): *\S/
const SOURCE_URL = /^https?:\/\/([^/?#:]+)(?::\d+)?([^?#]*)/

const plural = (n: number, word: string): string => `${n} ${word}${n === 1 ? '' : 's'}`

/**
 * The card's numbered ## Questions list. The text is a card body or a whole brief; when a line is exactly
 * `## The card`, only what follows it counts. Other lines of the list (prose, sub-bullets) are skipped.
 */
export function spikeQuestions(text: string): { questions: SpikeQuestion[] } | { error: string } {
  const lines = text.split('\n')
  const card = lines.findIndex(l => CARD_HEAD.test(l))
  const from = card >= 0 ? card + 1 : 0
  const head = lines.findIndex((l, i) => i >= from && QUESTIONS_HEAD.test(l))
  if (head < 0) return { error: NO_LIST }
  const questions: SpikeQuestion[] = []
  for (let i = head + 1; i < lines.length && !LIST_END.test(lines[i] ?? ''); i++) {
    const m = QUESTION_LINE.exec(lines[i] ?? '')
    if (m === null) continue
    const body = m[2] ?? ''
    questions.push({ n: Number(m[1]), text: body, verdict: VERDICT_TAG.test(body) })
  }
  if (questions.length === 0) return { error: NO_LIST }
  const found = questions.map(q => q.n)
  if (found.some((n, i) => n !== i + 1)) return { error: `the Questions are numbered ${found.join(', ')}, not 1 to ${found.length}` }
  return { questions }
}

/** A source is `host` or `host/path` (a scheme and www. are ignored). Empty sources allow every URL. */
export function sourceAllowed(url: string, sources: readonly string[]): boolean {
  if (sources.length === 0) return true
  const m = SOURCE_URL.exec(url)
  if (m === null) return false
  const host = (m[1] ?? '').toLowerCase().replace(/^www\./, '')
  const path = (m[2] ?? '').replace(/\/+$/, '')
  return sources.some(src => {
    const s = src.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
    const slash = s.indexOf('/')
    const srcHost = slash < 0 ? s : s.slice(0, slash)
    const srcPath = slash < 0 ? '' : s.slice(slash).replace(/\/+$/, '')
    if (!(host === srcHost || host.endsWith(`.${srcHost}`))) return false
    return srcPath === '' || path === srcPath || path.startsWith(`${srcPath}/`)
  })
}

/** The URLs in a line, trailing . , ; : dropped. */
const urlsIn = (line: string): string[] => (line.match(URL_ANY) ?? []).map(u => u.replace(URL_TRAIL, ''))

/** The path:line citations in a line, URLs taken out first (a URL never counts as a path citation). */
const pathCitesIn = (line: string): number => (line.replace(URL_ANY, ' ').match(PATH_CITE) ?? []).length

const citesIn = (line: string): boolean => urlsIn(line).length > 0 || pathCitesIn(line) > 0

type Marker = { kind: 'unanswered' } | { kind: 'verdict'; word: string }

/** A marker line: the trimmed line, a leading `- `, leading and trailing * and _ taken off. */
function markerOf(line: string): Marker | undefined {
  let t = line.trim()
  if (t.startsWith('- ')) t = t.slice(2)
  t = t.replace(/^[*_]+/, '').replace(/[*_]+$/, '')
  const u = /^Unanswered:(.*)$/i.exec(t)
  if (u !== null) return (u[1] ?? '').replace(/[*_]/g, '').trim() !== '' ? { kind: 'unanswered' } : undefined
  const v = /^Verdict:(.*)$/i.exec(t)
  if (v !== null) {
    const word = ((v[1] ?? '').replace(/[*_]/g, '').trim().split(/\s+/)[0] ?? '').toLowerCase().replace(/[.,;:]+$/, '')
    return word !== '' ? { kind: 'verdict', word } : undefined
  }
  return undefined
}

/** The findings file held to the card's questions: problems in the order the gate reports them. */
export function findingsCheck(i: FindingsInput): FindingsCheck {
  const { path, questions, sources, verdicts } = i
  if (i.text === undefined) return { ok: false, problems: [`findings file ${path} not found`], summary: `${path}: not found` }
  if (i.text.trim() === '') return { ok: false, problems: [`findings file ${path} is empty`], summary: `${path}: empty` }
  const text = i.text
  const lines = text.split('\n')

  // the sections: each ## Q<n> runs to the next line matching ^#{1,3}\s; the Decisions section to the next ^#{1,2}\s
  const qSections: { n: number; body: string[] }[] = []
  const decisionBodies: string[][] = []
  let openQ: { n: number; body: string[] } | undefined
  let openDecisions: string[] | undefined
  for (const line of lines) {
    if (openDecisions !== undefined) {
      if (!DECISIONS_END.test(line)) {
        openDecisions.push(line)
        continue
      }
      openDecisions = undefined
    }
    if (openQ !== undefined) {
      if (!SECTION_END.test(line)) {
        openQ.body.push(line)
        continue
      }
      openQ = undefined
    }
    if (DECISIONS_HEAD.test(line)) {
      const body: string[] = []
      decisionBodies.push(body)
      openDecisions = body
      continue
    }
    const qh = QUESTION_HEAD.exec(line)
    if (qh !== null) {
      openQ = { n: Number(qh[1]), body: [] }
      qSections.push(openQ)
    }
  }

  const problems: string[] = []
  const cardNs = new Set(questions.map(q => q.n))
  for (const q of questions) {
    const found = qSections.filter(s => s.n === q.n).length
    if (found === 0) problems.push(`Q${q.n} has no section`)
    else if (found > 1) problems.push(`Q${q.n} has two sections`)
  }
  for (const s of qSections) if (!cardNs.has(s.n)) problems.push(`Q${s.n} is not a card question`)

  const unanswered = (body: string[]): boolean => body.some(l => markerOf(l)?.kind === 'unanswered')
  for (const q of questions) {
    const secs = qSections.filter(s => s.n === q.n)
    const sec = secs.length === 1 ? secs[0] : undefined
    if (sec === undefined || unanswered(sec.body)) continue
    if (!sec.body.some(citesIn)) problems.push(`Q${q.n} cites nothing (a URL or path:line) and is not marked Unanswered:`)
    if (!q.verdict) continue
    let word: string | undefined
    for (const l of sec.body) {
      const m = markerOf(l)
      if (m?.kind === 'verdict') {
        word = m.word
        break
      }
    }
    if (word === undefined) problems.push(`Q${q.n} asks for a verdict and has none`)
    else if (verdicts.length > 0 && !verdicts.map(v => v.toLowerCase()).includes(word)) problems.push(`Q${q.n} verdict '${word}' is not one of ${verdicts.join(', ')}`)
  }

  if (sources.length > 0) {
    const seen: string[] = []
    for (const line of lines) for (const u of urlsIn(line)) if (!seen.includes(u)) seen.push(u)
    const refused = seen.filter(u => !sourceAllowed(u, sources))
    for (const u of refused.slice(0, 5)) problems.push(`${u} is not under an allowed source (${sources.join(', ')})`)
    if (refused.length > 5) problems.push(`+${refused.length - 5} more URLs outside the allowed sources`)
  }

  let flags = 0
  lines.forEach((line, idx) => {
    if (!line.includes('⚠')) return
    let malformed = false
    for (const part of line.split('⚠').slice(1)) {
      if (FLAG_OK.test(part)) flags++
      else malformed = true
    }
    if (malformed) problems.push(`line ${idx + 1}: a ⚠ flag reads ⚠ Unverified: <text> or ⚠ Conflict: <text>`)
  })

  if (decisionBodies.length === 0) problems.push('no ## Decisions this implies section')
  else if (!decisionBodies.some(b => b.some(l => DECISION_ITEM.test(l)))) problems.push('## Decisions this implies has no item (write - none when it implies none)')

  const distinct: string[] = []
  for (const line of lines) for (const u of urlsIn(line)) if (!distinct.includes(u)) distinct.push(u)
  const pathCites = lines.reduce((sum, line) => sum + pathCitesIn(line), 0)
  const answered = qSections.filter(s => !unanswered(s.body)).length
  const marked = qSections.length - answered
  const summary = `${path}: ${plural(questions.length, 'question')}, ${answered} answered, ${marked} unanswered, ${plural(distinct.length + pathCites, 'citation')}, ${plural(flags, 'flag')}`
  return { ok: problems.length === 0, problems, summary }
}

/**
 * The gate ids of a brief's gate= with findings in them. The built-in check runs when findings= names a
 * file and the ids include `findings`; the other ids are the gateMap commands that still run.
 */
export function splitFindingsGate(gate: string | undefined, findings: string | undefined): { builtin: boolean; rest: string | undefined } {
  const ids = (gate ?? '').split(',').map(s => s.trim()).filter(s => s !== '')
  if (findings !== undefined && findings.trim() !== '' && ids.includes(FINDINGS_GATE)) {
    const rest = ids.filter(id => id !== FINDINGS_GATE)
    return { builtin: true, rest: rest.length > 0 ? rest.join(',') : undefined }
  }
  return { builtin: false, rest: gate }
}
