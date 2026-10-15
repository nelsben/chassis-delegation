// MOD-80: where the by-hand debrief doors (`debrief post`, `debrief apply`, the posture line) read the findings.
// Pure: the caller lists the folders and reads the files; this decides which one.

export type FindingsInput = {
  /** <root>/.delegation/debriefs, no trailing slash. */
  repoFolder: string
  /** <home>/.claude/harness/debriefs, no trailing slash. */
  harnessFolder: string
  /** This session's debrief record names a debrief; its .findings.json, when that file exists. */
  recordFindings: string | undefined
  /** File names in the repo folder. */
  repoNames: readonly string[]
  /** File names in the harness folder whose debrief belongs to this session (the folder is shared by every repo on the machine). */
  harnessMine: readonly string[]
}

export type FindingsChoice = { path: string } | { looked: string[] }

const newest = (names: readonly string[], ext: string): string | undefined => names.filter(n => n.endsWith(ext)).sort().at(-1)

/** (1) the record's findings, (2) the newest in the repo folder, (3) the newest of this session's in the harness folder; else the folders looked in. */
export const resolveFindings = (i: FindingsInput): FindingsChoice => {
  if (i.recordFindings !== undefined) return { path: i.recordFindings }
  const repo = newest(i.repoNames, '.findings.json')
  if (repo !== undefined) return { path: `${i.repoFolder}/${repo}` }
  const harness = newest(i.harnessMine, '.findings.json')
  if (harness !== undefined) return { path: `${i.harnessFolder}/${harness}` }
  return { looked: [i.repoFolder, i.harnessFolder] }
}

/** The refusal of a by-hand door that found nothing: every place it looked. */
export const notFoundLine = (door: 'post' | 'apply', looked: readonly string[]): string =>
  `debrief ${door}: no ${door === 'post' ? 'findings file' : 'debrief'} for this session; looked in ${looked[0]}/, ${looked[1]}/ (only this session's debriefs) and this session's debrief record. Run /delegation debrief first.`

/** A leading `~/` is the home folder. */
export const expandHome = (p: string, home: string): string => (p.startsWith('~/') ? `${home.replace(/\/+$/, '')}${p.slice(1)}` : p)
